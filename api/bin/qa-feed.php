<?php
/**
 * 솔루션 개선 체크리스트 자동 수집(서버 CLI) — 통합 검수(/admin/qa)의 자가 개선 고리.
 *   php8.4 api/bin/qa-feed.php assets-search [--days=7] [--min=2] [--dry]   결과 0건 검색어 → powerAssets 체크리스트(검색)
 *        같은 검색어가 그 뒤 결과를 내면(자산·동의어를 채웠으면) 자동으로 '고침'
 *   php8.4 api/bin/qa-feed.php import <module> <items.json> [--dry]       문서 항목 가져오기(예: docs/MCP-개선-체크리스트.md → mcp)
 *        items = [{slug, area, title, detail?, status, fix_note?, fix_commit?, origin?}] — 같은 slug 는 한 줄, 상태·메모는 문서 쪽을 따른다
 *   php8.4 api/bin/qa-feed.php import-docs <items.json>... [--dry]         여섯 체크리스트 한꺼번에(항목마다 module) — api/data/qa-docs/*.json(docs/*.md 에서 뽑은 것)
 * cron(www-data): 20 5 * * * php8.4 /var/www/platform/api/bin/qa-feed.php assets-search
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../src/bootstrap.php';

use Pp\Core\Db;
use Pp\Qa\Checklist;

$cmd = (string) ($argv[1] ?? '');
$dry = in_array('--dry', $argv, true);
$opt = static function (string $k, int $def) use ($argv): int {
    foreach ($argv as $a) {
        if (str_starts_with($a, "--{$k}=")) {
            return max(1, (int) substr($a, strlen($k) + 3));
        }
    }
    return $def;
};

if ($cmd === 'assets-search') {
    $days = $opt('days', 7);
    $min = $opt('min', 2);
    $rows = Db::rows("SELECT q, COUNT(*) AS n, COUNT(DISTINCT user_id) AS users, MAX(created_at) AS last
                      FROM asset_search_logs WHERE results = 0 AND created_at > NOW(3) - INTERVAL {$days} DAY AND CHAR_LENGTH(TRIM(q)) >= 2
                      GROUP BY q HAVING n >= {$min} ORDER BY n DESC LIMIT 100");
    $made = 0;
    $again = 0;
    foreach ($rows as $r) {
        $q = trim((string) $r['q']);
        if ($dry) {
            echo "  0건 {$r['n']}회 · {$q}\n";
            continue;
        }
        $res = Checklist::record('assets', 'search0:' . mb_strtolower($q), 'search', "검색 결과 0건: '{$q}'",
            "최근 {$days}일 {$r['n']}회(사용자 {$r['users']}명) 결과 없이 끝난 검색어. 맞는 자산을 등록하거나 동의어 사전에 이어 준다.",
            'feed', ['by' => 'qa-feed', 'note' => "{$days}일 {$r['n']}회 · 마지막 {$r['last']}"]);
        $res['created'] ? $made++ : $again++;
    }
    // 고리 닫기: 열린 '0건' 항목 중 그 검색어가 마지막으로 결과를 낸 경우 → 고침
    $closed = 0;
    foreach (Db::rows("SELECT id, slug FROM qa_checklist WHERE module = 'assets' AND slug LIKE 'search0:%' AND status IN ('open','fixing')") as $it) {
        $q = substr((string) $it['slug'], 8);
        $last = Db::row('SELECT results FROM asset_search_logs WHERE LOWER(q) = ? ORDER BY id DESC LIMIT 1', [$q]);
        if ($last !== null && (int) $last['results'] > 0) {
            $closed++;
            if (!$dry) {
                Db::exec("UPDATE qa_checklist SET status = 'fixed', fixed_at = NOW(3), regressed = 0, fix_note = COALESCE(fix_note, ?) WHERE id = ?",
                    ['검색 결과가 생김(자동 확인: 마지막 검색 ' . (int) $last['results'] . '건)', (int) $it['id']]);
            }
        }
    }
    echo ($dry ? '[미리보기] ' : '') . "0건 검색어 " . count($rows) . "개 — 새 항목 {$made} · 다시 걸림 {$again} · 결과가 생겨 고침 {$closed}\n";
    exit(0);
}

if ($cmd === 'import') {
    $m = (string) ($argv[2] ?? '');
    $file = (string) ($argv[3] ?? '');
    $items = $file !== '' && is_file($file) ? json_decode((string) file_get_contents($file), true) : null;
    if (!isset(Checklist::MODULES[$m]) || !is_array($items)) {
        fwrite(STDERR, "사용: qa-feed.php import <assets|guide|mcp> <items.json> [--dry]\n");
        exit(1);
    }
    $n = ['created' => 0, 'updated' => 0];
    foreach ($items as $it) {
        if (!is_array($it) || empty($it['slug']) || empty($it['title'])) {
            continue;
        }
        $slug = (string) $it['slug'];
        $exists = Db::val('SELECT id FROM qa_checklist WHERE module = ? AND slug = ?', [$m, $slug]);
        if ($dry) {
            $n[$exists ? 'updated' : 'created']++;
            continue;
        }
        $status = in_array($it['status'] ?? '', Checklist::STATUSES, true) ? (string) $it['status'] : 'open';
        if (!$exists) {
            Checklist::record($m, $slug, (string) ($it['area'] ?? 'misc'), (string) $it['title'], isset($it['detail']) ? (string) $it['detail'] : null,
                (string) ($it['origin'] ?? 'doc'), ['by' => 'qa-feed import', 'note' => (string) ($it['note'] ?? '문서에서 가져옴')], $status);
            $n['created']++;
        } else {
            $n['updated']++;
        }
        // 문서가 원본 — 상태·메모·커밋은 문서 쪽 값으로 맞춘다(다시 가져와도 hits 는 늘리지 않는다)
        Db::exec('UPDATE qa_checklist SET status = ?, fixed_at = IF(? = \'fixed\', COALESCE(fixed_at, NOW(3)), NULL), regressed = IF(? = \'fixed\', 0, regressed),
                  fix_note = ?, fix_commit = ?, title = ?, area = ? WHERE module = ? AND slug = ?', [
            $status, $status, $status, isset($it['fix_note']) ? mb_substr((string) $it['fix_note'], 0, 1000) : null,
            isset($it['fix_commit']) ? mb_substr((string) $it['fix_commit'], 0, 40) : null, mb_substr((string) $it['title'], 0, 200),
            isset(Checklist::areas($m)[(string) ($it['area'] ?? '')]) ? (string) $it['area'] : 'misc', $m, $slug,
        ]);
    }
    echo ($dry ? '[미리보기] ' : '') . "{$m}: 새로 {$n['created']} · 맞춤 {$n['updated']}\n";
    exit(0);
}

// 여러 체크리스트 한꺼번에 — 항목마다 module(deck|mock|site|assets|guide|mcp). docs/*.md 에서 뽑은 항목(api/data/qa-docs/*.json)을 넣는다(사용자 2026-10-15
// "각 개선 체크리스트에 들어갈 것들이 docs 폴더내 md파일에 있는지 체크해서 추가해"). deck·mock·site 표에는 origin 'doc' 이 없어 'manual' 로 넣는다.
if ($cmd === 'import-docs') {
    $files = array_values(array_filter(array_slice($argv, 2), static fn ($a) => !str_starts_with((string) $a, '--')));
    $TABLES = [
        'deck' => ['table' => 'deck_checklist', 'areas' => \Pp\Deck\Checklist::AREAS, 'rec' => [\Pp\Deck\Checklist::class, 'record']],
        'mock' => ['table' => 'mock_checklist', 'areas' => \Pp\Mock\Checklist::AREAS, 'rec' => [\Pp\Mock\Checklist::class, 'record']],
        'site' => ['table' => 'site_checklist', 'areas' => \Pp\Site\Checklist::AREAS, 'rec' => [\Pp\Site\Checklist::class, 'record']],
    ];
    $n = [];
    foreach ($files as $file) {
        $items = is_file($file) ? json_decode((string) file_get_contents($file), true) : null;
        if (!is_array($items)) {
            fwrite(STDERR, "읽지 못함: {$file}\n");
            exit(1);
        }
        foreach ($items as $it) {
            $m = (string) ($it['module'] ?? '');
            if (!is_array($it) || empty($it['slug']) || empty($it['title']) || (!isset($TABLES[$m]) && !isset(Checklist::MODULES[$m]))) {
                $n['건너뜀'] = ($n['건너뜀'] ?? 0) + 1;
                continue;
            }
            $slug = mb_substr((string) $it['slug'], 0, 160);
            $status = in_array($it['status'] ?? '', Checklist::STATUSES, true) ? (string) $it['status'] : 'open';
            $detail = isset($it['detail']) && $it['detail'] !== '' ? (string) $it['detail'] : null;
            $ev = ['by' => 'qa-feed import-docs', 'note' => (string) ($it['note'] ?? '문서에서 가져옴')];
            $t = $TABLES[$m] ?? ['table' => 'qa_checklist', 'areas' => Checklist::areas($m)];
            $where = isset($TABLES[$m]) ? 'slug = ?' : 'module = ? AND slug = ?';
            $key = isset($TABLES[$m]) ? [$slug] : [$m, $slug];
            $exists = Db::val("SELECT id FROM {$t['table']} WHERE {$where}", $key);
            $n[$m] = $n[$m] ?? ['created' => 0, 'updated' => 0];
            $n[$m][$exists ? 'updated' : 'created']++;
            if ($dry) {
                continue;
            }
            $area = isset($t['areas'][(string) ($it['area'] ?? '')]) ? (string) $it['area'] : 'misc';
            if (!$exists) {
                if (isset($TABLES[$m])) {
                    ($TABLES[$m]['rec'])($slug, $area, (string) $it['title'], $detail, 'manual', $ev);
                } else {
                    Checklist::record($m, $slug, $area, (string) $it['title'], $detail, 'doc', $ev, $status);
                }
            }
            // 문서가 원본 — 상태·메모·커밋은 문서 쪽 값으로(다시 가져와도 hits 는 늘리지 않는다). doc: 로 시작하는 줄만 건드린다.
            if (str_starts_with($slug, 'doc:')) {
                Db::exec("UPDATE {$t['table']} SET status = ?, fixed_at = IF(? = 'fixed', COALESCE(fixed_at, NOW(3)), NULL), regressed = IF(? = 'fixed', 0, regressed),
                          fix_note = ?, fix_commit = ?, title = ?, area = ? WHERE {$where}", array_merge([
                    $status, $status, $status, isset($it['fix_note']) ? mb_substr((string) $it['fix_note'], 0, 1000) : null,
                    isset($it['fix_commit']) ? mb_substr((string) $it['fix_commit'], 0, 40) : null, mb_substr((string) $it['title'], 0, 200), $area,
                ], $key));
            }
        }
    }
    foreach ($n as $m => $c) {
        echo ($dry ? '[미리보기] ' : '') . (is_array($c) ? "{$m}: 새로 {$c['created']} · 맞춤 {$c['updated']}" : "{$m}: {$c}") . "\n";
    }
    exit(0);
}

fwrite(STDERR, "사용: qa-feed.php assets-search [--days=7] [--min=2] [--dry] | import <module> <items.json> [--dry] | import-docs <items.json>... [--dry]\n");
exit(1);

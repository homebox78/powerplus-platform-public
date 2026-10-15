<?php
/**
 * 솔루션 개선 체크리스트 자동 수집(서버 CLI) — 통합 검수(/admin/qa)의 자가 개선 고리.
 *   php8.4 api/bin/qa-feed.php assets-search [--days=7] [--min=2] [--dry]   결과 0건 검색어 → powerAssets 체크리스트(검색)
 *        같은 검색어가 그 뒤 결과를 내면(자산·동의어를 채웠으면) 자동으로 '고침'
 *   php8.4 api/bin/qa-feed.php import <module> <items.json> [--dry]       문서 항목 가져오기(예: docs/MCP-개선-체크리스트.md → mcp)
 *        items = [{slug, area, title, detail?, status, fix_note?, fix_commit?, origin?}] — 같은 slug 는 한 줄, 상태·메모는 문서 쪽을 따른다
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

fwrite(STDERR, "사용: qa-feed.php assets-search [--days=7] [--min=2] [--dry] | import <module> <items.json> [--dry]\n");
exit(1);

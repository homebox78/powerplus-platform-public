<?php
/**
 * 개선 체크리스트 세 가지(시안 mock · 장표 deck · 사이트 site)에 시험·사용자 지적 항목을 쌓는다(서버 CLI 전용).
 *   php8.4 api/bin/checklist-import.php <mock|deck|site> <items.json> [--dry]
 *   items = [{slug, area, title, detail?, status: open|fixing|fixed|watch|wontfix, fix_commit?, fix_note?, origin?, src?, note?}]
 * 쌓는 규칙은 각 Checklist::record 그대로(같은 slug = hits+1·근거 추가, 고친 줄이 다시 걸리면 regressed).
 * mock-checklist-import.php 는 mock 만 받아 장표·사이트 결함을 올릴 길이 없었다(2026-10-18 장표 합치기 사고·부분 실패 전수조사).
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../src/bootstrap.php';

use Pp\Core\Db;

$kinds = [
    'mock' => [\Pp\Mock\Checklist::class, 'mock_checklist', 'test'],
    'deck' => [\Pp\Deck\Checklist::class, 'deck_checklist', 'manual'],
    'site' => [\Pp\Site\Checklist::class, 'site_checklist', 'test'],
];
$kind = (string) ($argv[1] ?? '');
$file = (string) ($argv[2] ?? '');
$dry = in_array('--dry', $argv, true);
$items = $file !== '' && is_file($file) ? json_decode((string) file_get_contents($file), true) : null;
if (!isset($kinds[$kind]) || !is_array($items)) {
    fwrite(STDERR, "사용: checklist-import.php <mock|deck|site> <items.json> [--dry]\n");
    exit(1);
}
[$cls, $table, $origin0] = $kinds[$kind];
$n = ['created' => 0, 'again' => 0, 'regressed' => 0, 'fixed' => 0, 'skip' => 0];
foreach ($items as $it) {
    if (!is_array($it) || empty($it['slug']) || empty($it['title'])) {
        $n['skip']++;
        continue;
    }
    $slug = (string) preg_replace('/[^a-z0-9:-]+/', '-', strtolower((string) $it['slug']));
    $status = in_array($it['status'] ?? 'open', $cls::STATUSES, true) ? (string) $it['status'] : 'open';
    if ($dry) {
        $n[Db::val("SELECT id FROM {$table} WHERE slug = ?", [$slug]) ? 'again' : 'created']++;
        continue;
    }
    $res = $cls::record($slug, (string) ($it['area'] ?? 'misc'), (string) $it['title'], isset($it['detail']) ? (string) $it['detail'] : null,
        (string) ($it['origin'] ?? $origin0), ['src' => (string) ($it['src'] ?? '개선 체크리스트 적재'), 'note' => (string) ($it['note'] ?? $it['detail'] ?? '')]);
    $n[!empty($res['created']) ? 'created' : 'again']++;
    if (!empty($res['regressed'])) {
        $n['regressed']++;
    }
    if ($status !== 'open' && !empty($res['id'])) {
        Db::exec("UPDATE {$table} SET status = ?, fixed_at = " . ($status === 'fixed' ? 'NOW(3)' : 'fixed_at') . ", regressed = IF(? = 'fixed', 0, regressed), fix_commit = COALESCE(?, fix_commit), fix_note = COALESCE(?, fix_note) WHERE id = ?",
            [$status, $status, $it['fix_commit'] ?? null, isset($it['fix_note']) ? mb_substr((string) $it['fix_note'], 0, 1000) : null, $res['id']]);
        if ($status === 'fixed') {
            $n['fixed']++;
        }
    }
}
echo ($dry ? '[DRY] ' : '') . "{$table}: 새 {$n['created']} · 다시 {$n['again']} · 되살아남 {$n['regressed']} · 고침 표시 {$n['fixed']}" . ($n['skip'] ? " · 건너뜀 {$n['skip']}" : '') . "\n";

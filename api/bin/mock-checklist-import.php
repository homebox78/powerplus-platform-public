<?php
/**
 * 개선 체크리스트(mock_checklist)에 시험·사용자 지적 항목을 쌓는다(서버 CLI 전용) — 운영 관리자 화면 '개선 체크리스트'에 바로 보이게.
 *   php8.4 api/bin/mock-checklist-import.php <items.json> [--dry]
 *   items = [{slug, area, title, detail?, status: open|fixed|watch|wontfix, note?, fix_commit?, fix_note?, origin?: test|pref|manual}]
 * 쌓는 규칙은 Checklist::record 그대로(같은 slug = hits+1·근거 추가, 고친 줄이 다시 걸리면 regressed). status fixed 면 고친 커밋·메모까지.
 * 로컬 scripts/mcp-loop-import.mjs 는 로컬 DB 만 닿는다 — 운영 적재가 빠지던 것(2026-10-15).
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../src/bootstrap.php';

use Pp\Core\Db;
use Pp\Mock\Checklist;

$file = (string) ($argv[1] ?? '');
$dry = in_array('--dry', $argv, true);
$items = $file !== '' && is_file($file) ? json_decode((string) file_get_contents($file), true) : null;
if (!is_array($items)) {
    fwrite(STDERR, "사용: mock-checklist-import.php <items.json> [--dry]\n");
    exit(1);
}
$n = ['created' => 0, 'again' => 0, 'regressed' => 0, 'fixed' => 0];
foreach ($items as $it) {
    if (!is_array($it) || empty($it['slug']) || empty($it['title'])) {
        continue;
    }
    $slug = (string) preg_replace('/[^a-z0-9:-]+/', '-', strtolower((string) $it['slug']));
    $status = in_array($it['status'] ?? 'open', Checklist::STATUSES, true) ? (string) $it['status'] : 'open';
    if ($dry) {
        $n[Db::val('SELECT id FROM mock_checklist WHERE slug = ?', [$slug]) ? 'again' : 'created']++;
        continue;
    }
    $res = Checklist::record($slug, (string) ($it['area'] ?? 'mockup'), (string) $it['title'], isset($it['detail']) ? (string) $it['detail'] : null,
        (string) ($it['origin'] ?? 'test'), ['src' => (string) ($it['src'] ?? '사용자 눈 점검 2026-10-15'), 'note' => (string) ($it['note'] ?? $it['detail'] ?? '')]);
    $n[$res['created'] ? 'created' : 'again']++;
    if ($res['regressed']) {
        $n['regressed']++;
    }
    if ($status !== 'open') {
        Db::exec('UPDATE mock_checklist SET status = ?, fixed_at = ' . ($status === 'fixed' ? 'NOW(3)' : 'fixed_at') . ', regressed = IF(? = \'fixed\', 0, regressed), fix_commit = COALESCE(?, fix_commit), fix_note = COALESCE(?, fix_note) WHERE id = ?',
            [$status, $status, $it['fix_commit'] ?? null, isset($it['fix_note']) ? mb_substr((string) $it['fix_note'], 0, 1000) : null, $res['id']]);
        if ($status === 'fixed') {
            $n['fixed']++;
        }
    }
}
echo ($dry ? '[DRY] ' : '') . "새 {$n['created']} · 다시 {$n['again']} · 되살아남 {$n['regressed']} · 고침 표시 {$n['fixed']}\n";

<?php
/**
 * '내 시안'에 있는 시안(통과·보관 중) 전부를 갤러리에 공개한다(서버 CLI 전용).
 *   php8.4 api/bin/mock-gallery-share.php [--dry]
 * 사용자 지시(2026-10-15): "모든 계정에 만들어진 내 시안에 있는 것들은 갤러리에서 모두 볼 수 있게".
 * - 갤러리 행이 없으면 만들고, 있으면 status=shared·shared_at 을 채운다(hidden 은 관리자가 내린 것이라 그대로 둔다).
 * - 갤러리 사본(html·score·title)을 지금 시안으로 맞춘다 — 일괄 수정 뒤 사본 54건이 옛 판이었다.
 * - 공유 포인트(+50P)는 사용자가 직접 공유할 때의 보상이라 여기서는 주지 않는다.
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../src/bootstrap.php';

use Pp\Core\Db;

$dry = in_array('--dry', $argv, true);
$n = ['created' => 0, 'shared' => 0, 'synced' => 0, 'hidden_kept' => 0];
$rows = Db::rows('SELECT m.id, m.owner_user_id, m.title, m.score, m.ref_id, m.device, m.html, m.check_json, g.id AS g_id, g.status AS g_status, g.html AS g_html, g.score AS g_score
    FROM mock_mockups m LEFT JOIN mock_gallery g ON g.mockup_id = m.id
    WHERE m.deleted_at IS NULL AND m.discarded_at IS NULL AND m.passed = 1');
foreach ($rows as $r) {
    if ($r['g_id'] === null) {
        $n['created']++;
        if (!$dry) {
            Db::exec("INSERT INTO mock_gallery (mockup_id, owner_user_id, title, score, ref_id, device, html, check_json, status, shared_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'shared', NOW(3))",
                [(int) $r['id'], $r['owner_user_id'], (string) $r['title'], (int) $r['score'], $r['ref_id'], $r['device'] === 'mobile' ? 'mobile' : 'pc', (string) $r['html'], $r['check_json']]);
        }
        continue;
    }
    if ($r['g_status'] === 'hidden') {
        $n['hidden_kept']++;
        continue;
    }
    if ($r['g_status'] !== 'shared') {
        $n['shared']++;
    }
    if ((string) $r['g_html'] !== (string) $r['html'] || (int) $r['g_score'] !== (int) $r['score']) {
        $n['synced']++;
    }
    if (!$dry) {
        Db::exec("UPDATE mock_gallery SET status = 'shared', shared_at = COALESCE(shared_at, NOW(3)), html = ?, score = ?, check_json = ?, title = IF(? = '', title, ?) WHERE id = ?",
            [(string) $r['html'], (int) $r['score'], $r['check_json'], (string) $r['title'], (string) $r['title'], (int) $r['g_id']]);
    }
}
echo ($dry ? '[DRY] ' : '') . "대상 " . count($rows) . " · 새 갤러리 행 {$n['created']} · 공개로 {$n['shared']} · 사본 갱신 {$n['synced']} · 숨김 유지 {$n['hidden_kept']}\n";

<?php
declare(strict_types=1);

/**
 * 시험·검수에서 찾은 개선점을 체크리스트에 쌓는다 (2026-10-03).
 *   php api/bin/checklist-import.php <items.json>
 * items.json = [{slug, area, title, detail?, origin?:"test", status?:"fixed"|"watch"…, fix_note?, fix_commit?, evidence?:{src, ref, score, note}}]
 * 같은 slug 는 한 줄에 횟수로 쌓인다. 운영에서는 scripts/checklist-push.sh 가 서버에서 이 파일을 실행한다(관리자 토큰을 밖으로 꺼내지 않는다).
 */

require __DIR__ . '/../src/bootstrap.php';

use Homebox\Checklist;
use Homebox\Db;

$file = $argv[1] ?? '';
$items = is_file($file) ? json_decode((string) file_get_contents($file), true) : null;
if (!is_array($items)) { fwrite(STDERR, "사용: php api/bin/checklist-import.php <items.json>\n"); exit(2); }
$n = ['created' => 0, 'hit' => 0, 'regressed' => 0];
foreach ($items as $it) {
    if (!is_array($it) || trim((string) ($it['title'] ?? '')) === '' || trim((string) ($it['slug'] ?? '')) === '') { continue; }
    $r = Checklist::record((string) $it['slug'], (string) ($it['area'] ?? 'mockup'), (string) $it['title'], isset($it['detail']) ? (string) $it['detail'] : null,
        (string) ($it['origin'] ?? 'test'), is_array($it['evidence'] ?? null) ? $it['evidence'] : []);
    $n[$r['created'] ? 'created' : 'hit']++;
    if ($r['regressed']) { $n['regressed']++; }
    $set = []; $args = [];
    if (isset($it['status']) && in_array($it['status'], Checklist::STATUSES, true)) {
        $set[] = 'status = ?'; $args[] = $it['status'];
        if ($it['status'] === 'fixed') { $set[] = 'fixed_at = NOW(3), regressed = 0'; }
    }
    foreach (['fix_note' => 1000, 'fix_commit' => 40] as $k => $max) { if (!empty($it[$k])) { $set[] = "$k = ?"; $args[] = mb_substr((string) $it[$k], 0, $max); } }
    if ($set) { $args[] = $r['id']; Db::exec('UPDATE design_checklist SET ' . implode(', ', $set) . ' WHERE id = ?', $args); }
}
echo json_encode($n, JSON_UNESCAPED_UNICODE), "\n";

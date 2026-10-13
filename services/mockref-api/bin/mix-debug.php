<?php
// 섞기 배치 점검 (개발용): php api/bin/mix-debug.php <org_type> [rank]
declare(strict_types=1);
require __DIR__ . '/../src/bootstrap.php';
$router = new Homebox\Http\Router();
require __DIR__ . '/../routes/screens.php';
require __DIR__ . '/../routes/replica.php';

use Homebox\Db;
use Homebox\ReplicaKit;

$ot = $argv[1] ?? 'local_basic'; $rank = (int) ($argv[2] ?? 1);
$main = homebox_main_ref($ot, '', $rank);
$others = homebox_mix_refs($ot, $main, $rank);
$persona = ['org' => '한빛시', 'title' => '시장', 'kind' => 'local'];
$refs = [];
foreach ([$main, ...$others] as $i => $sc) {
    $rows = Db::rows('SELECT id, section_type_id AS type, bbox_x AS x, bbox_y AS y, bbox_w AS w, bbox_h AS h, structure FROM sections WHERE screen_id = ? ORDER BY bbox_y, bbox_x', [(int) $sc['id']]);
    $secs = ReplicaKit::prepSecs($sc, $rows, $persona);
    $L = ['A', 'B', 'C'][$i];
    $refs[] = ['label' => $L, 'sc' => $sc, 'secs' => $secs];
    echo "== $L {$sc['slug']} screen {$sc['id']}\n";
    foreach (ReplicaKit::rows($secs, 1920) as $r) {
        echo sprintf("  y%5d h%4d %s\n", $r['y'], $r['h'], implode(' | ', array_map(static fn ($c) => $c['type'] . '@' . $c['x'] . '/' . $c['w'], $r['cells'])));
    }
}
$mix = ReplicaKit::mixPlan($refs, 1920);
echo "== MIX height {$mix['height']} share " . json_encode($mix['share']) . " replaced {$mix['replaced']}\n";
foreach ($mix['pieces'] as $p) { echo sprintf("  %s src y%5d h%4d -> y%5d\n", $p['src'], $p['src_y'], $p['src_h'], $p['y']); }
foreach (ReplicaKit::rows($mix['secs'], 1920) as $r) {
    echo sprintf("  y%5d h%4d %s\n", $r['y'], $r['h'], implode(' | ', array_map(static fn ($c) => $c['type'] . '@' . $c['x'] . '/' . $c['w'], $r['cells'])));
}
echo '  frame ' . json_encode($mix['frame']) . "\n";
foreach ($mix['secs'] as $s) {
    $in = $s['structure']['inner'] ?? []; if (!$in) { continue; }
    $l = 99999; $r = 0;
    foreach ($in as $it) { if ($it[3] < 0.95 * 1920) { $l = min($l, $s['x'] + $it[1]); $r = max($r, $s['x'] + $it[1] + $it[3]); } }
    echo sprintf("  inner no%2d %s y%5d %-16s x %4d~%4d%s\n", $s['no'], $s['src'], $s['y'], $s['type'], $l, $r, isset($s['frame']) ? ' (전폭 면)' : '');
}
echo '  style ' . json_encode($mix['style']) . "\n";

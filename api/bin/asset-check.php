<?php
/**
 * 자산 등록 확인(CLI) — 새로 올린 그림을 Jev 1.14 가 보고 ① 그림 속 글자 유무 ② 이름이 그림과 맞는지 확인해, 어긋난 것만 알린다.
 *   php8.4 api/bin/asset-check.php --days=1            (최근 1일 등록분)
 *   php8.4 api/bin/asset-check.php --set=icon-pict-white
 *   [--limit=300] [--apply]   --apply 면 글자 판정을 has_text 에 적어 둔다(목업 샘플 거르기에 쓴다). 이름은 고치지 않고 알리기만.
 * 2026-10-19 시험: 글자 있음 15/15 · 글자 없는 사진 24/24(음성), 아이콘 이름 맞음 39/40, 로고 그림↔이름 27/30.
 * 품질(깨짐·잘림) 판정은 33/50 이라 하지 않는다 — 대량 등록은 계속 시트 눈 검사(R86).
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require __DIR__ . '/../src/bootstrap.php';

use Pp\Core\Config;
use Pp\Core\Db;
use Pp\Core\Jev;
use Pp\Core\Pick;

$opt = [];
foreach (array_slice($argv, 1) as $a) {
    if (preg_match('/^--([a-z]+)(?:=(.*))?$/', $a, $m)) {
        $opt[$m[1]] = $m[2] ?? '1';
    }
}
$where = ['i.deleted_at IS NULL', "i.category IN ('icon','photo','illust','logo','diagram')"];
$args = [];
if (isset($opt['set'])) {
    $where[] = 's.name = ?';
    $args[] = $opt['set'];
} else {
    $where[] = 'i.created_at >= NOW() - INTERVAL ? DAY';
    $args[] = max(1, (int) ($opt['days'] ?? 1));
}
$limit = max(1, min(2000, (int) ($opt['limit'] ?? 300)));
$rows = Db::rows('SELECT i.id, i.public_id, i.name, i.category, i.has_text, s.name AS set_name FROM asset_items i LEFT JOIN asset_sets s ON s.id = i.set_id WHERE '
    . implode(' AND ', $where) . " ORDER BY i.id DESC LIMIT {$limit}", $args);
$paths = \Pp\Assets\Service::thumbPaths(array_column($rows, 'public_id'));
$KO = ['icon' => '아이콘', 'photo' => '사진', 'illust' => '일러스트', 'logo' => '로고', 'diagram' => '도식'];
$n = $textDiff = $nameBad = $skip = 0;
$cost0 = Jev::spentToday();
foreach ($rows as $r) {
    $img = isset($paths[$r['public_id']]) ? Pick::imagePart($paths[$r['public_id']]) : null;
    if ($img === null) {
        $skip++;
        continue;
    }
    $name = trim((string) $r['name']);
    $q = ['text' => ['type' => 'noul', 'instructions' => '그림 안에 읽을 수 있는 글자(제목·문구·간판 글씨·로고 글자)가 들어 있다']];
    if ($name !== '') {
        $q['name'] = ['type' => 'noul', 'instructions' => "이 그림은 '{$name}' 을(를) 나타내는 " . ($KO[$r['category']] ?? '그림') . '이다'];
    }
    $a = Jev::ask('asset_check', [($KO[$r['category']] ?? '그림') . ' 자산:', $img], $q, $r['public_id'], 20);
    if ($a === null) {
        $skip++;
        continue;
    }
    $n++;
    $hasText = (float) ($a['text']['noul'] ?? 0) >= 0.5;
    $nameP = isset($a['name']['noul']) ? (float) $a['name']['noul'] : null;
    $msg = [];
    if ($hasText !== (bool) $r['has_text']) {
        $textDiff++;
        $msg[] = '글자 ' . ($hasText ? '있음' : '없음') . sprintf('(%.2f, DB %s)', $a['text']['noul'], $r['has_text'] ? '있음' : '없음');
        if (isset($opt['apply'])) {
            Db::exec('UPDATE asset_items SET has_text = ? WHERE id = ?', [$hasText ? 1 : 0, $r['id']]);
        }
    }
    if ($nameP !== null && $nameP < 0.3) {   // 시험에서 맞는 이름 0.17~0.96·틀린 이름 0.01~0.39 — 0.3 아래만 알린다
        $nameBad++;
        $msg[] = sprintf("이름 '%s' 와 그림이 다름(%.2f)", mb_substr($name, 0, 30), $nameP);
    }
    if ($msg) {
        printf("%s %s [%s] %s\n", $r['public_id'], $KO[$r['category']] ?? $r['category'], $r['set_name'] ?? '-', implode(' · ', $msg));
    }
}
printf("\n확인 %d · 글자 판정 다름 %d%s · 이름 의심 %d · 건너뜀 %d(그림 없음·Jev 실패) · 비용 $%.4f\n", $n, $textDiff, isset($opt['apply']) ? '(has_text 고침)' : '', $nameBad, $skip, Jev::spentToday() - $cost0);

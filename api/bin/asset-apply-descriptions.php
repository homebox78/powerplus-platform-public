<?php
/**
 * 그림을 보고 다시 쓴 에셋 이름·설명(alt)을 넣는다(서버 CLI 전용, 2026-10-16 데이터 보강 2단계).
 * asset-backfill-names.php 가 키워드로 채운 이름·alt(「승인도장·검토완료·문서승인·확정 아이콘」)는 단조로워서,
 * 검색에 자주 나오는 자산부터 그림을 보고 문장으로 다시 쓴 값을 JSON 으로 두고 이 CLI 로 넣는다.
 * JSON: {"items":[{"id":<public_id>,"name":..,"alt":..,"was_alt":<키워드로 채운 alt>}]}
 * 안전: alt 가 아직 was_alt(키워드 값) 그대로인 행만 바꾼다 — 그사이 사람이 고친 값은 덮지 않는다(멱등).
 *   미리보기: php8.4 /var/www/platform/api/bin/asset-apply-descriptions.php /var/www/platform/db/data/asset-descriptions-2026-10-16.json --dry
 *   실행:     php8.4 /var/www/platform/api/bin/asset-apply-descriptions.php <json>
 * 웹에서는 실행되지 않는다(CLI 만 받는다).
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../src/bootstrap.php';

use Pp\Core\Db;

$file = $argv[1] ?? '';
$dry = in_array('--dry', $argv, true);
if ($file === '' || !is_file($file)) {
    fwrite(STDERR, "JSON 파일 경로가 필요합니다\n");
    exit(1);
}
$data = json_decode((string) file_get_contents($file), true);
$items = is_array($data['items'] ?? null) ? $data['items'] : [];

$done = 0;
$missing = 0;
$kept = 0;
foreach ($items as $it) {
    $id = (string) ($it['id'] ?? '');
    $name = trim((string) ($it['name'] ?? ''));
    $alt = trim((string) ($it['alt'] ?? ''));
    $was = trim((string) ($it['was_alt'] ?? ''));
    if ($id === '' || $name === '' || $alt === '') {
        continue;
    }
    $row = Db::row('SELECT id, alt FROM asset_items WHERE public_id = ? AND deleted_at IS NULL', [$id]);
    if (!$row) {
        $missing++;
        continue;
    }
    $cur = trim((string) ($row['alt'] ?? ''));
    if ($cur === $alt) {
        continue;   // 이미 들어감
    }
    if ($cur !== $was && $cur !== '') {
        $kept++;    // 사람이 고친 값 — 덮지 않는다
        continue;
    }
    if (!$dry) {
        Db::exec('UPDATE asset_items SET name = ?, alt = ? WHERE id = ?', [mb_substr($name, 0, 200), mb_substr($alt, 0, 300), (int) $row['id']]);
    }
    $done++;
}

echo ($dry ? '[미리보기] ' : '') . '항목 ' . count($items) . "개 · 바꿈 {$done} · 없는 에셋 {$missing} · 사람이 고친 값이라 그대로 {$kept}\n";

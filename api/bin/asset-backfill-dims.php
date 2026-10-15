<?php
/**
 * 에셋 크기(w·h)가 빈 행 채우기(서버 CLI 전용, 2026-10-15 데이터 보강).
 * 옛 파워플러스 이관분 등 asset_items.w·h·core_files.w·h·bytes 가 비어 있는 에셋이 1,500여 개였다 —
 * 목업 샘플 비율 판정(sub-visual·poster 등)·Pro 사진 후보(MockSamples::proWhere 의 i.w > 0)에서 빠지고 MCP 상세에 크기가 null 로 나갔다.
 * 원본 파일(asset_files.kind='original' → core_files bucket/path)을 getimagesize 로 재서 채운다. 이미 있는 값은 건드리지 않는다(멱등).
 *   미리보기: php8.4 /var/www/platform/api/bin/asset-backfill-dims.php --dry
 *   실행:     php8.4 /var/www/platform/api/bin/asset-backfill-dims.php [--limit N]
 * 웹에서는 실행되지 않는다(CLI 만 받는다).
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../src/bootstrap.php';

use Pp\Core\Config;
use Pp\Core\Db;

$dry = in_array('--dry', $argv, true);
$limit = 0;
foreach ($argv as $i => $a) {
    if ($a === '--limit' && isset($argv[$i + 1])) {
        $limit = max(0, (int) $argv[$i + 1]);
    }
}

$root = rtrim((string) Config::get('storage.dir'), '/\\');
$rows = Db::rows(
    "SELECT i.id AS item_id, i.public_id, f.id AS file_id, f.bucket, f.path
       FROM asset_items i
       JOIN asset_files af ON af.item_id = i.id AND af.kind = 'original'
       JOIN core_files f ON f.id = af.file_id
      WHERE i.deleted_at IS NULL AND (i.w IS NULL OR i.w = 0 OR i.h IS NULL OR i.h = 0)
      ORDER BY i.id" . ($limit > 0 ? ' LIMIT ' . $limit : '')
);

$done = 0;
$missing = 0;
$unreadable = 0;
foreach ($rows as $r) {
    $file = $root . '/' . $r['bucket'] . '/' . $r['path'];
    if (!is_file($file)) {
        $missing++;
        continue;
    }
    $size = @getimagesize($file);
    if (!$size || ($size[0] ?? 0) <= 0) {
        $unreadable++;   // svg·pptx 등 그림 크기를 못 읽는 원본
        continue;
    }
    [$w, $h] = [(int) $size[0], (int) $size[1]];
    if (!$dry) {
        Db::exec('UPDATE asset_items SET w = ?, h = ? WHERE id = ? AND (w IS NULL OR w = 0 OR h IS NULL OR h = 0)', [$w, $h, $r['item_id']]);
        Db::exec('UPDATE core_files SET w = COALESCE(NULLIF(w, 0), ?), h = COALESCE(NULLIF(h, 0), ?), bytes = IF(bytes IS NULL OR bytes = 0, ?, bytes) WHERE id = ?', [$w, $h, (int) filesize($file), $r['file_id']]);
    }
    $done++;
}

echo ($dry ? '[미리보기] ' : '') . "대상 " . count($rows) . "개 · 채움 {$done} · 원본 없음 {$missing} · 크기 못 읽음 {$unreadable}\n";

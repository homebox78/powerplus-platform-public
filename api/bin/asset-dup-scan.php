<?php
/**
 * 에셋 중복 후보용 해시 뽑기(서버 CLI 전용, 2026-10-16 — 사용자 "자산 전체" 중복 정리).
 * 살아 있는 에셋(사내 장표 ppt 제외)마다 썸네일 dHash(흰 바탕에 눕혀 9×8 회색, 64비트 16진)와 원본 sha256 을 TSV 로 낸다.
 * 쌍 비교는 scripts/asset-dup-pairs.mjs 가 한다 — PHP 로 9백만 쌍을 비트 세며 돌렸더니 8분 넘게 끝나지 않았다(2026-10-16).
 * 진행 수는 stderr 로 500건마다. DB 는 바꾸지 않는다.
 *   php8.4 /var/www/platform/api/bin/asset-dup-scan.php > /tmp/asset-hash.tsv
 *   열: public_id, category, set_id, set_name, created_at, sha256, dhash, name
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

$root = rtrim((string) Config::get('storage.dir'), '/\\');
$rows = Db::rows(
    "SELECT i.public_id, i.category, i.name, i.set_id, s.name AS set_name, i.created_at,
            ft.bucket AS tb, ft.path AS tp, fo.sha256
       FROM asset_items i
       JOIN asset_files at ON at.item_id = i.id AND at.kind = 'thumb'
       JOIN core_files ft ON ft.id = at.file_id
       LEFT JOIN asset_files ao ON ao.item_id = i.id AND ao.kind = 'original'
       LEFT JOIN core_files fo ON fo.id = ao.file_id
       LEFT JOIN asset_sets s ON s.id = i.set_id
      WHERE i.deleted_at IS NULL AND i.category <> 'ppt'
      ORDER BY i.id"
);

/** 흰 바탕에 눕힌 9×8 회색 → 가로 이웃 밝기 비교 64비트(16진 16자) */
$dhash = static function (string $file): ?string {
    $src = @imagecreatefromstring((string) @file_get_contents($file));
    if (!$src) {
        return null;
    }
    $w = imagesx($src);
    $h = imagesy($src);
    $flat = imagecreatetruecolor($w, $h);
    imagefill($flat, 0, 0, imagecolorallocate($flat, 255, 255, 255));
    imagecopy($flat, $src, 0, 0, 0, 0, $w, $h);
    $small = imagecreatetruecolor(9, 8);
    imagecopyresampled($small, $flat, 0, 0, 0, 0, 9, 8, $w, $h);
    $bits = '';
    for ($y = 0; $y < 8; $y++) {
        $prev = null;
        for ($x = 0; $x < 9; $x++) {
            $c = imagecolorat($small, $x, $y);
            $g = (($c >> 16) & 255) * 299 + (($c >> 8) & 255) * 587 + ($c & 255) * 114;
            if ($prev !== null) {
                $bits .= $prev > $g ? '1' : '0';
            }
            $prev = $g;
        }
    }
    $hex = '';
    foreach (str_split($bits, 4) as $nib) {
        $hex .= dechex(bindec($nib));
    }
    return $hex;
};

$clean = static fn($v): string => str_replace(["\t", "\n", "\r"], ' ', (string) $v);
$n = 0;
$unread = 0;
foreach ($rows as $r) {
    $h = $dhash($root . '/' . $r['tb'] . '/' . $r['tp']);
    if (++$n % 500 === 0) {
        fwrite(STDERR, "{$n}/" . count($rows) . "\n");
    }
    if ($h === null) {
        $unread++;
        continue;
    }
    echo implode("\t", [$r['public_id'], $r['category'], $r['set_id'] ?? '', $clean($r['set_name']), $r['created_at'], $r['sha256'] ?? '', $h, $clean($r['name'])]), "\n";
}
fwrite(STDERR, "끝 {$n}건 · 썸네일 못 읽음 {$unread}\n");

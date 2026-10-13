<?php
/**
 * 비회원용 워터마크 판 미리 만들기(서버 CLI 전용, PERF-004).
 * 비회원이 처음 여는 썸네일·원본은 요청 때 GD 로 워터마크를 입히느라 첫 응답이 느렸다(Assets\Service::sendFile).
 * 공개(public·free) 에셋의 thumb·original 판을 미리 만들어 두면 첫 요청도 바로 나간다.
 *   미리보기: php8.4 /var/www/platform/api/bin/prewarm-wm.php --dry
 *   실행:     php8.4 /var/www/platform/api/bin/prewarm-wm.php [--limit N] [--since 'YYYY-MM-DD']
 * 크론(매일 새벽 3시 30분, www-data — storage 쓰기 권한이 웹 사용자와 같아야 한다) 설치 예:
 *   ( sudo crontab -u www-data -l 2>/dev/null; echo '30 3 * * * php8.4 /var/www/platform/api/bin/prewarm-wm.php >> /var/www/platform_data/prewarm.log 2>&1' ) | sudo crontab -u www-data -
 * 이미 있는 판은 원본보다 새로우면 건너뛴다(멱등). 목업 샘플(mockup_sample)은 비회원이 못 보니 제외.
 * 웹에서는 실행되지 않는다(CLI 만 받는다).
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../src/bootstrap.php';

use Pp\Assets\Service;
use Pp\Core\Db;

$dry = in_array('--dry', $argv, true);
$limit = 0;
$since = null;
foreach ($argv as $i => $a) {
    if ($a === '--limit' && isset($argv[$i + 1])) $limit = max(0, (int) $argv[$i + 1]);
    if ($a === '--since' && isset($argv[$i + 1])) $since = (string) $argv[$i + 1];
}

$sql = "SELECT id, public_id FROM asset_items
        WHERE visibility IN ('public','free') AND category <> 'mockup_sample' AND deleted_at IS NULL";
$params = [];
if ($since) { $sql .= ' AND updated_at >= ?'; $params[] = $since; }
$sql .= ' ORDER BY id';
if ($limit > 0) $sql .= ' LIMIT ' . $limit;

$items = Db::rows($sql, $params);
$kinds = ['thumb', 'original'];
$made = 0; $skip = 0; $none = 0; $fail = 0;
$t0 = microtime(true);
echo date('Y-m-d H:i:s') . ($dry ? ' 워터마크 판 미리 만들기 미리보기(--dry)' : ' 워터마크 판 미리 만들기') . ' 대상 ' . count($items) . '건' . PHP_EOL;

foreach ($items as $it) {
    foreach ($kinds as $kind) {
        if ($dry) {
            $f = Db::row('SELECT f.mime FROM asset_files af JOIN core_files f ON f.id = af.file_id WHERE af.item_id = ? AND af.kind = ?', [(int) $it['id'], $kind]);
            if (!$f || !in_array((string) $f['mime'], ['image/png','image/jpeg','image/webp','image/gif'], true)) { $none++; continue; }
            $skip++; // 미리보기에선 만들지 않고 대상만 센다
            continue;
        }
        try {
            $r = Service::prewarm((string) $it['public_id'], (int) $it['id'], $kind);
        } catch (\Throwable $e) {
            $fail++;
            continue;
        }
        if ($r === null) { $none++; continue; }
        $r['made'] ? $made++ : $skip++;
    }
}
printf("만듦 %s · 이미 있음 %s · 그림 아님/파일 없음 %s · 실패 %s · %.1f초\n",
    number_format($made), number_format($skip), number_format($none), number_format($fail), microtime(true) - $t0);
exit($fail > 0 ? 1 : 0);

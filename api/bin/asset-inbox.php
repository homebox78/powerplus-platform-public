<?php
/**
 * 자산 받은편지함 처리 크론(서버 CLI 전용, 2026-10-20) — 관리자가 올린 그림(asset_inbox pending)을 확인해 powerAssets 로 등록한다.
 *   실행:     php8.4 /var/www/platform/api/bin/asset-inbox.php            (한 회차 최대 40장)
 *   몇 장만:  php8.4 /var/www/platform/api/bin/asset-inbox.php --once 5
 *   미리보기: php8.4 /var/www/platform/api/bin/asset-inbox.php --dry       (DB·파일을 바꾸지 않고 판정만 — AI 는 부른다)
 * 크론: 10분마다 www-data(scripts/deploy.sh addcron, 로그 platform_data/asset-inbox.log).
 * 한 장마다(Pp\Assets\Inbox::process): 같은 파일 → dup / 같은 세트 비슷한 그림(dHash) → review / 줄이기·변환 / AI 판정(이름·낱말·종류·글자·결함)
 *   → 글자·결함·AI 실패면 review(화면에서 등록·빼기), 아니면 등록(done). 30분 넘게 processing 인 줄은 되살린다(세 번이면 failed).
 * 같은 때 두 번 돌지 않게 <storage.dir>/inbox/.lock 을 잡는다. 웹에서는 실행되지 않는다(CLI 만 받는다).
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../src/bootstrap.php';

use Pp\Assets\Inbox;
use Pp\Core\Db;

ini_set('memory_limit', '1024M');
$dry = in_array('--dry', $argv, true);
$limit = 40;
foreach ($argv as $i => $a) {
    if ($a === '--once' && isset($argv[$i + 1])) {
        $limit = max(1, min(500, (int) $argv[$i + 1]));
    }
}

$dir = Inbox::inboxDir();
if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
    fwrite(STDERR, "받은편지함 폴더를 만들 수 없음: {$dir}\n");
    exit(1);
}
$lock = fopen($dir . '/.lock', 'c');
if ($lock === false || !flock($lock, LOCK_EX | LOCK_NB)) {
    echo date('[Y-m-d H:i:s] ') . "다른 회차가 돌고 있어 건너뜀\n";
    exit(0);
}

$t0 = microtime(true);
$back = $dry ? 0 : Inbox::recover();
$rows = Db::rows("SELECT * FROM asset_inbox WHERE status = 'pending' ORDER BY id LIMIT {$limit}");
if ($rows === []) {
    if ($back > 0) {
        echo date('[Y-m-d H:i:s] ') . "멈춘 줄 되살림 {$back}\n";
    }
    exit(0);
}
$cost0 = (float) Db::val("SELECT COALESCE(SUM(cost_usd), 0) FROM deck_ai_usage WHERE kind IN ('inbox','jev') AND created_at >= CURDATE()");
$n = ['done' => 0, 'review' => 0, 'dup' => 0, 'failed' => 0];
foreach ($rows as $row) {
    if (!$dry && Db::exec("UPDATE asset_inbox SET status = 'processing', tries = tries + 1 WHERE id = ? AND status = 'pending'", [(int) $row['id']]) !== 1) {
        continue;   // 화면에서 빼기·다른 회차가 먼저 가져감
    }
    try {
        $res = Inbox::process($row, $dry);
    } catch (\Throwable $e) {
        $res = ['status' => 'failed', 'reason' => mb_substr('처리 오류: ' . $e->getMessage(), 0, 300)];
        error_log('[inbox] ' . $row['public_id'] . ' ' . get_class($e) . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
        if (!$dry) {
            Db::exec("UPDATE asset_inbox SET status = 'failed', reason = ? WHERE id = ?", [$res['reason'], (int) $row['id']]);
        }
    }
    $n[$res['status']] = ($n[$res['status']] ?? 0) + 1;
    printf("%s %s %-7s %s%s\n", date('[Y-m-d H:i:s]'), $row['public_id'], $res['status'], mb_substr((string) $row['orig_name'], 0, 40), $res['reason'] ? ' — ' . $res['reason'] : '');
}
$cost = (float) Db::val("SELECT COALESCE(SUM(cost_usd), 0) FROM deck_ai_usage WHERE kind IN ('inbox','jev') AND created_at >= CURDATE()") - $cost0;
printf("%s%s등록 %d · 검토 필요 %d · 중복 %d · 실패 %d / %d장 · %.1f초 · AI $%.4f%s\n", date('[Y-m-d H:i:s] '), $dry ? '[DRY] ' : '',
    $n['done'], $n['review'], $n['dup'], $n['failed'], count($rows), microtime(true) - $t0, $cost, $back > 0 ? " · 멈춘 줄 되살림 {$back}" : '');

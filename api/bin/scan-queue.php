<?php
/**
 * 업로드 바이러스 검사 크론(서버 CLI 전용, SEC-011) — core_scan_queue 의 pending 파일을 모아 clamscan 한 번에 넘긴다.
 *   미리보기: php8.4 /var/www/platform/api/bin/scan-queue.php --dry
 *   실행:     php8.4 /var/www/platform/api/bin/scan-queue.php [--limit 200]
 * 크론(10분마다, www-data) 설치 예:
 *   ( sudo crontab -u www-data -l 2>/dev/null; echo '[10분 간격 크론식] php8.4 /var/www/platform/api/bin/scan-queue.php >> /var/www/platform_data/scan.log 2>&1' ) | sudo crontab -u www-data -
 *   (크론식은 별표·슬래시·10 — PHP 주석 안에 그대로 쓰면 주석이 닫혀 적지 않았다)
 *
 * 설정(config.php 'security' => ['scan' => [...]]):
 *   enabled    true 면 업로드가 대기열에 들어온다(Scan::queue). 기본 false.
 *   cmd        검사 명령. 기본 'clamscan --no-summary --infected --stdout'. 파일 경로들을 뒤에 붙인다.
 *   quarantine 감염 파일을 옮길 폴더. 기본 <storage.dir>/quarantine (웹 밖, 0700).
 *
 * 결과 처리:
 *   clean     그대로.
 *   infected  파일을 격리 폴더로 옮기고(원본 자리 비움) 종류별로 — 장표 원본: 작업 failed + 사유 / 맥락 자료: 자료 행 삭제 + 작업 이벤트
 *             / 로고: 파일 기록 삭제 / 프로필 사진: avatar_url 비움 / 에셋: deleted_at 소프트 삭제. 올린 사람과 관리자 전원에게 알림.
 *   missing   파일이 이미 없음(사용자가 지움) — 건너뜀.
 *   error     clamscan 실행 실패(설치 안 됨 등) — 결과에 남기고 다음 회차에 다시 본다(상태는 pending 유지).
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
use Pp\Core\Notify;

$dry = in_array('--dry', $argv, true);
$limit = 200;
foreach ($argv as $i => $a) {
    if ($a === '--limit' && isset($argv[$i + 1])) $limit = max(1, (int) $argv[$i + 1]);
}

$cmd = (string) Config::get('security.scan.cmd', 'clamscan --no-summary --infected --stdout');
$storage = rtrim((string) Config::get('storage.dir'), '/\\');
$quarantine = (string) Config::get('security.scan.quarantine', $storage . '/quarantine');

$rows = Db::rows('SELECT * FROM core_scan_queue WHERE status = ? ORDER BY id LIMIT ' . $limit, ['pending']);
echo date('Y-m-d H:i:s') . ($dry ? ' 검사 미리보기(--dry)' : ' 업로드 검사') . ' — 대기 ' . count($rows) . '건' . PHP_EOL;
if (!$rows) exit(0);

// 파일이 없는 것은 먼저 걸러 둔다.
$check = [];
foreach ($rows as $r) {
    if (!is_file($r['path'])) {
        if (!$dry) Db::exec("UPDATE core_scan_queue SET status = 'missing', scanned_at = NOW(3) WHERE id = ?", [$r['id']]);
        continue;
    }
    $check[$r['path']][] = $r;
}
printf("  검사 대상 %d개 파일(없음 %d)\n", count($check), count($rows) - array_sum(array_map('count', $check)));
if (!$check) exit(0);
if ($dry) {
    foreach (array_keys($check) as $p) echo "  - $p\n";
    exit(0);
}

// clamscan: 0 깨끗 · 1 감염 있음 · 2 이상 오류(설치 안 됨·DB 없음·파일 하나 못 읽음 등)
// 묶음이 2 여도 FOUND 는 쓰고, 나머지는 한 장씩 다시 본다(Scan::classify — 2026-10-18 전수조사 B: 파일 하나가 대기열 전체를 막던 것)
$run = static function (array $paths) use ($cmd): array {
    $out = [];
    $code = 2;
    exec($cmd . ' ' . implode(' ', array_map('escapeshellarg', $paths)) . ' 2>&1', $out, $code);
    return [$code, $out];
};
$cls = \Pp\Core\Scan::classify($run, array_keys($check));
if ($cls['global'] !== null) {
    $msg = (string) $cls['global'];
    echo "  검사 실패(전체): $msg\n";
    foreach ($check as $rs) foreach ($rs as $r) Db::exec("UPDATE core_scan_queue SET result = ? WHERE id = ?", ['error: ' . $msg, $r['id']]);
    exit(1);
}
foreach ($cls['errors'] as $p => $msg) {   // 이 파일만 오류로 빼고 나머지는 계속 — 다시 검사하려면 status 를 pending 으로
    echo "  검사 오류(이 파일만 건너뜀): $p — $msg\n";
    foreach ($check[$p] ?? [] as $r) Db::exec("UPDATE core_scan_queue SET status = 'error', result = ?, scanned_at = NOW(3) WHERE id = ?", [mb_substr('error: ' . $msg, 0, 255), $r['id']]);
    unset($check[$p]);
}
$infected = $cls['infected'];  // path => 바이러스 이름

if (!is_dir($quarantine)) @mkdir($quarantine, 0700, true);
$admins = Db::rows("SELECT DISTINCT user_id FROM core_user_roles WHERE role IN ('superadmin','admin')");
$nClean = 0;
$nBad = 0;
foreach ($check as $path => $rs) {
    if (!isset($infected[$path])) {
        foreach ($rs as $r) Db::exec("UPDATE core_scan_queue SET status = 'clean', scanned_at = NOW(3) WHERE id = ?", [$r['id']]);
        $nClean++;
        continue;
    }
    $virus = $infected[$path];
    $nBad++;
    $qname = date('Ymd-His') . '-' . bin2hex(random_bytes(3)) . '-' . basename($path);
    $moved = @rename($path, $quarantine . '/' . $qname);
    if (!$moved) @unlink($path);  // 못 옮기면 지운다 — 감염 파일을 서비스 경로에 남기지 않는다
    foreach ($rs as $r) {
        Db::exec("UPDATE core_scan_queue SET status = 'infected', result = ?, scanned_at = NOW(3) WHERE id = ?",
            [mb_substr($virus . ($moved ? " → $qname" : ' (삭제)'), 0, 255), $r['id']]);
        $ref = (string) ($r['ref_id'] ?? '');
        $human = '';
        try {
            switch ($r['kind']) {
                case 'deck_source':
                    Db::exec("UPDATE deck_jobs SET status = 'failed', error = ? WHERE id = ? AND status <> 'done'", ['업로드한 파일에서 악성 코드가 발견돼 작업을 중단했습니다 (' . $virus . ')', $ref]);
                    Db::exec('INSERT INTO deck_job_events (job_id, ts, kind, message) VALUES (?, NOW(), ?, ?)', [$ref, 'error', '바이러스 검사 — ' . $virus . ' 발견, 원본 격리']);
                    $human = '장표 원본';
                    break;
                case 'deck_doc':
                    [$jobId, $docId] = array_pad(explode(':', $ref, 2), 2, '');
                    Db::exec('DELETE FROM deck_job_docs WHERE id = ? AND job_id = ?', [$docId, $jobId]);
                    Db::exec('INSERT INTO deck_job_events (job_id, ts, kind, message) VALUES (?, NOW(), ?, ?)', [$jobId, 'error', '맥락 자료에서 ' . $virus . ' 발견 — 자료를 지웠습니다']);
                    $human = '맥락 자료';
                    break;
                case 'brand':
                    [$jobId, $name] = array_pad(explode(':', $ref, 2), 2, '');
                    Db::exec("DELETE FROM deck_job_files WHERE job_id = ? AND kind = 'brand' AND name = ?", [$jobId, $name]);
                    $human = '로고';
                    break;
                case 'avatar':
                    Db::exec('UPDATE core_users SET avatar_url = NULL WHERE id = ?', [(int) $r['user_id']]);
                    $human = '프로필 사진';
                    break;
                case 'asset':
                    Db::exec('UPDATE asset_items SET deleted_at = NOW(3) WHERE public_id = ? AND deleted_at IS NULL', [$ref]);
                    $human = '에셋';
                    break;
            }
        } catch (\Throwable $e) {
            echo "  후처리 실패({$r['kind']} $ref): " . $e->getMessage() . "\n";
        }
        $title = '올린 ' . ($human ?: '파일') . '에서 악성 코드가 발견됐습니다';
        $body = basename($path) . ' — ' . $virus . '. 파일은 격리했고 관련 작업은 중단했습니다. 깨끗한 파일로 다시 올려 주세요.';
        if (!empty($r['user_id'])) {
            try { Notify::send((int) $r['user_id'], 'system', $title, null, null, $body); } catch (\Throwable) {}
        }
        foreach ($admins as $ad) {
            if ((int) $ad['user_id'] === (int) ($r['user_id'] ?? 0)) continue;
            try { Notify::send((int) $ad['user_id'], 'system', '[보안] ' . $title, '/admin', null, "사용자 #{$r['user_id']} · {$r['kind']} · $body"); } catch (\Throwable) {}
        }
        echo "  감염: $path ($virus) → " . ($moved ? $qname : '삭제') . "\n";
    }
}
printf("깨끗 %d · 감염 %d\n", $nClean, $nBad);
exit(0);

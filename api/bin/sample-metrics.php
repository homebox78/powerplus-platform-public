<?php
/**
 * 서버 자원 표본기 — 크론 5분마다(scripts/deploy.sh 가 www-data crontab 에 등록).
 *   php8.4 /var/www/platform/api/bin/sample-metrics.php
 * 한 줄을 core_server_metrics 에 남기고, 1시간에 한 번 저장 폴더별 크기(du)를 같이 잰다. 30일 지난 행은 지운다.
 * 측정 함수는 api/routes/admin_system.php 와 공용. 실패하면 error_log 만 남기고 종료(크론 메일 없음).
 * 웹에서는 실행되지 않는다(api/.htaccess 가 .php 직접 접근을 막고, 여기서도 CLI 만 받는다).
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/../src/bootstrap.php';
require_once __DIR__ . '/../routes/admin_system.php';

use Pp\Core\Db;

try {
    $now = pp_metrics_now();
    if (!$now['supported']) {
        fwrite(STDERR, "이 서버에서는 측정할 수 없음(/proc 없음)\n");
        exit(0);
    }
    $db = pp_metrics_db(1);

    // 폴더별 크기는 마지막으로 잰 지 55분이 지났을 때만
    $folders = null;
    $dataGb = null;
    $lastF = Db::val('SELECT MAX(sampled_at) FROM core_server_metrics WHERE folders IS NOT NULL');
    if ($lastF === null || strtotime((string) $lastF) < time() - 55 * 60) {
        $storage = pp_metrics_storage_dir();
        if (is_dir($storage)) {
            $folders = pp_metrics_folders($storage);
            $dataGb = round(array_sum(array_column($folders, 'mb')) / 1024, 2);
        }
    }

    $mem = $now['mem'];
    $disk = $now['disk'];
    Db::exec(
        'INSERT INTO core_server_metrics (cpu_pct, load1, mem_used_mb, mem_total_mb, swap_used_mb, swap_total_mb,
                                          disk_used_gb, disk_total_gb, data_used_gb, db_mb, folders)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
            $now['cpu_pct'],
            $now['load'][0] ?? null,
            $mem['used_mb'] ?? null, $mem['total_mb'] ?? null,
            $mem['swap_used_mb'] ?? null, $mem['swap_total_mb'] ?? null,
            $disk['used_gb'] ?? null, $disk['total_gb'] ?? null,
            $dataGb,
            $db['total_mb'],
            $folders === null ? null : json_encode($folders, JSON_UNESCAPED_UNICODE),
        ]
    );
    Db::exec('DELETE FROM core_server_metrics WHERE sampled_at < (NOW(3) - INTERVAL 30 DAY)');
} catch (\Throwable $e) {
    error_log('[pp sample-metrics] ' . get_class($e) . ': ' . $e->getMessage());
    exit(1);
}

<?php
/**
 * 서버 자원 — GET /api/v1/admin/system/metrics?range=24h|7d|30d (superadmin 만, 세션 로그인만).
 * 지금 값은 요청 때 /proc 를 직접 읽고(리눅스), 추이·폴더별 크기는 api/bin/sample-metrics.php 가 5분마다 남긴 core_server_metrics 를 읽는다.
 * 같은 서버의 다른 사이트까지 포함한 서버 전체 수치다. Windows 로컬 개발에는 /proc 가 없어 해당 값이 null.
 * 측정 함수(pp_metrics_*)는 표본기(api/bin/sample-metrics.php)도 이 파일을 require 해 같이 쓴다.
 */
declare(strict_types=1);

use Pp\Core\Actor;
use Pp\Core\Config;
use Pp\Core\Db;
use Pp\Core\HttpError;
use Pp\Core\Response;
use Pp\Core\Router;

if (!function_exists('pp_metrics_now')) {
    /** /proc/meminfo → MB. 없으면 null */
    function pp_metrics_mem(): ?array
    {
        $raw = @file_get_contents('/proc/meminfo');
        if ($raw === false || $raw === '') {
            return null;
        }
        $kb = [];
        foreach (explode("\n", $raw) as $ln) {
            if (preg_match('/^(\w+):\s+(\d+)/', $ln, $m)) {
                $kb[$m[1]] = (int) $m[2];
            }
        }
        if (!isset($kb['MemTotal'])) {
            return null;
        }
        $avail = $kb['MemAvailable'] ?? (($kb['MemFree'] ?? 0) + ($kb['Buffers'] ?? 0) + ($kb['Cached'] ?? 0));
        $mb = static fn (int $k): int => (int) round($k / 1024);
        return [
            'total_mb' => $mb($kb['MemTotal']),
            'used_mb' => $mb(max(0, $kb['MemTotal'] - $avail)),
            'avail_mb' => $mb($avail),
            'swap_total_mb' => $mb($kb['SwapTotal'] ?? 0),
            'swap_used_mb' => $mb(max(0, ($kb['SwapTotal'] ?? 0) - ($kb['SwapFree'] ?? 0))),
        ];
    }

    /** /proc/stat 첫 줄 두 번(200ms 간격)으로 CPU 사용률(%) */
    function pp_metrics_cpu(): ?float
    {
        $read = static function (): ?array {
            $f = @fopen('/proc/stat', 'r');
            if ($f === false) {
                return null;
            }
            $ln = (string) fgets($f);
            fclose($f);
            if (!str_starts_with($ln, 'cpu ')) {
                return null;
            }
            $v = array_map('intval', preg_split('/\s+/', trim(substr($ln, 4))) ?: []);
            $idle = ($v[3] ?? 0) + ($v[4] ?? 0);
            return [array_sum($v), $idle];
        };
        $a = $read();
        if ($a === null) {
            return null;
        }
        usleep(200000);
        $b = $read();
        if ($b === null) {
            return null;
        }
        $dt = $b[0] - $a[0];
        if ($dt <= 0) {
            return 0.0;
        }
        return round(max(0, min(100, (1 - ($b[1] - $a[1]) / $dt) * 100)), 1);
    }

    function pp_metrics_cores(): ?int
    {
        $raw = @file_get_contents('/proc/cpuinfo');
        if ($raw === false || $raw === '') {
            return null;
        }
        $n = preg_match_all('/^processor\s*:/m', $raw);
        return $n > 0 ? $n : null;
    }

    function pp_metrics_disk(string $dir): ?array
    {
        if (!is_dir($dir)) {
            return null;
        }
        $t = @disk_total_space($dir);
        $f = @disk_free_space($dir);
        if ($t === false || $f === false || $t <= 0) {
            return null;
        }
        $gb = static fn (float $b): float => round($b / 1073741824, 2);
        return ['path' => $dir, 'total_gb' => $gb($t), 'used_gb' => $gb($t - $f), 'free_gb' => $gb($f)];
    }

    function pp_metrics_storage_dir(): string
    {
        return rtrim((string) Config::get('storage.dir', '/var/www/platform_data'), '/\\');
    }

    /** 현재 DB 전체 크기(MB) + 상위 표 */
    function pp_metrics_db(int $top = 10): array
    {
        try {
            $total = (float) Db::val('SELECT COALESCE(SUM(data_length + index_length), 0) FROM information_schema.TABLES WHERE table_schema = DATABASE()');
            $rows = Db::rows('SELECT table_name AS name, table_rows AS rows_est, data_length AS data_b, index_length AS index_b
                              FROM information_schema.TABLES WHERE table_schema = DATABASE()
                              ORDER BY (data_length + index_length) DESC LIMIT ' . max(1, min(50, $top)));
        } catch (\Throwable) {
            return ['total_mb' => null, 'tables' => []];
        }
        $mb = static fn (float $b): float => round($b / 1048576, 1);
        return [
            'total_mb' => $mb($total),
            'tables' => array_map(static fn (array $x): array => [
                'name' => (string) $x['name'],
                'rows' => (int) ($x['rows_est'] ?? 0),
                'data_mb' => $mb((float) $x['data_b']),
                'index_mb' => $mb((float) $x['index_b']),
                'total_mb' => $mb((float) $x['data_b'] + (float) $x['index_b']),
            ], $rows),
        ];
    }

    /** 저장 폴더 바로 아래 폴더별 크기(MB) — 비싸다. 표본기만 1시간에 한 번 부른다 */
    function pp_metrics_folders(string $dir): array
    {
        $out = [];
        $subs = @scandir($dir) ?: [];
        foreach ($subs as $s) {
            if ($s === '.' || $s === '..' || !is_dir("$dir/$s") || is_link("$dir/$s")) {
                continue;
            }
            $kb = null;
            if (function_exists('exec')) {
                $o = [];
                $rc = 1;
                @exec('du -sk ' . escapeshellarg("$dir/$s") . ' 2>/dev/null', $o, $rc);
                if ($rc === 0 && isset($o[0]) && preg_match('/^(\d+)/', $o[0], $m)) {
                    $kb = (int) $m[1];
                }
            }
            if ($kb === null) {
                $bytes = 0;
                try {
                    $it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator("$dir/$s", \FilesystemIterator::SKIP_DOTS));
                    foreach ($it as $f) {
                        if ($f->isFile()) {
                            $bytes += $f->getSize();
                        }
                    }
                } catch (\Throwable) {
                }
                $kb = (int) round($bytes / 1024);
            }
            $out[] = ['name' => $s, 'mb' => round($kb / 1024, 1)];
        }
        usort($out, static fn (array $a, array $b): int => $b['mb'] <=> $a['mb']);
        return $out;
    }

    /** 지금 값 한 묶음(리눅스가 아니면 측정 불가 값은 null) */
    function pp_metrics_now(): array
    {
        $load = null;
        $la = @file_get_contents('/proc/loadavg');
        if ($la !== false && $la !== '') {
            $p = explode(' ', trim($la));
            $load = [(float) ($p[0] ?? 0), (float) ($p[1] ?? 0), (float) ($p[2] ?? 0)];
        }
        $up = @file_get_contents('/proc/uptime');
        $uptime = ($up !== false && $up !== '') ? (int) (float) explode(' ', trim($up))[0] : null;
        $storage = pp_metrics_storage_dir();
        return [
            'supported' => is_readable('/proc/meminfo'),
            'cpu_pct' => pp_metrics_cpu(),
            'cores' => pp_metrics_cores(),
            'load' => $load,
            'uptime_s' => $uptime,
            'mem' => pp_metrics_mem(),
            'disk' => pp_metrics_disk('/'),
            'data_disk' => pp_metrics_disk($storage),
            'storage_dir' => $storage,
        ];
    }
}

return static function (Router $r): void {
    $r->get('/admin/system/metrics', function (array $p, Actor $a): void {
        if ($a->user === null) {
            throw HttpError::unauthorized();
        }
        if ($a->via !== 'session' || !$a->hasRole('superadmin')) {
            throw HttpError::forbidden();
        }
        $range = (string) ($_GET['range'] ?? '24h');
        $map = ['24h' => [1, 600], '7d' => [7, 3600], '30d' => [30, 14400]];   // [일 수, 묶는 초] — 최대 ~180점
        if (!isset($map[$range])) {
            throw HttpError::invalid('range 는 24h·7d·30d 중 하나입니다.');
        }
        [$days, $bucket] = $map[$range];

        $now = pp_metrics_now();
        $db = pp_metrics_db(10);

        $series = [];
        $folders = null;
        try {
            $rows = Db::rows(
                'SELECT FLOOR(UNIX_TIMESTAMP(sampled_at) / ' . $bucket . ') * ' . $bucket . ' AS b,
                        AVG(cpu_pct) AS cpu, AVG(load1) AS load1,
                        AVG(mem_used_mb) AS mem_used, AVG(mem_total_mb) AS mem_total,
                        AVG(swap_used_mb) AS swap_used, AVG(swap_total_mb) AS swap_total,
                        AVG(disk_used_gb) AS disk_used, AVG(disk_total_gb) AS disk_total, AVG(db_mb) AS db_mb
                 FROM core_server_metrics WHERE sampled_at >= (NOW(3) - INTERVAL ' . $days . ' DAY)
                 GROUP BY b ORDER BY b'
            );
            foreach ($rows as $x) {
                $pct = static fn ($u, $t): ?float => ($u !== null && $t !== null && (float) $t > 0) ? round((float) $u / (float) $t * 100, 1) : null;
                $series[] = [
                    'at' => date('Y-m-d H:i', (int) $x['b']),
                    'cpu' => $x['cpu'] === null ? null : round((float) $x['cpu'], 1),
                    'load1' => $x['load1'] === null ? null : round((float) $x['load1'], 2),
                    'mem' => $pct($x['mem_used'], $x['mem_total']),
                    'swap' => $pct($x['swap_used'], $x['swap_total']),
                    'disk_gb' => $x['disk_used'] === null ? null : round((float) $x['disk_used'], 2),
                    'db_mb' => $x['db_mb'] === null ? null : round((float) $x['db_mb'], 1),
                ];
            }
            $f = Db::row('SELECT sampled_at, folders, data_used_gb FROM core_server_metrics WHERE folders IS NOT NULL ORDER BY id DESC LIMIT 1');
            if ($f !== null) {
                $folders = ['sampled_at' => $f['sampled_at'], 'total_gb' => $f['data_used_gb'] === null ? null : (float) $f['data_used_gb'],
                    'items' => json_decode((string) $f['folders'], true) ?: []];
            }
            $last = Db::val('SELECT MAX(sampled_at) FROM core_server_metrics');
        } catch (\Throwable) {
            $last = null;   // 표가 아직 없음(마이그레이션 전)
        }

        Response::json([
            'checked_at' => date('c'),
            'range' => $range,
            'now' => $now,
            'db' => $db,
            'series' => $series,
            'folders' => $folders,
            'last_sample_at' => $last,
        ]);
    });
};

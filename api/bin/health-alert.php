<?php
/**
 * 운영 경보(서버 CLI 전용, 2026-10-17) — 사람이 대시보드를 열지 않아도 고장을 알게.
 *   미리보기: php8.4 /var/www/platform/api/bin/health-alert.php --dry     (판정만 찍고 알리지 않는다)
 *   실행:     php8.4 /var/www/platform/api/bin/health-alert.php
 * 크론(10분마다, www-data) — scripts/deploy.sh 가 등록한다. 크론식은 별표·슬래시라 PHP 주석에 그대로 적지 않는다.
 *
 * 보는 것:
 *   engine  장표 변환 엔진 심장박동(deck_workers.seen_at)이 10분 넘게 없다(엔진 행이 하나도 없어도 같다)
 *   disk    데이터 폴더(storage.dir) 디스크 사용률 85% 초과
 *   backup  야간 DB 덤프 상태 파일(scripts/db-backup.sh 가 <storage.dir>/db-backup.status 에 "시각 ok|fail 메모")이
 *           26시간 넘게 안 바뀌었거나 마지막 결과가 fail. 파일이 아예 없으면 '모름'으로 찍기만 한다(설치 전 서버에서 경보 폭탄 방지).
 * 알리는 법: 관리자(superadmin·admin) 사이트 알림 + 운영 메일(mail.ops_to, 없으면 superadmin.email).
 *   같은 문제는 6시간에 한 번만(core_settings ops.alert.<문제> = 마지막 알린 시각). 문제가 풀리면 그 줄을 지워 다음 고장은 바로 알린다.
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
use Pp\Core\Mail;
use Pp\Core\Notify;

const ALERT_EVERY = 6 * 3600;

$dry = in_array('--dry', $argv, true);
$dataDir = rtrim((string) Config::get('storage.dir', '/var/www/platform_data'), '/\\');
$statusFile = (string) Config::get('ops.backup_status', $dataDir . '/db-backup.status');
foreach ($argv as $a) {
    if (str_starts_with($a, '--backup-status=')) {
        $statusFile = substr($a, 16);
    }
}

/** @var array<string, string|null> 문제 키 → 문구(null = 괜찮음) */
$checks = [];

// 1. 엔진 심장박동
try {
    $last = Db::val('SELECT MAX(seen_at) FROM deck_workers');
    $age = $last ? time() - (int) strtotime((string) $last) : null;
    $checks['engine'] = $age === null ? '장표 변환 엔진이 한 번도 접속한 기록이 없습니다.'
        : ($age > 600 ? '장표 변환 엔진이 ' . intdiv($age, 60) . "분째 응답이 없습니다(마지막 {$last}). 대기 중인 작업이 시작되지 않습니다." : null);
} catch (\Throwable $e) {
    $checks['engine'] = 'DB 를 읽지 못해 엔진 상태를 모릅니다: ' . $e->getMessage();
}

// 2. 디스크
$total = @disk_total_space($dataDir);
$free = @disk_free_space($dataDir);
if ($total && $free !== false) {
    $used = (1 - $free / $total) * 100;
    $checks['disk'] = $used > 85 ? sprintf('데이터 폴더 디스크 사용률 %.1f%% (남은 %.1fGB). 85%% 를 넘었습니다.', $used, $free / 1073741824) : null;
} else {
    $checks['disk'] = null;
    if ($dry) {
        echo "disk: {$dataDir} 크기를 읽지 못함(건너뜀)\n";
    }
}

// 3. 야간 백업 · 서버 밖 백업 — offsite-backup.sh 도 같은 꼴의 상태 파일을 쓰는데 아무도 읽지 않았다(2026-10-18 전수조사 B)
$offsiteFile = (string) Config::get('ops.offsite_status', $dataDir . '/offsite-backup.status');
foreach (['backup' => [$statusFile, '야간 DB 백업'], 'offsite' => [$offsiteFile, '서버 밖 백업(GCS)']] as $bk => [$file, $label]) {
    if (is_file($file) && is_readable($file)) {
        $line = trim((string) file_get_contents($file));
        [$ts, $state] = array_pad(preg_split('/\s+/', $line, 3) ?: [], 2, '');
        $age = time() - (int) $ts;
        if ((int) $ts <= 0) {
            $checks[$bk] = "{$label} 상태 파일을 읽을 수 없습니다: {$line}";
        } elseif ($state !== 'ok') {
            $checks[$bk] = "{$label}이 실패했습니다(" . date('Y-m-d H:i', (int) $ts) . "): {$line}";
        } else {
            $checks[$bk] = $age > 26 * 3600 ? "{$label}이 " . intdiv($age, 3600) . '시간째 없습니다(마지막 성공 ' . date('Y-m-d H:i', (int) $ts) . ').' : null;
        }
    } elseif ($dry) {
        echo "{$bk}: 상태 파일 없음({$file}) — 모름(경보 안 함)\n";
    }
}

/**
 * 경보를 보낸 시각 — DB 가 죽어도 경보는 나가야 한다. 예전엔 알리는 단계가 DB(core_settings·core_user_roles·Notify)를 try 없이 써서,
 * 가장 알려야 할 DB 장애 때 예외로 끝나 메일까지 못 갔다(2026-10-18 전수조사 B). DB 를 못 쓰면 임시 폴더 파일로 6시간 간격을 지킨다.
 */
$alertFile = static fn (string $k): string => sys_get_temp_dir() . '/pp-health-' . preg_replace('/[^a-z0-9_.-]/i', '_', $k);
$lastAlert = static function (string $k) use ($alertFile): int {
    try {
        return (int) (Db::val('SELECT v FROM core_settings WHERE k = ?', [$k]) ?? 0);
    } catch (\Throwable) {
        return is_file($alertFile($k)) ? (int) file_get_contents($alertFile($k)) : 0;
    }
};
$markAlert = static function (string $k, ?int $at) use ($alertFile): void {
    if ($at === null) {
        @unlink($alertFile($k));
    } else {
        @file_put_contents($alertFile($k), (string) $at);
    }
    try {
        if ($at === null) {
            Db::exec('DELETE FROM core_settings WHERE k = ?', [$k]);
        } else {
            Db::exec('INSERT INTO core_settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', [$k, (string) $at]);
        }
    } catch (\Throwable $e) {
        fwrite(STDERR, '[health-alert] 경보 시각 DB 기록 실패(파일로 대신): ' . $e->getMessage() . "\n");
    }
};

$sent = 0;
foreach ($checks as $key => $problem) {
    $k = "ops.alert.{$key}";
    if ($dry || $problem !== null) {
        echo date('Y-m-d H:i:s') . " {$key}: " . ($problem ?? '정상') . "\n"; // 크론 로그는 문제가 있을 때만 쌓인다
    }
    if ($dry) {
        continue;
    }
    if ($problem === null) {
        $markAlert($k, null);
        continue;
    }
    $lastAt = $lastAlert($k);
    if (time() - $lastAt < ALERT_EVERY) {
        continue;
    }
    $title = '[운영 경보] ' . (['engine' => '변환 엔진 응답 없음', 'disk' => '디스크 부족', 'backup' => 'DB 백업 이상', 'offsite' => '서버 밖 백업 이상'][$key] ?? $key);
    try {   // 헤더 종 알림 — 실패해도(=DB 장애) 아래 메일은 보낸다. 한 사람 실패가 뒤 사람을 막지 않게 건마다
        foreach (Db::rows("SELECT DISTINCT user_id FROM core_user_roles WHERE role IN ('superadmin','admin')") as $r) {
            try {
                Notify::send((int) $r['user_id'], 'system', $title, '/admin', null, $problem);
            } catch (\Throwable $e) {
                fwrite(STDERR, "[health-alert] 알림 실패(#{$r['user_id']}): " . $e->getMessage() . "\n");
            }
        }
    } catch (\Throwable $e) {
        fwrite(STDERR, '[health-alert] 관리자 목록을 못 읽음(메일만 보냄): ' . $e->getMessage() . "\n");
    }
    $to = (string) Config::get('mail.ops_to', '') ?: (string) Config::get('superadmin.email', '');
    if ($to !== '') {
        try {
            Mail::send($to, "[powerPlus] {$title}", $problem . "\n\n같은 문제는 6시간에 한 번만 알립니다. 서버: " . (gethostname() ?: '-'));
        } catch (\Throwable $e) {
            fwrite(STDERR, '[health-alert] 메일 실패: ' . $e->getMessage() . "\n");
        }
    }
    $markAlert($k, time());
    $sent++;
}
if ($sent > 0) {
    echo date('Y-m-d H:i:s') . " 경보 {$sent}건 보냄\n";
}

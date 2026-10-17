<?php
declare(strict_types=1);

namespace Pp\Core;

/**
 * 로그인 없이 부르는 경로의 횟수 제한(core_rate_limits, 0042) — 2026-10-17 운영 점검.
 * 고정 창(시간·하루)마다 한 줄씩 센다. IP 는 원문 대신 해시로 묶는다(서버 비밀값을 섞어 거꾸로 못 찾게).
 * 표가 없거나 DB 가 잠깐 안 되면 막지 않는다(제한은 보조 — 본 기능을 멈추지 않는다). 이틀 지난 행은 retention.php 가 지운다.
 */
final class RateLimit
{
    public const HOUR = 3600;
    public const DAY = 86400;

    /** 이 요청의 IP 묶음 키 — 원문 IP 해시 16자 */
    public static function ipKey(): string
    {
        $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'cli');
        return substr(hash('sha256', $ip . '|' . (string) Config::get('app.secret', '')), 0, 16);
    }

    /** 한 번 세고, 이번 창에서 max 를 넘었으면 429 */
    public static function hit(string $bucket, int $max, int $window, string $message = '요청이 너무 잦습니다. 잠시 뒤 다시 시도해 주세요.'): void
    {
        if (!self::take($bucket, $max, $window)) {
            $mins = (int) ceil($window / 60);
            throw HttpError::tooMany($message, $window >= self::DAY ? "하루 {$max}번" : "{$mins}분에 {$max}번");
        }
    }

    /** 한 번 센다. 이번 창 안에서 max 이하면 true(허용) */
    public static function take(string $bucket, int $max, int $window): bool
    {
        try {
            $start = date('Y-m-d H:i:s', intdiv(time(), $window) * $window);
            $key = mb_substr($bucket, 0, 120);
            Db::exec('INSERT INTO core_rate_limits (bucket, win_start, hits) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE hits = hits + 1', [$key, $start]);
            return (int) Db::val('SELECT hits FROM core_rate_limits WHERE bucket = ? AND win_start = ?', [$key, $start]) <= $max;
        } catch (\Throwable $e) {
            error_log('[pp-ratelimit] ' . $e->getMessage());
            return true;
        }
    }

    /** 세지 않고 지금 횟수만(이번 창) */
    public static function count(string $bucket, int $window): int
    {
        try {
            $start = date('Y-m-d H:i:s', intdiv(time(), $window) * $window);
            return (int) (Db::val('SELECT hits FROM core_rate_limits WHERE bucket = ? AND win_start = ?', [mb_substr($bucket, 0, 120), $start]) ?? 0);
        } catch (\Throwable) {
            return 0;
        }
    }
}

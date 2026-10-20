<?php
/**
 * 방문자 통계(stat_hits, 설계 docs/db-design.md §6.2) — 사용자 2026-10-20 "방문자 통계 전체·솔루션별·브라우저·디바이스별 등 디테일한 통계".
 * 쓰기 두 길: ① 웹·애드인 화면이 화면 이동마다 POST /stats/hit(로그인 없이) ② 키 호출(MCP·REST)은 Keys::actorFor 가 직접 hitKey.
 * IP·User-Agent 원문은 두지 않는다 — ip_hash(sha256(ip|app.secret) 앞 16자), UA 는 분류 결과(브라우저·OS·기기)만.
 */
declare(strict_types=1);

namespace Pp\Core;

final class Stats
{
    public const MODULES = ['home', 'assets', 'deck', 'mock', 'guide', 'community', 'mcp', 'account', 'help', 'admin', 'etc'];
    public const CHANNELS = ['web', 'addin', 'mcp', 'api'];
    private const BOT = '/bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|phantom|lighthouse|pingdom|uptime|curl\/|wget|python-requests|python-urllib|go-http|okhttp|java\/|axios\/|node-fetch|undici/i';
    private static bool $keyCounted = false;

    /** 주소 → 솔루션. /assets… → assets, /deck… → deck(애드인 장표 포함), /mock·/mockref → mock … */
    public static function moduleOf(string $path): string
    {
        $p = '/' . ltrim(strtolower($path), '/');
        if ($p === '/' || $p === '') {
            return 'home';
        }
        $map = [
            '#^/(api/v1/)?(assets|addin)\b#' => 'assets', '#^/(api/v1/)?deck\b#' => 'deck',   // PPT 애드인 = powerAssets 작업창 '#^/(api/v1/)?(mock|mockref|p/)#' => 'mock',
            '#^/(api/v1/)?guide\b#' => 'guide', '#^/(api/v1/)?community\b#' => 'community', '#^/(powermcp|mcp)\b#' => 'mcp',
            '#^/(account|login|signup|me)\b#' => 'account', '#^/(help|docs|about|notice|changelog|contact|pricing|legal|removal|report)\b#' => 'help',
            '#^/admin\b#' => 'admin', '#^/search\b#' => 'assets',
        ];
        foreach ($map as $re => $m) {
            if (preg_match($re, $p)) {
                return $m;
            }
        }
        return 'etc';
    }

    /** User-Agent → [브라우저, OS, 기기] (원문은 버린다). 봇이면 null */
    public static function classify(string $ua): ?array
    {
        if ($ua === '' || preg_match(self::BOT, $ua)) {
            return null;
        }
        $b = match (true) {
            (bool) preg_match('/Whale\//', $ua) => 'Whale',
            (bool) preg_match('/SamsungBrowser\//', $ua) => 'Samsung',
            (bool) preg_match('/Edg(e|A|iOS)?\//', $ua) => 'Edge',
            (bool) preg_match('/OPR\/|Opera/', $ua) => 'Opera',
            (bool) preg_match('/Firefox\/|FxiOS\//', $ua) => 'Firefox',
            (bool) preg_match('/KAKAOTALK/i', $ua) => 'KakaoTalk',
            (bool) preg_match('/NAVER\(inapp/i', $ua) => 'NAVER앱',
            (bool) preg_match('/Chrome\/|CriOS\//', $ua) => 'Chrome',
            (bool) preg_match('/Safari\//', $ua) => 'Safari',
            (bool) preg_match('/Trident\/|MSIE /', $ua) => 'IE',
            default => '기타',
        };
        $os = match (true) {
            (bool) preg_match('/iPhone|iPad|iPod/', $ua) => 'iOS',
            (bool) preg_match('/Android/', $ua) => 'Android',
            (bool) preg_match('/Windows/', $ua) => 'Windows',
            (bool) preg_match('/Mac OS X|Macintosh/', $ua) => 'macOS',
            (bool) preg_match('/CrOS/', $ua) => 'ChromeOS',
            (bool) preg_match('/Linux/', $ua) => 'Linux',
            default => '기타',
        };
        $dev = preg_match('/iPad|Tablet|(Android(?!.*Mobile))/', $ua) ? 'tablet' : (preg_match('/Mobi|iPhone|Android/', $ua) ? 'mobile' : 'desktop');
        return [$b, $os, $dev];
    }

    private static function ipHash(): string
    {
        return substr(hash('sha256', (string) ($_SERVER['REMOTE_ADDR'] ?? '') . '|' . (string) Config::get('app.secret', '')), 0, 16);
    }

    private static function id16(string $v): string
    {
        return preg_match('/^[A-Za-z0-9_-]{8,32}$/', $v) ? substr($v, 0, 16) : substr(hash('sha256', $v), 0, 16);
    }

    /** 화면이 보낸 한 줄. 돌려주는 값: 기록했나 */
    public static function hitWeb(array $b, ?int $userId): bool
    {
        $c = self::classify((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''));
        if ($c === null) {
            return false;
        }
        $path = mb_substr((string) preg_replace('/[?#].*$/', '', (string) ($b['path'] ?? '/')), 0, 255) ?: '/';
        if (!str_starts_with($path, '/')) {
            return false;
        }
        $vid = self::id16((string) ($b['vid'] ?? ''));
        $sid = self::id16((string) ($b['sid'] ?? ''));
        $chan = ($b['channel'] ?? '') === 'addin' ? 'addin' : 'web';
        // 같은 방문자의 같은 주소 2초 안 반복(새로고침 연타·두 번 알림)은 하나로
        if (Db::val('SELECT 1 FROM stat_hits WHERE vid = ? AND path = ? AND at > NOW(3) - INTERVAL 2 SECOND LIMIT 1', [$vid, $path])) {
            return false;
        }
        $ref = null;
        $r = (string) ($b['ref'] ?? '');
        if ($r !== '' && ($h = parse_url($r, PHP_URL_HOST)) && is_string($h)) {
            $self = (string) parse_url((string) Config::get('app.url', ''), PHP_URL_HOST);
            $ref = strtolower($h) === strtolower($self) ? null : mb_substr(strtolower(preg_replace('/^www\./', '', $h)), 0, 120);
        }
        $w = isset($b['w']) ? max(0, min(9999, (int) $b['w'])) : null;
        $lang = isset($b['lang']) ? mb_substr(preg_replace('/[^A-Za-z-]/', '', (string) $b['lang']), 0, 12) : null;
        Db::exec('INSERT INTO stat_hits (at, day, vid, sid, user_id, path, module, channel, browser, os, device, w, ref_host, lang, ip_hash) VALUES (NOW(3), CURDATE(), ?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [$vid, $sid, $userId, $path, self::moduleOf($path), $chan, $c[0], $c[1], $c[2], $w, $ref, $lang, self::ipHash()]);
        return true;
    }

    /** 키 호출(MCP·REST) 한 번 — 요청마다 한 줄. 실패해도 본 요청은 계속 */
    public static function hitKey(int $userId, string $keyPublicId, bool $viaMcp): void
    {
        if (self::$keyCounted) {
            return;
        }
        self::$keyCounted = true;
        try {
            $path = mb_substr((string) preg_replace('/[?#].*$/', '', (string) ($_SERVER['REQUEST_URI'] ?? '/')), 0, 255);
            $vid = substr(hash('sha256', 'key|' . $keyPublicId), 0, 16);
            // 방문 = 같은 키의 30분 묶음
            $sid = substr(hash('sha256', 'key|' . $keyPublicId . '|' . intdiv(time(), 1800)), 0, 16);
            Db::exec('INSERT INTO stat_hits (at, day, vid, sid, user_id, path, module, channel, browser, os, device, w, ref_host, lang, ip_hash) VALUES (NOW(3), CURDATE(), ?,?,?,?,?,?,\'\',\'\',\'\',NULL,NULL,NULL,?)',
                [$vid, $sid, $userId, $path, self::moduleOf(preg_replace('#^/api/v1#', '', $path) ?: '/'), $viaMcp ? 'mcp' : 'api', self::ipHash()]);
        } catch (\Throwable $e) {
            error_log('[stats] key hit: ' . $e->getMessage());
        }
    }
}

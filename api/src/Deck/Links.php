<?php
declare(strict_types=1);

namespace Pp\Deck;

use DateTimeImmutable;
use DateTimeZone;
use Pp\Core\Actor;
use Pp\Core\Audit;
use Pp\Core\Config;
use Pp\Core\Db;
use Pp\Core\HttpError;
use Pp\Core\RateLimit;

/**
 * 완성 산출물 받기 링크(사용자 2026-10-18 "내보내기 완료된 산출물 장표나 전체 파일을 url 로 보낼 수도 있게, 대신 경로 노출은 안 되게").
 *
 *  · 주소 = {app.url}/api/v1/d/{토큰}. 토큰은 32바이트 무작위(base64url 43자) — DB(deck_share_links, 0044)에는 sha256 만 둔다.
 *  · 작업 id·파일 이름·서버 경로·저장 위치는 주소·응답 헤더·오류 글 어디에도 내보내지 않는다.
 *    받는 파일 이름(Content-Disposition)만 사용자에게 보이는 결과 이름(경로 없이, RFC 5987 한글).
 *  · 로그인 없이 받는다(Router OPEN_PATHS '/d/'). 없는 토큰·만료·끊김·작업 삭제는 전부 같은 404 — 있는지 없는지 흘리지 않는다.
 *  · 받을 때마다 그 시점 최신 결과로 만든다(작업을 다시 돌려 결과가 바뀌면 새 결과).
 *  · 엠바고(사업명이 박힌 장표가 비로그인으로 나감): 만들기는 웹 세션만(화면 확인 한 번), 만들기·끊기는 감사 로그.
 */
final class Links
{
    public const KINDS = ['result', 'export', 'fonts'];
    public const DAYS = [1, 7, 30];
    public const DEFAULT_DAYS = 7;
    /** 같은 IP 가 한 시간에 받을 수 있는 횟수(없는 토큰 두드리기 포함) */
    public const RATE_MAX = 60;
    /** 없는 토큰·만료·끊김·작업 삭제 — 모두 이 한 문장(존재 여부를 가르지 않는다) */
    public const GONE = '링크가 없거나 받을 수 있는 기간이 지났습니다.';
    /** 받기 응답에 늘 붙이는 머리 — 오류 응답에도 붙는다 */
    public const SAFE_HEADERS = [
        'X-Robots-Tag: noindex, nofollow, noarchive',
        'Cache-Control: private, no-store, max-age=0',
        'Referrer-Policy: no-referrer',
        'X-Content-Type-Options: nosniff',
    ];
    private const TYPES = [
        'result' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'export' => 'application/zip',
        'fonts' => 'application/zip',
    ];

    public static function now(?int $t = null): string
    {
        return (new DateTimeImmutable('@' . ($t ?? time())))->setTimezone(new DateTimeZone('Asia/Seoul'))->format('Y-m-d H:i:s');
    }

    public static function newToken(): string
    {
        return rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    }

    public static function hash(string $token): string
    {
        return hash('sha256', $token);
    }

    public static function validToken(string $token): bool
    {
        return (bool) preg_match('/^[A-Za-z0-9_-]{43}$/', $token);
    }

    public static function url(string $token): string
    {
        return rtrim((string) Config::get('app.url', 'https://powerplus.hom2box.com'), '/') . '/api/v1/d/' . $token;
    }

    private static function gone(): HttpError
    {
        return new HttpError('NOT_FOUND', self::GONE, 404);
    }

    /** 이 종류로 지금 받을 것이 있는가(만들 때 확인) */
    private static function available(array $j, string $kind): bool
    {
        if ($kind === 'result') return Jobs::resultFile($j) !== null;
        if ($kind === 'fonts') {
            foreach (glob(Jobs::dir((string) $j['id'], 'extra') . '/*') ?: [] as $f) {
                if (is_file($f) && preg_match('/\.(ttf|otf|ttc)$/i', $f)) return true;
            }
            return false;
        }
        return true;   // export — 완성 작업은 결과 장표·기획이 있다. 비면 받을 때 안내
    }

    /** 링크 만들기 — 작업 주인·관리자, 완성(done) 작업만. 토큰 원문은 이 응답에만 실린다 */
    public static function create(string $jobId, string $email, bool $admin, array $b, ?Actor $a = null): array
    {
        $j = Jobs::own($jobId, $email, $admin);
        if (($j['status'] ?? '') !== 'done') Legacy::fail('완성된 작업만 받기 링크를 만들 수 있습니다.', 409);
        $kind = (string) ($b['kind'] ?? 'result');
        if (!in_array($kind, self::KINDS, true)) Legacy::fail('링크 종류는 결과 장표·전체 묶음·서체 묶음 중 하나입니다.');
        $days = (int) ($b['days'] ?? self::DEFAULT_DAYS);
        if (!in_array($days, self::DAYS, true)) Legacy::fail('기한은 1일·7일·30일 중 하나입니다.');
        if (!self::available($j, $kind)) Legacy::fail($kind === 'fonts' ? '이 장표에 함께 넣은 서체가 없습니다.' : '받을 결과 장표가 아직 없습니다.', 404);
        $token = self::newToken();
        $now = time();
        $exp = self::now($now + $days * 86400);
        Db::exec('INSERT INTO deck_share_links (token_hash, token_tail, job_id, kind, created_by, created_at, expires_at, downloads) VALUES (?, ?, ?, ?, ?, ?, ?, 0)',
            [self::hash($token), substr($token, -4), $jobId, $kind, strtolower($email), self::now($now), $exp]);
        $lid = Db::lastId();
        Audit::log($a, 'deck.link.create', 'deck_share_links:' . $lid, null, ['job' => $jobId, 'kind' => $kind, 'days' => $days, 'expires_at' => $exp]);
        return ['url' => self::url($token), 'id' => $lid, 'kind' => $kind, 'expires_at' => $exp, 'links' => self::rows($jobId)];
    }

    /** 이 작업의 링크 목록(최근 50) — 토큰 원문은 없다(끝 4자만) */
    public static function list(string $jobId, string $email, bool $admin): array
    {
        Jobs::own($jobId, $email, $admin);
        return self::rows($jobId);
    }

    private static function rows(string $jobId): array
    {
        $now = self::now();
        $rows = Db::rows('SELECT id, token_tail, kind, created_by, created_at, expires_at, revoked_at, downloads, last_download_at FROM deck_share_links WHERE job_id = ? ORDER BY id DESC LIMIT 50', [$jobId]);
        return array_map(static fn (array $r): array => [
            'id' => (int) $r['id'], 'tail' => (string) $r['token_tail'], 'kind' => (string) $r['kind'], 'created_by' => (string) $r['created_by'],
            'created_at' => (string) $r['created_at'], 'expires_at' => (string) $r['expires_at'], 'revoked_at' => $r['revoked_at'],
            'downloads' => (int) $r['downloads'], 'last_download_at' => $r['last_download_at'],
            'state' => $r['revoked_at'] !== null ? 'revoked' : ((string) $r['expires_at'] <= $now ? 'expired' : 'active'),
        ], $rows);
    }

    /** 끊기 — 그 뒤로는 같은 404 */
    public static function revoke(string $jobId, int $linkId, string $email, bool $admin, ?Actor $a = null): array
    {
        Jobs::own($jobId, $email, $admin);
        $n = Db::exec('UPDATE deck_share_links SET revoked_at = ? WHERE id = ? AND job_id = ? AND revoked_at IS NULL', [self::now(), $linkId, $jobId]);
        if ($n > 0) Audit::log($a, 'deck.link.revoke', 'deck_share_links:' . $linkId, null, ['job' => $jobId]);
        return ['ok' => true, 'links' => self::rows($jobId)];
    }

    /** 작업을 지울 때 — 표가 아직 없어도(마이그레이션 전) 삭제를 막지 않는다 */
    public static function dropForJob(string $jobId): void
    {
        try {
            Db::exec('DELETE FROM deck_share_links WHERE job_id = ?', [$jobId]);
        } catch (\Throwable $e) {
            error_log('[pp-deck-links] ' . $e->getMessage());
        }
    }

    /** 토큰 → [링크 행, 작업 행]. 어떤 이유로든 못 주면 같은 404 */
    public static function resolve(string $token): array
    {
        if (!self::validToken($token)) throw self::gone();
        $h = self::hash($token);
        $l = Db::row('SELECT * FROM deck_share_links WHERE token_hash = ?', [$h]);
        if ($l === null || !hash_equals((string) $l['token_hash'], $h) || $l['revoked_at'] !== null || (string) $l['expires_at'] <= self::now()) throw self::gone();
        $j = Db::row('SELECT * FROM deck_jobs WHERE id = ?', [(string) $l['job_id']]);
        if ($j === null) throw self::gone();
        return [$l, $j];
    }

    /**
     * 받을 파일 준비 — {path, temp, name, type, link_id}. path 는 서버 안에서만 쓴다(응답에 싣지 않는다).
     * 그 시점 최신 결과로: result = 가장 최근 결과 pptx, export·fonts = 지금 파일로 새로 묶는다.
     */
    public static function prepare(string $token): array
    {
        [$l, $j] = self::resolve($token);
        $kind = (string) $l['kind'];
        $got = match ($kind) {
            'result' => Jobs::resultFile($j),
            'export' => Jobs::exportZip($j),
            'fonts' => Jobs::fontsZip($j),
            default => throw self::gone(),
        };
        if ($got === null) throw new HttpError('NOT_FOUND', '받을 수 있는 결과가 아직 없습니다. 링크를 보낸 사람에게 알려 주세요.', 404);
        return ['path' => $got[0], 'temp' => $kind !== 'result', 'name' => $got[1], 'type' => self::TYPES[$kind], 'link_id' => (int) $l['id']];
    }

    /** 받기 응답 머리(본문 앞) — 파일 이름은 보이는 이름만. ASCII 대체 이름은 확장자만 살린 고정 이름 */
    public static function headers(array $p): array
    {
        $name = basename(str_replace('\\', '/', (string) $p['name']));
        $ext = strtolower((string) pathinfo($name, PATHINFO_EXTENSION));
        $ascii = 'powerDeck' . ($ext !== '' && preg_match('/^[a-z0-9]{1,5}$/', $ext) ? '.' . $ext : '');
        return [
            'Content-Type: ' . $p['type'],
            'Content-Length: ' . (string) filesize((string) $p['path']),
            "Content-Disposition: attachment; filename=\"{$ascii}\"; filename*=UTF-8''" . rawurlencode($name),
            'X-AI-Generated: true',   // LEGAL-003
        ];
    }

    /** GET/HEAD /d/{토큰} — 로그인 없이. HEAD(미리보기 봇 등)는 세지 않고 본문도 없다 */
    public static function download(string $token, bool $head = false): void
    {
        foreach (self::SAFE_HEADERS as $h) header($h);
        RateLimit::hit('deck-dl:' . RateLimit::ipKey(), self::RATE_MAX, RateLimit::HOUR, '내려받기 요청이 너무 잦습니다. 잠시 뒤 다시 시도해 주세요.');
        $p = self::prepare($token);
        try {
            if (!$head) {
                Db::exec('UPDATE deck_share_links SET downloads = downloads + 1, last_download_at = ? WHERE id = ?', [self::now(), $p['link_id']]);
            }
            set_time_limit(0);
            foreach (self::headers($p) as $h) header($h);
            if (!$head) readfile((string) $p['path']);
        } finally {
            if ($p['temp']) @unlink((string) $p['path']);
        }
    }
}

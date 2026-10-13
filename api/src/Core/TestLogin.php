<?php
declare(strict_types=1);

namespace Pp\Core;

/**
 * 임시 테스트 계정(아이디·비밀번호) — 사용자 2026-10-08 지시 "운영에 임시 비밀번호 테스트 계정, 15일 뒤 자동 만료".
 * AI 브라우저로 화면 전체를 분석하려고 둔 것이라 계정 하나·기간 한정이다.
 *  - 값은 core_settings 에만: auth.test.user(아이디) · auth.test.hash(password_hash) · auth.test.until(만료 시각) · auth.test.user_id.
 *    만드는·지우는 건 api/bin/test-account.php(서버 CLI) 하나뿐 — 화면·API 로는 못 만든다.
 *  - 만료가 지나면 로그인 경로는 404, 이미 열린 세션·키도 Auth 가 끊는다.
 *  - 실패 20번이면 만료 전이라도 잠근다(무차별 대입 방지). 성공·실패 모두 감사 로그.
 */
final class TestLogin
{
    private const MAX_FAIL = 20;

    /** @return array<string,string> */
    private static function settings(): array
    {
        static $s = null;
        if ($s === null) {
            $s = [];
            try {
                foreach (Db::rows("SELECT k, v FROM core_settings WHERE k LIKE 'auth.test.%'") as $r) {
                    $s[(string) $r['k']] = (string) $r['v'];
                }
            } catch (\Throwable) {
            }
        }
        return $s;
    }

    public static function until(): ?string
    {
        return self::settings()['auth.test.until'] ?? null;
    }

    public static function active(): bool
    {
        $s = self::settings();
        $until = $s['auth.test.until'] ?? '';
        return ($s['auth.test.hash'] ?? '') !== ''
            && $until !== '' && strtotime($until) > time()
            && (int) ($s['auth.test.fail'] ?? 0) < self::MAX_FAIL;
    }

    public static function userId(): ?int
    {
        $id = (int) (self::settings()['auth.test.user_id'] ?? 0);
        return $id > 0 ? $id : null;
    }

    /**
     * 업무 보고용 거울(읽기 전용) — 사용자 2026-10-08 "샘플 계정의 시안·갤러리·장표 작업을 테스트 계정에서 보이게".
     * 원본 계정 이메일은 core_settings auth.test.mirror(쉼표) 에만 둔다(코드·문서에 개인 이메일을 적지 않음).
     * 테스트 계정이 아니거나 기간이 지나면 빈 배열 — 목록 조회 조건에만 더하고 쓰기는 본인 것만.
     * @return list<string>
     */
    public static function mirrorEmails(?int $userId): array
    {
        if ($userId === null || self::userId() !== $userId || !self::active()) {
            return [];
        }
        $raw = self::settings()['auth.test.mirror'] ?? '';
        return array_values(array_filter(array_map('trim', explode(',', strtolower($raw)))));
    }

    /** @return list<int> 거울 원본 계정 id */
    public static function mirrorIds(?int $userId): array
    {
        $em = self::mirrorEmails($userId);
        if (!$em) {
            return [];
        }
        $ph = implode(',', array_fill(0, count($em), '?'));
        return array_map('intval', array_column(Db::rows("SELECT id FROM core_users WHERE LOWER(email) IN ({$ph})", $em), 'id'));
    }

    /** 로그인 화면에 테스트 로그인 칸을 보일지(auth.test.show_login, 기본 꺼짐 — test-account.php show/hide) */
    public static function shown(): bool
    {
        return self::active() && (self::settings()['auth.test.show_login'] ?? '0') === '1';
    }

    /** 이 요청 주체가 테스트 계정인가(세션·키 모두) */
    public static function isActor(Actor $a): bool
    {
        $id = self::userId();
        return $id !== null && $a->id() === $id;
    }

    /**
     * 테스트 계정 요청의 공통 관문(Router 가 라우트 찾은 직후 한 번) — 사이트 종합 평가 리포트 1-1.
     *  - 쓰기(POST·PUT·PATCH·DELETE)는 로그아웃만 빼고 전부 403(읽기 전용)
     *  - 관리자 화면 열람(GET …/admin…)은 core_audit 에 남긴다(테스트 계정만 — 일반 관리자 열람까지 남기면 기록이 넘친다)
     *  - 응답 JSON 에서 다른 회원의 이메일·이름·연락처를 가린다(Mask, 출력 버퍼)
     */
    public static function guard(Actor $a, string $method, string $path): void
    {
        if (!self::isActor($a)) {
            return;
        }
        if (in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)
            && !in_array($path, ['/auth/logout', '/auth/logout-all', '/auth/test-login'], true)) {
            throw new HttpError('TEST_READ_ONLY', '테스트 계정은 읽기 전용입니다.', 403, '보기만 할 수 있습니다. 바꾸려면 본인 계정으로 로그인하세요.');
        }
        if ($method === 'GET' && preg_match('#(^|/)admin(/|$)#', $path)) {
            Audit::log($a, 'admin.view', 'page:' . mb_substr($path, 0, 35), null, ['path' => $path, 'query' => mb_substr((string) ($_SERVER['QUERY_STRING'] ?? ''), 0, 300)]);
        }
        $keep = strtolower((string) ($a->user['email'] ?? ''));
        ob_start(static fn (string $out): string => Mask::buffer($out, $keep));
    }

    /** 이 사용자가 테스트 계정인데 기간이 지났는가 — Auth 가 세션·키를 끊는다 */
    public static function expiredFor(int $userId): bool
    {
        return self::userId() === $userId && !self::active();
    }

    /** @return array<string,mixed> 로그인한 사용자 행 */
    public static function verify(string $user, string $pass): array
    {
        if (!self::active()) {
            throw HttpError::notFound('경로');
        }
        $s = self::settings();
        $ok = hash_equals((string) ($s['auth.test.user'] ?? ''), $user) && password_verify($pass, (string) $s['auth.test.hash']);
        $uid = self::userId();
        if (!$ok || !$uid) {
            Db::exec("INSERT INTO core_settings (k, v) VALUES ('auth.test.fail', '1') ON DUPLICATE KEY UPDATE v = CAST(v AS UNSIGNED) + 1");
            Audit::log(null, 'auth.test_login.fail', 'core_users:' . ($uid ?? 0));
            throw new HttpError('LOGIN_FAILED', '아이디 또는 비밀번호가 맞지 않습니다.', 401);
        }
        $u = Users::byId($uid);
        if (!$u) {
            throw HttpError::notFound('테스트 계정');
        }
        Users::assertActive($u);
        Audit::log(null, 'auth.test_login', 'core_users:' . $uid);
        return $u;
    }
}

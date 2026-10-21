<?php
declare(strict_types=1);

namespace Pp\Core;

/**
 * 인증 미들웨어 하나(설계서 §2.2): 세션 쿠키 → Bearer pp_live_ 키 → 워커 키 순으로 Actor 를 만든다.
 * 출처: homebox-handoff api/src/Plan.php keyPlan (Bearer 키 sha256 조회) + Http/Auth.php (관리자) 구조 이식.
 */
final class Auth
{
    private static ?Actor $cached = null;

    public static function actor(): Actor
    {
        if (self::$cached !== null) {
            return self::$cached;
        }
        return self::$cached = self::resolve();
    }

    /** 테스트·로그인 직후 갱신용 */
    public static function reset(): void
    {
        self::$cached = null;
    }

    private static function resolve(): Actor
    {
        // 1) Bearer 키 / 워커 키
        $hdr = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if ($hdr === '' && function_exists('apache_request_headers')) {
            $h = apache_request_headers();
            $hdr = $h['Authorization'] ?? $h['authorization'] ?? '';
        }
        $token = '';
        if (preg_match('/^Bearer\s+(\S+)$/i', $hdr, $m)) {
            $token = $m[1];
        } elseif (!empty($_SERVER['HTTP_X_PP_KEY'])) {
            $token = (string) $_SERVER['HTTP_X_PP_KEY'];
        }
        if ($token !== '') {
            if (str_starts_with($token, 'pp_worker_')) {
                return self::worker($token);
            }
            if (str_starts_with($token, 'pp_live_') || str_starts_with($token, 'pp_test_')) {
                $a = Keys::actorFor($token);
                if ($a) {
                    if ($a->id() !== null && TestLogin::expiredFor($a->id())) {
                        throw HttpError::unauthorized('테스트 계정 기간이 끝났습니다.');
                    }
                    return $a;
                }
                throw HttpError::unauthorized('API 키가 유효하지 않습니다.');
            }
        }

        // 2) 세션
        $uid = Session::userId();
        if ($uid) {
            $u = Users::byId($uid);
            // 휴면 판정을 먼저 — 휴면으로 바뀌면 session_epoch 가 올라 이 세션도 끝난다(다시 로그인하면 승인 요청 안내)
            $u = $u ? Users::markDormantIfIdle($u) : null;
            if ($u && (int) $u['session_epoch'] === Session::epoch() && ($u['status'] ?? 'active') === 'active' && !TestLogin::expiredFor((int) $u['id'])) {
                Users::touch($u);
                return self::fromUser($u, 'session');
            }
            Session::logout();
        }
        return Actor::anon();
    }

    public static function fromUser(array $u, string $via, ?array $key = null): Actor
    {
        return new Actor(
            $u,
            Users::primaryOrgId($u),
            (string) $u['kind'],
            Users::plan($u),
            Users::roles((int) $u['id']),
            $key,
            $via,
        );
    }

    private static function worker(string $token): Actor
    {
        $expected = (string) Config::get('worker.key', '');
        $name = (string) ($_SERVER['HTTP_X_WORKER'] ?? '');
        if ($expected === '' || !hash_equals($expected, $token) || $name === '') {
            throw HttpError::unauthorized('워커 키 또는 X-Worker 헤더가 없습니다.');
        }
        return new Actor(null, null, 'worker', 'staff', ['worker'], ['worker' => $name], 'worker');
    }

    public static function requireUser(Actor $a): array
    {
        if ($a->user === null) {
            throw HttpError::unauthorized();
        }
        return $a->user;
    }
}

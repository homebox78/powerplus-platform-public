<?php
declare(strict_types=1);

namespace Pp\Core;

/**
 * 첫 화면 정보 입력(팀장 2026-10-28): 이름(필수 2~20자)·닉네임(선택)·소속/부서(선택).
 * - 이메일 인증(OTP)으로 처음 들어오면 이름이 임시값('사용자')이라 누군지 구분이 안 된다 → 로그인 직후 닫을 수 없는 창으로 받는다.
 * - 옛 자료 이관(db/migrate-legacy/users.mjs·powerplus-assets.mjs)과 관리자 추가(이름 비움)는 이메일 앞부분을 이름으로 넣었다 → 이것도 임시 이름으로 본다.
 * - 소셜(구글·카카오·네이버)로 들어와 이름이 이미 있으면 묻지 않는다.
 * - 한 번 저장하면(profile_at) 이름이 이메일 앞부분과 같아도 다시 묻지 않는다.
 * - 약관 동의 창(Consents)을 대신한다 — 임직원만 쓰는 서비스라 동의 창은 띄우지 않는다. Router 는 이제 동의 대신 이 검사로 막는다.
 * - 세션 로그인만 막는다(API 키·워커는 막지 않음). 테스트 계정은 읽기 전용이라 저장할 수 없으니 묻지 않는다(R84 와 같은 이유).
 */
final class Profile
{
    public const NAME_MIN = 2;
    public const NAME_MAX = 20;
    public const NICK_MAX = 20;
    public const DEPT_MAX = 40;
    /** 가입 때 임시로 넣는 이름(Users::findOrCreateByLogin) */
    public const PLACEHOLDER = '사용자';

    /** 이름이 비었거나 임시 이름(기본값·이메일 앞부분)인가 */
    public static function nameMissing(array $u): bool
    {
        $name = trim((string) ($u['name'] ?? ''));
        if ($name === '' || $name === self::PLACEHOLDER) {
            return true;
        }
        $email = (string) ($u['email'] ?? '');
        $at = strrpos($email, '@');
        $local = $at === false ? '' : substr($email, 0, $at);
        return $local !== '' && mb_strtolower($name) === mb_strtolower($local);
    }

    /** @return array{required: bool, name: ?string, nickname: ?string, dept: ?string, done_at: ?string} */
    public static function status(array $u): array
    {
        // 0048 마이그레이션 전(칸이 없으면)에는 막지 않는다 — 코드만 먼저 올라가도 모두가 막히지 않게
        $ready = array_key_exists('profile_at', $u);
        $done = $ready && !empty($u['profile_at']);
        return [
            'required' => $ready && !$done && self::nameMissing($u),
            'name' => self::nameMissing($u) ? null : (string) $u['name'],
            'nickname' => $u['nickname'] ?? null,
            'dept' => $u['dept'] ?? null,
            'done_at' => $done ? (string) $u['profile_at'] : null,
        ];
    }

    /** 세션 사용자가 아직 첫 화면 정보를 넣지 않았나 */
    public static function blocks(Actor $a): bool
    {
        return $a->user !== null && $a->via === 'session' && !TestLogin::isActor($a) && self::status($a->user)['required'];
    }

    /** 정보 입력 전에도 열려 있어야 하는 경로(내 정보·정보 저장·로그아웃·탈퇴) */
    public static function allowed(string $method, string $path): bool
    {
        return ($method === 'GET' && $path === '/me')
            || ($method === 'POST' && $path === '/me/profile')
            || ($method === 'DELETE' && $path === '/me')
            || ($method === 'POST' && ($path === '/auth/logout' || $path === '/auth/logout-all'));
    }

    /** 앞뒤 공백·제어 문자를 뺀 한 줄 */
    private static function clean(mixed $v): string
    {
        return trim((string) preg_replace('/[\x00-\x1F\x7F]+/u', ' ', (string) $v));
    }

    /**
     * 본인 정보 저장(본인만 — 세션 사용자 자신의 행만 바꾼다). 처음 입력이라 이름 변경 14일 제한(PATCH /me)은 걸지 않는다.
     * @param array<string, mixed> $in
     */
    public static function save(Actor $a, array $in): array
    {
        $u = Auth::requireUser($a);
        $name = self::clean($in['name'] ?? '');
        $len = mb_strlen($name);
        if ($len < self::NAME_MIN || $len > self::NAME_MAX) {
            throw HttpError::invalid('이름은 ' . self::NAME_MIN . '~' . self::NAME_MAX . '자로 적어 주세요.');
        }
        if ($name === self::PLACEHOLDER) {
            throw HttpError::invalid('실제 이름을 적어 주세요.');
        }
        $nick = self::clean($in['nickname'] ?? '');
        if (mb_strlen($nick) > self::NICK_MAX) {
            throw HttpError::invalid('닉네임은 ' . self::NICK_MAX . '자까지입니다.');
        }
        $dept = self::clean($in['dept'] ?? '');
        if (mb_strlen($dept) > self::DEPT_MAX) {
            throw HttpError::invalid('소속·부서는 ' . self::DEPT_MAX . '자까지입니다.');
        }
        $before = ['name' => $u['name'], 'nickname' => $u['nickname'] ?? null, 'dept' => $u['dept'] ?? null];
        $after = ['name' => $name, 'nickname' => $nick !== '' ? $nick : null, 'dept' => $dept !== '' ? $dept : null];
        Db::exec(
            'UPDATE core_users SET name = ?, nickname = ?, dept = ?, profile_at = NOW(3) WHERE id = ? AND deleted_at IS NULL',
            [$after['name'], $after['nickname'], $after['dept'], $u['id']]
        );
        Audit::log($a, 'user.profile', 'core_users:' . $u['id'], $before, $after);
        Auth::reset();
        return Auth::actor()->toArray();
    }
}

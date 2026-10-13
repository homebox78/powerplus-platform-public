<?php
declare(strict_types=1);

namespace Pp\Core;

/**
 * 쿠키 세션(pp_sid). PHP 세션에 user_id + session_epoch 를 두고, users.session_epoch 가 바뀌면 전체 로그아웃.
 * 출처: homebox-handoff api/src/Auth/Session.php (관리자 승격은 ADMIN_EMAILS 가 아니라 core_user_roles 로)
 */
final class Session
{
    private static bool $started = false;

    public static function start(): void
    {
        if (self::$started || PHP_SAPI === 'cli') {
            return;
        }
        $secure = (bool) Config::get('session.secure', !Config::debug());
        session_name((string) Config::get('session.name', 'pp_sid'));
        session_set_cookie_params([
            'lifetime' => 60 * 60 * 24 * 30,
            'path' => '/',
            'secure' => $secure,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_start();
        self::$started = true;
    }

    public static function userId(): ?int
    {
        self::start();
        $id = $_SESSION['user_id'] ?? null;
        return $id ? (int) $id : null;
    }

    public static function epoch(): int
    {
        self::start();
        return (int) ($_SESSION['epoch'] ?? 0);
    }

    public static function login(int $userId, int $epoch): void
    {
        self::start();
        session_regenerate_id(true);
        $_SESSION['user_id'] = $userId;
        $_SESSION['epoch'] = $epoch;
        $_SESSION['login_at'] = time();
    }

    public static function logout(): void
    {
        self::start();
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
        }
        session_destroy();
        self::$started = false;
    }

    /** OAuth state·OTP 흐름용 임시 값 */
    public static function put(string $k, mixed $v): void
    {
        self::start();
        $_SESSION['tmp'][$k] = $v;
    }

    public static function take(string $k): mixed
    {
        self::start();
        $v = $_SESSION['tmp'][$k] ?? null;
        unset($_SESSION['tmp'][$k]);
        return $v;
    }
}

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
        // 세션 데이터 = 전용 폴더 + 쿠키와 같은 30일(2026-10-18 사용자 "로그인이 자꾸 풀림").
        // 서버 기본은 /var/lib/php/sessions · gc_maxlifetime 1440초라, 30분마다 도는 phpsessionclean 이 24분 넘게 안 쓴 세션 파일을 지웠다
        // (쿠키는 30일인데 서버 세션이 없어져 로그아웃). sessionclean 은 php.ini 의 기본 경로만 지우므로 경로를 따로 두고, 정리는 PHP gc 가 30일 기준으로 한다.
        $life = 60 * 60 * 24 * 30;
        $dir = rtrim((string) Config::get('session.dir', rtrim((string) Config::get('storage.dir', ''), '/\\') . '/sessions'), '/\\');
        if ($dir !== '/sessions' && (is_dir($dir) || @mkdir($dir, 0770, true)) && is_writable($dir)) {
            session_save_path($dir);
            ini_set('session.gc_maxlifetime', (string) $life);
            ini_set('session.gc_probability', '1');
            ini_set('session.gc_divisor', '1000');
        } else {
            error_log("[pp-session] 세션 폴더({$dir})를 쓸 수 없어 서버 기본 경로를 쓴다 — 24분 쉬면 로그인이 풀린다");
        }
        session_name((string) Config::get('session.name', 'pp_sid'));
        session_set_cookie_params([
            'lifetime' => $life,
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

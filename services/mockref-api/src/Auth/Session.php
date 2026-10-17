<?php
declare(strict_types=1);

namespace Homebox\Auth;

use Config;
use Homebox\Db;

/**
 * PHP 세션 기반 로그인 (CLAUDE.md 스택: PHP 세션 + OAuth). 쿠키 이름·secure 는 config session.*
 * 세션에는 user_id 만 두고, 사용자 정보는 매 요청 DB 에서 읽는다(역할 변경 즉시 반영).
 */
final class Session
{
    private static bool $started = false;

    public static function start(): void
    {
        if (self::$started || session_status() === PHP_SESSION_ACTIVE) {
            self::$started = true;
            return;
        }
        $secure = (bool) Config::get('session.secure', false);
        session_name((string) Config::get('session.name', 'hb_sess'));
        session_set_cookie_params([
            'lifetime' => 60 * 60 * 24 * 30, // 30일
            'path' => '/', 'secure' => $secure, 'httponly' => true, 'samesite' => 'Lax',
        ]);
        session_start();
        self::$started = true;
    }

    public static function userId(): ?int
    {
        self::start();
        $id = $_SESSION['user_id'] ?? null;
        return is_int($id) && $id > 0 ? $id : null;
    }

    /** @return array<string, mixed>|null */
    public static function user(): ?array
    {
        $id = self::userId();
        if ($id === null) {
            return null;
        }
        $u = Db::row('SELECT id, email, name, avatar_url, role, prefs, name_changes, session_epoch, created_at, last_login_at FROM users WHERE id = ? AND deleted_at IS NULL', [$id]);
        // 모든 기기에서 로그아웃: 세션에 기록된 epoch 가 현재 값과 다르면 무효 (2026-09-24)
        if ($u === null || (int) ($_SESSION['epoch'] ?? 0) !== (int) $u['session_epoch']) {
            self::logout();
            return null;
        }
        $u['id'] = (int) $u['id'];
        $u['name_changes'] = is_string($u['name_changes']) ? (json_decode($u['name_changes'], true) ?: []) : [];
        $u['prefs'] = is_string($u['prefs']) ? (json_decode($u['prefs'], true) ?: []) : [];
        unset($u['session_epoch']);
        return $u;
    }

    public static function login(int $userId): void
    {
        self::start();
        session_regenerate_id(true);
        $_SESSION['user_id'] = $userId;
        $_SESSION['epoch'] = (int) (Db::row('SELECT session_epoch FROM users WHERE id = ?', [$userId])['session_epoch'] ?? 0);
        Db::exec('UPDATE users SET last_login_at = NOW(3) WHERE id = ?', [$userId]);
        // 관리자 이메일은 config admin.emails 에만 둔다(코드에 적지 않는다 — 공개 저장소). users 는 배포 덤프 제외라 로그인마다 맞춘다.
        // 이메일은 구글·이메일 코드 로그인 모두 소유 확인을 거친 값이다.
        $email = strtolower((string) (Db::row('SELECT email FROM users WHERE id = ?', [$userId])['email'] ?? ''));
        $admins = array_map('strtolower', (array) \Config::get('admin.emails', []));
        // 구글 계정이 연결된 사용자만 승격한다(보안 점검 2026-10-05) — 예전에 검증 없이 저장된 이메일로는 못 오르게.
        $hasGoogle = Db::row("SELECT 1 AS ok FROM oauth_accounts WHERE user_id = ? AND provider = 'google'", [$userId]) !== null;
        if ($email !== '' && $hasGoogle && in_array($email, $admins, true)) {
            Db::exec("UPDATE users SET role = 'admin' WHERE id = ? AND role <> 'admin'", [$userId]);
        }
    }

    private const ADMIN_EMAILS = ['admin@example.com'];

    public static function logout(): void
    {
        self::start();
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', ['expires' => time() - 42000, 'path' => $p['path'], 'secure' => $p['secure'], 'httponly' => $p['httponly'], 'samesite' => $p['samesite']]);
        }
        session_destroy();
        self::$started = false;
    }

    /** OAuth state 같은 1회성 값 */
    public static function set(string $key, mixed $value): void
    {
        self::start();
        $_SESSION[$key] = $value;
    }

    public static function pull(string $key): mixed
    {
        self::start();
        $v = $_SESSION[$key] ?? null;
        unset($_SESSION[$key]);
        return $v;
    }
}

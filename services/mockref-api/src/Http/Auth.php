<?php
declare(strict_types=1);

namespace Homebox\Http;

use Config;

/**
 * 인증 — Phase 2 임시: 관리자 API 는 `X-Admin-Token` 헤더 = config admin.token (Phase 4 에서 세션·역할로 교체).
 */
final class Auth
{
    public static function requireAdmin(): void
    {
        // 세션 role=admin 이면 통과(웹 관리자 화면, 2026-09-24). 토큰은 워커·스크립트용으로 유지
        $u = \Homebox\Auth\Session::user();
        if ($u !== null && ($u['role'] ?? '') === 'admin') {
            return;
        }
        $expected = (string) Config::get('admin.token', '');
        $given = (string) ($_SERVER['HTTP_X_ADMIN_TOKEN'] ?? '');
        if ($expected === '' || $given === '' || !hash_equals($expected, $given)) {
            Response::error(401, 'UNAUTHORIZED', '관리자 인증이 필요합니다.');
        }
    }
}

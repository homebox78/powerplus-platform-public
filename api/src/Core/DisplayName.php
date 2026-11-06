<?php
declare(strict_types=1);

namespace Pp\Core;

/**
 * 관리자 화면에 보일 회원 이름 — 가입 때 이름이 없으면 '사용자'(Users::findOrCreateByLogin 기본값)가 들어가
 * 관리자 표에서 누군지 구분이 안 됐다(팀장 2026-10-28). 이름이 비었거나 기본값이면 이메일로 보인다.
 * 저장된 이름(core_users.name)은 바꾸지 않는다 — 응답의 표시 값만.
 */
final class DisplayName
{
    /** 가입 때 이름이 없어 들어간 기본값들 */
    private const PLACEHOLDERS = ['사용자', 'user', 'User', '이름 없음'];

    /**
     * @param string|null $name  core_users.name
     * @param string|null $email 회원 이메일
     * @param bool $short true 면 이메일 대신 @ 앞부분만(이메일 칸을 가려 보내는 표 — 대시보드 분석)
     * @return string|null 이름 · 이메일 · 둘 다 없으면 null
     */
    public static function of(?string $name, ?string $email, bool $short = false): ?string
    {
        $n = trim((string) $name);
        if ($n !== '' && !in_array($n, self::PLACEHOLDERS, true)) {
            return $n;
        }
        $e = trim((string) $email);
        if ($e === '') {
            return $n !== '' ? $n : null;
        }
        if ($short) {
            $at = strpos($e, '@');
            return $at === false ? $e : substr($e, 0, $at);
        }
        return $e;
    }
}

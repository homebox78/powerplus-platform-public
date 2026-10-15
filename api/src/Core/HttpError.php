<?php
declare(strict_types=1);

namespace Pp\Core;

/** 라우트 안에서 던지면 index.php 가 {error,code,hint} 로 바꿔 준다. */
final class HttpError extends \RuntimeException
{
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly int $status = 400,
        public readonly ?string $hint = null,
    ) {
        parent::__construct($message);
    }

    public static function notFound(string $what = '대상'): self
    {
        return new self('NOT_FOUND', $what . self::eulReul($what) . ' 찾을 수 없습니다.', 404);
    }

    /** 끝 글자 받침으로 조사 고르기 — "에셋을"·"파일을"·"대상을"·"자료를". 한글이 아니면 "을(를)". */
    private static function eulReul(string $w): string
    {
        $last = mb_substr(rtrim($w), -1);
        $code = $last === '' ? 0 : mb_ord($last, 'UTF-8');
        if ($code < 0xAC00 || $code > 0xD7A3) {
            return '을(를)';
        }
        return (($code - 0xAC00) % 28) === 0 ? '를' : '을';
    }

    public static function forbidden(?string $hint = null): self
    {
        return new self('FORBIDDEN', '권한이 없습니다.', 403, $hint);
    }

    /**
     * 키 범위(scope) 밖 — "권한이 없습니다"·"키가 유효하지 않음"과 코드를 따로 둔다.
     * 섞이면 사용자가 키를 재발급하러 간다(2026-10-09 시험, MCK-002·O-01·O-10).
     */
    public static function forbiddenScope(string $scope): self
    {
        return new self('FORBIDDEN_SCOPE', "이 키는 {$scope} 범위가 없습니다.", 403, '마이페이지 → API·MCP 키에서 범위를 확인하세요.');
    }

    public static function unauthorized(?string $hint = null): self
    {
        return new self('UNAUTHORIZED', '로그인이 필요합니다.', 401, $hint);
    }

    public static function invalid(string $message, ?string $hint = null): self
    {
        return new self('INVALID', $message, 400, $hint);
    }

    public static function paymentRequired(?string $hint = null): self
    {
        return new self('UPGRADE_REQUIRED', '이 자료는 현재 플랜에서 볼 수 없습니다.', 402, $hint);
    }

    public static function tooMany(string $message = '요청이 너무 잦습니다.', ?string $hint = null): self
    {
        return new self('RATE_LIMITED', $message, 429, $hint);
    }
}

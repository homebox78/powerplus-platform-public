<?php
declare(strict_types=1);

namespace Pp\Core;

/** 외부 노출 식별자(public_id CHAR(16))·API 키·토큰 생성. 숫자 PK 는 URL·MCP 에 노출하지 않는다(db-design 명명 규칙). */
final class Ids
{
    private const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'; // 혼동 글자(l·o·0·1) 제외

    public static function publicId(int $len = 16): string
    {
        $out = '';
        $max = strlen(self::ALPHABET) - 1;
        for ($i = 0; $i < $len; $i++) {
            $out .= self::ALPHABET[random_int(0, $max)];
        }
        return $out;
    }

    /** API 키 원문 pp_live_<40hex>. 저장은 sha256 만, 원문은 KeyVault 로 암호화해 다시 보기. */
    public static function apiKey(string $kind = 'live'): string
    {
        return "pp_{$kind}_" . bin2hex(random_bytes(20));
    }

    public static function token(int $bytes = 32): string
    {
        return rtrim(strtr(base64_encode(random_bytes($bytes)), '+/', '-_'), '=');
    }

    public static function otp(): string
    {
        return str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    }
}

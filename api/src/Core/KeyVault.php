<?php
declare(strict_types=1);

namespace Pp\Core;

/**
 * 비밀값 대칭 암호화(AES-256-GCM). API 키 원문 다시 보기·설정 시크릿 저장용.
 * 출처: homebox-handoff api/src/KeyVault.php (키 파생 접두만 변경)
 */
final class KeyVault
{
    private static function key(string $purpose): string
    {
        $secret = (string) Config::get('app.secret');
        if (strlen($secret) < 16) {
            throw new \RuntimeException('app.secret 이 너무 짧습니다.');
        }
        return hash('sha256', "pp-vault|{$purpose}|{$secret}", true);
    }

    /** base64(iv12 | tag16 | ciphertext) */
    public static function seal(string $plain, string $purpose = 'api-key'): string
    {
        $iv = random_bytes(12);
        $tag = '';
        $ct = openssl_encrypt($plain, 'aes-256-gcm', self::key($purpose), OPENSSL_RAW_DATA, $iv, $tag, '', 16);
        if ($ct === false) {
            throw new \RuntimeException('암호화 실패');
        }
        return base64_encode($iv . $tag . $ct);
    }

    public static function open(string $sealed, string $purpose = 'api-key'): ?string
    {
        $raw = base64_decode($sealed, true);
        if ($raw === false || strlen($raw) < 29) {
            return null;
        }
        $iv = substr($raw, 0, 12);
        $tag = substr($raw, 12, 16);
        $ct = substr($raw, 28);
        $p = openssl_decrypt($ct, 'aes-256-gcm', self::key($purpose), OPENSSL_RAW_DATA, $iv, $tag);
        return $p === false ? null : $p;
    }
}

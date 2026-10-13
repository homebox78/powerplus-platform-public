<?php
declare(strict_types=1);

namespace Homebox;

/**
 * MCP 키 다시 보기용 암호화 (2026-09-24, 사용자 "테스트에 쓰게 키가 보이게").
 * 검증은 여전히 sha256 해시로만 한다 — 이 사본은 소유자에게 다시 보여 주는 용도뿐.
 * 키 = sha256(app.secret) · AES-256-GCM · 저장 형식 base64(iv12 | tag16 | ciphertext)
 */
final class KeyVault
{
    private static function k(): string
    {
        $secret = (string) \Config::get('app.secret', '');
        if ($secret === '') {
            throw new \RuntimeException('config app.secret 이 비어 있습니다.');
        }
        return hash('sha256', 'api-key-vault|' . $secret, true);
    }

    public static function seal(string $plain): string
    {
        $iv = random_bytes(12);
        $tag = '';
        $ct = openssl_encrypt($plain, 'aes-256-gcm', self::k(), OPENSSL_RAW_DATA, $iv, $tag);
        if ($ct === false) {
            throw new \RuntimeException('키 암호화 실패');
        }
        return base64_encode($iv . $tag . $ct);
    }

    public static function open(?string $sealed): ?string
    {
        if ($sealed === null || $sealed === '') {
            return null;
        }
        $raw = base64_decode($sealed, true);
        if ($raw === false || strlen($raw) < 29) {
            return null;
        }
        $plain = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', self::k(), OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
        return $plain === false ? null : $plain;
    }
}

<?php
declare(strict_types=1);

namespace Homebox;

use Config;

/**
 * 서명 URL (docs/08 "서명 URL 규칙"): 공개본·썸네일·크롭은 10분 만료 HMAC 서명으로만 노출. 원본(private)은 절대 서명하지 않는다.
 * 로컬 storage/ 는 PHP 가 스트리밍(GET /api/files/{id}), S3/NCP 로 옮기면 presign 으로 교체.
 */
final class Signer
{
    public static function url(int $assetId, ?int $ttl = null): string
    {
        $exp = time() + ($ttl ?? (int) Config::get('s3.ttl', 600));
        $sig = self::sign($assetId, $exp);
        $base = rtrim((string) Config::get('app.base', '/'), '/');
        return "$base/api/files/$assetId?exp=$exp&sig=$sig";
    }

    public static function verify(int $assetId, int $exp, string $sig): bool
    {
        return $exp >= time() && hash_equals(self::sign($assetId, $exp), $sig);
    }

    private static function sign(int $assetId, int $exp): string
    {
        $secret = (string) Config::get('app.secret', '');
        if ($secret === '') {
            throw new \RuntimeException('config app.secret 이 비어 있습니다.');
        }
        return substr(hash_hmac('sha256', "$assetId:$exp", $secret), 0, 32);
    }
}

<?php
declare(strict_types=1);

namespace Homebox\Http;

/** JSON 응답 — docs/08 공통: 오류는 {error:{code,message,details?}} */
final class Response
{
    /** @param array<string, mixed>|list<mixed> $body */
    public static function json(array $body, int $status = 200, array $headers = []): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        foreach ($headers as $k => $v) {
            header("$k: $v");
        }
        echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    /** @param array<string, mixed>|null $details */
    public static function error(int $status, string $code, string $message, ?array $details = null): never
    {
        $err = ['code' => $code, 'message' => $message];
        if ($details !== null) {
            $err['details'] = $details;
        }
        self::json(['error' => $err], $status);
    }
}

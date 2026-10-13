<?php
declare(strict_types=1);

namespace Pp\Core;

/**
 * 응답 규약(설계서 §2.2): 성공 {data, total?, page?, limit?, meta?} / 실패 {error, code, hint?}.
 * 출처: homebox-handoff api/src/Http/Response.php (규약만 변경)
 */
final class Response
{
    public static function json(mixed $data, int $status = 200, array $extra = [], bool $cache = false): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header($cache ? 'Cache-Control: public, max-age=60' : 'Cache-Control: no-store');
        echo json_encode(['data' => $data] + $extra, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function list(array $rows, int $total, int $page, int $limit, array $meta = []): never
    {
        $extra = ['total' => $total, 'page' => $page, 'limit' => $limit];
        if ($meta) {
            $extra['meta'] = $meta;
        }
        self::json($rows, 200, $extra);
    }

    public static function error(string $code, string $message, int $status = 400, ?string $hint = null): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        if ($status === 401) {
            header('WWW-Authenticate: Bearer realm="powerPlus"');
        }
        $body = ['error' => $message, 'code' => $code];
        if ($hint !== null) {
            $body['hint'] = $hint;
        }
        echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function noContent(): never
    {
        http_response_code(204);
        exit;
    }

    /** 요청 JSON 본문. 비어 있으면 []. */
    public static function input(): array
    {
        static $cached = null;
        if ($cached !== null) {
            return $cached;
        }
        $raw = file_get_contents('php://input') ?: '';
        $j = $raw === '' ? [] : json_decode($raw, true);
        if (!is_array($j)) {
            if ($raw !== '') {
                throw HttpError::invalid('JSON 본문을 읽을 수 없습니다.');
            }
            $j = [];
        }
        return $cached = $j;
    }

    /** 페이지 파라미터 정규화(page 1~, limit 1~maxLimit). */
    public static function paging(int $defaultLimit = 50, int $maxLimit = 200): array
    {
        $page = max(1, (int) ($_GET['page'] ?? 1));
        $limit = min($maxLimit, max(1, (int) ($_GET['limit'] ?? $defaultLimit)));
        return [$page, $limit, ($page - 1) * $limit];
    }
}

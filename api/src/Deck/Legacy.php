<?php
declare(strict_types=1);

namespace Pp\Deck;

use Pp\Core\Config;
use Pp\Core\HttpError;
use Pp\Core\Response;

/**
 * 출처: powerDeck api/src/Db.php 의 전역 함수(fail·json_out·body) + Config(get·bool·list·dataDir) 를 플랫폼 Core 위에 얹은 어댑터.
 * 이식한 Deck 클래스들이 옛 호출 형태를 그대로 쓰게 해 로직 diff 를 최소화한다.
 *  - fail($msg,$status) → HttpError throw(상태별 code). index.php 가 {error,code,hint} 로 바꾼다.
 *  - cfg('key') → Config::get('deck.key'); 데이터 폴더 = storage.dir/deck
 *  - jsonOut → Response::json(옛 응답이 ['data'=>X] 한 키뿐이면 X 를 넘겨 이중 봉투를 막는다)
 */
final class Legacy
{
    private const CODES = [400 => 'INVALID', 401 => 'UNAUTHORIZED', 402 => 'UPGRADE_REQUIRED', 403 => 'FORBIDDEN', 404 => 'NOT_FOUND',
        409 => 'CONFLICT', 413 => 'TOO_LARGE', 429 => 'RATE_LIMITED', 500 => 'INTERNAL', 501 => 'NOT_IMPLEMENTED', 502 => 'UPSTREAM', 503 => 'UNAVAILABLE'];

    public static function fail(string $msg, int $status = 400): never
    {
        throw new HttpError(self::CODES[$status] ?? 'ERROR', $msg, $status);
    }

    public static function jsonOut(mixed $payload, int $status = 200): never
    {
        // 엔진(worker.py)은 옛 응답 모양 그대로 읽는다 — 봉투를 씌우거나 data 를 벗기면 안 된다.
        // 씌우면 r.get("job") 이 비어 서버는 '진행 중', 엔진은 빈손(2026-10-07 '기획하고 시안을 만드는 중' 멈춤),
        // 벗기면 docs 목록이 배열로 와 .get("data") 에서 죽는다.
        if (isset($_SERVER['HTTP_X_WORKER'])) {
            http_response_code($status);
            header('Content-Type: application/json; charset=utf-8');
            header('Cache-Control: no-store');
            echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            exit;
        }
        if (is_array($payload) && count($payload) === 1 && array_key_exists('data', $payload)) {
            $payload = $payload['data'];
        }
        Response::json($payload, $status);
    }

    /** 옛 body(): JSON 이 아니어도 [] */
    public static function body(): array
    {
        try {
            return Response::input();
        } catch (HttpError) {
            return [];
        }
    }

    /** 옛 Config::get('key') — 플랫폼 config 의 deck.<key>. 환경변수(DECK_<KEY>)가 있으면 우선. */
    public static function cfg(string $key, mixed $default = null): mixed
    {
        return Config::get('deck.' . $key, $default);
    }

    public static function cfgBool(string $key, bool $default = false): bool
    {
        $v = self::cfg($key, $default);
        return $v === true || $v === 1 || $v === '1' || $v === 'true';
    }


    /** 업로드·결과 파일 폴더(웹루트 밖): storage.dir/deck */
    public static function dataDir(): string
    {
        $d = rtrim((string) Config::get('storage.dir', __DIR__ . '/../../../storage'), '/\\') . '/deck';
        if (!is_dir($d)) @mkdir($d, 0775, true);
        return $d;
    }
}

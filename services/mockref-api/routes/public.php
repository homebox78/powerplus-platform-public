<?php
declare(strict_types=1);

/**
 * 공개 라우트 (docs/08 "공개"). Phase 0: health + taxonomy. 나머지는 Phase 3~.
 * @var Homebox\Http\Router $router
 */

use Homebox\Db;
use Homebox\Http\Response;

// 라이브 검증은 health만으로 부족 — DB를 실제로 치는 엔드포인트를 반드시 같이 확인 (MISTAKES 2026-07-07)
$router->get('/api/health', static function (): void {
    $db = false;
    try {
        $db = Db::row('SELECT 1 AS ok') !== null;
    } catch (Throwable) {
        $db = false;
    }
    Response::json(['ok' => true, 'db' => $db, 'time' => date('c')]);
});

// taxonomy.json 그대로 (ETag 캐시) — packages/shared/taxonomy.json이 단일 진실
$router->get('/api/taxonomy', static function (): void {
    $file = \Homebox\Assembly::taxonomyPath();
    if ($file === null) {
        Response::error(500, 'TAXONOMY_MISSING', 'taxonomy.json 을 찾을 수 없습니다.');
    }
    $body = (string) file_get_contents($file);
    $etag = '"' . md5($body) . '"';
    if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) {
        http_response_code(304);
        exit;
    }
    http_response_code(200);
    header('Content-Type: application/json; charset=utf-8');
    header('ETag: ' . $etag);
    header('Cache-Control: public, max-age=3600');
    echo $body;
    exit;
});

// DB 연결 검증용 (Phase 1 시드 후 55여야 함 — docs/10 Phase 1 AC)
$router->get('/api/krds/components', static function (): void {
    $rows = Db::rows('SELECT id, category, name_ko, name_en, guide_url FROM krds_components ORDER BY sort, id');
    Response::json(['total' => count($rows), 'items' => $rows]);
});

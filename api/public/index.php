<?php
/**
 * powerPlus 플랫폼 REST v1 프론트 컨트롤러.
 * 출처: homebox-handoff api/public/index.php (라우트 등록·CSRF 차단·예외 처리 구조 이식, 응답 규약은 §2.2 로 변경)
 *
 * 모든 요청은 /api/v1/<모듈>/… 로 들어와 Router 가 모듈 라우트 파일로 분기한다.
 * 인증 미들웨어(Core\Auth::actor)는 세션 쿠키·Bearer 키·워커 키를 Actor 하나로 통일한다.
 */
declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);

require __DIR__ . '/../src/bootstrap.php';

use Pp\Core\Response;
use Pp\Core\Router;

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = Router::path();

// 상태 변경 요청은 브라우저 폼·단순 요청으로는 못 들어온다(CSRF).
if (in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true) && !str_starts_with($path, '/billing/webhook')) {
    $ct = $_SERVER['CONTENT_TYPE'] ?? '';
    $ok = isset($_SERVER['HTTP_X_REQUESTED_WITH'])
        || str_starts_with(strtolower($ct), 'application/json')
        || isset($_SERVER['HTTP_AUTHORIZATION'])
        || isset($_SERVER['HTTP_X_WORKER']);
    if (!$ok) {
        Response::error('CSRF_BLOCKED', '요청 헤더가 필요합니다.', 403, 'X-Requested-With 또는 JSON 본문으로 보내세요.');
    }
    // 2026-10-07 강화: 쿠키 세션으로 오는 요청은 출처가 이 사이트여야 한다(키·엔진 요청은 쿠키를 안 쓰므로 제외).
    // Origin 이 있으면 호스트가 같아야 하고, 브라우저가 cross-site 라고 표시한 요청은 막는다.
    if (!isset($_SERVER['HTTP_AUTHORIZATION']) && !isset($_SERVER['HTTP_X_WORKER'])) {
        $host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
        $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
        $originHost = $origin !== '' && $origin !== 'null' ? strtolower((string) parse_url($origin, PHP_URL_HOST) . (parse_url($origin, PHP_URL_PORT) ? ':' . parse_url($origin, PHP_URL_PORT) : '')) : '';
        $sameOrigin = $originHost === '' || $originHost === $host
            || ((bool) preg_match('/^(localhost|127\.0\.0\.1)(:\d+)?$/', $originHost) && (bool) preg_match('/^(localhost|127\.0\.0\.1)(:\d+)?$/', $host));
        $fetchSite = strtolower((string) ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? ''));
        if (!$sameOrigin || $fetchSite === 'cross-site' || $origin === 'null') {
            Response::error('CSRF_BLOCKED', '다른 사이트에서 보낸 요청은 받지 않습니다.', 403);
        }
    }
}

$router = new Router();
foreach (['core', 'assets', 'deck', 'deck_kit', 'mock', 'mock_wire', 'guide', 'comm', 'info', 'saved', 'search', 'assist', 'addin', 'billing', 'admin', 'admin2', 'admin3', 'admin_bulk', 'admin_bulk2', 'admin_ai', 'admin_guide', 'me_bulk', 'admin_system', 'deck_checklist', 'site_checklist', 'policy', 'reports', 'chat'] as $mod) {
    $file = __DIR__ . "/../routes/{$mod}.php";
    if (is_file($file)) {
        (require $file)($router);
    }
}

try {
    $router->dispatch($method, $path);
} catch (\Pp\Core\HttpError $e) {
    Response::error($e->errorCode, $e->getMessage(), $e->status, $e->hint);
} catch (\Throwable $e) {
    error_log('[pp] ' . get_class($e) . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    Response::error('INTERNAL', '서버 오류가 발생했습니다.', 500);
}

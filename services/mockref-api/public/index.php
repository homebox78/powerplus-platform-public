<?php
/**
 * 홈박스 REST API 진입점 (docs/08). 프레임워크 없이 PDO — CLAUDE.md 개발 원칙 5.
 * 로컬: php -S localhost:8080 -t api/public  /  운영: Apache /homebox/api/ (.htaccess가 여기로 재작성)
 */
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

use Homebox\Http\Router;
use Homebox\Http\Response;

$router = new Router();
require __DIR__ . '/../routes/public.php';
require __DIR__ . '/../routes/sites.php';
require __DIR__ . '/../routes/screens.php';
require __DIR__ . '/../routes/sections.php';
require __DIR__ . '/../routes/components.php';
require __DIR__ . '/../routes/flows.php';
require __DIR__ . '/../routes/explore.php'; // 전역 섹션·컴포넌트·업무흐름 ($RULES 재사용이라 flows.php 뒤)
require __DIR__ . '/../routes/search.php';
require __DIR__ . '/../routes/collections.php';
require __DIR__ . '/../routes/ratings.php';
require __DIR__ . '/../routes/community.php'; // 커뮤니티·알림 (2026-09-26)
require __DIR__ . '/../routes/requests.php';
require __DIR__ . '/../routes/removal.php';
require __DIR__ . '/../routes/facets.php';
require __DIR__ . '/../routes/insights.php'; // 합성(brief·section·references) — MCP 차별화 (2026-09-23)
require __DIR__ . '/../routes/preferences.php'; // 디자이너 선호 규칙 (2026-10-03)
require __DIR__ . '/../routes/assembly.php'; // 디자인 조립 docs/11 (2026-09-29)
require __DIR__ . '/../routes/replica.php'; // 재현 묶음·동작 스크립트 (2026-09-30)
require __DIR__ . '/../routes/auth.php';
require __DIR__ . '/../routes/api-keys.php';
require __DIR__ . '/../routes/billing.php';
require __DIR__ . '/../routes/files.php';
require __DIR__ . '/../routes/samples.php'; // 샘플 이미지 라이브러리 (2026-09-25)
require __DIR__ . '/../routes/showcase.php'; // 민간 레퍼런스 코너 (2026-10-03)
require __DIR__ . '/../routes/gallery.php'; // 시안 갤러리·포인트 (2026-10-03)
require __DIR__ . '/../routes/mockup-pages.php'; // 시안 미리보기 주소 (2026-10-01)
require __DIR__ . '/../routes/works.php'; // 작업물 보관함(관리자, 2026-10-02)
require __DIR__ . '/../routes/checklist.php'; // 디자인 개선 체크리스트(관리자, 2026-10-03)
require __DIR__ . '/../routes/admin.php';

ini_set('display_errors', '0'); // 운영 php.ini 에 기대지 않는다 (보안 점검 2026-10-05)

// 상태를 바꾸는 요청은 다른 사이트의 '단순 요청'(폼 전송·text/plain)으로 못 보내게 한다 (보안 점검 2026-10-05).
// JSON 본문·X-Requested-With·키 헤더는 브라우저가 사전 요청을 거쳐야 하므로 다른 출처에서는 못 붙인다.
$method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
if (in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
    $ctype = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
    $ok = isset($_SERVER['HTTP_X_REQUESTED_WITH'])
        || str_starts_with($ctype, 'application/json')
        || isset($_SERVER['HTTP_AUTHORIZATION']) || isset($_SERVER['HTTP_X_HOMEBOX_KEY']) || isset($_SERVER['HTTP_X_ADMIN_TOKEN'])
        || Router::path() === '/api/billing/webhook';
    if (!$ok) {
        Response::error(403, 'CSRF_BLOCKED', '이 요청은 홈박스 화면이나 API 키로만 보낼 수 있습니다.');
    }
}

// 레퍼런스 데이터는 powerMCP 키·관리자만 (보안 점검 2026-10-17) — GET /api/sites 가 로그인 없이 기관 1,071곳 목록을 돌려줬다.
// 10-06 '수집 화면은 관리자 전용'·10-16 '회원 전용' 결정을 이 주소로 우회할 수 있었다.
// 열어 두는 것: 상태(/api/health)·결제 웹훅·공유 시안 미리보기(/api/p)와 그 안의 그림(/api/files·/api/samples/file)·내부 호출(/api/internal — 각자 requireAdmin).
$path = Router::path();
$open = in_array($path, ['/api/health', '/api/billing/webhook'], true)
    || preg_match('#^/api/(p|files|samples/file|internal)/#', $path) === 1;
if (!$open && $method !== 'OPTIONS') {
    $plan = \Homebox\Plan::current();
    if (empty($plan['via_key']) && empty($plan['admin'])) {
        if (isset($_SERVER['HTTP_X_ADMIN_TOKEN'])) {
            \Homebox\Http\Auth::requireAdmin();   // 워커·스크립트 토큰 — 틀리면 401 로 끝난다
        } else {
            Response::error(401, 'KEY_REQUIRED', '레퍼런스 데이터는 powerMCP 키로만 볼 수 있습니다. ' . preg_replace('#^https?://|/mockref/?$#', '', (string) \Config::get('app.public_base', 'https://powerplus.hom2box.com/mockref')) . '/powermcp 에서 키를 받으세요.');   // 주소는 배포 서버를 따른다(2026-10-19 회사 서버 이관)
        }
    }
}

try {
    $router->dispatch($_SERVER['REQUEST_METHOD'], Router::path());
} catch (Throwable $e) {
    error_log('[homebox-api] ' . $e->getMessage());
    Response::error(500, 'INTERNAL', Config::get('app.debug') ? $e->getMessage() : '서버 오류가 발생했습니다.');
}

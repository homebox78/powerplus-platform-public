<?php
/**
 * 화면(SPA) 주소 응답 — 루트 .htaccess 가 파일·폴더가 아닌 주소와 '/'·robots.txt·sitemap.xml 을 여기로 보낸다(2026-10-17).
 *  - routes.ts 에 있는 주소: index.html 껍데기 200 + 공개 화면이면 제목·설명·공유 미리보기(og) 주입
 *  - 없는 주소: 같은 껍데기를 404 로(화면은 그대로 404 화면을 그린다 — 검색엔진만 상태 코드로 안다)
 *  - 확장자가 붙은 없는 파일(/_app/x.js·/img/x.png): 짧은 글 404 — HTML 을 스크립트로 읽어 화면이 깨지지 않게
 *  - robots.txt·sitemap.xml: 공개 화면 목록(Core\SpaRoutes::PUBLIC) 하나로 만든다
 * DB 를 쓰지 않는다(설정 app.url 만 읽는다).
 */
declare(strict_types=1);

ini_set('display_errors', '0');

require __DIR__ . '/../src/bootstrap.php';

use Pp\Core\Config;
use Pp\Core\SpaRoutes;

$uri = (string) ($_SERVER['REQUEST_URI'] ?? '/');
$path = SpaRoutes::normalize($uri);
$host = (string) ($_SERVER['HTTP_HOST'] ?? '');
// 주소 머리는 설정 app.url(운영 도메인) — Host 머리는 위조될 수 있어 설정이 비었을 때만 쓴다
$siteUrl = (string) Config::get('app.url', '');
if ($siteUrl === '') {
    $siteUrl = ((($_SERVER['HTTPS'] ?? '') === 'on') ? 'https://' : 'http://') . ($host !== '' ? $host : 'localhost');
}
header('X-Content-Type-Options: nosniff');

if ($path === 'robots.txt' || $path === 'sitemap.xml') {
    header($path === 'robots.txt' ? 'Content-Type: text/plain; charset=utf-8' : 'Content-Type: application/xml; charset=utf-8');
    header('Cache-Control: public, max-age=3600');
    echo $path === 'robots.txt' ? SpaRoutes::robots($siteUrl) : SpaRoutes::sitemap($siteUrl);
    exit;
}

$known = SpaRoutes::known($path);
if (!$known && preg_match('#\.[A-Za-z0-9]{1,8}$#', $path)) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-cache');
    echo "Not Found\n";
    exit;
}

$shell = @file_get_contents(dirname(__DIR__, 2) . '/index.html');
if ($shell === false) {
    http_response_code(503);
    header('Content-Type: text/plain; charset=utf-8');
    echo "index.html 이 없습니다(웹 빌드 전)\n";
    exit;
}
http_response_code($known ? 200 : 404);
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache');
echo SpaRoutes::render($shell, $path, !$known, $siteUrl);

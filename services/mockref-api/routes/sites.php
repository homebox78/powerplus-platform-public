<?php
declare(strict_types=1);

/**
 * 기관 사이트 (docs/08 공개): GET /api/sites, GET /api/sites/{slug}
 * @var Homebox\Http\Router $router
 */

use Homebox\Http\Response;
use Homebox\Plan;
use Homebox\Repo\Sites;

$router->get('/api/sites', static function (): void {
    $sort = (string) ($_GET['sort'] ?? 'renewed');
    if (!in_array($sort, ['renewed', 'newest', 'rating', 'views', 'krds'], true)) {
        Response::error(422, 'INVALID_SORT', 'sort 는 renewed|newest|rating|views|krds 중 하나입니다.', ['allowed' => ['renewed', 'newest', 'rating', 'views', 'krds']]);
    }
    $res = Sites::search($_GET);
    $res['attribution'] = '출처는 각 항목의 url 참조. 홈박스는 저작권을 주장하지 않으며 참고용입니다.';
    Response::json($res, 200, ['Cache-Control' => 'public, max-age=60']);
});

$router->get('/api/sites/{slug}', static function (array $p): void {
    $slug = (string) $p['slug'];
    if (preg_match('/^[a-z0-9-]{1,100}$/', $slug) !== 1) {
        Response::error(404, 'NOT_FOUND', '사이트를 찾을 수 없습니다.');
    }
    $site = Sites::bySlug($slug);
    if ($site === null) {
        Response::error(404, 'NOT_FOUND', '사이트를 찾을 수 없습니다.');
    }
    if ($site['status'] === 'removed') {
        // docs/02 §4: 권리자 요청으로 삭제된 항목은 410 (사유는 노출하지 않음)
        Response::error(410, 'REMOVED', '권리자 요청으로 삭제된 항목입니다.');
    }
    unset($site['status']);
    // 플랜 게이트 (Mobbin 방식, 2026-09-24): Free 는 기기별 앞 N장만 열람, 나머지는 locked(썸네일은 흐림 처리용으로 유지, 원본 URL 제거). 디자인 데이터 summary 면 스케일·색·간격 숨김.
    $plan = Plan::current();
    $allowed = Plan::allowedScreens((int) $site['site']['site_id'], $plan);
    foreach ($site['pages'] as &$pg) {
        $pg['locked'] = !Plan::canSee($allowed, (int) $pg['screen_id']);
        if ($pg['locked']) { $pg['public_url'] = null; $pg['card_url'] = null; }
    }
    unset($pg);
    if (($plan['limits']['design_data'] ?? 'summary') === 'summary' && is_array($site['design']['typography'] ?? null)) {
        $t = $site['design']['typography'];
        $filled = [];
        foreach (($t['scale'] ?? []) as $role => $v) { if (!empty($v['size'])) { $filled[] = (string) $role; } }
        $colors = is_array($site['design']['colors'] ?? null) ? count(array_filter($site['design']['colors'])) : 0;
        $sp = $site['design']['spacing'] ?? null;
        // 종합평가(레이더)는 값 대신 "채워진 역할 수"만으로 같은 점수를 내게 — 실제 수치는 Pro
        $site['design']['typography'] = ['summary' => true, 'families' => $t['families'] ?? [], 'weights' => $t['weights'] ?? [], 'scale' => null, 'sizes' => null,
            'filled_roles' => $filled, 'colors_n' => $colors, 'has_spacing' => is_array($sp) && (($sp['section_gap_px'] ?? null) !== null || ($sp['gutter_px'] ?? null) !== null)];
        $site['design']['colors'] = null;
        $site['design']['spacing'] = null;
    }
    // 사업정보(나라장터 입찰·수행사·제작일시)는 Pro 부터 공개 (사용자 지시 2026-09-24). Free 는 건수만 남기고 내용 제거
    $businessOpen = (($plan['limits']['design_data'] ?? 'summary') === 'full') || !empty($plan['admin']);
    $site['business'] = ['open' => $businessOpen, 'projects_n' => count($site['projects']), 'has_vendor' => $site['site']['vendor'] !== null];
    if (!$businessOpen) {
        $site['projects'] = [];
        $site['built_at'] = null;
        $site['site']['vendor'] = null; $site['site']['vendor_slug'] = null; $site['site']['vendor_source'] = null;
    }
    $site['gate'] = Plan::info($plan, $allowed, count($site['pages']), (int) $site['site']['site_id']);
    Response::json($site, 200, ['Cache-Control' => $plan['logged_in'] ? 'private, no-store' : 'public, max-age=60']);
});

/**
 * 기관별 디자인 시스템 (Pro, 2026-09-24): KRDS 스타일 가이드 분류로 정리한 한 장 문서 + 토큰 내보내기.
 *   GET /api/sites/{slug}/design-system            → JSON 문서 (hb-ds/1)
 *   GET /api/sites/{slug}/design-system?format=css|tailwind|tokens → 붙여 쓸 수 있는 토큰
 * Free 는 402 + 어떤 카테고리가 채워져 있는지(coverage)만 — 값은 Pro. MCP get_design_system 이 같은 엔드포인트를 쓴다.
 */
$router->get('/api/sites/{slug}/design-system', static function (array $p): void {
    $slug = (string) $p['slug'];
    if (preg_match('/^[a-z0-9-]{1,100}$/', $slug) !== 1) {
        Response::error(404, 'NOT_FOUND', '사이트를 찾을 수 없습니다.');
    }
    $site = Homebox\Db::row("SELECT s.id, s.slug, s.title, s.url, s.status, COALESCE(o.display_name, o.name) AS org_name FROM sites s JOIN organizations o ON o.id = s.org_id WHERE s.slug = ?", [$slug]);
    if ($site === null || $site['status'] === 'removed') {
        Response::error(404, 'NOT_FOUND', '사이트를 찾을 수 없습니다.');
    }
    $row = Homebox\Db::row('SELECT * FROM site_design WHERE site_id = ?', [(int) $site['id']]);
    if ($row === null) {
        Response::error(404, 'NO_DESIGN', '이 기관은 디자인 데이터가 아직 없습니다.');
    }
    $doc = Homebox\DesignSystem::build($row, ['slug' => $site['slug'], 'name' => $site['org_name'], 'title' => $site['title'], 'url' => $site['url']]);
    $plan = Plan::current();
    $open = (($plan['limits']['design_data'] ?? 'summary') === 'full') || !empty($plan['admin']);
    if (!$open) {
        Response::error(402, 'UPGRADE_REQUIRED', '디자인 시스템은 Pro 회원에게 제공됩니다.', ['coverage' => $doc['coverage'], 'primary_hex' => $doc['color']['primary'], 'font' => $doc['typography']['family']['primary']]);
    }
    $fmt = (string) ($_GET['format'] ?? 'json');
    if ($fmt === 'css' || $fmt === 'tailwind') {
        header('Content-Type: text/css; charset=utf-8');
        header('Cache-Control: private, no-store');
        echo $fmt === 'css' ? Homebox\DesignSystem::css($doc) : Homebox\DesignSystem::tailwind($doc);
        exit;
    }
    if ($fmt === 'tokens') {
        Response::json(['site' => $doc['site']['slug'], 'version' => $doc['version'], 'tokens' => $doc['tokens']], 200, ['Cache-Control' => 'private, no-store']);
    }
    Response::json($doc, 200, ['Cache-Control' => 'private, no-store']);
});

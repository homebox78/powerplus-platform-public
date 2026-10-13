<?php
declare(strict_types=1);

/**
 * GET /api/sites/{slug}/components — S05 컴포넌트 탭 (docs/02): KRDS 컴포넌트별 준수 상태(applied/partial/missing) + 이 사이트에서 발견된 섹션 크롭 예시
 *   ?device=pc|mobile (기본 pc)  ?category=navigation (없으면 전체)  ?status=applied|partial|missing
 * 응답: items[{component, category, name_ko, name_en, guide_url, status, sections_n, examples[≤6]}] · categories[{id,name_ko,n}] · summary{applied,partial,missing}
 * @var Homebox\Http\Router $router
 */

use Homebox\Db;
use Homebox\Http\Response;
use Homebox\Plan;
use Homebox\Signer;

$router->get('/api/sites/{slug}/components', static function (array $p): void {
    $slug = (string) $p['slug'];
    $site = Db::row('SELECT id, status FROM sites WHERE slug = ?', [$slug]);
    if ($site === null || preg_match('/^[a-z0-9-]{1,100}$/', $slug) !== 1) {
        Response::error(404, 'NOT_FOUND', '사이트를 찾을 수 없습니다.');
    }
    if ($site['status'] === 'removed') {
        Response::error(410, 'REMOVED', '권리자 요청으로 삭제된 항목입니다.');
    }
    $siteId = (int) $site['id'];
    $allowed = Plan::allowedScreens($siteId); // 플랜 게이트
    $device = (string) ($_GET['device'] ?? 'pc');
    if (!in_array($device, ['pc', 'mobile'], true)) {
        Response::error(422, 'INVALID_DEVICE', 'device 는 pc|mobile 입니다.');
    }
    $category = preg_replace('/[^a-z_]/', '', (string) ($_GET['category'] ?? '')) ?: null;
    $statusF = (string) ($_GET['status'] ?? '');

    // 컴포넌트 전체 + 사이트 판정(없으면 n/a 로 두되, 섹션 태그가 있으면 applied 로 본다)
    $comps = Db::rows(
        'SELECT c.id, c.category, cc.name_ko AS category_ko, c.name_ko, c.name_en, c.guide_url, c.sort, k.status, k.note, k.source
         FROM krds_components c JOIN krds_component_categories cc ON cc.id = c.category
         LEFT JOIN site_krds k ON k.component_id = c.id AND k.site_id = ?
         ORDER BY cc.sort, c.sort, c.id', [$siteId]);
    // 컴포넌트별 섹션 예시 (게시된 화면·크롭 있는 것만, 화면 순서대로)
    $rows = Db::rows(
        "SELECT sk.component_id, x.id AS section_id, x.section_type_id, st.name_ko AS section_type_ko, x.variant, x.bbox_w, x.bbox_h, x.crop_asset_id,
                sc.id AS screen_id, sc.page_type_id AS page_type, pt.name_ko AS page_type_ko
         FROM section_krds sk JOIN sections x ON x.id = sk.section_id JOIN screens sc ON sc.id = x.screen_id
         JOIN section_types st ON st.id = x.section_type_id JOIN page_types pt ON pt.id = sc.page_type_id
         WHERE sc.site_id = ? AND sc.status = 'published' AND sc.device = ? AND x.crop_asset_id IS NOT NULL
         ORDER BY sc.sort, sc.id, x.sort", [$siteId, $device]);
    $byComp = [];
    foreach ($rows as $r) {
        $byComp[$r['component_id']][] = $r;
    }
    $items = [];
    $catCount = [];
    $summary = ['applied' => 0, 'partial' => 0, 'missing' => 0];
    foreach ($comps as $c) {
        $ex = $byComp[$c['id']] ?? [];
        $status = $c['status'] ?? ($ex !== [] ? 'applied' : 'n/a');
        if ($status === 'n/a' && $ex === []) {
            continue; // 이 사이트와 무관한 컴포넌트는 숨김 (판정도 예시도 없음)
        }
        if (isset($summary[$status])) {
            $summary[$status]++;
        }
        $catCount[$c['category']] = ($catCount[$c['category']] ?? 0) + 1;
        if (($category !== null && $c['category'] !== $category) || ($statusF !== '' && $status !== $statusF)) {
            continue;
        }
        $items[] = [
            'id' => $c['id'], 'category' => $c['category'], 'category_ko' => $c['category_ko'], 'name_ko' => $c['name_ko'], 'name_en' => $c['name_en'],
            'guide_url' => $c['guide_url'] ?: 'https://www.krds.go.kr/html/site/component/component_summary.html', // 개별 파일명은 DB(guide_url, 0012) — 없으면 목록 페이지로 (id 기반 URL 은 404)
            'status' => $status, 'note' => $c['note'], 'source' => $c['source'] ?? 'auto', 'sections_n' => count($ex),
            'examples' => array_map(static fn (array $e): array => [
                'locked' => !Plan::canSee($allowed, (int) $e['screen_id']),
                'section_id' => (int) $e['section_id'], 'section_type' => $e['section_type_id'], 'section_type_ko' => $e['section_type_ko'], 'variant' => $e['variant'],
                'w' => (int) $e['bbox_w'], 'h' => (int) $e['bbox_h'], 'screen_id' => (int) $e['screen_id'], 'page_type' => $e['page_type'], 'page_type_ko' => $e['page_type_ko'],
                'crop_url' => Plan::canSee($allowed, (int) $e['screen_id']) ? Plan::kurl($siteId, $e['crop_asset_id']) : null,
            ], array_slice($ex, 0, 6)),
        ];
    }
    $cats = Db::rows('SELECT id, name_ko FROM krds_component_categories ORDER BY sort');
    $categories = [];
    foreach ($cats as $cat) {
        if (($catCount[$cat['id']] ?? 0) > 0) {
            $categories[] = ['id' => $cat['id'], 'name_ko' => $cat['name_ko'], 'n' => $catCount[$cat['id']]];
        }
    }
    Response::json(['total' => count($items), 'device' => $device, 'categories' => $categories, 'summary' => $summary, 'items' => $items,
        'attribution' => '출처는 각 화면의 기관 사이트. KRDS 명칭은 krds.go.kr 공식 가이드 기준. 홈박스는 저작권을 주장하지 않으며 참고용입니다.'], 200, ['Cache-Control' => 'public, max-age=60']);
});

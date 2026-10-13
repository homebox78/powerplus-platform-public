<?php
declare(strict_types=1);

/**
 * GET /api/sites/{slug}/sections — 기관 사이트의 섹션 크롭 목록 (docs/08, S04 섹션 탭)
 *   ?section_type=header,footer  (쉼표 구분, 없으면 전체)   ?device=pc|mobile (기본 pc)   ?page_type=main,board_list  ?screen_id=123
 *   항목에 x·y·w·h 전부 — 2026-09-24 전엔 x 가 없어 같은 행의 좌우 순서를 알 수 없었다(군산 첫 줄 뒤집힘)
 * 응답: items(섹션 + 화면 메타 + 크롭 서명 URL) · facets(유형별 개수, 필터 전 기준) · total
 * Mobbin 의 Sections 뷰 구조(유형 다중 선택 드롭다운 + 크롭 그리드) — 사용자 참고 2026-09-24
 * @var Homebox\Http\Router $router
 */

use Homebox\Db;
use Homebox\Http\Response;
use Homebox\Plan;
use Homebox\Signer;

$router->get('/api/sites/{slug}/sections', static function (array $p): void {
    $slug = (string) $p['slug'];
    if (preg_match('/^[a-z0-9-]{1,100}$/', $slug) !== 1) {
        Response::error(404, 'NOT_FOUND', '사이트를 찾을 수 없습니다.');
    }
    $site = Db::row('SELECT id, status FROM sites WHERE slug = ?', [$slug]);
    if ($site === null) {
        Response::error(404, 'NOT_FOUND', '사이트를 찾을 수 없습니다.');
    }
    if ($site['status'] === 'removed') {
        Response::error(410, 'REMOVED', '권리자 요청으로 삭제된 항목입니다.');
    }
    $siteId = (int) $site['id'];
    $allowed = Plan::allowedScreens($siteId); // 플랜 게이트: 잠긴 화면의 섹션은 크롭 없이 locked 로
    $device = (string) ($_GET['device'] ?? 'pc');
    if (!in_array($device, ['pc', 'mobile'], true)) {
        Response::error(422, 'INVALID_DEVICE', 'device 는 pc|mobile 입니다.');
    }
    $types = array_values(array_filter(array_map('trim', explode(',', (string) ($_GET['section_type'] ?? ''))), static fn (string $t): bool => preg_match('/^[a-z_]{1,40}$/', $t) === 1));

    // 유형별 개수(패싯)는 필터 전 기준 — 드롭다운에서 "헤더 41" 처럼 보여준다
    $facets = Db::rows(
        "SELECT x.section_type_id AS id, st.name_ko, COUNT(*) AS n
         FROM sections x JOIN screens sc ON sc.id = x.screen_id JOIN section_types st ON st.id = x.section_type_id
         WHERE sc.site_id = ? AND sc.status = 'published' AND sc.device = ? AND x.crop_asset_id IS NOT NULL
         GROUP BY x.section_type_id, st.name_ko, st.sort ORDER BY st.sort",
        [$siteId, $device],
    );
    foreach ($facets as &$f) {
        $f['n'] = (int) $f['n'];
    }
    unset($f);

    $where = "sc.site_id = ? AND sc.status = 'published' AND sc.device = ? AND x.crop_asset_id IS NOT NULL";
    $params = [$siteId, $device];
    $pts = array_values(array_filter(array_map('trim', explode(',', (string) ($_GET['page_type'] ?? ''))), static fn (string $t): bool => preg_match('/^[a-z_]{1,40}$/', $t) === 1));
    if ($pts !== []) {
        $where .= ' AND sc.page_type_id IN (' . implode(',', array_fill(0, count($pts), '?')) . ')';
        $params = array_merge($params, $pts);
    }
    if (($sid = (int) ($_GET['screen_id'] ?? 0)) > 0) {
        $where .= ' AND sc.id = ?';
        $params[] = $sid;
    }
    if ($types !== []) {
        $where .= ' AND x.section_type_id IN (' . implode(',', array_fill(0, count($types), '?')) . ')';
        $params = array_merge($params, $types);
    }
    $rows = Db::rows(
        "SELECT x.id, x.section_type_id, st.name_ko AS section_type_ko, x.variant, x.bbox_x, x.bbox_w, x.bbox_h, x.bbox_y, x.crop_asset_id, x.confidence, x.structure,
                sc.id AS screen_id, sc.page_type_id AS page_type, pt.name_ko AS page_type_ko, sc.title AS screen_title, sc.sort AS screen_sort,
                (SELECT JSON_ARRAYAGG(k.component_id) FROM section_krds k WHERE k.section_id = x.id) AS krds
         FROM sections x JOIN screens sc ON sc.id = x.screen_id JOIN section_types st ON st.id = x.section_type_id JOIN page_types pt ON pt.id = sc.page_type_id
         WHERE $where
         ORDER BY sc.sort, sc.id, x.bbox_y, x.bbox_x",
        $params,
    );
    $items = array_map(static function (array $x) use ($allowed, $siteId): array {
        $ok = Plan::canSee($allowed, (int) $x['screen_id']);
        return [
            'locked' => !$ok,
            'id' => (int) $x['id'], 'section_type' => $x['section_type_id'], 'section_type_ko' => $x['section_type_ko'], 'variant' => $x['variant'],
            'w' => (int) $x['bbox_w'], 'h' => (int) $x['bbox_h'], 'confidence' => $x['confidence'] === null ? null : (float) $x['confidence'],
            'screen_id' => (int) $x['screen_id'], 'page_type' => $x['page_type'], 'page_type_ko' => $x['page_type_ko'], 'screen_title' => $x['screen_title'],
            'krds' => is_string($x['krds']) ? (json_decode($x['krds'], true) ?: []) : [],
            // 구조 힌트(탭·캐러셀·표·폼 여부 + 텍스트 발췌) — MCP 가 "탭형인가·슬라이드인가"를 이미지 없이 판단하는 근거 (2026-09-23)
            'structure' => Homebox\SectionShape::structure($x['structure'] ?? null),
            'x' => (int) ($x['bbox_x'] ?? 0), 'y' => (int) ($x['bbox_y'] ?? 0),
            'crop_url' => $ok ? Plan::kurl($siteId, $x['crop_asset_id']) : null,
        ];
    }, $rows);
    Response::json([
        'total' => count($items), 'device' => $device, 'section_type' => $types, 'facets' => $facets, 'items' => $items,
        'attribution' => '출처는 각 화면의 기관 사이트. 홈박스는 저작권을 주장하지 않으며 참고용입니다.',
        'gate' => Plan::info(Plan::current(), $allowed, 0),
    ], 200, ['Cache-Control' => $allowed === null ? 'private, no-store' : 'public, max-age=60']);
});

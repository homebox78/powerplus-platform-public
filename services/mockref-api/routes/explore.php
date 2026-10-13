<?php
declare(strict_types=1);

/**
 * 전역 탐색 (상단·푸터 메뉴 섹션·컴포넌트·업무흐름, 2026-09-24) — 기관 하나가 아니라 게시된 모든 기관을 가로질러 본다.
 *   GET /api/sections?section_type=&device=pc|mobile&offset=&limit=   섹션 크롭 그리드 + 유형별 개수
 *   GET /api/components?category=                                    KRDS 컴포넌트별 채택 현황 + 예시 크롭 4
 *   GET /api/flows?device=                                           시나리오별 흐름을 갖춘 기관 (flows.php 의 $RULES 재사용)
 * 플랜 게이트는 기관별 화면 허용 목록(Plan::allowedScreens)을 그대로 따른다 — 무료면 잠긴 화면의 크롭은 locked.
 * @var Homebox\Http\Router $router
 * @var array $RULES  flows.php 에서 정의 (index.php 가 이 파일보다 먼저 require)
 */

use Homebox\Db;
use Homebox\Http\Response;
use Homebox\Plan;
use Homebox\Signer;

$allowCache = [];
$canSee = static function (int $siteId, int $screenId) use (&$allowCache): bool {
    if (!array_key_exists($siteId, $allowCache)) {
        $allowCache[$siteId] = Plan::allowedScreens($siteId);
    }
    return Plan::canSee($allowCache[$siteId], $screenId);
};
// 목록에 나오는 기관들의 잠금 판정을 쿼리 한 번으로 미리 채운다 (기관마다 한 번씩이면 수백 번)
$prefetch = static function (array $rows) use (&$allowCache): void {
    $need = array_values(array_diff(array_unique(array_map(static fn (array $r): int => (int) $r['site_id'], $rows)), array_keys($allowCache)));
    foreach (Plan::allowedScreensMany($need) as $sid => $a) {
        $allowCache[$sid] = $a;
    }
};
$siteMeta = static function (array $r): array {
    return ['slug' => $r['slug'], 'org_name' => $r['org_name'], 'favicon_url' => !empty($r['favicon_asset_id']) ? Signer::url((int) $r['favicon_asset_id'], 86400) : null];
};

$router->get('/api/sections', static function () use ($canSee, $siteMeta, $prefetch): void {
    $device = in_array($_GET['device'] ?? 'pc', ['pc', 'mobile'], true) ? (string) ($_GET['device'] ?? 'pc') : 'pc';
    $type = preg_replace('/[^a-z_]/', '', (string) ($_GET['section_type'] ?? ''));
    $limit = max(12, min(60, (int) ($_GET['limit'] ?? 36)));
    $offset = max(0, (int) ($_GET['offset'] ?? 0));
    $base = "FROM sections x JOIN screens sc ON sc.id = x.screen_id JOIN sites s ON s.id = sc.site_id
             WHERE s.status = 'published' AND s.source_kind = 'gov' AND sc.status = 'published' AND sc.device = ? AND x.crop_asset_id IS NOT NULL AND x.section_type_id <> 'unknown'";
    $facets = Db::cached("sections-facets|$device", static fn (): array => Db::rows("SELECT x.section_type_id AS id, st.name_ko, COUNT(*) AS n, COUNT(DISTINCT s.id) AS sites
                        FROM sections x JOIN screens sc ON sc.id = x.screen_id JOIN sites s ON s.id = sc.site_id JOIN section_types st ON st.id = x.section_type_id
                        WHERE s.status = 'published' AND s.source_kind = 'gov' AND sc.status = 'published' AND sc.device = ? AND x.crop_asset_id IS NOT NULL AND x.section_type_id <> 'unknown'
                        GROUP BY x.section_type_id, st.name_ko, st.sort ORDER BY n DESC", [$device]));
    foreach ($facets as &$f) { $f['n'] = (int) $f['n']; $f['sites'] = (int) $f['sites']; }
    unset($f);
    $params = [$device];
    $where = '';
    if ($type !== '') { $where = ' AND x.section_type_id = ?'; $params[] = $type; }
    $total = (int) Db::cached("sections-total|$device|$type", static fn (): int => (int) (Db::row("SELECT COUNT(*) AS n $base$where", $params)['n'] ?? 0));
    // 정렬: 같은 기관이 몰리지 않게 기관 안 순번(rn) 먼저 → 신뢰도 높은 것 먼저. 한 페이지에 여러 기관이 고르게 섞인다
    $rows = Db::cached("sections-page|$device|$type|$limit|$offset", static fn (): array => Db::rows(
        "SELECT * FROM (
           SELECT x.id, x.section_type_id, st.name_ko AS section_type_ko, x.variant, x.bbox_w, x.bbox_h, x.crop_asset_id, x.confidence,
                  sc.id AS screen_id, sc.site_id, sc.title AS screen_title, s.slug, s.favicon_asset_id, s.krds_score,
                  COALESCE(o.display_name, o.name) AS org_name,
                  ROW_NUMBER() OVER (PARTITION BY sc.site_id ORDER BY x.confidence DESC, sc.sort, x.sort) AS rn
           FROM sections x JOIN screens sc ON sc.id = x.screen_id JOIN sites s ON s.id = sc.site_id JOIN organizations o ON o.id = s.org_id JOIN section_types st ON st.id = x.section_type_id
           WHERE s.status = 'published' AND s.source_kind = 'gov' AND sc.status = 'published' AND sc.device = ? AND x.crop_asset_id IS NOT NULL AND x.section_type_id <> 'unknown'$where
         ) t ORDER BY rn, krds_score DESC, id LIMIT $limit OFFSET $offset",
        $params,
    ));
    $prefetch($rows);
    $items = array_map(static function (array $r) use ($canSee, $siteMeta): array {
        $ok = $canSee((int) $r['site_id'], (int) $r['screen_id']);
        return ['id' => (int) $r['id'], 'section_type' => $r['section_type_id'], 'section_type_ko' => $r['section_type_ko'], 'variant' => $r['variant'],
            'w' => (int) $r['bbox_w'], 'h' => (int) $r['bbox_h'], 'screen_id' => (int) $r['screen_id'], 'screen_title' => $r['screen_title'],
            'site' => $siteMeta($r), 'locked' => !$ok, 'crop_url' => $ok ? Plan::kurl((int) $r['site_id'], $r['crop_asset_id']) : null];
    }, $rows);
    Response::json(['total' => $total, 'offset' => $offset, 'limit' => $limit, 'device' => $device, 'section_type' => $type ?: null, 'facets' => $facets, 'items' => $items],
        200, ['Cache-Control' => 'private, no-store']);
});

$router->get('/api/components', static function () use ($canSee, $siteMeta, $prefetch): void {
    $category = preg_replace('/[^a-z_]/', '', (string) ($_GET['category'] ?? ''));
    $sitesTotal = (int) (Db::row("SELECT COUNT(*) AS n FROM sites WHERE status = 'published' AND source_kind = 'gov'")['n'] ?? 0);
    $cats = Db::rows('SELECT cc.id, cc.name_ko, COUNT(c.id) AS n FROM krds_component_categories cc LEFT JOIN krds_components c ON c.category = cc.id GROUP BY cc.id, cc.name_ko, cc.sort ORDER BY cc.sort');
    foreach ($cats as &$c) { $c['n'] = (int) $c['n']; }
    unset($c);
    $comps = Db::cached("components|$category", static fn (): array => Db::rows(
        "SELECT c.id, c.name_ko, c.name_en, c.category, cc.name_ko AS category_ko, c.guide_url,
                SUM(k.status = 'applied') AS applied, SUM(k.status = 'partial') AS partial, SUM(k.status = 'missing') AS missing
         FROM krds_components c JOIN krds_component_categories cc ON cc.id = c.category
         LEFT JOIN site_krds k ON k.component_id = c.id AND k.site_id IN (SELECT id FROM sites WHERE status = 'published' AND source_kind = 'gov')
         " . ($category !== '' ? 'WHERE c.category = ?' : '') . "
         GROUP BY c.id, c.name_ko, c.name_en, c.category, cc.name_ko, c.guide_url, cc.sort, c.sort ORDER BY cc.sort, c.sort, c.id",
        $category !== '' ? [$category] : [],
    ));
    // 예시 크롭: 컴포넌트마다 서로 다른 기관 4곳(PC)
    $ex = Db::cached('components-examples', static fn (): array => Db::rows(
        "SELECT * FROM (
           SELECT k.component_id, x.crop_asset_id, sc.id AS screen_id, sc.site_id, s.slug, s.favicon_asset_id, COALESCE(o.display_name, o.name) AS org_name,
                  ROW_NUMBER() OVER (PARTITION BY k.component_id, sc.site_id ORDER BY x.confidence DESC) AS rs
           FROM section_krds k JOIN sections x ON x.id = k.section_id JOIN screens sc ON sc.id = x.screen_id JOIN sites s ON s.id = sc.site_id JOIN organizations o ON o.id = s.org_id
           WHERE s.status = 'published' AND s.source_kind = 'gov' AND sc.status = 'published' AND sc.device = 'pc' AND x.crop_asset_id IS NOT NULL
         ) t WHERE rs = 1"));
    $prefetch($ex);
    $byComp = [];
    foreach ($ex as $r) {
        if (count($byComp[$r['component_id']] ?? []) >= 4) { continue; }
        $ok = $canSee((int) $r['site_id'], (int) $r['screen_id']);
        $byComp[$r['component_id']][] = ['site' => $siteMeta($r), 'screen_id' => (int) $r['screen_id'], 'locked' => !$ok, 'crop_url' => $ok ? Plan::kurl((int) $r['site_id'], $r['crop_asset_id']) : null];
    }
    $items = array_map(static fn (array $c): array => [
        'id' => $c['id'], 'name_ko' => $c['name_ko'], 'name_en' => $c['name_en'], 'category' => $c['category'], 'category_ko' => $c['category_ko'], 'guide_url' => $c['guide_url'],
        'applied' => (int) $c['applied'], 'partial' => (int) $c['partial'], 'missing' => (int) $c['missing'], 'examples' => $byComp[$c['id']] ?? [],
    ], $comps);
    Response::json(['sites_total' => $sitesTotal, 'categories' => $cats, 'category' => $category ?: null, 'items' => $items], 200, ['Cache-Control' => 'private, no-store']);
});

$router->get('/api/flows', static function () use ($RULES, $canSee, $siteMeta): void {
    $device = in_array($_GET['device'] ?? 'pc', ['pc', 'mobile'], true) ? (string) ($_GET['device'] ?? 'pc') : 'pc';
    $rows = Db::rows(
        "SELECT sc.id, sc.site_id, sc.page_type_id, sc.title, sc.thumb_asset_id, sc.sort, s.slug, s.favicon_asset_id, s.krds_score, COALESCE(o.display_name, o.name) AS org_name
         FROM screens sc JOIN sites s ON s.id = sc.site_id JOIN organizations o ON o.id = s.org_id
         WHERE s.status = 'published' AND s.source_kind = 'gov' AND sc.status = 'published' AND sc.device = ? ORDER BY s.krds_score DESC, sc.site_id, sc.sort, sc.id", [$device]);
    $bySite = [];
    foreach ($rows as $r) { $bySite[(int) $r['site_id']][] = $r; }
    $out = [];
    foreach ($RULES as $id => $rule) {
        $sites = [];
        foreach ($bySite as $siteId => $scr) {
            $steps = [];
            foreach ($rule['steps'] as [$pt, $kw, $label]) {
                foreach ($scr as $s) {
                    if ($s['page_type_id'] !== $pt) { continue; }
                    if ($kw !== null && preg_match($kw . 'u', (string) $s['title']) !== 1 && $pt !== 'main') { continue; }
                    $steps[] = ['label' => $label, 'screen_id' => (int) $s['id'], 'thumb' => (int) ($s['thumb_asset_id'] ?? 0)];
                    break;
                }
            }
            // 메인 말고 흐름 고유 단계가 하나라도 있어야 "흐름이 있다"로 본다
            if (count(array_filter($steps, static fn (array $x): bool => $x['label'] !== '메인')) === 0) { continue; }
            $first = $steps[1] ?? $steps[0];
            $ok = $canSee($siteId, $first['screen_id']);
            $sites[] = ['site' => $siteMeta($scr[0]), 'steps' => count($steps), 'total' => count($rule['steps']), 'labels' => array_column($steps, 'label'),
                'screen_id' => $first['screen_id'], 'locked' => !$ok, 'thumb_url' => $ok && $first['thumb'] ? Signer::url($first['thumb']) : null];
        }
        usort($sites, static fn (array $a, array $b): int => ($b['steps'] <=> $a['steps']));
        $out[] = ['id' => $id, 'name' => $rule['name'], 'step_labels' => array_column($rule['steps'], 2), 'n_sites' => count($sites), 'sites' => array_slice($sites, 0, 12)];
    }
    Response::json(['device' => $device, 'scenarios' => $out], 200, ['Cache-Control' => 'private, no-store']);
});

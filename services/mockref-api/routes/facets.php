<?php
declare(strict_types=1);

/**
 * GET /api/facets — 전역 필터 팔레트(⌘K)용 카운트: 기관유형·섹션 유형·스타일 태그·KRDS 컴포넌트별 게시 건수 (docs/02 S02/S09, Mobbin Filter 참조 2026-09-24)
 * @var Homebox\Http\Router $router
 */

use Homebox\Db;
use Homebox\Http\Response;

$router->get('/api/facets', static function (): void {
    $device = (string) ($_GET['device'] ?? 'pc');
    if (!in_array($device, ['pc', 'mobile'], true)) {
        $device = 'pc';
    }
    [$org, $sections, $styles, $krds, $trending] = Db::cached("facets|$device", static function () use ($device): array {
        $org = Db::rows("SELECT ot.id, ot.name_ko, COUNT(*) AS n FROM sites s JOIN organizations o ON o.id = s.org_id JOIN org_types ot ON ot.id = o.org_type_id WHERE s.status = 'published' AND s.source_kind = 'gov' GROUP BY ot.id, ot.name_ko, ot.sort ORDER BY ot.sort");
        $sections = Db::rows("SELECT st.id, st.name_ko, COUNT(*) AS n FROM sections x JOIN screens sc ON sc.id = x.screen_id JOIN section_types st ON st.id = x.section_type_id JOIN sites s ON s.id = sc.site_id WHERE s.source_kind = 'gov' AND sc.status = 'published' AND sc.device = ? AND x.crop_asset_id IS NOT NULL AND x.section_type_id <> 'unknown' GROUP BY st.id, st.name_ko, st.sort ORDER BY st.sort", [$device]);
        $styles = Db::rows("SELECT g.id, g.`group` AS grp, g.name_ko, COUNT(*) AS n FROM site_style_tags t JOIN style_tags g ON g.id = t.tag_id JOIN sites s ON s.id = t.site_id WHERE s.status = 'published' AND s.source_kind = 'gov' GROUP BY g.id, g.`group`, g.name_ko, g.sort ORDER BY g.`group`, g.sort");
        $krds = Db::rows("SELECT c.id, c.name_ko, c.name_en, c.category, COUNT(DISTINCT sc.site_id) AS n FROM section_krds k JOIN sections x ON x.id = k.section_id JOIN screens sc ON sc.id = x.screen_id JOIN krds_components c ON c.id = k.component_id JOIN sites s ON s.id = sc.site_id WHERE s.source_kind = 'gov' AND sc.status = 'published' GROUP BY c.id, c.name_ko, c.name_en, c.category, c.sort ORDER BY c.sort");
        $trending = Db::rows("SELECT s.slug, s.title, COALESCE(o.display_name, o.name) AS org_name, s.view_count FROM sites s JOIN organizations o ON o.id = s.org_id WHERE s.status = 'published' AND s.source_kind = 'gov' ORDER BY s.view_count DESC, s.renewal_year DESC, s.id DESC LIMIT 8");
        return [$org, $sections, $styles, $krds, $trending];
    });
    $int = static function (array $rows): array { foreach ($rows as &$r) { $r['n'] = (int) $r['n']; } return $rows; };
    Response::json(['device' => $device, 'org_types' => $int($org), 'section_types' => $int($sections), 'style_tags' => $int($styles), 'krds' => $int($krds), 'trending' => $trending], 200, ['Cache-Control' => 'public, max-age=120']);
});

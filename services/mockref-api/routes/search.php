<?php
declare(strict_types=1);

/**
 * GET /api/search?q=&type=sites|screens|sections&limit=  — S08 통합검색 (docs/08): 탭 카운트 + 결과
 * Meilisearch(config meili.*) 가 살아 있으면 multi-search(typo-tolerant·하이라이트), 아니면 DB LIKE 폴백(운영 VM 엔 아직 Meili 없음 — 2026-09-24).
 * 응답: counts{sites,screens,sections} · type · items[] (유형별 카드 필드 + 서명 썸네일) · engine(meili|sql)
 * @var Homebox\Http\Router $router
 */

use Homebox\Db;
use Homebox\Http\Response;
use Homebox\Plan;
use Homebox\Signer;

$router->get('/api/search', static function (): void {
    $q = trim((string) ($_GET['q'] ?? ''));
    $type = (string) ($_GET['type'] ?? 'sites');
    if (!in_array($type, ['sites', 'screens', 'sections'], true)) {
        Response::error(422, 'INVALID_TYPE', 'type 은 sites|screens|sections 입니다.');
    }
    $limit = max(1, min(48, (int) ($_GET['limit'] ?? 24)));
    if (mb_strlen($q) > 100) {
        Response::error(422, 'INVALID_QUERY', '검색어는 100자 이하입니다.');
    }
    $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $q) . '%';
    $engine = 'sql';
    $ids = ['sites' => null, 'screens' => null, 'sections' => null];
    $counts = ['sites' => 0, 'screens' => 0, 'sections' => 0];
    $highlights = [];

    // 1) Meilisearch 시도 (1초 안에 응답 없으면 폴백)
    $host = rtrim((string) Config::get('meili.host', ''), '/');
    if ($q !== '' && $host !== '') {
        $ch = curl_init($host . '/multi-search');
        $queries = [];
        foreach (['sites', 'screens', 'sections'] as $t) {
            $queries[] = ['indexUid' => $t, 'q' => $q, 'limit' => $t === $type ? $limit : 0, 'attributesToHighlight' => ['*'], 'highlightPreTag' => '<mark>', 'highlightPostTag' => '</mark>'] + ($t === 'sites' ? ['filter' => 'status = published'] : []);
        }
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 1, CURLOPT_TIMEOUT => 3, CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode(['queries' => $queries], JSON_UNESCAPED_UNICODE),
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Authorization: Bearer ' . (string) Config::get('meili.key', '')]]);
        $res = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $json = is_string($res) ? json_decode($res, true) : null;
        if ($status === 200 && is_array($json['results'] ?? null)) {
            $engine = 'meili';
            foreach ($json['results'] as $r) {
                $t = (string) $r['indexUid'];
                $counts[$t] = (int) ($r['estimatedTotalHits'] ?? count($r['hits'] ?? []));
                if ($t === $type) {
                    $pk = ['sites' => 'site_id', 'screens' => 'screen_id', 'sections' => 'section_id'][$t];
                    $ids[$t] = array_map(static fn (array $h): int => (int) $h[$pk], $r['hits'] ?? []);
                    foreach ($r['hits'] ?? [] as $h) {
                        $f = $h['_formatted'] ?? [];
                        $highlights[(int) $h[$pk]] = ['title' => $f['title'] ?? $f['section_type_ko'] ?? null, 'text' => $f['ocr_text'] ?? $f['variant'] ?? $f['org_name'] ?? null];
                    }
                }
            }
        }
    }

    // 2) SQL 폴백 (또는 검색어 없음 = 최신순)
    if ($engine === 'sql') {
        $w = $q === '' ? '' : ' AND (s.title LIKE ? OR COALESCE(o.display_name, o.name) LIKE ? OR IFNULL(v.name, "") LIKE ?)';
        $p = $q === '' ? [] : [$like, $like, $like];
        $counts['sites'] = (int) Db::row("SELECT COUNT(*) AS n FROM sites s JOIN organizations o ON o.id = s.org_id LEFT JOIN vendors v ON v.id = s.vendor_id WHERE s.status = 'published' AND s.source_kind = 'gov'$w", $p)['n'];
        $ws = $q === '' ? '' : ' AND (sc.title LIKE ? OR sc.ocr_text LIKE ? OR s.title LIKE ?)';
        $counts['screens'] = (int) Db::row("SELECT COUNT(*) AS n FROM screens sc JOIN sites s ON s.id = sc.site_id WHERE s.source_kind = 'gov' AND sc.status = 'published'$ws", $p)['n'];
        $wx = $q === '' ? '' : ' AND (st.name_ko LIKE ? OR IFNULL(x.variant, "") LIKE ? OR s.title LIKE ?)';
        $counts['sections'] = (int) Db::row("SELECT COUNT(*) AS n FROM sections x JOIN screens sc ON sc.id = x.screen_id JOIN sites s ON s.id = sc.site_id JOIN section_types st ON st.id = x.section_type_id WHERE s.source_kind = 'gov' AND sc.status = 'published' AND x.crop_asset_id IS NOT NULL AND x.section_type_id <> 'unknown'$wx", $p)['n'];
        if ($type === 'sites') {
            $ids['sites'] = array_map('intval', array_column(Db::rows("SELECT s.id FROM sites s JOIN organizations o ON o.id = s.org_id LEFT JOIN vendors v ON v.id = s.vendor_id WHERE s.status = 'published' AND s.source_kind = 'gov'$w ORDER BY s.renewal_year DESC, s.id DESC LIMIT $limit", $p), 'id'));
        } elseif ($type === 'screens') {
            $ids['screens'] = array_map('intval', array_column(Db::rows("SELECT sc.id FROM screens sc JOIN sites s ON s.id = sc.site_id WHERE s.source_kind = 'gov' AND sc.status = 'published'$ws ORDER BY sc.site_id, sc.sort, sc.id LIMIT $limit", $p), 'id'));
        } else {
            $ids['sections'] = array_map('intval', array_column(Db::rows("SELECT x.id FROM sections x JOIN screens sc ON sc.id = x.screen_id JOIN sites s ON s.id = sc.site_id JOIN section_types st ON st.id = x.section_type_id WHERE s.source_kind = 'gov' AND sc.status = 'published' AND x.crop_asset_id IS NOT NULL AND x.section_type_id <> 'unknown'$wx ORDER BY sc.site_id, sc.sort, x.sort LIMIT $limit", $p), 'id'));
        }
    }

    // 3) 카드 필드 채우기 (id 순서 유지)
    $items = [];
    $list = $ids[$type] ?? [];
    if ($list !== []) {
        $ph = implode(',', array_fill(0, count($list), '?'));
        if ($type === 'sites') {
            $rows = Db::rows("SELECT s.id, s.slug, s.title, s.url, s.renewal_year, s.wa_certified, s.krds_score, s.rating_avg, COALESCE(o.display_name, o.name) AS org_name, o.org_type_id AS org_type, ot.name_ko AS org_type_ko, d.primary_hex, d.tone, d.header_type,
                    (SELECT sc.thumb_asset_id FROM screens sc WHERE sc.site_id = s.id AND sc.status = 'published' AND sc.device = 'pc' AND sc.thumb_asset_id IS NOT NULL ORDER BY (sc.page_type_id = 'main') DESC, sc.sort, sc.id LIMIT 1) AS thumb_asset_id,
                    (SELECT JSON_ARRAYAGG(t.tag_id) FROM site_style_tags t WHERE t.site_id = s.id) AS style_tags
                FROM sites s JOIN organizations o ON o.id = s.org_id JOIN org_types ot ON ot.id = o.org_type_id LEFT JOIN site_design d ON d.site_id = s.id WHERE s.id IN ($ph) AND s.status = 'published'", $list);
            $by = [];
            foreach ($rows as $r) {
                $by[(int) $r['id']] = ['type' => 'site', 'id' => (int) $r['id'], 'slug' => $r['slug'], 'title' => $r['title'], 'org_name' => $r['org_name'], 'org_type' => $r['org_type'], 'org_type_ko' => $r['org_type_ko'], 'url' => $r['url'],
                    'renewal_year' => $r['renewal_year'] === null ? null : (int) $r['renewal_year'], 'wa_certified' => (bool) $r['wa_certified'], 'krds_score' => $r['krds_score'] === null ? null : (float) $r['krds_score'], 'rating' => $r['rating_avg'] === null ? null : (float) $r['rating_avg'],
                    'design' => ['primary' => $r['primary_hex'], 'tone' => $r['tone'], 'header_type' => $r['header_type']], 'style_tags' => is_string($r['style_tags']) ? (json_decode($r['style_tags'], true) ?: []) : [],
                    'thumb_url' => $r['thumb_asset_id'] ? Signer::url((int) $r['thumb_asset_id']) : null, 'page_url' => '/sites/' . $r['slug']];
            }
        } elseif ($type === 'screens') {
            $rows = Db::rows("SELECT sc.id, sc.title, sc.page_type_id, pt.name_ko AS page_type_ko, sc.device, sc.thumb_asset_id, sc.card_asset_id, sc.public_asset_id, sc.site_id, s.slug, s.title AS site_title, COALESCE(o.display_name, o.name) AS org_name, (SELECT COUNT(*) FROM sections x WHERE x.screen_id = sc.id) AS sections
                FROM screens sc JOIN page_types pt ON pt.id = sc.page_type_id JOIN sites s ON s.id = sc.site_id JOIN organizations o ON o.id = s.org_id WHERE sc.id IN ($ph) AND sc.status = 'published' AND s.status = 'published' AND s.source_kind = 'gov'", $list);
            $allow = Plan::allowedScreensMany(array_column($rows, 'site_id'));
            $by = [];
            foreach ($rows as $r) {
                $by[(int) $r['id']] = ['type' => 'screen', 'id' => (int) $r['id'], 'title' => $r['title'], 'page_type' => $r['page_type_id'], 'page_type_ko' => $r['page_type_ko'], 'device' => $r['device'], 'site_slug' => $r['slug'], 'site_title' => $r['site_title'], 'org_name' => $r['org_name'], 'sections' => (int) $r['sections'],
                    'thumb_url' => $r['thumb_asset_id'] ? Signer::url((int) $r['thumb_asset_id']) : null, 'card_url' => Plan::kurl((int) $r['site_id'], $r['card_asset_id']), 'public_url' => Plan::canSee($allow[(int) $r['site_id']] ?? null, (int) $r['id']) ? Plan::kurl((int) $r['site_id'], $r['public_asset_id']) : null, 'locked' => !Plan::canSee($allow[(int) $r['site_id']] ?? null, (int) $r['id']), 'page_url' => '/screens/' . $r['id']];
            }
        } else {
            $rows = Db::rows("SELECT x.id, x.section_type_id, st.name_ko AS section_type_ko, x.variant, x.bbox_w, x.bbox_h, x.crop_asset_id, sc.id AS screen_id, sc.site_id, sc.device, pt.name_ko AS page_type_ko, s.slug, s.title AS site_title, COALESCE(o.display_name, o.name) AS org_name,
                    (SELECT JSON_ARRAYAGG(k.component_id) FROM section_krds k WHERE k.section_id = x.id) AS krds
                FROM sections x JOIN screens sc ON sc.id = x.screen_id JOIN page_types pt ON pt.id = sc.page_type_id JOIN section_types st ON st.id = x.section_type_id JOIN sites s ON s.id = sc.site_id JOIN organizations o ON o.id = s.org_id WHERE x.id IN ($ph) AND sc.status = 'published' AND s.status = 'published' AND s.source_kind = 'gov'", $list);
            $allow = Plan::allowedScreensMany(array_column($rows, 'site_id'));
            $by = [];
            foreach ($rows as $r) {
                $by[(int) $r['id']] = ['type' => 'section', 'id' => (int) $r['id'], 'section_type' => $r['section_type_id'], 'section_type_ko' => $r['section_type_ko'], 'variant' => $r['variant'], 'w' => (int) $r['bbox_w'], 'h' => (int) $r['bbox_h'], 'screen_id' => (int) $r['screen_id'], 'device' => $r['device'], 'page_type_ko' => $r['page_type_ko'],
                    'site_slug' => $r['slug'], 'site_title' => $r['site_title'], 'org_name' => $r['org_name'], 'krds' => is_string($r['krds']) ? (json_decode($r['krds'], true) ?: []) : [],
                    'crop_url' => Plan::canSee($allow[(int) $r['site_id']] ?? null, (int) $r['screen_id']) ? Plan::kurl((int) $r['site_id'], $r['crop_asset_id']) : null, 'locked' => !Plan::canSee($allow[(int) $r['site_id']] ?? null, (int) $r['screen_id']), 'page_url' => '/screens/' . $r['screen_id'] . '?section=' . $r['id']];
            }
        }
        foreach ($list as $id) {
            if (isset($by[$id])) {
                $items[] = $by[$id] + ['highlight' => $highlights[$id] ?? null];
            }
        }
    }
    Response::json(['q' => $q, 'type' => $type, 'engine' => $engine, 'counts' => $counts, 'items' => $items, 'attribution' => '출처는 각 항목의 기관 사이트. 홈박스는 저작권을 주장하지 않으며 참고용입니다.'], 200, ['Cache-Control' => 'private, max-age=30']);
});

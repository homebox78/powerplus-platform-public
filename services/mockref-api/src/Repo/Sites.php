<?php
declare(strict_types=1);

namespace Homebox\Repo;

use Homebox\Db;
use Homebox\Design;
use Homebox\Plan;
use Homebox\Signer;

/**
 * 기관 사이트 조회 (docs/08 GET /api/sites, /api/sites/{slug}; 응답 항목은 docs/07 §2.1 search_sites 와 동일)
 * Phase 1: DB 직접 조회. Phase 3 에서 목록 검색은 Meilisearch 로 교체 (필터 파라미터는 그대로).
 */
final class Sites
{
    /** 목록 — @param array<string, mixed> $q  @return array{total:int, items:list<array<string,mixed>>, next_cursor:?string} */
    public static function search(array $q): array
    {
        $kind = ($q['kind'] ?? '') === 'private' ? 'private' : 'gov'; // 민간 레퍼런스(0030)는 ?kind=private 일 때만
        $where = ["s.status = 'published'", "s.source_kind = '$kind'"];
        $params = [];
        $relParams = []; $relSql = '';

        if (($text = trim((string) ($q['q'] ?? ''))) !== '') {
            // 기관명으론 "수원시"인데 묻는 쪽은 "수원시청"이라고 한다 — 끝의 청사(시청·도청·구청·군청)와 trailing 시를 뗀 변형도 함께 LIKE (MCP 검수 2026-10-05: 수원시청·서울시청·부산시청 0건)
            $texts = [$text];
            $base = preg_replace('/(특별|광역)?(시|도)$/u', '', (string) preg_replace('/청$/u', '', $text)); // 서울시청 → 서울
            $vs = [preg_replace('/(시|도|구|군)청$/u', '$1', $text), preg_replace('/(시|도|구|군)청$/u', '', $text), preg_replace('/시$/u', '', $text)];
            if (preg_match('/(시|도)청?$/u', $text) && is_string($base) && mb_strlen($base) >= 2 && $base !== $text) { foreach (['특별시', '광역시', '특별자치시', '특별자치도', '도', '시'] as $sfx) { $vs[] = $base . $sfx; } $vs[] = $base; }
            foreach ($vs as $v) {
                if (is_string($v) && ($v = trim($v)) !== '' && $v !== $text && !in_array($v, $texts, true)) { $texts[] = $v; }
            }
            $ors = [];
            foreach ($texts as $t) {
                $ors[] = '(s.title LIKE ? OR COALESCE(o.display_name, o.name) LIKE ? OR v.name LIKE ?)';
                $like = '%' . $t . '%';
                array_push($params, $like, $like, $like);
            }
            if (!empty($q['_by_page'])) {
                // 기관명·수행사에 없는 주제어(청년·복지…)는 게시 화면 제목에서 찾는다 (MCP 20문 시험 2026-10-05: '청년' 0건)
                $ors = ["s.id IN (SELECT sc.site_id FROM screens sc WHERE sc.status = 'published' AND sc.title LIKE ?)"];
                $params = array_slice($params, 0, count($params) - 3 * count($texts));
                $params[] = '%' . $text . '%';
            }
            $where[] = '(' . implode(' OR ', $ors) . ')';
            // 관련도: 기관명이 검색어(변형 포함)와 같음 > 그걸로 시작함 > 제목에 원문 포함 — "수원시청"에 '연수원'이 먼저 뜨던 것(2026-10-05)
            $rel = [];
            foreach ($texts as $t) {
                $rel[] = '(COALESCE(o.display_name, o.name) = ?) * 4 + (COALESCE(o.display_name, o.name) LIKE ?) * 2';
                array_push($relParams, $t, $t . '%');
            }
            $rel[] = '(s.title LIKE ?)';
            $relParams[] = '%' . $text . '%';
            $relSql = 'GREATEST(' . implode(', ', array_slice($rel, 0, -1)) . ', 0) + ' . end($rel) . ' DESC, ';
        }
        if ($ids = self::list($q, 'org_type')) {
            // 상위 유형(local, public …)을 주면 하위까지 포함
            $ph = self::ph($ids);
            $where[] = "(o.org_type_id IN ($ph) OR ot.parent_id IN ($ph))";
            array_push($params, ...$ids, ...$ids);
        }
        if ($ids = self::list($q, 'site_type')) {
            $where[] = 's.site_type_id IN (' . self::ph($ids) . ')';
            array_push($params, ...$ids);
        }
        if ($ids = self::list($q, 'tone')) {
            $where[] = 'd.tone IN (' . self::ph($ids) . ')';
            array_push($params, ...$ids);
        }
        if ($ids = self::list($q, 'layout')) {
            $where[] = 's.id IN (SELECT site_id FROM site_style_tags WHERE tag_id IN (' . self::ph($ids) . '))';
            array_push($params, ...$ids);
        }
        if (($y = (int) ($q['renewal_from'] ?? 0)) > 0) { $where[] = 's.renewal_year >= ?'; $params[] = $y; }
        if (($y = (int) ($q['renewal_to'] ?? 0)) > 0)   { $where[] = 's.renewal_year <= ?'; $params[] = $y; }
        if (isset($q['wa']) && $q['wa'] !== '')          { $where[] = 's.wa_certified = ?';  $params[] = (int) (bool) $q['wa']; }
        if (($f = trim((string) ($q['framework'] ?? ''))) !== '') { $where[] = 's.framework LIKE ?'; $params[] = '%' . $f . '%'; }
        if (($vd = trim((string) ($q['vendor'] ?? ''))) !== '')   { $where[] = '(v.slug = ? OR v.name LIKE ?)'; array_push($params, $vd, '%' . $vd . '%'); }
        if (($k = (float) ($q['krds_min'] ?? 0)) > 0)   { $where[] = 's.krds_score >= ?'; $params[] = $k; }

        $order = match ((string) ($q['sort'] ?? 'renewed')) {
            'rating' => 's.rating_avg IS NULL, s.rating_avg DESC, s.rating_count DESC, s.renewal_year DESC', // 평가 있는 사이트 우선(MCP 기본 정렬, 2026-09-24)
            'views'  => 's.view_count DESC',
            'krds'   => 's.krds_score DESC',
            'newest' => 's.published_at DESC, s.id DESC', // 홈박스 등록(게시)순 — 일괄 수집이 가져온 순서
            default  => 's.renewal_year DESC, s.published_at DESC', // 개편순: 개편연도 모르는(NULL) 사이트는 뒤로. 홈 "최근 개편"은 renewal_from 으로 연도 있는 것만
        };
        $limit = max(1, min(48, (int) ($q['limit'] ?? 24)));
        $offset = self::decodeCursor((string) ($q['cursor'] ?? ''));

        $from = 'FROM sites s
                 JOIN organizations o ON o.id = s.org_id
                 JOIN org_types ot ON ot.id = o.org_type_id
                 LEFT JOIN vendors v ON v.id = s.vendor_id
                 LEFT JOIN site_design d ON d.site_id = s.id
                 WHERE ' . implode(' AND ', $where);

        $total = (int) (Db::row("SELECT COUNT(*) AS n $from", $params)['n'] ?? 0);
        if ($total === 0 && ($text ?? '') !== '' && empty($q['_by_page'])) {
            $r = self::search([...$q, '_by_page' => 1]);
            if ($r['total'] > 0) { $r['matched'] = 'page_title'; }
            return $r;
        }
        $rows = Db::rows(
            "SELECT s.id, s.slug, s.title, s.url, s.site_type_id, s.renewal_year, s.wa_certified, s.krds_score, s.rating_avg, s.rating_count, s.rating_breakdown, s.favicon_asset_id, s.framework,
                    COALESCE(o.display_name, o.name) AS org_name, o.org_type_id, ot.name_ko AS org_type_ko, o.phone AS org_phone, o.address AS org_address, o.postal_code AS org_postal, o.region_sido AS org_sido, o.region_sigungu AS org_sigungu,
                    v.name AS vendor_name, v.slug AS vendor_slug,
                    d.primary_hex, d.tone, d.fonts, d.container_px, d.header_type, d.lnb_position,
                    (SELECT sc.thumb_asset_id FROM screens sc WHERE sc.site_id = s.id AND (sc.status IN ('published','review') OR sc.page_type_id = 'main') AND sc.status <> 'removed' AND sc.device = 'pc' AND sc.thumb_asset_id IS NOT NULL ORDER BY (sc.page_type_id = 'main') DESC, sc.is_highlight DESC, sc.sort, sc.id LIMIT 1) AS thumb_asset_id
             $from ORDER BY $relSql$order, s.id DESC LIMIT $limit OFFSET $offset",
            [...$params, ...$relParams],
        );
        $tags = self::styleTags(array_column($rows, 'id'));
        $items = array_map(static fn (array $r): array => self::item($r, $tags[(int) $r['id']] ?? []), $rows);
        $next = $offset + $limit < $total ? self::encodeCursor($offset + $limit) : null;
        return ['total' => $total, 'items' => $items, 'next_cursor' => $next];
    }

    /** 상세 — @return array<string,mixed>|null */
    public static function bySlug(string $slug): ?array
    {
        $r = Db::row(
            "SELECT s.*, COALESCE(o.display_name, o.name) AS org_name, o.org_type_id, ot.name_ko AS org_type_ko, o.phone AS org_phone, o.address AS org_address, o.postal_code AS org_postal, o.region_sido AS org_sido, o.region_sigungu AS org_sigungu,
                    v.name AS vendor_name, v.slug AS vendor_slug,
                    d.palette, d.primary_hex, d.tone, d.fonts, d.typography, d.colors, d.spacing, d.container_px, d.grid_cols, d.breakpoints, d.header_type, d.lnb_position,
                    d.radius_px, d.shadow, d.icon_style, d.section_order,
                    (SELECT sc.thumb_asset_id FROM screens sc WHERE sc.site_id = s.id AND (sc.status IN ('published','review') OR sc.page_type_id = 'main') AND sc.status <> 'removed' AND sc.device = 'pc' AND sc.thumb_asset_id IS NOT NULL ORDER BY (sc.page_type_id = 'main') DESC, sc.is_highlight DESC, sc.sort, sc.id LIMIT 1) AS thumb_asset_id
             FROM sites s
             JOIN organizations o ON o.id = s.org_id
             JOIN org_types ot ON ot.id = o.org_type_id
             LEFT JOIN vendors v ON v.id = s.vendor_id
             LEFT JOIN site_design d ON d.site_id = s.id
             WHERE s.slug = ? AND s.status IN ('published','removed')",
            [$slug],
        );
        if ($r === null) {
            return null;
        }
        $id = (int) $r['id'];
        $tags = self::styleTags([$id])[$id] ?? [];

        $krdsRows = Db::rows('SELECT component_id, status FROM site_krds WHERE site_id = ?', [$id]);
        $krds = ['score' => $r['krds_score'] === null ? null : (float) $r['krds_score'], 'applied' => [], 'partial' => [], 'missing' => [], 'na' => []];
        foreach ($krdsRows as $k) {
            $krds[$k['status'] === 'n/a' ? 'na' : $k['status']][] = $k['component_id'];
        }
        $krds['patterns'] = array_column(Db::rows('SELECT DISTINCT krds_pattern_id FROM flows WHERE site_id = ? AND krds_pattern_id IS NOT NULL', [$id]), 'krds_pattern_id');
        $krds['guide_base'] = 'https://www.krds.go.kr/html/site/';

        $pages = Db::rows(
            "SELECT sc.id AS screen_id, sc.page_type_id AS page_type, pt.name_ko AS page_type_ko, sc.title, sc.url, sc.device, sc.is_highlight, sc.thumb_asset_id, sc.card_asset_id, sc.public_asset_id, sc.viewport_w, sc.full_h,
                    (SELECT COUNT(*) FROM sections x WHERE x.screen_id = sc.id) AS sections
             FROM screens sc JOIN page_types pt ON pt.id = sc.page_type_id
             WHERE sc.site_id = ? AND sc.status = 'published' ORDER BY sc.sort, sc.id",
            [$id],
        );
        foreach ($pages as &$p) {
            $p['screen_id'] = (int) $p['screen_id'];
            $p['sections'] = (int) $p['sections'];
            $p['is_highlight'] = (bool) $p['is_highlight'];
            $p['viewport_w'] = (int) $p['viewport_w'];
            $p['full_h'] = (int) $p['full_h'];
            $p['thumb_url'] = $p['thumb_asset_id'] ? Signer::url((int) $p['thumb_asset_id']) : null;
            $p['public_url'] = Plan::kurl($id, $p['public_asset_id']); // 공공누리 2~4유형이면 null(LEGAL-006)
            $p['card_url'] = Plan::kurl($id, $p['card_asset_id']); // 목록 카드용(원본 전체 대신)
            unset($p['thumb_asset_id'], $p['public_asset_id'], $p['card_asset_id']);
        }
        unset($p);

        return [
            'site' => self::item($r, $tags),
            'status' => $r['status'],
            'design' => [
                'palette' => self::json($r['palette']) ?? [],
                // 주색·톤 — get_site 응답에 없어 MCP 샘플이 팔레트에서 추측해야 했다 (2026-09-24). 면색이 주색으로 잡힌 경우 보정 + 근거
                ...(static function (array $r): array { $p = Design::primary($r['primary_hex'] ?? null, self::json($r['palette']) ?? []); return ['primary' => $p['hex'], 'primary_note' => $p['note'], 'tone' => $r['tone'] ?? null]; })($r),
                'fonts' => Design::fonts(self::json($r['fonts']) ?? []),
                // 읽을 때 정규화(폰트 표기·이상치·흰 제목색·gap 0) — 워커가 고쳐지기 전 수집분도 같은 품질로 (Design.php, 2026-09-23)
                'typography' => ($typo = Design::typography(self::json($r['typography'] ?? null))),
                'colors' => Design::colors(self::json($r['colors'] ?? null), $typo['scale'] ?? null),
                'spacing' => Design::spacing(self::json($r['spacing'] ?? null)),
                'container_px' => self::intOrNull($r['container_px']), 'grid_cols' => self::intOrNull($r['grid_cols']),
                'breakpoints' => self::json($r['breakpoints']) ?? [],
                'header_type' => $r['header_type'], 'lnb_position' => $r['lnb_position'],
                'radius_px' => self::intOrNull($r['radius_px']), 'shadow' => $r['shadow'] === null ? null : (bool) $r['shadow'], 'icon_style' => $r['icon_style'],
                'section_order' => self::json($r['section_order']) ?? [],
            ],
            'krds' => $krds,
            'pages' => $pages,
            'awards' => Db::rows('SELECT program, prize, awarded_ym, source_url FROM site_awards WHERE site_id = ? ORDER BY awarded_ym DESC', [$id]),
            'wa_certs' => Db::rows('SELECT cert_name, org_name, valid_from, valid_to, kind FROM site_wa_certs WHERE site_id = ? ORDER BY valid_from DESC', [$id]),
            'projects' => array_map(static function (array $p): array {
                $p['amount_krw'] = $p['amount_krw'] === null ? null : (int) $p['amount_krw'];
                $p['is_main'] = (bool) $p['is_main'];
                $p['consortium'] = $p['consortium'] ? json_decode($p['consortium'], true) : null;
                return $p;
            }, Db::rows(
                'SELECT p.title, p.kind, p.is_main, p.agency, p.amount_krw, p.period_from, p.period_to, p.g2b_notice_no, p.g2b_contract_no, p.consortium, p.source_url, v.name AS winner
                 FROM site_projects p LEFT JOIN vendors v ON v.id = p.winner_vendor_id WHERE p.site_id = ? ORDER BY p.is_main DESC, p.period_from DESC',
                [$id],
            )),
            'nav_states' => array_map(static function (array $n) use ($id): array {
                return [
                    'id' => (int) $n['id'], 'kind' => $n['kind'], 'label' => $n['label'], 'width' => (int) $n['width'], 'height' => (int) $n['height'],
                    'structure' => is_string($n['structure']) ? (json_decode($n['structure'], true) ?: null) : null,
                    'image_url' => Plan::kurl($id, $n['asset_id']),
                ];
            }, Db::rows('SELECT id, kind, label, width, height, structure, asset_id FROM nav_states WHERE site_id = ? ORDER BY sort, id', [$id])),
            'kogl' => Plan::koglInfo($id), // 공공누리 제한 중이면 유형·안내(원본 캡처 없음), 아니면 null
            'similar' => self::similar($id, $tags),
            // 제작(개편) 일시 = 나라장터 사업 종료일 > 개편연도 (수행사·제작일시 표시, 사용자 지시 2026-09-24)
            'built_at' => Db::row("SELECT MAX(COALESCE(period_to, period_from)) AS d FROM site_projects WHERE site_id = ? AND is_main = 1 AND kind = 'build'", [$id])['d'] ?? null,
            // 캡처 날짜(버전 드롭다운, 2026-09-24): 게시 화면 중 가장 최근 캡처
            'captured_at' => Db::row("SELECT MAX(captured_at) AS d FROM screens WHERE site_id = ? AND status = 'published'", [$id])['d'] ?? null,
        ];
    }

    /** 유사 사이트: 스타일 태그 자카드 유사도 상위 4 (docs/10 Phase 3) */
    private static function similar(int $siteId, array $tags): array
    {
        if ($tags === []) {
            return [];
        }
        $ph = self::ph($tags);
        $rows = Db::rows(
            "SELECT s.id, s.slug, s.title, GROUP_CONCAT(t.tag_id) AS shared, COUNT(*) AS n
             FROM site_style_tags t JOIN sites s ON s.id = t.site_id
             WHERE t.tag_id IN ($ph) AND t.site_id <> ? AND s.status = 'published' AND s.source_kind = (SELECT k.source_kind FROM sites k WHERE k.id = ?)
             GROUP BY s.id, s.slug, s.title ORDER BY n DESC, s.rating_avg DESC LIMIT 4",
            [...$tags, $siteId, $siteId],
        );
        return array_map(static fn (array $r): array => [
            'site_id' => (int) $r['id'], 'slug' => $r['slug'], 'title' => $r['title'], 'why' => explode(',', (string) $r['shared']),
        ], $rows);
    }

    /** @param array<string,mixed> $r @param list<string> $tags @return array<string,mixed> */
    private static function item(array $r, array $tags): array
    {
        $fonts = self::json($r['fonts'] ?? null) ?? [];
        $body = null;
        foreach ($fonts as $f) {
            if (($f['role'] ?? '') === 'body') { $body = Design::family($f['family'] ?? null); break; } // 표기 통일(Noto Sans Kr → Noto Sans KR) — 통계 버킷 갈림 방지
        }
        return [
            'site_id' => (int) $r['id'], 'slug' => $r['slug'], 'title' => $r['title'], 'url' => $r['url'],
            'org' => ['name' => $r['org_name'], 'type' => $r['org_type_id'], 'type_ko' => $r['org_type_ko'],
                      'phone' => $r['org_phone'] ?? null, 'address' => $r['org_address'] ?? null, 'postal_code' => $r['org_postal'] ?? null, 'region' => trim(($r['org_sido'] ?? '') . ' ' . ($r['org_sigungu'] ?? '')) ?: null],
            'site_type' => $r['site_type_id'], 'renewal_year' => self::intOrNull($r['renewal_year']),
            'vendor' => $r['vendor_name'], 'vendor_slug' => $r['vendor_slug'], 'vendor_source' => $r['vendor_source'] ?? null,
            'renewal_source' => $r['renewal_source'] ?? null,
            'wa_certified' => (bool) $r['wa_certified'],
            'framework' => $r['framework'] ?? null,
            'krds_score' => $r['krds_score'] === null ? null : (float) $r['krds_score'],
            'rating' => $r['rating_avg'] === null ? null : (float) $r['rating_avg'],
            'rating_count' => (int) ($r['rating_count'] ?? 0),
            'rating_breakdown' => !empty($r['rating_breakdown']) ? json_decode((string) $r['rating_breakdown'], true) : null,
            'favicon_url' => !empty($r['favicon_asset_id']) ? Signer::url((int) $r['favicon_asset_id'], 86400) : null, // 실제 파비콘(워커 수집)
            'style_tags' => $tags,
            'design' => [
                'primary' => $r['primary_hex'], 'tone' => $r['tone'], 'font_body' => $body,
                'container_px' => self::intOrNull($r['container_px']), 'header_type' => $r['header_type'], 'lnb_position' => $r['lnb_position'],
            ],
            'thumb_url' => !empty($r['thumb_asset_id']) ? Signer::url((int) $r['thumb_asset_id']) : null, // 공개 썸네일 서명 URL(10분)
            'page_url' => '/sites/' . $r['slug'],
        ];
    }

    /** @param list<int> $siteIds @return array<int, list<string>> */
    private static function styleTags(array $siteIds): array
    {
        if ($siteIds === []) {
            return [];
        }
        $rows = Db::rows(
            'SELECT t.site_id, t.tag_id FROM site_style_tags t JOIN style_tags g ON g.id = t.tag_id
             WHERE t.site_id IN (' . self::ph($siteIds) . ') ORDER BY g.sort',
            $siteIds,
        );
        $out = [];
        foreach ($rows as $r) {
            $out[(int) $r['site_id']][] = $r['tag_id'];
        }
        return $out;
    }

    /** ?org_type=a,b 또는 org_type[]=a — @return list<string> */
    private static function list(array $q, string $key): array
    {
        $v = $q[$key] ?? null;
        if ($v === null || $v === '') {
            return [];
        }
        $arr = is_array($v) ? $v : explode(',', (string) $v);
        return array_values(array_filter(array_map('trim', $arr), static fn (string $x): bool => $x !== '' && preg_match('/^[a-z0-9_]+$/', $x) === 1));
    }

    private static function ph(array $list): string { return implode(',', array_fill(0, count($list), '?')); }
    private static function json(mixed $v): ?array { return is_string($v) ? (json_decode($v, true) ?: null) : (is_array($v) ? $v : null); }
    private static function intOrNull(mixed $v): ?int { return $v === null ? null : (int) $v; }
    private static function encodeCursor(int $offset): string { return rtrim(strtr(base64_encode("o:$offset"), '+/', '-_'), '='); }
    private static function decodeCursor(string $c): int
    {
        if ($c === '') {
            return 0;
        }
        $raw = base64_decode(strtr($c, '-_', '+/'), true);
        return $raw !== false && preg_match('/^o:(\d+)$/', $raw, $m) ? (int) $m[1] : 0;
    }
}

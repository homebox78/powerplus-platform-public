<?php
declare(strict_types=1);

/**
 * 합성(insights) — MCP 가 "수백 곳을 가중치로 합친 답"을 내기 위한 집계 (2026-09-23, 사용자: "캡처 몇 장 주는 것과 질적으로 달라야").
 *   GET /api/insights/brief       org_type·tone·renewal_from 조건의 설계 브리프 (헤더·LNB·컨테이너·본문·섹션 순서·KRDS 적용률·추천 레퍼런스)
 *   GET /api/insights/section     섹션 유형 1개의 패턴 (변형 분포·표준 높이·위치·구조 플래그·상위 사이트 크롭)
 *   GET /api/insights/references  가중 순위 레퍼런스 + 선정 근거
 *
 * 가중치(0~1, 문서화가 곧 계약): rating 0.35 · krds 0.25 · recency 0.20 · wa_certified 0.10 · views 0.10.
 *   rating 없는 사이트는 rating 항을 0.5 로(중립) — 평가가 아직 적은 초기에 "평가 없음 = 0점" 이 되면 순위가 조회수만 따라간다.
 * 집계는 published 만. 표본 n 을 항상 같이 내보내 n 이 작으면 도구가 "근거 약함"이라고 말하게 한다.
 * @var Homebox\Http\Router $router
 */

use Homebox\Db;
use Homebox\Design;
use Homebox\Http\Response;
use Homebox\Plan;
use Homebox\SectionShape;
use Homebox\Signer;

$W = ['rating' => 0.35, 'krds' => 0.25, 'recency' => 0.20, 'wa' => 0.10, 'views' => 0.10];

/** 공통 WHERE (org_type 은 상위 유형 포함, tone, renewal_from) — @return array{string, list<mixed>} */
$scope = static function (): array {
    $where = ["s.status = 'published' AND s.source_kind = 'gov'"];
    $params = [];
    $list = static fn (string $k): array => array_values(array_filter(array_map('trim', explode(',', (string) ($_GET[$k] ?? ''))), static fn (string $v): bool => $v !== '' && preg_match('/^[a-z_]+$/', $v) === 1));
    if ($ids = $list('org_type')) {
        $ph = implode(',', array_fill(0, count($ids), '?'));
        // 게시된 사이트가 없는 세부 유형(예: public_medical)은 빈 응답 대신 상위 유형으로 넓히고 알린다 (MCP 20문 시험 2026-10-05)
        $has = (int) (Db::row("SELECT COUNT(*) AS n FROM sites s JOIN organizations o ON o.id = s.org_id JOIN org_types ot ON ot.id = o.org_type_id
                                WHERE s.status = 'published' AND s.source_kind = 'gov' AND (o.org_type_id IN ($ph) OR ot.parent_id IN ($ph))", array_merge($ids, $ids))['n'] ?? 0);
        if ($has === 0) {
            $parents = array_values(array_filter(array_column(Db::rows("SELECT DISTINCT parent_id FROM org_types WHERE id IN ($ph) AND parent_id IS NOT NULL", $ids), 'parent_id')));
            if ($parents) {
                $GLOBALS['hb_scope_note'] = '요청한 기관 유형(' . implode(',', $ids) . ')은 게시된 사이트가 없어 상위 유형(' . implode(',', $parents) . ')으로 넓혔습니다.';
                $ids = $parents;
                $ph = implode(',', array_fill(0, count($ids), '?'));
            }
        }
        $where[] = "(o.org_type_id IN ($ph) OR ot.parent_id IN ($ph))";
        array_push($params, ...$ids, ...$ids);
    }
    if ($ids = $list('tone')) {
        $where[] = 'd.tone IN (' . implode(',', array_fill(0, count($ids), '?')) . ')';
        array_push($params, ...$ids);
    }
    if (($y = (int) ($_GET['renewal_from'] ?? 0)) > 0) { $where[] = 's.renewal_year >= ?'; $params[] = $y; }
    if (($k = (float) ($_GET['krds_min'] ?? 0)) > 0)   { $where[] = 's.krds_score >= ?'; $params[] = $k; }
    return [implode(' AND ', $where), $params];
};

/** 가중 점수 SQL 식 (0~1). 연도 없음 = 0.3, 평가 없음 = 0.5(중립) */
$scoreSql = static fn (array $W): string => sprintf(
    '(%s * COALESCE(s.rating_avg / 5, 0.5) + %s * COALESCE(s.krds_score / 100, 0) + %s * (CASE WHEN s.renewal_year IS NULL THEN 0.3 WHEN s.renewal_year >= YEAR(CURDATE()) THEN 1 WHEN s.renewal_year = YEAR(CURDATE()) - 1 THEN 0.85 WHEN s.renewal_year = YEAR(CURDATE()) - 2 THEN 0.6 ELSE 0.35 END) + %s * s.wa_certified + %s * LEAST(1, LOG10(1 + s.view_count) / 4))',
    $W['rating'], $W['krds'], $W['recency'], $W['wa'], $W['views'],
);

$FROM = 'FROM sites s JOIN organizations o ON o.id = s.org_id JOIN org_types ot ON ot.id = o.org_type_id LEFT JOIN site_design d ON d.site_id = s.id';

/** 분포 → [{key,count,pct}] */
$dist = static function (array $rows, string $col): array {
    $c = [];
    $n = 0;
    foreach ($rows as $r) { $k = (string) ($r[$col] ?? ''); if ($k === '') { $k = '미확인'; } $c[$k] = ($c[$k] ?? 0) + 1; $n++; }
    arsort($c);
    return array_map(static fn (string $k, int $v): array => ['key' => $k, 'count' => $v, 'pct' => $n ? round($v / $n * 100, 1) : 0], array_keys($c), $c);
};
$median = static function (array $xs): ?float {
    $xs = array_values(array_filter($xs, static fn ($v): bool => $v !== null && $v !== ''));
    if ($xs === []) { return null; }
    sort($xs);
    $m = intdiv(count($xs), 2);
    return count($xs) % 2 ? (float) $xs[$m] : ((float) $xs[$m - 1] + (float) $xs[$m]) / 2;
};

// ---------------------------------------------------------------------------------------------------------------
$router->get('/api/insights/brief', static function () use ($scope, $scoreSql, $FROM, $W, $dist, $median): void {
    [$where, $params] = $scope();
    $sites = Db::rows("SELECT s.id, s.slug, s.title, s.renewal_year, s.wa_certified, s.krds_score, s.rating_avg, s.rating_count, s.view_count, COALESCE(o.display_name, o.name) AS org_name, o.org_type_id,
                              d.tone, d.primary_hex, d.header_type, d.lnb_position, d.container_px, d.radius_px, d.shadow, d.icon_style, d.fonts, d.typography, d.spacing, d.section_order,
                              {$scoreSql($W)} AS score
                       $FROM WHERE $where ORDER BY score DESC", $params);
    $n = count($sites);
    if ($n === 0) {
        Response::json(['n' => 0, 'note' => '조건에 맞는 게시 사이트가 없습니다. org_type·tone 을 넓히세요.', 'filters' => $_GET], 200, ['Cache-Control' => 'public, max-age=60']);
    }
    $fontBody = []; $bodySize = []; $h2Size = []; $lh = []; $gap = []; $btnH = []; $orders = [];
    foreach ($sites as $s) {
        $fonts = is_string($s['fonts']) ? (json_decode($s['fonts'], true) ?: []) : [];
        foreach ($fonts as $f) { if (($f['role'] ?? '') === 'body') { $fontBody[] = ['font_body' => Design::family($f['family'] ?? null)]; if (!empty($f['size'])) { $bodySize[] = (float) $f['size']; } if (!empty($f['line_height'])) { $lh[] = (float) $f['line_height']; } } }
        $t = Design::typography(is_string($s['typography']) ? json_decode($s['typography'], true) : null);
        if (!empty($t['scale']['h2']['size'])) { $h2Size[] = (float) $t['scale']['h2']['size']; }
        $sp = Design::spacing(is_string($s['spacing']) ? json_decode($s['spacing'], true) : null);
        if (!empty($sp['section_gap_px'])) { $gap[] = (float) $sp['section_gap_px']; }
        foreach ((array) ($sp['button_heights'] ?? []) as $h) { $btnH[] = (float) $h; }
        $ord = is_string($s['section_order']) ? (json_decode($s['section_order'], true) ?: []) : [];
        if ($ord !== []) { $orders[] = array_values(array_unique(array_filter($ord, static fn ($x): bool => is_string($x) && $x !== 'unknown'))); }
    }
    // 섹션 순서 합성: 각 유형의 평균 순위(0~1)로 정렬 + 등장률. "보통 이 순서로 놓는다"의 근거
    $pos = []; $seen = [];
    foreach ($orders as $o) { $len = max(1, count($o) - 1); foreach ($o as $i => $type) { $pos[$type][] = $len ? $i / $len : 0; $seen[$type] = ($seen[$type] ?? 0) + 1; } }
    $seq = [];
    foreach ($pos as $type => $ps) { $seq[] = ['section_type' => $type, 'avg_position' => round(array_sum($ps) / count($ps), 2), 'adoption_pct' => round($seen[$type] / max(1, count($orders)) * 100, 1)]; }
    usort($seq, static fn (array $a, array $b): int => $a['avg_position'] <=> $b['avg_position']);
    $names = array_column(Db::rows('SELECT id, name_ko FROM section_types'), 'name_ko', 'id');
    foreach ($seq as &$q) { $q['name_ko'] = $names[$q['section_type']] ?? $q['section_type']; }
    unset($q);
    // KRDS 컴포넌트 적용률
    $ids = array_map('intval', array_column($sites, 'id'));
    $ph = implode(',', array_fill(0, count($ids), '?'));
    $krds = Db::rows("SELECT k.component_id, c.name_ko, COUNT(*) AS n FROM site_krds k JOIN krds_components c ON c.id = k.component_id WHERE k.site_id IN ($ph) AND k.status = 'applied' GROUP BY k.component_id, c.name_ko, c.sort ORDER BY n DESC, c.sort", $ids);
    foreach ($krds as &$k) { $k['n'] = (int) $k['n']; $k['pct'] = round($k['n'] / $n * 100, 1); }
    unset($k);
    $top = array_slice($sites, 0, 5);
    $conf = $n >= 30 ? 'high' : ($n >= 10 ? 'medium' : 'low');
    Response::json([ 'scope_note' => $GLOBALS['hb_scope_note'] ?? null,
        'n' => $n, 'confidence' => $conf,
        'note' => $conf === 'low' ? "표본 {$n}곳 — 채택률은 참고만 하고 근거로 인용하지 마세요(30곳 이상부터 안정)." : "게시 사이트 {$n}곳 가중 합성",
        'filters' => array_intersect_key($_GET, array_flip(['org_type', 'tone', 'renewal_from', 'krds_min'])),
        'weights' => $W,
        'layout' => ['header_type' => $dist($sites, 'header_type'), 'lnb_position' => $dist($sites, 'lnb_position'), 'container_px' => ['median' => $median(array_column($sites, 'container_px')), 'dist' => $dist($sites, 'container_px')], 'radius_px' => ['median' => $median(array_column($sites, 'radius_px'))], 'shadow_pct' => round(array_sum(array_map(static fn ($s): int => (int) $s['shadow'], $sites)) / $n * 100, 1), 'icon_style' => $dist($sites, 'icon_style')],
        'color' => ['tone' => $dist($sites, 'tone'), 'primary_samples' => array_values(array_filter(array_unique(array_column($top, 'primary_hex'))))],
        'typography' => ['font_body' => $dist($fontBody, 'font_body'), 'body_size_px' => ['median' => $median($bodySize), 'min' => $bodySize ? min($bodySize) : null, 'max' => $bodySize ? max($bodySize) : null], 'body_line_height' => ['median' => $median($lh)], 'h2_size_px' => ['median' => $median($h2Size), 'n' => count($h2Size)]],
        'spacing' => ['section_gap_px' => ['median' => $median($gap), 'n' => count($gap)], 'button_height_px' => ['median' => $median($btnH)]],
        'section_sequence' => $seq,
        'krds_adoption' => $krds,
        'wa_certified_pct' => round(array_sum(array_map(static fn ($s): int => (int) $s['wa_certified'], $sites)) / $n * 100, 1),
        'top_references' => array_map(static fn (array $s): array => ['slug' => $s['slug'], 'title' => $s['title'], 'org_type' => $s['org_type_id'], 'score' => round((float) $s['score'], 3), 'rating' => $s['rating_avg'] === null ? null : (float) $s['rating_avg'], 'krds_score' => $s['krds_score'] === null ? null : (float) $s['krds_score'], 'renewal_year' => $s['renewal_year'] === null ? null : (int) $s['renewal_year'], 'tone' => $s['tone'], 'primary' => $s['primary_hex'], 'header_type' => $s['header_type']], $top),
        'attribution' => '집계는 게시된 관공서 사이트의 공개 화면에서 자동 추출한 값. 개별 출처는 top_references 의 slug → get_site.',
    ], 200, ['Cache-Control' => 'public, max-age=300']);
});

// ---------------------------------------------------------------------------------------------------------------
$router->get('/api/insights/section', static function () use ($scope, $scoreSql, $FROM, $W, $dist, $median): void {
    $type = preg_replace('/[^a-z_]/', '', (string) ($_GET['type'] ?? ''));
    if ($type === '' || Db::row('SELECT id FROM section_types WHERE id = ?', [$type]) === null) {
        Response::error(422, 'INVALID_TYPE', 'type 은 section_types.id 여야 합니다 (예: news_tabs, quick_links, main_visual).');
    }
    $device = in_array((string) ($_GET['device'] ?? 'pc'), ['pc', 'mobile'], true) ? (string) ($_GET['device'] ?? 'pc') : 'pc';
    [$where, $params] = $scope();
    $rows = Db::rows("SELECT x.id, x.variant, x.bbox_y, x.bbox_h, x.bbox_w, x.confidence, x.structure, x.crop_asset_id, sc.id AS screen_id, sc.full_h, sc.page_type_id,
                             s.id AS site_id, s.slug, s.title, {$scoreSql($W)} AS score,
                             (SELECT JSON_ARRAYAGG(k.component_id) FROM section_krds k WHERE k.section_id = x.id) AS krds
                      FROM sections x JOIN screens sc ON sc.id = x.screen_id JOIN sites s ON s.id = sc.site_id JOIN organizations o ON o.id = s.org_id JOIN org_types ot ON ot.id = o.org_type_id LEFT JOIN site_design d ON d.site_id = s.id
                      WHERE $where AND sc.status = 'published' AND sc.device = ? AND x.section_type_id = ? AND x.crop_asset_id IS NOT NULL
                      ORDER BY score DESC, x.confidence DESC", array_merge($params, [$device, $type]));
    $n = count($rows);
    $sitesN = count(array_unique(array_column($rows, 'site_id')));
    $flagsN = ['tablist' => 0, 'carousel' => 0, 'table' => 0, 'form' => 0, 'pagination' => 0];
    $krdsN = [];
    $hs = []; $ys = []; $styles = [];
    foreach ($rows as $r) {
        $st = SectionShape::structure($r['structure'] ?? null);
        if (isset($st['style'])) { $styles[] = $st['style']; }
        foreach ($flagsN as $k => $_) { if (!empty($st['flags'][$k])) { $flagsN[$k]++; } }
        foreach (is_string($r['krds']) ? (json_decode($r['krds'], true) ?: []) : [] as $c) { $krdsN[$c] = ($krdsN[$c] ?? 0) + 1; }
        $hs[] = (float) $r['bbox_h'];
        if ((int) $r['full_h'] > 0) { $ys[] = round((float) $r['bbox_y'] / (float) $r['full_h'], 3); }
    }
    arsort($krdsN);
    // 상위 사이트 1곳당 크롭 1개(중복 방지), 최대 6개 — 플랜 게이트 적용
    $plan = Plan::current();
    $exemplars = []; $used = [];
    foreach ($rows as $r) {
        if (isset($used[$r['site_id']]) || count($exemplars) >= 6) { continue; }
        $used[$r['site_id']] = true;
        $ok = Plan::canSee(Plan::allowedScreens((int) $r['site_id'], $plan), (int) $r['screen_id']);
        $exemplars[] = ['slug' => $r['slug'], 'title' => $r['title'], 'score' => round((float) $r['score'], 3), 'section_id' => (int) $r['id'], 'screen_id' => (int) $r['screen_id'], 'page_type' => $r['page_type_id'], 'variant' => $r['variant'], 'w' => (int) $r['bbox_w'], 'h' => (int) $r['bbox_h'], 'structure' => SectionShape::structure($r['structure'] ?? null), 'locked' => !$ok, 'crop_url' => $ok ? Plan::kurl((int) $r['site_id'], $r['crop_asset_id']) : null];
    }
    $conf = $sitesN >= 30 ? 'high' : ($sitesN >= 10 ? 'medium' : 'low');
    Response::json([ 'scope_note' => $GLOBALS['hb_scope_note'] ?? null,
        'section_type' => $type, 'device' => $device, 'n_sections' => $n, 'n_sites' => $sitesN, 'confidence' => $conf,
        'note' => $conf === 'low' ? "표본 {$sitesN}곳 — 분포는 참고만." : "{$sitesN}곳 · 섹션 {$n}개 합성",
        'variants' => $dist($rows, 'variant'),
        'height_px' => ['median' => $median($hs), 'p25' => $hs ? $median(array_slice((static function (array $a): array { sort($a); return $a; })($hs), 0, max(1, intdiv(count($hs), 2)))) : null, 'p75' => $hs ? $median(array_slice((static function (array $a): array { sort($a); return $a; })($hs), intdiv(count($hs), 2))) : null],
        'position_ratio' => ['median' => $median($ys), 'note' => '0=페이지 최상단, 1=최하단 (full_h 대비 bbox_y)'],
        'style' => SectionShape::styleSummary($styles),
        'structure_flags_pct' => array_map(static fn (int $v): float => $n ? round($v / $n * 100, 1) : 0, $flagsN),
        'krds_components' => array_map(static fn (string $k, int $v): array => ['id' => $k, 'count' => $v, 'pct' => $n ? round($v / $n * 100, 1) : 0], array_keys($krdsN), $krdsN),
        'exemplars' => $exemplars,
        'gate' => Plan::info($plan, $plan['limits']['screens_per_site'] < 0 ? null : [], 0),
        'attribution' => '출처는 exemplars 의 기관 사이트. 홈박스는 저작권을 주장하지 않으며 참고용입니다.',
    ], 200, ['Cache-Control' => $plan['logged_in'] ? 'private, no-store' : 'public, max-age=120']);
});

// ---------------------------------------------------------------------------------------------------------------
$router->get('/api/insights/references', static function () use ($scope, $scoreSql, $FROM, $W): void {
    [$where, $params] = $scope();
    $limit = max(1, min(20, (int) ($_GET['limit'] ?? 5)));
    $rows = Db::rows("SELECT s.slug, s.title, s.renewal_year, s.wa_certified, s.krds_score, s.rating_avg, s.rating_count, s.view_count, COALESCE(o.display_name, o.name) AS org_name, o.org_type_id, ot.name_ko AS org_type_ko,
                             d.tone, d.primary_hex, d.header_type, d.lnb_position, d.container_px, d.fonts, {$scoreSql($W)} AS score
                      $FROM WHERE $where ORDER BY score DESC, s.id LIMIT $limit", $params);
    $items = array_map(static function (array $s) use ($W): array {
        $why = [];
        if ($s['rating_avg'] !== null) { $why[] = sprintf('사용자 평가 %.1f/5 (%d명)', (float) $s['rating_avg'], (int) $s['rating_count']); }
        if ($s['krds_score'] !== null && (float) $s['krds_score'] >= 80) { $why[] = sprintf('KRDS 준수 %d%%', (int) round((float) $s['krds_score'])); }
        if ($s['renewal_year'] !== null && (int) $s['renewal_year'] >= (int) date('Y') - 1) { $why[] = $s['renewal_year'] . '년 개편(최신)'; }
        if ((int) $s['wa_certified'] === 1) { $why[] = '웹접근성 인증'; }
        if ((int) $s['view_count'] >= 100) { $why[] = '조회 ' . number_format((int) $s['view_count']); }
        $fonts = is_string($s['fonts']) ? (json_decode($s['fonts'], true) ?: []) : [];
        $body = null;
        foreach ($fonts as $f) { if (($f['role'] ?? '') === 'body') { $body = Design::family($f['family'] ?? null); break; } }
        return ['slug' => $s['slug'], 'title' => $s['title'], 'org' => $s['org_name'], 'org_type' => $s['org_type_id'], 'org_type_ko' => $s['org_type_ko'], 'score' => round((float) $s['score'], 3), 'why' => $why ?: ['평가·인증 정보 없음 — 개편연도·KRDS 로만 순위'],
            'design' => ['tone' => $s['tone'], 'primary' => $s['primary_hex'], 'header_type' => $s['header_type'], 'lnb_position' => $s['lnb_position'], 'container_px' => $s['container_px'] === null ? null : (int) $s['container_px'], 'font_body' => $body],
            'page_url' => '/sites/' . $s['slug']];
    }, $rows);
    Response::json(['n' => count($items), 'scope_note' => $GLOBALS['hb_scope_note'] ?? null, 'weights' => $W, 'items' => $items, 'attribution' => '출처는 각 항목의 slug → get_site. 홈박스는 저작권을 주장하지 않으며 참고용입니다.'], 200, ['Cache-Control' => 'public, max-age=120']);
});

// 페이지 유형 합성 (2026-09-24) — 같은 스코프 변수($scope·$scoreSql·$W·$median) 공유
require __DIR__ . '/insights_page.php';

<?php
declare(strict_types=1);

/**
 * GET /api/mockups/replica?org_type=&ref=slug&rank=&org_name=&primary=%23RRGGBB&font=&page=main|board_list|…
 *   재현 묶음 — 레퍼런스 화면의 캡처·섹션 좌표·구성 + 샘플 이미지·아이콘·동작 스크립트·제작 절차·검사 기준 (Pro). MCP get_replica_kit.
 *   AI 가 이 재료로 "레퍼런스와 같은 배치 + 가상 내용 + 실제로 동작하는" 시안을 직접 만든다.
 * GET /api/mockups/behavior — 동작 스크립트와 규약만 (누구나)
 * @var Homebox\Http\Router $router
 */

use Homebox\Db;
use Homebox\Http\Response;
use Homebox\Plan;
use Homebox\ReplicaKit;
use Homebox\SampleContent;

$router->get('/api/mockups/replica', static function (): void {
    $plan = Plan::current();
    if (($plan['limits']['design_data'] ?? 'summary') !== 'full' && empty($plan['admin'])) {
        Response::error(402, 'UPGRADE_REQUIRED', '재현 묶음은 Pro 이상에서 제공합니다.', ['plan' => $plan['id']]);
    }
    // 와이어(2026-10-18 고도화 2단계) — 주면 배치의 기준이 와이어가 된다(줄 순서·칸 폭·칸 종류). 화면 종류는 와이어 것, 기관 유형이 비면 와이어 묶음의 기본 유형
    $wire = null; $wireNote = null;
    if (isset($_GET['wire']) && (string) $_GET['wire'] !== '') {
        $wire = ReplicaKit::parseWire((string) $_GET['wire']);
        if ($wire === null) { Response::error(400, 'BAD_WIRE', 'wire 는 {screen, org, lnb, rows:[{zone, cols:[{k, span}]}]} 형식의 JSON 입니다(줄 40·칸 6 이하, span 1~12).'); }
    }
    $ot = homebox_infer_ot(trim((string) ($_GET['org_type'] ?? '')), (string) ($_GET['org_name'] ?? ''));
    if ($ot === '' && $wire !== null) { $ot = ReplicaKit::WIRE_ORG_TYPE[$wire['org']] ?? ''; }
    $main = homebox_main_ref($ot, trim((string) ($_GET['ref'] ?? '')), (int) ($_GET['rank'] ?? 1));
    if ($main === null) { Response::error(404, 'NOT_FOUND', '조건에 맞는 레퍼런스가 없습니다.'); }
    $page = trim((string) ($_GET['page'] ?? 'main'));
    if ($wire !== null && $page !== $wire['screen']) {
        if (isset($_GET['page']) && $page !== '' && $page !== 'main') { $wireNote = 'page(' . $page . ')와 와이어 화면(' . $wire['screen'] . ')이 달라 와이어 화면으로 만들었다.'; }
        $page = $wire['screen'];
    }
    $isSub = $page !== '' && $page !== 'main';
    $sc = $main;
    if ($page !== '' && $page !== 'main') {
        $sc = homebox_sub_ref($page, (int) $main['site_id'], (string) $main['org_type'], true);
        if ($sc === null) { Response::error(404, 'NOT_FOUND', '그 유형의 서브 레퍼런스 화면이 없습니다.'); }
    }
    $primary = strtoupper(trim((string) ($_GET['primary'] ?? '')));
    if ($primary !== '' && !preg_match('/^#[0-9A-F]{6}$/', $primary)) { Response::error(400, 'BAD_PRIMARY', 'primary 는 #RRGGBB 형식입니다.'); }
    $custom = [];
    if ($primary !== '') { $custom['primary'] = $primary; }
    $font = mb_substr(trim((string) ($_GET['font'] ?? '')), 0, 40);
    if ($font !== '') { $custom['font'] = $font; }
    $lq = (string) ($_GET['lang'] ?? ''); // 제작 언어(2026-10-12) — 화면 글·메뉴·가상 기관 이름을 이 언어로
    if ($lq !== '' && $lq !== 'ko') { if (!isset(ReplicaKit::LANGS[$lq])) { Response::error(400, 'BAD_LANG', 'lang 은 ko·en·ja·zh·fr·es·de·vi 중 하나입니다.'); } $custom['lang'] = $lq; }
    $wq = (int) ($_GET['width'] ?? 0); // 요청 폭(2026-10-11) — 없으면 PC 본문 최소 1400px
    if ($wq > 0) { if ($wq < 960 || $wq > 1880) { Response::error(400, 'BAD_WIDTH', 'width 는 960~1880 사이 px 입니다.'); } $custom['width'] = $wq; }
    $is = trim((string) ($_GET['icon_style'] ?? '')); // 아이콘 스타일(O-22) — 없으면 지금처럼 AI 가 주색에 맞춰 하나 고른다
    if ($is !== '') {
        $allowed = Homebox\Samples::iconStyles();
        if (!in_array($is, $allowed, true)) { Response::error(400, 'BAD_ICON_STYLE', 'icon_style 은 ' . implode('·', $allowed) . ' 중 하나입니다.', ['allowed' => $allowed]); }
        $custom['icon_style'] = $is;
        Homebox\Samples::forceIconStyle($is);
    }

    $extra = Db::row('SELECT full_h, public_asset_id FROM screens WHERE id = ?', [(int) $sc['id']]) ?? [];
    $sc['full_h'] = (int) ($extra['full_h'] ?? 0);
    $sc['public_asset_id'] = $extra['public_asset_id'] ?? null;
    $rows = Db::rows('SELECT id, section_type_id AS type, bbox_x AS x, bbox_y AS y, bbox_w AS w, bbox_h AS h, structure FROM sections WHERE screen_id = ? ORDER BY bbox_y, bbox_x', [(int) $sc['id']]);

    // 가상 기관: 고객 기관명이 오면 그 종류(시·군·구·도…)에 맞춘다. 메인과 서브가 같은 기관이 되도록 메인 레퍼런스 기준으로 고른다.
    $on = homebox_client_org((string) ($_GET['org_name'] ?? ''));
    $persona = SampleContent::persona($ot !== '' ? $ot : (string) ($main['org_type'] ?? ''), $on !== '' ? $on : (string) $main['org_name']); // 요청·짐작한 종류 먼저
    if ($on !== '') { $persona = SampleContent::clientNamed($persona, $on); } // 고객 기관명은 그대로 쓴다(직함·호칭만 종류로)

    // 섞기 출처(2026-10-02 사용자 결정): 메인은 A + 같은 기관 유형의 다른 사이트 B·C 의 줄을 섞는다. 서브도 같은 B·C 로 색을 정한다.
    $others = (string) ($_GET['mix'] ?? '1') === '0' ? [] : homebox_mix_refs($ot, $main, (int) ($_GET['rank'] ?? 1));
    // 주색: 고객 색이 없으면 레퍼런스들의 주색과 다른 색을 고른다(원본 기관 색을 쓰지 않는다 — CLAUDE.md §9). 메인·서브가 같은 색이 되게 메인 레퍼런스 기준으로.
    if (!isset($custom['primary'])) {
        $hexes = [];
        foreach ([$main, ...$others] as $r) {
            $mp = Homebox\Design::primary($r['primary_hex'] ?? null, is_string($r['palette'] ?? null) ? (json_decode((string) $r['palette'], true) ?: []) : (array) ($r['palette'] ?? []));
            if (!empty($mp['hex'])) { $hexes[] = (string) $mp['hex']; }
        }
        $custom['primary'] = ReplicaKit::pickPrimary($hexes, (string) $persona['org']);
        $custom['primary_source'] = '홈박스가 레퍼런스들의 주색과 다른 색으로 골랐다(고객 색을 받으면 그 색으로 바꾼다)';
    }
    $mix = null;
    if ($wire !== null) {
        // 와이어 배치: A(메인 = 고른 레퍼런스, 서브 = 그 유형 화면) + 메인은 같은 유형의 다른 사이트 B·C… 를 칸 재료로. 그래도 없는 종류는 다른 화면에서 찾는다
        $refs = [['label' => 'A', 'sc' => $sc, 'secs' => ReplicaKit::prepSecs($sc, $rows, $persona)]];
        foreach ($isSub ? [] : homebox_mix_refs($ot, $main, (int) ($_GET['rank'] ?? 1), 4) as $o) {
            $orows = Db::rows('SELECT id, section_type_id AS type, bbox_x AS x, bbox_y AS y, bbox_w AS w, bbox_h AS h, structure FROM sections WHERE screen_id = ? ORDER BY bbox_y, bbox_x', [(int) $o['id']]);
            $refs[] = ['sc' => $o, 'secs' => ReplicaKit::prepSecs($o, $orows, $persona)];
        }
        $pt = (string) ($sc['page_type'] ?? 'main');
        $found = [];
        $find = static function (string $k, int $span, array $have, int $h = 0) use ($pt, $sc, $ot, $persona, &$found): ?array {
            $r = homebox_wire_find($k, $pt, (string) ($sc['org_type'] ?? $ot), $have, $persona, $span, $h);
            if ($r !== null) { $found[] = $r['sc']; }
            return $r;
        };
        $mix = ReplicaKit::wirePlan($wire, $refs, (int) ($sc['viewport_w'] ?? 1920), $find, (string) ($_GET['wire_ref'] ?? '-'));
        $caps = [];
        foreach ($mix['pieces'] as &$pc) {
            $caps[$pc['screen_id']] ??= Db::row('SELECT public_asset_id, site_id FROM screens WHERE id = ?', [$pc['screen_id']]) ?? [];
            $pc['capture_url'] = Plan::kurl((int) ($caps[$pc['screen_id']]['site_id'] ?? 0), $caps[$pc['screen_id']]['public_asset_id'] ?? null);
            $why = Plan::koglWithheld((int) ($caps[$pc['screen_id']]['site_id'] ?? 0));
            if ($why !== null) { $pc['image_withheld'] = $why; }
        }
        unset($pc);
        // 출처 표시는 실제로 칸 재료로 쓴 화면만
        $usedIds = array_flip(array_map(static fn ($s) => (int) $s['screen_id'], $mix['sources']));
        $others = array_values(array_filter([...array_map(static fn ($r) => $r['sc'], array_slice($refs, 1)), ...$found], static fn ($o) => isset($usedIds[(int) $o['id']])));
    } elseif (!$isSub && $others) {
        $refs = [['label' => 'A', 'sc' => $sc, 'secs' => ReplicaKit::prepSecs($sc, $rows, $persona)]];
        foreach ($others as $i => $o) {
            $orows = Db::rows('SELECT id, section_type_id AS type, bbox_x AS x, bbox_y AS y, bbox_w AS w, bbox_h AS h, structure FROM sections WHERE screen_id = ? ORDER BY bbox_y, bbox_x', [(int) $o['id']]);
            $refs[] = ['label' => $i === 0 ? 'B' : 'C', 'sc' => $o, 'secs' => ReplicaKit::prepSecs($o, $orows, $persona)];
        }
        $mix = ReplicaKit::mixPlan($refs, (int) ($sc['viewport_w'] ?? 1920));
        if (($mix['replaced'] ?? 0) === 0) { $mix = null; } // 바꿔 끼울 줄이 하나도 없으면 단일
        else {
            $caps = [];
            foreach ($mix['pieces'] as &$pc) {
                $caps[$pc['screen_id']] ??= Db::row('SELECT public_asset_id, site_id FROM screens WHERE id = ?', [$pc['screen_id']]) ?? [];
                $pc['capture_url'] = Plan::kurl((int) ($caps[$pc['screen_id']]['site_id'] ?? 0), $caps[$pc['screen_id']]['public_asset_id'] ?? null);
                // 공공누리 2~4유형 조각은 참고 이미지 없이 좌표로만 — 이유를 조각에 싣는다(O-04, MCP images_missing 이 이 값을 읽을 수 있게)
                $why = Plan::koglWithheld((int) ($caps[$pc['screen_id']]['site_id'] ?? 0));
                if ($why !== null) { $pc['image_withheld'] = $why; }
            }
            unset($pc);
        }
    }
    $kit = ReplicaKit::build($sc, $rows, $persona, $custom, $mix);
    if ($isSub) {
        $same = (int) $sc['site_id'] === (int) $main['site_id'];
        $kit['consistency'] = [
            'main_site' => $main['slug'], 'this_site' => $sc['slug'], 'same_site' => $same,
            'rule' => $same
                ? '메인과 같은 사이트의 서브 화면이다. 머리·주 메뉴·바닥은 메인 시안 것을 그대로 쓰고, 서브 비주얼·옆 메뉴·본문 폭은 sub_shell 한 가지로, 본문 칸 안쪽 구성만 이 화면을 따른다.'
                : '메인과 다른 사이트의 화면이다(메인 사이트에 이 유형이 없었다). 머리·주 메뉴·바닥은 메인 시안에, 서브 비주얼·옆 메뉴·본문 폭은 sub_shell 한 가지에 맞추고(이 화면의 옆 메뉴 위치·모양·폭은 따르지 않는다), 이 화면에서는 본문 칸 안쪽 구성(블록 순서·표·카드·사진 배치)만 따른다.',
        ];
    }
    $srcs = $mix !== null ? [$sc, ...$others] : [$sc];
    Response::json($kit + ($wireNote !== null ? ['wire_note' => $wireNote] : []) + [
        'usage' => $wire !== null
            ? '이 묶음으로 시안을 직접 만든다. 배치는 사용자 와이어(reference.wire.rows — 줄 순서·칸 수·칸 폭·칸 종류)를 그대로 따르고, 칸 안 그리는 법은 그 칸의 재료 섹션(sections·참고 이미지 조각)에서 읽는다. 글·이미지·색은 persona·samples·theme 로 전부 바꾼다. 본문 줄·칸에 data-wire-row·data-wire-cell 을 단다(reference.wire.markup). 조작 요소는 behavior 규약으로 실제 동작하게 만든다. procedure 순서대로 하고 acceptance 로 확인한다.'
            : '이 묶음으로 시안을 직접 만든다. 배치는 참고 이미지와 rows·sections 를 그대로 따르고, 글·이미지·색은 persona·samples·theme 로 전부 바꾼다. 조작 요소는 behavior 규약으로 실제 동작하게 만든다. procedure 순서대로 하고 acceptance 로 확인한다.',
        'attribution' => '배치 출처: ' . implode(', ', array_map(static fn ($r) => $r['org_name'] . ' (' . $r['url'] . ')', $srcs)) . '. 홈박스는 저작권을 주장하지 않으며 참고용입니다. 그 기관들의 글·사진·로고는 쓰지 않습니다.',
    ], 200, ['Cache-Control' => 'private, no-store']);
});

/** 섞기 출처 B·C — A 와 같은 기관 유형에서 A 다음 순위의 다른 사이트(다른 기관) 2곳(와이어 배치는 칸 재료를 넓히려 4곳). */
function homebox_mix_refs(string $ot, array $main, int $rank, int $max = 2): array
{
    $use = $ot !== '' ? $ot : (string) ($main['org_type'] ?? '');
    $out = []; $seen = [(int) $main['site_id'] => true]; $names = [(string) $main['org_name'] => true];
    for ($r = 1; $r <= 30 && count($out) < $max; $r++) {
        $o = homebox_main_ref($use, '', max(1, $rank) + $r);
        if ($o === null) { break; }
        if (isset($seen[(int) $o['site_id']]) || isset($names[(string) $o['org_name']])) { continue; }
        $seen[(int) $o['site_id']] = true; $names[(string) $o['org_name']] = true;
        $out[] = $o;
    }
    return $out;
}

/**
 * 와이어 칸 재료 찾기 — A·B·C… 에 그 종류 섹션이 없을 때 같은 화면 종류의 다른 게시 화면에서 한 장(같은 기관 묶음 먼저, 평가 순).
 * 너무 작은 조각(폭 200·높이 60 미만)은 고르지 않는다. 이미 쓴 화면($have)은 뺀다.
 * @return array{sc: array, secs: list<array>}|null
 */
function homebox_wire_find(string $k, string $pt, string $ot, array $have, array $persona, int $span = 12, int $h = 0): ?array
{
    $minH = max(60, (int) round(0.35 * $h)); $maxH = $h > 0 ? 3 * $h : 99999;
    $fam = $ot !== '' ? explode('_', $ot)[0] . '%' : '%';
    $minW = max(200, (int) round(0.5 * $span / 12 * 1200)); // 와이어 칸 폭에 견줄 만한 섹션만(ReplicaKit wirePlan 의 usable 과 같은 뜻)
    // 두 단계(2026-10-18 로컬 실측: sections 를 종류로 먼저 훑는 한 방 질의가 35~45초) — ① 그 화면 종류의 상위 120장(요청 안에서 한 번)
    // ② 그 화면들 안에서만 종류·크기로 찾는다(sections 의 screen_id 색인). 칸이 여럿이어도 ① 은 한 번이다
    static $cand = [];
    $key = $pt . '|' . $fam;
    $cand[$key] ??= array_map('intval', array_column(Db::rows("SELECT sc.id FROM screens sc JOIN sites s ON s.id = sc.site_id JOIN organizations o ON o.id = s.org_id
        WHERE sc.page_type_id = ? AND sc.status = 'published' AND sc.device = 'pc' AND s.status = 'published' AND " . Homebox\RefFilter::NOT_FOREIGN . "
        ORDER BY (o.org_type_id LIKE ?) DESC, (s.rating_avg IS NULL), s.rating_avg DESC, s.krds_score DESC, sc.id LIMIT 120", [$pt, $fam]), 'id'));
    $ids = array_values(array_diff($cand[$key], array_map('intval', $have)));
    if (!$ids) { return null; }
    $hit = array_flip(array_map('intval', array_column(Db::rows('SELECT DISTINCT screen_id FROM sections WHERE screen_id IN (' . implode(',', $ids) . ') AND section_type_id = ? AND bbox_w >= ? AND bbox_h >= ? AND bbox_h <= ? AND bbox_x >= 0', [$k, $minW, $minH, $maxH]), 'screen_id')));
    $pick = null;
    foreach ($ids as $id) { if (isset($hit[$id])) { $pick = $id; break; } }
    if ($pick === null) { return null; }
    $sc = Db::row('SELECT sc.id, sc.site_id, sc.status, sc.url, sc.title, sc.page_type_id AS page_type, sc.viewport_w, sc.device, s.slug,
            COALESCE(o.display_name, o.name) AS org_name, o.org_type_id AS org_type, d.primary_hex, d.palette, d.fonts, d.radius_px, d.container_px
        FROM screens sc JOIN sites s ON s.id = sc.site_id JOIN organizations o ON o.id = s.org_id LEFT JOIN site_design d ON d.site_id = s.id WHERE sc.id = ?', [$pick]);
    if ($sc === null) { return null; }
    $rows = Db::rows('SELECT id, section_type_id AS type, bbox_x AS x, bbox_y AS y, bbox_w AS w, bbox_h AS h, structure FROM sections WHERE screen_id = ? ORDER BY bbox_y, bbox_x', [(int) $sc['id']]);
    return ['sc' => $sc, 'secs' => ReplicaKit::prepSecs($sc, $rows, $persona)];
}

/**
 * 빠른 초안(/api/mockups/main·/site)용 와이어 배치 — wirePlan 결과를 조립기(MainLayout)가 읽는 섹션 줄로.
 * A 는 수집 구성(메뉴·탭 이름)을 그대로 두고(실제 기관명은 조립기가 persona.real 로 지운다), B·C… 는 prepSecs 로 원문을 뺀다.
 * 칸 하나 = 섹션 하나로 합친다 — 조립기는 섹션마다 칸을 만들어, 카드 4장 묶음이 칸 4개가 되면 와이어 칸 수와 어긋난다.
 * @return array{rows: list<array>, ref_id: string, tally: array, sources: list<array>}
 */
function homebox_wire_main_rows(array $wire, array $sc, string $ot, int $rank, string $wref): array
{
    $persona = SampleContent::persona($ot !== '' ? $ot : (string) ($sc['org_type'] ?? ''), (string) ($sc['persona_name'] ?? $sc['org_name']));
    $q = 'SELECT id, section_type_id AS type, bbox_x AS x, bbox_y AS y, bbox_w AS w, bbox_h AS h, structure FROM sections WHERE screen_id = ? ORDER BY bbox_y, bbox_x';
    $raw = Db::rows($q, [(int) $sc['id']]);
    $secsA = ReplicaKit::prepSecs($sc, $raw, $persona);
    foreach ($secsA as &$s) {
        $r0 = $raw[$s['no'] - 1] ?? null;
        if ($r0 !== null) { $s['structure'] = is_string($r0['structure']) ? (json_decode($r0['structure'], true) ?: []) : (array) $r0['structure']; }
    }
    unset($s);
    $refs = [['label' => 'A', 'sc' => $sc, 'secs' => $secsA]];
    foreach (homebox_mix_refs($ot, $sc, $rank, 4) as $o) { $refs[] = ['sc' => $o, 'secs' => ReplicaKit::prepSecs($o, Db::rows($q, [(int) $o['id']]), $persona)]; }
    $find = static fn (string $k, int $span, array $have, int $h = 0): ?array => homebox_wire_find($k, 'main', (string) ($sc['org_type'] ?? $ot), $have, $persona, $span, $h);
    $plan = ReplicaKit::wirePlan($wire, $refs, (int) ($sc['viewport_w'] ?? 1920), $find, $wref);
    $out = []; $cells = [];
    foreach ($plan['secs'] as $s) {
        if ((int) ($s['wire_col'] ?? 0) === 0) { $out[] = $s; continue; } // 머리·바닥(A 그대로)
        $key = $s['wire_row'] . ':' . $s['wire_col'];
        if (!isset($cells[$key])) { $cells[$key] = $s + ['_a' => $s['w'] * $s['h']]; continue; }
        $c = $cells[$key];
        $x2 = max($c['x'] + $c['w'], $s['x'] + $s['w']); $y2 = max($c['y'] + $c['h'], $s['y'] + $s['h']);
        $c['x'] = min($c['x'], $s['x']); $c['y'] = min($c['y'], $s['y']); $c['w'] = $x2 - $c['x']; $c['h'] = $y2 - $c['y'];
        if ($s['w'] * $s['h'] > $c['_a']) { $c['structure'] = $s['structure']; $c['_a'] = $s['w'] * $s['h']; }
        $cells[$key] = $c;
    }
    foreach ($cells as $c) { unset($c['_a']); $out[] = $c; }
    usort($out, static fn ($a, $b) => [$a['y'], $a['x']] <=> [$b['y'], $b['x']]);
    $rows = array_map(static fn (array $s): array => ['id' => 0, 'type' => $s['type'], 'x' => $s['x'], 'y' => $s['y'], 'w' => $s['w'], 'h' => $s['h'], 'structure' => $s['structure'] ?? [],
        'wire_row' => (int) ($s['wire_row'] ?? 0), 'wire_col' => (int) ($s['wire_col'] ?? 0)], $out);
    return ['rows' => $rows, 'ref_id' => $plan['ref_id'], 'tally' => $plan['wire']['tally'], 'sources' => $plan['sources']];
}

/** 빠른 초안 와이어 인자 — 메인 와이어만(서브 화면 와이어는 mock_get_replica_kit 으로). 없으면 null, 틀리면 400 */
function homebox_wire_param(): ?array
{
    if (!isset($_GET['wire']) || (string) $_GET['wire'] === '') { return null; }
    $w = ReplicaKit::parseWire((string) $_GET['wire']);
    if ($w === null) { Response::error(400, 'BAD_WIRE', 'wire 는 {screen, org, lnb, rows:[{zone, cols:[{k, span}]}]} 형식의 JSON 입니다(줄 40·칸 6 이하, span 1~12).'); }
    if ($w['screen'] !== 'main') { Response::error(400, 'BAD_WIRE', '빠른 초안은 메인 와이어만 받습니다. 서브 화면 와이어는 재현 묶음(mock_get_replica_kit, wire_id)으로 만든다.'); }
    return $w;
}

$router->get('/api/mockups/behavior', static function (): void {
    Response::json([
        'contract' => (string) @file_get_contents(__DIR__ . '/../data/hb-behavior.md'),
        'script' => (string) @file_get_contents(__DIR__ . '/../data/hb-behavior.js'),
        'how' => 'check_mockup 으로 판정할 시안은 </body> 앞에 <script data-hb-behavior></script> 한 줄만 넣는다(홈박스가 채운다). 파일로만 저장할 때는 script 를 <script> 안에 그대로 넣는다. contract 의 data-hb 속성을 마크업에 붙인다.',
    ], 200, ['Cache-Control' => 'public, max-age=300']);
});

// GET /api/mockups/check-ref?screen_id= — 시안 판정 기준(MCP check_mockup). Pro·관리자. 레퍼런스 글은 주지 않는다(누출 검사 문자열만).
$router->get('/api/mockups/check-ref', static function (): void {
    $plan = Plan::current();
    $admin = !empty($plan['admin']);
    if (!$admin) {
        $tok = (string) ($_SERVER['HTTP_X_ADMIN_TOKEN'] ?? '');
        $admin = $tok !== '' && hash_equals((string) Config::get('admin.token', ''), $tok);
    }
    if (($plan['limits']['design_data'] ?? 'summary') !== 'full' && !$admin) {
        Response::error(402, 'UPGRADE_REQUIRED', '시안 판정은 Pro 이상에서 제공합니다.', ['plan' => $plan['id']]);
    }
    $rid = trim((string) ($_GET['ref_id'] ?? ''));
    $single = str_starts_with($rid, 'single:');
    if ($single) { $rid = substr($rid, 7); }
    // 판정 전용 원본(O-45): powerMCP 판정기가 서명했을 때만 공공누리 2~4유형 화면도 judge_url(2분 만료)을 싣는다
    $judge = homebox_judge_signed($rid !== '' ? (string) ($_GET['ref_id'] ?? '') : (string) ($_GET['screen_id'] ?? ''));
    $ref = str_starts_with($rid, 'mix1:') ? ReplicaKit::checkRefMix($rid, $judge)
        : (str_starts_with($rid, 'wire1:') ? ReplicaKit::checkRefWire($rid, $judge) // 와이어 묶음 — 줄·칸 대조는 MCP 가 와이어로, 여기선 누출 문자열·서브 구간만
        : ReplicaKit::checkRef((int) ($rid !== '' ? $rid : ($_GET['screen_id'] ?? 0)), $judge));
    // 메인 화면 한 장을 숫자 id 로 판정하려는 경우 = 한 사이트를 통째로 따른 시안(2026-10-02 섞기로 전환). 묶음이 single: 로 준 경우와 관리자 점검만 허용한다.
    if ($ref !== null && !empty($ref['single_main']) && !$single && empty($_GET['screen_id'])) { $ref['copy_risk'] = true; }
    if ($ref === null) { Response::error(404, 'NOT_FOUND', '판정 기준을 찾지 못했습니다. get_replica_kit 응답의 reference.ref_id 를 그대로 주세요.'); }
    Response::json($ref, 200, ['Cache-Control' => 'private, no-store']);
});

/**
 * 판정기 서명 확인(O-45, 2026-10-15) — powerMCP 가 X-Pp-Judge-Ts(유닉스 초) + X-Pp-Judge-Ref = HMAC-SHA256(judge.secret, "ref|{ref_id}|{ts}") hex 를 실어 보낸다.
 * 비밀은 플랫폼 mock.judge_secret·powerMCP PP_JUDGE_SECRET 과 같은 값. 비었으면 늘 false(원본 미제공 유지) + error_log. 시각은 ±300초만 받는다.
 */
function homebox_judge_signed(string $refId): bool
{
    $sig = strtolower(trim((string) ($_SERVER['HTTP_X_PP_JUDGE_REF'] ?? '')));
    if ($sig === '') { return false; }
    $secret = (string) Config::get('judge.secret', '');
    if ($secret === '') { error_log('[mockref] check-ref: 판정 서명이 왔지만 config judge.secret 이 비어 judge_url 을 싣지 않는다'); return false; }
    $ts = (int) ($_SERVER['HTTP_X_PP_JUDGE_TS'] ?? 0);
    if ($ts <= 0 || abs(time() - $ts) > 300) { return false; }
    return hash_equals(hash_hmac('sha256', 'ref|' . $refId . '|' . $ts, $secret), $sig);
}

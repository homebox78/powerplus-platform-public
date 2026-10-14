<?php
declare(strict_types=1);

/**
 * GET /api/screens/{id} — 화면 1장 + 섹션(bbox·크롭 서명 URL·KRDS) + 이전/다음 (docs/08, S07 뷰어)
 * Free 게이트: Plan::allowedScreens 밖이면 402 UPGRADE_REQUIRED (2026-09-24).
 * @var Homebox\Http\Router $router
 */

use Homebox\Db;
use Homebox\Http\Response;
use Homebox\Plan;
use Homebox\Signer;

$router->get('/api/screens/{id}', static function (array $p): void {
    $id = (int) $p['id'];
    $sc = Db::row(
        "SELECT sc.id, sc.site_id, sc.page_type_id, pt.name_ko AS page_type_ko, sc.url, sc.title, sc.device, sc.viewport_w, sc.full_h, sc.is_highlight, sc.captured_at, sc.status,
                sc.public_asset_id, sc.thumb_asset_id, s.slug AS site_slug, s.title AS site_title, COALESCE(o.display_name, o.name) AS org_name, d.tone, d.primary_hex
         FROM screens sc JOIN page_types pt ON pt.id = sc.page_type_id JOIN sites s ON s.id = sc.site_id JOIN organizations o ON o.id = s.org_id
         LEFT JOIN site_design d ON d.site_id = s.id
         WHERE sc.id = ?", [$id]);
    if ($sc === null || $sc['status'] === 'removed') {
        Response::error($sc === null ? 404 : 410, $sc === null ? 'NOT_FOUND' : 'REMOVED', '화면을 찾을 수 없습니다.');
    }
    if ($sc['status'] !== 'published') {
        Response::error(404, 'NOT_FOUND', '아직 공개되지 않은 화면입니다.');
    }
    // 플랜 게이트: Free 는 기관당 앞 N장만 (docs/08 402) — 잠긴 화면은 이미지·섹션을 주지 않는다
    $plan = Plan::current();
    if (!Plan::canSee(Plan::allowedScreens((int) $sc['site_id'], $plan), $id)) {
        Response::error(402, 'UPGRADE_REQUIRED', 'Free 플랜은 기관당 ' . (int) ($plan['limits']['screens_per_site'] ?? 5) . '장까지 열람할 수 있습니다. Pro 로 업그레이드하면 전체 화면·섹션·디자인 데이터를 볼 수 있습니다.', ['plan' => $plan['id'], 'site_slug' => $sc['site_slug']]);
    }
    $sections = Db::rows(
        'SELECT x.id, x.section_type_id, st.name_ko AS section_type_ko, x.variant, x.bbox_x, x.bbox_y, x.bbox_w, x.bbox_h, x.crop_asset_id, x.confidence, x.source, x.structure,
                (SELECT JSON_ARRAYAGG(k.component_id) FROM section_krds k WHERE k.section_id = x.id) AS krds
         FROM sections x JOIN section_types st ON st.id = x.section_type_id WHERE x.screen_id = ? ORDER BY x.sort, x.bbox_y', [$id]);
    foreach ($sections as &$x) {
        $x['id'] = (int) $x['id'];
        $x['bbox'] = ['x' => (int) $x['bbox_x'], 'y' => (int) $x['bbox_y'], 'w' => (int) $x['bbox_w'], 'h' => (int) $x['bbox_h']];
        $x['confidence'] = $x['confidence'] === null ? null : (float) $x['confidence'];
        $x['krds'] = is_string($x['krds']) ? (json_decode($x['krds'], true) ?: []) : [];
        $x['structure'] = Homebox\SectionShape::structure($x['structure'] ?? null); // flags(탭·캐러셀·표·폼) + CSS 잔재 걷어낸 발췌
        $x['crop_url'] = Plan::kurl((int) $sc['site_id'], $x['crop_asset_id']); // 공공누리 2~4유형이면 null(LEGAL-006)
        unset($x['bbox_x'], $x['bbox_y'], $x['bbox_w'], $x['bbox_h'], $x['crop_asset_id']);
    }
    unset($x);
    $siblings = Db::rows("SELECT id FROM screens WHERE site_id = ? AND status = 'published' ORDER BY sort, id", [(int) $sc['site_id']]);
    $ids = array_map(static fn (array $r): int => (int) $r['id'], $siblings);
    $pos = array_search($id, $ids, true);
    Response::json([
        'screen' => [
            'screen_id' => (int) $sc['id'], 'site_id' => (int) $sc['site_id'], 'site_slug' => $sc['site_slug'], 'site_title' => $sc['site_title'], 'org_name' => $sc['org_name'],
            'page_type' => $sc['page_type_id'], 'page_type_ko' => $sc['page_type_ko'], 'url' => $sc['url'], 'title' => $sc['title'], 'device' => $sc['device'],
            'viewport_w' => (int) $sc['viewport_w'], 'full_h' => (int) $sc['full_h'], 'is_highlight' => (bool) $sc['is_highlight'], 'captured_at' => $sc['captured_at'],
            'tone' => $sc['tone'], 'primary' => $sc['primary_hex'],
            'public_url' => Plan::kurl((int) $sc['site_id'], $sc['public_asset_id']),
            'thumb_url' => $sc['thumb_asset_id'] ? Signer::url((int) $sc['thumb_asset_id']) : null,
            'kogl' => Plan::koglInfo((int) $sc['site_id']), // 공공누리 제한 중이면 유형·안내, 아니면 null
        ],
        'sections' => $sections,
        'prev_id' => $pos !== false && $pos > 0 ? $ids[$pos - 1] : null,
        'next_id' => $pos !== false && $pos < count($ids) - 1 ? $ids[$pos + 1] : null,
        'attribution' => '출처: ' . $sc['org_name'] . ' (' . $sc['url'] . '), 캡처 ' . substr((string) $sc['captured_at'], 0, 7) . '. 홈박스는 저작권을 주장하지 않으며 참고용입니다.',
    ], 200, ['Cache-Control' => (\Homebox\Auth\Session::user()['role'] ?? '') === 'admin' ? 'private, no-store' : 'private, max-age=60']); // 관리자는 섹션 편집 직후 옛 위치가 캐시로 돌아오지 않게, 일반도 플랜별 응답이라 private
});

/**
 * GET /api/sections/{id}/code — 섹션 하나를 바로 쓰는 HTML·CSS 로 (2026-09-24, Pro 이상).
 *   수집한 제목·메뉴 이름·열 수·색·모서리·사진 배치(structure.style) + 사이트 주색·글꼴로 채운다. 원본 마크업 복제가 아니다.
 */
$router->get('/api/sections/{id}/code', static function (array $p): void {
    $x = Db::row(
        "SELECT x.id, x.section_type_id AS type, x.bbox_w AS w, x.bbox_h AS h, x.structure, x.crop_asset_id, sc.id AS screen_id, sc.site_id, sc.status, sc.url, sc.page_type_id AS page_type,
                s.slug, COALESCE(o.display_name, o.name) AS org_name, o.org_type_id AS org_type, d.primary_hex, d.palette, d.fonts, d.radius_px, d.container_px, d.colors, d.typography
         FROM sections x JOIN screens sc ON sc.id = x.screen_id JOIN sites s ON s.id = sc.site_id JOIN organizations o ON o.id = s.org_id
         LEFT JOIN site_design d ON d.site_id = s.id WHERE x.id = ?", [(int) $p['id']]);
    if ($x === null || $x['status'] !== 'published') {
        Response::error(404, 'NOT_FOUND', '섹션을 찾을 수 없습니다.');
    }
    $plan = Plan::current();
    if (($plan['limits']['design_data'] ?? 'summary') !== 'full' && empty($plan['admin'])) {
        Response::error(402, 'UPGRADE_REQUIRED', '섹션 코드는 Pro 이상에서 제공합니다.', ['plan' => $plan['id']]);
    }
    Homebox\Samples::context(Homebox\SampleContent::persona((string) ($x['org_type'] ?? ''), (string) $x['org_name'])['org']);
    ['code' => $code, 'samples' => $samples, 'tok' => $tok, 'prim' => $prim] = Homebox\SectionCode::forRow($x);
    // 섹션 코드에도 레퍼런스 기관명·기관장·대표 전화가 남았다 — 메인·서브와 같은 지우기(2026-10-13 MCP 3차 section-code-leak)
    $code['html'] = Homebox\SampleContent::scrubReal((string) $code['html'], ['real' => (string) $x['org_name'], 'scrub_names' => true] + Homebox\SampleContent::persona((string) ($x['org_type'] ?? ''), (string) $x['org_name']));
    Homebox\Samples::remember(array_column(array_filter($samples, static fn ($s) => str_contains($code['html'], (string) $s['url'])), 'id'));
    Response::json([
        'section_id' => (int) $x['id'], 'section_type' => $x['type'], 'site_slug' => $x['slug'], 'screen_id' => (int) $x['screen_id'],
        'tokens' => $tok, 'primary_note' => $prim['note'] ?? null,
        'html' => $code['html'], 'css' => $code['css'], 'notes' => $code['notes'],
        'sample_images' => $samples, // 사진 자리에 넣은 샘플 — 다른 컷이 필요하면 get_sample_images 로 바꿔 끼운다
        'crop_url' => Plan::kurl((int) (Db::row('SELECT site_id FROM screens WHERE id = ?', [(int) $x['screen_id']])['site_id'] ?? 0), $x['crop_asset_id'], $plan),
        'usage' => '문구·메뉴 이름은 원 기관 것이다 — 목업에서는 자리표시([ ])와 함께 내 기관 내용으로 바꿔 쓴다. 사진 자리에는 홈박스 샘플 이미지(가상 인물·풍경)를 넣었다 — 실서비스 전 실제 사진으로 교체.',
        'attribution' => '구성 출처: ' . $x['org_name'] . ' (' . $x['url'] . '). 홈박스는 저작권을 주장하지 않으며 참고용입니다.',
    ], 200, ['Cache-Control' => 'private, no-store']);
});

/**
 * GET /api/screens/{id}/code — 화면 한 장을 한 페이지 HTML 로 조립 (2026-09-25, Pro 이상).
 *   섹션 코드를 y 순서로 쌓되, LNB 가 있으면 LNB 오른쪽에 있는 섹션을 본문 칸으로 묶어 [LNB | 본문] 2단으로 배치한다.
 *   MCP 사용자가 섹션을 하나씩 받아 직접 배치하면 LNB 가 본문 위로 쌓이는 문제가 테스트에서 나왔다.
 */
$router->get('/api/screens/{id}/code', static function (array $p): void {
    $sc = Db::row(
        "SELECT sc.id, sc.site_id, sc.status, sc.url, sc.title, sc.page_type_id AS page_type, sc.viewport_w, sc.device, s.slug,
                COALESCE(o.display_name, o.name) AS org_name, o.org_type_id AS org_type, d.primary_hex, d.palette, d.fonts, d.radius_px, d.container_px, d.colors, d.typography
         FROM screens sc JOIN sites s ON s.id = sc.site_id JOIN organizations o ON o.id = s.org_id LEFT JOIN site_design d ON d.site_id = s.id WHERE sc.id = ?", [(int) $p['id']]);
    if ($sc === null || $sc['status'] !== 'published') {
        Response::error(404, 'NOT_FOUND', '화면을 찾을 수 없습니다.');
    }
    $plan = Plan::current();
    if (($plan['limits']['design_data'] ?? 'summary') !== 'full' && empty($plan['admin'])) {
        Response::error(402, 'UPGRADE_REQUIRED', '페이지 코드는 Pro 이상에서 제공합니다.', ['plan' => $plan['id']]);
    }
    $rows = Db::rows('SELECT id, section_type_id AS type, bbox_x AS x, bbox_y AS y, bbox_w AS w, bbox_h AS h, structure FROM sections WHERE screen_id = ? ORDER BY bbox_y, bbox_x', [(int) $sc['id']]);
    // 메인은 수집 섹션을 쌓지 않고 조립한다 — 채택률로 필수 블록·순서, 이 화면에서 메뉴·바로가기·탭 이름, 사이트 토큰으로 디자인, 캐러셀·탭·메뉴 동작 (2026-09-25 사용자: "소스 나열 수준")
    if ($sc['page_type'] === 'main') {
        Response::json(homebox_main_mockup($sc, $rows), 200, ['Cache-Control' => 'private, no-store']);
    }
    // 서브는 키트(KRDS) 블록으로 조립한다 (2026-09-26, .claude/skills/reference-design) — 수집 섹션을 그대로 쌓으면
    // 분해가 틀린 레퍼런스가 그대로 옮겨졌다(헤더 없음·빈 카드·사진 FAQ·인물 든 조직도, ledger B1~B5·C6).
    // 레퍼런스에서는 메뉴 이름(GNB·LNB)·페이지 이름·색·글꼴·모서리만 가져온다. ?legacy=1 이면 옛 방식.
    if (empty($_GET['legacy'])) {
        Response::json(homebox_kit_subpage($sc, $rows), 200, ['Cache-Control' => 'private, no-store']);
    }
    homebox_legacy_page($sc, $rows);
});

/**
 * 서브페이지 = 키트(KRDS) 블록 조립 (get_page_code · build_homepage 공용).
 * $site 가 있으면 홈페이지 한 벌의 공통값으로 덮는다 — persona(가상 기관)·tok(색·글꼴·모서리)·gnb(주 메뉴).
 * 2026-09-30 MCP 홈페이지 시험: 서브를 화면마다 따로 받으면 한 홈페이지에 기관명 3가지·주색 2가지·주 메뉴 4가지가 섞였다.
 */
function homebox_kit_subpage(array $sc, array $rows, array $site = []): array
{
        $dec = static fn ($v) => is_string($v) ? (json_decode($v, true) ?: []) : (array) $v;
        $gnb = $lnb = []; $lnbTitle = '';
        foreach ($rows as $r) {
            $st = $dec($r['structure']);
            $labs = array_values(array_filter((array) ($st['links']['labels'] ?? []), 'is_string'));
            if (in_array($r['type'], ['header', 'gnb'], true) && count($gnb) < 3) { $gnb = array_merge($gnb, $labs); }
            if ($r['type'] === 'lnb' && !$lnb) { $lnb = $labs; $lnbTitle = (string) ($st['title'] ?? ''); }
        }
        // 본문 순서 (2026-09-29 titled) — 레퍼런스 본문 섹션의 유형·이름·모양 힌트를 위에서 아래로. 글 내용은 옮기지 않는다
        $body = [];
        foreach ($rows as $r) {
            if (!in_array($r['type'], Homebox\KitPage::BODY_TYPES, true)) { continue; }
            $st = $dec($r['structure']);
            $body[] = ['type' => $r['type'], 'name' => (string) ($st['name'] ?? $st['title'] ?? ''), 'items' => (int) ($st['items'] ?? 0), 'photos' => (int) ($st['images']['photos'] ?? 0), 'table' => !empty($st['flags']['table'])];
        }
        $parts = array_values(array_filter(array_map('trim', preg_split('/\s*(?:>|\||::|·| - | – )\s*/u', (string) $sc['title']) ?: []), static fn ($x) => $x !== '' && !str_contains($x, (string) $sc['org_name'])));
        [$tok] = Homebox\SectionCode::tokens($sc);
        $pt = (string) $sc['page_type'];
        $kind = in_array($pt, Homebox\KitPage::TYPES, true) ? $pt : ($pt === 'board_gallery' ? 'board_list' : 'content');
        $persona = Homebox\SampleContent::persona((string) ($sc['org_type'] ?? ''), (string) $sc['org_name']);
        if (!empty($site['persona'])) { $persona = $site['persona'] + $persona; }
        if (!empty($site['tok'])) { $tok = $site['tok'] + $tok; }
        if (!empty($site['gnb'])) { $gnb = $site['gnb']; }
        Homebox\Samples::context($persona['org']);
        // 레퍼런스 캡처에서 '헤더 아래 비주얼 띠'·'어두운 푸터' 여부를 픽셀로 판정 — 분해에 안 남는 정보(2026-09-26, ledger C9)
        $hdrBottom = 0; $foot = null;
        foreach ($rows as $r) {
            if ($r['type'] === 'header' && (int) $r['y'] < 200) { $hdrBottom = max($hdrBottom, (int) $r['y'] + (int) $r['h']); }
            if ($r['type'] === 'footer') { $foot = [(int) $r['y'], (int) $r['h']]; }
        }
        $asset = Db::row('SELECT a.bucket, a.`key` FROM screens s JOIN assets a ON a.id = s.public_asset_id WHERE s.id = ?', [(int) $sc['id']]);
        $look = $asset ? Homebox\KitPage::probe(rtrim((string) Config::get('storage.dir', __DIR__ . '/../../storage'), '/\\') . '/' . $asset['bucket'] . '/' . $asset['key'], $hdrBottom, $foot) : [];
        // 레퍼런스 본문 높이(머리 아래 ~ 바닥 위) — 짧은 안내 화면이면 조립도 덜 중요한 블록을 빼 높이를 맞춘다(2026-10-14 D7 상세 본문 +75%)
        $bodyH = ($foot !== null && $hdrBottom > 0) ? $foot[0] - $hdrBottom : 0;
        $k = Homebox\KitPage::build($kind, $tok, $persona, ['gnb' => $gnb, 'lnb' => $lnb, 'lnb_title' => $lnbTitle, 'title' => end($parts) ?: '', 'crumbs' => $parts, 'body' => $body, 'body_h' => $bodyH] + $look);
        Homebox\Samples::remember(array_column($k['samples'], 'id'));
        // 주 메뉴·LNB·경로·탭에 남는 레퍼런스 기관명 — 서브 레퍼런스 기관과 메인 레퍼런스 기관(한 벌일 때) 둘 다 지운다(2026-10-12 build-leaks-real-org)
        foreach (array_unique(array_filter([(string) $sc['org_name'], (string) ($site['real'] ?? '')])) as $realName) {
            $k['html'] = Homebox\SampleContent::scrubReal((string) $k['html'], ['real' => $realName] + $persona);
        }
        return [
            'screen_id' => (int) $sc['id'], 'site_slug' => $sc['slug'], 'page_type' => $pt, 'layout' => 'kit_subpage',
            'composition' => $k['composition'], 'tokens' => $tok, 'html' => $k['html'], 'sample_images' => $k['samples'],
            'persona' => array_diff_key($persona, ['real' => 1]), 'content_basis' => Homebox\SampleContent::BASIS,
            'usage' => '그대로 .html 로 저장하면 열린다(키트 CSS 는 hom2box.com 에서 불러온다). 뼈대·본문은 홈박스 키트(KRDS) 블록, 메뉴 이름·색·글꼴·모서리는 레퍼런스, 기관·인물·글은 가상 샘플이다.',
            'attribution' => '토큰·메뉴 출처: ' . $sc['org_name'] . ' (' . $sc['url'] . '). KRDS(공공누리 제1유형) 마크업 사용. 홈박스는 저작권을 주장하지 않으며 참고용입니다.',
        ];
}

/** 옛 방식(?legacy=1): 수집 섹션 코드를 y 순서로 쌓는다 */
function homebox_legacy_page(array $sc, array $rows): void
{
    $vw = max(1, (int) $sc['viewport_w']);
    $rows = array_values(array_filter($rows, static fn ($r) => !in_array($r['type'], ['skip_nav'], true) && !((int) $r['h'] < 40 && $r['type'] === 'unknown')));
    $lnb = null;
    foreach ($rows as $r) { if ($r['type'] === 'lnb' && (int) $r['w'] < $vw * 0.35) { $lnb = $r; break; } }
    $top = $body = $bottom = [];
    foreach ($rows as $r) {
        if ($lnb !== null && $r['id'] === $lnb['id']) { continue; }
        // LNB 와 세로로 겹치는 섹션 = 본문 (분해가 본문을 화면 폭 전체 bbox 로 잡는 경우가 있어 x 로는 못 가른다 — 에너지공단 인사말)
        $inBody = $lnb !== null && (int) $r['y'] >= (int) $lnb['y'] - 80 && (int) $r['y'] < (int) $lnb['y'] + (int) $lnb['h']
            && !in_array($r['type'], ['footer', 'footer_links', 'header', 'gnb', 'main_visual', 'sub_visual'], true);
        if ($inBody) { $body[] = $r; } elseif ($lnb !== null && (int) $r['y'] >= (int) $lnb['y']) { $bottom[] = $r; } else { $top[] = $r; }
    }
    // 한 페이지 = 한 가상 기관·인물 (섹션마다 따로 정하면 인사말 서명과 푸터 기관명이 달라진다)
    $sc['persona'] = Homebox\SampleContent::persona((string) ($sc['org_type'] ?? ''), (string) $sc['org_name']);
    Homebox\Samples::context($sc['persona']['org']); // 기관 맞춤 배너 + 앞 시안에서 쓴 이미지는 뒤로(2026-09-26)
    $css = [];
    $samplesAll = [];
    $tok = [];
    $usedImg = [];
    $render = static function (array $r) use ($sc, &$css, &$samplesAll, &$tok, &$usedImg): string {
        // 같은 역할 블록은 한 페이지에 한 번: 제목 띠(경로·제목), 인사말 본문
        static $seenTitle = false, $greetDone = false;
        if (in_array($r['type'], ['breadcrumb', 'page_title'], true)) { if ($seenTitle) { return ''; } $seenTitle = true; }
        $out = Homebox\SectionCode::forRow(['id' => $r['id'], 'type' => $r['type'], 'w' => $r['w'], 'h' => $r['h'], 'structure' => $r['structure'], 'exclude' => array_keys($usedImg), 'greet_done' => $greetDone] + $sc);
        if (!empty($out['greet'])) { $greetDone = true; }
        foreach ($out['samples'] as $sm) { if (str_contains($out['code']['html'], (string) $sm['url'])) { $usedImg[$sm['id']] = true; } }
        foreach (preg_split('/(?<=\})/', $out['code']['css']) ?: [] as $rule) { $rule = trim($rule); if ($rule !== '') { $css[$rule] = true; } }
        foreach ($out['samples'] as $s) { $samplesAll[$s['id']] = $s; }
        $tok = $out['tok'];
        return "<!-- {$r['type']} · section {$r['id']} -->\n" . $out['code']['html'];
    };
    $html = implode("\n", array_map($render, $top));
    if ($lnb !== null) {
        $html .= "\n<div class=\"hb-page-body hb-wrap\"><aside class=\"hb-page-aside\">" . $render($lnb) . '</aside><main class="hb-page-main">' . implode("\n", array_map($render, $body)) . '</main></div>';
    }
    $html .= "\n" . implode("\n", array_map($render, $bottom));
    $lnbW = $lnb !== null ? max(220, min((int) $lnb['w'], 300)) : 0;
    $pageCss = implode('', array_keys($css)) . ($lnb !== null ? ".hb-page-body{display:grid;grid-template-columns:{$lnbW}px 1fr;gap:48px;align-items:start;padding-top:40px;padding-bottom:64px}.hb-page-main .hb-wrap,.hb-page-aside .hb-wrap{max-width:none;padding:0}.hb-page-main>.hb-sec{margin-bottom:32px}.hb-page-main .hb-split{padding-top:24px}" : '');
    $pgTitle = ['greeting' => '인사말', 'board_list' => '공지사항', 'board_view' => '공지사항', 'org_chart' => '조직도', 'main' => '메인'][$sc['page_type']] ?? '사업 안내';
    $doc = "<!doctype html>\n<html lang=\"ko\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>{$pgTitle} — {$sc['persona']['org']}</title>\n" . Homebox\WebFont::head([Homebox\WebFont::canonical((string) preg_replace("/^'([^']+)'.*/", '$1', (string) ($tok['font'] ?? '')))]) . "\n<style>body{margin:0}{$pageCss}</style></head>\n<body>\n{$html}\n</body></html>";
    Homebox\Samples::remember(array_keys($usedImg));
    Response::json([
        'screen_id' => (int) $sc['id'], 'site_slug' => $sc['slug'], 'page_type' => $sc['page_type'], 'layout' => $lnb !== null ? 'lnb_subpage' : 'stacked',
        'sections' => ['top' => count($top), 'aside' => $lnb !== null ? 1 : 0, 'main' => count($body), 'bottom' => count($bottom)],
        'tokens' => $tok, 'html' => $doc, 'sample_images' => array_values($samplesAll),
        'persona' => array_diff_key($sc['persona'], ['real' => 1]),
        'content_basis' => Homebox\SampleContent::BASIS,
        'usage' => '그대로 .html 로 저장하면 열린다. 기관명·인물·인사말·게시물·푸터는 가상 샘플(persona)이고 메뉴 구성은 원 기관 수집값이다 — 내 기관 원고로 바꿔 쓴다. 사진은 홈박스 샘플(가상 인물·풍경)이다.',
        'attribution' => '구성 출처: ' . $sc['org_name'] . ' (' . $sc['url'] . '). 홈박스는 저작권을 주장하지 않으며 참고용입니다.',
    ], 200, ['Cache-Control' => 'private, no-store']);
}

/** 메인 목업 응답 (페이지 코드 main · /api/mockups/main 공용) */
function homebox_main_mockup(array $sc, array $rows, array $site = []): array
{
    $labels = static function (array $types) use ($rows): array {
        $out = [];
        foreach ($rows as $r) {
            if (!in_array($r['type'], $types, true)) { continue; }
            $st = is_string($r['structure']) ? (json_decode($r['structure'], true) ?: []) : (array) $r['structure'];
            foreach ((array) ($st['links']['labels'] ?? []) as $l) { if (is_string($l)) { $out[] = trim($l); } }
        }
        return $out;
    };
    [$tok] = Homebox\SectionCode::tokens($sc);
    // 수집한 타이포 스케일(본문·메뉴·섹션 제목) — 목업이 16·18px 고정이던 것 (2026-09-25 비교 검수 C1)
    $ty = Homebox\Design::typography(is_string($sc['typography'] ?? null) ? (json_decode($sc['typography'], true) ?: null) : ($sc['typography'] ?? null));
    $tok['type'] = (array) ($ty['scale'] ?? []);
    // 홈페이지 한 벌·고객 요청 색·글꼴 (build_homepage) — font_lock 이면 MainMockup 이 섹션 글꼴로 다시 정하지 않는다
    if (!empty($site['tok'])) { $tok = $site['tok'] + $tok; if (!empty($site['tok']['font'])) { $tok['font_lock'] = true; } }
    // 고객 기관명(org_name)이 오면 그 기관 종류(시·군·구·도…)에 맞는 가상 기관으로 — 레퍼런스가 구청·군청이어도 '청주시' 요청은 시(한빛시)로
    // (2026-09-30 청주시 시안 실호출: 레퍼런스 따라 '푸른구'·'새솔군'으로 나왔다)
    $who = (string) ($sc['persona_name'] ?? $sc['org_name']);
    $persona = Homebox\SampleContent::persona((string) ($sc['persona_type'] ?? $sc['org_type'] ?? ''), $who);
    $persona['real'] = (string) $sc['org_name']; // 지울 실제 이름은 언제나 레퍼런스 기관 — 고객 기관명으로 바꾸면 '서구랑'·'서람이'가 남는다
    $hints = ['gnb' => $labels(['header', 'gnb']), 'quick' => $labels(['quick_links']), 'tabs' => $labels(['news_tabs', 'notice_list']),
        'rural' => (bool) preg_match('/군$|군청|농촌|어촌/u', $who), 'sections' => $rows, 'vw' => (int) ($sc['viewport_w'] ?? 1920)];
    // 메인도 캡처 픽셀로 푸터 밝기 판정 (예산군 밝은 푸터를 어둡게 그리던 것, 2026-09-26 자가 검증 C31)
    $foot = null; foreach ($rows as $r) { if ($r['type'] === 'footer') { $foot = [(int) $r['y'], (int) $r['h']]; } }
    $asset = Db::row('SELECT a.bucket, a.`key` FROM screens s JOIN assets a ON a.id = s.public_asset_id WHERE s.id = ?', [(int) $sc['id']]);
    $hints['look'] = $asset ? Homebox\KitPage::probe(rtrim((string) Config::get('storage.dir', __DIR__ . '/../../storage'), '/\\') . '/' . $asset['bucket'] . '/' . $asset['key'], 130, $foot) : [];
    $m = Homebox\MainMockup::build($tok, $persona, $hints, (int) $sc['id']);
    $persona = (array) ($m['person'] ?? []) + $persona;
    $m['html'] = homebox_kind_words((string) $m['html'], (string) $sc['org_name'], (string) $persona['org']);
    // 주 메뉴·전체메뉴·칸 제목의 레퍼런스 기관명('강릉고향사랑기부제'·'강릉관광')까지 가상 기관으로 — 본문만 지우던 것(2026-10-12 MCP 시험 build-leaks-real-org)
    $m['html'] = Homebox\SampleContent::scrubReal((string) $m['html'], ['real' => (string) $sc['org_name']] + $persona);
    // 샘플 이미지는 항상 공개 절대 주소로 — 저장한 .html(file://)로 열어도 보이게(로컬 상대 주소면 전부 빈칸이었다)
    $m['html'] = preg_replace('#(src|href)="(?:/homebox|/mockref)?/api/samples/#', '$1="' . Homebox\KitPage::publicBase() . '/api/samples/', $m['html']) ?? $m['html'];
    return [
        'screen_id' => (int) $sc['id'], 'site_slug' => $sc['slug'], 'page_type' => 'main', 'layout' => 'composed_main',
        'composition' => $m['composition'], 'tokens' => $tok, 'html' => $m['html'], 'sample_images' => $m['samples'], 'layout_basis' => Homebox\LayoutStats::summary(),
        'persona' => array_diff_key($persona, ['real' => 1]), 'content_basis' => ['main_adoption_pct' => Homebox\MainMockup::ADOPTION, 'n_main_sites' => 118] + Homebox\SampleContent::BASIS,
        'usage' => '그대로 .html 로 저장하면 열린다. 블록 구성·순서는 관공서 메인 118곳의 채택률(composition.adoption), 디자인 토큰은 레퍼런스 사이트, 메뉴·바로가기·탭 이름은 레퍼런스 화면 수집값이다. 캐러셀(자동 재생·이전·정지·다음)·탭(방향키)·메가 메뉴·통합검색·전체메뉴·관련사이트가 동작한다. 기관·인물·글은 가상 샘플이다.',
        'attribution' => '토큰·메뉴 출처: ' . $sc['org_name'] . ' (' . $sc['url'] . '). 홈박스는 저작권을 주장하지 않으며 참고용입니다.',
    ];
}

/**
 * GET /api/mockups/main?org_type=&ref=slug — 기관 유형만 주면 가중 점수 1위 레퍼런스 메인으로 조립 (Pro)
 */
$router->get('/api/mockups/main', static function (): void {
    $plan = Plan::current();
    if (($plan['limits']['design_data'] ?? 'summary') !== 'full' && empty($plan['admin'])) {
        Response::error(402, 'UPGRADE_REQUIRED', '메인 목업은 Pro 이상에서 제공합니다.', ['plan' => $plan['id']]);
    }
    $ref = trim((string) ($_GET['ref'] ?? ''));
    $ot = homebox_infer_ot(trim((string) ($_GET['org_type'] ?? '')), (string) ($_GET['org_name'] ?? ''));
    $sc = homebox_main_ref($ot, $ref, (int) ($_GET['rank'] ?? 1), true); // 자동 조립 — 분해 품질 조건
    if ($sc === null) {
        Response::error(404, 'NOT_FOUND', '조건에 맞는 메인 레퍼런스가 없습니다.');
    }
    $on = homebox_client_org((string) ($_GET['org_name'] ?? ''));
    if ($on !== '') { $sc['persona_name'] = $on; }
    if ($ot !== '') { $sc['persona_type'] = $ot; } // 요청·짐작한 종류가 레퍼런스 종류보다 먼저(대학 요청이 공공기관 레퍼런스로 넓혀져도 대학 페르소나)
    $rows = Db::rows('SELECT id, section_type_id AS type, bbox_x AS x, bbox_y AS y, bbox_w AS w, bbox_h AS h, structure FROM sections WHERE screen_id = ? ORDER BY bbox_y, bbox_x', [(int) $sc['id']]);
    Response::json(homebox_main_mockup($sc, $rows), 200, ['Cache-Control' => 'private, no-store']);
});

/** 레퍼런스와 가상 기관의 종류가 다르면(구청 레퍼런스 → 시) 화면 글의 '구민·구청·구정'을 '시민·시청·시정'으로 — 태그 밖 글자만 */
function homebox_kind_words(string $html, string $refName, string $org): string
{
    $kind = static fn (string $n): string => preg_match('/(시|군|구|도)청?$/u', trim($n), $m) ? $m[1] : '';
    $from = $kind($refName); $to = $kind($org);
    if ($from === '' || $to === '' || $from === $to) { return $html; }
    $map = [$from . '민' => $to . '민', $from . '청' => $to . '청', $from . '정' => $to . '정'];
    return preg_replace_callback('/>([^<]+)</u', static fn ($m) => '>' . strtr($m[1], $map) . '<', $html) ?? $html;
}

/** 고객 기관명 정리 —'청주시청'→'청주시'(청사 이름이 아니라 기관 이름으로), 30자 이내. 가상 기관의 종류(시장·군수·구청장…)를 고르는 데만 쓴다 */
function homebox_client_org(string $name): string
{
    $n = mb_substr(trim(strip_tags($name)), 0, 30);
    return (string) preg_replace('/(시|군|구|도)청$/u', '$1', $n);
}

/** 메인 레퍼런스 화면 고르기 (/api/mockups/main · /api/mockups/site 공용) — ref(slug) 가 없으면 기관 유형 안에서 가중 점수 rank 순위 */
/**
 * org_type 이 비었으면 기관 이름으로 짐작한다(2026-10-11 "특정 카테고리에 국한되지 않게") — 대학·학교·복지관·재단·협회·문화시설·기업.
 * 관공서 이름이거나 짐작이 안 되면 빈 값(= 전체 1위).
 */
function homebox_infer_ot(string $ot, string $name): string
{
    // AI 클라이언트가 분류에 없는 코드(welfare·assoc·biz…)를 넣으면 그대로 찾다가 전체 1위(서울시청)로 떨어졌다(2026-10-11 12종 시험)
    // → 흔한 별칭은 실제 코드로, 그래도 분류에 없으면 이름으로 짐작한다.
    $ot = strtolower(trim($ot));
    $alias = [
        'welfare' => 'etc_welfare', 'social_welfare' => 'etc_welfare', 'assoc' => 'etc_assoc', 'association' => 'etc_assoc',
        'foundation' => 'etc', 'nonprofit' => 'etc', 'culture' => 'private_culture', 'museum' => 'private_culture',
        'biz' => 'private_corp', 'company' => 'private_corp', 'corp' => 'private_corp', 'corporate' => 'private_corp', 'enterprise' => 'private_corp',
        'shop' => 'private_commerce', 'commerce' => 'private_commerce', 'agency' => 'private_agency', 'personal' => 'private_personal',
        'university' => 'edu_univ_private', 'univ' => 'edu_univ_private', 'college' => 'edu_college', 'school' => 'edu_school',
        'ministry' => 'central_ministry', 'city' => 'local_basic', 'province' => 'local_wide', 'public_corporation' => 'public_corp',
    ];
    if (isset($alias[$ot])) { $ot = $alias[$ot]; }
    if ($ot !== '' && Db::row('SELECT 1 AS x FROM org_types WHERE id = ?', [$ot]) === null) { $ot = ''; }
    if ($ot !== '' || trim($name) === '') { return $ot; }
    $n = preg_replace('/\s+/u', '', $name);
    return match (true) {
        (bool) preg_match('/교육청$/u', $n) => 'edu_office',
        (bool) preg_match('/(전문대학|폴리텍|기능대학)/u', $n) => 'edu_college',
        (bool) preg_match('/(국립|과학기술원|교육대학교)/u', $n) && (bool) preg_match('/대학|과학기술원/u', $n) => 'edu_univ',
        (bool) preg_match('/(대학교|대학|대학원)$/u', $n) => 'edu_univ_private',
        (bool) preg_match('/학교$/u', $n) => 'edu_school',
        (bool) preg_match('/(복지관|복지센터|요양|돌봄|장애인|지역아동센터|사회복지)/u', $n) => 'etc_welfare',
        (bool) preg_match('/(협회|학회|연합회|협의회|연맹|조합)$/u', $n) => 'etc_assoc',
        (bool) preg_match('/(미술관|박물관|아트센터|공연장|문화재단|문화원|갤러리)$/u', $n) => 'private_culture', // 문화재단을 재단보다 먼저(2026-10-12 12종 시험: 문화재단이 복지 재단으로)
        (bool) preg_match('/재단$/u', $n) => 'etc',
        (bool) preg_match('/(쇼핑|마켓|몰)$/u', $n) => 'private_commerce',
        (bool) preg_match('/(스튜디오|에이전시|디자인)$/u', $n) => 'private_agency',
        (bool) preg_match('/(주식회사|\(주\)|㈜|코리아|컴퍼니|그룹|테크|솔루션|홀딩스|전자|물산|화학|제약|바이오|건설|증권|은행|보험|카드|통신|텔레콤|모터스|자동차|중공업|항공|해운|유통|식품|제과|생명|화재|엔터테인먼트|소프트|시스템즈|네트웍스)/u', $n) => 'private_corp',
        (bool) preg_match('/(공사|공단)$/u', $n) => 'public_corp',
        (bool) preg_match('/(진흥원|연구원)$/u', $n) => 'public_support',
        (bool) preg_match('/(시청|군청|구청|도청|특별시|광역시|[시군구])$/u', $n) => 'local',
        (bool) preg_match('/위원회$/u', $n) => 'central_committee',
        (bool) preg_match('/(부|처|청)$/u', $n) => 'central_ministry',
        default => '',
    };
}

/** 레퍼런스 출처 — 민간 유형(private_*)을 요청했거나 사이트를 콕 집었으면 민간 수집도 쓴다. 그 밖은 관공서만(MCP 통계에 민간이 섞이지 않게). */
function homebox_src(string $ot, string $ref = ''): string
{
    return ($ref !== '' || str_starts_with($ot, 'private')) ? "s.source_kind IN ('gov', 'private')" : "s.source_kind = 'gov'";
}

/** 게시 사이트가 없는 유형의 가까운 유형 순서 — 상위 유형 다음에 이걸 따라 넓힌다(대학·복지·민간이 비어도 엉뚱한 시청으로 바로 가지 않게). */
function homebox_ot_chain(string $ot): array
{
    return match (true) {
        $ot === 'edu_univ_private' => ['edu_univ', 'edu_college', 'edu'],
        $ot === 'edu_univ' => ['edu_univ_private', 'edu_college', 'edu'],
        $ot === 'edu_college' => ['edu_univ_private', 'edu_univ', 'edu'],
        $ot === 'edu_school' => ['edu_office', 'edu'],
        $ot === 'edu_office' || $ot === 'education' => ['edu', 'local'],
        $ot === 'etc_welfare' => ['etc', 'public_other', 'public', 'local_basic'],
        $ot === 'etc_assoc' => ['etc', 'public_support', 'public'],
        $ot === 'etc' => ['etc_', 'public_support', 'public'],
        $ot === 'private_culture' => ['public_culture', 'public', 'private'], // 민간 문화시설이 비면 기업이 아니라 공공 문화시설로(2026-10-12)
        str_starts_with($ot, 'private') => ['private', 'public_corp', 'public'],
        str_starts_with($ot, 'public') || $ot === 'local_public' => ['public', 'central'],
        str_starts_with($ot, 'central') || $ot === 'judicial' => ['central', 'public'],
        str_starts_with($ot, 'local') || $ot === 'council' => ['local', 'council'],
        default => [],
    };
}

/**
 * 분해 품질 조건(자동 조립 전용, 2026-10-14) — 대학·복지·재단 등 비관공서 레퍼런스는 분해가 틀린 곳이 많아(첫 화면 영상을 달력으로,
 * 1,156px '바로가기', 이름 없는 줄 30%+) 자동 초안이 0~33점이었다. 이름 없는 줄 25% 미만 · 목록류 칸 760px 이하 · 위 260px 안에 머리.
 */
const HOMEBOX_CLEAN_MAIN = "(SELECT COALESCE(SUM(CASE WHEN x.section_type_id = 'unknown' THEN x.bbox_h ELSE 0 END), 0) / GREATEST(1, MAX(x.bbox_y + x.bbox_h)) FROM sections x WHERE x.screen_id = sc.id) < 0.25"
    . " AND NOT EXISTS (SELECT 1 FROM sections x WHERE x.screen_id = sc.id AND x.bbox_h > 760 AND x.section_type_id IN ('calendar', 'quick_links', 'news_tabs', 'news_ticker', 'banner_zone', 'text_band'))"
    . " AND EXISTS (SELECT 1 FROM sections x WHERE x.screen_id = sc.id AND x.bbox_y < 260 AND x.section_type_id IN ('header', 'gnb', 'masthead'))";

/**
 * 자동 초안(build_homepage·main_mockup) 판정 통과가 확인된 메인 레퍼런스 — 종류별 1·2…순위로 먼저 쓴다(2026-10-14).
 * 관공서용으로 다듬은 조립 규칙이 비관공서 레퍼런스 대부분과 안 맞아(대학 1위 국민대 0점), 실제 판정으로 고른 곳만 적는다.
 * 고칠 때는 운영 판정기(qa/check.mjs)로 85점+ 를 확인한 곳만 더한다.
 */
// 10-14 판정(운영 판정기, 비관공서 6종 × 후보 6곳 + 교차): 대학 덕성여대 89 · nanro(협회) 복지관 87·협회 86·문화재단 87·학교 87·기업 86 · 덕성여대 학교 87·기업 85.
// 품질 조건만으로 고른 1순위는 0~67점이었다(대학 국민대 0·기업 8·복지관 0).
const HOMEBOX_AUTO_MAIN_PREFER = [
    'edu_univ_private' => ['duksung-ac-kr-main', 'nanro-kr-main'],
    'edu_univ' => ['duksung-ac-kr-main', 'nanro-kr-main'],
    'edu_college' => ['duksung-ac-kr-main', 'nanro-kr-main'],
    'edu_school' => ['nanro-kr-main', 'duksung-ac-kr-main'],
    'etc_welfare' => ['nanro-kr-main'],
    'etc_assoc' => ['nanro-kr-main'],
    'etc' => ['nanro-kr-main'],
    'private_culture' => ['nanro-kr-main', 'duksung-ac-kr-main'],
    'private_corp' => ['nanro-kr-main', 'duksung-ac-kr-main'],
    'private_commerce' => ['nanro-kr-main'],
    'private_agency' => ['nanro-kr-main'],
    'private_personal' => ['nanro-kr-main'],
];

function homebox_main_ref(string $ot, string $ref, int $rank, bool $clean = false): ?array
{
    if ($clean && $ref === '' && $ot !== '') {
        $pre = HOMEBOX_AUTO_MAIN_PREFER[$ot] ?? [];
        if ($rank >= 1 && $rank <= count($pre)) {
            $row = homebox_main_ref($ot, $pre[$rank - 1], 1);
            if ($row !== null) { $row['preferred'] = true; return $row; }
        }
        $rank = max(1, $rank - count($pre)); // 검증된 곳 다음 순위부터 원래 고르기
    }
    $where = ["sc.page_type_id = 'main'", "sc.status = 'published'", "sc.device = 'pc'", "s.status = 'published' AND " . homebox_src($ot, $ref) . " AND " . Homebox\RefFilter::NOT_FOREIGN . ($clean && $ref === '' ? ' AND ' . HOMEBOX_CLEAN_MAIN : '')];
    $args = [];
    if ($ref !== '') { $where[] = 's.slug = ?'; $args[] = $ref; }
    elseif ($ot !== '') { $where[] = '(o.org_type_id = ? OR o.org_type_id LIKE ?)'; $args[] = $ot; $args[] = $ot . '%'; }
    $q = static fn (array $where, array $args): ?array => Db::row(
        "SELECT sc.id, sc.site_id, sc.status, sc.url, sc.title, sc.page_type_id AS page_type, sc.viewport_w, sc.device, s.slug,
                COALESCE(o.display_name, o.name) AS org_name, o.org_type_id AS org_type, d.primary_hex, d.palette, d.fonts, d.radius_px, d.container_px, d.colors, d.typography
         FROM screens sc JOIN sites s ON s.id = sc.site_id JOIN organizations o ON o.id = s.org_id LEFT JOIN site_design d ON d.site_id = s.id
         WHERE " . implode(' AND ', $where) . "
         ORDER BY (s.rating_avg IS NULL), s.rating_avg DESC, s.krds_score DESC, s.renewal_year DESC, sc.id LIMIT 1 OFFSET " . max(0, min(50, $rank - 1)), $args);
    $row = $q($where, $args);
    // 게시 사이트가 없는 기관 유형(준정부기관·의료기관)은 상위 유형으로 (2026-09-30 MCP 시험 r1 S08·S10 메인 실패)
    if ($row === null && $ref === '' && $ot !== '') {
        // 가까운 유형 순서가 정해진 종류는 그 순서를 따른다 — 상위 유형(private)부터 보면 아트센터가 유학원·기업으로 갔다(2026-10-12)
        $parent = homebox_ot_chain($ot) !== [] ? '' : (string) (Db::row('SELECT COALESCE(parent_id, id) AS p FROM org_types WHERE id = ?', [$ot])['p'] ?? '');
        if ($parent !== '' && $parent !== $ot) {
            $w2 = array_slice($where, 0, 4); $w2[] = '(o.org_type_id = ? OR o.org_type_id LIKE ?)';
            $row = $q($w2, [$parent, $parent . '%']);
            if ($row !== null) { $row['widened_to'] = $parent; }
        }
        // 가까운 유형 차례로 → 그래도 없으면 관공서 전체 1위(어떤 종류를 요청해도 빈손으로 끝나지 않게, 2026-10-11)
        foreach ($row === null ? [...homebox_ot_chain($ot), ''] : [] as $alt) {
            $w2 = array_slice($where, 0, 4);
            $a2 = [];
            if ($alt !== '') { $w2[] = '(o.org_type_id = ? OR o.org_type_id LIKE ?)'; $a2 = [$alt, $alt . '%']; }
            $row = $q($w2, $a2);
            if ($row !== null) { $row['widened_to'] = $alt !== '' ? $alt : 'all'; break; }
        }
    }
    if ($row === null && $clean) { return homebox_main_ref($ot, $ref, $rank); } // 품질 조건에 맞는 곳이 없으면 예전대로
    return $row;
}

/**
 * 서브페이지 레퍼런스 화면 고르기 — ① 메인과 같은 사이트의 그 유형 화면 ② 같은 기관 유형 사이트 ③ 전체.
 * 분해 품질(섹션 수·미분류 비율·본문 섹션)로 거른다. 2026-09-30 시험: get_page_pattern 예시 1순위가
 * '게시판 목록'인데 실제로는 안내 페이지였고, 기관 유형과 무관한 사이트가 나와 홈페이지가 섞였다.
 */
function homebox_sub_ref(string $pt, int $siteId, string $ot, bool $strict = false): ?array
{
    $alt = ['board_list' => ['board_list'], 'board_view' => ['board_view'], 'content' => ['content'], 'faq' => ['faq'], 'org_chart' => ['org_chart'],
        'greeting' => ['greeting'], 'location' => ['location'], 'history' => ['history'], 'vision' => ['vision'], 'form' => ['form'], 'procedure' => ['procedure', 'content']][$pt] ?? [$pt];
    $in = implode(',', array_fill(0, count($alt), '?'));
    $sel = "SELECT sc.id, sc.site_id, sc.status, sc.url, sc.title, sc.page_type_id AS page_type, sc.viewport_w, sc.device, s.slug,
                COALESCE(o.display_name, o.name) AS org_name, o.org_type_id AS org_type, d.primary_hex, d.palette, d.fonts, d.radius_px, d.container_px, d.colors, d.typography,
                (SELECT COUNT(*) FROM sections x WHERE x.screen_id = sc.id) AS n_sec,
                (SELECT COUNT(*) FROM sections x WHERE x.screen_id = sc.id AND x.section_type_id = 'unknown') AS n_unk,
                (SELECT COUNT(*) FROM sections x WHERE x.screen_id = sc.id AND x.section_type_id = 'lnb') AS n_lnb,
                (SELECT COUNT(*) FROM sections x WHERE x.screen_id = sc.id AND x.section_type_id = ?) AS n_key
         FROM screens sc JOIN sites s ON s.id = sc.site_id JOIN organizations o ON o.id = s.org_id LEFT JOIN site_design d ON d.site_id = s.id
         WHERE sc.page_type_id IN ($in) AND sc.status = 'published' AND sc.device = 'pc' AND s.status = 'published' AND " . homebox_src($ot) . " AND " . Homebox\RefFilter::NOT_FOREIGN;
    $good = ' HAVING n_sec >= 4 AND n_unk * 3 <= n_sec';
    // 안내(content) 레퍼런스에서 본인인증·로그인·검색·오류 화면은 뺀다 — 기관 소개 시안에 '본인인증' 화면이 뽑혔다(2026-10-01)
    if ($pt === 'content') { $sel .= " AND COALESCE(sc.title, '') NOT REGEXP '본인인증|실명인증|로그인|회원가입|통합검색|검색결과|오류|사이트맵|개인정보처리방침|이용약관'"; }
    // 그 유형의 본문 섹션(인사말·게시판 표·조직도…)이 실제로 있는 화면을 먼저 — 없으면 '열린시장실 메인' 같은 화면이 인사말로 뽑힌다
    $key = ['greeting' => 'greeting_vision', 'board_list' => 'board_list', 'board_view' => 'board_view', 'org_chart' => 'org_chart', 'faq' => 'faq_list', 'location' => 'location_map', 'history' => 'timeline', 'procedure' => 'step_flow', 'form' => 'form'][$pt] ?? ''; // form: 입력 폼 섹션이 실제로 있는 화면(안내만 있는 신청 페이지 말고 — 2026-10-03 시험)
    // 화면 제목도 본다 — 섹션 분류만 보면 '역대 시장 표'가 인사말로, '역대 이사장'이 절차로, '서비스 조회 목록'이 폼으로 뽑혔다(2026-10-03 시험 20건 중 7건)
    $want = ['greeting' => '인사|환영', 'procedure' => '절차|방법|순서|과정|처리 ?안내|이용 ?안내|신청 ?안내', 'history' => '연혁|역사|발자취', 'vision' => '비전|목표|미션|핵심 ?가치|경영 ?방침',
        'form' => '신청|접수|작성|등록|제출|예약', 'location' => '오시는|찾아오|약도|교통 ?안내|청사 ?위치', 'org_chart' => '조직|부서|직원', 'faq' => '자주|FAQ|질문|묻는',
        'board_list' => '공지|소식|게시|보도|알림|뉴스', 'board_view' => '공지|소식|보도|알림|뉴스'][$pt] ?? '';
    $avoid = ['greeting' => '역대|연혁|일정|동정', 'procedure' => '역대|연혁|인사말|처리방침|개인정보|조직도|저작권', 'vision' => '역대|인사말|평가|영향', 'form' => '조회|목록|검색결과|확인|완료|결과|내역', 'location' => '자연환경|지리', 'content' => '역대|조직도|방침|저작권|약관|무단수집|사이트맵'][$pt] ?? '';
    $sel = str_replace(' FROM screens sc JOIN', ",\n                (" . ($want !== '' ? "COALESCE(sc.title, '') REGEXP '" . $want . "'" : '0') . ") AS t_ok,\n                (" . ($avoid !== '' ? "COALESCE(sc.title, '') REGEXP '" . $avoid . "'" : '0') . ") AS t_bad\n         FROM screens sc JOIN", $sel);
    $order = ' ORDER BY t_bad ASC, (n_key > 0) + t_ok DESC, t_ok DESC, n_lnb > 0 DESC, (s.rating_avg IS NULL), s.rating_avg DESC, s.krds_score DESC, s.renewal_year DESC, sc.id LIMIT 1';
    $own = Db::row($sel . ' AND sc.site_id = ?' . $good . $order, [$key, ...$alt, $siteId]);
    if ($own !== null && (int) $own['t_bad'] === 0 && (!$strict || $key === '' || (int) $own['n_key'] > 0)) { return $own; }
    if ($own !== null && (int) $own['t_bad'] === 1) { $own = null; } // 제목이 다른 종류(역대·방침…)인 자기 사이트 화면은 버린다
    $fam = $ot !== '' ? explode('_', $ot)[0] . '_%' : ''; // 같은 묶음(public_* 등) — 공기업 시안 서브가 시청·국세청 화면으로 가지 않게(2026-10-01)
    $need = $strict && $key !== '' ? ' AND n_key > 0' : ''; // 핵심 섹션 없는 화면은 넓혀서라도 피한다(2026-10-03 시험: 폼 요청에 조회 목록)
    $byOt = static fn (string $n) => $ot !== '' ? Db::row($sel . ' AND (o.org_type_id = ? OR o.org_type_id LIKE ?)' . $good . $n . $order, [$key, ...$alt, $ot, $ot . '%']) : null;
    $byFam = static fn (string $n) => $fam !== '' ? Db::row($sel . ' AND o.org_type_id LIKE ?' . $good . $n . $order, [$key, ...$alt, $fam]) : null;
    // 핵심 섹션이 있는 화면을 기관 유형 → 묶음 → 전체 순으로 찾고, 그 유형 핵심 섹션이 어디에도 없으면(인사말 등) 기관 유형으로 돌아온다
    // 같은 유형·묶음에 핵심 섹션은 없어도 제목이 맞는 화면이 있으면 다른 유형보다 먼저(2026-10-12: 시청 인사말이 체육회·진흥원으로 갔다)
    return ($need !== '' ? ($byOt($need) ?? $byFam($need) ?? $byOt(' AND t_ok = 1') ?? $byFam(' AND t_ok = 1') ?? Db::row($sel . $good . $need . $order, [$key, ...$alt])) : null)
        ?? $byOt('')
        ?? ($key !== '' ? $byFam(' AND n_key > 0') : null)
        ?? $byFam('')
        ?? $own
        ?? Db::row($sel . $good . $order, [$key, ...$alt]);
}

/**
 * GET /api/mockups/site?org_type=&ref=&rank=&pages=board_list,content,greeting&primary=%23RRGGBB&font=
 *   홈페이지 한 벌 — 메인 + 서브 여러 장을 같은 가상 기관·색·글꼴·주 메뉴로 (Pro). MCP build_homepage.
 */
$router->get('/api/mockups/site', static function (): void {
    $plan = Plan::current();
    if (($plan['limits']['design_data'] ?? 'summary') !== 'full' && empty($plan['admin'])) {
        Response::error(402, 'UPGRADE_REQUIRED', '홈페이지 목업은 Pro 이상에서 제공합니다.', ['plan' => $plan['id']]);
    }
    $ot = homebox_infer_ot(trim((string) ($_GET['org_type'] ?? '')), (string) ($_GET['org_name'] ?? ''));
    $sc = homebox_main_ref($ot, trim((string) ($_GET['ref'] ?? '')), (int) ($_GET['rank'] ?? 1), true); // 자동 조립 — 분해 품질 조건
    if ($sc === null) { Response::error(404, 'NOT_FOUND', '조건에 맞는 메인 레퍼런스가 없습니다.'); }
    $on = homebox_client_org((string) ($_GET['org_name'] ?? ''));
    if ($on !== '') { $sc['persona_name'] = $on; }
    if ($ot !== '') { $sc['persona_type'] = $ot; } // 요청·짐작한 종류가 레퍼런스 종류보다 먼저(대학 요청이 공공기관 레퍼런스로 넓혀져도 대학 페르소나)
    $pages = array_values(array_unique(array_filter(array_map('trim', explode(',', (string) ($_GET['pages'] ?? 'board_list,content,greeting'))), static fn ($p) => $p !== '' && $p !== 'main')));
    if (count($pages) > 8) { Response::error(400, 'TOO_MANY_PAGES', '서브페이지는 최대 8장입니다.'); }
    $site = ['tok' => []];
    $primary = strtoupper(trim((string) ($_GET['primary'] ?? '')));
    if ($primary !== '' && !preg_match('/^#[0-9A-F]{6}$/', $primary)) { Response::error(400, 'BAD_PRIMARY', 'primary 는 #RRGGBB 형식입니다.'); }
    if ($primary !== '') { $site['tok']['primary'] = $primary; }
    $font = trim((string) ($_GET['font'] ?? ''));
    if ($font !== '') { $site['tok']['font'] = Homebox\WebFont::stack(Homebox\WebFont::canonical($font) ?? $font); }
    $rows = Db::rows('SELECT id, section_type_id AS type, bbox_x AS x, bbox_y AS y, bbox_w AS w, bbox_h AS h, structure FROM sections WHERE screen_id = ? ORDER BY bbox_y, bbox_x', [(int) $sc['id']]);
    $main = homebox_main_mockup($sc, $rows, $site);
    // 홈페이지 공통값 = 메인이 실제로 쓴 값(가상 기관·토큰·주 메뉴와 그 하위 메뉴)
    preg_match_all('/<button type="button" class="mm-gnb-btn"[^>]*>([^<]+)<\/button>/u', (string) $main['html'], $m);
    // real = 메인 레퍼런스 기관명 — 서브의 주 메뉴는 메인 것을 쓰므로 그 기관명도 서브에서 지운다(2026-10-12 build-leaks-real-org)
    $shared = ['persona' => $main['persona'], 'tok' => $main['tokens'], 'gnb' => array_map('trim', $m[1] ?? []), 'real' => (string) $sc['org_name']];
    // 판정용 ref_id (2026-10-12 build-no-ref-id) — 메인은 single:(숫자 id 로 판정하면 복제 위험 치명), 서브는 화면 id
    $main['ref_id'] = 'single:' . (int) $sc['id'];
    // 응답 중복 덜기 (2026-10-12 build-response-big) — 장마다 같은 persona·tokens·근거는 site 에 한 번만
    $slim = static fn (array $p): array => array_diff_key($p, ['persona' => 1, 'tokens' => 1, 'content_basis' => 1, 'layout_basis' => 1]);
    $out = [];
    foreach ($pages as $pt) {
        $sub = homebox_sub_ref($pt, (int) $sc['site_id'], (string) $sc['org_type']);
        if ($sub === null) { $out[] = ['page_type' => $pt, 'error' => '레퍼런스 화면 없음']; continue; }
        $srows = Db::rows('SELECT id, section_type_id AS type, bbox_x AS x, bbox_y AS y, bbox_w AS w, bbox_h AS h, structure FROM sections WHERE screen_id = ? ORDER BY bbox_y, bbox_x', [(int) $sub['id']]);
        $p = homebox_kit_subpage($sub, $srows, $shared);
        $out[] = ['page_type' => $pt, 'ref_id' => (string) (int) $sub['id'], 'ref_same_site' => (int) $sub['site_id'] === (int) $sc['site_id']] + $slim($p);
    }
    Response::json([
        'site' => ['persona' => $main['persona'], 'tokens' => $main['tokens'], 'gnb' => $shared['gnb'], 'main_ref' => $sc['slug'], 'custom' => array_filter(['primary' => $primary, 'font' => $font]),
            'content_basis' => $main['content_basis'], 'layout_basis' => $main['layout_basis']],
        'main' => $slim($main), 'pages' => $out,
        'usage' => '메인과 서브가 같은 가상 기관·색·글꼴·주 메뉴를 쓰는 홈페이지 한 벌이다. 각 html 을 그대로 .html 로 저장하면 열린다. 서브 레퍼런스는 메인과 같은 사이트의 그 유형 화면을 먼저 쓰고(ref_same_site), 없으면 같은 기관 유형에서 분해 품질이 좋은 화면을 쓴다. persona·tokens·근거는 site 에 한 번만 담았다.',
        'next' => '판정은 이 ref_id 로 — 장마다 check_mockup(html, ref_id=main.ref_id 또는 pages[].ref_id, page_type) 을 부르고 통과(85점+, 치명 0)할 때까지 고친다.',
    ], 200, ['Cache-Control' => 'private, no-store']);
});

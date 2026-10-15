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
    $ot = homebox_infer_ot(trim((string) ($_GET['org_type'] ?? '')), (string) ($_GET['org_name'] ?? ''));
    $main = homebox_main_ref($ot, trim((string) ($_GET['ref'] ?? '')), (int) ($_GET['rank'] ?? 1));
    if ($main === null) { Response::error(404, 'NOT_FOUND', '조건에 맞는 레퍼런스가 없습니다.'); }
    $page = trim((string) ($_GET['page'] ?? 'main'));
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
    if (!$isSub && $others) {
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
    Response::json($kit + [
        'usage' => '이 묶음으로 시안을 직접 만든다. 배치는 참고 이미지와 rows·sections 를 그대로 따르고, 글·이미지·색은 persona·samples·theme 로 전부 바꾼다. 조작 요소는 behavior 규약으로 실제 동작하게 만든다. procedure 순서대로 하고 acceptance 로 확인한다.',
        'attribution' => '배치 출처: ' . implode(', ', array_map(static fn ($r) => $r['org_name'] . ' (' . $r['url'] . ')', $srcs)) . '. 홈박스는 저작권을 주장하지 않으며 참고용입니다. 그 기관들의 글·사진·로고는 쓰지 않습니다.',
    ], 200, ['Cache-Control' => 'private, no-store']);
});

/** 섞기 출처 B·C — A 와 같은 기관 유형에서 A 다음 순위의 다른 사이트(다른 기관) 2곳. */
function homebox_mix_refs(string $ot, array $main, int $rank): array
{
    $use = $ot !== '' ? $ot : (string) ($main['org_type'] ?? '');
    $out = []; $seen = [(int) $main['site_id'] => true]; $names = [(string) $main['org_name'] => true];
    for ($r = 1; $r <= 30 && count($out) < 2; $r++) {
        $o = homebox_main_ref($use, '', max(1, $rank) + $r);
        if ($o === null) { break; }
        if (isset($seen[(int) $o['site_id']]) || isset($names[(string) $o['org_name']])) { continue; }
        $seen[(int) $o['site_id']] = true; $names[(string) $o['org_name']] = true;
        $out[] = $o;
    }
    return $out;
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
    $ref = str_starts_with($rid, 'mix1:') ? ReplicaKit::checkRefMix($rid) : ReplicaKit::checkRef((int) ($rid !== '' ? $rid : ($_GET['screen_id'] ?? 0)));
    // 메인 화면 한 장을 숫자 id 로 판정하려는 경우 = 한 사이트를 통째로 따른 시안(2026-10-02 섞기로 전환). 묶음이 single: 로 준 경우와 관리자 점검만 허용한다.
    if ($ref !== null && !empty($ref['single_main']) && !$single && empty($_GET['screen_id'])) { $ref['copy_risk'] = true; }
    if ($ref === null) { Response::error(404, 'NOT_FOUND', '판정 기준을 찾지 못했습니다. get_replica_kit 응답의 reference.ref_id 를 그대로 주세요.'); }
    Response::json($ref, 200, ['Cache-Control' => 'private, no-store']);
});

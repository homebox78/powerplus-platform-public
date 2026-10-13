<?php
declare(strict_types=1);

/**
 * GET /api/sites/{slug}/flows — S06 업무흐름 탭 (docs/02): 시나리오별 단계 화면(1/N …), KRDS 서비스 패턴, 비로그인 구간까지("본인인증 이후 미수집")
 * flows/flow_steps 에 검수·수집된 흐름이 있으면 그것을, 없으면 **게시 화면에서 자동 유도**(시나리오 → 페이지 유형·제목 키워드 순서). 유도 흐름은 source=auto 로 표시.
 * @var Homebox\Http\Router $router
 */

use Homebox\Db;
use Homebox\Http\Response;
use Homebox\Plan;
use Homebox\Signer;

/** 자동 유도 규칙: 단계마다 [페이지 유형 후보, 제목 키워드(정규식)] — 첫 매칭 화면 1장. 마지막 단계가 login 이면 truncated */
$RULES = [
    'civil_apply' => ['name' => '민원 신청', 'pattern' => 'service_apply', 'steps' => [
        ['main', null, '메인'], ['content', '/민원/', '민원 안내'], ['form', '/민원|신청|제안|신고/', '신청서 작성'], ['login', null, '본인인증·로그인'],
    ]],
    'facility_reserve' => ['name' => '공공시설 예약', 'pattern' => 'service_apply', 'steps' => [
        ['main', null, '메인'], ['form', '/예약|reserv/i', '예약 목록·신청'], ['login', null, '본인인증·로그인'],
    ]],
    'signup' => ['name' => '회원가입', 'pattern' => 'service_login', 'steps' => [
        ['main', null, '메인'], ['login', null, '로그인·인증 선택'],
    ]],
    'search' => ['name' => '통합검색', 'pattern' => 'service_search', 'steps' => [
        ['main', null, '메인 검색창'], ['search', null, '검색 결과'],
    ]],
    'info_disclosure' => ['name' => '정보공개 청구', 'pattern' => 'service_apply', 'steps' => [
        ['main', null, '메인'], ['info_disclosure', '/정보공개|청구|처리/', '정보공개 안내'], ['form', '/청구|신청/', '청구서 작성'], ['login', null, '본인인증·로그인'],
    ]],
    'board_read' => ['name' => '게시판 열람', 'pattern' => 'basic_list_navigation', 'steps' => [
        ['main', null, '메인'], ['board_list', null, '목록'], ['board_view', null, '상세'],
    ]],
];

$router->get('/api/sites/{slug}/flows', static function (array $p) use ($RULES): void {
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
    $screens = Db::rows(
        "SELECT sc.id, sc.page_type_id, pt.name_ko AS page_type_ko, sc.title, sc.url, sc.thumb_asset_id, sc.card_asset_id, sc.public_asset_id,
                (SELECT COUNT(*) FROM sections x WHERE x.screen_id = sc.id) AS sections
         FROM screens sc JOIN page_types pt ON pt.id = sc.page_type_id
         WHERE sc.site_id = ? AND sc.status = 'published' AND sc.device = ? ORDER BY sc.sort, sc.id", [$siteId, $device]);
    $byId = [];
    foreach ($screens as $s) {
        $byId[(int) $s['id']] = $s;
    }
    $step = static function (array $s, int $no, ?string $label, ?string $krds) use ($allowed, $siteId): array {
        $ok = Plan::canSee($allowed, (int) $s['id']);
        return [
            'locked' => !$ok,
            'step_no' => $no, 'label' => $label ?? $s['title'] ?? $s['page_type_ko'], 'screen_id' => (int) $s['id'], 'page_type' => $s['page_type_id'], 'page_type_ko' => $s['page_type_ko'],
            'title' => $s['title'], 'url' => $s['url'], 'sections' => (int) $s['sections'], 'krds_pattern' => $krds,
            'thumb_url' => $s['thumb_asset_id'] ? Signer::url((int) $s['thumb_asset_id']) : null, 'card_url' => $ok ? Plan::kurl($siteId, $s['card_asset_id']) : null, 'public_url' => $ok ? Plan::kurl($siteId, $s['public_asset_id']) : null,
        ];
    };
    $patterns = [];
    foreach (Db::rows('SELECT id, name_ko FROM krds_patterns') as $kp) {
        $patterns[$kp['id']] = $kp['name_ko'];
    }

    // 1) 저장된 흐름
    $items = [];
    $saved = Db::rows('SELECT f.id, f.scenario_id, f.name, f.krds_pattern_id, f.truncated_reason FROM flows f WHERE f.site_id = ? ORDER BY f.id', [$siteId]);
    foreach ($saved as $f) {
        $steps = [];
        foreach (Db::rows('SELECT step_no, screen_id, label FROM flow_steps WHERE flow_id = ? ORDER BY step_no', [(int) $f['id']]) as $st) {
            $s = $byId[(int) $st['screen_id']] ?? null;
            if ($s !== null) {
                $steps[] = $step($s, (int) $st['step_no'], $st['label'], null);
            }
        }
        if ($steps === []) {
            continue;
        }
        $items[] = ['id' => 'flow-' . $f['id'], 'scenario_id' => $f['scenario_id'], 'name' => $f['name'], 'krds_pattern' => $f['krds_pattern_id'], 'krds_pattern_ko' => $patterns[$f['krds_pattern_id']] ?? null, 'source' => 'collected', 'truncated_reason' => $f['truncated_reason'], 'steps' => $steps];
    }
    // 2) 자동 유도 (저장된 시나리오는 건너뜀)
    $have = array_flip(array_filter(array_column($items, 'scenario_id')));
    foreach ($RULES as $sid => $rule) {
        if (isset($have[$sid])) {
            continue;
        }
        $steps = [];
        $used = [];
        foreach ($rule['steps'] as $i => [$type, $re, $label]) {
            $pick = null;
            foreach ($screens as $s) {
                if ($s['page_type_id'] !== $type || isset($used[(int) $s['id']])) {
                    continue;
                }
                if ($re !== null && !preg_match($re, (string) ($s['title'] ?? ''))) {
                    continue;
                }
                $pick = $s;
                break;
            }
            // 키워드 단계는 키워드 매칭 화면만 쓴다(정보공개 청구서에 통합예약 폼이 끼는 오류 방지). 없으면 그 단계는 건너뜀
            if ($pick === null) {
                if ($type === 'login') {
                    break; // 로그인 화면이 없으면 그 앞까지
                }
                continue;
            }
            $used[(int) $pick['id']] = true;
            $steps[] = $step($pick, count($steps) + 1, $label, $i === 0 ? null : $rule['pattern']);
        }
        if (count($steps) < 2) {
            continue;
        }
        $last = end($steps);
        $items[] = [
            'id' => 'auto-' . $sid, 'scenario_id' => $sid, 'name' => $rule['name'], 'krds_pattern' => $rule['pattern'], 'krds_pattern_ko' => $patterns[$rule['pattern']] ?? null,
            'source' => 'auto', 'truncated_reason' => $last['page_type'] === 'login' ? '본인인증 이후 구간은 수집하지 않습니다' : null, 'steps' => $steps,
        ];
    }
    Response::json(['total' => count($items), 'device' => $device, 'items' => $items, 'attribution' => '출처는 각 화면의 기관 사이트. 자동 유도 흐름은 게시 화면의 유형·제목으로 추정한 순서이며 검수로 확정됩니다.'], 200, ['Cache-Control' => 'public, max-age=60']);
});

<?php
declare(strict_types=1);

/**
 * GET /api/insights/page?page_type=greeting|org_chart|board_list…  (2026-09-24, MCP 공백 분석)
 *   서브페이지 샘플이 "일반적인 KRDS 틀" 로 나온 원인 = 페이지 유형 단위로 여러 기관 화면을 찾는 경로가 없었다.
 *   → 그 유형 화면들을 가로질러 섹션 구성을 합성: 유형별 등장률·위치·높이·폭·흔한 제목 + 전형 순서 + 상위 화면 5장(섹션 목록 포함).
 *   insights.php 의 $scope·$scoreSql·$W·$median 을 그대로 쓴다(같은 파일 스코프에서 require).
 * @var Homebox\Http\Router $router
 */

use Homebox\Db;
use Homebox\Http\Response;
use Homebox\Plan;
use Homebox\SectionShape;
use Homebox\Signer;

$router->get('/api/insights/page', static function () use ($scope, $scoreSql, $W, $median): void {
    $pt = preg_replace('/[^a-z_]/', '', (string) ($_GET['page_type'] ?? ''));
    if ($pt === '' || Db::row('SELECT id FROM page_types WHERE id = ?', [$pt]) === null) {
        Response::error(422, 'INVALID_PAGE_TYPE', 'page_type 은 page_types.id 여야 합니다 (예: greeting, org_chart, board_list, board_view, content, main).');
    }
    $device = in_array((string) ($_GET['device'] ?? 'pc'), ['pc', 'mobile'], true) ? (string) ($_GET['device'] ?? 'pc') : 'pc';
    [$where, $params] = $scope();
    $screens = Db::rows("SELECT sc.id, sc.title AS screen_title, sc.url, sc.full_h, sc.viewport_w, sc.thumb_asset_id, sc.public_asset_id,
                                s.id AS site_id, s.slug, s.title, s.renewal_year, {$scoreSql($W)} AS score
                         FROM screens sc JOIN sites s ON s.id = sc.site_id JOIN organizations o ON o.id = s.org_id JOIN org_types ot ON ot.id = o.org_type_id LEFT JOIN site_design d ON d.site_id = s.id
                         WHERE $where AND sc.status = 'published' AND " . \Homebox\RefFilter::NOT_FOREIGN . " AND sc.device = ? AND sc.page_type_id = ?
                         ORDER BY score DESC, sc.id", array_merge($params, [$device, $pt]));
    $n = count($screens);
    $sitesN = count(array_unique(array_column($screens, 'site_id')));
    $bySc = [];
    $ids = array_map(static fn (array $r): int => (int) $r['id'], $screens);
    foreach (array_chunk($ids, 500) as $chunk) {
        $rows = Db::rows('SELECT x.id, x.screen_id, x.section_type_id AS type, x.bbox_x, x.bbox_y, x.bbox_w, x.bbox_h, x.structure, x.crop_asset_id FROM sections x WHERE x.screen_id IN (' . implode(',', $chunk) . ') ORDER BY x.bbox_y, x.bbox_x');
        foreach ($rows as $x) {
            $bySc[(int) $x['screen_id']][] = $x;
        }
    }
    $agg = [];
    foreach ($screens as $sc) {
        $fh = max(1, (int) $sc['full_h']);
        $vw = max(1, (int) $sc['viewport_w']);
        $seen = [];
        foreach ($bySc[(int) $sc['id']] ?? [] as $x) {
            $t = (string) $x['type'];
            $a = $agg[$t] ?? ['y' => [], 'x' => [], 'w' => [], 'h' => [], 'titles' => [], 'flags' => [], 'cols' => [], 'styles' => [], 'count' => 0, 'screens' => 0];
            $a['y'][] = round((float) $x['bbox_y'] / $fh, 3);
            $a['x'][] = round((float) $x['bbox_x'] / $vw, 3);
            $a['w'][] = round((float) $x['bbox_w'] / $vw, 3);
            $a['h'][] = (float) $x['bbox_h'];
            $st = SectionShape::structure($x['structure'] ?? null) ?? [];
            if (!empty($st['title'])) {
                $a['titles'][$st['title']] = ($a['titles'][$st['title']] ?? 0) + 1;
            }
            foreach ((array) ($st['flags'] ?? []) as $k => $v) {
                if ($v) {
                    $a['flags'][$k] = ($a['flags'][$k] ?? 0) + 1;
                }
            }
            if (!empty($st['cols'])) {
                $a['cols'][] = (int) $st['cols'];
            }
            if (isset($st['style']) && is_array($st['style'])) {
                $a['styles'][] = $st['style'];
            }
            $a['count']++;
            if (!isset($seen[$t])) {
                $a['screens']++;
                $seen[$t] = true;
            }
            $agg[$t] = $a;
        }
    }
    $sections = [];
    foreach ($agg as $t => $a) {
        arsort($a['titles']);
        $sections[] = [
            'section_type' => $t, 'presence_pct' => $n ? round($a['screens'] / $n * 100, 1) : 0, 'count' => $a['count'],
            'y_ratio' => $median($a['y']), 'x_ratio' => $median($a['x']), 'w_ratio' => $median($a['w']), 'height_px' => $median($a['h']),
            'cols' => $median($a['cols']),
            'common_titles' => array_slice(array_keys($a['titles']), 0, 6),
            'flags_pct' => array_map(static fn (int $v): float => round($v / max(1, $a['count']) * 100, 1), $a['flags']),
            'style' => SectionShape::styleSummary($a['styles']),
        ];
    }

    // 화면 유형(레이아웃) 분류 — 인사말은 "LNB 가 있는 표준 서브페이지"와 "기관장 전용 사이트(폭 가득 사진 비주얼, LNB 없음)"로 갈린다
    //   (2026-09-24 Claude 웹 테스트: AI 가 화면을 하나씩 열어 보고서야 두 유형을 찾았다 — 합성에서 바로 주어야 한다)
    $archOf = static function (array $secs): string {
        $hasLnb = false; $hero = false;
        foreach ($secs as $x) {
            if ($x['type'] === 'lnb') { $hasLnb = true; }
            if (!$hero && (int) $x['bbox_y'] < 700 && (int) $x['bbox_h'] >= 300 && in_array($x['type'], ['sub_visual', 'main_visual', 'unknown'], true)) {
                $st = SectionShape::structure($x['structure'] ?? null) ?? [];
                $s = (array) ($st['style'] ?? []);
                if (($s['photo'] ?? '') === 'full_bleed' || !empty($s['text_on_photo'])) { $hero = true; }
            }
        }
        return $hasLnb ? 'lnb_subpage' : ($hero ? 'hero_microsite' : 'plain');
    };
    $LAYOUT_KO = ['lnb_subpage' => '표준 서브페이지형 — 헤더·좌측 메뉴(LNB)·경로·제목 아래 본문', 'hero_microsite' => '전용 사이트형 — LNB 없이 폭 가득 사진 비주얼(글자를 사진 위에) 뒤로 본문 블록이 이어짐', 'plain' => '단순형 — LNB·큰 비주얼 없이 본문만'];
    $arch = [];
    foreach ($screens as $sc) { $arch[(int) $sc['id']] = $archOf($bySc[(int) $sc['id']] ?? []); }
    $archN = array_count_values($arch);
    arsort($archN);
    $layouts = [];
    foreach ($archN as $k => $v) { $layouts[] = ['layout' => $k, 'label' => $LAYOUT_KO[$k], 'pct' => $n ? round($v / $n * 100, 1) : 0, 'screens' => $v]; }
    usort($sections, static fn (array $a, array $b): int => $b['presence_pct'] <=> $a['presence_pct']);
    $seq = array_values(array_filter($sections, static fn (array $s): bool => $s['presence_pct'] >= 40));
    usort($seq, static fn (array $a, array $b): int => ((float) $a['y_ratio'] <=> (float) $b['y_ratio']) ?: ((float) $a['x_ratio'] <=> (float) $b['x_ratio']));

    $plan = Plan::current();
    $exemplars = [];
    $used = [];
    // 유형마다 최고점 화면 1장을 먼저 — 참고 이미지에 두 유형이 모두 들어가게
    // 예시 화면 품질: 화면 제목이 그 유형 낱말과 맞고, 미분류(unknown) 면적이 적은 화면 먼저 (MCP 20문 시험 2026-10-05: 인사말 예시에 '포토뉴스'·미분류 덩어리 화면)
    $titleRe = [
        'greeting' => '/인사말|인사|열린.{0,4}실|장실|소개/u', 'faq' => '/FAQ|자주\s*묻|질문/iu', 'org_chart' => '/조직|직원|담당/u',
        'board_list' => '/공지|게시|목록|소식|알림/u', 'board_view' => '/공지|게시|상세|보기/u', 'location' => '/오시는|찾아|위치|약도/u',
        'history' => '/연혁|역사/u', 'vision' => '/비전|목표|미션/u', 'symbol' => '/상징|로고|CI/iu',
    ][$pt] ?? null;
    $quality = static function (array $sc) use ($bySc, $titleRe): float {
        $all = 0.0; $unk = 0.0;
        foreach ($bySc[(int) $sc['id']] ?? [] as $x) {
            $ar = (float) $x['bbox_w'] * (float) $x['bbox_h'];
            $all += $ar;
            if ($x['type'] === 'unknown') { $unk += $ar; }
        }
        $q = 1 - ($all > 0 ? $unk / $all : 1);
        if ($titleRe !== null) { $q += preg_match($titleRe, (string) $sc['screen_title']) ? 1 : -1; }
        return $q;
    };
    $ranked = $screens;
    usort($ranked, static fn (array $x, array $y): int => (round($quality($y), 1) <=> round($quality($x), 1)) ?: ((float) $y['score'] <=> (float) $x['score']));
    $ordered = [];
    foreach (array_keys($archN) as $k) {
        foreach ($ranked as $sc) { if ($arch[(int) $sc['id']] === $k) { $ordered[] = $sc; break; } }
    }
    foreach ($ranked as $sc) { $ordered[] = $sc; }
    // 미분류 면적 비율(0~1). 반이 넘는 화면은 섹션 목록이 "unknown 덩어리"라 예시로 쓰기 어렵다 — 뒤로 돌리고 3장이 차면 버린다(2026-10-12 MCP 시험: 대학 메인 unknown 65.6%·예시 중복·응답 812KB).
    $unkShare = static function (array $sc) use ($bySc): float {
        $all = 0.0; $unk = 0.0;
        foreach ($bySc[(int) $sc['id']] ?? [] as $x) { $ar = (float) $x['bbox_w'] * (float) $x['bbox_h']; $all += $ar; if ($x['type'] === 'unknown') { $unk += $ar; } }
        return $all > 0 ? $unk / $all : 1.0;
    };
    $clean = array_values(array_filter($ordered, static fn (array $sc): bool => $unkShare($sc) <= 0.5));
    $dirty = array_values(array_filter($ordered, static fn (array $sc): bool => $unkShare($sc) > 0.5));
    $sigs = [];
    $maxEx = 4;
    foreach (array_merge($clean, $dirty) as $sc) {
        if (isset($used[$sc['site_id']]) || count($exemplars) >= $maxEx) {
            continue;
        }
        if ($unkShare($sc) > 0.5 && count($exemplars) >= 3) { continue; }
        // 같은 구성(레이아웃 + 섹션 유형 순서)이면 한 장만 — 예시가 같은 그림을 되풀이하지 않게
        $sig = $arch[(int) $sc['id']] . '|' . implode(',', array_map(static fn (array $x): string => (string) $x['type'], $bySc[(int) $sc['id']] ?? []));
        if (isset($sigs[$sig])) { continue; }
        $sigs[$sig] = true;
        $used[$sc['site_id']] = true;
        $ok = Plan::canSee(Plan::allowedScreens((int) $sc['site_id'], $plan), (int) $sc['id']);
        $exemplars[] = [
            'slug' => $sc['slug'], 'title' => $sc['title'], 'renewal_year' => $sc['renewal_year'] === null ? null : (int) $sc['renewal_year'], 'score' => round((float) $sc['score'], 3),
            'layout' => $arch[(int) $sc['id']], 'unknown_pct' => (int) round($unkShare($sc) * 100),
            'screen_id' => (int) $sc['id'], 'screen_title' => $sc['screen_title'], 'url' => $sc['url'], 'full_h' => (int) $sc['full_h'], 'viewport_w' => (int) $sc['viewport_w'], 'locked' => !$ok,
            'thumb_url' => $ok && $sc['thumb_asset_id'] ? Signer::url((int) $sc['thumb_asset_id']) : null,
            'public_url' => $ok ? Plan::kurl((int) $sc['site_id'], $sc['public_asset_id']) : null,
            'image_withheld' => Plan::koglWithheld((int) $sc['site_id'], $plan), // 공공누리 2~4유형이면 원본 화면·크롭을 뺀 이유(O-04), 아니면 null
            'sections' => array_map(static function (array $x) use ($ok, $sc): array {
                $st = SectionShape::structure($x['structure'] ?? null) ?? [];
                // 값이 없는(null·빈 목록) 칸은 뺀다 — 빠진 키 = 없음(응답 크기, 2026-10-12)
                return array_filter([
                    'section_id' => (int) $x['id'], 'type' => $x['type'], 'x' => (int) $x['bbox_x'], 'y' => (int) $x['bbox_y'], 'w' => (int) $x['bbox_w'], 'h' => (int) $x['bbox_h'],
                    'title' => $st['title'] ?? null, 'cols' => $st['cols'] ?? null, 'links' => $st['links']['n'] ?? null, 'colors' => $st['colors'] ?? null, 'style' => isset($st['style']) ? (array_filter((array) $st['style'], static fn ($v): bool => $v !== null && $v !== false && $v !== []) ?: null) : null,
                    'headings' => array_slice((array) ($st['headings'] ?? []), 0, 6), 'link_labels' => array_slice((array) ($st['links']['labels'] ?? []), 0, 8),
                    'text' => isset($st['text']) ? mb_substr((string) $st['text'], 0, 120) : null,
                    'crop_url' => $ok ? Plan::kurl((int) $sc['site_id'], $x['crop_asset_id']) : null,
                ], static fn ($v): bool => $v !== null && $v !== []);
            }, $bySc[(int) $sc['id']] ?? []),
        ];
    }
    $conf = $sitesN >= 30 ? 'high' : ($sitesN >= 10 ? 'medium' : 'low');
    Response::json([ 'scope_note' => $GLOBALS['hb_scope_note'] ?? null,
        'page_type' => $pt, 'device' => $device, 'n_screens' => $n, 'n_sites' => $sitesN, 'confidence' => $conf,
        // 0곳이면 이유와 다음 행동을 말한다(MC-25) — 전엔 "exemplars 를 우선 참고"라 했지만 exemplars 도 비어 있었다
        'note' => $sitesN === 0 ? '이 조건(page_type·org_type·tone·개편 연도)에 맞는 화면이 없습니다. org_type·tone·renewal_from 을 빼거나 비슷한 page_type 으로 다시 부르세요.'
            : ($conf === 'low' ? "표본 {$sitesN}곳 — 구성은 exemplars 를 우선 참고." : "{$sitesN}곳 · 화면 {$n}장 합성"),
        'full_h_px' => $median(array_column($screens, 'full_h')),
        'layouts' => $layouts,
        'presence_note' => 'presence_pct 는 자동 분해가 인식한 비율(하한)이다. 경로·페이지 제목·탭·만족도처럼 작은 요소는 인식률이 낮아 실제보다 낮게 나온다 — exemplars 이미지로 확인할 것.',
        'typical_sequence' => array_map(static fn (array $s): array => ['section_type' => $s['section_type'], 'presence_pct' => $s['presence_pct'], 'y_ratio' => $s['y_ratio'], 'x_ratio' => $s['x_ratio'], 'w_ratio' => $s['w_ratio']], $seq),
        'sections' => $sections,
        'exemplars' => $exemplars,
        'gate' => Plan::info($plan, $plan['limits']['screens_per_site'] < 0 ? null : [], 0),
        'attribution' => '출처는 exemplars 의 기관 사이트. 홈박스는 저작권을 주장하지 않으며 참고용입니다.',
    ], 200, ['Cache-Control' => $plan['logged_in'] ? 'private, no-store' : 'public, max-age=120']);
});

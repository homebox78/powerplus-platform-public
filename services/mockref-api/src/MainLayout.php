<?php
declare(strict_types=1);

namespace Homebox;

/**
 * 메인 본문 = 레퍼런스 화면의 "행 구성"을 따라 조립 (2026-09-25 사용자 지적: "3개 시안이 구성이 똑같다, MCP 레퍼런스를 활용 못함")
 *
 *  - 행: 세로 범위가 겹치는 섹션끼리 한 줄(x 순서), 칸 너비 비율 = 수집 w 비율
 *  - 칸 모양: 섹션 유형 + 수집 구조(사진 방식·카드·열·항목 수·크기)로 변형을 고른다
 *      main_visual  full_bleed → 폭 가득 캐러셀 / split_* → 글·사진 좌우 / inline → 카드형 비주얼
 *      news_tabs    사진+글자 얹음 → 최근 게시물 사진 히어로(캐러셀) / 사진 여러 장 → 사진 카드 / 낮고 넓음 → 탭 띠 / 그 외 → 탭+목록
 *      popup_zone   알림판 캐러셀(칸 크기 그대로) · banner_zone 칸이 좁으면 한 장 캐러셀, 넓으면 여러 장 롤링
 *      quick_links  열 수·항목 수 그대로 격자 · calendar 달력 · stats 숫자 · news_ticker 한 줄 롤링 · greeting_vision 인물 띠 · sns_video 영상 카드
 *  - 같은 행 칸은 높이를 맞춘다(수집 최대 높이 기준, 목록 줄 수도 그 높이로 채운다)
 *  - 레퍼런스에 없는 필수 블록(채택 80%+)은 표준 위치에 더하고 composition 에 "added" 로 표시
 */
final class MainLayout
{
    private const SKIP = ['header', 'gnb', 'footer', 'footer_links', 'skip_nav', 'main_search', 'breadcrumb', 'page_title', 'floating_quick'];

    /** @param array<int, array<string, mixed>> $secs  reference sections (type,x,y,w,h,structure) */
    public static function render(array $secs, array $p, callable $take, int $vw, int $container): array
    {
        $e = static fn ($s) => htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8');
        $gov = in_array($p['kind'], ['gov', 'corp'], true) || !SampleContent::isCivic((string) $p['kind']);
        $dec = static fn ($v) => is_string($v) ? (json_decode($v, true) ?: []) : (array) $v;
        $vw = max(1000, $vw);

        // ── 정리: 유틸·헤더·푸터 제외, 폭이 거의 없는 조각·미분류 잔조각 제외
        $cells = [];
        foreach ($secs as $s) { $s0 = $s;
            $t = (string) $s['type']; $w = (int) $s['w']; $h = (int) $s['h'];
            if ($t === 'stat_cards') { $t = 'stats'; } // 통계 카드형 콘텐츠(전주의 하루) = 통계 칸으로 그린다 (2026-09-26)
            // 제목이 있는 넓은 '검색' 칸 = 안내 띠 (서천군 '서천 맞춤 관광지' 1600×189 — 버튼 두 개 달린 관광 안내, C35)
            if ($t === 'main_search' && $w >= $vw * 0.6 && $h >= 120 && $h <= 320 && is_string($dec($s['structure'])['title'] ?? null) && !preg_match('/검색|찾/u', (string) $dec($s['structure'])['title'])) { $t = 'text_band'; }
            if ((in_array($t, self::SKIP, true) && !($t === 'main_search' && $w < $vw * 0.6)) || $w < 150 || $h < 50) { continue; } // 옆 칸 검색창은 칸으로(예산군 첫 줄 오른쪽 573px 검색, 2026-09-26)
            $st = $dec($s['structure']);
            // 폭 넓은 미분류 글 띠 = 안내 문구 띠 / 짧으면 앱·서비스 안내 띠 (한국장학재단 '국가예산…'·'모바일로 간편하게', 2026-09-26 자가 검증 C33)
            $txU = trim((string) ($st['text'] ?? ''));
            if ($t === 'unknown' && $w >= $vw * 0.7 && $h >= 120 && $h <= 450 && mb_strlen($txU) >= 12 && (int) ($st['images']['photos'] ?? 0) <= 1 && (int) ($st['links']['n'] ?? 0) <= 4) { $t = 'text_band'; }
            // 서비스 격자 상자(서천군 '주요 서비스' — 민원안내 링크 12칸) = 바로가기. 링크 이름이 비어 본문 낱말로 (2026-09-26 C35)
            $noDate0 = !preg_match('/20\d\d[.-]\s?\d{1,2}/', $txU);
            if ($t === 'unknown' && (int) ($st['links']['n'] ?? 0) >= 10 && (int) ($st['items'] ?? 0) >= 8 && (int) ($st['cols'] ?? 0) >= 3 && $noDate0 && (int) ($st['images']['photos'] ?? 0) <= 1) {
                $t = 'quick_links'; $st['svc'] = true;
                if (count((array) ($st['links']['labels'] ?? [])) < 6) {
                    $hw = implode(' ', (array) ($st['headings'] ?? []));
                    $st['links']['labels'] = array_slice(array_values(array_filter(preg_split('/ +/u', $txU) ?: [], static fn ($x) => mb_strlen($x) >= 3 && mb_strlen($x) <= 8 && !str_contains($hw, $x) && !preg_match('/더보기|빠르게/u', $x))), 0, 12);
                }
            }
            // 날짜 없는 짧은 이름 나열이 달력으로 잡힌 것 = 바로가기 (서천군 '사용자별 메뉴' 9칸)
            if ($t === 'calendar' && !preg_match('/\d/', $txU) && (int) ($st['links']['n'] ?? 0) >= 6) {
                $toks = array_values(array_filter(preg_split('/ +/u', $txU) ?: [], static fn ($x) => mb_strlen($x) >= 2 && mb_strlen($x) <= 9));
                if (count($toks) >= 6) { $t = 'quick_links'; $st['links']['labels'] = $toks; }
            }
            if ($t === 'unknown' && (int) ($st['style']['cards'] ?? 0) < 3 && (int) ($st['images']['n'] ?? 0) < 2) { continue; }
            // 화면 폭으로 잡힌 링크 격자 바로가기(보훈부 '누리집 바로가기' 4열 16칸) = 컨테이너 안 상자 — 회색 전폭 띠가 되던 것
            if ($t === 'quick_links' && empty($st['svc']) && $w >= $vw * 0.9 && (int) $s['x'] < 40 && (int) ($st['links']['n'] ?? 0) >= 12 && (int) ($st['cols'] ?? 0) >= 3 && (int) ($st['cols'] ?? 0) <= 6 && (int) ($st['images']['photos'] ?? 0) === 0) {
                $s['x'] = (int) (($vw - $container) / 2); $w = $container;
            }
            // 헤더 바로 아래 폭 가득한 낮은 링크 줄 = 헤더 GNB 줄 (보훈부 y150 '보훈알림·예우보상…' 이 본문 알약 줄로 — 실제 메뉴 이름 노출, C35)
            if (in_array($t, ['news_tabs', 'quick_links'], true) && (int) $s['y'] < 260 && $h <= 90 && $w >= $vw * 0.9 && (int) ($st['images']['n'] ?? 0) === 0 && $noDate0 && !preg_match('/^(자주\s?찾|바로\s?가기)/u', $txU)) { continue; }
            // 링크가 스크립트라 0개이고 짧은 이름만 나열된 배너 칸 = 아이콘 격자 (장학재단 비주얼 옆 8칸)
            if ($t === 'banner_zone' && (int) ($st['links']['n'] ?? 0) === 0 && $txU !== '' && mb_strlen($txU) <= 160) {
                $toks = array_values(array_filter(preg_split('/ +/u', $txU) ?: [], static fn ($x) => mb_strlen($x) >= 2 && mb_strlen($x) <= 9));
                if (count($toks) >= 4 && count($toks) === count(preg_split('/ +/u', $txU) ?: [])) { $t = 'quick_links'; $st['links']['labels'] = $toks; $st['links']['n'] = count($toks); $st['cols'] = count($toks) >= 8 ? 4 : count($toks); }
            }
            // 링크·이미지가 하나도 없는 낮은 조각(배너 제어 버튼 줄)은 칸이 아니다 — 대체 칸 '고시·공고'가 끼어들던 것
            if ($h < 100 && $t !== 'main_search' && (int) ($st['links']['n'] ?? 0) === 0 && (int) ($st['images']['n'] ?? 0) === 0) { continue; }
            // 낮은 띠에 칸이 4개 이상인 '메인 비주얼' = 아이콘 바로가기 띠 (여수 비주얼 아래 6칸 서비스 띠, 2026-09-26) — 비주얼 1회 상한에 걸려 엉뚱한 대체 칸이 되던 것
            if ($t === 'main_visual' && $h < 260 && (int) ($st['cols'] ?? 0) >= 4) { $t = 'quick_links'; }
            // 컨테이너 오른쪽 밖에서 시작하는 칸 = 화면 밖 캐러셀 슬라이드 (보훈부 x=1610 팝업, 2026-09-26 자가 검증 C32)
            if ((int) $s['x'] >= (int) (($vw + $container) / 2) - 20) { continue; }
            // 컨테이너 오른쪽으로 폭의 40% 넘게 삐져나간 칸도 숨은 슬라이드 (장학재단 x=1466 조각)
            $cRight = (int) (($vw + $container) / 2);
            if ($w < $container * 0.4 && (int) $s['x'] + $w - $cRight > $w * 0.4) { continue; }
            // 2열 사진 캐러셀(팝업존으로 분류) = 사진 소식 카드 (장학재단 '재단 동정'·'홍보영상')
            if ($t === 'popup_zone' && $w >= 450 && (int) ($st['cols'] ?? 0) >= 2 && (int) ($st['images']['photos'] ?? 0) >= 2) { $t = 'news_tabs'; $st['images']['photos'] = max(3, (int) $st['images']['photos']); }
            if ($t === 'popup_zone' && $w >= 450 && (int) ($st['images']['photos'] ?? 0) >= 2 && preg_match('/가이드|영상|달라|필수/u', (string) ($st['text'] ?? ''))) { $t = 'sns_video'; }
            $txtS = (string) ($st['text'] ?? ''); $noDate = !preg_match('/20\d\d[.-]\s?\d{1,2}[.-]\s?\d{1,2}/', $txtS);
            // 좁은 칸의 2열 짧은 링크 = 아이콘 바로가기 2×2 (보훈부 비주얼 옆 공지사항·보도자료·지원안내·지방청)
            if ($t === 'news_tabs' && $w < 420 && $noDate && (int) ($st['cols'] ?? 0) >= 2 && (int) ($st['images']['photos'] ?? 0) === 0) { $t = 'quick_links'; }
            // 제목이 영상·유튜브 = 영상 카드 (보훈부 '영상으로 소개합니다'가 배너 세로 쌓기로)
            if (in_array($t, ['banner_zone', 'news_tabs', 'unknown'], true) && preg_match('/영상|동영상|유튜브|youtube|video/iu', (string) ($st['title'] ?? ''))) { $t = 'sns_video'; }
            // 첫 화면 안의 큰 배너 = 카드형 메인 비주얼 (보훈부 960×480 배너 캐러셀, 2026-09-25) — 없다고 폭 가득 비주얼을 따로 얹지 않게
            if (in_array($t, ['banner_zone', 'promo_banner', 'hero'], true) && $h >= 350 && (($w >= 800 && (int) $s['y'] < 900) || ($w >= 500 && (int) $s['y'] < 400))) { // 첫 화면 위 590px 배너도(장학재단)
                $t = 'main_visual'; $st['style']['photo'] = 'inline';
            }
            $cells[] = ['type' => $t, 'x' => (int) $s['x'], 'y' => (int) $s['y'], 'w' => $w, 'h' => $h, 'st' => $st, 'ref' => [(int) $s0['x'], (int) $s0['y'], (int) $s0['w'], (int) $s0['h']]];
        }
        // 다른 칸 안에 70% 이상 들어간 칸 = 숨은 슬라이드·겹친 조각 (장학재단 1466px 조각이 공지사항 칸 안에)
        $cells = array_values(array_filter($cells, static function ($c) use ($cells) {
            foreach ($cells as $o) {
                if ($o === $c || $o['w'] * $o['h'] <= $c['w'] * $c['h']) { continue; }
                $ix = max(0, min($c['x'] + $c['w'], $o['x'] + $o['w']) - max($c['x'], $o['x']));
                $iy = max(0, min($c['y'] + $c['h'], $o['y'] + $o['h']) - max($c['y'], $o['y']));
                if ($ix * $iy >= 0.7 * $c['w'] * $c['h']) { return false; }
            }
            return true;
        }));
        $added = [];
        $has = static fn (string $t) => (bool) array_filter($cells, static fn ($c) => $c['type'] === $t);
        if (!$cells) {
            $cells = [['type' => 'main_visual', 'x' => 0, 'y' => 0, 'w' => 1260, 'h' => 460, 'st' => ['style' => ['photo' => 'inline']]],
                ['type' => 'popup_zone', 'x' => 1280, 'y' => 0, 'w' => 380, 'h' => 460, 'st' => []]];
            $added[] = 'main_visual'; $added[] = 'popup_zone';
        }
        // 첫 화면에 큰 팝업존이 있으면 그게 비주얼 자리다 (예산군 1,112×480 팝업존 위에 사진 히어로를 더 얹던 것, 2026-09-26 자가 검증 C31)
        $bigPopup = (bool) array_filter($cells, static fn ($c) => $c['type'] === 'popup_zone' && $c['w'] >= 800 && $c['y'] < 900);
        // 첫 화면에 큰 인사·비전 덩어리(폭 1,000+·높이 400+)가 있으면 그게 첫 화면이다 — 히어로를 더 얹으면 높이만 늘었다(서울 339, 2026-10-12 D7)
        $bigTop = (bool) array_filter($cells, static fn ($c) => $c['y'] < 600 && $c['w'] >= 1000 && $c['h'] >= 400 && in_array($c['type'], ['greeting_vision', 'banner_zone', 'popup_zone', 'news_tabs'], true));
        if (!$bigPopup && !$bigTop && !$has('main_visual') &&!array_filter($cells, static fn ($c) => ($c['st']['style']['text_on_photo'] ?? false) && $c['w'] > 800)) {
            array_unshift($cells, ['type' => 'main_visual', 'x' => 0, 'y' => -1, 'w' => $vw, 'h' => 560, 'st' => ['style' => ['photo' => 'full_bleed']]]); $added[] = 'main_visual';
        }
        $maxY = max(array_map(static fn ($c) => $c['y'] + $c['h'], $cells));
        foreach (['quick_links' => 0.30, 'news_tabs' => 0.45, 'banner_zone' => 0.9] as $t => $pos) {
            if (!$has($t)) { $cells[] = ['type' => $t, 'x' => 0, 'y' => (int) ($maxY * $pos) + 1, 'w' => $t === 'banner_zone' ? 1300 : 1300, 'h' => $t === 'news_tabs' ? 320 : 200, 'st' => ['cols' => 8, 'items' => 8], 'added' => true]; $added[] = $t; }
        }
        usort($cells, static fn ($a, $b) => [$a['y'], $a['x']] <=> [$b['y'], $b['x']]);
        $tps = array_values(array_filter(array_map(static fn ($c) => (int) round((float) ($c['st']['font']['title_px'] ?? 0)), $cells), static fn ($v) => $v >= 17 && $v <= 36)); sort($tps);
        self::$hsPage = $tps ? max(20, min(32, $tps[intdiv(count($tps), 2)])) : null;

        // ── 긴 사이드 열 (2026-09-26 자가 검증 C35, 서천군): 컨테이너 오른쪽 끝에 붙은 좁은 칸(≤440)이 3개 이상 세로로
        // 1,000px 넘게 이어지면 그 구간은 [왼쪽 하위 행들 | 오른쪽 세로 쌓기] 2단 한 행으로 — 행 묶기(세로 40% 겹침)로는
        // 긴 사이드 열이 왼쪽 칸마다 잘려 섞였다.
        $cL = (int) (($vw - $container) / 2); $cR = $cL + $container;
        $side = array_values(array_filter($cells, static fn ($c) => empty($c['added']) && $c['w'] <= 440 && $c['x'] + $c['w'] >= $cR - 60 && $c['x'] >= $cL + $container * 0.6));
        $region = null;
        if (count($side) >= 3) {
            $sy = min(array_map(static fn ($c) => $c['y'], $side)); $sy2 = max(array_map(static fn ($c) => $c['y'] + $c['h'], $side));
            $sx = min(array_map(static fn ($c) => $c['x'], $side));
            if ($sy2 - $sy >= 1000) {
                $left = []; $rest = [];
                foreach ($cells as $c) {
                    if (in_array($c, $side, true)) { continue; }
                    $inY = $c['y'] >= $sy - 40 && $c['y'] < $sy2 - 80;
                    if ($inY && empty($c['added']) && $c['x'] + $c['w'] <= $sx + 40) { $left[] = $c; continue; }
                    // 분해가 폭을 화면 전체로 잡은 왼쪽 본문 조각(서천군 '주요 서비스' 1920px) — 왼쪽 폭으로 맞춘다
                    if ($inY && empty($c['added']) && $c['w'] >= $vw * 0.9 && $c['y'] + $c['h'] <= $sy2 + 200) { $c['x'] = $cL; $c['w'] = $sx - 24 - $cL; $left[] = $c; continue; }
                    $rest[] = $c;
                }
                if ($left) { $region = ['y' => $sy, 'y2' => $sy2, 'left' => $left, 'side' => $side, 'lw' => $sx - 24 - $cL, 'sw' => $cR - $sx]; $cells = $rest; }
            }
        }
        $html = ''; $comp = []; $uid = 0; $k = 0;
        $group = static function (array $cells): array {
            $rows = [];
            foreach ($cells as $c) {
                $placed = false;
                foreach ($rows as &$r) {
                    $top = max($r['y'], $c['y']); $bot = min($r['y2'], $c['y'] + $c['h']);
                    if ($bot - $top >= 0.4 * min($c['h'], $r['y2'] - $r['y']) && $c['w'] < 1700 && empty($c['added']) && empty($r['solo'])) {
                        $r['cells'][] = $c; $r['y'] = min($r['y'], $c['y']); $r['y2'] = max($r['y2'], $c['y'] + $c['h']); $placed = true; break;
                    }
                }
                unset($r);
                if (!$placed) { $rows[] = ['y' => $c['y'], 'y2' => $c['y'] + $c['h'], 'cells' => [$c], 'solo' => $c['w'] >= 1700 || !empty($c['added']) || !empty($c['region'])]; }
            }
            usort($rows, static fn ($a, $b) => $a['y'] <=> $b['y']);
            return $rows;
        };
        // 사이드 구간 = 왼쪽은 하위 행(중첩 그리드), 오른쪽은 세로 쌓기
        $regionHtml = function () use ($region, $group, &$comp, &$uid, &$k, $p, $take, $e, $gov): string {
            $ri = count($comp) ? max(array_column($comp, 'row')) : 0; $l = '';
            foreach ($group($region['left']) as $r) {
                usort($r['cells'], static fn ($a, $b) => $a['x'] <=> $b['x']);
                $n = count($r['cells']); $rowH = $r['y2'] - $r['y']; $part = '';
                foreach ($r['cells'] as $c) {
                    [$cell, $variant] = self::cell($c, $p, $take, $e, $gov, ++$uid, $n, $rowH, false, $k);
                    $part .= self::skin($cell, $c, null);
                    $comp[] = ['row' => $ri + 1, 'type' => $c['type'], 'variant' => $variant, 'ref_box' => $c['ref'] ?? [$c['x'], $c['y'], $c['w'], $c['h']], 'source' => 'reference'];
                }
                $cols = implode(' ', array_map(static fn ($c) => max(1, round($c['w'] / 10)) . 'fr', $r['cells']));
                $l .= '<div class="mm-grid mm-subrow" style="--rh:' . max(150, min((int) round($rowH * 0.9), 760)) . 'px;grid-template-columns:' . $cols . '">' . $part . '</div>';
            }
            $side = $region['side']; usort($side, static fn ($a, $b) => $a['y'] <=> $b['y']); $s = '';
            foreach ($side as $c) {
                [$cell, $variant] = self::cell($c, $p, $take, $e, $gov, ++$uid, 2, $c['h'], false, $k);
                $s .= self::skin($cell, $c, null);
                $comp[] = ['row' => $ri + 1, 'type' => $c['type'], 'variant' => $variant, 'ref_box' => $c['ref'] ?? [$c['x'], $c['y'], $c['w'], $c['h']], 'source' => 'reference'];
            }
            return '<div class="mm-row"><div class="mm-wrap mm-grid mm-sidegrid" style="grid-template-columns:' . round($region['lw'] / 10) . 'fr ' . round($region['sw'] / 10) . 'fr"><div class="mm-col mm-maincol">' . $l . '</div><div class="mm-col mm-sidecol">' . $s . '</div></div></div>';
        };
        if ($region) { $cells[] = ['type' => '_region', 'x' => 0, 'y' => $region['y'], 'w' => $vw, 'h' => $region['y2'] - $region['y'], 'st' => [], 'region' => true]; }
        $rows = $group($cells);

        // 줄 사이 간격 = 레퍼런스의 실제 간격(24~72) — 통계 섹션 간격(72)을 모든 줄에 줘서 붙은 섹션이 많은 레퍼런스보다 +10% 길어졌다(2026-10-13 D7)
        $prevY2 = null; $lastRi = array_key_last($rows);
        foreach ($rows as $ri => $r) {
            $gapTop = $prevY2 === null ? 24 : max(24, min(72, (int) ($r['y'] - $prevY2)));
            $prevY2 = $r['y2'];
            if ($r['cells'][0]['type'] === '_region') { $html .= $regionHtml(); continue; }
            usort($r['cells'], static fn ($a, $b) => $a['x'] <=> $b['x']);
            $colsA = [];
            foreach ($r['cells'] as $c) {
                $hit = false;
                foreach ($colsA as &$col) {
                    $ov = min($col['x2'], $c['x'] + $c['w']) - max($col['x'], $c['x']);
                    if ($ov >= 0.5 * min($c['w'], $col['x2'] - $col['x'])) { $col['cells'][] = $c; $col['x'] = min($col['x'], $c['x']); $col['x2'] = max($col['x2'], $c['x'] + $c['w']); $hit = true; break; }
                }
                unset($col);
                if (!$hit) { $colsA[] = ['x' => $c['x'], 'x2' => $c['x'] + $c['w'], 'cells' => [$c]]; }
            }
            $n = count($colsA);
            $full = $n === 1 && count($colsA[0]['cells']) === 1 && $r['cells'][0]['w'] >= $vw * 0.92;
            $rowH = $r['y2'] - $r['y'];
            $cols = implode(' ', array_map(static fn ($col) => max(1, round(($col['x2'] - $col['x']) / 10)) . 'fr', $colsA));
            $inner = ''; static $rowBgCache = [];
            foreach ($colsA as $col) {
                usort($col['cells'], static fn ($a, $b) => $a['y'] <=> $b['y']);
                $stack = count($col['cells']) > 1; $part = '';
                foreach ($col['cells'] as $c) {
                    [$cell, $variant] = self::cell($c, $p, $take, $e, $gov, ++$uid, $n, $stack ? $c['h'] : $rowH, $full, $k);
                    $part .= self::skin($cell, $c, $rowBgCache[$ri] ??= self::rowBg($r['cells'], $full));
                    $comp[] = ['row' => $ri + 1, 'type' => $c['type'], 'variant' => $variant, 'ref_box' => $c['ref'] ?? [$c['x'], $c['y'], $c['w'], $c['h']],
                        'source' => !empty($c['added']) ? 'added (채택률 ' . (MainMockup::ADOPTION[$c['type']] ?? '-') . '%, 레퍼런스에 없음)' : 'reference'];
                }
                $inner .= $stack ? '<div class="mm-col">' . $part . '</div>' : $part;
            }
            // 폭 가득 줄이라도 비주얼이 아닌 칸(팝업존·SNS 목록 등)은 내용을 본문 폭 안에 — 23~1897 로 퍼졌다(2026-10-12 MCP 예시 시험)
            if ($full && !preg_match('/mm-wrap|-in"|mm-linktable|mm-svcbar|class="mm-cell mm-(?:hero|vsplit|vpanel|ctaband|ticker|noteband|appband)/', $inner)) {
                $inner = '<div class="mm-wrap">' . $inner . '</div>';
            }
            $bg = self::rowBg($r['cells'], $full);
            $style = '--rh:' . max(150, min((int) round($rowH * ($full ? 1 : 0.9)), 760)) . 'px' . ($bg ? ';background:' . $bg : '')
                . ($full ? '' : ';padding-top:' . $gapTop . 'px;padding-bottom:' . ($ri === $lastRi ? 40 : 0) . 'px');
            $html .= $full
                ? '<div class="mm-row mm-row--full" style="' . $style . '">' . $inner . '</div>'
                : '<div class="mm-row" style="' . $style . '"><div class="mm-wrap mm-grid" style="grid-template-columns:' . $cols . '">' . $inner . '</div></div>';
        }
        return ['html' => $html, 'composition' => $comp, 'added' => $added];
    }

    /**
     * 행 배경 띠 (2026-09-25 "수집한 디자인 데이터를 버린다"): 레퍼런스에서 그 행 칸들의 배경이 같은 옅은 면이면
     * 화면 폭 전체 띠로 깐다(부천 #F1F2F6 띠). 흰색·사진 위·절반 미만이면 띠를 두지 않는다.
     */
    private static function rowBg(array $cells, bool $full = false): ?string
    {
        $bgs = []; $wAll = 0; $wBy = [];
        foreach ($cells as $c) {
            $wAll += max(1, (int) ($c['w'] ?? 1));
            $bg = self::hex($c['st']['colors']['bg'] ?? null);
            if ($bg === null || !empty($c['st']['style']['text_on_photo'])) { continue; }
            if (self::lum($bg) > 0.965 && self::lum($bg) < 0.995 || self::lum($bg) <= 0.965) { $bgs[] = strtoupper($bg); $wBy[strtoupper($bg)] = ($wBy[strtoupper($bg)] ?? 0) + max(1, (int) ($c['w'] ?? 1)); }
        }
        if (!$bgs) { return null; }
        $cnt = array_count_values($bgs); arsort($cnt); $top = (string) array_key_first($cnt);
        if ($cnt[$top] * 2 < count($cells) || ($wBy[$top] ?? 0) < $wAll * 0.6) { return null; } // 좁은 칸 하나의 면색으로 행 전체를 칠하지 않는다(예산군 소식지 카드 분홍이 사진 소식 행 전체로, 2026-09-26)
        $l = self::lum($top);
        return $l >= 0.80 && $l < 0.995 ? $top : null; // 옅은 면만 띠로 — 짙은 면은 칸 단위로 칠한다(skin)
    }

    /**
     * 칸 옷 입히기: 수집한 강조색(--p)·제목 크기·제목 색·모서리·그림자·짙은 면을 칸에 적용한다.
     * 강조색은 흰 글자와 대비 3:1 이상일 때만(밝은 노랑 등은 버튼 글자가 안 보인다), 제목 색은 배경 대비 4.5:1 이상일 때만.
     */
    private static function skin(string $html, array $c, ?string $rowBg): string
    {
        $st = $c['st']; $s = (array) ($st['style'] ?? []); $col = (array) ($st['colors'] ?? []);
        $css = []; $cls = [];
        $acc = self::hex($col['accent'] ?? null);
        if ($acc !== null && self::contrast($acc, '#FFFFFF') >= 3.0) { $css[] = '--p:' . $acc; }
        $bg = self::hex($col['bg'] ?? null);
        if (str_contains($html, 'mm-sidesearch') || str_contains($html, 'mm-svcbar') || str_contains($html, 'mm-infolist') || str_contains($html, 'mm-orgcards') || str_contains($html, 'mm-ctaband')) { $bg = null; } // 검색창은 늘 흰 바탕(대전 서구 검색 줄이 검은 띠로, 2026-09-26)
        $surface = $rowBg ?? '#FFFFFF';
        if ($bg !== null && $rowBg === null && empty($s['text_on_photo']) && strtoupper($bg) !== '#FFFFFF' && !str_contains($html, 'mm-row--full')) {
            if (self::lum($bg) < 0.35) { $cls[] = 'mm-dark'; $css[] = 'background:' . $bg; $surface = $bg; }
            elseif (self::lum($bg) < 0.97) { $cls[] = 'mm-tint'; $css[] = 'background:' . $bg; $surface = $bg; }
        }
        $fg = self::hex($col['fg'] ?? null);
        if ($fg !== null && self::contrast($fg, $surface) >= 4.5 && self::lum($fg) < 0.3) { $css[] = '--hc:' . $fg; }
        $tp = (float) ($st['font']['title_px'] ?? 0);
        if (self::$hsPage !== null) { $css[] = '--hs:' . self::$hsPage . 'px'; } elseif ($tp >= 15 && $tp <= 44) { $css[] = '--hs:' . round($tp) . 'px'; }
        if (!empty($s['shadow'])) { $cls[] = 'mm-shadow'; }
        // 어두운 면 표시는 실제 어두운 배경을 칠할 때만 — 배경 없이 흰 글자만 켜져 빈 카드로 보였다(여수 '많이 찾는 정보'·'새소식', ledger C14)
        if (!empty($s['dark']) && !in_array('mm-dark', $cls, true)) {
            if ($bg !== null && self::lum($bg) < 0.35) { $cls[] = 'mm-dark'; $css[] = 'background:' . $bg; }
        }
        // 모양 (2026-09-25) — 레퍼런스 섹션의 제목 장식·탭·버튼·카드·아이콘 면·배경·여백
        $pick = static fn (string $k, array $ok) => is_string($s[$k] ?? null) && in_array($s[$k], $ok, true) ? $s[$k] : null;
        if ($v = $pick('heading_deco', ['bar', 'underline', 'dot', 'rule'])) { $cls[] = 'mm-hd-' . $v; }
        if ($v = $pick('tab_style', ['underline', 'box', 'text'])) { $cls[] = 'mm-tab-' . $v; }
        if ($v = $pick('card', ['shadow', 'border', 'fill'])) { $cls[] = 'mm-cd-' . $v; }
        if ($v = $pick('icon_bg', ['square', 'plain'])) { $cls[] = 'mm-ic-' . $v; }
        $bt = (array) ($s['button'] ?? []);
        if (in_array($bt['shape'] ?? null, ['rounded', 'square'], true)) { $cls[] = 'mm-bt-' . $bt['shape']; }
        if (($bt['fill'] ?? null) === 'outline') { $cls[] = 'mm-bt-outline'; }
        if (($s['bg_kind'] ?? null) === 'gradient' && !in_array('mm-dark', $cls, true)) { $cls[] = 'mm-tint'; $cls[] = 'mm-grad'; }
        foreach (['pad_top' => '--pt', 'pad_bottom' => '--pb'] as $k => $var) {
            if (is_numeric($s[$k] ?? null)) { $css[] = $var . ':' . max(16, min(56, (int) round((float) $s[$k] * 0.6))) . 'px'; }
        }
        if (!$css && !$cls) { return $html; }
        return (string) preg_replace_callback('/<(section|nav) class="mm-cell([^"]*)"( style="([^"]*)")?/', static function ($m) use ($css, $cls) {
            $style = trim(implode(';', $css) . ';' . ($m[4] ?? ''), ';');
            return '<' . $m[1] . ' class="mm-cell' . $m[2] . ($cls ? ' ' . implode(' ', array_unique($cls)) : '') . '"' . ($style !== '' ? ' style="' . $style . '"' : '');
        }, $html, 1);
    }

    private static int $ridN = 0;
    private static int $noteN = 0; // 안내 띠가 한 페이지에 둘 이상이면 문장을 바꾼다(같은 문장 두 번 = 게이트 실패, 2026-10-01)
    private static ?int $hsPage = null; // 페이지 섹션 제목 크기 하나(레퍼런스 측정값 중앙값) — 칸마다 20~30px 가 섞이던 것(C37)
    private static function rid(): string { return 'r' . ++self::$ridN; }

    /** 한 줄(rid) 안에서 서로 다른 아이콘 — 이름 매핑이 겹치면 남은 그림에서 고른다(ledger D3: '정책 브리핑·보도자료' 같은 아이콘) */
    private static function rowIcon(string $label, string $rid): string
    {
        static $used = [];
        $pool = ['doc', 'news', 'faq', 'chart', 'org', 'phone', 'book', 'leaf', 'home', 'mega', 'people', 'coin', 'id', 'work', 'cal', 'heart', 'bus', 'search', 'pin', 'shield', 'grid'];
        $n = MainMockup::iconFor($label);
        if (isset($used[$rid][$n])) { foreach ($pool as $c) { if (!isset($used[$rid][$c])) { $n = $c; break; } } }
        $used[$rid][$n] = true;
        return MainMockup::icon($n);
    }

    /** 바로가기 이름 → 샘플 아이콘 세트(선형) 이미지. 같은 줄에 같은 아이콘이 두 번 나오지 않게 쓴 것은 기억(ledger D3) */
    private static function iconSample(string $label): ?string
    {
        static $seen = [];
        $map = ['민원|증명|서식|여권|발급' => '민원', '복지|돌봄|어린이집|노인' => '복지', '일자리|채용|구인|취업|청년' => '일자리', '주차' => '주차',
            '교통|버스' => '교통', '관광|여행' => '관광', '문화|행사|축제|체육' => '문화', '안전|재난' => '안전', '환경|폐기물|종량제|기후' => '환경',
            '교육|학습|도서관|학교' => '교육', '보건|건강|의료' => '보건', '신고|청렴|제안' => '신고', '예약|시설|대관' => '예약', '세|예산|재정|요금' => '세금'];
        $tag = null;
        foreach ($map as $re => $t) { if (preg_match('/' . $re . '/u', $label)) { $tag = $t; break; } }
        if ($tag === null || isset($seen[$tag])) { return null; }
        foreach (Samples::find(['icon-set'], [$tag, '선형'], 3) as $it) {
            if (in_array($tag, (array) $it['tags'], true)) {
                $seen[$tag] = true; $v = Samples::view($it);
                return '<img class="mm-qi-img" src="' . htmlspecialchars((string) $v['url'], ENT_QUOTES, 'UTF-8') . '" alt="">';
            }
        }
        return null;
    }

    private static function hex(mixed $v): ?string
    {
        return is_string($v) && preg_match('/^#[0-9a-f]{6}$/i', $v) ? $v : null;
    }

    private static function lum(string $hex): float
    {
        $ch = static function (int $v): float { $c = $v / 255; return $c <= 0.03928 ? $c / 12.92 : (($c + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * $ch((int) hexdec(substr($hex, 1, 2))) + 0.7152 * $ch((int) hexdec(substr($hex, 3, 2))) + 0.0722 * $ch((int) hexdec(substr($hex, 5, 2)));
    }

    private static function contrast(string $a, string $b): float
    {
        $x = self::lum($a); $y = self::lum($b);
        return (max($x, $y) + 0.05) / (min($x, $y) + 0.05);
    }

    private static function cell(array $c, array $p, callable $take, callable $e, bool $gov, int $uid, int $n, int $rowH, bool $full, int &$k): array
    {
        $t = $c['type']; $st = $c['st']; $s = (array) ($st['style'] ?? []); $photo = (string) ($s['photo'] ?? 'none');
        $labels = array_values(array_filter((array) ($st['links']['labels'] ?? []), static fn ($l) => is_string($l) && mb_strlen(trim($l)) >= 2 && mb_strlen(trim($l)) <= 12 && !preg_match('/더보기|more|이전|다음|정지|재생|닫기|열기|^\d+$/iu', $l)));
        $labels = array_values(array_unique(array_map('trim', $labels)));
        $title = is_string($st['title'] ?? null) && mb_strlen($st['title']) <= 14 && !preg_match('/영역|슬라이드|바로가기$|^[a-z][a-z0-9 _-]*$|^\d|^(로|으로|을|를|과|와|에|의|이|가|은|는)\s|\.\.$/u', $st['title']) ? trim($st['title']) : null; // 굵은 글씨에서 잘린 제목('로 빠르게..'·'과 해요', 서천군 C35)은 쓰지 않는다
        // 기관 이름을 제목으로 단 칸(링크표 머리 등)은 가상화하면 모두 같은 기관명이 되어 한 화면에 제목이 겹친다 (2026-09-30 MCP 시험 r2 S07·S08·S10)
        if ($title !== null && (preg_match('/(부|처|청|위원회|공사|공단|진흥원|재단|연구원|병원|의회|교육청|[시군구도])$/u', $title) || in_array($title, [(string) ($p['org'] ?? ''), (string) ($p['real'] ?? '')], true))) { $title = null; }
        $imgN = (int) ($st['images']['n'] ?? 0); $cards = (int) ($s['cards'] ?? 0); $colsN = (int) ($st['cols'] ?? 0); $items = (int) ($st['items'] ?? 0);
        $radius = isset($s['radius_px']) && $s['radius_px'] !== null ? (int) $s['radius_px'] : null;
        $rs = $radius !== null ? ' style="--cr:' . min($radius, 24) . 'px"' : '';
        $h = $c['h']; $w = $c['w'];
        $img = static fn (?array $m, string $cls = 'mm-cover') => $m ? '<img class="' . $cls . '" src="' . htmlspecialchars((string) $m['url'], ENT_QUOTES, 'UTF-8') . '" alt="' . htmlspecialchars((string) $m['alt'], ENT_QUOTES, 'UTF-8') . '">' : '<span class="' . $cls . ' mm-ph" aria-hidden="true"></span>';
        $ctrl = static fn (string $name, int $total) => '<div class="mm-ctrl"><span class="mm-count" aria-live="polite"><b>1</b> / <span>' . $total . '</span></span><button type="button" class="mm-prev" aria-label="' . $name . ' 이전">' . MainMockup::icon('prev') . '</button><button type="button" class="mm-play" aria-label="' . $name . ' 자동 재생 정지" aria-pressed="false">' . MainMockup::icon('pause') . '</button><button type="button" class="mm-next" aria-label="' . $name . ' 다음">' . MainMockup::icon('next') . '</button></div>';
        $slides = static function (array $imgs, callable $inner) {
            $o = '';
            foreach ($imgs as $i => $m) { $o .= '<li class="mm-slide" role="group" aria-roledescription="slide" aria-label="' . ($i + 1) . ' / ' . count($imgs) . '"' . ($i ? ' hidden' : '') . '>' . $inner($m, $i) . '</li>'; }
            return $o;
        };
        // 한 페이지에 같은 칸 제목을 두 번 쓰지 않는다 (장학재단 '포토뉴스'×2, 2026-09-26 자가 검증)
        static $hSeen = [];
        $head = static function (string $h2, string $extra = '') use (&$hSeen): string {
            if (isset($hSeen[$h2])) { foreach (['보도 사진', '현장 스케치', '주요 소식', '소식 모음', '알림 소식'] as $alt) { if (!isset($hSeen[$alt])) { $h2 = $alt; break; } } }
            $hSeen[$h2] = true;
            return '<div class="mm-cell-head"><h2>' . htmlspecialchars($h2, ENT_QUOTES, 'UTF-8') . '</h2>' . $extra . '</div>';
        };
        $org = $p['org']; $res = $p['resident'];

        // 한 페이지에 같은 모양을 되풀이하지 않는다 (사용자 2026-09-25: "알림판 도배·가로 배너 도배·반복된 콘텐츠의 나열")
        // 레퍼런스가 같은 유형을 여러 번 두었더라도 두 번째부터는 다른 역할의 칸으로 바꾼다 — 칸 자리·크기는 레퍼런스 그대로
        static $seen = [];
        // 의원 찾기 (성남시의회 '지역구별 현역의원': 지역구 지도 + 의원 검색 + 의원 카드, 2026-09-26 자가 검증 C34)
        if (in_array($t, ['greeting_vision', 'unknown', 'news_tabs'], true) && $w >= 900 && preg_match('/의원/u', (string) ($st['title'] ?? '')) && preg_match('/지역구|현역|의원\s?찾|의원\s?검색|선거구/u', (string) ($st['title'] ?? '') . ' ' . (string) ($st['text'] ?? ''))) {
            $pt = $take(['leader'], 1)[0] ?? null;
            $dist = implode('', array_map(static fn ($d, $i) => '<li><button type="button"' . ($i === 0 ? ' aria-pressed="true"' : ' aria-pressed="false"') . '>' . $d . '</button></li>', ['가 선거구', '나 선거구', '다 선거구', '라 선거구', '마 선거구', '바 선거구'], range(0, 5)));
            $sid = 'mm-m' . self::rid();
            return ['<section class="mm-cell mm-members">' . $head($title ?? '지역구별 의원') . '<div class="mm-members-in"><ul class="mm-dist" aria-label="선거구">' . $dist . '</ul><div class="mm-member"><form role="search" onsubmit="return false"><label for="' . $sid . '" class="mm-sr">의원 검색</label><input id="' . $sid . '" type="search" placeholder="찾으실 의원 이름을 입력하세요"><button type="submit" aria-label="검색">' . MainMockup::icon('search') . '</button></form><div class="mm-member-card">' . ($pt ? '<span class="mm-member-img">' . $img($pt) . '</span>' : '') . '<dl><dt>이름</dt><dd>[성명]</dd><dt>선거구</dt><dd>가 선거구</dd><dt>소속 위원회</dt><dd>행정자치위원회</dd><dt>연락처</dt><dd>[000-000-0000]</dd></dl></div><p class="mm-member-btns"><a class="mm-btn" href="#">프로필 보기</a><a class="mm-btn mm-btn--line" href="#">의원 누리집</a></p></div></div></section>', 'council_members'];
        }
        // '자주찾는 서비스' 알약 막대 (서천군 헤더 아래 한 줄, 2026-09-26 자가 검증 C35) — 링크 이름이 SNS 로 잡혀 검은 띠 링크표가 되던 것
        $txt0 = trim((string) ($st['text'] ?? ''));
        if ($t === 'quick_links' && $w >= 1500 && $h <= 260 && (int) ($st['cols'] ?? 0) < 4 && preg_match('/^(자주\s?찾는\s?서비스|자주\s?찾는|바로\s?가기)/u', $txt0, $mh)) {
            $rest = trim(mb_substr($txt0, mb_strlen($mh[0])));
            $rest = preg_replace('/^분야별\s?정보\s*/u', '', $rest);
            $rest = preg_split('/\s(정지|재생|을 알려|요 소식)/u', $rest)[0] ?? $rest;
            $toks = array_slice(array_values(array_filter(preg_split('/ +/u', $rest) ?: [], static fn ($x) => mb_strlen($x) >= 2 && mb_strlen($x) <= 9)), 0, 8);
            if (count($toks) >= 4) { $rs = self::rid();
                $li = implode('', array_map(static fn ($l) => '<li><a href="#">' . self::rowIcon($l, $rs) . htmlspecialchars($l, ENT_QUOTES, 'UTF-8') . '</a></li>', $toks));
                return ['<nav class="mm-cell mm-svcbar" aria-label="자주찾는 서비스"><div class="mm-svcbar-in"><p class="mm-svcbar-tabs"><strong>자주찾는 서비스</strong><span>분야별 정보</span></p><ul>' . $li . '</ul></div></nav>', 'service_bar'];
            }
        }
        // 좁은 칸의 안내 카드 목록 (서천군 사이드 '청사안내·기벌포영화관·전통시장안내·문화시설 대관신청') — 제목 + 한 줄 설명 + 아이콘
        $hd = array_values(array_filter((array) ($st['headings'] ?? []), static fn ($x) => !preg_match('/목록$/u', (string) $x) && mb_strlen((string) $x) >= 2));
        if (in_array($t, ['greeting_vision', 'unknown', 'news_tabs'], true) && $w <= 440 && count($hd) >= 3 && (int) ($st['images']['photos'] ?? 0) === 0) {
            $li = ''; $ri2 = self::rid();
            foreach (array_slice($hd, 0, 5) as $i => $hh) {
                $a = mb_strpos($txt0, (string) $hh); $nx = $hd[$i + 1] ?? null;
                $desc = $a === false ? '' : mb_substr($txt0, $a + mb_strlen((string) $hh), $nx !== null && ($b = mb_strpos($txt0, (string) $nx, $a + 1)) !== false ? $b - $a - mb_strlen((string) $hh) : 60);
                $li .= '<li><a href="#"><span class="mm-info-t"><strong>' . $e($hh) . '</strong><span>' . $e(mb_strimwidth(trim($desc), 0, 56, '…')) . '</span></span>' . self::rowIcon((string) $hh, $ri2) . '</a></li>';
            }
            return ['<section class="mm-cell mm-infolist"><ul>' . $li . '</ul></section>', 'info_list'];
        }
        // 서비스 격자 상자 = 사진 카드 + 아이콘 버튼 3열 (서천군 '주요 서비스' 민원안내 12칸, C35)
        if (!empty($st['svc']) && count($labels) >= 6) {
            $ph = $take(['citizen', 'news-thumb'], 1)[0] ?? null; $rs3 = self::rid();
            $li = implode('', array_map(static fn ($l) => '<li><a href="#"><span>' . htmlspecialchars($l, ENT_QUOTES, 'UTF-8') . '</span>' . self::rowIcon($l, $rs3) . '</a></li>', array_slice($labels, 0, 12)));
            return ['<section class="mm-cell mm-svcbox">' . $head($title ?? $org . ' 주요 서비스') . '<div class="mm-svcbox-in"><a class="mm-svcbox-card" href="#">' . ($ph ? $img($ph) : '') . '<strong>' . $e($org) . '<br>민원안내</strong></a><ul>' . $li . '</ul></div></section>', 'service_box'];
        }
        // 글+그림 카드 2×2 (서천군 재단·귀농귀촌·직거래몰 4칸 — 큰 광고 배너 2장이 되던 것, C35)
        $hd2 = array_values(array_filter((array) ($st['headings'] ?? []), static fn ($x) => mb_strlen((string) $x) >= 3));
        if (in_array($t, ['banner_zone', 'promo_banner', 'hero'], true) && (int) ($st['cols'] ?? 0) === 2 && count($hd2) >= 4 && mb_strlen($txt0) >= 80 && (int) ($st['images']['photos'] ?? 0) <= 2 && $w >= 700) {
            $ims = $take(['citizen', 'place', 'news-thumb'], 4); $li = '';
            foreach (array_slice($hd2, 0, 4) as $i => $hh) {
                $a = mb_strpos($txt0, (string) $hh); $nx = $hd2[$i + 1] ?? null;
                $desc = $a === false ? '' : trim(mb_substr($txt0, $a + mb_strlen((string) $hh), $nx !== null && ($b = mb_strpos($txt0, (string) $nx, $a + 1)) !== false ? $b - $a - mb_strlen((string) $hh) : 50));
                $li .= '<li class="t' . ($i % 4) . '"><a href="#"><span class="mm-oc-t"><strong>' . $e($hh) . '</strong><span>' . $e(mb_strimwidth($desc, 0, 60, '…')) . '</span></span>' . (isset($ims[$i]) ? '<span class="mm-oc-img">' . $img($ims[$i]) . '</span>' : '') . '</a></li>';
            }
            return ['<section class="mm-cell mm-orgcards"><ul>' . $li . '</ul></section>', 'org_cards'];
        }
        // 옆 칸 검색창 — 검색어 입력 + 인기 검색어 (예산군, 2026-09-26 자가 검증)
        if ($t === 'main_search') {
            $kw = array_slice(array_values(array_filter($labels, static fn ($l) => mb_strlen($l) >= 2 && mb_strlen($l) <= 8)), 0, 4) ?: ['채용', '공고', '민원', '행사'];
            $sid = 'mm-s' . self::rid();
            return ['<section class="mm-cell mm-sidesearch"><form role="search" onsubmit="return false"><label for="' . $sid . '" class="mm-sr">통합검색</label><input id="' . $sid . '" type="search" placeholder="무엇을 찾고 계신가요?"><button type="submit" aria-label="검색">' . MainMockup::icon('search') . '</button></form><p class="mm-tags">' . implode('', array_map(static fn ($k) => '<a href="#">#' . htmlspecialchars(ltrim($k, '#'), ENT_QUOTES, 'UTF-8') . '</a>', $kw)) . '</p></section>', 'side_search'];
        }
        // 소식지·매거진 = 표지 한 장 + 제목 카드 (예산군 '예산소식지 2026년 9월호'가 게시판 제한에 걸려 '많이 찾는 정보'로 바뀌던 것)
        if (in_array($t, ['news_tabs', 'banner_zone', 'unknown'], true) && preg_match('/소식지|매거진|웹진|신문|magazine|newsletter/iu', (string) ($st['title'] ?? ''))) {
            $m = $take(['poster'], 1)[0] ?? null; // 카드뉴스는 글자가 가득해 표지 비율로 자르면 잘린다
            return ['<section class="mm-cell mm-card mm-mag"><div class="mm-mag-txt"><p class="mm-kicker">월간 소식지</p><h2>' . $e($org) . ' 소식 2026년 9월호</h2><a class="mm-more" href="#">' . MaterialIcon::label('보기', 'arrow') . '</a></div>' . ($m ? '<span class="mm-mag-cover">' . $img($m) . '</span>' : '') . '</section>', 'magazine'];
        }
        $bnStack = ($w < 520 || ($h > $w * 0.55 && $w < 1000)) && !in_array($photo, ['split_left', 'split_right'], true);
        $role = match (true) {
            $t === 'popup_zone' => 'popup',
            ($t === 'banner_zone' || $t === 'promo_banner' || $t === 'hero') && $bnStack => 'bn_stack',
            $t === 'banner_zone' || $t === 'promo_banner' || $t === 'hero' => (in_array($photo, ['split_left', 'split_right'], true) || ($cards >= 2 && $w < 1100)) ? 'promo' : 'bn_roll',
            $t === 'stats' => 'stats',
            $t === 'greeting_vision' => 'greet',
            $t === 'calendar' => 'cal',
            // 메인 비주얼·탭 게시판·새소식 롤링도 한 번만 — 여수 목업에 큰 비주얼 3번·공지 탭 목록 2번(ledger C1·C2, 2026-09-26)
            $t === 'main_visual' => 'visual',
            ($t === 'news_tabs' || $t === 'notice_list') && (int) ($st['images']['photos'] ?? 0) < 3 && $h >= 100 => 'board', // 70px 알약 메뉴 줄은 게시판으로 안 센다(보훈부 날짜 카드가 제한에 걸리던 것)
            $t === 'news_ticker' => 'ticker',
            default => null,
        };
        $limit = ['popup' => 2, 'bn_stack' => 1, 'bn_roll' => 1, 'promo' => 1, 'stats' => 1, 'greet' => 1, 'cal' => 2, 'visual' => 1, 'board' => 1, 'ticker' => 1];
        if ($role !== null && ($seen[$role] = ($seen[$role] ?? 0) + 1) > $limit[$role]) {
            // 폭 가득 큰 띠(경남 메인 696px 두 번째 비주얼)가 짧은 '많이 찾는 정보'로 바뀌어 높이 -21% → 사진 한 장 띠로, 자리·높이는 그대로
            if ($full && $h >= 300) {
                $m = $take(['hero-nature', 'hero-city', 'place'], 1)[0] ?? null;
                $right = ($m['text_safe']['side'] ?? 'left') === 'right';
                return ['<section class="mm-cell mm-hero mm-hero--full mm-photoband" aria-label="' . $e($org) . ' 문화·관광"><div class="mm-hero-slide' . ($right ? ' is-right' : '') . '">' . ($m ? $img($m) : '') . '<div class="mm-copy"><p class="mm-kicker">' . $e($org) . ' 문화·관광</p><h2>' . $e('계절마다 새로운 ' . $org . '의 풍경') . '</h2><p>' . $e('축제·체험·여행 코스를 한곳에서 찾아보세요.') . '</p><a class="mm-btn" href="#">' . $e('여행 정보 보기') . MainMockup::icon('next') . '</a></div></div></section>', 'photo_band'];
            }
            $alt = self::alt($p, $take, $e, $gov, $head, $img);
            if ($alt !== null) { return $alt; } // 대체 칸이 다 쓰였으면 레퍼런스 모양 그대로(같은 대체 칸 반복보다 낫다)
        }

        switch (true) {
            // ── 비주얼 ─────────────────────────────
            case $t === 'main_visual' || ($photo === 'full_bleed' && !empty($s['text_on_photo']) && $w >= 1500 && !in_array($t, ['news_tabs', 'greeting_vision', 'quick_links', 'text_band'], true) && !((int) ($st['cols'] ?? 0) >= 3 && (int) ($st['images']['photos'] ?? 0) >= 3)): // 사진 여러 장이 열로 놓인 갤러리는 히어로가 아니다(성남시의회 의정 갤러리).  // 글 띠도 비주얼이 아니다(장학재단).  바로가기는 배경 무늬가 있어도 비주얼이 아니다(여수 '시민가이드', 2026-09-26)
                $imgs = $take(['hero-city', 'hero-nature', 'hero-keyvisual'], 3); // 키비주얼은 대상 묶음(공공기관·부처·기업·협회)일 때만 Samples 가 통과시킨다
                $copy = [
                    ['[슬로건 또는 핵심 메시지]', '[한두 문장 요약]', '비전 보기'],
                    [$org . ', 더 가까운 행정으로', '신청부터 결과 확인까지, 이제 누리집에서 한 번에 끝냅니다.', '자세히 보기'],
                    ['함께 걷는 가을, 함께 크는 ' . $org, $res . ' 여러분의 제안을 기다립니다. 10월 31일까지 의견을 보내 주세요.', '제안하기'],
                ];
                static $heroN = 0; // 비주얼이 두 번이면 두 번째는 다른 문구부터
                for ($i = 0; $i < $heroN % 3; $i++) { $copy[] = array_shift($copy); }
                $heroN++;
                if (in_array($photo, ['split_right', 'split_left'], true)) { // 글·사진 좌우 (LH형)
                    $sl = $slides($imgs, static fn ($m, $i) => $img($m));
                    $txt = '';
                    foreach ($copy as $i => [$a, $b, $btn]) { $txt .= '<div class="mm-split-copy"' . ($i ? ' hidden' : '') . '><p class="mm-kicker">' . $e($org) . '</p><h2>' . $e($a) . '</h2><p>' . $e($b) . '</p><a class="mm-btn" href="#">' . $e($btn) . MainMockup::icon('next') . '</a></div>'; }
                    return ['<section class="mm-cell mm-vsplit' . ($photo === 'split_left' ? ' is-left' : '') . '" data-carousel data-interval="5500" data-sync aria-roledescription="carousel" aria-label="메인 비주얼"><div class="mm-vsplit-text">' . $txt . $ctrl('메인 비주얼', count($imgs)) . '</div><ul class="mm-track mm-vsplit-media">' . $sl . '</ul></section>', 'split_' . ($photo === 'split_left' ? 'left' : 'right')];
                }
                $sl = $slides($imgs, static function ($m, $i) use ($img, $e, $copy, $org) {
                    [$a, $b, $btn] = $copy[$i % 3]; $right = ($m['text_safe']['side'] ?? 'left') === 'right';
                    return '<div class="mm-hero-slide' . ($right ? ' is-right' : '') . '">' . $img($m) . '<div class="mm-copy"><p class="mm-kicker">' . $e($org) . '</p><h2>' . $e($a) . '</h2><p>' . $e($b) . '</p><a class="mm-btn" href="#">' . $e($btn) . MainMockup::icon('next') . '</a></div></div>';
                });
                $box = $full || $photo === 'full_bleed' ? 'full' : 'card';
                return ['<section class="mm-cell mm-hero mm-hero--' . $box . ($w < 820 ? ' is-narrow' : '') . '"' . $rs . ' data-carousel data-interval="5000" aria-roledescription="carousel" aria-label="메인 비주얼"><ul class="mm-track">' . $sl . '</ul>' . $ctrl('메인 비주얼', count($imgs)) . '</section>', 'hero_' . $box];

            // ── 최근 게시물 사진 히어로 (보훈부 960×480 형) ──
            case $t === 'news_tabs' && $photo === 'full_bleed' && !empty($s['text_on_photo']) && $w >= 500:
                $imgs = $take(['news-thumb', 'leader-field'], 4);
                $sl = $slides($imgs, static fn ($m, $i) => '<a class="mm-photo-hero" href="#">' . $img($m) . '<span class="mm-ph-cap"><em>' . ($i === 0 ? '보도자료' : '포토뉴스') . '</em><strong>[게시물 제목]</strong><span>[YYYY.MM.DD]</span></span></a>');
                $tabs = $labels ? '<div class="mm-mini-tabs">' . implode('', array_map(static fn ($l, $i) => '<a href="#"' . ($i ? '' : ' aria-current="true"') . '>' . htmlspecialchars($l, ENT_QUOTES, 'UTF-8') . '</a>', array_slice($labels, 0, 4), array_keys(array_slice($labels, 0, 4)))) . '</div>' : '';
                return ['<section class="mm-cell mm-card mm-photohero" data-carousel data-interval="4500" aria-roledescription="carousel" aria-label="최근 소식">' . $head($title ?? '최근 소식', $ctrl('최근 소식', count($imgs))) . $tabs . '<ul class="mm-track">' . $sl . '</ul></section>', 'news_photo_hero'];

            // ── 알림판(팝업존) ─────────────────────
            case $t === 'popup_zone':
                $cnt = max($h > $w * 1.3 ? 5 : 3, min(5, $imgN));
                // 한 자리엔 한 비율만 — 팝업(4:3)과 카드뉴스(1:1)를 섞으면 어느 쪽이든 빈 띠가 생긴다(ledger E2). 좁은 칸 = 팝업 4:3
                $imgs = $take($w > 700 ? ['banner'] : ['popup'], $cnt);
                if ($imgs === []) { $imgs = $take($w > 700 ? ['popup-wide'] : ['notice-square'], $cnt); } // 관공서 밖 종류는 그 종류용 공용 팝업(한 비율만, 2026-10-14)
                $sl = $slides($imgs, static fn ($m, $i) => '<a href="#">' . $img($m, 'mm-cover mm-contain') . '</a>');
                // 알림판 이미지는 비율 고정(정사각) — 칸이 더 높으면 남는 자리를 알림 제목 목록으로 채운다(들어가는 줄만 보인다)
                static $popOff = 0; $off = $popOff; $popOff += 5;
                $names = $gov ? ['국민 참여 정책 제안 공모', '정보공개 청구 안내', '청년 정책 설명회 개최', '대국민 설문조사 참여', '정책 브리핑 생중계 안내', '공무원 채용 시험 일정', '정책 아이디어 공모전', '개인정보 보호 캠페인', '재난 대비 행동 요령', '규제 개선 의견 수렴']
                    : ['가을 문화축제 개최 안내', '지방세 납부 기간 안내', '청년 월세 지원 신청', '시민 만족도 조사 참여', '동절기 안전 수칙 안내', '공공일자리 참여자 모집', '폭염 대비 무더위 쉼터', '평생학습 강좌 수강생 모집', '대형 폐기물 배출 안내', '어린이 보호구역 캠페인'];
                // 목록 제목 = 그 번호 이미지의 설명(alt) — 고정 문구를 돌려쓰면 그림과 제목이 달랐다(ledger D2)
                $cap = static fn ($m, $i) => trim((string) preg_replace('/\s*(팝업|배너|이미지)$/u', '', (string) ($m['alt'] ?? ''))) ?: $names[($i + $off) % 10];
                $list = '<ol class="mm-fit mm-poplist">' . implode('', array_map(static fn ($m, $i) => '<li><button type="button" data-go="' . $i . '"><b>' . ($i + 1) . '</b>' . htmlspecialchars($cap($m, $i), ENT_QUOTES, 'UTF-8') . '</button></li>', $imgs, array_keys($imgs))) . '</ol>';
                $name = $title ?? ($k++ % 2 ? '팝업존' : '알림판');
                return ['<section class="mm-cell mm-card mm-popup' . ($w > 700 ? ' is-wide' : '') . '"' . $rs . ' data-carousel data-interval="4000" aria-roledescription="carousel" aria-label="' . $e($name) . '">' . $head($name, $ctrl($name, count($imgs))) . '<ul class="mm-track">' . $sl . '</ul>' . $list . '</section>', 'popup_carousel'];

            // ── 배너 ───────────────────────────────
            case $t === 'banner_zone' || $t === 'promo_banner' || $t === 'hero':
                if ($h < 100 && $w >= 1200) { // 60px 글자 배너 줄 (예산군 '배너모음' 띠) — 큰 배너 캐러셀로 부풀리지 않는다
                    $bl = array_slice(array_values(array_filter($labels, static fn ($l) => mb_strlen($l) >= 2 && !preg_match('/이전|다음|정지|재생|멈춤|배너/u', $l))), 0, 8);
                    if (count($bl) < 3) { $bl = $gov ? ['국민신문고', '정부24', '정책브리핑', '공공데이터포털', '국민권익위원회', '대한민국 정책브리핑'] : ['정부24', '국민신문고', '안전신문고', '청렴신고센터', '복지로', '워크넷']; }
                    return ['<section class="mm-cell mm-bnbar" aria-label="배너모음"><div class="mm-bnbar-in"><strong>배너모음</strong><ul>' . implode('', array_map(static fn ($l) => '<li><a href="#">' . htmlspecialchars($l, ENT_QUOTES, 'UTF-8') . '</a></li>', $bl)) . '</ul></div></section>', 'banner_bar'];
                }
                if ($bnStack) { // 좁거나 세로로 큰 칸 = 배너를 세로로 쌓는다(칸 높이만큼만 보인다) — 캐러셀을 칸마다 두지 않는다
                    $imgs = $take(['banner'], 3);
                    if ($imgs === []) { $imgs = $take(['strip-banner', 'popup-wide', 'news-thumb', 'place'], 3); } // 관공서 밖 종류(2026-10-14)
                    return ['<section class="mm-cell mm-card mm-bn-stack"' . $rs . ' aria-label="홍보 배너">' . $head($title ?? '홍보', '<a class="mm-more" href="#">' . MaterialIcon::label('전체보기', 'plus') . '</a>') . '<ul class="mm-fit">' . implode('', array_map(static fn ($m) => '<li><a href="#">' . $img($m) . '</a></li>', $imgs)) . '</ul></section>', 'banner_stack'];
                }
                if (in_array($photo, ['split_left', 'split_right'], true) || ($cards >= 2 && $w < 1100)) { // 사진+글 배너 카드
                    $imgs = $take(['citizen', 'place', 'leader-field'], max(2, min(3, $cards ?: 2)));
                    $cardsH = implode('', array_map(static fn ($m, $i) => '<a class="mm-promo" href="#">' . $img($m) . '<span><em>' . ($i ? '안내' : '소식') . '</em><strong>[게시물 제목]</strong></span></a>', $imgs, array_keys($imgs)));
                    return ['<section class="mm-cell mm-promos">' . $head($title ?? '주요 사업') . '<div class="mm-promo-grid" style="grid-template-columns:repeat(' . count($imgs) . ',1fr)">' . $cardsH . '</div></section>', 'promo_cards'];
                }
                $per = max(2, min(6, $colsN ?: (int) round($w / 320)));
                if ($h > 400) { // 세로로 큰 배너 칸 = 한 화면 장수를 줄여 배너를 크게(칸 높이를 빈칸으로 남기지 않는다)
                    $per = max(2, min($per, (int) ceil(($w * 9 / 16) / max(1, $h * 0.9 - 54))));
                }
                $imgs = $take(['banner'], $per + 3);
                if (count($imgs) < $per) { // 관공서 밖 종류는 관공서 문구 배너를 못 쓴다 → 그 종류용 띠 배너, 그것도 없으면 사진 카드(빈 레일이던 것, 2026-10-14 대학)
                    $imgs = array_merge($imgs, $take(['strip-banner', 'popup-wide'], $per + 3 - count($imgs)));
                }
                if (count($imgs) < $per) {
                    $ph = $take(['news-thumb', 'place', 'citizen'], min(4, $per));
                    $cardsH = implode('', array_map(static fn ($m, $i) => '<a class="mm-promo" href="#">' . $img($m) . '<span><em>' . ($i ? '안내' : '소식') . '</em><strong>' . htmlspecialchars(trim((string) ($m['alt'] ?? '')) ?: '[게시물 제목]', ENT_QUOTES, 'UTF-8') . '</strong></span></a>', $ph, array_keys($ph)));
                    return ['<section class="mm-cell mm-promos">' . $head($title ?? '주요 소식') . '<div class="mm-promo-grid" style="grid-template-columns:repeat(' . max(1, count($ph)) . ',1fr)">' . $cardsH . '</div></section>', 'promo_cards_fallback'];
                }
                $bn = implode('', array_map(static fn ($m) => '<li class="mm-bn"><a href="#">' . $img($m) . '</a></li>', $imgs));
                return ['<section class="mm-cell mm-banners" style="--per:' . $per . '" data-carousel data-interval="3500" data-step aria-roledescription="carousel" aria-label="배너모음">' . $head($title ?? '배너모음', $ctrl('배너모음', max(1, count($imgs) - $per + 1))) . '<div class="mm-viewport"><ul class="mm-track mm-rail">' . $bn . '</ul></div></section>', 'banner_roll_' . $per];

            // ── 바로가기 ───────────────────────────
            case $t === 'quick_links' || ($t === 'news_tabs' && $imgN >= 4 && (int) ($st['images']['photos'] ?? 0) === 0 && $h < 320): // 아이콘 줄(보훈부 '비대면 서비스')
                // 소제목 3~6개 + 글자 링크 = 분야별 링크 묶음 (여수 '시민가이드' 공공시설·일자리정보·교육정보·안전생활가이드, 2026-09-26 비교 검수) — 색 머리 열
                $hs = array_values(array_filter(array_map('trim', (array) ($st['headings'] ?? [])), static fn ($x) => mb_strlen($x) >= 2 && mb_strlen($x) <= 14 && $x !== (string) ($st['title'] ?? ''))); // 섹션 제목은 소제목에서 뺀다(대전 서구 맞춤서비스 7→6)
                $gl = array_values(array_filter(array_map('trim', (array) ($st['links']['labels'] ?? [])), static fn ($l) => mb_strlen($l) >= 2 && !in_array($l, $hs, true) && !preg_match('/더보기|more|이전|다음|정지|재생|닫기|열기|^\d+$/iu', $l)));
                if (count($hs) >= 3 && count($hs) <= 6 && $imgN === 0 && count($gl) >= count($hs) * 2) {
                    // 링크를 본문 글 순서로 소제목에 배정 — 균등 분할하면 '사회복지' 아래 '전통시장안내'가 들어간다(대전 서구 맞춤서비스, 2026-09-26)
                    $txt = (string) ($st['text'] ?? ''); $grp = array_fill(0, count($hs), []);
                    $hp = array_map(static fn ($hd) => mb_strpos($txt, $hd) === false ? -1 : (int) mb_strpos($txt, $hd), $hs);
                    foreach ($gl as $k => $l) {
                        $lp = mb_strpos($txt, $l); $gi = -1;
                        if ($lp !== false) { foreach ($hp as $j => $p) { if ($p >= 0 && $p < $lp && ($gi < 0 || $p > $hp[$gi])) { $gi = $j; } } }
                        if ($gi < 0) { $gi = (int) floor($k / max(1, (int) ceil(count($gl) / count($hs)))); }
                        $grp[min(count($hs) - 1, $gi)][] = $l;
                    }
                    // 링크 이름은 16개까지만 저장된다 → 모자란 묶음은 본문에서 그 소제목~다음 소제목 사이 낱말로 (대전 서구 '장애인')
                    foreach ($grp as $j => $g) {
                        if (count($g) >= 2 || $hp[$j] < 0) { continue; }
                        $nx = mb_strlen($txt); foreach ($hp as $p) { if ($p > $hp[$j] && $p < $nx) { $nx = $p; } }
                        $seg = trim(mb_substr($txt, $hp[$j] + mb_strlen($hs[$j]), $nx - $hp[$j] - mb_strlen($hs[$j])));
                        foreach (preg_split('/ +/u', $seg) ?: [] as $tk) { if (count($grp[$j]) >= 4) { break; } if (mb_strlen($tk) >= 2 && mb_strlen($tk) <= 12 && !in_array($tk, $grp[$j], true)) { $grp[$j][] = $tk; } }
                    }
                    foreach ($grp as $j => $g) { if (count($g) < 2) { $grp[$j] = array_merge($g, array_slice([$hs[$j] . ' 안내', $hs[$j] . ' 신청', '관련 서식'], 0, 3 - count($g))); } }
                    $colsH = implode('', array_map(static fn ($hd, $i) => '<div class="mm-group"><h3>' . htmlspecialchars($hd, ENT_QUOTES, 'UTF-8') . '</h3><ul>' . implode('', array_map(static fn ($l) => '<li><a href="#">' . htmlspecialchars($l, ENT_QUOTES, 'UTF-8') . '</a></li>', $grp[$i])) . '</ul></div>', $hs, array_keys($hs)));
                    $ttl = $title !== null && !in_array($title, $hs, true) ? $title : ($gov ? '국민 가이드' : '시민 가이드');
                    return ['<section class="mm-cell mm-groups"' . $rs . '>' . $head($ttl) . '<div class="mm-groups-in" style="grid-template-columns:repeat(' . count($hs) . ',1fr)">' . $colsH . '</div></section>', 'link_groups_' . count($hs)];
                }
                // 아이콘 없는 글자 링크표 (보훈부 '보훈 누리집 바로가기' 4열 표, 2026-09-25 비교 검수 B2) — 아이콘 격자로 바꾸지 않는다
                if ($imgN === 0 && $cards < 3 && $colsN < 6 && (int) ($st['links']['n'] ?? 0) >= 12) { // 6열+ 은 아이콘 상자 격자(예산군 8열 26칸 — 아이콘이 CSS 배경) // 카드형 칸(부천 27칸 — 아이콘이 CSS 배경)은 아이콘 격자
                    $raw = array_values(array_unique(array_filter(array_map('trim', (array) ($st['links']['labels'] ?? [])), static fn ($l) => mb_strlen($l) >= 2 && mb_strlen($l) <= 18 && !preg_match('/더보기|more|이전|다음|정지|재생|닫기|열기|^\d+$/iu', $l))));
                    $tc = $w >= 1000 ? 4 : ($w >= 600 ? 3 : 2);
                    $nn = max($tc * 3, min($tc * 5, count($raw))); $nn -= $nn % $tc;
                    $def = $gov ? ['민원 신청', '정보공개 청구', '증명서 발급', '진위 확인', '위원회 안내', '사업 공모', '예산·결산', '국민 제안', '정책 자료', '행정 서식', '통계 서비스', '공공데이터', '기록물 열람', '채용 정보', '입찰 공고', '청렴 신고', '적극 행정', '규제 개혁', '찾아오시는 길', '조직도']
                        : ['민원 서식', '증명서 발급', '진위 확인', '시설 예약', '여권 안내', '지방세 조회', '주차 안내', '교통 정보', '일자리', '복지 안내', '문화 행사', '평생 학습', '도서관', '체육 시설', '청년 정책', '공공 와이파이', '재난 안전', '생활 폐기물', '찾아오시는 길', '조직도'];
                    foreach ($def as $d) { if (count($raw) >= $nn) { break; } if (!in_array($d, $raw, true)) { $raw[] = $d; } }
                    $cellsH = implode('', array_map(static fn ($l) => '<li><a href="#">' . htmlspecialchars($l, ENT_QUOTES, 'UTF-8') . '<span class="mm-ext" aria-hidden="true">' . MainMockup::icon('next') . '</span></a></li>', array_slice($raw, 0, $nn)));
                    return ['<section class="mm-cell mm-linktable"' . $rs . '><div class="mm-linktable-in"><h2>' . $e($title ?? ($org . ' 바로가기')) . '</h2><ul style="grid-template-columns:repeat(' . $tc . ',1fr)">' . $cellsH . '</ul></div></section>', 'link_table_' . $tc];
                }
                $cn = max(4, min(10, $colsN ?: 8));
                // 좁은 칸(480px)에 아이콘 8칸을 채워 넘치던 것 — 폭에 맞는 칸 수·링크 수만큼만 (대전 서구 청록 칸, 2026-09-26)
                $narrow = $w < 600; if ($narrow) { $cn = $colsN >= 2 && $colsN <= 5 ? $colsN : max(2, min((int) floor($w / 110), (int) ($st['links']['n'] ?? 4) ?: 4)); } // 레퍼런스 열 수(장학재단 4열×2줄)가 있으면 그대로
                // 항목 수 = 목록 항목 수, 없으면 링크 수 (부천 링크 27·9열인데 9개만 그리던 것, 2026-09-25 비교 검수)
                $want = max($cn, min($cn * 4, max($items, (int) ($st['links']['n'] ?? 0)) ?: $cn)); // 목록 항목(8)보다 링크(26)가 많으면 링크 수 (예산군, 2026-09-26)
                $q = array_slice($labels, 0, $want);
                $def = $gov ? ['정책 브리핑', '보도자료', '민원 신청', '정보공개', '채용 정보', '법령·훈령', '자주 묻는 질문', '국민 제안', '예산·재정', '조직도', '고시·공고', '입법 예고', '통계 자료', '정부 혁신', '적극 행정', '청렴 신고', '국민 참여', '행정 서식', '사전 정보', '공공 데이터', '위원회', '소속 기관', '찾아오시는 길', '영상 자료', '카드 뉴스', '정책 Q&A', '정책 연구']
                    : ['전자민원', '여권 안내', '시설 예약', '일자리', '복지 서비스', '교통 정보', '지방세', '문화·관광', '생활 안전', '주차 안내', '평생학습', '청년 정책', '종량제 봉투', '불법 주정차', '재난 안전', '어린이집', '보건소', '도서관', '체육 시설', '공공 와이파이', '민원 서식', '분야별 정보', '통계 연보', '구인 구직', '상수도 요금', '대형 폐기물', '반려동물'];
                foreach ($def as $d) { if (count($q) >= min($want, max($cn, count($def)))) { break; } if (!in_array($d, $q, true)) { $q[] = $d; } }
                if (count($q) > $cn) { $q = array_slice($q, 0, $cn * (int) floor(count($q) / $cn)); }
                $rid = self::rid(); $li = implode('', array_map(static fn ($l) => '<li><a href="#"><span class="mm-qi" aria-hidden="true">' . (self::iconSample($l) ?? self::rowIcon($l, $rid)) . '</span>' . htmlspecialchars($l, ENT_QUOTES, 'UTF-8') . '</a></li>', $q));
                // 좁은 가로띠라도 줄 높이가 두 배 이상 늘어나면 큰 색면에 아이콘 한 줄만 떠 비어 보인다 → 2열 타일 (2026-09-30 디자이너 검수 r2 S01 청록 칸)
                $flat = $h < 130 && !($narrow && $rowH > 2 * max(60, $h)); $box = !$flat && count($q) > $cn * 1.5; // 여러 줄이면 아이콘+이름 상자 격자(예산군 '바로가기 서비스' 8열×4줄)
                return ['<section class="mm-cell mm-quick' . ($flat ? ' is-flat' : '') . ($flat && $narrow ? ' is-narrow' : '') . ($box ? ' is-box' : '') . '"' . $rs . '>' . ($flat || $w < 420 ? '' : $head($title ?? '자주 찾는 서비스')) . '<ul style="grid-template-columns:repeat(' . ($flat ? min(count($q), $narrow ? $cn : 10) : $cn) . ',1fr)">' . $li . '</ul></section>', ($flat ? 'quick_strip_' : 'quick_grid_') . $cn . 'x' . (int) ceil(count($q) / $cn)];

            // ── 한 줄 롤링 ─────────────────────────
            case $t === 'news_ticker':
                $lines = str_repeat('<li class="mm-slide"><a href="#">[게시물 제목]</a><span>[YYYY.MM.DD]</span></li>', 4);
                $lines = preg_replace('/<li class="mm-slide">/', '<li class="mm-slide" hidden>', $lines, -1) ?? $lines;
                $lines = preg_replace('/ hidden>/', '>', $lines, 1) ?? $lines;
                return ['<section class="mm-cell mm-ticker" data-carousel data-interval="3000" aria-roledescription="carousel" aria-label="새소식"><strong>' . $e($title ?? '새소식') . '</strong><ul class="mm-track">' . $lines . '</ul>' . $ctrl('새소식', 4) . '</section>', 'ticker'];

            // ── 달력 ───────────────────────────────
            case $t === 'calendar':
                static $calN = 0;
                if ($calN++ === 0) { return [self::calendar($title, $h, $gov, $p), 'calendar']; }
                $m = ($take(['citizen', 'place', 'news-thumb'], 1))[0] ?? null;
                return ['<section class="mm-cell mm-card mm-evcard">' . $head('행사 안내') . '<a class="mm-promo" href="#">' . $img($m) . '<span><em>10.15</em><strong>' . $e($gov ? '정책 아이디어 공모전 시상식' : '주민자치 한마당') . '</strong></span></a></section>', 'event_photo'];

            // ── 통계 숫자 ──────────────────────────
            case $t === 'stats':
                $kpi = $gov ? [['국민 제안', '12,480', '건'], ['정보공개 처리', '98.6', '%'], ['올해 예산', '4.2', '조 원']] : [['인구', '812,540', '명'], ['올해 예산', '3조 1,200', '억 원'], ['민원 처리', '99.1', '%']];
                return ['<section class="mm-cell mm-card mm-stats">' . $head($title ?? '한눈에 보는 ' . $org) . '<ul>' . implode('', array_map(static fn ($x) => '<li><span>' . $x[0] . '</span><strong>' . $x[1] . '<small>' . $x[2] . '</small></strong></li>', $kpi)) . '</ul></section>', 'stats'];

            // ── 인물·비전 띠 (부천 열린시장실형) ─────
            case $t === 'greeting_vision':
                $sigImg = !empty($p['sig']) ? '<img class="mm-sig" src="' . $e((string) $p['sig']) . '" alt="' . $e($p['name']) . ' 서명">' : ''; // 서명 샘플(ledger E7)
                $m = ($take(['leader-field'], 1, [($p['gender'] ?? '') === 'female' ? '여성' : '남성']))[0] ?? null;
                $links = array_slice($labels, 0, 5) ?: ($gov ? ['인사말', '주요 일정', '업무 추진', '국민 소통'] : ['시정 비전', '공약 사업', '시장 일정', '시장에게 바란다']);
                // 면형 인사말 패널 (부천 열린시장실형, 2026-09-25 비교 검수): 버튼 링크가 3개+ 이고 강조색이 어두우면
                // 현장 사진을 깔지 않는다 — 배경 무늬 이미지가 "폭 가득 사진"으로 잡혀도 실제는 강조색 면 + 인물 + 버튼 격자
                $acc = self::hex($st['colors']['accent'] ?? null) ?? self::hex($st['colors']['fg'] ?? null);
                if (($full || $w >= 1200) && count($labels) >= 3 && $acc !== null && self::lum($acc) < 0.2) {
                    $pt = ($take(['leader'], 1, [($p['gender'] ?? '') === 'female' ? '여성' : '남성', '단색배경']))[0] ?? $m;
                    $btns = implode('', array_map(static fn ($l) => '<li><a href="#">' . htmlspecialchars($l, ENT_QUOTES, 'UTF-8') . MainMockup::icon('next') . '</a></li>', array_slice($labels, 0, 6)));
                    $qs = $gov ? ['정책 브리핑', '민원 신청', '조직도', '찾아오시는 길', '국민 제안'] : ['카카오톡 채널', '대표전화', '조직도', '청사 안내', '찾아오시는 길'];
                    $rid = self::rid(); $ql = implode('', array_map(static fn ($l) => '<li><a href="#"><span class="mm-qi" aria-hidden="true">' . self::rowIcon($l, $rid) . '</span>' . htmlspecialchars($l, ENT_QUOTES, 'UTF-8') . '</a></li>', $qs));
                    // 판이 내용보다 크게 높으면(레퍼런스 칸 692px 등) 단색 면이 빈 띠로 보인다 → 기관 사진을 깔고 강조색을 88% 덮는다(2026-10-14 대학 초안 363px 빈칸)
                    $bgImg = ($take(['hero-city', 'place', 'hero-nature', 'hero-keyvisual'], 1))[0] ?? null;
                    $bgCss = $bgImg ? 'linear-gradient(color-mix(in srgb,' . $acc . ' 88%,transparent),color-mix(in srgb,' . $acc . ' 88%,transparent)),url(&quot;' . htmlspecialchars(Samples::url((string) $bgImg['file']), ENT_QUOTES, 'UTF-8') . '&quot;) center/cover,' . $acc : $acc;
                    return ['<section class="mm-cell mm-vpanel mm-dark" style="background:' . $bgCss . '"><div class="mm-wrap mm-vpanel-in"><div class="mm-vpanel-who">' . $img($pt, 'mm-vpanel-img') . '<div><p class="mm-kicker">' . $e($res) . ' 여러분 반갑습니다</p><h2>' . $e(SampleContent::head($p)) . ' <strong>' . $e($p['name']) . '</strong> 입니다</h2>' . $sigImg . '</div><ul class="mm-vpanel-q">' . $ql . '</ul></div><ul class="mm-vpanel-btns">' . $btns . '</ul></div></section>', 'vision_panel'];
                }
                if ($full || $w >= 1200) {
                    return ['<section class="mm-cell mm-vision">' . $img($m) . '<div class="mm-wrap mm-vision-copy"><p class="mm-kicker">' . $e($p['title']) . '실</p><h2>[인사말 제목 — 한 문장]</h2><p>' . $e($res) . ' 여러분의 목소리에서 답을 찾겠습니다. 현장에서 듣고, 결과로 보여 드리겠습니다.</p><p class="mm-sign">' . $e(SampleContent::head($p)) . ' <strong>' . $e($p['name']) . '</strong>' . $sigImg . '</p><ul>' . implode('', array_map(static fn ($l) => '<li><a href="#">' . htmlspecialchars($l, ENT_QUOTES, 'UTF-8') . '</a></li>', $links)) . '</ul></div></section>', 'vision_band'];
                }
                return ['<section class="mm-cell mm-card mm-greet-card">' . $img($m, 'mm-greet-img') . '<div><p class="mm-kicker">' . $e($p['title']) . '실</p><h2>[인사말 제목 — 한 문장]</h2><p class="mm-sign">' . $e($p['title']) . ' <strong>' . $e($p['name']) . '</strong>' . $sigImg . '</p><a class="mm-more" href="#">' . MaterialIcon::label('인사말 보기', 'plus') . '</a></div></section>', 'greeting_card'];

            // ── 영상·SNS ───────────────────────────
            case $t === 'sns_video' || $t === 'tour_cards' || ($t === 'news_tabs' && (int) ($st['images']['photos'] ?? 0) >= 3):
                $cnt = $w < 420 ? 3 : ($w < 600 ? 2 : ($colsN >= 3 && $colsN <= 4 ? $colsN : max(2, min(4, $imgN ?: ($w > 1000 ? 4 : 2))))); // 레퍼런스 열 수(성남시의회 SNS 3열) // 2열 칸에 3장이면 한 장이 남는다(장학재단)
                $imgs = $take($t === 'tour_cards' ? ['place', 'hero-nature', 'citizen'] : ['news-thumb', 'leader-field', 'citizen'], $cnt); // 명소 카드는 장소 사진(2026-09-26)
                $video = $t === 'sns_video' && !preg_match('/뉴스|소식|news/iu', (string) ($title ?? '')); // '주요뉴스' 포토뉴스는 재생 아이콘 없이
                $cardsH = implode('', array_map(static fn ($m) => '<li><a href="#"><span class="mm-thumb-wrap">' . $img($m, 'mm-thumb') . ($video ? '<span class="mm-play-ico" aria-hidden="true">' . MainMockup::icon('play') . '</span>' : '') . '</span><strong>[게시물 제목]</strong><span>[YYYY.MM.DD]</span></a></li>', $imgs));
                $sns = $video ? '<ul class="mm-sns" aria-label="공식 SNS">' . implode('', array_map(static fn ($x) => '<li><a href="#" aria-label="' . $x . '">' . MainMockup::icon(strtolower($x)) . '</a></li>', ['YouTube', 'Blog', 'Instagram', 'Facebook'])) . '</ul>' : '<a class="mm-more" href="#">' . MaterialIcon::label('더보기', 'plus') . '</a>';
                return ['<section class="mm-cell mm-media">' . $head($title ?? ($video ? $org . ' 영상' : '포토뉴스'), $sns) . '<ul class="mm-cards' . ($w < 420 ? ' mm-fit' : '') . '" style="grid-template-columns:repeat(' . ($w < 420 ? 1 : ($w < 600 ? min(2, count($imgs)) : count($imgs))) . ',1fr)">' . $cardsH . '</ul></section>', $video ? 'video_cards' : 'photo_cards'];

            // ── 낮고 넓은 탭 띠 (보훈부 상단 분야 버튼) ──
            case $t === 'news_tabs' && $h < 120 && $w >= 900:
                $q = array_slice($labels, 0, max(4, min(8, $items ?: 6)));
                if (count($q) < 4) { $q = $gov ? ['정책 소식', '보도자료', '정책 자료', '법령 정보', '민원 안내', '국민 참여'] : ['공지사항', '고시·공고', '채용정보', '입찰정보', '행사', '보도자료']; }
                return ['<nav class="mm-cell mm-topics" aria-label="분야 바로가기"><ul>' . implode('', array_map(static fn ($l) => '<li><a href="#">' . htmlspecialchars($l, ENT_QUOTES, 'UTF-8') . '</a></li>', $q)) . '</ul></nav>', 'topic_strip'];

            // ── 카드 격자 (미분류지만 카드가 많음) ─────
            // 제목 + 버튼 2~5개만 있는 폭 가득 띠 (부천 '문화도시 부천' 띠, 2026-09-25 비교 검수) — 가운데 제목·버튼 줄
            case ($t === 'unknown' || $t === 'info_cards') && $w >= 1200 && is_string($st['title'] ?? null) && (int) ($st['images']['photos'] ?? 0) === 0 && count((array) ($st['links']['labels'] ?? [])) >= 2 && count((array) ($st['links']['labels'] ?? [])) <= 5:
                $bl = array_slice(array_values(array_filter((array) $st['links']['labels'], static fn ($l) => is_string($l) && mb_strlen(trim($l)) >= 2 && mb_strlen(trim($l)) <= 18)), 0, 4);
                $bs = implode('', array_map(static fn ($l) => '<a class="mm-btn" href="#">' . htmlspecialchars($l, ENT_QUOTES, 'UTF-8') . '</a>', $bl));
                return ['<section class="mm-cell mm-ctaband"><div class="mm-wrap"><p class="mm-kicker">' . $e($org) . '의 문화·관광·축제 소식</p><h2>' . $e(mb_substr((string) $st['title'], 0, 20)) . '</h2><div class="mm-ctaband-btns">' . $bs . '</div></div></section>', 'cta_band'];

            // 열 3~4개 + 문장형 제목 = 사진 소식 카드 (여수 '오늘의 주제' 3장, 2026-09-26 비교 검수) — 일반 안내 카드 6장으로 그리던 것
            case ($t === 'unknown' || $t === 'info_cards') && in_array((int) ($st['cols'] ?? 0), [3, 4, 5], true) && ($w >= 900 || ($w >= 700 && (int) ($st['images']['photos'] ?? 0) >= 3))
                && ((int) ($st['images']['photos'] ?? 0) >= 2 || count(array_filter((array) ($st['links']['labels'] ?? []), static fn ($l) => is_string($l) && mb_strlen(trim($l)) >= 14)) >= 2):
                $cnt = min(5, max((int) $st['cols'], min(4, (int) ($st['images']['photos'] ?? 0) + 1)));
                $imgs = $take(['news-thumb', 'leader-field', 'citizen'], $cnt);
                $cardsH = implode('', array_map(static fn ($m) => '<li><a href="#"><span class="mm-thumb-wrap">' . $img($m, 'mm-thumb') . '</span><strong>[게시물 제목]</strong><span>[YYYY.MM.DD]</span></a></li>', $imgs));
                return ['<section class="mm-cell mm-media">' . $head($title ?? '주요 소식', '<a class="mm-more" href="#">' . MaterialIcon::label('더보기', 'plus') . '</a>') . '<ul class="mm-cards" style="grid-template-columns:repeat(' . count($imgs) . ',1fr)">' . $cardsH . '</ul></section>', 'news_photo_cards_' . $cnt];

            // ── AI 챗봇 (경기도 '하이GT에게 무엇이든 질문해 보세요', 2026-09-26) ── 예시 질문 말풍선 + 입력창
            case $t === 'ai_chatbot':
                $cid = 'mm-ai' . self::rid();
                $qs = $gov ? ['올해 바뀌는 지원 정책을 알려 주세요.', '민원 신청은 어디서 하나요?', '가까운 행정복지센터를 찾아 주세요.'] : ['가족과 가볼 만한 곳을 추천해 주세요.', '이번 주말 행사를 알려 주세요.', '민원 서류는 어떻게 발급하나요?'];
                return ['<section class="mm-cell mm-aichat"><div class="mm-aichat-in"><h2><span class="mm-aichat-name">' . $e($org) . ' AI</span>에게 무엇이든 <strong>질문해 보세요!</strong></h2><ul class="mm-aichat-q">' . implode('', array_map(static fn ($q) => '<li><button type="button">' . htmlspecialchars($q, ENT_QUOTES, 'UTF-8') . '</button></li>', $qs)) . '</ul><form class="mm-aichat-form" onsubmit="return false"><label for="' . $cid . '" class="mm-sr">AI에게 질문</label><input id="' . $cid . '" type="text" placeholder="궁금한 내용을 입력하세요"><button type="submit" aria-label="보내기">' . MainMockup::icon('search') . '</button></form></div></section>', 'ai_chatbot'];

            case $t === 'text_band':
                $tx = trim((string) ($st['text'] ?? ''));
                // 제목이 있는 안내 띠 = 제목 + 설명 + 버튼 두 개 (서천군 '서천 맞춤 관광지', C35) — 제목 앞 기관 이름은 가상 기관으로
                if (is_string($st['title'] ?? null) && mb_strlen((string) $st['title']) <= 20 && (int) ($st['links']['n'] ?? 0) >= 1 && preg_match('/(바로\s?가기|검색|신청|보기|안내)\s*$/u', $tx)) { // 끝이 버튼 문구인 띠만(장학재단 '국가예산' 안내 문구 띠는 그대로)
                    $tw =preg_split('/ +/u', trim((string) $st['title'])) ?: [];
                    $ct = $e($org) . ' ' . $e(implode(' ', array_slice($tw, max(1, count($tw) - 2))));
                    $tour = (bool) preg_match('/관광|여행/u', $tx);
                    $b1 = $tour ? '맞춤 관광지 검색' : '자세히 보기'; $b2 = $tour ? '문화관광 바로가기' : '신청 안내';
                    return ['<section class="mm-cell mm-ctaband"><div class="mm-ctaband-in"><h2>' . $ct . '</h2><p>' . ($tour ? $e($org) . '의 매력을 담은 여행지를 취향에 맞게 추천해 드립니다.<br>계절마다 달라지는 풍경과 체험을 만나 보세요.' : '필요한 정보를 한곳에서 확인하고 바로 신청할 수 있습니다.') . '</p><p class="mm-ctaband-btns"><a class="mm-btn" href="#">' . MaterialIcon::label($b1, 'ext') . '</a><a class="mm-btn mm-btn--line" href="#">' . MaterialIcon::label($b2, 'ext') . '</a></p></div></section>', 'cta_band'];
                }
                if (mb_strlen($tx) <= 40) { // 앱·서비스 안내 띠
                    return ['<section class="mm-cell mm-appband"><div class="mm-wrap mm-appband-in"><p>' . $e($org) . ' 서비스, 모바일로 간편하게</p><span class="mm-store">Google Play</span><span class="mm-store">App Store</span></div></section>', 'app_band'];
                }
                $notes = [
                    $e($org) . '의 주요 사업은 국민의 세금으로 운영되며, 기준에 따라 차등하여 지원합니다.<br>지원 기준과 신청 방법은 분야별 안내에서 확인할 수 있습니다.',
                    '불편한 점이나 바라는 점이 있으면 언제든 알려 주세요.<br>보내 주신 의견은 담당 부서가 확인한 뒤 답변해 드립니다.',
                    $e($org) . '은(는) 개인정보를 안전하게 관리합니다.<br>수집한 정보는 정해진 목적으로만 쓰고 기간이 지나면 지웁니다.',
                ];
                return ['<section class="mm-cell mm-noteband"><div class="mm-wrap"><p>' . $notes[self::$noteN++ % count($notes)] . '</p></div></section>', 'note_band'];

            case $t === 'unknown' || $t === 'info_cards':
                $q = array_slice($labels, 0, max(3, min(6, $cards)));
                while (count($q) < max(3, min(6, $cards))) { $q[] = ['분야별 안내', '생활 정보', '참여 마당', '열린 정보', '자료실', '고객 센터'][count($q)]; }
                // 레퍼런스가 3·4열이고 높이가 2줄 이상이면 큰 카드(제목·설명·아이콘) — 예산군 '자주찾는 민원 한눈에 보기' 3열×2행 (2026-09-26 자가 검증)
                $big = in_array($colsN, [2, 3, 4], true) && $h >= 400;
                $gc = $big ? $colsN : min(6, count($q));
                $rid = self::rid(); return ['<section class="mm-cell mm-infocards' . ($big ? ' is-big' : '') . '">' . ($big && $title !== null && mb_strlen($title) <= 14 ? $head($title) : '') . '<ul style="grid-template-columns:repeat(' . $gc . ',1fr)">' . implode('', array_map(static fn ($l) => '<li><a href="#">' . ($big ? '<span><strong>' . htmlspecialchars($l, ENT_QUOTES, 'UTF-8') . '</strong><p>' . htmlspecialchars($l, ENT_QUOTES, 'UTF-8') . ' 관련 제도와 지원 사업을 한눈에 확인할 수 있습니다.</p></span><span class="mm-qi" aria-hidden="true">' . self::rowIcon($l, $rid) . '</span>' : '<span class="mm-qi" aria-hidden="true">' . self::rowIcon($l, $rid) . '</span><strong>' . htmlspecialchars($l, ENT_QUOTES, 'UTF-8') . '</strong>' . MaterialIcon::label('바로가기', 'arrow') . '') . '</a></li>', $q)) . '</ul></section>', $big ? 'info_cards_big' : 'info_cards'];

            // ── 날짜 카드 줄 (보훈부 보도자료 4칸: 날짜 크게 · 제목 · 부서, 2026-09-25 비교 검수) ──
            case $t === 'news_tabs' && $w >= 1000 && $h < 300 && $imgN === 0 && preg_match_all('/20\d\d[.-]\d{1,2}[.-]\d{1,2}/', (string) ($st['text'] ?? '')) >= 3:
                $tabs = array_slice(array_values(array_filter($labels, static fn ($l) => mb_strlen($l) <= 8)), 0, 5);
                if (count($tabs) < 3) { $tabs = $gov ? ['보도자료', '공지사항', '행사', '해명자료', '입법·예고'] : ['새소식', '공지사항', '고시·공고', '채용정보', '보도자료']; }
                $btns = ''; $panels = '';
                $days = ['2026-09-23', '2026-09-22', '2026-09-21', '2026-09-18'];
                $dept = $gov ? ['정책기획과', '대변인실', '정보화담당관', '운영지원과'] : ['총무과', '홍보담당관', '민원봉사과', '문화체육과'];
                foreach ($tabs as $i => $tb) {
                    $id = 'mm-t' . $uid . '-' . $i;
                    $btns .= '<button type="button" role="tab" id="' . $id . '" aria-controls="' . $id . 'p" aria-selected="' . ($i ? 'false' : 'true') . '" tabindex="' . ($i ? '-1' : '0') . '">' . htmlspecialchars($tb, ENT_QUOTES, 'UTF-8') . '</button>';
                    $li = '';
                    foreach ($days as $j => $d) { $li .= '<li><a href="#"><time>' . $d . '</time><strong>[게시물 제목]</strong><span>' . $dept[$j] . '</span></a></li>'; }
                    $panels .= '<div role="tabpanel" id="' . $id . 'p" aria-labelledby="' . $id . '"' . ($i ? ' hidden' : '') . '><ul class="mm-datecards">' . $li . '</ul></div>';
                }
                return ['<section class="mm-cell mm-datecard"><div class="mm-cell-head"><div role="tablist" aria-label="소식">' . $btns . '</div><a class="mm-more" href="#">' . MaterialIcon::label('전체보기', 'plus') . '</a></div>' . $panels . '</section>', 'date_cards_4'];
            // ── 소식 탭 + 목록 ─────────────────────
            default:
                $tabs = array_slice(array_values(array_filter($labels, static fn ($l) => mb_strlen($l) <= 8)), 0, $w < 420 ? 2 : 4);
                if (count($tabs) < 2) { $tabs = array_slice($gov ? ['공지사항', '보도자료', '정책자료'] : ['공지사항', '고시·공고', '채용정보', '보도자료'], 0, $w < 420 ? 2 : 4); }
                $rowsN = 8; // 칸은 옆 칸 높이만큼 늘어난다 — 넉넉히 만들고 넘치는 줄은 mm-fit 이 숨긴다(성남시의회 공지 칸 아래가 비던 것)
                $btns = ''; $panels = '';
                foreach ($tabs as $i => $tb) {
                    $id = 'mm-t' . $uid . '-' . $i;
                    $btns .= '<button type="button" role="tab" id="' . $id . '" aria-controls="' . $id . 'p" aria-selected="' . ($i ? 'false' : 'true') . '" tabindex="' . ($i ? '-1' : '0') . '">' . htmlspecialchars($tb, ENT_QUOTES, 'UTF-8') . '</button>';
                    $panels .= '<div role="tabpanel" id="' . $id . 'p" aria-labelledby="' . $id . '"' . ($i ? ' hidden' : '') . '><ul class="mm-list mm-fit">' . str_repeat('<li><a href="#">[게시물 제목]</a><span>[YYYY.MM.DD]</span></li>', $rowsN) . '</ul></div>';
                }
                return ['<section class="mm-cell mm-board"><div class="mm-cell-head"><div role="tablist" aria-label="소식">' . $btns . '</div><a class="mm-more" href="#">' . MaterialIcon::label('더보기', 'plus') . '</a></div>' . $panels . '</section>', 'tabs_list_' . count($tabs)];
        }
    }

    /** 되풀이된 칸 대신 넣는 다른 역할의 칸 — 관공서 메인에 흔한 것부터, 각각 한 번씩 */
    private static function alt(array $p, callable $take, callable $e, bool $gov, callable $head, callable $img): ?array
    {
        // 각 대체 칸은 한 번씩만 (보훈부 목업에 '행사 안내'가 두 번 — 2026-09-25 비교 검수 B1)
        static $n = 0;
        $all = ['links', 'notice', 'sns', 'survey', 'event', 'contact', 'photo'];
        if ($n >= count($all)) { return null; }
        $kind = $all[$n++];
        $more = '<a class="mm-more" href="#">' . MaterialIcon::label('더보기', 'plus') . '</a>';
        switch ($kind) {
            case 'links':
                $l = $gov ? ['정책 자료실', '법령·훈령', '예산·결산', '채용 정보', '입찰 공고', '조직도', '정보공개 청구', '찾아오시는 길']
                    : ['민원 서식', '여권 발급', '지방세 조회', '시설 예약', '일자리 정보', '교통 정보', '주차 안내', '생활 폐기물'];
                $rid = self::rid(); return ['<section class="mm-cell mm-card mm-links">' . $head('많이 찾는 정보') . '<ul class="mm-fit">' . implode('', array_map(static fn ($x) => '<li><a href="#"><span class="mm-qi" aria-hidden="true">' . self::rowIcon($x, $rid) . '</span>' . htmlspecialchars($x, ENT_QUOTES, 'UTF-8') . MainMockup::icon('next') . '</a></li>', $l)) . '</ul></section>', 'alt_links'];
            case 'notice':
                return ['<section class="mm-cell mm-card mm-notice">' . $head($gov ? '정책 소식' : '고시·공고', $more) . '<ul class="mm-list mm-fit">' . str_repeat('<li><a href="#">[게시물 제목]</a><span>[YYYY.MM.DD]</span></li>', 7) . '</ul></section>', 'alt_notice'];
            case 'sns':
                $ch = [['YouTube', 'youtube', '영상으로 보는 ' . $p['org']], ['Blog', 'blog', '생활 정보 이야기'], ['Instagram', 'instagram', '사진으로 만나는 소식'], ['Facebook', 'facebook', '새소식 알림']];
                return ['<section class="mm-cell mm-card mm-snsbox">' . $head('공식 SNS') . '<ul class="mm-fit">' . implode('', array_map(static fn ($c) => '<li><a href="#"><span class="mm-qi" aria-hidden="true">' . MainMockup::icon($c[1]) . '</span><span><strong>' . $c[0] . '</strong><small>' . htmlspecialchars($c[2], ENT_QUOTES, 'UTF-8') . '</small></span></a></li>', $ch)) . '</ul></section>', 'alt_sns'];
            case 'survey':
                return ['<section class="mm-cell mm-card mm-survey">' . $head($gov ? '국민 참여' : '시민 참여') . '<p class="mm-q">' . $e($gov ? '청년 정책에서 가장 먼저 필요한 것은?' : '우리 동네에 가장 필요한 시설은?') . '</p><div class="mm-opts" role="radiogroup" aria-label="응답">' . implode('', array_map(static fn ($o, $i) => '<label><input type="radio" name="mm-sv"' . ($i ? '' : ' checked') . '> ' . htmlspecialchars($o, ENT_QUOTES, 'UTF-8') . '</label>', $gov ? ['주거 지원', '일자리', '교육·훈련'] : ['공원·쉼터', '주차장', '도서관'], [0, 1, 2])) . '</div><a class="mm-btn mm-btn--line" href="#">참여하기</a></section>', 'alt_survey'];
            case 'contact':
                return ['<section class="mm-cell mm-card mm-contact">' . $head($gov ? '민원 상담' : '민원 콜센터') . '<p class="mm-tel"><span class="mm-qi" aria-hidden="true">' . MainMockup::icon('doc') . '</span><strong>1234-5678</strong></p><dl><dt>평일</dt><dd>09:00 ~ 18:00</dd><dt>점심</dt><dd>12:00 ~ 13:00</dd><dt>휴무</dt><dd>토·일·공휴일</dd></dl><a class="mm-btn mm-btn--line" href="#">온라인 민원 신청</a></section>', 'alt_contact'];
            case 'photo':
                $m = ($take(['news-thumb', 'leader-field'], 1))[0] ?? null;
                return ['<section class="mm-cell mm-card mm-evcard">' . $head('포토 소식', $more) . '<a class="mm-promo" href="#">' . $img($m) . '<span><em>포토뉴스</em><strong>[게시물 제목]</strong></span></a></section>', 'alt_photo'];
            default:
                $m = ($take(['citizen', 'place', 'news-thumb'], 1))[0] ?? null;
                return ['<section class="mm-cell mm-card mm-evcard">' . $head('행사 안내') . '<a class="mm-promo" href="#">' . $img($m) . '<span><em>10.22</em><strong>' . $e($gov ? '지역 순회 현장 간담회' : '건강 걷기 대회') . '</strong></span></a></section>', 'alt_event'];
        }
    }

    private static function calendar(?string $title, int $h, bool $gov, array $p): string
    {
        $ev = [2 => $gov ? '국민 참여 정책 토론회' : $p['org'] . ' 가을 문화축제', 8 => $gov ? '청년 정책 설명회' : '청년 일자리 박람회', 15 => $gov ? '공모전 시상식' : '주민자치 한마당', 22 => $gov ? '지역 순회 간담회' : '건강 걷기 대회'];
        $cells = '';
        $first = 4; // 2026-10-01 = 목요일
        for ($i = 0; $i < $first; $i++) { $cells .= '<span></span>'; }
        for ($d = 1; $d <= 31; $d++) {
            $cells .= '<button type="button" class="' . (isset($ev[$d]) ? 'has-ev' : '') . ($d === 2 ? ' is-on' : '') . '" data-ev="' . htmlspecialchars($ev[$d] ?? '', ENT_QUOTES, 'UTF-8') . '" aria-label="10월 ' . $d . '일' . (isset($ev[$d]) ? ' 행사 있음' : '') . '">' . $d . '</button>';
        }
        $list = $h >= 240 ? '<p class="mm-cal-ev" aria-live="polite"><time>10.02</time> ' . htmlspecialchars($ev[2], ENT_QUOTES, 'UTF-8') . '</p>' : '';
        return '<section class="mm-cell mm-card mm-cal">' . '<div class="mm-cell-head"><h2>' . htmlspecialchars($title ?? '행사·일정', ENT_QUOTES, 'UTF-8') . '</h2><span class="mm-cal-month">2026. 10</span></div>'
            . '<div class="mm-cal-grid"><b>일</b><b>월</b><b>화</b><b>수</b><b>목</b><b>금</b><b>토</b>' . $cells . '</div>' . $list . '</section>';
    }
}

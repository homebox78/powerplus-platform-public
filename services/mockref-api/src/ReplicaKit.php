<?php
declare(strict_types=1);

namespace Homebox;

/**
 * 재현 묶음 (2026-09-30) — AI 가 레퍼런스 화면의 배치를 그대로 따라 "움직이는 시안"을 직접 만들 때 필요한 재료를 한 번에 준다.
 *
 * 배경: 조립 엔진(MainLayout 고정 틀)으로는 실제 사이트 수준이 안 나왔고, 가장 좋은 결과는
 * AI 가 레퍼런스 캡처와 섹션 좌표를 보고 px 단위로 만들고 → 나란히 대조 → 게이트 검사를 되풀이했을 때 나왔다(storage/cheongju-v3).
 * 그래서 MCP 는 그 과정의 재료(캡처·좌표·구성·샘플·아이콘·동작 스크립트)와 절차·검사 기준을 준다.
 * 배치는 레퍼런스를 따르고, 글·이미지·색은 전부 바꾼다(가상 기관·홈박스 샘플·고객 색).
 */
final class ReplicaKit
{
    /** 구성 정보에서 넘길 항목 — 원문 글(text)은 뺀다(복제 방지). */
    private const KEEP = ['title', 'headings', 'links', 'images', 'items', 'cols', 'colors', 'font', 'style', 'name', 'flags', 'inner'];

    /** 제작 언어(ko 외) — [영문 이름, html lang] */
    public const LANGS = ['en' => ['English', 'en'], 'ja' => ['Japanese', 'ja'], 'zh' => ['Simplified Chinese', 'zh-Hans'], 'fr' => ['French', 'fr'],
        'es' => ['Spanish', 'es'], 'de' => ['German', 'de'], 'vi' => ['Vietnamese', 'vi']];

    private static function langBlock(string $code): array
    {
        [$en, $html] = self::LANGS[$code];
        return ['code' => $code, 'name' => $en, 'html_lang' => $html,
            'rule' => "화면에 나오는 모든 글을 {$en} 로 쓴다 — 주 메뉴·하위 메뉴·버튼·제목·본문·게시물 제목·날짜 형식·바닥 정보·persona 의 기관 이름과 기관장 직함까지 그 언어로 옮긴다(persona 값은 한국어로 오지만 뜻을 옮겨 쓴다). <html lang=\"{$html}\"> 로 두고, 그 언어 글자가 모두 있는 글꼴을 고른다. 샘플 이미지 안에 박힌 한국어 글자는 그대로 두되 글자가 박힌 배너·팝업은 되도록 피한다."];
    }

    /**
     * @param array<string, mixed> $sc   레퍼런스 화면(homebox_main_ref / homebox_sub_ref 결과)
     * @param list<array<string, mixed>> $rows 섹션(type,x,y,w,h,structure) y 순
     * @param array{primary?: string, font?: string} $custom 고객 색·글꼴
     * @return array<string, mixed>
     */
    public static function build(array $sc, array $rows, array $persona, array $custom = [], ?array $mix = null): array
    {
        $secs = $mix['secs'] ?? self::prepSecs($sc, $rows, $persona);
        // PC 본문 폭 최소 1400px(사용자 2026-10-11 "별도 요청이 없으면 최소 1399px — 예전 스타일로 좁게 만든 게 너무 많다").
        // 레퍼런스가 1200·1280 처럼 좁으면 칸 비율은 그대로 두고 가로로 늘린다. width 를 요청하면 그 폭을 따른다.
        $vw = (int) ($sc['viewport_w'] ?? 1920);
        if ($vw >= 1280) {
            if ($mix) { $cx = (int) $mix['frame']['x']; $cw = (int) $mix['frame']['w']; }
            else { [$cw, $cx] = self::containerOf(self::rows($secs, $vw), $vw, (int) ($sc['container_px'] ?? 0)); }
            $target = isset($custom['width']) ? (int) $custom['width'] : max($cw, self::MIN_W);
            $target = min($target, $vw - 40);
            if ($cw > 0 && $target !== $cw) {
                $secs = self::widen($secs, $vw, $cx, $cw, $target);
                $nx = intdiv($vw - $target, 2);
                if ($mix) { $mix['frame']['x'] = $nx; $mix['frame']['w'] = $target; $mix['secs'] = $secs; }
                $sc['container_px'] = $target;
                $custom['widened'] = ['from' => $cw, 'from_x' => $cx, 'to' => $target, 'requested' => isset($custom['width'])];
            }
        }
        // 마지막 안전망: 모든 섹션·틀 좌표를 화면 안(0..vw)으로.
        $vwc = $vw > 0 ? $vw : 1920;
        $clampF = static function (array $f) use ($vwc): array {
            $x = max(0, min($vwc - 1, (int) ($f['x'] ?? 0))); $f['w'] = max(1, min($vwc - $x, (int) ($f['w'] ?? $vwc))); $f['x'] = $x; return $f;
        };
        foreach ($secs as &$cs) {
            $cs = $clampF($cs);
            if (isset($cs['frame']) && is_array($cs['frame'])) { $cs['frame'] = $clampF($cs['frame']); }
            if (isset($cs['structure']['frame']) && is_array($cs['structure']['frame'])) { $cs['structure']['frame'] = $clampF($cs['structure']['frame']); }
        }
        unset($cs);
        if ($mix) { $mix['secs'] = $secs; if (isset($mix['frame'])) { $mix['frame'] = array_merge($mix['frame'], $clampF($mix['frame'])); } }
        return self::assemble($sc, $secs, $persona, $custom, $mix);
    }

    /** 요청이 없을 때 PC 본문 최소 폭. */
    public const MIN_W = 1400;

    /**
     * 본문 틀 [cx, cx+cw] 를 화면 가운데 폭 W 로 늘인다(줄이기도 된다). 칸은 같은 비율로, 전폭 면은 배경은 두고 안쪽 내용만.
     * 틀 밖에 완전히 떨어진 섹션(오른쪽 떠 있는 퀵메뉴 등)은 오른쪽 끝 기준 위치를 유지한다.
     */
    private static function widen(array $secs, int $vw, int $cx, int $cw, int $W): array
    {
        $k = $W / max(1, $cw); $L = intdiv($vw - $W, 2); $R = $cx + $cw;
        foreach ($secs as &$s) {
            $full = $s['w'] >= $vw - 8;
            if ($full) {
                if (isset($s['structure']) && is_array($s['structure'])) { $s['structure'] = self::scaleInner($s['structure'], $k, $cx, $L, (int) (0.95 * $vw)); }
                if (isset($s['frame'])) { $s['frame'] = ['x' => $L, 'w' => $W]; }
                continue;
            }
            if ($s['x'] >= $R - 4) { $s['x'] = min($vw - $s['w'], $s['x'] + ($L + $W - $R)); continue; } // 틀 오른쪽 밖
            if ($s['x'] + $s['w'] <= $cx + 4) { $s['x'] = max(0, $s['x'] - ($cx - $L)); continue; } // 틀 왼쪽 밖
            $nx = (int) round($L + ($s['x'] - $cx) * $k); $nw = (int) round($s['w'] * $k);
            $s['x'] = max(0, $nx); $s['w'] = min($vw - $s['x'], $nw);
            if (isset($s['structure']) && is_array($s['structure']) && abs($k - 1.0) > 0.005) { $s['structure'] = self::scaleInner($s['structure'], $k, 0, 0); }
        }
        unset($s);
        return $secs;
    }

    /** 섹션 구성 정보에서 원문 글을 빼고 레퍼런스 기관명을 가상 기관명으로 바꾼다. */
    /**
     * 가짜 푸터 보정 (2026-10-03 시험 02-spo: footer h7683/pad_bottom7347).
     * 분해가 문서 끝 빈 여백까지 섹션으로 잡으면 높이가 부풀어 판정이 구조적 통과불가가 된다.
     * style.pad_bottom이 크면 실제 내용은 위쪽에만 있으므로 빈 여백을 걷어낸다.
     */
    private static function saneH(string $type, int $h, array $st): int
    {
        $pad = (int) ($st['style']['pad_bottom'] ?? $st['pad_bottom'] ?? 0);
        if ($pad > 300 && $h > 800) {
            return max(200, $h - $pad + 120);
        }
        if ($type === 'footer' && $h > 1200) {
            return 600;
        }
        return $h;
    }

    public static function prepSecs(array $sc, array $rows, array $persona): array
    {
        $real = (string) $sc['org_name'];
        $names = array_values(array_unique(array_filter([$real, (string) preg_replace('/청$/u', '', $real), (string) preg_replace('/(특별|광역)?(시|도)\s*/u', '', $real)], static fn ($n) => mb_strlen($n) >= 2)));
        $swap = static function ($v) use (&$swap, $names, $persona) {
            if (is_array($v)) { return array_map($swap, $v); }
            return is_string($v) ? str_replace($names, (string) $persona['org'], $v) : $v;
        };
        $secs = [];
        // 화면 전체가 가로로 밀려 캡처된 경우(2026-10-12 강릉시 14081: 머리·바닥 x=-1359 w=1920, 본문 x=-1179 w=1560)를 되돌린다.
        // 폭 가득 섹션이 음수 x 면 그만큼이 밀린 양이다 — 음수 x 섹션에만 더한다(나중에 따로 잡은 섹션은 이미 0 기준).
        $vwS = (int) ($sc['viewport_w'] ?? 1920); $off = 0;
        foreach ($rows as $r0) { if ((int) $r0['w'] >= $vwS - 8 && (int) $r0['x'] < -8) { $off = max($off, -(int) $r0['x']); } }
        if ($off > 0) {
            foreach ($rows as &$r0) { if ((int) $r0['x'] < 0 && (int) $r0['x'] + $off >= -8) { $r0['x'] = max(0, (int) $r0['x'] + $off); } }
            unset($r0);
        }
        foreach ($rows as $i => $r) {
            $st = is_string($r['structure']) ? (json_decode($r['structure'], true) ?: []) : (array) ($r['structure'] ?? []);
            $h = self::saneH((string) ($r['type'] ?? ''), (int) $r['h'], $st);
            $keep = array_intersect_key($st, array_flip(self::KEEP));
            // 소제목·링크 글은 레퍼런스 원문(인명·시설명·게시물 제목)이라 넘기지 않는다 — 개수와 글 길이만.
            if (isset($keep['headings']) && is_array($keep['headings'])) { $hs = array_values(array_filter($keep['headings'], 'is_string')); unset($keep['headings']); $keep['heading_count'] = count($hs); $keep['heading_lengths'] = array_map('mb_strlen', array_slice($hs, 0, 8)); }
            if (isset($keep['links']['labels']) && is_array($keep['links']['labels'])) { $keep['links']['label_count'] = count($keep['links']['labels']); unset($keep['links']['labels']); }
            // 섹션 제목·이름도 레퍼런스 원문(기관장 실명·시설명)일 수 있다 — 글자 수만 넘긴다.
            foreach (['title', 'name'] as $tk) { if (isset($keep[$tk])) { if (is_string($keep[$tk]) && $keep[$tk] !== '') { $keep[$tk . '_length'] = mb_strlen($keep[$tk]); } unset($keep[$tk]); } }
            // 안쪽 실측: 섹션 밖(숨은 슬라이드·음수 좌표) 요소는 뺀다.
            if (isset($keep['inner']) && is_array($keep['inner'])) { $sw = (int) $r['w']; $sh = $h; $keep['inner'] = array_values(array_filter($keep['inner'], static fn ($it) => is_array($it) && ($it[1] ?? -1) >= 0 && ($it[2] ?? -1) >= 0 && ($it[1] ?? 0) < $sw && ($it[2] ?? 0) < $sh)); }
            // 화면 밖 섹션(숨은 슬라이드가 x=-1179 처럼 음수로 잡힌 것)은 화면 안으로 잘라 넣고, 완전히 밖이면 뺀다
            // (2026-10-12 MCP 시험: 음수 x 섹션이 본문 틀 계산에 섞여 섞기 frame.x 가 -1179 가 됐다).
            $vw0 = (int) ($sc['viewport_w'] ?? 1920); $x0 = (int) $r['x']; $w0 = (int) $r['w'];
            $vis = min($vw0, $x0 + $w0) - max(0, $x0);
            if ($vis <= 0 || $vis < 0.5 * $w0) { continue; } // 반 넘게 화면 밖 = 숨은 슬라이드·접힌 레이어
            if ($x0 < 0) { $w0 += $x0; $x0 = 0; }
            $w0 = min($w0, $vw0 - $x0);
            $secs[] = ['no' => $i + 1, 'type' => (string) $r['type'], 'x' => $x0, 'y' => (int) $r['y'], 'w' => $w0, 'h' => $h,
                'structure' => $swap($keep)];
        }
        return $secs;
    }

    /** @return array<string, mixed> */
    private static function assemble(array $sc, array $secs, array $persona, array $custom, ?array $mix): array
    {
        [$pri] =[Design::primary($sc['primary_hex'] ?? null, is_string($sc['palette'] ?? null) ? (json_decode((string) $sc['palette'], true) ?: []) : (array) ($sc['palette'] ?? []))];
        $primary = $custom['primary'] ?? ($pri['hex'] ?? null);
        $vw = (int) ($sc['viewport_w'] ?? 1920);

        $rowsOut = self::rows($secs, $vw);
        $cx = 0; $cw = 0;
        foreach ($rowsOut as $rw) { if (empty($rw['full_bleed']) && $rw['content_w'] > $cw) { $cw = (int) $rw['content_w']; $cx = (int) $rw['content_x']; } }
        if ($cw < 600) { $cw = (int) ($sc['container_px'] ?? 1400) ?: 1400; $cx = (int) max(0, ($vw - $cw) / 2); }
        // 본문 폭 = 전폭이 아니고 오른쪽 끝에 닿지 않는 줄 중 가장 많이 나온 폭(10px 단위). 없으면 측정값.
        $tally = [];
        foreach ($rowsOut as $rw) {
            if (!empty($rw['full_bleed']) || (int) $rw['content_w'] < 600 || (int) $rw['content_x'] + (int) $rw['content_w'] >= $vw - 10) { continue; }
            $k = (int) (round(((int) $rw['content_w']) / 10) * 10); $tally[$k] = ($tally[$k] ?? 0) + 1;
        }
        if ($tally) { arsort($tally); $inner = (int) array_key_first($tally); } else { $inner = (int) ($sc['container_px'] ?? 0) ?: (int) (round($cw / 10) * 10); }
        $cx = max(0, $cx - 20); $cw = min($vw - $cx, $cw + 40);

        // 서브 페이지: 본문 구간(머리 아래 ~ 바닥 위). 머리·바닥은 메인 시안 것을 쓰므로 높이 비교는 본문만 한다.
        $sub = null;
        if ((string) ($sc['page_type'] ?? 'main') !== 'main') {
            $top = 0; $bot = (int) ($sc['full_h'] ?? 0);
            foreach ($secs as $s2) {
                if (in_array($s2['type'], ['header', 'masthead', 'gnb'], true) && $s2['y'] < 400) { $top = max($top, $s2['y'] + $s2['h']); }
                if ($s2['type'] === 'footer' && $s2['y'] > $top) { $bot = min($bot, $s2['y']); }
            }
            $sub = ['body_y_from' => $top, 'body_y_to' => $bot, 'body_h' => max(0, $bot - $top),
                'rule' => '서브 페이지다. 머리(공식 띠·유틸·로고·주 메뉴)와 바닥은 이 레퍼런스가 아니라 먼저 만든 메인 시안의 것을 그대로 쓴다. 레퍼런스에서 따르는 것은 본문 구간(body_y_from~body_y_to)의 배치다. 높이 비교도 본문 구간끼리 한다. LNB·경로·페이지 제목의 메뉴 이름은 메인 시안의 주 메뉴 트리에 맞춘다(레퍼런스 메뉴 수와 달라도 된다). 페이지끼리는 실제 파일명으로 링크한다.'];
        }

        return [
            'preflight' => self::PREFLIGHT,
            'preferences' => [ // 디자이너 선호 규칙(2026-10-03) — 관공서 사례(무엇을 만들었나)와 함께 쓰는 두 번째 근거(무엇이 더 낫다고 골랐나)
                'how' => '디자이너 A/B 투표에서 뚜렷하게 갈린 결과(300명 이상·한쪽 65% 이상)다. 시안에 같은 요소가 있으면 rule 쪽으로 만들고 instead_of 쪽은 피한다. 레퍼런스 배치(무엇이 어디에)는 그대로 따르고, 이 규칙은 요소를 어떻게 그릴지만 정한다. 더 찾으려면 get_design_preferences.',
                'rules' => Preferences::compact(Preferences::find(match ((string) ($sc['page_type'] ?? 'main')) { 'main' => ['layout', 'nav', 'button', 'visual', 'overlay'], 'board_list', 'board_view', 'search' => ['list', 'form', 'data'], 'form', 'login', 'apply' => ['form', 'feedback', 'button'], default => ['layout', 'data', 'nav'] }, '', 10, true, true)),
            ],
            'base' => [
                'how' => '<head> 에 <style data-hb-base></style> 한 줄을 넣으면 check_mockup 이 보관할 때 홈박스 기본 CSS(토큰·틀·카드·단추·서브 공통 틀·반응형·호버)를 채운다. 그 바로 아래 <style> 맨 위에 root 줄을 그대로 적고, 이 시안만의 CSS 는 그 뒤에 쓴다. 서브 페이지는 <!--hb:use style--> 로 메인의 <style> 전부를 그대로 받는다 — 함께 따라온 빈 기본 CSS 자리도 홈박스가 채운다. 서브 묶음의 root 값은 무시하고 메인 root 를 쓴다(한 사이트는 폭·간격·주색이 하나). <!--hb:use header--> 는 메인의 첫 <header> 하나를 가져가므로 메인에 header 는 하나만 둔다. 파일 이름은 menu[].file 을 그대로 쓰면 메뉴 링크가 서로 이어진다.',
                // 서브 묶음은 root 값을 주지 않는다(2026-10-05 R2·R6: 서브 레퍼런스 폭 1150·1300 이 메인 1500·1800 과 달라 작업자가 서브마다 폭을 바꿨다 — 한 사이트는 폭이 하나)
                'root' => $sub !== null ? '(서브 페이지 — 메인 시안의 root 줄을 그대로 쓴다. <!--hb:use style--> 로 함께 온다. 이 묶음엔 값이 없다.)' : ':root{--hb-primary:' . $primary . ';--hb-w:' . (int) ($mix['frame']['w'] ?? ($sc['container_px'] ?? 1400)) . 'px;--hb-gap:' . (int) ($mix['frame']['col_gap'] ?? 24) . 'px;--hb-row:' . (int) ($mix['frame']['box_gap'] ?? $mix['frame']['row_gap'] ?? 80) . 'px;--hb-radius:' . (int) ($mix['style']['card_radius_px'] ?? 12) . 'px;--hb-h2:' . (int) ($mix['style']['heading_px'] ?? 32) . 'px}',
                'classes' => [
                    '.hb-wrap' => '본문 폭 컨테이너(모든 구역의 내용을 이 안에 — 같은 왼쪽 선·같은 폭). 폭 가득 띠는 바깥 요소에 배경을 주고 안에 .hb-wrap',
                    '.hb-sec / .hb-band / .hb-band--dark' => '구역(위 간격 = --hb-row) / 옅은 회색 띠 / 짙은 무채색 띠',
                    '.hb-grid.hb-c2~c6·hb-c8 / .hb-row / .hb-stack' => '한 묶음의 칸 배치 — 가로·세로 칸 사이는 전부 --hb-gap. 칸 폭이 다르면 .hb-grid 에 style="grid-template-columns:467fr 406fr 406fr" 처럼 비율만 준다(gap 은 건드리지 않는다)',
                    '.hb-title / .hb-head / .hb-hero-title / .hb-lead / .hb-meta / .hb-point' => '섹션 제목(--hb-h2) / 제목+더보기 줄 / 첫 화면 제목 / 설명 글 / 날짜 등 / 주색 글자',
                    '.hb-card / .hb-card--soft / .hb-photo(+.hb-cap) / .hb-list' => '흰 카드(호버 떠오름) / 옅은 회색 카드 / 사진 틀(호버 확대, 아래 글 덮개) / 게시물 줄 목록(밑줄 그어짐)',
                    '.hb-btn / .hb-btn--line / .hb-btn--white / .hb-chip / .hb-more / .hb-ico' => '주색 단추 / 테두리 단추 / 흰 단추 / 이름표 / 둥근 더보기 단추(회전) / 아이콘 SVG 크기',
                    '.hb-table' => '표(머리 가운데, 긴 글 칸은 td.hb-left)',
                ],
                'sub_html' => '<div class="hb-subvisual" style="background-image:url(샘플 사진 url)"><div class="hb-wrap"><h1>페이지 이름</h1><nav class="hb-path" aria-label="경로"><a href="index.html">홈</a><a href="#">상위 메뉴</a><span>페이지 이름</span></nav></div></div>'
                    . '<main class="hb-wrap"><div class="hb-sub"><aside class="hb-lnb" aria-label="하위 메뉴"><h2>상위 메뉴</h2><ul><li><a href="a.html" aria-current="page">현재 페이지</a></li><li><a href="b.html">형제 페이지</a></li></ul></aside><div class="hb-content">본문(레퍼런스의 본문 칸 안쪽 구성)</div></div></main>',
                'rule' => '머리(header)·바닥(footer)·첫 화면처럼 레퍼런스 모양을 따라야 하는 곳만 직접 CSS 를 쓰고, 본문 구역의 폭·카드·단추·제목은 이 클래스로 만든다. 서브 페이지는 sub_html 마크업을 그대로 쓴다 — 옆 메뉴·서브 비주얼을 새로 디자인하지 않는다. 단, 줄과 줄 사이 margin 은 --hb-row 한 값이 아니라 sections 의 줄별 y 차이 그대로 줄마다 둔다(줄마다 다를 수 있다).',
            ],
            'reference' => [
                // 메인인데 섞을 출처가 없어 한 곳만 쓴 경우 = single:<id> (판정이 '한 사이트 복제'로 막지 않게 구분한다)
                'ref_id' => $mix['ref_id'] ?? (((string) ($sc['page_type'] ?? 'main')) === 'main' ? 'single:' : '') . (int) $sc['id'],
                'screen_id' => (int) $sc['id'], 'site_slug' => $sc['slug'], 'page_type' => $sc['page_type'] ?? 'main',
                'width' => $vw, 'height' => (int) ($mix['height'] ?? ($sc['full_h'] ?? 0)),
                'capture_url' => $mix === null ? Plan::kurl((int) ($sc['site_id'] ?? 0), $sc['public_asset_id'] ?? null) : null,
                'kogl' => Plan::koglInfo((int) ($sc['site_id'] ?? 0)),
                'mix' => $mix === null ? null : [
                    'sources' => $mix['sources'], 'pieces' => $mix['pieces'], 'share' => $mix['share'], 'frame' => $mix['frame'] ?? null, 'style' => $mix['style'] ?? null,
                    'variation' => ['rule' => '출처 구역을 색만 바꿔 그대로 옮기면 운영 중인 그 사이트와 똑같아 보인다. 구역마다 뼈대(칸 수·폭·높이)는 sections 대로 두고, 아래 change 한 가지를 반드시 적용해 표현을 바꾼다. 이 변화들도 한 사이트처럼 보이게 같은 둥글기·같은 선 굵기·같은 주색 쓰임으로 맞춘다.', 'items' => $mix['variation'] ?? []],
                    'rule' => '이 시안은 레퍼런스 ' . count($mix['sources']) . '곳의 줄을 섞어 만든 배치다(한 사이트를 베끼지 않기 위해). 머리·첫 화면·바닥은 A, 본문 줄은 출처(sections[].src)가 줄마다 다르다. '
                        . '모든 좌표(sections·rows 의 x·y·w·h)는 이미 한 페이지로 다시 계산한 값이다 — 출처가 다른 줄도 이 좌표대로 위에서 아래로 쌓는다. '
                        . '참고 이미지는 줄 구간마다 출처 캡처를 잘라 붙인 것이고 이미지 설명에 시안 y 범위가 적혀 있다. '
                        . '세로 기준: 줄과 줄 사이 간격은 sections 좌표 그대로 쓴다 — 위 줄 끝(y+h)과 아래 줄 시작(y) 차이대로 두며, 줄마다 다를 수 있다(실제 사이트도 줄마다 16~60px 제각각이다. 한 값으로 통일하면 높이가 reference.height 와 어긋나 감점된다). 색 면 띠가 화면 폭 가득인 줄(full_bleed)끼리 맞닿는 곳만 0이다. 섹션 상자(sections 의 h)는 자기 위아래 안쪽 여백을 품고 있으므로, 상자 사이 margin = 다음 줄 y − (위 줄 y+h) 로 sections 에서 읽은 값 그대로 둔다. frame.row_gap·box_gap(기본 CSS 의 --hb-row)은 묶음 안 새 카드 등 새 요소의 기본 간격일 뿐 줄 사이에는 쓰지 않는다. 한 줄 안에서 키가 다른 칸들은 바닥을 맞추고, 가장 긴 칸 아래 여백은 sections 대로 둔다. 실측 간격이 본문에서 180px·바닥 근처에서 90px 을 넘는 줄은 그 상자에 data-qa-gap 을 달아둔다(레퍼런스에도 있는 여백 표시). 가로 기준은 mix.frame 하나다: 머리·바닥을 뺀 모든 줄의 내용은 x = frame.x 에서 시작해 폭 frame.w 안에 놓고, 좌우로 나란한 칸 사이 간격은 frame.col_gap 한 값만 쓴다. sections 좌표와 structure.inner 는 이미 이 틀에 맞춰 다시 계산했다. '
                        . '참고 이미지는 출처 캡처 그대로라 줄마다 폭·칸 간격이 다르게 보인다 — 이미지에서는 칸 구성(몇 칸·무엇이 어디에)만 읽고, 폭·시작선·칸 간격은 이미지가 아니라 frame 을 따른다. 배경 면이 화면 폭 가득인 줄(sections[].frame 있음)도 배경만 전폭이고 안쪽 내용은 frame 안이다 — 그 안에서 좌우로 나뉜 큰 덩어리 사이도 col_gap 이다(격자 안 작은 칸 사이 간격은 structure.inner 대로). '
                        . '본문 폭보다 좁은 줄(검색 띠 등)은 frame 가운데에 두고, 이미지에서 그 좌우에 보이는 요소(표어·날씨 등)는 frame 왼쪽 끝·오른쪽 끝에 붙인다. '
                        . '이미지에는 있는데 sections 에 없는 칸(예: 카드 줄 오른쪽의 목록 상자)은 넣되, 그 줄의 칸 수를 늘려 frame 폭 안에서 col_gap 으로 다시 나눈다. columns 는 주지 않는다(줄 단위로만 쌓는다). '
                        . '줄마다 출처는 다르지만 한 사이트처럼 보여야 한다 — 제목 크기·굵기, 둥글기, 카드 그림자, 더보기 단추 모양은 A 기준 한 가지로 통일한다 — 섹션 제목 크기·굵기와 카드 둥글기는 mix.style 값을 모든 줄에 쓴다(B·C 조각의 이미지에 보이는 글자 크기·둥글기는 따르지 않는다).',
                ],
                'content' => isset($custom['widened'])
                    ? ['x' => max(0, (int) $custom['widened']['from_x'] - 20), 'w' => (int) $custom['widened']['from'] + 40, 'container_w' => $inner,
                        'note' => 'x·w 는 참고 이미지(원본 캡처)를 잘라 보여 주는 범위다. 원본 본문 폭은 ' . (int) $custom['widened']['from'] . 'px 이지만 시안은 container_w(' . $inner . 'px)로 늘려 만든다 — sections 좌표는 이미 늘린 값이다.']
                    : ['x' => $cx, 'w' => $cw, 'container_w' => $inner, 'note' => 'x·w 는 잘라 보여 주는 범위(양옆 20px 여유 포함)다. 본문 폭은 container_w 를 쓴다.'],
                'width_rule' => isset($custom['widened']) && empty($custom['widened']['requested'])
                    ? 'PC 본문 폭은 최소 ' . self::MIN_W . 'px 다(요청이 없을 때). 레퍼런스 본문이 ' . (int) $custom['widened']['from'] . 'px 로 좁아 칸 비율은 그대로 두고 ' . (int) $custom['widened']['to'] . 'px 로 늘렸다. 참고 이미지의 좁은 폭을 따르지 말고 sections·frame 좌표를 따른다.'
                    : 'PC 본문 폭은 최소 ' . self::MIN_W . 'px 다(요청이 없을 때). 고객이 다른 폭을 원하면 width 로 다시 받는다.',
                'sub' => $sub,
                'note' => '배치(위치·크기·칸 나눔·밀도)의 기준이다. 글·사진·로고·색은 가져오지 않는다. 다 만들면 check_mockup(ref_id=reference.ref_id) 로 판정한다.',
            ],
            'rows' => $rowsOut,
            'columns' => $mix !== null ? null : self::columns($secs, $vw),
            'columns_note' => '없으면 null 이다. null 이면 이 화면에 좌우가 따로 흐르는 긴 2단 구간이 없다는 뜻이니 rows 와 참고 이미지를 따른다(LNB 옆 본문은 sub 로 표현한다).',
            // structure 의 false·null·빈 값은 뺀다(빠진 키 = false/없음) — 섹션마다 같은 꺼진 표시가 되풀이돼 묶음을 키웠다(2026-10-12).
            'sections' => array_map(static fn(array $s) => self::dropEmpty($s), $secs),
            'sections_note' => 'sections[].structure 에서 값이 false·없음인 항목은 생략했다(빠진 키 = false 또는 없음).',
            'inner_legend' => self::hasInner($secs) ? 'sections[].structure.inner = 그 섹션 안쪽 요소의 실측 목록. 항목은 [종류, x, y, w, h, 글자크기, 굵기, 글자수, 둥글기, 색]. x·y 는 섹션 왼쪽 위 기준 px. 종류 t=글(색=글자색) · a=링크·단추 · i=이미지 자리 · b=면(카드·상자, 색=배경). 글 내용은 없고 글자 수만 있다 — 같은 길이의 가상 글을 쓴다. 카드 격자·목록 줄 높이·탭 위치·글자 크기는 이 값을 그대로 쓴다.' : null,
            'menu' => self::menu($persona),
            'persona' => self::personaOut($persona),
            'theme' => [
                'primary' => $primary,
                'primary_source' => $custom['primary_source'] ?? (isset($custom['primary']) ? '고객 지정' : '레퍼런스 추출값 — 고객 색을 받으면 그 색으로 바꾼다'),
                'secondary' => self::secondary((string) $primary),
                'accent_rule' => '주색 1개 + 보조색 1개(주색과 어울리는 밝은 색)만. 그 밖은 무채색과 주색의 옅은 면. 소셜 채널 로고 색과 경고·재생 같은 상태색은 작은 면적에 한해 예외.',
                'color_use' => '주색은 포인트 색이다 — 단추·선택된 탭·아이콘·밑줄·작은 이름표·숫자 강조에만 쓴다. 넓은 면(첫 화면 배경, 구역 띠, 큰 상자, 카드 바탕, 바닥)은 흰색·옅은 회색(#F5F6F8)·짙은 무채색(#1F2328)·사진으로 만든다. 사진 위에 주색을 덮지 않는다(어둡게 하려면 검정 30~45%). 주색 면은 한 화면에 1~2곳, 합쳐서 화면의 10% 이내. 주색을 옅게 탄 면(연한 주색 카드 바탕)도 넓게 깔지 않는다 — 고객이 붉은색을 줬다고 사이트 전체가 붉어지면 안 된다.',
                'neutral' => ['bg' => '#FFFFFF', 'bg_soft' => '#F5F6F8', 'line' => '#E3E5E8', 'text' => '#1F2328', 'text_sub' => '#5B626B', 'dark' => '#1F2328'],
                'type' => ['hero_title_max_px' => 60, 'sub_visual_title_max_px' => 44, 'section_title_px' => $mix['style']['heading_px'] ?? 32, 'section_title_max_px' => 40, 'slogan_max_px' => 40, 'body_px' => '16~18',
                    'rule' => '첫 화면 제목만 60px 까지. 섹션 제목·본문 안 슬로건·강조 문구는 40px 을 넘기지 않는다(숫자 통계는 예외). 큰 글자로 화면을 채우지 않는다.'],
                'font' => $custom['font'] ?? 'Pretendard',
                'reference_fonts' => Design::fonts(is_string($sc['fonts'] ?? null) ? (json_decode((string) $sc['fonts'], true) ?: []) : (array) ($sc['fonts'] ?? [])),
                'radius_px' => $sub !== null ? null : self::radius($secs, $sc['radius_px'] ?? null), 'container_px' => $sub !== null ? null : ($mix['frame']['w'] ?? ($sc['container_px'] ?? null)),
                'sub_note' => $sub !== null ? '서브 페이지는 본문 폭·둥글기·간격을 메인 시안 값(메인 묶음 theme.container_px·base.root) 그대로 쓴다. 이 서브 레퍼런스의 폭은 따르지 않는다 — 본문 칸 안쪽 구성만 따른다.' : null,
                'measure_note' => 'radius_px·container_px 는 자동 측정값이라 틀릴 수 있다. 참고 이미지와 다르면 이미지를 따른다.',
            ],
            'sub_shell' => self::SUB_SHELL + ['content_w' => $sub !== null ? '메인 묶음 theme.container_px 와 같은 값' : ($mix['frame']['w'] ?? null)],
            'samples' => self::samples((string) ($persona['virtual'] ?? $persona['org']), !empty($persona['client'])),
            'icons' => self::icons(),
            'behavior' => [
                'contract' => (string) @file_get_contents(dirname(__DIR__) . '/data/hb-behavior.md'),
                'how' => '스크립트를 직접 쓰지 않는다 — </body> 앞에 <script data-hb-behavior></script> 한 줄만 넣으면 check_mockup 이 보관할 때 홈박스 동작 스크립트를 채운다. contract 의 data-hb 속성만 마크업에 붙인다. (판정 없이 파일로만 저장할 때는 get_behavior_kit 의 script 를 넣는다.)',
                'reuse' => '서브 페이지는 메인과 같은 부분을 다시 쓰지 않는다 — check_mockup 에 base_token(메인 시안의 token)을 주고, 같은 자리에 <!--hb:use style--> · <!--hb:use header--> · <!--hb:use footer--> 를 적으면 홈박스가 메인의 그 부분(모든 <style>, 첫 <header>, 마지막 <footer>)을 넣는다. 다른 구간을 나눠 쓰려면 메인에서 <!--hb:part 이름-->…<!--/hb:part--> 로 감싸고 서브에서 <!--hb:use 이름-->. 서브만의 CSS 는 <!--hb:use style--> 뒤에 <style> 을 하나 더 둔다. 그래서 메인의 CSS 는 서브에서도 쓸 공통 규칙(머리·바닥·단추·카드·서브 비주얼 띠·왼쪽 메뉴)을 처음부터 포함해 쓴다.',
            ],
            'procedure' => self::PROCEDURE,
            'acceptance' => self::ACCEPTANCE,
        ] + (isset($custom['lang']) ? ['language' => self::langBlock((string) $custom['lang'])] : []);
    }

    /** 섹션을 '줄'로 묶는다 — 세로로 40% 이상 겹치면 같은 줄. 실제 사이트는 한 줄에 여러 칸이 가로로 꽉 찬다. */
    public static function rows(array $secs, int $vw): array
    {
        $body = array_values(array_filter($secs, static fn ($s) => $s['h'] > 0 && $s['w'] > 0));
        usort($body, static fn ($a, $b) => $a['y'] <=> $b['y'] ?: $a['x'] <=> $b['x']);
        $rows = [];
        foreach ($body as $s) {
            $placed = false;
            foreach ($rows as &$row) {
                $ov = min($row['y2'], $s['y'] + $s['h']) - max($row['y'], $s['y']);
                if ($ov > 0.4 * min($row['y2'] - $row['y'], $s['h'])) {
                    $row['cells'][] = $s; $row['y'] = min($row['y'], $s['y']); $row['y2'] = max($row['y2'], $s['y'] + $s['h']); $placed = true; break;
                }
            }
            unset($row);
            if (!$placed) { $rows[] = ['y' => $s['y'], 'y2' => $s['y'] + $s['h'], 'cells' => [$s]]; }
        }
        $out = []; $prev = null;
        foreach ($rows as $row) {
            usort($row['cells'], static fn ($a, $b) => $a['x'] <=> $b['x'] ?: $a['y'] <=> $b['y']);
            $x1 = min(array_map(static fn ($c) => $c['x'], $row['cells']));
            $x2 = max(array_map(static fn ($c) => $c['x'] + $c['w'], $row['cells']));
            $out[] = [
                'y' => $row['y'], 'h' => $row['y2'] - $row['y'], 'gap_above' => $prev === null ? 0 : max(0, $row['y'] - $prev),
                'content_x' => $x1, 'content_w' => $x2 - $x1, 'full_bleed' => ($x2 - $x1) >= $vw - 8,
                'cells' => array_map(static fn ($c) => ['no' => $c['no'], 'type' => $c['type'], 'x' => $c['x'], 'y' => $c['y'], 'w' => $c['w'], 'h' => $c['h']], $row['cells']),
            ];
            $prev = $row['y2'];
        }
        return $out;
    }

    /** 줄의 역할 묶음 — 같은 묶음끼리만 출처를 바꿔 끼운다(소식 줄 자리에 다른 사이트의 소식 줄). */
    private static function family(string $t): string
    {
        return match (true) {
            in_array($t, ['news_tabs', 'news_ticker', 'notice_box'], true) => 'news',
            in_array($t, ['quick_links', 'floating_quick'], true) => 'quick',
            in_array($t, ['banner_zone', 'popup_zone'], true) => 'banner',
            in_array($t, ['sns_video', 'tour_cards', 'hero'], true) => 'media',
            in_array($t, ['stats', 'stat_cards', 'calendar', 'text_band'], true) => 'info',
            in_array($t, ['main_search', 'ai_chatbot'], true) => 'search',
            default => $t,
        };
    }

    /** 줄 하나의 역할 = 가장 넓은 칸의 묶음. */
    private static function rowFamily(array $row): string
    {
        $best = null;
        foreach ($row['cells'] as $c) { if ($best === null || $c['w'] * $c['h'] > $best['w'] * $best['h']) { $best = $c; } }
        return $best === null ? 'unknown' : self::family((string) $best['type']);
    }

    /** 본문 폭(전폭·오른쪽 끝에 닿는 줄 제외 최빈 폭)과 그 왼쪽 x. */
    private static function containerOf(array $rows, int $vw, int $fallback): array
    {
        $tally = []; $xs = [];
        foreach ($rows as $rw) {
            if (!empty($rw['full_bleed']) || (int) $rw['content_x'] < 0 || (int) $rw['content_w'] < 600 || (int) $rw['content_x'] + (int) $rw['content_w'] >= $vw - 10) { continue; }
            $k = (int) (round(((int) $rw['content_w']) / 10) * 10); $tally[$k] = ($tally[$k] ?? 0) + 1; $xs[$k][] = (int) $rw['content_x'];
        }
        if (!$tally) { $w = $fallback ?: 1400; return [$w, (int) max(0, ($vw - $w) / 2)]; }
        arsort($tally); $w = (int) array_key_first($tally); sort($xs[$w]);
        return [$w, $xs[$w][intdiv(count($xs[$w]), 2)]];
    }

    /** 가로로 겹치는 칸끼리 한 단으로 묶는다 → [[x1, x2, [인덱스…]], …] 왼쪽부터. */
    private static function colGroups(array $boxes): array
    {
        $idx = array_keys($boxes);
        usort($idx, static fn ($a, $b) => $boxes[$a]['x'] <=> $boxes[$b]['x']);
        $cols = [];
        foreach ($idx as $i) {
            $x1 = $boxes[$i]['x']; $x2 = $x1 + $boxes[$i]['w'];
            $n = count($cols);
            if ($n && $x1 < $cols[$n - 1][1] - 0.3 * min($boxes[$i]['w'], $cols[$n - 1][1] - $cols[$n - 1][0])) {
                $cols[$n - 1][1] = max($cols[$n - 1][1], $x2); $cols[$n - 1][2][] = $i;
            } else { $cols[] = [$x1, $x2, [$i]]; }
        }
        return $cols;
    }

    /** 안쪽 실측의 가로 값(x·w)을 배율 k 로 바꾼다: x' = (x - from) * k + to. */
    private static function scaleInner(array $st, float $k, float $from, float $to, ?int $keepFullW = null): array
    {
        if (empty($st['inner']) || !is_array($st['inner'])) { return $st; }
        foreach ($st['inner'] as &$it) {
            if (!is_array($it) || !isset($it[1], $it[3])) { continue; }
            if ($keepFullW !== null && $it[3] >= $keepFullW) { continue; } // 전폭 배경 면은 그대로
            $it[1] = (int) round(($it[1] - $from) * $k + $to); $it[3] = (int) round($it[3] * $k);
        }
        unset($it);
        return $st;
    }

    /** 한 줄의 섹션들($secs[$from…])을 본문 틀(cx, cw)에 맞춘다. 전폭 줄은 배경은 두고 안쪽 내용만, 여러 단인 줄은 단 사이 간격을 gap 으로. */
    private static function fitRow(array &$secs, int $from, int $vw, int $cx, int $cw, int $gap): void
    {
        $n = count($secs) - $from; if ($n <= 0) { return; }
        $allFull = true;
        for ($i = $from; $i < count($secs); $i++) { if ($secs[$i]['w'] < $vw - 8) { $allFull = false; } }
        if ($allFull) {
            for ($i = $from; $i < count($secs); $i++) {
                $inner = $secs[$i]['structure']['inner'] ?? null;
                $secs[$i]['frame'] = ['x' => $cx, 'w' => $cw];
                if (!is_array($inner) || !$inner) { continue; }
                $l = PHP_INT_MAX; $r = 0;
                foreach ($inner as $it) { if (is_array($it) && isset($it[1], $it[3]) && $it[3] < 0.95 * $vw) { $l = min($l, $it[1]); $r = max($r, $it[1] + $it[3]); } }
                if ($r - $l < 600 || (abs($l - $cx) <= 12 && abs(($r - $l) - $cw) <= 24)) { continue; }
                $secs[$i]['structure'] = self::scaleInner($secs[$i]['structure'], $cw / ($r - $l), $l, $cx, (int) (0.95 * $vw));
            }
            return;
        }
        for ($i = $from; $i < count($secs); $i++) { if ($secs[$i]['w'] >= $vw - 8) { return; } } // 전폭 면과 칸이 섞인 줄은 건드리지 않는다
        $boxes = [];
        for ($i = $from; $i < count($secs); $i++) { $boxes[] = ['x' => $secs[$i]['x'], 'w' => $secs[$i]['w']]; }
        $cols = self::colGroups($boxes);
        $span = end($cols)[1] - $cols[0][0];
        if ($span < 0.6 * $cw) { return; } // 가운데 놓인 좁은 띠(검색 줄 등)는 그대로
        $sumW = 0; foreach ($cols as $c) { $sumW += $c[1] - $c[0]; }
        $avail = $cw - $gap * (count($cols) - 1);
        $x = $cx;
        foreach ($cols as $c) {
            $ow = $c[1] - $c[0]; $nw = (int) round($ow * $avail / max(1, $sumW)); $f = $nw / max(1, $ow);
            foreach ($c[2] as $bi) {
                $s = &$secs[$from + $bi];
                $s['x'] = (int) round($x + ($s['x'] - $c[0]) * $f); $s['w'] = (int) round($s['w'] * $f);
                if (abs($f - 1.0) > 0.005) { $s['structure'] = self::scaleInner($s['structure'], $f, 0, 0); }
                unset($s);
            }
            $x += $nw + $gap;
        }
    }

    /**
     * 섞기 배치 (2026-10-02 사용자 결정 "섞기로 바꾼다") — 한 레퍼런스를 통째로 따르면 나란히 놓았을 때 누가 봐도 그 사이트다.
     * 머리·첫 화면(메인 비주얼)·바닥은 A, 본문 줄은 A 의 줄 순서(역할)를 유지한 채 B·C 의 같은 역할 줄로 번갈아 바꿔 끼운다.
     * 좌표는 한 페이지로 다시 계산한다(y 누적, 가로는 A 본문 폭에 맞춰 늘이고 줄임).
     * @param list<array{label: string, sc: array, secs: list<array>}> $refs  A 가 첫째
     * @return array<string, mixed>
     */
    public static function mixPlan(array $refs, int $vw): array
    {
        $info = [];
        foreach ($refs as $r) {
            $rows = self::rows($r['secs'], $vw);
            $head = []; $hero = []; $body = []; $foot = [];
            $phase = 'head';
            foreach ($rows as $i => $rw) {
                $types = array_column($rw['cells'], 'type');
                $isHead = $rw['y'] < 420 && array_intersect($types, ['header', 'masthead', 'gnb', 'skip_nav']);
                if ($phase === 'head' && $isHead) { $head[] = $i; continue; }
                if (in_array('footer', $types, true) || $phase === 'foot') { $phase = 'foot'; $foot[] = $i; continue; }
                if ($phase === 'head') { $phase = 'hero'; }
                // 첫 화면 = 머리 아래부터 높이 300 이상인 첫 줄까지(검색 띠 + 메인 비주얼)
                if ($phase === 'hero') { $hero[] = $i; if ($rw['h'] >= 300 || count($hero) >= 3) { $phase = 'body'; } continue; }
                $body[] = $i;
            }
            [$cw, $cx] = self::containerOf($rows, $vw, (int) ($r['sc']['container_px'] ?? 0));
            $info[$r['label']] = ['rows' => $rows, 'head' => $head, 'hero' => $hero, 'body' => $body, 'foot' => $foot, 'cw' => $cw, 'cx' => $cx, 'ref' => $r];
        }
        $A = $info['A'];
        $alts = array_values(array_filter(array_keys($info), static fn ($k) => $k !== 'A'));
        $used = [];
        $plan = [];
        foreach ([...$A['head'], ...$A['hero']] as $i) { $plan[] = ['A', $i, $i]; }
        $k = 0; $cnt = array_fill_keys($alts, 0);
        foreach ($A['body'] as $i) {
            $fam = self::rowFamily($A['rows'][$i]);
            $keepA = !$alts || $k % 3 === 2; // 세 줄에 한 줄은 A 를 남긴다
            $k++;
            $pick = null;
            if (!$keepA && $fam !== 'unknown') {
                $order = $alts; usort($order, static fn ($x, $y) => $cnt[$x] <=> $cnt[$y] ?: strcmp($x, $y)); // 덜 쓴 출처 먼저
                foreach ($order as $L) {
                    if (!isset($info[$L])) { continue; }
                    $hA = $A['rows'][$i]['h']; $best = null; $bd = PHP_INT_MAX;
                    foreach ($info[$L]['body'] as $j) {
                        if (isset($used[$L . $j]) || self::rowFamily($info[$L]['rows'][$j]) !== $fam) { continue; }
                        $d = abs($info[$L]['rows'][$j]['h'] - $hA);
                        if ($d < $bd) { $bd = $d; $best = $j; }
                    }
                    // 높이가 35% 넘게 다르면 바꾸지 않는다(60px 띠가 400px 줄 자리에 들어가 화면이 주저앉았다)
                    if ($best !== null && $bd <= 0.35 * $hA) { $pick = [$L, $best, $i]; $cnt[$L]++; break; }
                }
            }
            if ($pick !== null) { $used[$pick[0] . $pick[1]] = true; $plan[] = $pick; } else { $plan[] = ['A', $i, $i]; }
        }
        // 2차: 같은 역할 줄이 없어 A 가 본문의 60% 를 넘으면, 역할이 달라도 높이가 비슷한 다른 출처의 줄로 더 바꾼다(큰 줄부터).
        $aShare = static function (array $plan) use ($info, $A): float {
            $a = 0; $t = 0;
            foreach ($plan as $pi => [$L, $i]) { if ($pi < count($A['head']) + count($A['hero'])) { continue; } $h = $info[$L]['rows'][$i]['h']; $t += $h; if ($L === 'A') { $a += $h; } }
            return $t > 0 ? $a / $t : 1.0;
        };
        if ($alts && $aShare($plan) > 0.6) {
            $from = count($A['head']) + count($A['hero']);
            $slots = array_keys(array_filter($plan, static fn ($p, $pi) => $pi >= $from && $p[0] === 'A', ARRAY_FILTER_USE_BOTH));
            usort($slots, static fn ($x, $y) => $A['rows'][$plan[$y][1]]['h'] <=> $A['rows'][$plan[$x][1]]['h']);
            foreach ($slots as $pi) {
                if ($aShare($plan) <= 0.6) { break; }
                $hA = $A['rows'][$plan[$pi][1]]['h'];
                $order = $alts; usort($order, static fn ($x, $y) => $cnt[$x] <=> $cnt[$y] ?: strcmp($x, $y));
                foreach ($order as $L) {
                    $best = null; $bd = PHP_INT_MAX;
                    foreach ($info[$L]['body'] as $j) {
                        if (isset($used[$L . $j]) || self::rowFamily($info[$L]['rows'][$j]) === 'unknown') { continue; }
                        $d = abs($info[$L]['rows'][$j]['h'] - $hA);
                        if ($d < $bd) { $bd = $d; $best = $j; }
                    }
                    if ($best !== null && $bd <= 0.5 * $hA) { $used[$L . $best] = true; $cnt[$L]++; $plan[$pi] = [$L, $best, $plan[$pi][2]]; break; }
                }
            }
        }
        foreach ($A['foot'] as $i) { $plan[] = ['A', $i, $i]; }

        // 좌표 다시 계산
        $secs = []; $pieces = []; $cursor = 0; $no = 0; $shareH = []; $bodyH = 0;
        $headN = count($A['head']) + count($A['hero']);
        // 칸 사이 간격 기준 = A 의 첫 화면·본문에서 좌우로 나란한 칸 사이 간격의 가운데값(16~60)
        $gs = [];
        foreach ([...$A['hero'], ...$A['body']] as $i) {
            $cols = self::colGroups(array_map(static fn ($c) => ['x' => $c['x'], 'w' => $c['w']], $A['rows'][$i]['cells']));
            for ($q = 1; $q < count($cols); $q++) { $g = $cols[$q][0] - $cols[$q - 1][1]; if ($g >= 8 && $g <= 120) { $gs[] = $g; } }
        }
        sort($gs);
        // 칸 사이는 16~32px(2026-10-03 사용자 지적: 60px 로 벌어진 칸은 한 묶음으로 안 보인다 — 칸 안 카드 간격은 20px 인데 칸 사이만 60px 이었다)
        $colGap = $gs ? max(16, min(32, (int) $gs[intdiv(count($gs), 2)])) : 24;
        // 줄 사이 세로 간격의 대표값(2026-10-02 사용자 지적: 아래 콘텐츠와의 간격이 일정하지 않고 아예 없는 것도 있다): A 본문 간격의 가운데값.
        // 2026-10-04부터 이 값으로 쌓지 않는다(줄별 실측 간격대로 쌓음) — frame.row_gap 은 새 요소의 기본 간격·판정 참고용으로만 둔다.
        $pads = static function (array $src, array $row): array {
            $byNo = []; foreach ($src['ref']['secs'] as $s0) { $byNo[$s0['no']] = $s0; }
            $top = PHP_INT_MAX; $bot = 0;
            foreach ($row['cells'] as $c) {
                $s0 = $byNo[$c['no']] ?? null; if ($s0 === null) { continue; }
                $t = $s0['y']; $b = $s0['y'] + $s0['h']; $it0 = PHP_INT_MAX; $ib = 0;
                foreach ((array) ($s0['structure']['inner'] ?? []) as $it) {
                    if (!is_array($it) || !isset($it[2], $it[4]) || ($it[3] ?? 0) >= 0.95 * 1920) { continue; }
                    $it0 = min($it0, (int) $it[2]); $ib = max($ib, (int) $it[2] + (int) $it[4]);
                }
                if ($ib > 0) { $t = $s0['y'] + max(0, min($s0['h'], $it0)); $b = $s0['y'] + max(0, min($s0['h'], $ib)); }
                $top = min($top, $t); $bot = max($bot, $b);
            }
            if ($bot === 0) { return [0, 0]; }
            return [max(0, $top - $row['y']), max(0, $row['y'] + $row['h'] - $bot)];
        };
        $vg = []; $pb = null;
        foreach ($A['body'] as $bi) {
            [$pt, $pbt] = $pads($A, $A['rows'][$bi]);
            if ($pb !== null) { $g0 = (int) ($A['rows'][$bi]['gap_above'] ?? 0) + $pb + $pt; if ($g0 >= 24 && $g0 <= 200) { $vg[] = $g0; } }
            $pb = $pbt;
        }
        sort($vg);
        $rowGap = $vg ? max(48, min(100, $vg[intdiv(count($vg), 2)])) : 72;
        $prevFull = false; $boxGaps = [];
        foreach ($plan as $pi => [$L, $i, $ai]) {
            $src = $info[$L]; $row = $src['rows'][$i];
            // 줄 사이 간격은 그 줄 자체의 실측 간격대로 쌓는다(간격 리듬은 각 출처 것으로)
            $gap = $pi === 0 ? $row['y'] : min(140, max(0, (int) $A['rows'][$ai]['gap_above']));
            $isBody = $pi >= count($A['head']) && $pi < count($plan) - count($A['foot']);
            $curFull = !empty($row['full_bleed']);
            // 본문 줄도 출처 줄 자체의 실측 간격대로 (2026-10-04: 전부 row_gap 한 값으로 통일했더니
            // 레퍼런스(줄마다 16~60px 제각각)보다 높이가 +9~10% 부풀어 구조적 치명이 됐다 — 20건 중 다수).
            // row_gap/box_gap(--hb-row)은 묶음 안 카드 등 새 요소의 기본값으로만 쓰고 줄 사이에는 쓰지 않는다.
            if ($isBody && $pi > count($A['head'])) {
                if ($prevFull && $curFull) { $gap = 0; }
                else { $gap = max(0, min(140, (int) $row['gap_above'])); $boxGaps[] = $gap; }
            }
            $prevFull = $curFull;
            $ny = $cursor + $gap; $dy = $ny - $row['y'];
            $full = !empty($row['full_bleed']);
            $kx = $full ? 1.0 : $A['cw'] / max(1, $src['cw']);
            $tx = $full ? 0 : $A['cx'] - (int) round($src['cx'] * $kx);
            $byNo = [];
            foreach ($src['ref']['secs'] as $s) { $byNo[$s['no']] = $s; }
            $from = count($secs);
            foreach ($row['cells'] as $c) {
                $s = $byNo[$c['no']] ?? null; if ($s === null) { continue; }
                $no++;
                $nx = $full ? $s['x'] : (int) round($s['x'] * $kx) + $tx;
                $nw = $full ? $s['w'] : (int) round($s['w'] * $kx);
                $st = $s['structure'];
                if (!$full && abs($kx - 1.0) > 0.005) { $st = self::scaleInner($st, $kx, 0, 0); }
                $secs[] = ['no' => $no, 'type' => $s['type'], 'x' => max(0, $nx), 'y' => $s['y'] + $dy, 'w' => min($vw, $nw), 'h' => $s['h'],
                    'src' => $L, 'src_y' => $s['y'], 'structure' => $st];
            }
            // 가로 맞춤(2026-10-02 사용자 지적 "가로 컨테이너 넓이가 일정하지 않다·칸 간격이 줄마다 다르다"):
            // 머리·바닥을 뺀 모든 줄의 내용을 A 본문 폭(cx~cx+cw)에 넣고, 좌우 칸 사이 간격은 한 값(colGap)으로 다시 놓는다.
            $inBody = $pi >= count($A['head']) && $pi < count($plan) - count($A['foot']);
            if ($inBody) { self::fitRow($secs, $from, $vw, (int) $A['cx'], (int) $A['cw'], $colGap); }
            $last = end($pieces);
            if ($last && $last['src'] === $L && $last['_row'] === $i - 1) {
                $pieces[key($pieces)]['src_h'] = $row['y'] + $row['h'] - $last['src_y'];
                $pieces[key($pieces)]['h'] = $ny + $row['h'] - $last['y'];
                $pieces[key($pieces)]['_row'] = $i;
            } else {
                $pieces[] = ['src' => $L, 'screen_id' => (int) $src['ref']['sc']['id'], 'src_y' => $row['y'], 'src_h' => $row['h'], 'y' => $ny, 'h' => $row['h'], '_row' => $i];
            }
            if ($pi >= $headN && $pi < count($plan) - count($A['foot'])) { $shareH[$L] = ($shareH[$L] ?? 0) + $row['h']; $bodyH += $row['h']; }
            $cursor = $ny + $row['h'];
        }
        $pieces = array_map(static function ($p) { unset($p['_row']); return $p; }, $pieces);
        $share = [];
        foreach ($shareH as $L => $h) { $share[$L] = (int) round($h * 100 / max(1, $bodyH)); }
        $sources = [];
        foreach ($info as $L => $s) { $sources[] = ['label' => $L, 'screen_id' => (int) $s['ref']['sc']['id'], 'site_slug' => $s['ref']['sc']['slug'], 'rows_used' => count(array_filter($plan, static fn ($p) => $p[0] === $L))]; }
        $refId = 'mix1:' . $cursor . ':' . implode('_', array_map(static fn ($p) => $p['screen_id'] . '-' . max(0, (int) $p['src_y']) . '-' . $p['src_h'] . '-' . max(0, (int) $p['y']), $pieces));
        // 한 가지 체계의 기준값(A 본문에서 실측): 섹션 제목 크기·굵기, 카드 둥글기 — B·C 줄에도 이 값을 쓴다
        // A 에 큰 제목이 없으면(부처 유형은 섹션 제목이 20px 안팎) 기준을 낮추고, 그래도 없으면 B·C 줄에서, 끝으로 기본값.
        $measure = static function (array $secs, ?string $only, int $minPx, int $minW): array {
            $hs = []; $ws = []; $rs = [];
            foreach ($secs as $s) {
                if (($only !== null && ($s['src'] ?? '') !== $only) || in_array($s['type'], ['header', 'masthead', 'gnb', 'footer'], true)) { continue; }
                foreach ((array) ($s['structure']['inner'] ?? []) as $it) {
                    if (!is_array($it)) { continue; }
                    if (($it[0] ?? '') === 't' && ($it[5] ?? 0) >= $minPx && ($it[5] ?? 0) <= 56 && ($it[6] ?? 0) >= $minW) { $k = (int) $it[5]; $hs[$k] = ($hs[$k] ?? 0) + 1; $ws[$k] = (int) $it[6]; }
                    if (in_array($it[0] ?? '', ['b', 'i'], true) && ($it[8] ?? 0) >= 4 && ($it[8] ?? 0) <= 40 && ($it[3] ?? 0) >= 200) { $k = (int) $it[8]; $rs[$k] = ($rs[$k] ?? 0) + 1; }
                }
            }
            arsort($hs); arsort($rs);
            return [$hs, $ws, $rs];
        };
        $hsrc = 'A_measured';
        [$hs, $ws, $rs] = $measure($secs, 'A', 26, 600);
        if (!$hs) { [$hs, $ws] = $measure($secs, 'A', 20, 600); $hsrc = 'A_relaxed'; }
        if (!$hs) { [$hs, $ws] = $measure($secs, null, 20, 600); $hsrc = 'mix_measured'; }
        if (!$rs) { [, , $rs] = $measure($secs, null, 99, 999); }
        $style = ['heading_px' => $hs ? min(40, (int) array_key_first($hs)) : 28, 'heading_weight' => $hs ? $ws[array_key_first($hs)] : 700,
            'card_radius_px' => $rs ? (int) array_key_first($rs) : 12, 'source' => $hs ? $hsrc : 'default'];
        // 변주(2026-10-02 사용자: 따라한 걸 나눠서 따라한 느낌 — 약간의 디자인적 변화·센스가 있어야): 구역마다 뼈대(칸 수·크기)는 두고 표현 한 가지를 바꾸게 지시한다
        $pool = [
            'news' => ['탭을 밑줄형 대신 알약(둥근 면) 탭으로, 선택 탭만 주색 면', '목록 첫 글을 큰 카드(제목+요약 두 줄)로 올리고 나머지를 줄 목록으로', '날짜를 오른쪽 끝 대신 제목 위 작은 글자로 올리고 줄 사이 구분선을 뺀다', '제목을 왼쪽 세로 띠(주색 4px)와 함께 두고 더보기는 글자 대신 둥근 아이콘 단추로'],
            'quick' => ['아이콘을 선 아이콘 대신 연한 주색 원 면 위 아이콘으로', '칸을 테두리 상자 대신 테두리 없는 연한 면 카드로, 올리면 주색 테두리', '아이콘과 글의 배치 방향을 바꾼다(레퍼런스가 세로면 가로로, 가로면 세로로)', '칸마다 오른쪽 위에 작은 화살표 아이콘을 두고 글은 왼쪽 아래 정렬'],
            'popup' => ['쪽 번호·이전·정지·다음 단추를 사진 위가 아니라 카드 아래 줄에 둔다', '쪽 번호 대신 점(현재는 긴 알약) 표시로, 단추는 사진 양옆 가운데', '세로 이름표 띠 대신 사진 왼쪽 위에 작은 이름표 알약'],
            'visual' => ['글 상자를 사진 위 왼쪽 아래 반투명 면 카드로 모은다', '사진 오른쪽 아래를 주색 사선 면으로 덮고 그 위에 쪽 번호·단추', '사진 모서리를 한쪽 대각선만 크게 둥글린다(왼쪽 위·오른쪽 아래)'],
            'greeting' => ['인물과 글의 좌우를 바꾼다', '배경을 단색 면 대신 옅은 회색에서 흰색으로 가는 그라데이션으로, 서명은 글 바로 아래', '단추 두 개를 면 띠 대신 떨어진 알약 단추로'],
            'banner' => ['배너를 붙이지 않고 col_gap 간격의 둥근 카드로', '제어 단추를 왼쪽 끝 세로 묶음으로'],
            'card' => ['사진 비율을 4:3 대신 1:1 로(또는 반대로) 바꾸고 글은 사진 아래 왼쪽 정렬', '첫 카드만 두 칸 폭으로 키우고 나머지는 한 칸', '카드 테두리 대신 그림자 없는 연한 면 + 올리면 위로 4px'],
            'etc' => ['제목 옆에 짧은 한 줄 설명을 붙이고 더보기는 오른쪽 끝 아이콘 단추로', '구역 배경을 흰색 대신 옅은 회색 면(본문 폭, 둥글기 style.card_radius_px)으로'],
        ];
        $famOf = static function (string $t): string { foreach (['news' => 'news|notice|board|ticker', 'quick' => 'quick|link|service|shortcut', 'popup' => 'popup|alert', 'visual' => 'visual|hero', 'greeting' => 'greeting|leader|mayor', 'banner' => 'banner', 'card' => 'photo|gallery|sns|card|video|event'] as $k => $re) { if (preg_match('/' . $re . '/', $t)) { return $k; } } return 'etc'; };
        $vary = []; $usedTw = [];
        foreach ($secs as $s) {
            if (in_array($s['type'], ['header', 'masthead', 'gnb', 'footer', 'unknown'], true) || $s['h'] < 120) { continue; }
            $fam = $famOf((string) $s['type']); $opts = $pool[$fam];
            $k = abs(crc32($refId . '|' . $s['no'])) % count($opts);
            for ($t = 0; $t < count($opts) && isset($usedTw[$fam . $k]); $t++) { $k = ($k + 1) % count($opts); }
            $usedTw[$fam . $k] = true;
            $vary[] = ['section_no' => $s['no'], 'type' => $s['type'], 'y' => $s['y'], 'change' => $opts[$k]];
        }
        // 상자 사이 margin(box_gap): 이제 줄별 실측 간격의 가운데값이다(새 카드 등 새 요소의 기본 간격용).
        // height 는 실측 간격으로 쌓은 결과다 — 2026-10-04부터 줄 사이를 row_gap 한 값으로 통일하지 않는다.
        sort($boxGaps);
        $boxGap = $boxGaps ? (int) $boxGaps[intdiv(count($boxGaps), 2)] : $rowGap;
        return ['frame' => ['x' => (int) $A['cx'], 'w' => (int) $A['cw'], 'col_gap' => $colGap, 'row_gap' => $rowGap, 'box_gap' => $boxGap], 'variation' => $vary, 'style' => $style,
            'secs' => $secs, 'pieces' => $pieces, 'sources' => $sources, 'share' => $share, 'height' => $cursor, 'ref_id' => $refId, 'replaced' => count(array_filter($plan, static fn ($p) => $p[0] !== 'A')), 'head_rows' => $headN];
    }

    /** 주색 고르기 — 고객 색이 없을 때 레퍼런스들의 주색과 색상이 45도 이상 떨어진 색(관공서에 어울리는 후보 중). */
    public static function pickPrimary(array $refHexes, string $seed): string
    {
        $cands = ['#1F5FBF', '#0E7C66', '#5B45B0', '#B4471A', '#0F6F8A', '#9F1239', '#24408E', '#4D7C0F', '#7A3E9D', '#0B6E4F'];
        $hue = static function (string $hex): ?float {
            if (!preg_match('/^#?([0-9A-Fa-f]{6})$/', $hex, $m)) { return null; }
            [$r, $g, $b] = array_map(static fn ($h) => hexdec($h) / 255, str_split($m[1], 2));
            $mx = max($r, $g, $b); $mn = min($r, $g, $b); $d = $mx - $mn;
            if ($d < 0.08) { return null; }
            $h = $mx === $r ? fmod(($g - $b) / $d, 6) : ($mx === $g ? ($b - $r) / $d + 2 : ($r - $g) / $d + 4);
            $h *= 60; return $h < 0 ? $h + 360 : $h;
        };
        $refH = array_values(array_filter(array_map($hue, $refHexes), static fn ($h) => $h !== null));
        $ok = [];
        foreach ($cands as $c) {
            $hc = $hue($c); $min = 360.0;
            foreach ($refH as $h) { $dd = abs($hc - $h); $min = min($min, min($dd, 360 - $dd)); }
            if ($min >= 45) { $ok[] = $c; }
        }
        $pool = $ok ?: $cands;
        return $pool[abs(crc32($seed)) % count($pool)];
    }

    /**
     * 섞기 판정 기준 — ref_id(mix1:총높이:조각들)로 조각마다 레퍼런스 섹션을 잘라 시안 좌표로 옮기고, 누출 검사 문자열은 출처 전부를 합친다.
     * @return array<string, mixed>|null
     */
    public static function checkRefMix(string $refId): ?array
    {
        // 조각 좌표가 음수인 옛 ref_id(예: 11345--35-662--35)도 읽는다 — 머리 위 섹션이 y<0 이던 때 만든 묶음.
        if (!preg_match('/^mix1:(\d+):((?:\d+--?\d+--?\d+--?\d+_?)+)$/', $refId, $m)) { return null; }
        $H = (int) $m[1];
        $pieces = [];
        foreach (explode('_', trim($m[2], '_')) as $p) {
            if (!preg_match('/^(\d+)-(-?\d+)-(-?\d+)-(-?\d+)$/', $p, $q)) { return null; }
            $pieces[] = ['screen_id' => (int) $q[1], 'src_y' => max(0, (int) $q[2]), 'src_h' => (int) $q[3], 'y' => max(0, (int) $q[4])];
        }
        if (!$pieces || count($pieces) > 40) { return null; }
        $secs = []; $leak = []; $caps = []; $vw = 1920; $no = 0; $refs = [];
        foreach ($pieces as $pc) {
            $one = $refs[$pc['screen_id']] ??= self::checkRef($pc['screen_id']);
            if ($one === null) { return null; }
            $vw = (int) $one['width'];
            foreach ($one['leak'] as $l) { $leak[] = $l; }
            $caps[] = ['capture_url' => $one['capture_url'], 'src_y' => $pc['src_y'], 'src_h' => $pc['src_h'], 'y' => $pc['y'], 'width' => $vw];
            foreach (Db::rows('SELECT section_type_id AS type, bbox_x AS x, bbox_y AS y, bbox_w AS w, bbox_h AS h, structure FROM sections WHERE screen_id = ? AND bbox_y >= ? AND bbox_y < ? ORDER BY bbox_y, bbox_x', [$pc['screen_id'], $pc['src_y'] - 4, $pc['src_y'] + $pc['src_h'] - 4]) as $r) {
                $st = is_string($r['structure'] ?? null) ? (json_decode((string) $r['structure'], true) ?: []) : (array) ($r['structure'] ?? []);
                $h = self::saneH((string) $r['type'], (int) $r['h'], $st);
                $secs[] = ['no' => ++$no, 'type' => (string) $r['type'], 'x' => (int) $r['x'], 'y' => (int) $r['y'] - $pc['src_y'] + $pc['y'], 'w' => (int) $r['w'], 'h' => $h];
            }
        }
        $contentBot = 0;
        foreach ($secs as $s) { $contentBot = max($contentBot, $s['y'] + $s['h']); }
        // 옛 ref_id(부푼 높이 10084 등)로 판정해도 내용 끝을 넘지 않게 보정
        $height = ($contentBot > 0 && $H - $contentBot > 500) ? $contentBot : $H;
        return [
            'screen_id' => $pieces[0]['screen_id'], 'ref_id' => $refId, 'site_slug' => 'mix', 'page_type' => 'main',
            'width' => $vw, 'height' => $height, 'sub' => null, 'rows' => self::rows($secs, $vw),
            'capture_url' => null, 'pieces' => $caps, 'sources' => count($refs),
            'leak' => array_values(array_unique($leak)),
        ];
    }

    /**
     * 좌우 2단 구조 — 왼쪽 단과 오른쪽 단이 같은 세로 구간을 따로 흐르는 경우(rows 로는 표현이 안 된다).
     * @return array<string, mixed>|null
     */
    private static function columns(array $secs, int $vw): ?array
    {
        $body = array_values(array_filter($secs, static fn ($s) => $s['h'] > 40 && $s['w'] > 60 && $s['w'] < $vw * 0.8));
        $best = null;
        foreach ($body as $c) {
            $g = $c['x'];
            $L = array_values(array_filter($body, static fn ($s) => $s['x'] + $s['w'] <= $g + 12));
            $R = array_values(array_filter($body, static fn ($s) => $s['x'] >= $g - 12));
            if (count($L) < 3 || count($R) < 3) { continue; }
            $ly1 = min(array_column($L, 'y')); $ly2 = max(array_map(static fn ($s) => $s['y'] + $s['h'], $L));
            $ry1 = min(array_column($R, 'y')); $ry2 = max(array_map(static fn ($s) => $s['y'] + $s['h'], $R));
            $y1 = max($ly1, $ry1); $y2 = min($ly2, $ry2);
            if ($y2 - $y1 < 800) { continue; }
            // 오른쪽 단이 여러 줄로 쌓여 있어야 단이다(한 줄짜리 칸 나눔은 rows 가 표현한다)
            $stackR = count(array_unique(array_map(static fn ($s) => (int) round($s['y'] / 40), $R)));
            $stackL = count(array_unique(array_map(static fn ($s) => (int) round($s['y'] / 40), $L)));
            if ($stackR < 3 || $stackL < 3) { continue; }
            $lw = max(array_map(static fn ($s) => $s['x'] + $s['w'], $L)) - min(array_column($L, 'x'));
            $rw = max(array_map(static fn ($s) => $s['x'] + $s['w'], $R)) - $g;
            if ($lw < 200 || $rw < 200 || abs($lw - $rw) < 60) { continue; }
            $score = ($y2 - $y1) * min($stackL, $stackR);
            if ($best === null || $score > $best['score']) {
                $pick = static fn (array $set) => array_values(array_map(static fn ($s) => $s['no'], array_filter($set, static fn ($s) => $s['y'] + $s['h'] > $y1 && $s['y'] < $y2)));
                $best = ['score' => $score, 'y_from' => $y1, 'y_to' => $y2,
                    'left' => ['x' => min(array_column($L, 'x')), 'w' => $lw, 'sections' => $pick($L)],
                    'right' => ['x' => $g, 'w' => $rw, 'sections' => $pick($R)],
                    'note' => '이 세로 구간은 왼쪽 단과 오른쪽 단이 따로 흐른다. rows 는 좌우를 섞어 묶었으니 이 구간은 columns 와 참고 이미지를 따른다.'];
            }
        }
        if ($best !== null) { unset($best['score']); }
        return $best;
    }

    /** 주색과 어울리는 밝은 보조색 1개(색상을 조금 돌리고 밝게). */
    private static function secondary(string $hex): ?string
    {
        if (!preg_match('/^#([0-9A-Fa-f]{6})$/', $hex, $m)) { return null; }
        [$r, $g, $b] = array_map(static fn ($h) => hexdec($h) / 255, str_split($m[1], 2));
        $mx = max($r, $g, $b); $mn = min($r, $g, $b); $d = $mx - $mn; $h = 0.0;
        if ($d > 0) {
            if ($mx === $r) { $h = fmod(($g - $b) / $d, 6); } elseif ($mx === $g) { $h = ($b - $r) / $d + 2; } else { $h = ($r - $g) / $d + 4; }
            $h *= 60; if ($h < 0) { $h += 360; }
        }
        $h = fmod($h - 25 + 360, 360); $sat = 0.62; $l = 0.48;
        $c = (1 - abs(2 * $l - 1)) * $sat; $x = $c * (1 - abs(fmod($h / 60, 2) - 1)); $mm = $l - $c / 2;
        [$r2, $g2, $b2] = match ((int) floor($h / 60)) { 0 => [$c, $x, 0], 1 => [$x, $c, 0], 2 => [0, $c, $x], 3 => [0, $x, $c], 4 => [$x, 0, $c], default => [$c, 0, $x] };
        return sprintf('#%02X%02X%02X', (int) round(($r2 + $mm) * 255), (int) round(($g2 + $mm) * 255), (int) round(($b2 + $mm) * 255));
    }

    /** 샘플 이미지 전체(짧은 형식). 글자가 든 이미지 중 다른 가상 기관 이름이 찍힌 것은 뺀다. */
    private static function samples(string $org, bool $client = false): array
    {
        // 종류마다 앞에서 몇 장만 싣는다 — 전부 실으면 1,900여 장(510KB)이라 묶음이 600KB 가 됐다(2026-10-10 MCP 시험).
        // 더 필요하면 mock_get_sample_images(kind) 로 그 종류만 더 받는다. 아이콘은 한 style 로 한 줄을 채워야 해서 조금 더 싣는다.
        $out = [];
        $byKind = [];
        $total = [];
        $urlBase = KitPage::abs('/api/v1/assets/samples/');
        $first = (string) (Samples::all()[array_key_first(Samples::all()) ?? 0]['file'] ?? '');
        if (preg_match('#^(https?://[^/]+/api/v1/assets/samples/)#', $first, $m0)) { $urlBase = $m0[1]; }
        $list = Samples::all();
        $pos = array_flip(array_keys($list));
        uksort($list, static fn($a, $b) => [Samples::prefer($list[$a], $org), $pos[$a]] <=> [Samples::prefer($list[$b], $org), $pos[$b]]);
        foreach ($list as $it) {
            if (!Samples::suits($it, $org)) { continue; }
            if (!empty($it['has_text'])) { $o = Samples::orgOf($it); if ($o !== null && ($client || $o !== $org)) { continue; } } // 고객 기관명이면 가상 기관명이 박힌 그래픽은 전부 뺀다
            $u = Samples::url((string) $it['file']);
            if (str_starts_with($u, '/')) { $u = KitPage::abs($u); }
            // 한 줄 = [url 열쇠, 가로, 세로, 설명, 태그, 표시] — 키 이름·kind·ratio 를 줄마다 되풀이하지 않는다(묶음 215KB → 100KB 아래, 2026-10-12).
            // url 은 url_template 의 {key} 자리에 열쇠를 넣으면 된다. 틀과 다른 주소는 열쇠 자리에 주소 전체를 둔다.
            $key = preg_match('#^' . preg_quote($urlBase, '#') . '([A-Za-z0-9_-]+)/original$#', $u, $mm) ? $mm[1] : $u;
            $isIcon = Samples::styleOf($it) !== null;
            $tags = $isIcon ? [] : array_values(array_filter((array) ($it['tags'] ?? []), static fn ($t) => !str_starts_with((string) $t, '대상:')));
            $flags = [];
            if (!empty($it['has_text'])) { $flags[] = 'text'; }
            if (($st = Samples::styleOf($it)) !== null) { $flags[] = 'style=' . $st; }
            if (is_array($it['text_safe'] ?? null) && ($it['text_safe']['side'] ?? null)) { $flags[] = 'side=' . $it['text_safe']['side']; }
            $row = [$key, (int) $it['w'], (int) $it['h'], (string) $it['alt'], implode('·', array_slice($tags, 0, 4)), implode(' ', $flags)];
            $k = (string) $it['kind'];
            $total[$k] = ($total[$k] ?? 0) + 1;
            if (($st ?? null) === $k) { $row[5] = trim(str_replace('style=' . $k, '', $row[5])); } // 스타일 = 종류 이름이면 되풀이하지 않는다
            // 아이콘 한 줄은 12칸이면 찬다 — 더는 more 로. powerAssets 세트에서 온 아이콘 종류(2026-10-14, 28종)는 맛보기 4장만(묶음 크기)
            $cap = in_array($k, Samples::ICON_KINDS, true) ? 12 : (str_starts_with($k, 'icon') ? 4 : 10);
            if (($byKind[$k] ?? 0) >= $cap) { continue; }
            $byKind[$k] = ($byKind[$k] ?? 0) + 1;
            $out[$k][] = $row;
        }
        // 한 종류 설명이 모두 같은 말로 끝나면(예: "… 유리 질감 입체 아이콘") 그 꼬리는 suffix 에 한 번만 둔다.
        $suffix = [];
        foreach ($out as $k => $rows) {
            if (count($rows) < 3) { continue; }
            $alts = array_column($rows, 3);
            $tail = (string) $alts[0];
            foreach ($alts as $a) {
                while ($tail !== '' && !str_ends_with((string) $a, $tail)) { $tail = mb_substr($tail, 1); }
            }
            $sp = mb_strpos($tail, ' ');
            $tail = $sp === false ? '' : mb_substr($tail, $sp); // 낱말 중간에서 자르지 않는다
            if (mb_strlen(trim($tail)) < 4) { continue; }
            $suffix[$k] = trim($tail);
            foreach ($out[$k] as $i => $r) { $out[$k][$i][3] = rtrim(mb_substr((string) $r[3], 0, mb_strlen((string) $r[3]) - mb_strlen($tail))); }
        }
        $more = array_filter($total, static fn($n, $k) => $n > ($byKind[$k] ?? 0), ARRAY_FILTER_USE_BOTH);
        return ['count' => array_sum($byKind), 'available' => $total,
            'url_template' => $urlBase . '{key}/original',
            'columns' => ['key', 'w', 'h', 'alt', 'tags', 'flags'],
            'alt_suffix' => $suffix ?: null,
            'format' => 'items 는 종류(kind)별 표다. 한 줄 = [key, 가로px, 세로px, 설명, 태그(·로 구분), 표시]. 이미지 주소 = url_template 의 {key} 를 key 로 바꾼 것(key 가 http 로 시작하면 그 자체가 주소). 비율 = 가로÷세로. 표시: text = 글자가 든 그래픽, style=… = 아이콘 스타일(icon-* 종류는 종류 이름이 곧 스타일), side=left|right = 글자를 얹을 쪽. alt_suffix 에 종류가 있으면 그 종류 설명 뒤에 그 말을 붙여 읽는다.',
            'more' => $more ? '종류마다 ' . '일부만 실었습니다. 더 필요한 종류는 mock_get_sample_images(kind="종류") 로 받으세요: ' . implode(', ', array_map(static fn($k, $n) => $k . ' ' . $n . '장', array_keys($more), $more)) : null,
            'strip_banner' => '띠 배너(strip-banner 등 가로가 세로의 3배 넘는 글자 그래픽)는 비율이 3.2~10 으로 제각각이다. 상자 높이를 고정하지 말고 width:100% + aspect-ratio:(그 이미지의 가로/세로) 로 이미지 비율 그대로의 상자를 만든다. 정해진 높이의 칸에 넣어야 하면 object-fit:contain 과 이미지 가장자리 색 바탕을 쓴다 — cover 로 잘라 글자가 잘리면 안 된다.',
            'rule' => '이미지는 이 목록의 주소만 쓴다. 자리의 가로세로 비율과 가까운 것을 고르고 object-fit:cover 로 채운다. 한 페이지에서 같은 이미지를 두 번 쓰지 않는다. 아이콘은 style 이 같은 것만 쓴다 — 한 시안(메인·서브 전부)에서 아이콘 style 은 하나로 정하고 섞지 않는다(유리 입체·평면·아이소·선형을 한 줄에 섞으면 다른 사이트 조각처럼 보인다). 글자가 든 이미지(표시 text: 배너·팝업·카드뉴스)는 자리 비율과 4% 이내로 맞는 것을 골라 cover 로 넣거나, contain 으로 넣되 상자와 이미지의 가로세로 비율 차이가 10% 이내가 되게 한다(검사는 15% 를 넘으면 실패, cover 는 4% 를 넘으면 실패). 비율(가로÷세로)과 태그로 자리에 맞는 것을 고른다. 서명(signature)은 alt 의 이름이 persona 기관장 이름과 같을 때만 쓴다. 로고(emblem) 샘플은 안에 다른 가상 기관명이 들어 있을 수 있으니 persona 기관명과 다르면 쓰지 말고 아이콘+글자로 로고를 만든다.', 'items' => $out];
    }

    /** 섹션의 structure 안에서 false·null·빈 배열·빈 글을 뺀다(숫자 0 은 값이라 남긴다). 좌표 같은 섹션 바깥 키는 그대로. */
    private static function dropEmpty(array $s): array
    {
        if (!is_array($s['structure'] ?? null)) { return $s; }
        $walk = static function (array $a) use (&$walk): array {
            $o = [];
            foreach ($a as $k => $v) {
                if (is_array($v) && !array_is_list($v)) { $v = $walk($v); }
                if ($v === false || $v === null || $v === '' || $v === []) { continue; }
                $o[$k] = $v;
            }
            return $o;
        };
        $s['structure'] = $walk($s['structure']);
        return $s;
    }

    private static function icons(): array
    {
        $j = json_decode((string) @file_get_contents(dirname(__DIR__) . '/data/material-icons.json'), true);
        $map = [];
        // 이름 → path(d) 만 준다(머티리얼 원래 이름은 뺐다 — 묶음 크기, 2026-10-12).
        foreach ((array) ($j['icons'] ?? []) as $k => $v) { $map[$k] = $v['d']; }
        return [
            'rule' => 'items 는 이름 → path(d). 아이콘은 전부 구글 머티리얼 아이콘 인라인 SVG: <svg class="mi" viewBox="0 -960 960 960" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="…"/></svg>. 글자 기호(› ▶ + × → …)는 쓰지 않는다. 글과 아이콘은 inline-flex·align-items:center 로 세로 중심을 맞춘다.',
            'items' => $map,
            'brand_rule' => '소셜 채널 로고는 brand 의 path 로 만든다: <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="…"/></svg>. 소셜 채널 바로가기 표시에만 쓴다.',
            'brand' => (array) ((json_decode((string) @file_get_contents(dirname(__DIR__) . '/data/brand-icons.json'), true) ?: [])['icons'] ?? []),
        ];
    }

    /** 섹션 구성 정보에 가장 자주 나온 둥글기(0 제외). 없으면 사이트 측정값. */
    private static function radius(array $secs, mixed $fallback): ?int
    {
        $n = [];
        foreach ($secs as $s) {
            $r = (int) ($s['structure']['style']['radius_px'] ?? 0);
            if ($r > 0) { $n[$r] = ($n[$r] ?? 0) + 1; }
        }
        if ($n) { arsort($n); return (int) array_key_first($n); }
        return $fallback !== null && (int) $fallback > 0 ? (int) $fallback : null;
    }

    /** 기관장 호칭: 한빛시 + 시장 = 한빛시장, 새솔군 + 군수 = 새솔군수, 푸른구 + 구청장 = 푸른구청장, 부처는 띄어 쓴다. */
    private static function personaOut(array $p): array
    {
        $p = array_diff_key($p, ['real' => 1, 'virtual' => 1, 'client' => 1]);
        $org = (string) ($p['org'] ?? ''); $t = (string) ($p['title'] ?? '');
        if ($org !== '' && $t !== '') {
            $last = mb_substr($org, -1);
            $p['head'] = in_array($p['kind'] ?? '', ['local', 'gov', 'edu', 'council'], true) && mb_substr($t, 0, 1) === $last ? mb_substr($org, 0, -1) . $t : $org . ' ' . $t;
            $p['head_rule'] = '기관장 호칭은 head 를 그대로 쓴다(org 와 title 을 붙여 쓰면 한빛시시장처럼 겹친다). 인사말 서명 줄은 head 뒤에 이름.';
        }
        return $p;
    }

    private static function hasInner(array $secs): bool
    {
        foreach ($secs as $s) { if (!empty($s['structure']['inner'])) { return true; } }
        return false;
    }

    /**
     * 주 메뉴 트리 — 메인과 서브가 같은 메뉴를 쓰도록 가상 기관 종류별로 고정한다.
     * file 이 있는 항목은 서브 시안을 만들 때 그 page 로 받아 연결한다.
     */
    private static function menu(array $persona): array
    {
        $org = (string) ($persona['org'] ?? '');
        $gov = (string) ($persona['kind'] ?? 'local') !== 'local';
        $head = (string) (self::personaOut($persona)['head'] ?? ($persona['title'] ?? '기관장'));
        $corp = (string) ($persona['kind'] ?? '') === 'corp';
        $biz = preg_match('/^한국미래(.+)(공사|공단|진흥원)$/u', $org, $mm) ? $mm[1] : '주요';
        // 방송·미디어 기관은 공기업 일반형 대신 방송 메뉴(2026-10-03 시험: KTV 시안에 편성표·다시보기 메뉴가 없었다)
        $media = (bool) preg_match('/방송|미디어|TV|채널/u', $org . ' ' . (string) ($persona['real'] ?? ''));
        // 관공서 밖 종류(대학·학교·복지관·재단·협회·문화시설·기업·교육원)는 그 종류의 메뉴(2026-10-11)
        $kindTree = self::kindTree((string) ($persona['kind'] ?? ''), $org, $head);
        $tree = $kindTree ?? ($media ? [
            ['방송', ['편성표', '채널 안내', '라이브', '프로그램 목록', '시청 안내']],
            ['다시보기', ['전체 영상', '뉴스·브리핑', '다큐멘터리', '교양·문화', '쇼츠']],
            ['정책·뉴스', ['주요 정책', '정책 브리핑', '보도자료', '카드뉴스', '인포그래픽']],
            ['참여', ['시청자 의견', '자주 묻는 질문', '프로그램 제안', '설문 조사', '시청자 위원회']],
            ['알림·소식', ['공지사항', '채용 정보', '입찰 정보', '행사 일정', '사진·영상']],
            ['기관소개', [$head . ' 인사말', '기관 개요', '비전·목표', '연혁', '조직도', '찾아오시는 길']],
        ] : ($corp ? [
            ['주요사업', [$biz . ' 사업 소개', $biz . ' 사업 현황', '연구·기술', '지역 협력', '해외 사업']],
            ['ESG경영', ['윤리경영', '안전경영', '환경경영', '사회공헌', '인권경영']],
            ['고객·참여', ['고객 지원 안내', '자주 묻는 질문', '고객의 소리', '부패·공익신고', '설문 조사']],
            ['정보공개', ['정보공개 청구', '사전정보 공표', '공공데이터', '예산·재정', '업무추진비']],
            ['경영공시', ['경영 정보', '경영 평가', '감사 결과', '이사회 운영', '규정']],
            ['알림·소식', ['공지사항', '보도자료', '채용 정보', '입찰 정보', '사진·영상']],
            ['기관소개', [$head . ' 인사말', '기관 개요', '비전·목표', '연혁', '조직도', '찾아오시는 길']],
        ] : ($gov ? [
            ['정책·정보', ['주요 정책', '분야별 정보', '법령 정보', '통계', '연구 자료']],
            ['알림·소식', ['공지사항', '보도자료', '채용 정보', '행사 일정', '사진·영상']],
            ['민원·참여', ['민원 안내', '자주 묻는 질문', '국민 제안', '설문 조사', '신고 센터']],
            ['정보공개', ['정보공개 청구', '사전정보 공표', '공공데이터', '예산·재정', '업무추진비']],
            ['기관소개', [$head . ' 인사말', '비전·목표', '연혁', '조직도', '찾아오시는 길', '상징']],
        ] : [
            ['전자민원', ['민원 안내', '민원 신청', '민원 서식', '여권 민원', '자주 묻는 질문']],
            ['분야별정보', ['복지', '일자리·경제', '안전', '교육·청소년', '문화·관광']],
            ['참여·소통', ['제안하기', '설문 조사', '주민참여예산', '칭찬합니다', '신고 센터']],
            ['정보공개', ['정보공개 청구', '사전정보 공표', '공공데이터', '예산·재정', '업무추진비']],
            ['알림마당', ['공지사항', '보도자료', '고시·공고', '채용 정보', '행사 일정']],
            [$org . '소개', [$head . ' 인사말', '비전·목표', '연혁', '조직도', '찾아오시는 길', '상징']],
        ])));
        $page = ['공지사항' => 'board_list', '자주 묻는 질문' => 'faq', '조직도' => 'org_chart', '찾아오시는 길' => 'location', '연혁' => 'history', $head . ' 인사말' => 'greeting', '비전·목표' => 'vision',
            ($corp || $media ? '기관 개요' : ($gov ? '분야별 정보' : '민원 안내')) => 'content',
            '민원 신청' => 'form', '고객의 소리' => 'form', '국민 제안' => 'form', '시청자 의견' => 'form',
            '여권 민원' => 'procedure', '고객 지원 안내' => 'procedure', '민원 안내' => $gov ? 'procedure' : 'content', '시청 안내' => 'procedure',
            // 2026-10-05 6회차 시험(R6): 정보공개·상징·갤러리 서브를 만들었는데 트리에 page·file 이 없어 파일 이름을 지어냈다
            '정보공개 청구' => 'info_disclosure', '상징' => 'symbol', '사진·영상' => 'board_gallery',
            // 관공서 밖 종류(2026-10-11)
            'CEO 인사말' => 'greeting', '오시는 길' => 'location', '캠퍼스 안내' => 'location', '이용 안내' => 'procedure', '입학 안내' => 'procedure',
            '회원 가입 안내' => 'procedure', '수강 신청' => 'form', '프로그램 신청' => 'form', '후원 신청' => 'form', '문의하기' => 'form',
            '학과 소개' => 'content', '사업 안내' => 'content', '제품 소개' => 'content', '회사 개요' => 'content', '설립 목적' => 'vision', '미션·비전' => 'vision',
            '교육 목표' => 'vision', '비전·발전계획' => 'vision', '전시 안내' => 'board_gallery', '포토 갤러리' => 'board_gallery', '사진 이야기' => 'board_gallery',
            '가정통신문' => 'board_list', '학사 공지' => 'board_list', '새소식' => 'board_list', '협회 소식' => 'board_list', '재단 소식' => 'board_list',
            '복지관 소식' => 'board_list', '교육 소식' => 'board_list'];
        $out = [];
        foreach ($tree as [$name, $subs]) {
            $out[] = ['name' => $name, 'children' => array_map(static function ($s) use ($page) {
                if (!isset($page[$s])) { return ['name' => $s]; }
                $c = ['name' => $s, 'page' => $page[$s], 'file' => $page[$s] . '.html'];
                // 게시글 상세는 메뉴 항목이 아니라 목록에서 글을 누르면 열리는 화면 — 목록 항목에 붙여 둔다(2026-10-03 시험: 상세를 보도자료 메뉴에 직접 걸었다)
                if ($page[$s] === 'board_list') { $c['detail'] = ['page' => 'board_view', 'file' => 'board_view.html', 'how' => '목록 글 제목 링크로 연다. LNB·경로는 이 목록 항목을 그대로 쓴다.']; }
                return $c;
            }, $subs)];
        }
        return ['rule' => '주 메뉴·전체메뉴·LNB·경로는 이 트리를 쓴다(메인과 서브가 같아야 한다). 레퍼런스의 주 메뉴 개수와 다르면 개수는 레퍼런스에 맞춰 앞에서부터 쓰거나 비슷한 이름을 더한다. page 가 있는 항목은 그 page 로 서브 시안을 만들어 file 이름으로 링크한다. 메인은 main.html. 아직 만들지 않은 페이지는 없는 파일로 링크하지 말고 href="#" 로 둔다. 지금 만드는 서브 페이지가 트리에 없으면 가장 가까운 주 메뉴 아래에 그 이름을 더한다. 게시글 상세(board_view)는 메뉴 항목이 아니다 — 목록 항목의 detail 에 있고, 목록의 글 제목 링크로 열며 LNB·경로는 그 목록 항목을 쓴다.', 'items' => $out];
    }

    /** 관공서 밖 종류의 주 메뉴. 관공서 계열(local·gov·corp·edu·council)이면 null. */
    private static function kindTree(string $kind, string $org, string $head): ?array
    {
        return match ($kind) {
            'univ' => [
                ['대학소개', [$head . ' 인사말', '비전·발전계획', '연혁', '조직도', '캠퍼스 안내']],
                ['입학', ['입학 안내', '수시모집', '정시모집', '편입학', '대학원 입학']],
                ['대학·대학원', ['학과 소개', '교양교육', '대학원', '평생교육원', '부속기관']],
                ['연구·산학', ['연구 성과', '산학협력', '연구소', '기술 이전', '창업 지원']],
                ['대학생활', ['학사 안내', '장학', '기숙사', '동아리', '취업·진로']],
                ['알림', ['학사 공지', '공지사항', $org . ' 뉴스', '행사·세미나', '채용 정보']],
            ],
            'school' => [
                ['학교소개', [$head . ' 인사말', '교육 목표', '연혁', '교직원 안내', '오시는 길']],
                ['교육활동', ['교육과정', '방과후 학교', '진로·진학', '동아리', '학사 일정']],
                ['학교소식', ['가정통신문', '공지사항', '포토 갤러리', '급식 안내', '학교 행사']],
                ['학부모', ['학부모 상담', '학교운영위원회', '학부모회', '자주 묻는 질문', '문의하기']],
            ],
            'welfare' => [
                ['기관소개', [$head . ' 인사말', '미션·비전', '연혁', '조직도', '오시는 길']],
                ['사업안내', ['사업 안내', '어르신 복지', '아동·청소년', '가족 지원', '지역 조직화']],
                ['프로그램', ['프로그램 신청', '평생교육', '건강 증진', '문화 강좌', '일자리 지원']],
                ['후원·봉사', ['후원 신청', '자원봉사', '후원금 사용 내역', '나눔 이야기']],
                ['커뮤니티', ['복지관 소식', '공지사항', '사진 이야기', '자주 묻는 질문', '문의하기']],
            ],
            'foundation' => [
                ['재단소개', [$head . ' 인사말', '설립 목적', '연혁', '조직도', '오시는 길']],
                ['지원사업', ['사업 안내', '공모 안내', '선정 결과', '지원 사례', '정산 안내']],
                ['프로그램', ['교육', '행사', '네트워크', '연구·출판']],
                ['경영공시', ['경영 정보', '예산·결산', '이사회', '규정', '정보공개 청구']],
                ['알림', ['재단 소식', '공지사항', '채용 정보', '포토 갤러리', '문의하기']],
            ],
            'assoc' => [
                ['협회소개', [$head . ' 인사말', '설립 목적', '연혁', '조직도', '오시는 길']],
                ['회원', ['회원 가입 안내', '회원사 현황', '회원 혜택', '회비 안내']],
                ['사업', ['사업 안내', '교육·세미나', '자격 인증', '정책 연구', '국제 협력']],
                ['자료실', ['산업 통계', '보고서', '법령·규정', '서식']],
                ['알림', ['협회 소식', '공지사항', '행사 일정', '포토 갤러리', '문의하기']],
            ],
            'culture' => [
                ['전시', ['전시 안내', '현재 전시', '지난 전시', '소장품']],
                ['공연', ['공연 일정', '예매 안내', '좌석 안내']],
                ['교육', ['프로그램 신청', '어린이 교실', '성인 강좌', '단체 교육']],
                ['관람 안내', ['이용 안내', '관람료', '오시는 길', '편의시설', '대관 안내']],
                ['소개', [$head . ' 인사말', '미션·비전', '연혁', '공지사항', '자주 묻는 질문']],
            ],
            'biz' => [
                ['회사소개', ['CEO 인사말', '회사 개요', '연혁', '조직도', '오시는 길']],
                ['제품·서비스', ['제품 소개', '서비스 안내', '도입 사례', '가격 안내']],
                ['고객지원', ['새소식', '자주 묻는 질문', '자료실', '문의하기']],
                ['인재채용', ['인재상', '복리후생', '채용 공고', '채용 절차']],
            ],
            'academy' => [
                ['기관소개', [$head . ' 인사말', '교육 목표', '연혁', '시설 안내', '오시는 길']],
                ['강좌안내', ['정규 강좌', '자격증 과정', '온라인 강좌', '특강']],
                ['수강신청', ['수강 신청', '수강료 안내', '환불 기준', '이용 안내']],
                ['알림', ['교육 소식', '공지사항', '포토 갤러리', '자주 묻는 질문', '문의하기']],
            ],
            default => null,
        };
    }

    /**
     * 시안 판정 기준 (2026-10-02, MCP check_mockup) — 레퍼런스 화면 한 장의 높이·줄·칸 + 시안에 나오면 안 되는 실제 정보(기관명·주소·전화·도메인).
     * 레퍼런스 글은 내보내지 않는다(누출 검사용 짧은 문자열만).
     * @return array<string, mixed>|null
     */
    public static function checkRef(int $screenId): ?array
    {
        $sc = Db::row('SELECT sc.id, sc.site_id, sc.page_type_id AS page_type, sc.viewport_w, sc.full_h, sc.public_asset_id, sc.ocr_text, s.slug, s.url, s.domain, s.title AS site_title,
                o.name AS org_name, o.display_name, o.name_aliases, o.phone, o.fax, o.address
            FROM screens sc JOIN sites s ON s.id = sc.site_id JOIN organizations o ON o.id = s.org_id WHERE sc.id = ?', [$screenId]);
        if ($sc === null) {
            return null;
        }
        $vw = (int) ($sc['viewport_w'] ?: 1920);
        $secs = [];
        foreach (Db::rows('SELECT section_type_id AS type, bbox_x AS x, bbox_y AS y, bbox_w AS w, bbox_h AS h, structure FROM sections WHERE screen_id = ? ORDER BY bbox_y, bbox_x', [$screenId]) as $i => $r) {
            $st = is_string($r['structure'] ?? null) ? (json_decode((string) $r['structure'], true) ?: []) : (array) ($r['structure'] ?? []);
            $h = self::saneH((string) $r['type'], (int) $r['h'], $st);
            $secs[] = ['no' => $i + 1, 'type' => (string) $r['type'], 'x' => (int) $r['x'], 'y' => (int) $r['y'], 'w' => (int) $r['w'], 'h' => $h];
        }
        $pt = (string) ($sc['page_type'] ?? 'main');
        $full = (int) ($sc['full_h'] ?? 0);
        $contentBot = 0;
        foreach ($secs as $s) { $contentBot = max($contentBot, $s['y'] + $s['h']); }
        // 가짜 푸터 등으로 full_h가 부풀었으면 실제 내용 끝을 높이로 쓴다
        $height = ($contentBot > 0 && $full - $contentBot > 500) ? $contentBot : $full;
        $top = 0; $bot = $full;
        foreach ($secs as $s) {
            if (in_array($s['type'], ['header', 'masthead', 'gnb'], true) && $s['y'] < 400) { $top = max($top, $s['y'] + $s['h']); }
            if ($s['type'] === 'footer' && $s['y'] > $top) { $bot = min($bot, $s['y']); }
        }
        // 누출 검사 문자열: 기관명(정식·표시·별칭·청 뗀 이름), 사이트 제목, 도메인, 대표 전화·팩스, 주소 앞부분, 화면 글에 나온 전화번호
        $leak = [];
        foreach ([$sc['org_name'], $sc['display_name'], $sc['site_title']] as $n) {
            $n = trim((string) $n);
            if (mb_strlen($n) >= 3) { $leak[] = $n; $short = (string) preg_replace('/청$/u', '', $n); if (mb_strlen($short) >= 3) { $leak[] = $short; } }
        }
        foreach (array_filter(array_map('trim', explode(',', (string) ($sc['name_aliases'] ?? '')))) as $a) { if (mb_strlen($a) >= 3) { $leak[] = $a; } }
        $host = (string) (parse_url((string) $sc['url'], PHP_URL_HOST) ?: ($sc['domain'] ?? ''));
        if ($host !== '') { $leak[] = (string) preg_replace('/^www\./', '', $host); }
        foreach ([$sc['phone'], $sc['fax']] as $p) { if (preg_match('/\d{2,4}-\d{3,4}-\d{4}/', (string) $p, $m)) { $leak[] = $m[0]; } }
        if (preg_match_all('/0\d{1,2}-\d{3,4}-\d{4}|1[5-9]\d{2}-\d{4}/', (string) ($sc['ocr_text'] ?? ''), $m)) { foreach (array_slice(array_unique($m[0]), 0, 8) as $p) { $leak[] = $p; } }
        $addr = trim((string) ($sc['address'] ?? ''));
        if (mb_strlen($addr) >= 8) { $leak[] = mb_substr((string) preg_replace('/\s+/u', ' ', $addr), 0, 14); }
        return [
            'screen_id' => (int) $sc['id'], 'ref_id' => (string) (int) $sc['id'], 'site_slug' => $sc['slug'], 'page_type' => $pt,
            'single_main' => $pt === 'main',
            'width' => $vw, 'height' => $height,
            'sub' => $pt === 'main' ? null : ['body_y_from' => $top, 'body_y_to' => $bot, 'body_h' => max(0, $bot - $top)],
            'rows' => self::rows($secs, $vw),
            'capture_url' => Plan::kurl((int) ($sc['site_id'] ?? 0), $sc['public_asset_id'] ?? null),
            'leak' => array_values(array_unique($leak)),
        ];
    }

    /** 첫 판정에서 크게 깎이는 항목(감점 큰 순) — 묶음 맨 앞에 둔다. 운영 기록: 첫 판정 57·32점에서 시작해 세 바퀴를 돈 시안이 있었다(2026-10-02). */
    public const PREFLIGHT = [
        'why' => 'check_mockup 을 부르기 전에 이 11가지를 직접 확인한다. 첫 판정에서 가장 크게 깎이는 항목을 감점 큰 순으로 적었다 — 여기서 걸리면 판정을 두세 번 더 돌게 된다.',
        'items' => [
            '① 가로 스크롤(치명 -12, 100vw -6): html·body·띠·메뉴 판 어디에도 width:1920px 같은 고정 폭과 100vw 를 쓰지 않는다. 폭 가득 = width:100%, 본문 = max-width + margin:0 auto. <meta name="viewport" content="width=device-width,initial-scale=1">.',
            '② 반응형(치명 -12, @media 없음 -8): @media (max-width:1280px)·(max-width:768px)·(max-width:480px) 를 넣고, 768 이하에서 여러 칸 줄을 세로로 쌓는다(grid-template-columns:1fr / flex-direction:column). 고정 px 폭 칸은 max-width:100%. 390 폭에서 글자 13px 이상.',
            '③ 본문 폭(치명, 줄당 -6): 머리·바닥을 뺀 모든 줄이 같은 시작선과 폭(mix.frame.x·w, 없으면 container_w) — 줄마다 다른 컨테이너 폭을 쓰지 않는다. 나란한 칸 사이는 col_gap 한 값.',
            '④ 세로 간격(sections 좌표대로): 줄과 줄 사이 margin 은 각 줄 y − (위 줄 y+h) 로 줄마다 둔다(줄마다 다를 수 있다 — 한 값으로 통일하지 않는다). 위아래 상자가 맞닿은 곳(간격 0)이 없게 한다(화면 폭 가득 띠끼리 맞닿는 곳 제외).',
            '⑤ 높이(메인만, 2% 넘으면 감점·6% 넘으면 치명): 전체 높이를 reference.height 와 2% 이내로. 서브는 높이를 맞추지 않는다 — 짧은 쪽은 감점 없음, 본문 구간이 레퍼런스보다 15% 넘게 길 때만 감점(치명 아님). min-height·빈 상자로 늘리면 빈칸으로 감점(-8). 레퍼런스 본문의 구획(표·안내 상자·이미지 띠)을 빼서 짧아지는 것도 안 된다 — 구획은 다 두고 글 양만 줄인다.',
            '⑥ 동작(항목당 -5, 규약 없음 -10): </body> 앞 <script data-hb-behavior></script>. 캐러셀은 2장 이상이고 높이가 있어야 하며 이전·다음·정지 단추, 탭은 탭마다 다른 내용, 레이어는 열리고 Esc 로 닫힘, 검색은 결과가 나옴, 모든 <a> 에 href, 모든 <button> 에 동작.',
            '⑦ 주 메뉴(-8): 메뉴에 올리면 화면 폭 가득한 판이 열린다(메뉴 하나 아래 작은 상자 금지).',
            '⑧ 호버 움직임(-5): :hover 에 transform·box-shadow 가 걸린 곳이 3곳 이상(카드 떠오름, 사진 확대, 아이콘 회전).',
            '⑨ 서브 페이지(-8, 지도 -10): 머리 바로 아래 폭 가득 서브 비주얼 띠(페이지 이름 + 경로). 찾아오시는 길은 구글 지도 iframe(오픈스트리트맵은 게시 화면에서 막혀 회색 판으로 보인다).',
            '⑩ 시각(2026-10-13 추가, 판정 실측): 마지막 내용과 바닥글 사이 0~2px -8 / 40px 미만·120px 넘음 -4 / 300px 넘음 -8 · 내용 없는 띠 160px+ (400px+ 이면 메인 치명) · 넓은데 글·그림이 거의 없는 섹션 -5(둘 다 0 이면 치명) · 글·단추가 칸 밖으로 잘림 치명 · 흐름 안 형제 겹침 치명 · 빈 캐러셀 치명 · h1 하나·# 링크 절반 이하 · 형제 중 하나만 굳은 호버 · 감점 종류 하나가 3번 넘게 나오면 84점 상한.',
            '⑪ 색·글자·묶음 간격·서브 틀(-4~-12, 다른 장과 다르면 치명): 주색은 포인트만(넓은 면은 무채색·사진, theme.color_use) · 섹션 제목·슬로건 40px 이하(theme.type) · 한 묶음 안 칸 간격은 가로·세로 같은 값(col_gap) · 서브는 전부 sub_shell(왼쪽 옆 메뉴 260px, 서브 비주얼 220px, 본문 폭 = 메인).',
            '⑩ 게이트(항목당 -5): 빈 카드 0 · 글자 기호(› → + × …) 0 · 같은 이미지 두 번 0 · 이미지는 samples 주소만 · 섹션 제목과 내용 사이 64px 이내 · 레퍼런스 기관명·전화·주소 0(치명 -30).',
        ],
    ];

    /** 서브 페이지 공통 틀 — 서브마다 레퍼런스가 달라 옆 메뉴 위치·모양·본문 폭·서브 비주얼 높이가 장마다 달랐다(2026-10-03 사용자 지적). 레퍼런스와 무관하게 한 가지로 고정한다. */
    public const SUB_SHELL = [
        'rule' => '모든 서브 페이지가 이 틀 하나를 쓴다. 서브 화면의 레퍼런스가 달라도 옆 메뉴 위치·모양·폭, 서브 비주얼 높이, 본문 폭은 바꾸지 않는다 — 레퍼런스에서는 본문 칸 안쪽 구성만 따른다. 옆 메뉴·서브 비주얼의 CSS 는 메인 시안의 <style> 에 미리 넣어 두고(hb:use style 로 서브에 같이 온다) 서브에서는 같은 클래스·같은 마크업을 쓴다.',
        'visual_h' => 220,
        'visual' => '머리 바로 아래 폭 가득 띠, 높이 220px — 사진 + 검정 40% 덮개(또는 옅은 회색 면) 위에 페이지 이름(36~44px)과 경로. 장마다 높이·모양을 바꾸지 않는다.',
        'lnb' => ['side' => 'left', 'w' => 260, 'gap' => 60,
            'style' => '본문 왼쪽 260px. 맨 위에 상위 메뉴 이름(22px 굵게, 아래 2px 짙은 선), 그 아래 항목 줄(높이 52px, 아래 1px 옅은 선, 바탕 없음). 현재 항목만 주색 글자 + 굵게 + 왼쪽 3px 주색 선. 상자 테두리·그림자·둥근 카드로 감싸지 않는다.',
            'note' => '옆 메뉴가 필요 없어 보이는 화면(포트폴리오 목록·문의)에도 둔다 — 같은 상위 메뉴의 형제 페이지를 항목으로.'],
        'content' => '옆 메뉴 + 60px + 본문 = 메인 본문 폭(content_w, 없으면 메인 theme.container_px) 가득. 메인과 같은 왼쪽 선에서 시작해 같은 오른쪽 끝에서 끝난다. 본문을 가운데 좁은 기둥(900px 안팎)으로 만들지 않는다.',
    ];

    public const PROCEDURE = [
        '0. 틀은 홈박스 기본 CSS 로 만든다(base) — <style data-hb-base></style> + base.root. 본문 구역은 .hb-wrap·.hb-sec·.hb-grid·.hb-card·.hb-title·.hb-btn 으로, 서브 페이지는 base.sub_html 마크업 그대로. 폭·간격·색·글자 크기를 구역마다 새로 정하지 않는다 — 그래야 장마다, 구역마다 같은 틀이 된다.',
        '1. 참고 이미지(레퍼런스 캡처)를 위에서 아래로 끝까지 본다. rows(줄 묶음)와 sections(좌표·구성)로 줄마다 칸이 몇 개이고 각 칸이 몇 px 인지 확인한다. rows·sections 는 자동 분해라 칸이 빠지거나 합쳐져 있을 수 있다 — 참고 이미지와 다르면 이미지가 우선이고, 이미지에서 px 를 재어(÷ scale) 쓴다. 칸 안쪽(탭 높이·목록 줄 높이·단추 크기·여백)도 이미지에서 잰다.',
        '2. 배치는 레퍼런스와 같게 만든다 — 컨테이너 폭, 줄 순서, 줄 사이 간격, 한 줄 안 칸의 폭·높이, 칸 안쪽의 구성(탭 위치·목록 줄 수·카드 수·아이콘 수·단추 위치), 글자 크기·굵기, 둥글기, 그림자, 배경 면·겹침까지. 칸을 비우거나 합치거나 넓게 늘이지 않는다. 레퍼런스에 있는 요소는 하나도 빼지 않는다.',
        '2-1. 메인은 레퍼런스 여러 곳을 섞은 배치다(reference.mix). 줄마다 출처가 달라도 sections·rows 좌표대로 한 페이지로 쌓고, 제목 크기·둥글기·간격·그림자·더보기 단추는 한 가지 체계로 통일해 한 사이트처럼 만든다. 가로는 reference.mix.frame 하나를 쓴다 — 머리·바닥을 뺀 모든 줄의 내용이 같은 왼쪽 선(frame.x)에서 시작해 같은 폭(frame.w)에서 끝나고, 좌우 칸 사이 간격은 전부 frame.col_gap 이다. 참고 이미지에서 어떤 줄이 더 넓거나 칸 간격이 달라 보여도 frame 을 따른다(check_mockup 이 줄별 폭·시작선·칸 간격을 잰다). 출처 사이트 한 곳의 인상(섹션 이름 짜임·장식 위치)이 드러나지 않게 한다.',
        '2-2. 가로 간격은 한 값이다 — 좌우로 나란한 칸 사이는 전부 frame.col_gap(16~32px). 한 묶음 안에서 칸 사이가 갈리면 안 된다(넓은 간격과 좁은 간격을 섞지 않는다). 세로 간격(줄과 줄 사이)은 반대로 줄마다 sections 좌표 그대로 둔다 — 실제 사이트도 줄마다 다르므로 한 값으로 통일하지 않는다(통일하면 높이가 reference.height 와 어긋난다). 각 줄 위 margin = 그 줄 y − (위 줄 y+h). check_mockup 이 줄별 간격이 sections 와 어긋나는지만 본다(±40px 안).',
        '3. 내용은 전부 바꾼다 — 기관명·인물·전화·주소는 persona 의 가상 값, 게시물 제목·행사·문구는 새로 쓴 가상 글(레퍼런스 글을 옮겨 적지 않는다). 글 길이와 줄 수는 레퍼런스와 비슷하게 맞춘다.',
        '3-1. 섹션 제목은 새로 짓는다 — 참고 이미지에 보이는 제목 짜임("○○ 소식", "언론 속의 ○○", "○○랑 소통해요!" 처럼 기관명을 끼워 넣은 틀)을 그대로 따르지 않는다. 마스코트·건물 일러스트·배경 영문 큰 글자의 위치와 모양도 레퍼런스와 다르게 둔다(쓸 거면 samples 에서 고르고 자리를 바꾼다).',
        '4. 이미지는 samples 의 주소(url_template 에 key 를 넣은 것)만 쓴다(로고·마스코트는 머리·바닥처럼 여러 곳에 반복해도 된다). 레퍼런스 캡처를 잘라 넣거나 그 사이트의 이미지 주소를 쓰지 않는다. 글자가 든 배너 자리는 샘플 사진 위에 HTML 글을 얹어 만든다.',
        '5. 색: 바탕은 무채색(theme.neutral)이고 주색(theme.primary)은 포인트다 — theme.color_use 를 따른다. 레퍼런스에서 색 면이던 자리(첫 화면 배경·구역 띠·큰 상자·바닥)는 주색으로 옮기지 않고 흰색·옅은 회색·짙은 무채색·사진으로 만든다. 주색은 단추·선택 탭·아이콘·밑줄·이름표 같은 작은 요소에, 넓은 주색 면은 한 화면에 1~2곳(합쳐 10% 이내)만. 고객 색이 없으면 홈박스가 레퍼런스 색과 다른 색을 골라 준다. check_mockup 이 한 색 계열이 화면을 얼마나 덮는지 잰다.',
        '5-1. 글자 크기는 theme.type 을 따른다 — 첫 화면 제목만 60px 까지, 섹션 제목은 section_title_px(40px 이하), 본문 안 슬로건·강조 문구도 40px 이하. 참고 이미지의 글자가 더 커 보여도 상한을 넘기지 않는다.',
        '6. 아이콘은 icons 의 path 로 만든 인라인 SVG. 글자 기호 금지.',
        '7. 배치는 흐름(flex·grid)으로 하고, 겹치는 장식만 position 으로 띄운다. 폭 1920 기준 한 파일(HTML+CSS+JS)로 만들되 반응형은 기본이다 — <meta name="viewport" content="width=device-width,initial-scale=1"> 를 넣고, 본문 폭은 고정 px 가 아니라 max-width + 좌우 여백으로, @media 로 1280 이하(좌우 여백 축소·칸 수 줄임)·768 이하(2단은 1단으로, 격자 2~3열, 주 메뉴는 전체메뉴 단추로)·480 이하(한 줄 1~2칸, 제목 크기 축소)를 만든다. 390 폭에서 가로 넘침이 없어야 하고 글자는 13px 이상이다(check_mockup 이 390 폭으로도 렌더해 잰다). 글꼴은 Pretendard 웹폰트를 써도 된다.',
        '7-1. 경로(홈 > 메뉴 > 페이지)의 구분 표시는 CSS 테두리로 그린 꺾쇠나 aria-hidden 아이콘을 링크 안에 넣어 만든다(링크 밖에 홀로 둔 화살표 아이콘은 동작 없는 조작 요소로 잡힌다). 쪽 번호는 <div role="navigation"> 안에 링크로 둔다.',
        '7-1. 섹션 제목은 그 칸의 일부다. 칸마다 [제목 → 16~32px → 내용] 을 한 상자 안에 세로로 넣는다. 여러 칸의 제목만 한 줄로 모아 따로 띠(다른 배경색 줄)를 만들지 않는다 — 줄 바탕색을 쓰려면 제목과 내용을 함께 덮는다.',
        '7-2. 가로 스크롤은 어떤 창 폭에서도 생기면 안 된다(1920·1440·1280·390 전부). body·html·폭 가득 띠·펼친 메뉴 판에 width:1920px 같은 고정 폭이나 100vw 를 절대 쓰지 않는다(세로 스크롤바 17px 때문에 1920 모니터의 실제 폭은 1903 이다) — width:100% + 안쪽 max-width 로 만든다. 판정은 스크롤바를 뺀 폭(1903·1583·1423·1263)에서도 잰다. 화면 밖으로 나가는 장식은 그 구역에 overflow:hidden.',
        '7-3. 주 메뉴는 메뉴 하나 아래에 작은 상자가 뜨는 방식(개별 드롭다운)으로 만들지 않는다 — SI 프로젝트에서 피하는 형식이다. 메뉴에 올리면 머리 아래로 화면 폭 가득한 판이 열리고, 그 안에 모든 주 메뉴의 하위 메뉴가 열(칸)로 나란히 보이게 한다(전체 펼침). 판은 메뉴마다 복제하지 않고 `<div data-hb-mega hidden>` 하나에 열마다 `data-hb-col="메뉴 순번(0부터)"` 를 붙인다(behavior 규약 참고).',
        '7-4. 서브 페이지의 높이는 내용이 정한다 — 레퍼런스 본문 높이에 맞추려고 min-height·고정 높이·빈 상자·큰 margin 으로 늘리지 않는다(서브는 짧은 쪽은 감점하지 않고, 본문이 레퍼런스보다 15% 넘게 길 때만 감점한다. 본문 끝에서 담당 부서·만족도 상자까지는 40~60px). 세로 여백: 구역과 구역 사이는 frame.row_gap 한 값이고 0 도 아니고 그보다 훨씬 크지도 않다. 본문이 짧은 서브 페이지를 min-height·고정 높이로 늘려 본문 아래에 큰 빈칸을 만들지 않는다. 바닥(푸터) 안쪽 줄 사이는 24~48px — 관련 사이트 줄과 주소 줄 사이를 크게 비우지 않는다. 카드·상자는 다음 구역과 붙이지 않는다.',
        '7-5. 사진·짙은 색 배경 위에 놓는 칸(검색·바로가기·소식 카드)은 불투명한 면(흰색 또는 주색)과 그림자·테두리로 배경과 또렷이 갈라지게 한다. 반투명 유리 칸·배경과 비슷한 옅은 회색 칸을 사진 위에 올리지 않는다. 배경 위 글자는 대비 4.5 이상. check_mockup 이 사진·색 면 띠 위의 반투명·투명 칸을 묻힘으로 감점한다.',
        '7-6. 서브 페이지는 전부 sub_shell 한 가지 틀을 쓴다 — 머리 바로 아래 같은 높이의 서브 비주얼 띠(페이지 이름 + 경로), 그 아래 왼쪽 옆 메뉴(같은 폭·같은 모양)와 본문, 전체 폭은 메인 본문 폭과 같다. 서브 화면의 레퍼런스가 옆 메뉴를 오른쪽에 두었거나 없거나 본문이 좁아도 따르지 않는다(레퍼런스에서는 본문 칸 안쪽만). 옆 메뉴·서브 비주얼 CSS 는 메인 <style> 에 미리 넣는다. check_mockup 이 같은 base_token 의 다른 서브와 옆 메뉴 위치·폭·바탕·테두리, 서브 비주얼 높이, 본문 좌우 끝을 대조한다.',
        '7-7. 찾아오시는 길 페이지의 지도는 일러스트·사진이 아니라 구글 지도 iframe 이 기본이다(약도 일러스트·핀 그림·가짜 확대 단추를 그리지 않는다. 오픈스트리트맵 임베드는 게시 화면에서 "Access blocked" 로 막히므로 쓰지 않는다) — <iframe src="https://www.google.com/maps?q=36.3504,127.3845&z=15&output=embed" loading="lazy" title="지도"> (가상 주소는 지도에 없으므로 q 에는 좌표를 넣는다). 폭은 본문 폭 가득, 높이 420~520px. 주소·전화·교통편은 지도 아래나 옆에 글로 둔다.',
        '7-8. 정적인 화면에 움직임을 넣는다(게시 레퍼런스 메인 39곳 실측: 호버 때 배경·글자색 82% · 밑줄 69% · 선이 그어짐(::after 폭 0→100%) 56% · 그림자 51% · 칸 폭 벌어짐 51% · 아이콘 회전 46% · 사진 확대 41% · 떠오름 31%). 최소한: 카드·바로가기 칸은 호버 때 3~6px 떠오르며 그림자, 사진 카드는 사진이 1.05~1.08배 확대(틀은 overflow:hidden), 목록·주 메뉴 글은 밑줄 선이 왼쪽에서 그어짐, 더보기(+) 아이콘은 90도 회전, 화살표 아이콘은 4px 밀림. 한 구역쯤은 나란한 칸 중 올린 칸이 넓어지는 구성(flex-grow 1→1.6)이나 호버 때 설명이 펼쳐지는 칸을 쓴다. 전부 transition .25~.4s ease, 같은 효과를 :focus-visible 에도 건다. 등장 효과(스크롤 때 떠오름)는 쓰지 않는다 — 시안의 스크립트는 <script data-hb-behavior></script> 한 줄뿐이다. @media (prefers-reduced-motion: reduce) 에서 transition·animation 을 끈다. 통통 튀기·흔들기·깜빡임은 쓰지 않는다.',
        '7-9. 사람 눈 점검(내 시안 58건, 2026-10-13)에서 반복된 결함을 처음부터 막는다 — ① 마지막 본문 구역과 바닥글 사이는 80px(모바일 48px): 붙이지도(0px) 말고 300px 넘게 비우지도 않는다. ② 구역 사이 간격은 한 값(--hb-section-gap: 96px, 모바일 56px)으로 고르게 — 한 곳만 크게 벌리지 않는다. ③ 메인 높이를 맞추려고 min-height·빈 띠·큰 padding 으로 늘리지 않는다. 모자라면 레퍼런스 줄의 구획을 채운다. ④ 폭 가득한 넓은 구역에 글 몇 줄만 두지 않는다 — 사진·일러스트·카드 면·배경 무늬 중 하나로 꾸미거나 높이를 내용만큼 줄인다. ⑤ 카드·목록 상자에 고정 height 를 주지 않는다(내용이 넘쳐 글·단추가 잘리거나 아래가 텅 빈다) — 같은 줄 높이 맞춤은 grid align-items:stretch. ⑥ 음수 margin 으로 형제를 겹치지 않는다(테두리 위 배지처럼 의도한 경우만 position 으로). ⑦ 메가 메뉴 판은 z-index:100 이상으로 히어로·캐러셀 위에 연다. ⑧ 호버 효과는 :hover·:focus-visible 에만, 선택 상태는 aria-current·aria-selected 로 — 형제 중 하나에만 호버 모양을 굳혀 두지 않는다. ⑨ 드롭다운 판은 단추 바로 아래 4px 에 붙이고 고른 항목을 표시한다. ⑩ 아이콘은 한 스타일만, 사진은 object-fit:cover 로 칸을 채우되 글자 그림(배너·포스터)은 contain. ⑪ 캐러셀은 실제 여러 장, 한 화면 장수는 정수, 빈 칸 없이. ⑫ h1 은 하나(메인은 기관 이름, 서브는 페이지 이름), 링크는 menu 의 file 주소 — # 만 두지 않는다. ⑬ 기울임 글꼴·문자 기호 단추(▶ ‖ ◀)를 쓰지 않는다.',
        '7-10. 사용자 지적 캡처(2026-10-13)에서 더 나온 것 — ① 기관 이름은 persona.org 그대로(h1·title·로고 글자 모두). 요청 기관명을 다른 가상 이름으로 바꾸지 않는다. ② 바닥 글자(저작권·주소)는 바탕과 대비 4.5 이상: 어두운 바닥이면 rgba(255,255,255,.75) 이상, 밝은 바닥이면 #5B626B 이상. ③ "웹 접근성 인증 마크 자리"·"로고 자리"·"이미지 영역" 같은 자리표시 문구를 쓰지 않는다 — 그 자리는 비우거나 samples 그림으로. ④ 글꼴은 theme.font 의 주소만(다른 출처 웹폰트는 CORS 로 실패한다), 한 화면 글꼴은 두 종류까지. ⑤ 모바일(@media 768 이하): 표는 카드로 풀고, 2열·3열 카드는 1열(작은 아이콘 바로가기만 2열), 겹쳐 배치한 칸은 PC 에서만 겹친다, 옆 메뉴는 가로 스크롤 탭으로, 머리·옆 메뉴·바닥 글자가 잘리지 않게. ⑥ 같은 역할 카드는 면 색 하나, 주 버튼은 주색 하나(강조색 아닌 빨강·버건디 버튼 금지). ⑦ space-between 으로 카드 안에 큰 틈을 만들지 않는다 — 단추는 내용 바로 아래. 카드 속 빈 틈 100px 넘지 않게. ⑧ 작은 부품 하나만 남은 칸은 옆 칸과 합친다. ⑨ 무늬·지도·패턴 샘플을 대표 그림으로 쓰지 않는다, 글자 박힌 그림에 재생 단추를 얹지 않는다. ⑩ 세로 사진을 가로 칸에 넣을 땐 object-position:center 30%, 그림 원본 비율과 칸 비율이 2배 넘게 다르면 다른 샘플을 고른다. ⑪ 높이 300px 아래 칸에 안쪽 스크롤을 만들지 않는다. ⑫ 사이트맵 바닥은 단 높이를 고르게(한 단만 길게 두지 않는다). ⑬ 메가 메뉴 판 안에 주 메뉴 이름을 다시 반복하지 않는다(열 제목 한 번만). ⑭ 그림 카드 그림 아래 흰 띠(3~30px)를 남기지 않는다 — img 는 display:block. ⑮ 가로 넘김 줄은 한 화면 장수를 정수로, 칸이 잘려 보이면 넘김 단추를 둔다. ⑯ 서브 비주얼 사진은 페이지마다 다른 samples 를 고른다.',
        '8. 모든 조작 요소는 실제로 동작해야 한다 — behavior.contract 를 따른다. 캐러셀은 실제 여러 장, 탭은 탭마다 다른 내용, 주 메뉴는 하위 메뉴, 전체메뉴·검색·언어·관련 사이트는 열리고 닫힌다. 모든 링크에 href.',
        '9. 다 만들면 렌더해 레퍼런스 캡처와 나란히 놓고 줄마다 비교한다(전체 높이 차 2% 이내가 목표). 다른 곳을 고치고 다시 비교한다. 열린 상태(메뉴·레이어·다음 장·다른 탭)도 열어 보고 모양을 다듬는다.',
        '9-1. 같은 것을 두 번 쓰지 않는다(제작 시간의 대부분이 받아쓰기다) — 동작 스크립트는 <script data-hb-behavior></script> 한 줄(behavior.how), 서브 페이지의 스타일·머리·바닥은 base_token + <!--hb:use style|header|footer-->(behavior.reuse)로 홈박스가 채운다. 서브 여러 장은 메인이 통과한 뒤 그 token 을 base_token 으로 주고 만든다.',
        '10. check_mockup(ref_id=reference.ref_id, html, org_name=persona.org) 을 부른다(org_name 을 주면 기관명이 title·로고·h1 에 있는지도 본다). 홈박스가 시안을 보관하고 렌더해 줄·칸·높이·밝기·누출·이미지·동작을 판정한 뒤 점수·fixes·token 을 준다. 미통과면 HTML 을 처음부터 다시 쓰지 말고 check_mockup(ref_id, token, edits=[{find, replace}]) 로 고친 부분만 보낸다. 85점 이상·치명 0 이 되면 publish_mockup(token) 으로 게시한다(HTML 을 다시 보내지 않는다).',
    ];

    public const ACCEPTANCE = [
        'check_mockup 통과(85점 이상·치명 항목 0) — 아래 항목을 홈박스가 실제 렌더로 판정한다',
        '주색은 포인트만 — 한 색 계열이 화면을 덮지 않는다(넓은 면은 무채색·사진) · 섹션 제목·슬로건 40px 이하',
        '좌우 칸 간격은 한 값(frame.col_gap), 줄 사이 세로 간격은 줄마다 sections 좌표대로(±40px 안)',
        '서브 페이지 전부 같은 틀(sub_shell): 옆 메뉴 위치·폭·모양, 서브 비주얼 높이, 본문 폭이 장마다 같고 메인 본문 폭과 같다',
        '반응형: 390 폭에서 가로 넘침 없음 · 여러 칸 줄이 세로로 쌓임 · 글자 13px 이상',
        '줄 사이 세로 간격이 sections 좌표대로(줄마다 다를 수 있다) — 위아래 상자가 붙은 곳 없음(폭 가득 띠끼리 맞닿는 곳 제외)',
        '1920·1440·1280 폭 어디서도 가로 스크롤 없음',
        '본문 아래·바닥 안쪽에 큰 빈칸 없음 · 주 메뉴는 화면 폭 가득 펼침(개별 드롭다운 아님) · 서브 페이지마다 서브 비주얼 띠 · 찾아오시는 길은 구글 지도 iframe',
        'reference.mix.variation 의 구역별 change 를 적용(출처 구역을 색만 바꿔 옮기지 않는다)',
        '전체 높이가 reference.height 와 2% 이내',
        '줄 수·줄 순서·줄마다 칸 수가 참고 이미지와 같다(rows 는 보조)',
        '가로 넘침 없음 · 글자 잘림 없음(레퍼런스가 말줄임으로 자르는 자리는 글을 짧게 써서 맞춘다) · 빈 카드 없음 · 200px 이상 빈 공간 없음(단 레퍼런스에도 있는 여백이면 채우지 말고 그 빈 칸에 data-qa-gap 속성을 붙여 그대로 둔다 — 검사 통과용으로 레퍼런스에 없는 요소를 넣지 않는다)',
        '같은 제목·같은 문장·같은 이미지 반복 없음 · 한 줄의 칸들이 전부 같은 아이콘이면 안 된다(캐러셀 단추·펼침 화살표·새 창 표시·영상 칸의 재생 표시처럼 기능이 같은 아이콘은 예외)',
        '글자 기호 0개(전부 머티리얼 아이콘) · 글과 아이콘 세로 중심 차 2px 이내',
        '레퍼런스 기관의 이름·전화·주소·게시물 제목 0개',
        '스크립트 오류 0 · 주소 없는 링크 0 · 동작 없는 조작 요소 0',
        '캐러셀: 다음/이전/정지가 동작하고 2장 이상 · 탭: 탭마다 내용이 다름 · 레이어: 열리고 Esc 로 닫힘 · 주 메뉴: 올리면 하위 메뉴 · 검색: 결과가 나옴',
    ];
}

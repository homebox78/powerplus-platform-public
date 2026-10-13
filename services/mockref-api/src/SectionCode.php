<?php
declare(strict_types=1);

namespace Homebox;

/**
 * 섹션 → 바로 쓰는 HTML·CSS (2026-09-24, 사용자 "돈을 낼 가치가 있게").
 *   Claude 웹 인사말 테스트에서 MCP 가 통계만 줘서 AI 가 회색 와이어프레임을 그렸다. 이 클래스는 수집한 실측값으로 섹션 코드를 만든다:
 *   사이트 주색·글꼴·모서리 + 섹션의 실제 제목·소제목·메뉴/링크 이름·열 수·면/글자/강조 색 + 디자인 표현(사진 배치·사진 위 글자·
 *   어두운 바탕·겹침·아이콘 메뉴·카드·그림자·정렬).
 *   원 사이트 마크업을 복제하지 않는다 — 유형별 표준 구조(KRDS 친화 시맨틱 마크업)에 실측값을 채운다. 사진·로고는 같은 구도의 이미지 자리.
 */
final class SectionCode
{
    /**
     * @param array<string,mixed> $sec  section_type, w, h, structure(SectionShape 결과)
     * @param array<string,mixed> $tok  primary, font, radius, fg, container
     * @return array{html:string, css:string, notes:list<string>}
     */
    /**
     * DB 행(섹션 + 사이트 디자인) → 코드·샘플 이미지·토큰. 섹션 코드(/api/sections/{id}/code)와 페이지 조립(/api/screens/{id}/code)이 함께 쓴다.
     * @param array<string, mixed> $x id·type·w·h·structure·page_type·org_name·primary_hex·palette·fonts·radius_px·container_px
     * @return array{code: array{html: string, css: string, notes: string[]}, samples: array<int, array<string, mixed>>, tok: array<string, mixed>, prim: array<string, mixed>}
     */
    /** 사이트 디자인 행 → 목업 토큰(주색·글꼴·모서리·컨테이너). 섹션·페이지·메인 조립이 같은 값을 쓴다. */
    public static function tokens(array $x): array
    {
        $dec = static fn ($v) => is_string($v) ? (json_decode($v, true) ?: []) : (is_array($v) ? $v : []);
        $fonts = Design::fonts($dec($x['fonts'] ?? null));
        $fam = null;
        foreach ($fonts as $f) { if (is_array($f) && !empty($f['family'])) { $fam = (string) $f['family']; break; } if (is_string($f)) { $fam = $f; break; } }
        $fam = WebFont::canonical($fam) ?? $fam; // 표기 정규화 (S-CoreDream·SCDream → S-Core Dream) — 웹폰트 로드 이름과 맞춘다
        $prim = Design::primary($x['primary_hex'] ?? null, $dec($x['palette'] ?? null));
        $tok = [
            'primary' => $prim['hex'] ?? '#1D4ED8',
            'font' => ($fam ? "'" . addslashes($fam) . "'," : '') . "'Pretendard GOV','Pretendard',system-ui,sans-serif",
            'radius' => ($x['radius_px'] ?? null) === null ? 8 : (int) $x['radius_px'],
            'container' => !empty($x['container_px']) ? (int) $x['container_px'] : 1280,
        ];
        return [$tok, $prim];
    }

    public static function forRow(array $x): array
    {
        [$tok, $prim] = self::tokens($x);
        $struct = SectionShape::structure($x['structure']);
        // 사진 자리에 넣을 샘플 이미지 (2026-09-25): 섹션 유형 + 제목·기관 성격(군·농어촌이면 자연 풍경)으로 고른다. seed = 섹션 id 라 같은 섹션은 늘 같은 사진.
        $hint = array_values(array_filter([(string) ($struct['title'] ?? ''), ...array_slice((array) ($struct['headings'] ?? []), 0, 3)], 'is_string'));
        $rural = (bool) preg_match('/군$|군청|농촌|어촌/u', (string) $x['org_name']);
        $style = (array) ($struct['style'] ?? []);
        $stype = (string) $x['type'];
        if (!isset(Samples::FOR_SECTION[$stype]) && ($style['photo'] ?? '') === 'full_bleed') { $stype = 'main_visual'; }
        if (in_array($style['photo'] ?? '', ['split_left', 'split_right'], true) && $stype !== 'greeting_vision') { $stype = 'content'; }
        // 인사말 화면의 본문 사진 블록 = 인사말 본문 (2026-09-25 MCP 목업 테스트: 인사말 대표 화면 5장 모두 본문이 unknown 으로 분해돼
        // 사진 자리가 회색·주민 사진으로 나왔다). 인물 사진 + 글 좌우 배치로 그리고 기관장 사진을 넣는다.
        // greet_done = 페이지 조립에서 인사말 본문을 이미 그렸다(한 페이지 1번 — 복지부 인사말이 두 블록으로 나뉘어 사진이 두 번 나왔다)
        $greetBody = $x['page_type'] === 'greeting' && empty($x['greet_done']) && in_array($x['type'], ['unknown', 'content', 'greeting_vision'], true)
            && in_array($style['photo'] ?? 'none', ['inline', 'split_left', 'split_right'], true);
        if ($greetBody) {
            $stype = 'greeting_vision';
            if (($style['photo'] ?? '') === 'inline') { $struct['style']['photo'] = 'split_left'; }
            unset($struct['style']['icon_menu'], $struct['style']['cards'], $struct['style']['text_on_photo']); // 본문에 딸린 아이콘·카드보다 인사말 구성이 먼저
            $struct['title'] = null; $struct['headings'] = []; // unknown 분해라 제목·문단 자리에 메뉴·전화번호가 섞여 있다 — 자리표시로
        }
        $kinds = Samples::FOR_SECTION[$stype] ?? ['citizen', 'place'];
        // 가상 기관·인물 (한 페이지 = 한 인물, 페이지 조립이 persona 를 넘긴다). 기관장 사진은 이름과 같은 성별·단색 배경 먼저
        $persona = (array) ($x['persona'] ?? SampleContent::persona((string) ($x['org_type'] ?? ''), (string) $x['org_name']));
        if (in_array('leader', $kinds, true) || $greetBody) { $hint = [$persona['gender'] === 'female' ? '여성' : '남성', '단색배경', ...$hint]; }
        // 폭 가득 사진으로 그리는 섹션엔 넓은 사진만 — 4:5 기관장 사진을 띠에 깔면 몸통만 보인다 (부천 열린시장실 띠, 2026-09-25 테스트)
        $heroLike = !$greetBody && (in_array($x['type'], ['main_visual', 'sub_visual'], true) || ($style['photo'] ?? '') === 'full_bleed' || !empty($style['text_on_photo']));
        if ($heroLike) { $kinds = $x['type'] === 'sub_visual' ? ['sub-visual', 'hero-city', 'hero-nature'] : ['hero-city', 'hero-nature']; }
        if ($rural && in_array('hero-city', $kinds, true)) { $kinds = ['hero-nature']; }
        $samples = array_map([Samples::class, 'view'], Samples::find($kinds, $hint, 4, (int) $x['id'], (array) ($x['exclude'] ?? []))); // exclude = 같은 페이지에서 이미 쓴 사진
        $tok['images'] = $samples;
        $tok['page_type'] = $x['page_type'] ?? null;
        $code = SectionCode::build(['type' => $x['type'], 'w' => (int) $x['w'], 'h' => (int) $x['h'], 'structure' => $struct], $tok);
        $code['html'] = SampleContent::fill($code['html'], $persona, (int) $x['id'], $x['page_type'] ?? null);
        $code['notes'][] = '기관명·인물·글은 가상 샘플이다(' . $persona['org'] . ' ' . $persona['title'] . ' ' . $persona['name'] . ') — 실제 원고로 바꿔 쓴다. 문구 구성은 수집 인사말 64장·게시판 257장·푸터 118장의 빈도 기준.';
        unset($tok['images'], $tok['page_type']);
        return ['code' => $code, 'samples' => $samples, 'tok' => $tok, 'prim' => $prim, 'greet' => $greetBody, 'persona' => $persona];
    }

    public static function build(array $sec, array $tok): array
    {
        $type = (string) $sec['type'];
        $st = (array) ($sec['structure'] ?? []);
        $s = (array) ($st['style'] ?? []);
        $labels = array_values(array_filter((array) ($st['links']['labels'] ?? []), 'is_string'));
        $heads = array_values(array_filter((array) ($st['headings'] ?? []), 'is_string'));
        $title = is_string($st['title'] ?? null) ? $st['title'] : ($heads[0] ?? null);
        if (is_string($title) && preg_match('/영역$|^슬라이드|^본문|^바로가기$|컨텐츠 영역/u', $title)) { $title = null; } // 대체텍스트성 제목("슬라이드 영역") — 가상 제목 자리로
        $text = is_string($st['text'] ?? null) ? $st['text'] : '';
        $colors = (array) ($st['colors'] ?? []);
        $cols = max(1, min(6, (int) ($st['cols'] ?? 0) ?: 3));
        $h = (int) ($sec['h'] ?? 0);
        $radius = isset($s['radius_px']) && $s['radius_px'] !== null ? (int) $s['radius_px'] : (int) ($tok['radius'] ?? 8);
        $dark = !empty($s['dark']);
        $photo = (string) ($s['photo'] ?? 'none');
        $notes = [];
        $e = static fn (?string $v): string => htmlspecialchars((string) $v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $ph = static fn (string $label, string $cls = 'hb-img'): string => '<div class="' . $cls . '" role="img" aria-label="' . htmlspecialchars($label, ENT_QUOTES, 'UTF-8') . '"></div>';
        // 샘플 이미지 (2026-09-25) — $tok['images'] 가 있으면 사진 자리에 실제 이미지, 없으면 회색 자리표시
        $imgs = array_values((array) ($tok['images'] ?? []));
        $img = static function (int $i, string $cls, string $label) use ($imgs, $ph): string {
            $m = $imgs[$i % max(1, count($imgs))] ?? null;
            if (!$m) { return $ph($label, $cls); }
            return '<img class="' . $cls . '" src="' . htmlspecialchars((string) $m['url'], ENT_QUOTES, 'UTF-8') . '" alt="' . htmlspecialchars((string) $m['alt'], ENT_QUOTES, 'UTF-8') . '">';
        };
        $sentence = static function (string $t): string { $p = preg_split('/(?<=[.!?다요])\s+/u', trim($t)) ?: []; return (string) ($p[0] ?? ''); };

        // 사이트 공통 토큰만 :root (섹션 고유 색은 반환 직전 섹션 인라인 style 로)
        $vars = sprintf(":root{--hb-primary:%s;--hb-font:%s;--hb-radius:%dpx;--hb-fg:%s;--hb-bg:#FFFFFF;--hb-accent:%s;--hb-container:%dpx}",
            $tok['primary'] ?? '#1D4ED8', $tok['font'] ?? "'Pretendard GOV','Pretendard',system-ui,sans-serif", (int) ($tok['radius'] ?? 8),
            $tok['fg'] ?? '#1E2124', $tok['primary'] ?? '#1D4ED8', (int) ($tok['container'] ?? 1280));
        $base = ":where(.hb-sec){font-family:var(--hb-font);color:var(--hb-fg);background:var(--hb-bg)}.hb-wrap{max-width:var(--hb-container);margin:0 auto;padding:0 24px}"
            . ":where(.hb-img){background:linear-gradient(135deg,#9AA7B8,#5B6778);border-radius:var(--hb-radius);min-height:120px}img.hb-img{display:block;width:100%;height:100%;object-fit:cover;min-height:0;background:#E2E6EC}:where(.hb-sec) h2{margin:0 0 12px;font-weight:700}:where(.hb-sec) a{color:inherit;text-decoration:none}";

        $html = ''; $css = '';
        switch (true) {
            case $type === 'header':
                $nav = implode('', array_map(static fn ($l) => '<li><a href="#">' . htmlspecialchars($l, ENT_QUOTES, 'UTF-8') . '</a></li>', array_slice($labels, 0, 6)));
                $html = '<header class="hb-sec hb-header"><div class="hb-wrap"><a class="hb-logo" href="#">' . MainMockup::govMark(40, 'hb-logo-img') . '<span>[기관명]</span></a><nav aria-label="주 메뉴"><ul>' . $nav . '</ul></nav><div class="hb-util"><button type="button" aria-label="검색">검색</button><button type="button" aria-label="전체 메뉴">메뉴</button></div></div></header>';
                $css = ".hb-header .hb-wrap{display:flex;align-items:center;gap:48px;height:" . max(72, min($h, 120)) . "px}.hb-logo{display:flex;align-items:center;gap:10px;font-weight:700;font-size:20px}.hb-logo-img{width:40px;height:40px;border-radius:50%;background:#D5DBE3}.hb-header nav{flex:1}.hb-header ul{display:flex;gap:40px;list-style:none;margin:0;padding:0;font-size:18px;font-weight:600}.hb-util{display:flex;gap:8px}.hb-util button{height:40px;padding:0 14px;border:1px solid #D5DBE3;border-radius:var(--hb-radius);background:#fff}";
                break;

            case $type === 'lnb' && (int) ($sec['w'] ?? 0) >= 900 && $h > 0 && $h < 160:
                // 폭 가득·낮은 LNB = 가로 하위메뉴 탭 띠 (안산 열린시장실 — 세로 사이드바로 그리면 본문 위에 빈 칸이 생긴다)
                $tabs = array_slice($labels ?: ['[하위 메뉴 1]', '[하위 메뉴 2]', '[하위 메뉴 3]', '[하위 메뉴 4]'], 0, 8);
                $html = '<nav class="hb-sec hb-subnav" aria-label="하위 메뉴"><div class="hb-wrap"><ul>' . implode('', array_map(static fn ($l, $i) => '<li' . ($i === 0 ? ' class="is-on"' : '') . '><a href="#">' . htmlspecialchars($l, ENT_QUOTES, 'UTF-8') . '</a></li>', $tabs, array_keys($tabs))) . '</ul></div></nav>';
                $css = ".hb-subnav{border-bottom:1px solid #E2E6EC}.hb-subnav ul{display:flex;justify-content:center;list-style:none;margin:0;padding:0}.hb-subnav a{display:block;padding:" . max(18, (int) (($h - 24) / 2)) . "px 28px;font-size:17px;font-weight:600}.hb-subnav li.is-on a{color:var(--hb-primary);box-shadow:inset 0 -3px 0 var(--hb-primary)}";
                break;

            case $type === 'lnb':
                $items = implode('', array_map(static fn ($l, $i) => '<li' . ($i === 0 ? ' class="is-on"' : '') . '><a href="#">' . htmlspecialchars($l, ENT_QUOTES, 'UTF-8') . '</a></li>', array_slice($labels ?: ['[하위 메뉴 1]', '[하위 메뉴 2]', '[하위 메뉴 3]', '[하위 메뉴 4]'], 0, 10), array_keys(array_slice($labels ?: ['[하위 메뉴 1]', '[하위 메뉴 2]', '[하위 메뉴 3]', '[하위 메뉴 4]'], 0, 10))));
                $html = '<nav class="hb-sec hb-lnb" aria-label="하위 메뉴"><div class="hb-lnb-title">' . $e($title ?? '[메뉴 제목]') . '</div><ul>' . $items . '</ul></nav>';
                $css = ".hb-lnb{width:" . max(220, min((int) ($sec['w'] ?? 260), 300)) . "px}.hb-lnb-title{background:var(--hb-primary);color:#fff;font-size:22px;font-weight:700;padding:28px 24px;border-radius:var(--hb-radius) var(--hb-radius) 0 0}.hb-lnb ul{list-style:none;margin:0;padding:0;border:1px solid #E2E6EC;border-top:0}.hb-lnb li a{display:block;padding:14px 20px;border-top:1px solid #EEF1F4;font-size:16px}.hb-lnb li.is-on a{color:var(--hb-primary);font-weight:700;background:#F4F7FB}";
                break;

            case in_array($type, ['breadcrumb', 'page_title'], true):
                $crumb = implode(' ' . MaterialIcon::svg('next', 16) . ' ', array_map($e, array_slice($labels ?: ['홈', '[상위 메뉴]'], 0, 4)));
                $html = '<div class="hb-sec hb-ptitle"><nav class="hb-crumb" aria-label="현재 위치">' . $crumb . '</nav><div class="hb-ptitle-row"><h2>' . $e($title ?? '[페이지 제목]') . '</h2><div class="hb-ptitle-tools"><button type="button" aria-label="공유">공유</button><button type="button" aria-label="인쇄">인쇄</button></div></div></div>';
                $css = ".hb-crumb{font-size:14px;color:#6D7882;margin-bottom:12px}.hb-ptitle-row{display:flex;align-items:flex-end;justify-content:space-between;padding-bottom:20px;border-bottom:2px solid var(--hb-fg)}.hb-ptitle h2{font-size:36px;margin:0}.hb-ptitle-tools{display:flex;gap:8px}.hb-ptitle-tools button{width:40px;height:40px;border:1px solid #D5DBE3;border-radius:var(--hb-radius);background:#fff;font-size:0}";
                break;

            case $type === 'content_tabs':
                $tabs = array_slice($labels ?: $heads, 0, 6);
                if (!$tabs) { $tabs = ['[탭 1]', '[탭 2]', '[탭 3]']; $notes[] = '탭 이름을 수집하지 못했다 — 크롭 이미지로 확인할 것.'; }
                $html = '<div class="hb-sec hb-tabs" role="tablist">' . implode('', array_map(static fn ($l, $i) => '<button type="button" role="tab" aria-selected="' . ($i === 0 ? 'true' : 'false') . '">' . htmlspecialchars($l, ENT_QUOTES, 'UTF-8') . '</button>', $tabs, array_keys($tabs))) . '</div>';
                $css = ".hb-tabs{display:grid;grid-template-columns:repeat(" . max(2, count($tabs)) . ",1fr);border-bottom:1px solid #D5DBE3}.hb-tabs button{height:56px;border:0;background:none;font-size:17px;color:#58616A;cursor:pointer}.hb-tabs button[aria-selected=true]{color:var(--hb-primary);font-weight:700;box-shadow:inset 0 -3px 0 var(--hb-primary)}";
                break;

            case $type === 'satisfaction':
                $opts = ['매우만족', '만족', '보통', '불만족', '매우불만족'];
                $html = '<form class="hb-sec hb-sat"><fieldset><legend>이 페이지에서 제공하는 정보에 만족하십니까?</legend>' . implode('', array_map(static fn ($o) => '<label><input type="radio" name="sat" value="' . $o . '"> ' . $o . '</label>', $opts)) . '</fieldset><button type="submit">평가하기</button><p class="hb-sat-owner">담당부서 [부서명] · 연락처 [000-000-0000]</p></form>';
                $css = ".hb-sat{display:flex;flex-wrap:wrap;align-items:center;gap:16px 32px;padding:24px 28px;background:#F4F5F6;border-radius:var(--hb-radius)}.hb-sat fieldset{border:0;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:12px 24px;flex:1}.hb-sat legend{font-weight:700;margin-bottom:12px;width:100%}.hb-sat button{height:44px;padding:0 24px;border:0;border-radius:var(--hb-radius);background:var(--hb-primary);color:#fff;font-weight:700}.hb-sat-owner{width:100%;margin:0;font-size:14px;color:#6D7882}";
                break;

            case $type === 'footer':
                $fbg = is_string($colors['bg'] ?? null) ? $colors['bg'] : '#2B2F36';
                $links = implode('', array_map(static fn ($l, $i) => '<li' . ($i === 0 ? ' class="is-strong"' : '') . '><a href="#">' . htmlspecialchars($l, ENT_QUOTES, 'UTF-8') . '</a></li>', array_slice($labels, 0, 5), array_keys(array_slice($labels, 0, 5))));
                $html = '<footer class="hb-sec hb-footer"><div class="hb-wrap"><ul class="hb-footer-links">' . $links . '</ul><address>([우편번호]) [주소] · 대표전화 [000-000-0000]</address><p>© [기관명]. All rights reserved.</p></div></footer>';
                $css = ".hb-footer{--hb-bg:" . $fbg . ";--hb-fg:" . (self::light($fbg) ? '#3A4048' : '#C9CED6') . ";padding:40px 0}.hb-footer-links{display:flex;flex-wrap:wrap;gap:8px 24px;list-style:none;margin:0 0 20px;padding:0 0 20px;border-bottom:1px solid rgba(255,255,255,.15)}.hb-footer-links .is-strong a{color:" . (self::light($fbg) ? 'var(--hb-primary)' : '#FFD86B') . ";font-weight:700}.hb-footer address{font-style:normal;margin-bottom:8px}.hb-footer p{margin:0;font-size:14px;opacity:.7}";
                break;

            case $type === 'quick_links' || (int) ($s['icon_menu'] ?? 0) >= 4:
                $items = array_slice($labels ?: $heads, 0, max(4, min(12, (int) ($s['icon_menu'] ?? 0) ?: 8)));
                $html = '<section class="hb-sec hb-quick"><div class="hb-wrap">' . ($title ? '<h2>' . $e($title) . '</h2>' : '') . '<ul>' . implode('', array_map(static fn ($l) => '<li><a href="#"><span class="hb-quick-ico" aria-hidden="true"></span>' . htmlspecialchars($l, ENT_QUOTES, 'UTF-8') . '</a></li>', $items)) . '</ul></div></section>';
                $css = ".hb-quick ul{display:grid;grid-template-columns:repeat(" . min(8, max(4, count($items))) . ",1fr);gap:16px;list-style:none;margin:0;padding:0}.hb-quick a{display:flex;flex-direction:column;align-items:center;gap:12px;padding:20px 8px;border-radius:var(--hb-radius);font-size:15px;text-align:center" . (!empty($s['shadow']) ? ';box-shadow:0 6px 20px rgba(0,0,0,.08);background:#fff' : '') . "}.hb-quick-ico{width:48px;height:48px;border-radius:50%;background:color-mix(in srgb,var(--hb-primary) 14%,#fff)}";
                break;

            case $type === 'text_band':
                // 바로가기 텍스트 배너 = 제목 + 한 단락 + 더보기 (아리랑 'Distribution', 2026-09-26)
                $at = $title !== null ? mb_strpos($text, $title) : false; // 저장 글 앞에 숨은 레이어 글이 붙어 있을 수 있어 제목 뒤부터
                $desc = trim(mb_substr($at === false ? $text : mb_substr($text, $at + mb_strlen($title)), 0, 140));
                $html = '<section class="hb-sec hb-textband"><div class="hb-wrap">' . ($title ? '<h2>' . $e($title) . '</h2>' : '') . ($desc !== '' ? '<p>' . $e($desc) . '</p>' : '') . '<a class="hb-more" href="#" style="display:inline-flex;align-items:center;gap:2px">' . $e($labels[0] ?? '더보기') . ' ' . MaterialIcon::svg('next', 18) . '</a></div></section>';
                $css = ".hb-textband{padding:48px 0;background:color-mix(in srgb,var(--hb-primary) 6%,#fff)}.hb-textband h2{font-size:28px;margin:0 0 12px}.hb-textband p{max-width:560px;margin:0 0 16px;line-height:1.6}.hb-more{font-weight:600}";
                break;

            case in_array($type, ['banner_zone', 'promo_banner', 'hero'], true):
                // 배너존 = 배너 이미지 여러 장 가로 나열 (샘플 배너는 글자까지 든 완성본)
                $n = max(2, min(4, (int) ($st['images']['n'] ?? 0) ?: 3));
                $cards = implode('', array_map(static fn ($i) => '<a class="hb-banner" href="#">' . $img($i, 'hb-img', '배너 이미지') . '</a>', range(0, $n - 1)));
                $html = '<section class="hb-sec hb-banners"><div class="hb-wrap">' . ($title ? '<h2>' . $e($title) . '</h2>' : '') . '<div class="hb-banner-row">' . $cards . '</div></div></section>';
                $css = ".hb-banners{padding:48px 0}.hb-banners h2{font-size:24px}.hb-banner-row{display:grid;grid-template-columns:repeat({$n},1fr);gap:20px}.hb-banner{display:block;aspect-ratio:16/9;border-radius:var(--hb-radius);overflow:hidden}";
                break;

            case in_array($type, ['news_tabs', 'notice_list', 'news_list'], true) && !in_array($photo, ['full_bleed'], true) && empty($s['text_on_photo']):
                // 소식 탭 = 탭(짧은 메뉴 이름) + 날짜 달린 목록. 목록은 수집 텍스트를 날짜로 끊어 만든다 (원문 제목이라 목업에선 바꿔 쓴다)
                $tabs = array_slice(array_values(array_filter($labels, static fn ($l) => mb_strlen($l) <= 8 && !preg_match('/더보기|more/iu', $l))), 0, 5) ?: ['[탭 1]', '[탭 2]', '[탭 3]'];
                $parts = preg_split('/(\d{4}[-.]\d{2}[-.]\d{2})/u', $text, -1, PREG_SPLIT_DELIM_CAPTURE | PREG_SPLIT_NO_EMPTY) ?: [];
                $items = [];
                for ($i = 0; $i < count($parts) - 1; $i++) {
                    if (preg_match('/^\d{4}[-.]\d{2}[-.]\d{2}$/', $parts[$i]) && isset($parts[$i + 1]) && !preg_match('/^\d{4}/', $parts[$i + 1])) {
                        $items[] = [trim(mb_substr(trim($parts[$i + 1]), 0, 60)), str_replace('-', '.', $parts[$i])];
                    }
                }
                // 제목은 원 기관의 실제 게시물이라 가상 제목 자리로 (개수는 5줄로 맞춤) — 목업은 가상 콘텐츠로 채운다 (2026-09-25 사용자 지시)
                $items = array_fill(0, 5, ['[게시물 제목]', '[YYYY.MM.DD]']);
                $html = '<section class="hb-sec hb-news"><div class="hb-wrap"><div class="hb-news-head"><h2>' . $e($title ?? '[섹션 제목]') . '</h2><div role="tablist">' . implode('', array_map(static fn ($t, $i) => '<button role="tab" aria-selected="' . ($i === 0 ? 'true' : 'false') . '">' . htmlspecialchars($t, ENT_QUOTES, 'UTF-8') . '</button>', $tabs, array_keys($tabs))) . '</div><a class="hb-more" href="#" style="display:inline-flex;align-items:center;gap:2px">더보기 +</a></div><ul>'
                    . implode('', array_map(static fn ($it) => '<li><a href="#">' . htmlspecialchars($it[0], ENT_QUOTES, 'UTF-8') . '</a><span>' . htmlspecialchars($it[1], ENT_QUOTES, 'UTF-8') . '</span></li>', $items)) . '</ul></div></section>';
                $css = ".hb-news{padding:48px 0}.hb-news-head{display:flex;align-items:center;gap:24px;border-bottom:2px solid var(--hb-fg);padding-bottom:12px}.hb-news-head h2{margin:0;font-size:26px}.hb-news [role=tablist]{display:flex;gap:4px;flex:1}.hb-news [role=tab]{border:0;background:none;padding:8px 14px;border-radius:999px;font-size:16px;color:inherit;opacity:.7;cursor:pointer}.hb-news [role=tab][aria-selected=true]{background:var(--hb-primary);color:#fff;opacity:1;font-weight:700}.hb-more{font-size:14px;opacity:.7}.hb-news ul{list-style:none;margin:0;padding:0}.hb-news li{display:flex;justify-content:space-between;gap:24px;padding:14px 4px;border-bottom:1px solid color-mix(in srgb,var(--hb-fg) 12%,transparent)}.hb-news li a{flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.hb-news li span{opacity:.6;font-size:15px}";
                break;

            case $type === 'sns_video' || ($photo === 'inline' && (int) ($st['images']['photos'] ?? 0) >= 3):
                $n = max(2, min(4, (int) ($st['images']['photos'] ?? 4)));
                $side = implode('', array_map(static fn ($l) => '<li><a href="#">' . htmlspecialchars($l, ENT_QUOTES, 'UTF-8') . '</a></li>', array_slice($labels, 0, 4)));
                $cards = implode('', array_map(static fn ($i) => '<article class="hb-card">' . $img($i, 'hb-img hb-thumb', '영상 썸네일') . '<h3>[게시물 제목]</h3><p>[게시일]</p></article>', range(0, $n - 1)));
                $html = '<section class="hb-sec hb-media"><div class="hb-wrap"><div class="hb-media-side"><h2>' . $e($title ?? '[섹션 제목]') . '</h2>' . ($side ? '<ul>' . $side . '</ul>' : '') . '</div><div class="hb-media-grid">' . $cards . '</div></div></section>';
                $css = ".hb-media{padding:72px 0;background:" . ($colors['bg'] ?? '#F6F7F9') . "}.hb-media .hb-wrap{display:grid;grid-template-columns:260px 1fr;gap:48px}.hb-media-side h2{font-size:32px}.hb-media-side ul{list-style:none;margin:24px 0 0;padding:0;display:grid;gap:14px;font-weight:600}.hb-media-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:24px}.hb-card .hb-thumb{aspect-ratio:1/1;max-width:120px;float:left;margin-right:16px}.hb-card h3{font-size:16px;margin:0 0 6px}.hb-card p{margin:0;color:#8A949E;font-size:14px}";
                break;

            case in_array($type, ['main_visual', 'sub_visual'], true) || $photo === 'full_bleed' || !empty($s['text_on_photo']):
                $head = $title ?? '[슬로건 또는 핵심 메시지]';
                $sub = $heads[1] ?? ($sentence($text) ?: '[한두 문장 요약]');
                if ($labels && str_contains($sub, (string) $labels[0])) { $sub = '[한두 문장 요약]'; }
                if (preg_match('/영역|이전\s*다음|정지|재생|더보기|\d+\s*\/\s*\d+/u', $sub)) { $sub = '[한두 문장 요약]'; } // 수집 텍스트가 슬라이드 조작부·영역 표기 (부천 2026-09-25)
                // 비주얼 안 짧은 링크 3개+ = 아이콘 바로가기 띠(안산 열린시장실: 시정비전·공약사업 현황…) — 실측 링크 이름 그대로
                $short = array_values(array_filter($labels, static fn ($l) => mb_strlen($l) <= 14));
                $bar = count($short) >= 3 || (int) ($s['icon_menu'] ?? 0) >= 3 || !empty($s['overlap_prev']);
                $barItems = array_slice($short ?: $labels, 0, 6);
                if ($bar && $heads === [] ) { $sub = '[한두 문장 요약]'; }
                $hero = $imgs[0] ?? null;
                $right = ($hero['text_safe']['side'] ?? 'left') === 'right';
                $html = '<section class="hb-sec hb-hero' . ($right ? ' hb-hero--right' : '') . '">' . ($hero ? $img(0, 'hb-img hb-hero-photo', '') : $ph('비주얼 사진 — 폭 가득, 글자는 사진 위', 'hb-hero-photo')) . '<div class="hb-wrap hb-hero-copy"><p class="hb-hero-kicker">' . ($type === 'sub_visual' ? '[상위 메뉴]' : '[기관명]') . '</p><h2>' . $e($head) . '</h2><p>' . $e($sub) . '</p></div>'
                    . ($bar && $barItems ? '<ul class="hb-hero-bar">' . implode('', array_map(static fn ($l) => '<li><a href="#"><span aria-hidden="true"></span>' . htmlspecialchars($l, ENT_QUOTES, 'UTF-8') . '</a></li>', $barItems)) . '</ul>' : '') . '</section>';
                $css = ".hb-hero{position:relative;min-height:" . max(360, min($h ?: 600, 760)) . "px;display:flex;align-items:center;overflow:hidden;color:#fff;border-radius:" . ($radius >= 12 ? '0 0 var(--hb-radius) var(--hb-radius)' : '0') . "}.hb-hero-photo{position:absolute;inset:0;border-radius:0;background:linear-gradient(120deg,#26324A 0%,#4B5B78 55%,#8FA1BC 100%)}.hb-hero::before{content:'';position:absolute;inset:0;z-index:1;background:linear-gradient(90deg,rgba(10,14,24,.72),rgba(10,14,24,.08) 70%)}.hb-hero--right::before{background:linear-gradient(270deg,rgba(10,14,24,.72),rgba(10,14,24,.08) 70%)}.hb-hero--right .hb-hero-copy{text-align:right}img.hb-hero-photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.hb-hero-copy{position:relative;z-index:2;width:100%}.hb-hero-bar{z-index:2}.hb-hero h2{font-size:clamp(32px,4vw,56px);line-height:1.25;margin:0 0 16px;letter-spacing:-.02em}"
                    . (!empty($s['multicolor_heading']) ? ".hb-hero h2 em{font-style:normal;background:linear-gradient(90deg,#FF6FB1,#FFB86B);-webkit-background-clip:text;color:transparent}" : '')
                    . ".hb-hero-kicker{font-weight:700;color:color-mix(in srgb,var(--hb-primary) 40%,#fff);margin:0 0 12px}.hb-hero p{font-size:18px;opacity:.9;margin:0}.hb-hero-bar{position:absolute;left:5%;bottom:0;display:flex;list-style:none;margin:0;padding:18px 24px;gap:28px;background:rgba(0,0,0,.82);border-radius:var(--hb-radius) var(--hb-radius) 0 0}.hb-hero-bar a{display:flex;flex-direction:column;align-items:center;gap:8px;font-size:14px}.hb-hero-bar span{width:32px;height:32px;border:2px solid #fff;border-radius:50%}";
                if (!empty($s['multicolor_heading'])) { $notes[] = '원본 제목은 여러 색 강조 — h2 안 강조어를 <em> 으로 감싸면 그라데이션 글자가 된다.'; }
                break;

            case in_array($photo, ['split_left', 'split_right'], true):
                $para = implode('', array_map(static fn ($t) => '<p>' . htmlspecialchars($t, ENT_QUOTES, 'UTF-8') . '</p>', array_slice($heads, 1, 3))) ?: '<p>[1단락]</p><p>[2단락]</p><p>[3단락]</p>';
                $html = '<section class="hb-sec hb-split hb-split--' . ($photo === 'split_left' ? 'left' : 'right') . '"><div class="hb-wrap">' . $img(0, 'hb-img hb-split-photo', '인물·대표 사진') . '<div class="hb-split-copy"><h2>' . $e($title ?? (($tok['page_type'] ?? '') === 'greeting' ? '[인사말 제목 — 한 문장]' : '[제목]')) . '</h2>' . $para . '<p class="hb-sign">[기관명] [직함] <strong>[성명]</strong></p></div></div></section>';
                $css = ".hb-split{padding:64px 0}.hb-split .hb-wrap{display:grid;grid-template-columns:5fr 7fr;gap:56px;align-items:start}.hb-split--right .hb-split-photo{order:2}.hb-split-photo{aspect-ratio:4/5}.hb-split h2{font-size:32px;line-height:1.4}.hb-split p{font-size:17px;line-height:1.8}.hb-sign{text-align:right;margin-top:32px}.hb-sign strong{font-size:26px;margin-left:8px}";
                break;

            case $type === 'board_list':
                $heads2 = ['번호', '제목', '작성자', '등록일', '조회'];
                $html = '<section class="hb-sec hb-board"><table><caption class="sr-only">게시물 목록</caption><thead><tr>' . implode('', array_map(static fn ($t) => '<th scope="col">' . $t . '</th>', $heads2)) . '</tr></thead><tbody>'
                    . str_repeat('<tr><td>[번호]</td><td class="hb-l"><a href="#">[게시물 제목]</a></td><td>[부서]</td><td>[YYYY.MM.DD]</td><td class="hb-r">[0]</td></tr>', 5) . '</tbody></table></section>';
                $css = ".hb-board table{width:100%;border-collapse:collapse;border-top:2px solid var(--hb-fg)}.hb-board th{height:52px;background:#F4F5F6;font-weight:600;text-align:center}.hb-board td{height:56px;border-bottom:1px solid #E2E6EC;text-align:center}.hb-board .hb-l{text-align:left}.hb-board .hb-r{text-align:right}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}";
                break;

            default:
                $cards = $labels ? array_slice($labels, 0, max(3, min(8, $cols * 2))) : [];
                $cardHtml = implode('', array_map(static fn ($l) => '<a class="hb-box" href="#"><strong>' . htmlspecialchars($l, ENT_QUOTES, 'UTF-8') . '</strong>' . MaterialIcon::svg('arrow', 20) . '</a>', $cards));
                $html = '<section class="hb-sec hb-block' . ($dark ? ' is-dark' : '') . '"><div class="hb-wrap"><h2>' . $e($title ?? '[섹션 제목]') . '</h2>' . ($heads ? '<p class="hb-lead">' . $e($heads[1] ?? '') . '</p>' : '') . ($cardHtml ? '<div class="hb-grid">' . $cardHtml . '</div>' : '<p>[한두 문장 요약]</p>') . '</div></section>';
                $css = ".hb-block{padding:64px 0;text-align:" . (($s['align'] ?? '') === 'center' ? 'center' : 'left') . "}.hb-block.is-dark{--hb-bg:#1B2233;--hb-fg:#fff}.hb-block h2{font-size:30px}.hb-lead{color:#6D7882;margin:0 0 28px}.hb-grid{display:grid;grid-template-columns:repeat(" . min(4, $cols) . ",1fr);gap:20px}.hb-sec .hb-box{display:flex;justify-content:space-between;align-items:flex-end;min-height:120px;padding:24px;border:1px solid #E2E6EC;border-radius:var(--hb-radius);background:#fff;color:#1E2124" . (!empty($s['shadow']) ? ';box-shadow:0 8px 24px rgba(0,0,0,.08);border-color:transparent' : '') . "}";
        }
        if (!empty($s['overlap_prev']) && !in_array($type, ['main_visual', 'sub_visual'], true)) {
            $notes[] = '원본은 이 블록이 윗 섹션 위로 겹쳐 올라온다 — 첫 요소에 margin-top 음수(예: -60px)와 position:relative 를 준다.';
        }
        // 섹션마다 다른 값(글자·면·강조색·모서리)은 :root 가 아니라 그 섹션에 인라인으로 — 여러 섹션 코드를 한 페이지에 모아도 서로 덮지 않게 (2026-09-25)
        $fg = $colors['fg'] ?? ($dark ? '#FFFFFF' : ($tok['fg'] ?? '#1E2124'));
        $bg = $colors['bg'] ?? ($dark ? '#11161F' : '#FFFFFF');
        // 대비 보정: 면과 글자가 둘 다 어둡거나 둘 다 밝으면(수집 색이 서로 다른 요소에서 온 경우) 글자를 반대쪽으로 — 파란 면에 남색 글자 (2026-09-25 테스트)
        if (preg_match('/^#[0-9a-f]{6}/i', $bg) && preg_match('/^#[0-9a-f]{6}/i', $fg) && self::light($bg) === self::light($fg)) { $fg = self::light($bg) ? '#1E2124' : '#FFFFFF'; }
        $own = sprintf('--hb-fg:%s;--hb-bg:%s;--hb-accent:%s;--hb-radius:%dpx', $fg, $bg, $colors['accent'] ?? ($tok['primary'] ?? '#1D4ED8'), $radius);
        $html = preg_replace('/^<(section|nav|header|footer|aside) class="hb-sec/', '<$1 style="' . htmlspecialchars($own, ENT_QUOTES, 'UTF-8') . '" class="hb-sec', $html, 1) ?? $html;
        return ['html' => $html, 'css' => $vars . $base . $css, 'notes' => $notes];
    }

    private static function light(string $hex): bool
    {
        if (!preg_match('/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i', $hex, $m)) { return false; }
        return (0.299 * hexdec($m[1]) + 0.587 * hexdec($m[2]) + 0.114 * hexdec($m[3])) > 150;
    }
}

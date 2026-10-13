<?php
declare(strict_types=1);

namespace Homebox;

/**
 * 서브페이지 목업 = 키트(KRDS) 블록 조립 (2026-09-26, .claude/skills/reference-design 1차·2차·4차).
 *
 * 이전 방식(수집 섹션을 y 순으로 그대로 쌓기)은 분해가 틀린 레퍼런스를 그대로 옮겨 헤더 없음·빈 카드·
 * 인물 사진 들어간 조직도·사진 배너 FAQ 를 만들었다(ledger B1~B5·C6). 이제는
 *   - 뼈대는 유형 표준(표지 → 헤더 → 서브 비주얼 → [LNB | 경로·제목 → 본문 → 담당부서·만족도] → 푸터)으로 고정하고
 *   - 본문은 유형별 필수 부품(게시판 표·페이지 번호·아코디언·조직 트리·담당자 표·인사말·안내 박스)으로 채우고
 *   - 레퍼런스에서는 메뉴 이름·LNB 모양·색·글꼴·모서리만 가져온다(2차 스킨).
 * 마크업은 KRDS 원형(packages/kit/krds/examples) 그대로, 스타일은 kit.css(.hb-kit) + 이 페이지의 스킨 변수.
 */
final class KitPage
{
    // 2026-10-07 플랫폼 이식: 공개 주소는 설정값(app.public_base·app.kit_css) — 옛 hom2box.com/homebox 를 박아 두지 않는다
    public static function kitCss(): string { return (string) \Config::get('app.kit_css', 'https://powerplus.hom2box.com/kit-files/kit.css'); }
    public static function publicBase(): string { return rtrim((string) \Config::get('app.public_base', 'https://powerplus.hom2box.com/mockref'), '/'); }
    /** '/{base}/api/…' 같은 상대 주소 → 공개 절대 주소 */
    public static function abs(string $u): string
    {
        $b = rtrim((string) \Config::get('app.base', '/'), '/');
        if ($b !== '' && str_starts_with($u, $b . '/')) { $u = substr($u, strlen($b)); }
        return self::publicBase() . $u;
    }

    public const TYPES = ['board_list', 'board_view', 'faq', 'org_chart', 'greeting', 'content', 'history', 'location'];
    /** 레퍼런스 본문 순서로 쓰는 섹션 유형 (2026-09-29 titled) */
    public const BODY_TYPES = ['content_block', 'info_table', 'photo_gallery', 'step_flow', 'contact_info', 'faq_list', 'location_map', 'timeline', 'notice_box', 'board_list', 'form'];

    /** @var array<string, bool> */
    private array $used = [];
    /** @var array<int, array<string, mixed>> */
    private array $samples = [];
    /** @var string[] */
    private array $blocks = [];

    private function __construct(
        private string $type,
        private array $tok,
        private array $p,
        private array $ref,
    ) {}

    /**
     * @param string $type  유형(TYPES 중 하나, 아니면 content)
     * @param array  $tok   primary·font·radius·container (SectionCode::tokens)
     * @param array  $p     가상 기관 (SampleContent::persona)
     * @param array  $ref   레퍼런스 화면에서 온 값: gnb[] · lnb_title · lnb[] · title · tabs[]
     * @return array{html:string, composition:array, samples:array}
     */
    public static function build(string $type, array $tok, array $p, array $ref): array
    {
        $type = in_array($type, self::TYPES, true) ? $type : 'content';
        $me = new self($type, $tok, $p, $ref);
        return $me->render();
    }

    /**
     * 레퍼런스 캡처 픽셀 판정 — 섹션 분해에 남지 않는 '보이는 모양'(ledger C9).
     * visual: 헤더 바로 아래 180px 띠가 사진·짙은 면이면 true(흰 면에 제목만 있는 곳은 false).
     * footer_bg: 푸터 영역 평균색이 어두우면 그 색(#hex), 밝으면 null.
     */
    public static function probe(string $file, int $hdrBottom, ?array $foot): array
    {
        if (!is_file($file) || !function_exists('imagecreatefromwebp')) { return []; }
        $im = @imagecreatefromwebp($file);
        if (!$im) { return []; }
        $W = imagesx($im); $H = imagesy($im);
        $stat = static function (int $y0, int $y1, float $x0 = 0.05, float $x1 = 0.85) use ($im, $W, $H): array {
            $y0 = max(0, min($H - 1, $y0)); $y1 = max($y0 + 1, min($H, $y1));
            $n = 0; $s = $s2 = 0.0; $rs = $gs = $bs = 0;
            for ($y = $y0; $y < $y1; $y += 6) {
                for ($x = (int) ($W * $x0); $x < $W * $x1; $x += 6) {
                    $c = imagecolorat($im, $x, $y); $r = ($c >> 16) & 255; $g = ($c >> 8) & 255; $b = $c & 255;
                    $l = 0.299 * $r + 0.587 * $g + 0.114 * $b; $s += $l; $s2 += $l * $l; $rs += $r; $gs += $g; $bs += $b; $n++;
                }
            }
            if ($n === 0) { return [255, 0, '#ffffff']; }
            $m = $s / $n;
            return [$m, sqrt(max(0, $s2 / $n - $m * $m)), sprintf('#%02x%02x%02x', intdiv($rs, $n), intdiv($gs, $n), intdiv($bs, $n))];
        };
        $top = ($hdrBottom > 60 ? $hdrBottom : 130) + 8; // 헤더가 분해에 없으면 관공서 헤더 평균 높이(≈120) 아래부터
        // 비주얼 띠는 화면 폭 가득 칠해진다 → 콘텐츠가 닿지 않는 왼쪽 가장자리(0.5~4%)만 본다.
        // (LNB 제목 상자·본문 카드는 컨테이너 안이라 가장자리가 흰색 — 2026-09-26 행안부 356·352 오판)
        [$vm, $vs] = $stat($top, $top + 180, 0.005, 0.04);
        // photo = 사진·짙은 색 띠 / tint = 아주 연한 면 위 제목(대구 서구 #f8f9fd) / false = 흰 바탕
        [, , $vc] = $stat($top, $top + 180, 0.005, 0.04);
        $out = ['visual' => ($vm < 236 || $vs > 15) ? 'photo' : ($vm < 252.5 ? 'tint' : false), 'visual_bg' => $vc];
        // 푸터: 섹션 범위엔 흰 링크 영역이 섞일 수 있어(행안부 347) 항상 아래에서 위로 어두운 띠(60px+)를 찾는다.
        // 오른쪽 아래 워터마크를 피해 x 5~85% 만 본다. 캡처 끝의 흰 여백은 건너뛴다.
        $run = 0; $end = null; $lim = $foot !== null ? max(0, $foot[0] - 20) : (int) ($H * 0.6);
        for ($y = $H - 10; $y > $lim; $y -= 20) {
            [$m] = $stat($y, $y + 10);
            if ($m < 110) { $end ??= $y + 10; $run += 20; } elseif ($end !== null) { break; }
        }
        if ($end !== null && $run >= 60) {
            [, , $fc] = $stat($end - $run + 10, $end - 10);
            $out['footer_bg'] = $fc;
        } else {
            $out['footer_bg'] = null;
        }
        return $out;
    }

    // ── 공용 ─────────────────────────────────────────────
    private static function e(string $s): string { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }

    // ── 높이 예산 (2026-10-14 D7) ─────────────────────────
    // 레퍼런스 본문이 짧은 안내 화면(서울 상세 879px)인데 조립은 표·첨부·이전글·만족도를 늘 다 넣어 +75% 가 됐다.
    // 레퍼런스 본문 높이(body_h)의 1.12배 안에서 덜 중요한 블록부터 뺀다. body_h 가 없으면 예산 없음(전부 넣는다).
    private int $room = PHP_INT_MAX;
    private array $cut = [];
    // 유형별 꼭 남기는 본문 높이(px, 1920 렌더 실측) — 상세: 머리 116 + 문단 156 + 목록 단추 72 / 콘텐츠: 첫 절 256
    private const BASE = ['board_view' => 344, 'content' => 256];
    private function fits(string $what, int $h): bool
    {
        if ($this->room < $h) { $this->cut[] = $what; return false; }
        $this->room -= $h;
        return true;
    }

    private function img(array $kinds, array $tags = [], int $seed = 0): ?array
    {
        $got = Samples::find($kinds, $tags, 1, $seed + crc32($this->p['org']), array_keys($this->used));
        $it = $got[0] ?? null;
        if ($it === null) { return null; }
        $this->used[$it['id']] = true;
        $v = Samples::view($it);
        foreach (['url', 'thumb_url'] as $k) { if (str_starts_with((string) $v[$k], '/')) { $v[$k] = self::abs((string) $v[$k]); } } // 저장한 파일(file://)로 열어도 보이게
        $this->samples[$v['id']] = $v;
        return $v;
    }

    /** 레퍼런스 메뉴 이름 정리 — 숫자·기능어·너무 짧거나 긴 것을 뺀다(ledger B3: 달력 날짜가 LNB 로 들어왔다) */
    private static function labels(array $raw, int $max, int $min = 3): array
    {
        $out = [];
        foreach ($raw as $l) {
            $l = trim(preg_replace('/\s+/u', ' ', (string) $l) ?? '');
            if ($l === '' || mb_strlen($l) < 2 || mb_strlen($l) > 16) { continue; }
            if (preg_match('/^\d+$|^(홈|HOME|메뉴|닫기|열기|이전|다음|더보기|인쇄|공유|검색|로그인|회원가입|전체메뉴|바로가기|상단|위로|RSS|ENG|English|Language)/iu', $l)) { continue; }
            if (!in_array($l, $out, true)) { $out[] = $l; }
            if (count($out) >= $max) { break; }
        }
        return count($out) >= $min ? $out : [];
    }

    /** 레퍼런스 텍스트에 남은 원 기관명을 가상 기관명으로 */
    private function virt(string $s): string
    {
        $real = (string) ($this->p['real'] ?? '');
        if ($real !== '') {
            $short = preg_replace('/(특별자치시|특별자치도|광역시|특별시|청|부|처|원|공단|공사)$/u', '', $real) ?? $real;
            $s = str_replace([$real, $short !== '' && mb_strlen($short) >= 2 ? $short : "\0"], $this->p['org'], $s);
        }
        return $s;
    }

    private function date(int $k): string { return date('Y.m.d', strtotime('2026-09-24') - 86400 * (3 * $k + ($k % 3))); } // k 가 클수록 과거 — 최신순 보장(ledger D1)

    private function gov(): bool { return (in_array($this->p['kind'] ?? '', ['gov', 'corp'], true) || !SampleContent::isCivic((string) ($this->p['kind'] ?? 'local'))); }

    // ── 메뉴 구성 (한 원천 — ledger D4) ─────────────────────
    private function menus(): array
    {
        $gnb = self::labels($this->ref['gnb'] ?? [], 6, 4)
            ?: ($this->gov() ? ['기관소개', '정책정보', '알림·소식', '정보공개', '국민참여', '민원안내'] : ['열린시장실', '분야별정보', '알림소식', '정보공개', '참여소통', '민원안내']);
        $defaults = [
            'board_list' => ['알림·소식', ['공지사항', '보도자료', '고시·공고', '채용정보', '입찰정보']],
            'board_view' => ['알림·소식', ['공지사항', '보도자료', '고시·공고', '채용정보', '입찰정보']],
            'faq' => ['민원안내', ['민원 안내', '민원 서식', '자주 묻는 질문', '민원 상담', '찾아오시는 길']],
            'org_chart' => ['기관소개', ['인사말', '연혁', '비전·목표', '조직도', '찾아오시는 길']],
            'greeting' => [$this->gov() ? '기관소개' : '열린시장실', ['인사말', '약력', '비전·목표', '주요 일정', '찾아오시는 길']],
            'content' => ['분야별정보', ['사업 개요', '지원 대상', '신청 방법', '추진 현황', '관련 자료']],
            'history' => ['기관소개', ['인사말', '연혁', '비전·목표', '조직도', '찾아오시는 길']],
            'location' => ['기관소개', ['인사말', '연혁', '비전·목표', '조직도', '찾아오시는 길']],
        ][$this->type];
        $page = ['board_list' => '공지사항', 'board_view' => '공지사항', 'faq' => '자주 묻는 질문', 'org_chart' => '조직도', 'greeting' => '인사말', 'content' => '사업 개요', 'history' => '연혁', 'location' => '찾아오시는 길'][$this->type];
        $lnb = self::labels($this->ref['lnb'] ?? [], 8, 3);
        $lnbTitle = trim((string) ($this->ref['lnb_title'] ?? ''));
        // 레퍼런스 LNB 가 이 유형의 페이지를 담고 있을 때만 쓴다 — 아니면 LNB 제목과 활성 항목이 따로 논다(대구 서구 FAQ: 제목 '부동산', 활성 '복지')
        $refTitle = self::labels([$this->ref['title'] ?? ''], 1, 1)[0] ?? '';
        if ($lnb && $refTitle !== '' && in_array($refTitle, $lnb, true)) {
            $page = $refTitle;
            $title = self::labels([$lnbTitle], 1, 1)[0] ?? $defaults[0];
            $items = $lnb;
        } elseif ($refTitle !== '') {
            // LNB 링크를 못 읽은 화면이라도 경로(HOME > 종합민원 > 여권민원 > 여권 재발급)에 페이지 이름이 있다 (2026-09-29 수원 405 '사업 개요' 로 나옴)
            $crumbs = array_values(array_filter((array) ($this->ref['crumbs'] ?? []), 'is_string'));
            $parent = count($crumbs) >= 2 ? (self::labels([$crumbs[count($crumbs) - 2]], 1, 1)[0] ?? '') : '';
            $page = $refTitle;
            $title = $parent !== '' && !preg_match('/^home$|^홈$/iu', $parent) ? $parent : $defaults[0];
            $items = $defaults[1];
        } else {
            [$title, $items] = $defaults;
        }
        if (!in_array($page, $items, true)) { $items[0] = $page; }
        // LNB 제목(상위 메뉴)이 페이지 제목과 같으면 한 화면에 같은 제목 두 번 — 경로 상위 → 유형 기본 분류로 (2026-09-30 MCP 시험 r1 제목 중복 9건)
        if ($title === $page) {
            $crumbs = array_values(array_filter((array) ($this->ref['crumbs'] ?? []), 'is_string'));
            $cands = [];
            for ($i = count($crumbs) - 2; $i >= 0; $i--) { $cands[] = self::labels([$crumbs[$i]], 1, 1)[0] ?? ''; }
            $cands[] = $defaults[0];
            foreach ($cands as $c) { if ($c !== '' && $c !== $page && !preg_match('/^home$|^홈$/iu', $c)) { $title = $c; break; } }
        }
        $title = $this->virt($title);
        return ['gnb' => array_map(fn ($l) => $this->virt($l), $gnb), 'title' => $title, 'items' => array_map(fn ($l) => $this->virt($l), $items), 'page' => $this->virt($page)];
    }

    // ── 블록 ─────────────────────────────────────────────
    private function masthead(): string
    {
        $this->blocks[] = 'masthead';
        return '<div id="krds-masthead"><div class="toggle-wrap"><div class="toggle-head"><div class="inner"><span class="nuri-txt">이 누리집은 대한민국 공식 전자정부 누리집입니다.</span></div></div></div></div>';
    }

    private function logo(): string
    {
        $em = Samples::emblem($this->p['org']);
        if ($em !== null) {
            if (str_starts_with((string) $em['url'], '/')) { $em['url'] = self::abs((string) $em['url']); }
            $this->samples[$em['id']] = $em;
            return '<img class="pg-logo-img" src="' . self::e($em['url']) . '" alt="' . self::e($this->p['org']) . '">';
        }
        // 기관 로고가 없으면 정부 상징(원본 파일) + 기관명
        $svg = @file_get_contents(__DIR__ . '/../data/gov-emblem.svg') ?: '';
        $svg = preg_replace('/<\?xml[^>]*>\s*/', '', $svg) ?? '';
        return '<span class="pg-logo-mark" aria-hidden="true">' . $svg . '</span><span class="pg-logo-txt">' . self::e($this->p['org']) . '</span>';
    }

    private function header(array $m): string
    {
        $this->blocks[] = 'header';
        $gnb = implode('', array_map(fn ($l, $i) => '<li><a href="#" class="gnb-main-trigger' . ($l === $m['title'] ? ' active' : '') . '">' . self::e($l) . '</a></li>', $m['gnb'], array_keys($m['gnb'])));
        return '<header id="krds-header" class="pg-header"><div class="pg-util"><div class="pg-inner"><ul><li><a href="#">로그인</a></li><li><a href="#">회원가입</a></li><li><a href="#">사이트맵</a></li><li><a href="#">ENGLISH</a></li></ul></div></div>'
            . '<div class="pg-inner pg-brand"><h1 class="pg-logo"><a href="#">' . $this->logo() . '</a></h1>'
            . '<nav class="pg-gnb" aria-label="주 메뉴"><ul>' . $gnb . '</ul></nav>'
            . '<div class="pg-actions"><button type="button" class="pg-ico" aria-label="통합검색" aria-controls="pg-search" aria-expanded="false" data-layer>' . self::icon('search') . '</button><button type="button" class="pg-ico" aria-label="전체메뉴" aria-controls="pg-sitemap" aria-expanded="false" data-layer>' . self::icon('menu') . '</button></div></div></header>'
            . $this->layers($m);
    }

    // 통합검색·전체메뉴 단추가 실제로 여는 층 — 눌러도 아무 일 없던 것(2026-10-12 MCP 예시 시험)
    private function layers(array $m): string
    {
        $close = '<button type="button" class="pg-close" data-close aria-label="닫기">' . self::icon('close') . '</button>';
        $cols = implode('', array_map(fn ($l) => '<div><h3><a href="#">' . self::e($l) . '</a></h3>' . ($l === $m['title'] && $m['items'] ? '<ul>' . implode('', array_map(fn ($i) => '<li><a href="#">' . self::e($i) . '</a></li>', $m['items'])) . '</ul>' : '') . '</div>', $m['gnb']));
        return '<div class="pg-layer" id="pg-search" role="dialog" aria-modal="true" aria-label="통합검색" hidden><div class="pg-layer-box"><form class="pg-sform" role="search" onsubmit="return false"><label for="pg-q" class="pg-sr">검색어</label><input id="pg-q" type="search" placeholder="검색어를 입력하세요"><button type="submit" aria-label="검색">' . self::icon('search') . '</button></form>' . $close . '</div></div>'
            . '<div class="pg-layer" id="pg-sitemap" role="dialog" aria-modal="true" aria-label="전체메뉴" hidden><div class="pg-layer-box"><h2>전체메뉴</h2><div class="pg-smap">' . $cols . '</div>' . $close . '</div></div>';
    }

    private function subVisual(array $m): string
    {
        $look = $this->ref['visual'] ?? 'photo';
        // 레퍼런스에 비주얼 띠가 없어도 연한 면 띠는 둔다 — 모든 서브가 같은 윗부분(sub_shell)이 규칙이라 판정에서 매번 깎였다(2026-10-12 MCP 예시 시험)
        if ($look === false) { $look = 'tint'; }
        if ($look === 'tint') { // 사진 없이 연한 면 위 제목 — 레퍼런스가 그렇게 만들었다
            $this->blocks[] = 'sub_visual_tint';
            $bg = (string) ($this->ref['visual_bg'] ?? '');
            // 거의 흰색(#fdfefb 등)이면 띠로 안 보인다 — 주색 연한 면(--pg-p-l)을 쓴다
            if (preg_match('/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/', $bg, $h) && min(hexdec($h[1]), hexdec($h[2]), hexdec($h[3])) > 240) { $bg = ''; }
            return '<section class="pg-visual pg-visual--tint"' . (preg_match('/^#[0-9a-f]{6}$/', $bg) ? ' style="background:' . $bg . '"' : '') . '><div class="pg-inner"><p class="pg-visual-kicker">' . self::e($this->p['org']) . '</p><p class="pg-visual-title">' . self::e($m['title']) . '</p></div></section>';
        }
        $this->blocks[] = 'sub_visual';
        $tags = match ($this->type) { 'greeting', 'org_chart', 'history', 'location' => ['청사', '정부', '광장'], 'faq', 'board_list', 'board_view' => ['도시', '시민'], default => ['자연', '도시'] };
        $im = $this->img(['sub-visual'], $tags, 3);
        $bg = $im ? ' style="background-image:linear-gradient(90deg,rgba(10,20,40,.72),rgba(10,20,40,.25)),url(\'' . self::e($im['url']) . '\')"' : '';
        return '<section class="pg-visual' . ($im ? ' has-img' : '') . '"' . $bg . '><div class="pg-inner"><p class="pg-visual-kicker">' . self::e($this->p['org']) . '</p><p class="pg-visual-title">' . self::e($m['title']) . '</p></div></section>';
    }

    private function lnb(array $m): string
    {
        $this->blocks[] = 'lnb';
        $li = implode('', array_map(fn ($l) => '<li class="lnb-item' . ($l === $m['page'] ? ' active' : '') . '" role="none"><a href="#" class="lnb-btn lnb-link" role="menuitem"' . ($l === $m['page'] ? ' aria-current="page"' : '') . '>' . self::e($l) . '</a></li>', $m['items']));
        return '<nav class="krds-side-navigation pg-lnb" aria-label="' . self::e($m['title']) . ' 하위 메뉴"><h2 class="lnb-tit">' . self::e($m['title']) . '</h2><ul class="lnb-list" role="menubar">' . $li . '</ul></nav>';
    }

    private function titleBar(array $m): string
    {
        $this->blocks[] = 'breadcrumb';
        $this->blocks[] = 'page_title';
        return '<div class="pg-titlebar"><nav class="krds-breadcrumb-wrap" aria-label="현재 경로"><ol class="breadcrumb"><li class="home"><a href="#" class="txt">홈</a></li><li><a href="#" class="txt">' . self::e($m['title']) . '</a></li><li><a href="#" class="txt" aria-current="page">' . self::e($m['page']) . '</a></li></ol></nav>'
            . '<div class="pg-title-row"><h2 class="pg-title">' . self::e($m['page']) . '</h2><div class="pg-title-tools"><button type="button" class="pg-ico sm" aria-label="공유">' . self::icon('share') . '</button><button type="button" class="pg-ico sm" aria-label="인쇄">' . self::icon('print') . '</button></div></div></div>';
    }

    private function contentTabs(array $labels, string $active): string
    {
        $this->blocks[] = 'content_tabs';
        $li = implode('', array_map(fn ($l, $i) => '<li role="tab" aria-selected="' . ($l === $active ? 'true' : 'false') . '"' . ($l === $active ? ' class="active"' : '') . '><button type="button" class="btn-tab">' . self::e($l) . '</button></li>', $labels, array_keys($labels)));
        return '<div class="krds-tab-area pg-tabs"><div class="tab line full"><ul role="tablist">' . $li . '</ul></div></div>';
    }

    private function select(string $label, array $opts, string $cur): string
    {
        // 네이티브 select 금지 — 버튼 + 목록 (PREFERENCES)
        $li = implode('', array_map(fn ($o) => '<li role="option" aria-selected="' . ($o === $cur ? 'true' : 'false') . '">' . self::e($o) . '</li>', $opts));
        return '<div class="pg-select" data-select><button type="button" class="pg-select-btn" aria-haspopup="listbox" aria-expanded="false" aria-label="' . self::e($label) . '"><span>' . self::e($cur) . '</span>' . self::icon('down') . '</button><ul role="listbox" hidden>' . $li . '</ul></div>';
    }

    private function searchBar(string $placeholder, array $opts): string
    {
        return '<form class="pg-search" role="search" onsubmit="return false"><span class="pg-search-total"></span>' . $this->select('검색 범위', $opts, $opts[0])
            . '<input type="search" class="krds-input medium" placeholder="' . self::e($placeholder) . '" aria-label="검색어">'
            . '<button type="submit" class="krds-btn primary medium">검색</button></form>';
    }

    private function pagination(int $cur = 1, int $last = 129): string
    {
        $this->blocks[] = 'pagination';
        $links = '';
        for ($i = 1; $i <= 5; $i++) { $links .= '<a class="page-link' . ($i === $cur ? ' active' : '') . '" href="#"' . ($i === $cur ? ' aria-current="page"' : '') . '>' . $i . '</a>'; }
        return '<div class="krds-pagination pg-paging"><span class="page-navi prev disabled">이전</span><div class="page-links">' . $links . '<span class="page-link link-dot"></span><a class="page-link" href="#">' . $last . '</a></div><a class="page-navi next" href="#">다음</a></div>';
    }

    private function satisfaction(string $dept, bool $withDept = true): string
    {
        // 담당부서 줄은 render 가 본문보다 먼저 자리를 잡는다($withDept), 만족도 상자는 남은 자리가 있을 때만
        $sat = $this->fits('satisfaction', $withDept ? 161 : 225); // 담당부서 줄이 없으면 위 여백 64 도 이 상자 몫
        if (!$withDept && !$sat) { return ''; }
        $this->blocks[] = 'satisfaction';
        $opts = ['매우 만족', '만족', '보통', '불만족', '매우 불만족'];
        $r = implode('', array_map(fn ($o, $i) => '<div class="krds-form-check medium"><input type="radio" name="sat" id="sat' . $i . '" value="' . (5 - $i) . '"' . ($i === 0 ? ' checked' : '') . '><label for="sat' . $i . '">' . $o . '</label></div>', $opts, array_keys($opts)));
        return '<section class="pg-bottom">' . ($withDept ? '<dl class="pg-dept"><div><dt>담당부서</dt><dd>' . self::e($dept) . '</dd></div><div><dt>연락처</dt><dd>' . self::e($this->p['phone']) . '</dd></div><div><dt>최종 수정일</dt><dd>' . $this->date(2) . '</dd></div></dl>' : '')
            . ($sat ? '<div class="pg-sat"><h3>이 페이지에서 제공하는 정보에 만족하십니까?</h3><div class="pg-sat-row"><fieldset><legend class="sr-only">만족도</legend>' . $r . '</fieldset><input type="text" class="krds-input medium" placeholder="의견을 남겨 주세요 (100자 이내)" aria-label="의견"><button type="button" class="krds-btn secondary medium">평가하기</button></div></div>' : '') . '</section>';
    }

    private function footer(): string
    {
        $this->blocks[] = 'footer';
        $links = $this->gov() ? ['관련 누리집', '소속기관', '산하기관', '유관기관'] : ['시 산하기관', '읍·면·동', '유관기관', '관련 누리집'];
        $quick = implode('', array_map(fn ($l) => '<button type="button" class="link">' . $l . '</button>', $links));
        $fb = (string) ($this->ref['footer_bg'] ?? '');
        $dark = preg_match('/^#[0-9a-f]{6}$/', $fb) === 1; // 레퍼런스 푸터가 어두우면 같은 면색
        return '<footer id="krds-footer" class="pg-footer' . ($dark ? ' pg-footer--dark" style="--pg-foot:' . $fb : '') . '"><div class="foot-quick"><div class="inner">' . $quick . '</div></div><div class="inner"><div class="pg-f-logo">' . $this->logo() . '</div><div class="f-cnt"><div class="f-info"><p class="info-addr">' . self::e($this->p['address']) . '</p><ul class="info-cs"><li><strong class="strong">대표전화 ' . self::e($this->p['phone']) . '</strong><span class="span">(평일 09시~18시)</span></li><li><strong class="strong">팩스 ' . self::e($this->p['fax']) . '</strong></li></ul></div>'
            . '<div class="f-link"><div class="link-go"><a href="#" class="krds-btn medium text">찾아오시는 길</a><a href="#" class="krds-btn medium text">조직도</a><a href="#" class="krds-btn medium text">누리집 도우미</a></div></div></div>'
            . '<div class="f-btm"><div class="f-btm-text"><div class="f-menu"><a href="#" class="point">개인정보처리방침</a><a href="#">저작권 정책</a><a href="#">이용약관</a><a href="#">영상정보처리기기 운영·관리 방침</a></div><p class="f-copy">' . self::e($this->p['domain']) . ' · Copyright © ' . self::e($this->p['org']) . '. All rights reserved.</p></div></div></div></footer>';
    }

    // ── 유형별 본문 (1차 필수 부품) ────────────────────────
    private function boardTitles(): array
    {
        $o = $this->p['org'];
        return $this->gov()
            ? ["{$o} 2027년도 예산안 주요 내용 발표", "2026년 하반기 {$o} 공무직 근로자 채용 공고", '국민 정책 제안 공모전 결과 안내', '정부 청사 출입 절차 변경 안내', "{$o} 정책 연구용역 입찰 공고", '2026년 공공기관 고객만족도 조사 결과', '재난 대비 안전 점검 실시 계획', '위원회 위원 공개 모집 공고', '개인정보 처리방침 개정 안내', '정보공개 청구 처리 기준 변경 안내', '적극행정 우수 사례 공모 안내', '청년 정책 참여단 모집']
            : ['2027년도 본예산 편성 주민 의견 수렴 안내', "{$o} 공무직 근로자 공개채용 최종 합격자 발표", '가을철 산불 예방 행사 개최 안내', '어르신 무료 독감 예방접종 10월 시작', "{$o} 공공자전거 대여소 20곳 추가 설치", '전통시장 온누리상품권 환급 행사 운영', '노인일자리 참여자 추가 모집 공고', '공공시설 개방 시간 변경 안내', '지방세 납부 기간 안내', '청년 월세 한시 특별지원 신청 안내', '대형 폐기물 배출 방법 변경 안내', '어린이 보호구역 교통안전 캠페인'];
    }

    private function depts(): array
    {
        return $this->gov() ? ['기획조정실', '정책총괄과', '디지털정책과', '안전정책과', '대변인실', '운영지원과', '감사담당관', '국민소통과']
            : ['기획예산과', '행정지원과', '민원여권과', '복지정책과', '일자리경제과', '교통행정과', '문화관광과', '환경정책과'];
    }

    private function boardList(array $m): string
    {
        $this->blocks[] = 'board_table';
        $titles = $this->boardTitles(); $depts = $this->depts();
        $rows = '';
        foreach (array_slice($titles, 0, 10) as $i => $t) {
            $notice = $i < 2;
            $no = $notice ? '<span class="krds-badge bg-primary pg-badge">공지</span>' : (string) (1284 - $i);
            $att = $i % 3 === 0 ? '<span class="pg-att" aria-label="첨부파일 있음">' . self::icon('clip') . '</span>' : '';
            $rows .= '<tr' . ($notice ? ' class="is-notice"' : '') . '><td class="c">' . $no . '</td><td class="l"><a href="#">' . self::e($t) . '</a>' . ($i < 4 ? ' <span class="pg-new">N</span>' : '') . '</td><td class="c">' . self::e($depts[$i % count($depts)]) . '</td><td class="c">' . $this->date($i) . '</td><td class="r">' . number_format(1840 - $i * 137) . '</td><td class="c">' . $att . '</td></tr>';
        }
        return $this->contentTabs(array_slice($m['items'], 0, 4), $m['page'])
            . '<div class="pg-board-top"><p class="pg-count">전체 <strong>1,284</strong>건 <span>(1/129 페이지)</span></p>' . $this->searchBar('검색어를 입력하세요', ['제목', '내용', '제목+내용', '담당부서']) . '</div>'
            . '<div class="krds-table-wrap"><table class="tbl col data pg-table"><caption>' . self::e($m['page']) . ' 목록 — 번호, 제목, 담당부서, 등록일, 조회수, 첨부</caption><colgroup><col style="width:80px"><col><col style="width:150px"><col style="width:120px"><col style="width:90px"><col style="width:70px"></colgroup>'
            . '<thead><tr><th scope="col">번호</th><th scope="col">제목</th><th scope="col">담당부서</th><th scope="col">등록일</th><th scope="col">조회수</th><th scope="col">첨부</th></tr></thead><tbody>' . $rows . '</tbody></table></div>'
            . $this->pagination();
    }

    private function boardView(array $m): string
    {
        $this->blocks[] = 'board_view';
        $t = $this->boardTitles();
        $o = $this->p['org'];
        $paras = [
            "{$o}은(는) 주민 여러분의 의견을 반영하여 행정 서비스를 개선하고자 다음과 같이 안내드립니다.",
            '자세한 내용은 아래 첨부파일을 확인하여 주시기 바랍니다. 문의 사항은 담당부서로 연락 주시면 친절히 안내해 드리겠습니다.',
        ];
        $table = '<div class="krds-table-wrap"><table class="tbl row pg-table"><caption>개요 — 구분, 내용</caption><colgroup><col style="width:160px"><col></colgroup><tbody><tr><th scope="row">기간</th><td>' . $this->date(6) . ' ~ ' . $this->date(0) . '</td></tr><tr><th scope="row">대상</th><td>' . self::e($this->p['resident']) . ' 누구나</td></tr><tr><th scope="row">방법</th><td>누리집 온라인 신청 또는 방문 접수</td></tr><tr><th scope="row">문의</th><td>' . self::e($this->depts()[0]) . ' ' . self::e($this->p['phone']) . '</td></tr></tbody></table></div>';
        return '<article class="pg-view"><header class="pg-view-head"><h3>' . self::e($t[0]) . '</h3><dl class="pg-view-info"><div><dt>작성자</dt><dd>' . self::e($this->depts()[0]) . '</dd></div><div><dt>등록일</dt><dd>' . $this->date(0) . '</dd></div><div><dt>조회수</dt><dd>1,840</dd></div></dl></header>'
            . '<div class="pg-view-body"><p>' . self::e($paras[0]) . '</p>' . ($this->fits('table', 214) ? $table : '') . '<p>' . self::e($paras[1]) . '</p></div>'
            . ($this->fits('attach', 111) ? '<div class="pg-attach"><strong>첨부파일</strong><ul><li>' . self::icon('clip') . '<a href="#">' . self::e($t[0]) . ' 안내문.hwpx</a><span>(245KB)</span><a href="#" class="krds-btn small secondary">미리보기</a><a href="#" class="krds-btn small secondary">내려받기</a></li><li>' . self::icon('clip') . '<a href="#">신청서 서식.pdf</a><span>(118KB)</span><a href="#" class="krds-btn small secondary">미리보기</a><a href="#" class="krds-btn small secondary">내려받기</a></li></ul></div>' : '')
            . ($this->fits('prevnext', 112) ? '<dl class="pg-prevnext"><div><dt>이전글</dt><dd><a href="#">' . self::e($t[1]) . '</a></dd></div><div><dt>다음글</dt><dd><a href="#">' . self::e($t[2]) . '</a></dd></div></dl>' : '')
            . '<div class="pg-view-btns"><a href="#" class="krds-btn primary medium">목록</a></div></article>';
    }

    private function faq(array $m): string
    {
        $this->blocks[] = 'faq_accordion';
        $o = $this->p['org'];
        $qa = [
            ['민원', '민원서류는 어디에서 발급받을 수 있나요?', "가까운 행정복지센터 또는 정부24 누리집에서 발급받을 수 있습니다. 무인민원발급기는 {$o} 청사 1층과 지하철역 등 주요 장소에 설치되어 있습니다."],
            ['세금', '지방세 납부 기한이 지나면 어떻게 되나요?', '납부 기한이 지나면 가산금이 붙습니다. 위택스나 가상계좌로 바로 납부하실 수 있으며, 분할 납부가 필요하면 세무과로 문의해 주세요.'],
            ['복지', '기초연금은 누가 받을 수 있나요?', '만 65세 이상이고 소득인정액이 선정기준액 이하인 분이 받을 수 있습니다. 생일이 속한 달의 한 달 전부터 신청할 수 있습니다.'],
            ['교통', '공영주차장 월 정기권은 어떻게 신청하나요?', '누리집 통합예약 메뉴에서 매월 20일부터 다음 달 정기권을 신청할 수 있습니다. 잔여 면수가 없으면 대기 신청으로 등록됩니다.'],
            ['민원', '여권 발급에는 며칠이 걸리나요?', '접수일로부터 평일 기준 4~5일이 걸립니다. 긴급한 경우 긴급여권을 신청하실 수 있습니다.'],
            ['기타', '누리집 회원 탈퇴는 어떻게 하나요?', '로그인 후 나의 정보 메뉴에서 회원 탈퇴를 선택하시면 됩니다. 탈퇴 후에는 신청 내역을 확인할 수 없습니다.'],
            ['복지', '긴급 돌봄 서비스를 신청하고 싶어요.', '가족의 질병·사고 등으로 돌봄이 필요한 경우 행정복지센터에 신청하실 수 있습니다. 필요한 서류는 상담 후 안내해 드립니다.'],
            ['세금', '자동차세 연납 할인은 언제 신청하나요?', '1월·3월·6월·9월에 연납 신청이 가능하며, 신청 시기에 따라 공제율이 다릅니다.'],
        ];
        $items = '';
        foreach ($qa as $i => [$cat, $q, $a]) {
            $id = 'faq' . $i;
            $items .= '<div class="accordion-item' . ($i === 0 ? ' active' : '') . '"><h3 class="accordion-header"><button type="button" id="' . $id . 'h" class="btn-accordion' . ($i === 0 ? ' active' : '') . '" aria-controls="' . $id . 'c" aria-expanded="' . ($i === 0 ? 'true' : 'false') . '"><span class="pg-q">Q</span><span class="pg-cat">' . $cat . '</span>' . self::e($q) . '</button></h3><div id="' . $id . 'c" class="accordion-collapse collapse' . ($i === 0 ? ' show' : '') . '" aria-labelledby="' . $id . 'h"' . ($i === 0 ? '' : ' hidden') . '><div class="accordion-body"><span class="pg-a">A</span><p>' . self::e($a) . '</p></div></div></div>';
        }
        return $this->contentTabs(['전체', '민원', '세금', '복지', '교통', '기타'], '전체')
            . '<div class="pg-board-top"><p class="pg-count">전체 <strong>' . count($qa) . '</strong>건</p>' . $this->searchBar('궁금한 내용을 검색하세요', ['질문', '답변', '질문+답변']) . '</div>'
            . '<div class="krds-accordion pg-faq">' . $items . '</div>';
    }

    private function orgChart(array $m): string
    {
        $this->blocks[] = 'org_tree';
        $this->blocks[] = 'staff_table';
        $p = $this->p;
        $depts = $this->depts();
        $dx = implode('', array_map(fn ($d, $i) => '<li><strong>' . self::e($d) . '</strong><span>' . (3 + $i % 3) . '개 팀</span></li>', $depts, array_keys($depts)));
        $top = '<div class="pg-org"><div class="pg-org-top"><span>' . self::e($p['title']) . '</span></div><div class="pg-org-line"></div>'
            . '<div class="pg-org-mid"><div class="pg-org-side"><span>비서실</span><span>감사담당관</span></div><div class="pg-org-2"><span>' . ($this->gov() ? '차관' : '부' . self::e($p['title'])) . '</span></div><div class="pg-org-side"><span>대변인</span><span>정책보좌관</span></div></div><div class="pg-org-line"></div>'
            . '<ul class="pg-org-depts">' . $dx . '</ul></div>';
        $names = ['김서준', '이하은', '박도현', '최유진', '정민재', '한지우', '오세린', '윤태호'];
        $jobs = ['과 업무 총괄', '예산 편성 및 집행 관리', '주요 정책 기획 및 조정', '성과 관리 및 평가', '대외 협력 및 홍보', '민원 처리 및 안내', '자료 관리 및 통계', '행사 운영 지원'];
        $pos = ['과장', '팀장', '주무관', '주무관', '주무관', '주무관', '주무관', '주무관'];
        $rows = '';
        foreach ($names as $i => $n) {
            $rows .= '<tr><td class="c">' . $pos[$i] . '</td><td class="c">' . $n . '</td><td class="l">' . $jobs[$i] . '</td><td class="c">' . self::e(str_replace('5678', (string) (5700 + $i * 11), $p['phone'])) . '</td></tr>';
        }
        return $top
            . '<h3 class="pg-h3">부서별 담당자</h3>' . $this->contentTabs(array_slice($depts, 0, 5), $depts[0])
            . '<div class="krds-table-wrap"><table class="tbl col data pg-table"><caption>' . self::e($depts[0]) . ' 담당자 — 직위, 성명, 담당업무, 전화번호</caption><colgroup><col style="width:120px"><col style="width:120px"><col><col style="width:150px"></colgroup><thead><tr><th scope="col">직위</th><th scope="col">성명</th><th scope="col">담당업무</th><th scope="col">전화번호</th></tr></thead><tbody>' . $rows . '</tbody></table></div>';
    }

    /** 연혁 — 옛 기록 사진 2장 + 연대별 연혁(7차 archive-photo, 2026-10-01) */
    private function history(): string
    {
        $this->blocks[] = 'timeline';
        $o = $this->p['org'];
        $figs = '';
        foreach ([0, 1] as $k) {
            $im = $this->img(['archive-photo'], $k === 0 ? ['청사', '개청식'] : ['기공식', '항구', '농촌'], 40 + $k);
            if ($im) { $figs .= '<figure class="pg-fig"><img src="' . self::e($im['url']) . '" alt="' . self::e($im['alt']) . '" style="aspect-ratio:' . $im['w'] . '/' . $im['h'] . '"><figcaption>' . self::e($im['alt']) . '</figcaption></figure>'; }
        }
        $eras = [
            '2020년대' => [['2025', '디지털 민원 통합 창구 개통'], ['2023', '본사 신청사 이전'], ['2021', '탄소중립 경영 선언']],
            '2010년대' => [['2018', '조직 확대 개편(4본부 18처)'], ['2014', '고객만족도 최우수 기관 선정'], ['2011', '대국민 서비스 통합']],
            '2000년대 이전' => [['2004', '지역 사업단 신설'], ['1995', $o . ' 설립']],
        ];
        $tl = '';
        foreach ($eras as $era => $rows) {
            $tl .= '<h4 class="pg-era">' . $era . '</h4><ol class="pg-timeline">' . implode('', array_map(fn ($r) => '<li><strong>' . $r[0] . '</strong><span>' . self::e($r[1]) . '</span></li>', $rows)) . '</ol>';
        }
        return '<section class="pg-sec"><h3 class="pg-h3">걸어온 길</h3><p>' . self::e($o . '은(는) 1995년 설립 이후 국민의 삶과 가까운 곳에서 역할을 넓혀 왔습니다.') . '</p>'
            . ($figs !== '' ? '<div class="pg-hist-figs">' . $figs . '</div>' : '') . '</section>'
            . '<section class="pg-sec"><h3 class="pg-h3">연대별 연혁</h3>' . $tl . '</section>';
    }

    /** 찾아오시는 길 — 건물 일러스트 + 지도 자리 + 주소·교통 표(7차 building-illust, 2026-10-01) */
    private function location(): string
    {
        $this->blocks[] = 'location_map';
        $p = $this->p;
        $bld = $this->img(['building-illust'], [], 44);
        $fig = $bld ? '<figure class="pg-loc-bld"><img src="' . self::e($bld['url']) . '" alt="' . self::e($p['org'] . ' 청사 일러스트') . '"></figure>' : '';
        return '<section class="pg-sec"><h3 class="pg-h3">오시는 길</h3><div class="pg-loc">' . $fig
            . '<dl class="pg-dl"><dt>주소</dt><dd>' . self::e($p['address']) . '</dd><dt>대표전화</dt><dd>' . self::e($p['phone']) . '</dd><dt>팩스</dt><dd>' . self::e($p['fax']) . '</dd><dt>운영 시간</dt><dd>평일 09:00 ~ 18:00 (주말·공휴일 휴무)</dd></dl></div>'
            . '<div class="pg-map" role="img" aria-label="' . self::e($p['org']) . ' 위치 지도(예시)"></div></section>'
            . '<section class="pg-sec"><h3 class="pg-h3">교통 안내</h3><div class="krds-table-wrap"><table class="tbl col data pg-table"><caption>교통 안내 — 구분, 이용 방법, 비고</caption><colgroup><col style="width:140px"><col><col style="width:160px"></colgroup><thead><tr><th scope="col">구분</th><th scope="col">이용 방법</th><th scope="col">비고</th></tr></thead><tbody>'
            . '<tr><td class="c">지하철</td><td class="l">2호선 청사역 3번 출구에서 도보 7분</td><td class="c">엘리베이터 있음</td></tr>'
            . '<tr><td class="c">시내버스</td><td class="l">101·240·7012번 청사앞 정류장 하차</td><td class="c">저상버스 운행</td></tr>'
            . '<tr><td class="c">자가용</td><td class="l">내비게이션에 청사로 100 입력, 정문으로 진입</td><td class="c">민원인 2시간 무료</td></tr></tbody></table></div></section>';
    }

    private function greeting(array $m): string
    {
        $this->blocks[] = 'greeting';
        $g = $this->p['gender'] === 'female' ? '여성' : '남성';
        // 서명 이미지의 이름을 기관장 이름으로 — 사진·서명·이름이 한 사람이어야 한다
        // 홈페이지 한 벌이면 메인이 고른 서명·이름을 그대로 쓴다 — 페이지마다 다시 고르면 메인 '최지은'·인사말 '이서연'처럼 기관장이 달라진다 (2026-09-30 청주시 시안)
        $fixed = !empty($this->p['sig']) && !empty($this->p['name_locked']);
        $sigUrl = (string) ($this->p['sig'] ?? '');
        if (str_starts_with($sigUrl, '/')) { $sigUrl = self::abs($sigUrl); } // 저장한 파일(file://)로 열어도 보이게
        $sig = $fixed ? ['url' => $sigUrl, 'tags' => []] : $this->img(['signature'], [$g], 7);
        if ($sig !== null && !$fixed) {
            foreach ((array) $sig['tags'] as $t) { if (preg_match('/^[가-힣]{3}$/u', (string) $t) && !in_array($t, ['남성', '여성'], true)) { $this->p['name'] = $t; } }
        }
        $ph = $this->img(['leader'], [$g, '단색배경'], 9);
        $tpl = '<h3 class="pg-greet-title">[인사말 제목 — 한 문장]</h3><p>존경하는 [기관명] ' . self::e($this->p['resident']) . ' 여러분, 반갑습니다.</p><p>[1단락]</p><p>[2단락]</p><p>[3단락]</p>';
        $body = SampleContent::fill($tpl, $this->p, 3, 'greeting');
        return '<div class="pg-greet">' . ($ph ? '<figure class="pg-greet-photo"><img src="' . self::e($ph['url']) . '" alt="' . self::e($this->p['org'] . ' ' . $this->p['title'] . ' ' . $this->p['name']) . '"></figure>' : '')
            . '<div class="pg-greet-body">' . $body . '<p class="pg-greet-sign"><span>' . self::e($this->p['org'] . ' ' . $this->p['title']) . '</span><strong>' . self::e($this->p['name']) . '</strong>'
            . ($sig ? '<img src="' . self::e($sig['url']) . '" alt="' . self::e($this->p['name']) . ' 서명">' : '') . '</p></div></div>';
    }

    /**
     * 레퍼런스 본문 순서대로 (2026-09-29, 사용자: 미분류를 섹션 제목으로 데이터화 → MCP 목업 품질).
     * 섹션마다 유형에 맞는 KRDS 부품으로 다시 그린다. 제목은 레퍼런스 섹션 이름(실제 기관명은 가상화),
     * 글 내용은 옮기지 않고 가상 문구 — 복제가 아니라 "무엇이 어떤 순서로 있는가"만 따른다. 블록 2개 미만이면 null
     */
    private function ordered(array $m): ?string
    {
        $body = array_values(array_filter((array) ($this->ref['body'] ?? []), static fn ($b) => is_array($b)));
        if (count($body) < 2) { return null; }
        $o = $this->p['org']; $out = ''; $seen = []; $n = 0;
        foreach ($body as $i => $b) {
            if ($n >= 7) { break; }
            $t = (string) $b['type'];
            $name = trim($this->virt(preg_replace('/\s+/u', ' ', (string) ($b['name'] ?? '')) ?? ''));
            if ($name === '' || mb_strlen($name) > 40) { $name = ['content_block' => '안내', 'info_table' => '현황', 'photo_gallery' => '사진으로 보기', 'step_flow' => '처리 절차', 'contact_info' => '문의처', 'faq_list' => '자주 묻는 질문', 'location_map' => '오시는 길', 'timeline' => '연혁', 'notice_box' => '알려드립니다', 'board_list' => '관련 소식', 'form' => '신청'][$t] ?? '안내'; }
            if (isset($seen[$name]) || $name === ($m['page'] ?? '')) { continue; } // 페이지 제목과 같은 첫 섹션 제목은 제목 줄이 대신한다
            $seen[$name] = true; $n++;
            $h = '<h3 class="pg-h3">' . self::e($name) . '</h3>';
            $this->blocks[] = 'ref:' . $t;
            $out .= '<section class="pg-sec">' . match ($t) {
                'info_table' => $h . '<div class="krds-table-wrap"><table class="tbl col data pg-table"><caption>' . self::e($name) . ' — 구분, 내용, 비고</caption><colgroup><col style="width:140px"><col><col style="width:160px"></colgroup><thead><tr><th scope="col">구분</th><th scope="col">내용</th><th scope="col">비고</th></tr></thead><tbody>'
                    . '<tr><td class="c">대상</td><td class="l">관내 거주 ' . self::e($this->p['resident']) . '</td><td class="c">신청일 기준</td></tr><tr><td class="c">기간</td><td class="l">' . $this->date(20) . ' ~ ' . $this->date(0) . '</td><td class="c">예산 소진 시 마감</td></tr><tr><td class="c">방법</td><td class="l">방문 또는 온라인 신청</td><td class="c">-</td></tr></tbody></table></div>',
                'step_flow' => $h . '<div class="krds-step-wrap pg-steps"><ol>' . implode('', array_map(fn ($s, $k) => '<li' . ($k === 0 ? ' class="active"' : '') . '><span class="step">' . ($k + 1) . '단계</span><span class="step-tit">' . $s . '</span></li>', ['신청', '접수·검토', '결정', '결과 통보'], [0, 1, 2, 3])) . '</ol></div>',
                'contact_info' => $h . '<div class="pg-note" role="note"><ul><li>담당부서: ' . self::e($this->depts()[$i % count($this->depts())]) . '</li><li>전화: 000-000-' . sprintf('%04d', 1000 + $i * 37) . '</li><li>운영시간: 평일 09:00 ~ 18:00</li></ul></div>',
                'notice_box' => '<div class="pg-note" role="note"><strong>' . self::e($name) . '</strong><ul><li>자세한 사항은 담당부서로 문의해 주세요.</li><li>제출 서류는 발급일로부터 3개월 이내의 것이어야 합니다.</li></ul></div>',
                'timeline' => $h . '<ol class="pg-timeline">' . implode('', array_map(fn ($y, $k) => '<li><strong>' . $y . '</strong><span>' . ['조직 확대 개편', '신청사 이전', '주민 서비스 통합', '설립'][$k] . '</span></li>', ['2024', '2018', '2011', '1995'], [0, 1, 2, 3])) . '</ol>',
                'photo_gallery' => $h . '<ul class="pg-gallery">' . implode('', array_map(function ($k) { $im = $this->img(['place', 'news-thumb', 'citizen'], [], 30 + $k); return $im ? '<li><img src="' . self::e($im['url']) . '" alt="' . self::e($im['alt']) . '"><span>' . self::e($this->virt((string) ($im['title'] ?? $im['alt']))) . '</span></li>' : ''; }, [0, 1, 2, 3])) . '</ul>',
                'location_map' => $h . '<div class="pg-map" role="img" aria-label="' . self::e($o) . ' 위치 지도(예시)"></div><dl class="pg-dl"><dt>주소</dt><dd>' . self::e($o) . ' 청사로 00</dd><dt>대중교통</dt><dd>시내버스 정류장 하차 후 도보 5분</dd></dl>',
                'faq_list' => $h . '<div class="krds-accordion">' . '<div class="accordion-item"><h4 class="accordion-header"><button type="button" class="btn-accordion" aria-expanded="false"><span class="pg-q">Q</span>신청 자격이 어떻게 되나요?</button></h4></div><div class="accordion-item"><h4 class="accordion-header"><button type="button" class="btn-accordion" aria-expanded="false"><span class="pg-q">Q</span>처리 기간은 얼마나 걸리나요?</button></h4></div></div>',
                'board_list' => $h . '<ul class="pg-list">' . implode('', array_map(fn ($tt, $k) => '<li><a href="#">' . self::e($tt) . '</a><span>' . $this->date($k) . '</span></li>', array_slice($this->boardTitles(), 0, 4), [0, 1, 2, 3])) . '</ul>',
                default => $h . (preg_match('/다운로드|서식|양식|내려받기/u', $name)
                    ? '<p>' . self::e("{$name} 파일을 내려받아 작성한 뒤 제출해 주세요.") . '</p><a class="krds-btn medium secondary" href="#">' . self::e($name) . ' 내려받기</a>'
                    : ((int) ($b['items'] ?? 0) >= 2
                        ? '<ul class="pg-bullets">' . implode('', array_map(fn ($s) => '<li>' . self::e($s) . '</li>', $this->nextBullets(min(5, max(2, (int) $b['items']))))) . '</ul>'
                        : '<p>' . self::e("{$o}은(는) {$name}에 관한 사항을 다음과 같이 안내합니다. 세부 기준은 관련 법령과 조례에 따릅니다.") . '</p>')),
            } . '</section>';
        }
        return $n >= 2 ? $out : null;
    }

    /** 안내 목록 문장 — 블록마다 다른 조각을 돌려 쓴다(같은 문장이 블록마다 반복되면 복붙으로 보인다) */
    private int $bulletAt = 0;
    private function nextBullets(int $cnt): array { $o = self::bullets($this->bulletAt, $cnt); $this->bulletAt += $cnt; return $o; }
    private static function bullets(int $k, int $cnt): array
    {
        $pool = ['신청일 기준 관내에 주민등록을 둔 사람', '제출 서류는 발급일로부터 3개월 이내의 것', '대리 신청 시 위임장과 대리인 신분증 지참', '처리 결과는 문자로 안내', '세부 기준은 관련 법령과 조례에 따름',
            '온라인 신청은 공동인증서 또는 간편인증 필요', '수수료는 현금·카드 모두 납부 가능', '분실 신고 후 재발급까지 평일 기준 4~5일 소요', '외국 체류 중인 경우 재외공관에서 신청',
            '미성년자는 법정대리인 동의서 첨부', '접수 후 서류 보완 요청이 있을 수 있음', '방문 전 대기 현황을 확인하면 편리함', '주말·공휴일에는 접수하지 않음', '사진은 최근 6개월 이내 촬영한 것', '변경 사항은 누리집 공지로 안내'];
        $out = [];
        for ($i = 0; $i < $cnt; $i++) { $out[] = $pool[($k + $i) % count($pool)]; }
        return $out;
    }

    private function content(array $m): string
    {
        $ord = $this->ordered($m);
        if ($ord !== null) { return $ord; }
        $this->blocks[] = 'content_body';
        $o = $this->p['org'];
        $steps = ['신청서 작성', '서류 제출', '자격 검토', '결과 통보', '지원금 지급'];
        $st = implode('', array_map(fn ($s, $i) => '<li' . ($i === 0 ? ' class="active"' : '') . '><span class="step">' . ($i + 1) . '단계</span><span class="step-tit">' . $s . '</span></li>', $steps, array_keys($steps)));
        $img = $this->img(['infographic'], [], 11); // 절차 옆엔 안내 그래픽만 — 풍경 사진은 내용과 무관
        // 우선순위: 표 > 절차 > 그림. $fig 가 정의되지 않아 '한눈에 보기' 제목만 있는 빈 절이 나왔다(2026-10-14) — 그림이 있고 자리가 있을 때만 절째로
        $tbl = $this->fits('table', 275);
        $steps = $this->fits('steps', 205);
        $figH = $img && (int) ($img['w'] ?? 0) > 0 ? (int) round(1056 * (int) $img['h'] / (int) $img['w']) + 120 : 0;
        $fig = $figH > 0 && $this->fits('figure', $figH) ? '<figure class="pg-fig"><img src="' . self::e($img['url']) . '" alt="' . self::e($img['alt']) . '" style="aspect-ratio:' . $img['w'] . '/' . $img['h'] . '"><figcaption>' . self::e($img['alt']) . '</figcaption></figure>' : '';
        return '<section class="pg-sec"><h3 class="pg-h3">추진 배경</h3><p>' . self::e("{$o}은(는) 주민의 생활 안정과 지역 경제 활성화를 위해 다음과 같이 지원 사업을 추진합니다.") . '</p>'
            . '<div class="pg-note" role="note"><strong>알려드립니다</strong><ul><li>신청 기간: ' . $this->date(10) . ' ~ ' . $this->date(0) . '</li><li>예산 소진 시 조기 마감될 수 있습니다.</li></ul></div></section>'
            . ($tbl ? '<section class="pg-sec"><h3 class="pg-h3">지원 대상 및 내용</h3><div class="krds-table-wrap"><table class="tbl col data pg-table"><caption>지원 대상 및 내용 — 구분, 대상, 지원 내용, 비고</caption><colgroup><col style="width:120px"><col><col><col style="width:140px"></colgroup><thead><tr><th scope="col">구분</th><th scope="col">대상</th><th scope="col">지원 내용</th><th scope="col">비고</th></tr></thead><tbody>'
            . '<tr><td class="c">일반</td><td class="l">관내 거주 ' . self::e($this->p['resident']) . '</td><td class="l">1인당 최대 월 20만 원(최대 12개월)</td><td class="c">중복 불가</td></tr><tr><td class="c">우선</td><td class="l">청년·신혼부부·한부모 가구</td><td class="l">1인당 최대 월 30만 원(최대 12개월)</td><td class="c">서류 필요</td></tr><tr><td class="c">특례</td><td class="l">재난 피해 가구</td><td class="l">긴급 지원금 1회 100만 원</td><td class="c">심사 후 결정</td></tr></tbody></table></div></section>' : '')
            . ($steps ? '<section class="pg-sec"><h3 class="pg-h3">신청 절차</h3><div class="krds-step-wrap pg-steps"><ol>' . $st . '</ol></div></section>' : '')
            . ($fig !== '' ? '<section class="pg-sec"><h3 class="pg-h3">한눈에 보기</h3>' . $fig . '</section>' : '');
    }

    // ── 조립 ─────────────────────────────────────────────
    private function render(): array
    {
        $m = $this->menus();
        $dept = $this->depts()[crc32($this->p['org']) % count($this->depts())];
        // 높이 예산: 레퍼런스 본문 × 1.12 − 고정분(서브 비주얼 띠 + 본문 위아래 여백 128 + 경로·제목 줄 200) − 유형별 필수 본문.
        // 담당부서 줄(위 여백 64 포함 123)은 본문 선택 블록보다 먼저 자리를 잡는다 — 레퍼런스 안내 화면에도 대개 있다
        $visual = $this->subVisual($m);
        $bodyH = (int) ($this->ref['body_h'] ?? 0);
        if ($bodyH > 300) {
            $this->room = (int) round($bodyH * 1.12) - (str_contains($visual, 'pg-visual--tint') ? 150 : 200) - 328 - (self::BASE[$this->type] ?? 0);
        }
        $withDept = $this->fits('dept', 123);
        $body = match ($this->type) {
            'board_list' => $this->boardList($m),
            'board_view' => $this->boardView($m),
            'faq' => $this->faq($m),
            'org_chart' => $this->orgChart($m),
            'greeting' => $this->greeting($m),
            'history' => $this->history(),
            'location' => $this->location(),
            default => $this->content($m),
        };
        $html = $this->masthead() . $this->header($m) . $visual
            . '<div class="pg-inner pg-body">' . $this->lnb($m) . '<main id="content" class="pg-main">' . $this->titleBar($m) . $body . $this->satisfaction($dept, $withDept) . '</main></div>'
            . $this->footer();
        $doc = "<!doctype html>\n<html lang=\"ko\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>" . self::e($m['page'] . ' | ' . $this->p['org']) . "</title>\n"
            . WebFont::head([WebFont::canonical((string) preg_replace("/^'([^']+)'.*/", '$1', (string) ($this->tok['font'] ?? '')))]) . "\n"
            . '<link rel="stylesheet" href="' . self::kitCss() . '">' . "\n<style>" . $this->skin() . CssPrune::prune(self::CSS, $html, 'pg-', ['pg-skip']) . MockSearch::CSS . "</style></head>\n<body class=\"hb-kit\">\n<a class=\"pg-skip\" href=\"#content\">본문 바로가기</a>\n{$html}\n<script>" . self::JS . "</script><script>" . MockSearch::JS . "</script>\n</body></html>";
        return ['html' => $doc, 'composition' => ['layout' => 'kit_subpage', 'type' => $this->type, 'blocks' => $this->blocks, 'menu' => $m] + ($this->cut ? ['cut_for_height' => $this->cut] : []), 'samples' => array_values($this->samples)];
    }

    /** 2차 스킨 — 레퍼런스 주색·글꼴·모서리를 KRDS 변수와 페이지 변수로 */
    private function skin(): string
    {
        $hex = (string) ($this->tok['primary'] ?? '#1D4ED8');
        if (!preg_match('/^#[0-9a-f]{6}$/i', $hex)) { $hex = '#1D4ED8'; }
        $n = hexdec(substr($hex, 1));
        $rgb = [($n >> 16) & 255, ($n >> 8) & 255, $n & 255];
        $mix = static function (array $t, float $w) use ($rgb): string { $o = '#'; foreach ($rgb as $i => $c) { $o .= str_pad(dechex((int) round($c + ($t[$i] - $c) * $w)), 2, '0', STR_PAD_LEFT); } return $o; };
        $steps = [[5, [255, 255, 255], .92], [10, [255, 255, 255], .84], [20, [255, 255, 255], .66], [30, [255, 255, 255], .46], [40, [255, 255, 255], .22], [50, [0, 0, 0], 0], [60, [0, 0, 0], .2], [70, [0, 0, 0], .42], [80, [0, 0, 0], .6], [90, [0, 0, 0], .76], [95, [0, 0, 0], .84]];
        $v = '';
        foreach ($steps as [$s, $t, $w]) { $v .= "--krds-color-light-primary-{$s}:" . $mix($t, $w) . ";--krds-color-light-secondary-{$s}:" . $mix($t, min(.95, $w + ($s >= 50 ? .25 : 0))) . ';'; }
        // 대비: 흰 바탕 위 글자로 쓸 주색이 4.5:1 미만이면 한 단계 어둡게
        $lum = static function (array $c): float { $f = static fn ($x) => ($x /= 255) <= .03928 ? $x / 12.92 : (($x + .055) / 1.055) ** 2.4; return .2126 * $f($c[0]) + .7152 * $f($c[1]) + .0722 * $f($c[2]); };
        $ink = (1.05 / ($lum($rgb) + .05)) >= 4.5 ? $hex : $mix([0, 0, 0], .35);
        $r = max(0, min(16, (int) ($this->tok['radius'] ?? 8)));
        $w = max(ReplicaKit::MIN_W, min(1600, (int) ($this->tok['container'] ?? 1280)));
        foreach (['xsmall1', 'xsmall2', 'xsmall3', 'small1', 'small2', 'small3'] as $k) { $v .= "--krds-radius-{$k}:" . min($r, 6) . 'px;'; }
        foreach (['medium1', 'medium2', 'medium3', 'medium4', 'large1', 'large2'] as $k) { $v .= "--krds-radius-{$k}:{$r}px;"; }
        return ".hb-kit,:root{{$v}--pg-p:{$hex};--pg-ink:{$ink};--pg-p-l:" . $mix([255, 255, 255], .92) . ";--pg-r:{$r}px;--pg-w:{$w}px;--pg-font:" . ($this->tok['font'] ?? "'Pretendard GOV',sans-serif") . '}';
    }

    private static function icon(string $n): string
    {
        if (MaterialIcon::has($n)) { return MaterialIcon::svg($n); }
        $d = [
            'search' => '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
            'menu' => '<path d="M4 6h16M4 12h16M4 18h16"/>',
            'share' => '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
            'print' => '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>',
            'clip' => '<path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
            'down' => '<path d="m6 9 6 6 6-6"/>',
            'close' => '<path d="M6 6l12 12M18 6 6 18"/>',
        ][$n] ?? '';
        return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' . $d . '</svg>';
    }

    private const CSS = <<<'CSS'
body.hb-kit .pg-bullets{margin:0;padding:16px 20px 16px 36px;border:1px solid #e1e6eb;border-radius:var(--pg-radius,8px)}body.hb-kit .pg-bullets li{margin:4px 0}
body.hb-kit .pg-timeline{list-style:none;margin:0;padding:0 0 0 18px;border-left:2px solid var(--krds-color-light-primary-50,#256ef4)}body.hb-kit .pg-timeline li{position:relative;display:flex;gap:16px;padding:10px 0}body.hb-kit .pg-timeline li::before{content:"";position:absolute;left:-25px;top:17px;width:10px;height:10px;border-radius:50%;background:var(--krds-color-light-primary-50,#256ef4)}body.hb-kit .pg-timeline strong{min-width:56px}
body.hb-kit .pg-gallery{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}body.hb-kit .pg-gallery img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--pg-radius,8px);display:block}body.hb-kit .pg-gallery span{display:block;margin-top:8px;font-size:15px}
body.hb-kit .pg-map{height:280px;border-radius:var(--pg-radius,8px);background:repeating-linear-gradient(45deg,#eef1f4 0 12px,#e5e9ee 12px 24px);margin-bottom:16px}body.hb-kit .pg-dl{display:grid;grid-template-columns:120px 1fr;gap:8px 16px;margin:0}body.hb-kit .pg-dl dt{font-weight:700}body.hb-kit .pg-dl dd{margin:0}
body.hb-kit .pg-list{list-style:none;margin:0;padding:0;border-top:2px solid #1e2124}body.hb-kit .pg-list li{display:flex;justify-content:space-between;gap:16px;padding:14px 4px;border-bottom:1px solid #e1e6eb}body.hb-kit .pg-list a{color:inherit;text-decoration:none}body.hb-kit .pg-list span{color:#6d7882;white-space:nowrap}
@media (max-width:760px){body.hb-kit .pg-gallery{grid-template-columns:repeat(2,minmax(0,1fr))}}
body.hb-kit .pg-table thead th{background:#f4f5f6!important;text-align:center!important;color:#1e2124}
body.hb-kit .pg-table td.c{text-align:center!important}body.hb-kit .pg-table td.l{text-align:left!important}body.hb-kit .pg-table td.r{text-align:right!important}
body.hb-kit .pg-titlebar .breadcrumb a{text-decoration:none!important;color:#6d7882}body.hb-kit .pg-titlebar .breadcrumb [aria-current]{color:#1e2124;font-weight:600}
body.hb-kit .pg-paging{display:flex;align-items:center;justify-content:center;gap:6px}
body.hb-kit .pg-paging .page-navi{display:inline-flex!important;align-items:center;height:40px;margin:0!important;padding:0 12px!important;font-size:15px;line-height:1;vertical-align:middle}
body.hb-kit .pg-paging .page-navi::before,body.hb-kit .pg-paging .page-navi::after{display:none!important}
body.hb-kit .pg-paging .link-dot{font-size:15px!important;color:#6d7882}body.hb-kit .pg-paging .link-dot{-webkit-mask:none!important;mask:none!important;background:none!important;display:inline-flex!important;align-items:center;justify-content:center}body.hb-kit .pg-paging .link-dot::before{content:'';display:inline-block!important;width:18px;height:18px;background:currentColor;-webkit-mask:url(data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%20-960%20960%20960%22%3E%3Cpath%20d%3D%22M207.86-432Q188-432%20174-446.14t-14-34Q160-500%20174.14-514t34-14Q228-528%20242-513.86t14%2034Q256-460%20241.86-446t-34%2014Zm272%200Q460-432%20446-446.14t-14-34Q432-500%20446.14-514t34-14Q500-528%20514-513.86t14%2034Q528-460%20513.86-446t-34%2014Zm272%200Q732-432%20718-446.14t-14-34Q704-500%20718.14-514t34-14Q772-528%20786-513.86t14%2034Q800-460%20785.86-446t-34%2014Z%22%2F%3E%3C%2Fsvg%3E) center/contain no-repeat;mask:url(data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%20-960%20960%20960%22%3E%3Cpath%20d%3D%22M207.86-432Q188-432%20174-446.14t-14-34Q160-500%20174.14-514t34-14Q228-528%20242-513.86t14%2034Q256-460%20241.86-446t-34%2014Zm272%200Q460-432%20446-446.14t-14-34Q432-500%20446.14-514t34-14Q500-528%20514-513.86t14%2034Q528-460%20513.86-446t-34%2014Zm272%200Q732-432%20718-446.14t-14-34Q704-500%20718.14-514t34-14Q772-528%20786-513.86t14%2034Q800-460%20785.86-446t-34%2014Z%22%2F%3E%3C%2Fsvg%3E) center/contain no-repeat;vertical-align:middle}
body.hb-kit .pg-sat fieldset{display:flex;gap:18px;flex-wrap:wrap}body.hb-kit .pg-sat .krds-form-check{display:flex;align-items:center}
body.hb-kit #krds-footer .f-cnt .f-link,body.hb-kit #krds-footer .f-cnt .f-link .link-go{display:flex!important;flex-direction:row!important;gap:8px;align-items:flex-start}
body.hb-kit{margin:0;font-family:var(--pg-font);color:#1e2124;background:#fff;word-break:keep-all;overflow-wrap:break-word}
[hidden]{display:none!important}
.hb-kit a{color:inherit;text-decoration:none}
.pg-skip{position:absolute;left:-9999px}.pg-skip:focus{left:16px;top:8px;z-index:99;background:#fff;padding:8px 12px}
.pg-inner{max-width:var(--pg-w);margin:0 auto;padding:0 24px;box-sizing:border-box}
#krds-masthead .inner{max-width:var(--pg-w);margin:0 auto;padding:0 24px}
.pg-header{border-bottom:1px solid #e1e3e6;background:#fff}
.pg-util{background:#f4f5f6;font-size:13px}.pg-util ul{display:flex;justify-content:flex-end;gap:20px;list-style:none;margin:0;padding:8px 0}.pg-util a{color:#464c53}
.pg-brand{display:flex;align-items:center;gap:48px;height:88px}
.pg-logo{margin:0;flex:none}.pg-logo a{display:flex;align-items:center;gap:10px}.pg-logo-img{height:40px;width:auto;display:block}
.pg-logo-mark svg{width:36px;height:36px;display:block}.pg-logo-txt{font-size:22px;font-weight:800;letter-spacing:-.02em}
.pg-gnb{flex:1}.pg-gnb ul{display:flex;justify-content:center;gap:clamp(20px,3vw,48px);list-style:none;margin:0;padding:0}
.pg-gnb a{display:block;font-size:18px;font-weight:700;padding:30px 0;border-bottom:3px solid transparent;white-space:nowrap}
.pg-gnb a.active,.pg-gnb a:hover{color:var(--pg-ink);border-bottom-color:var(--pg-p)}
.pg-actions{display:flex;gap:8px}
.pg-ico{display:grid;place-items:center;width:44px;height:44px;border:1px solid #d6d9dd;border-radius:var(--pg-r);background:#fff;cursor:pointer;color:#1e2124}
.pg-ico.sm{width:36px;height:36px}.pg-ico:hover{border-color:var(--pg-p);color:var(--pg-ink)}
.pg-visual{background:var(--pg-p);background-size:cover;background-position:center;color:#fff}
.pg-visual .pg-inner{height:200px;display:flex;flex-direction:column;justify-content:center;gap:6px}
.pg-visual--tint{background:var(--pg-p-l);color:var(--pg-ink)}.pg-visual--tint .pg-inner{height:150px}
.pg-visual-kicker{margin:0;font-size:15px;opacity:.85}.pg-visual-title{margin:0;font-size:36px;font-weight:800;letter-spacing:-.02em}
.pg-body{display:grid;grid-template-columns:240px minmax(0,1fr);gap:56px;align-items:start;padding-top:48px;padding-bottom:80px}
.pg-lnb.krds-side-navigation{position:sticky;top:24px}
.pg-lnb .lnb-tit{margin:0;padding:22px 20px;font-size:21px;font-weight:800;background:var(--pg-p);color:#fff;border-radius:var(--pg-r) var(--pg-r) 0 0}
.pg-lnb .lnb-list{list-style:none;margin:0;padding:0;border:1px solid #e1e3e6;border-top:0;border-radius:0 0 var(--pg-r) var(--pg-r)}
.pg-lnb .lnb-item{border-top:1px solid #eef0f2}.pg-lnb .lnb-item:first-child{border-top:0}
.pg-lnb .lnb-btn{display:block;padding:15px 20px;font-size:16px;color:#33363d}
.pg-lnb .lnb-item.active .lnb-btn{color:var(--pg-ink);font-weight:700;background:var(--pg-p-l)}
.pg-lnb .lnb-btn:hover{color:var(--pg-ink)}
.pg-titlebar{border-bottom:2px solid #1e2124;padding-bottom:20px;margin-bottom:32px}
.pg-titlebar .breadcrumb{display:flex;gap:8px;list-style:none;margin:0 0 14px;padding:0;font-size:14px;color:#6d7882}
.pg-titlebar .breadcrumb li{display:inline-flex;align-items:center}.pg-titlebar .breadcrumb li::after{display:none!important}.pg-titlebar .breadcrumb li+li::before{content:'';display:inline-block;width:16px;height:16px;background:#b1b8be;-webkit-mask:url(data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%20-960%20960%20960%22%3E%3Cpath%20d%3D%22M530-481%20332-679l43-43%20241%20241-241%20241-43-43%20198-198Z%22%2F%3E%3C%2Fsvg%3E) center/contain no-repeat;mask:url(data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%20-960%20960%20960%22%3E%3Cpath%20d%3D%22M530-481%20332-679l43-43%20241%20241-241%20241-43-43%20198-198Z%22%2F%3E%3C%2Fsvg%3E) center/contain no-repeat;vertical-align:middle;margin-right:6px}
.pg-title-row{display:flex;justify-content:space-between;align-items:flex-end;gap:16px}
.pg-title{margin:0;font-size:32px;font-weight:800;letter-spacing:-.02em}.pg-title-tools{display:flex;gap:6px}
.pg-tabs{margin-bottom:28px}.pg-tabs ul{display:flex;list-style:none;margin:0;padding:0;border-bottom:1px solid #d6d9dd}
.pg-tabs li{flex:1}.pg-tabs .btn-tab{width:100%;height:52px;border:0;background:none;font:inherit;font-size:16px;color:#58616a;cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-1px}
.pg-tabs li.active .btn-tab{color:var(--pg-ink);font-weight:700;border-bottom-color:var(--pg-p)}
.pg-board-top{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:16px;flex-wrap:wrap}
.pg-count{margin:0;font-size:15px}.pg-count strong{color:var(--pg-ink)}.pg-count span{color:#6d7882}
.pg-search{display:flex;gap:8px;align-items:center}.pg-search-total{display:none}
.pg-search .krds-input{height:44px;width:260px;box-sizing:border-box;border:1px solid #b1b8be;border-radius:var(--pg-r);padding:0 14px;font:inherit}
.pg-search .krds-btn,.pg-sat .krds-btn{height:44px;padding:0 22px}
.pg-select{position:relative}.pg-select-btn{height:44px;min-width:130px;display:flex;justify-content:space-between;align-items:center;gap:8px;padding:0 12px 0 14px;border:1px solid #b1b8be;border-radius:var(--pg-r);background:#fff;font:inherit;cursor:pointer}
.pg-select ul{position:absolute;left:0;right:0;top:calc(100% + 4px);margin:0;padding:4px;list-style:none;background:#fff;border:1px solid #d6d9dd;border-radius:var(--pg-r);box-shadow:0 8px 24px rgba(0,0,0,.1);z-index:5}
.pg-select li{padding:9px 10px;border-radius:4px;cursor:pointer}.pg-select li[aria-selected=true],.pg-select li:hover{background:var(--pg-p-l);color:var(--pg-ink)}
.pg-table{width:100%;border-collapse:collapse;font-size:15px}.pg-table caption{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.pg-table thead th{background:#f4f5f6;border-top:2px solid #1e2124;border-bottom:1px solid #d6d9dd;padding:14px 10px;font-weight:700;text-align:center}
.pg-table td,.pg-table tbody th{border-bottom:1px solid #e6e8ea;padding:15px 10px;vertical-align:middle}
.pg-table tbody th{background:#f7f8f9;text-align:center;font-weight:700;width:160px}
.pg-table .c{text-align:center}.pg-table .l{text-align:left}.pg-table .r{text-align:right}
.pg-table .l a:hover{text-decoration:underline;color:var(--pg-ink)}.pg-table tr.is-notice{background:var(--pg-p-l)}
.pg-badge{display:inline-flex;align-items:center;height:24px;padding:0 8px;border-radius:4px;background:var(--pg-p);color:#fff;font-size:13px;font-weight:700}
.pg-new{display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;background:#e0442f;color:#fff;font-size:11px;font-weight:700;vertical-align:1px}
.pg-att{color:#6d7882;display:inline-flex}
.pg-paging{display:flex;justify-content:center;align-items:center;gap:6px;margin-top:36px}
.pg-paging .page-links{display:flex;gap:4px}.pg-paging .page-link,.pg-paging .page-navi{min-width:40px;height:40px;display:inline-grid;place-items:center;border-radius:var(--pg-r);font-size:15px;padding:0 10px;box-sizing:border-box}
.pg-paging .page-link.active{background:var(--pg-p);color:#fff;font-weight:700}.pg-paging .page-link:hover{background:#f4f5f6}
.pg-paging .link-dot::before{content:'';display:inline-block;width:18px;height:18px;background:currentColor;-webkit-mask:url(data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%20-960%20960%20960%22%3E%3Cpath%20d%3D%22M207.86-432Q188-432%20174-446.14t-14-34Q160-500%20174.14-514t34-14Q228-528%20242-513.86t14%2034Q256-460%20241.86-446t-34%2014Zm272%200Q460-432%20446-446.14t-14-34Q432-500%20446.14-514t34-14Q500-528%20514-513.86t14%2034Q528-460%20513.86-446t-34%2014Zm272%200Q732-432%20718-446.14t-14-34Q704-500%20718.14-514t34-14Q772-528%20786-513.86t14%2034Q800-460%20785.86-446t-34%2014Z%22%2F%3E%3C%2Fsvg%3E) center/contain no-repeat;mask:url(data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%20-960%20960%20960%22%3E%3Cpath%20d%3D%22M207.86-432Q188-432%20174-446.14t-14-34Q160-500%20174.14-514t34-14Q228-528%20242-513.86t14%2034Q256-460%20241.86-446t-34%2014Zm272%200Q460-432%20446-446.14t-14-34Q432-500%20446.14-514t34-14Q500-528%20514-513.86t14%2034Q528-460%20513.86-446t-34%2014Zm272%200Q732-432%20718-446.14t-14-34Q704-500%20718.14-514t34-14Q772-528%20786-513.86t14%2034Q800-460%20785.86-446t-34%2014Z%22%2F%3E%3C%2Fsvg%3E) center/contain no-repeat;vertical-align:middle}.pg-paging .disabled{color:#b1b8be}
.pg-bottom{margin-top:64px;border:1px solid #e1e3e6;border-radius:var(--pg-r);overflow:hidden}
.pg-dept{display:flex;flex-wrap:wrap;gap:8px 32px;margin:0;padding:18px 24px;background:#f7f8f9;font-size:15px}.pg-dept div{display:flex;gap:8px}.pg-dept dt{color:#6d7882}.pg-dept dd{margin:0;font-weight:700}
.pg-sat{padding:22px 24px}.pg-sat h3{margin:0 0 14px;font-size:17px}
.pg-sat-row{display:flex;flex-wrap:wrap;gap:12px;align-items:center}.pg-sat fieldset{border:0;margin:0;padding:0;display:flex;gap:16px}
.pg-radio{display:flex;align-items:center;gap:6px;font-size:15px;cursor:pointer}.pg-radio input{accent-color:var(--pg-p);width:18px;height:18px}
.pg-sat .krds-input{flex:1;min-width:220px;height:44px;box-sizing:border-box;border:1px solid #b1b8be;border-radius:var(--pg-r);padding:0 14px;font:inherit}
.pg-view-head{border-top:2px solid #1e2124;border-bottom:1px solid #d6d9dd;padding:22px 4px}
.pg-view-head h3{margin:0 0 12px;font-size:24px;letter-spacing:-.02em}
.pg-view-info{display:flex;gap:28px;margin:0;font-size:14px;color:#58616a}.pg-view-info div{display:flex;gap:6px}.pg-view-info dd{margin:0}
.pg-view-body{padding:32px 4px;font-size:17px;line-height:1.75;border-bottom:1px solid #e6e8ea}.pg-view-body p{margin:0 0 20px}
.pg-hist-figs{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:16px}.pg-hist-figs .pg-fig{margin:0}.pg-era{margin:20px 0 8px;font-size:17px}.pg-loc{display:grid;grid-template-columns:minmax(0,320px) 1fr;gap:28px;align-items:center;margin-bottom:20px}.pg-loc-bld{margin:0}body.hb-kit .pg-loc-bld img{width:100%!important;max-width:none!important;height:auto;display:block}@media(max-width:720px){.pg-hist-figs,.pg-loc{grid-template-columns:1fr}}.pg-fig{margin:0 0 24px}body.hb-kit .pg-fig img{width:100%!important;max-width:none!important;height:auto;display:block;border-radius:var(--pg-r)}.pg-fig figcaption{margin-top:8px;font-size:14px;color:#6d7882}.pg-view .pg-fig{max-width:640px}
.pg-attach{display:grid;grid-template-columns:120px 1fr;gap:16px;padding:18px 20px;background:#f7f8f9;border-bottom:1px solid #e6e8ea}
.pg-attach ul{list-style:none;margin:0;padding:0;display:grid;gap:10px}.pg-attach li{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.pg-attach li span{color:#6d7882;font-size:14px}.pg-attach .krds-btn{height:32px;padding:0 12px;font-size:14px}
.pg-attach li>a:first-of-type{text-decoration:underline}
.pg-prevnext{margin:0;border-bottom:1px solid #d6d9dd}.pg-prevnext div{display:grid;grid-template-columns:120px 1fr;padding:16px 20px;border-top:1px solid #e6e8ea}.pg-prevnext dt{color:#6d7882}.pg-prevnext dd{margin:0}
.pg-view-btns{display:flex;justify-content:flex-end;margin-top:24px}.pg-view-btns .krds-btn{height:48px;padding:0 32px}
.pg-faq .accordion-item{border-bottom:1px solid #e1e3e6}.pg-faq .accordion-item:first-child{border-top:2px solid #1e2124}
.pg-faq h3{margin:0}.pg-faq .btn-accordion{width:100%;display:flex;align-items:center;gap:12px;padding:20px 48px 20px 16px;border:0;background:none;font:inherit;font-size:17px;font-weight:600;text-align:left;cursor:pointer;position:relative}
.pg-faq .btn-accordion::after{content:'';position:absolute;right:20px;top:50%;width:10px;height:10px;border-right:2px solid #58616a;border-bottom:2px solid #58616a;transform:translateY(-70%) rotate(45deg);transition:transform .2s}
.pg-faq .btn-accordion[aria-expanded=true]::after{transform:translateY(-30%) rotate(-135deg)}
.pg-q,.pg-a{flex:none;display:grid;place-items:center;width:32px;height:32px;border-radius:50%;font-weight:800;font-size:15px}
.pg-q{background:var(--pg-p);color:#fff}.pg-a{background:#f4f5f6;color:var(--pg-ink)}
.pg-cat{flex:none;font-size:13px;color:var(--pg-ink);background:var(--pg-p-l);padding:3px 8px;border-radius:4px}
.pg-faq .accordion-body{display:flex;gap:12px;padding:20px 20px 24px 16px;background:#f7f8f9;font-size:16px;line-height:1.7}.pg-faq .accordion-body p{margin:4px 0 0}
.pg-org{padding:36px 24px;border:1px solid #e1e3e6;border-radius:var(--pg-r);margin-bottom:48px;text-align:center}
.pg-org-top span,.pg-org-2 span{display:inline-block;min-width:180px;padding:16px 24px;border-radius:var(--pg-r);background:var(--pg-p);color:#fff;font-size:18px;font-weight:800}
.pg-org-2 span{background:#fff;color:var(--pg-ink);border:2px solid var(--pg-p)}
.pg-org-line{width:2px;height:28px;margin:0 auto;background:#b1b8be}
.pg-org-mid{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:24px}.pg-org-side{display:flex;flex-direction:column;gap:8px}
.pg-org-side:first-child{align-items:flex-end}.pg-org-side:last-child{align-items:flex-start}
.pg-org-side span{padding:10px 18px;border:1px solid #d6d9dd;border-radius:var(--pg-r);background:#f7f8f9;font-weight:600;min-width:120px}
.pg-org-depts{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;list-style:none;margin:0;padding:24px 0 0;border-top:2px solid #b1b8be}
.pg-org-depts li{display:flex;flex-direction:column;gap:4px;padding:16px 12px;border:1px solid #d6d9dd;border-top:3px solid var(--pg-p);border-radius:var(--pg-r)}
.pg-org-depts strong{font-size:16px}.pg-org-depts span{font-size:13px;color:#6d7882}
.pg-h3{font-size:22px;margin:0 0 16px;letter-spacing:-.02em;padding-left:14px;position:relative}.pg-h3::before{content:'';position:absolute;left:0;top:.2em;bottom:.2em;width:4px;border-radius:2px;background:var(--pg-p)}
.pg-sec{margin-bottom:48px}.pg-sec>p{font-size:17px;line-height:1.75;margin:0 0 16px}
.pg-note{border:1px solid var(--pg-p);background:var(--pg-p-l);border-radius:var(--pg-r);padding:18px 22px}.pg-note strong{color:var(--pg-ink)}.pg-note ul{margin:8px 0 0;padding-left:20px;line-height:1.8}
body.hb-kit .pg-steps ol{display:grid!important;grid-template-columns:repeat(5,1fr)!important;gap:12px;list-style:none;margin:0 0 24px;padding:0;width:100%}
body.hb-kit .pg-steps li{width:auto!important;flex:none!important;margin:0!important}
.pg-steps li{display:flex;flex-direction:column;gap:4px;align-items:center;padding:18px 8px;border:1px solid #d6d9dd;border-radius:var(--pg-r);text-align:center;position:relative}
.pg-steps li:not(:last-child)::after{content:'';display:inline-block;width:20px;height:20px;background:#b1b8be;-webkit-mask:url(data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%20-960%20960%20960%22%3E%3Cpath%20d%3D%22M530-481%20332-679l43-43%20241%20241-241%20241-43-43%20198-198Z%22%2F%3E%3C%2Fsvg%3E) center/contain no-repeat;mask:url(data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%20-960%20960%20960%22%3E%3Cpath%20d%3D%22M530-481%20332-679l43-43%20241%20241-241%20241-43-43%20198-198Z%22%2F%3E%3C%2Fsvg%3E) center/contain no-repeat;vertical-align:middle;position:absolute;right:-10px;top:50%;transform:translateY(-50%);color:#b1b8be;font-size:20px}
.pg-steps .step{font-size:13px;color:var(--pg-ink);font-weight:700}.pg-steps .step-tit{font-weight:600}.pg-steps li.active{background:var(--pg-p-l);border-color:var(--pg-p)}
.pg-greet{display:grid;grid-template-columns:320px minmax(0,1fr);gap:48px;align-items:start}
.pg-greet-photo{margin:0;border-radius:var(--pg-r);overflow:hidden;background:#f4f5f6}.pg-greet-photo img{display:block;width:100%;aspect-ratio:4/5;object-fit:cover;object-position:top}
.pg-greet-title{margin:0 0 24px;font-size:28px;line-height:1.4;color:var(--pg-ink);letter-spacing:-.02em}
.pg-greet-body p{font-size:17px;line-height:1.85;margin:0 0 18px}
.pg-greet-sign{display:flex;justify-content:flex-end;align-items:center;gap:12px;margin-top:32px!important}.pg-greet-sign span{color:#58616a}.pg-greet-sign strong{font-size:22px}.pg-greet-sign img{height:56px;width:auto}
.pg-footer{background:#f7f8f9;border-top:1px solid #e1e3e6;margin-top:0;font-size:15px}
.pg-footer .foot-quick{border-bottom:1px solid #e1e3e6;background:#fff}.pg-footer .foot-quick .inner,.pg-footer>.inner{max-width:var(--pg-w);margin:0 auto;padding:0 24px;box-sizing:border-box}
.pg-footer .foot-quick .inner{display:grid;grid-template-columns:repeat(4,1fr)}.pg-footer .foot-quick .link{height:56px;border:0;border-left:1px solid #e1e3e6;background:none;font:inherit;text-align:left;padding:0 20px;cursor:pointer}
.pg-footer .foot-quick .link:last-child{border-right:1px solid #e1e3e6}
.pg-footer>.inner{padding-top:36px;padding-bottom:36px}.pg-f-logo{display:flex;align-items:center;gap:10px;margin-bottom:18px}.pg-f-logo .pg-logo-img{height:36px}
.pg-footer .f-cnt{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap}.pg-footer .info-addr{margin:0 0 8px}.pg-footer .info-cs{list-style:none;margin:0;padding:0;display:flex;gap:20px;flex-wrap:wrap}.pg-footer .info-cs span{color:#6d7882;margin-left:6px}
.pg-footer .link-go{display:flex;gap:8px}.pg-footer .link-go .krds-btn{height:40px;padding:0 16px;border:1px solid #d6d9dd;border-radius:var(--pg-r);background:#fff;display:inline-flex;align-items:center;white-space:nowrap;flex:none}
body.hb-kit #krds-footer.pg-footer--dark{background:var(--pg-foot)!important;border-top:0;color:rgba(255,255,255,.86)}
body.hb-kit #krds-footer.pg-footer--dark *:not(svg):not(path){color:rgba(255,255,255,.82)!important;border-color:rgba(255,255,255,.14)!important;background-color:transparent!important}
body.hb-kit #krds-footer.pg-footer--dark .foot-quick{background:rgba(0,0,0,.18);border-color:rgba(255,255,255,.12)}body.hb-kit #krds-footer.pg-footer--dark .foot-quick .link{color:#fff;border-color:rgba(255,255,255,.12)}
body.hb-kit #krds-footer.pg-footer--dark .info-cs span,body.hb-kit #krds-footer.pg-footer--dark .f-copy,body.hb-kit #krds-footer.pg-footer--dark .f-menu a{color:rgba(255,255,255,.7)}body.hb-kit #krds-footer.pg-footer--dark .f-menu .point,body.hb-kit #krds-footer.pg-footer--dark .pg-logo-name,body.hb-kit #krds-footer.pg-footer--dark strong{color:#fff}
body.hb-kit #krds-footer.pg-footer--dark .link-go .krds-btn{background:transparent;color:#fff;border-color:rgba(255,255,255,.35)}body.hb-kit #krds-footer.pg-footer--dark .f-btm{border-color:rgba(255,255,255,.15)}
body.hb-kit #krds-footer.pg-footer--dark .pg-logo-img{filter:brightness(0) invert(1)}
.pg-footer .f-btm{margin-top:24px;padding-top:20px;border-top:1px solid #e1e3e6}.pg-footer .f-menu{display:flex;gap:20px;flex-wrap:wrap}.pg-footer .f-menu .point{color:var(--pg-ink);font-weight:700}.pg-footer .f-copy{margin:10px 0 0;color:#6d7882;font-size:14px}
:focus-visible{outline:2px solid var(--pg-p);outline-offset:2px}
@media (max-width:1024px){.pg-body{grid-template-columns:1fr}.pg-lnb.krds-side-navigation{position:static}.pg-gnb{display:none}.pg-greet{grid-template-columns:1fr}.pg-org-depts{grid-template-columns:repeat(2,1fr)}.pg-steps ol{grid-template-columns:1fr 1fr}}
.pg-main,.pg-titlebar,.krds-breadcrumb-wrap,.pg-body>*{min-width:0}.krds-breadcrumb-wrap ol.breadcrumb{flex-wrap:wrap;row-gap:4px}
body.hb-kit #krds-footer .f-cnt,body.hb-kit #krds-footer .f-cnt .f-link,body.hb-kit #krds-footer .f-cnt .f-link .link-go{flex-wrap:wrap!important;min-width:0}
img{max-width:100%;height:auto}
.pg-lnb a,.pg-footer .link-go .krds-btn,.pg-gallery a,.pg-card,.pg-fig img{transition:transform .2s ease,box-shadow .2s ease}
.pg-lnb a:hover{transform:translateX(4px)}
.pg-footer .link-go .krds-btn:hover{transform:translateY(-2px);box-shadow:0 6px 14px rgba(15,23,42,.12)}
.pg-gallery a:hover,.pg-card:hover{transform:translateY(-3px);box-shadow:0 10px 24px rgba(15,23,42,.12)}
.pg-main table tbody tr:hover{box-shadow:inset 3px 0 0 var(--pg-p)}
@media (max-width:1280px){.pg-gnb ul{gap:20px}}
@media (max-width:768px){.pg-visual-title{font-size:28px}.pg-inner{padding:0 16px}.pg-main table{display:block;overflow-x:auto}.pg-board-top,.pg-search{width:100%;flex-wrap:wrap;min-width:0}.pg-search>*{min-width:0;max-width:100%}.pg-search .krds-input{flex:1 1 140px;width:auto}}
@media (max-width:480px){.pg-visual .pg-inner{height:150px}.pg-visual-title{font-size:24px}.pg-footer .link-go .krds-btn{padding:0 12px}}
.pg-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.pg-layer{position:fixed;inset:0;z-index:60;background:rgba(10,14,22,.6);display:grid;place-items:start center;padding-top:10vh}.pg-layer[hidden]{display:none}
.pg-layer-box{position:relative;width:min(900px,92vw);max-height:80vh;overflow:auto;background:#fff;border-radius:calc(var(--pg-r) + 4px);padding:40px}
.pg-sform{display:flex;border-bottom:3px solid var(--pg-p)}.pg-sform input{flex:1;border:0;font-size:22px;padding:12px 4px;outline:0}.pg-sform button{border:0;background:none;color:var(--pg-ink)}.pg-sform svg{width:28px;height:28px}
.pg-close{position:absolute;right:16px;top:16px;width:40px;height:40px;border:0;background:none;color:var(--pg-ink)}
.pg-layer h2{margin:0 0 20px;font-size:24px}.pg-smap{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:24px}.pg-smap h3{margin:0 0 10px;font-size:17px;padding-bottom:8px;border-bottom:2px solid var(--pg-p)}.pg-smap ul{margin:0;padding:0;list-style:none}.pg-smap li{padding:4px 0}.pg-smap a{color:inherit;text-decoration:none}
@media (prefers-reduced-motion:reduce){.pg-lnb a,.pg-footer .link-go .krds-btn,.pg-gallery a,.pg-card,.pg-fig img{transition:none}.pg-lnb a:hover,.pg-gallery a:hover,.pg-card:hover,.pg-footer .link-go .krds-btn:hover{transform:none}}
CSS;

    private const JS = <<<'JS'
document.querySelectorAll('[data-layer]').forEach(function(b){var l=document.getElementById(b.getAttribute('aria-controls'));if(!l)return;function close(){l.hidden=true;b.setAttribute('aria-expanded','false');b.focus();}b.addEventListener('click',function(){l.hidden=false;b.setAttribute('aria-expanded','true');var i=l.querySelector('input,a,button');if(i)i.focus();});l.addEventListener('click',function(e){if(e.target===l||e.target.closest('[data-close]'))close();});l.addEventListener('keydown',function(e){if(e.key==='Escape')close();});});
document.querySelectorAll('.btn-accordion').forEach(function(b){b.addEventListener('click',function(){var c=document.getElementById(b.getAttribute('aria-controls'));var o=b.getAttribute('aria-expanded')==='true';b.setAttribute('aria-expanded',o?'false':'true');if(c)c.hidden=o;});});
document.querySelectorAll('.krds-tab-area [role=tablist]').forEach(function(l){var t=[].slice.call(l.querySelectorAll('[role=tab]'));t.forEach(function(x,i){var b=x.querySelector('button');b.addEventListener('click',function(){t.forEach(function(y){y.classList.remove('active');y.setAttribute('aria-selected','false');});x.classList.add('active');x.setAttribute('aria-selected','true');});b.addEventListener('keydown',function(e){var k=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;if(!k)return;var n=t[(i+k+t.length)%t.length].querySelector('button');n.focus();n.click();});});});
document.querySelectorAll('[data-select]').forEach(function(s){var b=s.querySelector('button'),u=s.querySelector('ul');function close(){u.hidden=true;b.setAttribute('aria-expanded','false');}b.addEventListener('click',function(){var o=u.hidden;u.hidden=!o;b.setAttribute('aria-expanded',o?'true':'false');});u.querySelectorAll('li').forEach(function(li){li.addEventListener('click',function(){u.querySelectorAll('li').forEach(function(x){x.setAttribute('aria-selected','false');});li.setAttribute('aria-selected','true');b.querySelector('span').textContent=li.textContent;close();b.focus();});});document.addEventListener('click',function(e){if(!s.contains(e.target))close();});s.addEventListener('keydown',function(e){if(e.key==='Escape'){close();b.focus();}});});
JS;
}

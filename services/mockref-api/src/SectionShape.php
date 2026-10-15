<?php
declare(strict_types=1);

namespace Homebox;

/**
 * 섹션 구조(sections.structure JSON) 를 API 응답용으로 정리 (2026-09-23).
 * 워커가 {flags:{tablist,carousel,table,form,pagination,breadcrumb,skip}, text} 를 저장하는데
 *  - text 에 <style> 잔재("… .banner { height: unset }")가 6% 섞여 있어 CSS 규칙 모양을 걷어낸다
 *  - flags 는 그대로 노출 — MCP 가 크롭을 열지 않고도 "탭형·슬라이드형·표 포함" 을 판단하는 근거
 */
final class SectionShape
{
    /** @param mixed $raw  @return array<string,mixed>|null */
    public static function structure($raw): ?array
    {
        if ($raw === null) {
            return null;
        }
        $s = is_string($raw) ? json_decode($raw, true) : $raw;
        if (!is_array($s)) {
            return null;
        }
        $flags = [];
        foreach ((array) ($s['flags'] ?? []) as $k => $v) {
            $flags[(string) $k] = (bool) $v;
        }
        $out = ['flags' => $flags, 'text' => self::cleanText($s['text'] ?? null)];
        // 구성 서술(2026-09-24 restructure) — 크롭 없이 섹션을 다시 그릴 근거: 제목·소제목·링크·이미지·목록 수·열·색·글꼴
        // name·evidence (2026-09-29 titled) — 캡처 안 섹션 제목과 "무엇을 보고 이 유형으로 정했는지"
        foreach (['name', 'evidence', 'title', 'headings', 'links', 'images', 'items', 'cols', 'colors', 'font', 'style'] as $k) {
            if (array_key_exists($k, $s)) {
                $out[$k] = $s[$k];
            }
        }
        if (isset($out['title']) && is_string($out['title'])) {
            $out['title'] = self::cleanText($out['title']);
        }
        return $out;
    }

    /**
     * 응답용 구조(O-44, 2026-10-15) — structure() 에서 수집 원문을 걷어낸 것. 판정·조립(내부)은 structure() 를 그대로 쓴다.
     *   text → {chars, words, kind} · title·name·evidence.name → 기관명·지명·인명 ○○(긴 문장은 "[글 N자]") · headings·links.labels → 같은 규칙(개수 유지)
     * 세션 관리자(검수 화면)는 원문 그대로(PublicText::raw).
     * @param mixed $raw @return array<string,mixed>|null
     */
    public static function publicStructure($raw, ?bool $rawOk = null): ?array
    {
        $s = self::structure($raw);
        if ($s === null || ($rawOk ?? PublicText::raw())) {
            return $s;
        }
        // 역대 기관장·인사말·조직도처럼 사람 이름이 나열될 섹션이면 홀로 선 세 글자 이름도 지운다(부산 '역대시장' 소제목에 '박형준'·'전재수')
        $ctx = implode(' ', array_filter(array_merge([is_string($s['title'] ?? null) ? $s['title'] : '', is_string($s['name'] ?? null) ? $s['name'] : '', is_string($s['text'] ?? null) ? mb_substr($s['text'], 0, 200) : ''], array_filter((array) ($s['headings'] ?? []), 'is_string'))));
        $people = preg_match(PublicText::PEOPLE_CTX, $ctx) === 1;
        $s['text'] = PublicText::shape(is_string($s['text'] ?? null) ? $s['text'] : null);
        foreach (['title', 'name'] as $k) {
            if (array_key_exists($k, $s)) { $s[$k] = is_string($s[$k]) ? PublicText::label($s[$k], 20, $people) : null; }
        }
        if (isset($s['headings']) && is_array($s['headings'])) { $s['headings'] = PublicText::labels($s['headings'], 20, $people); }
        if (isset($s['links']['labels']) && is_array($s['links']['labels'])) { $s['links']['labels'] = PublicText::labels($s['links']['labels'], 20, $people); }
        if (isset($s['evidence']) && is_array($s['evidence']) && array_key_exists('name', $s['evidence'])) {
            $s['evidence']['name'] = is_string($s['evidence']['name']) ? PublicText::label($s['evidence']['name']) : null;
        }
        return $s;
    }

    /** CSS 규칙(`.x { … }`, `prop: value;`) 과 선택자 조각을 걷어낸 텍스트. 남는 게 없으면 null */
    public static function cleanText(?string $t): ?string
    {
        if ($t === null) {
            return null;
        }
        $t = preg_replace('/[^{}]*\{[^}]*\}/u', ' ', $t) ?? $t;          // .a .b { … }
        $t = preg_replace('/[\w-]+\s*:\s*[^;{}]+;/u', ' ', $t) ?? $t;      // color: #fff;
        $t = preg_replace('/(^|\s)[.#][\w-]+(\s*[.#][\w-]+)*/u', ' ', $t) ?? $t; // .header-banner .type
        $t = trim(preg_replace('/\s+/u', ' ', $t) ?? $t);
        return $t === '' ? null : mb_substr($t, 0, 300);
    }

    /**
     * 디자인 표현(structure.style) 합성 (2026-09-24) — "이 유형 섹션은 보통 어떻게 보이는가".
     * 사진 배치 분포·사진 위 글자·어두운 바탕·겹침·그림자·아이콘 메뉴·여러 색 제목 비율, 모서리 반경·카드 수·제목 배율 중앙값.
     * @param list<array<string,mixed>> $styles  @return array<string,mixed>|null
     */
    public static function styleSummary(array $styles): ?array
    {
        $styles = array_values(array_filter($styles, 'is_array'));
        $n = count($styles);
        if ($n === 0) {
            return null;
        }
        $pct = static fn (int $v): float => round($v / $n * 100, 1);
        $med = static function (array $a): ?float { $a = array_values(array_filter($a, static fn ($v) => $v !== null)); if (!$a) { return null; } sort($a); $m = intdiv(count($a), 2); return round(count($a) % 2 ? (float) $a[$m] : ((float) $a[$m - 1] + (float) $a[$m]) / 2, 2); };
        $photo = []; $align = [];
        $c = ['text_on_photo' => 0, 'dark' => 0, 'shadow' => 0, 'overlap_prev' => 0, 'icon_menu' => 0, 'multicolor_heading' => 0];
        foreach ($styles as $s) {
            $p = (string) ($s['photo'] ?? 'none'); $photo[$p] = ($photo[$p] ?? 0) + 1;
            if (!empty($s['align'])) { $align[(string) $s['align']] = ($align[(string) $s['align']] ?? 0) + 1; }
            foreach ($c as $k => $_) { if (!empty($s[$k])) { $c[$k]++; } }
        }
        arsort($photo); arsort($align);
        return [
            'n' => $n,
            'photo_pct' => array_map($pct, $photo),
            'text_on_photo_pct' => $pct($c['text_on_photo']), 'dark_pct' => $pct($c['dark']), 'shadow_pct' => $pct($c['shadow']),
            'overlap_prev_pct' => $pct($c['overlap_prev']), 'icon_menu_pct' => $pct($c['icon_menu']), 'multicolor_heading_pct' => $pct($c['multicolor_heading']),
            'align_pct' => array_map($pct, $align),
            'radius_px_median' => $med(array_map(static fn ($s) => $s['radius_px'] ?? null, $styles)),
            'cards_median' => $med(array_map(static fn ($s) => $s['cards'] ?? null, $styles)),
            'title_scale_median' => $med(array_map(static fn ($s) => $s['title_scale'] ?? null, $styles)),
            'note' => 'photo: full_bleed=섹션 폭 가득 사진 · split_left/right=좌우 분할 · inline=본문 속 사진. overlap_prev=윗 섹션 위로 겹쳐 올라온 블록.',
        ];
    }
}

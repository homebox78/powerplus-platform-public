<?php
declare(strict_types=1);

namespace Homebox;

/**
 * 기관별 디자인 시스템 (Pro, 2026-09-24 사용자 지시): 디자인 "데이터"(측정값 나열) 대신 KRDS 스타일 가이드 분류
 * (색상 · 타이포그래피 · 형태 · 레이아웃 · 아이콘 · 엘리베이션 · 디자인 토큰, krds.go.kr/html/site/style/style_01.html)
 * 로 정리한 한 장짜리 시스템 문서를 만든다. 원천은 워커가 측정한 site_design 한 행 — 새로 측정하지 않고 "해석·정규화·파생"만 한다.
 *
 * 같은 문서가 웹(디자인 시스템 탭)·MCP(get_design_system)·토큰 내보내기(css/json/tailwind) 세 곳에 쓰인다.
 * 확장 원칙: 카테고리 키·토큰 이름은 바꾸지 않고 추가만 한다(스키마 버전 hb-ds/1). 값이 없으면 null + 이유(note) — 지어내지 않는다.
 */
final class DesignSystem
{
    public const VERSION = 'hb-ds/1';
    /** KRDS 색상 단계와 같은 눈금(5·10·20…95) — 50 이 측정한 주색 */
    private const STEPS = [5 => 0.92, 10 => 0.84, 20 => 0.68, 30 => 0.52, 40 => 0.30, 50 => 0.0, 60 => -0.16, 70 => -0.32, 80 => -0.48, 90 => -0.64, 95 => -0.76];

    /**
     * @param array<string,mixed> $row site_design 행 (JSON 컬럼은 디코드 전 문자열)
     * @param array<string,mixed> $site ['slug','name','url']
     * @return array<string,mixed>
     */
    public static function build(array $row, array $site): array
    {
        $j = static fn (string $k): mixed => is_string($row[$k] ?? null) ? json_decode((string) $row[$k], true) : ($row[$k] ?? null);
        $palette = (array) ($j('palette') ?? []);
        $typo = Design::typography(is_array($j('typography')) ? $j('typography') : null);
        $colors = Design::colors(is_array($j('colors')) ? $j('colors') : null, $typo['scale'] ?? null);
        $spacing = Design::spacing(is_array($j('spacing')) ? $j('spacing') : null);
        $fonts = Design::fonts((array) ($j('fonts') ?? []));
        $raw = (array) ($j('raw') ?? []);
        $bps = array_values(array_filter(array_map('intval', (array) ($j('breakpoints') ?? []))));
        $order = (array) ($j('section_order') ?? []);

        $primary = Design::primary(self::hex($row['primary_hex'] ?? null) ?? self::hex(self::firstRole($palette, 'primary')), $palette)['hex'];
        $color = self::color($primary, $palette, $colors);
        $type = self::typographyTokens($typo, $fonts);
        $shape = self::shape(isset($row['radius_px']) ? (int) $row['radius_px'] : null, $spacing);
        $layout = self::layout($row, $spacing, $bps, $order);
        $icon = ['style' => $row['icon_style'] ?? null, 'counts' => $raw['icons'] ?? null,
            'note' => '아이콘 원본은 수집하지 않는다(저작권). 스타일(선형·면형)과 사용 방식(SVG·이미지)만.'];
        $elev = ['uses_shadow' => isset($row['shadow']) ? (bool) $row['shadow'] : null, 'samples' => $raw['shadows'] ?? null,
            'levels' => !empty($row['shadow']) ? ['sm' => '0 1px 3px rgba(0,0,0,.08)', 'md' => '0 4px 12px rgba(0,0,0,.10)'] : null,
            'note' => !empty($row['shadow']) ? '그림자 사용 확인 — 단계 값은 KRDS 권장치를 기준으로 제시(사이트 실측 값 아님)' : '그림자 없이 선·면으로 구분하는 사이트'];

        $doc = [
            'version' => self::VERSION,
            'site' => $site + ['primary_hex' => $primary, 'tone' => $row['tone'] ?? null],
            'source' => ['extracted_at' => $row['extracted_at'] ?? null, 'screen_id' => $raw['source_screen_id'] ?? null, 'krds_markup' => (bool) ($raw['krds_markup'] ?? false),
                'basis' => '메인 화면 실측(워커 extract) + 서브 화면 보충. 파생 값(색 단계·엘리베이션 단계)은 derived:true 로 표시'],
            'color' => $color,
            'typography' => $type,
            'shape' => $shape,
            'layout' => $layout,
            'icon' => $icon,
            'elevation' => $elev,
        ];
        // 버린 값·대체한 값의 이유를 한 곳에 — 시안 작업자가 "왜 비었나"를 알게
        $notes = [];
        foreach ((array) $colors as $k => $v) { if (is_string($v) && str_ends_with((string) $k, '_note')) { $notes[] = $v; } }
        foreach ((array) ($typo['notes'] ?? []) as $v) { $notes[] = $v; }
        foreach ((array) $spacing as $k => $v) { if (is_string($v) && str_ends_with((string) $k, '_note')) { $notes[] = $v; } }
        foreach ($color['notes'] as $v) { $notes[] = $v; }
        $doc['notes'] = array_values(array_unique($notes));
        $doc['units'] = '숫자 값(크기·간격·폭·중단점·모서리)은 px, 행간은 배수(단위 없음). CSS 로 옮길 땐 tokens 값을 그대로 쓴다 — "24px"처럼 숫자와 단위를 붙여 쓰고 띄우지 않는다.';
        $doc['tokens'] = self::tokens($doc);
        $doc['coverage'] = self::coverage($doc);
        return $doc;
    }

    /** @param array<string,mixed> $doc */
    public static function css(array $doc): string
    {
        $lines = ["/* {$doc['site']['name']} — 홈박스 디자인 시스템 토큰 ({$doc['version']}). 원본: {$doc['site']['url']} */", ':root {'];
        foreach ($doc['tokens'] as $k => $v) { $lines[] = "  --{$k}: {$v};"; }
        $lines[] = '}';
        return implode("\n", $lines) . "\n";
    }

    /** @param array<string,mixed> $doc */
    public static function tailwind(array $doc): string
    {
        // Tailwind v4 @theme 블록 — 그대로 app.css 에 붙여 쓸 수 있게
        $lines = ["/* {$doc['site']['name']} — Tailwind v4 @theme ({$doc['version']}) */", '@theme {'];
        foreach ($doc['tokens'] as $k => $v) {
            $name = preg_replace(['/^hb-line-height-/', '/^hb-color-/', '/^hb-font-size-/', '/^hb-radius-/', '/^hb-shadow-/', '/^hb-font-family-/', '/^hb-/'], ['leading-', 'color-', 'text-', 'radius-', 'shadow-', 'font-', ''], $k);
            $lines[] = "  --{$name}: {$v};";
        }
        $lines[] = '}';
        return implode("\n", $lines) . "\n";
    }

    // ── 색상 ────────────────────────────────────────────────
    /** @param list<array<string,mixed>> $palette @param array<string,mixed>|null $c @return array<string,mixed> */
    private static function color(?string $primary, array $palette, ?array $c): array
    {
        $scale = null;
        if ($primary !== null) {
            $scale = [];
            foreach (self::STEPS as $step => $t) { $scale[(string) $step] = $t >= 0 ? self::mix($primary, '#FFFFFF', $t) : self::mix($primary, '#000000', -$t); }
        }
        $neutral = [];
        foreach ($palette as $p) {
            $h = self::hex($p['hex'] ?? null);
            if ($h !== null && ($p['role'] ?? '') !== 'primary') { $neutral[] = ['hex' => $h, 'ratio' => $p['ratio'] ?? null]; }
        }
        $roles = [
            'text.heading' => $c['heading'] ?? null, 'text.body' => $c['body'] ?? null, 'text.link' => $c['link'] ?? null,
            'surface.header' => $c['header_bg'] ?? null, 'surface.footer' => $c['footer_bg'] ?? null,
            'action.button-bg' => $c['button_bg'] ?? null, 'action.button-text' => $c['button_text'] ?? null,
        ];
        $roles = array_map(fn ($v) => self::hex(is_string($v) ? $v : null), $roles);
        // 대비 1.5 미만 = 사실상 같은 색 → 측정 오류로 보고 버린다 (2026-10-12 서울시 본문 흰색 1.0·버튼 #FFFFFF/#F7F7F7 1.07)
        $notes = [];
        foreach (['text.heading', 'text.body', 'text.link'] as $k) {
            if ($roles[$k] !== null && self::contrast($roles[$k], '#FFFFFF') < 1.5) {
                $notes[] = "{$k} {$roles[$k]} 는 흰 배경 대비 1.5 미만이라 측정 오류 의심 — 버림";
                $roles[$k] = null;
            }
        }
        if ($roles['action.button-bg'] && $roles['action.button-text'] && self::contrast($roles['action.button-text'], $roles['action.button-bg']) < 1.5) {
            $notes[] = "버튼 글자 {$roles['action.button-text']} / 배경 {$roles['action.button-bg']} 대비 " . self::contrast($roles['action.button-text'], $roles['action.button-bg']) . ' — 측정 오류 의심, 버튼 색 짝을 버림';
            $roles['action.button-bg'] = null;
            $roles['action.button-text'] = null;
        }
        // 대비 검사 — KRDS 는 본문 4.5:1 이상(AA). 흰 배경 기준 + 버튼 글자/배경
        $checks = [];
        foreach (['primary' => $primary, 'text.heading' => $roles['text.heading'], 'text.body' => $roles['text.body'], 'text.link' => $roles['text.link']] as $k => $hex) {
            if ($hex !== null) { $r = self::contrast($hex, '#FFFFFF'); $checks[] = ['pair' => "{$k} / 흰 배경", 'fg' => $hex, 'bg' => '#FFFFFF', 'ratio' => $r, 'aa' => $r >= 4.5, 'aa_large' => $r >= 3.0]; }
        }
        if ($roles['action.button-bg'] && $roles['action.button-text']) {
            $r = self::contrast($roles['action.button-text'], $roles['action.button-bg']);
            $checks[] = ['pair' => '버튼 글자 / 버튼 배경', 'fg' => $roles['action.button-text'], 'bg' => $roles['action.button-bg'], 'ratio' => $r, 'aa' => $r >= 4.5, 'aa_large' => $r >= 3.0];
        }
        return ['primary' => $primary, 'primary_scale' => $scale, 'primary_scale_derived' => true, 'neutral' => $neutral, 'roles' => $roles, 'contrast' => $checks, 'notes' => $notes,
            'note' => $primary ? '주색 단계(5~95)는 측정한 주색(50)을 흰색·검정과 섞어 만든 파생 값 — KRDS 색상 눈금과 같은 이름' : '주색을 측정하지 못함'];
    }

    // ── 타이포그래피: 측정 역할 → KRDS 토큰 이름 ────────────────────
    /** @param array<string,mixed>|null $t @param list<array<string,mixed>> $fonts @return array<string,mixed> */
    private static function typographyTokens(?array $t, array $fonts): array
    {
        $scale = (array) ($t['scale'] ?? []);
        $sizes = array_map(fn ($x) => (int) $x['size'], (array) ($t['sizes'] ?? []));
        rsort($sizes);
        $pick = static fn (array $roles) => array_reduce($roles, fn ($acc, $r) => $acc ?? (is_array($scale[$r] ?? null) && !empty($scale[$r]['size']) ? $scale[$r] + ['from' => $r] : null));
        $display = ($sizes[0] ?? 0) >= 32 ? ['size' => $sizes[0], 'weight' => 700, 'from' => 'sizes(max)'] : null;
        $map = [
            'display' => $display,
            'heading-large' => $pick(['h1', 'h2']),
            'heading-medium' => $pick(['h2', 'subtitle', 'h3']),
            'heading-small' => $pick(['h3', 'h4', 'subtitle']),
            'body-large' => $pick(['footer', 'body']),
            'body-medium' => $pick(['body']),
            'body-small' => $pick(['link', 'button']),
            'label' => $pick(['nav', 'button']),
            'detail' => $pick(['caption']),
        ];
        // 같은 측정 역할이 두 토큰에 겹치면(h2 → heading-large·medium) 아래 토큰은 비운다 — 같은 값을 두 이름으로 부풀리지 않음
        $seen = [];
        foreach ($map as $k => $v) {
            if (!is_array($v)) { continue; }
            $key = ($v['from'] ?? '') . ':' . ($v['size'] ?? '');
            if (isset($seen[$key])) { $map[$k] = null; continue; }
            $seen[$key] = true;
            $map[$k] = array_intersect_key($v, array_flip(['size', 'weight', 'line_height', 'letter_spacing', 'family', 'color', 'from', 'n']));
        }
        // 같은 계열(heading·body) 안에서는 크기 내림차순으로 이름을 다시 붙인다 — 측정 역할 대응만 하면 heading-large(16) < heading-small(18) 이 나왔다(산업부).
        // 같은 크기는 한 번만. 제목 계열이 본문보다 작으면 제목이 아니므로 버린다.
        // 본문 계열은 body-medium = 실제 본문 역할을 기준으로 — 그보다 크면 large, 작으면 small, 같으면 버린다(같은 값을 두 이름으로 부풀리지 않음)
        $bm = is_array($scale['body'] ?? null) && !empty($scale['body']['size']) ? $scale['body'] + ['from' => 'body'] : null;
        $map['body-medium'] = $bm ? array_intersect_key($bm, array_flip(['size', 'weight', 'line_height', 'letter_spacing', 'family', 'color', 'from', 'n'])) : $map['body-medium'];
        $bmS = (int) ($map['body-medium']['size'] ?? 0);
        if ($bmS > 0) {
            if (is_array($map['body-large']) && (int) $map['body-large']['size'] <= $bmS) { $map['body-large'] = null; }
            if (is_array($map['body-small']) && (int) $map['body-small']['size'] >= $bmS) { $map['body-small'] = null; }
        }
        foreach (['heading' => ['large', 'medium', 'small']] as $grp => $names) {
            $vals = [];
            foreach ($names as $n) { $v = $map["{$grp}-{$n}"]; if (is_array($v) && !isset($vals[(int) $v['size']])) { $vals[(int) $v['size']] = $v; } }
            if ($bmS > 0) { $vals = array_filter($vals, fn ($v) => (int) $v['size'] > $bmS); }
            krsort($vals);
            $vals = array_values($vals);
            foreach ($names as $i => $n) { $map["{$grp}-{$n}"] = $vals[$i] ?? null; }
        }
        if (is_array($map['display']) && is_array($map['heading-large']) && $map['display']['size'] <= $map['heading-large']['size']) { $map['display'] = null; }
        $fam = $t['families'][0]['family'] ?? ($fonts[0]['family'] ?? null);
        return ['family' => ['primary' => $fam, 'license' => $t['families'][0]['license'] ?? ($fonts[0]['license'] ?? null),
                'all' => array_values(array_map(fn ($f) => ['family' => $f['family'], 'share' => $f['share'] ?? null], array_filter((array) ($t['families'] ?? []), fn ($f) => !str_contains((string) $f['family'], chr(92)) && (float) ($f['share'] ?? 0) >= 0.03)))],
            'weights' => $t['weights'] ?? [], 'scale' => $map, 'sizes' => $sizes,
            'note' => 'KRDS 토큰 이름(display·heading·body·label·detail)에 사이트 실측 역할을 대응시킨 것. from = 측정 역할'];
    }

    /** @param array<string,mixed>|null $sp @return array<string,mixed> */
    private static function shape(?int $radius, ?array $sp): array
    {
        $r = $radius !== null && $radius >= 0 ? $radius : null;
        $pill = $r !== null && $r >= 24;
        return [
            'radius' => ['base' => $r, 'pill' => $pill, 'small' => $r === null ? null : ($pill ? 4 : ($r === 0 ? 0 : max(2, (int) round($r / 2)))), 'large' => $r === null ? null : ($pill ? 16 : $r * 2)],
            'control_heights' => ['buttons' => array_values(array_unique(array_map('intval', (array) ($sp['button_heights'] ?? [])))), 'input' => $sp['input_height'] ?? null],
            'note' => $pill ? '버튼·칩이 알약형(반경 ' . $r . 'px) — small·large 는 카드·입력용 파생 값' : 'base = 가장 많이 쓰인 모서리 반경, small·large 는 파생 값',
        ];
    }

    /** @param array<string,mixed> $row @param array<string,mixed>|null $sp @param list<int> $bps @param list<string> $order @return array<string,mixed> */
    private static function layout(array $row, ?array $sp, array $bps, array $order): array
    {
        // 측정된 미디어쿼리 값(수십 개)을 KRDS 식 4구간으로 압축: 각 구간에서 가장 큰 값을 대표로
        $bands = ['mobile' => [0, 599], 'tablet' => [600, 1023], 'desktop' => [1024, 1439], 'wide' => [1440, 9999]];
        $tiers = [];
        foreach ($bands as $name => [$lo, $hi]) {
            $in = array_values(array_filter($bps, fn ($b) => $b >= $lo && $b <= $hi));
            $tiers[$name] = $in ? max($in) : null;
        }
        $seq = [];
        foreach ($order as $s) { if ($s !== end($seq)) { $seq[] = $s; } }
        return [
            'container' => isset($row['container_px']) ? (int) $row['container_px'] : null,
            'grid_cols' => isset($row['grid_cols']) ? (int) $row['grid_cols'] : null,
            'gutter' => $sp['gutter_px'] ?? null, 'section_gap' => $sp['section_gap_px'] ?? null,
            'breakpoints' => $tiers, 'breakpoints_raw_n' => count($bps),
            'header' => $row['header_type'] ?? null, 'lnb' => $row['lnb_position'] ?? null,
            'main_section_order' => $seq,
        ];
    }

    /** @param array<string,mixed> $d @return array<string,string> */
    private static function tokens(array $d): array
    {
        $t = [];
        if ($d['color']['primary']) { $t['hb-color-primary'] = $d['color']['primary']; }
        foreach ((array) $d['color']['primary_scale'] as $s => $v) { $t["hb-color-primary-{$s}"] = $v; }
        foreach ($d['color']['roles'] as $k => $v) { if ($v) { $t['hb-color-' . str_replace('.', '-', $k)] = $v; } }
        if ($d['typography']['family']['primary']) { $t['hb-font-family-base'] = '"' . $d['typography']['family']['primary'] . '", sans-serif'; }
        foreach ($d['typography']['scale'] as $k => $v) {
            if (!is_array($v)) { continue; }
            $t["hb-font-size-{$k}"] = $v['size'] . 'px';
            if (isset($v['weight'])) { $t["hb-font-weight-{$k}"] = (string) $v['weight']; }
            if (isset($v['line_height'])) { $t["hb-line-height-{$k}"] = (string) $v['line_height']; }
        }
        foreach ($d['shape']['radius'] as $k => $v) { if (is_int($v)) { $t["hb-radius-{$k}"] = $v . 'px'; } }
        if ($d['layout']['container']) { $t['hb-container'] = $d['layout']['container'] . 'px'; }
        if ($d['layout']['gutter']) { $t['hb-gutter'] = $d['layout']['gutter'] . 'px'; }
        if ($d['layout']['section_gap']) { $t['hb-section-gap'] = $d['layout']['section_gap'] . 'px'; }
        foreach ($d['layout']['breakpoints'] as $k => $v) { if ($v) { $t["hb-breakpoint-{$k}"] = $v . 'px'; } }
        foreach ((array) $d['elevation']['levels'] as $k => $v) { $t["hb-shadow-{$k}"] = $v; }
        return $t;
    }

    /** 카테고리별 채움 — 문서 신뢰도 표시용 @param array<string,mixed> $d @return array<string,bool> */
    private static function coverage(array $d): array
    {
        return [
            'color' => $d['color']['primary'] !== null,
            'typography' => count(array_filter($d['typography']['scale'])) >= 3,
            'shape' => $d['shape']['radius']['base'] !== null,
            'layout' => $d['layout']['container'] !== null,
            'icon' => $d['icon']['style'] !== null,
            'elevation' => $d['elevation']['uses_shadow'] !== null,
        ];
    }

    // ── 색 유틸 ──────────────────────────────────────────────
    private static function hex(?string $h): ?string
    {
        return is_string($h) && preg_match('/^#[0-9a-f]{6}$/i', $h) === 1 ? strtoupper($h) : null;
    }

    /** @param list<array<string,mixed>> $palette */
    private static function firstRole(array $palette, string $role): ?string
    {
        foreach ($palette as $p) { if (($p['role'] ?? '') === $role) { return $p['hex'] ?? null; } }
        return null;
    }

    private static function mix(string $a, string $b, float $t): string
    {
        $pa = sscanf($a, '#%02x%02x%02x'); $pb = sscanf($b, '#%02x%02x%02x');
        $out = '#';
        for ($i = 0; $i < 3; $i++) { $out .= sprintf('%02X', (int) round($pa[$i] + ($pb[$i] - $pa[$i]) * $t)); }
        return $out;
    }

    private static function lum(string $hex): float
    {
        [$r, $g, $b] = sscanf($hex, '#%02x%02x%02x');
        $f = static function (int $c): float { $c /= 255; return $c <= 0.03928 ? $c / 12.92 : (($c + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * $f($r) + 0.7152 * $f($g) + 0.0722 * $f($b);
    }

    private static function contrast(string $a, string $b): float
    {
        $l1 = self::lum($a); $l2 = self::lum($b);
        return round((max($l1, $l2) + 0.05) / (min($l1, $l2) + 0.05), 2);
    }
}

<?php
declare(strict_types=1);

namespace Pp\Guide;

/**
 * guide_check_code — 사용자 AI 가 만든 HTML(+CSS)을 결정적 규칙으로 판정한다(브라우저 렌더 없음, LLM 없음).
 * 렌더가 필요한 판정(실제 보이는 대비·포커스 순서·터치 영역)은 크레딧 도구(mock_check_mockup 계열)의 몫이다.
 *
 * 규칙(감점):
 *  colors   정본 토큰(powerGuide 토큰 + 키트 KRDS 팔레트 + 브랜드 --pp-*) 밖의 하드코딩 색 — 색마다 -4, 최대 -24 (경고)
 *           고칠 점은 쓰임(글자·면)과 대비(본문 4.5·큰 글자 3)를 지키는 가장 가까운 정본 토큰 — powerGuide 역할(semantic) 토큰 우선,
 *           없을 때만 정본 팔레트. --krds-*·--hb-*·--pp-* 는 판정에선 인정하되 제안하지 않는다(O-12 정본 한 체계).
 *           예시 스킨 색(솔리데오 크림슨 등)을 직접 쓰면 같은 brand 단계의 역할 토큰 + 스킨 파일로 안내한다.
 *  img_alt  alt 속성이 없는 <img>                                           — 개마다 -5, 최대 -20 (오류)
 *  name     이름이 없는 버튼·링크(글자·aria-label·aria-labelledby·title·alt 모두 없음) — -5, 최대 -25 (오류)
 *  label    label·aria-label 이 없는 입력칸(placeholder 만으로는 이름이 아니다)  — -5, 최대 -20 (오류)
 *  heading  h1 없음 -5 / h1 여러 개 -3 / 단계 건너뜀(h2→h4) -3 / h1 앞에 다른 제목(h3→h1) -3, 최대 -10 (경고)
 *  table    th 없는 데이터 표(2줄·2칸 이상, role=presentation 제외) — 표마다 -4, 최대 -12 (경고)
 *  contrast 계산 가능한 글자·배경 쌍의 대비 미달(본문 4.5:1, 큰 글자 3:1)     — -5, 최대 -20 (오류)
 *           인라인 style 과 단순 선택자(태그·.클래스·#id, 자손·>) 둘 다, 고칠 점에 글자색·면색 토큰
 *  font_size 글자 14px 미만 경고 -2 / 12px 미만 오류 -5, 최대 -10 · 첫 제목이 h3 이하 경고 -3
 *  focus    포커스 표시 없앰(outline:none, 대체 표시 없음) 오류 -5 / :focus-visible 만 대체 경고 -2, 최대 -15
 *  button_color 버튼 면에 상태 색(information·success·warning·danger 계열) — 경고 -3, 최대 -9
 *  parse    HTML 태그가 하나도 없는 입력 — 오류, 0점
 *  lang     <html lang> 없음 -2 (경고)
 *  fake_button onclick 만 있는 div·span(role·tabindex·키보드 처리 없음) — 오류 -5, 키보드 처리만 없음 경고 -3, 최대 -20
 * 통과 = 85점 이상 + 오류 0. 오류가 있으면 점수 상한 84, 오류가 하나 늘 때마다 상한 -3.
 */
final class CodeCheck
{
    private const COLOR_PROPS = '/^(color|background(-color)?|border(-[a-z-]+)?|outline(-color)?|fill|stroke|box-shadow|text-shadow|caret-color|accent-color|text-decoration(-color)?|--[\w-]+)$/';

    private array $fixes = [];
    private array $deduct = [];
    /** @var array<string,string> 사용자 :root 사용자 속성(이름 → 원문 값) */
    private array $vars = [];
    private array $palette;
    /** 한 줄로 붙인 HTML — 줄 번호가 늘 1 이라 대신 요소 경로(where)로 찾게 한다(2026-10-12 MCP 시험) */
    private bool $singleLine = false;

    public function __construct()
    {
        $this->palette = Data::palette();
    }

    public static function run(string $html, string $css = ''): array
    {
        return (new self())->check($html, $css);
    }

    private function check(string $html, string $css): array
    {
        $this->singleLine = substr_count(trim($html), "\n") < 2;
        $doc = new \DOMDocument();
        $prev = libxml_use_internal_errors(true);
        $doc->loadHTML('<?xml encoding="utf-8"?>' . $html, LIBXML_NONET | LIBXML_COMPACT);
        libxml_clear_errors();
        libxml_use_internal_errors($prev);
        $xp = new \DOMXPath($doc);

        $styleText = $css;
        foreach ($xp->query('//style') as $s) {
            $styleText .= "\n" . $s->textContent;
        }
        $rules = $this->parseRules($styleText);
        foreach ($rules as $r) {
            if (preg_match('/(^|,)\s*(:root|html)\s*($|,)/', $r['sel'])) {
                foreach ($r['decl'] as $p => $v) {
                    if (str_starts_with($p, '--')) {
                        $this->vars[$p] = $v;
                    }
                }
            }
        }

        $stats = [
            'colors_total' => 0, 'colors_off_token' => 0, 'var_uses' => 0,
            'images' => 0, 'buttons_links' => 0, 'form_controls' => 0, 'headings' => 0, 'contrast_pairs' => 0,
        ];
        $this->checkColors($rules, $xp, $stats);
        $this->checkImages($xp, $stats);
        $this->checkNames($xp, $stats);
        $this->checkFakeButtons($xp, $stats);
        $this->checkLabels($xp, $stats);
        $this->checkHeadings($xp, $stats, stripos($html, "<body") !== false || stripos($html, "<html") !== false);
        $this->checkTables($xp);
        $this->checkContrast($rules, $xp, $stats);
        $this->checkFontSize($rules, $xp, $stats);
        $this->checkFocus($rules);
        $this->checkButtonColor($rules, $xp);
        // HTML 로 읽을 수 없는 입력 — 태그가 하나도 없으면 판정 자체가 의미 없다(빈 결과로 100점을 주지 않는다)
        $notHtml = !preg_match('/<([a-z][a-z0-9-]*)(\s[^<>]*)?\/?>/i', $html);
        if ($notHtml) {
            $this->add('parse', 'error', 'document', 'HTML 로 읽을 수 없는 입력입니다 — 올바른 태그가 하나도 없습니다.', '판정할 HTML(태그가 있는 마크업) 전체를 보내세요. CSS 는 css 인자나 <style> 로 함께 보내세요.', 100);
        }
        $htmlEl = $xp->query('//html')->item(0);
        if (!$htmlEl instanceof \DOMElement || trim($htmlEl->getAttribute('lang')) === '') {
            // 전체 문서(<html>·<body>·doctype 이 있는 것)만 본다 — 조각(부품 하나)은 lang 을 붙일 자리가 없다
            if (preg_match('/<(html|body|!doctype)\b/i', $html)) {
                $this->add('lang', 'warn', 'html', '<html> 에 lang 이 없습니다.', '<html lang="ko"> 처럼 문서 언어를 적으세요.', 2);
            }
        }

        $caps = ['colors' => 24, 'img_alt' => 20, 'name' => 25, 'label' => 20, 'heading' => 10, 'contrast' => 20, 'lang' => 2, 'fake_button' => 20, 'table' => 12, 'font_size' => 10, 'focus' => 15, 'button_color' => 9, 'parse' => 100];
        $score = 100;
        foreach ($this->deduct as $rule => $n) {
            $score -= min($caps[$rule] ?? 10, $n);
        }
        $errors = count(array_filter($this->fixes, static fn (array $f): bool => $f['severity'] === 'error'));
        $score = max(0, $score);
        if ($notHtml) {
            $score = 0;
        } elseif ($errors > 0) {
            // 오류가 늘수록 점수도 내려간다(1개 84 · 2개 81 · 3개 78 …)
            $score = max(0, min($score, 84 - 3 * ($errors - 1))); // 오류(이름 없는 입력·대비 미달 등)가 하나라도 있으면 통과선(85) 아래 — 점수만 보고 '거의 됐다'로 읽지 않게
        }
        return [
            'score' => $score,
            'pass' => $score >= 85 && $errors === 0,
            'errors' => $errors,
            'warnings' => count($this->fixes) - $errors,
            'stats' => $stats,
            'fixes' => array_slice($this->fixes, 0, 80),
            'note' => '결정적 규칙 판정입니다(렌더 없음). 대비는 인라인 스타일·단순 선택자 규칙에서 글자색과 배경색을 모두 알 수 있는 경우만 계산합니다.'
                . ($this->singleLine ? ' 한 줄 HTML 이라 줄 번호(line)는 빼고, where 의 요소 경로(tag:nth-of-type(n))로 위치를 알려 줍니다.' : ''),
        ];
    }

    private function add(string $rule, string $severity, string $where, string $message, string $fix, int $points, ?int $line = null): void
    {
        $this->deduct[$rule] = ($this->deduct[$rule] ?? 0) + $points;
        $f = ['rule' => $rule, 'severity' => $severity, 'where' => $where, 'message' => $message, 'fix' => $fix];
        if ($line !== null && $line > 0 && !$this->singleLine) {
            $f['line'] = $line;
        }
        $this->fixes[] = $f;
    }

    /** CSS → [{sel, decl:[prop=>value]}] — @media 안쪽 규칙도 평평하게 읽는다. */
    private function parseRules(string $css): array
    {
        $css = preg_replace('#/\*.*?\*/#s', '', $css) ?? '';
        $out = [];
        if (preg_match_all('/([^{}]+)\{([^{}]*)\}/', $css, $m, PREG_SET_ORDER)) {
            foreach ($m as $b) {
                $sel = trim($b[1]);
                if ($sel === '' || str_starts_with($sel, '@')) {
                    continue;
                }
                $out[] = ['sel' => $sel, 'decl' => $this->parseDecl($b[2])];
            }
        }
        return $out;
    }

    private function parseDecl(string $s): array
    {
        $d = [];
        foreach (explode(';', $s) as $part) {
            $i = strpos($part, ':');
            if ($i === false) {
                continue;
            }
            $p = strtolower(trim(substr($part, 0, $i)));
            $v = trim(str_replace('!important', '', substr($part, $i + 1)));
            if ($p !== '' && $v !== '') {
                $d[$p] = $v;
            }
        }
        return $d;
    }

    /** 값 → 색 [r,g,b,a]. var(--x) 는 사용자 :root → 정본 순으로 푼다. */
    private function resolve(string $v, int $depth = 0): ?array
    {
        $v = trim($v);
        if ($depth > 4) {
            return null;
        }
        if (preg_match('/^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/', $v, $m)) {
            if (isset($this->vars[$m[1]])) {
                return $this->resolve($this->vars[$m[1]], $depth + 1);
            }
            if (isset($this->palette['names'][$m[1]])) {
                return Color::parse($this->palette['names'][$m[1]]);
            }
            return isset($m[2]) ? $this->resolve($m[2], $depth + 1) : null;
        }
        return Color::parse($v);
    }

    private function checkColors(array $rules, \DOMXPath $xp, array &$stats): void
    {
        $found = []; // hex => [count, where, prop, role, pair, large, semantic]
        /** $pair = 짝 색(글자면 배경, 배경이면 글자) — 제안 토큰이 이 짝과 대비 기준을 넘는지 본다(2026-10-12 MCP 3차) */
        $scan = function (string $prop, string $value, string $where, ?int $line, ?array $pair = null, bool $large = false, string $ctxText = '') use (&$found, &$stats): void {
            if (!preg_match(self::COLOR_PROPS, $prop)) {
                return;
            }
            $stats['var_uses'] += preg_match_all('/var\(\s*--/', $value);
            // var(--토큰, #폴백) 의 폴백은 토큰을 쓴 것이다 — 정본 밖 색으로 세지 않는다(2026-10-12 MCP 시험: 정본 토큰을 썼는데 폴백 hex 가 경고됨)
            $value = self::stripVarFallbacks($value);
            if (!preg_match_all(Color::LITERAL, $value, $m)) {
                if (preg_match('/^(white|black|red|blue|green|gray|grey|yellow|orange|navy|silver)$/i', trim($value))) {
                    $m = [[trim($value)]];
                } else {
                    return;
                }
            }
            foreach ($m[0] as $lit) {
                $c = Color::parse($lit);
                if ($c === null) {
                    continue;
                }
                $stats['colors_total']++;
                $hex = sprintf('#%02x%02x%02x', $c[0], $c[1], $c[2]);
                // 반투명 검정·흰색(그림자·덮개)은 색 정의가 아니라 효과라 세지 않는다
                if ($c[3] < 1 && in_array($hex, ['#000000', '#ffffff'], true)) {
                    continue;
                }
                if (isset($this->palette['values'][$hex])) {
                    continue;
                }
                $stats['colors_off_token']++;
                $found[$hex] ??= [
                    'count' => 0, 'where' => $where, 'line' => $line, 'prop' => $prop,
                    'role' => self::roleOf($prop), 'pair' => $pair, 'large' => $large,
                    'semantic' => (bool) preg_match(self::SEMANTIC_CTX, $where . ' ' . $ctxText),
                ];
                $found[$hex]['count']++;
            }
        };
        foreach ($rules as $r) {
            $d = $r['decl'];
            $fgC = isset($d['color']) ? $this->resolve($d['color']) : null;
            $bgC = $this->bgValue($d) !== null ? $this->resolve((string) $this->bgValue($d)) : null;
            foreach ($d as $p => $v) {
                $role = self::roleOf($p);
                $pair = $role === 'text' ? ($bgC ?? [255, 255, 255, 1]) : ($role === 'bg' ? $fgC : null);
                $scan($p, $v, $r['sel'], null, $pair, self::isLarge($d));
            }
        }
        foreach ($xp->query('//*[@style]') as $el) {
            /** @var \DOMElement $el */
            $d = $this->parseDecl($el->getAttribute('style'));
            $fgC = isset($d['color']) ? $this->resolve($d['color']) : null;
            if ($fgC === null && $this->bgValue($d) !== null && trim($el->textContent) !== '') {
                $fgC = $this->inheritedColor($el); // 배경만 인라인이면 글자색은 조상에서 — 없으면 짝을 모른다
            }
            foreach ($d as $p => $v) {
                $role = self::roleOf($p);
                $b = $role === 'text' ? $this->bgOf($el) : null;
                $pair = $role === 'text' ? ($b === false ? null : ($b ?? [255, 255, 255, 1])) : ($role === 'bg' ? $fgC : null);
                $scan($p, $v, self::path($el), $el->getLineNo(), $pair, self::isLarge($d), $el->getAttribute('class'));
            }
        }
        foreach ($xp->query('//*[@fill or @stroke or @color or @bgcolor]') as $el) {
            /** @var \DOMElement $el */
            foreach (['fill', 'stroke', 'color', 'bgcolor'] as $a) {
                $v = $el->getAttribute($a);
                if ($v !== '' && !in_array(strtolower($v), ['none', 'currentcolor', 'transparent', 'inherit'], true)) {
                    $scan($a === 'bgcolor' ? 'background-color' : ($a === 'color' ? 'color' : $a), $v, self::path($el), $el->getLineNo());
                }
            }
        }
        foreach ($found as $hex => $f) {
            $skin = $this->palette['skins'][$hex] ?? null;
            if ($skin !== null) {
                // 예시 스킨 색(솔리데오 크림슨 등)은 정본 기본값이 아니다 — 같은 brand 단계를 쓰는 역할 토큰 + 스킨 파일로 안내(O-12)
                $this->add('colors', 'warn', $f['where'], "예시 스킨({$skin['label']}) 색 {$hex}({$skin['token']})를 {$f['count']}번 직접 썼습니다({$f['prop']}) — 정본은 역할 토큰입니다.", $this->suggestSkin($hex, $skin, $f), 4, $f['line']);
                continue;
            }
            $this->add('colors', 'warn', $f['where'], "정본 밖 색 {$hex} 를 {$f['count']}번 직접 썼습니다({$f['prop']}).", $this->suggest($hex, $f), 4, $f['line']);
        }
    }

    /**
     * 스킨 색 → 그 brand 단계를 가리키는 역할 토큰(정본 기본값이 같은 단계 값인 것) 중 쓰임이 맞는 것.
     * 대비는 스킨을 입혔을 때 실제로 보이는 색(이 hex)으로 잰다. 맞는 역할 토큰이 없으면 일반 제안으로.
     */
    private function suggestSkin(string $hex, array $skin, array $f): string
    {
        $base = $this->palette['names'][$skin['token']] ?? null; // 정본 기본값에서 같은 단계의 색
        $c = Color::parse($hex);
        $need = $f['large'] ? 3.0 : 4.5;
        $cands = [];
        if ($base !== null && $c !== null) {
            foreach ($this->palette['canonical'] as $name => $layer) {
                if ($layer !== 'semantic' || strtolower($this->palette['names'][$name] ?? '') !== strtolower($base) || !self::roleOk($f['role'], $name)) {
                    continue;
                }
                $ratio = null;
                if ($f['pair'] !== null) {
                    $ratio = $f['role'] === 'text' ? Color::contrast($c, $f['pair']) : Color::contrast($f['pair'], $c);
                }
                // 쓰임 앞머리가 맞는 이름 먼저(면=fill/bg, 글자=text, 테두리=border, 아이콘=icon)
                $pref = match ($f['role']) { 'bg' => '/^--(fill|bg)-/', 'text' => '/^--text-/', 'border' => '/^--border-/', 'icon' => '/^--icon-/', default => '/^--accent-/' };
                $cands[] = ['token' => $name, 'ratio' => $ratio, 'rank' => preg_match($pref, $name) ? 0 : 1];
            }
        }
        if (!$cands) {
            return $this->suggest($hex, $f);
        }
        usort($cands, static fn (array $a, array $b): int => $a['rank'] <=> $b['rank'] ?: strcmp($a['token'], $b['token']));
        $best = $cands[0];
        $file = $skin['file'] !== '' ? $skin['file'] : '스킨 파일';
        $tail = $best['ratio'] !== null
            ? ($best['ratio'] >= $need ? " — 짝 색과 대비 {$best['ratio']}:1(기준 {$need}:1)" : " — 다만 짝 색과 대비 {$best['ratio']}:1 이 기준 {$need}:1 미달이라 짝 색도 바꾸세요")
            : '';
        return "역할 토큰 var({$best['token']}) 로 바꾸고, 색은 {$file}(--brand-* 덮어쓰기)로 입히세요{$tail}.";
    }

    /** 정본 밖 색에 붙는 계열 — 정보·성공·경고·위험 색은 그 의미로 쓰일 때만 제안한다. */
    private const SEMANTIC_TOKEN = '/(information|success|warning|danger|critical|positive|caution|(^|-)info(-|$)|-error)/';
    private const SEMANTIC_CTX = '/(info|success|warn|danger|error|alert|critical|positive|caution|notice|toast|성공|경고|오류|위험|안내)/i';
    /** 효과용(반투명) 토큰 — 색 정의 대신 제안하지 않는다 */
    private const EFFECT_TOKEN = '/(alpha|opacity)/';

    private static function roleOf(string $prop): string
    {
        return match (true) {
            in_array($prop, ['color', 'caret-color', 'text-decoration-color', 'text-decoration'], true) => 'text',
            in_array($prop, ['background', 'background-color', 'bgcolor'], true) => 'bg',
            str_starts_with($prop, 'border') || str_starts_with($prop, 'outline') => 'border',
            in_array($prop, ['fill', 'stroke'], true) => 'icon',
            default => 'other',
        };
    }

    /**
     * 제안할 수 있는 토큰 — powerGuide 정본(solideo-tokens.css 에 있는 이름) 한 체계만(O-12, 2026-10-15).
     * 키트 내부 이름(--krds-…·--hb-…)·플랫폼 브랜드(--pp-…)는 판정에선 정본으로 인정하지만 제안하지 않는다(두 체계를 섞지 않는다).
     */
    private function suggestable(string $name): bool
    {
        return isset($this->palette['canonical'][$name]);
    }

    /** 역할(semantic) 토큰인가 — 정본. 아니면 팔레트(primitive) */
    private function isRole(string $name): bool
    {
        return ($this->palette['canonical'][$name] ?? '') === 'semantic';
    }

    /** 토큰 이름이 쓰임과 맞는가 — 글자 자리에 bg-/fill- 이름, 면 자리에 text-/border- 이름을 내지 않는다. */
    private static function roleOk(string $role, string $name): bool
    {
        $n = ltrim($name, '-');
        $deny = match ($role) {
            'text' => '/^(bg|fill|border)-/',
            'bg' => '/^(text|border|icon)-/',
            'border' => '/^(text|bg|fill|icon)-/',
            'icon' => '/^(bg|border)-/',
            default => null,
        };
        return $deny === null || !preg_match($deny, $n);
    }

    /**
     * 가까운 정본 토큰 제안 — ① 같은 쓰임(이름·의미 계열) ② 짝 색과 대비 기준(본문 4.5·큰 글자 3) 을 넘는 것만, 그중 색 거리 가까운 순.
     * 그런 것이 없으면 쓰임 제한을 풀고 대비 기준만 지키는 가장 가까운 토큰. 그래도 없으면 짝 색을 바꾸라고 안내한다.
     */
    private function suggest(string $hex, array $f): string
    {
        $need = $f['large'] ? 3.0 : 4.5;
        $list = $this->rankTokens($hex, $f['role'], $f['pair'], $f['large'], (bool) $f['semantic']);
        if ($list === null) {
            return '정본 토큰(var(--…))으로 바꾸세요.';
        }
        if ($list) {
            $best = $list[0];
            $tail = $best['ratio'] !== null ? " — 짝 색과 대비 {$best['ratio']}:1(기준 {$need}:1)" : '';
            $alt = isset($list[1]) && $list[1]['hex'] !== $best['hex'] ? " 다음 후보 var({$list[1]['token']}) ({$list[1]['hex']})." : '';
            return "가까운 정본 토큰 var({$best['token']}) ({$best['hex']}) 로 바꾸세요{$tail}.{$alt}";
        }
        return $f['pair'] !== null
            ? "정본 토큰 중 짝 색과 대비 {$need}:1 을 넘는 색이 없습니다 — 짝 색(글자색이나 배경색)부터 정본 토큰으로 바꾸세요."
            : '정본 토큰(var(--…))으로 바꾸세요.';
    }

    /** 가장 알맞은 토큰 하나(없으면 null) */
    private function pickToken(string $hex, string $role, ?array $pair, bool $large, bool $semantic): ?array
    {
        $list = $this->rankTokens($hex, $role, $pair, $large, $semantic);
        return $list ? $list[0] : null;
    }

    /**
     * 정본 토큰 후보 순위 — ① 같은 쓰임(이름·의미 계열) ② 짝 색과 대비 기준(본문 4.5·큰 글자 3) 을 넘는 것만, 그중 색 거리 가까운 순.
     * 같은 쓰임이 없으면 쓰임 제한을 풀고 대비 기준만 지키는 것. 색을 못 읽으면 null.
     */
    private function rankTokens(string $hex, string $role, ?array $pair, bool $large, bool $semantic): ?array
    {
        $c = Color::parse($hex);
        if ($c === null) {
            return null;
        }
        $need = $large ? 3.0 : 4.5;
        // 역할 토큰(0~2) 먼저, 기준을 넘는 역할 토큰이 없을 때만 팔레트(3~5)
        $tiers = [[], [], [], [], [], []];
        $chroma = max($c[0], $c[1], $c[2]) - min($c[0], $c[1], $c[2]);
        // 같은 계열 우선 — 유채색 면(버튼 등)은 주색(accent·brand) 계열, 글자는 글자·회색 계열
        $family = match (true) {
            $role === 'bg' && $chroma > 40 => '/(accent|brand|blue)/',
            $role === 'text' && $chroma <= 40 => '/(^--text-|gray|ink|static-black)/',
            $role === 'text' => '/(^--text-|accent|brand|blue)/',
            $role === 'bg' => '/(^--bg-|^--fill-(primary|secondary|tertiary|disabled)$|gray|ink|static-white)/', // 무채색 면에 주색(fill-accent…)을 내지 않는다
            default => null,
        };
        foreach ($this->palette['names'] as $name => $h) {
            if (preg_match(self::EFFECT_TOKEN, $name) || !$this->suggestable($name)) {
                continue;
            }
            if (preg_match(self::SEMANTIC_TOKEN, $name) && !$semantic) {
                continue;
            }
            $d = Color::parse($h);
            if ($d === null || $d[3] < 1) {
                continue;
            }
            $ratio = null;
            if ($pair !== null) {
                $ratio = $role === 'text' ? Color::contrast($d, $pair) : Color::contrast($pair, $d);
                if ($ratio < $need) {
                    continue;
                }
            }
            $dist = ($c[0] - $d[0]) ** 2 + ($c[1] - $d[1]) ** 2 + ($c[2] - $d[2]) ** 2;
            $tier = (!self::roleOk($role, $name) ? 2 : ($family !== null && !preg_match($family, $name) ? 1 : 0)) + ($this->isRole($name) ? 0 : 3);
            // 같은 값이면 쓰임 앞머리가 맞는 이름(면=fill/bg, 글자=text …)을 먼저 — #256ef4 면에 --accent-primary 대신 --fill-accent
            $pref = match ($role) { 'bg' => '/^--(fill|bg)-/', 'text' => '/^--text-/', 'border' => '/^--border-/', 'icon' => '/^--icon-/', default => '/^$/' };
            $tiers[$tier][] = ['token' => $name, 'hex' => $h, 'dist' => $dist, 'ratio' => $ratio, 'pref' => preg_match($pref, $name) ? 0 : 1];
        }
        foreach ($tiers as $list) {
            if ($list) {
                usort($list, static fn (array $a, array $b): int => $a['dist'] <=> $b['dist'] ?: ($a['pref'] <=> $b['pref'] ?: strcmp($a['token'], $b['token'])));
                return $list;
            }
        }
        return [];
    }

    private function bgValue(array $d): ?string
    {
        return $d['background-color'] ?? (isset($d['background']) && !str_contains($d['background'], 'url(') && !str_contains($d['background'], 'gradient') ? $d['background'] : null);
    }

    /** 자신·조상 인라인 배경 — 없으면 null, 사진·그라데이션 위면 false(렌더 없이 못 잰다) */
    private function bgOf(\DOMElement $el): array|false|null
    {
        for ($p = $el; $p instanceof \DOMElement; $p = $p->parentNode) {
            $pd = $this->parseDecl($p->getAttribute('style'));
            $bg = (string) ($pd['background'] ?? '');
            if (str_contains($bg, 'url(') || str_contains($bg, 'gradient') || str_contains((string) ($pd['background-image'] ?? ''), 'url(')) {
                return false;
            }
            $v = $this->bgValue($pd);
            if ($v !== null) {
                $c = $this->resolve($v);
                if ($c !== null && $c[3] >= 1) {
                    return $c;
                }
            }
        }
        return null;
    }

    private function inheritedColor(\DOMElement $el): ?array
    {
        for ($p = $el->parentNode; $p instanceof \DOMElement; $p = $p->parentNode) {
            $pd = $this->parseDecl($p->getAttribute('style'));
            if (isset($pd['color'])) {
                return $this->resolve($pd['color']);
            }
        }
        return null;
    }

    private static function isLarge(array $d): bool
    {
        $px = self::px((string) ($d['font-size'] ?? ''));
        $bold = in_array($d['font-weight'] ?? '', ['bold', '600', '700', '800', '900'], true);
        return $px !== null && ($px >= 24 || ($bold && $px >= 18.66));
    }

    /** '13px' · '0.8rem' · '0.8em'(16 기준) · 'clamp(...)' 는 null → px */
    private static function px(string $fs): ?float
    {
        $fs = strtolower(trim($fs));
        if (preg_match('/^([\d.]+)px$/', $fs, $m)) {
            return (float) $m[1];
        }
        if (preg_match('/^([\d.]+)r?em$/', $fs, $m)) {
            return (float) $m[1] * 16;
        }
        if (preg_match('/^([\d.]+)pt$/', $fs, $m)) {
            return (float) $m[1] * 4 / 3;
        }
        return null;
    }

    /**
     * 작은 글자 — 본문 14px 미만은 경고(-2), 12px 미만은 오류(-5), 합쳐 최대 -10(2026-10-12 MCP 3차: 13px 를 지적 안 함).
     * CSS 규칙·인라인·Tailwind 임의값(text-[13px])·text-xs 를 본다. 같은 크기는 위치별로 한 번만.
     */
    private const TEXT_MIN = 14.0;
    private const TEXT_ERROR = 12.0;

    private function checkFontSize(array $rules, \DOMXPath $xp, array &$stats): void
    {
        $seen = [];
        $hit = function (float $px, string $where, ?int $line, string $src) use (&$seen, &$stats): void {
            $stats['small_text'] = ($stats['small_text'] ?? 0) + ($px < self::TEXT_MIN ? 1 : 0);
            if ($px >= self::TEXT_MIN) {
                return;
            }
            $k = $where . '|' . $px;
            if (isset($seen[$k])) {
                return;
            }
            $seen[$k] = true;
            $v = rtrim(rtrim(number_format($px, 1, '.', ''), '0'), '.');
            if ($px < self::TEXT_ERROR) {
                $this->add('font_size', 'error', $where, "글자 크기 {$v}px({$src}) — 12px 미만은 읽기 어렵습니다.", '본문은 14px 이상, 꼭 작아야 하는 보조 글(날짜·출처)도 12px 이상으로 두세요.', 5, $line);
            } else {
                $this->add('font_size', 'warn', $where, "글자 크기 {$v}px({$src}) — 본문 기준 14px 보다 작습니다.", '본문·버튼 글자는 14px 이상(정본 font-size 토큰)으로 올리세요. 보조 글이라면 그대로 두어도 됩니다.', 2, $line);
            }
        };
        foreach ($rules as $r) {
            if (isset($r['decl']['font-size']) && ($px = self::px($r['decl']['font-size'])) !== null) {
                $hit($px, $r['sel'], null, $r['decl']['font-size']);
            }
            if (isset($r['decl']['font']) && preg_match('/(?:^|\s)([\d.]+(?:px|r?em|pt))(?:\/|\s)/', $r['decl']['font'] . ' ', $m) && ($px = self::px($m[1])) !== null) {
                $hit($px, $r['sel'], null, $m[1]);
            }
        }
        foreach ($xp->query('//*[@style]') as $el) {
            /** @var \DOMElement $el */
            $d = $this->parseDecl($el->getAttribute('style'));
            if (isset($d['font-size']) && trim($el->textContent) !== '' && ($px = self::px($d['font-size'])) !== null) {
                $hit($px, self::path($el), $el->getLineNo(), $d['font-size']);
            }
        }
        foreach ($xp->query('//*[@class]') as $el) {
            /** @var \DOMElement $el */
            if (trim($el->textContent) === '') {
                continue;
            }
            $cls = ' ' . $el->getAttribute('class') . ' ';
            if (preg_match('/\stext-\[([\d.]+(?:px|r?em))\]\s/', $cls, $m) && ($px = self::px($m[1])) !== null) {
                $hit($px, self::path($el), $el->getLineNo(), "text-[{$m[1]}]");
            } elseif (preg_match('/\stext-xs\s/', $cls)) {
                $hit(12.0, self::path($el), $el->getLineNo(), 'text-xs');
            }
        }
    }

    private function checkImages(\DOMXPath $xp, array &$stats): void
    {
        foreach ($xp->query('//img') as $el) {
            /** @var \DOMElement $el */
            $stats['images']++;
            if (!$el->hasAttribute('alt')) {
                $src = mb_substr(basename($el->getAttribute('src')), 0, 40);
                $this->add('img_alt', 'error', self::path($el) . ($src !== '' ? " ({$src})" : ''), '이미지에 alt 가 없습니다.', '내용이 있는 그림은 alt="설명", 꾸밈용이면 alt="" 를 적으세요.', 5, $el->getLineNo());
            }
        }
        foreach ($xp->query('//input[@type="image"][not(@alt)]') as $el) {
            /** @var \DOMElement $el */
            $this->add('img_alt', 'error', self::path($el), '이미지 버튼(input type=image)에 alt 가 없습니다.', 'alt 에 버튼이 하는 일을 적으세요.', 5, $el->getLineNo());
        }
    }

    /** 접근 가능한 이름 — 글자·aria-label·aria-labelledby(대상 존재)·title·안쪽 img alt·svg title. */
    private function accName(\DOMElement $el, \DOMXPath $xp): string
    {
        foreach (['aria-label', 'title'] as $a) {
            if (trim($el->getAttribute($a)) !== '') {
                return trim($el->getAttribute($a));
            }
        }
        $lb = trim($el->getAttribute('aria-labelledby'));
        if ($lb !== '') {
            $t = '';
            foreach (preg_split('/\s+/', $lb) ?: [] as $id) {
                $n = $xp->query('//*[@id=' . self::xq($id) . ']')->item(0);
                $t .= $n ? trim($n->textContent) : '';
            }
            if ($t !== '') {
                return $t;
            }
        }
        $txt = '';
        foreach ($xp->query('.//text()[not(ancestor::*[@aria-hidden="true"]) and not(ancestor::style) and not(ancestor::script)]', $el) as $t) {
            $txt .= $t->nodeValue;
        }
        if (trim($txt) !== '') {
            return trim($txt);
        }
        foreach ($xp->query('.//img[@alt]', $el) as $img) {
            /** @var \DOMElement $img */
            if (trim($img->getAttribute('alt')) !== '') {
                return trim($img->getAttribute('alt'));
            }
        }
        foreach ($xp->query('.//*[local-name()="svg"]/*[local-name()="title"] | .//*[@aria-label]', $el) as $n) {
            $v = $n instanceof \DOMElement && $n->hasAttribute('aria-label') ? $n->getAttribute('aria-label') : $n->textContent;
            if (trim($v) !== '') {
                return trim($v);
            }
        }
        if ($el->tagName === 'input') {
            return trim($el->getAttribute('value'));
        }
        return '';
    }

    private function checkNames(\DOMXPath $xp, array &$stats): void
    {
        $q = '//button | //a[@href] | //*[@role="button" or @role="link" or @role="tab" or @role="menuitem"] | //input[@type="button" or @type="submit" or @type="reset"]';
        foreach ($xp->query($q) as $el) {
            /** @var \DOMElement $el */
            if ($el->getAttribute('aria-hidden') === 'true') {
                continue;
            }
            $stats['buttons_links']++;
            if ($this->accName($el, $xp) === '') {
                $kind = $el->tagName === 'a' ? '링크' : '버튼';
                $this->add('name', 'error', self::path($el), "이름이 없는 {$kind}입니다(아이콘만 있거나 비어 있음).", "보이는 글자를 넣거나 aria-label=\"하는 일\" 을 붙이세요. 아이콘 svg 에는 aria-hidden=\"true\".", 5, $el->getLineNo());
            }
        }
    }

    private function checkLabels(\DOMXPath $xp, array &$stats): void
    {
        $q = '//input[not(@type) or not(@type="hidden" or @type="submit" or @type="button" or @type="reset" or @type="image")] | //select | //textarea';
        foreach ($xp->query($q) as $el) {
            /** @var \DOMElement $el */
            $stats['form_controls']++;
            $ok = trim($el->getAttribute('aria-label')) !== '' || trim($el->getAttribute('aria-labelledby')) !== '' || trim($el->getAttribute('title')) !== '';
            if (!$ok) {
                $id = $el->getAttribute('id');
                if ($id !== '') {
                    foreach ($xp->query('//label[@for=' . self::xq($id) . ']') as $l) {
                        if (trim($l->textContent) !== '') {
                            $ok = true;
                        }
                    }
                }
            }
            if (!$ok) {
                for ($p = $el->parentNode; $p instanceof \DOMElement; $p = $p->parentNode) {
                    if ($p->tagName === 'label' && trim($p->textContent) !== '') {
                        $ok = true;
                        break;
                    }
                }
            }
            if (!$ok) {
                $ph = trim($el->getAttribute('placeholder'));
                $this->add('label', 'error', self::path($el), '입력칸에 이름(label)이 없습니다' . ($ph !== '' ? '(placeholder 는 이름이 아닙니다)' : '') . '.', '<label for="아이디">이름</label> 을 연결하거나, 보이는 이름을 둘 수 없으면 aria-label 을 붙이세요.', 5, $el->getLineNo());
            }
        }
    }

    /**
     * 포커스 표시 지우기 — :focus·a·button·입력칸·* 에 outline:none(0) 을 주고 대신할 표시(outline·box-shadow·border)를 안 준 경우.
     * 같은 대상에 :focus-visible 로 다른 표시를 준 규칙이 있으면 경고로 낮춘다.
     */
    private function checkFocus(array $rules): void
    {
        $hasVisible = false;
        foreach ($rules as $r) {
            if (str_contains($r['sel'], ':focus-visible')) {
                $o = strtolower((string) ($r['decl']['outline'] ?? ''));
                if (($o !== '' && !preg_match('/^(none|0)(\s|$)/', $o)) || isset($r['decl']['box-shadow']) || isset($r['decl']['outline-color']) || isset($r['decl']['outline-width'])) {
                    $hasVisible = true;
                }
            }
        }
        $done = [];
        foreach ($rules as $r) {
            $o = strtolower(trim((string) ($r['decl']['outline'] ?? $r['decl']['outline-style'] ?? '')));
            if ($o === '' || !preg_match('/^(none|0(px)?)(\s|$)|\snone$/', $o)) {
                continue;
            }
            if (isset($r['decl']['box-shadow']) && !preg_match('/^none/i', $r['decl']['box-shadow'])) {
                continue;
            }
            foreach (explode(',', $r['sel']) as $sel) {
                $sel = trim($sel);
                if (str_contains($sel, ':focus-visible') && $hasVisible) {
                    continue;
                }
                $target = str_contains($sel, ':focus')
                    || preg_match('/(^|[\s>+~])(\*|a|button|input|select|textarea|summary)([\s.:#\[>+~]|$)/i', $sel)
                    || str_contains($sel, '[tabindex');
                if (!$target || isset($done[$sel])) {
                    continue;
                }
                $done[$sel] = true;
                $soft = $hasVisible && !str_contains($sel, ':focus');
                $this->add(
                    'focus',
                    $soft || $hasVisible ? 'warn' : 'error',
                    $sel,
                    "{$sel} 에서 포커스 테두리(outline)를 지웠습니다 — 키보드 사용자가 지금 어디에 있는지 볼 수 없습니다.",
                    $hasVisible
                        ? ':focus-visible 표시가 있으니 이 규칙의 outline:none 은 빼도 됩니다(마우스 클릭 때만 숨기려면 :focus:not(:focus-visible)).'
                        : 'outline:none 을 지우거나, :focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px } 처럼 보이는 표시를 함께 주세요.',
                    $hasVisible ? 2 : 5
                );
            }
        }
    }

    /** 버튼에 의미 색(정보·성공·경고·위험 계열)을 면으로 쓴 경우 — 버튼은 주색(primary)·브랜드 계열을 쓴다 */
    private function checkButtonColor(array $rules, \DOMXPath $xp): void
    {
        $seen = [];
        foreach ($xp->query('//button | //a[@href] | //*[@role="button"] | //input[@type="submit" or @type="button" or @type="reset"]') as $el) {
            /** @var \DOMElement $el */
            $ctx = strtolower($el->getAttribute('class') . ' ' . $el->getAttribute('id'));
            if (preg_match(self::SEMANTIC_CTX, $ctx)) {
                continue; // 알림·상태 맥락에서 쓰는 버튼은 의미 색이 맞다
            }
            $d = [];
            foreach ($rules as $r) {
                foreach (explode(',', $r['sel']) as $sel) {
                    if (self::matches(trim($sel), $el)) {
                        $d = array_merge($d, $r['decl']);
                    }
                }
            }
            $d = array_merge($d, $this->parseDecl($el->getAttribute('style')));
            $v = $this->bgValue($d);
            if ($v === null) {
                continue;
            }
            $semName = null;
            if (preg_match('/var\(\s*(--[\w-]+)/', $v, $m) && preg_match(self::SEMANTIC_TOKEN, $m[1])) {
                $semName = $m[1];
            } else {
                $c = $this->resolve($v);
                if ($c === null || $c[3] < 1) {
                    continue;
                }
                $hex = sprintf('#%02x%02x%02x', $c[0], $c[1], $c[2]);
                $names = array_keys(array_filter($this->palette['names'], static fn (string $h): bool => strtolower($h) === $hex));
                if ($names && count(array_filter($names, static fn (string $n): bool => !preg_match(self::SEMANTIC_TOKEN, $n))) === 0) {
                    $semName = $names[0];
                }
            }
            if ($semName === null) {
                continue;
            }
            $where = self::path($el);
            if (isset($seen[$semName . $v])) {
                continue;
            }
            $seen[$semName . $v] = true;
            $fg = $this->resolve((string) ($d['color'] ?? '#ffffff')) ?? [255, 255, 255, 1];
            $c = $this->resolve($v) ?? [0, 0, 0, 1];
            $t = $this->pickToken(sprintf('#%02x%02x%02x', $c[0], $c[1], $c[2]), 'bg', $fg, false, false);
            $this->add(
                'button_color',
                'warn',
                $where,
                "버튼 면에 의미 색 {$v}({$semName} 계열)을 썼습니다 — 정보·성공·경고·위험 색은 알림·상태 표시용입니다.",
                $t !== null ? "주색 계열 var({$t['token']}) ({$t['hex']}) 로 바꾸세요 — 글자와 대비 {$t['ratio']}:1." : '주색 역할 토큰 var(--fill-accent) 로 바꾸세요.',
                3,
                $el->getLineNo()
            );
        }
    }

    private function checkHeadings(\DOMXPath $xp, array &$stats, bool $fullPage): void
    {
        $prev = 0;
        $h1 = 0;
        foreach ($xp->query('//h1|//h2|//h3|//h4|//h5|//h6') as $el) {
            /** @var \DOMElement $el */
            $stats['headings']++;
            $lv = (int) substr($el->tagName, 1);
            if ($lv === 1) {
                $h1++;
            }
            if ($prev === 0 && $lv > 2) {
                $this->add('heading', 'warn', self::path($el), "첫 제목이 h{$lv} 입니다 — 위 단계(h1·h2) 없이 시작합니다.", '화면 첫 제목은 h1(조각이면 h2)부터 쓰고, 크기는 CSS 로 조정하세요.', 3, $el->getLineNo());
            } elseif ($lv === 1 && $h1 === 1 && $prev > 1) {
                // h1 이 다른 제목 뒤에 나온다(h3 → h1) — 화면 낭독기 제목 탐색이 거꾸로 읽힌다(2026-10-10 MCP 시험 결함 16)
                $this->add('heading', 'warn', self::path($el), "h1 앞에 h{$prev} 가 있습니다 — 화면 제목(h1)이 문서 첫 제목이어야 합니다.", 'h1 을 앞 제목들보다 위로 옮기거나, 앞 제목의 단계를 h1 아래로 맞추세요(크기는 CSS 로).', 3, $el->getLineNo());
            } elseif ($prev > 0 && $lv > $prev + 1) {
                $this->add('heading', 'warn', self::path($el), "제목 단계를 건너뛰었습니다(h{$prev} 다음 h{$lv}).", "h" . ($prev + 1) . " 을 쓰거나 크기는 CSS 로 조정하세요.", 3, $el->getLineNo());
            }
            $prev = $lv;
        }
        if ($fullPage) { // 조각(부품 하나)은 h1 이 없어도 된다 — 전체 페이지일 때만 본다
            if ($h1 === 0) {
                $this->add('heading', 'warn', 'body', '페이지 제목(h1)이 없습니다.', '화면마다 h1 을 하나 두세요(로고가 아니라 이 화면의 제목).', 5);
            } elseif ($h1 > 1) {
                $this->add('heading', 'warn', 'body', "h1 이 {$h1}개입니다.", 'h1 은 화면에 하나만 두고 나머지는 h2 로 내리세요.', 3);
            }
        }
    }

    private function checkContrast(array $rules, \DOMXPath $xp, array &$stats): void
    {
        $seen = [];
        $fail = function (float $ratio, float $need, string $where, string $fg, string $bg, ?int $line, string $assume = '') use (&$stats, &$seen): void {
            $key = strtolower($where . '|' . $fg . '|' . $bg);
            if (isset($seen[$key])) {
                return;
            }
            $seen[$key] = true;
            $stats['contrast_pairs']++;
            if ($ratio < $need) {
                $this->add('contrast', 'error', $where, "글자 대비 {$ratio}:1 — 기준 {$need}:1 미달({$fg} / {$bg}){$assume}.", $this->contrastFix($fg, $bg, $need), 5, $line);
            }
        };
        // 정리 필요: self::isLarge() 와 거의 같다(이쪽은 em 을 안 읽는다). 합치면 em 글자의 대비 기준이 바뀌므로 판정 재측정과 함께 할 것.
        $isLarge = static function (array $d): bool {
            $fs = $d['font-size'] ?? '';
            $px = preg_match('/^([\d.]+)px$/', $fs, $m) ? (float) $m[1] : (preg_match('/^([\d.]+)rem$/', $fs, $m) ? (float) $m[1] * 16 : 0.0);
            $bold = in_array($d['font-weight'] ?? '', ['bold', '600', '700', '800', '900'], true);
            return $px >= 24 || ($bold && $px >= 18.66);
        };
        // ① 한 규칙 안에 글자색·배경색이 함께 있는 경우
        foreach ($rules as $r) {
            $d = $r['decl'];
            $bgv = $d['background-color'] ?? (isset($d['background']) && !str_contains($d['background'], 'url(') && !str_contains($d['background'], 'gradient') ? $d['background'] : null);
            if (!isset($d['color']) || $bgv === null) {
                continue;
            }
            $fg = $this->resolve($d['color']);
            $bg = $this->resolve($bgv);
            if ($fg === null || $bg === null || $bg[3] < 1) {
                continue;
            }
            $fail(Color::contrast($fg, $bg), $isLarge($d) ? 3.0 : 4.5, $r['sel'], $d['color'], $bgv, null);
        }
        // ② 인라인 글자색 — 배경은 자신·조상 인라인에서 찾고, 없으면 흰 바탕으로 가정
        foreach ($xp->query('//*[@style]') as $el) {
            /** @var \DOMElement $el */
            $d = $this->parseDecl($el->getAttribute('style'));
            if (!isset($d['color']) || trim($el->textContent) === '') {
                continue;
            }
            $fg = $this->resolve($d['color']);
            if ($fg === null) {
                continue;
            }
            $bg = null;
            $bgSrc = '';
            for ($p = $el; $p instanceof \DOMElement; $p = $p->parentNode) {
                $pd = $p === $el ? $d : $this->parseDecl($p->getAttribute('style'));
                $v = $pd['background-color'] ?? (isset($pd['background']) && !str_contains($pd['background'], 'url(') && !str_contains($pd['background'], 'gradient') ? $pd['background'] : null);
                if ($v !== null) {
                    $c = $this->resolve($v);
                    if ($c !== null && $c[3] >= 1) {
                        $bg = $c;
                        $bgSrc = $v;
                        break;
                    }
                    if (str_contains((string) ($pd['background'] ?? ''), 'url(') || str_contains((string) ($pd['background'] ?? ''), 'gradient')) {
                        continue 2; // 사진·그라데이션 위 글자는 렌더 없이 못 잰다
                    }
                }
            }
            $assume = '';
            if ($bg === null) {
                $bg = [255, 255, 255, 1];
                $bgSrc = '#ffffff';
                $assume = ' · 배경 미지정 — 흰 바탕으로 가정';
            }
            $fail(Color::contrast($fg, $bg), $isLarge($d) ? 3.0 : 4.5, self::path($el), $d['color'], $bgSrc, $el->getLineNo(), $assume);
        }
        // ③ 선택자로 준 색(.card .t{color} + .card{background}) — 요소마다 맞는 규칙을 모아 글자색·배경을 정한다
        $eff = []; // 요소 경로 → 합친 선언(인라인이 이김)
        $effOf = function (\DOMElement $el) use (&$eff, $rules): array {
            $k = $el->getNodePath(); // spl_object_id 는 버려진 DOM 래퍼 번호를 재사용해 다른 요소 선언을 돌려준다
            if (!isset($eff[$k])) {
                $d = [];
                foreach ($rules as $r) {
                    foreach (explode(',', $r['sel']) as $sel) {
                        if (self::matches(trim($sel), $el)) {
                            $d = array_merge($d, $r['decl']);
                        }
                    }
                }
                $eff[$k] = array_merge($d, $this->parseDecl($el->getAttribute('style')));
            }
            return $eff[$k];
        };
        foreach ($xp->query('//body//*[text()[normalize-space()]] | //*[not(ancestor::body)][text()[normalize-space()]]') as $el) {
            /** @var \DOMElement $el */
            if (in_array($el->tagName, ['style', 'script', 'head', 'title'], true)) {
                continue;
            }
            $d = $effOf($el);
            $fgV = null;
            for ($p = $el; $p instanceof \DOMElement; $p = $p->parentNode) {
                $pd = $p === $el ? $d : $effOf($p);
                if (isset($pd['color'])) {
                    $fgV = $pd['color'];
                    break;
                }
            }
            if ($fgV === null || isset($this->parseDecl($el->getAttribute('style'))['color'])) {
                continue; // 색 미지정(브라우저 기본 검정) · 인라인 글자색은 ②에서 본다
            }
            $fg = $this->resolve($fgV);
            if ($fg === null) {
                continue;
            }
            $bg = null;
            $bgSrc = '';
            for ($p = $el; $p instanceof \DOMElement; $p = $p->parentNode) {
                $pd = $p === $el ? $d : $effOf($p);
                $bgAll = (string) ($pd['background'] ?? '') . ' ' . (string) ($pd['background-image'] ?? '');
                if (str_contains($bgAll, 'url(') || str_contains($bgAll, 'gradient')) {
                    continue 2;
                }
                $v = $this->bgValue($pd);
                if ($v !== null && ($c = $this->resolve($v)) !== null && $c[3] >= 1) {
                    $bg = $c;
                    $bgSrc = $v;
                    break;
                }
            }
            $assume = '';
            if ($bg === null) {
                $bg = [255, 255, 255, 1];
                $bgSrc = '#ffffff';
                $assume = ' · 배경 미지정 — 흰 바탕으로 가정';
            }
            $fail(Color::contrast($fg, $bg), $isLarge($d) ? 3.0 : 4.5, self::path($el), $fgV, $bgSrc, $el->getLineNo(), $assume);
        }
    }

    /** 대비 오류 고칠 점 — 배경은 두고 글자색을 정본 토큰으로, 그게 안 되면 글자는 두고 면색을 */
    private function contrastFix(string $fg, string $bg, float $need): string
    {
        $fgC = $this->resolve($fg);
        $bgC = $this->resolve($bg);
        if ($fgC === null || $bgC === null) {
            return '글자를 더 진하게(또는 배경을 더 옅게) 하세요.';
        }
        $large = $need < 4.5;
        $t = $this->pickToken(sprintf('#%02x%02x%02x', $fgC[0], $fgC[1], $fgC[2]), 'text', $bgC, $large, false);
        $b = $this->pickToken(sprintf('#%02x%02x%02x', $bgC[0], $bgC[1], $bgC[2]), 'bg', $fgC, $large, false);
        $out = [];
        if ($t !== null) {
            $out[] = "글자색을 var({$t['token']}) ({$t['hex']}) 로 — 대비 {$t['ratio']}:1";
        }
        if ($b !== null) {
            $out[] = "또는 배경을 var({$b['token']}) ({$b['hex']}) 로 — 대비 {$b['ratio']}:1";
        }
        return $out ? implode(', ', $out) . '.' : '글자를 더 진하게(또는 배경을 더 옅게) 하세요 — 정본 토큰 중 이 짝으로 기준을 넘는 색이 없습니다.';
    }

    /** 아주 단순한 선택자 맞추기 — 태그·.클래스·#id 와 그 조합, 공백(자손)·>(자식). 가상 클래스·속성 선택자는 건너뛴다 */
    private static function matches(string $sel, \DOMElement $el): bool
    {
        if ($sel === '' || preg_match('/[:\[~+*]/', $sel)) {
            return false;
        }
        $parts = preg_split('/\s*(>)\s*|\s+/', $sel, -1, PREG_SPLIT_DELIM_CAPTURE | PREG_SPLIT_NO_EMPTY) ?: [];
        $one = static function (string $c, \DOMElement $e): bool {
            if (!preg_match('/^([a-z][\w-]*)?((?:[.#][\w-]+)*)$/i', $c, $m)) {
                return false;
            }
            if ($m[1] !== '' && strtolower($m[1]) !== strtolower($e->tagName)) {
                return false;
            }
            preg_match_all('/([.#])([\w-]+)/', $m[2], $mm, PREG_SET_ORDER);
            $cls = preg_split('/\s+/', trim($e->getAttribute('class'))) ?: [];
            foreach ($mm as $x) {
                if ($x[1] === '#' ? $e->getAttribute('id') !== $x[2] : !in_array($x[2], $cls, true)) {
                    return false;
                }
            }
            return $m[1] !== '' || $m[2] !== '';
        };
        $i = count($parts) - 1;
        if ($i < 0 || !$one($parts[$i], $el)) {
            return false;
        }
        $cur = $el;
        $i--;
        while ($i >= 0) {
            $child = false;
            if ($parts[$i] === '>') {
                $child = true;
                $i--;
                if ($i < 0) {
                    return false;
                }
            }
            $want = $parts[$i];
            $p = $cur->parentNode;
            $found = null;
            while ($p instanceof \DOMElement) {
                if ($one($want, $p)) {
                    $found = $p;
                    break;
                }
                if ($child) {
                    break;
                }
                $p = $p->parentNode;
            }
            if ($found === null) {
                return false;
            }
            $cur = $found;
            $i--;
        }
        return true;
    }

    private static function path(\DOMElement $el): string
    {
        $one = static function (\DOMElement $e): string {
            $s = $e->tagName;
            if ($e->getAttribute('id') !== '') {
                $s .= '#' . $e->getAttribute('id');
            }
            $cls = array_slice(array_filter(preg_split('/\s+/', trim($e->getAttribute('class'))) ?: []), 0, 2);
            foreach ($cls as $c) {
                $s .= '.' . $c;
            }
            // id 가 없고 같은 태그 형제가 여럿이면 몇 번째인지 — 한 줄 HTML 에서도 요소를 바로 찾게
            if ($e->getAttribute('id') === '' && $e->parentNode instanceof \DOMElement) {
                $n = 0; $at = 0;
                foreach ($e->parentNode->childNodes as $sib) {
                    if ($sib instanceof \DOMElement && $sib->tagName === $e->tagName) {
                        $n++;
                        if ($sib->isSameNode($e)) $at = $n;
                    }
                }
                if ($n > 1) $s .= ":nth-of-type({$at})";
            }
            return $s;
        };
        $p = $el->parentNode;
        return ($p instanceof \DOMElement && !in_array($p->tagName, ['body', 'html'], true) ? $one($p) . ' > ' : '') . $one($el);
    }

    /** 'var(--a, #fff)' → 'var(--a)' (괄호가 겹친 rgb() 폴백도). */
    private static function stripVarFallbacks(string $v): string
    {
        $out = '';
        $len = strlen($v);
        $i = 0;
        while ($i < $len) {
            if (preg_match('/\Gvar\(\s*(--[\w-]+)\s*,/A', $v, $m, 0, $i)) {
                $depth = 1;
                $j = $i + strlen($m[0]);
                while ($j < $len && $depth > 0) {
                    if ($v[$j] === '(') $depth++;
                    elseif ($v[$j] === ')') $depth--;
                    $j++;
                }
                $out .= 'var(' . $m[1] . ')';
                $i = $j;
                continue;
            }
            $out .= $v[$i];
            $i++;
        }
        return $out;
    }

    /**
     * onclick 만 붙은 div·span 같은 가짜 버튼 — 키보드로 닿지 않고 화면 낭독기가 버튼으로 읽지 못한다(2026-10-12 MCP 시험: 통과로 나옴).
     * role 없음 → 오류, role 은 있는데 tabindex 없음 → 오류, 키보드 처리(onkeydown 등) 없음 → 경고.
     */
    private function checkFakeButtons(\DOMXPath $xp, array &$stats): void
    {
        $q = '//*[@onclick][not(self::button or self::a or self::input or self::select or self::textarea or self::summary or self::label or self::option or self::body or self::html)]';
        foreach ($xp->query($q) as $el) {
            /** @var \DOMElement $el */
            if ($el->getAttribute('aria-hidden') === 'true') {
                continue;
            }
            $role = strtolower(trim($el->getAttribute('role')));
            if (!in_array($role, ['button', 'link', 'tab', 'menuitem'], true)) {
                $stats['buttons_links']++;
            }
            $tab = $el->getAttribute('tabindex');
            $kbd = $el->hasAttribute('onkeydown') || $el->hasAttribute('onkeyup') || $el->hasAttribute('onkeypress');
            $where = self::path($el);
            if (!in_array($role, ['button', 'link', 'tab', 'menuitem', 'checkbox', 'switch', 'option'], true)) {
                $this->add('fake_button', 'error', $where, "클릭만 되는 <{$el->tagName}> 입니다(onclick 만 있고 role·tabindex·키보드 처리가 없음) — 키보드·화면 낭독기로 쓸 수 없습니다.", '<button type="button">…</button> 으로 바꾸세요. 바꿀 수 없으면 role="button" tabindex="0" 과 Enter·Space 키 처리(onkeydown)를 함께 붙이세요.', 5, $el->getLineNo());
                continue;
            }
            if ($tab === '' || (int) $tab < 0) {
                $this->add('fake_button', 'error', $where, "role=\"{$role}\" 인데 tabindex 가 없어 Tab 키로 닿지 않습니다.", 'tabindex="0" 을 붙이거나 <button> 으로 바꾸세요.', 5, $el->getLineNo());
            } elseif (!$kbd) {
                $this->add('fake_button', 'warn', $where, "role=\"{$role}\" 요소에 키보드 처리가 없어 Enter·Space 로 실행되지 않습니다.", 'onkeydown 에서 Enter·Space 를 처리하거나 <button> 으로 바꾸세요.', 3, $el->getLineNo());
            }
            // button·link·tab·menuitem 역할은 checkNames 가 이미 이름을 본다
            if (!in_array($role, ['button', 'link', 'tab', 'menuitem'], true) && $this->accName($el, $xp) === '') {
                $this->add('name', 'error', $where, '이름이 없는 버튼입니다(아이콘만 있거나 비어 있음).', '보이는 글자를 넣거나 aria-label="하는 일" 을 붙이세요.', 5, $el->getLineNo());
            }
        }
    }

    /**
     * 제목 셀(th)이 없는 데이터 표 — 화면 낭독기가 칸마다 머리를 읽어 주지 못한다(KWCAG 5.3.1 표의 구성, 2026-10-10 MCP 시험 결함 17).
     * 배치용 표(role=presentation|none)와 한 줄·한 칸 표는 보지 않는다.
     */
    private function checkTables(\DOMXPath $xp): void
    {
        foreach ($xp->query('//table') as $t) {
            /** @var \DOMElement $t */
            if (in_array(strtolower(trim($t->getAttribute('role'))), ['presentation', 'none'], true)) {
                continue;
            }
            $rows = $xp->query('.//tr', $t)->length;
            $maxCells = 0;
            foreach ($xp->query('.//tr', $t) as $tr) {
                $maxCells = max($maxCells, $xp->query('./td|./th', $tr)->length);
            }
            if ($rows < 2 || $maxCells < 2 || $xp->query('.//th', $t)->length > 0) {
                continue;
            }
            $this->add('table', 'warn', self::path($t), "제목 셀(th)이 없는 표입니다({$rows}줄 × {$maxCells}칸) — 화면 낭독기가 칸의 머리를 읽어 주지 못합니다.", '머리 줄·칸을 <th scope="col">(가로 머리)·<th scope="row">(세로 머리)로 바꾸고 <caption> 으로 표 제목을 붙이세요. 배치용 표면 role="presentation".', 4, $t->getLineNo());
        }
    }

    private static function xq(string $s): string
    {
        return str_contains($s, "'") ? '"' . $s . '"' : "'" . $s . "'";
    }
}

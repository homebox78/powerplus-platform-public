<?php
declare(strict_types=1);

namespace Homebox;

/**
 * 목업 한 장에 실제로 쓰인 클래스의 규칙만 남긴다 (2026-10-12 MCP 시험 build-response-big).
 * 메인·서브 목업은 모든 블록 종류의 CSS(메인 38KB·서브 25KB)를 장마다 통째로 실어 홈페이지 한 벌 응답이 225KB 였다.
 * 접두(mm-·pg-) 클래스가 하나도 화면에 없는 규칙만 뺀다 — 접두 없는 규칙(KRDS·태그 선택자)·@keyframes·@font-face 는 그대로.
 * 스크립트가 나중에 붙이는 클래스는 $keep 으로 넘긴다. 실패하면 원본을 돌려준다.
 */
final class CssPrune
{
    public static function prune(string $css, string $html, string $prefix, array $keep = []): string
    {
        $have = array_fill_keys($keep, true);
        if (preg_match_all('/class="([^"]*)"/', $html, $m)) {
            foreach ($m[1] as $v) { foreach (preg_split('/\s+/', $v) ?: [] as $c) { if ($c !== '') { $have[$c] = true; } } }
        }
        $out = self::walk($css, $have, $prefix);
        return $out === null ? $css : $out;
    }

    /** 최상위 규칙을 차례로 — @media·@supports 는 안쪽을 같은 방식으로 */
    private static function walk(string $css, array $have, string $prefix): ?string
    {
        $out = ''; $i = 0; $n = strlen($css);
        while ($i < $n) {
            $open = strpos($css, '{', $i);
            if ($open === false) { $out .= substr($css, $i); break; }
            $sel = substr($css, $i, $open - $i);
            // 짝 맞는 닫는 괄호
            $depth = 0; $j = $open;
            for (; $j < $n; $j++) {
                if ($css[$j] === '{') { $depth++; } elseif ($css[$j] === '}') { $depth--; if ($depth === 0) { break; } }
            }
            if ($j >= $n) { return null; }
            $body = substr($css, $open + 1, $j - $open - 1);
            $t = ltrim($sel);
            if (str_starts_with($t, '@media') || str_starts_with($t, '@supports')) {
                $inner = self::walk($body, $have, $prefix);
                if ($inner === null) { return null; }
                if (trim($inner) !== '') { $out .= $sel . '{' . $inner . '}'; }
            } elseif (str_starts_with($t, '@')) {
                $out .= $sel . '{' . $body . '}';
            } elseif (self::used($sel, $have, $prefix)) {
                $out .= $sel . '{' . $body . '}';
            }
            $i = $j + 1;
        }
        return $out;
    }

    private static function used(string $sel, array $have, string $prefix): bool
    {
        // :not()·:has() 같은 괄호 안 클래스는 조건일 뿐 — 없어도 규칙은 산다(2026-10-13 D7: :not(:has(.mm-hero)) 때문에 높이 상한이 통째로 빠졌다)
        for ($k = 0; $k < 5 && str_contains($sel, '('); $k++) { $sel = (string) preg_replace('/\([^()]*\)/', '', $sel); }
        foreach (explode(',', $sel) as $one) {
            if (!preg_match_all('/\.(' . preg_quote($prefix, '/') . '[\w-]+)/', $one, $m)) { return true; }
            $all = true;
            foreach ($m[1] as $c) { if (!isset($have[$c])) { $all = false; break; } }
            if ($all) { return true; }
        }
        return false;
    }
}

<?php
declare(strict_types=1);

namespace Pp\Guide;

/** 색 문자열 해석·대비 계산(WCAG 2.x 상대 휘도). 결정적 판정용 — 브라우저 없이 계산 가능한 값만. */
final class Color
{
    /** 정규식 하나로 색 리터럴을 찾는다(#hex · rgb()/rgba() · hsl()/hsla()). */
    public const LITERAL = '/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|\b(?:rgba?|hsla?)\(\s*[^()]*\)/';

    private const NAMED = ['white' => '#ffffff', 'black' => '#000000', 'red' => '#ff0000', 'blue' => '#0000ff', 'green' => '#008000', 'gray' => '#808080', 'grey' => '#808080', 'yellow' => '#ffff00', 'orange' => '#ffa500', 'navy' => '#000080', 'silver' => '#c0c0c0'];

    /** → [r,g,b,a] (0~255, a 0~1) 또는 null */
    public static function parse(string $v): ?array
    {
        $v = strtolower(trim($v));
        if (isset(self::NAMED[$v])) {
            $v = self::NAMED[$v];
        }
        if (preg_match('/^#([0-9a-f]{3,8})$/', $v, $m)) {
            $h = $m[1];
            if (strlen($h) === 3 || strlen($h) === 4) {
                $h = implode('', array_map(static fn (string $c): string => $c . $c, str_split($h)));
            }
            if (strlen($h) !== 6 && strlen($h) !== 8) {
                return null;
            }
            $a = strlen($h) === 8 ? hexdec(substr($h, 6, 2)) / 255 : 1.0;
            return [hexdec(substr($h, 0, 2)), hexdec(substr($h, 2, 2)), hexdec(substr($h, 4, 2)), $a];
        }
        if (preg_match('/^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:[\s,\/]+([\d.]+%?))?\s*\)$/', $v, $m)) {
            $ch = static fn (string $x): float => str_ends_with($x, '%') ? (float) $x * 2.55 : (float) $x;
            $a = isset($m[4]) && $m[4] !== '' ? (str_ends_with($m[4], '%') ? (float) $m[4] / 100 : (float) $m[4]) : 1.0;
            return [(int) round(min(255, $ch($m[1]))), (int) round(min(255, $ch($m[2]))), (int) round(min(255, $ch($m[3]))), $a];
        }
        if (preg_match('/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,\/]+([\d.]+%?))?\s*\)$/', $v, $m)) {
            [$r, $g, $b] = self::hsl((float) $m[1], (float) $m[2] / 100, (float) $m[3] / 100);
            $a = isset($m[4]) && $m[4] !== '' ? (str_ends_with($m[4], '%') ? (float) $m[4] / 100 : (float) $m[4]) : 1.0;
            return [$r, $g, $b, $a];
        }
        return null;
    }

    public static function toHex(string $v): ?string
    {
        $c = self::parse($v);
        return $c === null ? null : sprintf('#%02x%02x%02x', $c[0], $c[1], $c[2]);
    }

    private static function hsl(float $h, float $s, float $l): array
    {
        $c = (1 - abs(2 * $l - 1)) * $s;
        $x = $c * (1 - abs(fmod($h / 60, 2) - 1));
        $m = $l - $c / 2;
        [$r, $g, $b] = match (true) {
            $h < 60 => [$c, $x, 0], $h < 120 => [$x, $c, 0], $h < 180 => [0, $c, $x],
            $h < 240 => [0, $x, $c], $h < 300 => [$x, 0, $c], default => [$c, 0, $x],
        };
        return [(int) round(($r + $m) * 255), (int) round(($g + $m) * 255), (int) round(($b + $m) * 255)];
    }

    public static function luminance(array $c): float
    {
        $f = static function (float $v): float {
            $v /= 255;
            return $v <= 0.03928 ? $v / 12.92 : (($v + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * $f($c[0]) + 0.7152 * $f($c[1]) + 0.0722 * $f($c[2]);
    }

    public static function contrast(array $fg, array $bg): float
    {
        // 반투명 글자는 배경 위에 섞어 계산한다
        if (($fg[3] ?? 1) < 1) {
            $a = $fg[3];
            $fg = [$fg[0] * $a + $bg[0] * (1 - $a), $fg[1] * $a + $bg[1] * (1 - $a), $fg[2] * $a + $bg[2] * (1 - $a), 1];
        }
        $l1 = self::luminance($fg);
        $l2 = self::luminance($bg);
        return round((max($l1, $l2) + 0.05) / (min($l1, $l2) + 0.05), 2);
    }

    /** 정본 중 가장 가까운 색(RGB 거리). */
    public static function nearest(string $hex, array $values): ?array
    {
        $c = self::parse($hex);
        if ($c === null || !$values) {
            return null;
        }
        $best = null;
        $bd = PHP_INT_MAX;
        foreach ($values as $h => $name) {
            $d = self::parse($h);
            $dist = ($c[0] - $d[0]) ** 2 + ($c[1] - $d[1]) ** 2 + ($c[2] - $d[2]) ** 2;
            if ($dist < $bd) {
                $bd = $dist;
                $best = ['token' => $name, 'hex' => $h];
            }
        }
        return $best;
    }
}

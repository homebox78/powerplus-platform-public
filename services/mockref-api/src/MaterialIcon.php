<?php
declare(strict_types=1);

namespace Homebox;

/**
 * 구글 머티리얼 아이콘 (2026-09-30) — 목업·코드에 넣는 모든 아이콘의 단일 원천.
 * 원천: api/data/material-icons.json (scripts/build-material-icons.mjs 가 npm @material-symbols/svg-400 에서 path 만 뽑아 저장, CDN 없음).
 * 규칙: 화살표·꺾쇠·더하기·닫기·말줄임을 글자(› → ↗ + × …)로 쓰지 않는다. 글과 나란히 둘 때는 부모를 inline-flex·align-items:center 로 세로 중심을 맞춘다.
 */
final class MaterialIcon
{
    /** @return array<string, array{name:string,d:string}> */
    private static function all(): array
    {
        static $icons = null;
        if ($icons === null) {
            $j = json_decode((string) @file_get_contents(dirname(__DIR__) . '/data/material-icons.json'), true);
            $icons = is_array($j['icons'] ?? null) ? $j['icons'] : [];
        }
        return $icons;
    }

    public static function has(string $n): bool { return isset(self::all()[$n]); }

    /** 인라인 SVG — 크기는 호출부 CSS 가 정하고, 없으면 $size. 색은 currentColor. */
    public static function svg(string $n, int $size = 20, string $cls = ''): string
    {
        $d = self::all()[$n]['d'] ?? (self::all()['grid']['d'] ?? '');
        return '<svg class="mi' . ($cls !== '' ? ' ' . $cls : '') . '" viewBox="0 -960 960 960" width="' . $size . '" height="' . $size . '" fill="currentColor" style="flex:none;vertical-align:middle" aria-hidden="true" focusable="false"><path d="' . $d . '"/></svg>';
    }

    /** CSS mask 로 쓰는 data URI (::before·::after 장식용 — content 에 글자를 넣지 않기 위해). */
    public static function maskUri(string $n): string
    {
        $d = self::all()[$n]['d'] ?? '';
        return "url(\"data:image/svg+xml," . rawurlencode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="' . $d . '"/></svg>') . "\")";
    }

    /** 글 옆 아이콘 공통 CSS — 세로 중심 맞춤. */
    public static function css(): string
    {
        return '.mi{display:inline-block;flex:none;vertical-align:middle}.mi-t{display:inline-flex;align-items:center;gap:4px;line-height:1}.mi-t>.mi{width:1.15em;height:1.15em}';
    }

    /** 글 + 아이콘 한 덩어리 (예: "더보기" + add). */
    public static function label(string $text, string $n, bool $before = false): string
    {
        $i = self::svg($n, 18);
        return '<span class="mi-t" style="display:inline-flex;align-items:center;gap:4px;line-height:1.2">' . ($before ? $i . '<span>' . $text . '</span>' : '<span>' . $text . '</span>' . $i) . '</span>';
    }
}

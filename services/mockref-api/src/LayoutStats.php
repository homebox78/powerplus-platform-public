<?php
declare(strict_types=1);

namespace Homebox;

/**
 * 재현 연습 통계 (2026-09-30) — 실제 관공서 캡처를 px 단위로 손 재현하며 잰 레이아웃 값.
 * 원천 api/data/layout-stats.json (scripts/build-layout-stats.mjs 가 storage/practice/<사이트>/measure.json 을 모아 만든다).
 * 목업 조립기의 기본값·하한으로 쓰고, MCP 응답에도 근거로 싣는다.
 */
final class LayoutStats
{
    /** @return array<string, mixed> */
    public static function all(): array
    {
        static $s = null;
        if ($s === null) {
            $j = json_decode((string) @file_get_contents(dirname(__DIR__) . '/data/layout-stats.json'), true);
            $s = is_array($j) ? $j : [];
        }
        return $s;
    }

    /** @return array<string, mixed> */
    public static function main(): array { return (array) (self::all()['main'] ?? []); }

    /** MCP 응답용 요약 — 수치와 표본 수만(교훈 원문은 뺀다). */
    public static function summary(): array
    {
        $m = self::main();
        $out = ['source' => self::all()['source'] ?? '', 'note' => self::all()['note'] ?? ''];
        foreach ($m as $k => $v) { $out[$k] = is_array($v) && isset($v['median']) ? ['median' => $v['median'], 'p25' => $v['p25'], 'p75' => $v['p75'], 'n' => $v['n']] : $v; }
        return $out;
    }
}

<?php
declare(strict_types=1);

namespace Pp\Deck;

/**
 * 와이어프레임 상자 종류 한 벌 — wire_kinds.json(정본 engine/wire_kinds.json 의 바이트 사본, preflight 10번이 대조) 을 읽는다(2026-10-18).
 * 종류 목록·이름·아이콘·부류는 여기서만 꺼낸다(Jobs::wire · Kit · WireLayout). 종류마다 다른 높이 셈·판정은 WireLayout 코드에 둔다.
 * prompt(): prompt_wire.md 의 {{WIRE_…}} 자리 채우기 — 엔진 engine/wirekinds.py prompt 와 같은 글(engine/tests/test_wire_kinds.py 가 대조).
 * chart(): chart 글 읽기 — 엔진 design.wire_chart 와 같은 규칙(시험 묶음 engine/tests/wire_chart_cases.json).
 */
final class WireKinds
{
    private static ?array $reg = null;

    public static function reg(): array
    {
        if (self::$reg === null) self::$reg = (array) json_decode((string) @file_get_contents(__DIR__ . '/wire_kinds.json'), true);
        return self::$reg;
    }

    /** @return list<string> */
    public static function kinds(): array
    {
        return array_map(static fn($x) => (string) $x['k'], (array) (self::reg()['kinds'] ?? []));
    }

    public static function get(string $k): ?array
    {
        foreach ((array) (self::reg()['kinds'] ?? []) as $x) if ($x['k'] === $k) return $x;
        return null;
    }

    public static function label(string $k): string
    {
        return (string) (self::get($k)['label'] ?? $k);
    }

    /** 배치 틀 칸 부류 — visual · text · band */
    public static function cls(string $k): string
    {
        return (string) (self::get($k)['cls'] ?? 'text');
    }

    /** 표시(pic·form·data)가 켜진 종류 */
    public static function with(string $flag): array
    {
        return array_values(array_map(static fn($x) => (string) $x['k'], array_filter((array) (self::reg()['kinds'] ?? []), static fn($x) => !empty($x[$flag]))));
    }

    public static function prompt(string $text): string
    {
        $rows = [];
        foreach ((array) self::reg()['kinds'] as $x) {
            if (empty($x['use'])) continue;
            $look = !empty($x['look']) ? ' (' . $x['look'] . ')' : '';
            $rows[] = '| ' . $x['use'] . ' | `' . $x['k'] . '`' . $look . ' | ' . (($x['ref'] ?? '') !== '' ? $x['ref'] : '레퍼런스') . ' |';
        }
        $fmts = []; $seen = [];
        foreach ((array) self::reg()['kinds'] as $x) {
            $f = (string) ($x['fmt'] ?? '');
            if ($f === '' || isset($seen[$f])) continue;
            $seen[$f] = 1;
            $names = array_map(static fn($y) => $y['k'], array_filter((array) self::reg()['kinds'], static fn($y) => ($y['fmt'] ?? '') === $f));
            $fmts[] = '- ' . implode(' · ', $names) . ': ' . $f;
        }
        return strtr($text, ['{{WIRE_KIND_TABLE}}' => implode("\n", $rows), '{{WIRE_KIND_FORMATS}}' => implode("\n", $fmts),
            '{{WIRE_HERO_KINDS}}' => implode('·', self::with('form')), '{{WIRE_DATA_KINDS}}' => implode('·', self::with('data'))]);
    }

    /** 머리 줄(유형·단위·강조·말풍선·메시지·출처) → [meta, 나머지 줄] */
    public static function meta(string $d): array
    {
        static $map = null, $re = null;
        if ($map === null) {
            $map = [];
            foreach ((array) (self::reg()['meta'] ?? []) as $key => $names) foreach ($names as $n) $map[mb_strtolower($n)] = $key;
            $keys = array_keys($map);
            usort($keys, static fn($a, $b) => mb_strlen($b) <=> mb_strlen($a));
            $re = '/^\s*[-•]?\s*(' . implode('|', array_map(static fn($k) => preg_quote($k, '/'), $keys)) . ')\s*[:：]\s*(.*)$/iu';
        }
        $meta = []; $rest = [];
        foreach (preg_split('/\R/u', $d) ?: [] as $l) {
            if (preg_match($re, $l, $m)) $meta[$map[mb_strtolower($m[1])]] = trim($m[2]);
            else $rest[] = $l;
        }
        return [$meta, $rest];
    }

    public static function chartType(string $s): string
    {
        $s = str_replace(' ', '', mb_strtolower(trim($s)));
        foreach ((array) (self::reg()['chart_types'] ?? []) as $t) foreach ($t['aliases'] as $a) if (str_replace(' ', '', mb_strtolower($a)) === $s) return (string) $t['id'];
        return '';
    }

    /** '1,200건' → [1200.0, '건'] · 숫자로 시작하지 않으면 [null, ''] */
    private static function cell(string $x): array
    {
        if (!preg_match('/^\s*([-+−]?[\d,]*\.?\d+)\s*(\S*)/u', $x, $m)) return [null, ''];
        $u = $m[2] ?? '';
        return [(float) str_replace([',', '−'], ['', '-'], $m[1]), (mb_strlen($u) <= 5 && !preg_match('/\d/', $u)) ? $u : ''];
    }

    private static function cells(string $l): array
    {
        return array_map('trim', explode('|', trim(trim($l), '|')));
    }

    /** chart 글 → {type, unit, series, rows:[[라벨,[값|null…]]], highlight, callout, message, source} — design.wire_chart 와 같다 */
    public static function chart(string $d): array
    {
        [$mt, $lines] = self::meta($d);
        $series = []; $rows = []; $unit = (string) ($mt['unit'] ?? '');
        foreach ($lines as $l) {
            $l = trim((string) preg_replace('/^\s*[-•]\s*/u', '', $l));
            if ($l === '') continue;
            if (str_contains($l, '|')) $c = self::cells($l);
            elseif (preg_match('/[:：]/u', $l)) $c = array_map('trim', preg_split('/[:：]/u', $l, 2));
            else $c = preg_match('/^(.+?)\s+([-+−]?[\d,]*\.?\d+\s*\S{0,4})$/u', $l, $m) ? [trim($m[1]), $m[2]] : [$l];
            $vals = array_map(static fn($x) => self::cell((string) $x), array_slice($c, 1));
            $allNull = !array_filter($vals, static fn($v) => $v[0] !== null);
            if (count($c) >= 2 && !$rows && !$series && (($allNull && count($c) >= 3) || preg_match('/^\s*(구분|항목|분류|연도|년도|기간|지표|category|label|item)?\s*$/iu', $c[0]))) {
                $series = array_slice($c, 1, 4);
                continue;
            }
            if (!$allNull) {
                if ($unit === '') $unit = $vals && $vals[0][0] !== null ? $vals[0][1] : '';
                $rows[] = [$c[0], array_map(static fn($v) => $v[0], $vals)];
            }
        }
        $n = $series ? count($series) : 1;
        if (!$series) foreach ($rows as $r) { foreach ($r[1] as $i => $v) if ($v !== null) $n = max($n, $i + 1); }
        $n = max(1, min(4, $n));
        foreach ($rows as &$r) $r[1] = array_slice(array_pad($r[1], $n, null), 0, $n);
        unset($r);
        $t = self::chartType((string) ($mt['type'] ?? ''));
        if ($t === '') $t = $n === 2 ? 'pair' : 'bar';
        elseif ($t === 'pair' && $n !== 2) $t = 'bar';
        elseif ($t === 'stacked' && $n < 2) $t = 'bar';
        return ['type' => $t, 'unit' => $unit, 'series' => array_slice($series, 0, $n), 'rows' => $rows, 'highlight' => (string) ($mt['highlight'] ?? ''),
                'callout' => (string) ($mt['callout'] ?? ''), 'message' => (string) ($mt['message'] ?? ''), 'source' => (string) ($mt['source'] ?? '')];
    }
}

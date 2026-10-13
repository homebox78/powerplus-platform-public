<?php
declare(strict_types=1);

namespace Pp\Deck;

use Pp\Core\Db;
use Pp\Core\Config;
use Pp\Core\Response;
use Pp\Core\HttpError;

/*
 * 출처: powerDeck api/src/WireLayout.php (D:\powerDeck, 2026-10-06 이식). 로직·JSON 모양은 그대로 두고
 * 전역 Db/Config/fail/json_out → Pp\Core(Db·Config·Response·HttpError) 어댑터(Legacy), 테이블은 deck_ 접두, 설정은 Config 'deck.<key>' 로 바꿨다.
 */
/**
 * 와이어프레임 배치 — AI 는 좌표를 쓰지 않고 '줄(rows) · 칸(cols, 12칸 격자) · 쌓기(stack)'만 정한다. 좌표는 여기서 계산한다.
 * 그래서 상자가 겹치거나 줄이 어긋나지 않고, 글 양에 맞춰 줄 높이를 나눈다(넘치면 알린다).
 *
 * 입력(장 하나):  rows: [{ h: 3, cols: [{ span: 3, k, t, d } | { span: 6, stack: [{ h: 2, k, t, d }, …] }] }, …]
 * 출력:          Jobs::wire 와 같은 상자 목록 [{ id, k, x, y, w, h, t, d }] (본문 기준 %)
 *
 * check(): 합격 기준 — 겹침·화면 밖·글 넘침·자리표시·기획 수치 빠짐·같은 크기 나열. 사람이 고친 배치에도 쓴다.
 * 글자 크기 셈은 화면(web/src/Wireframe.tsx)과 같은 비율이다: 기본 글자 = 캔버스 폭 × 0.0131, 본문 높이 = 폭 × 2/3 × (1 − 머리 − 바닥).
 */
final class WireLayout
{
    private const X0 = 2.0, X1 = 98.0, Y0 = 15.0, Y1 = 97.0, GAP = 2.0, COLS = 12;
    /** 기본 글자 한 줄 높이가 본문 높이의 몇 % 인가 (0.0131 ÷ (2/3 × (1 − 150/1600 − 96/1600))) */
    private const EM = 2.322;
    /** 그림 지시 줄(장 위에 찍지 않는다) — engine/design.py PIC_LINE 과 같다. 영어 작업은 Figure:·Scene:, 말풍선 문구도 그림의 일부 */
    private const PIC_LINE = '/^\s*(그림|장면|삽화|말풍선|figure|scene|picture|image|illustration|photo|drawing|bubble|speech bubble)\s*[:：]/iu';

    private static function colW(): float
    {
        return (self::X1 - self::X0 - self::GAP * (self::COLS - 1)) / self::COLS;
    }

    /** 폭 w(%) 인 상자의 한 줄 글자 수(한글 기준) */
    public static function cpl(float $w, float $scale = 0.86): int
    {
        // 폭(px) = w/100 × W, 글자 폭 ≈ 0.0131W × scale, 좌우 여백 1.8em
        return max(4, (int) floor(($w / 100 / 0.0131 - 1.8) / $scale));
    }

    /** 이 상자에 글을 다 넣으려면 필요한 높이(%) */
    public static function need(array $b, float $w): float
    {
        $k = (string) ($b['k'] ?? 'card');
        $t = trim((string) ($b['t'] ?? ''));
        $lines = array_values(array_filter(array_map('trim', explode("\n", (string) ($b['d'] ?? ''))), 'strlen'));
        $em = self::EM;
        if ($k === 'band') return max(8.5, 2.6 * $em + (count($lines) ? 1.3 * $em : 0));
        if ($k === 'badge') return 3.6 * $em + (count($lines) ? 2.2 * $em : 0);
        if ($k === 'chart') return 9 * $em;
        if ($k === 'gantt') return ($t !== '' ? 2.2 : 0.6) * $em + 1.6 * $em + max(2, count($lines) - 1) * 1.9 * $em;
        if ($k === 'kpi') return ($t !== '' ? 2.2 : 0.6) * $em + 3.4 * $em + 1.4 * $em + (preg_grep('/^\s*[-•]?\s*(출처|자료)\s*[:：]/u', $lines) ? 1.2 * $em : 0);
        // 2026-10-12 레퍼런스 학습 도식 — 그림이 주인공이라 글 양보다 최소 면적이 중요
        if ($k === 'fishbone') return ($t !== '' ? 1.0 : 0.6) * $em + max(10, 3.2 * (int) ceil(count($lines) / 2) + 4) * $em;
        if ($k === 'hub') return max(12, 1.6 * count($lines) + 6) * $em;
        if ($k === 'pyramid') return ($t !== '' ? 2.2 : 0.6) * $em + max(3, count($lines)) * 2.6 * $em;
        if ($k === 'matrix') return ($t !== '' ? 2.2 : 0.6) * $em + 13 * $em;
        // 2026-10-12 확장 도식(레퍼런스 학습 §7) — 계단은 phase 가 그대로 맡는다
        $nn = count(array_filter($lines, static fn($l) => !preg_match('/^\s*[-•]?\s*(출처|자료|source)\s*[:：]/iu', $l)));
        $th = ($t !== '' ? 2.2 : 0.6) * $em;
        if ($k === 'funnel') return $th + max(3, $nn) * 2.8 * $em;
        if ($k === 'cycle') return max(14, 2.2 * $nn + 6) * $em;
        if ($k === 'venn') return max(12, ($nn >= 3 ? 15 : 11)) * $em;
        if ($k === 'roadmap') return $th + 13 * $em;
        if ($k === 'isostack') return $th + max(3, $nn) * 2.6 * $em;
        if ($k === 'gauge') return $th + 8.5 * $em + (count($lines) > $nn ? 1.2 * $em : 0);
        if ($k === 'proportion') return $th + 4.6 * $em + (count($lines) > $nn ? 1.2 * $em : 0);
        if ($k === 'phase') {
            $n = max(1, count($lines));
            $cpl = self::cpl(($w - 3) / $n, 0.8);
            $desc = 0;
            foreach ($lines as $l) { $p = preg_split('/[:：]/u', $l, 2); $desc = max($desc, (int) ceil(mb_strlen(trim($p[1] ?? '')) / max(1, $cpl))); }
            return ($t !== '' ? 2.2 : 0.6) * $em + 2.4 * $em + $desc * 1.1 * $em + 2.4 * $em;
        }
        if ($k === 'flow') {
            $n = max(1, count($lines));
            $cpl = self::cpl(($w - 3) / $n, 0.74);
            $desc = 0;
            foreach ($lines as $l) { $p = preg_split('/[:：]/u', $l, 2); $desc = max($desc, (int) ceil(mb_strlen(trim($p[1] ?? '')) / max(1, $cpl))); }
            return ($t !== '' ? 2.2 : 0.6) * $em + 2.6 * $em + $desc * 1.05 * $em + 1.2 * $em;
        }
        if (in_array($k, ['person', 'image', 'screen', 'map'], true)) {
            $say = count(array_filter($lines, static fn($l) => !preg_match(self::PIC_LINE, $l)));
            return max(7 * $em, 3.2 * $em + ceil($say / 2) * 1.7 * $em + ($t !== '' ? 1.4 * $em : 0));
        }
        if ($k === 'table') {
            $rows = count(array_filter($lines, static fn($l) => !preg_match('/^\|?\s*:?-{2,}/', $l)));
            return ($t !== '' ? 2.2 : 0.8) * $em + $rows * 1.75 * $em + 0.8 * $em;
        }
        // panel · card · text — 제목 + 줄(폭에 따라 줄바꿈)
        $cpl = self::cpl($w);
        $n = 0;
        foreach ($lines as $l) $n += max(1, (int) ceil(mb_strlen(preg_replace('/^\s*([-*•·]|\d+[.)])\s+|\*\*/u', '', $l)) / $cpl));
        $head = $k === 'panel' ? 2.0 * $em : ($t !== '' ? 1.45 * $em * max(1, (int) ceil(mb_strlen($t) / self::cpl($w, 1.08))) : 0);
        return $head + 0.9 * $em + $n * 1.22 * $em + 0.5 * $em;
    }

    /** 몫 나누기 — 가중치대로 나누되, 필요한 높이보다 작으면 여유 있는 쪽에서 가져온다. 다 합쳐도 모자라면 비율대로 줄인다 */
    private static function share(array $weights, array $needs, float $total): array
    {
        $n = count($weights);
        if (!$n) return [];
        $sw = array_sum($weights) ?: $n;
        $out = [];
        foreach ($weights as $i => $w) $out[$i] = $total * ($w ?: 1) / $sw;
        if (array_sum($needs) >= $total) {
            $sn = array_sum($needs);
            foreach ($needs as $i => $x) $out[$i] = $total * $x / $sn;
            return $out;
        }
        for ($pass = 0; $pass < 6; $pass++) {
            $lack = 0.0; $slack = 0.0;
            foreach ($out as $i => $h) { if ($h < $needs[$i]) $lack += $needs[$i] - $h; else $slack += $h - $needs[$i]; }
            if ($lack < 0.05 || $slack <= 0) break;
            $take = min(1.0, $lack / $slack);
            foreach ($out as $i => $h) $out[$i] = $h < $needs[$i] ? $needs[$i] : $h - ($h - $needs[$i]) * $take;
        }
        return $out;
    }

    /** rows → 상자 목록(좌표). 줄·칸이 깨져 있으면 될 수 있는 만큼 고쳐 쓴다 */
    public static function build(array $rows): array
    {
        $cw = self::colW();
        $R = [];
        foreach (array_slice($rows, 0, 4) as $row) {
            if (!is_array($row)) continue;
            $cols = array_values(array_filter((array) ($row['cols'] ?? []), 'is_array'));
            if (!$cols) continue;
            $cols = array_slice($cols, 0, 6);
            // 칸 수 합이 12 가 되게 맞춘다
            $spans = array_map(static fn($c) => max(1, min(12, (int) ($c['span'] ?? 0) ?: (int) floor(12 / count($cols)))), $cols);
            $sum = array_sum($spans);
            if ($sum !== self::COLS) {
                $spans = array_map(static fn($s) => max(1, (int) round($s * self::COLS / $sum)), $spans);
                $spans[count($spans) - 1] += self::COLS - array_sum($spans);
                if ($spans[count($spans) - 1] < 1) { $spans = array_fill(0, count($cols), intdiv(self::COLS, count($cols))); $spans[count($spans) - 1] += self::COLS - array_sum($spans); }
            }
            $C = [];
            $x = self::X0;
            foreach ($cols as $i => $c) {
                $w = $spans[$i] * $cw + ($spans[$i] - 1) * self::GAP;
                $items = isset($c['stack']) && is_array($c['stack']) ? array_values(array_filter(array_slice($c['stack'], 0, 4), 'is_array')) : [$c];
                if (!$items) $items = [$c];
                $needs = array_map(static fn($b) => self::need($b, $w), $items);
                $C[] = ['x' => $x, 'w' => $w, 'items' => $items, 'needs' => $needs, 'need' => array_sum($needs) + self::GAP * (count($items) - 1)];
                $x += $w + self::GAP;
            }
            $R[] = ['h' => max(0.5, (float) ($row['h'] ?? 1)), 'cols' => $C, 'need' => max(array_map(static fn($c) => $c['need'], $C))];
        }
        if (!$R) return [];
        $total = self::Y1 - self::Y0 - self::GAP * (count($R) - 1);
        // 결론 띠만 있는 줄은 비중과 상관없이 얇게(9~11%) — 나머지 줄이 남은 높이를 나눈다
        $fixed = [];
        foreach ($R as $i => $r) {
            $only = true;
            foreach ($r['cols'] as $c) foreach ($c['items'] as $b) if (($b['k'] ?? '') !== 'band') $only = false;
            if ($only && count($R) > 1) $fixed[$i] = min(11.0, max(9.0, $r['need']));
        }
        $free = array_diff_key($R, $fixed);
        $hs = $fixed + array_combine(array_keys($free), self::share(array_values(array_map(static fn($r) => $r['h'], $free)), array_values(array_map(static fn($r) => $r['need'], $free)), $total - array_sum($fixed)));
        $out = [];
        $y = self::Y0;
        $r1 = static fn(float $v) => round($v * 2) / 2;   // 화면과 같은 0.5% 눈금
        foreach ($R as $ri => $row) {
            $rh = $hs[$ri];
            foreach ($row['cols'] as $c) {
                $n = count($c['items']);
                $ih = self::share(array_map(static fn($b) => max(0.5, (float) ($b['h'] ?? 1)), $c['items']), $c['needs'], $rh - self::GAP * ($n - 1));
                $yy = $y;
                foreach ($c['items'] as $i => $b) {
                    $out[] = ['id' => 'w' . (count($out) + 1), 'k' => (string) ($b['k'] ?? 'card'), 'x' => $r1($c['x']), 'y' => $r1($yy), 'w' => $r1($c['w']), 'h' => $r1($ih[$i]),
                              't' => (string) ($b['t'] ?? ''), 'd' => (string) ($b['d'] ?? '')];
                    $yy += $ih[$i] + self::GAP;
                }
            }
            $y += $rh + self::GAP;
        }
        return $out;
    }

    /** 미리 만들어 둔 배치 틀(wire_templates.json) — id 로 찾는다 */
    public static function templates(): array
    {
        static $t = null;
        if ($t === null) {
            $d = json_decode((string) @file_get_contents(__DIR__ . '/wire_templates.json'), true);
            $t = [];
            foreach ((array) ($d['templates'] ?? []) as $x) $t[(string) $x['id']] = $x;
        }
        return $t;
    }

    private static function kindClass(string $k): string
    {
        return $k === 'band' ? 'band' : (in_array($k, ['person', 'image', 'screen', 'map', 'chart', 'flow', 'gantt', 'phase', 'fishbone', 'hub', 'pyramid', 'matrix', 'funnel', 'cycle', 'venn', 'roadmap', 'isostack', 'gauge', 'proportion'], true) ? 'visual' : 'text');
    }

    /** 글이 하나도 없는 글 상자('※ 보강 필요'만 든 것 포함) */
    private static function emptyText(array $b): bool
    {
        $k = (string) ($b['k'] ?? 'card');
        if (in_array($k, ['person', 'image', 'screen', 'map'], true)) return false;
        $strip = static fn($s) => trim(implode("\n", array_filter(explode("\n", (string) $s), static fn($l) => !str_contains($l, '보강 필요'))));
        return $strip($b['t'] ?? '') === '' && $strip($b['d'] ?? '') === '';
    }

    /** 한 단어 상자 — 제목만 짧게 있고(8자 이하) 글이 없는 카드·패널·글 ("오픈", "1차", "공통 토대") */
    private static function wordOnly(array $b): bool
    {
        return in_array((string) ($b['k'] ?? 'card'), ['card', 'panel', 'text'], true)
            && trim((string) ($b['d'] ?? '')) === '' && mb_strlen(trim((string) ($b['t'] ?? ''))) <= 8;
    }

    /**
     * AI 가 낸 상자 다듬기(배치 전에) — 빈 상자는 버리고, 한 단어 상자는 바로 앞 글 상자의 항목 한 줄로 합친다(앞이 없으면 다음 글 상자).
     * 상자가 빠지면 같은 줄·칸의 나머지가 그 자리를 나눠 가진다. 시안에서 '의미 없는 작은 카드·빈 상자'가 되던 것.
     */
    private static function prune(array $blocks): array
    {
        $out = []; $carry = [];
        foreach ($blocks as $b) {
            if (!is_array($b) || self::emptyText($b)) continue;
            if (self::wordOnly($b)) {
                $line = '- ' . trim((string) $b['t']);
                $prev = null;
                for ($i = count($out) - 1; $i >= 0; $i--) if (in_array($out[$i]['k'] ?? 'card', ['card', 'panel', 'text'], true)) { $prev = $i; break; }
                if ($prev !== null) $out[$prev]['d'] = rtrim((string) ($out[$prev]['d'] ?? '')) . "\n" . $line;
                else $carry[] = $line;
                continue;
            }
            if ($carry && in_array($b['k'] ?? 'card', ['card', 'panel', 'text'], true)) { $b['d'] = implode("\n", $carry) . "\n" . (string) ($b['d'] ?? ''); $carry = []; }
            $out[] = $b;
        }
        return $out;
    }

    /** rows 의 모든 상자를 읽는 순서로 다듬는다(prune) — 비게 된 칸·줄은 없애고, 쌓기가 하나만 남으면 풀어 놓는다 */
    private static function pruneRows(array $rows): array
    {
        $flat = [];
        foreach ($rows as $ri => $row) foreach ((array) ($row['cols'] ?? []) as $ci => $c) {
            if (!is_array($c)) continue;
            if (isset($c['stack']) && is_array($c['stack'])) { foreach ($c['stack'] as $si => $b) if (is_array($b)) $flat[] = $b + ['_p' => [$ri, $ci, $si]]; }
            else $flat[] = $c + ['_p' => [$ri, $ci, null]];
        }
        $keep = [];
        foreach (self::prune($flat) as $b) { $keep[implode(',', array_map('strval', $b['_p']))] = $b; }
        $out = [];
        foreach ($rows as $ri => $row) {
            $cols = [];
            foreach ((array) ($row['cols'] ?? []) as $ci => $c) {
                if (!is_array($c)) continue;
                if (isset($c['stack']) && is_array($c['stack'])) {
                    $st = [];
                    foreach ($c['stack'] as $si => $b) if (isset($keep["$ri,$ci,$si"])) $st[] = array_diff_key($keep["$ri,$ci,$si"], ['_p' => 1]);
                    if (count($st) === 1) $cols[] = ['span' => $c['span'] ?? 0] + array_diff_key($st[0], ['h' => 1]);
                    elseif ($st) $cols[] = ['span' => $c['span'] ?? 0, 'stack' => $st];
                } elseif (isset($keep["$ri,$ci,"])) $cols[] = array_diff_key($keep["$ri,$ci,"], ['_p' => 1]);
            }
            if ($cols) $out[] = ['h' => $row['h'] ?? 1, 'cols' => $cols];
        }
        return $out;
    }

    /**
     * 배치 틀에 상자들을 끼운다 → rows. 틀의 칸마다 어울리는 종류(그림 자리·글 자리·결론 띠)가 있어, 같은 부류의 상자를 먼저 그 칸에 넣고
     * 남는 상자는 빈 칸에 순서대로, 그래도 남으면 가장 넓은 글 칸에 쌓는다.
     * keepEmpty: 빈 칸을 남겨 둔다(사람이 틀을 고를 때 — 틀 모양이 그대로 보이게). AI 가 고른 경우는 빈 칸을 없앤다.
     */
    public static function applyTpl(string $id, array $blocks, bool $keepEmpty = false): ?array
    {
        $tpl = self::templates()[$id] ?? null;
        if (!$tpl) return null;
        $rows = $tpl['rows'];
        // 칸 목록(읽는 순서) — 참조로 잡아 채운다
        $cells = [];
        foreach ($rows as $ri => &$row) foreach ($row['cols'] as $ci => &$col) {
            if (isset($col['stack'])) { foreach ($col['stack'] as $si => &$it) $cells[] = &$it; unset($it); }
            else $cells[] = &$col;
        }
        unset($row, $col);
        $blocks = array_values(array_filter($blocks, 'is_array'));
        $left = [];
        // 1) 같은 부류의 칸에
        foreach ($blocks as $b) {
            $cls = self::kindClass((string) ($b['k'] ?? 'card'));
            $put = false;
            foreach ($cells as &$c) {
                if (!isset($c['_b']) && self::kindClass((string) $c['k']) === $cls) { $c['_b'] = $b; $put = true; break; }
            }
            unset($c);
            if (!$put) $left[] = $b;
        }
        // 2) 남은 상자는 빈 칸에(결론 띠 칸은 결론 띠만)
        $rest = [];
        foreach ($left as $b) {
            $put = false;
            if (($b['k'] ?? '') !== 'band') {
                foreach ($cells as &$c) { if (!isset($c['_b']) && $c['k'] !== 'band') { $c['_b'] = $b; $put = true; break; } }
                unset($c);
            }
            if (!$put) $rest[] = $b;
        }
        // 칸 → 상자(없으면 빈 칸 또는 제거)
        $fill = static function (array $c) use ($keepEmpty): ?array {
            if (isset($c['_b'])) { $b = $c['_b']; return ['k' => $b['k'] ?? $c['k'], 't' => $b['t'] ?? '', 'd' => $b['d'] ?? '', 'h' => $c['h'] ?? 1]; }
            return $keepEmpty && $c['k'] !== 'band' ? ['k' => $c['k'], 't' => '', 'd' => '', 'h' => $c['h'] ?? 1] : null;
        };
        $out = [];
        foreach ($rows as $row) {
            $cols = [];
            foreach ($row['cols'] as $col) {
                if (isset($col['stack'])) {
                    $st = array_values(array_filter(array_map($fill, $col['stack'])));
                    if ($st) $cols[] = count($st) === 1 ? ['span' => $col['span']] + $st[0] : ['span' => $col['span'], 'stack' => $st];
                } elseif ($b = $fill($col)) $cols[] = ['span' => $col['span']] + $b;
            }
            if ($cols) $out[] = ['h' => $row['h'], 'cols' => $cols];
        }
        // 3) 그래도 남은 상자 — 결론 띠는 맨 아래 줄, 나머지는 가장 넓은 글 칸에 쌓는다
        foreach ($rest as $b) {
            if (($b['k'] ?? '') === 'band' || !$out) { $out[] = ['h' => 1, 'cols' => [['span' => 12] + $b]]; continue; }
            // 덜 쌓인 글 칸부터, 같으면 넓은 칸
            $best = null; $bs = -INF;
            foreach ($out as $ri => $row) foreach ($row['cols'] as $ci => $col) {
                $k = isset($col['stack']) ? 'card' : (string) ($col['k'] ?? 'card');
                $n = count($col['stack'] ?? [1]);
                $score = $col['span'] - $n * 100;
                if ($k !== 'band' && self::kindClass($k) === 'text' && $n < 4 && $score > $bs) { $bs = $score; $best = [$ri, $ci]; }
            }
            if (!$best) { $out[] = ['h' => 2, 'cols' => [['span' => 12] + $b]]; continue; }
            $col = $out[$best[0]]['cols'][$best[1]];
            $stack = $col['stack'] ?? [array_diff_key($col, ['span' => 1])];
            $stack[] = $b;
            $out[$best[0]]['cols'][$best[1]] = ['span' => $col['span'], 'stack' => $stack];
        }
        // 결론 띠 줄이 맨 아래에 오게
        usort($out, static fn($a, $b) => (int) (($a['cols'][0]['k'] ?? '') === 'band' && count($a['cols']) === 1) <=> (int) (($b['cols'][0]['k'] ?? '') === 'band' && count($b['cols']) === 1));
        return $out;
    }

    /**
     * AI 가 낸 장 하나 → 다듬은 상자 목록. tpl(배치 틀 id) + blocks 면 틀에 끼우고, rows 가 있으면 격자로 계산하고, 없으면(옛 형식) wire 좌표를 그대로 쓴다.
     */
    public static function fromAi(array $x): array
    {
        $rows = is_array($x['rows'] ?? null) ? self::pruneRows($x['rows']) : null;
        if (!$rows && !empty($x['tpl']) && is_array($x['blocks'] ?? null)) $rows = self::applyTpl((string) $x['tpl'], self::prune($x['blocks']));
        $wire = $rows ? self::build($rows) : (is_array($x['wire'] ?? null) ? $x['wire'] : []);
        return Jobs::wire($wire, true);
    }

    /**
     * 합격 기준 검사 — 남은 문제를 사람 말로 돌려준다(없으면 빈 배열). $slide: 기획의 그 장(content·title 을 본다).
     */
    public static function check(array $wire, array $slide = []): array
    {
        $out = [];
        $name = static fn(array $b) => '「' . (mb_substr(trim((string) ($b['t'] ?? '')), 0, 14) ?: ['panel' => '패널', 'card' => '카드', 'table' => '표', 'chart' => '그래프', 'flow' => '흐름', 'band' => '결론 띠', 'badge' => '강조', 'text' => '글', 'gantt' => '일정', 'phase' => '단계', 'kpi' => '수치', 'fishbone' => '원인 분석', 'hub' => '허브', 'pyramid' => '피라미드', 'matrix' => '2×2', 'funnel' => '깔때기', 'cycle' => '순환', 'venn' => '벤 도식', 'roadmap' => '로드맵', 'isostack' => '계층', 'gauge' => '달성률', 'proportion' => '비율 막대'][$b['k'] ?? ''] ?? '그림') . '」';
        // 화면 밖 · 헤드라인 자리
        foreach ($wire as $b) {
            if ($b['y'] < 12.5) $out[] = $name($b) . ' 상자가 헤드라인 자리(맨 위)를 덮습니다';
            if ($b['x'] + $b['w'] > 100.2 || $b['y'] + $b['h'] > 100.2) $out[] = $name($b) . ' 상자가 화면 밖으로 나갑니다';
        }
        // 겹침
        $n = count($wire);
        for ($i = 0; $i < $n; $i++) for ($j = $i + 1; $j < $n; $j++) {
            $a = $wire[$i]; $b = $wire[$j];
            $ox = min($a['x'] + $a['w'], $b['x'] + $b['w']) - max($a['x'], $b['x']);
            $oy = min($a['y'] + $a['h'], $b['y'] + $b['h']) - max($a['y'], $b['y']);
            if ($ox > 0.6 && $oy > 0.6 && $ox * $oy > 0.25 * min($a['w'] * $a['h'], $b['w'] * $b['h'])) $out[] = $name($a) . '·' . $name($b) . ' 상자가 겹칩니다';
        }
        // 글 넘침 · 빈 상자
        foreach ($wire as $b) {
            $need = self::need($b, (float) $b['w']);
            if ($need > $b['h'] * 1.12 + 1) {
                $over = (int) ceil(($need - $b['h']) / (1.22 * self::EM));
                $out[] = $name($b) . ' 상자에 글이 넘칩니다(약 ' . $over . '줄) — 상자를 키우거나 글을 줄이세요';
            }
            if (trim((string) ($b['t'] ?? '')) === '' && trim((string) ($b['d'] ?? '')) === '') $out[] = '글이 없는 빈 상자가 있습니다';
            elseif (self::wordOnly($b)) $out[] = $name($b) . ' — 한 단어뿐인 상자입니다. 옆 상자의 항목으로 넣거나 일정·단계 상자로 바꾸세요';
            elseif (in_array(trim((string) ($b['t'] ?? '')), Jobs::WIRE_PLACEHOLDER, true)) $out[] = $name($b) . ' — 자리표시 말입니다. 실제 들어갈 글을 적어 주세요';
        }
        // 같은 크기 상자만 나열(표·흐름이 없는데 4개 이상이 모두 같은 크기)
        $plain = array_values(array_filter($wire, static fn($b) => in_array($b['k'], ['card', 'panel', 'text'], true)));
        if (count($plain) >= 4 && count($plain) === $n) {
            $sizes = array_unique(array_map(static fn($b) => round($b['w']) . 'x' . round($b['h']), $plain));
            if (count($sizes) === 1) $out[] = '같은 크기 상자만 늘어놓았습니다 — 주인공 덩어리 하나를 크게 잡으면 메시지가 삽니다';
        }
        if (count(array_filter($wire, static fn($b) => $b['k'] === 'band')) > 1) $out[] = '결론 띠가 둘 이상입니다';
        // 레퍼런스 학습(2026-10-12) — AI 시안이 사람판과 갈리는 곳: 아래 빈 공간·카드 남발·주인공 여럿·깨진 표
        if ($wire) {
            $bottom = max(array_map(static fn($b) => (float) $b['y'] + (float) $b['h'], $wire));
            if ($bottom < 85) $out[] = '장 아래가 ' . (int) round(97 - $bottom) . '% 비어 있습니다 — 주인공 상자를 키우거나 결론 띠를 바닥(약 88~97%)에 붙이세요';
        }
        $cards = count(array_filter($wire, static fn($b) => in_array($b['k'], ['card', 'panel'], true)));
        if ($cards > 6) $out[] = '카드·패널이 ' . $cards . '개입니다 — 2~3단(많아야 6개)으로 묶고 나머지는 표나 목록으로 옮기세요';
        $heroes = array_filter($wire, static fn($b) => self::kindClass((string) $b['k']) === 'visual' && $b['w'] * $b['h'] >= 1500);
        if (count($heroes) > 1) $out[] = '큰 도식이 ' . count($heroes) . '개입니다 — 장마다 주인공 도식은 하나, 나머지는 작게 곁들이세요';
        foreach ($wire as $b) {
            if ($b['k'] === 'table') {
                $rows = array_values(array_filter(preg_split('/\R/u', (string) ($b['d'] ?? '')), static fn($l) => str_contains($l, '|')));
                $cnt = array_unique(array_map(static fn($l) => count(explode('|', trim($l, " |\t"))), $rows));
                if (count($cnt) > 1) $out[] = $name($b) . ' 표의 줄마다 칸 수가 다릅니다(' . implode('·', $cnt) . '칸) — 모든 줄의 칸 수를 머리 줄과 맞추세요';
            }
            if ($b['k'] === 'matrix') {
                $cells = array_values(array_filter(preg_split('/\R/u', (string) ($b['d'] ?? '')), static fn($l) => trim($l) !== '' && !preg_match('/^\s*(축|기준|axis|axes)\s*[:：]/iu', $l)));
                if (count($cells) !== 4) $out[] = $name($b) . ' — 사분면 내용은 4줄이어야 합니다(지금 ' . count($cells) . '줄). 축 이름은 첫 줄 "축: 가로 | 세로"로만';
            }
        }
        // 기획의 수치가 빠졌는가 — 단위가 붙은 수치만 본다
        $content = (string) ($slide['content'] ?? '');
        if ($content !== '' && $wire) {
            $text = preg_replace('/[\s,]/u', '', (string) ($slide['title'] ?? '') . implode('', array_map(static fn($b) => ($b['t'] ?? '') . ($b['d'] ?? ''), $wire)));
            // 번호 목록("2. 개발 단계")·낱말 속 글자(개발·일정·대상)를 수치로 세지 않는다(2026-10-10 MCP 시험 "2. 개" 오탐)
            preg_match_all('/(?<![\d.])\d[\d,]*(?:\.\d+)?(?!\.\s)\s?(?:%|퍼센트|명|개월|개(?![발선편요최])|건(?![설의강])|억|만|천|원|년|일(?![정반부])|시간|분(?![야석기])|배(?![치포경])|위(?![원치험])|차(?![이례])|단계|종(?![합류])|곳|대(?![상응표])|회(?![의사계]))/u', $content, $m);
            $miss = [];
            foreach (array_unique($m[0]) as $num) {
                $key = preg_replace('/[\s,]/u', '', $num);
                if (mb_strlen($key) >= 2 && !str_contains($text, $key)) $miss[] = trim($num);
            }
            if ($miss) $out[] = '기획의 수치가 와이어프레임에 없습니다: ' . implode(', ', array_slice($miss, 0, 5)) . (count($miss) > 5 ? ' 외 ' . (count($miss) - 5) . '개' : '');
        }
        return array_values(array_unique(array_slice($out, 0, 8)));
    }
}

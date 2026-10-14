<?php
declare(strict_types=1);

namespace Pp\Guide;

use Pp\Core\Db;

/**
 * powerGuide 관리자 덮어쓰기(사용자 2026-10-14 "관리자 모드 가이드 메뉴에서 /guide 를 모두 관리 가능해야").
 * 원본은 여전히 코드(키트 빌드·KRDS 추출·체크리스트 판정)이고, 관리자가 고친 글·판정·숨김·순서만 core_settings 에
 * 'guide.<영역>' JSON 으로 둔다. 웹 화면(/api/v1/guide/overrides)과 REST·MCP(Data::*)가 같은 덮어쓰기를 합친다.
 * 토큰 값·부품 코드는 키트 빌드가 필요해 여기서 바꾸지 않는다(설명·이름·숨김만).
 *
 * 영역 · 열쇠 · 고칠 수 있는 칸
 *  copy       : module{sub,desc,free} · menu{slug:{label,desc}} · steps[{title,desc}] · intro{tokens,components,krds,a11y,changelog}
 *  components : 부품 id → {title, summary, note, notes[], hidden, order}
 *  krds       : KRDS 컴포넌트 한글 이름 → {usage[], a11y[], interaction[], dev[], note, hidden}
 *  patterns   : 기본 패턴 한글 이름 → {desc, usage[], a11y[], interaction[], dev[], hidden}
 *  checklist  : 체크리스트 번호(idx) → {verdict, evidence, fix, hidden}
 *  tokens     : 토큰 경로(semantic.text.primary) → {description}
 *  downloads  : 내려받기 파일 이름 → {label, use, hidden}
 */
final class Overrides
{
    public const SECTIONS = ['copy', 'components', 'krds', 'patterns', 'checklist', 'tokens', 'downloads'];
    public const VERDICTS = ['P', '수정됨', '의도', '사이트', '?', 'F'];

    private static array $cache = [];

    /** @return array<string|int, mixed> */
    public static function get(string $section): array
    {
        if (!in_array($section, self::SECTIONS, true)) {
            return [];
        }
        if (array_key_exists($section, self::$cache)) {
            return self::$cache[$section];
        }
        try {
            $v = Db::val('SELECT v FROM core_settings WHERE k = ?', ['guide.' . $section]);
        } catch (\Throwable) {
            $v = null; // 설정 표를 못 읽어도 원본은 그대로 보인다
        }
        $j = is_string($v) && $v !== '' ? json_decode($v, true) : null;
        return self::$cache[$section] = is_array($j) ? $j : [];
    }

    /** @return array<string, array> */
    public static function all(): array
    {
        $out = [];
        foreach (self::SECTIONS as $s) {
            $out[$s] = self::get($s);
        }
        return $out;
    }

    public static function forget(): void
    {
        self::$cache = [];
    }

    /** 덮어쓰기 값 다듬기 — 빈 글·빈 목록은 '원본 그대로'로 본다(열쇠를 지운다). */
    public static function clean(string $section, array $data): array
    {
        $str = static fn (mixed $v, int $max): ?string => is_string($v) && trim($v) !== '' ? mb_substr(trim($v), 0, $max) : null;
        $list = static function (mixed $v): ?array {
            if (!is_array($v)) {
                return null;
            }
            $o = array_values(array_filter(array_map(static fn ($x) => is_string($x) ? mb_substr(trim($x), 0, 600) : '', $v), static fn ($x) => $x !== ''));
            return $o === [] ? null : array_slice($o, 0, 40);
        };
        $pick = static function (array $src, array $spec) use ($str, $list): array {
            $o = [];
            foreach ($spec as $k => $t) {
                if (!array_key_exists($k, $src)) {
                    continue;
                }
                $v = match ($t) {
                    'list' => $list($src[$k]),
                    'bool' => $src[$k] === true ? true : null,
                    'int' => is_numeric($src[$k]) ? (int) $src[$k] : null,
                    default => $str($src[$k], (int) $t),
                };
                if ($v !== null) {
                    $o[$k] = $v;
                }
            }
            return $o;
        };
        if ($section === 'copy') {
            $o = [];
            $m = $pick((array) ($data['module'] ?? []), ['sub' => 80, 'desc' => 300, 'free' => 60]);
            if ($m) { $o['module'] = $m; }
            $menu = [];
            foreach ((array) ($data['menu'] ?? []) as $slug => $v) {
                $x = $pick((array) $v, ['label' => 30, 'desc' => 160]);
                if ($x) { $menu[(string) $slug] = $x; }
            }
            if ($menu) { $o['menu'] = $menu; }
            $steps = [];
            foreach (array_slice((array) ($data['steps'] ?? []), 0, 8) as $v) {
                $steps[] = $pick((array) $v, ['title' => 60, 'desc' => 200]);
            }
            if (array_filter($steps)) { $o['steps'] = $steps; }
            $intro = $pick((array) ($data['intro'] ?? []), ['tokens' => 600, 'components' => 600, 'krds' => 600, 'a11y' => 600, 'changelog' => 600]);
            if ($intro) { $o['intro'] = $intro; }
            return $o;
        }
        $spec = match ($section) {
            'components' => ['title' => 40, 'summary' => 300, 'note' => 300, 'notes' => 'list', 'hidden' => 'bool', 'order' => 'int'],
            'krds' => ['usage' => 'list', 'a11y' => 'list', 'interaction' => 'list', 'dev' => 'list', 'note' => 400, 'hidden' => 'bool'],
            'patterns' => ['desc' => 1200, 'usage' => 'list', 'a11y' => 'list', 'interaction' => 'list', 'dev' => 'list', 'hidden' => 'bool'],
            'checklist' => ['verdict' => 10, 'evidence' => 1200, 'fix' => 600, 'hidden' => 'bool'],
            'tokens' => ['description' => 300],
            'downloads' => ['label' => 60, 'use' => 200, 'hidden' => 'bool'],
            default => [],
        };
        $o = [];
        foreach ($data as $key => $v) {
            $x = $pick((array) $v, $spec);
            if ($section === 'checklist' && isset($x['verdict']) && !in_array($x['verdict'], self::VERDICTS, true)) {
                unset($x['verdict']);
            }
            if ($x) {
                $o[(string) $key] = $x;
            }
        }
        return $o;
    }

    // ── 원본에 합치기(Data 가 부른다) ─────────────────────────

    public static function applyRegistry(array $reg): array
    {
        $ov = self::get('components');
        if ($ov === []) {
            return $reg;
        }
        $metas = [];
        foreach ((array) ($reg['metas'] ?? []) as $i => $m) {
            $o = $ov[(string) ($m['id'] ?? '')] ?? [];
            if (!empty($o['hidden'])) {
                continue;
            }
            foreach (['title', 'note'] as $k) {
                if (isset($o[$k])) { $m[$k] = $o[$k]; }
            }
            $m['_order'] = $o['order'] ?? (1000 + $i);
            $metas[] = $m;
        }
        usort($metas, static fn (array $a, array $b): int => $a['_order'] <=> $b['_order']);
        $reg['metas'] = array_map(static function (array $m): array { unset($m['_order']); return $m; }, $metas);
        return $reg;
    }

    public static function applyDoc(array $doc): array
    {
        $o = self::get('components')[(string) ($doc['id'] ?? '')] ?? [];
        foreach (['title', 'summary', 'note', 'notes'] as $k) {
            if (isset($o[$k])) { $doc[$k] = $o[$k]; }
        }
        return $doc;
    }

    /** KRDS 컴포넌트·패턴(열쇠 = 한글 이름) */
    public static function applyItems(array $data, string $section): array
    {
        $ov = self::get($section);
        if ($ov === []) {
            return $data;
        }
        $items = [];
        foreach ((array) ($data['items'] ?? []) as $it) {
            $o = $ov[(string) ($it['ko'] ?? '')] ?? [];
            if (!empty($o['hidden'])) {
                continue;
            }
            unset($o['hidden']);
            $items[] = $o + $it;
        }
        $data['items'] = $items;
        return $data;
    }

    /** 체크리스트(열쇠 = idx) — 판정을 바꾸면 요약 건수도 다시 센다 */
    public static function applyChecklist(array $data): array
    {
        $ov = self::get('checklist');
        if ($ov === []) {
            return $data;
        }
        $rows = [];
        $sum = [];
        foreach ((array) ($data['rows'] ?? []) as $r) {
            $o = $ov[(string) ($r['idx'] ?? '')] ?? [];
            if (!empty($o['hidden'])) {
                continue;
            }
            unset($o['hidden']);
            $r = $o + $r;
            $sum[(string) $r['verdict']] = ($sum[(string) $r['verdict']] ?? 0) + 1;
            $rows[] = $r;
        }
        $data['rows'] = $rows;
        $data['summary'] = $sum;
        return $data;
    }
}

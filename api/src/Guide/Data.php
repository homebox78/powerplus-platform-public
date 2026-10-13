<?php
declare(strict_types=1);

namespace Pp\Guide;

use Pp\Core\HttpError;

/**
 * powerGuide 정본 읽기 — REST(/api/v1/guide/*)와 powerMCP(guide_*)가 같은 데이터를 본다(기획 §23 ③).
 *
 * 원천(손으로 복사하지 않는다):
 *  - 부품 문서: <웹 루트>/kit-files/registry.json · docs/<id>.json · r/<id>.json  — packages/kit 빌드 산출물(웹 빌드가 public 째 싣는다)
 *  - 토큰:      <웹 루트>/guide-files/solideo-tokens.flat.json · kit-files/kit.css 의 --krds-* 사용자 속성
 *  - KRDS 지침·패턴·체크리스트: api/data/guide/*.json — scripts/build-guide-data.mjs 가 powerGuide 화면 데이터에서 만든다
 * 웹 루트: 서버는 api/ 의 부모(빌드 결과와 api 가 한 폴더), 로컬은 apps/web/public.
 */
final class Data
{
    private static ?string $root = null;
    private static array $cache = [];

    public static function webRoot(): string
    {
        if (self::$root !== null) {
            return self::$root;
        }
        $env = getenv('PP_WEB_ROOT');
        $api = dirname(__DIR__, 2);            // …/api
        $cands = array_filter([$env ?: null, dirname($api), dirname($api) . '/apps/web/public']);
        foreach ($cands as $c) {
            if (is_file($c . '/kit-files/registry.json')) {
                return self::$root = rtrim($c, '/\\');
            }
        }
        throw new HttpError('UNAVAILABLE', '부품 자료를 찾지 못했습니다.', 503, '키트 빌드(packages/kit)를 먼저 실행하세요.');
    }

    private static function json(string $file, string $what): array
    {
        if (isset(self::$cache[$file])) {
            return self::$cache[$file];
        }
        if (!is_file($file)) {
            throw new HttpError('UNAVAILABLE', "{$what} 자료를 찾지 못했습니다.", 503);
        }
        $j = json_decode((string) file_get_contents($file), true);
        if (!is_array($j)) {
            throw new HttpError('UNAVAILABLE', "{$what} 자료를 읽지 못했습니다.", 503);
        }
        return self::$cache[$file] = $j;
    }

    private static function dataFile(string $name): array
    {
        return self::json(dirname(__DIR__, 2) . '/data/guide/' . $name, 'KRDS');
    }

    public static function registry(): array
    {
        return self::json(self::webRoot() . '/kit-files/registry.json', '부품 목록');
    }

    /** 부품 문서 한 건(없으면 null). id 는 목록에 있는 것만 받는다(경로 조작 차단). */
    public static function doc(string $id): ?array
    {
        $ids = array_column(self::registry()['metas'] ?? [], 'id');
        if (!in_array($id, $ids, true)) {
            return null;
        }
        return self::json(self::webRoot() . "/kit-files/docs/{$id}.json", '부품 문서');
    }

    public static function hasRegistryItem(string $id): bool
    {
        return is_file(self::webRoot() . "/kit-files/r/{$id}.json");
    }

    public static function krdsComponents(): array
    {
        return self::dataFile('krds-components.json');
    }

    public static function krdsPatterns(): array
    {
        return self::dataFile('krds-patterns.json');
    }

    public static function checklist(): array
    {
        return self::dataFile('checklist.json');
    }

    /** 키트 부품 id → KRDS 지침 항목들(대응표 id 가 다른 것은 aliases). */
    public static function krdsFor(string $kitId): array
    {
        $k = self::krdsComponents();
        $keys = array_merge([$kitId], $k['aliases'][$kitId] ?? []);
        $names = self::KRDS_BY_NAME[$kitId] ?? [];
        return array_values(array_filter($k['items'] ?? [], static fn (array $c): bool =>
            ($c['id'] !== '' && in_array($c['id'], $keys, true)) || in_array((string) ($c['ko'] ?? ''), $names, true)));
    }

    /**
     * 키트 부품 → KRDS 컴포넌트 한글 이름(데이터 id 로 묶이지 않은 것). 2026-10-12 MCP 시험: date-input 의 krds 가 빈 배열이었다
     * — KRDS 「날짜 입력 필드」는 데이터에서 date-picker 로 묶여 있었고, 캐러셀·코치마크처럼 id 가 비어 있는 항목도 있었다.
     */
    private const KRDS_BY_NAME = [
        'date-input' => ['날짜 입력 필드'],
        'calendar' => ['달력'],
        'alert-dialog' => ['모달'],
        'carousel' => ['캐러셀'],
        'coach-mark' => ['코치마크'],
        'contextual-help' => ['맥락적 도움말'],
        'tutorial-panel' => ['따라하기 패널'],
        'header' => ['헤더'],
        'mobile-menu' => ['메인 메뉴'],
        'data-table' => ['표'],
        'combobox' => ['셀렉트'],
        'language-switcher' => ['언어 변경'],
        'resize' => ['화면 크기 조정'],
        'tts' => ['음성지원'],
        'slider' => ['범위슬라이드'],
        'chip' => ['태그'],
        'sidebar' => ['사이드 메뉴'],
    ];

    /** 흔히 부르는 이름(띄어쓰기 없앤 소문자) → 부품 id. 키트 title·KRDS 이름으로 안 풀리는 것만. */
    private const COMMON_NAMES = [
        '드롭다운' => 'dropdown-menu', '드롭다운메뉴' => 'dropdown-menu', 'dropdown' => 'dropdown-menu',
        '확인창' => 'alert-dialog', '확인대화상자' => 'alert-dialog', 'confirm' => 'alert-dialog',
        '토스트' => 'toast', '팝오버' => 'popover', '툴팁' => 'tooltip', '페이지번호' => 'pagination',
        '토글' => 'switch', '스위치' => 'switch', '체크박스' => 'checkbox', '라디오' => 'radio-group',
        '텍스트영역' => 'textarea', '여러줄입력' => 'textarea', '단계' => 'step-indicator', '진행단계' => 'step-indicator',
        '경로' => 'breadcrumb', '위치정보' => 'breadcrumb', '표' => 'data-table', '테이블' => 'data-table',
    ];

    /** 목록 검색 낱말 → 같이 찾을 말(모달 검색에 확인 대화상자도). */
    private const SEARCH_SYN = [
        '모달' => ['모달', '대화상자', 'dialog', 'drawer'],
        '대화상자' => ['대화상자', '모달', 'dialog'],
        '드롭다운' => ['드롭다운', 'dropdown', '셀렉트', 'select', '콤보'],
        '팝업' => ['팝업', '팝오버', 'popover', '대화상자', 'dialog'],
        '토글' => ['토글', '스위치', 'switch'],
        '표' => ['표', '테이블', 'table'],
        '탭' => ['탭', 'tabs'],
        '메뉴' => ['메뉴', 'menu'],
    ];

    /** @return list<string> 검색어와 그 동의어(소문자) */
    public static function searchTerms(string $q): array
    {
        $q = mb_strtolower(trim($q));
        return array_values(array_unique(array_map('mb_strtolower', self::SEARCH_SYN[$q] ?? [$q])));
    }

    /** 부품 문서의 머리 설명(목록 summary 가 빈 부품용). 문서가 없으면 ''. */
    public static function docSummary(string $id): string
    {
        try {
            $doc = self::doc($id);
        } catch (\Throwable) {
            return '';
        }
        $s = trim((string) ($doc['summary'] ?? ''));
        // '아코디언 — KRDS 「아코디언」 · shadcn Accordion 과 같은 사용법 …' 에서 제목 앞부분은 떼고 설명만
        $s = preg_replace('/^[^—]{1,30}—\s*/u', '', $s) ?? $s;
        return mb_substr($s, 0, 160);
    }

    /**
     * 부품 id 를 찾는다 — id 그대로 · 한글 이름(title) · KRDS 한글 이름 · 띄어쓰기·대소문자 무시.
     * @return array{id: ?string, candidates: list<array{id:string,title:string}>}
     */
    public static function resolveComponent(string $q): array
    {
        $metas = self::registry()['metas'] ?? [];
        $norm = static fn (string $s): string => mb_strtolower(preg_replace('/[\s_\-]+/u', '', $s) ?? $s);
        $nq = $norm($q);
        if ($nq === '') return ['id' => null, 'candidates' => []];
        foreach ($metas as $m) {
            if ($norm((string) $m['id']) === $nq || $norm((string) ($m['title'] ?? '')) === $nq) return ['id' => (string) $m['id'], 'candidates' => []];
        }
        // 흔히 부르는 이름(2026-10-12 MCP 시험: '드롭다운' 이 dropdown-menu 로 안 풀렸다)
        $alias = self::COMMON_NAMES[$nq] ?? null;
        if ($alias !== null && in_array($alias, array_column($metas, 'id'), true)) return ['id' => $alias, 'candidates' => []];
        // KRDS 한글 이름(예: '날짜 입력 필드' → date-input)
        // 데이터 id 로 묶인 부품을 먼저(모달 → dialog), 이름으로만 이어 둔 부품은 그다음(모달 → alert-dialog)
        $aliases = self::krdsComponents()['aliases'] ?? [];
        foreach ([true, false] as $direct) {
            foreach ($metas as $m) {
                $mid = (string) $m['id'];
                $keys = array_merge([$mid], $aliases[$mid] ?? []);
                foreach (self::krdsFor($mid) as $c) {
                    if ($direct !== in_array($c['id'], $keys, true)) continue;
                    if ($norm((string) ($c['ko'] ?? '')) === $nq || $norm((string) ($c['en'] ?? '')) === $nq) return ['id' => $mid, 'candidates' => []];
                }
            }
        }
        // 못 찾음 — 이름이 서로 포함되거나 글자가 가까운 것을 후보로
        $scored = [];
        foreach ($metas as $m) {
            $id = (string) $m['id']; $title = (string) ($m['title'] ?? '');
            $ni = $norm($id); $nt = $norm($title);
            $s = 0;
            if ($nt !== '' && (str_contains($nt, $nq) || str_contains($nq, $nt))) $s = 3;
            elseif (str_contains($ni, $nq) || str_contains($nq, $ni)) $s = 3;
            else {
                $common = count(array_intersect(mb_str_split($nq), mb_str_split($nt)));
                if ($common >= 2) $s = $common / max(1, mb_strlen($nq));
                $d = levenshtein($nq, $ni);
                if ($d <= 2) $s = max($s, 2.5 - $d * 0.5);
            }
            if ($s > 0) $scored[] = [$s, ['id' => $id, 'title' => $title]];
        }
        usort($scored, static fn ($a, $b) => $b[0] <=> $a[0]);
        return ['id' => null, 'candidates' => array_map(static fn ($x) => $x[1], array_slice($scored, 0, 5))];
    }

    /**
     * 정본 색 — ['names' => [--이름 => #rrggbb], 'values' => [#rrggbb => 이름]].
     * powerGuide 토큰(flat) + 키트 kit.css 의 사용자 속성(KRDS 팔레트). 한 단계 var() 참조는 풀어 둔다.
     */
    /** 브랜드 색 — powerDeck 강조색 9가지(Upload.tsx ACCENTS) + 사이트 포인트 주황·글자용 주황 */
    public const BRAND = [
        '--pp-accent-blue' => '#1866da', '--pp-accent-sky' => '#2e9bd6', '--pp-accent-teal' => '#0e9f8e',
        '--pp-accent-green' => '#1a9c5b', '--pp-accent-amber' => '#f59e0b', '--pp-accent-orange' => '#e8703a',
        '--pp-accent-red' => '#d7263d', '--pp-accent-pink' => '#e8336d', '--pp-accent-burgundy' => '#c01348',
        '--pp-point' => '#e46b37', '--pp-point-ink' => '#e46b37',
    ];

    public static function palette(): array
    {
        if (isset(self::$cache['palette'])) {
            return self::$cache['palette'];
        }
        $names = [];
        $flat = self::webRoot() . '/guide-files/solideo-tokens.flat.json';
        if (is_file($flat)) {
            $j = json_decode((string) file_get_contents($flat), true);
            foreach (($j['tokens'] ?? []) as $n => $t) {
                $hex = Color::toHex((string) ($t['value'] ?? ''));
                if ($hex !== null && ($t['type'] ?? '') === 'color') {
                    $names['--' . $n] = $hex;
                }
            }
        }
        $css = self::webRoot() . '/kit-files/kit.css';
        if (is_file($css)) {
            $raw = (string) file_get_contents($css);
            $refs = [];
            if (preg_match_all('/(--[\w-]+)\s*:\s*([^;{}]+);/', $raw, $m, PREG_SET_ORDER)) {
                foreach ($m as $d) {
                    $v = trim($d[2]);
                    $hex = Color::toHex($v);
                    if ($hex !== null) {
                        $names[$d[1]] ??= $hex;
                    } elseif (preg_match('/^var\((--[\w-]+)\)$/', $v, $r)) {
                        $refs[$d[1]] = $r[1];
                    }
                }
            }
            foreach ($refs as $n => $to) {
                if (!isset($names[$n]) && isset($names[$to])) {
                    $names[$n] = $names[$to];
                }
            }
        }
        // 플랫폼 브랜드 색(powerDeck 강조색 기본·사이트 포인트) — 정본 팔레트 밖이라 '정본 밖'으로 지적하던 것(2026-10-12 MCP 3차)
        foreach (self::BRAND as $n => $hex) {
            $names[$n] ??= $hex;
        }
        $values = [];
        foreach ($names as $n => $hex) {
            $values[$hex] ??= $n;
        }
        return self::$cache['palette'] = ['names' => $names, 'values' => $values];
    }
}

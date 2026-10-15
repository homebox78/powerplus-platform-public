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

    // 아래 읽기는 모두 관리자 덮어쓰기(Overrides — 글·판정·숨김·순서)를 합친 값이다(2026-10-14). 숨긴 부품은 목록·문서 모두에서 빠진다.
    public static function registry(): array
    {
        return Overrides::applyRegistry(self::json(self::webRoot() . '/kit-files/registry.json', '부품 목록'));
    }

    /** 부품 문서 한 건(없으면 null). id 는 목록에 있는 것만 받는다(경로 조작 차단). */
    public static function doc(string $id): ?array
    {
        $ids = array_column(self::registry()['metas'] ?? [], 'id');
        if (!in_array($id, $ids, true)) {
            return null;
        }
        return Overrides::applyDoc(self::json(self::webRoot() . "/kit-files/docs/{$id}.json", '부품 문서'));
    }

    public static function hasRegistryItem(string $id): bool
    {
        return is_file(self::webRoot() . "/kit-files/r/{$id}.json");
    }

    /**
     * KRDS 컴포넌트 55종 — 항목마다 키트 부품 id(kit_id·kit_ids)와 온전한 영문 이름(en)을 붙여 준다.
     * id 는 KRDS 대응표 원래 id(krds_id 와 같음)로 둔다 — 키트 id 와 다르다(헤더=top-navigation 등). 밖으로 낼 때는 kit_id 를 쓴다.
     */
    public static function krdsComponents(): array
    {
        $k = Overrides::applyItems(self::dataFile('krds-components.json'), 'krds');
        $k['items'] = array_map(static function (array $c): array {
            $ko = (string) ($c['ko'] ?? '');
            $kits = self::KRDS_KIT[$ko] ?? [];
            $c['krds_id'] = (string) ($c['id'] ?? '');
            $c['kit_id'] = $kits[0] ?? null;
            $c['kit_ids'] = $kits;
            $c['en'] = self::KRDS_EN[$ko] ?? (string) ($c['en'] ?? '');
            return $c;
        }, (array) ($k['items'] ?? []));
        return $k;
    }

    public static function krdsPatterns(): array
    {
        return Overrides::applyItems(self::dataFile('krds-patterns.json'), 'patterns');
    }

    /**
     * 검증 체크리스트 — 원천(krds-report.json)이 PDF 에서 뽑혀 문장 끝에 다음 표 머리('P F E N/A 5) 검색 – … □ □ □ □ …')가
     * 붙은 행이 있다(2026-10-10 MCP 시험 207·241행). 읽을 때 그 꼬리를 뗀다. 원천 정리는 apps/web 쪽 일.
     */
    public static function checklist(): array
    {
        $c = Overrides::applyChecklist(self::dataFile('checklist.json'));
        foreach ($c['rows'] ?? [] as $i => $row) {
            $t = (string) ($row['text'] ?? '');
            $cut = preg_replace('/\s*P\s+F\s+E\s+N\/A\b.*$/su', '', $t) ?? $t;
            $cut = trim(preg_replace('/(\s*□)+.*$/su', '', $cut) ?? $cut);
            if ($cut !== $t && $cut !== '') {
                $c['rows'][$i]['text'] = $cut;
            }
        }
        return $c;
    }

    /** 키트 부품 id → KRDS 지침 항목들(KRDS_KIT 대응표 하나로 찾는다). */
    public static function krdsFor(string $kitId): array
    {
        return array_values(array_filter(self::krdsComponents()['items'] ?? [], static fn (array $c): bool => in_array($kitId, $c['kit_ids'], true)));
    }

    /**
     * KRDS 컴포넌트(한글 이름) → 키트 부품 id. 첫째가 대표(지침 검색 결과의 kit_id), 나머지도 같은 지침을 받는다.
     * 이름 체계를 하나로 — 예전엔 KRDS 대응표 id(gov-banner·top-navigation·modal·tab·text-field)·aliases·이름 표 셋으로 찾아
     * 헤더 등 KRDS 출신 부품 13개의 지침이 0개였고, 지침 검색 결과의 kit_id 로 부품을 부르면 NOT_FOUND 였다(2026-10-10 MCP 시험 결함 2·3).
     * 빈 배열 = 대응하는 키트 부품이 없음. 열쇠는 관리자 덮어쓰기(Overrides 'krds')와 같은 한글 이름.
     */
    private const KRDS_KIT = [
        '공식 배너' => ['masthead'], '운영기관 식별자' => ['identifier'], '헤더' => ['header'], '푸터' => ['footer'],
        '건너뛰기 링크' => ['skip-link'], '메인 메뉴' => ['navigation-menu', 'mobile-menu'], '브레드크럼' => ['breadcrumb'],
        '사이드 메뉴' => ['side-navigation', 'sidebar'], '콘텐츠 내 탐색' => ['in-page-navigation'], '페이지네이션' => ['pagination'],
        '구조화 목록' => ['structured-list'], '긴급 공지' => ['alert'], '달력' => ['calendar', 'date-picker'], '디스클로저' => ['collapsible'],
        '모달' => ['dialog', 'alert-dialog'], '배지' => ['badge'], '아코디언' => ['accordion'], '이미지' => [], '캐러셀' => ['carousel'],
        '탭' => ['tabs'], '표' => ['table', 'data-table'], '텍스트 목록' => ['text-list'], '파비콘' => [],
        '링크' => ['link'], '버튼' => ['button'], '플로팅 버튼' => [],
        '라디오 버튼' => ['radio-group'], '체크박스' => ['checkbox'], '셀렉트' => ['select', 'combobox'], '태그' => ['tag', 'chip'], '토글 스위치' => ['switch'],
        '단계 표시기' => ['step-indicator'], '스피너' => ['spinner'],
        '도움 패널' => ['help-panel'], '따라하기 패널' => ['tutorial-panel'], '맥락적 도움말' => ['contextual-help'], '코치마크' => ['coach-mark'], '툴팁' => ['tooltip'], '음성지원' => ['tts'],
        '날짜 입력 필드' => ['date-input', 'date-picker'], '텍스트 영역 (Textarea)' => ['textarea'], '텍스트 입력 필드' => ['input', 'field'], '파일 업로드' => ['file-upload'],
        '언어 변경' => ['language-switcher'], '화면 크기 조정' => ['resize'], '접근 가능한 미디어' => [], '숨긴 콘텐츠' => [],
        '범위슬라이드' => ['slider'], '뒤로가기 버튼' => [], '바텀시트' => ['drawer'], '수량 토글' => [], '토스트' => ['toast'], '스낵바' => ['toast'],
        '탭바' => ['tabs'], '스플래시 스크린' => [],
    ];

    /** KRDS 컴포넌트 영문 이름 — 원천(krds.ts)이 첫 낱말만 갖고 있어('Skip'·'Main'·'Side') 온전한 이름으로 바꾼다(MCP 시험 결함 4). */
    private const KRDS_EN = [
        '건너뛰기 링크' => 'Skip link', '메인 메뉴' => 'Main menu', '사이드 메뉴' => 'Side navigation', '콘텐츠 내 탐색' => 'In-page navigation',
        '구조화 목록' => 'Structured list', '긴급 공지' => 'Critical alert', '텍스트 목록' => 'Text list', '플로팅 버튼' => 'Floating action button',
        '라디오 버튼' => 'Radio button', '토글 스위치' => 'Toggle switch', '단계 표시기' => 'Step indicator', '도움 패널' => 'Help panel',
        '따라하기 패널' => 'Tutorial panel', '맥락적 도움말' => 'Contextual help', '코치마크' => 'Coach mark', '음성지원' => 'Text to speech',
        '날짜 입력 필드' => 'Date input', '텍스트 입력 필드' => 'Text input', '파일 업로드' => 'File upload', '언어 변경' => 'Language switcher',
        '접근 가능한 미디어' => 'Accessible media', '숨긴 콘텐츠' => 'Visually hidden', '범위슬라이드' => 'Range slider', '뒤로가기 버튼' => 'Back button',
        '바텀시트' => 'Bottom sheet', '수량 토글' => 'Quantity toggle', '탭바' => 'Tab bar', '스플래시 스크린' => 'Splash screen',
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
        // 영어로 찾는 말(2026-10-10 MCP 시험: modal 0건 · date 에서 calendar 빠짐)
        'modal' => ['modal', 'dialog', '모달', '대화상자'],
        'dialog' => ['dialog', 'modal', '대화상자', '모달'],
        'popup' => ['popup', 'popover', 'dialog', '팝업', '대화상자'],
        'date' => ['date', 'calendar', '날짜', '달력'],
        'calendar' => ['calendar', 'date', '달력', '날짜'],
        '날짜' => ['날짜', '달력', 'date', 'calendar'],
        '달력' => ['달력', '날짜', 'calendar', 'date'],
        'toggle' => ['toggle', 'switch', '토글', '스위치'],
        'table' => ['table', '표', '테이블'],
        'select' => ['select', 'combobox', '선택 상자', '셀렉트'],
        '검색창' => ['검색창', '검색', 'search'], '검색' => ['검색', 'search'], 'search' => ['search', '검색'],        'nav' => ['nav', 'navigation', '메뉴', '탐색'],
        'navigation' => ['navigation', 'nav', '메뉴', '탐색'],
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
        // KRDS 이름·대응표 id(예: '날짜 입력 필드'·'Date input'·gov-banner·top-navigation) → 대표 키트 부품(모달 → dialog)
        // 지침 검색·guide_krds 가 예전에 주던 KRDS id 로 불러도 부품이 나오게(2026-10-10 MCP 시험: gov-banner NOT_FOUND)
        $metaIds = array_column($metas, 'id');
        foreach (self::krdsComponents()['items'] ?? [] as $c) {
            $kit = $c['kit_id'];
            if ($kit === null || !in_array($kit, $metaIds, true)) continue;
            $ko = $norm(preg_replace('/\s*\(.*?\)/u', '', (string) ($c['ko'] ?? '')) ?? '');
            if ($ko === $nq || $norm((string) ($c['en'] ?? '')) === $nq || ($c['krds_id'] !== '' && $norm($c['krds_id']) === $nq)) {
                return ['id' => $kit, 'candidates' => []];
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

    /** 브랜드 색 — powerDeck 강조색 9가지(Upload.tsx ACCENTS) + 사이트 포인트 주황·글자용 주황 */
    public const BRAND = [
        '--pp-accent-blue' => '#1866da', '--pp-accent-sky' => '#2e9bd6', '--pp-accent-teal' => '#0e9f8e',
        '--pp-accent-green' => '#1a9c5b', '--pp-accent-amber' => '#f59e0b', '--pp-accent-orange' => '#e8703a',
        '--pp-accent-red' => '#d7263d', '--pp-accent-pink' => '#e8336d', '--pp-accent-burgundy' => '#c01348',
        '--pp-point' => '#e46b37', '--pp-point-ink' => '#e46b37',
    ];

    /**
     * 정본 색 — ['names' => [--이름 => #rrggbb], 'values' => [#rrggbb => 이름]].
     * powerGuide 토큰(flat) + 키트 kit.css 의 사용자 속성(KRDS 팔레트) + 브랜드 색. 한 단계 var() 참조는 풀어 둔다.
     */
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

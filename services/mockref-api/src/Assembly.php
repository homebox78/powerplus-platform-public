<?php
declare(strict_types=1);

namespace Homebox;

/**
 * 디자인 조립기 (docs/11 · Phase 8, 2026-09-29).
 *   ① 화면 검색 → ② 섹션 수집 → ③ 패턴 분석(PatternSummary) → ④ 컴포넌트 선택(ComponentPlan) → ⑤ 슬롯 배치(AssemblySpec) → ⑥ 품질 게이트
 *
 * 원칙(docs/11 §1): 복제가 아니라 재조립 · 근거 없는 슬롯 없음(ref·rationale 필수) · 명세가 중심 · 최종 스타일은 고객 것(원본 기관 색 금지).
 * 코드 값은 taxonomy.json assembly 블록이 단일 진실 — code ↔ section_types 매핑도 거기서 읽는다.
 * 응답 모양은 packages/shared/src/schemas/assembly.ts(zod) 와 같아야 한다. MCP 가 그것으로 검증한다.
 *
 * 순수 함수(area·cols·density·patternSummary·gates·contrast)는 DB 없이 돌아가게 두었다 — api/bin/test-assembly.php 가 부른다.
 */
final class Assembly
{
    /** docs/11 §4.2 예시·KRDS 기본 주색. KRDS 쪽 값은 고정 버전(krds_components.krds_version) 기준 */
    public const KRDS_PRIMARY = '#256EF4';
    public const KRDS_FONT = 'Pretendard GOV';
    public const MAX_PER_SITE = 2;
    /** insights.php 와 같은 가중치 — 레퍼런스 순위가 두 곳에서 갈리지 않게 */
    private const W = ['rating' => 0.35, 'krds' => 0.25, 'recency' => 0.20, 'wa' => 0.10, 'views' => 0.10];
    private const HEADER_CODES = ['GOV_BANNER', 'UTIL_BAR', 'GNB'];

    /**
     * taxonomy.json 위치. 운영 번들엔 packages/ 가 없어(2026-09-29 발견 — /api/taxonomy 가 500 이었다) deploy.sh 가 api/data/ 로 복사한다.
     * 로컬은 원본(packages/shared) 을 읽는다. 원본이 단일 진실이고 api/data 사본은 배포 산출물이다.
     */
    public static function taxonomyPath(): ?string
    {
        foreach ([__DIR__ . '/../data/taxonomy.json', __DIR__ . '/../../packages/shared/taxonomy.json'] as $f) {
            if (is_file($f)) { return $f; }
        }
        return null;
    }

    /** @return array<string,mixed> */
    public static function taxonomy(): array
    {
        static $t = null;
        if ($t === null) {
            $path = self::taxonomyPath();
            $raw = $path === null ? null : json_decode((string) file_get_contents($path), true);
            $t = is_array($raw) ? $raw : [];
        }
        return $t;
    }

    /** section_type id → 조립 코드 정보 @return array<string,array<string,mixed>> */
    public static function codeByType(): array
    {
        $map = [];
        foreach ((array) (self::taxonomy()['assembly']['section_codes'] ?? []) as $c) {
            foreach ((array) $c['section_types'] as $t) { $map[$t] = $c; }
        }
        return $map;
    }

    /** @return array<string,array<string,mixed>> code → 정보 */
    public static function codes(): array
    {
        $out = [];
        foreach ((array) (self::taxonomy()['assembly']['section_codes'] ?? []) as $c) { $out[$c['code']] = $c; }
        return $out;
    }

    // ---- 순수 함수 --------------------------------------------------------------------------------------------

    /**
     * 섹션 bbox → 영역. 헤더·푸터 계열은 코드로 고정, 나머지는 컨테이너 안 위치로 판단.
     * @param float $x 컨테이너 기준 왼쪽 비율(0~1) @param float $w 컨테이너 대비 폭 비율 @param float $y 페이지 대비 세로 위치(0~1)
     */
    public static function area(string $code, float $x, float $w, float $y): string
    {
        if (in_array($code, self::HEADER_CODES, true)) { return 'header'; }
        if ($code === 'FOOTER') { return 'footer'; }
        if ($code === 'LNB') { return 'left'; }
        if ($w >= 0.75) { return $y < 0.34 ? 'top' : ($y > 0.72 ? 'bottom' : 'center'); }
        $mid = $x + $w / 2;
        return $mid < 0.4 ? 'left' : ($mid > 0.6 ? 'right' : 'center');
    }

    public static function cols(float $w): int
    {
        return max(1, min(12, (int) round($w * 12)));
    }

    /** 항목 한 줄 높이 → 밀도. 항목 수를 모르면 null */
    public static function density(?int $items, float $h): ?string
    {
        if ($items === null || $items <= 0 || $h <= 0) { return null; }
        $row = $h / $items;
        return $row < 44 ? 'dense' : ($row < 80 ? 'normal' : 'airy');
    }

    /** 최빈값과 그 비율 @param list<mixed> $xs @return array{mode:mixed, ratio:float, distribution:array<string,int>} */
    public static function mode(array $xs): array
    {
        $c = [];
        foreach ($xs as $v) { if ($v === null || $v === '') { continue; } $k = (string) $v; $c[$k] = ($c[$k] ?? 0) + 1; }
        if ($c === []) { return ['mode' => null, 'ratio' => 0.0, 'distribution' => []]; }
        arsort($c);
        $k = (string) array_key_first($c);
        $mode = is_numeric($k) ? (str_contains($k, '.') ? (float) $k : (int) $k) : $k;
        return ['mode' => $mode, 'ratio' => round($c[$k] / array_sum($c), 3), 'distribution' => $c];
    }

    /**
     * ③ 패턴 요약 — 한 코드의 표본 섹션들.
     * @param list<array<string,mixed>> $rows  각 원소: id, site_id, screen_id, area, cols, items, density, variant, y_ratio, score, confidence
     * @return array<string,mixed>
     */
    public static function patternSummary(string $code, array $rows, int $nScreens): array
    {
        $screens = array_unique(array_column($rows, 'screen_id'));
        $firstY = [];
        foreach ($rows as $r) { $s = $r['screen_id']; if (!isset($firstY[$s]) || $r['y_ratio'] < $firstY[$s]) { $firstY[$s] = (float) $r['y_ratio']; } }
        $findings = [];
        foreach (['area', 'cols', 'items', 'density', 'variant'] as $k) {
            $m = self::mode(array_column($rows, $k));
            if ($m['mode'] === null) { continue; }
            $findings[] = ['key' => $k, 'mode' => $m['mode'], 'ratio' => $m['ratio'], 'distribution' => array_slice($m['distribution'], 0, 8, true)];
        }
        usort($rows, static fn (array $a, array $b): int => [$b['score'], $b['confidence']] <=> [$a['score'], $a['confidence']]);
        $refs = []; $seen = [];
        foreach ($rows as $r) {
            if (isset($seen[$r['site_id']])) { continue; }
            $seen[$r['site_id']] = true;
            $refs[] = (string) $r['id'];
            if (count($refs) >= 5) { break; }
        }
        return [
            'section' => $code,
            'sample_size' => count($rows),
            'n_sites' => count(array_unique(array_column($rows, 'site_id'))),
            'adoption' => $nScreens > 0 ? round(min(1, count($screens) / $nScreens), 3) : 0.0,
            'avg_position' => $firstY ? round(array_sum($firstY) / count($firstY), 3) : 0.0,
            'findings' => $findings,
            'refs' => $refs,
        ];
    }

    /** WCAG 대비비 */
    public static function contrast(string $a, string $b): float
    {
        $lum = static function (string $hex): float {
            $hex = ltrim($hex, '#');
            $ch = array_map(static fn (string $p): float => hexdec($p) / 255, str_split(substr($hex . '000000', 0, 6), 2));
            $ch = array_map(static fn (float $c): float => $c <= 0.03928 ? $c / 12.92 : (($c + 0.055) / 1.055) ** 2.4, $ch);
            return 0.2126 * $ch[0] + 0.7152 * $ch[1] + 0.0722 * $ch[2];
        };
        [$l1, $l2] = [$lum($a), $lum($b)];
        return round((max($l1, $l2) + 0.05) / (min($l1, $l2) + 0.05), 2);
    }

    /** 두 색이 사실상 같은가(채널 차 합 ≤ 24) — "원본 기관 색을 그대로 쓰지 않는다" 판정 */
    public static function sameColor(string $a, string $b): bool
    {
        $p = static fn (string $h): array => array_map('hexdec', str_split(substr(ltrim($h, '#') . '000000', 0, 6), 2));
        [$x, $y] = [$p($a), $p($b)];
        return abs($x[0] - $y[0]) + abs($x[1] - $y[1]) + abs($x[2] - $y[2]) <= 24;
    }

    /**
     * ⑥ 품질 게이트 7종 (docs/11 §5). 고칠 수 있는 건 고치고(status=fixed) 결과와 함께 돌려준다.
     * @param array<string,mixed> $spec
     * @param array{site_of: array<string,string>, site_primaries: array<string,string>, removed: array<string,bool>, krds_known: array<string,bool>, slot_krds: array<int,list<string>>, site_info: array<string,array<string,string>>, alternates?: array<string,list<string>>} $ctx
     * @return array{spec: array<string,mixed>, report: array{passed: bool, checks: list<array<string,mixed>>}}
     */
    public static function gates(array $spec, array $ctx): array
    {
        $checks = [];
        $slots = (array) ($spec['slots'] ?? []);
        $siteOf = $ctx['site_of'];

        // 7) 삭제요청 — 먼저 교체해야 복제·출처 판정이 최종 ref 기준이 된다
        $replaced = []; $left = [];
        foreach ($slots as $i => $s) {
            if (!isset($ctx['removed'][$s['ref']])) { continue; }
            $alt = null;
            foreach ((array) ($ctx['alternates'][$s['section']] ?? []) as $cand) { if (!isset($ctx['removed'][$cand])) { $alt = $cand; break; } }
            if ($alt !== null) { $replaced[] = $s['ref'] . '→' . $alt; $slots[$i]['ref'] = $alt; $slots[$i]['ref_site'] = $siteOf[$alt] ?? null; } else { $left[] = $s['ref']; }
        }

        // 2) 복제 방지 — 같은 기관 섹션 한 화면 2개 이하
        $count = []; $swaps = []; $over = [];
        foreach ($slots as $i => $s) {
            $site = $siteOf[$s['ref']] ?? '?';
            if (($count[$site] ?? 0) >= self::MAX_PER_SITE) {
                $alt = null;
                foreach ((array) ($ctx['alternates'][$s['section']] ?? []) as $cand) {
                    $cs = $siteOf[$cand] ?? '?';
                    if (($count[$cs] ?? 0) < self::MAX_PER_SITE && !isset($ctx['removed'][$cand])) { $alt = $cand; break; }
                }
                if ($alt !== null) { $swaps[] = $s['ref'] . '→' . $alt; $slots[$i]['ref'] = $alt; $slots[$i]['ref_site'] = $siteOf[$alt] ?? null; $site = $siteOf[$alt] ?? '?'; } else { $over[] = $s['ref']; }
            }
            $count[$site] = ($count[$site] ?? 0) + 1;
        }
        $maxSite = $count ? max($count) : 0;

        // 1) 근거 — ref·rationale 누락 0
        $missing = [];
        foreach ($slots as $s) { if (($s['ref'] ?? '') === '' || mb_strlen((string) ($s['rationale'] ?? '')) < 10) { $missing[] = (string) ($s['section'] ?? '?'); } }
        $checks[] = ['id' => 'evidence', 'status' => $missing ? 'fail' : 'pass', 'detail' => $missing ? '근거 없는 슬롯 ' . count($missing) . '개 — 생성 중단' : '모든 슬롯에 ref·rationale 있음', 'items' => $missing];
        $checks[] = ['id' => 'duplication', 'status' => $over ? 'fail' : ($swaps ? 'fixed' : 'pass'), 'detail' => $over ? '같은 기관 섹션 ' . self::MAX_PER_SITE . '개 초과를 대체할 후보가 없음' : ($swaps ? '다른 기관 후보로 ' . count($swaps) . '개 교체 — 기관당 최대 ' . $maxSite . '개' : '기관당 최대 ' . $maxSite . '개'), 'items' => $over ?: $swaps];

        // 3) 스타일 — 테마 주색이 원본 기관 색과 같으면 KRDS 주색으로 치환
        $theme = (array) $spec['theme'];
        $hits = [];
        foreach ($count as $site => $_) { $p = $ctx['site_primaries'][$site] ?? null; if ($p && self::sameColor((string) $theme['primary'], $p)) { $hits[] = $site . ' ' . $p; } }
        if ($hits) { $theme['primary'] = self::KRDS_PRIMARY; }
        $checks[] = ['id' => 'style', 'status' => $hits ? 'fixed' : 'pass', 'detail' => $hits ? '테마 주색이 원본 기관 색과 같아 KRDS 주색으로 치환' : '원본 기관 색 사용 0 — 테마 토큰만', 'items' => $hits];

        // 4) KRDS — 고정 버전 기준 컴포넌트 실존 + 정부 상징(마스트헤드) 유무
        $unknown = [];
        foreach ($ctx['slot_krds'] as $list) { foreach ($list as $k) { if (!isset($ctx['krds_known'][$k])) { $unknown[] = $k; } } }
        $warnK = array_values(array_unique($unknown));
        if (($spec['screen_type'] ?? '') !== 'POPUP' && !in_array('GOV_BANNER', array_column($slots, 'section'), true)) { $warnK[] = 'GOV_BANNER(공식 누리집 표시) 슬롯 없음'; }
        $checks[] = ['id' => 'krds', 'status' => $warnK ? 'warn' : 'pass', 'detail' => $warnK ? 'KRDS 확인 필요 ' . count($warnK) . '건' : 'KRDS ' . ($theme['krds_version'] ?? '') . ' 컴포넌트와 일치', 'items' => $warnK];

        // 5) 접근성 — 주색 위 흰 글자 대비(KWCAG 2.2 4.5:1)
        $c = self::contrast((string) $theme['primary'], '#FFFFFF');
        $checks[] = ['id' => 'a11y', 'status' => $c >= 4.5 ? 'pass' : 'warn', 'detail' => "주색 위 흰 글자 대비 {$c}:1" . ($c >= 4.5 ? '' : ' — 4.5:1 미만(버튼·배지 글자색 확인)'), 'items' => []];

        // 6) 출처 — 쓰인 모든 기관을 sources 에 자동 채움
        $sources = [];
        $had = array_column((array) ($spec['sources'] ?? []), 'site_id');
        foreach ($slots as $s) {
            $site = $siteOf[$s['ref']] ?? null;
            if ($site === null || isset($sources[$site])) { continue; }
            $info = $ctx['site_info'][$site] ?? null;
            if ($info) { $sources[$site] = ['site_id' => $site] + $info; }
        }
        $added = array_values(array_diff(array_keys($sources), $had));
        $checks[] = ['id' => 'sources', 'status' => $added && $had ? 'fixed' : 'pass', 'detail' => '출처 ' . count($sources) . '곳 — 사용된 기관 전부 포함', 'items' => array_map('strval', array_keys($sources))];

        $checks[] = ['id' => 'removal', 'status' => $left ? 'fail' : ($replaced ? 'fixed' : 'pass'), 'detail' => $left ? '삭제요청된 ref ' . count($left) . '개를 대체할 후보 없음' : ($replaced ? '삭제요청 ref ' . count($replaced) . '개 교체' : '삭제요청된 ref 0'), 'items' => $left ?: $replaced];

        $spec['slots'] = $slots;
        $spec['theme'] = $theme;
        $spec['sources'] = array_values($sources);
        // docs/11 §5 표 순서
        $order = array_flip(['evidence', 'duplication', 'style', 'krds', 'a11y', 'sources', 'removal']);
        usort($checks, static fn (array $a, array $b): int => $order[$a['id']] <=> $order[$b['id']]);
        $passed = !in_array('fail', array_column($checks, 'status'), true);
        return ['spec' => $spec, 'report' => ['passed' => $passed, 'checks' => $checks]];
    }

    // ---- 파이프라인(DB) ------------------------------------------------------------------------------------------

    /**
     * @param array{keyword?: string, org_type?: list<string>, screen_type?: string, sections?: list<string>, theme?: string, primary?: string, font?: string, device?: string, project?: string} $q
     * @return array<string,mixed>
     */
    public static function run(array $q): array
    {
        $tax = self::taxonomy();
        $screenType = strtoupper((string) ($q['screen_type'] ?? 'MAIN'));
        $st = null;
        foreach ((array) ($tax['assembly']['screen_types'] ?? []) as $x) { if ($x['code'] === $screenType) { $st = $x; } }
        if ($st === null) { throw new \InvalidArgumentException('screen_type 은 ' . implode('·', array_column($tax['assembly']['screen_types'], 'code')) . ' 중 하나'); }
        // 통계 화면은 따로 수집하지 않았지만 관공서 '통계' 는 대부분 안내 페이지(표·그래프 이미지) — 안내 화면에서 통계 낱말로 좁혀 만든다 (q3 R22 오류)
        $statsFallback = false;
        if ($st['page_types'] === [] && $screenType === 'STATS') { $st['page_types'] = ['content', 'info_disclosure']; $statsFallback = true; }
        if ($st['page_types'] === []) { throw new \DomainException("{$screenType} 화면은 아직 수집·분해하지 않습니다(taxonomy assembly.screen_types.page_types 가 비어 있음)."); }
        $device = ($q['device'] ?? 'pc') === 'mobile' ? 'mobile' : 'pc';
        $keyword = trim(mb_substr((string) ($q['keyword'] ?? ''), 0, 40));
        $notes = [];
        if ($statsFallback) {
            if ($keyword === '') { $keyword = '통계'; }
            $notes[] = 'STATS 화면은 따로 수집하지 않아 안내 페이지 중 통계 화면으로 만들었습니다(현황표·수치 요약).';
        }
        $requiredAdded = [];

        // ① 화면 검색 — 가중 점수 + 키워드 가점, 기관당 1화면
        $where = ["s.status = 'published' AND s.source_kind = 'gov'", "sc.status = 'published'", 'sc.device = ?', RefFilter::NOT_FOREIGN];
        $params = [$device];
        $ph = implode(',', array_fill(0, count($st['page_types']), '?'));
        $where[] = "sc.page_type_id IN ($ph)";
        array_push($params, ...$st['page_types']);
        $orgs = array_values(array_filter((array) ($q['org_type'] ?? []), static fn ($v): bool => is_string($v) && preg_match('/^[a-z_]+$/', $v) === 1));
        // 삭제요청(처리 중 포함 — 반려만 제외)은 후보에서 뺀다
        $where[] = "NOT EXISTS (SELECT 1 FROM removal_requests rr WHERE rr.status <> 'rejected' AND ((rr.target_type = 'site' AND rr.target_id = s.id) OR (rr.target_type = 'screen' AND rr.target_id = sc.id)))";
        $W = self::W;
        $score = sprintf('(%s * COALESCE(s.rating_avg / 5, 0.5) + %s * COALESCE(s.krds_score / 100, 0) + %s * (CASE WHEN s.renewal_year IS NULL THEN 0.3 WHEN s.renewal_year >= YEAR(CURDATE()) THEN 1 WHEN s.renewal_year = YEAR(CURDATE()) - 1 THEN 0.85 WHEN s.renewal_year = YEAR(CURDATE()) - 2 THEN 0.6 ELSE 0.35 END) + %s * s.wa_certified + %s * LEAST(1, LOG10(1 + s.view_count) / 4))', $W['rating'], $W['krds'], $W['recency'], $W['wa'], $W['views']);
        $kw = '0';
        $kwParams = []; $terms = [];
        // 키워드는 낱말로 나눠 맞춘다 — 문장 통째 LIKE 는 '여권 발급 안내'·'시청 메인' 같은 평범한 요청도 0건이었다(2026-09-29 실측).
        // 화면 유형을 말하는 낱말(메인·안내·목록·상세·페이지…)은 이미 screen_type 이 거르므로 빼고, 낱말당 점수를 나눠 준다.
        $terms = [];
        foreach (preg_split('/[\s,·\/]+/u', $keyword) ?: [] as $t) {
            $t = trim($t);
            if (mb_strlen($t) < 2 || preg_match('/^(메인|메인화면|화면|페이지|안내|목록|상세|게시판|홈|홈페이지|누리집|신청|정보)$/u', $t)) { continue; }
            $terms[] = mb_substr($t, 0, 20);
            if (count($terms) >= 4) { break; }
        }
        if ($terms) {
            $parts = [];
            $w = 1 / count($terms);
            foreach ($terms as $t) {
                $like = '%' . addcslashes($t, '%_\\') . '%';
                $parts[] = sprintf('(CASE WHEN sc.title LIKE ? THEN %1$.3f ELSE 0 END + CASE WHEN sc.ocr_text LIKE ? THEN %2$.3f ELSE 0 END + CASE WHEN s.title LIKE ? OR o.name LIKE ? THEN %3$.3f ELSE 0 END)', 0.3 * $w, 0.15 * $w, 0.1 * $w);
                array_push($kwParams, $like, $like, $like, $like);
            }
            $kw = '(' . implode(' + ', $parts) . ')';
        }
        $fetch = static fn (array $where, array $params): array => Db::rows("SELECT sc.id AS screen_id, sc.title AS screen_title, sc.full_h, sc.viewport_w, sc.captured_at, s.id AS site_id, s.slug, s.title AS site_title, s.url AS site_url,
                                 COALESCE(o.display_name, o.name) AS org_name, d.container_px, d.primary_hex, d.spacing,
                                 ($score + $kw) AS score, $kw AS kw
                          FROM screens sc JOIN sites s ON s.id = sc.site_id JOIN organizations o ON o.id = s.org_id JOIN org_types ot ON ot.id = o.org_type_id LEFT JOIN site_design d ON d.site_id = s.id
                          WHERE " . implode(' AND ', $where) . ' ORDER BY score DESC, sc.id', array_merge($kwParams, $kwParams, $params));
        // 기관 유형으로 좁혀 0건이면 상위 유형 → 전체로 넓힌다 — 게시 사이트가 아직 없는 유형(준정부기관·의료기관)이 오류로 끝나던 것 (2026-09-30 MCP 시험 q1)
        // 좁힌 결과가 8곳 미만이면 필수 섹션(제목·본문) 표본이 비어 빈 페이지가 된다 — 상위 유형·전체에서 보충하되 요청 유형 화면을 앞에 둔다 (q3 R29·R30·R34: 후보 2~4장)
        $rows = []; $seenRow = [];
        $add = static function (array $rs) use (&$rows, &$seenRow): void { foreach ($rs as $r) { if (!isset($seenRow[$r['screen_id']])) { $seenRow[$r['screen_id']] = true; $rows[] = $r; } } };
        $nSites = static function () use (&$rows): int { return count(array_unique(array_column($rows, 'site_id'))); };
        $MIN = 8;
        if ($orgs) {
            $parents = Db::rows('SELECT DISTINCT COALESCE(parent_id, id) AS p FROM org_types WHERE id IN (' . implode(',', array_fill(0, count($orgs), '?')) . ')', $orgs);
            $tries = [$orgs, array_values(array_unique(array_map(static fn ($r) => (string) $r['p'], $parents)))];
            foreach ($tries as $k => $set) {
                if ($k > 0 && $set === $orgs) { continue; }
                $before = $nSites();
                $p2 = implode(',', array_fill(0, count($set), '?'));
                $add($fetch([...$where, "(o.org_type_id IN ($p2) OR ot.parent_id IN ($p2))"], [...$params, ...$set, ...$set]));
                if ($k > 0 && $nSites() > $before) { $notes[] = sprintf("기관 유형 '%s' 화면이 %d곳뿐이라 상위 유형 '%s' 에서 보충했습니다(요청 유형 화면이 앞).", implode(',', $orgs), $before, implode(',', $set)); }
                if ($nSites() >= $MIN) { break; }
            }
        }
        if ($nSites() < $MIN) {
            $before = $nSites();
            $add($fetch($where, $params));
            if ($orgs && $nSites() > $before) { $notes[] = sprintf("기관 유형 '%s' 화면이 %d곳뿐이라 전체 기관에서 보충했습니다(요청 유형 화면이 앞).", implode(',', $orgs), $before); }
        }
        $screens = []; $bySite = [];
        foreach ($rows as $r) {
            if (isset($bySite[$r['site_id']])) { continue; }
            $bySite[$r['site_id']] = true;
            $screens[(int) $r['screen_id']] = $r;
            if (count($screens) >= 60) { break; }
        }
        // 제목에 키워드 낱말이 든 화면이 8개 이상이면 그 화면들로만 패턴을 낸다 — 무관한 화면이 섞이면 '여권 안내'의 본문 구성(표·절차)이 평균에 묻힌다
        if ($terms) {
            $hit = array_filter($screens, static fn (array $r): bool => (float) $r['kw'] >= 0.3 / count($terms) - 0.001);
            if (count($hit) >= 8) {
                $notes[] = sprintf("키워드 '%s' 가 제목에 든 화면 %d개로만 패턴을 냈습니다.", $keyword, count($hit));
                $screens = $hit;
            }
        }
        $n = count($screens);
        if ($n === 0) { throw new \DomainException('조건에 맞는 게시 화면이 없습니다. org_type 을 넓히세요.'); }
        if ($terms && (float) reset($screens)['kw'] === 0.0) { $notes[] = "키워드 '{$keyword}' 와 맞는 화면이 없어 가중 점수 순으로만 골랐습니다."; }

        // ② 섹션 수집 — 후보 화면의 섹션을 코드로 묶는다(매핑 없는 unknown·skip_nav 는 제외)
        $codeByType = self::codeByType();
        $ids = array_keys($screens);
        $p3 = implode(',', array_fill(0, count($ids), '?'));
        $secs = Db::rows("SELECT x.id, x.screen_id, x.section_type_id, x.variant, x.bbox_x, x.bbox_y, x.bbox_w, x.bbox_h, x.structure, COALESCE(x.confidence, 0) AS confidence
                          FROM sections x WHERE x.screen_id IN ($p3)
                          AND NOT EXISTS (SELECT 1 FROM removal_requests rr WHERE rr.status <> 'rejected' AND rr.target_type = 'section' AND rr.target_id = x.id)", $ids);
        $containers = []; $gutters = [];
        foreach ($screens as $s) {
            if ((int) $s['container_px'] > 0) { $containers[] = (int) $s['container_px']; }
            $sp = is_string($s['spacing']) ? (json_decode($s['spacing'], true) ?: []) : [];
            if (!empty($sp['gutter_px']) && (int) $sp['gutter_px'] > 0) { $gutters[] = (int) $sp['gutter_px']; }
        }
        $container = self::median($containers) ?? 1280;
        $gutter = self::median($gutters) ?? 24;
        $byCode = [];
        $unknownArea = 0.0; $totalArea = 0.0;
        foreach ($secs as $x) {
            $a = (float) $x['bbox_w'] * (float) $x['bbox_h'];
            $totalArea += $a;
            if ($x['section_type_id'] === 'unknown') { $unknownArea += $a; }
            $c = $codeByType[$x['section_type_id']] ?? null;
            if ($c === null) { continue; }
            $sc = $screens[(int) $x['screen_id']];
            $vw = max(1, (int) $sc['viewport_w']);
            $cont = (int) $sc['container_px'] > 0 ? (int) $sc['container_px'] : (int) $container;
            $off = max(0, ($vw - $cont) / 2);
            $w = (float) $x['bbox_w'];
            $relW = $w >= $vw * 0.95 ? 1.0 : min(1.0, $w / $cont);
            $relX = $relW >= 1.0 ? 0.0 : max(0.0, min(1.0, ((float) $x['bbox_x'] - $off) / $cont));
            $yr = (int) $sc['full_h'] > 0 ? min(1.0, (float) $x['bbox_y'] / (float) $sc['full_h']) : 0.0;
            $shape = SectionShape::structure($x['structure']);
            $items = isset($shape['items']) && is_numeric($shape['items']) && (int) $shape['items'] > 0 ? (int) $shape['items'] : null;
            $row = [
                'id' => (int) $x['id'], 'site_id' => (int) $sc['site_id'], 'screen_id' => (int) $x['screen_id'], 'section_type' => $x['section_type_id'],
                'area' => self::area($c['code'], $relX, $relW, $yr), 'cols' => self::cols($relW), 'items' => $items,
                'density' => self::density($items, (float) $x['bbox_h']), 'variant' => $x['variant'], 'y_ratio' => $yr,
                'score' => (float) $sc['score'], 'confidence' => (float) $x['confidence'], 'flags' => (array) ($shape['flags'] ?? []),
            ];
            $byCode[$c['code']][] = $row;
            // 워커가 공식 누리집 띠(masthead)를 헤더에 흡수하는 경우가 대부분(게시 화면 7,518 중 masthead 10) — 헤더 안에 공식 문구가 있으면
            // 그 헤더를 GOV_BANNER 근거로도 센다(q6: 34건 전부 "GOV_BANNER 슬롯 없음" 경고).
            if ($x['section_type_id'] === 'header' && is_string($x['structure']) && (str_contains($x['structure'], '공식 전자정부') || str_contains($x['structure'], '공식 누리집'))) {
                $byCode['GOV_BANNER'][] = ['area' => 'header', 'variant' => 'in_header'] + $row;
            }
        }

        // ③ 패턴 분석
        $patterns = [];
        foreach ($byCode as $code => $rs) { $patterns[$code] = self::patternSummary($code, $rs, $n); }
        $unknownPct = $totalArea > 0 ? (int) round($unknownArea / $totalArea * 100) : 0;
        if ($unknownPct >= 30) { $notes[] = "후보 화면 섹션 면적의 {$unknownPct}%가 미분류(unknown)입니다 — 본문 섹션 표본이 적어 명세가 얇을 수 있습니다(워커 분해 보강 대상, docs/11 §7-2)."; }

        // 본문 표본이 하나도 없으면(모바일 서브·표본 적은 기관 유형) 머리·푸터만 있는 빈 페이지가 된다 (q8 R35·R37: 모바일 상세·인사말이 제목만)
        // → 기관 유형을 풀고, 그래도 없으면 같은 화면 유형의 PC 화면에서 본문 구성을 빌린다(코드는 반응형이라 모바일 폭에서 1열로 접힌다)
        $frame = ['GOV_BANNER', 'UTIL_BAR', 'GNB', 'LNB', 'BREADCRUMB', 'PAGE_TITLE', 'FOOTER'];
        if (empty($q['sections']) && array_diff(array_keys($patterns), $frame) === []) {
            $lvl = (int) ($q['_widen'] ?? 0);
            $r = null;
            if ($lvl === 0 && $orgs) {
                $r = self::run(['org_type' => [], '_widen' => 1] + $q);
                array_unshift($r['notes'], sprintf("기관 유형 '%s' %s 화면에 본문 섹션 표본이 없어 전체 기관 화면으로 본문을 구성했습니다.", implode(',', $orgs), $device === 'mobile' ? '모바일' : 'PC'));
            } elseif ($lvl <= 1 && $device === 'mobile') {
                $r = self::run(['device' => 'pc', '_widen' => 2] + $q);
                array_unshift($r['notes'], '모바일 화면에 본문 섹션 표본이 없어 PC 화면의 본문 구성을 빌렸습니다(코드는 모바일 폭에서 1열로 접힙니다).');
            }
            if ($r !== null) { return $r; }
        }

        // 필요한 섹션 코드: 요청이 있으면 그대로, 없으면 채택률 50%+ (전역 계열은 30%+)
        $codes = self::codes();
        $want = array_values(array_filter(array_map(static fn ($v): string => strtoupper((string) $v), (array) ($q['sections'] ?? [])), static fn (string $v): bool => isset($codes[$v])));
        if ($want) {
            foreach ($want as $w0) { if (!isset($patterns[$w0])) { $notes[] = "{$w0} 는 후보 화면에 표본이 없어 넣지 못했습니다" . ($codes[$w0]['section_types'] === [] ? '(아직 수집하지 않는 코드)' : '') . '.'; } }
            $pick = array_values(array_filter($want, static fn (string $v): bool => isset($patterns[$v])));
        } else {
            $pick = [];
            foreach ($patterns as $code => $p) {
                $min = in_array($codes[$code]['group'], ['global'], true) ? 0.3 : 0.5;
                if ($p['adoption'] >= $min) { $pick[] = $code; }
            }
            // 화면 유형 필수 섹션(taxonomy screen_types.required) — 채택률이 낮아도 표본이 있으면 넣는다
            foreach ((array) ($st['required'] ?? []) as $rq) {
                if (in_array($rq, $pick, true)) { continue; }
                if (isset($patterns[$rq])) { $pick[] = $rq; $requiredAdded[$rq] = true; } else { $notes[] = "{$screenType} 필수 섹션 {$rq} 의 표본이 없어 넣지 못했습니다."; }
            }
        }
        // 본문 표본은 있는데 채택률이 낮아 하나도 안 뽑힌 경우 — 채택률 높은 본문 섹션 둘까지 넣는다(빈 페이지보다 낫다)
        if (!$want && array_diff($pick, $frame) === []) {
            // 기관 유형을 좁혀서 생긴 일이면 전체 기관에서 다시 — 기준을 넘는 본문(인사말 화면의 GREETING 등)이 나오면 그쪽을 쓴다
            if ($orgs && (int) ($q['_widen'] ?? 0) === 0) {
                try {
                    $r = self::run(['org_type' => [], '_widen' => 1] + $q);
                    if (array_diff(array_column($r['spec']['slots'] ?? [], 'section'), $frame) !== [] && !array_filter($r['notes'], static fn (string $x): bool => str_starts_with($x, '본문 섹션 채택률'))) {
                        array_unshift($r['notes'], sprintf("기관 유형 '%s' 화면에는 본문 섹션 표본이 부족해 전체 기관 화면으로 본문을 구성했습니다.", implode(',', $orgs)));
                        return $r;
                    }
                } catch (\Throwable) { /* 넓혀도 안 되면 아래 보충으로 */ }
            }
            // 서브 화면에는 서브용 섹션만(팝업존·배너 같은 메인용은 인사말 화면에 어울리지 않는다 — q8 R37)
            $body = array_values(array_filter(array_diff(array_keys($patterns), $frame), static fn (string $c): bool => $screenType === 'MAIN' || $codes[$c]['group'] === 'sub' || $c === 'GREETING'));
            usort($body, static fn (string $a, string $b): int => $patterns[$b]['adoption'] <=> $patterns[$a]['adoption']);
            foreach (array_slice($body, 0, 2) as $b0) { $pick[] = $b0; }
            if ($body) { $notes[] = '본문 섹션 채택률이 모두 기준 미만이라 가장 많이 쓰인 ' . implode('·', array_slice($body, 0, 2)) . ' 를 넣었습니다.'; }
        }
        $rank = static function (string $code) use ($patterns): float {
            if (in_array($code, self::HEADER_CODES, true)) { return -1 + array_search($code, self::HEADER_CODES, true) * 0.01; }
            if ($code === 'FOOTER') { return 2.0; }
            return (float) $patterns[$code]['avg_position'];
        };
        usort($pick, static fn (string $a, string $b): int => $rank($a) <=> $rank($b));
        if ($pick === []) { throw new \DomainException('채택률 기준을 넘는 섹션이 없습니다. sections 로 직접 지정하세요.'); }

        // ④ 컴포넌트 선택 — taxonomy 대표 컴포넌트 + 구조 플래그 최빈 + KRDS 기본 매핑
        $krdsMap = (array) ($tax['section_krds_default_map'] ?? []);
        $plan = []; $slotKrds = [];
        $flagComp = ['tablist' => 'Tabs', 'carousel' => 'Carousel', 'table' => 'DataTable', 'pagination' => 'Pagination', 'form' => 'FormField'];
        foreach ($pick as $code) {
            $rs = $byCode[$code];
            $comps = $codes[$code]['components'];
            $added = [];
            foreach ($flagComp as $flag => $comp) {
                $on = count(array_filter($rs, static fn (array $r): bool => !empty($r['flags'][$flag])));
                if ($on / count($rs) >= 0.5 && !in_array($comp, $comps, true)) { $comps[] = $comp; $added[] = "{$comp}(" . round($on / count($rs) * 100) . '%)'; }
            }
            $dom = self::mode(array_column($rs, 'section_type'))['mode'];
            $krds = array_values((array) ($krdsMap[$dom] ?? []));
            $plan[] = ['section' => $code, 'components' => $comps, 'krds_components' => $krds, 'basis' => '대표 컴포넌트(taxonomy)' . ($added ? ' + 표본 구조 ' . implode('·', $added) : '') . " · KRDS 기본 매핑({$dom})"];
            $slotKrds[] = $krds;
        }

        // ⑤ 슬롯 배치 — ref 는 점수 순 표본에서, 같은 기관 2개 이하(게이트가 한 번 더 확인)
        $siteOf = []; $alternates = [];
        foreach ($byCode as $code => $rs) {
            usort($rs, static fn (array $a, array $b): int => [$b['score'], $b['confidence']] <=> [$a['score'], $a['confidence']]);
            foreach ($rs as $r) { $siteOf[(string) $r['id']] = (string) $r['site_id']; }
            $alternates[$code] = array_values(array_unique(array_map(static fn (array $r): string => (string) $r['id'], $rs)));
        }
        $slots = []; $used = [];
        foreach ($plan as $i => $pl) {
            $code = $pl['section'];
            $pat = $patterns[$code];
            $ref = null;
            foreach ($alternates[$code] as $cand) { if (($used[$siteOf[$cand]] ?? 0) < self::MAX_PER_SITE) { $ref = $cand; break; } }
            $ref ??= $alternates[$code][0];
            $used[$siteOf[$ref]] = ($used[$siteOf[$ref]] ?? 0) + 1;
            $f = [];
            foreach ($pat['findings'] as $x) { $f[$x['key']] = $x; }
            $area = (string) ($f['area']['mode'] ?? 'center');
            // 칸·항목·밀도는 그 영역에 놓인 표본끼리만 센다 — 따로 세면 "오른쪽 배치인데 12칸" 같은 모순이 나온다
            $inArea = array_values(array_filter($byCode[$code], static fn (array $r): bool => $r['area'] === $area));
            foreach (['cols', 'items', 'density'] as $k) {
                $m = self::mode(array_column($inArea, $k));
                if ($m['mode'] === null) { unset($f[$k]); continue; }
                $f[$k] = ['key' => $k, 'mode' => $m['mode'], 'ratio' => $m['ratio']];
            }
            $cols = (int) ($f['cols']['mode'] ?? 12);
            $slot = ['area' => $area, 'section' => $code, 'section_type' => $byCode[$code][0]['section_type'], 'ref' => $ref, 'ref_site' => $siteOf[$ref], 'cols' => max(1, min(12, $cols))];
            foreach ($byCode[$code] as $r) { if ((string) $r['id'] === $ref) { $slot['section_type'] = $r['section_type']; } }
            if (isset($f['items'])) { $slot['items'] = (int) $f['items']['mode']; }
            if (isset($f['density'])) { $slot['density'] = (string) $f['density']['mode']; }
            $slot['components'] = $pl['components'];
            $why = (isset($requiredAdded[$code]) ? "{$screenType} 화면 유형 필수 섹션 · " : '') . sprintf('후보 화면 %d개 중 %d%% 사용(표본 %d개·기관 %d곳)', $n, (int) round($pat['adoption'] * 100), $pat['sample_size'], $pat['n_sites']);
            if (isset($f['area'])) { $why .= sprintf(' · %s 배치 %d%%', $area, (int) round($f['area']['ratio'] * 100)); }
            if (isset($f['cols'])) { $why .= sprintf(' · 그중 %d칸 %d%%', $cols, (int) round($f['cols']['ratio'] * 100)); }
            if (isset($f['items'])) { $why .= sprintf(' · 항목 %d개 최빈', (int) $f['items']['mode']); }
            $slot['rationale'] = $why;
            $slots[] = $slot;
        }

        // 테마 — 기본 KRDS, CUSTOM 은 고객 주색·글꼴
        $krdsVersion = (string) (Db::row('SELECT MAX(krds_version) AS v FROM krds_components')['v'] ?? '');
        $base = strtoupper((string) ($q['theme'] ?? 'KRDS')) === 'CUSTOM' ? 'CUSTOM' : 'KRDS';
        $primary = self::KRDS_PRIMARY; $font = self::KRDS_FONT;
        if ($base === 'CUSTOM') {
            if (!preg_match('/^#[0-9A-Fa-f]{6}$/', (string) ($q['primary'] ?? ''))) { throw new \InvalidArgumentException('theme=CUSTOM 이면 primary(#RRGGBB)가 필요합니다.'); }
            $primary = strtoupper((string) $q['primary']);
        }
        // 글꼴은 색과 따로 — '본고딕으로' 처럼 글꼴만 말해도 반영 (q3 R30: CUSTOM 이 아니라서 무시됐다)
        if (trim((string) ($q['font'] ?? '')) !== '') { $font = mb_substr(trim((string) $q['font']), 0, 60); }
        $theme = ['base' => $base, 'primary' => $primary, 'font' => $font];
        if ($krdsVersion !== '') { $theme['krds_version'] = $krdsVersion; }

        $spec = [
            'spec_version' => '1.0',
            'project' => mb_substr(trim((string) ($q['project'] ?? '')) ?: ($keyword !== '' ? (array_filter(preg_split('/[·\s]+/u', (string) $st['name_ko']) ?: [], static fn (string $w): bool => $w !== '' && mb_strpos($keyword, $w) !== false) ? $keyword : "{$keyword} {$st['name_ko']}") : $st['name_ko']), 0, 80),
            'screen_type' => $screenType,
            'grid' => ['container' => max((int) $container, ReplicaKit::MIN_W), 'columns' => 12, 'gutter' => (int) $gutter],
            'theme' => $theme,
            'slots' => $slots,
            'sources' => [],
        ];

        // ⑥ 품질 게이트
        $siteInfo = []; $primaries = [];
        $refSites = array_values(array_unique(array_values($siteOf)));
        $p4 = implode(',', array_fill(0, count($refSites), '?'));
        foreach (Db::rows("SELECT s.id, s.url, COALESCE(o.display_name, o.name) AS org, d.primary_hex, (SELECT MAX(sc.captured_at) FROM screens sc WHERE sc.site_id = s.id AND sc.status = 'published') AS cap
                           FROM sites s JOIN organizations o ON o.id = s.org_id LEFT JOIN site_design d ON d.site_id = s.id WHERE s.id IN ($p4)", $refSites) as $r) {
            $siteInfo[(string) $r['id']] = ['name' => (string) $r['org'], 'url' => (string) $r['url'], 'captured_at' => substr((string) $r['cap'], 0, 10)];
            if (!empty($r['primary_hex'])) { $primaries[(string) $r['id']] = (string) $r['primary_hex']; }
        }
        $known = array_fill_keys(array_column(Db::rows('SELECT id FROM krds_components'), 'id'), true);
        $g = self::gates($spec, ['site_of' => $siteOf, 'site_primaries' => $primaries, 'removed' => [], 'krds_known' => $known, 'slot_krds' => $slotKrds, 'site_info' => $siteInfo, 'alternates' => $alternates]);

        $conf = $n >= 30 ? 'high' : ($n >= 10 ? 'medium' : 'low');
        if ($conf === 'low') { $notes[] = "후보 화면 {$n}개 — 채택률·최빈값은 참고만 하세요(30개 이상부터 안정)."; }
        $cands = array_slice(array_values($screens), 0, 5);
        return [
            'spec' => $g['spec'],
            'patterns' => array_values(array_map(static fn (string $c): array => $patterns[$c], $pick)),
            'component_plan' => $plan,
            'candidates' => array_map(static fn (array $s): array => ['screen_id' => (string) $s['screen_id'], 'site' => (string) $s['slug'], 'title' => $s['screen_title'], 'score' => round((float) $s['score'], 3)], $cands),
            'quality' => $g['report'],
            'n_screens' => $n,
            'confidence' => $conf,
            'notes' => $notes,
        ];
    }

    /** @param list<int|float> $xs */
    private static function median(array $xs): ?float
    {
        if ($xs === []) { return null; }
        sort($xs);
        $m = intdiv(count($xs), 2);
        return count($xs) % 2 ? (float) $xs[$m] : ((float) $xs[$m - 1] + (float) $xs[$m]) / 2;
    }
}

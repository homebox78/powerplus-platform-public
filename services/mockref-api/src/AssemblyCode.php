<?php
declare(strict_types=1);

namespace Homebox;

/**
 * 조립 명세(Assembly Spec) → Vue·React 페이지 코드 + 부품 대응표 (사용자 확정 2026-09-29 "둘 다 제공")
 *   - 코드는 홈박스 키트(@homebox/kit, KRDS 기반) 부품으로만 만든다. 슬롯 순서·영역은 명세 그대로.
 *   - 글자는 가상 기관(SampleContent::persona) + 근거 섹션에서 읽은 메뉴·제목(실제 기관명·연락처는 가상 값으로 바꿈).
 *   - 부품 대응표(component_map)는 섹션 코드 → 키트 부품·import·props 를 적어, 클라이언트 AI가 고쳐 쓸 수 있게 한다.
 *   - React·Vue 는 같은 data 객체를 쓰고, 마크업은 키트 두 판이 같은 클래스를 내므로 화면이 같다.
 */
final class AssemblyCode
{
    /** 섹션 코드 → [키트 부품들, 쓰는 방법 한 줄]. 없는 코드는 BLOCK(제목 + 목록)으로 */
    private const MAP = [
        'GOV_BANNER' => [['Masthead'], '누리집 공식 배너. props 없음(문구는 KRDS 기본).'],
        'GNB' => [['Header', 'NavigationMenu'], 'Header(siteName·utilityLinks) 안에 NavigationMenu(items: {label, href}[]) 를 children 으로.'],
        'UTIL_BAR' => [['Header'], 'Header 의 utilityLinks 로 표현.'],
        'LNB' => [['SideNavigation'], 'SideNavigation(title, items: {label, href, current, children}[]).'],
        'BREADCRUMB' => [['Breadcrumb', 'BreadcrumbList', 'BreadcrumbItem', 'BreadcrumbLink', 'BreadcrumbPage'], '첫 항목 BreadcrumbItem home, 마지막은 BreadcrumbPage.'],
        'PAGE_TITLE' => [[], '본문 첫 h2. 부품 없음.'],
        'FOOTER' => [['Footer'], 'Footer(orgName, address, contacts, policyLinks, copyright).'],
        'RESULT_TABLE' => [['Table', 'TableCaption', 'TableHeader', 'TableBody', 'TableRow', 'TableHead', 'TableCell', 'Pagination'], '표 + Pagination(page, total). 헤더 가운데·제목 왼쪽·날짜 가운데.'],
        'INFO_TABLE' => [['Table', 'TableCaption', 'TableHeader', 'TableBody', 'TableRow', 'TableHead', 'TableCell'], '안내 표. caption 필수(접근성).'],
        'TASK_TABLE' => [['Table', 'TableCaption', 'TableHeader', 'TableBody', 'TableRow', 'TableHead', 'TableCell', 'Badge'], '업무 표 + 상태 Badge.'],
        'FAQ_LIST' => [['Accordion', 'AccordionItem', 'AccordionTrigger', 'AccordionContent'], 'Accordion type="single" collapsible — 질문마다 AccordionItem.'],
        'STEP_FLOW' => [['StepIndicator'], 'StepIndicator(steps: string[], current).'],
        'FORM_STEP' => [['StepIndicator', 'Button'], 'StepIndicator + 입력 부품(Field·Input 등)은 실제 항목에 맞게.'],
        'PROGRESS_STATUS' => [['StepIndicator'], 'StepIndicator 로 진행 상태.'],
        'NOTICE_LIST' => [['StructuredList', 'StructuredListItem'], 'StructuredListItem(title, href, meta: {label, value}[]).'],
        'NEWS_CARD' => [['Card', 'CardHeader', 'CardTitle', 'CardDescription'], '카드 격자(cols = 슬롯 cols 기준).'],
        'PHOTO_GALLERY' => [['Card', 'CardHeader', 'CardTitle'], '사진 카드 격자 — 이미지는 alt 필수.'],
        'KPI_SUMMARY' => [['Card', 'CardHeader', 'CardTitle', 'CardDescription'], '요약 카드(값 + 라벨).'],
        'QUICK_MENU' => [['Card', 'CardHeader', 'CardTitle'], '바로가기 카드 — 링크 카드.'],
        'POPUP_ZONE' => [['Carousel', 'CarouselContent', 'CarouselItem', 'CarouselControls'], '알림판 — Carousel(autoplay 5000) 안에 CarouselItem 마다 링크 + 이미지(alt 필수), CarouselControls(현재/전체·정지·이전·다음).'],
        'BANNER_ROLL' => [['Carousel', 'CarouselContent', 'CarouselItem', 'CarouselControls'], '배너 — 좁은 칸은 Carousel, 넓은 칸은 이미지 링크 격자(ul.hb-banners).'],
        'GREETING' => [['Card', 'CardContent'], '기관장 인사 — Card 안에 사진(img.hb-greet-photo) + 직함·이름·인사 + 링크 버튼(a.krds-btn).'],
        'HERO_VISUAL' => [['Button'], '제목·설명·Button. 배경 이미지는 고객 자산으로.'],
        'SATISFACTION' => [['Button'], '만족도 조사 — 실제로는 RadioGroup + Button.'],
        'BLOCK' => [['TextList', 'TextListItem'], '제목(h3) + TextList(type="bullet").'],
    ];

    /**
     * @param array<string,mixed> $spec  AssemblySpec
     * @param array<string,mixed> $opt   org_type(list) · keyword
     * @return array{react: array{file:string, source:string}, vue: array{file:string, source:string}, theme: array{file:string, source:string}, component_map: list<array<string,mixed>>, install: list<string>}
     */
    public static function build(array $spec, array $opt = []): array
    {
        $srcName = (string) ($spec['sources'][0]['name'] ?? '');
        $p = SampleContent::persona(((array) ($opt['org_type'] ?? []))[0] ?? null, $srcName);
        $p['real_all'] = array_values(array_filter(array_map(static fn (array $x): string => (string) ($x['name'] ?? ''), (array) ($spec['sources'] ?? []))));
        $refs = self::refStructures($spec['slots']);
        $title = self::pageTitle($spec, $refs, $p, (string) ($opt['keyword'] ?? ''));
        // 주 메뉴·LNB 제목·경로 상위를 한 곳에서 — 따로 정하면 주 메뉴엔 '뉴스·소식', 경로엔 '분야별 정보', LNB 엔 '안내' 가 나왔다 (2026-09-30 MCP 시험 q1 R02)
        // 요청 주제 낱말 — 목록·소식 제목 앞쪽에 싣는다('채용 공고 상세'인데 화면에 '채용'이 한 번도 없던 것, q1 R05·R07·R16)
        $p['topic'] = array_values(array_filter(preg_split('/[\s,·\/]+/u', (string) ($opt['keyword'] ?? '')) ?: [], static fn (string $t): bool => mb_strlen($t) >= 2 && !preg_match('/^(메인|메인화면|화면|페이지|안내|목록|상세|게시판|홈|홈페이지|누리집)$/u', $t)));
        [$p['gnb'], $p['section']] = self::menuOf($spec, $refs, $p, $title . ' ' . (string) ($opt['keyword'] ?? ''));

        $data = ['org' => $p['org'], 'title' => $title];
        $imports = []; $map = [];
        $pre = ['react' => [], 'vue' => []]; $side = ['react' => [], 'vue' => []]; $main = ['react' => [], 'vue' => []]; $post = ['react' => [], 'vue' => []];

        // 이미지 — 홈박스 샘플 라이브러리(가상 기관·글자 없는 실사/배너). 코드가 밖에서도 열리게 절대 주소로 싣는다
        Samples::context($p['org']);
        $usedImg = [];
        $origin = self::origin();
        $img = static function (string $type, int $n, array $tags = []) use (&$usedImg, $origin, $p): array {
            $out = [];
            // 다른 가상 기관 이름이 박힌 배너·팝업은 뺀다(한빛시 페이지에 '푸른구' 배너가 섞였다 — 2026-09-29 렌더). 기관명 없는 이미지·같은 기관만
            $pool = array_values(array_filter(
                Samples::find(Samples::FOR_SECTION[$type] ?? ['citizen', 'place'], $tags, 40, crc32($p['org'] . $type)),
                static fn (array $it): bool => ($o = Samples::orgOf($it)) === null || $o === $p['org']
            ));
            foreach ($pool as $it) {
                if (in_array($it['id'], $usedImg, true)) { continue; }
                $v = Samples::view($it);
                $usedImg[] = $it['id'];
                $out[] = ['id' => $it['id'], 'src' => $origin . $v['url'], 'alt' => (string) $v['alt'], 'ratio' => ((int) $v['w'] ?: 4) . ' / ' . ((int) $v['h'] ?: 3)];
                if (count($out) >= $n) { break; }
            }
            return $out;
        };

        // 본문 줄 나누기 — 명세의 칸 수(12칸 기준)대로 좁은 섹션을 한 줄에 나란히 둔다.
        //   메인 첫 화면은 [기관장 인사 | 알림판 | 배너] 처럼 좁은 칸이 나란한 구성이 주류인데(2026-09-29 캡처 대조),
        //   모두 전폭으로 쌓으면 그 구성이 사라지고 와이어프레임처럼 보였다. LNB 가 있는 서브 화면은 본문이 한 열이라 나누지 않는다.
        $bucketOf = static fn (array $s): string => match (true) {
            in_array((string) $s['section'], ['GOV_BANNER', 'GNB', 'UTIL_BAR'], true) => 'pre',
            $s['section'] === 'FOOTER' || $s['area'] === 'footer' => 'post',
            $s['section'] === 'LNB' => 'side',
            default => 'main',
        };
        $prioOf = static fn (array $s): int => ['BREADCRUMB' => 0, 'PAGE_TITLE' => 1][(string) $s['section']] ?? 2;
        $mainIdx = [];
        foreach ($spec['slots'] as $i => $s) { if ($bucketOf($s) === 'main') { $mainIdx[] = $i; } }
        usort($mainIdx, static fn (int $a, int $b): int => [$prioOf($spec['slots'][$a]), $a] <=> [$prioOf($spec['slots'][$b]), $b]);
        $hasLnb = in_array('LNB', array_column($spec['slots'], 'section'), true);
        $rows = $hasLnb ? array_map(static fn (int $i): array => [$i], $mainIdx) : self::packRows($mainIdx, $spec['slots']);
        $cellOf = [];
        foreach ($rows as $row) {
            $sum = array_sum(array_map(static fn (int $i): int => self::colsOf($spec['slots'][$i]), $row));
            foreach ($row as $i) { $cellOf[$i] = count($row) === 1 ? 12 : max(1, (int) round(12 * self::colsOf($spec['slots'][$i]) / max(1, $sum))); }
        }
        $mainOut = []; $seenTitle = [];

        foreach ($spec['slots'] as $i => $s) {
            $code = (string) $s['section'];
            $key = 's' . $i;
            $st = $refs[(int) $s['ref']] ?? [];
            [$d, $r, $v] = self::slot($code, $key, $s, $st, $p, $title, $cellOf[$i] ?? 12, $img);
            // 블록 제목이 페이지 제목·앞 블록 제목과 같으면 한 화면에 같은 제목이 두 번 (2026-09-30 MCP 시험 q2 R10 '조직도'·R12 '투어 예약')
            if (is_array($d) && isset($d['title']) && is_string($d['title']) && !in_array($code, ['LNB', 'GNB', 'UTIL_BAR', 'BREADCRUMB', 'PAGE_TITLE'], true)) {
                if ($d['title'] === $title || isset($seenTitle[$d['title']])) {
                    $alt = ['ORG_CHART' => '부서별 업무', 'FORM' => '신청서 작성', 'TABLE' => '세부 내용', 'INFO_TABLE' => '세부 내용', 'STEP_FLOW' => '진행 절차', 'CONTACT_BOX' => '문의처', 'FAQ' => '자주 묻는 질문'][$code] ?? '상세 안내';
                    foreach ([$alt, '상세 안내', '추가 안내', '참고 사항', '관련 정보'] as $cand) { if (!isset($seenTitle[$cand]) && $cand !== $title) { $d['title'] = $cand; break; } }
                }
                $seenTitle[$d['title']] = true;
            }
            if ($d !== null) { $data[$key] = $d; }
            $m = self::MAP[$code] ?? self::MAP['BLOCK'];
            // 실제로 만든 마크업에 쓰인 부품만 (이미지가 없어 대체 마크업으로 가도 import 가 맞게)
            preg_match_all('/<([A-Z][A-Za-z]+)/', $r, $mm);
            $parts = array_values(array_unique($mm[1]));
            foreach ($parts as $c) { $imports[$c] = true; }
            $map[] = [
                'section' => $code, 'area' => $s['area'], 'ref' => (string) $s['ref'],
                'kit' => $parts,
                'react' => $parts ? 'import { ' . implode(', ', $parts) . ' } from "@homebox/kit/react";' : null,
                'vue' => $parts ? 'import { ' . implode(', ', $parts) . ' } from "@homebox/kit/vue";' : null,
                'props' => $d === null ? null : "data.{$key}",
                'usage' => $m[1],
                'spec_components' => $s['components'] ?? [],
            ];
            // 옆 칸(260px)은 서브 LNB 자리 — 메인의 왼쪽·오른쪽 칸 섹션(새소식 등)은 본문 줄 안에 둔다
            $bucket = $bucketOf($s);
            if ($bucket === 'main') { $mainOut[$i] = ['react' => $r, 'vue' => $v]; continue; }
            ${$bucket}['react'][] = [$i, $r];
            ${$bucket}['vue'][] = [$i, $v];
        }
        foreach (['pre', 'side', 'post'] as $b) {
            foreach (['react', 'vue'] as $f) { ${$b}[$f] = array_column(${$b}[$f], 1); }
        }
        // 본문: 줄마다 한 칸이면 그대로, 여러 칸이면 칸 비율대로 격자 한 줄
        $ind = static fn (string $x, string $in): string => preg_replace('/^/m', $in, $x) ?? $x;
        foreach ($rows as $row) {
            if (count($row) === 1) {
                foreach (['react', 'vue'] as $f) { $main[$f][] = $mainOut[$row[0]][$f]; }
                continue;
            }
            $tpl = implode(' ', array_map(static fn (int $i): string => self::colsOf($spec['slots'][$i]) . 'fr', $row));
            $cells = static fn (string $f, string $cls): string => implode("\n", array_map(static fn (int $i): string => "  <div {$cls}=\"hb-cell\">\n" . $ind($mainOut[$i][$f], '    ') . "\n  </div>", $row));
            $main['react'][] = "<div className=\"hb-row\" style={{ gridTemplateColumns: \"{$tpl}\" }}>\n" . $cells('react', 'className') . "\n</div>";
            $main['vue'][] = "<div class=\"hb-row\" style=\"grid-template-columns: {$tpl}\">\n" . $cells('vue', 'class') . "\n</div>";
        }
        Samples::remember($usedImg);
        $comps = array_keys($imports);
        sort($comps);

        // JSON 들여쓰기 4칸 → 2칸 (프런트 관례)
        $json = preg_replace_callback('/^( +)/m', static fn (array $m): string => str_repeat(' ', intdiv(strlen($m[1]), 2)), (string) json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
        $container = (int) ($spec['grid']['container'] ?? 1200);

        $layout = static function (array $pre, array $side, array $main, array $post, string $cls, string $indent): string {
            $j = static fn (array $xs, string $in): string => implode("\n", array_map(static fn (string $x): string => preg_replace('/^/m', $in, $x) ?? $x, $xs));
            $body = $side
                ? "{$indent}<div {$cls}=\"hb-page-body\">\n{$j($side, $indent . '  ')}\n{$indent}  <main id=\"main\" {$cls}=\"hb-page-main\">\n{$j($main, $indent . '    ')}\n{$indent}  </main>\n{$indent}</div>"
                : "{$indent}<main id=\"main\" {$cls}=\"hb-page-main\">\n{$j($main, $indent . '  ')}\n{$indent}</main>";
            return implode("\n", array_filter([$j($pre, $indent), $body, $j($post, $indent)], static fn (string $x): bool => trim($x) !== ''));
        };

        $react = "// {$spec['project']} — 홈박스 조립 명세(spec {$spec['spec_version']})에서 만든 페이지 (React)\n"
            . "// 근거: 슬롯마다 ref(원본 section_id) · 조립 근거는 응답의 spec.slots[].rationale\n"
            . "// 준비: kit.css → theme.css 순으로 불러오고, 부품을 감싸는 요소에 hb-kit 클래스(아래 최상위 div).\n"
            . "import { " . implode(', ', $comps) . " } from \"@homebox/kit/react\";\n\n"
            . "const data = {$json} as const;\n\n"
            . "export default function Page() {\n  return (\n    <div className=\"hb-kit hb-page\">\n"
            . "      <a className=\"hb-skip\" href=\"#main\">본문 바로가기</a>\n"
            . $layout($pre['react'], $side['react'], $main['react'], $post['react'], 'className', '      ') . "\n    </div>\n  );\n}\n";

        $vueSrc = "<!-- {$spec['project']} — 홈박스 조립 명세(spec {$spec['spec_version']})에서 만든 페이지 (Vue 3) -->\n"
            . "<!-- 준비: kit.css → theme.css 순으로 불러오고, 부품을 감싸는 요소에 hb-kit 클래스(아래 최상위 div). -->\n"
            . "<script setup lang=\"ts\">\nimport { " . implode(', ', $comps) . " } from \"@homebox/kit/vue\";\n\n"
            . "const data = {$json} as const;\n</script>\n\n"
            . "<template>\n  <div class=\"hb-kit hb-page\">\n"
            . "    <a class=\"hb-skip\" href=\"#main\">본문 바로가기</a>\n"
            . $layout($pre['vue'], $side['vue'], $main['vue'], $post['vue'], 'class', '    ') . "\n  </div>\n</template>\n";

        return [
            'react' => ['file' => 'Page.tsx', 'source' => $react],
            'vue' => ['file' => 'Page.vue', 'source' => $vueSrc],
            'theme' => ['file' => 'theme.css', 'source' => self::themeCss($spec['theme'] ?? [], $container)],
            'component_map' => $map,
            'install' => [
                '키트 받기: 홈박스 /kit 에서 zip(React·Vue 공용) — kit.css · theme.css · icons/ · fonts/ · react/ · vue/.',
                'CSS 순서: kit.css → theme.css. theme.css 한 파일만 바꾸면 색·글꼴·모서리가 바뀝니다.',
                'React: radix-ui, Vue: reka-ui 가 필요합니다. import 경로 "@homebox/kit/react|vue" 는 받은 폴더 위치에 맞게 바꾸세요.',
                '글·이름·연락처는 가상 값입니다(실제 기관 복제 방지). 실제 내용으로 바꿔 쓰세요.',
            ],
        ];
    }

    private static function colsOf(array $s): int
    {
        return max(1, min(12, (int) ($s['cols'] ?? 12)));
    }

    /**
     * 좁은 섹션(8칸 이하)을 합이 12칸이 되도록 한 줄에 모은다. 줄이 덜 찼는데(8칸 미만) 전폭 섹션이 끼면 그 전폭 섹션은
     * 줄이 닫힐 때까지 미룬다(최대 2개) — 인사말(4)·바로가기(12)·알림판(3) 순서라도 첫 줄이 [인사말|알림판] 이 되게.
     * 경로·제목·비주얼은 항상 한 줄 전체. 같은 줄 안에서는 왼쪽 → 가운데 → 오른쪽.
     * @param list<int> $idx @param list<array<string,mixed>> $slots @return list<list<int>>
     */
    private static function packRows(array $idx, array $slots): array
    {
        $narrow = static fn (int $i): bool => self::colsOf($slots[$i]) <= 8 && !in_array($slots[$i]['section'], ['BREADCRUMB', 'PAGE_TITLE', 'HERO_VISUAL'], true);
        $rank = ['left' => 0, 'top' => 1, 'center' => 1, 'bottom' => 1, 'right' => 2];
        $rows = []; $cur = []; $sum = 0; $defer = [];
        $close = static function () use (&$rows, &$cur, &$sum, &$defer, $slots, $rank): void {
            if ($cur) {
                usort($cur, static fn (int $a, int $b): int => [$rank[$slots[$a]['area']] ?? 1, $a] <=> [$rank[$slots[$b]['area']] ?? 1, $b]);
                $rows[] = $cur;
            }
            foreach ($defer as $d) { $rows[] = [$d]; }
            $cur = []; $sum = 0; $defer = [];
        };
        foreach ($idx as $i) {
            if (!$narrow($i)) {
                if ($cur && $sum < 8 && count($defer) < 2) { $defer[] = $i; continue; }
                $close();
                $rows[] = [$i];
                continue;
            }
            if ($sum + self::colsOf($slots[$i]) > 12) { $close(); }
            $cur[] = $i;
            $sum += self::colsOf($slots[$i]);
            if ($sum >= 12) { $close(); }
        }
        $close();
        return $rows;
    }

    /** 이 응답을 받은 쪽에서 열리는 절대 주소의 앞부분 (프록시 뒤면 X-Forwarded-*) */
    private static function origin(): string
    {
        $host = (string) ($_SERVER['HTTP_X_FORWARDED_HOST'] ?? $_SERVER['HTTP_HOST'] ?? '');
        if ($host === '' || preg_match('/^[A-Za-z0-9.\-:\[\]]+$/', $host) !== 1) { return ''; }
        $https = ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https' || (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || str_ends_with($host, 'hom2box.com');
        return ($https ? 'https://' : 'http://') . $host;
    }

    /** @param list<array<string,mixed>> $slots @return array<int,array<string,mixed>> */
    private static function refStructures(array $slots): array
    {
        $ids = array_values(array_unique(array_filter(array_map(static fn (array $s): int => (int) $s['ref'], $slots))));
        if ($ids === []) { return []; }
        $out = [];
        foreach (Db::rows('SELECT id, structure FROM sections WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')', $ids) as $r) {
            $st = is_string($r['structure']) ? json_decode($r['structure'], true) : $r['structure'];
            $out[(int) $r['id']] = is_array($st) ? $st : [];
        }
        return $out;
    }

    /** 근거 섹션 글자 → 가상 기관으로 바꾼 짧은 이름 목록 */
    private static function labels(array $st, array $p, int $max, int $maxLen = 14): array
    {
        $src = array_merge((array) ($st['links']['labels'] ?? []), (array) ($st['headings'] ?? []));
        $out = [];
        foreach ($src as $t) {
            $t = trim(preg_replace('/\s+/u', ' ', strip_tags((string) $t)) ?? '');
            if ($t === '' || mb_strlen($t) > $maxLen || preg_match('/바로가기|더보기|닫기|열기|이전|다음|로그인|로그아웃|회원가입|english|메뉴|검색|사이트맵|전자민원|본인인증|통합예약|마이페이지|글자 ?크기|인쇄|공유|즐겨찾기|모바일|누리집 안내|원격지원/iu', $t)) { continue; }
            // 기관·시설 이름(서구청·보건소·○○회관·○○의회)은 메뉴가 아니라 관련 사이트 목록 — 실제 이름이 새므로 버린다
            if (preg_match('/(청|의회|회관|보건소|센터|재단|공단|공사|도서관|진흥원|박물관|미술관|기념관|문화원|체육관|수련원|학습관|복지관|[시군구도])$/u', $t) || preg_match('/' . self::PLACES . '/u', $t)) { continue; }
            // 상위 부처 이름('보건복지부'·'국가보훈처') — 소속기관 헤더의 모기관 링크, 실제 이름이 샌다 (q2 R10)
            if (mb_strlen($t) >= 4 && preg_match('/(부|처)$/u', $t) && !preg_match('/(본부|지부|총괄부)$/u', $t)) { continue; }
            // 헤더에 같이 잡히는 날씨·기온('30°')·언어 선택('LANGUAGE')·지역구 이름('중구소개') — 메뉴 아님 (2026-09-29 상세 렌더)
            if (preg_match('/[°℃]|\d/u', $t) || preg_match('/^[A-Za-z\s.&-]+$/u', $t) || preg_match('/^(중|동|서|남|북|수성|달서|유성|대덕|해운대|사하|연제)구/u', $t)) { continue; }
            $t = self::scrub($t, $p);
            // 레퍼런스가 시청인데 가상 기관이 군·구면 '시정소식·시민참여' 가 그대로 남는다 (2026-10-12 MCP 예시 시험)
            if (preg_match('/(군|구)$/u', (string) ($p['org'] ?? ''), $om)) { $t = str_replace(['시정', '시민'], [$om[1] . '정', $om[1] . '민'], $t); }
            foreach ((array) ($p['real_all'] ?? []) as $r) {
                $stem = preg_replace('/(특별자치도|특별자치시|광역시|특별시|청|부|처|시|군|구|도|위원회|공단|공사|진흥원|원)$/u', '', (string) $r) ?? '';
                if (mb_strlen($stem) >= 2 && str_contains($t, $stem)) { continue 2; }
            }
            if (!in_array($t, $out, true)) { $out[] = $t; }
            if (count($out) >= $max) { break; }
        }
        return $out;
    }

    /**
     * 섹션 이름·제목용 — 가상 기관으로 바꾼 뒤에도 실제 지명·기관명·간행물 이름이 남아 있으면 버린다(null).
     * 근거 사이트 이름뿐 아니라 광역·기초 지명 목록으로도 본다: '의성메아리'·'소통하는 충주' 가 새던 것(2026-09-29 캡처).
     */
    /** 주격 조사 — 끝 글자에 받침이 있으면 '이', 없으면 '가' */
    private static function iga(string $w): string
    {
        $c = mb_substr($w, -1);
        $u = mb_ord($c);
        return $u >= 0xAC00 && $u <= 0xD7A3 && ($u - 0xAC00) % 28 !== 0 ? '이' : '가';
    }

    private static function clean(string $t, array $p): ?string
    {
        $t = trim(preg_replace('/^[#\s]+/u', '', self::scrub($t, $p)) ?? '');
        if ($t === '' || preg_match('/\d{4}\s?년.*(월호|호)$|메아리|소식지|신문/u', $t)) { return null; }
        // 마크업 설명 잔재('sns 영역'·'배너 영역'·'contents')는 사람이 붙인 제목이 아니다 (q3 R19)
        if (preg_match('/영역$|^[a-z][a-z0-9 _-]*$|area|section|wrap|box$/iu', $t) || preg_match('/^[a-z]+ /u', $t)) { return null; }
        // 제목 옆 '더보기'·'전체보기' 버튼 글이 붙어 온 것 — 떼어 낸다 ('공지사항 더보기', q4 R19)
        $t = trim((string) preg_replace('/\s*(더\s?보기|전체\s?보기|more|\+)$/iu', '', $t));
        if ($t === '') { return null; }
        foreach ((array) ($p['real_all'] ?? []) as $r) {
            $stem = preg_replace('/(특별자치도|특별자치시|광역시|특별시|청|부|처|시|군|구|도|위원회|공단|공사|진흥원|원)$/u', '', (string) $r) ?? '';
            if (mb_strlen($stem) >= 2 && str_contains($t, $stem)) { return null; }
        }
        if (preg_match('/' . self::PLACES . '/u', $t)) { return null; }
        // 다른 기관 종류 낱말이 든 이름('공단소개'·'구청장실')은 가상 기관과 어긋난다 — 가상 기관 이름에 그 낱말이 없으면 버린다 (q9 R37 교육청 화면에 '공단소개')
        if (preg_match('/(공단|공사|재단|진흥원|연구원|구청|시청|군청|도청|교육청|의회|위원회|병원|박물관|도서관|대학(?!생)|학교)/u', $t, $m) && !str_contains((string) ($p['org'] ?? ''), $m[1])) { return null; }
        return $t;
    }

    /** 실제 지명(광역 17 + 흔한 기초 이름) — 섹션 이름에 남으면 레퍼런스 복제 표시가 된다 */
    public const PLACES = '서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|수원|성남|고양|용인|청주|천안|전주|포항|창원|김해|안산|안양|의성|충주|제천|원주|춘천|강릉|여수|순천|목포|군산|익산|경주|구미|안동|진주|통영|거제|양산|김천|상주|문경|영주|영천|경산|칠곡|예천|봉화|울진|영덕|청송|영양|고령|성주|의령|함안|창녕|밀양|남해|하동|산청|함양|거창|합천|부천|화성|평택|시흥|파주|의정부|김포|광명|군포|하남|오산|이천|안성|의왕|양평|여주|과천|구리|남양주|포천|동두천|가평|연천|속초|삼척|태백|정선|평창|영월|횡성|홍천|화천|양구|인제|고성|양양|보령|아산|서산|논산|계룡|당진|금산|부여|서천|청양|홍성|예산|태안|공주|음성|진천|괴산|증평|보은|옥천|영동|단양|정읍|남원|김제|완주|진안|무주|장수|임실|순창|고창|부안|나주|광양|담양|곡성|구례|고흥|보성|화순|장흥|강진|해남|영암|무안|함평|영광|장성|완도|진도|신안|서귀포|종로|강남|송파|마포|노원|은평|관악|동작|서초';

    private static function scrub(string $t, array $p): string
    {
        return html_entity_decode(strip_tags(SampleContent::scrubReal('<x>' . htmlspecialchars($t, ENT_QUOTES) . '</x>', $p)), ENT_QUOTES);
    }

    /**
     * 주 메뉴와 이 페이지가 속한 메뉴 — 페이지 이름·요청 낱말로 분야를 정하고, 주 메뉴에서 그 분야 항목을 고른다(없으면 끝 항목을 그 분야로).
     * @return array{0: list<string>, 1: string}
     */
    private static function menuOf(array $spec, array $refs, array $p, string $hint): array
    {
        $menu = [];
        foreach ($spec['slots'] as $s) {
            if (in_array($s['section'], ['GNB', 'UTIL_BAR'], true)) { $menu = self::labels($refs[(int) $s['ref']] ?? [], $p, 6, 10); if (count($menu) >= 3) { break; } }
        }
        if (count($menu) < 3) { $menu = ['알림·소식', '민원·참여', '정보공개', '분야별 정보', '기관 소개']; }
        $groups = [
            ['/보도|공지|공고|고시|채용|입찰|소식|뉴스|갤러리|사진|영상|행사|일정/u', '/소식|뉴스|알림|홍보/u', '알림·소식'],
            ['/민원|신청|예약|질문|FAQ|상담|서식|접수|제안|참여/u', '/민원|참여|소통|서비스/u', '민원·참여'],
            ['/인사말|조직|연혁|비전|찾아오시는|오시는 길|상징|기관장|의장|교육감|시장|구청장|군수|장관/u', '/소개|기관|열린|의회 ?안내/u', '기관 소개'],
            ['/정보공개|개인정보|사전공개|공공데이터|예산|통계/u', '/공개|정보/u', '정보공개'],
        ];
        $section = '분야별 정보';
        foreach ($groups as [$page, $gnb, $def]) {
            if (!preg_match($page, $hint)) { continue; }
            $section = $def;
            foreach ($menu as $m) { if (preg_match($gnb, $m)) { $section = $m; break; } }
            break;
        }
        if ($section === '분야별 정보') { foreach ($menu as $m) { if (preg_match('/분야|정책|사업|업무/u', $m)) { $section = $m; break; } } }
        if (!in_array($section, $menu, true)) { if (count($menu) < 6) { $menu[] = $section; } else { $menu[count($menu) - 1] = $section; } }
        return [$menu, $section];
    }

    private static function pageTitle(array $spec, array $refs, array $p, string $keyword): string
    {
        foreach ($spec['slots'] as $s) {
            if ($s['section'] === 'PAGE_TITLE') {
                $st = $refs[(int) $s['ref']] ?? [];
                $t = trim((string) ($st['name'] ?? $st['title'] ?? ''));
                $t = $t !== '' && mb_strlen($t) <= 24 ? self::clean($t, $p) : null;
                // 레퍼런스 제목에 요청 낱말이 하나도 없으면 요청을 제목으로 (q1 R08 '인사말' 요청에 다른 제목이 나오던 것)
                $want = array_values(array_filter(preg_split('/[\s,·\/]+/u', $keyword) ?: [], static fn (string $w): bool => mb_strlen($w) >= 2));
                if ($t !== null && $want && $spec['screen_type'] !== 'MAIN' && mb_strlen($keyword) <= 16) {
                    $hit = false;
                    foreach ($want as $w) { if (str_contains($t, $w)) { $hit = true; break; } }
                    if (!$hit) { return $keyword; }
                }
                if ($t !== null) { return $t; }
            }
        }
        return $keyword !== '' ? $keyword . ' 안내' : ($spec['screen_type'] === 'MAIN' ? $p['org'] : '업무 안내');
    }

    /** @return array{0: array<string,mixed>|list<mixed>|null, 1: string, 2: string} [data, React JSX, Vue template] */
    private static function slot(string $code, string $k, array $s, array $st, array $p, string $title, int $cell, callable $img): array
    {
        // 칸 폭(12칸 기준)에 맞춘 안쪽 격자 열 수 — 좁은 칸에 4열 카드를 넣으면 글자가 세로로 뭉개진다
        $gcols = static fn (int $n, int $max = 4): int => max(1, min($n, $cell >= 9 ? $max : ($cell >= 6 ? 2 : 1)));
        $name = trim((string) ($st['name'] ?? $st['title'] ?? ''));
        // 숫자·기호뿐인 이름('29'·'1 / 3')은 날짜·쪽수가 제목으로 잡힌 것 (q3 R27)
        $name = $name !== '' && mb_strlen($name) <= 30 && preg_match('/[가-힣]{2,}|[A-Za-z]{3,}/u', $name) ? self::clean($name, $p) : null;
        $items = max(3, min(8, (int) ($s['items'] ?? 4)));
        $h = static fn (string $x): string => htmlspecialchars($x, ENT_QUOTES);
        $d = "data.{$k}";
        switch ($code) {
            case 'GOV_BANNER':
                return [null, '<Masthead />', '<Masthead />'];
            case 'GNB':
            case 'UTIL_BAR':
                $menu = (array) ($p['gnb'] ?? []); // menuOf — LNB 제목·경로 상위와 같은 원천
                $data = ['utilityLinks' => [['label' => '로그인', 'href' => '#'], ['label' => '사이트맵', 'href' => '#']], 'menu' => array_map(static fn (string $m): array => ['label' => $m, 'href' => '#'], $menu)];
                return [$data,
                    "<Header siteName={data.org} utilityLinks={[...{$d}.utilityLinks]}>\n  <NavigationMenu items={[...{$d}.menu]} />\n</Header>",
                    "<Header :site-name=\"data.org\" :utility-links=\"[...{$d}.utilityLinks]\">\n  <NavigationMenu :items=\"[...{$d}.menu]\" />\n</Header>"];
            case 'LNB':
                $menu = self::labels($st, $p, 6, 16);
                if (count($menu) < 3) { $menu = ['사업 개요', '신청 안내', '자주 묻는 질문', '담당자 안내']; }
                // 현재 항목 = 이 페이지 — LNB 에 페이지 이름이 없으면 맨 앞에 넣는다(제목 '보도자료' 인데 활성 항목이 다른 이름이던 것)
                $menu = array_values(array_filter($menu, static fn (string $m): bool => $m !== ($p['section'] ?? '')));
                if (!in_array($title, $menu, true)) { array_unshift($menu, $title); $menu = array_slice($menu, 0, 6); }
                $items = array_map(static fn (string $m): array => ['label' => $m, 'href' => '#'] + ($m === $title ? ['current' => true] : []), $menu);
                return [['title' => (string) ($p['section'] ?? ($menu[0] === $title ? '안내' : $title)), 'items' => $items],
                    "<SideNavigation title={{$d}.title} items={[...{$d}.items]} />",
                    "<SideNavigation :title=\"{$d}.title\" :items=\"[...{$d}.items]\" />"];
            case 'BREADCRUMB':
                return [['parent' => (string) ($p['section'] ?? '분야별 정보')],
                    "<Breadcrumb>\n  <BreadcrumbList>\n    <BreadcrumbItem home><BreadcrumbLink href=\"/\">홈</BreadcrumbLink></BreadcrumbItem>\n    <BreadcrumbItem><BreadcrumbLink href=\"#\">{{$d}.parent}</BreadcrumbLink></BreadcrumbItem>\n    <BreadcrumbItem><BreadcrumbPage>{data.title}</BreadcrumbPage></BreadcrumbItem>\n  </BreadcrumbList>\n</Breadcrumb>",
                    "<Breadcrumb>\n  <BreadcrumbList>\n    <BreadcrumbItem home><BreadcrumbLink href=\"/\">홈</BreadcrumbLink></BreadcrumbItem>\n    <BreadcrumbItem><BreadcrumbLink href=\"#\">{{ {$d}.parent }}</BreadcrumbLink></BreadcrumbItem>\n    <BreadcrumbItem><BreadcrumbPage>{{ data.title }}</BreadcrumbPage></BreadcrumbItem>\n  </BreadcrumbList>\n</Breadcrumb>"];
            case 'PAGE_TITLE':
                return [null, "<h2 className=\"hb-page-title\">{data.title}</h2>", "<h2 class=\"hb-page-title\">{{ data.title }}</h2>"];
            case 'FOOTER':
                return [[
                    'address' => $p['address'], 'contacts' => [['label' => '대표전화 ' . $p['phone']], ['label' => '팩스 ' . $p['fax']]],
                    'policyLinks' => [['label' => '개인정보처리방침', 'href' => '#', 'point' => true], ['label' => '저작권 정책', 'href' => '#'], ['label' => '찾아오시는 길', 'href' => '#']],
                    'copyright' => '© ' . $p['org'] . '. All rights reserved.',
                ],
                    "<Footer orgName={data.org} address={{$d}.address} contacts={[...{$d}.contacts]} policyLinks={[...{$d}.policyLinks]} copyright={{$d}.copyright} />",
                    "<Footer :org-name=\"data.org\" :address=\"{$d}.address\" :contacts=\"[...{$d}.contacts]\" :policy-links=\"[...{$d}.policyLinks]\" :copyright=\"{$d}.copyright\" />"];
            case 'RESULT_TABLE':
            case 'TASK_TABLE':
            case 'INFO_TABLE':
                $board = $code !== 'INFO_TABLE';
                $kw = array_values(array_unique(array_merge((array) ($p['topic'] ?? []), array_keys(SampleContent::BASIS['board']['keywords']))));
                $rows = [];
                for ($n = 0; $n < $items; $n++) {
                    $rows[] = $board
                        ? ['no' => (string) (120 - $n), 'title' => sprintf('2026년 %s %s', ['하반기', '상반기', '9월', '10월'][$n % 4], $kw[$n % count($kw)] === '안내' ? '주요 사업 안내' : $kw[$n % count($kw)] . ' 안내'), 'dept' => ['총무과', '민원과', '정책과'][$n % 3], 'date' => sprintf('2026.09.%02d', 28 - $n)]
                        : ['no' => (string) ($n + 1), 'title' => ['신청 대상', '신청 기간', '제출 서류', '처리 기간', '수수료', '문의처'][$n % 6], 'dept' => ['만 19세 이상 ' . $p['resident'], '연중 수시', '신청서 1부, 신분증 사본', '접수일로부터 7일', '없음', $p['office'] . ' ' . $p['phone']][$n % 6], 'date' => ''];
                }
                $head = $board ? ['번호', '제목', '담당 부서', '등록일'] : ['구분', '내용'];
                $cap = ($name ?? ($board ? '게시물' : $title)) . ($board ? ' 목록 — 번호, 제목, 담당 부서, 등록일' : ' — 구분, 내용');
                $data = ['caption' => $cap, 'rows' => $rows, 'page' => 1, 'total' => 12];
                $rH = $board
                    ? "{row.no}</TableCell><TableCell>{row.title}</TableCell><TableCell align=\"center\">{row.dept}</TableCell><TableCell align=\"center\">{row.date}"
                    : "{row.title}</TableCell><TableCell>{row.dept}";
                $vH = $board
                    ? "{{ row.no }}</TableCell><TableCell>{{ row.title }}</TableCell><TableCell align=\"center\">{{ row.dept }}</TableCell><TableCell align=\"center\">{{ row.date }}"
                    : "{{ row.title }}</TableCell><TableCell>{{ row.dept }}";
                $th = implode('', array_map(static fn (string $x): string => "<TableHead>{$x}</TableHead>", $head));
                $sec = $name ? "  <h3 className=\"hb-section-title\">{$h($name)}</h3>\n" : '';
                $secV = $name ? "  <h3 class=\"hb-section-title\">{$h($name)}</h3>\n" : '';
                $pg = $board ? "\n  <Pagination page={{$d}.page} total={{$d}.total} />" : '';
                $pgV = $board ? "\n  <Pagination :page=\"{$d}.page\" :total=\"{$d}.total\" />" : '';
                return [$data,
                    "<section className=\"hb-section\">\n{$sec}  <Table>\n    <TableCaption>{{$d}.caption}</TableCaption>\n    <TableHeader><TableRow>{$th}</TableRow></TableHeader>\n    <TableBody>\n      {{$d}.rows.map((row) => (\n        <TableRow key={row.no}><TableCell align=\"center\">{$rH}</TableCell></TableRow>\n      ))}\n    </TableBody>\n  </Table>{$pg}\n</section>",
                    "<section class=\"hb-section\">\n{$secV}  <Table>\n    <TableCaption>{{ {$d}.caption }}</TableCaption>\n    <TableHeader><TableRow>{$th}</TableRow></TableHeader>\n    <TableBody>\n      <TableRow v-for=\"row in {$d}.rows\" :key=\"row.no\"><TableCell align=\"center\">{$vH}</TableCell></TableRow>\n    </TableBody>\n  </Table>{$pgV}\n</section>"];
            case 'FAQ_LIST':
                $qs = [['q' => '신청 자격은 어떻게 되나요?', 'a' => $p['org'] . '에 주소를 둔 ' . $p['resident'] . '이면 누구나 신청할 수 있습니다.'], ['q' => '온라인으로도 신청할 수 있나요?', 'a' => '누리집 민원 신청 메뉴에서 본인인증 후 신청할 수 있습니다.'], ['q' => '처리 결과는 어떻게 확인하나요?', 'a' => '신청 내역 조회에서 확인하거나 문자로 안내받습니다.'], ['q' => '문의는 어디로 하나요?', 'a' => $p['office'] . ' 대표전화 ' . $p['phone'] . '로 문의해 주세요.']];
                $data = ['title' => $name ?? '자주 묻는 질문', 'items' => array_map(static fn (array $x, int $i): array => $x + ['id' => 'q' . ($i + 1)], $qs, array_keys($qs))];
                return [$data,
                    "<section className=\"hb-section\">\n  <h3 className=\"hb-section-title\">{{$d}.title}</h3>\n  <Accordion type=\"single\" collapsible headingLevel={4}>\n    {{$d}.items.map((it) => (\n      <AccordionItem key={it.id} value={it.id}>\n        <AccordionTrigger>{it.q}</AccordionTrigger>\n        <AccordionContent>{it.a}</AccordionContent>\n      </AccordionItem>\n    ))}\n  </Accordion>\n</section>",
                    "<section class=\"hb-section\">\n  <h3 class=\"hb-section-title\">{{ {$d}.title }}</h3>\n  <Accordion type=\"single\" collapsible :heading-level=\"4\">\n    <AccordionItem v-for=\"it in {$d}.items\" :key=\"it.id\" :value=\"it.id\">\n      <AccordionTrigger>{{ it.q }}</AccordionTrigger>\n      <AccordionContent>{{ it.a }}</AccordionContent>\n    </AccordionItem>\n  </Accordion>\n</section>"];
            case 'STEP_FLOW':
            case 'FORM_STEP':
            case 'PROGRESS_STATUS':
                $steps = self::labels($st, $p, 5, 10);
                $steps = count($steps) >= 3 ? $steps : ['신청서 작성', '서류 제출', '검토', '결과 안내'];
                return [['title' => $name ?? '처리 절차', 'steps' => $steps, 'current' => 1],
                    "<section className=\"hb-section\">\n  <h3 className=\"hb-section-title\">{{$d}.title}</h3>\n  <StepIndicator steps={[...{$d}.steps]} current={{$d}.current} />\n</section>",
                    "<section class=\"hb-section\">\n  <h3 class=\"hb-section-title\">{{ {$d}.title }}</h3>\n  <StepIndicator :steps=\"[...{$d}.steps]\" :current=\"{$d}.current\" />\n</section>"];
            case 'NOTICE_LIST':
                $kw = array_values(array_unique(array_merge((array) ($p['topic'] ?? []), array_keys(SampleContent::BASIS['board']['keywords']))));
                $list = [];
                for ($n = 0, $nMax = $cell >= 8 ? 6 : 4; $n < $nMax; $n++) { $list[] = ['id' => 'n' . $n, 'title' => '2026년 ' . ($kw[$n % count($kw)] === '안내' ? '주요 사업' : $kw[$n % count($kw)]) . ' 알림', 'date' => sprintf('2026.09.%02d', 28 - $n)]; }
                return [['title' => $name ?? '새소식', 'items' => $list],
                    "<section className=\"hb-section\">\n  <h3 className=\"hb-section-title\">{{$d}.title}</h3>\n  <StructuredList>\n    {{$d}.items.map((it) => (\n      <StructuredListItem key={it.id} title={it.title} href=\"#\" meta={[{ label: \"등록일\", value: it.date }]} />\n    ))}\n  </StructuredList>\n</section>",
                    "<section class=\"hb-section\">\n  <h3 class=\"hb-section-title\">{{ {$d}.title }}</h3>\n  <StructuredList>\n    <StructuredListItem v-for=\"it in {$d}.items\" :key=\"it.id\" :title=\"it.title\" href=\"#\" :meta=\"[{ label: '등록일', value: it.date }]\" />\n  </StructuredList>\n</section>"];
            case 'POPUP_ZONE':
            case 'BANNER_ROLL':
                // 알림판·배너 = 샘플 이미지 캐러셀(자동 넘김·정지·이전·다음 — 키트 Carousel). 넓은 칸의 배너는 격자로 나란히
                $pics = $img($code === 'POPUP_ZONE' ? 'popup_zone' : 'banner_zone', $code === 'POPUP_ZONE' ? 3 : 4);
                if (count($pics) < 2) { break; }
                $ttl = $name ?? ($code === 'POPUP_ZONE' ? '알림판' : '배너 모음');
                $data = ['title' => $ttl, 'slides' => $pics];
                if ($code === 'BANNER_ROLL' && $cell >= 6) {
                    $c = $gcols(count($pics));
                    return [$data,
                        "<section className=\"hb-section\">\n  <h3 className=\"hb-section-title\">{{$d}.title}</h3>\n  <ul className=\"hb-banners\" style={{ gridTemplateColumns: \"repeat({$c}, minmax(0, 1fr))\" }}>\n    {{$d}.slides.map((b) => (\n      <li key={b.id}><a href=\"#\"><img src={b.src} alt={b.alt} style={{ aspectRatio: b.ratio }} /></a></li>\n    ))}\n  </ul>\n</section>",
                        "<section class=\"hb-section\">\n  <h3 class=\"hb-section-title\">{{ {$d}.title }}</h3>\n  <ul class=\"hb-banners\" style=\"grid-template-columns: repeat({$c}, minmax(0, 1fr))\">\n    <li v-for=\"b in {$d}.slides\" :key=\"b.id\"><a href=\"#\"><img :src=\"b.src\" :alt=\"b.alt\" :style=\"{ aspectRatio: b.ratio }\" /></a></li>\n  </ul>\n</section>"];
                }
                return [$data,
                    "<section className=\"hb-section\">\n  <h3 className=\"hb-section-title\">{{$d}.title}</h3>\n  <Carousel aria-label={{$d}.title} autoplay={5000}>\n    <CarouselContent>\n      {{$d}.slides.map((sl) => (\n        <CarouselItem key={sl.id}>\n          <a href=\"#\" className=\"hb-slide\"><img src={sl.src} alt={sl.alt} style={{ aspectRatio: sl.ratio }} /></a>\n        </CarouselItem>\n      ))}\n    </CarouselContent>\n    <CarouselControls />\n  </Carousel>\n</section>",
                    "<section class=\"hb-section\">\n  <h3 class=\"hb-section-title\">{{ {$d}.title }}</h3>\n  <Carousel :aria-label=\"{$d}.title\" :autoplay=\"5000\">\n    <CarouselContent>\n      <CarouselItem v-for=\"sl in {$d}.slides\" :key=\"sl.id\">\n        <a href=\"#\" class=\"hb-slide\"><img :src=\"sl.src\" :alt=\"sl.alt\" :style=\"{ aspectRatio: sl.ratio }\" /></a>\n      </CarouselItem>\n    </CarouselContent>\n    <CarouselControls />\n  </Carousel>\n</section>"];
            case 'NEWS_CARD':
            case 'PHOTO_GALLERY':
                // 사진 카드 — 섹션 유형(sns_video·photo_news…)에 맞는 샘플 사진
                $pics = $img((string) ($s['section_type'] ?? 'photo_news'), 4);
                if (count($pics) < 3) { break; }
                $kw = array_slice(array_merge(array_map(static fn (string $t): string => $t . ' 현장 소식', (array) ($p['topic'] ?? [])), ['현장 소식', '주민 참여 행사', '정책 설명회', '우수 사례']), 0, 4);
                $cards = array_map(static fn (array $pic, int $i): array => ['id' => 'c' . $i, 'title' => $kw[$i % 4], 'desc' => sprintf('2026.09.%02d', 26 - $i * 3), 'src' => $pic['src'], 'alt' => $pic['alt']], $pics, array_keys($pics));
                $c = $gcols(count($cards));
                // 좁은 칸(1열)에 사진 카드 4장을 세로로 쌓으면 옆 칸보다 1,000px 길어져 옆이 텅 빈다 → 2장까지 (q3 R19)
                if ($c === 1 && count($cards) > 2) { $cards = array_slice($cards, 0, 2); }
                // 1열이면 사진 왼쪽·글 오른쪽 가로형 — 세로 카드 두 장이 옆 칸보다 600px 길던 것 (q5 R19 디자이너 검수)
                $lc = $c === 1 ? ' hb-grid--media' : '';
                return [['title' => $name ?? ($code === 'PHOTO_GALLERY' ? '사진으로 보는 소식' : '소식'), 'cards' => $cards],
                    "<section className=\"hb-section\">\n  <h3 className=\"hb-section-title\">{{$d}.title}</h3>\n  <div className=\"hb-grid{$lc}\" style={{ gridTemplateColumns: \"repeat({$c}, minmax(0, 1fr))\" }}>\n    {{$d}.cards.map((c) => (\n      <Card key={c.id}>\n        <img className=\"hb-card-img\" src={c.src} alt={c.alt} />\n        <CardHeader><CardTitle as=\"h4\">{c.title}</CardTitle><CardDescription>{c.desc}</CardDescription></CardHeader>\n      </Card>\n    ))}\n  </div>\n</section>",
                    "<section class=\"hb-section\">\n  <h3 class=\"hb-section-title\">{{ {$d}.title }}</h3>\n  <div class=\"hb-grid{$lc}\" style=\"grid-template-columns: repeat({$c}, minmax(0, 1fr))\">\n    <Card v-for=\"c in {$d}.cards\" :key=\"c.id\">\n      <img class=\"hb-card-img\" :src=\"c.src\" :alt=\"c.alt\" />\n      <CardHeader><CardTitle as=\"h4\">{{ c.title }}</CardTitle><CardDescription>{{ c.desc }}</CardDescription></CardHeader>\n    </Card>\n  </div>\n</section>"];
            case 'GREETING':
                // 기관장 인사 — 사진(가상 인물과 성별이 맞는 샘플) + 직함·이름 + 인사 두 줄 + 링크 버튼
                $pics = $img('greeting_vision', 1, [$p['gender'] === 'female' ? '여성' : '남성']);
                if ($pics === []) { break; }
                $data = ['title' => $name ?? '인사말', 'role' => SampleContent::head($p), 'name' => $p['name'], 'msg' => $p['resident'] . ' 한 분 한 분의 목소리에 귀 기울이는 ' . $p['org'] . self::iga((string) $p['org']) . ' 되겠습니다.', 'photo' => $pics[0], 'links' => [['label' => '인사말', 'href' => '#'], ['label' => '약속과 비전', 'href' => '#']]];
                return [$data,
                    "<section className=\"hb-section\">\n  <h3 className=\"hb-section-title\">{{$d}.title}</h3>\n  <Card className=\"hb-greet\">\n    <img className=\"hb-greet-photo\" src={{$d}.photo.src} alt={{$d}.photo.alt} />\n    <CardContent>\n      <p className=\"hb-greet-role\">{{$d}.role}</p>\n      <p className=\"hb-greet-name\">{{$d}.name}</p>\n      <p className=\"hb-greet-msg\">{{$d}.msg}</p>\n      <div className=\"hb-greet-links\">\n        {{$d}.links.map((l) => <a key={l.label} className=\"krds-btn secondary small\" href={l.href}>{l.label}</a>)}\n      </div>\n    </CardContent>\n  </Card>\n</section>",
                    "<section class=\"hb-section\">\n  <h3 class=\"hb-section-title\">{{ {$d}.title }}</h3>\n  <Card class=\"hb-greet\">\n    <img class=\"hb-greet-photo\" :src=\"{$d}.photo.src\" :alt=\"{$d}.photo.alt\" />\n    <CardContent>\n      <p class=\"hb-greet-role\">{{ {$d}.role }}</p>\n      <p class=\"hb-greet-name\">{{ {$d}.name }}</p>\n      <p class=\"hb-greet-msg\">{{ {$d}.msg }}</p>\n      <div class=\"hb-greet-links\">\n        <a v-for=\"l in {$d}.links\" :key=\"l.label\" class=\"krds-btn secondary small\" :href=\"l.href\">{{ l.label }}</a>\n      </div>\n    </CardContent>\n  </Card>\n</section>"];
        }
        switch ($code) {
            case 'NEWS_CARD':
            case 'PHOTO_GALLERY':
            case 'KPI_SUMMARY':
            case 'QUICK_MENU':
            case 'POPUP_ZONE':
            case 'BANNER_ROLL':
                // 팝업·배너 글은 대부분 실제 행사명·기관 사이트명이라 근거 글을 쓰지 않는다(가상 값만)
                $labels = in_array($code, ['POPUP_ZONE', 'BANNER_ROLL', 'KPI_SUMMARY'], true) ? [] : self::labels($st, $p, $items, 14);
                // 바로가기 이름은 '할 일·서비스' 여야 한다 — 대상 분류('사업자'·'관광객')·수식어('언제나 신속한')가 섞여 나오던 것 (q3 R19)
                if ($code === 'QUICK_MENU') {
                    $labels = array_values(array_filter($labels, static fn (string $l): bool => !preg_match('/^(시민|구민|군민|주민|도민|사업자|기업|관광객|외국인|청소년|어린이|어르신|노인|장애인|여성|학생|학부모|교직원|공무원|방문객)$|[한는던]$/u', $l)));
                }
                if (count($labels) < 3) { $labels = []; }
                $def = match ($code) {
                    'KPI_SUMMARY' => ['접수 1,240건', '처리 1,198건', '평균 3.2일', '만족도 4.6점'],
                    'QUICK_MENU' => ['민원 신청', '증명서 발급', '공지사항', '자주 묻는 질문', '담당자 찾기', '찾아오시는 길'],
                    'POPUP_ZONE' => ['2026 ' . mb_substr($p['org'], 0, 2) . ' 가을 축제', '청년 정책 설명회 참가자 모집', '생활 민원 모바일 신청 안내'],
                    'BANNER_ROLL' => ['정부24', '국민신문고', '정책브리핑', '복지로'],
                    default => ['현장 소식', '주민 참여 행사', '정책 설명회', '우수 사례'],
                };
                $cards = array_map(static fn (string $t, int $i): array => ['id' => 'c' . $i, 'title' => $t, 'desc' => match ($code) { 'KPI_SUMMARY' => '2026년 누계', 'BANNER_ROLL' => '바로가기', 'POPUP_ZONE' => '2026.10.01 ~ 10.31', default => '자세히 보기' }], $labels ?: array_slice($def, 0, $items), array_keys($labels ?: array_slice($def, 0, $items)));
                $cols = $gcols(count($cards), $code === 'QUICK_MENU' ? 6 : 4);
                // 바로가기 칸의 레퍼런스 제목이 '09월 일정안내' 처럼 엉뚱한 경우가 있어, 바로가기다운 이름일 때만 쓴다
                if ($code === 'QUICK_MENU' && $name !== null && preg_match('/바로|서비스|메뉴|찾는|민원|퀵/u', $name) !== 1) { $name = null; }
                return [['title' => $name ?? match ($code) { 'KPI_SUMMARY' => '한눈에 보는 현황', 'QUICK_MENU' => '자주 찾는 서비스', 'PHOTO_GALLERY' => '사진으로 보는 소식', 'POPUP_ZONE' => '알림판', 'BANNER_ROLL' => '관련 누리집', default => '소식' }, 'cards' => $cards],
                    "<section className=\"hb-section\">\n  <h3 className=\"hb-section-title\">{{$d}.title}</h3>\n  <div style={{ display: \"grid\", gridTemplateColumns: \"repeat({$cols}, minmax(0, 1fr))\", gap: 16 }}>\n    {{$d}.cards.map((c) => (\n      <Card key={c.id}><CardHeader><CardTitle as=\"h4\">{c.title}</CardTitle><CardDescription>{c.desc}</CardDescription></CardHeader></Card>\n    ))}\n  </div>\n</section>",
                    "<section class=\"hb-section\">\n  <h3 class=\"hb-section-title\">{{ {$d}.title }}</h3>\n  <div :style=\"{ display: 'grid', gridTemplateColumns: 'repeat({$cols}, minmax(0, 1fr))', gap: '16px' }\">\n    <Card v-for=\"c in {$d}.cards\" :key=\"c.id\"><CardHeader><CardTitle as=\"h4\">{{ c.title }}</CardTitle><CardDescription>{{ c.desc }}</CardDescription></CardHeader></Card>\n  </div>\n</section>"];
            case 'HERO_VISUAL':
                $bg = $img((string) ($s['section_type'] ?? 'main_visual'), 1)[0]['src'] ?? null;
                $style = $bg === null ? '' : " style={{ backgroundImage: `linear-gradient(rgba(0,0,0,.45), rgba(0,0,0,.45)), url(\${{$d}.bg})` }}";
                $styleV = $bg === null ? '' : " :style=\"{ backgroundImage: `linear-gradient(rgba(0,0,0,.45), rgba(0,0,0,.45)), url(\${{$d}.bg})` }\"";
                $cls = $bg === null ? 'hb-hero' : 'hb-hero hb-hero--photo';
                return [['title' => $p['resident'] . '과 함께 여는 ' . $p['org'], 'desc' => '필요한 서비스를 한곳에서 찾아보세요.', 'bg' => $bg],
                    "<section className=\"{$cls}\"{$style}>\n  <h2>{{$d}.title}</h2>\n  <p>{{$d}.desc}</p>\n  <Button variant=\"primary\" size=\"large\">서비스 바로가기</Button>\n</section>",
                    "<section class=\"{$cls}\"{$styleV}>\n  <h2>{{ {$d}.title }}</h2>\n  <p>{{ {$d}.desc }}</p>\n  <Button variant=\"primary\" size=\"large\">서비스 바로가기</Button>\n</section>"];
            case 'SATISFACTION':
                return [['title' => '이 페이지에서 원하는 정보를 찾으셨나요?'],
                    "<section className=\"hb-section hb-satisfaction\">\n  <h3 className=\"hb-section-title\">{{$d}.title}</h3>\n  <Button variant=\"secondary\">만족도 평가하기</Button>\n</section>",
                    "<section class=\"hb-section hb-satisfaction\">\n  <h3 class=\"hb-section-title\">{{ {$d}.title }}</h3>\n  <Button variant=\"secondary\">만족도 평가하기</Button>\n</section>"];
        }
        // 기본 블록: 제목 + 글머리 목록 (CONTENT_BLOCK · NOTICE_BOX · GREETING · CONTACT_BOX · LOCATION_MAP · TIMELINE · …)
        $bul = match ($code) {
            'CONTACT_BOX' => ['담당 부서: ' . $p['office'], '전화: ' . $p['phone'], '팩스: ' . $p['fax']],
            'LOCATION_MAP' => ['주소: ' . $p['address'], '대중교통: 시청역 3번 출구에서 도보 5분', '주차: 청사 지하 주차장(방문 민원 2시간 무료)'],
            'TIMELINE' => ['2024. 기본계획 수립', '2025. 시범 운영', '2026. 전면 시행'],
            'GREETING' => ['안녕하십니까? ' . SampleContent::head($p) . ' ' . $p['name'] . '입니다.', $p['resident'] . ' 한 분 한 분의 목소리에 귀 기울이겠습니다.', '소통으로 답을 찾는 ' . $p['org'] . self::iga((string) $p['org']) . ' 되겠습니다.'],
            default => ['신청 대상과 기간을 먼저 확인하세요.', '필요한 서류는 누리집에서 내려받을 수 있습니다.', '처리 결과는 문자로 안내합니다.'],
        };
        return [['title' => $name ?? match ($code) { 'CONTACT_BOX' => '문의처', 'LOCATION_MAP' => '찾아오시는 길', 'TIMELINE' => '추진 경과', 'GREETING' => '인사말', 'NOTICE_BOX' => '알려드립니다', default => '안내' }, 'items' => $bul],
            "<section className=\"hb-section\">\n  <h3 className=\"hb-section-title\">{{$d}.title}</h3>\n  <TextList type=\"bullet\">\n    {{$d}.items.map((t) => <TextListItem key={t}>{t}</TextListItem>)}\n  </TextList>\n</section>",
            "<section class=\"hb-section\">\n  <h3 class=\"hb-section-title\">{{ {$d}.title }}</h3>\n  <TextList type=\"bullet\">\n    <TextListItem v-for=\"t in {$d}.items\" :key=\"t\">{{ t }}</TextListItem>\n  </TextList>\n</section>"];
    }

    /** 명세 테마(주색·글꼴) → theme.css — 키트 다운로드의 theme.css 와 같은 형식, 주색 단계는 KitPage 스킨과 같은 비율로 섞는다 */
    public static function themeCss(array $theme, int $container = 1200): string
    {
        $hex = (string) ($theme['primary'] ?? '#256EF4');
        if (!preg_match('/^#[0-9a-f]{6}$/i', $hex)) { $hex = '#256EF4'; }
        $n = hexdec(substr($hex, 1));
        $rgb = [($n >> 16) & 255, ($n >> 8) & 255, $n & 255];
        $mix = static function (array $t, float $w) use ($rgb): string { $o = '#'; foreach ($rgb as $i => $c) { $o .= str_pad(dechex((int) round($c + ($t[$i] - $c) * $w)), 2, '0', STR_PAD_LEFT); } return $o; };
        $steps = [[5, [255, 255, 255], .92], [10, [255, 255, 255], .84], [20, [255, 255, 255], .66], [30, [255, 255, 255], .46], [40, [255, 255, 255], .22], [50, [0, 0, 0], 0], [60, [0, 0, 0], .2], [70, [0, 0, 0], .42], [80, [0, 0, 0], .6], [90, [0, 0, 0], .76], [95, [0, 0, 0], .84]];
        $lines = [];
        foreach ($steps as [$s, $t, $w]) {
            $lines[] = "  --krds-color-light-primary-{$s}: " . $mix($t, $w) . ';';
            $lines[] = "  --krds-color-light-secondary-{$s}: " . $mix($t, min(.95, $w + ($s >= 50 ? .25 : 0))) . ';';
        }
        $font = trim(str_replace(['"', "'", ';', '{', '}'], '', (string) ($theme['font'] ?? '')));
        if ($font !== '') { $lines[] = "  --krds-font-family-base: '{$font}', 'Pretendard GOV', sans-serif;"; }
        $label = ($theme['base'] ?? 'KRDS') === 'CUSTOM' ? '고객 테마' : 'KRDS 기본';
        $w = max(960, min(1440, $container));
        $frame = "\n/* 페이지 틀 — 부품 밖의 배치·간격 (명세 grid.container {$w}px) */\n"
            . ".hb-page-body { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 48px; max-width: {$w}px; margin: 0 auto; padding: 32px 20px 80px; }\n"
            . ".hb-page > .hb-page-main { max-width: {$w}px; margin: 0 auto; padding: 32px 20px 80px; }\n"
            . ".hb-page-main { min-width: 0; }\n"
            . ".hb-page-title { margin: 24px 0 8px; font-size: 32px; line-height: 1.3; }\n"
            . ".hb-section { margin-top: 48px; }\n"
            . ".hb-section-title { margin: 0 0 16px; font-size: 22px; line-height: 1.4; }\n"
            . ".hb-section .krds-pagination, .hb-section nav[aria-label] { margin-top: 24px; }\n"
            . ".hb-hero { padding: 72px 20px; text-align: center; background: var(--krds-color-light-primary-5); }\n"
            . ".hb-hero h2 { margin: 0 0 12px; font-size: 40px; } .hb-hero p { margin: 0 0 24px; }\n"
            . ".hb-skip { position: absolute; left: -9999px; } .hb-skip:focus { left: 8px; top: 8px; z-index: 100; }\n"
            . "/* 본문 줄(좁은 섹션 나란히) · 사진 카드 · 캐러셀 · 인사 카드 */\n"
            . ".hb-row { display: grid; gap: 32px; margin-top: 48px; align-items: start; }\n"
            . ".hb-row > .hb-cell { min-width: 0; } .hb-row > .hb-cell > .hb-section { margin-top: 0; }\n"
            // 같은 줄 칸 높이 맞춤 — 세로 포스터 알림판 옆 인사말 카드 아래가 600px 비던 것 (2026-09-30 MCP 시험 q1 R01)
            . ".hb-row { align-items: stretch; } .hb-row > .hb-cell { display: flex; flex-direction: column; } .hb-row > .hb-cell > .hb-section { flex: 1; display: flex; flex-direction: column; }\n"
            . ".hb-row > .hb-cell > .hb-section > .hb-greet { flex: 1; align-items: stretch; }\n"
            // 칸이 늘어나면 사진도 칸 높이만큼 — 작은 사진이 가운데 떠 카드 속이 텅 비어 보이던 것 (q4 R19 디자이너 검수)
            . ".hb-row .hb-greet-photo { width: 38%; max-width: 280px; aspect-ratio: auto; height: auto; min-height: 176px; object-fit: cover; object-position: top; }\n"
            . ".hb-row .hb-greet > * { align-self: center; } .hb-row .hb-greet > .hb-greet-photo { align-self: stretch; }\n"
            // 세로 포스터는 제 비율 그대로 높이만 줄여 가운데 — 4:3 틀에 contain 으로 넣으면 양옆 빈 띠(게이트 '이미지 빈 띠', q4), cover 면 글자가 잘린다
            . ".hb-row .hb-slide img { max-height: 380px; width: auto; max-width: 100%; margin: 0 auto; }\n"
            // 주색이 화면에서 보이게 — 노란 브랜드를 줘도 어디에도 안 보이던 것(q3 R19). 머리 아래 선·섹션 제목 표시·현재 메뉴
            . ".hb-page .krds-header, .hb-page header { border-bottom: 3px solid var(--krds-color-light-primary-50); }\n"
            . ".hb-section-title { position: relative; padding-left: 14px; } .hb-section-title::before { content: ''; position: absolute; left: 0; top: .2em; bottom: .2em; width: 4px; border-radius: 2px; background: var(--krds-color-light-primary-50); }\n"
            . ".hb-grid { display: grid; gap: 16px; }\n"
            . ".hb-card-img { display: block; width: 100%; aspect-ratio: 16 / 10; object-fit: cover; }\n"
            . ".hb-grid--media > * { display: grid; grid-template-columns: 44% minmax(0, 1fr); align-items: center; } .hb-grid--media .hb-card-img { height: 100%; aspect-ratio: 4 / 3; }\n"
            . ".hb-slide { display: block; } .hb-slide img, .hb-banners img { display: block; width: 100%; height: auto; object-fit: cover; border-radius: 8px; }\n"
            . ".hb-banners { display: grid; gap: 16px; margin: 0; padding: 0; list-style: none; }\n"
            . ".hb-greet { display: flex; flex-direction: row; gap: 20px; align-items: center; padding: 20px; }\n"
            . ".hb-greet-photo { flex: none; width: 132px; aspect-ratio: 3 / 4; object-fit: cover; border-radius: 8px; }\n"
            . ".hb-greet-role { margin: 0; font-size: 14px; opacity: .75; } .hb-greet-name { margin: 2px 0 8px; font-size: 22px; font-weight: 700; }\n"
            . ".hb-greet-msg { margin: 0 0 12px; line-height: 1.6; } .hb-greet-links { display: flex; flex-wrap: wrap; gap: 8px; }\n"
            . ".hb-hero--photo { color: #fff; background-size: cover; background-position: center; }\n"
            . "@media (max-width: 1024px) { .hb-row { grid-template-columns: minmax(0, 1fr) !important; } }\n"
            . "@media (max-width: 1024px) { .hb-page-body { grid-template-columns: minmax(0, 1fr); } }\n"
            // 모바일(≤640): 인라인 repeat(N) 열 수가 그대로면 카드 폭 76px 로 화면을 넘긴다(q7 R17 가로 넘침 392>390) — 2열로, 사진+글 카드는 세로
            . "@media (max-width: 640px) { .hb-grid, .hb-banners { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; } .hb-grid--media > * { grid-template-columns: minmax(0, 1fr); } .hb-grid--media .hb-card-img { height: auto; } }\n"
            // KRDS 푸터 .inner 는 ID 규칙으로 좌우 여백 0 → 헤더·본문보다 20px 밖으로 나가던 것(2026-09-29 실측 260 vs 280)
            . "#krds-footer .inner { padding-left: var(--krds-contents-padding-x) !important; padding-right: var(--krds-contents-padding-x) !important; }\n";
        // 헤더·푸터 안쪽 폭(키트 --krds-contents-size, 기본 1200)을 본문 폭과 같게 — 다르면 로고·메뉴·본문 왼쪽 선이 어긋난다
        //   키트 .inner = max-width --krds-contents-wrap-size + 좌우 --krds-contents-padding-x → 본문(.hb-page-main: 폭 $w, 좌우 20px)과 같게
        $lines[] = '  --krds-contents-size: ' . ($w - 40) . 'px;';
        $lines[] = '  --krds-contents-wrap-size: ' . $w . 'px;';
        $lines[] = '  --krds-contents-padding-x: 20px;';
        return "/* {$label} (주색 {$hex}) — 이 파일만 바꾸면 부품 색·글꼴이 바뀝니다 */\n:root, .hb-kit {\n" . implode("\n", $lines) . "\n}\n" . $frame;
    }
}

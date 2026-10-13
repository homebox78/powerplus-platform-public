<?php
declare(strict_types=1);

namespace Homebox;

/**
 * 디자이너 선호 규칙 (2026-10-03 사용자: "사람들의 선호도를 좋은 디자인으로 판단하는 기준", "똑똑한 디자인 전문가").
 * designus A/B 투표 중 참여 300명 이상·한쪽 65% 이상인 것만 규칙으로 쓴다. 선택지 내용은 그림이 아니라 글 요약(design_debates.options[].description).
 * 관공서 수집 근거(무엇을 실제로 만들었나)와 짝을 이루는 두 번째 근거(디자이너들이 무엇을 더 낫다고 골랐나).
 * 쓰는 곳: GET /api/insights/preferences · ReplicaKit(preferences) · MCP get_design_preferences · check_mockup(preference_tips, 감점 없음)
 */
final class Preferences
{
    public const MIN_VOTES = 300;
    public const MIN_PCT = 65.0;

    /** 분야 — 제목·선택지 설명의 낱말로 고른다(앞쪽 우선). 시안의 요소 종류(kinds)도 같은 id 를 쓴다 */
    public const CATEGORIES = [
        'form' => ['name' => '폼·입력', 're' => '입력|폼|생년월일|비밀번호|체크박스|라디오|드롭다운|선택 ?상자|피커|검색창|텍스트 ?필드|인풋|회원가입|로그인|카드번호|주소|수량|스테퍼|토글|스위치'],
        'overlay' => ['name' => '팝업·알림', 're' => '팝업|모달|바텀 ?시트|토스트|스낵바|알림|레이어|다이얼로그|닫기'],
        'feedback' => ['name' => '오류·안내·로딩', 're' => '오류|에러|안내 ?문|로딩|스켈레톤|빈 ?화면|경고|성공|완료|진행'],
        'list' => ['name' => '목록·넘김', 're' => '목록|리스트|페이지네이션|무한 ?스크롤|더 ?보기|정렬|필터|검색 결과'],
        'nav' => ['name' => '메뉴·탐색', 're' => '메뉴|내비|네비|탭|GNB|햄버거|브레드|길 ?찾기|뒤로|바로가기|헤더|푸터'],
        'button' => ['name' => '버튼·CTA', 're' => '버튼|CTA|클릭|링크'],
        'data' => ['name' => '표·차트·수치', 're' => '표기|표 |차트|그래프|데이터|통계|수치|시간|날짜|가격'],
        'visual' => ['name' => '색·글꼴', 're' => '색|컬러|폰트|글꼴|서체|타이포|대비|다크|그라데이션'],
        'icon' => ['name' => '아이콘·이미지', 're' => '아이콘|이모지|일러스트|이미지|사진|썸네일|로고'],
        'layout' => ['name' => '배치·카드', 're' => '배치|레이아웃|카드|여백|그리드|배너|메인|정렬|위치|섹션'],
    ];

    /** 관공서 누리집과 거리가 먼 앱·커머스 전용 주제 — 시안 묶음·판정 조언에서는 뺀다(2026-10-03 MCP 시험에서 신청 폼 묶음에 채팅 읽음 표시·경로 색 막대가 들어옴) */
    public const OFF_GOV = '채팅|메시지|말풍선|읽음|아이폰|제어센터|스마트 답장|장바구니|쇼핑|상품|부동산|매물|시세|재고|요금|업그레이드|구독|길 ?찾기|경로|리뷰|별점|금칙어|앨범|카메라|QR|프로덕트|앱 |케밥|하단 ?탭|업로드|증정|소셜|영상|재생|권한 팝업|로그아웃|조합|바코드|댓글|피드|작성자|회차|상영|폐쇄성|구성주의|단계형 이름|인스타|스토리|연락처|계열 헤더|연보라|연핑크|식기세척기|주문';

    /** @return list<array<string,mixed>> 참여 많은 순 */
    public static function all(): array
    {
        // 투표 데이터가 바뀌면 캐시도 바뀌어야 한다 — Db::cached 판(사이트·섹션)은 debates 를 안 봐서
        // debates 가져온 뒤에도 빈 결과가 TTL 까지 남았다 (MCP 검수 2026-10-05)
        $dv = Db::row("SELECT COUNT(*) AS n, COALESCE(SUM(vote_count), 0) AS v, MAX(collected_at) AS c FROM design_debates WHERE source = 'designus'");
        $dver = md5(json_encode($dv));
        return Db::cached("prefs:v6:$dver", static function (): array {
            $out = [];
            foreach (Db::rows("SELECT ext_id, title, options, vote_count, source_url FROM design_debates WHERE source = 'designus' AND vote_count >= ? ORDER BY vote_count DESC", [self::MIN_VOTES]) as $r) {
                $opts = json_decode((string) $r['options'], true) ?: [];
                if (count($opts) < 2) continue;
                usort($opts, static fn ($a, $b) => ($b['pct'] ?? 0) <=> ($a['pct'] ?? 0));
                $top = $opts[0];
                if ((float) ($top['pct'] ?? 0) < self::MIN_PCT || !($top['description'] ?? null)) continue;
                $hay = $r['title'] . ' ' . implode(' ', array_map(static fn ($o) => (string) ($o['description'] ?? ''), $opts));
                $cats = [];
                foreach (self::CATEGORIES as $id => $c) if (preg_match('/' . $c['re'] . '/u', $hay)) $cats[] = $id;
                $loose = !$cats; // 어느 분야 낱말도 없는 규칙(게슈탈트·작명 같은 추상 주제) — 관공서 묶음에서는 뺀다
                if (!$cats) $cats = ['layout'];
                $out[] = [
                    'id' => 'designus-' . $r['ext_id'],
                    'category' => $cats[0], 'categories' => $cats,
                    'question' => $r['title'],
                    'prefer' => ['text' => $top['description'], 'pct' => (float) $top['pct']],
                    'over' => array_map(static fn ($o) => ['text' => $o['description'] ?? null, 'pct' => (float) ($o['pct'] ?? 0)], array_slice($opts, 1)),
                    'votes' => (int) $r['vote_count'],
                    'gov_fit' => !$loose && !preg_match('/' . self::OFF_GOV . '/u', $hay),
                    'rule' => sprintf('%s (디자이너 %d%% 선호, %s명 투표)', $top['description'], (int) round((float) $top['pct']), number_format((int) $r['vote_count'])),
                    'source' => $r['source_url'],
                ];
            }
            return $out;
        }, 3600);
    }

    /**
     * @param list<string> $kinds 분야 id(하나라도 맞으면) · $q 낱말(질문·선택지 설명에 포함)
     * @return list<array<string,mixed>>
     */
    public static function find(array $kinds = [], string $q = '', int $limit = 20, bool $primary = false, bool $gov = false): array
    {
        // $gov: 관공서 누리집에 맞는 규칙만(OFF_GOV 주제 제외) — 재현 묶음·판정 조언
        // $primary: 규칙의 첫 분야만 본다(재현 묶음처럼 화면 종류로 고를 때 — 곁가지 분야로 엉뚱한 규칙이 끼지 않게)
        $kinds = array_values(array_intersect($kinds, array_keys(self::CATEGORIES)));
        $words = array_values(array_filter(preg_split('/\s+/u', trim($q)) ?: [], static fn ($w) => mb_strlen($w) >= 2));
        $hit = [];
        foreach (self::all() as $r) {
            if ($gov && !$r['gov_fit']) continue;
            if ($kinds && !array_intersect($kinds, $primary ? [$r['category']] : $r['categories'])) continue;
            if ($words) {
                $hay = $r['question'] . ' ' . $r['prefer']['text'] . ' ' . implode(' ', array_column($r['over'], 'text'));
                $n = 0; foreach ($words as $w) if (mb_stripos($hay, $w) !== false) $n++;
                if (!$n) continue;
                $r['_m'] = $n;
                $r['exact'] = $n === count($words); // 낱말이 모두 들어 있나 — 아니면 '관련 낮음'(2026-10-12 MCP 시험: '검색 버튼'에 '버튼'만 맞는 규칙이 섞임)
            }
            $hit[] = $r;
        }
        // 낱말이 여럿이면 모두 맞는 규칙을 먼저 — 하나라도 있으면 그것만, 없을 때만 일부 일치로 넓힌다
        if (count($words) > 1) {
            $all = array_values(array_filter($hit, static fn ($r) => !empty($r['exact'])));
            if ($all) $hit = $all;
        }
        // 낱말이 많이 맞을수록 → 화면이 먼저 쓰는 분야일수록(kinds 앞쪽) → 근거가 셀수록(표 차이 × 참여 수의 로그)
        $rank = static fn ($r) => $kinds ? (int) min(array_map(static fn ($c) => ($i = array_search($c, $kinds, true)) === false ? 99 : $i, $primary ? [$r['category']] : $r['categories'])) : 0;
        $power = static fn ($r) => ($r['prefer']['pct'] - 50) * log10(max(10, $r['votes']));
        usort($hit, static fn ($a, $b) => [($b['_m'] ?? 0), $rank($a), $power($b)] <=> [($a['_m'] ?? 0), $rank($b), $power($a)]);
        return array_map(static function ($r) { unset($r['_m']); return $r; }, array_slice($hit, 0, max(1, min(60, $limit))));
    }

    /** 시안 HTML 에서 들어 있는 요소 분야를 고른다(check_mockup 의 조언용) — @return list<string> */
    public static function kindsOf(string $html): array
    {
        $k = [];
        // 검색창 하나뿐인 화면은 폼이 아니다 — 거의 모든 시안에 검색 input 이 있어 폼 규칙(스테퍼·타임 피커)이 매번 뽑히던 것(2026-10-03 시험 20건)
        $inputs = preg_match_all('/<input\b(?![^>]*type="(search|hidden|submit|button)")(?![^>]*(name|id|class)="[^"]*(search|query|keyword|srch)[^"]*")/i', $html);
        if ($inputs >= 2 || preg_match('/<(select|textarea)\b/i', $html)) $k[] = 'form';
        if (preg_match('/data-hb="(layer|modal|popup)|class="[^"]*(modal|popup|layer)/i', $html)) $k[] = 'overlay';
        if (preg_match('/pagination|paging|data-hb-pad|class="[^"]*(board|list)[^"]*"/i', $html)) $k[] = 'list';
        if (preg_match('/<nav\b|data-hb="(tabs|menu|gnb)/i', $html)) $k[] = 'nav';
        if (preg_match('/<table\b|chart|graph/i', $html)) $k[] = 'data';
        if (preg_match('/<button\b|class="[^"]*btn/i', $html)) $k[] = 'button';
        $k[] = 'layout'; $k[] = 'visual';
        return array_values(array_unique($k));
    }

    /** 규칙이 다루는 특정 요소 → 시안에 그 요소가 있다는 증거. 규칙 글에 앞쪽 낱말이 있으면 시안에 뒤쪽이 있어야 조언한다. */
    private const ELEMENTS = [
        ['스테퍼|수량', '/type="number"|수량|stepper/i'],
        ['타임 ?피커|시간을', '/type="time"|time-?picker|시간 선택/i'],
        ['체크박스', '/type="checkbox"/i'],
        ['라디오', '/type="radio"/i'],
        ['자동완성', '/type="search"|data-hb="search"|search|검색/i'],
        ['캐러셀|슬라이드|배너가 살짝', '/data-hb="carousel"|swiper|slide/i'],
        ['드롭다운|셀렉트|선택 상자', '/<select\b|data-hb="select"/i'],
        ['날짜|달력|데이트', '/type="date"|calendar|달력/i'],
        ['페이지 번호|페이지네이션|더 보기 버튼', '/pagination|paging|data-hb-pad/i'],
        ['토글|스위치', '/role="switch"|toggle|switch/i'],
        ['탭', '/data-hb="tabs"|role="tablist"/i'],
        ['비밀번호|로그인', '/type="password"/i'],
        ['파일 첨부|업로드', '/type="file"/i'],
    ];

    /** check_mockup 조언 — 시안의 분야로 고르고, 특정 요소를 다루는 규칙은 그 요소가 시안에 있을 때만(2026-10-03 시험: 폼 없는 메인에 스테퍼·타임 피커 규칙이 반복) */
    public static function tipsFor(string $html, int $limit = 6): array
    {
        $out = [];
        foreach (self::find(self::kindsOf($html), '', 40, false, true) as $r) {
            $hay = $r['question'] . ' ' . $r['prefer']['text'] . ' ' . implode(' ', array_column($r['over'], 'text'));
            $ok = true;
            foreach (self::ELEMENTS as [$word, $proof]) {
                if (preg_match('/' . $word . '/u', $hay) && !preg_match($proof, $html)) { $ok = false; break; }
            }
            if ($ok) $out[] = $r;
            if (count($out) >= $limit) break;
        }
        return $out;
    }

    /** 응답용 짧은 꼴 */
    public static function compact(array $rules): array
    {
        return array_map(static fn ($r) => ['category' => self::CATEGORIES[$r['category']]['name'], 'question' => $r['question'], 'rule' => $r['rule'], 'instead_of' => $r['over'][0]['text'] ?? null], $rules);
    }
}

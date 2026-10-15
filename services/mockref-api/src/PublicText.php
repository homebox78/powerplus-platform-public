<?php
declare(strict_types=1);

namespace Homebox;

/**
 * 레퍼런스 분석 응답에서 수집 원문을 걷어낸다 (O-44, 2026-10-15 사용자 결정).
 *   - 긴 원문(structure.text 등: 실제 헤드라인·기관장 실명) → 길이·낱말 수·형식만 {chars, words, kind}
 *   - 짧은 이름(섹션 제목·소제목·링크 글·common_titles) → 기관명·지명·인명·연락처를 "○○"로 일반화. 긴 문장이면 "[글 N자]"
 *   - 기관명·지명 목록 = DB organizations(name·display_name·name_aliases·region_sido·region_sigungu) + AssemblyCode::PLACES,
 *     인명 = SampleContent::scrubReal 과 같은 "직함 옆 세 글자 이름" 규칙.
 * 원문을 그대로 보는 곳은 세션으로 들어온 관리자(검수 화면)뿐이다 — 키로 들어온 요청(powerMCP)은 임직원·관리자 키도 걷어낸다.
 */
final class PublicText
{
    /** 흔한 낱말과 겹치는 지명 — 뒤에 시·군·구·청·교육이 붙을 때만 지명으로 본다('예산 공개'·'음성 안내'·'경기 일정'을 지우지 않게) */
    private const AMBIG = ['예산', '부여', '음성', '고령', '영양', '장수', '상주', '영광', '구리', '화성', '광명', '진도', '보은', '공주', '성주', '정선', '고성', '강진', '신안', '금산', '영동', '인제', '무안', '보성', '화순', '의령', '남해', '경기', '구미'];
    private const TITLES = '시장|군수|구청장|도지사|지사|교육감|총장|학장|이사장|회장|부회장|대표이사|대표|관장|원장|사장|장관|차관|청장|위원장|의장|센터장|교장';
    private const SUR = '김|이|박|최|정|강|조|윤|장|임|한|오|서|신|권|황|안|송|류|유|전|홍|고|문|양|손|배|백|허|남|심|노|하|곽|성|차|주|우|구|민|진|나|지|엄|채|원|천|방|공|현|함|변|염|여|추|도|소|석|선|설|마|길|연|위|표|명|기|반|왕|금|옥|육|인|맹|제|모|탁|국|어|은|편|용|예|경|봉|사|부|황보|남궁|제갈|선우';
    /** 사람 이름처럼 보이는 세 글자 일반어(SampleContent::scrubReal 과 같은 목록 일부) */
    private const NOT_NAME = ['인사말', '집무실', '비서실', '동정란', '연설문', '기고문', '프로필', '일정표', '소개글', '안내문', '임원진', '위원회', '이사회', '사무실', '부속실', '정책실', '기획실', '대변인',
        '조직도', '조직표', '기관장', '부서장', '담당자', '연락처', '홍보관', '안내도', '문화원', '도서관', '전시관', '공연장', '장학금', '정보화', '민원실', '이용료', '사업소', '보건소', '연구소', '연구원', '전문가',
        '고객님', '방문객', '사무국', '사무처', '이사진', '후원금', '장애인', '청소년', '기부금', '자료실', '상담실', '지원단', '교육원', '주요업', '이용안', '신청서', '한마당', '공지사', '정보공', '연혁도',
        '조직개', '오시는', '역대시', '시정목', '구정목', '군정목', '도정목', '부시장', '부군수', '부구청', '비서관', '정무직', '주무관', '사무관', '전화번', '이메일', '공약사', '이력서'];
    /** 사람 이름이 나열될 법한 섹션(역대 기관장·인사말·조직도·약력) — 여기서는 홀로 선 세 글자 이름도 ○○○ */
    public const PEOPLE_CTX = '/역대|인사말|조직도|프로필|약력|기관장|시장|군수|구청장|도지사|교육감|총장|이사장|의장|원장|관장|대표이사|임원/u';

    /** @var array<string,string>|null 실제 이름 → ○○ (긴 이름부터 맞도록 strtr 표) */
    private static ?array $map = null;
    private static ?string $ambigRe = null;

    /** 원문을 그대로 줘도 되는 요청인가 — 세션 관리자만(키 요청은 아님) */
    public static function raw(?array $plan = null): bool
    {
        $plan ??= Plan::current();
        return !empty($plan['admin']) && empty($plan['via_key']);
    }

    /** 기관명·지명·인명·연락처를 ○○ 로. 같은 ○○ 가 이어지면 하나로 */
    public static function generalize(string $t): string
    {
        $t = trim((string) preg_replace('/\s+/u', ' ', $t));
        if ($t === '') { return ''; }
        // 연락처·주소 꼴 먼저(숫자가 이름 표에 걸리기 전에)
        $t = (string) preg_replace('/(?<![\w.+-])[\w.+-]+@[\w-]+(\.[\w-]+)+/u', '○○@○○', $t);
        $t = (string) preg_replace('/\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:go|or|re|ac|co|ne|es|ms|hs|sc|kr|com|net|org)(?:\.kr)?\b\S*/iu', '○○', $t);
        $t = (string) preg_replace('/(?<!\d)(?:0\d{1,2}|1\d{3})[-.)\s]\d{3,4}(?:[-.]\d{4})?(?!\d)/u', '000-0000', $t);
        // 이름에 붙은 대표 번호('부산민원120'·'다산콜센터120') — 번호는 기관마다 달라 뗀다
        $t = (string) preg_replace('/(?<=[가-힣])\d{3,4}(?!\d)/u', '', $t);
        // 한자 표기 이름('(朴亨埈)') — 관공서 화면의 한자는 대부분 인명·호
        $t = (string) preg_replace('/[\x{4E00}-\x{9FFF}\x{3400}-\x{4DBF}]{2,}/u', '○○○', $t);
        // 인명: 직함 옆 세 글자 이름('시장 홍길동'·'홍길동 시장')
        $notName = self::NOT_NAME;
        $t = (string) preg_replace_callback('/(?<![가-힣])((?:' . self::SUR . ')[가-힣]{2})(\s*(?:' . self::TITLES . ')(?![가-힣]))/u', static fn (array $m): string => (in_array($m[1], $notName, true) ? $m[1] : '○○○') . $m[2], $t);
        $t = (string) preg_replace_callback('/((?<![가-힣])(?:' . self::TITLES . ')\s+)((?:' . self::SUR . ')[가-힣]{2})(?![가-힣])/u', static fn (array $m): string => $m[1] . (in_array($m[2], $notName, true) ? $m[2] : '○○○'), $t);
        // 기관명·지명
        $t = strtr($t, self::names());
        $t = (string) preg_replace(self::ambigRe(), '○○', $t);
        $t = (string) preg_replace('/(?:○○\s?)+○○/u', '○○', $t);
        // 기관명을 지운 뒤에야 보이는 '홍길동 ○○시장' 꼴
        $t = (string) preg_replace_callback('/(?<![가-힣])((?:' . self::SUR . ')[가-힣]{2})(\s*○○\s?(?:' . self::TITLES . ')(?![가-힣]))/u', static fn (array $m): string => (in_array($m[1], $notName, true) ? $m[1] : '○○○') . $m[2], $t);
        return trim($t);
    }

    /** 짧은 이름(제목·링크 글) — 일반화하고, 긴 문장(헤드라인)이면 길이만 */
    public static function label(?string $t, int $max = 20, bool $people = false): ?string
    {
        if ($t === null) { return null; }
        $t = trim((string) preg_replace('/\s+/u', ' ', $t));
        if ($t === '') { return null; }
        if (mb_strlen($t) > $max) { return '[글 ' . mb_strlen($t) . '자]'; }
        // 사람 이름이 나열될 법한 섹션에서 홀로 선 세 글자 이름('박형준'·'전재수')
        if ($people && preg_match('/^(?:' . self::SUR . ')[가-힣]{2}$/u', $t) && !in_array($t, self::NOT_NAME, true)) { return '○○○'; }
        $g = self::generalize($t);
        return $g === '' ? null : $g;
    }

    /** @param list<mixed> $list @return list<string> 개수는 그대로(빈 글만 뺀다) */
    public static function labels(array $list, int $max = 20, bool $people = false): array
    {
        $out = [];
        foreach ($list as $v) {
            if (!is_string($v)) { continue; }
            $l = self::label($v, $max, $people);
            if ($l !== null) { $out[] = $l; }
        }
        return $out;
    }

    /**
     * 긴 원문 → 모양만. kind: 제목 · 메뉴·링크 목록 · 문장 · 연락처·주소
     * @return array{chars:int, words:int, kind:string}|null
     */
    public static function shape(?string $t): ?array
    {
        if ($t === null) { return null; }
        $t = trim((string) preg_replace('/\s+/u', ' ', $t));
        if ($t === '') { return null; }
        $words = preg_split('/\s+/u', $t) ?: [];
        $n = count($words);
        $avg = $n ? mb_strlen(str_replace(' ', '', $t)) / $n : 0;
        if (preg_match('/@[\w-]+\.|(?<!\d)0\d{1,2}-\d{3,4}-\d{4}|[가-힣]+(로|길)\s?\d+|우\)\s?\d{5}|copyright|©/iu', $t)) { $kind = '연락처·주소'; }
        elseif (preg_match('/(니다|세요|어요|아요|해요|습니다|입니다)[.!?]?(\s|$)|[.!?](\s|$)/u', $t)) { $kind = '문장'; }
        elseif ($n >= 4 && $avg <= 7) { $kind = '메뉴·링크 목록'; }
        else { $kind = mb_strlen($t) <= 30 ? '제목' : '문장'; }
        return ['chars' => mb_strlen($t), 'words' => $n, 'kind' => $kind];
    }

    /** @return array<string,string> */
    private static function names(): array
    {
        if (self::$map !== null) { return self::$map; }
        $admin = '/(특별자치도|특별자치시|광역시|특별시|교육청|시청|군청|구청|도청|시|군|구|도)$/u';
        $cut = static fn (string $s): string => (string) preg_replace('/(특별자치도|특별자치시|광역시|특별시|교육청|시청|군청|구청|도청|청|시|군|구|도)$/u', '', $s);
        $ambig = array_flip(self::AMBIG);
        $set = [];
        // 이름 하나와 그 줄기를 표에 넣는다. 흔한 낱말과 겹치는 줄기는 ambigRe(뒤에 시·군·구·청)로만 잡는다
        $add = static function (string $n, int $min) use (&$set, $ambig): void {
            $n = trim($n);
            if (mb_strlen($n) < $min || isset($ambig[$n]) || preg_match('/^[\x20-\x7E]+$/', $n)) { return; }
            $set[$n] = '○○';
        };
        foreach (Db::rows('SELECT name, display_name, name_aliases, region_sido, region_sigungu FROM organizations') as $o) {
            $names = [(string) $o['name'], (string) ($o['display_name'] ?? '')];
            foreach ((array) (json_decode((string) ($o['name_aliases'] ?? ''), true) ?: []) as $a) { if (is_string($a)) { $names[] = $a; } }
            foreach ($names as $nm) {
                $nm = trim($nm);
                if ($nm === '') { continue; }
                $add($nm, 3);
                // 행정기관 이름('인천광역시'·'대전광역시 서구')은 줄기('인천'·'서구')도 지명이다
                foreach (array_merge([$nm], preg_split('/\s+/u', $nm) ?: []) as $part) {
                    if (!preg_match($admin, $part)) { continue; }
                    $add($part, 2);
                    $s1 = $cut($part); $add($s1, 2);
                    $add($cut($s1), 2);
                }
            }
            foreach ([(string) ($o['region_sido'] ?? ''), (string) ($o['region_sigungu'] ?? '')] as $rg) {
                foreach (preg_split('/\s+/u', trim($rg)) ?: [] as $part) {
                    // 지역 칸에 '의회'·'의회사무처' 가 잘못 든 행이 있다 — 행정구역 끝말(시·군·구·도…)일 때만 지명으로
                    if (!preg_match($admin, $part)) { continue; }
                    $add($part, 2); $s1 = $cut($part); $add($s1, 2); $add($cut($s1), 2);
                }
            }
        }
        foreach (explode('|', AssemblyCode::PLACES) as $p) { $add($p, 2); }
        return self::$map = $set;
    }

    private static function ambigRe(): string
    {
        return self::$ambigRe ??= '/(?:' . implode('|', self::AMBIG) . ')(?=시|군|구|청|교육)/u';
    }
}

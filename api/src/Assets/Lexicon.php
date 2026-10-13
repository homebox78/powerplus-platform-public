<?php
declare(strict_types=1);

namespace Pp\Assets;

use Pp\Core\Db;

/**
 * powerAssets 검색어 오타 교정.
 * 출처: powerPlus server/src/SearchLexicon.php 의 jamo·dist·dict·correct·correctTokens (2026-08-13 "오타 허용 검색") 를
 * 새 스키마(asset_tags 행)로 옮김. 동의어 사전(vocab)은 아직 이식 전이라 후보 사전 = 실제 등록 태그(2회 이상)만.
 *
 * 원리: 사용자는 "코드"를 "코ㅡㄷ"·"코그"처럼 자모가 밀리거나 바뀐 채로 친다. 자산마다 오타 태그를 심는 대신
 * 검색어를 자모로 풀어 실제 태그와 편집거리(뒤바뀜=1)로 대조해 고친다 — 데이터가 안 늘고 새 자산에도 그대로 적용된다.
 * 아는 낱말(사전에 있는 말)은 절대 고치지 않는다(멀쩡한 검색어를 바꾸면 더 나쁘다).
 */
final class Lexicon
{
    private const CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
    private const JUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
    private const JONG = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

    /** @var array<string,int>|null 낱말 => 가중치(태그 등장 수) */
    private static ?array $dict = null;

    /** 한글을 자모 배열로 푼다("코드" → ㅋ ㅗ ㄷ ㅡ). 한글이 아니면 글자 그대로. */
    public static function jamo(string $s): array
    {
        $out = [];
        $len = mb_strlen($s);
        for ($i = 0; $i < $len; $i++) {
            $ch = mb_substr($s, $i, 1);
            $code = mb_ord($ch, 'UTF-8');
            if ($code >= 0xAC00 && $code <= 0xD7A3) {
                $n = $code - 0xAC00;
                $out[] = self::CHO[intdiv($n, 588)];
                $out[] = self::JUNG[intdiv($n % 588, 28)];
                $j = self::JONG[$n % 28];
                if ($j !== '') {
                    $out[] = $j;
                }
            } else {
                $out[] = $ch;
            }
        }
        return $out;
    }

    /** 자모 편집거리(바뀜·빠짐·더해짐 + 앞뒤 뒤바뀜을 1로 센다). cap 을 넘으면 cap+1. */
    private static function dist(array $a, array $b, int $cap): int
    {
        $la = count($a);
        $lb = count($b);
        if (abs($la - $lb) > $cap) {
            return $cap + 1;
        }
        $prev2 = [];
        $prev = range(0, $lb);
        for ($i = 1; $i <= $la; $i++) {
            $cur = [$i];
            $best = $i;
            for ($j = 1; $j <= $lb; $j++) {
                $cost = ($a[$i - 1] === $b[$j - 1]) ? 0 : 1;
                $v = min($prev[$j] + 1, $cur[$j - 1] + 1, $prev[$j - 1] + $cost);
                if ($i > 1 && $j > 1 && $a[$i - 1] === $b[$j - 2] && $a[$i - 2] === $b[$j - 1]) {
                    $v = min($v, $prev2[$j - 2] + 1);   // 뒤바뀜("ㄷㅡ" ↔ "ㅡㄷ")도 실수 한 번
                }
                $cur[$j] = $v;
                if ($v < $best) {
                    $best = $v;
                }
            }
            if ($best > $cap) {
                return $cap + 1;
            }
            $prev2 = $prev;
            $prev = $cur;
        }
        return $prev[$lb];
    }

    /**
     * 교정 후보 사전 = 실제 등록된 키워드 태그(2회 이상, 길이 2~10). 매번 훑기 무거워 하루 단위 파일 캐시.
     * 대량 등록 직후엔 캐시를 지워야 새 낱말이 오타로 고쳐지지 않는다(powerPlus 교훈) — clearCache().
     */
    public static function dict(): array
    {
        if (self::$dict !== null) {
            return self::$dict;
        }
        $cache = self::cachePath();
        $tags = null;
        if (is_readable($cache) && (time() - (int) @filemtime($cache) < 86400)) {
            $raw = @file_get_contents($cache);
            $tags = $raw ? json_decode($raw, true) : null;
        }
        if (!is_array($tags)) {
            $tags = [];
            try {
                $rows = Db::rows("SELECT t.tag, COUNT(*) AS n FROM asset_tags t JOIN asset_items i ON i.id = t.item_id AND i.deleted_at IS NULL
                    WHERE t.axis = 'kw' GROUP BY t.tag HAVING n >= 2");
                foreach ($rows as $r) {
                    $w = mb_strtolower(trim((string) $r['tag']));
                    $l = mb_strlen($w);
                    if ($w === '' || $l < 2 || $l > 10) {
                        continue;
                    }
                    $tags[$w] = (int) $r['n'];
                }
                @file_put_contents($cache, json_encode($tags, JSON_UNESCAPED_UNICODE));
            } catch (\Throwable) {
                $tags = [];   // DB 를 못 읽으면 교정 없이 원문 그대로 검색
            }
        }
        self::$dict = $tags;
        return self::$dict;
    }

    public static function clearCache(): void
    {
        @unlink(self::cachePath());
        self::$dict = null;
    }

    private static function cachePath(): string
    {
        return rtrim(sys_get_temp_dir(), '/\\') . '/pp_assets_tagdict.json';
    }

    /** 오타로 보이는 낱말을 실제 낱말로. 고칠 게 없거나 아는 말이면 null. */
    public static function correct(string $token): ?string
    {
        // 영문 약어·영문 낱말(PUE·GPU·HTML)은 고치지 않는다 — "PUE"가 "due"로 바뀌어 엉뚱한 결과가 나왔다(2026-10-12 MCP 시험 r1).
        // 오타 교정은 자모로 재는 한글 낱말에만 의미가 있다.
        if (preg_match('/^[A-Za-z0-9._+-]+$/', trim($token))) {
            return null;
        }
        $t = mb_strtolower(trim($token));
        $len = mb_strlen($t);
        if ($len < 2 || $len > 10 || isset(self::SYNONYMS[$t])) {
            return null;   // 동의어 사전에 있는 말은 아는 말 — "지피유"를 엉뚱한 태그로 고치지 않는다
        }
        $dict = self::dict();
        if (isset($dict[$t])) {
            return null;   // 아는 말 = 오타 아님
        }
        // 아는 말의 한 조각이면(베이스 ⊂ 데이터베이스) 오타가 아니다 — 고치면 "케이스"처럼 엉뚱한 말이 된다(2026-10-10 MCP 시험)
        foreach ($dict as $w => $_) {
            if (str_contains((string) $w, $t)) {
                return null;
            }
        }
        $tj = self::jamo($t);
        $cap = $len <= 3 ? 1 : 2;   // 짧은 말일수록 엄격하게
        $best = null;
        $bestD = $cap + 1;
        $bestN = 0;
        foreach ($dict as $w => $n) {
            $w = (string) $w;
            if (abs(mb_strlen($w) - $len) > 1) {
                continue;   // 길이가 많이 다르면 다른 말
            }
            $wj = self::jamo($w);
            if (abs(count($wj) - count($tj)) > $cap) {
                continue;
            }
            $d = self::dist($tj, $wj, $cap);
            if ($d > $cap) {
                continue;
            }
            if ($d < $bestD || ($d === $bestD && $n > $bestN)) {
                $best = $w;
                $bestD = $d;
                $bestN = (int) $n;
            }
        }
        return $best;
    }

    /**
     * 띄어 쓴 복합어를 붙인다 — 이웃한 2~3개 낱말을 붙인 말이 사전에 있으면 하나로("데이터 베이스" → "데이터베이스").
     * 출처: powerPlus SearchLexicon::glue (2026-08-13 "쪼개기와 붙이기는 한 쌍").
     * @param string[] $tokens
     * @return string[]
     */
    public static function glue(array $tokens): array
    {
        $dict = self::dict();
        $out = [];
        $n = count($tokens);
        for ($i = 0; $i < $n; $i++) {
            $joined = null;
            for ($k = min(3, $n - $i); $k >= 2; $k--) {
                $w = implode('', array_slice($tokens, $i, $k));
                // 사전에 없어도 동의어 표에 있는 말이면 붙인다("smart city" → smartcity → 스마트시티, 2026-10-12 MCP 시험)
                if (isset($dict[$w]) || isset(self::SYNONYMS[$w])) {
                    $joined = $w;
                    $i += $k - 1;
                    break;
                }
            }
            $out[] = $joined ?? $tokens[$i];
        }
        return $out;
    }

    /**
     * 같은 뜻으로 함께 찾을 말(한쪽 방향). 검색 낱말 하나가 이 중 어느 것과 맞아도 된다.
     * "지피유" 0건·"서울시 로고" 에서 서울특별시 로고가 안 잡히던 것(2026-10-12 사용자 지적).
     */
    private const SYNONYMS = [
        '지피유' => ['gpu', '그래픽카드'], 'gpu' => ['지피유', '그래픽카드'], '그래픽카드' => ['gpu'],
        '씨피유' => ['cpu'], 'cpu' => ['씨피유', '프로세서'],
        '서울시' => ['서울특별시'], '부산시' => ['부산광역시'], '대구시' => ['대구광역시'], '인천시' => ['인천광역시'],
        '광주시' => ['광주광역시'], '대전시' => ['대전광역시'], '울산시' => ['울산광역시'], '세종시' => ['세종특별자치시'],
        '제주도' => ['제주특별자치도'], '경기도청' => ['경기도'],
        '탄소중립' => ['넷제로', 'net zero', 'carbon neutral'], '넷제로' => ['탄소중립'],
        '이에스지' => ['esg'], 'esg' => ['이에스지', '지속가능'],
        '에이아이' => ['ai', '인공지능'], '인공지능' => ['ai'], 'ai' => ['인공지능'],
        '데이터센터' => ['데이터 센터', 'idc', '서버실'], '서버실' => ['데이터센터'],
        '업무장면' => ['업무', '사무실'], '사무실' => ['오피스'], '회의' => ['미팅'], '미팅' => ['회의'],
        '사람' => ['인물'], '인물' => ['사람'],
        // 띄어쓰기·영문 표기가 갈려 결과가 달랐다(2026-10-12 MCP 시험) — 어느 표기로 찾아도 같은 결과
        '스마트시티' => ['스마트 시티', 'smart city', 'smartcity', 'smart-city'], 'smartcity' => ['스마트시티', 'smart city'],
        'smart-city' => ['스마트시티', 'smartcity'], 'smart city' => ['스마트시티'],
        // 영문 ↔ 한글 양쪽(2026-10-12 MCP 시험 r1-a1: "big data" 22건(엉뚱한 DNA) vs 빅데이터 430건). 띄어 쓴 영문은 glue 가 붙여 이 키로 온다.
        'bigdata' => ['빅데이터', 'big data'], '빅데이터' => ['bigdata', 'big data'],
        'cloud' => ['클라우드'], '클라우드' => ['cloud'], 'security' => ['보안'], '보안' => ['security'],
        'blockchain' => ['블록체인'], '블록체인' => ['blockchain'], 'iot' => ['사물인터넷'], '사물인터넷' => ['iot'],
        'metaverse' => ['메타버스'], '메타버스' => ['metaverse'], 'drone' => ['드론'], '드론' => ['drone'], 'robot' => ['로봇'], '로봇' => ['robot'],
        'smartfactory' => ['스마트팩토리', '스마트공장'], '스마트팩토리' => ['smart factory', '스마트공장'], '스마트공장' => ['스마트팩토리'],
        'digitaltwin' => ['디지털트윈', '디지털 트윈'], '디지털트윈' => ['digital twin', '디지털 트윈'],
        'machinelearning' => ['머신러닝'], '머신러닝' => ['machine learning'], 'deeplearning' => ['딥러닝'], '딥러닝' => ['deep learning'],
        // 기관 줄임말 ↔ 정식 이름(로고 검색 — "충북" 0건·"서울시청" 0건, 2026-10-12 MCP 시험 r1-a1)
        '서울시청' => ['서울특별시', '서울시'], '충북' => ['충청북도'], '충남' => ['충청남도'], '경북' => ['경상북도'], '경남' => ['경상남도'],
        '전북' => ['전북특별자치도', '전라북도'], '전남' => ['전라남도'], '강원' => ['강원특별자치도', '강원도'], '강원도' => ['강원특별자치도'],
        '경기' => ['경기도'], '제주' => ['제주특별자치도'], '전라북도' => ['전북특별자치도'],
        '한국토지주택공사' => ['lh', '토지주택공사'], 'lh' => ['한국토지주택공사', '토지주택공사'],
        '국토부' => ['국토교통부'], '행안부' => ['행정안전부'], '과기정통부' => ['과학기술정보통신부'], '복지부' => ['보건복지부'], '식약처' => ['식품의약품안전처'],
    ];

    /**
     * 같은 글자가 다른 뜻으로 쓰인 태그 — 그 태그로만 걸린 에셋은 뺀다.
     * "환경" 검색에 IT 의 '환경설정·운영환경' 아이콘이 섞였다(2026-10-12 MCP 시험 r1-a1).
     */
    public const SENSE_NOISE = [
        '환경' => ['환경설정', '환경 설정', '운영환경', '운영 환경', '개발환경', '개발 환경', '실행환경', '실행 환경', '테스트환경', '테스트 환경', '가상환경', '가상 환경', '작업환경', '작업 환경', '연구환경', '연구 환경'],
    ];

    /** 아는 말인가(태그 사전·동의어 표·분류 낱말) */
    public static function known(string $w): bool
    {
        return isset(self::dict()[$w]) || isset(self::SYNONYMS[$w]) || isset(self::CATEGORY_WORDS[$w]);
    }

    /**
     * 띄어 쓰지 않은 복합어를 아는 말 조각으로 쪼갠다 — "기후위기제안서" → 기후위기·제안서, "esg경영" → esg·경영.
     * 아는 말이면 그대로, 못 쪼개면 그대로(오타 교정이 이어서 본다). glue(붙이기)와 한 쌍(2026-10-12 MCP 시험 r1-a1).
     * @return string[]
     */
    public static function split(string $tok): array
    {
        if (self::known($tok)) {
            return [$tok];
        }
        // 영문·숫자와 한글이 붙은 말은 글자 갈래가 바뀌는 곳에서 먼저 나눈다(esg경영, ai활용)
        $parts = preg_split('/(?<=[a-z0-9])(?=\p{Hangul})|(?<=\p{Hangul})(?=[a-z0-9])/u', $tok) ?: [$tok];
        if (count($parts) > 1) {
            $out = [];
            foreach ($parts as $p) {
                array_push($out, ...(mb_strlen($p) >= 2 ? self::split($p) : [$p]));
            }
            return $out;
        }
        $len = mb_strlen($tok);
        if ($len < 4 || !preg_match('/^\p{Hangul}+$/u', $tok)) {
            return [$tok];
        }
        // 왼쪽을 길게 — 왼쪽이 아는 말이고 오른쪽도 아는 말(또는 다시 쪼개지는 말)일 때
        for ($i = $len - 2; $i >= 2; $i--) {
            $left = mb_substr($tok, 0, $i);
            $right = mb_substr($tok, $i);
            if (!self::known($left)) {
                continue;
            }
            if (self::known($right)) {
                return [$left, $right];
            }
            $rs = self::split($right);
            if (count($rs) > 1) {
                return array_merge([$left], $rs);
            }
        }
        return [$tok];
    }

    /** 점 찍은 영문 약어를 붙인다 — "a.i" "a.i." → ai(2026-10-12 MCP 시험 r1-a1 'A.I' 0건) */
    public static function unDot(string $tok): string
    {
        return preg_match('/^([a-z]\.){1,5}[a-z]?\.?$/', $tok) ? str_replace('.', '', $tok) : $tok;
    }

    /**
     * 색·톤 낱말 — 꾸밈말이라 점수를 가볍게 준다. 주제 낱말과 같은 무게면 "파랑 행정" 에서
     * 파랑이 진하게 붙은 드론·카메라가 행정 아이콘보다 앞섰다(2026-10-12 /powermcp 예시 시험).
     */
    public const COLOR_WORDS = [
        '파랑', '파란', '파란색', '블루', 'blue', '남색', '하늘색', '초록', '녹색', '그린', 'green',
        '빨강', '빨간', '빨간색', '레드', 'red', '노랑', '노란', '노란색', '옐로', 'yellow', '주황', '오렌지', 'orange',
        '보라', '보라색', '퍼플', 'purple', '분홍', '핑크', 'pink', '회색', '그레이', 'gray', 'grey',
        '검정', '검은', '검정색', '블랙', 'black', '흰색', '하얀', '화이트', 'white', '갈색', '브라운', 'brown',
        '톤', '컬러', '색', '색상', '무채색', '파스텔', '단색',
    ];

    /** 분류 낱말 — 검색어에서 빼고 그 분류를 앞으로 올린다("회의하는 사람들 사진" 의 '사진'은 찾을 말이 아니라 종류). */
    public const CATEGORY_WORDS = [
        '사진' => 'photo', '포토' => 'photo', 'photo' => 'photo', '실사' => 'photo',
        '로고' => 'logo', 'logo' => 'logo', 'ci' => 'logo', '심벌' => 'logo',
        '아이콘' => 'icon', 'icon' => 'icon',
        '일러스트' => 'illust', '일러' => 'illust', '삽화' => 'illust',
        '다이어그램' => 'diagram', '도식' => 'diagram',
        '장표' => 'ppt', 'ppt' => 'ppt', '슬라이드' => 'ppt',
    ];

    /** 뗄 수 있는 어미·조사(긴 것부터). 뗀 말이 사전에 있을 때만 바꾼다. */
    private const SUFFIXES = ['하는', '하기', '하고', '에서', '으로', '들의', '들이', '들', '의', '을', '를', '은', '는', '이', '가', '과', '와', '로', '에'];

    /** "회의하는"→"회의", "사람들"→"사람" — 뗀 말이 실제 태그(사전)·동의어에 있을 때만. 아는 말은 그대로. */
    public static function stem(string $tok): string
    {
        $dict = self::dict();
        if (isset($dict[$tok]) || isset(self::SYNONYMS[$tok]) || !preg_match('/\p{Hangul}$/u', $tok)) {
            return $tok;
        }
        foreach (self::SUFFIXES as $sfx) {
            if (mb_strlen($tok) - mb_strlen($sfx) >= 2 && str_ends_with($tok, $sfx)) {
                $base = mb_substr($tok, 0, mb_strlen($tok) - mb_strlen($sfx));
                if (isset($dict[$base]) || isset(self::SYNONYMS[$base])) {
                    return $base;
                }
            }
        }
        return $tok;
    }

    /** 낱말과 함께 찾을 말들(자기 자신 포함). */
    public static function variants(string $tok): array
    {
        $out = array_merge([$tok], self::SYNONYMS[$tok] ?? []);
        // "수원시청" → 수원시(로고는 기관 이름이라 '청'이 없다, 2026-10-12 MCP 시험 r1-a1)
        if (preg_match('/^(\p{Hangul}{2,}[시군구도])청$/u', $tok, $m)) {
            $out[] = $m[1];
            array_push($out, ...(self::SYNONYMS[$m[1]] ?? []));
        }
        // 아는 말이어도 어미를 뗀 말을 함께 — "사람들"(15건)은 태그라 그대로지만 "사람"(343건)도 찾아야 한다
        if (preg_match('/\p{Hangul}$/u', $tok)) {
            $dict = self::dict();
            // 아는 말에는 뜻이 분명한 어미만(전문가→전문 처럼 낱말 끝 글자를 조사로 오인하지 않게)
            foreach (['하는', '하기', '하고', '에서', '으로', '들의', '들이', '들'] as $sfx) {
                if (mb_strlen($tok) - mb_strlen($sfx) >= 2 && str_ends_with($tok, $sfx)) {
                    $base = mb_substr($tok, 0, mb_strlen($tok) - mb_strlen($sfx));
                    if (isset($dict[$base])) {
                        $out[] = $base;
                        array_push($out, ...(self::SYNONYMS[$base] ?? []));
                        break;
                    }
                }
            }
        }
        return array_values(array_unique($out));
    }

    /**
     * 토큰 목록의 오타를 고친다. [고친 토큰들, 원본 => 교정 대응표].
     * 대응표는 화면 "'코드'로 고쳐서 찾았어요" 안내용.
     * @param string[] $tokens
     * @return array{0:string[],1:array<string,string>}
     */
    public static function correctTokens(array $tokens): array
    {
        $out = [];
        $fixed = [];
        foreach ($tokens as $t) {
            $c = self::correct($t);
            if ($c !== null && $c !== $t) {
                $fixed[$t] = $c;
                $out[] = $c;
            } else {
                $out[] = $t;
            }
        }
        return [array_values(array_unique($out)), $fixed];
    }
}

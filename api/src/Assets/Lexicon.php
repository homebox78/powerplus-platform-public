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
        // 캐시는 에셋 목록이 바뀌면(수·마지막 수정 시각) 저절로 새로 — 하루 캐시라 대량 등록 직후 새 브랜드 이름이 오타로 고쳐졌다
        // (2026-10-18 semologo 로고 뒤 '네이버'→네이비·'삼성'→남성·'토스'→소스)
        $ver = self::assetsVersion();
        if (is_readable($cache) && (time() - (int) @filemtime($cache) < 86400)) {
            $raw = @file_get_contents($cache);
            $got = $raw ? json_decode($raw, true) : null;
            if (is_array($got) && ($got['v'] ?? null) === $ver && is_array($got['tags'] ?? null)) {
                $tags = $got['tags'];
                self::$pairs = is_array($got['pairs'] ?? null) ? $got['pairs'] : null;
            }
        }
        if (!is_array($tags)) {
            $tags = [];
            try {
                // 로고에 붙은 말(기관·회사 이름)은 한 번만 나와도 아는 말 — 이름은 하나뿐이라 2회 기준에 늘 빠졌다
                $rows = Db::rows("SELECT t.tag, COUNT(*) AS n, MAX(i.category = 'logo') AS logo FROM asset_tags t JOIN asset_items i ON i.id = t.item_id AND i.deleted_at IS NULL
                    WHERE t.axis = 'kw' GROUP BY t.tag HAVING n >= 2 OR logo = 1");
                foreach ($rows as $r) {
                    $w = mb_strtolower(trim((string) $r['tag']));
                    $l = mb_strlen($w);
                    if ($w === '' || $l < 2 || $l > 10) {
                        continue;
                    }
                    $tags[$w] = (int) $r['n'];
                }
                self::$pairs = self::buildPairs();
                @file_put_contents($cache, json_encode(['v' => $ver, 'tags' => $tags, 'pairs' => self::$pairs], JSON_UNESCAPED_UNICODE));
            } catch (\Throwable) {
                $tags = [];   // DB 를 못 읽으면 교정 없이 원문 그대로 검색
            }
        }
        self::$dict = $tags;
        return self::$dict;
    }

    private static ?array $pairs = null;

    private static function assetsVersion(): string
    {
        try {
            // 태그만 바뀌어도(낱말 더하기) 새로 — 태그 수를 함께 본다
            return (string) Db::val("SELECT CONCAT(COUNT(*), ':', COALESCE(MAX(updated_at), ''), ':', (SELECT COUNT(*) FROM asset_tags)) FROM asset_items");
        } catch (\Throwable) {
            return '';
        }
    }

    /**
     * 브랜드 한↔영 짝 — semologo 로고의 한글 이름 ↔ 영문 이름(공백 없이, 둘 다 통째로): 카카오↔kakao, 네이버↔naver, 카카오뱅크↔kakaobank.
     * 어느 쪽으로 찾든 같은 조건(이름·태그에 둘 중 하나)이 되게 variants 가 서로를 더한다(사용자 2026-10-18 "kakao 와 카카오 갯수가 일치해야").
     * 한 말이 여러 말과 짝이면(korea·hd 처럼 흔한 말) 넣지 않는다 — 결과가 엉뚱하게 불어난다.
     * @return array<string, string[]>
     */
    private static function buildPairs(): array
    {
        $rows = Db::rows("SELECT i.name, t.tag FROM asset_items i JOIN asset_tags t ON t.item_id = i.id AND t.lang = 'en' AND t.axis = 'kw'
            WHERE i.category = 'logo' AND i.source = 'semologo' AND i.deleted_at IS NULL");
        $link = [];
        foreach ($rows as $r) {
            $ko = preg_replace('/\s+/u', '', mb_strtolower((string) $r['name'])) ?? '';
            $en = preg_replace('/[\s.\-·]+/u', '', mb_strtolower((string) $r['tag'])) ?? '';
            if (!preg_match('/^\p{Hangul}{2,20}$/u', $ko) || !preg_match('/^[a-z0-9&+]{2,30}$/', $en) || in_array($en, ['logo', 'brand', 'korea'], true)) {
                continue;
            }
            $link[$ko][$en] = true;
            $link[$en][$ko] = true;
        }
        // 짝이 셋 이하인 말만(naver ↔ 네이버·네이버블로그) — 넷 이상은 흔한 말이라 결과가 엉뚱하게 불어난다
        $out = [];
        foreach ($link as $w => $others) {
            if (count($others) <= 3) {
                $out[(string) $w] = array_map('strval', array_keys($others));
            }
        }
        // 그룹 이름 짝 — 영문 첫 낱말이 같은 로고(samsung-card·samsung-life…) 대부분이 같은 한글 앞말(삼성)로 시작하면 samsung↔삼성.
        // 'Samsung Galaxy S23' 처럼 한글이 없는 로고가 '삼성' 으로는 안 나오던 것(2026-10-19, 사용자 "kakao 와 카카오 갯수가 일치해야")
        $group = [];
        foreach ($rows as $r) {
            $tag = mb_strtolower((string) $r['tag']);
            if (!preg_match('/^([a-z][a-z0-9]{2,})\s/', $tag, $m) || in_array($m[1], ['the', 'korea', 'korean', 'national', 'new', 'official', 'logo', 'brand'], true)) {
                continue;
            }
            $group[$m[1]][(string) $r['name']] = true;
        }
        foreach ($group as $en => $names) {
            $ko = array_values(array_filter(array_map(static fn($n) => preg_replace('/\s+/u', '', (string) $n) ?? '', array_keys($names)), static fn($n) => (bool) preg_match('/^\p{Hangul}{2}/u', $n)));
            if (count($ko) < 2) {
                continue;
            }
            $pre = [];
            foreach ($ko as $n) {
                for ($l = 2; $l <= min(4, mb_strlen($n)); $l++) {
                    $pre[mb_substr($n, 0, $l)] = ($pre[mb_substr($n, 0, $l)] ?? 0) + 1;
                }
            }
            $best = null;
            foreach ($pre as $p => $c) {
                if (preg_match('/^\p{Hangul}+$/u', (string) $p) && $c >= count($ko) * 0.7 && ($best === null || mb_strlen((string) $p) > mb_strlen($best))) {
                    $best = (string) $p;
                }
            }
            if ($best !== null) {
                $out[$en] = array_values(array_unique([...($out[$en] ?? []), $best]));
                $out[$best] = array_values(array_unique([...($out[$best] ?? []), $en]));
            }
        }
        return $out;
    }

    /** 브랜드 짝(없으면 빈 배열) */
    public static function brandPair(string $tok): array
    {
        self::dict();
        return self::$pairs[preg_replace('/\s+/u', '', $tok) ?? $tok] ?? [];
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
        $t = mb_strtolower(trim($token));
        // 한/영 전환을 잊고 친 말("qhdks"→보안, "치ㅐㅕㅇ"→cloud) — 바꾼 말이 아는 말과 똑같을 때만(2026-10-16 사용자 "오타로도 검색")
        $swap = self::keyboardSwap($t);
        if ($swap !== null) {
            return $swap;
        }
        // 영문은 5자 이상 낱말만 철자 교정(secuirty→security). 약어(PUE·GPU·HTML)는 고치지 않는다 —
        // "PUE"가 "due"로 바뀌어 엉뚱한 결과가 나왔다(2026-10-12 MCP 시험 r1).
        if (preg_match('/^[a-z0-9._+-]+$/', $t)) {
            return preg_match('/^[a-z]{5,}$/', $t) ? self::correctLatin($t) : null;
        }
        // 초성만 친 말("ㅂㅇ"→보안) — 같은 글자 수의 아는 말 중 초성이 같고 가장 많이 쓰인 것
        if (preg_match('/^[ㄱ-ㅎ]{2,6}$/u', $t)) {
            return self::fromChoseong($t);
        }
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

    /** 두벌식 자판: 영문 키 → 한글 자모(소문자로 받으므로 쌍자음·ㅒㅖ 는 shift 없이 못 친다 — 그런 말은 교정이 이어서 본다) */
    private const KEY_JAMO = [
        'q' => 'ㅂ', 'w' => 'ㅈ', 'e' => 'ㄷ', 'r' => 'ㄱ', 't' => 'ㅅ', 'y' => 'ㅛ', 'u' => 'ㅕ', 'i' => 'ㅑ', 'o' => 'ㅐ', 'p' => 'ㅔ',
        'a' => 'ㅁ', 's' => 'ㄴ', 'd' => 'ㅇ', 'f' => 'ㄹ', 'g' => 'ㅎ', 'h' => 'ㅗ', 'j' => 'ㅓ', 'k' => 'ㅏ', 'l' => 'ㅣ',
        'z' => 'ㅋ', 'x' => 'ㅌ', 'c' => 'ㅊ', 'v' => 'ㅍ', 'b' => 'ㅠ', 'n' => 'ㅜ', 'm' => 'ㅡ',
    ];
    /** 겹모음·겹받침 = 자판 두 번 */
    private const JUNG_PAIR = ['ㅘ' => 'ㅗㅏ', 'ㅙ' => 'ㅗㅐ', 'ㅚ' => 'ㅗㅣ', 'ㅝ' => 'ㅜㅓ', 'ㅞ' => 'ㅜㅔ', 'ㅟ' => 'ㅜㅣ', 'ㅢ' => 'ㅡㅣ'];
    private const JONG_PAIR = ['ㄳ' => 'ㄱㅅ', 'ㄵ' => 'ㄴㅈ', 'ㄶ' => 'ㄴㅎ', 'ㄺ' => 'ㄹㄱ', 'ㄻ' => 'ㄹㅁ', 'ㄼ' => 'ㄹㅂ', 'ㄽ' => 'ㄹㅅ', 'ㄾ' => 'ㄹㅌ', 'ㄿ' => 'ㄹㅍ', 'ㅀ' => 'ㄹㅎ', 'ㅄ' => 'ㅂㅅ'];
    /** 쌍자음 = 같은 키 shift — 소문자로 받으니 ㄲ 은 r 로 친다고 본다 */
    private const DOUBLE_KEY = ['ㄲ' => 'r', 'ㄸ' => 'e', 'ㅃ' => 'q', 'ㅆ' => 't', 'ㅉ' => 'w', 'ㅒ' => 'o', 'ㅖ' => 'p'];

    /**
     * 한/영 전환을 잊고 친 말을 바꿔 본다. 바꾼 말이 아는 말(태그 사전·동의어)일 때만 돌려준다 — 멀쩡한 영어를 한글로 바꾸지 않게
     * 원문이 아는 말이면 손대지 않는다. 영문→한글("qhdks"→보안), 한글→영문("치ㅐㅕㅇ"→cloud) 둘 다.
     */
    private static function keyboardSwap(string $t): ?string
    {
        if (mb_strlen($t) < 2 || self::known($t)) {
            return null;
        }
        if (preg_match('/^[a-z]+$/', $t)) {
            $jamo = [];
            foreach (str_split($t) as $ch) {
                $jamo[] = self::KEY_JAMO[$ch];
            }
            $h = self::composeJamo($jamo);
            return preg_match('/^\p{Hangul}+$/u', $h) && mb_strlen($h) >= 2 && self::known($h) ? $h : null;
        }
        if (preg_match('/^[\x{3131}-\x{3163}\x{AC00}-\x{D7A3}]+$/u', $t)) {
            $keyOf = array_flip(self::KEY_JAMO) + self::DOUBLE_KEY;
            $out = '';
            foreach (self::jamo($t) as $j) {
                $parts = self::JUNG_PAIR[$j] ?? self::JONG_PAIR[$j] ?? $j;
                foreach (mb_str_split($parts) as $p) {
                    if (!isset($keyOf[$p])) {
                        return null;
                    }
                    $out .= $keyOf[$p];
                }
            }
            return strlen($out) >= 3 && isset(self::dict()[$out]) ? $out : null;
        }
        return null;
    }

    /** 자모 나열을 두벌식 입력기처럼 음절로 묶는다(ㅂㅗㅇㅏㄴ → 보안, 받침이 다음 모음을 만나면 넘어간다) */
    private static function composeJamo(array $jamo): string
    {
        $isV = static fn(string $j): bool => in_array($j, self::JUNG, true);
        $jungPair = array_flip(self::JUNG_PAIR);
        $jongPair = array_flip(self::JONG_PAIR);
        $out = '';
        [$cho, $jung, $jong] = ['', '', ''];
        $flush = static function () use (&$out, &$cho, &$jung, &$jong): void {
            if ($cho !== '' && $jung !== '') {
                $out .= mb_chr(0xAC00 + array_search($cho, self::CHO, true) * 588 + array_search($jung, self::JUNG, true) * 28 + (int) array_search($jong, self::JONG, true), 'UTF-8');
            } else {
                $out .= $cho . $jung . $jong;
            }
            [$cho, $jung, $jong] = ['', '', ''];
        };
        foreach ($jamo as $j) {
            if (!$isV($j)) {
                if ($jung === '') {
                    if ($cho !== '') {
                        $flush();
                    }
                    $cho = $j;
                } elseif ($jong === '' && in_array($j, self::JONG, true) && $cho !== '') {
                    $jong = $j;
                } elseif ($jong !== '' && isset($jongPair[$jong . $j])) {
                    $jong = $jongPair[$jong . $j];
                } else {
                    $flush();
                    $cho = $j;
                }
                continue;
            }
            if ($jong !== '') {
                // 받침이 다음 모음의 첫소리로 넘어간다(겹받침이면 뒤 글자만)
                $pair = self::JONG_PAIR[$jong] ?? null;
                $next = $pair !== null ? mb_substr($pair, 1, 1) : $jong;
                $jong = $pair !== null ? mb_substr($pair, 0, 1) : '';
                $flush();
                [$cho, $jung] = [$next, $j];
            } elseif ($jung !== '' && isset($jungPair[$jung . $j])) {
                $jung = $jungPair[$jung . $j];
            } elseif ($cho !== '' && $jung === '') {
                $jung = $j;
            } else {
                $flush();
                $jung = $j;
            }
        }
        $flush();
        return $out;
    }

    /** 영문 철자 교정 — 영문 키워드 태그(n≥2)와 글자 편집거리(5~6자 1, 7자 이상 2). 아는 말·아는 말의 조각이면 고치지 않는다. */
    private static function correctLatin(string $t): ?string
    {
        $dict = self::dict();
        if (isset($dict[$t]) || isset(self::SYNONYMS[$t])) {
            return null;
        }
        $len = strlen($t);
        $cap = $len <= 6 ? 1 : 2;
        $tc = str_split($t);
        $best = null;
        $bestD = $cap + 1;
        $bestN = 0;
        foreach ($dict as $w => $n) {
            $w = (string) $w;
            if (!preg_match('/^[a-z]+$/', $w)) {
                continue;
            }
            if (str_contains($w, $t)) {
                return null;   // 아는 말의 조각(secur ⊂ security)은 부분 일치로 이미 찾는다
            }
            if (abs(strlen($w) - $len) > $cap || strlen($w) < 4) {
                continue;
            }
            $d = self::dist($tc, str_split($w), $cap);
            if ($d <= $cap && ($d < $bestD || ($d === $bestD && $n > $bestN))) {
                [$best, $bestD, $bestN] = [$w, $d, (int) $n];
            }
        }
        return $best;
    }

    /** 초성 검색 — 같은 글자 수의 한글 태그 중 초성이 같은 것, 가장 많이 쓰인 것 하나 */
    private static function fromChoseong(string $t): ?string
    {
        $len = mb_strlen($t);
        $best = null;
        $bestN = 0;
        foreach (self::dict() as $w => $n) {
            $w = (string) $w;
            if (mb_strlen($w) !== $len || !preg_match('/^\p{Hangul}+$/u', $w) || $n <= $bestN) {
                continue;
            }
            $ini = '';
            foreach (mb_str_split($w) as $ch) {
                $code = mb_ord($ch, 'UTF-8');
                if ($code < 0xAC00 || $code > 0xD7A3) {
                    continue 2;
                }
                $ini .= self::CHO[intdiv($code - 0xAC00, 588)];
            }
            if ($ini === $t) {
                [$best, $bestN] = [$w, (int) $n];
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
        // 다섯 갈래 모두 canon() 으로 '스마트시티' 가 되어 이 줄 하나로 찾는다(O-40). 다른 키는 glue·correct 가 아는 말로 보게 남긴다.
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
        // 줄임말·입말 ↔ 태그 낱말(2026-10-16 사용자 "오타·유사 단어로도 검색" — '피씨' 0건, '컴터' 가 '커터' 로 고쳐짐). 운영 태그에 있는 말로만 잇는다.
        '피씨' => ['pc', '컴퓨터'], 'pc' => ['컴퓨터', '피씨'], '컴터' => ['컴퓨터'], '컴퓨터' => ['pc'],
        '핸드폰' => ['휴대폰', '스마트폰'], '휴대폰' => ['스마트폰', '핸드폰'], '스마트폰' => ['휴대폰', '핸드폰'], '폰' => ['스마트폰', '휴대폰'],
        '노트북' => ['laptop', '랩탑'], '랩탑' => ['노트북'], 'laptop' => ['노트북'], '패드' => ['태블릿'], '아이패드' => ['태블릿'],
        '노인' => ['어르신', '노년'], '어르신' => ['노인'], '선생님' => ['교사'], '교사' => ['선생님'],
        '아이' => ['어린이', '아동'], '어린이' => ['아동', '아이'], '아동' => ['어린이'], '애들' => ['어린이', '아이'],
        '돈' => ['화폐', '현금', '지폐'], '현금' => ['돈', '화폐'], '자동차' => ['차량'], '차량' => ['자동차'],
        '직장인' => ['회사원'], '회사원' => ['직장인'], '사진기' => ['카메라'],
        '이메일' => ['메일', 'email'], '메일' => ['이메일'], 'email' => ['이메일'], '와이파이' => ['wifi', '무선인터넷'], 'wifi' => ['와이파이'],
        '큐알' => ['qr', 'qr코드'], '큐알코드' => ['qr코드'], 'qr' => ['qr코드'], '씨씨티비' => ['cctv'], 'cctv' => ['감시카메라'],
        '챗봇' => ['chatbot'], 'chatbot' => ['챗봇'], '엑셀' => ['스프레드시트'], '동영상' => ['영상'], '집' => ['주택'], '주택' => ['집', '아파트'],
        '시민' => ['주민', '국민'], '주민' => ['시민'], '공무원' => ['민원'], '택배' => ['배송'], '배송' => ['택배'],
    ];

    /**
     * 같은 글자가 다른 뜻으로 쓰인 태그 — 그 태그로만 걸린 에셋은 뺀다.
     * "환경" 검색에 IT 의 '환경설정·운영환경' 아이콘이 섞였다(2026-10-12 MCP 시험 r1-a1).
     */
    public const SENSE_NOISE = [
        '환경' => ['환경설정', '환경 설정', '운영환경', '운영 환경', '개발환경', '개발 환경', '실행환경', '실행 환경', '테스트환경', '테스트 환경', '가상환경', '가상 환경', '작업환경', '작업 환경', '연구환경', '연구 환경',
            // O-40(2026-10-15): 사무·IT 쪽 '○○ 환경' 태그로만 걸린 책상·코딩·배포 그림이 "환경" 결과 뒤쪽에 섞였다
            '업무환경', '업무 환경', '근무환경', '사무환경', '사무 환경', '배포 환경', '클라우드환경', '서버실환경', '데이터센터환경', '분석환경', '격리 환경',
            '환경설정완료', '개발환경의', '운영환경을', '연구환경을', '보안연구환경', '특수환경의'],
    ];

    /**
     * 같은 글자의 다른 뜻을 가리키는 맥락 태그 — 낱말 태그('환경')를 직접 달았어도 이 태그가 함께 있으면 관련도에서 뒤로 민다.
     * 검색어에 이 맥락어가 들어 있으면(예: "개발 환경") 감점하지 않는다.
     * "환경" 검색에 '환경' 태그를 단 설정파일·스크립트 코딩 아이콘이 섞였다(O-40, 2026-10-15) — 태그 제외(SENSE_NOISE)만으로는 못 거른다.
     */
    public const SENSE_OFF = [
        // '설정' 만으로는 넣지 않는다 — 공해 배출 '설정' 같은 환경 아이콘까지 밀렸다
        '환경' => ['환경설정', '설정화면', '코딩', '코드', '프로그래밍', '소프트웨어', '개발자', '개발환경', '구성관리', '제어판', '배포', '클라우드', '데이터센터'],
    ];

    /**
     * 띄어쓰기·영문 표기만 다른 같은 말을 한 낱말로 — 점수(태그가 낱말과 똑같음)가 표기마다 달라 순서가 갈렸다.
     * 스마트시티 태그가 '스마트시티·스마트 시티·smart city·smartcity·smart-city' 5갈래(O-40, 2026-10-15).
     */
    private const CANON = [
        'smartcity' => '스마트시티', 'smart-city' => '스마트시티', 'smart city' => '스마트시티', '스마트 시티' => '스마트시티', 'smart_city' => '스마트시티',
    ];

    /**
     * 자리·문맥을 말하는 낱말 — 찾을 대상이 아니다("민원 처리 기간 단축 문장 옆 아이콘" 의 문장·옆).
     * 다른 낱말이 있을 때만 검색어에서 뺀다(O-23, 2026-10-15: '문장' 이 '문자' 로 고쳐져 검색을 흐렸다).
     */
    public const PLACE_WORDS = [
        '옆', '옆에', '위', '위에', '아래', '아래에', '곁', '옆자리', '문장', '문장에', '문구', '문구에', '글귀', '텍스트', '제목', '제목에', '설명', '본문에',
        '어울리는', '어울릴', '어울림', '들어갈', '넣을', '넣는', '쓸', '쓰는', '사용할', '같은', '느낌', '느낌의', '분위기', '스타일', '스타일로', '세트로', '같이', '용도', '한개',
    ];

    /** 쓰임새 낱말 — 장표를 찾는 말이 아니면 주제가 아니다. 검색 넓히기에서 가볍게 친다(O-23). */
    public const USAGE_WORDS = ['제안서', '보고서', '발표', '발표자료', '표지', '간지', '목차', '슬라이드', '장표', '문서', '자료', '홈페이지', '배너', '카드뉴스'];

    /** 표기 갈래를 대표 표기로(없으면 그대로). 함께 찾을 말은 variants(대표 표기) 가 모두 가진다. */
    public static function canon(string $tok): string
    {
        return self::CANON[$tok] ?? $tok;
    }

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
        $out = array_merge([$tok], self::SYNONYMS[$tok] ?? [], self::brandPair($tok));
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

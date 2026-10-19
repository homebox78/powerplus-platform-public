<?php
declare(strict_types=1);

namespace Pp\Deck;

use Pp\Core\Jev;
use Pp\Core\Triage;

/**
 * 장표 글 검사(완성 전) — 엔진 마무리 단계가 장마다 글(deck_text.json)과 기획(plan.json)을 보낸다(사용자 2026-10-19 "만든 게 오타나 잘못된 게 없는지 판정").
 *  1) 오타·맞춤법: 장 전체를 한 번 물어(0.5 이상) 걸린 장만 줄마다 다시 묻고 0.6 이상인 줄을 알린다
 *  2) 기획에 없는 숫자: 장 글의 숫자 중 기획(그 장 content·message·title + 전체 core)에 없는 숫자가 든 줄을 골라, 기획과 다른지 묻는다
 *  3) 개인 정보: 휴대전화·주민번호 꼴은 규칙으로, 사람 이름+연락처는 Jev 로
 * 2026-10-19 시험: 문장 오타 18/20 · 장 단위 9/10 · 기획 대조 10/10 · 개인 정보 4/4. 그림(렌더)으로는 오타를 못 찾아(8/16) 글로만 묻는다.
 * Jev 원칙 — 실패·상한·꺼짐이면 그 검사는 빈 결과. 한 장표(작업)에 Jev 120번 상한.
 */
final class TextCheck
{
    private const CALL_CAP = 120;
    private static int $calls = 0;

    private static function yes(string $state, string $q): ?float
    {
        if (self::$calls >= self::CALL_CAP) {
            return null;
        }
        self::$calls++;
        return Jev::yes('deck_check', $state, $q);
    }

    /** 검사할 줄 — 숫자·기호뿐이거나 너무 짧은 줄(장 번호·도식 낱말)은 뺀다 */
    private static function lines(string $text): array
    {
        $out = [];
        foreach (preg_split('/\R/u', $text) ?: [] as $ln) {
            $ln = trim((string) preg_replace('/^[-·•※\s]+/u', '', $ln));
            if (mb_strlen($ln) >= 8 && preg_match_all('/\p{Hangul}/u', $ln) >= 4) {
                $out[] = mb_substr($ln, 0, 200);
            }
        }
        return array_values(array_unique($out));
    }

    /** 숫자(쉼표·소수점 붙은 꼴 그대로, 1자리는 뺀다 — 단계 번호 1·2·3 이 매번 걸렸다) */
    private static function numbers(string $s): array
    {
        preg_match_all('/\d[\d,]*(?:\.\d+)?/u', $s, $m);
        return array_values(array_unique(array_filter(array_map(static fn ($x) => str_replace(',', '', $x), $m[0]), static fn ($x) => strlen($x) >= 2)));
    }

    /**
     * @param array{title?:string, core?:string, slides?:list<array>} $plan
     * @param list<array{n:int, text:string}> $slides
     * @return list<array{slide:int, title:string, detail:string, level:string}>
     */
    public static function run(array $plan, array $slides): array
    {
        self::$calls = 0;
        $byN = [];
        foreach ((array) ($plan['slides'] ?? []) as $p) {
            $byN[(int) ($p['n'] ?? 0)] = $p;
        }
        $core = (string) ($plan['title'] ?? '') . ' ' . (string) ($plan['core'] ?? '');
        $out = [];
        foreach (array_slice($slides, 0, 60) as $s) {
            $n = (int) ($s['n'] ?? 0);
            $text = mb_substr((string) ($s['text'] ?? ''), 0, 6000);
            if (trim($text) === '') {
                continue;
            }
            $lines = self::lines($text);

            // 3) 개인 정보 — 규칙이 확실한 것
            if (preg_match('/01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}|\d{6}[-\s]?[1-4]\d{6}/u', $text, $m)) {
                $out[] = ['slide' => $n, 'title' => '개인 정보로 보이는 번호', 'detail' => "'" . mb_substr($m[0], 0, 4) . "…' — 휴대전화·주민번호 꼴입니다. 실제 정보면 지워 주세요.", 'level' => 'warn'];
            }

            // 1) 오타 — 장 단위로만 알린다. 줄 단위는 실제 장표 글(끊긴 조각·겹친 공백·줄표)에서 원문 줄도 0.5~0.62 가 나와
            //    오타 줄을 가려내지 못했다(5장 중 2, 2026-10-19). 장 단위는 원문 0.38~0.47 · 오타 넣은 장 0.54~0.89(10장 중 9).
            //    위치는 한 줄이 둘째보다 0.1 넘게 튈 때만 후보로 덧붙인다
            $p = self::yes("장표 {$n}쪽 글:\n" . Triage::scrub($text, 4000), '이 장표 글 어딘가에 한국어 오타·맞춤법 틀린 낱말이 하나라도 있다');
            if ($p !== null && $p >= 0.52) {
                $ps = [];
                foreach (array_slice($lines, 0, 30) as $ln) {
                    $q = self::yes('장표 문장: ' . $ln, '이 한국어 문장에 맞춤법·오타·띄어쓰기 잘못이 있다');
                    if ($q !== null) {
                        $ps[$ln] = $q;
                    }
                }
                arsort($ps);
                $v = array_values($ps);
                $hint = $v && $v[0] - ($v[1] ?? 0) >= 0.1 ? " 의심 줄: '" . mb_substr((string) array_key_first($ps), 0, 50) . "'" : '';
                $out[] = ['slide' => $n, 'title' => '오타·맞춤법 확인', 'detail' => '이 장 글에 오타·맞춤법 틀린 낱말이 있을 수 있습니다(확신 ' . round($p * 100) . '%).' . $hint, 'level' => 'info'];
            }

            // 2) 기획과 다른 숫자
            $pl = $byN[$n] ?? null;
            if ($pl) {
                $src = implode(' ', [(string) ($pl['title'] ?? ''), (string) ($pl['message'] ?? ''), (string) ($pl['content'] ?? ''), $core]);
                $known = array_flip(self::numbers($src));
                $shown = 0;
                foreach ($lines as $ln) {
                    $odd = array_values(array_filter(self::numbers($ln), static fn ($x) => !isset($known[$x])));
                    if (!$odd || $shown >= 3 || preg_match('/01[016789][-\s.]?\d{3,4}|\d{6}[-\s]?[1-4]\d{6}/u', $ln)) {   // 전화번호 줄은 위 개인 정보에서 이미 알렸다
                        continue;
                    }
                    $q = self::yes("기획: " . Triage::scrub(mb_substr($src, 0, 2500), 2500) . "\n장표 문장: {$ln}", '장표 문장의 숫자(기간·건수·금액·비율·연도)가 기획과 다르거나, 기획 어디에도 근거가 없다');
                    if ($q !== null && $q >= 0.6) {
                        $shown++;
                        $out[] = ['slide' => $n, 'title' => '기획에 없는 숫자', 'detail' => "'" . mb_substr($ln, 0, 60) . "' 의 " . implode('·', array_slice($odd, 0, 3)) . ' — 기획서와 다르거나 근거가 없는 숫자입니다. 출처를 확인해 주세요(확신 ' . round($q * 100) . '%)', 'level' => 'warn'];
                    }
                }
            }
        }
        return $out;
    }
}

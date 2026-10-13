<?php
declare(strict_types=1);

namespace Pp\Core;

/**
 * 개인 정보 가림 — 테스트 계정(업무 보고용 관리자 열람)이 보는 응답에서 다른 회원의 이메일·이름·연락처를 가린다
 * (사이트 종합 평가 리포트 1-1, 2026-10-09).
 *  - 이메일 ab***@g***.com · 이름 첫 글자 + ** · 전화 010-****-1234
 *  - 응답 JSON 전체를 훑는다: 키 이름이 email/phone/tel 이면 값 전체, 같은 묶음에 이메일 키가 있으면 이름 키도,
 *    그 밖의 모든 글(문의 내용·메모 등)에서는 이메일·전화 모양만 바꾼다.
 *  - 자기 이메일(테스트 계정 자신)은 그대로 둔다.
 * 라우트마다 부르지 않고 Router 가 출력 버퍼 하나로 건다(TestLogin::guard) — 새 관리자 화면이 생겨도 저절로 적용된다.
 */
final class Mask
{
    // owner = 관리자 장표 작업·시안 행의 주인 이름(같은 행에 email·owner_email 이 있다) — 2026-10-14 공개 README 캡처에서 가려지지 않은 것 발견
    private const NAME_KEYS = ['name', 'owner', 'user_name', 'owner_name', 'author_name', 'author', 'display_name', 'requester_name', 'actor_name', 'member_name', 'real_name', 'nickname'];
    private const PERSON_KEYS = ['handled_by', 'created_by', 'updated_by', 'reviewed_by', 'replied_by', 'user_name', 'owner_name', 'author_name', 'requester_name', 'actor_name', 'member_name', 'real_name'];
    private const EMAIL_RE = '/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/u';
    private const PHONE_RE = '/(?<![A-Za-z0-9])(01[016789]|0[2-6][0-9]?)[\s.\-]?(\d{3,4})[\s.\-]?(\d{4})(?![A-Za-z0-9])/';

    public static function email(string $e): string
    {
        $e = trim($e);
        if (!str_contains($e, '@')) {
            return $e === '' ? $e : self::name($e);
        }
        [$local, $domain] = explode('@', $e, 2);
        $dot = strrpos($domain, '.');
        $host = $dot === false ? $domain : substr($domain, 0, $dot);
        $tld = $dot === false ? '' : substr($domain, $dot);
        return mb_substr($local, 0, 2) . '***@' . mb_substr($host, 0, 1) . '***' . $tld;
    }

    public static function name(string $n): string
    {
        $n = trim($n);
        if ($n === '') {
            return $n;
        }
        return mb_substr($n, 0, 1) . '**';
    }

    public static function phone(string $p): string
    {
        return (string) preg_replace_callback(self::PHONE_RE, static fn (array $m): string => $m[1] . '-****-' . $m[3], $p);
    }

    /** 글 속의 이메일·전화 모양만 바꾼다 */
    public static function text(string $s, string $keep = ''): string
    {
        if ($s === '') {
            return $s;
        }
        $s = (string) preg_replace_callback(self::EMAIL_RE, static fn (array $m): string => ($keep !== '' && strcasecmp($m[0], $keep) === 0) ? $m[0] : self::email($m[0]), $s);
        return self::phone($s);
    }

    /** JSON 값 전체를 훑어 가린다. $keep = 가리지 않을 자기 이메일 */
    public static function apply(mixed $v, string $keep = ''): mixed
    {
        if (is_string($v)) {
            return self::text($v, $keep);
        }
        if (!is_array($v)) {
            return $v;
        }
        // 같은 묶음에 이메일 키가 있고 그 값이 자기 이메일이 아니면 이름도 가린다(사용자 행)
        $person = false;
        $self = false;
        foreach ($v as $k => $x) {
            if (is_string($k) && is_string($x) && preg_match('/(^|_)email$/i', $k) && str_contains($x, '@')) {
                if ($keep !== '' && strcasecmp(trim($x), $keep) === 0) {
                    $self = true;
                } else {
                    $person = true;
                }
            }
        }
        foreach ($v as $k => $x) {
            if (is_string($k) && is_string($x)) {
                $lk = strtolower($k);
                if (preg_match('/(^|_)emails?$/', $lk)) {
                    $v[$k] = ($keep !== '' && strcasecmp(trim($x), $keep) === 0) ? $x : implode(', ', array_map([self::class, 'email'], array_filter(array_map('trim', explode(',', $x)), 'strlen')));
                    continue;
                }
                if (preg_match('/(^|_)(phone|tel|mobile)$/', $lk)) {
                    $p = self::phone($x);
                    $v[$k] = ($x === '' || $p !== $x) ? $p : mb_substr($x, 0, 3) . '****';
                    continue;
                }
                // 사람 이름만 담는 키(처리자·작성자 등)는 이메일이 없어도 가린다
                if (in_array($lk, self::PERSON_KEYS, true) && $x !== '') {
                    $v[$k] = self::name($x);
                    continue;
                }
                if ($person && !$self && in_array($lk, self::NAME_KEYS, true)) {
                    $v[$k] = self::name($x);
                    continue;
                }
            }
            $v[$k] = self::apply($x, $keep);
        }
        return $v;
    }

    /** ob_start 콜백 — JSON 응답만 고친다 */
    public static function buffer(string $out, string $keep = ''): string
    {
        $json = false;
        foreach (headers_list() as $h) {
            if (stripos($h, 'content-type:') === 0 && stripos($h, 'json') !== false) {
                $json = true;
                break;
            }
        }
        if (!$json || $out === '') {
            return $out;
        }
        $d = json_decode($out, true);
        if (!is_array($d)) {
            return $out;
        }
        $enc = json_encode(self::apply($d, $keep), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        return $enc === false ? $out : $enc;
    }
}

<?php
declare(strict_types=1);
/**
 * 배포 전 검사 — 클로저(function(){})가 use 없이 바깥 변수를 쓰는 곳 찾기. php -l 은 못 잡는다(실행해야 Undefined variable).
 * 2026-10-12 사고: mockref Sites.php nav_states 클로저가 $id 를 use 없이 써서 사이트 상세 전체 500.
 * 판정: 클로저 몸통에서 쓰는데 인자·use·몸통 안 대입(=, foreach as, list, catch, global, static, 참조로 받는 함수 인자) 어디에도 없으면 문제.
 * 정말 의도한 줄은 같은 줄에 "preflight-ok" 주석. 사용: php closures.php 파일... (문제 있으면 종료 코드 1)
 */
const SUPER = ['$this', '$GLOBALS', '$_GET', '$_POST', '$_SERVER', '$_COOKIE', '$_FILES', '$_ENV', '$_REQUEST', '$_SESSION', '$http_response_header', '$argv', '$argc'];
/** 참조로 값을 받는 함수: 이 번호(0부터) 이후 인자의 변수는 정의된 것으로 본다 */
const BYREF = ['preg_match' => 2, 'preg_match_all' => 2, 'parse_str' => 1, 'exec' => 1, 'openssl_sign' => 1, 'getimagesize' => 1, 'flock' => 2, 'similar_text' => 2, 'str_replace' => 3, 'str_ireplace' => 3, 'preg_replace' => 4, 'preg_replace_callback' => 4, 'fsockopen' => 2, 'array_walk' => 0, 'sort' => 0, 'usort' => 0, 'ksort' => 0, 'uasort' => 0, 'shuffle' => 0];

function nx(array $t, int $i): int
{
    $n = count($t);
    for ($i++; $i < $n; $i++) {
        if (!(is_array($t[$i]) && in_array($t[$i][0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true))) {
            return $i;
        }
    }
    return $n;
}

function pv(array $t, int $i): int
{
    for ($i--; $i >= 0; $i--) {
        if (!(is_array($t[$i]) && in_array($t[$i][0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true))) {
            return $i;
        }
    }
    return -1;
}

function s(mixed $tok): string
{
    return is_array($tok) ? $tok[1] : (string) $tok;
}

function tid(mixed $tok): int
{
    return is_array($tok) ? $tok[0] : 0;
}

/** 여는 괄호 위치 → 짝 닫는 괄호 위치 */
function close(array $t, int $i): int
{
    $o = s($t[$i]);
    $c = ['(' => ')', '{' => '}', '[' => ']'][$o] ?? '';
    $d = 0;
    $n = count($t);
    for ($j = $i; $j < $n; $j++) {
        $x = s($t[$j]);
        if ($x === $o || ($o === '{' && in_array(tid($t[$j]), [T_CURLY_OPEN, T_DOLLAR_OPEN_CURLY_BRACES], true))) {
            $d++;
        } elseif ($x === $c) {
            if (--$d === 0) {
                return $j;
            }
        }
    }
    return $n - 1;
}

/** 몸통 [a, b] 안에서 정의되는 변수 */
function defined_in(array $t, int $a, int $b): array
{
    $set = [];
    $assign = ['=', '.=', '+=', '-=', '*=', '/=', '%=', '??=', '|=', '&=', '^=', '**=', '<<=', '>>='];
    for ($i = $a; $i <= $b; $i++) {
        $tk = $t[$i];
        if (tid($tk) === T_STRING && isset(BYREF[strtolower($tk[1])])) {
            $from = BYREF[strtolower($tk[1])];
            $p = nx($t, $i);
            if (s($t[$p] ?? '') === '(') {
                $e = close($t, $p);
                $arg = 0;
                $d = 0;
                for ($k = $p + 1; $k < $e; $k++) {
                    $x = s($t[$k]);
                    if (in_array($x, ['(', '[', '{'], true)) {
                        $d++;
                    } elseif (in_array($x, [')', ']', '}'], true)) {
                        $d--;
                    } elseif ($x === ',' && $d === 0) {
                        $arg++;
                    } elseif ($d === 0 && tid($t[$k]) === T_VARIABLE && $arg >= $from) {
                        $set[$t[$k][1]] = true;
                    }
                }
            }
        }
        if (tid($tk) !== T_VARIABLE) {
            continue;
        }
        $v = $tk[1];
        $n = nx($t, $i);
        $ns = s($t[$n] ?? '');
        if (in_array($ns, $assign, true)) {
            $set[$v] = true;
            continue;
        }
        if ($ns === '[') { // $a[...] = …
            $e = close($t, $n);
            $m = nx($t, $e);
            while (s($t[$m] ?? '') === '[') {
                $e = close($t, $m);
                $m = nx($t, $e);
            }
            if (in_array(s($t[$m] ?? ''), $assign, true)) {
                $set[$v] = true;
                continue;
            }
        }
        $p = pv($t, $i);
        $pt = $p >= 0 ? tid($t[$p]) : 0;
        if (in_array($pt, [T_AS, T_DOUBLE_ARROW, T_GLOBAL, T_STATIC], true) || ($p >= 0 && s($t[$p]) === '&')) {
            $set[$v] = true;
            continue;
        }
        if (in_array($pt, [T_STRING, T_NAME_QUALIFIED, T_NAME_FULLY_QUALIFIED], true)) { // catch (X $e)
            $q = pv($t, $p);
            while ($q >= 0 && s($t[$q]) === '|') {
                $q = pv($t, pv($t, $q));
            }
            if ($q >= 0 && s($t[$q]) === '(') {
                $r = pv($t, $q);
                if ($r >= 0 && tid($t[$r]) === T_CATCH) {
                    $set[$v] = true;
                    continue;
                }
            }
        }
        // [$a, $b] = … / list($a) = … / foreach … as [$a, $b]
        for ($k = $i - 1, $d = 0; $k >= $a; $k--) {
            $x = s($t[$k]);
            if ($x === ']' || $x === ')') {
                $d++;
            } elseif ($x === '[' || $x === '(') {
                if ($d > 0) {
                    $d--;
                    continue;
                }
                $e = close($t, $k);
                $m = nx($t, $e);
                $before = pv($t, $k);
                $bt = $before >= 0 ? tid($t[$before]) : 0;
                if (s($t[$m] ?? '') === '=' && ($x === '[' || $bt === T_LIST)) {
                    $set[$v] = true;
                }
                if ($bt === T_AS) {
                    $set[$v] = true;
                }
                if ($bt === T_DOUBLE_ARROW && $x === '[') { // foreach (… as $k => [$a, $b])
                    for ($r = pv($t, $before); $r >= $a && !in_array(s($t[$r]), [';', '{', '}', '('], true); $r = pv($t, $r)) {
                        if (tid($t[$r]) === T_AS) {
                            $set[$v] = true;
                            break;
                        }
                    }
                }
                if ($x === '[' && $before >= 0 && s($t[$before]) === ',') {
                    continue; // 안쪽 목록 [[$a], $b]
                }
                break;
            } elseif (in_array($x, [';', '{', '}'], true)) {
                break;
            }
        }
    }
    return $set;
}

$bad = 0;
foreach (array_slice($argv, 1) as $file) {
    $src = (string) file_get_contents($file);
    $t = token_get_all($src);
    $n = count($t);
    $lines = explode("\n", $src);
    for ($i = 0; $i < $n; $i++) {
        if (tid($t[$i]) !== T_FUNCTION) {
            continue;
        }
        $p = nx($t, $i);
        if (s($t[$p] ?? '') === '&') {
            $p = nx($t, $p);
        }
        if (s($t[$p] ?? '') !== '(') {
            continue; // 이름 있는 함수·메서드는 건너뜀
        }
        $pe = close($t, $p);
        $known = [];
        for ($k = $p; $k <= $pe; $k++) {
            if (tid($t[$k]) === T_VARIABLE) {
                $known[$t[$k][1]] = true;
            }
        }
        $q = nx($t, $pe);
        if ($q < $n && tid($t[$q]) === T_USE) {
            $ue = close($t, nx($t, $q));
            for ($k = $q; $k <= $ue; $k++) {
                if (tid($t[$k]) === T_VARIABLE) {
                    $known[$t[$k][1]] = true;
                }
            }
            $q = nx($t, $ue);
        }
        while ($q < $n && s($t[$q]) !== '{' && s($t[$q]) !== ';') {
            $q++; // 반환 형식
        }
        if ($q >= $n || s($t[$q]) !== '{') {
            continue;
        }
        $be = close($t, $q);
        // 안쪽 클로저 몸통은 따로 검사 — 그 use 목록만 이 클로저의 사용으로 센다
        $skip = [];
        for ($k = $q + 1; $k < $be; $k++) {
            if (tid($t[$k]) !== T_FUNCTION) {
                continue;
            }
            $pp = nx($t, $k);
            if (s($t[$pp]) === '&') {
                $pp = nx($t, $pp);
            }
            if (s($t[$pp]) !== '(') {
                continue;
            }
            $ppe = close($t, $pp);
            $qq = nx($t, $ppe);
            $us = $ue2 = -1;
            if (tid($t[$qq]) === T_USE) {
                $us = $qq;
                $ue2 = close($t, nx($t, $qq));
                $qq = nx($t, $ue2);
            }
            while ($qq < $be && s($t[$qq]) !== '{') {
                $qq++;
            }
            $ie = close($t, $qq);
            for ($m = $k; $m <= $ie; $m++) {
                if ($m < $us || $m > $ue2) {
                    $skip[$m] = true;
                }
            }
            $k = $ie;
        }
        $inner = defined_in($t, $q + 1, $be - 1);
        for ($k = $q + 1; $k < $be; $k++) { // fn() => 인자
            if (tid($t[$k]) === T_FN) {
                $ap = nx($t, $k);
                if (s($t[$ap]) === '&') {
                    $ap = nx($t, $ap);
                }
                $ae = close($t, $ap);
                for ($m = $ap; $m <= $ae; $m++) {
                    if (tid($t[$m]) === T_VARIABLE) {
                        $inner[$t[$m][1]] = true;
                    }
                }
            }
        }
        for ($k = $q + 1; $k < $be; $k++) {
            if (isset($skip[$k]) || tid($t[$k]) !== T_VARIABLE) {
                continue;
            }
            $v = $t[$k][1];
            if (isset($known[$v]) || isset($inner[$v]) || in_array($v, SUPER, true)) {
                continue;
            }
            $prev = pv($t, $k);
            if ($prev >= 0 && in_array(tid($t[$prev]), [T_DOUBLE_COLON, T_OBJECT_OPERATOR, T_NULLSAFE_OBJECT_OPERATOR], true)) {
                continue; // Foo::$bar
            }
            $line = $t[$k][2];
            if (str_contains($lines[$line - 1] ?? '', 'preflight-ok')) {
                continue;
            }
            echo "❌ $file:$line 클로저가 정의 안 된 변수 $v 를 씀 (use 에 넣었나?)\n";
            $bad++;
            $known[$v] = true;
        }
    }
}
exit($bad > 0 ? 1 : 0);

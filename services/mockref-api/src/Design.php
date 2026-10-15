<?php
declare(strict_types=1);

namespace Homebox;

/**
 * 디자인 데이터 정규화 — 읽는 쪽(API)에서 한 번 더 걸러 낸다 (2026-09-23, MCP 실효성 연구 후속).
 * 워커(extract.ts)도 같은 규칙을 갖지만 이미 저장된 사이트를 재수집 없이 고치려면 여기서도 필요하다.
 *
 *  - 폰트 패밀리 표기 통일: "Noto Sans Kr" / "NotoSansKR" / "noto sans kr" → "Noto Sans KR" (통계 버킷이 갈리던 원인)
 *  - 타이포 스케일 이상치: size < 8px 또는 > 96px 인 역할은 null (수원시 h2=3px 오탐)
 *  - 역할별 색 이상치: 흰 배경 대비 1.5 미만 글자색은 어두운 배경 위 표본 → 버리거나 다음 후보로 대체(heading 은 h3·h4·body)
 *  - 행간: px 이면 배수로, 범위 밖·메뉴·버튼(칸 높이)은 버림
 *  - section_gap 0 은 "측정 실패", 거터·섹션 간격 4px 미만은 구분선 → null
 */
final class Design
{
    /** 표기 변형 → 정규명. 키는 소문자·공백 제거 */
    private const FAMILY = [
        'pretendard' => 'Pretendard', 'pretendardgov' => 'Pretendard GOV', 'pretendardvariable' => 'Pretendard Variable',
        'notosanskr' => 'Noto Sans KR', 'notosanscjkkr' => 'Noto Sans KR', 'notokr' => 'Noto Sans KR', 'notosans' => 'Noto Sans',
        'nanumgothic' => 'Nanum Gothic', 'nanumsquare' => 'NanumSquare', 'nanumsquareround' => 'NanumSquare Round', 'nanumbarungothic' => 'Nanum Barun Gothic',
        'scoredream' => 'S-Core Dream', 's-coredream' => 'S-Core Dream', 'scdream' => 'S-Core Dream',
        'spoqahansans' => 'Spoqa Han Sans', 'spoqahansansneo' => 'Spoqa Han Sans Neo',
        'malgungothic' => 'Malgun Gothic', '맑은고딕' => 'Malgun Gothic', 'applesdgothicneo' => 'Apple SD Gothic Neo',
        'gmarketsans' => 'Gmarket Sans', 'gothica1' => 'Gothic A1', 'ibmplexsanskr' => 'IBM Plex Sans KR', 'roboto' => 'Roboto',
        'sans-serif' => 'sans-serif', 'dotum' => 'Dotum', '돋움' => 'Dotum', 'gulim' => 'Gulim', '굴림' => 'Gulim',
    ];

    /** 본문 계열 역할 — 행간 1.2~2.2 규칙을 거는 대상(흰 글자 표본은 모든 역할에 onDark 로 건다) */
    public const TEXT_ROLES = ['body', 'link', 'caption', 'footer', 'subtitle'];

    /** 줄 높이가 칸 높이인 역할 — 행간을 재지 않는다 (O-15) */
    public const BOX_ROLES = ['nav', 'button'];

    /** 흰 배경 대비 1.5 미만 = 흰 배경에선 안 읽히는 글자색 → 어두운 배경 위 표본 (O-15) */
    public static function onDark(mixed $hex): bool
    {
        return is_string($hex) && preg_match('/^#[0-9A-F]{6}$/i', $hex) === 1 && self::contrast($hex, '#FFFFFF') < 1.5;
    }

    /** 두 색의 대비 비 (WCAG) */
    public static function contrast(string $a, string $b): float
    {
        $la = self::lum($a);
        $lb = self::lum($b);
        return round((max($la, $lb) + 0.05) / (min($la, $lb) + 0.05), 2);
    }

    public static function family(?string $f): ?string
    {
        if ($f === null || trim($f) === '') {
            return null;
        }
        $key = strtolower(preg_replace('/[\s_"\']+/u', '', $f) ?? '');
        if (isset(self::FAMILY[$key])) {
            return self::FAMILY[$key];
        }
        // 미등록 폰트는 단어 첫 글자 대문자 + 단일 공백으로만 정리 (표기 갈림 최소화)
        return preg_replace('/\s+/', ' ', trim($f));
    }

    /** @param array<string,mixed>|null $t  @return array<string,mixed>|null */
    public static function typography(?array $t): ?array
    {
        if ($t === null) {
            return null;
        }
        if (is_array($t['families'] ?? null)) {
            $merged = [];
            foreach ($t['families'] as $fam) {
                $name = self::family($fam['family'] ?? null);
                if ($name === null) {
                    continue;
                }
                if (!isset($merged[$name])) {
                    $merged[$name] = $fam + ['family' => $name, 'share' => 0.0, 'roles' => []];
                    $merged[$name]['family'] = $name;
                    $merged[$name]['share'] = 0.0;
                    $merged[$name]['roles'] = [];
                }
                $merged[$name]['share'] += (float) ($fam['share'] ?? 0);
                $merged[$name]['roles'] = array_values(array_unique(array_merge($merged[$name]['roles'], (array) ($fam['roles'] ?? []))));
            }
            usort($merged, static fn (array $a, array $b): int => $b['share'] <=> $a['share']);
            $t['families'] = array_values($merged);
        }
        $notes = [];
        if (is_array($t['scale'] ?? null)) {
            foreach ($t['scale'] as $role => $s) {
                if (!is_array($s)) {
                    continue;
                }
                $size = (float) ($s['size'] ?? 0);
                if ($size < 8 || $size > 96) {
                    $t['scale'][$role] = null; // 오탐(3px 등) 은 없는 것으로
                    continue;
                }
                if (isset($s['family'])) {
                    $t['scale'][$role]['family'] = self::family($s['family']);
                }
                // 행간 (2026-10-12 MCP 품질시험 3차): px 값이면 글자 크기 비율로 바꾼 뒤 판정.
                // 메뉴·버튼은 줄 높이 = 칸 높이라 2.86·3 같은 값이 잡힌다 → 2.2 넘으면 버림. 본문 계열은 1.2 미만(1.0)도 측정 오류로 본다.
                $lh = $s['line_height'] ?? null;
                // 행간은 글 덩어리(본문 계열·제목)에서만 잰다 — 메뉴·버튼은 줄 높이가 칸 높이라 1.5 처럼 범위 안 값도 행간이 아니다 (O-15, 2026-10-15)
                if (is_numeric($lh) && in_array($role, self::BOX_ROLES, true)) {
                    $t['scale'][$role]['line_height'] = null;
                    $notes[] = "{$role} 행간 {$lh} 은 메뉴·버튼 칸 높이라 행간으로 쓰지 않음";
                    $lh = null;
                }
                if (is_numeric($lh)) {
                    $lh = (float) $lh;
                    if ($lh > 4) {
                        $lh = round($lh / $size, 2);
                        $t['scale'][$role]['line_height'] = $lh;
                    }
                    [$lo, $hi] = in_array($role, self::TEXT_ROLES, true) ? [1.2, 2.2] : [0.9, 2.2];
                    if ($lh < $lo || $lh > $hi) {
                        $t['scale'][$role]['line_height'] = null;
                        $notes[] = "{$role} 행간 {$lh} 은 범위({$lo}~{$hi}) 밖이라 버림 — 메뉴·버튼 줄 높이가 잡힌 것으로 의심";
                    }
                }
                // 글자색이 흰 배경 대비 1.5 미만(흰색·아주 옅은 회색)이면 어두운 배경(히어로·띠·바닥) 위 표본 — 역할 색으로 쓰지 않는다.
                // 전엔 본문 계열 + 거의 흰색(휘도 0.85+)만 걸러 서울시 h3 #FFFFFF 가 제목 색으로 남았다 (O-15, 2026-10-15)
                // 메뉴·버튼은 자기 칸 배경 위 글자라 흰 글자가 정상일 수 있다 — 버튼은 DesignSystem 이 글자/배경 짝 대비로 따로 본다
                if (!in_array($role, self::BOX_ROLES, true) && self::onDark($s['color'] ?? null)) {
                    $t['scale'][$role]['color'] = null;
                    $notes[] = "{$role} 글자색 {$s['color']} 는 흰 배경 대비 " . number_format(self::contrast((string) $s['color'], '#FFFFFF'), 2) . ':1 이라 어두운 배경 위 표본으로 보고 버림(측정 오류 의심)';
                }
            }
            // 제목(h1~h4) 크기가 본문보다 작으면 측정 오류 — 본문과 같거나 작은 제목은 버린다
            $body = (float) ($t['scale']['body']['size'] ?? 0);
            foreach (['h1', 'h2', 'h3'] as $h) {
                if ($body > 0 && is_array($t['scale'][$h] ?? null) && (float) $t['scale'][$h]['size'] < $body) {
                    $t['scale'][$h] = null;
                }
            }
        }
        if (is_array($t['sizes'] ?? null)) {
            $t['sizes'] = array_values(array_filter($t['sizes'], static fn ($x): bool => (float) ($x['size'] ?? 0) >= 8));
        }
        if ($notes !== []) {
            $t['notes'] = $notes;
        }
        return $t;
    }

    /** @param array<string,mixed>|null $c  @param array<string,mixed>|null $scale  @return array<string,mixed>|null */
    public static function colors(?array $c, ?array $scale): ?array
    {
        if ($c === null) {
            return null;
        }
        $isWhite = static fn (?string $hex): bool => self::onDark($hex); // 흰 배경 대비 1.5 미만 = 어두운 배경 위 표본(O-15 — 전엔 휘도 0.85+ 만)
        if ($isWhite($c['heading'] ?? null)) {
            // 히어로(배경 사진 위 흰 제목) 표본 → 본문 영역 제목 색으로 대체
            $alt = null;
            foreach (['h3', 'h4', 'body'] as $r) {
                $v = $scale[$r]['color'] ?? null;
                if (is_string($v) && !$isWhite($v)) {
                    $alt = $v;
                    break;
                }
            }
            $c['heading'] = $alt;
            $c['heading_note'] = '메인 히어로의 흰 제목이 표본으로 잡혀 본문 제목 색으로 대체함';
        }
        // 본문·링크 글자색이 흰색이면 어두운 배경 위 표본 (2026-10-12 MCP 품질시험 3차: 서울시 본문 #FFFFFF, 경기도교육청 링크 #FFFFFF)
        // 측정된 배경색이 없으므로 흰색 후보를 버리고 다음 후보(스케일의 본문 계열 색)를 쓴다
        $next = static function (array $roles) use ($scale, $isWhite): ?string {
            foreach ($roles as $r) {
                $v = $scale[$r]['color'] ?? null;
                if (is_string($v) && preg_match('/^#[0-9A-F]{6}$/i', $v) === 1 && !$isWhite($v)) {
                    return strtoupper($v);
                }
            }
            return null;
        };
        $fallback = [
            'body' => ['body', 'subtitle', 'footer', 'caption', 'link', 'h4', 'h3'],
            'link' => ['link', 'body', 'subtitle', 'footer', 'caption'],
        ];
        foreach ($fallback as $role => $order) {
            if ($isWhite($c[$role] ?? null)) {
                $old = $c[$role];
                $c[$role] = $next($order);
                $c[$role . '_note'] = "{$role} 글자색 {$old} 는 어두운 배경 위 표본이라 버리고 " . ($c[$role] ?? '없음') . ' 로 대체';
            }
        }
        return $c;
    }

    /** @param array<string,mixed>|null $s  @return array<string,mixed>|null */
    public static function spacing(?array $s): ?array
    {
        if ($s === null) {
            return null;
        }
        if (isset($s['section_gap_px']) && (int) $s['section_gap_px'] <= 0) {
            $s['section_gap_px'] = null; // 0 = 블록 경계 측정 실패
        }
        // 거터·섹션 간격 4px 미만은 간격이 아니라 구분선(1px 테두리)이 잡힌 것 (2026-10-12 서울시 gutter 1·section_gap 1)
        foreach (['gutter_px' => '거터', 'section_gap_px' => '섹션 간격'] as $k => $label) {
            if (isset($s[$k]) && is_numeric($s[$k]) && (int) $s[$k] < 4) {
                $s[$k . '_note'] = "{$label} {$s[$k]}px 는 구분선 두께로 보고 버림";
                $s[$k] = null;
            }
        }
        if (isset($s['input_height']) && ((int) $s['input_height'] < 24 || (int) $s['input_height'] > 80)) {
            $s['input_height'] = null;
        }
        return $s;
    }

    /** @param list<array<string,mixed>> $fonts  @return list<array<string,mixed>> */
    public static function fonts(array $fonts): array
    {
        foreach ($fonts as &$f) {
            if (isset($f['family'])) {
                $f['family'] = self::family($f['family']);
            }
        }
        unset($f);
        return $fonts;
    }

    /**
     * 주색 보정 (2026-09-24, MCP 공백 분석): 추출된 primary 가 흰 배경과 거의 같은 면색(군산 #E4EBF1, 대비 1.2)이면
     * 주색으로 쓸 수 없다 → 팔레트에서 흰 배경 대비 3:1 이상 + 채도 있는 첫 색. 없으면 원래 값.
     * @param list<array<string,mixed>> $palette  @return array{hex: ?string, note: ?string}
     */
    public static function primary(?string $primary, array $palette): array
    {
        $ok = static fn (?string $h): bool => is_string($h) && preg_match('/^#[0-9A-F]{6}$/i', $h) === 1;
        $contrast = static fn (string $h): float => 1.05 / (self::lum($h) + 0.05);
        $sat = static function (string $h): float { [$r, $g, $b] = sscanf($h, '#%02x%02x%02x'); $mx = max($r, $g, $b); return $mx === 0 ? 0.0 : ($mx - min($r, $g, $b)) / $mx; };
        // 브라우저 기본 링크색(#0000EE·#0000FF·방문 #551A8B)은 사이트 색이 아니다 — 스타일 없는 링크에서 잡힌 값 (2026-09-30 MCP 시험: 20곳, 목업이 원색 파랑으로 나옴)
        $uaLink = static fn (?string $h): bool => is_string($h) && in_array(strtoupper($h), ['#0000EE', '#0000FF', '#551A8B'], true);
        if ($uaLink($primary)) {
            foreach ($palette as $p) {
                $h = $p['hex'] ?? null;
                if ($ok($h) && !$uaLink($h) && $contrast($h) >= 3 && $sat($h) >= 0.2) {
                    return ['hex' => strtoupper($h), 'note' => "추출 주색 {$primary} 는 브라우저 기본 링크색이라 팔레트의 " . strtoupper($h) . ' 로 대체'];
                }
            }
            return ['hex' => null, 'note' => "추출 주색 {$primary} 는 브라우저 기본 링크색이라 쓰지 않음"];
        }
        if (!$ok($primary) || $contrast((string) $primary) >= 1.6) {
            return ['hex' => $ok($primary) ? strtoupper((string) $primary) : null, 'note' => null];
        }
        foreach ($palette as $p) {
            $h = $p['hex'] ?? null;
            if ($ok($h) && !$uaLink($h) && $contrast($h) >= 3 && $sat($h) >= 0.25) {
                return ['hex' => strtoupper($h), 'note' => "추출 주색 {$primary} 가 흰 배경 대비 " . round($contrast((string) $primary), 2) . ':1 인 면색이라 팔레트의 ' . strtoupper($h) . ' 로 대체'];
            }
        }
        return ['hex' => strtoupper((string) $primary), 'note' => '주색 대비가 낮음(면색일 수 있음)'];
    }

    private static function lum(string $hex): float
    {
        $h = ltrim($hex, '#');
        if (strlen($h) !== 6) {
            return 0.0;
        }
        [$r, $g, $b] = [hexdec(substr($h, 0, 2)), hexdec(substr($h, 2, 2)), hexdec(substr($h, 4, 2))];
        $f = static function (int $c): float { $c /= 255; return $c <= 0.03928 ? $c / 12.92 : (($c + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * $f($r) + 0.7152 * $f($g) + 0.0722 * $f($b);
    }
}

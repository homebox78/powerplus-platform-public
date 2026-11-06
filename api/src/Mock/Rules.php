<?php
declare(strict_types=1);

namespace Pp\Mock;

/**
 * powerMock 판정·공개 규칙 중 DB 없이 시험할 수 있는 것(2026-11-01 전체 검수). 라우트는 api/routes/mock.php.
 * 시험: packages/mcp/test/mock-api-1101.test.mjs
 */
final class Rules
{
    /**
     * 관리자가 폐기한 시안인가(SQL 조각) — 표에 폐기 주체 칸이 없어, 폐기 때 같이 남는 감사 기록(mock.mockup.discard)으로 가른다.
     * 판정 탈락 폐기는 이 기록이 없다. 복원 뒤 판정에서 다시 떨어진 폐기는 옛 기록보다 시각이 늦어 판정 폐기로 본다(5초는 시계 어긋남 여유).
     * 바깥 질의의 mock_mockups 행(별칭 없이)에 붙여 쓴다.
     */
    public const NOT_ADMIN_DISCARDED = "NOT EXISTS (SELECT 1 FROM core_audit a WHERE a.target_type = 'mockup' AND a.target_id = mock_mockups.public_id AND a.action = 'mock.mockup.discard' AND a.created_at >= mock_mockups.discarded_at - INTERVAL 5 SECOND)";

    /**
     * 판정 기록 서명 확인. 'html' = HTML 해시까지 묶인 서명(새 powerMCP) · 'legacy' = 옛 판 powerMCP 의 token|score|pass · null = 거부.
     * 새 서명 헤더가 있으면 그것만 본다 — 틀렸는데 옛 서명으로 넘어가지 않는다. 비밀을 쥔 쪽은 powerMCP 뿐이라 사용자가 옛 형식을 만들어 낼 수 없다.
     */
    public static function judgeSignature(string $token, int $score, int $pass, string $htmlSha256, string $sigHtml, string $sigLegacy, string $secret): ?string
    {
        if ($secret === '') {
            return null;
        }
        if ($sigHtml !== '') {
            return $htmlSha256 !== '' && hash_equals(hash_hmac('sha256', "{$token}|{$score}|{$pass}|{$htmlSha256}", $secret), $sigHtml) ? 'html' : null;
        }
        return $sigLegacy !== '' && hash_equals(hash_hmac('sha256', "{$token}|{$score}|{$pass}", $secret), $sigLegacy) ? 'legacy' : null;
    }

    /** 세트 열쇠 — 카드에 token 을 싣지 않는다(token 은 게시 주소·판정 기록을 여는 값이라 30P 잠금이 뚫렸다). token 은 무작위 128비트라 해시에서 되돌릴 수 없다 */
    public static function setKey(string $rootToken): string
    {
        return substr(hash('sha256', $rootToken), 0, 24);
    }

    /** ?set= 값 → 세트 열쇠. 예전 주소(?set=token)도 그대로 열린다. 문자는 걸러 받는다 */
    public static function setParam(string $raw): string
    {
        $v = (string) preg_replace('/[^A-Za-z0-9_-]/', '', $raw);
        return $v === '' || preg_match('/^[0-9a-f]{24}$/', $v) ? $v : self::setKey($v);
    }

    /** 샘플 원본 주소는 웹 사본으로 — 예전 묶음(url_template …/original)으로 만든 시안도 가볍게 연다 */
    public static function webSamples(string $html): string
    {
        return (string) preg_replace('#(/api/v1/assets/samples/[a-z0-9]{8,32})/original\b#', '$1/web', $html);
    }

    /**
     * 같은 세트의 페이지 이름 → 게시 주소. $rows 는 게시 중인 세트 행(token·page, 최근 판정 순).
     * @param list<array{token:string,page:?string}> $rows
     * @return array<string,string>
     */
    public static function siblingMap(array $rows, string $root): array
    {
        $map = [];
        foreach ($rows as $s) {
            $pg = $s['token'] === $root ? 'main' : (string) ($s['page'] ?? '');
            if ($pg !== '' && !isset($map[$pg])) {
                $map[$pg] = '/api/v1/p/' . $s['token'];
            }
        }
        if (isset($map['main'])) {
            $map['index'] = $map['main'];
        }
        return $map;
    }

    /** main.html·greeting.html 같은 파일 이름 링크를 게시 주소로(없는 페이지는 그대로) */
    public static function linkPages(string $html, array $map): string
    {
        if (!$map) {
            return $html;
        }
        return (string) preg_replace_callback('/\bhref="(?:\.\/)?([a-z_]+)\.html(#[^"]*)?"/', static fn (array $mm) => isset($map[$mm[1]]) ? 'href="' . $map[$mm[1]] . ($mm[2] ?? '') . '"' : $mm[0], $html);
    }
}

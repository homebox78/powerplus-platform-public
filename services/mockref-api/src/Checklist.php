<?php
declare(strict_types=1);

namespace Homebox;

/**
 * 디자인 개선 체크리스트 (2026-10-03 사용자: "체크리스트들이 테스트하면서 계속 쌓일테고 그게 좋은 디자인 좋은 목업의 지름길").
 * 같은 결함은 한 줄(slug)에 횟수(hits)와 최근 근거로 쌓는다. 고친 줄이 다시 걸리면 regressed 로 다시 연다.
 * 쓰는 곳: check_mockup 판정 기록(judge) · 시험 스크립트·검수(test, 관리자 토큰) · 관리자 화면(manual)
 */
final class Checklist
{
    public const AREAS = [
        'layout' => '배치·간격', 'visual' => '색·면', 'type' => '글자', 'behavior' => '동작', 'content' => '내용·이미지',
        'data' => '수집·분해 데이터', 'mcp' => 'MCP 응답·묶음', 'preference' => '디자이너 선호', 'mockup' => '기타',
    ];
    public const STATUSES = ['open', 'fixing', 'fixed', 'watch', 'wontfix'];

    /** 판정 고칠 목록의 머리말(" · " 앞) → 분야 */
    private const JUDGE_AREA = [
        '/간격|빈칸|높이|폭|틀|옆 메뉴|서브 비주얼|덮임|가로 스크롤|반응형|묶음/u' => 'layout',
        '/색|묻힘|밝기/u' => 'visual',
        '/글자|섹션 제목/u' => 'type',
        '/동작|움직임|주 메뉴|검색|게이트/u' => 'behavior',
        '/지도|이미지|누출|기관/u' => 'content',
    ];

    /**
     * @param array{at?:string,src?:string,ref?:string,score?:int,note?:string} $ev
     * @return array{id:int,created:bool,regressed:bool}
     */
    public static function record(string $slug, string $area, string $title, ?string $detail, string $origin, array $ev = []): array
    {
        $slug = mb_substr(trim($slug), 0, 160);
        $area = isset(self::AREAS[$area]) ? $area : 'mockup';
        $origin = in_array($origin, ['judge', 'test', 'pref', 'manual'], true) ? $origin : 'manual';
        $ev = array_filter([
            'at' => $ev['at'] ?? date('Y-m-d H:i'), 'src' => isset($ev['src']) ? mb_substr((string) $ev['src'], 0, 120) : null,
            'ref' => isset($ev['ref']) ? mb_substr((string) $ev['ref'], 0, 120) : null, 'score' => isset($ev['score']) ? (int) $ev['score'] : null,
            'note' => isset($ev['note']) ? mb_substr((string) $ev['note'], 0, 400) : null,
        ], static fn ($v) => $v !== null && $v !== '');
        $row = Db::row('SELECT id, status, evidence FROM design_checklist WHERE slug = ?', [$slug]);
        if ($row === null) {
            Db::exec('INSERT INTO design_checklist (slug, area, title, detail, origin, evidence) VALUES (?, ?, ?, ?, ?, ?)', [
                $slug, $area, mb_substr($title, 0, 200), $detail !== null ? mb_substr($detail, 0, 4000) : null, $origin,
                json_encode([$ev], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ]);
            return ['id' => (int) Db::pdo()->lastInsertId(), 'created' => true, 'regressed' => false];
        }
        $list = json_decode((string) $row['evidence'], true) ?: [];
        array_unshift($list, $ev);
        $list = array_slice($list, 0, 20);
        $re = $row['status'] === 'fixed'; // 고쳤다고 한 것이 다시 걸림 → 다시 연다
        Db::exec('UPDATE design_checklist SET hits = hits + 1, last_seen = NOW(3), evidence = ?' . ($re ? ", status = 'open', regressed = 1" : '')
            . ($detail !== null ? ', detail = COALESCE(detail, ?)' : '') . ' WHERE id = ?',
            array_merge([json_encode($list, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)], $detail !== null ? [mb_substr($detail, 0, 4000)] : [], [(int) $row['id']]));
        return ['id' => (int) $row['id'], 'created' => false, 'regressed' => $re];
    }

    /** check_mockup 판정 결과(fixes·hard)를 쌓는다 — 같은 머리말은 한 줄 */
    public static function fromJudge(array $result, string $src, ?string $ref, int $score): void
    {
        $seen = [];
        foreach ((array) ($result['hard_fails'] ?? $result['hard'] ?? []) as $h) {
            $h = (string) $h; $key = mb_substr((string) preg_replace('/[0-9.,%]+/u', '#', $h), 0, 60);
            if (isset($seen['h' . $key])) { continue; } $seen['h' . $key] = 1;
            self::record('judge-hard:' . $key, self::judgeArea($h), '치명 · ' . $h, null, 'judge', ['src' => $src, 'ref' => $ref, 'score' => $score, 'note' => $h]);
        }
        foreach ((array) ($result['fixes'] ?? []) as $f) {
            $f = (string) $f;
            $head = self::headOf($f);
            if ($head === '' || isset($seen[$head])) { continue; } $seen[$head] = 1;
            self::record('judge:' . $head, self::judgeArea($head), $head, null, 'judge', ['src' => $src, 'ref' => $ref, 'score' => $score, 'note' => $f]);
        }
    }

    private static function headOf(string $f): string
    {
        $p = mb_strpos($f, ' · ');
        if ($p !== false && $p <= 24) { return trim(mb_substr($f, 0, $p)); }
        foreach (['높이' => '/높이가 레퍼런스/u', '밝기 구성' => '/밝기 구성/u', '동작 규약' => '/동작 규약/u'] as $k => $re) { if (preg_match($re, $f)) { return $k; } }
        return trim(mb_substr((string) preg_replace('/[0-9.,%#]+/u', '', $f), 0, 20));
    }

    private static function judgeArea(string $s): string
    {
        foreach (self::JUDGE_AREA as $re => $a) { if (preg_match($re, $s)) { return $a; } }
        return 'mockup';
    }
}

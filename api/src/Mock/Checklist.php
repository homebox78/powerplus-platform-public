<?php
/**
 * powerMock 개선 체크리스트 — 목업 제작 때 검수 항목 증적.
 * 출처: homebox-handoff api/src/Checklist.php (record·fromJudge·headOf·judgeArea 그대로, 표 mock_checklist, 근거에 시안 token).
 * 같은 결함은 한 줄(slug)에 횟수(hits)와 최근 근거 20개로 쌓는다. 고친 줄이 다시 걸리면 regressed 로 다시 연다.
 */
declare(strict_types=1);

namespace Pp\Mock;

use Pp\Core\Db;
use Pp\Core\Triage;

final class Checklist
{
    public const AREAS = [
        'layout' => '배치·간격', 'visual' => '색·면', 'type' => '글자', 'behavior' => '동작', 'content' => '내용·이미지',
        'data' => '수집·분해 데이터', 'mcp' => 'MCP 응답·묶음', 'preference' => '디자이너 선호', 'mockup' => '기타',
    ];
    public const STATUSES = ['open', 'fixing', 'fixed', 'watch', 'wontfix'];
    public const ORIGINS = ['judge', 'test', 'pref', 'manual'];

    /** 판정 고칠 목록의 머리말(" · " 앞) → 분야 */
    private const JUDGE_AREA = [
        // 구성·반응형 규칙 중 색·그림 쪽은 먼저 가른다(아래 layout 줄이 '구성' 으로 전부 잡기 전에)
        '/글자 강약|꾸밈 아이콘|아이콘 단추|글자가 바탕/u' => 'visual',
        '/이미지 비율|배경 사진|팝업존|글자 든 그림/u' => 'content',
        '/간격|빈칸|높이|폭|틀|옆 메뉴|서브 비주얼|덮임|가로 스크롤|반응형|묶음|구성|불균형|성긴|걸침|첫 화면|빈 띠|짝|탭 줄|꺾임|구분선|화면 밖|중복/u' => 'layout',
        '/색|묻힘|밝기/u' => 'visual',
        '/글자|섹션 제목/u' => 'type',
        '/동작|움직임|주 메뉴|검색|게이트/u' => 'behavior',
        '/지도|이미지|누출|노출|기관/u' => 'content',
    ];

    /**
     * @param array{at?:string,src?:string,ref?:string,token?:string,score?:int,note?:string} $ev
     * @return array{id:int,created:bool,regressed:bool}
     */
    public static function record(string $slug, string $area, string $title, ?string $detail, string $origin, array $ev = []): array
    {
        $slug = mb_substr(trim($slug), 0, 160);
        $area = isset(self::AREAS[$area]) ? $area : 'mockup';
        $origin = in_array($origin, self::ORIGINS, true) ? $origin : 'manual';
        $ev = self::evidence($ev);
        $row = Db::row('SELECT id, status, evidence FROM mock_checklist WHERE slug = ?', [$slug]);
        if ($row === null) {
            Db::exec('INSERT INTO mock_checklist (slug, area, title, detail, origin, evidence) VALUES (?, ?, ?, ?, ?, ?)', [
                $slug, $area, mb_substr($title, 0, 200), $detail !== null ? mb_substr($detail, 0, 4000) : null, $origin,
                json_encode([$ev], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ]);
            return ['id' => Db::lastId(), 'created' => true, 'regressed' => false];
        }
        $list = json_decode((string) $row['evidence'], true) ?: [];
        array_unshift($list, $ev);
        $list = array_slice($list, 0, 20);
        $re = $row['status'] === 'fixed'; // 고쳤다고 한 것이 다시 걸림 → 다시 연다
        Db::exec('UPDATE mock_checklist SET hits = hits + 1, last_seen = NOW(3), evidence = ?' . ($re ? ", status = 'open', regressed = 1, fixed_at = NULL" : '')
            . ($detail !== null ? ', detail = COALESCE(detail, ?)' : '') . ' WHERE id = ?',
            array_merge([json_encode($list, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)], $detail !== null ? [mb_substr($detail, 0, 4000)] : [], [(int) $row['id']]));
        return ['id' => (int) $row['id'], 'created' => false, 'regressed' => $re];
    }

    private static function evidence(array $ev): array
    {
        $cut = static fn ($v, int $n) => isset($v) && $v !== '' ? mb_substr((string) $v, 0, $n) : null;
        return array_filter([
            'at' => $ev['at'] ?? date('Y-m-d H:i'),
            'src' => $cut($ev['src'] ?? null, 120),
            'ref' => $cut($ev['ref'] ?? null, 120),
            'token' => $cut($ev['token'] ?? null, 64),
            'score' => isset($ev['score']) ? (int) $ev['score'] : null,
            'note' => $cut($ev['note'] ?? null, 400),
        ], static fn ($v) => $v !== null && $v !== '');
    }

    /** 판정 결과(hard_fails·fixes)에서 체크리스트 slug 목록 — 같은 머리말은 한 번 */
    public static function slugsOf(array $result): array
    {
        $out = [];
        foreach ((array) ($result['hard_fails'] ?? $result['hard'] ?? []) as $h) {
            $h = (string) $h;
            $out['judge-hard:' . self::hardKey($h)] = ['area' => self::judgeArea($h), 'title' => '치명 · ' . $h, 'note' => $h];
        }
        foreach ((array) ($result['fixes'] ?? []) as $f) {
            if (!is_string($f)) {
                continue;
            }
            $head = self::headOf($f);
            if ($head === '' || isset($out['judge:' . $head])) {
                continue;
            }
            $out['judge:' . $head] = ['area' => self::judgeArea($head), 'title' => $head, 'note' => $f];
        }
        return $out;
    }

    /**
     * 판정 응답에 싣는 "지난 시안들에서 반복된 결함" — 쌓기만 하고 되먹임이 없던 고리를 닫는다(2026-10-15 점검, 출처: Deck\Checklist::lessons).
     * 조건도 장표와 같다: 열림·고치는 중 + (2번 이상 걸림 또는 다시 걸림). 수집·MCP 분야는 시안 작성자가 고칠 수 없어 뺀다. 응답 크기(MC-23) 때문에 8줄·한 줄 120자.
     * @return list<array{area:string,text:string,hits:int}>
     */
    public static function lessons(int $limit = 8): array
    {
        $out = [];
        foreach (Db::rows("SELECT area, title, fix_note, hits FROM mock_checklist
                           WHERE status IN ('open','fixing') AND area NOT IN ('data','mcp') AND (hits >= 2 OR regressed = 1)
                           ORDER BY regressed DESC, hits DESC, last_seen DESC LIMIT " . max(1, min(20, $limit))) as $r) {
            $rule = trim((string) ($r['fix_note'] ?? ''));
            $out[] = ['area' => self::AREAS[$r['area']] ?? (string) $r['area'], 'hits' => (int) $r['hits'], 'text' => mb_substr($rule !== '' ? $rule : '피할 것: ' . $r['title'], 0, 120)];
        }
        return $out;
    }

    /** 시안 판정 결과를 쌓는다 — 같은 머리말은 한 줄 */
    public static function fromJudge(array $result, string $token, ?string $ref, int $score): void
    {
        foreach (self::slugsOf($result) as $slug => $x) {
            self::record($slug, $x['area'], $x['title'], null, 'judge', [
                'src' => 'check_mockup', 'ref' => $ref, 'token' => $token, 'score' => $score, 'note' => $x['note'],
            ]);
        }
    }

    private static function hardKey(string $h): string
    {
        return mb_substr((string) preg_replace('/[0-9.,%]+/u', '#', $h), 0, 60);
    }

    private static function headOf(string $f): string
    {
        $p = mb_strpos($f, ' · ');
        if ($p !== false && $p <= 24) {
            $h = trim(mb_substr($f, 0, $p));
            // 구성·반응형·게이트는 규칙이 여럿이다 — "구성 · 나란한 칸 높이·내용 불균형" 처럼 규칙 이름까지 한 줄(2026-10-15 사용자 눈 점검 20건을 규칙별로 쌓기)
            if (in_array($h, ['구성', '반응형', '게이트'], true)) {
                $rest = mb_substr($f, $p + 3);
                $c = mb_strpos($rest, ':');
                $name = trim((string) preg_replace('/^(모바일|태블릿)\s+/u', '', $c !== false ? mb_substr($rest, 0, $c) : mb_substr($rest, 0, 30)));
                return mb_substr($h . ' · ' . $name, 0, 60);
            }
            return $h;
        }
        foreach (['높이' => '/높이가 레퍼런스/u', '밝기 구성' => '/밝기 구성/u', '동작 규약' => '/동작 규약/u'] as $k => $re) {
            if (preg_match($re, $f)) {
                return $k;
            }
        }
        return trim(mb_substr((string) preg_replace('/[0-9.,%#]+/u', '', $f), 0, 20));
    }

    private static function judgeArea(string $s): string
    {
        foreach (self::JUDGE_AREA as $re => $a) {
            if (preg_match($re, $s)) {
                return $a;
            }
        }
        // 규칙이 못 고른 것만 빠른 판단(Jev)에 묻는다 — 같은 문장은 기록에서 꺼내므로 다시 과금되지 않는다
        return Triage::checklistArea($s) ?? 'mockup';
    }

    /** 화면용 한 줄 */
    public static function pub(array $r, bool $withEvidence = true): array
    {
        $o = [
            'id' => (int) $r['id'], 'slug' => $r['slug'], 'area' => $r['area'], 'area_name' => self::AREAS[$r['area']] ?? $r['area'],
            'title' => $r['title'], 'detail' => $r['detail'], 'origin' => $r['origin'], 'status' => $r['status'], 'hits' => (int) $r['hits'],
            'regressed' => (bool) $r['regressed'], 'fix_note' => $r['fix_note'], 'fix_commit' => $r['fix_commit'],
            'first_seen' => $r['first_seen'], 'last_seen' => $r['last_seen'], 'fixed_at' => $r['fixed_at'],
        ];
        if ($withEvidence) {
            $o['evidence'] = json_decode((string) ($r['evidence'] ?? ''), true) ?: [];
        }
        return $o;
    }
}

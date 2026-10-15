<?php
/**
 * powerDeck 개선 체크리스트 — 장표 작업에서 반복되는 결함을 쌓고, 많이 걸린 열린 항목을 다음 작업 엔진 지시에 되먹인다(자가 개선).
 * 구조는 powerMock 체크리스트(Pp\Mock\Checklist)와 같다: 같은 결함은 한 줄(slug)에 횟수와 최근 근거 20개, 고친 줄이 다시 걸리면 다시 연다.
 * 쌓이는 곳: ① 와이어프레임 검사(시안 단계 완료) ② 엔진 확인 목록(result.json checklist) ③ 사용자 의견(다시 만들기·수정 요청·핀)
 *            ④ 실패 사유 ⑤ 관리자 직접.
 * 되먹임: lessons() — 열림·고치는 중이고 2번 이상 걸렸거나 다시 걸린 항목을 짧은 규칙으로. 관리자가 적은 '고친 방법(fix_note)'이 있으면 그 문장이 규칙이 된다.
 * 쌓기는 늘 실패해도 작업을 막지 않는다(호출부에서 try).
 */
declare(strict_types=1);

namespace Pp\Deck;

use Pp\Core\Db;

final class Checklist
{
    public const AREAS = [
        'plan' => '기획·내용', 'wire' => '와이어프레임', 'mockup' => '시안 디자인', 'type' => '글자·넘침',
        'assets' => '아이콘·이미지', 'build' => '장표 마감', 'script' => '대본', 'engine' => '엔진·실패', 'misc' => '기타',
    ];
    public const STATUSES = ['open', 'fixing', 'fixed', 'watch', 'wontfix'];
    public const ORIGINS = ['wire', 'report', 'user', 'fail', 'manual'];

    /** 문장 → 분야(먼저 맞는 것) */
    private const AREA_RE = [
        '/넘침|넘칩|잘림|잘려|밖으로|줄바꿈|줄 수|글자|서체|폰트|글씨|자간|행간/u' => 'type',
        '/아이콘|이미지|그림|사진|로고|자산|일러스트/u' => 'assets',
        '/겹침|겹칩|배치|정렬|간격|여백|칸|상자|레이아웃|헤드라인 자리/u' => 'wire',
        '/색|컬러|톤|배경|분위기|디자인|스타일/u' => 'mockup',
        '/대본|발표 원고|멘트/u' => 'script',
        '/수치|내용|문구|오타|틀린|목차|기획|제목|메시지|빠졌|누락/u' => 'plan',
        '/머리 띠|바닥|표지|간지|마감|렌더/u' => 'build',
        '/실패|오류|시간 초과|timed out|연결|엔진/u' => 'engine',
    ];

    /** 사용자 의견 주제 — 한 의견이 여러 주제에 걸리면 각각 쌓는다 */
    private const USER_TOPICS = [
        '글자 크기·서체' => '/글자|글씨|서체|폰트|크기|굵게|작게|크게/u',
        '색·톤' => '/색|컬러|톤|밝|어둡|분홍|파랑|빨강|초록/u',
        '아이콘·이미지' => '/아이콘|이미지|그림|사진|로고|일러스트/u',
        '배치·간격' => '/배치|정렬|간격|여백|겹|위치|레이아웃|가운데|왼쪽|오른쪽/u',
        '넘침·잘림' => '/넘|잘|밖으로|안 보/u',
        '내용·문구' => '/내용|문구|오타|틀|수치|숫자|문장|제목|빠졌|누락|추가해/u',
        '분량·장 수' => '/장 수|장수|분량|너무 많|너무 적|줄여|늘려/u',
    ];
    private const TOPIC_AREA = ['글자 크기·서체' => 'type', '색·톤' => 'mockup', '아이콘·이미지' => 'assets', '배치·간격' => 'wire', '넘침·잘림' => 'type', '내용·문구' => 'plan', '분량·장 수' => 'plan'];

    /**
     * @param array{at?:string,job?:string,title?:string,slide?:int,note?:string} $ev
     * @return array{id:int,created:bool,regressed:bool}
     */
    public static function record(string $slug, string $area, string $title, ?string $detail, string $origin, array $ev = []): array
    {
        $slug = mb_substr(trim($slug), 0, 160);
        $area = isset(self::AREAS[$area]) ? $area : 'misc';
        $origin = in_array($origin, self::ORIGINS, true) ? $origin : 'manual';
        $ev = self::evidence($ev);
        $row = Db::row('SELECT id, status, evidence FROM deck_checklist WHERE slug = ?', [$slug]);
        if ($row === null) {
            Db::exec('INSERT INTO deck_checklist (slug, area, title, detail, origin, evidence) VALUES (?, ?, ?, ?, ?, ?)', [
                $slug, $area, mb_substr($title, 0, 200), $detail !== null ? mb_substr($detail, 0, 4000) : null, $origin,
                json_encode([$ev], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ]);
            return ['id' => Db::lastId(), 'created' => true, 'regressed' => false];
        }
        $list = json_decode((string) $row['evidence'], true) ?: [];
        // 같은 작업·같은 장의 같은 근거는 한 번만(엔진이 같은 판을 여러 번 보고해도 횟수가 부풀지 않게)
        foreach ($list as $old) {
            if (is_array($old) && ($old['job'] ?? null) === ($ev['job'] ?? null) && ($old['slide'] ?? null) === ($ev['slide'] ?? null) && ($ev['job'] ?? null) !== null) {
                return ['id' => (int) $row['id'], 'created' => false, 'regressed' => false];
            }
        }
        array_unshift($list, $ev);
        $list = array_slice($list, 0, 20);
        $re = $row['status'] === 'fixed';
        Db::exec('UPDATE deck_checklist SET hits = hits + 1, last_seen = NOW(3), evidence = ?' . ($re ? ", status = 'open', regressed = 1, fixed_at = NULL" : '')
            . ($detail !== null ? ', detail = COALESCE(detail, ?)' : '') . ' WHERE id = ?',
            array_merge([json_encode($list, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)], $detail !== null ? [mb_substr($detail, 0, 4000)] : [], [(int) $row['id']]));
        return ['id' => (int) $row['id'], 'created' => false, 'regressed' => $re];
    }

    private static function evidence(array $ev): array
    {
        $cut = static fn ($v, int $n) => isset($v) && $v !== '' ? mb_substr((string) $v, 0, $n) : null;
        return array_filter([
            'at' => $ev['at'] ?? date('Y-m-d H:i'),
            'job' => $cut($ev['job'] ?? null, 64),
            'title' => $cut($ev['title'] ?? null, 120),
            'slide' => isset($ev['slide']) && (int) $ev['slide'] > 0 ? (int) $ev['slide'] : null,
            'note' => $cut($ev['note'] ?? null, 400),
        ], static fn ($v) => $v !== null && $v !== '');
    }

    /** 문장의 변하는 부분(숫자·상자 이름·쪽 번호)을 지워 같은 결함끼리 한 줄로 */
    public static function headOf(string $s): string
    {
        $s = (string) preg_replace('/「[^」]*」/u', '「」', $s);
        $s = (string) preg_replace('/\d+\s*(쪽|장|줄|개|px|pt|%)?/u', '#', $s);
        $s = (string) preg_replace('/\s+/u', ' ', trim($s));
        $p = mb_strpos($s, ' — ');
        if ($p !== false && $p > 4) {
            $s = mb_substr($s, 0, $p);
        }
        $p = mb_strpos($s, ':');
        if ($p !== false && $p > 4) {
            $s = mb_substr($s, 0, $p);
        }
        return mb_substr($s, 0, 60);
    }

    public static function areaOf(string $s, string $fallback = 'misc'): string
    {
        foreach (self::AREA_RE as $re => $a) {
            if (preg_match($re, $s)) {
                return $a;
            }
        }
        return $fallback;
    }

    private static function jobTitle(string $id): ?string
    {
        $t = Db::val('SELECT title FROM deck_jobs WHERE id = ?', [$id]);
        return $t !== null && $t !== false && $t !== '' ? (string) $t : null;
    }

    /** ① 와이어프레임 검사 — 시안 단계가 끝났을 때 엔진이 보낸 기획의 장마다 */
    public static function fromPlan(string $jobId, array $plan): void
    {
        $title = self::jobTitle($jobId);
        foreach ((array) ($plan['slides'] ?? []) as $s) {
            if (!is_array($s) || empty($s['wire']) || !is_array($s['wire'])) {
                continue;
            }
            try {
                $issues = WireLayout::check($s['wire'], $s);
            } catch (\Throwable) {
                continue;
            }
            foreach ($issues as $msg) {
                $head = self::headOf((string) $msg);
                self::record('wire:' . $head, self::areaOf($head, 'wire'), $head, null, 'wire',
                    ['job' => $jobId, 'title' => $title, 'slide' => (int) ($s['n'] ?? 0), 'note' => (string) $msg]);
            }
        }
    }

    /** ② 엔진 확인 목록(report.checklist) — 경고·오류만 */
    public static function fromReport(string $jobId, array $report): void
    {
        $title = self::jobTitle($jobId);
        foreach ((array) ($report['checklist'] ?? []) as $c) {
            if (!is_array($c)) {
                continue;
            }
            $lv = (string) ($c['level'] ?? 'info');
            if (!in_array($lv, ['warn', 'error', 'fail'], true)) {
                continue;
            }
            $t = trim((string) ($c['title'] ?? ''));
            if ($t === '') {
                continue;
            }
            $head = self::headOf($t);
            self::record('report:' . $head, self::areaOf($t . ' ' . ($c['detail'] ?? ''), 'build'), $head, null, 'report',
                ['job' => $jobId, 'title' => $title, 'slide' => (int) ($c['slide'] ?? 0), 'note' => trim($t . ' — ' . (string) ($c['detail'] ?? ''), ' —')]);
        }
    }

    /**
     * 자가 개선 — 엔진 게이트(sizeguard 등)가 되돌린 '한 번 나온 오류'(engine/known_errors.json slug).
     * known:<slug> 줄은 0036 이 고친 상태(fixed, fix_note=규칙)로 심어 두므로, 다시 걸리면 record 가 open·다시 걸림으로 되돌리고
     * 그 규칙이 다음 작업부터 lessons 로 엔진 지시문에 실린다.
     */
    public static function fromGuard(string $jobId, array $report): void
    {
        $title = self::jobTitle($jobId);
        foreach ((array) ($report['guard'] ?? []) as $g) {
            $slug = is_array($g) ? preg_replace('/[^a-z0-9-]/', '', strtolower((string) ($g['slug'] ?? ''))) : '';
            if ($slug === '') {
                continue;
            }
            $slides = array_values(array_filter(array_map('intval', (array) ($g['slides'] ?? []))));
            $rule = trim((string) ($g['rule'] ?? ''));
            $r = self::record('known:' . $slug, (string) ($g['area'] ?? 'type'), (string) ($g['title'] ?? $slug), null, 'report', [
                'job' => $jobId, 'title' => $title, 'slide' => $slides[0] ?? 0,
                'note' => '게이트가 되돌림 ' . (int) ($g['count'] ?? 1) . '곳' . ($slides ? ' (' . implode('·', $slides) . '장)' : ''),
            ]);
            if ($rule !== '') {
                Db::exec("UPDATE deck_checklist SET fix_note = ? WHERE id = ? AND (fix_note IS NULL OR fix_note = '')", [mb_substr($rule, 0, 1000), $r['id']]);
            }
        }
    }

    /** ③ 사용자 의견 — 주제별로. 주제를 못 고르면 '기타 의견' 한 줄 */
    public static function fromFeedback(string $jobId, string $text, int $slide = 0, string $where = '의견'): void
    {
        $text = trim($text);
        if ($text === '') {
            return;
        }
        $title = self::jobTitle($jobId);
        $hit = false;
        foreach (self::USER_TOPICS as $topic => $re) {
            if (preg_match($re, $text)) {
                $hit = true;
                self::record('user:' . $topic, self::TOPIC_AREA[$topic], '사용자 의견 · ' . $topic, null, 'user',
                    ['job' => $jobId, 'title' => $title, 'slide' => $slide, 'note' => $where . ': ' . $text]);
            }
        }
        if (!$hit) {
            self::record('user:기타', 'misc', '사용자 의견 · 기타', null, 'user', ['job' => $jobId, 'title' => $title, 'slide' => $slide, 'note' => $where . ': ' . $text]);
        }
    }

    /** ④ 실패 사유 */
    public static function fromFail(string $jobId, string $error): void
    {
        $error = trim($error);
        if ($error === '') {
            return;
        }
        $head = self::headOf(mb_substr($error, 0, 120));
        self::record('fail:' . $head, 'engine', '실패 · ' . $head, null, 'fail', ['job' => $jobId, 'title' => self::jobTitle($jobId), 'note' => mb_substr($error, 0, 400)]);
    }

    /** 쌓기 묶음 — 어디서 불러도 작업을 막지 않는다 */
    public static function safe(callable $fn): void
    {
        try {
            $fn();
        } catch (\Throwable $e) {
            error_log('[pp-deck-checklist] ' . $e->getMessage());
        }
    }

    /**
     * 되먹임 — 다음 작업 엔진 지시에 넣을 규칙. 열림·고치는 중 + (2번 이상 또는 다시 걸림), 엔진·실패 분야 제외.
     * 관리자가 적은 고친 방법(fix_note)이 있으면 그 문장을, 없으면 결함 제목을 "피할 것"으로.
     * 사용자 의견 줄(user:글자 크기·서체 등)은 제목이 분류명뿐이라 fix_note 가 있을 때만 싣는다 — 뜻 없는 "피할 것: 사용자 의견 · …" 방지(2026-10-15 점검).
     * @return list<array{id:int,area:string,text:string,hits:int}>
     */
    public static function lessons(int $limit = 12): array
    {
        $out = [];
        foreach (Db::rows("SELECT id, area, title, fix_note, hits, regressed FROM deck_checklist
                           WHERE status IN ('open','fixing') AND area <> 'engine' AND (hits >= 2 OR regressed = 1)
                             AND (origin <> 'user' OR COALESCE(fix_note, '') <> '')
                           ORDER BY regressed DESC, hits DESC, last_seen DESC LIMIT " . max(1, min(30, $limit))) as $r) {
            $rule = trim((string) ($r['fix_note'] ?? ''));
            $out[] = [
                'id' => (int) $r['id'], 'area' => (string) $r['area'], 'hits' => (int) $r['hits'],
                'text' => $rule !== '' ? $rule : '피할 것: ' . $r['title'],
            ];
        }
        return $out;
    }

    /** 화면용 한 줄 */
    public static function pub(array $r, bool $withEvidence = true): array
    {
        $o = [
            'id' => (int) $r['id'], 'slug' => $r['slug'], 'area' => $r['area'], 'area_name' => self::AREAS[$r['area']] ?? $r['area'],
            'title' => $r['title'], 'detail' => $r['detail'], 'origin' => $r['origin'], 'status' => $r['status'], 'hits' => (int) $r['hits'],
            'regressed' => (bool) $r['regressed'], 'fix_note' => $r['fix_note'], 'fix_commit' => $r['fix_commit'],
            'first_seen' => $r['first_seen'], 'last_seen' => $r['last_seen'], 'fixed_at' => $r['fixed_at'],
            'fed' => in_array($r['status'], ['open', 'fixing'], true) && $r['area'] !== 'engine' && ((int) $r['hits'] >= 2 || (bool) $r['regressed']),
        ];
        if ($withEvidence) {
            $o['evidence'] = json_decode((string) ($r['evidence'] ?? ''), true) ?: [];
        }
        return $o;
    }
}

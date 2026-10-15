<?php
/**
 * 솔루션별 개선 체크리스트 + 통합 검수 — 사용자 2026-10-15 "각 솔루션마다 개선 체크리스트가 존재해야 함…
 * 취합 체크리스트로 전체가 하나의 검수 프로세스로 자가 개선이 이루어져야 함".
 *
 * - qa_checklist(module 열) = powerAssets·powerGuide·powerMCP. 쌓는 규칙은 site·deck·mock 과 같다(같은 결함 한 줄, 근거 20개, 고친 줄이 다시 걸리면 다시 연다).
 * - SOURCES = 여섯 체크리스트(deck·mock·site 는 각자 표)를 한 형식으로 읽고 상태를 바꾸는 통합 층. 표를 합치지 않은 이유는 docs/db-design.md §6.1.
 */
declare(strict_types=1);

namespace Pp\Qa;

use Pp\Core\Db;

final class Checklist
{
    public const MODULES = [
        'assets' => ['name' => 'powerAssets', 'areas' => ['search' => '검색', 'register' => '등록·태그', 'addin' => '애드인', 'quality' => '자산 품질', 'license' => '라이선스·공개 등급', 'site' => '화면', 'misc' => '기타']],
        'guide' => ['name' => 'powerGuide', 'areas' => ['tokens' => '토큰', 'parts' => '부품', 'rules' => '규칙·문서', 'check' => '코드 판정', 'kit' => '설치 키트', 'site' => '화면', 'misc' => '기타']],
        'mcp' => ['name' => 'powerMCP', 'areas' => ['guide' => '지침·안내', 'args' => '인자·응답·오류', 'keys' => '키·권한·한도', 'kit' => '재료·가상화', 'judge' => '판정기', 'ops' => '배포·운영', 'site' => '화면', 'misc' => '기타']],
    ];
    public const STATUSES = ['open', 'fixing', 'fixed', 'watch', 'wontfix'];
    public const ORIGINS = ['audit', 'test', 'user', 'feed', 'doc', 'manual'];

    /** 통합 검수가 읽는 여섯 체크리스트 — 표·관리 화면 주소·자가 개선 고리(무엇이 무엇을 되먹이나) */
    public const SOURCES = [
        'deck' => ['name' => 'powerDeck', 'table' => 'deck_checklist', 'where' => '', 'page' => '/admin/deck/checklist', 'loop' => '반복 결함을 다음 장표 작업 지시에 넣는다(엔진 lessons)'],
        'mock' => ['name' => 'powerMock', 'table' => 'mock_checklist', 'where' => '', 'page' => '/admin/mock/checklist', 'loop' => '시안 판정기가 걸린 항목을 쌓고, 고친 규칙은 판정에 반영된다'],
        'assets' => ['name' => 'powerAssets', 'table' => 'qa_checklist', 'where' => "module = 'assets'", 'page' => '/admin/qa/assets', 'loop' => '결과 0건 검색어를 매일 모아 자산·동의어 보강 거리로 올린다'],
        'guide' => ['name' => 'powerGuide', 'table' => 'qa_checklist', 'where' => "module = 'guide'", 'page' => '/admin/qa/guide', 'loop' => '부품·토큰·규칙 결함을 모아 가이드와 코드 판정 규칙에 반영한다'],
        'mcp' => ['name' => 'powerMCP', 'table' => 'qa_checklist', 'where' => "module = 'mcp'", 'page' => '/admin/qa/mcp', 'loop' => 'MCP 시험 고리(시험→보고→수정→재발 방지)의 규칙·남은 일을 한 목록으로'],
        'site' => ['name' => '사이트 공통', 'table' => 'site_checklist', 'where' => '', 'page' => '/admin/site/checklist', 'loop' => '품질 판정·시험에서 나온 공통 화면 결함'],
    ];

    public static function areas(string $module): array
    {
        return self::MODULES[$module]['areas'] ?? [];
    }

    /**
     * @param array<string,mixed> $ev  {at?, by?, verdict?, note?, target?, how?}
     * @return array{id:int,created:bool,regressed:bool}
     */
    public static function record(string $module, string $slug, string $area, string $title, ?string $detail, string $origin, array $ev = [], ?string $status = null): array
    {
        if (!isset(self::MODULES[$module])) {
            throw new \InvalidArgumentException('모르는 솔루션: ' . $module);
        }
        $slug = mb_substr(trim($slug), 0, 160);
        $area = isset(self::areas($module)[$area]) ? $area : 'misc';
        $origin = in_array($origin, self::ORIGINS, true) ? $origin : 'manual';
        $status = in_array($status, self::STATUSES, true) ? $status : 'open';
        $ev = self::evidence($ev);
        $row = Db::row('SELECT id, status, evidence FROM qa_checklist WHERE module = ? AND slug = ?', [$module, $slug]);
        if ($row === null) {
            Db::exec('INSERT INTO qa_checklist (module, slug, area, title, detail, origin, status, evidence, fixed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
                $module, $slug, $area, mb_substr($title, 0, 200), $detail !== null ? mb_substr($detail, 0, 4000) : null, $origin, $status,
                json_encode([$ev], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $status === 'fixed' ? date('Y-m-d H:i:s') : null,
            ]);
            return ['id' => Db::lastId(), 'created' => true, 'regressed' => false];
        }
        $list = json_decode((string) $row['evidence'], true) ?: [];
        array_unshift($list, $ev);
        $list = array_slice($list, 0, 20);
        $re = $row['status'] === 'fixed' && $status !== 'fixed';
        Db::exec('UPDATE qa_checklist SET hits = hits + 1, last_seen = NOW(3), evidence = ?' . ($re ? ", status = 'open', regressed = 1, fixed_at = NULL" : '')
            . ($detail !== null ? ', detail = COALESCE(detail, ?)' : '') . ' WHERE id = ?',
            array_merge([json_encode($list, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)], $detail !== null ? [mb_substr($detail, 0, 4000)] : [], [(int) $row['id']]));
        return ['id' => (int) $row['id'], 'created' => false, 'regressed' => $re];
    }

    private static function evidence(array $ev): array
    {
        $cut = static fn ($v, int $n) => isset($v) && $v !== '' ? mb_substr((string) $v, 0, $n) : null;
        return array_filter([
            'at' => $ev['at'] ?? date('Y-m-d H:i'),
            'by' => $cut($ev['by'] ?? null, 60),
            'verdict' => $cut($ev['verdict'] ?? null, 20),
            'target' => $cut($ev['target'] ?? null, 200),
            'how' => $cut($ev['how'] ?? null, 200),
            'note' => $cut($ev['note'] ?? null, 400),
        ], static fn ($v) => $v !== null && $v !== '');
    }

    /** 화면용 한 줄 — 통합 화면에서도 같은 모양(source 로 어느 체크리스트인지) */
    public static function pub(array $r, string $source, bool $withEvidence = true): array
    {
        $areas = isset(self::MODULES[$source]) ? self::areas($source) : [];
        $o = [
            'id' => (int) $r['id'], 'source' => $source, 'source_name' => self::SOURCES[$source]['name'] ?? $source,
            'slug' => $r['slug'], 'area' => $r['area'], 'area_name' => $areas[$r['area']] ?? $r['area'],
            'title' => $r['title'], 'detail' => $r['detail'], 'origin' => $r['origin'], 'status' => $r['status'], 'hits' => (int) $r['hits'],
            'regressed' => (bool) $r['regressed'], 'fix_note' => $r['fix_note'], 'fix_commit' => $r['fix_commit'],
            'first_seen' => $r['first_seen'], 'last_seen' => $r['last_seen'], 'fixed_at' => $r['fixed_at'],
        ];
        if ($withEvidence) {
            $o['evidence'] = json_decode((string) ($r['evidence'] ?? ''), true) ?: [];
        }
        return $o;
    }

    /** 한 체크리스트의 상태 숫자 — 통합 검수 요약 */
    public static function counts(string $source): array
    {
        $s = self::SOURCES[$source];
        $w = $s['where'] !== '' ? 'WHERE ' . $s['where'] : '';
        $and = $s['where'] !== '' ? $s['where'] . ' AND ' : '';
        $by = [];
        foreach (Db::rows("SELECT status, COUNT(*) AS n FROM {$s['table']} {$w} GROUP BY status") as $c) {
            $by[$c['status']] = (int) $c['n'];
        }
        return [
            'open' => $by['open'] ?? 0, 'fixing' => $by['fixing'] ?? 0, 'fixed' => $by['fixed'] ?? 0, 'watch' => $by['watch'] ?? 0, 'wontfix' => $by['wontfix'] ?? 0,
            'regressed' => (int) Db::val("SELECT COUNT(*) FROM {$s['table']} WHERE {$and}regressed = 1 AND status IN ('open','fixing')"),
            'new_7d' => (int) Db::val("SELECT COUNT(*) FROM {$s['table']} WHERE {$and}first_seen > NOW(3) - INTERVAL 7 DAY"),
            'fixed_7d' => (int) Db::val("SELECT COUNT(*) FROM {$s['table']} WHERE {$and}fixed_at > NOW(3) - INTERVAL 7 DAY"),
            'oldest_open' => Db::val("SELECT MIN(first_seen) FROM {$s['table']} WHERE {$and}status IN ('open','fixing')"),
            'last_seen' => Db::val("SELECT MAX(last_seen) FROM {$s['table']} {$w}"),
        ];
    }
}

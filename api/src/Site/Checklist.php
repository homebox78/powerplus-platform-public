<?php
/**
 * 사이트 품질 개선 체크리스트 — 모듈 하나에 속하지 않는 사이트 전체 품질 결함을 쌓는다.
 * 출처: api/src/Deck/Checklist.php 를 site_checklist 로(엔진 되먹임·와이어·엔진 보고·의견 분류는 뺐다).
 * 같은 결함은 한 줄(slug)에 횟수와 최근 근거 20개, 고친 줄이 다시 걸리면 다시 연다(regressed).
 * area = 사이트 품질 체크리스트 ID 접두(docs/사이트-품질-체크리스트.md).
 */
declare(strict_types=1);

namespace Pp\Site;

use Pp\Core\Db;

final class Checklist
{
    public const AREAS = [
        'gen' => '공통', 'nav' => '탐색·헤더', 'home' => '홈', 'ast' => 'powerAssets', 'gde' => 'powerGuide', 'mcp' => 'powerMCP',
        'com' => '커뮤니티', 'acc' => '계정·마이페이지', 'adm' => '관리자', 'rsp' => '반응형', 'a11y' => '접근성', 'seo' => 'SEO',
        'sec' => '보안', 'perf' => '성능', 'legal' => '약관·정책', 'ops' => '운영', 'data' => '데이터', 'qc' => '품질 판정', 'misc' => '기타',
    ];
    public const STATUSES = ['open', 'fixing', 'fixed', 'watch', 'wontfix'];
    public const ORIGINS = ['audit', 'test', 'user', 'manual'];

    /**
     * @param array<string,mixed> $ev  {at?, by?, verdict?, note?, target?, how?}
     * @return array{id:int,created:bool,regressed:bool}
     */
    public static function record(string $slug, string $area, string $title, ?string $detail, string $origin, array $ev = []): array
    {
        $slug = mb_substr(trim($slug), 0, 160);
        $area = isset(self::AREAS[$area]) ? $area : 'misc';
        $origin = in_array($origin, self::ORIGINS, true) ? $origin : 'manual';
        $ev = self::evidence($ev);
        $row = Db::row('SELECT id, status, evidence FROM site_checklist WHERE slug = ?', [$slug]);
        if ($row === null) {
            Db::exec('INSERT INTO site_checklist (slug, area, title, detail, origin, evidence) VALUES (?, ?, ?, ?, ?, ?)', [
                $slug, $area, mb_substr($title, 0, 200), $detail !== null ? mb_substr($detail, 0, 4000) : null, $origin,
                json_encode([$ev], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            ]);
            return ['id' => Db::lastId(), 'created' => true, 'regressed' => false];
        }
        $list = json_decode((string) $row['evidence'], true) ?: [];
        array_unshift($list, $ev);
        $list = array_slice($list, 0, 20);
        $re = $row['status'] === 'fixed';
        Db::exec('UPDATE site_checklist SET hits = hits + 1, last_seen = NOW(3), evidence = ?' . ($re ? ", status = 'open', regressed = 1, fixed_at = NULL" : '')
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

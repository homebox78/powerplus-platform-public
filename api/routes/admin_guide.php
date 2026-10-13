<?php
/**
 * 관리자 · powerGuide 현황 — /api/v1/admin/guide (사용자 2026-10-14 "admin 에 파워가이드 관리·설정 메뉴가 없네?").
 * powerGuide 내용(부품·토큰·KRDS 지침·체크리스트)은 DB 가 아니라 코드가 정본이다(Pp\Guide\Data 머리 주석) —
 * 그래서 화면에서 편집하지 않고, 배포된 자료가 제대로 실렸는지·얼마나 쓰이는지를 본다.
 *  - GET /admin/guide?days=30 : 자료 상태(파일·갱신 시각·건수) + 부품 분류 + 체크리스트 판정 분포 + guide_* 호출(키 사용량)
 * 출처: 새로 씀. 역할 검사는 api/routes/admin.php 와 같은 방식. 권한 curator 이상, 세션 로그인만.
 */
declare(strict_types=1);

use Pp\Core\Actor;
use Pp\Core\Db;
use Pp\Core\HttpError;
use Pp\Core\Response;
use Pp\Core\Router;
use Pp\Guide\Data;

return static function (Router $r): void {
    $need = static function (Actor $a, string $role): void {
        if ($a->user === null) {
            throw HttpError::unauthorized();
        }
        if ($a->via !== 'session' || !$a->hasRole($role)) {
            throw HttpError::forbidden();
        }
    };
    $safe = static function (callable $f, mixed $fallback): mixed {
        try {
            return $f();
        } catch (\Throwable) {
            return $fallback;
        }
    };

    $r->get('/admin/guide', function (array $p, Actor $a) use ($need, $safe): void {
        $need($a, 'curator');
        $days = max(1, min(365, (int) ($_GET['days'] ?? 30)));
        $root = $safe(static fn (): string => Data::webRoot(), '');
        $api = dirname(__DIR__);

        // 자료 파일 — 없으면 해당 REST·MCP 도구가 503 을 낸다
        $file = static function (string $label, string $path, string $feeds): array {
            $ok = $path !== '' && is_file($path);
            return ['label' => $label, 'path' => $path === '' ? '' : basename(dirname($path)) . '/' . basename($path), 'feeds' => $feeds,
                'ok' => $ok, 'size' => $ok ? (int) filesize($path) : 0, 'updated_at' => $ok ? date('Y-m-d H:i:s', (int) filemtime($path)) : null];
        };
        $files = [
            $file('부품 목록', $root === '' ? '' : $root . '/kit-files/registry.json', '부품 화면 · guide_list_components'),
            $file('부품 스타일', $root === '' ? '' : $root . '/kit-files/kit.css', '부품 미리보기 · KRDS 토큰'),
            $file('토큰(평면 JSON)', $root === '' ? '' : $root . '/guide-files/solideo-tokens.flat.json', 'guide_tokens'),
            $file('KRDS 컴포넌트 지침', $api . '/data/guide/krds-components.json', 'guide_krds · guide_search_rules'),
            $file('KRDS 기본 패턴', $api . '/data/guide/krds-patterns.json', 'guide_search_rules'),
            $file('KRDS 검증 체크리스트', $api . '/data/guide/checklist.json', 'guide_get_checklist'),
        ];

        // 건수
        $reg = $safe(static fn (): array => Data::registry(), []);
        $metas = array_values((array) ($reg['metas'] ?? []));
        $groups = [];
        foreach ((array) ($reg['groups'] ?? []) as $g) {
            $groups[(string) $g[0]] = ['id' => (string) $g[0], 'label' => (string) $g[1], 'count' => 0, 'krds' => 0, 'shadcn' => 0, 'both' => 0];
        }
        foreach ($metas as $m) {
            $gid = (string) ($m['group'] ?? 'etc');
            $groups[$gid] ??= ['id' => $gid, 'label' => $gid, 'count' => 0, 'krds' => 0, 'shadcn' => 0, 'both' => 0];
            $groups[$gid]['count']++;
            // source = 부품 출처(KRDS 원형 · shadcn · 둘 다 합침) — packages/kit gen-index DemoMeta
            $src = (string) ($m['source'] ?? '');
            if (isset($groups[$gid][$src]) && in_array($src, ['krds', 'shadcn', 'both'], true)) {
                $groups[$gid][$src]++;
            }
        }
        $check = $safe(static fn (): array => Data::checklist(), []);
        $tokens = $root === '' ? [] : (glob($root . '/guide-files/*') ?: []);
        $counts = [
            'components' => count($metas),
            'by_source' => ['krds' => array_sum(array_column($groups, 'krds')), 'shadcn' => array_sum(array_column($groups, 'shadcn')), 'both' => array_sum(array_column($groups, 'both'))],
            'tokens' => count(array_filter($tokens, 'is_file')),
            'krds_components' => count((array) ($safe(static fn (): array => Data::krdsComponents(), [])['items'] ?? [])),
            'krds_patterns' => count((array) ($safe(static fn (): array => Data::krdsPatterns(), [])['items'] ?? [])),
            'checklist' => count((array) ($check['rows'] ?? [])),
            'kit_version' => (string) ($reg['version'] ?? ''),
            'checklist_at' => $check['at'] ?? null,
        ];
        $verdicts = [];
        foreach ((array) ($check['summary'] ?? []) as $k => $n) {
            $verdicts[] = ['verdict' => (string) $k, 'count' => (int) $n];
        }

        // 이용 — powerMCP·REST 키 호출(core_api_usage). 웹 화면 열람은 세지 않는다
        $from = ['day >= CURDATE() - INTERVAL ? DAY', [$days - 1]];
        $tools = $safe(static fn (): array => Db::rows("SELECT tool, SUM(calls) AS n, COUNT(DISTINCT api_key_id) AS k FROM core_api_usage WHERE tool LIKE 'guide%' AND {$from[0]} GROUP BY tool ORDER BY n DESC", $from[1]), []);
        $daily = $safe(static fn (): array => Db::rows("SELECT day, SUM(calls) AS n FROM core_api_usage WHERE tool LIKE 'guide%' AND {$from[0]} GROUP BY day ORDER BY day", $from[1]), []);
        $keys = (int) $safe(static fn (): int => (int) Db::val("SELECT COUNT(DISTINCT api_key_id) FROM core_api_usage WHERE tool LIKE 'guide%' AND {$from[0]}", $from[1]), 0);
        $all = (int) $safe(static fn (): int => (int) Db::val("SELECT COALESCE(SUM(calls),0) FROM core_api_usage WHERE {$from[0]}", $from[1]), 0);
        $total = array_sum(array_map(static fn (array $x): int => (int) $x['n'], $tools));

        Response::json([
            'days' => $days,
            'files' => $files,
            'counts' => $counts,
            'groups' => array_values($groups),
            'verdicts' => $verdicts,
            'usage' => [
                'total' => $total, 'keys' => $keys, 'share' => $all > 0 ? round($total / $all * 100, 1) : 0.0,
                'tools' => array_map(static fn (array $x): array => ['tool' => $x['tool'], 'calls' => (int) $x['n'], 'keys' => (int) $x['k']], $tools),
                'daily' => array_map(static fn (array $x): array => ['day' => $x['day'], 'calls' => (int) $x['n']], $daily),
            ],
        ]);
    });
};

<?php
/**
 * 관리자 · powerGuide 현황 — /api/v1/admin/guide (사용자 2026-10-14 "admin 에 파워가이드 관리·설정 메뉴가 없네?").
 * powerGuide 원본(부품·토큰·KRDS 지침·체크리스트)은 코드(키트 빌드·추출)이고, 관리자는 그 위에 글·판정·숨김·순서를
 * 덮어쓴다(Pp\Guide\Overrides, 2026-10-14 사용자 "/guide 를 모두 관리 가능해야"). 토큰 값·부품 코드는 빌드가 필요해 코드에서.
 *  - GET /admin/guide?days=30 : 자료 상태(파일·갱신 시각·건수) + 부품 분류 + 체크리스트 판정 분포 + guide_* 호출(키 사용량)
 *  - PUT /admin/guide/overrides/{section} : 덮어쓰기 한 영역 저장(감사 기록 guide.override)
 * 출처: 새로 씀. 역할 검사는 api/routes/admin.php 와 같은 방식. 권한 curator 이상, 세션 로그인만.
 */
declare(strict_types=1);

use Pp\Core\Actor;
use Pp\Core\Audit;
use Pp\Core\Db;
use Pp\Core\HttpError;
use Pp\Core\Response;
use Pp\Core\Router;
use Pp\Guide\Data;
use Pp\Guide\Overrides;

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

    // 덮어쓰기 저장(2026-10-14 사용자 "/guide 를 모두 관리 가능해야") — 영역 하나를 통째로 바꾼다. 빈 글·빈 목록은 원본 그대로(열쇠 삭제).
    //  PUT /admin/guide/overrides/{section}  body = 그 영역 JSON(Pp\Guide\Overrides 머리 주석의 모양)
    $r->put('/admin/guide/overrides/{section}', function (array $p, Actor $a) use ($need): void {
        $need($a, 'curator');
        $section = (string) $p['section'];
        if (!in_array($section, Overrides::SECTIONS, true)) {
            throw HttpError::notFound('영역');
        }
        $raw = (string) file_get_contents('php://input');
        if (strlen($raw) > 60000) {
            throw new HttpError('TOO_LARGE', '한 번에 저장할 수 있는 양(60KB)을 넘었습니다.', 413);
        }
        $body = json_decode($raw, true);
        if (!is_array($body)) {
            throw new HttpError('INVALID', 'JSON 이 아닙니다.', 422);
        }
        $before = Overrides::get($section);
        $after = Overrides::clean($section, $body);
        $v = json_encode($after, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        Db::exec('INSERT INTO core_settings (k, v, is_secret, updated_by) VALUES (?, ?, 0, ?) ON DUPLICATE KEY UPDATE v = VALUES(v), updated_by = VALUES(updated_by)', ['guide.' . $section, $v, $a->id()]);
        Audit::log($a, 'guide.override', 'core_settings:guide.' . $section, $before, $after);
        Overrides::forget();
        Response::json(['section' => $section, 'data' => $after]);
    });
};

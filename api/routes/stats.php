<?php
/**
 * 방문자 통계(설계 docs/db-design.md §6.2, 사용자 2026-10-20).
 *   POST /stats/hit   — 웹·애드인 화면이 화면 이동마다 한 줄(로그인 없이 · OPEN_PATHS '/stats/hit'). 봇·연타는 Core\Stats 가 거른다
 *   GET  /admin/visit-stats — 기간 집계(admin, 세션만). ?from=YYYY-MM-DD&to=YYYY-MM-DD(기본 최근 30일) &module= &channel= &admin=1(관리자 화면 포함)
 */
declare(strict_types=1);

use Pp\Core\Actor;
use Pp\Core\Db;
use Pp\Core\HttpError;
use Pp\Core\RateLimit;
use Pp\Core\Response;
use Pp\Core\Router;
use Pp\Core\Stats;

return static function (Router $r): void {
    $r->post('/stats/hit', function (array $p, Actor $a): void {
        // 한 IP 분당 120줄까지 — 넘으면 조용히 버린다(화면은 결과를 기다리지 않는다)
        if (!RateLimit::take('stats-hit:' . RateLimit::ipKey(), 120, 60)) {
            Response::json(['ok' => false]);
        }
        $b = json_decode((string) file_get_contents('php://input'), true);
        $ok = is_array($b) && Stats::hitWeb($b, $a->user !== null ? (int) $a->user['id'] : null);
        Response::json(['ok' => $ok]);
    });

    $r->get('/admin/visit-stats', function (array $p, Actor $a): void {   // /admin/stats 는 대시보드 숫자(admin.php)가 이미 쓴다
        if ($a->user === null) {
            throw HttpError::unauthorized();
        }
        if ($a->via !== 'session' || !$a->hasRole('admin')) {
            throw HttpError::forbidden();
        }
        $d = static fn (string $k, string $def): string => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($_GET[$k] ?? '')) ? (string) $_GET[$k] : $def;
        $to = $d('to', date('Y-m-d'));
        $from = $d('from', date('Y-m-d', strtotime($to . ' -29 day')));
        if ($from > $to) {
            [$from, $to] = [$to, $from];
        }
        $span = (int) ((strtotime($to) - strtotime($from)) / 86400) + 1;
        if ($span > 400) {
            throw HttpError::invalid('기간은 400일까지입니다.');
        }
        $w = ['day BETWEEN ? AND ?'];
        $args = [$from, $to];
        $module = (string) ($_GET['module'] ?? '');
        $channel = (string) ($_GET['channel'] ?? '');
        if (in_array($module, Stats::MODULES, true)) {
            $w[] = 'module = ?';
            $args[] = $module;
        } elseif (($_GET['admin'] ?? '') !== '1') {
            $w[] = "module <> 'admin'";   // 기본은 관리자 화면을 뺀다(운영자 자신의 이동이 수치를 부풀린다)
        }
        if (in_array($channel, Stats::CHANNELS, true)) {
            $w[] = 'channel = ?';
            $args[] = $channel;
        }
        $W = implode(' AND ', $w);
        $one = static fn (string $sql, array $x = []): array => Db::row($sql, $x) ?? [];
        $sum = static function (string $W, array $args) use ($one): array {
            $s = $one("SELECT COUNT(*) pv, COUNT(DISTINCT vid) uv, COUNT(DISTINCT sid) visits, COUNT(DISTINCT user_id) members FROM stat_hits WHERE {$W}", $args);
            return ['pv' => (int) ($s['pv'] ?? 0), 'uv' => (int) ($s['uv'] ?? 0), 'visits' => (int) ($s['visits'] ?? 0), 'members' => (int) ($s['members'] ?? 0)];
        };
        $now = $sum($W, $args);
        // 지난 같은 길이 기간(비교)
        $pFrom = date('Y-m-d', strtotime($from . " -{$span} day"));
        $pTo = date('Y-m-d', strtotime($from . ' -1 day'));
        $prev = $sum($W, array_merge([$pFrom, $pTo], array_slice($args, 2)));
        // 한 페이지만 보고 나간 방문 · 처음 온 방문자(이 기간 전에는 없던 vid)
        $bounce = (int) ($one("SELECT COUNT(*) n FROM (SELECT sid FROM stat_hits WHERE {$W} GROUP BY sid HAVING COUNT(*) = 1) x", $args)['n'] ?? 0);
        $newV = (int) ($one("SELECT COUNT(*) n FROM (SELECT vid FROM stat_hits WHERE {$W} GROUP BY vid) x WHERE NOT EXISTS (SELECT 1 FROM stat_hits o WHERE o.vid = x.vid AND o.day < ?)", array_merge($args, [$from]))['n'] ?? 0);
        $rows = static fn (string $sql) => Db::rows($sql, $args);
        $grp = static function (string $col, int $limit = 20) use ($W, $rows): array {
            return array_map(static fn (array $x): array => ['key' => (string) $x['k'], 'pv' => (int) $x['pv'], 'uv' => (int) $x['uv'], 'visits' => (int) $x['visits']],
                $rows("SELECT {$col} k, COUNT(*) pv, COUNT(DISTINCT vid) uv, COUNT(DISTINCT sid) visits FROM stat_hits WHERE {$W} GROUP BY k ORDER BY uv DESC, pv DESC LIMIT {$limit}"));
        };
        $webOnly = $W . " AND channel IN ('web','addin')";
        $grpWeb = static function (string $col, int $limit = 20) use ($webOnly, $args): array {
            return array_map(static fn (array $x): array => ['key' => (string) $x['k'], 'pv' => (int) $x['pv'], 'uv' => (int) $x['uv'], 'visits' => (int) $x['visits']],
                Db::rows("SELECT {$col} k, COUNT(*) pv, COUNT(DISTINCT vid) uv, COUNT(DISTINCT sid) visits FROM stat_hits WHERE {$webOnly} GROUP BY k ORDER BY uv DESC, pv DESC LIMIT {$limit}", $args));
        };
        $daily = array_map(static fn (array $x): array => ['day' => (string) $x['day'], 'pv' => (int) $x['pv'], 'uv' => (int) $x['uv'], 'visits' => (int) $x['visits']],
            $rows("SELECT day, COUNT(*) pv, COUNT(DISTINCT vid) uv, COUNT(DISTINCT sid) visits FROM stat_hits WHERE {$W} GROUP BY day ORDER BY day"));
        $dailyMod = array_map(static fn (array $x): array => ['day' => (string) $x['day'], 'module' => (string) $x['module'], 'uv' => (int) $x['uv']],
            $rows("SELECT day, module, COUNT(DISTINCT vid) uv FROM stat_hits WHERE {$W} GROUP BY day, module ORDER BY day"));
        $widthCase = "CASE WHEN w IS NULL OR w = 0 THEN '모름' WHEN w < 480 THEN '~479' WHEN w < 768 THEN '480~767' WHEN w < 1024 THEN '768~1023' WHEN w < 1440 THEN '1024~1439' WHEN w < 1920 THEN '1440~1919' ELSE '1920~' END";
        $heat = array_map(static fn (array $x): array => ['wd' => (int) $x['wd'], 'h' => (int) $x['h'], 'pv' => (int) $x['pv']],
            $rows("SELECT WEEKDAY(at) wd, HOUR(at) h, COUNT(*) pv FROM stat_hits WHERE {$W} GROUP BY wd, h"));
        $pages = array_map(static fn (array $x): array => ['path' => (string) $x['path'], 'module' => (string) $x['module'], 'pv' => (int) $x['pv'], 'uv' => (int) $x['uv']],
            $rows("SELECT path, MAX(module) module, COUNT(*) pv, COUNT(DISTINCT vid) uv FROM stat_hits WHERE {$W} GROUP BY path ORDER BY pv DESC LIMIT 20"));
        $direct = (int) ($one("SELECT COUNT(DISTINCT sid) n FROM stat_hits WHERE {$webOnly} AND ref_host IS NULL", $args)['n'] ?? 0);
        $members = array_map(static fn (array $x): array => ['name' => (string) ($x['name'] ?: '이름 없음'), 'pv' => (int) $x['pv'], 'days' => (int) $x['days'], 'last' => (string) $x['last_at']],
            $rows("SELECT u.name name, COUNT(*) pv, COUNT(DISTINCT h.day) days, MAX(h.at) last_at FROM stat_hits h JOIN core_users u ON u.id = h.user_id WHERE {$W} GROUP BY h.user_id ORDER BY pv DESC LIMIT 10"));
        Response::json([
            'from' => $from, 'to' => $to, 'days' => $span, 'prev' => ['from' => $pFrom, 'to' => $pTo] + $prev,
            'total' => $now + ['bounce' => $bounce, 'new_visitors' => $newV, 'pages_per_visit' => $now['visits'] > 0 ? round($now['pv'] / $now['visits'], 2) : 0.0],
            'daily' => $daily, 'daily_modules' => $dailyMod,
            'modules' => $grp('module', 20), 'channels' => $grp('channel', 10),
            'browsers' => $grpWeb('browser'), 'os' => $grpWeb('os'), 'devices' => $grpWeb('device', 5), 'widths' => $grpWeb($widthCase, 10),
            'langs' => $grpWeb("COALESCE(NULLIF(SUBSTRING_INDEX(lang, '-', 1), ''), '모름')", 10),
            'refs' => $grpWeb("COALESCE(ref_host, '(직접·북마크)')", 15), 'direct_visits' => $direct,
            'pages' => $pages, 'heat' => $heat, 'members' => $members,
            'first_at' => (string) (Db::val('SELECT MIN(at) FROM stat_hits') ?? ''),
        ]);
    });
};

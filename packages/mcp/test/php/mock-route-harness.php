<?php
/**
 * 시안 라우트 시험대 — 실제 api/routes/mock.php·mock_wire.php·Rules·Access·Actor 를 돌리고, DB·응답·세션만 가짜로 바꾼다(이 PC 에 MariaDB 가 없다).
 * SQL 은 실제로 실행되지 않는다: 라우트의 PHP 판단과 '어떤 조건을 SQL 에 실었나'까지만 잰다. 시험: ../mock-api-1101.test.mjs
 *   php mock-route-harness.php '<json 경우>' → 표준 출력에 {status, body, sql}
 */
declare(strict_types=1);

namespace Pp\Core {
    final class Harness
    {
        public static array $case = [];
        public static array $sql = [];
        public static ?int $status = null;
        public static function merged(array $g): array
        {
            foreach (self::$case['mockups'] ?? [] as $m) {
                if ((int) $m['id'] === (int) $g['mockup_id']) {
                    return $g + ['token' => $m['token'], 'm_base' => $m['base_token'] ?? null, 'm_page' => $m['page'] ?? null, 'm_discarded' => $m['discarded_at'] ?? null, 'm_deleted' => $m['deleted_at'] ?? null,
                        'owner_name' => '주인', 'owner_avatar' => null, 'html' => $g['html'] ?? '', 'title' => $g['title'] ?? '', 'score' => $g['score'] ?? 90, 'device' => $g['device'] ?? 'pc',
                        'likes' => 0, 'views' => 0, 'unlocks' => 0, 'note' => null, 'ref_id' => null, 'created_at' => '2026-10-01 00:00:00', 'updated_at' => '2026-10-01 00:00:00', 'shared_at' => null];
                }
            }
            return $g;
        }
    }

    final class Db
    {
        private static function mockup(string $sql, array $p): ?array
        {
            foreach (Harness::$case['mockups'] ?? [] as $m) {
                $hit = str_contains($sql, 'id = ?') && !str_contains($sql, 'token = ?') ? (int) $m['id'] === (int) $p[0] : ($m['token'] === $p[0]);
                if (!$hit) {
                    continue;
                }
                if (str_contains($sql, 'deleted_at IS NULL') && !empty($m['deleted_at'])) {
                    return null;
                }
                if (str_contains($sql, 'owner_user_id = ?') && (int) $m['owner_user_id'] !== (int) ($p[1] ?? 0)) {
                    return null;
                }
                return $m + ['g_id' => null, 'g_status' => null, 'published_at' => null, 'discarded_at' => null, 'deleted_at' => null, 'html' => '', 'bytes' => 0, 'title' => '', 'ref_id' => null, 'device' => 'pc',
                    'score' => null, 'passed' => null, 'check_count' => 0, 'views' => 0, 'has_thumb' => 0, 'expires_at' => '2030-01-01 00:00:00', 'created_at' => '2026-10-01 00:00:00', 'checked_at' => null,
                    'updated_at' => '2026-10-01 00:00:00', 'public_id' => 'pub' . $m['id'], 'check_json' => null, 'base_token' => null, 'visibility' => 'private'];
            }
            // 방금 INSERT 한 행(lastId) 다시 읽기
            return (int) ($p[0] ?? 0) === 999 ? ['id' => 999, 'public_id' => 'new', 'token' => 'NEW', 'title' => '', 'ref_id' => null, 'device' => 'pc', 'bytes' => 1, 'score' => null, 'passed' => null, 'check_count' => 0, 'published_at' => null, 'views' => 0, 'has_thumb' => 0, 'updated_at' => '2026-10-01 00:00:00', 'discarded_at' => null, 'expires_at' => '2030-01-01 00:00:00', 'created_at' => '2026-10-01 00:00:00', 'checked_at' => null] : null;
        }
        public static function row(string $sql, array $p = []): ?array
        {
            Harness::$sql[] = ['sql' => $sql, 'params' => array_map(static fn ($v) => is_string($v) ? mb_substr($v, 0, 200) : $v, $p)];
            if (preg_match('/FROM mock_gallery g JOIN mock_mockups m .*WHERE g\.id = \?/s', $sql)) {
                foreach (Harness::$case['gallery'] ?? [] as $g) {
                    if ((int) $g['id'] === (int) $p[0]) {
                        $x = Harness::merged($g);
                        return str_contains($sql, 'm.deleted_at IS NULL') && !empty($x['m_deleted']) ? null : $x;
                    }
                }
                return null;
            }
            if (str_contains($sql, 'FROM mock_wireframes')) {
                return Harness::$case['wireframe'] ?? null;
            }
            if (str_contains($sql, 'FROM mock_gallery_unlocks')) {
                return !empty(Harness::$case['unlocked']) ? ['x' => 1] : null;
            }
            if (str_contains($sql, 'FROM mock_gallery_likes')) {
                return null;
            }
            if (str_contains($sql, 'FROM core_users') ) {
                return ['id' => $p[0]];
            }
            if (str_contains($sql, 'FROM core_point_rules')) {
                return Harness::$case['rule'] ?? ['delta' => -30, 'enabled' => 1];
            }
            if (str_contains($sql, 'FROM core_point_ledger')) {
                return !empty(Harness::$case['already_spent']) ? ['x' => 1] : null;
            }
            if (str_contains($sql, 'FROM mock_mockups')) {
                return self::mockup($sql, $p);
            }
            return null;
        }
        public static function rows(string $sql, array $p = []): array
        {
            Harness::$sql[] = ['sql' => $sql, 'params' => $p];
            if (str_contains($sql, 'published_at IS NOT NULL')) {
                return Harness::$case['siblings'] ?? [];
            }
            if (str_contains($sql, 'SELECT g.id, g.owner_user_id')) {
                $out = [];
                foreach (Harness::$case['gallery'] ?? [] as $g) {
                    $x = Harness::merged($g);
                    if (str_contains($sql, 'm.deleted_at IS NULL') && !empty($x['m_deleted'])) {
                        continue;
                    }
                    $out[] = $x;
                }
                return $out;
            }
            if (str_contains($sql, 'COALESCE(NULLIF(m.base_token') && str_contains($sql, 'GROUP BY k')) {
                return Harness::$case['set_sizes'] ?? [];
            }
            if (str_contains($sql, 'SELECT m.id, m.public_id')) {
                return Harness::$case['list_rows'] ?? [];
            }
            if (str_contains($sql, 'FROM core_point_rules')) {
                return Harness::$case['rules'] ?? [];
            }
            if (str_contains($sql, 'gallery_id FROM mock_gallery_unlocks')) {
                return Harness::$case['unlocks'] ?? [];
            }
            return [];
        }
        public static function val(string $sql, array $p = []): mixed
        {
            Harness::$sql[] = ['sql' => $sql, 'params' => $p];
            if (str_contains($sql, 'SELECT discarded_at')) {
                return !empty(Harness::$case['admin_discarded']) ? '2026-10-30 00:00:00' : null;
            }
            if (str_contains($sql, 'SUM(delta)')) {
                return Harness::$case['balance'] ?? 0;
            }
            return Harness::$case['val'] ?? 0;
        }
        public static function exec(string $sql, array $p = []): int
        {
            Harness::$sql[] = ['sql' => $sql, 'params' => array_map(static fn ($v) => is_string($v) ? mb_substr($v, 0, 200) : $v, $p)];
            return 1;
        }
        public static function lastId(): int
        {
            return 999;
        }
        public static function tx(callable $fn): mixed
        {
            Harness::$sql[] = ['sql' => 'BEGIN', 'params' => []];
            $r = $fn(null);
            Harness::$sql[] = ['sql' => 'COMMIT', 'params' => []];
            return $r;
        }
    }

    final class Router
    {
        public array $routes = [];
        public function __call(string $m, array $a): self
        {
            $this->routes[] = [strtoupper($m), '#^' . preg_replace('#\{(\w+)\}#', '(?<$1>[^/]+)', $a[0]) . '$#', $a[1]];
            return $this;
        }
    }

    final class Response
    {
        public static function json(mixed $data, int $status = 200, array $extra = [], bool $cache = false): never
        {
            Harness::$status = $status;
            echo json_encode(['data' => $data] + $extra, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            exit;
        }
        public static function list(array $rows, int $total, int $page, int $limit, array $meta = []): never
        {
            self::json($rows, 200, ['total' => $total, 'page' => $page, 'limit' => $limit, 'meta' => $meta]);
        }
        public static function error(string $code, string $message, int $status = 400, ?string $hint = null): never
        {
            Harness::$status = $status;
            echo json_encode(['error' => $message, 'code' => $code, 'hint' => $hint], JSON_UNESCAPED_UNICODE);
            exit;
        }
        public static function noContent(): never
        {
            Harness::$status = 204;
            exit;
        }
        public static function input(): array
        {
            return Harness::$case['body'] ?? [];
        }
        public static function paging(int $d = 50, int $max = 200): array
        {
            return [1, min($max, $d), 0];
        }
    }

    final class Auth
    {
        public static function requireUser(Actor $a): array
        {
            if ($a->user === null) {
                throw HttpError::unauthorized();
            }
            return $a->user;
        }
    }
    final class Config
    {
        public static function get(string $k, mixed $d = null): mixed
        {
            return Harness::$case['config'][$k] ?? $d;
        }
    }
    final class Audit
    {
        public static function log(?Actor $a, string $action, string $target, ?array $b = null, ?array $c = null): void
        {
        }
    }
    final class Notify
    {
        public static function send(mixed ...$a): void
        {
        }
    }
    final class TestLogin
    {
        public static function mirrorIds(?int $id): array
        {
            return [];
        }
        public static function isActor(Actor $a): bool
        {
            return false;
        }
    }
    if ((Harness::$case['mode'] ?? '') !== 'points' && !in_array('--real-points', $GLOBALS['argv'] ?? [], true)) {
        final class Points
        {
            public static function award(mixed ...$a): bool
            {
                return true;
            }
            public static function spend(mixed ...$a): bool
            {
                return true;
            }
            public static function cost(string $r): int
            {
                return 30;
            }
            public static function balance(int $u): int
            {
                return 100;
            }
        }
    }
}

namespace Pp\Mock {
    final class Checklist
    {
        public const AREAS = [];
        public const STATUSES = [];
        public const ORIGINS = [];
        public static function fromJudge(mixed ...$a): void
        {
        }
        public static function lessons(): array
        {
            return [];
        }
        public static function slugsOf(array $r): array
        {
            return [];
        }
    }
}

namespace {
    use Pp\Core\Actor;
    use Pp\Core\Harness;
    use Pp\Core\HttpError;
    use Pp\Core\Response;
    use Pp\Core\Router;

    $api = dirname(__DIR__, 4) . '/api';
    require $api . '/src/bootstrap.php';
    Harness::$case = json_decode($argv[1] ?? '{}', true, 64, JSON_THROW_ON_ERROR);
    $c = Harness::$case;
    ob_start();
    register_shutdown_function(static function (): void {
        $raw = (string) ob_get_clean();
        echo json_encode(['status' => Harness::$status ?? (http_response_code() ?: 200), 'body' => json_decode($raw, true), 'raw' => $raw, 'sql' => Harness::$sql], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    });

    foreach ($c['server'] ?? [] as $k => $v) {
        $_SERVER[$k] = $v;
    }
    foreach ($c['get'] ?? [] as $k => $v) {
        $_GET[$k] = $v;
    }

    if (($c['mode'] ?? '') === 'points') {
        // 실제 Core\Points — 잠금 순서와 잔액 판단
        $ok = \Pp\Core\Points::spend(7, 'use_mockup_open', 'gallery', '1');
        Harness::$status = 200;
        echo json_encode(['spent' => $ok]);
        exit;
    }

    $u = $c['actor'] ?? ['id' => 1];
    $actor = isset($u['id']) ? new Actor(['id' => $u['id'], 'name' => '나'], null, $u['kind'] ?? 'staff', $u['plan'] ?? 'staff', $u['roles'] ?? [], null, 'session') : new Actor(null, null, 'anon', 'free', [], null, 'none');

    $r = new Router();
    (require $api . '/routes/mock.php')($r);
    (require $api . '/routes/mock_wire.php')($r);
    foreach ($r->routes as [$m, $re, $h]) {
        if ($m === $c['method'] && preg_match($re, $c['path'], $mm)) {
            try {
                $h(array_filter($mm, 'is_string', ARRAY_FILTER_USE_KEY), $actor);
            } catch (HttpError $e) {
                Response::error($e->errorCode, $e->getMessage(), $e->status, $e->hint);
            }
            exit;
        }
    }
    Response::error('NO_ROUTE', 'no route ' . $c['path'], 599);
}

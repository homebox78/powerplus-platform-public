<?php
declare(strict_types=1);

/**
 * MCP 키 (docs/08 §계정, S13): GET/POST /api/api-keys · DELETE /api/api-keys/{id} · GET /api/api-keys/{id}/usage
 * 평문 키는 생성 응답에서만 1회. 저장은 sha256. 형식 `hb_live_` + 32자. 플랜 한도(mcp_keys: free 0 · pro 1 · team -1) 검사.
 * MCP 서버(packages/mcp)는 GET /api/internal/keys/verify?key= 로 키를 검증한다(서버 간, X-Admin-Token).
 * @var Homebox\Http\Router $router
 */

use Homebox\Auth\Session;
use Homebox\Db;
use Homebox\Http\Auth;
use Homebox\Http\Response;

$requireUser = static function (): array {
    $u = Session::user();
    if ($u === null) {
        Response::error(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
    }
    return $u;
};
/**
 * 일 사용량(api_usage_daily.day)의 날짜 — 한국 0시 기준(2026-10-18 사용자 결정 "한국 0시").
 * 예전엔 DB 날짜 함수(CURDATE)였다. 이 서비스의 DB 연결은 time_zone 을 정하지 않아 서버 시간대(VM 은 UTC 일 수 있음)를 따랐다 → 한도가 한국 09시에 풀릴 수 있었다.
 * 날짜를 PHP 에서 Asia/Seoul 로 만들어 넘긴다(쓰기·읽기 같은 값).
 */
$kstDay = static function (string $modify = 'now'): string {
    return (new DateTimeImmutable($modify, new DateTimeZone('Asia/Seoul')))->format('Y-m-d');
};
$planOf = static function (int $userId): array {
    $sub = Db::row("SELECT plan_id FROM subscriptions WHERE owner_type = 'user' AND owner_id = ? AND status IN ('trial','active','past_due') ORDER BY id DESC LIMIT 1", [$userId]);
    $planId = $sub['plan_id'] ?? 'free';
    $plan = Db::row('SELECT id, name_ko, limits FROM plans WHERE id = ?', [$planId]) ?? ['id' => 'free', 'name_ko' => 'Free', 'limits' => '{}'];
    $plan['limits'] = is_string($plan['limits']) ? (json_decode($plan['limits'], true) ?: []) : ($plan['limits'] ?? []);
    return $plan;
};
$shape = static function (array $k): array {
    return [
        'id' => (int) $k['id'], 'name' => $k['name'], 'prefix' => $k['prefix'], // 끝 4자리는 실제 키 끝자리 — 예전엔 해시 앞 4자리를 붙여 키 끝자리로 오해됐다(2026-09-24)
        'masked' => $k['prefix'] . '…' . (($k['key_last4'] ?? null) ?: substr((string) $k['key_hash'], 0, 4)),
        'revealable' => !empty($k['key_enc']),
        'scopes' => is_string($k['scopes']) ? (json_decode($k['scopes'], true) ?: []) : [],
        'created_at' => $k['created_at'], 'expires_at' => $k['expires_at'], 'last_used_at' => $k['last_used_at'], 'revoked_at' => $k['revoked_at'],
        'calls_today' => (int) ($k['calls_today'] ?? 0), 'calls_month' => (int) ($k['calls_month'] ?? 0),
    ];
};

$router->get('/api/api-keys', static function () use ($requireUser, $planOf, $shape, $kstDay): void {
    $u = $requireUser();
    $today = $kstDay();
    $rows = Db::rows(
        "SELECT k.*, (SELECT COALESCE(SUM(calls),0) FROM api_usage_daily d WHERE d.api_key_id = k.id AND d.day = ?) AS calls_today,
                (SELECT COALESCE(SUM(calls),0) FROM api_usage_daily d WHERE d.api_key_id = k.id AND d.day >= ?) AS calls_month
         FROM api_keys k WHERE k.owner_type = 'user' AND k.owner_id = ? ORDER BY k.revoked_at IS NOT NULL, k.id DESC", [$today, substr($today, 0, 8) . '01', $u['id']]);
    $plan = $planOf($u['id']);
    Response::json(['items' => array_map($shape, $rows), 'plan' => $plan['id'], 'limit' => ['mcp_keys' => $plan['limits']['mcp_keys'] ?? 0, 'mcp_calls_day' => $plan['limits']['mcp_calls_day'] ?? 0]], 200, ['Cache-Control' => 'no-store']);
});

$router->post('/api/api-keys', static function () use ($requireUser, $planOf, $shape): void {
    $u = $requireUser();
    $body = json_decode((string) file_get_contents('php://input'), true) ?: [];
    $name = trim((string) ($body['name'] ?? ''));
    if ($name === '' || mb_strlen($name) > 60) {
        Response::error(422, 'INVALID_NAME', '키 이름은 1~60자입니다.');
    }
    $plan = $planOf($u['id']);
    $max = (int) ($plan['limits']['mcp_keys'] ?? 0);
    $active = (int) (Db::row("SELECT COUNT(*) AS n FROM api_keys WHERE owner_type = 'user' AND owner_id = ? AND revoked_at IS NULL", [$u['id']])['n'] ?? 0);
    // 개발 중(비공개 /homebox/)에는 결제가 없으므로 관리자 계정은 한도 없이 발급 — 서비스 오픈 시 제거
    if ($u['role'] !== 'admin' && ($max === 0 || ($max > 0 && $active >= $max))) {
        Response::error(402, 'PLAN_LIMIT', $max === 0 ? 'MCP 키는 Pro 플랜부터 발급할 수 있습니다.' : "이 플랜은 MCP 키를 {$max}개까지 발급할 수 있습니다.", ['plan' => $plan['id'], 'upgrade_url' => '/pricing']);
    }
    $expires = isset($body['expires_days']) && (int) $body['expires_days'] > 0 ? date('Y-m-d H:i:s', time() + 86400 * (int) $body['expires_days']) : null;
    $plain = 'hb_live_' . bin2hex(random_bytes(16)); // 40자
    $prefix = substr($plain, 0, 8);
    $hash = hash('sha256', $plain);
    Db::exec('INSERT INTO api_keys (owner_type, owner_id, created_by, name, prefix, key_hash, key_enc, key_last4, scopes, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ['user', $u['id'], $u['id'], $name, $prefix, $hash, Homebox\KeyVault::seal($plain), substr($plain, -4), json_encode(['search', 'read']), $expires]);
    $id = (int) Db::pdo()->lastInsertId();
    $row = Db::row('SELECT * FROM api_keys WHERE id = ?', [$id]);
    Response::json(['key' => $plain, 'item' => $shape($row + ['calls_today' => 0, 'calls_month' => 0])], 201, ['Cache-Control' => 'no-store']);
});

/** GET /api/api-keys/{id}/reveal — 소유자에게 키 원문 다시 보기. 0022 이전 발급 키는 사본이 없어 404 */
$router->get('/api/api-keys/{id}/reveal', static function (array $p) use ($requireUser): void {
    $u = $requireUser();
    $k = Db::row("SELECT key_enc FROM api_keys WHERE id = ? AND owner_type = 'user' AND owner_id = ? AND revoked_at IS NULL", [(int) $p['id'], $u['id']]);
    $plain = $k ? Homebox\KeyVault::open($k['key_enc'] ?? null) : null;
    if ($plain === null) {
        Response::error(404, 'NOT_REVEALABLE', '이 키는 다시 볼 수 없습니다. 다시 보기 기능 이전에 발급된 키라서 새로 발급해야 합니다.');
    }
    Response::json(['key' => $plain], 200, ['Cache-Control' => 'no-store']);
});

$router->add('DELETE', '/api/api-keys/{id}', static function (array $p) use ($requireUser): void {
    $u = $requireUser();
    $n = Db::exec("UPDATE api_keys SET revoked_at = NOW(3) WHERE id = ? AND owner_type = 'user' AND owner_id = ? AND revoked_at IS NULL", [(int) $p['id'], $u['id']]);
    if ($n === 0) {
        Response::error(404, 'NOT_FOUND', '키를 찾을 수 없습니다.');
    }
    Response::json(['ok' => true]);
});

$router->get('/api/api-keys/{id}/usage', static function (array $p) use ($requireUser, $kstDay): void {
    $u = $requireUser();
    $k = Db::row("SELECT id FROM api_keys WHERE id = ? AND owner_type = 'user' AND owner_id = ?", [(int) $p['id'], $u['id']]);
    if ($k === null) {
        Response::error(404, 'NOT_FOUND', '키를 찾을 수 없습니다.');
    }
    $days = Db::rows('SELECT day, tool, calls FROM api_usage_daily WHERE api_key_id = ? AND day >= ? ORDER BY day, tool', [(int) $p['id'], $kstDay('-30 days')]);
    foreach ($days as &$d) {
        $d['calls'] = (int) $d['calls'];
    }
    unset($d);
    Response::json(['items' => $days], 200, ['Cache-Control' => 'no-store']);
});

/** MCP 서버용 키 검증 (서버 간, X-Admin-Token). 사용량 +1 은 tool 파라미터로 함께 기록 */
$router->get('/api/internal/keys/verify', static function () use ($kstDay): void {
    Auth::requireAdmin();
    $key = (string) ($_GET['key'] ?? '');
    $tool = preg_replace('/[^a-z_]/', '', (string) ($_GET['tool'] ?? '')) ?: 'unknown';
    if (!str_starts_with($key, 'hb_live_') || strlen($key) < 20) {
        Response::error(401, 'INVALID_KEY', '키 형식이 올바르지 않습니다.');
    }
    $k = Db::row("SELECT k.id, k.owner_type, k.owner_id, k.scopes, k.expires_at, k.revoked_at, u.role FROM api_keys k JOIN users u ON u.id = k.created_by WHERE k.key_hash = ?", [hash('sha256', $key)]);
    if ($k === null || $k['revoked_at'] !== null || ($k['expires_at'] !== null && strtotime((string) $k['expires_at']) < time())) {
        Response::error(401, 'INVALID_KEY', '유효하지 않은 키입니다.');
    }
    $sub = Db::row("SELECT plan_id FROM subscriptions WHERE owner_type = ? AND owner_id = ? AND status IN ('trial','active','past_due') ORDER BY id DESC LIMIT 1", [$k['owner_type'], $k['owner_id']]);
    $plan = Db::row('SELECT id, limits FROM plans WHERE id = ?', [$sub['plan_id'] ?? 'free']);
    $limits = is_string($plan['limits'] ?? null) ? (json_decode($plan['limits'], true) ?: []) : [];
    $limitDay = $k['role'] === 'admin' ? -1 : (int) ($limits['mcp_calls_day'] ?? 0);
    $today = $kstDay();   // 한국 0시 기준(DB CURDATE 는 서버 시간대를 따랐다)
    $used = (int) (Db::row('SELECT COALESCE(SUM(calls),0) AS n FROM api_usage_daily WHERE api_key_id = ? AND day = ?', [$k['id'], $today])['n'] ?? 0);
    if ($limitDay >= 0 && $used >= $limitDay) {
        Response::error(429, 'RATE_LIMITED', '오늘 호출 한도를 넘었습니다. 자정(한국 시각)에 다시 채워집니다.', ['limit' => $limitDay, 'used' => $used]);
    }
    Db::exec('INSERT INTO api_usage_daily (api_key_id, day, tool, calls) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE calls = calls + 1', [$k['id'], $today, $tool]);
    Db::exec('UPDATE api_keys SET last_used_at = NOW(3) WHERE id = ?', [$k['id']]);
    Response::json(['ok' => true, 'key_id' => (int) $k['id'], 'plan' => $plan['id'] ?? 'free', 'role' => $k['role'], 'scopes' => json_decode((string) $k['scopes'], true) ?: [], 'limit_day' => $limitDay, 'used_today' => $used + 1], 200, ['Cache-Control' => 'no-store']);
});

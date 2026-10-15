<?php
declare(strict_types=1);

namespace Pp\Core;

/**
 * API·MCP 키 하나(core_api_keys): REST 와 MCP 가 같은 키, scopes 로 모듈 제한, 일 한도·사용량 집계(core_api_usage).
 * 출처: homebox-handoff api/routes/api-keys.php·Plan::keyPlan + powerPlus McpKeyService (발급 1회 표시·sha256·폐기·usage)
 */
final class Keys
{
    public const SCOPES = ['assets', 'deck', 'mock', 'guide', 'all'];

    /** 키 원문 → Actor(소유자 플랜·역할, key 행). 폐기·만료는 null. */
    private static bool $counted = false;

    /**
     * powerMCP 서버가 부른 요청인가. X-Requested-With 는 흉내 낼 수 있으므로
     * X-Pp-Mcp = HMAC-SHA256(공유 비밀, "mcp|키 원문") 서명까지 맞아야 한다(비밀 = mock.judge_secret, 없으면 worker.key).
     */
    public static function viaMcp(): bool
    {
        if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'powerMCP') {
            return false;
        }
        $secret = (string) (Config::get('mock.judge_secret', '') ?: Config::get('worker.key', ''));
        $auth = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
        $sig = (string) ($_SERVER['HTTP_X_PP_MCP'] ?? '');
        if ($secret === '') {
            // R11·MC-34: 비밀이 비면 powerMCP 경유 호출이 전부 REST 직접 호출로 이중 집계된다 — 로그로 알린다.
            error_log('[keys] powerMCP 서명 비밀(mock.judge_secret·worker.key)이 비어 경유 판정 불가');
        }
        if ($secret === '' || $sig === '' || !str_starts_with($auth, 'Bearer ')) {
            return false;
        }
        return hash_equals(hash_hmac('sha256', 'mcp|' . substr($auth, 7), $secret), $sig);
    }

    public static function actorFor(string $token): ?Actor
    {
        $hash = hash('sha256', $token);
        $k = Db::row('SELECT * FROM core_api_keys WHERE key_hash = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW(3))', [$hash]);
        if (!$k) {
            return null;
        }
        $u = Users::byId((int) $k['user_id']);
        if (!$u || ($u['status'] ?? 'active') === 'blocked') {
            return null; // 차단된 사용자의 키도 막는다
        }
        Db::exec('UPDATE core_api_keys SET last_used_at = NOW(3) WHERE id = ?', [$k['id']]);
        $k['scopes'] = json_decode((string) $k['scopes'], true) ?: ['all'];
        return Auth::fromUser($u, 'key', $k);
    }

    public static function allows(Actor $a, string $scope): bool
    {
        if ($a->key === null) {
            return true; // 세션은 모듈 제한 없음
        }
        $s = $a->key['scopes'] ?? ['all'];
        return in_array('all', $s, true) || in_array($scope, $s, true);
    }

    /** 발급: 원문은 이 응답에 한 번 + KeyVault 로 암호화 보관(다시 보기). */
    public static function issue(int $userId, string $name, array $scopes, string $kind = 'live'): array
    {
        $scopes = array_values(array_intersect($scopes ?: ['all'], self::SCOPES)) ?: ['all'];
        $raw = Ids::apiKey($kind);
        Db::exec(
            'INSERT INTO core_api_keys (public_id, user_id, name, prefix, key_hash, key_enc, key_last4, scopes) VALUES (?,?,?,?,?,?,?,?)',
            [Ids::publicId(), $userId, mb_substr($name, 0, 60), substr($raw, 0, 12), hash('sha256', $raw), KeyVault::seal($raw), substr($raw, -4), json_encode($scopes)]
        );
        $row = Db::row('SELECT * FROM core_api_keys WHERE id = ?', [Db::lastId()]);
        return [self::pub($row), $raw];
    }

    public static function reveal(array $row): ?string
    {
        return $row['key_enc'] ? KeyVault::open((string) $row['key_enc']) : null;
    }

    public static function revoke(int $userId, string $publicId): bool
    {
        return Db::exec('UPDATE core_api_keys SET revoked_at = NOW(3) WHERE user_id = ? AND public_id = ? AND revoked_at IS NULL', [$userId, $publicId]) > 0;
    }

    /** @return array<int, array<string,mixed>> */
    public static function listFor(int $userId): array
    {
        return array_map([self::class, 'pub'], Db::rows('SELECT * FROM core_api_keys WHERE user_id = ? ORDER BY id DESC', [$userId]));
    }

    public static function pub(array $r): array
    {
        return [
            'id' => $r['public_id'],
            'name' => $r['name'],
            'masked' => $r['prefix'] . '…' . $r['key_last4'],
            'scopes' => is_array($r['scopes']) ? $r['scopes'] : (json_decode((string) $r['scopes'], true) ?: ['all']),
            'created_at' => $r['created_at'],
            'last_used_at' => $r['last_used_at'],
            'expires_at' => $r['expires_at'],
            'revoked_at' => $r['revoked_at'],
        ];
    }

    /**
     * 오늘 사용량 — powerMCP 가 모든 응답 meta.quota 에 싣는다.
     * limit 0 = 무제한(remaining null), reset = 다음 KST 자정(ISO).
     */
    public static function quota(Actor $a): array
    {
        $limit = (int) Access::limit($a, 'api_daily', 0);
        $used = $a->key === null ? 0 : (int) Db::val('SELECT COALESCE(SUM(calls),0) FROM core_api_usage WHERE api_key_id = ? AND day = ?', [$a->key['id'], date('Y-m-d')]);
        $reset = (new \DateTimeImmutable('tomorrow', new \DateTimeZone('Asia/Seoul')))->format('Y-m-d\TH:i:sP');
        return ['limit' => $limit, 'used' => $used, 'remaining' => $limit > 0 ? max(0, $limit - $used) : null, 'reset' => $reset];
    }

    /** 일 한도 검사 + 사용량 1 증가. 플랜별 한도는 core_plans.limits.api_daily. staff 도 한도 있음(Pro 의 5배, §17.1). */
    public static function hit(Actor $a, string $tool, bool $force = false): void
    {
        // MCP-006: 키로 직접 부른 REST 호출은 Router 가 요청마다 한 번 센다.
        // powerMCP 를 거친 호출은 /keys/verify 에서 이미 셌으므로(force) 두 번 세지 않는다.
        // 한 요청 안에서 여러 곳(Router·모듈 라우트)이 불러도 한 번만 센다.
        if ($a->key === null || self::$counted) {
            return;
        }
        if (!$force && self::viaMcp()) {
            return;
        }
        self::$counted = true;
        $limit = (int) Access::limit($a, 'api_daily', 0);
        $day = date('Y-m-d');
        Db::exec(
            'INSERT INTO core_api_usage (api_key_id, day, tool, calls) VALUES (?,?,?,1) ON DUPLICATE KEY UPDATE calls = calls + 1',
            [$a->key['id'], $day, mb_substr($tool, 0, 40)]
        );
        if ($limit > 0) {
            $used = (int) Db::val('SELECT COALESCE(SUM(calls),0) FROM core_api_usage WHERE api_key_id = ? AND day = ?', [$a->key['id'], $day]);
            if ($used > $limit) {
                throw new HttpError('RATE_LIMITED', '오늘 호출 한도를 넘었습니다.', 429, "일 한도 {$limit}건");
            }
        }
    }
}

<?php
declare(strict_types=1);

namespace Pp\Core;

/**
 * 권한 판정 하나: Access::can(actor, resource[, action]).
 * 콘텐츠 표 공통 열(visibility·owner_user_id·org_id)만 읽는다(설계서 §12.1). 화면 숨김과 별개로 모든 출구가 이 함수를 지난다(G30).
 * 출처: homebox-handoff api/src/Plan.php (플랜 한도·게이트) 를 visibility 축으로 일반화.
 */
final class Access
{
    /** visibility 를 볼 수 있는 최소 플랜 순위 */
    private const ORDER = ['free' => 0, 'pro' => 1, 'team' => 1, 'staff' => 2];

    /**
     * @param array $res 콘텐츠 행 — visibility, owner_user_id, org_id 열을 읽는다.
     * @param string $action view | edit | delete
     */
    public static function can(Actor $a, array $res, string $action = 'view'): bool
    {
        if ($a->kind === 'worker' || $a->isAdmin()) {
            return true;
        }
        $owner = isset($res['owner_user_id']) ? (int) $res['owner_user_id'] : null;
        $isOwner = $owner !== null && $a->id() === $owner;
        if ($action !== 'view') {
            if ($isOwner) {
                return true;
            }
            return $action === 'edit' && $a->hasRole('curator');
        }
        $vis = (string) ($res['visibility'] ?? 'internal');
        return match ($vis) {
            'public', 'free' => true,
            'pro' => (self::ORDER[$a->plan] ?? 0) >= 1 || $isOwner,
            'partner' => $a->isStaff() || $isOwner || self::sameOrg($a, $res),
            'internal' => $a->isStaff() || $isOwner,
            'private' => $isOwner,
            default => false,
        };
    }

    public static function assert(Actor $a, array $res, string $action = 'view'): void
    {
        if (self::can($a, $res, $action)) {
            return;
        }
        if ($action === 'view' && in_array(($res['visibility'] ?? ''), ['pro'], true) && $a->user !== null) {
            throw HttpError::paymentRequired('Pro 이상에서 열립니다.');
        }
        if ($a->user === null) {
            throw HttpError::unauthorized();
        }
        throw HttpError::forbidden();
    }

    /** 목록 쿼리에 붙일 WHERE 조각. [sql, params] — `t` 는 콘텐츠 표 별칭. */
    public static function whereVisible(Actor $a, string $t = 't'): array
    {
        if ($a->kind === 'worker' || $a->isAdmin()) {
            return ['1=1', []];
        }
        $vis = ['public', 'free'];
        if ((self::ORDER[$a->plan] ?? 0) >= 1) {
            $vis[] = 'pro';
        }
        if ($a->isStaff()) {
            $vis[] = 'partner';
            $vis[] = 'internal';
        }
        $ph = implode(',', array_fill(0, count($vis), '?'));
        $sql = "({$t}.visibility IN ({$ph})";
        $params = $vis;
        if ($a->id() !== null) {
            $sql .= " OR {$t}.owner_user_id = ?";
            $params[] = $a->id();
        }
        if ($a->orgId !== null) {
            $sql .= " OR ({$t}.visibility = 'partner' AND {$t}.org_id = ?)";
            $params[] = $a->orgId;
        }
        return [$sql . ')', $params];
    }

    /**
     * 서비스 이용 자격(사용자 2026-10-16): 로그인 + Pro·Team 구독, 또는 임직원(이용 기간 안 — 권한은 Pro 와 같다).
     * 워커·운영 역할(관리자·큐레이터·지원)은 운영 때문에 늘 통과. Router::dispatch 가 회원 전용 경로마다 이 함수를 지난다.
     */
    public static function member(Actor $a): bool
    {
        if ($a->kind === 'worker' || $a->roles !== []) {
            return true;
        }
        return $a->user !== null && in_array($a->plan, ['pro', 'team', 'staff'], true);
    }

    /**
     * 보기만 되는 회원 — 로그인한 비회원(Free·임직원 기간 끝)이 웹에서 볼 때(2026-10-17 사용자 "가입된 free 회원은 사용은 못하고 볼 수만 있음, pro 이상만 사용 가능").
     * 키(MCP)·엔진 호출은 해당 없음 — 키는 곧 '사용'이다.
     */
    public static function viewer(Actor $a): bool
    {
        return $a->user !== null && $a->via === 'session' && !self::member($a);
    }

    /** 보기만 되는 회원에게 열리는 요청 — 읽기(GET·HEAD)만. 내려받기·내보내기·애드인 설치 파일·장표 재료는 '사용'이라 뺀다 */
    public static function viewAllowed(Actor $a, string $method, string $path): bool
    {
        if (!in_array($method, ['GET', 'HEAD'], true) || !self::viewer($a)) {
            return false;
        }
        return preg_match('#^/assets/setup/download|^/deck/jobs/[^/]+/(export\.zip|files/|plan\.md|script\.(html|md)|practice\.html)|^/deck/kit/|^/deck/reference\.zip#', $path) !== 1;
    }

    /** member() 가 false 일 때 돌려줄 오류 — 화면이 code 로 안내를 고른다(로그인 / 임직원 기간 끝 / 플랜 필요). */
    public static function memberError(Actor $a): HttpError
    {
        if ($a->user === null) {
            return new HttpError('UNAUTHORIZED', '로그인이 필요합니다.', 401, '회원가입 후 로그인하면 이용할 수 있습니다.');
        }
        if (($a->user['kind'] ?? '') === 'staff' && Users::staffExpired($a->user)) {
            return new HttpError('STAFF_EXPIRED', '임직원 이용 기간이 끝났습니다.', 402, '가입일로부터 1년이 지났습니다. 관리자에게 연장을 요청하세요.');
        }
        return new HttpError('PLAN_REQUIRED', 'Pro 이상 회원만 사용할 수 있습니다. 지금 계정은 보기만 됩니다.', 402, '협력사·계약직은 관리자에게 전환을 요청하세요.');
    }

    private static function sameOrg(Actor $a, array $res): bool
    {
        return $a->orgId !== null && isset($res['org_id']) && (int) $res['org_id'] === $a->orgId;
    }

    /** 플랜 한도 값(core_plans.limits JSON). -1 = 무제한. */
    public static function limit(Actor $a, string $key, int $default = 0): int
    {
        static $cache = [];
        $plan = $a->plan;
        if (!isset($cache[$plan])) {
            $row = Db::row('SELECT limits FROM core_plans WHERE code = ?', [$plan]);
            $cache[$plan] = $row ? (json_decode((string) $row['limits'], true) ?: []) : [];
        }
        $v = $cache[$plan][$key] ?? $default;
        return (int) $v;
    }
}

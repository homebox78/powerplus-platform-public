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

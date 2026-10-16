<?php
declare(strict_types=1);

namespace Pp\Core;

/**
 * core_users 접근 + staff 분류 + 역할·플랜 해석.
 * - kind: 회사 도메인(STAFF_DOMAINS)으로 검증된 로그인이 하나라도 있으면 staff(기획 §3 — 도메인은 차단 조건이 아니라 분류 조건).
 * - superadmin: config superadmin.email 과 일치 + 검증된 로그인(email_verified) 으로 들어온 세션일 때만(§12.2, G29).
 */
final class Users
{
    public static function byId(int $id): ?array
    {
        return Db::row('SELECT * FROM core_users WHERE id = ? AND deleted_at IS NULL', [$id]);
    }

    public static function byEmail(string $email): ?array
    {
        return Db::row('SELECT * FROM core_users WHERE email = ? AND deleted_at IS NULL', [strtolower(trim($email))]);
    }

    public static function byPublicId(string $pid): ?array
    {
        return Db::row('SELECT * FROM core_users WHERE public_id = ? AND deleted_at IS NULL', [$pid]);
    }

    /** @return string[] */
    public static function staffDomains(): array
    {
        $v = Config::get('staff.domains', ['solideos.com']);
        if (is_string($v)) {
            $v = array_filter(array_map('trim', explode(',', $v)));
        }
        return array_map(static fn ($d) => strtolower((string) $d), (array) $v);
    }

    public static function isStaffEmail(string $email): bool
    {
        $at = strrpos($email, '@');
        if ($at === false) {
            return false;
        }
        return in_array(strtolower(substr($email, $at + 1)), self::staffDomains(), true);
    }

    /** @return string[] */
    public static function roles(int $userId): array
    {
        $rows = Db::rows('SELECT role FROM core_user_roles WHERE user_id = ?', [$userId]);
        return array_values(array_unique(array_map(static fn ($r) => (string) $r['role'], $rows)));
    }

    /** 로그인(provider) 행이 검증된 이메일로 존재하는 사용자를 찾거나 만든다. 이메일만 같은 미검증 계정에는 붙이지 않는다(G29). */
    public static function findOrCreateByLogin(string $provider, string $providerUid, ?string $email, bool $emailVerified, ?string $name, ?string $avatar): array
    {
        $login = Db::row('SELECT user_id FROM core_user_logins WHERE provider = ? AND provider_uid = ?', [$provider, $providerUid]);
        if ($login) {
            $u = self::byId((int) $login['user_id']);
            if ($u) {
                self::assertActive($u);
                Db::exec('UPDATE core_user_logins SET last_login_at = NOW(3) WHERE provider = ? AND provider_uid = ?', [$provider, $providerUid]);
                return self::promoteStaff($u, $email, $emailVerified);
            }
        }
        $email = $email !== null ? strtolower(trim($email)) : null;
        $u = ($email !== null && $emailVerified) ? self::byEmail($email) : null;
        if (!$u) {
            $kind = ($email !== null && $emailVerified && self::isStaffEmail($email)) ? 'staff' : 'external';
            $storeEmail = $email ?? ("{$provider}-{$providerUid}@noemail.local");
            Db::exec(
                'INSERT INTO core_users (public_id, email, name, avatar_url, kind, session_epoch) VALUES (?,?,?,?,?,1)',
                [Ids::publicId(), $storeEmail, $name ?: '사용자', $avatar, $kind]
            );
            $u = self::byId(Db::lastId());
        } else {
            self::assertActive($u);
        }
        $u = self::promoteStaff($u, $email, $emailVerified);
        Db::exec(
            'INSERT INTO core_user_logins (user_id, provider, provider_uid, email, email_verified, last_login_at) VALUES (?,?,?,?,?,NOW(3))
             ON DUPLICATE KEY UPDATE last_login_at = NOW(3), email_verified = VALUES(email_verified)',
            [$u['id'], $provider, $providerUid, $email, $emailVerified ? 1 : 0]
        );
        // superadmin 은 코드 상수 — 검증된 로그인일 때만 역할을 보장
        $super = strtolower((string) Config::get('superadmin.email', ''));
        if ($super !== '' && $emailVerified && $email === $super) {
            Db::exec('INSERT IGNORE INTO core_user_roles (user_id, role, granted_by) VALUES (?,?,NULL)', [$u['id'], 'superadmin']);
        }
        return $u;
    }

    /**
     * 회사 메일(staff.domains)로 검증된 로그인이면 이미 있는 계정이라도 임직원(staff)으로 올린다.
     * 매 로그인마다 본다 — 예전엔 처음 연결할 때만 봐서, 먼저 외부로 가입한 회사 메일 계정이 외부로 남았다.
     * 검증 안 된 이메일(네이버 연락처 메일 등)은 올리지 않는다(G29 — 남의 회사 메일을 적어 넣는 것 방지).
     */
    private static function promoteStaff(array $u, ?string $email, bool $emailVerified): array
    {
        $email = $email !== null ? strtolower(trim($email)) : null;
        if (($u['kind'] ?? '') !== 'staff' && $emailVerified && $email !== null && self::isStaffEmail($email)) {
            Db::exec('UPDATE core_users SET kind = ? WHERE id = ?', ['staff', $u['id']]);
            $u['kind'] = 'staff';
        }
        // 임직원 이용 기간 = 가입일 + 1년(사용자 2026-10-16). 처음 임직원이 될 때 한 번 채우고, 연장은 관리자가 한다.
        if (($u['kind'] ?? '') === 'staff' && empty($u['access_until'])) {
            Db::exec('UPDATE core_users SET access_until = DATE_ADD(created_at, INTERVAL 1 YEAR) WHERE id = ? AND access_until IS NULL', [$u['id']]);
            $u = self::byId((int) $u['id']) ?? $u;
        }
        return $u;
    }

    /**
     * 관리자가 차단한 계정·휴면 계정은 어떤 로그인 수단으로도 못 들어온다(OTP·소셜·개발 로그인 공통 지점).
     * 휴면 계정이 로그인을 시도하면 승인 요청(dormant_requested_at)을 남기고 관리자에게 한 번 알린다.
     */
    public static function assertActive(array $u): void
    {
        $u = self::markDormantIfIdle($u);
        $st = $u['status'] ?? 'active';
        if ($st === 'blocked') {
            throw new HttpError('BLOCKED', '이용이 제한된 계정입니다.', 403, '관리자에게 문의하세요.');
        }
        if ($st === 'dormant') {
            if (empty($u['dormant_requested_at'])) {
                Db::exec('UPDATE core_users SET dormant_requested_at = NOW(3) WHERE id = ? AND dormant_requested_at IS NULL', [$u['id']]);
                $label = $u['name'] . ' (' . $u['email'] . ')';
                foreach (Db::rows("SELECT DISTINCT user_id FROM core_user_roles WHERE role IN ('superadmin','admin')") as $r) {
                    Notify::send((int) $r['user_id'], 'admin', "휴면 계정 승인 요청 — {$label}", '/admin/users?status=dormant');
                }
            }
            throw new HttpError('DORMANT', '휴면 계정입니다.', 403, '3개월 넘게 로그인하지 않아 휴면으로 바뀌었습니다. 관리자에게 승인 요청을 보냈습니다. 승인되면 다시 로그인할 수 있습니다.');
        }
    }

    /** 휴면 기준 일수(마지막 로그인·활동 후). config account.dormant_days, 기본 90일(3개월). */
    public static function dormantDays(): int
    {
        return max(1, (int) Config::get('account.dormant_days', 90));
    }

    /** 마지막 활동 = 세션 활동(last_seen_at)·로그인 수단별 마지막 로그인 중 늦은 것. 한 번도 없으면 가입일. */
    public static function lastActive(array $u): string
    {
        $login = (string) (Db::val('SELECT MAX(last_login_at) FROM core_user_logins WHERE user_id = ?', [$u['id']]) ?? '');
        $last = max((string) ($u['last_seen_at'] ?? ''), $login);
        return $last !== '' ? $last : (string) $u['created_at'];
    }

    /**
     * 마지막 활동이 휴면 기준을 넘긴 활성 계정을 휴면으로 바꾼다(세션 전부 무효). superadmin 은 제외 — 승인할 사람이 없어지지 않게.
     * @return array 바뀐 뒤의 사용자 행
     */
    public static function markDormantIfIdle(array $u): array
    {
        if (($u['status'] ?? 'active') !== 'active') {
            return $u;
        }
        $limit = date('Y-m-d H:i:s', time() - self::dormantDays() * 86400);
        // 요청마다 불리므로 최근 활동이 있으면 쿼리 없이 끝낸다
        if ((string) ($u['last_seen_at'] ?? '') >= $limit || (string) $u['created_at'] >= $limit) {
            return $u;
        }
        if (self::lastActive($u) >= $limit || in_array('superadmin', self::roles((int) $u['id']), true)) {
            return $u;
        }
        Db::exec("UPDATE core_users SET status = 'dormant', dormant_at = NOW(3), dormant_requested_at = NULL, session_epoch = session_epoch + 1 WHERE id = ? AND status = 'active'", [$u['id']]);
        return self::byId((int) $u['id']) ?? $u;
    }

    /** 세션 활동 기록 — 한 시간에 한 번만 쓴다(요청마다 UPDATE 하지 않게). */
    public static function touch(array $u): void
    {
        $seen = (string) ($u['last_seen_at'] ?? '');
        if ($seen === '' || strtotime($seen) < time() - 3600) {
            Db::exec('UPDATE core_users SET last_seen_at = NOW(3) WHERE id = ?', [$u['id']]);
        }
    }

    /** 임직원 이용 기간이 끝났나(access_until 이 지났으면 true). 기간이 없으면 끝나지 않은 것으로 본다. */
    public static function staffExpired(array $user): bool
    {
        $until = (string) ($user['access_until'] ?? '');
        return $until !== '' && strtotime($until) <= time();
    }

    /** 현재 유효 플랜: staff(이용 기간 안) → staff, 아니면 활성 구독 플랜, 없으면 free. */
    public static function plan(array $user): string
    {
        if (($user['kind'] ?? '') === 'staff' && !self::staffExpired($user)) {
            return 'staff';
        }
        $row = Db::row(
            "SELECT p.code FROM core_subscriptions s JOIN core_plans p ON p.id = s.plan_id
             WHERE s.owner_type = 'user' AND s.owner_id = ? AND s.status IN ('trial','active','past_due')
               AND (s.current_period_end IS NULL OR s.current_period_end > NOW(3))
             ORDER BY s.id DESC LIMIT 1",
            [$user['id']]
        );
        if ($row) {
            return (string) $row['code'];
        }
        $org = Db::row(
            "SELECT p.code FROM core_org_members m JOIN core_subscriptions s ON s.owner_type='org' AND s.owner_id = m.org_id
             JOIN core_plans p ON p.id = s.plan_id
             WHERE m.user_id = ? AND s.status IN ('trial','active','past_due') ORDER BY s.id DESC LIMIT 1",
            [$user['id']]
        );
        return $org ? (string) $org['code'] : 'free';
    }

    public static function primaryOrgId(array $user): ?int
    {
        $r = Db::row('SELECT org_id FROM core_org_members WHERE user_id = ? ORDER BY is_primary DESC, id ASC LIMIT 1', [$user['id']]);
        return $r ? (int) $r['org_id'] : null;
    }
}

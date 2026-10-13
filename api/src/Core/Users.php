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
        return $u;
    }

    /** 관리자가 차단한 계정은 어떤 로그인 수단으로도 못 들어온다(OTP·소셜·개발 로그인 공통 지점). */
    public static function assertActive(array $u): void
    {
        if (($u['status'] ?? 'active') === 'blocked') {
            throw new HttpError('BLOCKED', '이용이 제한된 계정입니다.', 403, '관리자에게 문의하세요.');
        }
    }

    /** 현재 유효 플랜: staff → staff, 아니면 활성 구독 플랜, 없으면 free. */
    public static function plan(array $user): string
    {
        if (($user['kind'] ?? '') === 'staff') {
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

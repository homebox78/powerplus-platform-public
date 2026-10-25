<?php
declare(strict_types=1);

namespace Pp\Core;

/**
 * 요청 주체 하나로 통일(설계서 §2.2): 세션 사용자 · API 키 소유자 · 워커 · 익명.
 * kind: staff|external|null, plan: staff|free|pro|team, roles: superadmin|admin|curator|support.
 */
final class Actor
{
    public function __construct(
        public readonly ?array $user,          // core_users 행(없으면 익명)
        public readonly ?int $orgId,
        public readonly string $kind,          // staff | external | anon | worker
        public readonly string $plan,          // staff | free | pro | team
        /** @var string[] */
        public readonly array $roles,
        public readonly ?array $key = null,    // core_api_keys 행(키 인증일 때)
        public readonly string $via = 'none',  // session | key | worker | none
    ) {
    }

    public static function anon(): self
    {
        return new self(null, null, 'anon', 'free', []);
    }

    public function id(): ?int
    {
        return $this->user ? (int) $this->user['id'] : null;
    }

    public function isStaff(): bool
    {
        return $this->kind === 'staff';
    }

    public function hasRole(string $role): bool
    {
        // 심사용 테스트 계정의 관리자·운영 역할은 보기(GET·HEAD)에만 — 쓰기 요청에서는 일반 회원처럼 자기 것만(사용자 2026-10-23 "관리자는 보기만, 사용자 모드에서만 다 써 볼 수 있게").
        //  라우트마다 isAdmin() 으로 남의 글·시안·장표 고치기를 여는 곳이 있어 한 곳(여기)에서 끈다.
        if (TestLogin::isActor($this) && !in_array((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'), ['GET', 'HEAD'], true)) {
            return false;
        }
        if (in_array('superadmin', $this->roles, true)) {
            return true;
        }
        // superadmin 은 admin 이 대신할 수 없다(결제 숨김·서버 자원 등 슈퍼관리자 전용 — 2026-10-10 판정 D 에서 admin 에게 열린 것 발견)
        if ($role === 'admin' || $role === 'superadmin') {
            return in_array($role, $this->roles, true);
        }
        return in_array($role, $this->roles, true) || in_array('admin', $this->roles, true);
    }

    public function isAdmin(): bool
    {
        return $this->hasRole('admin');
    }

    public function toArray(): array
    {
        return [
            'user' => $this->user ? [
                'id' => $this->user['public_id'],
                'email' => $this->user['email'],
                'name' => $this->user['name'],
                'avatar_url' => $this->user['avatar_url'] ?? null,
                'birthday' => $this->user['birthday'] ?? null,
                'marketing_opt_in' => (bool) ($this->user['marketing_opt_in'] ?? 0),
                'name_changed_at' => $this->user['name_changed_at'] ?? null,
                'created_at' => $this->user['created_at'] ?? null,
            ] : null,
            'kind' => $this->kind,
            'plan' => $this->plan,
            'roles' => $this->roles,
            'via' => $this->via,
        ];
    }
}

<?php
/**
 * 관리자 서버 3 — 사용자 관리 고도화(기획 §9.2 사용자): 수동 추가·플랜 지정·포인트/크레딧 조정·차단·상세·키 폐기·포인트 규칙.
 * 출처: api/routes/admin.php 의 권한·Audit 규약 그대로(다른 작업자와 파일 충돌을 피해 별도 파일).
 * 권한: admin 이상 세션 로그인(API 키 불가). superadmin 계정은 차단·플랜 변경 대상이 될 수 없다. staff 는 플랜을 바꿀 수 없다(임직원 = 전체 무료).
 * 모든 쓰기는 Core\Audit(before/after). 포인트·크레딧 조정의 원장 ref 는 그 감사 행 id.
 */
declare(strict_types=1);

use Pp\Core\Actor;
use Pp\Core\Audit;
use Pp\Core\Config;
use Pp\Core\Db;
use Pp\Core\HttpError;
use Pp\Core\Ids;
use Pp\Core\Mail;
use Pp\Core\MailTemplate;
use Pp\Core\Notify;
use Pp\Core\Points;
use Pp\Core\Response;
use Pp\Core\Router;
use Pp\Core\Users;

/** 관리자가 손으로 지정할 수 있는 플랜(staff 는 회사 메일 분류라 지정 대상이 아니다) */
const ADMIN_PLAN_SET = ['free', 'pro', 'team'];
/** 조정 한 번의 상한(오타로 100만 포인트가 들어가는 사고 방지) */
const ADMIN_ADJUST_MAX = 100000;

return static function (Router $r): void {
    $need = static function (Actor $a, string $role = 'admin'): void {
        if ($a->user === null) {
            throw HttpError::unauthorized();
        }
        if ($a->via !== 'session' || !$a->hasRole($role)) {
            throw HttpError::forbidden();
        }
    };
    $userOr404 = static function (string $pid): array {
        $u = Users::byPublicId($pid);
        if (!$u) {
            throw HttpError::notFound('사용자');
        }
        return $u;
    };
    $isSuper = static fn (array $u): bool => in_array('superadmin', Users::roles((int) $u['id']), true);
    $creditBalance = static fn (int $uid): int => (int) Db::val(
        'SELECT COALESCE(SUM(delta), 0) FROM core_credit_ledger WHERE user_id = ? AND (expires_at IS NULL OR expires_at > NOW(3))',
        [$uid]
    );
    /** 금액·사유 검증 */
    $adjustInput = static function (): array {
        $b = Response::input();
        $amount = $b['amount'] ?? null;
        if (!is_int($amount) && !(is_string($amount) && preg_match('/^-?\d+$/', $amount))) {
            throw new HttpError('INVALID', '금액은 정수로 적어 주세요.', 422, 'amount');
        }
        $amount = (int) $amount;
        if ($amount === 0 || abs($amount) > ADMIN_ADJUST_MAX) {
            throw new HttpError('INVALID', '금액은 0이 아니고 ' . number_format(ADMIN_ADJUST_MAX) . ' 이하여야 합니다.', 422, 'amount');
        }
        $reason = trim((string) ($b['reason'] ?? ''));
        if (mb_strlen($reason) < 2 || mb_strlen($reason) > 200) {
            throw new HttpError('INVALID', '사유를 2~200자로 적어 주세요.', 422, 'reason');
        }
        return [$amount, $reason];
    };
    /** 감사 기록을 먼저 남기고 그 id 를 원장 ref 로 쓴다. 감사가 실패하면 무작위 ref(원장은 그래도 남긴다). */
    $auditRef = static function (Actor $a, string $action, string $target, array $before, array $after): string {
        Audit::log($a, $action, $target, $before, $after);
        $id = Db::lastId();
        $ok = $id > 0 && Db::row('SELECT 1 AS x FROM core_audit WHERE id = ? AND action = ?', [$id, $action]);
        return $ok ? (string) $id : 'x' . Ids::publicId(10);
    };
    $userOut = static function (array $u): array {
        return [
            'id' => $u['public_id'], 'name' => $u['name'], 'email' => $u['email'], 'kind' => $u['kind'],
            'status' => $u['status'] ?? 'active', 'blocked_at' => $u['blocked_at'] ?? null, 'blocked_reason' => $u['blocked_reason'] ?? null,
            'dormant_at' => $u['dormant_at'] ?? null, 'dormant_requested_at' => $u['dormant_requested_at'] ?? null, 'access_until' => $u['access_until'] ?? null,
            'plan' => Users::plan($u), 'roles' => Users::roles((int) $u['id']), 'created_at' => $u['created_at'],
        ];
    };

    // ---- 1. 수동 추가
    $r->post('/admin/users', function (array $p, Actor $a) use ($need, $userOut): void {
        $need($a, 'admin');
        $b = Response::input();
        $email = strtolower(trim((string) ($b['email'] ?? '')));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new HttpError('INVALID', '이메일 형식이 아닙니다.', 422, 'email');
        }
        if (Db::row('SELECT 1 AS x FROM core_users WHERE email = ?', [$email])) {
            throw new HttpError('DUPLICATE', '이미 가입된 이메일입니다.', 409, 'email');
        }
        $name = trim((string) ($b['name'] ?? ''));
        if ($name === '') {
            $name = substr($email, 0, (int) strpos($email, '@'));
        }
        if (mb_strlen($name) > 60) {
            throw new HttpError('INVALID', '이름은 60자까지입니다.', 422, 'name');
        }
        $kind = (string) ($b['kind'] ?? '');
        if (!in_array($kind, ['staff', 'external'], true)) {
            $kind = Users::isStaffEmail($email) ? 'staff' : 'external';
        }
        $plan = (string) ($b['plan'] ?? 'free');
        if ($kind === 'staff') {
            $plan = 'staff';
        } elseif (!in_array($plan, ADMIN_PLAN_SET, true)) {
            throw new HttpError('INVALID', '플랜은 free·pro·team 중 하나입니다.', 422, 'plan');
        }
        $pid = Ids::publicId();
        Db::tx(static function () use ($pid, $email, $name, $kind, $plan, $a): void {
            Db::exec('INSERT INTO core_users (public_id, email, name, kind, session_epoch) VALUES (?,?,?,?,1)', [$pid, $email, $name, $kind]);
            $uid = Db::lastId();
            if (in_array($plan, ['pro', 'team'], true)) {
                $planId = (int) Db::val('SELECT id FROM core_plans WHERE code = ?', [$plan]);
                Db::exec(
                    "INSERT INTO core_subscriptions (public_id, owner_type, owner_id, plan_id, status, source, memo, current_period_start)
                     VALUES (?, 'user', ?, ?, 'active', 'manual', ?, NOW(3))",
                    [Ids::publicId(), $uid, $planId, '관리자 수동 추가 · ' . ($a->user['email'] ?? '')]
                );
            }
        });
        $u = Users::byPublicId($pid);
        $invite = 'off';
        if (!empty($b['send_invite'])) {
            if ((string) Config::get('smtp.host', '') === '') {
                $invite = 'skipped';
            } else {
                [$subj, $text, $html] = MailTemplate::render('invite', ['name' => $name, 'email' => $email, 'plan' => ucfirst($plan)]);
                $ok = Mail::send($email, $subj, $text, $html);
                $invite = $ok ? 'sent' : 'failed';
            }
        }
        Audit::log($a, 'user.create', 'user:' . $pid, null, ['email' => $email, 'kind' => $kind, 'plan' => $plan, 'invite' => $invite]);
        Response::json($userOut($u) + ['invite' => $invite], 201);
    });

    // ---- 2. 플랜 수동 지정
    $r->patch('/admin/users/{id}/plan', function (array $p, Actor $a) use ($need, $userOr404, $userOut): void {
        $need($a, 'admin');
        $u = $userOr404((string) $p['id']);
        if ($u['kind'] === 'staff') {
            throw new HttpError('STAFF_PLAN', '임직원은 플랜을 바꿀 수 없습니다.', 409, '임직원은 전체 무료(staff)입니다.');
        }
        $b = Response::input();
        $plan = (string) ($b['plan'] ?? '');
        if (!in_array($plan, ADMIN_PLAN_SET, true)) {
            throw new HttpError('INVALID', '플랜은 free·pro·team 중 하나입니다.', 422, 'plan');
        }
        $until = trim((string) ($b['until'] ?? ''));
        $end = null;
        if ($until !== '') {
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $until) || !strtotime($until)) {
                throw new HttpError('INVALID', '기한은 YYYY-MM-DD 로 적어 주세요.', 422, 'until');
            }
            if (strtotime($until . ' 23:59:59') <= time()) {
                throw new HttpError('INVALID', '기한은 오늘 이후여야 합니다.', 422, 'until');
            }
            $end = $until . ' 23:59:59.999';
        }
        $memo = trim((string) ($b['memo'] ?? ''));
        $before = ['plan' => Users::plan($u)];
        Db::tx(static function () use ($u, $plan, $end, $memo, $a): void {
            // 앞서 손으로 지정한 구독은 닫고(결제 구독은 건드리지 않는다), 새로 하나 둔다. free 는 닫기만.
            Db::exec(
                "UPDATE core_subscriptions SET status = 'canceled', canceled_at = NOW(3)
                 WHERE owner_type = 'user' AND owner_id = ? AND source = 'manual' AND status IN ('trial','active','past_due')",
                [$u['id']]
            );
            if ($plan !== 'free') {
                $planId = (int) Db::val('SELECT id FROM core_plans WHERE code = ?', [$plan]);
                Db::exec(
                    "INSERT INTO core_subscriptions (public_id, owner_type, owner_id, plan_id, status, source, memo, current_period_start, current_period_end)
                     VALUES (?, 'user', ?, ?, 'active', 'manual', ?, NOW(3), ?)",
                    [Ids::publicId(), $u['id'], $planId, mb_substr(($memo !== '' ? $memo . ' · ' : '') . ($a->user['email'] ?? ''), 0, 200), $end]
                );
            }
        });
        $u2 = Users::byId((int) $u['id']);
        $paid = (int) Db::val(
            "SELECT COUNT(*) FROM core_subscriptions WHERE owner_type = 'user' AND owner_id = ? AND source <> 'manual' AND status IN ('trial','active','past_due')",
            [$u['id']]
        );
        Audit::log($a, 'user.plan', 'user:' . $u['public_id'], $before, ['plan' => Users::plan($u2), 'set' => $plan, 'until' => $until ?: null]);
        Response::json($userOut($u2) + ['plan_until' => $until ?: null, 'paid_subscription' => $paid > 0]);
    });

    // ---- 3. 포인트 수동 적립/회수
    $r->post('/admin/users/{id}/points', function (array $p, Actor $a) use ($need, $userOr404, $adjustInput, $auditRef): void {
        $need($a, 'admin');
        $u = $userOr404((string) $p['id']);
        [$amount, $reason] = $adjustInput();
        $out = Db::tx(static function () use ($u, $amount, $reason, $a, $auditRef): array {
            Db::row('SELECT id FROM core_users WHERE id = ? FOR UPDATE', [$u['id']]);
            $bal = Points::balance((int) $u['id']);
            if ($bal + $amount < 0) {
                throw new HttpError('INSUFFICIENT', "잔액({$bal}P)보다 많이 회수할 수 없습니다.", 400, 'amount');
            }
            $ref = $auditRef($a, 'points.adjust', 'user:' . $u['public_id'], ['balance' => $bal], ['balance' => $bal + $amount, 'delta' => $amount, 'reason' => $reason]);
            Db::exec(
                "INSERT INTO core_point_ledger (user_id, delta, reason, ref_type, ref_id, memo) VALUES (?, ?, 'admin_adjust', 'audit', ?, ?)",
                [$u['id'], $amount, $ref, $reason]
            );
            return ['balance' => $bal + $amount, 'delta' => $amount, 'ref' => $ref];
        });
        Response::json($out);
    });

    // ---- 4. 크레딧 지급/회수
    $r->post('/admin/users/{id}/credits', function (array $p, Actor $a) use ($need, $userOr404, $adjustInput, $auditRef, $creditBalance): void {
        $need($a, 'admin');
        $u = $userOr404((string) $p['id']);
        [$amount, $reason] = $adjustInput();
        $out = Db::tx(static function () use ($u, $amount, $reason, $a, $auditRef, $creditBalance): array {
            Db::row('SELECT id FROM core_users WHERE id = ? FOR UPDATE', [$u['id']]);
            $bal = $creditBalance((int) $u['id']);
            if ($bal + $amount < 0) {
                throw new HttpError('INSUFFICIENT', "잔액({$bal}크레딧)보다 많이 회수할 수 없습니다.", 400, 'amount');
            }
            $ref = $auditRef($a, 'credits.adjust', 'user:' . $u['public_id'], ['balance' => $bal], ['balance' => $bal + $amount, 'delta' => $amount, 'reason' => $reason]);
            Db::exec(
                "INSERT INTO core_credit_ledger (user_id, delta, kind, ref_type, ref_id, memo, balance_after) VALUES (?, ?, 'admin_adjust', 'audit', ?, ?, ?)",
                [$u['id'], $amount, $ref, $reason, $bal + $amount]
            );
            return ['balance' => $bal + $amount, 'delta' => $amount, 'ref' => $ref];
        });
        Response::json($out);
    });

    // ---- 5. 차단/해제
    $r->patch('/admin/users/{id}/status', function (array $p, Actor $a) use ($need, $userOr404, $isSuper, $userOut): void {
        $need($a, 'admin');
        $u = $userOr404((string) $p['id']);
        $b = Response::input();
        $status = (string) ($b['status'] ?? '');
        if (!in_array($status, ['active', 'blocked'], true)) {
            throw new HttpError('INVALID', '상태는 active 또는 blocked 입니다.', 422, 'status');
        }
        $reason = trim((string) ($b['reason'] ?? ''));
        if ($status === 'blocked') {
            if ($isSuper($u)) {
                throw HttpError::forbidden('슈퍼관리자는 차단할 수 없습니다.');
            }
            if ((int) $u['id'] === $a->id()) {
                throw new HttpError('SELF_BLOCK', '자기 자신은 차단할 수 없습니다.', 409);
            }
            if (mb_strlen($reason) < 2 || mb_strlen($reason) > 200) {
                throw new HttpError('INVALID', '차단 사유를 2~200자로 적어 주세요.', 422, 'reason');
            }
            // 세션 전부 무효(session_epoch+1) — 지금 열린 브라우저도 다음 요청에서 로그아웃된다
            Db::exec("UPDATE core_users SET status = 'blocked', blocked_at = NOW(3), blocked_reason = ?, session_epoch = session_epoch + 1 WHERE id = ?", [$reason, $u['id']]);
        } else {
            // 휴면 승인도 여기 — 활동 시각을 지금으로 돌려 놓아야 다음 요청에서 다시 휴면으로 떨어지지 않는다
            // MySQL 은 SET 을 왼쪽부터 적용한다 — last_seen_at 을 status 보다 먼저(바뀌기 전 status 로 판정)
            Db::exec("UPDATE core_users SET last_seen_at = IF(status = 'dormant', NOW(3), last_seen_at), status = 'active', blocked_at = NULL, blocked_reason = NULL,
                      dormant_at = NULL, dormant_requested_at = NULL WHERE id = ?", [$u['id']]);
        }
        $u2 = Users::byId((int) $u['id']);
        if (($u['status'] ?? '') === 'dormant' && $status === 'active') {
            Notify::send((int) $u['id'], 'account', '휴면 해제가 승인되었습니다. 다시 로그인해 이용하세요.', '/login', $a->id());
        }
        $act = ($u['status'] ?? '') === 'dormant' && $status === 'active' ? 'user.reactivate' : ($status === 'blocked' ? 'user.block' : 'user.unblock');
        Audit::log($a, $act, 'user:' . $u['public_id'],
            ['status' => $u['status'] ?? 'active'], ['status' => $status, 'reason' => $reason !== '' ? $reason : null]);
        Response::json($userOut($u2));
    });

    // ---- 5-2. 임직원 이용 기간 연장(가입일 + 1년이 기본, 사용자 2026-10-16). 남은 기간 끝 또는 오늘 중 늦은 날에서 1년.
    $r->post('/admin/users/{id}/extend', function (array $p, Actor $a) use ($need, $userOr404, $userOut): void {
        $need($a, 'admin');
        $u = $userOr404((string) $p['id']);
        if (($u['kind'] ?? '') !== 'staff') {
            throw new HttpError('NOT_STAFF', '임직원 계정만 이용 기간이 있습니다.', 409, '외부 회원은 플랜 지정으로 기간을 정합니다.');
        }
        Db::exec('UPDATE core_users SET access_until = DATE_ADD(GREATEST(COALESCE(access_until, NOW(3)), NOW(3)), INTERVAL 1 YEAR) WHERE id = ?', [$u['id']]);
        $u2 = Users::byId((int) $u['id']);
        Audit::log($a, 'user.extend', 'user:' . $u['public_id'], ['access_until' => $u['access_until'] ?? null], ['access_until' => $u2['access_until'] ?? null]);
        Response::json($userOut($u2));
    });

    // ---- 6. 상세
    $r->get('/admin/users/{id}', function (array $p, Actor $a) use ($need, $userOr404, $userOut, $creditBalance): void {
        $need($a, 'admin');
        $u = $userOr404((string) $p['id']);
        $uid = (int) $u['id'];
        $safe = static function (string $sql, array $args) {
            try {
                return (int) Db::val($sql, $args);
            } catch (\Throwable) {
                return 0;
            }
        };
        $sub = Db::row(
            "SELECT s.source, s.memo, s.current_period_end, p.code FROM core_subscriptions s JOIN core_plans p ON p.id = s.plan_id
             WHERE s.owner_type = 'user' AND s.owner_id = ? AND s.status IN ('trial','active','past_due')
               AND (s.current_period_end IS NULL OR s.current_period_end > NOW(3)) ORDER BY s.id DESC LIMIT 1",
            [$uid]
        );
        $points = array_map(static fn ($x) => [
            'id' => (int) $x['id'], 'delta' => (int) $x['delta'], 'reason' => $x['reason'], 'memo' => $x['memo'],
            'ref' => $x['ref_type'] !== '' ? $x['ref_type'] . ':' . $x['ref_id'] : null, 'created_at' => $x['created_at'],
        ], Db::rows('SELECT * FROM core_point_ledger WHERE user_id = ? ORDER BY id DESC LIMIT 20', [$uid]));
        $credits = array_map(static fn ($x) => [
            'id' => (int) $x['id'], 'delta' => (int) $x['delta'], 'kind' => $x['kind'], 'memo' => $x['memo'] ?? null,
            'balance_after' => (int) $x['balance_after'], 'expires_at' => $x['expires_at'], 'created_at' => $x['created_at'],
        ], Db::rows('SELECT * FROM core_credit_ledger WHERE user_id = ? ORDER BY id DESC LIMIT 20', [$uid]));
        $keys = array_map(static fn ($k) => [
            'id' => $k['public_id'], 'name' => $k['name'], 'masked' => $k['prefix'] . '…' . $k['key_last4'],
            'scopes' => json_decode((string) $k['scopes'], true) ?: ['all'], 'daily_limit' => $k['daily_limit'] !== null ? (int) $k['daily_limit'] : null,
            'last_used_at' => $k['last_used_at'], 'revoked_at' => $k['revoked_at'], 'created_at' => $k['created_at'],
        ], Db::rows('SELECT * FROM core_api_keys WHERE user_id = ? ORDER BY revoked_at IS NULL DESC, id DESC', [$uid]));
        $audit = array_map(static fn ($x) => [
            'id' => (int) $x['id'], 'action' => $x['action'], 'actor' => $x['actor_name'], 'actor_email' => $x['actor_email'],
            'before' => $x['before_json'] ? json_decode((string) $x['before_json'], true) : null,
            'after' => $x['after_json'] ? json_decode((string) $x['after_json'], true) : null, 'created_at' => $x['created_at'],
        ], Db::rows(
            "SELECT au.*, x.name AS actor_name, x.email AS actor_email FROM core_audit au LEFT JOIN core_users x ON x.id = au.actor_user_id
             WHERE au.target_type = 'user' AND au.target_id = ? ORDER BY au.id DESC LIMIT 10",
            [$u['public_id']]
        ));
        $lastLogin = Db::val('SELECT MAX(last_login_at) FROM core_user_logins WHERE user_id = ?', [$uid]);
        $logins = array_map(static fn ($l) => ['provider' => $l['provider'], 'last_login_at' => $l['last_login_at']],
            Db::rows('SELECT provider, last_login_at FROM core_user_logins WHERE user_id = ? ORDER BY last_login_at DESC', [$uid]));
        $last = max((string) ($u['last_seen_at'] ?? ''), (string) ($lastLogin ?? ''));
        Response::json($userOut($u) + [
            'plan_source' => $sub['source'] ?? null, 'plan_until' => $sub['current_period_end'] ?? null, 'plan_memo' => $sub['memo'] ?? null,
            'last_active' => $last !== '' ? $last : null, 'logins' => $logins,
            'points' => ['balance' => Points::balance($uid), 'ledger' => $points],
            'credits' => ['balance' => $creditBalance($uid), 'ledger' => $credits],
            'keys' => $keys,
            'activity' => [
                'asset_uses' => $safe('SELECT COUNT(*) FROM asset_uses WHERE user_id = ?', [$uid]),
                'deck_jobs' => $safe('SELECT COUNT(*) FROM deck_jobs WHERE email = ? AND deleted_at IS NULL', [$u['email']]),
                'mockups' => $safe('SELECT COUNT(*) FROM mock_mockups WHERE owner_user_id = ? AND deleted_at IS NULL', [$uid]),
                'posts' => $safe('SELECT COUNT(*) FROM comm_posts WHERE owner_user_id = ?', [$uid]),
            ],
            'audit' => $audit,
            'can' => ['block' => !in_array('superadmin', Users::roles($uid), true) && $uid !== $a->id(), 'plan' => $u['kind'] !== 'staff'],
        ]);
    });

    // ---- 6-2. 키 폐기
    $r->post('/admin/keys/{id}/revoke', function (array $p, Actor $a) use ($need): void {
        $need($a, 'admin');
        $k = Db::row('SELECT k.*, u.public_id AS owner_pid FROM core_api_keys k JOIN core_users u ON u.id = k.user_id WHERE k.public_id = ?', [(string) $p['id']]);
        if (!$k) {
            throw HttpError::notFound('키');
        }
        if ($k['revoked_at'] === null) {
            Db::exec('UPDATE core_api_keys SET revoked_at = NOW(3) WHERE id = ?', [$k['id']]);
            Audit::log($a, 'key.revoke', 'user:' . $k['owner_pid'], ['key' => $k['public_id'], 'revoked' => false], ['key' => $k['public_id'], 'revoked' => true, 'by' => 'admin']);
        }
        Response::json(['id' => $k['public_id'], 'revoked' => true]);
    });

    // ---- 7. 포인트 규칙
    $ruleOut = static fn (array $x): array => [
        'reason' => $x['reason'], 'delta' => (int) $x['delta'],
        'daily_cap' => $x['daily_cap'] !== null ? (int) $x['daily_cap'] : null, 'yearly_cap' => $x['yearly_cap'] !== null ? (int) $x['yearly_cap'] : null,
        'enabled' => (bool) $x['enabled'], 'note' => $x['note'],
        'used_30' => (int) ($x['used_30'] ?? 0),
    ];
    // 메일 서식 미리보기 — 유형별 샘플 값으로 전부 그려 한 페이지에서 본다(관리자 /admin/mail).
    $r->get('/admin/mail/templates', function (array $p, Actor $a) use ($need): void {
        $need($a);
        $out = [];
        foreach (MailTemplate::TYPES as $type => $t) {
            [$subj, $text, $html] = MailTemplate::render($type);
            $out[] = ['type' => $type, 'group' => $t['group'], 'group_label' => MailTemplate::GROUPS[$t['group']], 'label' => $t['label'], 'when' => $t['when'], 'subject' => $subj, 'text' => $text, 'html' => $html];
        }
        Response::json(['groups' => MailTemplate::GROUPS, 'items' => $out]);
    });
    $r->get('/admin/point-rules', function (array $p, Actor $a) use ($need, $ruleOut): void {
        $need($a, 'admin');
        $rows = Db::rows(
            "SELECT r.*, (SELECT COUNT(*) FROM core_point_ledger l WHERE l.reason = r.reason AND l.created_at >= NOW(3) - INTERVAL 30 DAY) AS used_30
             FROM core_point_rules r ORDER BY r.delta < 0, r.reason"
        );
        Response::json(array_map($ruleOut, $rows));
    });
    $r->patch('/admin/point-rules/{reason}', function (array $p, Actor $a) use ($need, $ruleOut): void {
        $need($a, 'admin');
        $x = Db::row('SELECT * FROM core_point_rules WHERE reason = ?', [(string) $p['reason']]);
        if (!$x) {
            throw HttpError::notFound('규칙');
        }
        $b = Response::input();
        $set = [];
        $args = [];
        $cap = static function (mixed $v, string $field): ?int {
            if ($v === null || $v === '') {
                return null;
            }
            if (!is_numeric($v) || (int) $v < 0 || (int) $v > 10000) {
                throw new HttpError('INVALID', '상한은 0~10,000 사이 정수(비우면 없음)입니다.', 422, $field);
            }
            return (int) $v;
        };
        if (array_key_exists('delta', $b)) {
            $d = $b['delta'];
            if (!is_numeric($d) || (int) $d === 0 || abs((int) $d) > 10000) {
                throw new HttpError('INVALID', '값은 0이 아닌 ±10,000 이하 정수입니다.', 422, 'delta');
            }
            if (((int) $d < 0) !== ((int) $x['delta'] < 0)) {
                throw new HttpError('INVALID', '적립 규칙과 사용 규칙의 부호는 바꿀 수 없습니다.', 422, 'delta');
            }
            $set[] = 'delta = ?';
            $args[] = (int) $d;
        }
        foreach (['daily_cap', 'yearly_cap'] as $f) {
            if (array_key_exists($f, $b)) {
                $set[] = "{$f} = ?";
                $args[] = $cap($b[$f], $f);
            }
        }
        if (array_key_exists('enabled', $b)) {
            $set[] = 'enabled = ?';
            $args[] = $b['enabled'] ? 1 : 0;
        }
        if (!$set) {
            throw HttpError::invalid('바꿀 값이 없습니다.');
        }
        $args[] = $x['reason'];
        Db::exec('UPDATE core_point_rules SET ' . implode(', ', $set) . ' WHERE reason = ?', $args);
        $y = Db::row('SELECT * FROM core_point_rules WHERE reason = ?', [$x['reason']]);
        Audit::log($a, 'point_rule.update', 'point_rule:' . $x['reason'], $ruleOut($x), $ruleOut($y));
        Response::json($ruleOut($y));
    });
};

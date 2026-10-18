<?php
/**
 * 관리자 일괄 처리 — 여러 개 골라 한꺼번에(사용자 지적 "관리할 때 한꺼번에 수정·삭제할 깊이가 없다").
 * 출처: api/routes/admin.php POST /admin/assets/bulk(ids 검증·상한·Audit 규약), 단건 처리는 admin.php(문의·삭제요청·자료요청)·admin3.php(사용자) 를 그대로 따른다.
 * 권한: 단건 엔드포인트와 같은 역할. 세션 로그인만(API 키 불가). 항목마다 Core\Audit. 응답 {count, skipped?}.
 * 역할 부여는 일괄로 하지 않는다(위험). 슈퍼관리자·자기 자신은 차단·플랜 대상에서 뺀다.
 */
declare(strict_types=1);

use Pp\Core\Actor;
use Pp\Core\Audit;
use Pp\Core\Db;
use Pp\Core\HttpError;
use Pp\Core\Ids;
use Pp\Core\Notify;
use Pp\Core\Points;
use Pp\Core\Response;
use Pp\Core\Router;
use Pp\Core\Users;

return static function (Router $r): void {
    // ── A: 사용자·문의·삭제요청·자료요청
    $need = static function (Actor $a, string $role): void {
        if ($a->user === null) {
            throw HttpError::unauthorized();
        }
        if ($a->via !== 'session' || !$a->hasRole($role)) {
            throw HttpError::forbidden();
        }
    };
    /** ids 배열 검증 — 형식이 맞는 것만, 중복 제거, 500개 상한 */
    $ids = static function (array $b, string $re = '/^[A-Za-z0-9_-]{4,32}$/'): array {
        $list = array_values(array_unique(array_filter(array_map('strval', (array) ($b['ids'] ?? [])), static fn (string $s): bool => preg_match($re, $s) === 1)));
        if ($list === []) {
            throw HttpError::invalid('처리할 항목을 골라 주세요.');
        }
        if (count($list) > 500) {
            throw HttpError::invalid('한 번에 500개까지 처리할 수 있습니다.');
        }
        return $list;
    };
    $in = static fn (array $list): string => implode(',', array_fill(0, count($list), '?'));

    // ---- 사용자: block · unblock · plan · points
    $r->post('/admin/users/bulk', function (array $p, Actor $a) use ($need, $ids, $in): void {
        $need($a, 'admin');
        $b = Response::input();
        $action = (string) ($b['action'] ?? '');
        if (!in_array($action, ['block', 'unblock', 'plan', 'points'], true)) {
            throw HttpError::invalid('할 일을 골라 주세요.', 'block · unblock · plan · points 중 하나');
        }
        $list = $ids($b);
        $users = Db::rows("SELECT * FROM core_users WHERE public_id IN ({$in($list)}) AND deleted_at IS NULL", $list);
        $reason = trim((string) ($b['reason'] ?? ''));
        $count = 0;
        $skipped = 0;
        $already = 0;   // points: 같은 사유로 오늘(한국 시각) 이미 받은 사람
        $bulkRef = Points::bulkRef($reason);

        if ($action === 'block' || $action === 'points') {
            if (mb_strlen($reason) < 2 || mb_strlen($reason) > 200) {
                throw new HttpError('INVALID', '사유를 2~200자로 적어 주세요.', 422, 'reason');
            }
        }
        $amount = 0;
        if ($action === 'points') {
            $raw = $b['amount'] ?? null;
            if (!is_int($raw) && !(is_string($raw) && preg_match('/^-?\d+$/', $raw))) {
                throw new HttpError('INVALID', '포인트는 정수로 적어 주세요.', 422, 'amount');
            }
            $amount = (int) $raw;
            if ($amount === 0 || abs($amount) > 100000) {
                throw new HttpError('INVALID', '포인트는 0이 아니고 100,000 이하여야 합니다.', 422, 'amount');
            }
        }
        $plan = '';
        $end = null;
        $until = '';
        if ($action === 'plan') {
            $plan = (string) ($b['plan'] ?? '');
            if (!in_array($plan, ['free', 'pro', 'team'], true)) {
                throw new HttpError('INVALID', '플랜은 free·pro·team 중 하나입니다.', 422, 'plan');
            }
            $until = trim((string) ($b['until'] ?? ''));
            if ($until !== '') {
                if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $until) || !strtotime($until) || strtotime($until . ' 23:59:59') <= time()) {
                    throw new HttpError('INVALID', '기한은 오늘 이후 날짜(YYYY-MM-DD)로 적어 주세요.', 422, 'until');
                }
                $end = $until . ' 23:59:59.999';
            }
        }

        foreach ($users as $u) {
            $uid = (int) $u['id'];
            $super = in_array('superadmin', Users::roles($uid), true);
            $target = 'user:' . $u['public_id'];
            if ($action === 'block') {
                if ($super || $uid === $a->id() || ($u['status'] ?? 'active') === 'blocked') {
                    $skipped++;
                    continue;
                }
                Db::exec("UPDATE core_users SET status = 'blocked', blocked_at = NOW(3), blocked_reason = ?, session_epoch = session_epoch + 1 WHERE id = ?", [$reason, $uid]);
                Audit::log($a, 'user.block', $target, ['status' => $u['status'] ?? 'active'], ['status' => 'blocked', 'reason' => $reason, 'bulk' => true]);
            } elseif ($action === 'unblock') {
                if (($u['status'] ?? 'active') !== 'blocked') {
                    $skipped++;
                    continue;
                }
                Db::exec("UPDATE core_users SET status = 'active', blocked_at = NULL, blocked_reason = NULL WHERE id = ?", [$uid]);
                Audit::log($a, 'user.unblock', $target, ['status' => 'blocked'], ['status' => 'active', 'bulk' => true]);
            } elseif ($action === 'plan') {
                if ($super || $u['kind'] === 'staff') {
                    $skipped++;
                    continue;
                }
                $before = ['plan' => Users::plan($u)];
                Db::tx(static function () use ($uid, $plan, $end, $a): void {
                    Db::exec(
                        "UPDATE core_subscriptions SET status = 'canceled', canceled_at = NOW(3)
                         WHERE owner_type = 'user' AND owner_id = ? AND source = 'manual' AND status IN ('trial','active','past_due')",
                        [$uid]
                    );
                    if ($plan !== 'free') {
                        $planId = (int) Db::val('SELECT id FROM core_plans WHERE code = ?', [$plan]);
                        Db::exec(
                            "INSERT INTO core_subscriptions (public_id, owner_type, owner_id, plan_id, status, source, memo, current_period_start, current_period_end)
                             VALUES (?, 'user', ?, ?, 'active', 'manual', ?, NOW(3), ?)",
                            [Ids::publicId(), $uid, $planId, mb_substr('일괄 지정 · ' . ($a->user['email'] ?? ''), 0, 200), $end]
                        );
                    }
                });
                Audit::log($a, 'user.plan', $target, $before, ['plan' => Users::plan(Users::byId($uid) ?? $u), 'set' => $plan, 'until' => $until ?: null, 'bulk' => true]);
            } else { // points
                // 같은 대상·같은 사유·같은 날(한국 시각)은 한 번만(2026-10-18 사용자 결정, 전수조사 B) — 중간에 끊겨 다시 눌러도 이미 받은 사람은 두 번 받지 않는다.
                // 판정은 core_point_ledger 유일 키(user_id, reason, ref_type, ref_id) 하나 — 두 요청이 겹쳐도 DB 가 한 줄만 받는다(INSERT IGNORE).
                $res = Db::tx(static function () use ($uid, $u, $amount, $reason, $a, $bulkRef): string {
                    Db::row('SELECT id FROM core_users WHERE id = ? FOR UPDATE', [$uid]);
                    $bal = Points::balance($uid);
                    if ($bal + $amount < 0) {
                        return 'low';
                    }
                    $n = Db::exec(
                        "INSERT IGNORE INTO core_point_ledger (user_id, delta, reason, ref_type, ref_id, memo) VALUES (?, ?, 'admin_adjust', 'bulk', ?, ?)",
                        [$uid, $amount, $bulkRef, $reason]
                    );
                    if ($n === 0) {
                        return 'dup';
                    }
                    Audit::log($a, 'points.adjust', 'user:' . $u['public_id'], ['balance' => $bal], ['balance' => $bal + $amount, 'delta' => $amount, 'reason' => $reason, 'bulk' => true, 'ref' => $bulkRef]);
                    return 'ok';
                });
                if ($res === 'dup') {
                    $already++;
                    continue;
                }
                if ($res !== 'ok') {
                    $skipped++;
                    continue;
                }
            }
            $count++;
        }
        $skipped += count($list) - count($users);
        $out = ['action' => $action, 'count' => $count, 'skipped' => $skipped];
        if ($action === 'points') {
            $out['already'] = $already;
            if ($already > 0) {
                $out['note'] = "이미 지급 {$already}명 — 같은 사유로 오늘(한국 시각) 이미 받은 사람은 건너뛰었습니다.";
            }
        }
        Response::json($out);
    });

    // ---- 문의: 상태 일괄 · 삭제(admin 이상, 되돌릴 수 없음)
    $r->post('/admin/contacts/bulk', function (array $p, Actor $a) use ($need, $ids, $in): void {
        $b = Response::input();
        $action = (string) ($b['action'] ?? '');
        if (!in_array($action, ['status', 'delete'], true)) {
            throw HttpError::invalid('할 일을 골라 주세요.', 'status · delete 중 하나');
        }
        $need($a, $action === 'delete' ? 'admin' : 'support');
        $list = $ids($b);
        $status = (string) ($b['status'] ?? '');
        if ($action === 'status' && !in_array($status, ['open', 'answered', 'closed'], true)) {
            throw HttpError::invalid('상태 값이 올바르지 않습니다.', 'status');
        }
        $count = 0;
        foreach (Db::rows("SELECT id, public_id, status FROM core_contacts WHERE public_id IN ({$in($list)})", $list) as $c) {
            if ($action === 'delete') {
                Db::exec('DELETE FROM core_contacts WHERE id = ?', [$c['id']]);
                Audit::log($a, 'contact.delete', 'contact:' . $c['public_id'], ['status' => $c['status']], ['bulk' => true]);
            } else {
                if ($c['status'] === $status) {
                    continue;
                }
                Db::exec('UPDATE core_contacts SET status = ?, handled_by = ?, handled_at = NOW(3) WHERE id = ?', [$status, $a->id(), $c['id']]);
                Audit::log($a, 'contact.update', 'contact:' . $c['public_id'], ['status' => $c['status']], ['status' => $status, 'bulk' => true]);
            }
            $count++;
        }
        Response::json(['action' => $action, 'count' => $count]);
    });

    // ---- 삭제요청: 상태 일괄(처리 완료·반려는 처리 결과 필수)
    $r->post('/admin/removals/bulk', function (array $p, Actor $a) use ($need, $ids, $in): void {
        $need($a, 'support');
        $b = Response::input();
        $list = array_map('strtoupper', $ids($b));
        $status = (string) ($b['status'] ?? '');
        if (!in_array($status, ['received', 'reviewing', 'done', 'rejected'], true)) {
            throw HttpError::invalid('상태 값이 올바르지 않습니다.', 'status');
        }
        $final = in_array($status, ['done', 'rejected'], true);
        $resolution = trim((string) ($b['resolution'] ?? ''));
        if ($final && $resolution === '') {
            throw new HttpError('INVALID', '처리 결과를 적어 주세요.', 422, 'resolution');
        }
        if (mb_strlen($resolution) > 3000) {
            throw new HttpError('INVALID', '처리 결과는 3,000자까지 적을 수 있습니다.', 422, 'resolution');
        }
        $count = 0;
        foreach (Db::rows("SELECT id, no, status, resolution FROM core_removal_requests WHERE no IN ({$in($list)})", $list) as $x) {
            if ($x['status'] === $status) {
                continue;
            }
            $res = $resolution !== '' ? $resolution : ($x['resolution'] ?? null);
            Db::exec('UPDATE core_removal_requests SET status = ?, resolution = ?, handled_by = ?, handled_at = IF(?, NOW(3), handled_at) WHERE id = ?',
                [$status, $res === '' ? null : $res, $a->id(), $final ? 1 : 0, $x['id']]);
            Audit::log($a, 'removal.update', 'removal:' . $x['no'], ['status' => $x['status']], ['status' => $status, 'bulk' => true]);
            $count++;
        }
        Response::json(['action' => 'status', 'count' => $count]);
    });

    // ---- 자료 요청: 상태 일괄(요청한 사람에게 알림) · 삭제(admin 이상)
    $r->post('/admin/requests/bulk', function (array $p, Actor $a) use ($need, $ids, $in): void {
        $b = Response::input();
        $action = (string) ($b['action'] ?? '');
        if (!in_array($action, ['status', 'delete'], true)) {
            throw HttpError::invalid('할 일을 골라 주세요.', 'status · delete 중 하나');
        }
        $need($a, $action === 'delete' ? 'admin' : 'support');
        $list = $ids($b);
        $status = (string) ($b['status'] ?? '');
        if ($action === 'status' && !in_array($status, ['new', 'done', 'rejected'], true)) {
            throw HttpError::invalid('상태 값이 올바르지 않습니다.', 'status');
        }
        $count = 0;
        foreach (Db::rows("SELECT id, public_id, status, user_id, title FROM asset_requests WHERE public_id IN ({$in($list)})", $list) as $x) {
            if ($action === 'delete') {
                Db::exec('DELETE FROM asset_requests WHERE id = ?', [$x['id']]);
                Audit::log($a, 'asset.request.delete', 'asset_requests:' . $x['public_id'], ['status' => $x['status'], 'title' => $x['title']], ['bulk' => true]);
                $count++;
                continue;
            }
            if ($x['status'] === $status) {
                continue;
            }
            $fin = $status !== 'new';
            Db::exec('UPDATE asset_requests SET status = ?, handled_by = ?, handled_at = IF(?, NOW(3), NULL) WHERE id = ?',
                [$status, $fin ? $a->id() : null, $fin ? 1 : 0, $x['id']]);
            if ($fin && $x['user_id'] !== null) {
                try {
                    Notify::send((int) $x['user_id'], 'asset.request', $status === 'done' ? '요청하신 자료가 등록됐습니다' : '자료 요청이 보류됐습니다', '/account?tab=assets', $a->id(), mb_substr((string) $x['title'], 0, 80));
                if ($status === 'done') {
                    $rq = ['uid' => (int) $x['user_id'], 'title' => mb_substr((string) $x['title'], 0, 80)];
                    Notify::later(static function () use ($rq): void {
                        $nm = (string) (Db::val('SELECT name FROM core_users WHERE id = ?', [$rq['uid']]) ?? '');
                        Notify::mail($rq['uid'], 'request', 'request_done', ['name' => ($nm !== '' ? $nm : '회원'), 'title' => $rq['title'], 'count' => 0]);
                    });
                }
                } catch (\Throwable) {
                }
            }
            Audit::log($a, 'asset.request.update', 'asset_requests:' . $x['public_id'], ['status' => $x['status']], ['status' => $status, 'bulk' => true]);
            $count++;
        }
        Response::json(['action' => $action, 'count' => $count]);
    });

    // ── B 구획(다른 작업자)
};

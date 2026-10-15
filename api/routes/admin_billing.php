<?php
/**
 * 관리자 · 구독·결제 — /api/v1/admin/billing/…  (사용자 2026-10-15 "관리자 모드에 구독 관련 관리 페이지가 없는데?")
 * 사용자 쪽 결제 흐름은 billing.php, 여기는 운영자가 보는 쪽만: 요약 · 구독 목록 · 결제(청구서) 목록 · 웹훅 기록 · 해지/철회 · 환불.
 *
 *   GET  /admin/billing/summary                          키 상태·활성 구독(플랜별)·월 환산 매출·이번 달 결제·대기/실패·곧 끝나는 PG 구독
 *   GET  /admin/billing/subscriptions?status&source&plan&q&page
 *   GET  /admin/billing/invoices?status&kind&q&page
 *   GET  /admin/billing/events?page                        토스 웹훅 기록(본문은 앞부분만)
 *   POST /admin/billing/subscriptions/{id}/cancel {now}  해지 예약(기간 끝까지 사용) / now=true 면 즉시 종료
 *   POST /admin/billing/subscriptions/{id}/resume        해지 철회(기간이 남아 있을 때)
 *   POST /admin/billing/invoices/{id}/refund {reason}    전액 환불(토스 결제 취소) — superadmin 만. 크레딧은 적립분 회수, 구독은 즉시 종료
 *
 * 권한: 조회·해지 = admin, 환불 = superadmin(돈이 나가는 일). 모두 세션 로그인만(API 키 불가). 변경은 감사 기록.
 * 빌링키(billing_key_enc)는 어떤 응답에도 싣지 않는다.
 */
declare(strict_types=1);

use Pp\Core\Actor;
use Pp\Core\Audit;
use Pp\Core\Config;
use Pp\Core\Db;
use Pp\Core\HttpError;
use Pp\Core\Response;
use Pp\Core\Router;

return static function (Router $r): void {
    $need = static function (Actor $a, string $role = 'admin'): void {
        if ($a->user === null) {
            throw HttpError::unauthorized();
        }
        if ($a->via !== 'session' || !$a->hasRole($role)) {
            throw HttpError::forbidden();
        }
    };
    $live = "s.status IN ('trial','active','past_due') AND (s.current_period_end IS NULL OR s.current_period_end > NOW(3))";
    $subOut = static fn (array $s): array => [
        'id' => $s['public_id'], 'status' => $s['status'], 'source' => $s['source'], 'billing' => $s['billing'],
        'plan' => $s['plan_code'], 'plan_name' => $s['plan_name'], 'seats' => (int) $s['seats'], 'card' => $s['card_label'],
        'has_billing_key' => $s['billing_key_enc'] !== null && $s['billing_key_enc'] !== '', 'memo' => $s['memo'],
        'period_start' => $s['current_period_start'], 'period_end' => $s['current_period_end'], 'canceled_at' => $s['canceled_at'],
        'created_at' => $s['created_at'],
        'owner' => ['type' => $s['owner_type'], 'id' => $s['u_pid'], 'name' => $s['u_name'], 'email' => $s['u_email']],
    ];
    $subRow = static function (string $pid): array {
        $s = Db::row('SELECT * FROM core_subscriptions WHERE public_id = ?', [$pid]);
        if ($s === null) {
            throw HttpError::notFound('구독');
        }
        return $s;
    };

    $r->get('/admin/billing/summary', function (array $p, Actor $a) use ($need, $live): void {
        $need($a);
        $ck = (string) Config::get('toss.client_key', '');
        $mode = $ck === '' ? 'none' : (str_starts_with($ck, 'live_') ? 'live' : 'test');
        $byPlan = Db::rows("SELECT p.code, p.name, s.source, COUNT(*) AS n FROM core_subscriptions s JOIN core_plans p ON p.id = s.plan_id
                            WHERE {$live} GROUP BY p.code, p.name, s.source ORDER BY p.code, s.source");
        // 월 환산 = PG 구독만(수동 부여·옛 이관은 돈을 받지 않는다). 연간은 price_year_krw 가 이미 월 환산값
        $mrr = (int) Db::val("SELECT COALESCE(SUM(IF(s.billing = 'year', p.price_year_krw, p.price_month_krw)), 0)
                              FROM core_subscriptions s JOIN core_plans p ON p.id = s.plan_id WHERE {$live} AND s.source = 'pg' AND s.canceled_at IS NULL");
        $month = Db::row("SELECT COALESCE(SUM(IF(status = 'paid', amount_krw + vat_krw, 0)), 0) AS paid, SUM(status = 'paid') AS paid_n,
                                 COALESCE(SUM(IF(status = 'refunded', amount_krw + vat_krw, 0)), 0) AS refunded, SUM(status = 'refunded') AS refunded_n
                          FROM core_invoices WHERE COALESCE(paid_at, issued_at) >= DATE_FORMAT(NOW(), '%Y-%m-01')") ?? [];
        $pending = (int) Db::val("SELECT COUNT(*) FROM core_invoices WHERE status = 'pending'");
        $failed30 = (int) Db::val("SELECT COUNT(*) FROM core_invoices WHERE status = 'failed' AND issued_at > NOW(3) - INTERVAL 30 DAY");
        // 자동 갱신 결제 작업이 아직 없다 — 7일 안에 끝나는 PG 구독(해지 예약 아님)은 운영자가 미리 봐야 한다
        $ending = (int) Db::val("SELECT COUNT(*) FROM core_subscriptions s WHERE {$live} AND s.source = 'pg' AND s.canceled_at IS NULL
                                 AND s.current_period_end < NOW(3) + INTERVAL 7 DAY");
        $lastEvent = Db::row('SELECT event_type, status, verified, created_at FROM core_billing_events ORDER BY id DESC LIMIT 1');
        Response::json([
            'keys' => ['mode' => $mode, 'webhook_secret' => (string) Config::get('toss.webhook_secret', '') !== ''],
            'visible' => (bool) Config::get('features.billing_visible', false),
            'auto_renew' => false,
            'active' => array_map(static fn ($x) => ['plan' => $x['code'], 'plan_name' => $x['name'], 'source' => $x['source'], 'count' => (int) $x['n']], $byPlan),
            'mrr' => $mrr,
            'month' => ['paid' => (int) ($month['paid'] ?? 0), 'paid_count' => (int) ($month['paid_n'] ?? 0),
                        'refunded' => (int) ($month['refunded'] ?? 0), 'refunded_count' => (int) ($month['refunded_n'] ?? 0)],
            'pending' => $pending, 'failed_30d' => $failed30, 'ending_7d' => $ending,
            'last_event' => $lastEvent,
        ]);
    }, ['auth' => true]);

    $r->get('/admin/billing/subscriptions', function (array $p, Actor $a) use ($need, $live, $subOut): void {
        $need($a);
        [$page, $limit, $off] = Response::paging(30, 100);
        $w = ['1 = 1'];
        $args = [];
        $st = (string) ($_GET['status'] ?? '');
        if ($st === 'live') {
            $w[] = $live . ' AND s.canceled_at IS NULL';
        } elseif ($st === 'canceling') {
            $w[] = $live . ' AND s.canceled_at IS NOT NULL';
        } elseif ($st === 'ended') {
            $w[] = "NOT ({$live})";
        }
        if (in_array($_GET['source'] ?? '', ['pg', 'manual', 'legacy'], true)) {
            $w[] = 's.source = ?';
            $args[] = $_GET['source'];
        }
        if (($_GET['plan'] ?? '') !== '') {
            $w[] = 'p.code = ?';
            $args[] = (string) $_GET['plan'];
        }
        $q = trim((string) ($_GET['q'] ?? ''));
        if ($q !== '') {
            $w[] = '(u.email LIKE ? OR u.name LIKE ?)';
            $args[] = '%' . $q . '%';
            $args[] = '%' . $q . '%';
        }
        $from = "FROM core_subscriptions s JOIN core_plans p ON p.id = s.plan_id
                 LEFT JOIN core_users u ON s.owner_type = 'user' AND u.id = s.owner_id WHERE " . implode(' AND ', $w);
        $total = (int) Db::val("SELECT COUNT(*) {$from}", $args);
        $rows = Db::rows("SELECT s.*, p.code AS plan_code, p.name AS plan_name, u.public_id AS u_pid, u.name AS u_name, u.email AS u_email
                          {$from} ORDER BY s.id DESC LIMIT {$limit} OFFSET {$off}", $args);
        Response::list(array_map($subOut, $rows), $total, $page, $limit);
    }, ['auth' => true]);

    $r->get('/admin/billing/invoices', function (array $p, Actor $a) use ($need): void {
        $need($a);
        [$page, $limit, $off] = Response::paging(30, 100);
        $w = ['1 = 1'];
        $args = [];
        if (in_array($_GET['status'] ?? '', ['pending', 'paid', 'failed', 'refunded'], true)) {
            $w[] = 'i.status = ?';
            $args[] = $_GET['status'];
        }
        if (in_array($_GET['kind'] ?? '', ['subscription', 'credits'], true)) {
            $w[] = 'i.kind = ?';
            $args[] = $_GET['kind'];
        }
        $q = trim((string) ($_GET['q'] ?? ''));
        if ($q !== '') {
            $w[] = '(u.email LIKE ? OR u.name LIKE ? OR i.order_id = ?)';
            array_push($args, '%' . $q . '%', '%' . $q . '%', $q);
        }
        $from = 'FROM core_invoices i LEFT JOIN core_users u ON u.id = i.user_id WHERE ' . implode(' AND ', $w);
        $total = (int) Db::val("SELECT COUNT(*) {$from}", $args);
        $rows = Db::rows("SELECT i.*, u.public_id AS u_pid, u.name AS u_name, u.email AS u_email {$from}
                          ORDER BY COALESCE(i.paid_at, i.issued_at) DESC, i.id DESC LIMIT {$limit} OFFSET {$off}", $args);
        Response::list(array_map(static fn (array $i): array => [
            'id' => $i['public_id'], 'kind' => $i['kind'], 'title' => $i['title'], 'order_id' => $i['order_id'],
            'credits' => $i['credits'] !== null ? (int) $i['credits'] : null,
            'amount' => (int) $i['amount_krw'] + (int) $i['vat_krw'], 'vat' => (int) $i['vat_krw'], 'status' => $i['status'],
            'pg' => $i['pg_payment_key'] !== null && $i['pg_payment_key'] !== '', 'receipt_url' => $i['receipt_url'],
            'issued_at' => $i['issued_at'], 'paid_at' => $i['paid_at'], 'refunded_at' => $i['refunded_at'],
            'user' => ['id' => $i['u_pid'], 'name' => $i['u_name'], 'email' => $i['u_email']],
        ], $rows), $total, $page, $limit);
    }, ['auth' => true]);

    $r->get('/admin/billing/events', function (array $p, Actor $a) use ($need): void {
        $need($a);
        [$page, $limit, $off] = Response::paging(30, 100);
        $total = (int) Db::val('SELECT COUNT(*) FROM core_billing_events');
        $rows = Db::rows("SELECT id, event_type, payment_key, order_id, status, verified, LEFT(payload, 400) AS payload, processed_at, note, created_at
                          FROM core_billing_events ORDER BY id DESC LIMIT {$limit} OFFSET {$off}");
        Response::list(array_map(static fn (array $e): array => [
            'id' => (int) $e['id'], 'type' => $e['event_type'], 'order_id' => $e['order_id'], 'status' => $e['status'],
            'verified' => $e['verified'], 'processed' => $e['processed_at'] !== null, 'note' => $e['note'],
            'payload' => $e['payload'], 'created_at' => $e['created_at'],
        ], $rows), $total, $page, $limit);
    }, ['auth' => true]);

    $r->post('/admin/billing/subscriptions/{id}/cancel', function (array $p, Actor $a) use ($need, $subRow): void {
        $need($a);
        $s = $subRow((string) $p['id']);
        $now = (bool) (Response::input()['now'] ?? false);
        if (!$now && !in_array($s['status'], ['trial', 'active', 'past_due'], true)) {
            throw HttpError::invalid('이미 해지된 구독입니다.');
        }
        if ($now) {
            Db::exec("UPDATE core_subscriptions SET status = 'canceled', canceled_at = COALESCE(canceled_at, NOW(3)), renews_at = NULL,
                      current_period_end = LEAST(COALESCE(current_period_end, NOW(3)), NOW(3)) WHERE id = ?", [$s['id']]);
        } else {
            Db::exec("UPDATE core_subscriptions SET status = 'canceled', canceled_at = NOW(3), renews_at = NULL WHERE id = ?", [$s['id']]);
        }
        Audit::log($a, $now ? 'admin.billing.end' : 'admin.billing.cancel', 'core_subscriptions:' . $s['id'],
            ['status' => $s['status'], 'period_end' => $s['current_period_end']], ['now' => $now]);
        Response::json(['ok' => true]);
    }, ['auth' => true]);

    $r->post('/admin/billing/subscriptions/{id}/resume', function (array $p, Actor $a) use ($need, $subRow): void {
        $need($a);
        $s = $subRow((string) $p['id']);
        if ($s['status'] !== 'canceled' || ($s['current_period_end'] !== null && strtotime((string) $s['current_period_end']) <= time())) {
            throw HttpError::invalid('기간이 남은 해지 예약만 되돌릴 수 있습니다.');
        }
        Db::exec("UPDATE core_subscriptions SET status = 'active', canceled_at = NULL, renews_at = current_period_end WHERE id = ?", [$s['id']]);
        Audit::log($a, 'admin.billing.resume', 'core_subscriptions:' . $s['id']);
        Response::json(['ok' => true]);
    }, ['auth' => true]);

    $r->post('/admin/billing/invoices/{id}/refund', function (array $p, Actor $a) use ($need): void {
        $need($a, 'superadmin');
        $reason = trim((string) (Response::input()['reason'] ?? ''));
        if (mb_strlen($reason) < 2) {
            throw new HttpError('INVALID', '환불 사유를 적어 주세요.', 422, 'reason');
        }
        $inv = Db::row('SELECT * FROM core_invoices WHERE public_id = ?', [(string) $p['id']]);
        if ($inv === null) {
            throw HttpError::notFound('결제');
        }
        if ($inv['status'] !== 'paid' || (string) $inv['pg_payment_key'] === '') {
            throw HttpError::invalid('토스로 결제 완료된 건만 환불할 수 있습니다.');
        }
        $secret = (string) Config::get('toss.secret_key', '');
        if ($secret === '') {
            throw new HttpError('BILLING_NOT_CONFIGURED', '결제 키가 설정되지 않았습니다.', 503);
        }
        $ch = curl_init('https://api.tosspayments.com/v1/payments/' . rawurlencode((string) $inv['pg_payment_key']) . '/cancel');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20, CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode(['cancelReason' => mb_substr($reason, 0, 200)], JSON_UNESCAPED_UNICODE),
            CURLOPT_HTTPHEADER => ['Authorization: Basic ' . base64_encode($secret . ':'), 'Content-Type: application/json',
                                   'Idempotency-Key: pp-refund-' . $inv['public_id']],   // 두 번 눌러도 한 번만 취소
        ]);
        $res = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $json = is_string($res) ? (json_decode($res, true) ?: []) : [];
        if ($code === 0 || $code >= 400) {
            error_log('[pp-billing] refund ' . $inv['public_id'] . ' ' . $code . ' ' . mb_substr((string) $res, 0, 300));
            throw new HttpError('REFUND_FAILED', (string) ($json['message'] ?? "결제 서버 오류 ($code)"), 502);
        }
        // 웹훅(billing.php)도 같은 취소를 알려 오지만, 여기서 먼저 refunded 로 바꾸면 그쪽은 'unchanged' 로 넘어간다 — 회수는 한 번만
        Db::tx(static function () use ($inv): void {
            Db::exec("UPDATE core_invoices SET status = 'refunded', refunded_at = NOW(3) WHERE id = ? AND status = 'paid'", [$inv['id']]);
            $uid = (int) $inv['user_id'];
            if ($inv['kind'] === 'credits' && $uid > 0 && (int) $inv['credits'] > 0) {
                $bal = (int) Db::val('SELECT COALESCE(SUM(delta),0) FROM core_credit_ledger WHERE user_id = ? AND (expires_at IS NULL OR expires_at > NOW(3))', [$uid]);
                Db::exec("INSERT INTO core_credit_ledger (user_id, delta, kind, ref_type, ref_id, memo, balance_after) VALUES (?, ?, 'refund', 'order', ?, '관리자 환불', ?)",
                    [$uid, -(int) $inv['credits'], $inv['order_id'], $bal - (int) $inv['credits']]);
            }
            if ($inv['kind'] === 'subscription' && $inv['subscription_id']) {
                Db::exec("UPDATE core_subscriptions SET status = 'canceled', canceled_at = COALESCE(canceled_at, NOW(3)), renews_at = NULL,
                          current_period_end = LEAST(COALESCE(current_period_end, NOW(3)), NOW(3)) WHERE id = ?", [$inv['subscription_id']]);
            }
        });
        Audit::log($a, 'admin.billing.refund', 'core_invoices:' . $inv['id'], ['status' => 'paid'],
            ['status' => 'refunded', 'amount' => (int) $inv['amount_krw'] + (int) $inv['vat_krw'], 'reason' => $reason]);
        Response::json(['ok' => true]);
    }, ['auth' => true]);
};

<?php
declare(strict_types=1);

/**
 * 결제 (Phase 6, docs/08): 토스페이먼츠 빌링키 자동결제 (API 개별 연동)
 *   POST /api/billing/checkout {plan, billing}      → 결제창(빌링 인증)에 필요한 값 {client_key, customer_key, order_name, amount}
 *   GET  /api/billing/success?authKey&customerKey&plan&billing → 빌링키 발급 → 첫 결제 → subscriptions/invoices → 앱 /account?paid=1 로 이동
 *   POST /api/billing/cancel                         → 해지(기간 종료까지 유지)
 *   GET  /api/billing/invoices                       → 청구서
 *   POST /api/billing/webhook                        → 토스 웹훅(결제 상태) — 현재는 수신 로그만
 * 키는 config toss.* (테스트 test_ck_/test_sk_). 금액은 plans 테이블(정가). 부가세 포함가로 청구, invoices 에 vat 분리 기록.
 * @var Homebox\Http\Router $router
 */

use Homebox\Auth\Session;
use Homebox\Db;
use Homebox\Http\Response;

$requireUser = static function (): array {
    $u = Session::user();
    if ($u === null) {
        Response::error(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
    }
    return $u;
};
$appPath = static function (string $next): string {
    $base = rtrim((string) Config::get('app.base', '/'), '/');
    return ($base === '' ? '' : $base) . $next;
};
$toss = static function (string $method, string $path, ?array $body = null): array {
    $secret = (string) Config::get('toss.secret_key', '');
    if ($secret === '') {
        Response::error(503, 'BILLING_NOT_CONFIGURED', '결제 키가 설정되지 않았습니다.');
    }
    $ch = curl_init('https://api.tosspayments.com' . $path);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20, CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => ['Authorization: Basic ' . base64_encode($secret . ':'), 'Content-Type: application/json']]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE));
    }
    $res = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $json = is_string($res) ? (json_decode($res, true) ?: []) : [];
    if ($status >= 400) {
        error_log('[homebox-billing] ' . $path . ' ' . $status . ' ' . ($res ?: ''));
        throw new RuntimeException((string) ($json['message'] ?? "토스 API 오류 ($status)"));
    }
    return $json;
};
$planRow = static function (string $id): array {
    $p = Db::row('SELECT id, name_ko, price_month, price_year, limits FROM plans WHERE id = ?', [$id]);
    if ($p === null || !in_array($id, ['pro', 'team'], true)) {
        Response::error(422, 'INVALID_PLAN', '결제 가능한 플랜은 pro·team 입니다.');
    }
    return $p;
};

$router->post('/api/billing/checkout', static function () use ($requireUser, $planRow): void {
    $u = $requireUser();
    $body = json_decode((string) file_get_contents('php://input'), true) ?: [];
    $plan = $planRow((string) ($body['plan'] ?? ''));
    $billing = (string) ($body['billing'] ?? 'month');
    if (!in_array($billing, ['month', 'year'], true)) {
        Response::error(422, 'INVALID_BILLING', 'billing 은 month|year 입니다.');
    }
    $seats = $plan['id'] === 'team' ? max(5, (int) ($body['seats'] ?? 5)) : 1;
    $amount = ($billing === 'year' ? (int) $plan['price_year'] : (int) $plan['price_month']) * $seats;
    Response::json([
        'client_key' => (string) Config::get('toss.client_key', ''), 'customer_key' => 'hb_user_' . $u['id'], 'customer_email' => $u['email'], 'customer_name' => $u['name'] ?? '홈박스 회원',
        'plan' => $plan['id'], 'plan_ko' => $plan['name_ko'], 'billing' => $billing, 'seats' => $seats, 'amount' => $amount,
        'order_name' => "홈박스 {$plan['name_ko']} " . ($billing === 'year' ? '연간' : '월간') . ($seats > 1 ? " × {$seats}석" : ''),
    ], 200, ['Cache-Control' => 'no-store']);
});

$router->get('/api/billing/success', static function () use ($requireUser, $planRow, $toss, $appPath): void {
    $u = $requireUser();
    $authKey = (string) ($_GET['authKey'] ?? '');
    $customerKey = (string) ($_GET['customerKey'] ?? '');
    $planId = (string) ($_GET['plan'] ?? '');
    $billing = (string) ($_GET['billing'] ?? 'month');
    $seats = max(1, (int) ($_GET['seats'] ?? 1));
    if ($authKey === '' || $customerKey !== 'hb_user_' . $u['id'] || !in_array($billing, ['month', 'year'], true)) {
        header('Location: ' . $appPath('/account/billing?error=param'), true, 302);
        exit;
    }
    $plan = $planRow($planId);
    $seats = $plan['id'] === 'team' ? max(5, $seats) : 1;
    $amount = ($billing === 'year' ? (int) $plan['price_year'] : (int) $plan['price_month']) * $seats;
    try {
        $issued = $toss('POST', '/v1/billing/authorizations/issue', ['authKey' => $authKey, 'customerKey' => $customerKey]);
        $billingKey = (string) ($issued['billingKey'] ?? '');
        if ($billingKey === '') {
            throw new RuntimeException('빌링키 발급 실패');
        }
        $orderId = 'hb_' . $u['id'] . '_' . date('YmdHis') . '_' . bin2hex(random_bytes(3));
        $orderName = "홈박스 {$plan['name_ko']} " . ($billing === 'year' ? '연간' : '월간');
        $paid = $toss('POST', '/v1/billing/' . rawurlencode($billingKey), ['customerKey' => $customerKey, 'amount' => $amount, 'orderId' => $orderId, 'orderName' => $orderName, 'customerEmail' => $u['email'], 'customerName' => $u['name'] ?? '홈박스 회원']);
    } catch (Throwable $e) {
        header('Location: ' . $appPath('/account/billing?error=' . rawurlencode(mb_substr($e->getMessage(), 0, 80))), true, 302);
        exit;
    }
    // 기존 활성 구독은 대체
    Db::exec("UPDATE subscriptions SET status = 'canceled', canceled_at = NOW(3) WHERE owner_type = 'user' AND owner_id = ? AND status IN ('trial','active','past_due')", [$u['id']]);
    $periodEnd = date('Y-m-d H:i:s', strtotime($billing === 'year' ? '+1 year' : '+1 month'));
    Db::exec('INSERT INTO subscriptions (owner_type, owner_id, plan_id, billing, status, seats, pg_customer_key, pg_billing_key, current_period_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ['user', $u['id'], $plan['id'], $billing, 'active', $seats, $customerKey, $billingKey, $periodEnd]);
    $subId = (int) Db::pdo()->lastInsertId();
    $vat = (int) round($amount - $amount / 1.1);
    Db::exec('INSERT INTO invoices (subscription_id, amount_krw, vat_krw, status, pg_payment_key, paid_at) VALUES (?, ?, ?, ?, ?, NOW(3))', [$subId, $amount - $vat, $vat, 'paid', $paid['paymentKey'] ?? null]);
    header('Location: ' . $appPath('/account?paid=1'), true, 302);
    exit;
});

$router->post('/api/billing/cancel', static function () use ($requireUser): void {
    $u = $requireUser();
    $n = Db::exec("UPDATE subscriptions SET status = 'canceled', canceled_at = NOW(3) WHERE owner_type = 'user' AND owner_id = ? AND status IN ('trial','active','past_due')", [$u['id']]);
    if ($n === 0) {
        Response::error(404, 'NOT_FOUND', '활성 구독이 없습니다.');
    }
    Response::json(['ok' => true, 'note' => '결제 기간이 끝날 때까지 이용할 수 있고, 이후 Free 로 전환됩니다.']);
});

$router->get('/api/billing/invoices', static function () use ($requireUser): void {
    $u = $requireUser();
    $rows = Db::rows("SELECT i.id, i.amount_krw, i.vat_krw, i.status, i.tax_invoice_no, i.paid_at, s.plan_id, s.billing FROM invoices i JOIN subscriptions s ON s.id = i.subscription_id WHERE s.owner_type = 'user' AND s.owner_id = ? ORDER BY i.id DESC LIMIT 50", [$u['id']]);
    foreach ($rows as &$r) {
        $r['id'] = (int) $r['id']; $r['amount_krw'] = (int) $r['amount_krw']; $r['vat_krw'] = (int) $r['vat_krw'];
    }
    unset($r);
    Response::json(['items' => $rows], 200, ['Cache-Control' => 'no-store']);
});

$router->post('/api/billing/webhook', static function (): void {
    $raw = (string) file_get_contents('php://input');
    error_log('[homebox-billing] webhook ' . mb_substr($raw, 0, 500)); // 서명 검증·상태 반영은 라이브 전환 시 (toss.webhook_secret)
    Response::json(['ok' => true]);
});

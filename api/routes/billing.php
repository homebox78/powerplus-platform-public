<?php
/**
 * 결제 라우트 — /api/v1/billing/…  (구독·크레딧·청구서·웹훅)
 * 출처: homebox-handoff api/routes/billing.php (토스페이먼츠 빌링키 자동결제 흐름) 를 REST v1·core_ 표·Actor 로 옮기고
 *   해지 철회·플랜 변경·크레딧 묶음 구매·웹훅 서명 검증을 더했다.
 *
 * 노출: features.billing_visible 이 켜져 있거나 superadmin 일 때만(기획 §12.3). 아니면 모든 경로가 404(웹훅 제외).
 * 키: config toss.client_key·secret_key·webhook_secret. 비어 있으면 결제를 시작하는 경로만 503 BILLING_NOT_CONFIGURED 로 멈추고
 *   화면에 필요한 조회(현재 플랜·청구서·크레딧)는 그대로 응답한다 — 키 없이도 화면은 다 보인다.
 * 카드 정보는 이 서버를 거치지 않는다(토스 결제창). 빌링키는 KeyVault 로 암호화해 core_subscriptions.billing_key_enc 에 둔다.
 *
 *   GET  /billing                      현재 플랜·구독·플랜 표·크레딧 잔액/내역·묶음·키 설정 여부
 *   POST /billing/checkout {plan,billing}          구독 결제창(빌링 인증)에 넘길 값
 *   GET  /billing/success?authKey&customerKey&plan&billing   빌링키 발급 → 첫 결제 → 구독·청구서 → /account/plan 으로
 *   POST /billing/change {plan,billing}            저장된 결제 수단으로 즉시 플랜 변경(새 기간 시작)
 *   POST /billing/cancel · POST /billing/resume    해지 예약 · 해지 철회(기간이 남아 있을 때)
 *   GET  /billing/invoices                         청구서(영수증 링크 포함)
 *   POST /billing/credits/checkout {pack}          크레딧 묶음 단건 결제창 값(주문은 pending 청구서로 먼저 만든다)
 *   GET  /billing/credits/success?paymentKey&orderId&amount   결제 승인 → 크레딧 적립(12개월 유효)
 *   POST /billing/webhook                          토스 웹훅(서명 또는 결제 재조회로 검증, CSRF 예외는 index.php)
 */
declare(strict_types=1);

use Pp\Core\Actor;
use Pp\Core\Audit;
use Pp\Core\Auth;
use Pp\Core\Config;
use Pp\Core\Db;
use Pp\Core\HttpError;
use Pp\Core\Ids;
use Pp\Core\KeyVault;
use Pp\Core\Notify;
use Pp\Core\Response;
use Pp\Core\Router;

/** 크레딧 묶음(기획 §15.2): 1크레딧 = 장표 변환 1장. 금액은 부가세 포함 청구액. */
const BILLING_PACKS = [
    ['id' => 'c10', 'credits' => 10, 'amount' => 5000],
    ['id' => 'c100', 'credits' => 100, 'amount' => 40000],
    ['id' => 'c500', 'credits' => 500, 'amount' => 150000],
];
const BILLING_PAID_PLANS = ['pro', 'team'];

return static function (Router $r): void {
    $visible = static fn (Actor $a): bool => (bool) Config::get('features.billing_visible', false) || $a->hasRole('superadmin');
    $gate = static function (Actor $a) use ($visible): array {
        $u = Auth::requireUser($a);
        if (!$visible($a)) {
            throw HttpError::notFound('경로');
        }
        return $u;
    };
    $configured = static fn (): bool => (string) Config::get('toss.client_key', '') !== '' && (string) Config::get('toss.secret_key', '') !== '';
    $requireKeys = static function () use ($configured): void {
        if (!$configured()) {
            throw new HttpError('BILLING_NOT_CONFIGURED', '결제 키가 설정되지 않았습니다.', 503, '서버 설정(toss.client_key·secret_key)을 넣으면 결제창이 열립니다.');
        }
    };
    $appUrl = static fn (string $path): string => rtrim((string) Config::get('app.url', ''), '/') . $path;
    $redirect = static function (string $url): never {
        header('Location: ' . $url, true, 302);
        exit;
    };

    /** 토스 API 호출. 4xx·5xx 는 RuntimeException(메시지 = 토스 설명). */
    $toss = static function (string $method, string $path, ?array $body = null): array {
        $secret = (string) Config::get('toss.secret_key', '');
        if ($secret === '') {
            throw new RuntimeException('결제 키가 설정되지 않았습니다.');
        }
        $ch = curl_init('https://api.tosspayments.com' . $path);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20, CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => ['Authorization: Basic ' . base64_encode($secret . ':'), 'Content-Type: application/json'],
        ]);
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE));
        }
        $res = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $json = is_string($res) ? (json_decode($res, true) ?: []) : [];
        if ($status === 0 || $status >= 400) {
            error_log('[pp-billing] ' . $path . ' ' . $status . ' ' . mb_substr((string) $res, 0, 400));
            throw new RuntimeException((string) ($json['message'] ?? "결제 서버 오류 ($status)"));
        }
        return $json;
    };

    $plans = static function (): array {
        $rows = Db::rows('SELECT id, code, name, price_month_krw, price_year_krw, credits_month, limits FROM core_plans WHERE is_public = 1 ORDER BY sort');
        return array_map(static fn ($p) => [
            'code' => $p['code'], 'name' => $p['name'],
            'price_month' => (int) $p['price_month_krw'], 'price_year_month' => (int) $p['price_year_krw'],
            'credits_month' => (int) $p['credits_month'], 'limits' => json_decode((string) $p['limits'], true) ?: [],
        ], $rows);
    };
    $planRow = static function (string $code): array {
        if (!in_array($code, BILLING_PAID_PLANS, true)) {
            throw HttpError::invalid('결제할 수 있는 플랜은 pro·team 입니다.');
        }
        $p = Db::row('SELECT id, code, name, price_month_krw, price_year_krw, limits FROM core_plans WHERE code = ?', [$code]);
        if ($p === null) {
            throw HttpError::notFound('플랜');
        }
        return $p;
    };
    $billingOf = static function (mixed $v): string {
        $b = (string) $v;
        if (!in_array($b, ['month', 'year'], true)) {
            throw HttpError::invalid('결제 주기는 month·year 입니다.');
        }
        return $b;
    };
    /** 청구 금액: 월간 = 월 가격, 연간 = 연간 월 환산 × 12. Team 은 5석 묶음 가격. */
    $amountOf = static fn (array $p, string $billing): int => $billing === 'year' ? (int) $p['price_year_krw'] * 12 : (int) $p['price_month_krw'];
    $seatsOf = static fn (array $p): int => $p['code'] === 'team' ? max(5, (int) ((json_decode((string) $p['limits'], true) ?: [])['seats'] ?? 5)) : 1;
    $orderName = static fn (array $p, string $billing): string => "powerPlus {$p['name']} " . ($billing === 'year' ? '연간' : '월간');
    $customerKey = static fn (array $u): string => 'pp_user_' . $u['public_id'];

    /** 지금 유효한 개인 구독(해지 예약 포함, 기간 안). */
    $currentSub = static fn (int $uid): ?array => Db::row(
        "SELECT s.*, p.code AS plan_code, p.name AS plan_name FROM core_subscriptions s JOIN core_plans p ON p.id = s.plan_id
         WHERE s.owner_type = 'user' AND s.owner_id = ? AND s.status IN ('trial','active','past_due','canceled')
           AND (s.current_period_end IS NULL OR s.current_period_end > NOW(3))
         ORDER BY (s.status = 'canceled'), s.id DESC LIMIT 1",
        [$uid]
    );
    $subOut = static fn (?array $s): ?array => $s ? [
        'id' => $s['public_id'], 'plan' => $s['plan_code'], 'plan_name' => $s['plan_name'], 'billing' => $s['billing'], 'status' => $s['status'],
        'source' => $s['source'] ?? 'pg', 'seats' => (int) $s['seats'], 'card_label' => $s['card_label'] ?? null,
        'current_period_start' => $s['current_period_start'], 'current_period_end' => $s['current_period_end'], 'canceled_at' => $s['canceled_at'],
        'has_billing_key' => !empty($s['billing_key_enc']),
    ] : null;

    $creditBalance = static fn (int $uid): int => (int) Db::val(
        'SELECT COALESCE(SUM(delta), 0) FROM core_credit_ledger WHERE user_id = ? AND (expires_at IS NULL OR expires_at > NOW(3))',
        [$uid]
    );
    $cardLabel = static function (array $res): ?string {
        $c = $res['card'] ?? null;
        if (!is_array($c)) {
            return null;
        }
        $num = (string) ($c['number'] ?? $c['cardNumber'] ?? '');
        $tail = $num !== '' ? substr(preg_replace('/[^0-9*]/', '', $num) ?? '', -4) : '';
        $co = (string) ($res['cardCompany'] ?? $c['issuerCode'] ?? '카드');
        return trim($co . ($tail !== '' ? " ****{$tail}" : ''));
    };

    /** 결제 한 건 → 청구서(paid). 금액은 부가세 포함가, vat 분리 기록. */
    $paidInvoice = static function (?int $subId, int $uid, string $kind, string $orderId, string $title, int $amount, array $paid, ?int $credits = null): void {
        $vat = (int) round($amount - $amount / 1.1);
        Db::exec(
            "INSERT INTO core_invoices (public_id, subscription_id, user_id, kind, order_id, title, credits, amount_krw, vat_krw, status, pg_payment_key, receipt_url, paid_at)
             VALUES (?,?,?,?,?,?,?,?,?,'paid',?,?,NOW(3))",
            [Ids::publicId(), $subId, $uid, $kind, $orderId, $title, $credits, $amount - $vat, $vat, $paid['paymentKey'] ?? null, $paid['receipt']['url'] ?? null]
        );
    };
    /** 새 구독(기존 유효 구독은 대체). */
    $startSub = static function (array $u, array $plan, string $billing, string $custKey, string $billingKey, ?string $card) use ($seatsOf): int {
        Db::exec("UPDATE core_subscriptions SET status = 'canceled', canceled_at = COALESCE(canceled_at, NOW(3)), current_period_end = LEAST(COALESCE(current_period_end, NOW(3)), NOW(3))
                  WHERE owner_type = 'user' AND owner_id = ? AND status IN ('trial','active','past_due','canceled')", [$u['id']]);
        $end = date('Y-m-d H:i:s', strtotime($billing === 'year' ? '+1 year' : '+1 month'));
        Db::exec(
            "INSERT INTO core_subscriptions (public_id, owner_type, owner_id, plan_id, billing, status, source, seats, pg_customer_key, billing_key_enc, card_label, current_period_start, current_period_end, renews_at)
             VALUES (?, 'user', ?, ?, ?, 'active', 'pg', ?, ?, ?, ?, NOW(3), ?, ?)",
            [Ids::publicId(), $u['id'], $plan['id'], $billing, $seatsOf($plan), $custKey, KeyVault::seal($billingKey, 'billing-key'), $card, $end, $end]
        );
        return Db::lastId();
    };

    // ---- 현재 상태(화면 한 번에)
    $r->get('/billing', function (array $p, Actor $a) use ($gate, $configured, $plans, $currentSub, $subOut, $creditBalance): void {
        $u = $gate($a);
        $uid = (int) $u['id'];
        $ledger = array_map(static fn ($x) => [
            'delta' => (int) $x['delta'], 'kind' => $x['kind'], 'balance_after' => (int) $x['balance_after'],
            'memo' => $x['memo'] ?? null, 'expires_at' => $x['expires_at'], 'created_at' => $x['created_at'],
        ], Db::rows('SELECT delta, kind, balance_after, memo, expires_at, created_at FROM core_credit_ledger WHERE user_id = ? ORDER BY id DESC LIMIT 20', [$uid]));
        $client = (string) Config::get('toss.client_key', '');
        Response::json([
            'plan' => $a->plan,
            'staff' => $a->isStaff(),
            'configured' => $configured(),
            'test_mode' => $client === '' || str_starts_with($client, 'test_'),
            'subscription' => $subOut($currentSub($uid)),
            'plans' => $plans(),
            'credits' => ['balance' => $creditBalance($uid), 'ledger' => $ledger, 'packs' => BILLING_PACKS],
        ]);
    }, ['auth' => true]);

    // ---- 구독 결제창 값
    $r->post('/billing/checkout', function (array $p, Actor $a) use ($gate, $requireKeys, $planRow, $billingOf, $amountOf, $seatsOf, $orderName, $customerKey): void {
        $u = $gate($a);
        if ($a->isStaff()) {
            throw new HttpError('STAFF_FREE', '임직원은 모든 기능을 무료로 씁니다.', 409);
        }
        $in = Response::input();
        $plan = $planRow((string) ($in['plan'] ?? ''));
        $billing = $billingOf($in['billing'] ?? 'year');
        $requireKeys();
        Response::json([
            'client_key' => (string) Config::get('toss.client_key'), 'customer_key' => $customerKey($u),
            'customer_email' => $u['email'], 'customer_name' => $u['name'] ?: 'powerPlus 회원',
            'plan' => $plan['code'], 'plan_name' => $plan['name'], 'billing' => $billing, 'seats' => $seatsOf($plan),
            'amount' => $amountOf($plan, $billing), 'order_name' => $orderName($plan, $billing),
        ]);
    }, ['auth' => true]);

    // ---- 빌링 인증 성공 → 빌링키 발급 → 첫 결제 (토스가 브라우저를 이 주소로 보낸다)
    $r->get('/billing/success', function (array $p, Actor $a) use ($visible, $appUrl, $redirect, $toss, $planRow, $amountOf, $orderName, $customerKey, $startSub, $paidInvoice, $cardLabel): void {
        $back = static fn (string $err) => $redirect($appUrl('/account/plan?error=' . rawurlencode(mb_substr($err, 0, 80))));
        if ($a->user === null) {
            $redirect($appUrl('/login?next=' . rawurlencode('/account/plan')));
        }
        $u = $a->user;
        if (!$visible($a)) {
            $back('결제가 아직 열리지 않았습니다.');
        }
        $authKey = (string) ($_GET['authKey'] ?? '');
        $custKey = (string) ($_GET['customerKey'] ?? '');
        $billing = (string) ($_GET['billing'] ?? '');
        if ($authKey === '' || $custKey !== $customerKey($u) || !in_array($billing, ['month', 'year'], true)) {
            $back('결제 정보가 올바르지 않습니다.');
        }
        try {
            $plan = $planRow((string) ($_GET['plan'] ?? ''));
        } catch (HttpError $e) {
            $back($e->getMessage());
        }
        $amount = $amountOf($plan, $billing);
        $title = $orderName($plan, $billing);
        $orderId = 'pp_sub_' . Ids::publicId();
        try {
            $issued = $toss('POST', '/v1/billing/authorizations/issue', ['authKey' => $authKey, 'customerKey' => $custKey]);
            $billingKey = (string) ($issued['billingKey'] ?? '');
            if ($billingKey === '') {
                throw new RuntimeException('카드 등록(빌링키 발급)에 실패했습니다.');
            }
            $paid = $toss('POST', '/v1/billing/' . rawurlencode($billingKey), [
                'customerKey' => $custKey, 'amount' => $amount, 'orderId' => $orderId, 'orderName' => $title,
                'customerEmail' => $u['email'], 'customerName' => $u['name'] ?: 'powerPlus 회원',
            ]);
        } catch (Throwable $e) {
            $back($e->getMessage());
        }
        $card = $cardLabel($paid) ?? $cardLabel($issued);
        $subId = Db::tx(static function () use ($u, $plan, $billing, $custKey, $billingKey, $card, $startSub, $paidInvoice, $orderId, $title, $amount, $paid): int {
            $sid = $startSub($u, $plan, $billing, $custKey, $billingKey, $card);
            $paidInvoice($sid, (int) $u['id'], 'subscription', $orderId, $title, $amount, $paid);
            return $sid;
        });
        Audit::log($a, 'billing.subscribe', 'core_subscriptions:' . $subId, null, ['plan' => $plan['code'], 'billing' => $billing, 'amount' => $amount]);
        Notify::send((int) $u['id'], 'billing', "{$plan['name']} 구독을 시작했습니다.", '/account/plan');
        $redirect($appUrl('/account/plan?paid=1'));
    });

    // ---- 플랜 변경(저장된 결제 수단으로 즉시)
    $r->post('/billing/change', function (array $p, Actor $a) use ($gate, $requireKeys, $planRow, $billingOf, $amountOf, $orderName, $currentSub, $toss, $startSub, $paidInvoice): void {
        $u = $gate($a);
        $in = Response::input();
        $plan = $planRow((string) ($in['plan'] ?? ''));
        $billing = $billingOf($in['billing'] ?? 'year');
        $sub = $currentSub((int) $u['id']);
        if ($sub === null || empty($sub['billing_key_enc'])) {
            throw new HttpError('NO_PAYMENT_METHOD', '저장된 결제 수단이 없습니다.', 409, '처음 결제는 플랜 카드의 시작 버튼으로 합니다.');
        }
        if ($sub['plan_code'] === $plan['code'] && $sub['billing'] === $billing && $sub['status'] !== 'canceled') {
            throw new HttpError('SAME_PLAN', '이미 이용 중인 플랜입니다.', 409);
        }
        $requireKeys();
        $billingKey = KeyVault::open((string) $sub['billing_key_enc'], 'billing-key');
        if ($billingKey === null) {
            throw new HttpError('PAYMENT_METHOD_BROKEN', '저장된 결제 수단을 열 수 없습니다.', 409, '카드를 다시 등록해 주세요.');
        }
        $amount = $amountOf($plan, $billing);
        $title = $orderName($plan, $billing);
        $orderId = 'pp_sub_' . Ids::publicId();
        try {
            $paid = $toss('POST', '/v1/billing/' . rawurlencode($billingKey), [
                'customerKey' => $sub['pg_customer_key'], 'amount' => $amount, 'orderId' => $orderId, 'orderName' => $title,
                'customerEmail' => $u['email'], 'customerName' => $u['name'] ?: 'powerPlus 회원',
            ]);
        } catch (Throwable $e) {
            throw new HttpError('PAYMENT_FAILED', '결제하지 못했습니다.', 402, mb_substr($e->getMessage(), 0, 120));
        }
        $subId = Db::tx(static function () use ($u, $plan, $billing, $sub, $billingKey, $startSub, $paidInvoice, $orderId, $title, $amount, $paid): int {
            $sid = $startSub($u, $plan, $billing, (string) $sub['pg_customer_key'], $billingKey, $sub['card_label'] ?? null);
            $paidInvoice($sid, (int) $u['id'], 'subscription', $orderId, $title, $amount, $paid);
            return $sid;
        });
        Audit::log($a, 'billing.change', 'core_subscriptions:' . $subId, ['plan' => $sub['plan_code'], 'billing' => $sub['billing']], ['plan' => $plan['code'], 'billing' => $billing, 'amount' => $amount]);
        Response::json(['ok' => true, 'plan' => $plan['code'], 'billing' => $billing]);
    }, ['auth' => true]);

    // ---- 해지 예약 · 철회
    $r->post('/billing/cancel', function (array $p, Actor $a) use ($gate): void {
        $u = $gate($a);
        $n = Db::exec("UPDATE core_subscriptions SET status = 'canceled', canceled_at = NOW(3), renews_at = NULL
                       WHERE owner_type = 'user' AND owner_id = ? AND status IN ('trial','active','past_due')", [$u['id']]);
        if ($n === 0) {
            throw HttpError::notFound('이용 중인 구독');
        }
        Audit::log($a, 'billing.cancel', 'user:' . $u['public_id']);
        Response::json(['ok' => true, 'note' => '결제한 기간이 끝날 때까지 쓰고, 그 뒤 Free 로 바뀝니다.']);
    }, ['auth' => true]);
    $r->post('/billing/resume', function (array $p, Actor $a) use ($gate): void {
        $u = $gate($a);
        $n = Db::exec("UPDATE core_subscriptions SET status = 'active', canceled_at = NULL, renews_at = current_period_end
                       WHERE owner_type = 'user' AND owner_id = ? AND status = 'canceled' AND source = 'pg'
                         AND current_period_end > NOW(3) ORDER BY id DESC LIMIT 1", [$u['id']]);
        if ($n === 0) {
            throw HttpError::notFound('해지 예약한 구독');
        }
        Audit::log($a, 'billing.resume', 'user:' . $u['public_id']);
        Response::json(['ok' => true]);
    }, ['auth' => true]);

    // ---- 청구서
    $r->get('/billing/invoices', function (array $p, Actor $a) use ($gate): void {
        $u = $gate($a);
        $rows = Db::rows(
            "SELECT i.public_id, i.kind, i.title, i.credits, i.amount_krw, i.vat_krw, i.status, i.receipt_url, i.tax_invoice_no, i.paid_at, i.issued_at, i.refunded_at
             FROM core_invoices i LEFT JOIN core_subscriptions s ON s.id = i.subscription_id
             WHERE (i.user_id = ? OR (s.owner_type = 'user' AND s.owner_id = ?)) AND i.status <> 'pending'
             ORDER BY i.id DESC LIMIT 100",
            [$u['id'], $u['id']]
        );
        Response::json(array_map(static fn ($x) => [
            'id' => $x['public_id'], 'kind' => $x['kind'], 'title' => $x['title'], 'credits' => $x['credits'] !== null ? (int) $x['credits'] : null,
            'amount' => (int) $x['amount_krw'] + (int) $x['vat_krw'], 'vat' => (int) $x['vat_krw'], 'status' => $x['status'],
            'receipt_url' => $x['receipt_url'], 'tax_invoice_no' => $x['tax_invoice_no'],
            'paid_at' => $x['paid_at'] ?? $x['issued_at'], 'refunded_at' => $x['refunded_at'],
        ], $rows));
    }, ['auth' => true]);

    // ---- 크레딧 묶음
    $r->post('/billing/credits/checkout', function (array $p, Actor $a) use ($gate, $requireKeys, $customerKey): void {
        $u = $gate($a);
        $id = (string) (Response::input()['pack'] ?? '');
        $pack = null;
        foreach (BILLING_PACKS as $x) {
            if ($x['id'] === $id) {
                $pack = $x;
            }
        }
        if ($pack === null) {
            throw HttpError::invalid('크레딧 묶음은 c10·c100·c500 입니다.');
        }
        $requireKeys();
        $orderId = 'pp_cr_' . Ids::publicId();
        $title = "powerPlus 크레딧 {$pack['credits']}개";
        // 주문을 먼저 만들어 두고(pending) 승인 때 금액·주문번호를 대조한다 — 브라우저가 금액을 바꿔 보내도 통과하지 못한다.
        Db::exec("INSERT INTO core_invoices (public_id, user_id, kind, order_id, title, credits, amount_krw, vat_krw, status) VALUES (?,?, 'credits', ?,?,?,?,0,'pending')",
            [Ids::publicId(), $u['id'], $orderId, $title, $pack['credits'], $pack['amount']]);
        Response::json([
            'client_key' => (string) Config::get('toss.client_key'), 'customer_key' => $customerKey($u),
            'customer_email' => $u['email'], 'customer_name' => $u['name'] ?: 'powerPlus 회원',
            'order_id' => $orderId, 'order_name' => $title, 'amount' => $pack['amount'], 'credits' => $pack['credits'],
        ]);
    }, ['auth' => true]);
    $r->get('/billing/credits/success', function (array $p, Actor $a) use ($visible, $appUrl, $redirect, $toss, $creditBalance): void {
        $back = static fn (string $err) => $redirect($appUrl('/account/plan?tab=credits&error=' . rawurlencode(mb_substr($err, 0, 80))));
        if ($a->user === null) {
            $redirect($appUrl('/login?next=' . rawurlencode('/account/plan?tab=credits')));
        }
        $u = $a->user;
        if (!$visible($a)) {
            $back('결제가 아직 열리지 않았습니다.');
        }
        $paymentKey = (string) ($_GET['paymentKey'] ?? '');
        $orderId = (string) ($_GET['orderId'] ?? '');
        $amount = (int) ($_GET['amount'] ?? 0);
        $inv = Db::row("SELECT id, credits, amount_krw, status FROM core_invoices WHERE order_id = ? AND user_id = ? AND kind = 'credits'", [$orderId, $u['id']]);
        if ($inv === null || $paymentKey === '' || (int) $inv['amount_krw'] !== $amount) {
            $back('주문 정보가 올바르지 않습니다.');
        }
        if ($inv['status'] === 'paid') {
            $redirect($appUrl('/account/plan?tab=credits&paid=1'));
        }
        try {
            $paid = $toss('POST', '/v1/payments/confirm', ['paymentKey' => $paymentKey, 'orderId' => $orderId, 'amount' => $amount]);
        } catch (Throwable $e) {
            Db::exec("UPDATE core_invoices SET status = 'failed' WHERE id = ?", [$inv['id']]);
            $back($e->getMessage());
        }
        $credits = (int) $inv['credits'];
        Db::tx(static function () use ($inv, $u, $paymentKey, $paid, $amount, $credits, $orderId, $creditBalance): void {
            $vat = (int) round($amount - $amount / 1.1);
            Db::exec("UPDATE core_invoices SET status = 'paid', amount_krw = ?, vat_krw = ?, pg_payment_key = ?, receipt_url = ?, paid_at = NOW(3) WHERE id = ? AND status = 'pending'",
                [$amount - $vat, $vat, $paymentKey, $paid['receipt']['url'] ?? null, $inv['id']]);
            $bal = $creditBalance((int) $u['id']);
            Db::exec("INSERT INTO core_credit_ledger (user_id, delta, kind, ref_type, ref_id, memo, balance_after, expires_at) VALUES (?, ?, 'purchase', 'order', ?, ?, ?, DATE_ADD(NOW(3), INTERVAL 12 MONTH))",
                [$u['id'], $credits, $orderId, "크레딧 {$credits}개 구매", $bal + $credits]);
        });
        Audit::log($a, 'billing.credits', 'core_invoices:' . $inv['id'], null, ['credits' => $credits, 'amount' => $amount]);
        $redirect($appUrl('/account/plan?tab=credits&paid=1'));
    });

    // ---- 토스 웹훅
    // 검증: ① tosspayments-webhook-signature 헤더가 오면 HMAC-SHA256(webhook_secret, "{본문}:{전송시각}") base64 와 대조
    //       ② 서명 없는 결제 상태 이벤트는 paymentKey 로 결제를 다시 조회해 그 응답만 믿는다(본문 값은 쓰지 않는다).
    // 키가 없으면 받기만 하고 처리하지 않는다(503). 같은 본문은 한 번만 처리한다.
    $r->post('/billing/webhook', function () use ($toss): void {
        $raw = (string) file_get_contents('php://input');
        $j = json_decode($raw, true);
        if (!is_array($j) || !isset($j['eventType'])) {
            Response::error('INVALID', '웹훅 본문이 올바르지 않습니다.', 400);
        }
        $hash = hash('sha256', $raw);
        if (Db::val('SELECT id FROM core_billing_events WHERE body_hash = ?', [$hash])) {
            Response::json(['ok' => true, 'duplicate' => true]);
        }
        $data = is_array($j['data'] ?? null) ? $j['data'] : [];
        $paymentKey = isset($data['paymentKey']) ? (string) $data['paymentKey'] : null;
        $orderId = isset($data['orderId']) ? (string) $data['orderId'] : null;
        $log = static fn (string $verified, ?string $status, ?string $note, bool $done) => Db::exec(
            'INSERT IGNORE INTO core_billing_events (event_type, payment_key, order_id, status, verified, body_hash, payload, processed_at, note) VALUES (?,?,?,?,?,?,?,?,?)',
            [mb_substr((string) $j['eventType'], 0, 60), $paymentKey, $orderId, $status, $verified, $hash, $raw, $done ? date('Y-m-d H:i:s') : null, $note]
        );

        $secret = (string) Config::get('toss.webhook_secret', '');
        $sigHeader = (string) ($_SERVER['HTTP_TOSSPAYMENTS_WEBHOOK_SIGNATURE'] ?? '');
        $sentAt = (string) ($_SERVER['HTTP_TOSSPAYMENTS_WEBHOOK_TRANSMISSION_TIME'] ?? '');
        $verified = 'none';
        if ($sigHeader !== '') {
            if ($secret === '' || $sentAt === '') {
                $log('none', null, 'signature not checked (no secret)', false);
                Response::error('BILLING_NOT_CONFIGURED', '웹훅 서명 키가 설정되지 않았습니다.', 503);
            }
            $expect = base64_encode(hash_hmac('sha256', $raw . ':' . $sentAt, $secret, true));
            $ok = false;
            foreach (explode(',', $sigHeader) as $part) {
                $sig = trim(str_starts_with(trim($part), 'v1:') ? substr(trim($part), 3) : $part);
                if ($sig !== '' && hash_equals($expect, $sig)) {
                    $ok = true;
                }
            }
            if (!$ok) {
                error_log('[pp-billing] webhook signature mismatch');
                Response::error('INVALID_SIGNATURE', '웹훅 서명이 맞지 않습니다.', 401);
            }
            $verified = 'signature';
        }

        // 결제 상태 이벤트만 반영. 상태는 결제 재조회 응답으로 정한다.
        if ($j['eventType'] !== 'PAYMENT_STATUS_CHANGED' || $paymentKey === null) {
            $log($verified, null, 'stored only', false);
            Response::json(['ok' => true]);
        }
        if ((string) Config::get('toss.secret_key', '') === '') {
            $log($verified, null, 'not processed (no secret key)', false);
            Response::error('BILLING_NOT_CONFIGURED', '결제 키가 설정되지 않았습니다.', 503);
        }
        try {
            $pay = $toss('GET', '/v1/payments/' . rawurlencode($paymentKey));
        } catch (Throwable $e) {
            $log($verified, null, 'lookup failed', false);
            Response::error('LOOKUP_FAILED', '결제를 확인하지 못했습니다.', 502);
        }
        $status = (string) ($pay['status'] ?? '');
        $oid = (string) ($pay['orderId'] ?? '');
        $map = ['DONE' => 'paid', 'CANCELED' => 'refunded', 'PARTIAL_CANCELED' => 'refunded', 'ABORTED' => 'failed', 'EXPIRED' => 'failed'];
        $note = 'no invoice';
        if (isset($map[$status]) && $oid !== '') {
            $inv = Db::row('SELECT id, kind, user_id, credits, status FROM core_invoices WHERE order_id = ?', [$oid]);
            if ($inv !== null && $inv['status'] !== $map[$status]) {
                Db::exec('UPDATE core_invoices SET status = ?, refunded_at = IF(? = \'refunded\', NOW(3), refunded_at), pg_payment_key = COALESCE(pg_payment_key, ?) WHERE id = ?',
                    [$map[$status], $map[$status], $paymentKey, $inv['id']]);
                // 크레딧 결제가 취소되면 적립분을 되돌린다(이미 쓴 만큼 잔액이 음수가 될 수 있다 — 관리자가 본다).
                if ($map[$status] === 'refunded' && $inv['kind'] === 'credits' && $inv['status'] === 'paid' && $inv['user_id']) {
                    $uid = (int) $inv['user_id'];
                    $bal = (int) Db::val('SELECT COALESCE(SUM(delta),0) FROM core_credit_ledger WHERE user_id = ? AND (expires_at IS NULL OR expires_at > NOW(3))', [$uid]);
                    Db::exec("INSERT INTO core_credit_ledger (user_id, delta, kind, ref_type, ref_id, memo, balance_after) VALUES (?, ?, 'refund', 'order', ?, '결제 취소', ?)",
                        [$uid, -(int) $inv['credits'], $oid, $bal - (int) $inv['credits']]);
                }
                $note = 'invoice ' . $map[$status];
            } else {
                $note = $inv === null ? 'no invoice' : 'unchanged';
            }
        }
        $log($verified === 'none' ? 'api' : $verified, $status, $note, true);
        Response::json(['ok' => true]);
    });
};

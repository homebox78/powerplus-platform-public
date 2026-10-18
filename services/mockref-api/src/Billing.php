<?php
declare(strict_types=1);

namespace Homebox;

/**
 * 결제 성공 뒤 기록(routes/billing.php GET /api/billing/success) — 기존 구독 취소 · 새 구독 · 영수증을 한 트랜잭션으로.
 * 2026-10-18 전수조사(부분 실패) B: 예전엔 세 줄이 따로 실행돼 새 구독 INSERT 가 실패하면 기존 구독만 취소되고 영수증도 없었다
 * (돈은 나갔는데 Free 로 떨어짐). 이제 하나라도 실패하면 셋 다 되돌리고 예외를 던진다 — 부르는 쪽이 주문번호와 함께 남기고 안내한다.
 * 결제는 billing.visible 플래그 뒤(superadmin 만)라 화면 대신 시험(packages/mcp/test/policy-1018.test.mjs)으로 본다.
 */
final class Billing
{
    /**
     * @param array{id:int|string} $user
     * @return int 새 구독 id
     */
    public static function recordPaid(array $user, string $planId, string $billing, int $seats, string $customerKey, string $billingKey,
        int $amount, ?string $paymentKey, string $periodEnd): int
    {
        return Db::tx(static function () use ($user, $planId, $billing, $seats, $customerKey, $billingKey, $amount, $paymentKey, $periodEnd): int {
            // 기존 활성 구독은 대체
            Db::exec("UPDATE subscriptions SET status = 'canceled', canceled_at = NOW(3) WHERE owner_type = 'user' AND owner_id = ? AND status IN ('trial','active','past_due')", [$user['id']]);
            Db::exec('INSERT INTO subscriptions (owner_type, owner_id, plan_id, billing, status, seats, pg_customer_key, pg_billing_key, current_period_end) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                ['user', $user['id'], $planId, $billing, 'active', $seats, $customerKey, $billingKey, $periodEnd]);
            $subId = Db::lastId();
            if ($subId <= 0) {
                throw new \RuntimeException('새 구독 번호를 받지 못했습니다.');
            }
            $vat = (int) round($amount - $amount / 1.1);
            Db::exec('INSERT INTO invoices (subscription_id, amount_krw, vat_krw, status, pg_payment_key, paid_at) VALUES (?, ?, ?, ?, ?, NOW(3))',
                [$subId, $amount - $vat, $vat, 'paid', $paymentKey]);
            return $subId;
        });
    }
}

// 출처: homebox-handoff apps/web/app/lib/billing.ts + lib/plans.ts — 토스페이먼츠 빌링(구독)·단건(크레딧) 결제 공용.
// SDK 는 npm @tosspayments/tosspayments-sdk 로 들인다(직접 <script> 를 박지 않는다). 다만 토스 정책상 결제창 스크립트 본체는
// 그 로더가 토스 서버(js.tosspayments.com)에서 받아 온다 — 카드 입력이 우리 서버를 거치지 않게 하는 구조라 대체할 수 없다.
import { useMutation } from "@tanstack/react-query";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { apiBase, postJson } from "@/lib/api";
// 가격·플랜·구독 화면 스위치(2026-10-20 사내 전용 운영 동안 가림) — 원천은 가벼운 lib/plans-ui.ts
export { PLANS_UI } from "@/lib/plans-ui";

export type Billing = "year" | "month";
export const won = (n: number) => `₩${n.toLocaleString("ko-KR")}`;
export const fmtDate = (s: string | null | undefined) => (s ? s.slice(0, 10).replace(/-/g, ".") : "—");

export interface PlanRow { code: "free" | "pro" | "team"; name: string; price_month: number; price_year_month: number; credits_month: number; limits: Record<string, number | boolean> }
export interface Subscription { id: string; plan: string; plan_name: string; billing: Billing; status: "trial" | "active" | "past_due" | "canceled" | "expired"; source: "pg" | "manual" | "legacy"; seats: number; card_label: string | null; current_period_start: string | null; current_period_end: string | null; canceled_at: string | null; has_billing_key: boolean }
export interface CreditPack { id: string; credits: number; amount: number }
export interface CreditRow { delta: number; kind: string; balance_after: number; memo: string | null; expires_at: string | null; created_at: string }
export interface BillingState { plan: "staff" | "free" | "pro" | "team"; staff: boolean; configured: boolean; test_mode: boolean; subscription: Subscription | null; plans: PlanRow[]; credits: { balance: number; ledger: CreditRow[]; packs: CreditPack[] } }
export interface Invoice { id: string; kind: "subscription" | "credits"; title: string | null; credits: number | null; amount: number; vat: number; status: "paid" | "failed" | "refunded"; receipt_url: string | null; tax_invoice_no: string | null; paid_at: string | null; refunded_at: string | null }

/** 월 환산 가격(연간이면 연간 월 환산가). */
export const monthly = (p: PlanRow, billing: Billing) => (billing === "year" ? p.price_year_month : p.price_month);
/** 연간 결제 할인율(월 가격 × 12 대비) */
export const yearlySave = (p: PlanRow | undefined) => (p && p.price_month ? Math.round((1 - p.price_year_month / p.price_month) * 100) : 0);

/** 플랜 카드에 보일 기능(기획 §13.2 요금제 × 모듈 표). 가격·크레딧은 서버 core_plans 가 원천. */
export const PLAN_FEATURES: Record<"pro" | "team", { desc: string; seatNote: string; lead?: string; features: string[] }> = {
  pro: { desc: "프리랜서·개인 디자이너", seatNote: "1인 전용",
    features: ["powerAssets Pro 에셋 원본 삽입", "powerMock 전체 화면·디자인 데이터", "시안 판정·게시", "powerMCP 이미지·코드 · 일 1,000회", "장표 변환 월 50크레딧", "API·MCP 키 3개"] },
  team: { desc: "SI·에이전시 팀", seatNote: "5석 포함 · 추가 좌석 별도", lead: "Pro 전체 기능 +",
    features: ["팀 공유 세트·컬렉션", "장표 변환 월 200크레딧(팀 공유)", "powerMCP 일 5,000회", "API·MCP 키 5개", "통합 결제·세금계산서"] },
};

const origin = () => window.location.origin;

/** 구독: 서버가 준 값으로 카드 등록(빌링 인증) 창 → 성공하면 토스가 /api/v1/billing/success 로 보낸다. */
export function useSubscribe() {
  return useMutation({
    mutationFn: async (o: { plan: "pro" | "team"; billing: Billing }) => {
      const c = await postJson<{ client_key: string; customer_key: string; customer_email: string; customer_name: string; plan: string; billing: Billing }>("/billing/checkout", o);
      const toss = await loadTossPayments(c.client_key);
      const payment = toss.payment({ customerKey: c.customer_key });
      await payment.requestBillingAuth({
        method: "CARD",
        successUrl: `${origin()}${apiBase}/billing/success?plan=${c.plan}&billing=${c.billing}`,
        failUrl: `${origin()}/account/plan?error=${encodeURIComponent("결제창에서 취소되었거나 실패했습니다.")}`,
        customerEmail: c.customer_email,
        customerName: c.customer_name,
      });
    },
  });
}

/** 크레딧 묶음: 서버가 주문(pending)을 만든 뒤 단건 결제창 → 성공하면 /api/v1/billing/credits/success 에서 승인·적립. */
export function useBuyCredits() {
  return useMutation({
    mutationFn: async (pack: string) => {
      const c = await postJson<{ client_key: string; customer_key: string; customer_email: string; customer_name: string; order_id: string; order_name: string; amount: number }>("/billing/credits/checkout", { pack });
      const toss = await loadTossPayments(c.client_key);
      const payment = toss.payment({ customerKey: c.customer_key });
      await payment.requestPayment({
        method: "CARD",
        amount: { currency: "KRW", value: c.amount },
        orderId: c.order_id,
        orderName: c.order_name,
        successUrl: `${origin()}${apiBase}/billing/credits/success`,
        failUrl: `${origin()}/account/plan?tab=credits&error=${encodeURIComponent("결제창에서 취소되었거나 실패했습니다.")}`,
        customerEmail: c.customer_email,
        customerName: c.customer_name,
      });
    },
  });
}

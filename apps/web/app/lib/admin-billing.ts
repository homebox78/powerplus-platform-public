// 관리자 · 구독·결제 API — 서버 api/routes/admin_billing.php
import { apiFetch, apiList } from "@/lib/api";

export type SubStatus = "trial" | "active" | "past_due" | "canceled" | "expired";
export type InvoiceStatus = "pending" | "paid" | "failed" | "refunded";

export interface BillingSummary {
  keys: { mode: "none" | "test" | "live"; webhook_secret: boolean };
  visible: boolean;
  auto_renew: boolean;
  active: Array<{ plan: string; plan_name: string; source: "pg" | "manual" | "legacy"; count: number }>;
  mrr: number;
  month: { paid: number; paid_count: number; refunded: number; refunded_count: number };
  pending: number;
  failed_30d: number;
  ending_7d: number;
  last_event: { event_type: string; status: string | null; verified: string; created_at: string } | null;
}

export interface AdminSub {
  id: string; status: SubStatus; source: "pg" | "manual" | "legacy"; billing: "month" | "year" | null;
  plan: string; plan_name: string; seats: number; card: string | null; has_billing_key: boolean; memo: string | null;
  period_start: string | null; period_end: string | null; canceled_at: string | null; created_at: string;
  owner: { type: "user" | "org"; id: string | null; name: string | null; email: string | null };
}

export interface AdminInvoice {
  id: string; kind: "subscription" | "credits"; title: string; order_id: string | null; credits: number | null;
  amount: number; vat: number; status: InvoiceStatus; pg: boolean; receipt_url: string | null;
  issued_at: string | null; paid_at: string | null; refunded_at: string | null;
  user: { id: string | null; name: string | null; email: string | null };
}

export interface BillingEvent {
  id: number; type: string; order_id: string | null; status: string | null; verified: "signature" | "api" | "none";
  processed: boolean; note: string | null; payload: string | null; created_at: string;
}

const qs = (o: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const fetchBillingSummary = () => apiFetch<BillingSummary>("/admin/billing/summary");
export const fetchAdminSubs = (o: { status?: string; source?: string; plan?: string; q?: string; page?: number }) => apiList<AdminSub>(`/admin/billing/subscriptions${qs(o)}`);
export const fetchAdminInvoices = (o: { status?: string; kind?: string; q?: string; page?: number }) => apiList<AdminInvoice>(`/admin/billing/invoices${qs(o)}`);
export const fetchBillingEvents = (page: number) => apiList<BillingEvent>(`/admin/billing/events${qs({ page })}`);
const post = <T,>(path: string, body?: unknown) => apiFetch<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
export const cancelAdminSub = (id: string, now: boolean) => post<{ ok: true }>(`/admin/billing/subscriptions/${encodeURIComponent(id)}/cancel`, { now });
export const resumeAdminSub = (id: string) => post<{ ok: true }>(`/admin/billing/subscriptions/${encodeURIComponent(id)}/resume`);
export const refundAdminInvoice = (id: string, reason: string) => post<{ ok: true }>(`/admin/billing/invoices/${encodeURIComponent(id)}/refund`, { reason });

export const SOURCE_KO: Record<AdminSub["source"], string> = { pg: "카드 결제", manual: "수동 부여", legacy: "옛 이관" };
export const INVOICE_STATUS_KO: Record<InvoiceStatus, string> = { pending: "대기", paid: "결제됨", failed: "실패", refunded: "환불" };
export const won = (n: number) => `${n.toLocaleString()}원`;
export const ymd = (s: string | null | undefined) => (s ? s.slice(0, 10).replace(/-/g, ".") : "—");

/** 구독 상태를 사람이 읽는 말로 — 해지 예약(기간 남음)과 종료를 나눈다 */
export function subState(s: AdminSub): { label: string; tone: "ok" | "warn" | "off" } {
  const ended = s.period_end !== null && new Date(s.period_end.replace(" ", "T")).getTime() <= Date.now();
  if (ended || s.status === "expired") return { label: "종료", tone: "off" };
  if (s.status === "canceled") return { label: "해지 예약", tone: "warn" };
  if (s.status === "past_due") return { label: "결제 밀림", tone: "warn" };
  if (s.status === "trial") return { label: "체험", tone: "ok" };
  return { label: "이용 중", tone: "ok" };
}

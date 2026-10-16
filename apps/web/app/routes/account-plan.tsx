// 출처: homebox-handoff apps/web/app/routes/account-billing.tsx — 요금제·결제(현재 플랜·다음 결제일·해지 + 플랜 카드 + 청구서)를
// 플랫폼 /api/v1/billing 으로 옮기고 결제 수단·해지 철회·플랜 변경·크레딧 묶음 구매를 더했다.
// 노출: billing.visible 플래그(지금은 superadmin 만, 기획 §12.3). 결제 키가 없어도 화면은 다 보이고, 결제 버튼만 "결제 키 미설정"으로 멈춘다.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CreditCard, ReceiptText, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { BrandName } from "@/components/hb/brand-name";
import { confirmToast, toastError } from "@/components/hb/confirm";
import { Copy, MBr } from "@/components/hb/copy";
import { MobileCarousel } from "@/components/hb/mobile-carousel";
import { BillingToggle, PlanCard, SaveNote } from "@/components/hb/pricing";
import { Tag } from "@/components/hb/tag";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, apiList, ApiError, postJson } from "@/lib/api";
import { Pager } from "@/components/admin/admin-ui";
import { PLAN_KO, useMe } from "@/lib/auth";
import { fmtDate, useBuyCredits, useSubscribe, won, type BillingState, type Invoice, type Billing } from "@/lib/billing";
import type { Route } from "./+types/account-plan";

export const meta: Route.MetaFunction = () => [{ title: "플랜·결제 — powerPlus" }];

const STATUS_KO: Record<string, string> = { active: "이용 중", canceled: "해지 예약", past_due: "결제 실패", trial: "체험", expired: "만료" };
const INV_KO: Record<string, string> = { paid: "결제 완료", failed: "실패", refunded: "환불" };
const CREDIT_KO: Record<string, string> = { grant_month: "월 포함분", purchase: "구매", use: "사용", refund: "환불", expire: "만료", point_convert: "포인트 전환", admin_adjust: "관리자 조정" };
const errMsg = (e: unknown) => (e instanceof ApiError ? (e.hint ? `${e.message} ${e.hint}` : e.message) : (e as Error).message);

export default function AccountPlanPage() {
  const { me } = useMe();
  const [sp, setSp] = useSearchParams();
  const qc = useQueryClient();
  const [billing, setBilling] = useState<Billing>("year");
  const [err, setErr] = useState<string | null>(sp.get("error"));
  const visible = !!me?.billing_visible;
  const state = useQuery({ queryKey: ["billing"], queryFn: () => apiFetch<BillingState>("/billing"), enabled: visible });
  const invoices = useQuery({ queryKey: ["billing", "invoices"], queryFn: () => apiFetch<Invoice[]>("/billing/invoices"), enabled: visible });
  const subscribe = useSubscribe();
  const buyCredits = useBuyCredits();
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["billing"] }); void qc.invalidateQueries({ queryKey: ["me"] }); };
  const cancel = useMutation({ mutationFn: () => postJson<{ ok: boolean }>("/billing/cancel", {}), onSuccess: () => { refresh(); toast.success("해지를 예약했습니다."); }, onError: (e) => toastError(e) });
  const resume = useMutation({ mutationFn: () => postJson<{ ok: boolean }>("/billing/resume", {}), onSuccess: () => { refresh(); toast.success("해지 예약을 취소했습니다."); }, onError: (e) => toastError(e) });
  const change = useMutation({ mutationFn: (o: { plan: "pro" | "team"; billing: Billing }) => postJson<{ ok: boolean }>("/billing/change", o), onSuccess: () => { refresh(); toast.success("플랜을 바꿨습니다."); }, onError: (e) => setErr(errMsg(e)) });

  // 결제 성공으로 돌아오면 안내하고 주소를 정리한다. ?tab=credits 면 크레딧 칸으로.
  useEffect(() => {
    if (sp.get("paid")) { toast.success(sp.get("tab") === "credits" ? "크레딧을 충전했습니다." : "결제를 마쳤습니다."); refresh(); }
    if (sp.get("tab") === "credits") document.getElementById("credits")?.scrollIntoView({ block: "start" });
    if (sp.get("paid") || sp.get("error")) { const next = new URLSearchParams(sp); next.delete("paid"); next.delete("error"); setSp(next, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!me) return null;
  if (!visible) return (<div><h1 className="text-4xl font-extrabold tracking-[-0.03em]">플랜·크레딧</h1><p className="mt-2 text-md text-ink-4">현재 플랜: {PLAN_KO[me.plan]}. 요금제·결제는 아직 공개 전입니다.</p><CreditWallet /></div>);
  const s = state.data;
  const sub = s?.subscription ?? null;
  const paidPlans = (s?.plans ?? []).filter((p) => p.code === "pro" || p.code === "team");
  const items = invoices.data ?? [];
  const busy = subscribe.isPending || change.isPending;

  const choose = (code: "pro" | "team") => {
    setErr(null);
    // 저장된 카드가 있으면 그 카드로 바로 바꾸고, 없으면 카드 등록(빌링 인증) 창부터.
    if (sub && sub.has_billing_key && sub.source === "pg") {
      const p = paidPlans.find((x) => x.code === code);
      confirmToast(`${p?.name ?? code} ${billing === "year" ? "연간" : "월간"}으로 바꿀까요?`, () => change.mutate({ plan: code, billing }), { action: "바꾸기", description: "등록한 카드로 바로 결제하고 새 기간이 시작됩니다." });
      return;
    }
    subscribe.mutate({ plan: code, billing }, { onError: (e) => setErr(errMsg(e)) });
  };
  const cta = (code: "pro" | "team") => {
    if (s?.staff) return { label: "임직원 무료", disabled: true };
    if (sub && sub.plan === code && sub.billing === billing && sub.status !== "canceled") return { label: "이용 중", disabled: true };
    if (busy) return { label: "결제창 여는 중…", disabled: true };
    if (sub && sub.has_billing_key && sub.source === "pg") return { label: "이 플랜으로 바꾸기" };
    return { label: `${code === "pro" ? "Pro" : "Team"} 시작하기` };
  };

  return (
    <div>
      <h1 className="text-4xl font-extrabold tracking-[-0.03em]">플랜·결제</h1>
      {!me.roles.includes("superadmin") ? null : <p className="mt-2 text-sm text-ink-4">결제 공개 전 — 슈퍼관리자에게만 보이는 화면입니다.</p>}

      {err && <Alert variant="destructive" className="mt-6"><AlertCircle aria-hidden /><AlertDescription><Copy as="span" text={err} /></AlertDescription></Alert>}
      {s && !s.configured && (
        <Alert className="mt-6 border border-line"><AlertCircle aria-hidden /><AlertDescription><Copy as="span" text="결제 키가 아직 설정되지 않았습니다. 화면은 그대로 쓸 수 있고, 결제 버튼을 누르면 여기서 멈춥니다." /></AlertDescription></Alert>
      )}

      {/* 현재 플랜 */}
      <section className="mt-5 rounded-banner bg-ground-3 p-7">
        <div className="text-sm text-ink-3">현재 요금제</div>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <span className="text-4xl font-extrabold tracking-[-0.03em]">{PLAN_KO[me.plan]}</span>
          {sub && <Tag tone={sub.status === "active" ? "ink" : sub.status === "past_due" ? "dash" : "line"}>{STATUS_KO[sub.status] ?? sub.status}</Tag>}
          {sub?.source === "manual" && <Tag tone="soft">관리자 지정</Tag>}
        </div>
        {s?.staff ? (
          <p className="mt-2 text-md text-ink-3">임직원 계정은 모든 모듈과 기능을 무료로 씁니다.<MBr />결제할 필요가 없습니다.</p>
        ) : sub ? (
          <>
            <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div><dt className="text-sm text-ink-4">결제 주기</dt><dd className="mt-1 text-md font-semibold">{sub.billing === "year" ? "연간" : "월간"}{sub.seats > 1 ? ` · ${sub.seats}석` : ""}</dd></div>
              <div><dt className="text-sm text-ink-4">{sub.status === "canceled" ? "이용 종료일" : "다음 결제일"}</dt><dd className="mt-1 text-md font-semibold">{fmtDate(sub.current_period_end)}</dd></div>
              <div><dt className="text-sm text-ink-4">결제 수단</dt><dd className="mt-1 flex items-center gap-2 text-md font-semibold"><CreditCard className="size-4 text-ink-3" aria-hidden />{sub.card_label ?? (sub.has_billing_key ? "등록된 카드" : "—")}</dd></div>
            </dl>
            {sub.source === "pg" && (
              <div className="mt-6 flex flex-wrap gap-2">
                {sub.status === "canceled" ? (
                  <Button size="sm" disabled={resume.isPending} onClick={() => resume.mutate()}>해지 취소</Button>
                ) : (
                  <Button size="sm" variant="outline" disabled={cancel.isPending} onClick={() => confirmToast("구독을 해지할까요?", () => cancel.mutate(), { action: "해지", description: "결제한 기간이 끝날 때까지 쓰고, 그 뒤 Free 로 바뀝니다." })}>구독 해지</Button>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="mt-2 text-md text-ink-3">아직 구독하지 않았습니다.<MBr />아래에서 플랜을 고르세요.</p>
        )}
      </section>

      {/* 플랜 고르기·바꾸기 */}
      {!s?.staff && (
        <section className="mt-9">
          <h2 className="text-3xl font-extrabold leading-[1.25] tracking-[-0.03em]">4개 모듈과 <BrandName name="powerMCP" /> 를<br />제한 없이 쓰세요</h2>
          <div className="mt-6 flex flex-wrap items-center gap-4"><BillingToggle value={billing} onChange={setBilling} /><SaveNote plan={paidPlans[0]} /></div>
          <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
            {paidPlans.map((p) => { const c = cta(p.code as "pro" | "team"); return <PlanCard key={p.code} plan={p} billing={billing} cta={c.label} disabled={c.disabled} current={sub?.plan === p.code && sub.status !== "canceled"} onSelect={() => choose(p.code as "pro" | "team")} />; })}
          </div>
          {state.isLoading && <p className="mt-6 text-md text-ink-4">요금제를 불러오는 중…</p>}
          <Link to="/pricing" className="pp-hit mt-6 inline-block text-sm underline underline-offset-4 hover:text-ink-3">전체 요금제 보기</Link>
          <p className="mt-4 flex items-start gap-2 text-xs leading-[1.6] text-ink-4"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden /><span>카드 정보는 토스페이먼츠에만 저장되고 powerPlus 서버를 거치지 않습니다.<br />첫 결제 뒤 같은 카드로 자동 결제되고, 언제든 해지할 수 있습니다.</span></p>
        </section>
      )}

      {/* 크레딧 */}
      <section id="credits" className="mt-9 scroll-mt-[calc(var(--hdr-offset,72px)+24px)]">
        <h2 className="text-2xl font-bold tracking-[-0.02em]">크레딧</h2>
        <p className="mt-2 text-md text-ink-3">1크레딧 = 장표 변환 1장입니다.<MBr />구매한 크레딧은 12개월 동안 씁니다.</p>
        <MobileCarousel label="크레딧" className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="flex min-w-0 flex-col justify-center rounded-panel bg-ground-3 p-6">
            <span className="text-sm text-ink-3">남은 크레딧</span>
            <span className="mt-1 text-4xl font-extrabold tracking-[-0.03em]">{s?.staff ? "무제한" : (s?.credits.balance ?? 0).toLocaleString("ko-KR")}</span>
          </div>
          {(s?.credits.packs ?? []).map((pk) => (
            <div key={pk.id} className="flex min-w-0 flex-col rounded-panel border border-line p-6">
              <span className="text-xl font-extrabold">{pk.credits.toLocaleString("ko-KR")}크레딧</span>
              <span className="mt-1 text-md text-ink-3">{won(pk.amount)}</span><span className="text-sm text-ink-4">1크레딧 {won(Math.round(pk.amount / pk.credits))}</span>
              <Button size="sm" variant="outline" className="mt-5 w-full" disabled={!!s?.staff || buyCredits.isPending} onClick={() => { setErr(null); buyCredits.mutate(pk.id, { onError: (e) => setErr(errMsg(e)) }); }}>{buyCredits.isPending && buyCredits.variables === pk.id ? "결제창 여는 중…" : "구매"}</Button>
            </div>
          ))}
        </MobileCarousel>
      </section>

      <CreditWallet />

      {/* 청구서 */}
      <section className="mt-9">
        <h2 className="text-2xl font-bold tracking-[-0.02em]">청구서</h2>
        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>결제일</TableHead><TableHead>항목</TableHead><TableHead>합계</TableHead><TableHead>부가세</TableHead><TableHead>상태</TableHead><TableHead>영수증</TableHead></TableRow></TableHeader>
            <TableBody>
              {items.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="text-center">{fmtDate(i.paid_at)}</TableCell>
                  <TableCell className="text-left">{i.title ?? (i.kind === "credits" ? `크레딧 ${i.credits ?? ""}개` : "구독")}</TableCell>
                  <TableCell className="text-right font-semibold">{won(i.amount)}</TableCell>
                  <TableCell className="text-right">{won(i.vat)}</TableCell>
                  <TableCell className="text-center"><Tag tone={i.status === "paid" ? "ink" : "line"}>{INV_KO[i.status] ?? i.status}</Tag></TableCell>
                  <TableCell className="text-center">{i.receipt_url ? <a href={i.receipt_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm underline underline-offset-4 hover:text-ink-3"><ReceiptText className="size-4" aria-hidden />보기</a> : "—"}</TableCell>
                </TableRow>
              ))}
              {items.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-ink-4">청구 내역이 없습니다.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </section>
      {s?.test_mode && <Tag tone="soft" className="mt-6">테스트 키 — 실제 결제되지 않음</Tag>}
    </div>
  );
}

type CreditRow = { delta: number; kind: string; balance_after: number; memo: string | null; expires_at: string | null; created_at: string };
type CreditMeta = { staff: boolean; balance: number; month_granted: number; purchased_alive: number; expiring_30d: number; plan_month: number };

/** 크레딧 지갑 — 결제 공개 전에도 보인다(포인트 전환·관리자 지급분을 확인할 곳). 월 포함분·구매분은 지급량 기준(사용분은 출처를 따로 적지 않는다). */
function CreditWallet() {
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ["me", "credits", page], queryFn: () => apiList<CreditRow>(`/me/credits?page=${page}&limit=20`), placeholderData: (p) => p });
  const m = (q.data?.meta ?? null) as CreditMeta | null;
  const rows = q.data?.data ?? [];
  const n = (v: number | undefined) => (v ?? 0).toLocaleString("ko-KR");
  const cards: Array<[string, string, string?]> = m?.staff
    ? [["남은 크레딧", "무제한", "임직원은 차감하지 않습니다."]]
    : [
        ["남은 크레딧", n(m?.balance), "만료되지 않은 크레딧 합계"],
        ["이번 달 포함분", n(m?.month_granted), m?.plan_month ? `플랜 기본 ${n(m.plan_month)}` : "플랜에 포함분이 없습니다."],
        ["구매(유효)", n(m?.purchased_alive), "구매한 크레딧은 12개월 유효"],
        ["30일 안 만료", n(m?.expiring_30d), "먼저 만료되는 것부터 씁니다."],
      ];
  return (
    <section id="credit-wallet" className="mt-7">
      <h2 className="text-2xl font-bold tracking-[-0.02em]">크레딧 지갑</h2>
      <p className="mt-2 text-md text-ink-3">1크레딧 = 장표 변환 1장입니다.</p>
      <MobileCarousel label="크레딧 지갑" className={`mt-6 grid grid-cols-1 gap-4 ${m?.staff ? "" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
        {cards.map(([label, value, hint]) => (
          <div key={label} className="flex min-w-0 flex-col justify-center rounded-panel bg-ground-3 p-6">
            <span className="text-sm text-ink-3">{label}</span>
            <span className="mt-1 text-3xl font-extrabold tracking-[-0.03em]">{value}</span>
            {hint && <span className="mt-1 text-sm text-ink-4">{hint}</span>}
          </div>
        ))}
      </MobileCarousel>
      <div className="mt-6 overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>일시</TableHead><TableHead>구분</TableHead><TableHead>내용</TableHead><TableHead>변동</TableHead><TableHead>잔액</TableHead><TableHead>만료</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((c, i) => (
              <TableRow key={`${c.created_at}-${i}`}>
                <TableCell className="text-center">{fmtDate(c.created_at)}</TableCell>
                <TableCell className="text-center">{CREDIT_KO[c.kind] ?? c.kind}</TableCell>
                <TableCell className="text-left">{c.memo ?? "—"}</TableCell>
                <TableCell className="text-right font-semibold">{c.delta > 0 ? `+${n(c.delta)}` : n(c.delta)}</TableCell>
                <TableCell className="text-right">{n(c.balance_after)}</TableCell>
                <TableCell className="text-center">{fmtDate(c.expires_at)}</TableCell>
              </TableRow>
            ))}
            {!q.isLoading && rows.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-ink-4">크레딧 내역이 없습니다.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <Pager page={page} total={q.data?.total ?? 0} limit={20} onPage={setPage} />
    </section>
  );
}

// 관리자 · 구독·결제 — 요약(키 상태·이용 중 구독·월 환산·이번 달 결제·대기/실패) + 탭(구독 · 결제 내역 · 웹훅 기록).
// 서버: api/routes/admin_billing.php. 해지·철회 = admin, 환불 = superadmin(토스 결제 취소). 사용자 2026-10-15 "관리자 모드에 구독 관련 관리 페이지가 없는데?"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { AdminTitle, Pager, SearchBox, useQueryState } from "@/components/admin/admin-ui";
import { ChoiceButton } from "@/components/hb/choice-button";
import { confirmToast, toastError } from "@/components/hb/confirm";
import { MBr } from "@/components/hb/copy";
import { LiveStatus } from "@/components/hb/live-status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  cancelAdminSub, fetchAdminInvoices, fetchAdminSubs, fetchBillingEvents, fetchBillingSummary, INVOICE_STATUS_KO, refundAdminInvoice,
  resumeAdminSub, SOURCE_KO, subState, won, ymd, type AdminInvoice, type AdminSub,
} from "@/lib/admin-billing";
import { useMe } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type { Route } from "./+types/admin-billing";

export const meta: Route.MetaFunction = () => [{ title: "구독·결제 — powerPlus 관리자" }];

const TABS = [{ id: "subs", label: "구독" }, { id: "invoices", label: "결제 내역" }, { id: "events", label: "웹훅 기록" }] as const;
type Tab = (typeof TABS)[number]["id"];

export default function AdminBilling() {
  const { get, set } = useQueryState();
  const tab = (TABS.some((t) => t.id === get("tab")) ? get("tab") : "subs") as Tab;
  return (
    <div>
      <AdminTitle title="구독·결제" desc="구독과 결제 내역, 토스 웹훅 기록을 봅니다. 환불은 최고 관리자만 할 수 있습니다." />
      <Summary />
      <Tabs value={tab} onValueChange={(v) => set({ tab: v === "subs" ? "" : v, status: "", source: "", plan: "", kind: "", q: "" })} className="mt-8">
        <TabsList>{TABS.map((t) => <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>)}</TabsList>
      </Tabs>
      <div className="mt-4">
        {tab === "subs" && <SubsTab />}
        {tab === "invoices" && <InvoicesTab />}
        {tab === "events" && <EventsTab />}
      </div>
    </div>
  );
}

// ── 요약 ──
function Summary() {
  const q = useQuery({ queryKey: ["admin", "billing", "summary"], queryFn: fetchBillingSummary });
  const s = q.data;
  if (!s) return <div className="mt-7 h-[180px]" aria-busy />;
  const live = s.active.reduce((n, x) => n + x.count, 0);
  const pg = s.active.filter((x) => x.source === "pg").reduce((n, x) => n + x.count, 0);
  const plans = Object.entries(s.active.reduce<Record<string, number>>((m, x) => ({ ...m, [x.plan_name]: (m[x.plan_name] ?? 0) + x.count }), {}));
  return (
    <>
      <div className="mt-7 flex flex-wrap items-center gap-2">
        <LiveStatus state={s.keys.mode === "live" ? "ok" : s.keys.mode === "test" ? "wait" : "off"}>
          {s.keys.mode === "live" ? "토스 실결제 키" : s.keys.mode === "test" ? "토스 테스트 키" : "토스 키 없음"}
        </LiveStatus>
        <LiveStatus state={s.visible ? "ok" : "off"}>{s.visible ? "결제 화면 공개" : "결제 화면 숨김(최고 관리자만)"}</LiveStatus>
        <LiveStatus state={s.last_event ? "ok" : "off"}>{s.last_event ? `웹훅 마지막 수신 ${ymd(s.last_event.created_at)}` : "웹훅 수신 기록 없음"}</LiveStatus>
      </div>
      {!s.auto_renew && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>매달 자동 결제(구독 갱신)가 아직 없습니다.<MBr /> 카드 구독은 첫 결제 기간이 끝나면 그대로 종료됩니다{s.ending_7d > 0 ? ` — 7일 안에 끝나는 카드 구독 ${s.ending_7d}건` : ""}.</p>
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="이용 중 구독" value={`${live}건`} sub={plans.length ? plans.map(([n, c]) => `${n} ${c}`).join(" · ") : "없음"} />
        <Kpi label="월 환산 매출(카드 구독)" value={won(s.mrr)} sub={`카드 구독 ${pg}건 · 해지 예약 제외`} />
        <Kpi label="이번 달 결제" value={won(s.month.paid)} sub={`${s.month.paid_count}건${s.month.refunded_count ? ` · 환불 ${won(s.month.refunded)}` : ""}`} />
        <Kpi label="대기 · 실패(30일)" value={`${s.pending} · ${s.failed_30d}`} sub="결제창을 열고 끝내지 않은 건 = 대기" alert={s.failed_30d > 0} />
      </div>
    </>
  );
}

function Kpi({ label, value, sub, alert }: { label: string; value: string; sub: string; alert?: boolean }) {
  return (
    <Card size="sm" className="min-w-0">
      <div className="flex min-w-0 flex-col px-3">
        <span className="text-xs text-ink-4">{label}</span>
        <span className={cn("mt-1 text-[22px] font-extrabold leading-none tabular-nums tracking-[-0.02em]", alert && "text-point-ink")}>{value}</span>
        <span className="mt-1.5 truncate text-xs text-ink-4" title={sub}>{sub}</span>
      </div>
    </Card>
  );
}

function Empty({ cols, loading, empty }: { cols: number; loading: boolean; empty: boolean }) {
  if (loading) return <TableRow><TableCell colSpan={cols} className="py-12 text-center text-ink-4">불러오는 중</TableCell></TableRow>;
  if (empty) return <TableRow><TableCell colSpan={cols} className="py-12 text-center text-ink-4">해당하는 기록이 없습니다.</TableCell></TableRow>;
  return null;
}

function Who({ name, email }: { name: string | null; email: string | null }) {
  return (
    <>
      <span className="block truncate font-semibold">{name ?? "—"}</span>
      <span className="block truncate text-xs text-ink-4">{email ?? ""}</span>
    </>
  );
}

// ── 구독 ──
function SubsTab() {
  const { get, set, page } = useQueryState();
  const f = { status: get("status"), source: get("source"), plan: get("plan"), q: get("q"), page };
  const list = useQuery({ queryKey: ["admin", "billing", "subs", f], queryFn: () => fetchAdminSubs(f) });
  const rows = list.data?.data ?? [];
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <ChoiceButton size="sm" label="상태" value={f.status} onChange={(v) => set({ status: v })} options={[{ id: "live", label: "이용 중" }, { id: "canceling", label: "해지 예약" }, { id: "ended", label: "종료" }]} />
        <ChoiceButton size="sm" label="출처" value={f.source} onChange={(v) => set({ source: v })} options={[{ id: "pg", label: "카드 결제" }, { id: "manual", label: "수동 부여" }, { id: "legacy", label: "옛 이관" }]} />
        <ChoiceButton size="sm" label="플랜" value={f.plan} onChange={(v) => set({ plan: v })} options={[{ id: "pro", label: "Pro" }, { id: "team", label: "Team" }, { id: "staff", label: "Staff" }]} />
        <SearchBox value={f.q} onSearch={(v) => set({ q: v })} placeholder="이름·이메일 검색" />
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-line">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead>사용자</TableHead>
              <TableHead className="w-[112px] max-sm:w-[84px]">플랜</TableHead>
              <TableHead className="hidden w-[104px] md:table-cell">출처</TableHead>
              <TableHead className="w-[112px] max-sm:w-[92px]">상태</TableHead>
              <TableHead className="hidden w-[150px] lg:table-cell">카드</TableHead>
              <TableHead className="hidden w-[112px] sm:table-cell">기간 끝</TableHead>
              <TableHead className="w-[56px]"><span className="sr-only">메뉴</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => <SubRow key={s.id} s={s} />)}
            <Empty cols={7} loading={list.isLoading} empty={!!list.data && rows.length === 0} />
          </TableBody>
        </Table>
      </div>
      <Pager page={page} total={list.data?.total ?? 0} limit={list.data?.limit ?? 30} onPage={(p) => set({ page: String(p) })} />
    </>
  );
}

function SubRow({ s }: { s: AdminSub }) {
  const qc = useQueryClient();
  const st = subState(s);
  const done = () => { void qc.invalidateQueries({ queryKey: ["admin", "billing"] }); };
  const cancel = useMutation({ mutationFn: (now: boolean) => cancelAdminSub(s.id, now), onSuccess: (_, now) => { toast.success(now ? "구독을 바로 끝냈습니다." : "해지를 예약했습니다. 기간이 끝날 때까지 씁니다."); done(); }, onError: (e) => toastError(e) });
  const resume = useMutation({ mutationFn: () => resumeAdminSub(s.id), onSuccess: () => { toast.success("해지 예약을 되돌렸습니다."); done(); }, onError: (e) => toastError(e) });
  const who = s.owner.name ?? s.owner.email ?? "이 사용자";
  return (
    <TableRow>
      <TableCell className="text-left">
        {s.owner.id ? <Link to={`/admin/users?q=${encodeURIComponent(s.owner.email ?? "")}`} className="block min-w-0 hover:underline"><Who name={s.owner.name} email={s.owner.email} /></Link> : <Who name={s.owner.name} email={s.owner.email} />}
      </TableCell>
      <TableCell className="text-center">{s.plan_name}{s.billing ? <span className="text-ink-4"> · {s.billing === "year" ? "연" : "월"}</span> : null}</TableCell>
      <TableCell className="hidden text-center md:table-cell">{SOURCE_KO[s.source]}</TableCell>
      <TableCell className="text-center"><LiveStatus state={st.tone}>{st.label}</LiveStatus></TableCell>
      <TableCell className="hidden truncate text-center text-ink-3 lg:table-cell">{s.card ?? (s.has_billing_key ? "등록됨" : "—")}</TableCell>
      <TableCell className="hidden text-center tabular-nums sm:table-cell">{s.period_end ? ymd(s.period_end) : "무기한"}</TableCell>
      <TableCell className="text-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8" aria-label="구독 메뉴"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {st.label === "해지 예약" && <DropdownMenuItem onSelect={() => resume.mutate()}>해지 예약 되돌리기</DropdownMenuItem>}
            {(st.label === "이용 중" || st.label === "체험" || st.label === "결제 밀림") && (
              <DropdownMenuItem onSelect={() => confirmToast(`${who}의 ${s.plan_name} 구독을 해지 예약할까요?`, () => cancel.mutate(false), { action: "해지 예약", description: "결제한 기간이 끝날 때까지 쓰고 그 뒤 Free 로 바뀝니다." })}>해지 예약</DropdownMenuItem>
            )}
            {st.label !== "종료" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-warn" onSelect={() => confirmToast(`${who}의 ${s.plan_name} 구독을 지금 끝낼까요?`, () => cancel.mutate(true), { action: "바로 종료", description: "남은 기간 없이 바로 Free 로 바뀝니다. 돈은 돌려주지 않습니다 — 환불은 결제 내역에서." })}>바로 종료</DropdownMenuItem>
              </>
            )}
            {st.label === "종료" && <DropdownMenuItem disabled>할 일 없음</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

// ── 결제 내역 ──
function InvoicesTab() {
  const { get, set, page } = useQueryState();
  const { hasRole } = useMe();
  const f = { status: get("status"), kind: get("kind"), q: get("q"), page };
  const list = useQuery({ queryKey: ["admin", "billing", "invoices", f], queryFn: () => fetchAdminInvoices(f) });
  const rows = list.data?.data ?? [];
  const [refund, setRefund] = useState<AdminInvoice | null>(null);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <ChoiceButton size="sm" label="상태" value={f.status} onChange={(v) => set({ status: v })} options={[{ id: "paid", label: "결제됨" }, { id: "pending", label: "대기" }, { id: "failed", label: "실패" }, { id: "refunded", label: "환불" }]} />
        <ChoiceButton size="sm" label="종류" value={f.kind} onChange={(v) => set({ kind: v })} options={[{ id: "subscription", label: "구독" }, { id: "credits", label: "크레딧" }]} />
        <SearchBox value={f.q} onSearch={(v) => set({ q: v })} placeholder="이름·이메일·주문번호" />
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-line">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[104px] max-sm:w-[84px]">일자</TableHead>
              <TableHead className="hidden md:table-cell">사용자</TableHead>
              <TableHead>내용</TableHead>
              <TableHead className="w-[112px] max-sm:w-[88px]">금액</TableHead>
              <TableHead className="w-[84px] max-sm:w-[64px]">상태</TableHead>
              <TableHead className="hidden w-[84px] sm:table-cell">영수증</TableHead>
              <TableHead className="w-[56px]"><span className="sr-only">메뉴</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="text-center tabular-nums">{ymd(i.paid_at ?? i.issued_at)}</TableCell>
                <TableCell className="hidden text-left md:table-cell"><Who name={i.user.name} email={i.user.email} /></TableCell>
                <TableCell className="text-left">
                  <span className="block truncate font-semibold">{i.title}</span>
                  <span className="block truncate text-xs text-ink-4">{i.kind === "credits" ? `크레딧 ${i.credits ?? 0}` : "구독"}{i.order_id ? ` · ${i.order_id}` : ""}</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{won(i.amount)}</TableCell>
                <TableCell className="text-center"><span className={cn(i.status === "failed" && "font-semibold text-warn", i.status === "refunded" && "text-ink-4", i.status === "pending" && "text-ink-3")}>{INVOICE_STATUS_KO[i.status]}</span></TableCell>
                <TableCell className="hidden text-center sm:table-cell">{i.receipt_url ? <a href={i.receipt_url} target="_blank" rel="noreferrer" className="text-sm underline underline-offset-2">보기</a> : <span className="text-ink-4">—</span>}</TableCell>
                <TableCell className="text-center">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8" aria-label="결제 메뉴"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {i.order_id && <DropdownMenuItem onSelect={() => { void navigator.clipboard?.writeText(i.order_id ?? ""); toast.success("주문번호를 복사했습니다."); }}>주문번호 복사</DropdownMenuItem>}
                      <DropdownMenuItem className="text-warn" disabled={!(i.status === "paid" && i.pg && hasRole("superadmin"))} onSelect={() => setRefund(i)}>
                        {hasRole("superadmin") ? (i.status === "paid" && i.pg ? "전액 환불" : "환불할 수 없음") : "환불(최고 관리자만)"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            <Empty cols={7} loading={list.isLoading} empty={!!list.data && rows.length === 0} />
          </TableBody>
        </Table>
      </div>
      <Pager page={page} total={list.data?.total ?? 0} limit={list.data?.limit ?? 30} onPage={(p) => set({ page: String(p) })} />
      <RefundDialog inv={refund} onClose={() => setRefund(null)} />
    </>
  );
}

function RefundDialog({ inv, onClose }: { inv: AdminInvoice | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: () => refundAdminInvoice(inv!.id, reason.trim()),
    onSuccess: () => { toast.success("환불했습니다. 토스에서 결제를 취소했습니다."); void qc.invalidateQueries({ queryKey: ["admin", "billing"] }); setReason(""); onClose(); },
    onError: (e) => toastError(e),
  });
  return (
    <Dialog open={!!inv} onOpenChange={(v) => { if (!v) { setReason(""); onClose(); } }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>전액 환불</DialogTitle>
          <DialogDescription>
            {inv ? `${inv.user.name ?? inv.user.email ?? ""} · ${inv.title} · ${won(inv.amount)}` : ""}
          </DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-3">
          <li>토스에서 결제를 취소합니다. 되돌릴 수 없습니다.</li>
          {inv?.kind === "credits" ? <li>적립한 크레딧 {inv.credits ?? 0}개를 회수합니다.</li> : <li>이 결제로 시작한 구독을 바로 끝냅니다.</li>}
        </ul>
        <div className="grid gap-1.5">
          <Label htmlFor="refund-reason">환불 사유 <span className="font-normal text-ink-4">토스 취소 기록에 남습니다</span></Label>
          <Textarea id="refund-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 중복 결제, 사용자 요청" className="text-sm" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>닫기</Button>
          <Button variant="destructive" disabled={reason.trim().length < 2 || m.isPending} onClick={() => m.mutate()}>{m.isPending ? "환불하는 중" : "환불"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 웹훅 기록 ──
const VERIFIED_KO = { signature: "서명", api: "재조회", none: "미검증" } as const;
function EventsTab() {
  const { set, page } = useQueryState();
  const list = useQuery({ queryKey: ["admin", "billing", "events", page], queryFn: () => fetchBillingEvents(page) });
  const rows = list.data?.data ?? [];
  return (
    <>
      <p className="text-sm text-ink-4">토스가 결제 상태가 바뀔 때 보내는 알림입니다.<MBr /> 서버는 토스에 결제를 다시 조회해 진짜인지 확인한 뒤 반영합니다.</p>
      <div className="mt-4 overflow-hidden rounded-xl border border-line">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[104px] max-sm:w-[84px]">받은 날</TableHead>
              <TableHead className="hidden w-[200px] md:table-cell">종류</TableHead>
              <TableHead>주문번호 · 처리</TableHead>
              <TableHead className="w-[96px] max-sm:w-[76px]">결제 상태</TableHead>
              <TableHead className="w-[80px] max-sm:w-[64px]">검증</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="text-center tabular-nums">{ymd(e.created_at)}</TableCell>
                <TableCell className="hidden truncate text-center text-sm md:table-cell">{e.type}</TableCell>
                <TableCell className="text-left">
                  <span className="block truncate">{e.order_id ?? "—"}</span>
                  <span className="block truncate text-xs text-ink-4">{e.note ?? ""}</span>
                </TableCell>
                <TableCell className="text-center text-sm">{e.status ?? "—"}</TableCell>
                <TableCell className="text-center"><span className={cn("text-sm", e.verified === "none" && "text-warn")}>{VERIFIED_KO[e.verified]}</span></TableCell>
              </TableRow>
            ))}
            <Empty cols={5} loading={list.isLoading} empty={!!list.data && rows.length === 0} />
          </TableBody>
        </Table>
      </div>
      <Pager page={page} total={list.data?.total ?? 0} limit={list.data?.limit ?? 30} onPage={(p) => set({ page: String(p) })} />
    </>
  );
}

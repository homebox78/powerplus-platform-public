// 관리자 · 사용자 — 목록(구분·상태·역할·검색) + [사용자 추가] Dialog + 상세 Sheet 탭(개요·포인트·크레딧·키·활동).
// 서버: api/routes/admin.php(목록·역할) + api/routes/admin3.php(추가·플랜·포인트·크레딧·차단·상세·키 폐기).
// 규칙(기획 §12.2): superadmin 은 화면에서 손대지 못한다(차단·플랜 대상 아님). admin 역할은 superadmin 만 바꾼다. 자기 자신은 차단·admin 회수 불가.
// 임직원(staff)은 전체 무료라 플랜을 바꾸지 않는다. 포인트·크레딧 조정과 차단은 AlertDialog 로 한 번 더 확인한다(차단은 2단계).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Coins, CreditCard, KeyRound, Minus, Plus, RotateCcw, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AdminTitle, BulkBar, Field, Pager, SearchBox, SelectAllCell, SelectCell, SortHead, useQueryState, useSelection, useSort } from "@/components/admin/admin-ui";
import { AtText } from "@/components/admin/at-text";
import { ChoiceButton } from "@/components/hb/choice-button";
import { confirmToast, toastError } from "@/components/hb/confirm";
import { Copy, MBr } from "@/components/hb/copy";
import { Tag } from "@/components/hb/tag";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  adjustUserCredits, adjustUserPoints, AUDIT_KO, createAdminUser, CREDIT_KIND_KO, fetchAdminUser, fetchUsers, fmtAt, POINT_REASON_KO, revokeUserKey,
  ROLE_KO, setUserPlan, setUserStatus, STATUS_KO, type AdminUser, type AdminUserDetail, type GrantRole, type LedgerRow, type ManualPlan,
} from "@/lib/admin";
import { bulkMessage, bulkUsers, type UserBulkBody } from "@/lib/admin-bulk";
import { apiFetch, postJson } from "@/lib/api";
import { PLAN_KO } from "@/lib/auth";
import type { Route } from "./+types/admin-users";

export const meta: Route.MetaFunction = () => [{ title: "사용자·역할 — powerPlus 관리자" }];

const GRANTABLE: Array<{ role: GrantRole; desc: string }> = [
  { role: "admin", desc: "사용자·등급·모듈 운영 전부. superadmin 만 부여합니다." },
  { role: "curator", desc: "에셋·검수·규칙 편집. 사용자·결제는 못 봅니다." },
  { role: "support", desc: "문의·삭제요청·공지 처리." },
];
const KIND_KO = { staff: "임직원", external: "외부" } as const;
const MANUAL_PLANS: ManualPlan[] = ["free", "pro", "team"];
const INVITE_KO = { off: "", sent: "초대 메일을 보냈습니다.", failed: "초대 메일 발송에 실패했습니다.", skipped: "메일 서버 설정이 없어 초대 메일은 보내지 않았습니다." } as const;

export default function AdminUsers() {
  const { get, set, page } = useQueryState();
  const kind = get("kind");
  const status = get("status");
  const role = get("role");
  const q = get("q");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const list = useQuery({ queryKey: ["admin", "users", kind, status, role, q, page], queryFn: () => fetchUsers({ kind, status, role, q, page } as Parameters<typeof fetchUsers>[0]) });
  const items = list.data?.data ?? [];
  const canGrantAdmin = Boolean(list.data?.meta?.can_grant_admin);
  const current = items.find((u) => u.id === openId) ?? null;
  const sel = useSelection(items.map((u) => u.id), [kind, status, role, q, page]);
  const st = useSort(items, { name: (u) => u.name, kind: (u) => KIND_KO[u.kind], status: (u) => u.status, plan: (u) => PLAN_KO[u.plan], role: (u) => (u.roles.includes("superadmin") ? 4 : u.roles.includes("admin") ? 3 : u.roles.includes("curator") ? 2 : u.roles.length ? 1 : null), active: (u) => u.last_active });
  const qc = useQueryClient();
  const unblock = useMutation({
    mutationFn: bulkUsers,
    onSuccess: (r) => { toast.success(bulkMessage(r, "해제했습니다")); sel.clear(); void qc.invalidateQueries({ queryKey: ["admin"] }); },
    onError: (e) => toastError(e),
  });
  const runBulk = (b: UserBulkBody) => unblock.mutate(b);
  const [bulkMode, setBulkMode] = useState<{ mode: "block" | "plan" | "points"; ids: string[] } | null>(null);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <AdminTitle title="사용자" desc="가입한 사용자와 운영 역할입니다. 사용자를 누르면 플랜·포인트·크레딧·키·활동을 볼 수 있습니다." />
        <Button size="sm" onClick={() => setAdding(true)} className="mt-1"><UserPlus aria-hidden />사용자 추가</Button>
      </div>
      <div className="mt-7 flex flex-wrap items-center gap-2">
        <ChoiceButton size="sm" label="구분" value={kind} onChange={(v) => set({ kind: v })} options={[{ id: "staff", label: "임직원" }, { id: "external", label: "외부" }]} />
        <ChoiceButton size="sm" label="상태" value={status} onChange={(v) => set({ status: v })} options={[{ id: "active", label: "정상" }, { id: "blocked", label: "차단" }]} />
        <ChoiceButton size="sm" label="역할" value={role} onChange={(v) => set({ role: v })}
          options={[{ id: "any", label: "역할 있음" }, ...(["superadmin", "admin", "curator", "support"] as const).map((r) => ({ id: r, label: ROLE_KO[r]! }))]} />
        <SearchBox value={q} onSearch={(v) => set({ q: v })} placeholder="이름·이메일 검색" />
        <span className="ml-auto text-sm tabular-nums text-ink-4">{(list.data?.total ?? 0).toLocaleString()}명</span>
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-line">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <SelectAllCell sel={sel} />
              <SortHead s={st} k="name">사용자</SortHead>
              <SortHead s={st} k="kind" className="w-[84px]">구분</SortHead>
              <SortHead s={st} k="status" className="w-[76px]">상태</SortHead>
              <SortHead s={st} k="plan" className="hidden w-[84px] md:table-cell">플랜</SortHead>
              <SortHead s={st} k="role" className="hidden w-[200px] md:table-cell">역할</SortHead>
              <SortHead s={st} k="active" className="hidden w-[150px] lg:table-cell">마지막 활동</SortHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {st.rows.map((u) => (
              <TableRow key={u.id} onClick={() => setOpenId(u.id)} className="cursor-pointer" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setOpenId(u.id); }} aria-label={`${u.name} 상세`}>
                <SelectCell sel={sel} id={u.id} label={u.name} />
                <TableCell className="text-left">
                  <span className="block truncate font-semibold">{u.name}{u.me && <span className="ml-1.5 text-xs font-normal text-ink-4">(나)</span>}</span>
                  <span className="block truncate text-xs text-ink-4">{u.email}</span>
                </TableCell>
                <TableCell className="text-center">{KIND_KO[u.kind]}</TableCell>
                <TableCell className="text-center">{u.status === "blocked" ? <Tag tone="warn">차단</Tag> : <span className="text-ink-3">정상</span>}</TableCell>
                <TableCell className="hidden text-center md:table-cell">{PLAN_KO[u.plan]}</TableCell>
                <TableCell className="hidden text-center md:table-cell">
                  {u.roles.length ? <span className="inline-flex flex-wrap justify-center gap-1">{u.roles.map((r) => <Tag key={r} tone={r === "superadmin" || r === "admin" ? "ink" : "soft"}>{ROLE_KO[r]}</Tag>)}</span> : <span className="text-ink-4">—</span>}
                </TableCell>
                <TableCell className="hidden text-center tabular-nums text-ink-3 lg:table-cell">{fmtAt(u.last_active)}</TableCell>
              </TableRow>
            ))}
            {list.data && items.length === 0 && <TableRow><TableCell colSpan={7} className="py-12 text-center text-ink-4">해당하는 사용자가 없습니다.</TableCell></TableRow>}
            {list.isLoading && <TableRow><TableCell colSpan={7} className="py-12 text-center text-ink-4">불러오는 중</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <Pager page={page} total={list.data?.total ?? 0} limit={list.data?.limit ?? 30} onPage={(p) => set({ page: String(p) })} />

      <BulkBar sel={sel} actions={[
        { label: "플랜 지정", icon: <CreditCard aria-hidden />, onRun: (ids) => setBulkMode({ mode: "plan", ids }) },
        { label: "포인트 조정", icon: <Coins aria-hidden />, onRun: (ids) => setBulkMode({ mode: "points", ids }) },
        { label: "차단 해제", icon: <RotateCcw aria-hidden />, confirm: "고른 {n}명 중 차단된 사람을 해제합니다.", onRun: (ids) => runBulk({ action: "unblock", ids }) },
        { label: "차단", icon: <Ban aria-hidden />, danger: true, onRun: (ids) => setBulkMode({ mode: "block", ids }) },
      ]} />
      <UserBulkDialog state={bulkMode} onClose={() => setBulkMode(null)} onDone={() => { setBulkMode(null); sel.clear(); }} />

      <AddUserDialog open={adding} onOpenChange={setAdding} onCreated={(id) => setOpenId(id)} />

      <Sheet open={!!openId} onOpenChange={(v) => { if (!v) setOpenId(null); }}>
        <SheetContent className="w-full overflow-y-auto bg-ground text-ink sm:max-w-[560px]">
          {openId && <UserDetail key={openId} id={openId} row={current} canGrantAdmin={canGrantAdmin} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── 여러 명 한꺼번에: 차단(사유)·플랜 지정(기한)·포인트 조정(사유). 슈퍼관리자·나·임직원(플랜)은 서버가 건너뛴다.
function UserBulkDialog({ state, onClose, onDone }: { state: { mode: "block" | "plan" | "points"; ids: string[] } | null; onClose: () => void; onDone: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [plan, setPlan] = useState<ManualPlan>("pro");
  const [until, setUntil] = useState("");
  const [amount, setAmount] = useState("");
  const reset = () => { setReason(""); setPlan("pro"); setUntil(""); setAmount(""); };
  const run = useMutation({
    mutationFn: bulkUsers,
    onSuccess: (r) => {
      toast.success(bulkMessage(r, r.action === "block" ? "차단했습니다" : r.action === "plan" ? "바꿨습니다" : "조정했습니다"));
      reset();
      void qc.invalidateQueries({ queryKey: ["admin"] });
      onDone();
    },
    onError: (e) => toastError(e),
  });
  if (!state) return null;
  const n = state.ids.length.toLocaleString();
  const amt = Number(amount);
  const reasonOk = reason.trim().length >= 2;
  const valid = state.mode === "plan" ? true : state.mode === "block" ? reasonOk : reasonOk && Number.isInteger(amt) && amt !== 0 && Math.abs(amt) <= 100000;
  const submit = () => {
    if (!valid) return;
    if (state.mode === "block") run.mutate({ action: "block", ids: state.ids, reason: reason.trim() });
    else if (state.mode === "plan") run.mutate({ action: "plan", ids: state.ids, plan, until: until || undefined });
    else run.mutate({ action: "points", ids: state.ids, amount: amt, reason: reason.trim() });
  };
  const title = { block: `${n}명 차단`, plan: `${n}명 플랜 지정`, points: `${n}명 포인트 조정` }[state.mode];
  const desc = {
    block: "차단하면 지금 열린 로그인이 모두 끊깁니다. 슈퍼관리자와 나는 건너뜁니다.",
    plan: "손으로 지정한 구독만 바꿉니다. 임직원과 슈퍼관리자는 건너뜁니다.",
    points: "음수면 회수합니다. 잔액보다 많이 회수하는 사람은 건너뜁니다.",
  }[state.mode];
  return (
    <Dialog open onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="bg-ground text-ink sm:max-w-[440px]">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{desc}</DialogDescription></DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          {state.mode === "plan" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bu-plan">플랜과 기한</Label>
              <div className="flex gap-2">
                <Select value={plan} onValueChange={(v) => setPlan(v as ManualPlan)}>
                  <SelectTrigger id="bu-plan" size="sm" className="h-9 w-[120px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{MANUAL_PLANS.map((p) => <SelectItem key={p} value={p}>{PLAN_KO[p]}</SelectItem>)}</SelectContent>
                </Select>
                <Input type="date" className="h-9 min-w-0 flex-1" value={until} onChange={(e) => setUntil(e.target.value)} aria-label="기한(비우면 기한 없음)" />
              </div>
              <p className="text-sm text-ink-4">기한을 비우면 끝나는 날이 없습니다.</p>
            </div>
          )}
          {state.mode === "points" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bu-amt">포인트(사람마다)</Label>
              <Input id="bu-amt" className="h-9" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9-]/g, ""))} placeholder="예: 100 또는 -50" />
            </div>
          )}
          {state.mode !== "plan" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bu-reason">사유</Label>
              <Input id="bu-reason" className="h-9" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="2~200자. 감사 기록에 남습니다." />
            </div>
          )}
          <DialogFooter>
            <Button type="button" size="sm" variant="outline" onClick={() => { reset(); onClose(); }}>취소</Button>
            <Button type="submit" size="sm" variant={state.mode === "block" ? "destructive" : "default"} disabled={!valid || run.isPending}>{state.mode === "block" ? "차단" : "적용"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── 사용자 추가
function AddUserDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [plan, setPlan] = useState<ManualPlan>("free");
  const [invite, setInvite] = useState(true);
  const reset = () => { setEmail(""); setName(""); setPlan("free"); setInvite(true); };
  const create = useMutation({
    mutationFn: () => createAdminUser({ email: email.trim(), name: name.trim() || undefined, plan, send_invite: invite }),
    onSuccess: (u) => {
      toast.success(`${u.name} 님을 추가했습니다.`, { description: INVITE_KO[u.invite] || undefined });
      void qc.invalidateQueries({ queryKey: ["admin", "users"] });
      onOpenChange(false);
      reset();
      onCreated(u.id);
    },
    onError: (e) => toastError(e),
  });
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="bg-ground text-ink sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>사용자 추가</DialogTitle>
          <DialogDescription>비밀번호 없이 이메일 OTP 로 로그인하는 계정을 만듭니다.<MBr />회사 메일이면 임직원으로 분류됩니다.</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (valid) create.mutate(); }}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nu-email">이메일</Label>
            <Input id="nu-email" type="email" className="h-9" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" autoComplete="off" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nu-name">이름</Label>
            <Input id="nu-name" className="h-9" value={name} onChange={(e) => setName(e.target.value)} placeholder="비우면 이메일 앞부분" maxLength={60} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nu-plan">플랜</Label>
            <Select value={plan} onValueChange={(v) => setPlan(v as ManualPlan)}>
              <SelectTrigger id="nu-plan" size="sm" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{MANUAL_PLANS.map((p) => <SelectItem key={p} value={p}>{PLAN_KO[p]}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-sm text-ink-4">회사 메일로 추가하면 플랜과 무관하게 임직원(전체 무료)입니다.</p>
          </div>
          <label className="flex items-center gap-2 text-md">
            <Checkbox checked={invite} onCheckedChange={(v) => setInvite(v === true)} />초대 메일 보내기(로그인 주소와 방법 안내)
          </label>
          <DialogFooter>
            <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
            <Button type="submit" size="sm" disabled={!valid || create.isPending}><UserPlus aria-hidden />추가</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── 상세
function UserDetail({ id, row, canGrantAdmin }: { id: string; row: AdminUser | null; canGrantAdmin: boolean }) {
  const d = useQuery({ queryKey: ["admin", "user", id], queryFn: () => fetchAdminUser(id) });
  const u = d.data;
  return (
    <>
      <SheetHeader className="border-b border-line px-6 py-5">
        <SheetTitle className="flex flex-wrap items-center gap-2 text-xl font-bold text-ink">
          {u?.name ?? row?.name ?? "사용자"}
          {u?.status === "blocked" && <Tag tone="warn">차단</Tag>}
        </SheetTitle>
        <SheetDescription className="break-all text-ink-4">{u?.email ?? row?.email}</SheetDescription>
      </SheetHeader>
      {!u ? (
        <div className="flex flex-col gap-3 px-6 py-6">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
      ) : (
        <Tabs defaultValue="overview" className="px-6 pb-8">
          <TabsList className="w-full">
            <TabsTrigger value="overview">개요</TabsTrigger>
            <TabsTrigger value="points">포인트</TabsTrigger>
            <TabsTrigger value="credits">크레딧</TabsTrigger>
            <TabsTrigger value="keys">키</TabsTrigger>
            <TabsTrigger value="activity">활동</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-5 flex flex-col gap-7"><Overview u={u} me={row?.me ?? false} canGrantAdmin={canGrantAdmin} /></TabsContent>
          <TabsContent value="points" className="mt-5"><Adjust u={u} kind="points" /></TabsContent>
          <TabsContent value="credits" className="mt-5"><Adjust u={u} kind="credits" /></TabsContent>
          <TabsContent value="keys" className="mt-5"><Keys u={u} /></TabsContent>
          <TabsContent value="activity" className="mt-5"><Activity u={u} /></TabsContent>
        </Tabs>
      )}
    </>
  );
}

function useRefresh(id: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["admin", "user", id] });
    void qc.invalidateQueries({ queryKey: ["admin", "users"] });
  };
}

function Overview({ u, me, canGrantAdmin }: { u: AdminUserDetail; me: boolean; canGrantAdmin: boolean }) {
  const refresh = useRefresh(u.id);
  const change = useMutation({
    mutationFn: ({ role, grant }: { role: GrantRole; grant: boolean }) =>
      grant ? postJson<{ roles: string[] }>(`/admin/users/${u.id}/roles`, { role }) : apiFetch<{ roles: string[] }>(`/admin/users/${u.id}/roles/${role}`, { method: "DELETE" }),
    onSuccess: (_r, v) => { toast.success(`${ROLE_KO[v.role]} 역할을 ${v.grant ? "부여" : "회수"}했습니다.`); refresh(); },
    onError: (e) => toastError(e),
  });
  const planWord = u.plan_source === "manual" ? `관리자 지정${u.plan_until ? ` · ${fmtAt(u.plan_until).slice(0, 10)}까지` : " · 기한 없음"}` : u.plan_source === "pg" ? "결제 구독" : u.plan_source === "legacy" ? "이관" : null;
  return (
    <>
      <dl className="divide-y divide-line">
        <Field label="구분">{KIND_KO[u.kind]}</Field>
        <Field label="상태">{STATUS_KO[u.status]}{u.blocked_reason && <span className="ml-2 text-ink-4">· {u.blocked_reason}</span>}</Field>
        <Field label="플랜">{PLAN_KO[u.plan]}{planWord && <span className="ml-2 text-ink-4">· {planWord}</span>}</Field>
        <Field label="가입">{fmtAt(u.created_at)}</Field>
        <Field label="마지막 활동">{fmtAt(u.last_active)}</Field>
      </dl>
      {u.roles.includes("superadmin") && (
        <Copy className="rounded-xl bg-ground-3 p-4 text-md text-ink-3" text="이 계정은 슈퍼관리자입니다. 설정의 고정 계정이라 화면에서 바꿀 수 없습니다." />
      )}
      <PlanEditor u={u} />
      <section>
        <h3 className="text-sm font-semibold text-ink-4">운영 역할</h3>
        <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
          {GRANTABLE.map(({ role, desc }) => {
            const has = u.roles.includes(role);
            const locked = (role === "admin" && !canGrantAdmin) || (role === "admin" && has && me);
            const why = role === "admin" && !canGrantAdmin ? "superadmin 만 바꿀 수 있습니다." : role === "admin" && has && me ? "자기 자신의 관리자 역할은 회수할 수 없습니다." : null;
            return (
              <li key={role} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-md font-semibold">{ROLE_KO[role]}{has && <Tag tone="ink">보유</Tag>}</p>
                  <Copy className="mt-0.5 text-sm text-ink-4" text={why ?? desc} />
                </div>
                {has ? (
                  <Button size="sm" variant="outline" disabled={locked || change.isPending}
                    onClick={() => confirmToast(`${u.name} 님의 ${ROLE_KO[role]} 역할을 회수할까요? 바로 해당 메뉴를 쓸 수 없게 됩니다.`, () => change.mutate({ role, grant: false }), { action: "회수" })}>
                    <Minus aria-hidden />회수
                  </Button>
                ) : (
                  <Button size="sm" disabled={locked || change.isPending} onClick={() => change.mutate({ role, grant: true })}><Plus aria-hidden />부여</Button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      <BlockSection u={u} />
    </>
  );
}

function PlanEditor({ u }: { u: AdminUserDetail }) {
  const refresh = useRefresh(u.id);
  const [plan, setPlan] = useState<ManualPlan>(u.plan === "pro" || u.plan === "team" ? u.plan : "free");
  const [until, setUntil] = useState(u.plan_source === "manual" && u.plan_until ? u.plan_until.slice(0, 10) : "");
  const save = useMutation({
    mutationFn: () => setUserPlan(u.id, { plan, until: until || undefined }),
    onSuccess: (r) => {
      toast.success(`플랜을 ${PLAN_KO[plan]}(으)로 지정했습니다.`, { description: r.paid_subscription ? "결제 구독이 따로 있습니다. 결제 구독은 이 화면에서 바뀌지 않습니다." : undefined });
      refresh();
    },
    onError: (e) => toastError(e),
  });
  if (!u.can.plan) {
    return (
      <section>
        <h3 className="text-sm font-semibold text-ink-4">플랜 지정</h3>
        <Copy className="mt-2 rounded-xl bg-ground-3 p-4 text-md text-ink-3" text="임직원은 전체 무료라 플랜을 바꾸지 않습니다." />
      </section>
    );
  }
  return (
    <section>
      <h3 className="text-sm font-semibold text-ink-4">플랜 지정</h3>
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="pl-plan" className="text-sm text-ink-4">플랜</Label>
          <Select value={plan} onValueChange={(v) => setPlan(v as ManualPlan)}>
            <SelectTrigger id="pl-plan" size="sm" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{MANUAL_PLANS.map((p) => <SelectItem key={p} value={p}>{PLAN_KO[p]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="pl-until" className="text-sm text-ink-4">기한(비우면 무기한)</Label>
          <Input id="pl-until" type="date" className="h-9" value={until} onChange={(e) => setUntil(e.target.value)} disabled={plan === "free"} />
        </div>
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>지정</Button>
      </div>
    </section>
  );
}

function BlockSection({ u }: { u: AdminUserDetail }) {
  const refresh = useRefresh(u.id);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [reason, setReason] = useState("");
  const run = useMutation({
    mutationFn: (status: "active" | "blocked") => setUserStatus(u.id, { status, reason: status === "blocked" ? reason.trim() : undefined }),
    onSuccess: (_r, status) => { toast.success(status === "blocked" ? `${u.name} 님을 차단했습니다.` : `${u.name} 님의 차단을 풀었습니다.`); setStep(0); setReason(""); refresh(); },
    onError: (e) => toastError(e),
  });
  if (u.status === "blocked") {
    return (
      <section>
        <h3 className="text-sm font-semibold text-ink-4">이용 제한</h3>
        <div className="mt-2 flex items-center gap-3 rounded-xl border border-line px-4 py-3">
          <p className="min-w-0 flex-1 text-md">{fmtAt(u.blocked_at)}에 차단됨{u.blocked_reason && <span className="block text-sm text-ink-4">{u.blocked_reason}</span>}</p>
          <Button size="sm" variant="outline" disabled={run.isPending}
            onClick={() => confirmToast(`${u.name} 님의 차단을 풀까요? 다시 로그인할 수 있게 됩니다.`, () => run.mutate("active"), { action: "해제" })}>
            <RotateCcw aria-hidden />차단 해제
          </Button>
        </div>
      </section>
    );
  }
  return (
    <section>
      <h3 className="text-sm font-semibold text-ink-4">이용 제한</h3>
      <div className="mt-2 flex items-center gap-3 rounded-xl border border-line px-4 py-3">
        <Copy className="min-w-0 flex-1 text-sm text-ink-4" text={u.can.block ? "차단하면 열린 로그인이 모두 끊기고, API 키도 막힙니다. 다시 로그인할 수 없습니다." : "슈퍼관리자와 자기 자신은 차단할 수 없습니다."} />
        <Button size="sm" variant="outline" disabled={!u.can.block} onClick={() => setStep(1)}><Ban aria-hidden />차단</Button>
      </div>
      <AlertDialog open={step === 1} onOpenChange={(v) => { if (!v) setStep(0); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{u.name} 님을 차단할까요?</AlertDialogTitle>
            <AlertDialogDescription>차단 사유를 적어 주세요.<MBr />감사 기록에 남습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 약관 위반 — 공유 링크 무단 재배포" maxLength={200} rows={3} aria-label="차단 사유" />
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <Button size="sm" disabled={reason.trim().length < 2} onClick={() => setStep(2)}>다음</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={step === 2} onOpenChange={(v) => { if (!v) setStep(0); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>정말 차단합니다</AlertDialogTitle>
            <AlertDialogDescription>{`${u.email} 계정의 로그인과 API 키가 바로 막힙니다. 사유: ${reason.trim()}`}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); run.mutate("blocked"); }} disabled={run.isPending}>차단</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

// ── 포인트·크레딧 조정(같은 틀)
function Adjust({ u, kind }: { u: AdminUserDetail; kind: "points" | "credits" }) {
  const refresh = useRefresh(u.id);
  const unit = kind === "points" ? "P" : "크레딧";
  const word = kind === "points" ? "포인트" : "크레딧";
  const bal = kind === "points" ? u.points.balance : u.credits.balance;
  const ledger = kind === "points" ? u.points.ledger : u.credits.ledger;
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const n = /^-?\d+$/.test(amount.trim()) ? Number(amount.trim()) : 0;
  const bad = n === 0 || bal + n < 0 || reason.trim().length < 2;
  const run = useMutation({
    mutationFn: () => (kind === "points" ? adjustUserPoints : adjustUserCredits)(u.id, { amount: n, reason: reason.trim() }),
    onSuccess: (r) => { toast.success(`${word} ${r.delta > 0 ? "+" : ""}${r.delta.toLocaleString()} — 잔액 ${r.balance.toLocaleString()}${unit}`); setAmount(""); setReason(""); refresh(); },
    onError: (e) => toastError(e),
  });
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between rounded-xl bg-ground-3 px-4 py-3">
        <span className="text-sm text-ink-4">{word} 잔액</span>
        <span className="text-xl font-bold tabular-nums">{bal.toLocaleString()}<span className="ml-1 text-sm font-normal text-ink-4">{unit}</span></span>
      </div>
      <section>
        <h3 className="text-sm font-semibold text-ink-4">{word} 수동 조정</h3>
        <form className="mt-2 grid grid-cols-[112px_minmax(0,1fr)_auto] gap-2" onSubmit={(e) => { e.preventDefault(); if (!bad) setConfirm(true); }}>
          <Input className="h-9 text-right tabular-nums" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="+50 / -30" aria-label={`${word} 금액(양수 적립, 음수 회수)`} />
          <Input className="h-9" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="사유(필수)" maxLength={200} aria-label="사유" />
          <Button type="submit" size="sm" disabled={bad || run.isPending}>조정</Button>
        </form>
        {n !== 0 && bal + n < 0 && <p className="mt-1.5 text-sm text-ink-3">{`잔액(${bal.toLocaleString()}${unit})보다 많이 회수할 수 없습니다.`}</p>}
      </section>
      <section>
        <h3 className="text-sm font-semibold text-ink-4">최근 내역</h3>
        <LedgerTable rows={ledger} kind={kind} />
      </section>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`${word} ${n > 0 ? "적립" : "회수"}할까요?`}</AlertDialogTitle>
            <AlertDialogDescription>{`${u.name} 님 · ${n > 0 ? "+" : ""}${n.toLocaleString()}${unit} → 잔액 ${(bal + n).toLocaleString()}${unit}. 사유: ${reason.trim()}`}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={() => run.mutate()}>{n > 0 ? "적립" : "회수"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LedgerTable({ rows, kind }: { rows: LedgerRow[]; kind: "points" | "credits" }) {
  const lab = (r: LedgerRow) => (kind === "points" ? (POINT_REASON_KO[r.reason ?? ""] ?? r.reason) : (CREDIT_KIND_KO[r.kind ?? ""] ?? r.kind));
  const ls = useSort(rows, { at: (r) => r.created_at, delta: (r) => r.delta, label: (r) => lab(r) });
  if (rows.length === 0) return <p className="mt-2 rounded-xl border border-line py-8 text-center text-sm text-ink-4">내역이 없습니다.</p>;
  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-line">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <SortHead s={ls} k="at" className="w-[118px]">일시</SortHead>
            <SortHead s={ls} k="delta" className="w-[76px]">변동</SortHead>
            <SortHead s={ls} k="label">내용</SortHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ls.rows.map((r) => {
            const label = lab(r);
            return (
              <TableRow key={r.id}>
                <TableCell className="text-center tabular-nums text-ink-3"><AtText at={r.created_at} /></TableCell>
                <TableCell className={`text-right tabular-nums font-semibold ${r.delta < 0 ? "text-ink-3" : ""}`}>{r.delta > 0 ? "+" : ""}{r.delta.toLocaleString()}</TableCell>
                <TableCell className="text-left"><span className="block truncate">{label}{r.memo && <span className="text-ink-4"> · {r.memo}</span>}</span></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ── 키
function Keys({ u }: { u: AdminUserDetail }) {
  const refresh = useRefresh(u.id);
  const revoke = useMutation({
    mutationFn: (keyId: string) => revokeUserKey(keyId),
    onSuccess: () => { toast.success("키를 폐기했습니다."); refresh(); },
    onError: (e) => toastError(e),
  });
  if (u.keys.length === 0) return <p className="rounded-xl border border-line py-10 text-center text-sm text-ink-4">발급한 API·MCP 키가 없습니다.</p>;
  return (
    <ul className="divide-y divide-line rounded-xl border border-line">
      {u.keys.map((k) => (
        <li key={k.id} className="flex items-center gap-3 px-4 py-3">
          <KeyRound className="size-4 shrink-0 text-ink-4" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 truncate text-md font-semibold">{k.name}{k.revoked_at && <Tag tone="soft">폐기됨</Tag>}</p>
            <p className="truncate text-sm text-ink-4">{`${k.masked} · 범위 ${k.scopes.join(", ")} · 마지막 사용 ${fmtAt(k.last_used_at)}`}</p>
          </div>
          {!k.revoked_at && (
            <Button size="sm" variant="outline" disabled={revoke.isPending}
              onClick={() => confirmToast(`'${k.name}' 키를 폐기할까요? 이 키를 쓰는 도구가 바로 끊깁니다.`, () => revoke.mutate(k.id), { action: "폐기" })}>
              폐기
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

// ── 활동
function Activity({ u }: { u: AdminUserDetail }) {
  const cells: Array<[string, number]> = [["에셋 사용", u.activity.asset_uses], ["장표 작업", u.activity.deck_jobs], ["시안", u.activity.mockups], ["글", u.activity.posts]];
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cells.map(([l, v]) => (
          <div key={l} className="rounded-xl border border-line px-3 py-3 text-center">
            <p className="text-sm text-ink-4">{l}</p>
            <p className="mt-1 text-lg font-bold tabular-nums">{v.toLocaleString()}</p>
          </div>
        ))}
      </div>
      <section>
        <h3 className="text-sm font-semibold text-ink-4">로그인 수단</h3>
        <dl className="mt-1 divide-y divide-line">
          {u.logins.length === 0 && <p className="py-2 text-sm text-ink-4">로그인한 적이 없습니다.</p>}
          {u.logins.map((l) => <Field key={l.provider} label={l.provider}>{fmtAt(l.last_login_at)}</Field>)}
        </dl>
      </section>
      <section>
        <h3 className="text-sm font-semibold text-ink-4">관리 기록(최근 10)</h3>
        {u.audit.length === 0 ? <p className="mt-2 text-sm text-ink-4">기록이 없습니다.</p> : (
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
            {u.audit.map((x) => (
              <li key={x.id} className="px-4 py-2.5">
                <p className="flex items-center justify-between gap-3 text-md"><span className="font-semibold">{AUDIT_KO[x.action] ?? x.action}</span><span className="shrink-0 text-sm tabular-nums text-ink-4">{fmtAt(x.created_at)}</span></p>
                <p className="truncate text-sm text-ink-4">{`${x.actor ?? "시스템"}${auditNote(x.after) ? ` · ${auditNote(x.after)}` : ""}`}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function auditNote(after: Record<string, unknown> | null): string {
  if (!after) return "";
  const parts: string[] = [];
  if (typeof after.delta === "number") parts.push(`${after.delta > 0 ? "+" : ""}${after.delta}`);
  if (typeof after.set === "string") parts.push(String(after.set));
  if (typeof after.reason === "string") parts.push(after.reason);
  return parts.join(" · ");
}

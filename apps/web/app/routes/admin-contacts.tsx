// 관리자 · 문의 — core_contacts 목록(상태·검색) + 오른쪽 Sheet 상세 + 답변 메모·상태 변경·답변 메일.
// 출처: homebox-handoff apps/web/app/routes/admin-requests.tsx(요청 처리 표 톤) — 처리 방식은 Sheet 상세로.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, CheckCheck, Mail, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AdminTitle, BulkBar, Field, Pager, SearchBox, SelectAllCell, SelectCell, SortHead, StatusToggle, useQueryState, useSelection, useSort } from "@/components/admin/admin-ui";
import { AtText } from "@/components/admin/at-text";
import { ChoiceButton } from "@/components/hb/choice-button";
import { Copy } from "@/components/hb/copy";
import { toastError } from "@/components/hb/confirm";
import { Tag } from "@/components/hb/tag";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { CONTACT_STATUS_KO, contactAiTags, fetchContacts, fmtAt, TOPIC_KO, type AdminContact, type ContactStatus } from "@/lib/admin";
import { bulkContacts, bulkMessage } from "@/lib/admin-bulk";
import { apiFetch, postJson } from "@/lib/api";
import type { Route } from "./+types/admin-contacts";

export const meta: Route.MetaFunction = () => [{ title: "문의 — powerPlus 관리자" }];

const TONE: Record<ContactStatus, "warn" | "ok" | "soft"> = { open: "warn", answered: "ok", closed: "soft" };

export default function AdminContacts() {
  const { get, set, page } = useQueryState();
  const status = get("status");
  const q = get("q");
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useQuery({ queryKey: ["admin", "contacts", status, q, page], queryFn: () => fetchContacts({ status, q, page }) });
  const items = list.data?.data ?? [];
  const counts = (list.data?.meta?.counts ?? {}) as Partial<Record<ContactStatus, number>>;
  const current = items.find((c) => c.id === openId) ?? null;
  const sel = useSelection(items.map((c) => c.id), [status, q, page]);
  const st = useSort(items, { at: (c) => c.created_at, name: (c) => c.name, topic: (c) => TOPIC_KO[c.topic] ?? c.topic, msg: (c) => c.message, status: (c) => CONTACT_STATUS_KO[c.status] });
  const qc = useQueryClient();
  const bulk = useMutation({
    mutationFn: bulkContacts,
    onSuccess: (r) => {
      toast.success(bulkMessage(r, r.action === "delete" ? "지웠습니다" : "바꿨습니다"));
      sel.clear();
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toastError(e),
  });

  return (
    <div>
      <AdminTitle title="문의" desc="문의하기 페이지로 들어온 글입니다. 답변을 적고 메일로 보내면 상태가 '답변함'으로 바뀝니다." />
      <div className="mt-7 flex flex-wrap items-center gap-2">
        <ChoiceButton label="상태" value={status} onChange={(v) => set({ status: v })} allLabel="전체"
          options={(Object.keys(CONTACT_STATUS_KO) as ContactStatus[]).map((s) => ({ id: s, label: CONTACT_STATUS_KO[s], count: counts[s] ?? 0 }))} />
        <SearchBox value={q} onSearch={(v) => set({ q: v })} placeholder="이름·이메일·내용 검색" />
        <span className="ml-auto text-sm tabular-nums text-ink-4">{(list.data?.total ?? 0).toLocaleString()}건</span>
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-line">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <SelectAllCell sel={sel} />
              <SortHead s={st} k="at" className="w-[96px] md:w-[140px]">접수</SortHead>
              <SortHead s={st} k="name" className="w-auto md:w-[200px]">보낸 사람</SortHead>
              <SortHead s={st} k="topic" className="hidden w-[90px] md:table-cell">분류</SortHead>
              <SortHead s={st} k="msg" className="hidden md:table-cell">내용</SortHead>
              <SortHead s={st} k="status" className="w-[72px] md:w-[88px]">상태</SortHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {st.rows.map((c) => (
              <TableRow key={c.id} onClick={() => setOpenId(c.id)} className="cursor-pointer" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setOpenId(c.id); }} aria-label={`${c.name} 문의 열기`}>
                <SelectCell sel={sel} id={c.id} label={`${c.name} 문의`} />
                <TableCell className="text-center tabular-nums text-ink-3"><AtText at={c.created_at} /></TableCell>
                <TableCell className="text-left"><span className="block truncate font-semibold">{c.name}</span><span className="block truncate text-xs text-ink-4">{c.email}</span></TableCell>
                <TableCell className="hidden text-center md:table-cell">{TOPIC_KO[c.topic] ?? c.topic}{contactAiTags(c).length > 0 && <span className="mt-0.5 block text-xs font-bold text-point-ink">{contactAiTags(c).join(" · ")}</span>}</TableCell>
                <TableCell className="hidden truncate text-left text-ink-3 md:table-cell">{c.message}</TableCell>
                <TableCell className="text-center"><Tag tone={TONE[c.status]}>{CONTACT_STATUS_KO[c.status]}</Tag></TableCell>
              </TableRow>
            ))}
            {list.data && items.length === 0 && <TableRow><TableCell colSpan={6} className="py-12 text-center text-ink-4">해당하는 문의가 없습니다.</TableCell></TableRow>}
            {list.isLoading && <TableRow><TableCell colSpan={6} className="py-12 text-center text-ink-4">불러오는 중</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <BulkBar sel={sel} actions={[
        { label: "답변함으로", icon: <CheckCheck aria-hidden />, onRun: (ids) => bulk.mutate({ action: "status", ids, status: "answered" }), disabled: bulk.isPending },
        { label: "닫음으로", icon: <Archive aria-hidden />, onRun: (ids) => bulk.mutate({ action: "status", ids, status: "closed" }), disabled: bulk.isPending },
        { label: "삭제", icon: <Trash2 aria-hidden />, danger: true, disabled: bulk.isPending, confirm: "고른 문의 {n}개를 지웁니다. 되돌릴 수 없습니다.", onRun: (ids) => bulk.mutate({ action: "delete", ids }) },
      ]} />
      <Pager page={page} total={list.data?.total ?? 0} limit={list.data?.limit ?? 30} onPage={(p) => set({ page: String(p) })} />

      <Sheet open={!!current} onOpenChange={(v) => { if (!v) setOpenId(null); }}>
        <SheetContent className="w-full overflow-y-auto bg-ground text-ink sm:max-w-[520px]">
          {current && <ContactDetail key={current.id + current.status} c={current} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

type ImageCap = { cap: number | null; spent: number; personal: boolean; blocked: boolean; requested: boolean };

/** 그림 한도 증액 요청 — 그 사람의 이달 그림 사용·상한을 보고 바로 올린다. 올리면 요청은 답변 완료로 닫히고 본인에게 알림(관리자만) */
function ImageCapBox({ email }: { email: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "image-cap", email], queryFn: () => apiFetch<ImageCap>(`/deck/ai/image-cap/user?email=${encodeURIComponent(email)}`), retry: false });
  const [cap, setCap] = useState("");
  const set = useMutation({
    mutationFn: (v: number | null) => postJson<ImageCap>("/deck/ai/image-cap/user", { email, cap: v }, "PUT"),
    onSuccess: (r) => {
      toast.success(r.cap == null ? "그림 상한을 없앴습니다." : `그림 월 상한을 $${r.cap}(으)로 바꿨습니다.`);
      setCap("");
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toastError(e),
  });
  if (q.isError) return null;   // 관리자가 아니면(문의 담당) 보이지 않는다
  const s = q.data;
  const n = Number(cap);
  const bad = cap.trim() === "" || !isFinite(n) || n < 0;
  return (
    <section className="rounded-xl border border-line p-4">
      <h3 className="text-sm font-semibold text-ink-4">그림 한도 늘리기</h3>
      <p className="mt-2 text-md">
        {s ? <>이달 그림 사용 <b>${s.spent.toFixed(2)}</b> / 상한 <b>{s.cap == null ? "없음" : `$${s.cap.toFixed(2)}`}</b>{s.personal && " (개인 값)"}{s.blocked && <span className="ml-1 font-bold text-[var(--color-warn)]">· 막힘</span>}</> : "불러오는 중…"}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-ink-4">새 월 상한 $
          <input className="h-9 w-[110px] rounded-md border border-line px-2 text-right font-mono" inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} placeholder={s?.cap != null ? String(Math.max(s.cap * 2, 40)) : "40"} aria-label="새 그림 월 상한 (USD)" />
        </label>
        <Button onClick={() => set.mutate(n)} disabled={set.isPending || bad}><Save aria-hidden />적용</Button>
        {s?.personal && <Button variant="outline" onClick={() => set.mutate(null)} disabled={set.isPending}>전체 값으로 되돌리기</Button>}
      </div>
      <p className="mt-2 text-sm text-ink-4">적용하면 이 요청은 답변 완료로 닫히고 요청한 사람에게 알림이 갑니다. 0 은 상한 없음입니다.</p>
    </section>
  );
}

function ContactDetail({ c }: { c: AdminContact }) {
  const qc = useQueryClient();
  const [reply, setReply] = useState(c.reply ?? "");
  const [status, setStatus] = useState<ContactStatus>(c.status);
  const save = useMutation({
    mutationFn: (sendMail: boolean) => postJson<AdminContact>(`/admin/contacts/${c.id}`, { status, reply, send_mail: sendMail }, "PATCH"),
    onSuccess: (r, sendMail) => {
      if (sendMail) {
        if (r.mail_sent) toast.success("답변 메일을 보냈습니다.");
        else toast.warning(<Copy as="span" text="상태는 저장했지만 메일은 보내지 못했습니다. 메일 설정을 확인해 주세요." />);
      } else toast.success("저장했습니다.");
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toastError(e),
  });
  return (
    <>
      <SheetHeader className="border-b border-line px-6 py-5">
        <SheetTitle className="text-xl font-bold text-ink">{c.name}</SheetTitle>
        <SheetDescription className="text-ink-4">{fmtAt(c.created_at)} 접수 · {TOPIC_KO[c.topic] ?? c.topic}{contactAiTags(c).length > 0 && " · " + contactAiTags(c).join(" · ")}</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-6 px-6 pb-8">
        <dl className="divide-y divide-line">
          <Field label="이메일"><a href={`mailto:${c.email}`} className="underline underline-offset-4">{c.email}</a></Field>
          <Field label="회원">{c.member ? "회원" : "비회원"}</Field>
          {c.org && <Field label="소속">{c.org}</Field>}
          {c.seats != null && <Field label="좌석">{c.seats.toLocaleString()}석</Field>}
          {c.module && <Field label="모듈">{c.module}</Field>}
          {c.handled_at && <Field label="처리">{c.handled_by ?? "—"} · {fmtAt(c.handled_at)}</Field>}
          {c.reply_sent_at && <Field label="답변 메일">{fmtAt(c.reply_sent_at)} 보냄</Field>}
        </dl>
        <section>
          <h3 className="text-sm font-semibold text-ink-4">문의 내용</h3>
          <p className="mt-2 whitespace-pre-wrap rounded-xl bg-ground-3 p-4 text-md leading-relaxed">{c.message}</p>
        </section>
        {c.topic === "limit" && <ImageCapBox email={c.email} />}
        <section>
          <label htmlFor="reply" className="text-sm font-semibold text-ink-4">답변</label>
          <Textarea id="reply" value={reply} onChange={(e) => setReply(e.target.value)} rows={7} maxLength={5000} placeholder="보낸 사람에게 보낼 답변이나 처리 메모" className="mt-2 text-md" />
        </section>
        <div className="flex flex-wrap items-center gap-2">
          <StatusToggle value={status} onChange={setStatus} labels={CONTACT_STATUS_KO} />
          <Button variant="outline" onClick={() => save.mutate(false)} disabled={save.isPending}><Save aria-hidden />저장</Button>
          <Button onClick={() => save.mutate(true)} disabled={save.isPending || reply.trim() === ""}><Mail aria-hidden />답변 메일 보내기</Button>
        </div>
      </div>
    </>
  );
}

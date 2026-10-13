// 관리자 · 삭제요청 — core_removal_requests 목록(상태·검색·48시간 기한) + Sheet 상세 + 처리(결과 메모·상태·요청자 메일).
// 처리는 상태만 바꾼다 — 대상 콘텐츠 경로가 모듈마다 달라 실제 삭제는 대상 화면에서 한다(대상 주소 링크 제공).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, CircleSlash, ExternalLink, Save, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AdminTitle, BulkBar, Field, Pager, SearchBox, SelectAllCell, SelectCell, SortHead, StatusToggle, useQueryState, useSelection, useSort } from "@/components/admin/admin-ui";
import { ChoiceButton } from "@/components/hb/choice-button";
import { confirmToast, toastError } from "@/components/hb/confirm";
import { Copy, MBr } from "@/components/hb/copy";
import { Tag } from "@/components/hb/tag";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { dueLeft, fetchRemovals, fmtAt, REASON_KO, REMOVAL_STATUS_KO, type AdminRemoval, type RemovalStatus } from "@/lib/admin";
import { bulkMessage, bulkRemovals } from "@/lib/admin-bulk";
import { postJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Route } from "./+types/admin-removals";

export const meta: Route.MetaFunction = () => [{ title: "삭제요청 — powerPlus 관리자" }];

const TONE: Record<RemovalStatus, "warn" | "ok" | "soft" | "line"> = { received: "warn", reviewing: "line", done: "ok", rejected: "soft" };
const pending = (s: RemovalStatus) => s === "received" || s === "reviewing";

export default function AdminRemovals() {
  const { get, set, page } = useQueryState();
  const status = get("status");
  const q = get("q");
  const [openNo, setOpenNo] = useState<string | null>(null);
  const list = useQuery({ queryKey: ["admin", "removals", status, q, page], queryFn: () => fetchRemovals({ status, q, page }) });
  const items = list.data?.data ?? [];
  const counts = (list.data?.meta?.counts ?? {}) as Partial<Record<RemovalStatus, number>>;
  const current = items.find((x) => x.no === openNo) ?? null;
  const pendingCount = (counts.received ?? 0) + (counts.reviewing ?? 0);
  const sel = useSelection(items.map((x) => x.no), [status, q, page]);
  const st = useSort(items, { no: (x) => x.no, target: (x) => x.target_url ?? `${x.content_type}:${x.content_id}`, reason: (x) => REASON_KO[x.reason_kind], due: (x) => (pending(x.status) ? x.due_at : x.handled_at), status: (x) => REMOVAL_STATUS_KO[x.status] });
  const qc = useQueryClient();
  const [closing, setClosing] = useState<{ ids: string[]; status: "done" | "rejected" } | null>(null);
  const [resolution, setResolution] = useState("");
  const bulk = useMutation({
    mutationFn: bulkRemovals,
    onSuccess: (r) => {
      toast.success(bulkMessage(r, "바꿨습니다"));
      sel.clear();
      setClosing(null);
      setResolution("");
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toastError(e),
  });

  return (
    <div>
      <AdminTitle title="삭제요청" desc="권리자가 보낸 삭제요청입니다. 접수 뒤 48시간 안에 처리하고 결과를 요청자에게 알립니다." />
      <div className="mt-7 flex flex-wrap items-center gap-2">
        <ChoiceButton label="상태" value={status} onChange={(v) => set({ status: v })} allLabel="전체"
          options={[{ id: "pending", label: "처리 대기", count: pendingCount }, ...(Object.keys(REMOVAL_STATUS_KO) as RemovalStatus[]).map((s) => ({ id: s, label: REMOVAL_STATUS_KO[s], count: counts[s] ?? 0 }))]} />
        <SearchBox value={q} onSearch={(v) => set({ q: v })} placeholder="접수번호·이메일·대상 주소 검색" />
        <span className="ml-auto text-sm tabular-nums text-ink-4">{(list.data?.total ?? 0).toLocaleString()}건</span>
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-line">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <SelectAllCell sel={sel} />
              <SortHead s={st} k="no" className="w-[132px] max-sm:w-auto">접수번호</SortHead>
              <SortHead s={st} k="target" className="hidden md:table-cell">대상</SortHead>
              <SortHead s={st} k="reason" className="hidden w-[120px] md:table-cell">사유</SortHead>
              <SortHead s={st} k="due" className="w-[120px] max-sm:w-[96px]">기한</SortHead>
              <SortHead s={st} k="status" className="w-[92px] max-sm:w-[76px]">상태</SortHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {st.rows.map((x) => {
              const d = dueLeft(x.due_at);
              return (
                <TableRow key={x.no} onClick={() => setOpenNo(x.no)} className="cursor-pointer" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setOpenNo(x.no); }} aria-label={`${x.no} 삭제요청 열기`}>
                  <SelectCell sel={sel} id={x.no} label={`${x.no} 삭제요청`} />
                  <TableCell className="text-center tabular-nums">{x.no}</TableCell>
                  <TableCell className="hidden truncate text-left text-ink-3 md:table-cell" title={x.target_url ?? ""}>{x.target_url ?? `${x.content_type}:${x.content_id}`}</TableCell>
                  <TableCell className="hidden text-center md:table-cell">{REASON_KO[x.reason_kind]}</TableCell>
                  <TableCell className={cn("text-center tabular-nums", pending(x.status) ? (d.late ? "font-semibold text-warn" : "text-ink-2") : "text-ink-4")}>
                    {pending(x.status) ? d.text : fmtAt(x.handled_at).slice(0, 10)}
                  </TableCell>
                  <TableCell className="text-center"><Tag tone={TONE[x.status]}>{REMOVAL_STATUS_KO[x.status]}</Tag></TableCell>
                </TableRow>
              );
            })}
            {list.data && items.length === 0 && <TableRow><TableCell colSpan={6} className="py-12 text-center text-ink-4">해당하는 삭제요청이 없습니다.</TableCell></TableRow>}
            {list.isLoading && <TableRow><TableCell colSpan={6} className="py-12 text-center text-ink-4">불러오는 중</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <BulkBar sel={sel} actions={[
        { label: "검토 중으로", icon: <Search aria-hidden />, disabled: bulk.isPending, onRun: (ids) => bulk.mutate({ ids, status: "reviewing" }) },
        { label: "삭제 처리로", icon: <CheckCheck aria-hidden />, disabled: bulk.isPending, onRun: (ids) => setClosing({ ids, status: "done" }) },
        { label: "반려로", icon: <CircleSlash aria-hidden />, disabled: bulk.isPending, onRun: (ids) => setClosing({ ids, status: "rejected" }) },
      ]} />
      <Dialog open={!!closing} onOpenChange={(v) => { if (!v) setClosing(null); }}>
        <DialogContent className="bg-ground text-ink sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>{closing ? `${closing.ids.length.toLocaleString()}개를 ${REMOVAL_STATUS_KO[closing.status]}(으)로 마감` : ""}</DialogTitle>
            <DialogDescription>처리 결과는 고른 요청 모두에 같은 문구로 남습니다.<MBr />요청자 메일은 보내지 않습니다.</DialogDescription>
          </DialogHeader>
          <Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} rows={5} maxLength={3000} placeholder="처리 결과(예: 해당 화면을 비공개로 바꿨습니다.)" className="text-md" aria-label="처리 결과" />
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setClosing(null)}>취소</Button>
            <Button size="sm" disabled={bulk.isPending || resolution.trim() === ""} onClick={() => closing && bulk.mutate({ ids: closing.ids, status: closing.status, resolution: resolution.trim() })}>마감</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Pager page={page} total={list.data?.total ?? 0} limit={list.data?.limit ?? 30} onPage={(p) => set({ page: String(p) })} />

      <Sheet open={!!current} onOpenChange={(v) => { if (!v) setOpenNo(null); }}>
        <SheetContent className="w-full overflow-y-auto bg-ground text-ink sm:max-w-[520px]">
          {current && <RemovalDetail key={current.no} x={current} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function RemovalDetail({ x }: { x: AdminRemoval }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<RemovalStatus>(x.status);
  const [resolution, setResolution] = useState(x.resolution ?? "");
  const [notify, setNotify] = useState(true);
  const d = dueLeft(x.due_at);
  // 접수 검사는 경로만 본다 — javascript: 같은 주소가 링크가 되지 않게 http(s)·사이트 안 경로만 연다
  const href = x.target_url && /^(https?:\/\/|\/(?!\/))/i.test(x.target_url) ? x.target_url : null;
  const save = useMutation({
    mutationFn: () => postJson<AdminRemoval>(`/admin/removals/${x.no}`, { status, resolution, notify }, "PATCH"),
    onSuccess: (r) => {
      if (r.mail_sent === false) toast.warning(<Copy as="span" text="상태는 저장했지만 요청자 메일은 보내지 못했습니다. 메일 설정을 확인해 주세요." />);
      else toast.success(r.mail_sent ? "저장하고 요청자에게 알렸습니다." : "저장했습니다.");
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toastError(e),
  });
  const submit = () => {
    if (status === "done" || status === "rejected") {
      confirmToast(`${x.no} 을(를) '${REMOVAL_STATUS_KO[status]}'(으)로 마감할까요? 처리 시각이 기록되고 요청자가 결과를 보게 됩니다.`, () => save.mutate(), { action: "마감" });
    } else save.mutate();
  };
  return (
    <>
      <SheetHeader className="border-b border-line px-6 py-5">
        <SheetTitle className="text-xl font-bold tabular-nums text-ink">{x.no}</SheetTitle>
        <SheetDescription className={cn(pending(x.status) && d.late ? "font-semibold text-warn" : "text-ink-4")}>
          {fmtAt(x.created_at)} 접수 · {pending(x.status) ? `기한 ${fmtAt(x.due_at)} (${d.text})` : `처리 ${fmtAt(x.handled_at)}`}
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-6 px-6 pb-8">
        <dl className="divide-y divide-line">
          <Field label="대상">
            {href ? <a href={href} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 break-all underline underline-offset-4">{x.target_url}<ExternalLink className="size-3.5 shrink-0" aria-hidden /></a> : "—"}
            <span className="block text-xs text-ink-4">{x.content_type} · {x.content_id || "—"}</span>
          </Field>
          <Field label="사유">{REASON_KO[x.reason_kind]}</Field>
          <Field label="요청자">{x.claimant_name ?? "—"}{x.claimant_org && <span className="block text-xs text-ink-4">{x.claimant_org}</span>}</Field>
          <Field label="이메일"><a href={`mailto:${x.email}`} className="underline underline-offset-4">{x.email}</a></Field>
          {x.phone && <Field label="전화">{x.phone}</Field>}
          {x.handled_by && <Field label="처리한 사람">{x.handled_by}</Field>}
        </dl>
        <section>
          <h3 className="text-sm font-semibold text-ink-4">요청 내용</h3>
          <p className="mt-2 whitespace-pre-wrap rounded-xl bg-ground-3 p-4 text-md leading-relaxed">{x.reason}</p>
        </section>
        <section>
          <label htmlFor="resolution" className="text-sm font-semibold text-ink-4">처리 결과</label>
          <Textarea id="resolution" value={resolution} onChange={(e) => setResolution(e.target.value)} rows={5} maxLength={3000} placeholder="삭제 처리 내용이나 반려 이유. 요청자가 조회 화면에서 봅니다." className="mt-2 text-md" />
        </section>
        <StatusToggle value={status} onChange={setStatus} labels={REMOVAL_STATUS_KO} />
        <label className="flex items-center gap-2 text-md">
          <Checkbox checked={notify} onCheckedChange={(v) => setNotify(v === true)} />
          상태가 바뀌면 요청자에게 메일로 알림
        </label>
        <Button onClick={submit} disabled={save.isPending} className="w-fit"><Save aria-hidden />저장</Button>
      </div>
    </>
  );
}

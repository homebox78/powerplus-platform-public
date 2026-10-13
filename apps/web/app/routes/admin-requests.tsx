// 관리자 · 자료 요청 — asset_requests(애드인·웹 '없는 자료 요청하기') 목록 + 오른쪽 Sheet 상세(상태 new/done/rejected·답변·등록한 에셋 연결).
// 옛 파워플러스 관리자의 '콘텐츠 요청' 기능 목록만 참고, 화면은 문의(admin-contacts) 와 같은 표+Sheet 문법으로 새로 그렸다. 상태가 바뀌면 요청한 사람에게 알림.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, CircleSlash, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AdminTitle, BulkBar, Field, Pager, SearchBox, SelectAllCell, SelectCell, SortHead, StatusToggle, useQueryState, useSelection, useSort } from "@/components/admin/admin-ui";
import { AtText } from "@/components/admin/at-text";
import { ChoiceButton } from "@/components/hb/choice-button";
import { toastError } from "@/components/hb/confirm";
import { Copy } from "@/components/hb/copy";
import { Tag } from "@/components/hb/tag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { fetchAdminRequests, fmtAt, REQUEST_STATUS_KO, type AdminAssetRequest, type RequestStatus } from "@/lib/admin";
import { bulkMessage, bulkRequests } from "@/lib/admin-bulk";
import { postJson } from "@/lib/api";
import type { Route } from "./+types/admin-requests";

export const meta: Route.MetaFunction = () => [{ title: "자료 요청 — powerPlus 관리자" }];

const TONE: Record<RequestStatus, "warn" | "ok" | "soft"> = { new: "warn", done: "ok", rejected: "soft" };

export default function AdminRequests() {
  const { get, set, page } = useQueryState();
  const status = get("status");
  const q = get("q");
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useQuery({ queryKey: ["admin", "requests", status, q, page], queryFn: () => fetchAdminRequests({ status, q, page }) });
  const items = list.data?.data ?? [];
  const counts = (list.data?.meta?.counts ?? {}) as Partial<Record<RequestStatus, number>>;
  const current = items.find((c) => c.id === openId) ?? null;
  const sel = useSelection(items.map((c) => c.id), [status, q, page]);
  const st = useSort(items, { at: (c) => c.created_at, title: (c) => c.title, kind: (c) => c.kind_ko, who: (c) => c.requester, status: (c) => REQUEST_STATUS_KO[c.status] });
  const qc = useQueryClient();
  const bulk = useMutation({
    mutationFn: bulkRequests,
    onSuccess: (r) => {
      toast.success(bulkMessage(r, r.action === "delete" ? "지웠습니다" : "바꿨습니다"));
      sel.clear();
      void qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toastError(e),
  });

  return (
    <div>
      <AdminTitle title="자료 요청" desc="사용자가 찾다가 없어서 요청한 자료입니다. 등록하면 처리 완료로 바꾸고 에셋을 연결해 두세요." />
      <div className="mt-7 flex flex-wrap items-center gap-2">
        <ChoiceButton size="sm" label="상태" value={status} onChange={(v) => set({ status: v })} allLabel="전체"
          options={(Object.keys(REQUEST_STATUS_KO) as RequestStatus[]).map((s) => ({ id: s, label: REQUEST_STATUS_KO[s], count: counts[s] ?? 0 }))} />
        <SearchBox value={q} onSearch={(v) => set({ q: v })} placeholder="제목·내용·요청자 검색" />
        <span className="ml-auto text-sm tabular-nums text-ink-4">{(list.data?.total ?? 0).toLocaleString()}건</span>
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-line">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <SelectAllCell sel={sel} />
              <SortHead s={st} k="at" className="w-[140px] max-sm:w-[96px]">접수</SortHead>
              <SortHead s={st} k="title">제목</SortHead>
              <SortHead s={st} k="kind" className="hidden w-[90px] md:table-cell">종류</SortHead>
              <SortHead s={st} k="who" className="hidden w-[180px] md:table-cell">요청자</SortHead>
              <SortHead s={st} k="status" className="w-[96px] max-sm:w-[76px]">상태</SortHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {st.rows.map((c) => (
              <TableRow key={c.id} onClick={() => setOpenId(c.id)} className="cursor-pointer" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setOpenId(c.id); }} aria-label={`${c.title} 요청 열기`}>
                <SelectCell sel={sel} id={c.id} label={`${c.title} 요청`} />
                <TableCell className="text-center tabular-nums text-ink-3"><AtText at={c.created_at} /></TableCell>
                <TableCell className="text-left"><span className="block truncate font-semibold">{c.title}</span>{c.detail && <span className="block truncate text-xs text-ink-4">{c.detail}</span>}</TableCell>
                <TableCell className="hidden text-center md:table-cell">{c.kind_ko ?? "—"}</TableCell>
                <TableCell className="hidden text-left md:table-cell"><span className="block truncate">{c.requester ?? "—"}</span><span className="block truncate text-xs text-ink-4">{c.requester_email ?? ""}</span></TableCell>
                <TableCell className="text-center"><Tag tone={TONE[c.status]}>{REQUEST_STATUS_KO[c.status]}</Tag></TableCell>
              </TableRow>
            ))}
            {list.data && items.length === 0 && <TableRow><TableCell colSpan={6} className="py-12 text-center text-ink-4">해당하는 요청이 없습니다.</TableCell></TableRow>}
            {list.isLoading && <TableRow><TableCell colSpan={6} className="py-12 text-center text-ink-4">불러오는 중</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <BulkBar sel={sel} actions={[
        { label: "처리 완료로", icon: <CheckCheck aria-hidden />, disabled: bulk.isPending, confirm: "고른 요청 {n}개를 처리 완료로 바꿉니다. 요청한 사람에게 알림이 갑니다.", onRun: (ids) => bulk.mutate({ action: "status", ids, status: "done" }) },
        { label: "보류로", icon: <CircleSlash aria-hidden />, disabled: bulk.isPending, confirm: "고른 요청 {n}개를 보류로 바꿉니다. 요청한 사람에게 알림이 갑니다.", onRun: (ids) => bulk.mutate({ action: "status", ids, status: "rejected" }) },
        { label: "삭제", icon: <Trash2 aria-hidden />, danger: true, disabled: bulk.isPending, confirm: "고른 요청 {n}개를 지웁니다. 되돌릴 수 없습니다.", onRun: (ids) => bulk.mutate({ action: "delete", ids }) },
      ]} />
      <Pager page={page} total={list.data?.total ?? 0} limit={list.data?.limit ?? 30} onPage={(p) => set({ page: String(p) })} />

      <Sheet open={!!current} onOpenChange={(v) => { if (!v) setOpenId(null); }}>
        <SheetContent className="w-full overflow-y-auto bg-ground text-ink sm:max-w-[520px]">
          {current && <RequestDetail key={current.id + current.status + (current.handled_at ?? "")} c={current} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function RequestDetail({ c }: { c: AdminAssetRequest }) {
  const qc = useQueryClient();
  const [reply, setReply] = useState(c.reply ?? "");
  const [status, setStatus] = useState<RequestStatus>(c.status);
  const [item, setItem] = useState(c.handled_item ?? "");
  const save = useMutation({
    mutationFn: () => postJson<AdminAssetRequest>(`/admin/requests/${c.id}`, { status, reply, handled_item: item.trim() }, "PATCH"),
    onSuccess: () => { toast.success("저장했습니다."); void qc.invalidateQueries({ queryKey: ["admin", "requests"] }); },
    onError: (e) => toastError(e),
  });
  return (
    <>
      <SheetHeader className="border-b border-line px-6 py-5">
        <SheetTitle className="text-xl font-bold text-ink">{c.title}</SheetTitle>
        <SheetDescription className="text-ink-4">{fmtAt(c.created_at)} 접수{c.kind_ko ? ` · ${c.kind_ko}` : ""}{c.source ? ` · ${c.source}` : ""}</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-6 px-6 pb-8">
        <dl className="divide-y divide-line">
          <Field label="요청자">{c.requester ?? "—"}{c.requester_email && <span className="block text-xs text-ink-4">{c.requester_email}</span>}</Field>
          {c.handled_at && <Field label="처리">{c.handled_by ?? "—"} · {fmtAt(c.handled_at)}</Field>}
        </dl>
        {c.detail && (
          <section>
            <h3 className="text-sm font-semibold text-ink-4">요청 내용</h3>
            <p className="mt-2 whitespace-pre-wrap rounded-xl bg-ground-3 p-4 text-md leading-relaxed">{c.detail}</p>
          </section>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="rq-item">등록한 에셋 번호</Label>
          <Input className="h-9 text-sm" id="rq-item" value={item} onChange={(e) => setItem(e.target.value)} placeholder="에셋 상세의 번호(public id)" />
          <Copy className="text-xs text-ink-4" text="요청에 맞춰 등록한 에셋을 연결해 두면 어떤 요청이 어떤 에셋이 됐는지 남습니다." />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="rq-reply">답변</Label>
          <Textarea id="rq-reply" value={reply} onChange={(e) => setReply(e.target.value)} rows={5} maxLength={3000} placeholder="요청한 사람에게 보일 한 줄(알림으로 갑니다)" className="text-sm" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusToggle value={status} onChange={setStatus} labels={REQUEST_STATUS_KO} />
          <Button size="sm" className="ml-auto" onClick={() => save.mutate()} disabled={save.isPending}><Save aria-hidden />저장</Button>
        </div>
      </div>
    </>
  );
}

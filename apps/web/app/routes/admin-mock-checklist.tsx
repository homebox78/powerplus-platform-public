// 관리자 · powerMock 개선 체크리스트 — 시안 판정·시험에서 걸린 항목을 한 줄(slug)에 횟수·근거로 쌓아 증적으로 관리한다.
// 출처: homebox-handoff apps/web/app/routes/admin-checklist.tsx (화면 문법은 플랫폼 관리자 — 표 + 행 클릭 Sheet).
// 고친 항목이 다시 걸리면 서버가 '다시 걸림'으로 다시 연다. 상태 변경은 관리자·큐레이터, 서버가 Audit 에 남긴다.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, ListChecks, RotateCcw, Wrench, CircleCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AdminTitle, BulkBar, Field, SearchBox, SelectAllCell, SelectCell, useQueryState, useSelection } from "@/components/admin/admin-ui";
import { bulkChecklist, useBulkRun } from "@/lib/admin-bulk2";
import { ChoiceButton } from "@/components/hb/choice-button";
import { toastError } from "@/components/hb/confirm";
import { Copy } from "@/components/hb/copy";
import { MockupPreview } from "@/components/hb/mockup-preview";
import { Tag } from "@/components/hb/tag";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { fmtAt } from "@/lib/admin";
import { CHECKLIST_ORIGIN_KO, CHECKLIST_STATUS_KO, fetchChecklist, fetchChecklistItem, updateChecklistItem, type ChecklistItem, type ChecklistMeta, type ChecklistStatus } from "@/lib/mock-checklist";
import type { Route } from "./+types/admin-mock-checklist";

export const meta: Route.MetaFunction = () => [{ title: "개선 체크리스트 · powerMock — powerPlus 관리자" }];

const QK = ["admin", "mock-checklist"] as const;
const STATUS_FILTER: Array<[string, string]> = [["open", "열림·고치는 중"], ["regressed", "다시 걸림"], ["fixed", "고침"], ["watch", "지켜봄"], ["wontfix", "안 고침"], ["all", "전체"]];
const SORTS: Array<[string, string]> = [["hits", "많이 걸린 순"], ["recent", "최근 순"]];

export default function AdminMockChecklist() {
  const { get, set } = useQueryState();
  const status = get("status") || "open";
  const area = get("area");
  const origin = get("origin");
  const q = get("q");
  const sort = get("sort") || "hits";
  const [openId, setOpenId] = useState<number | null>(null);
  const list = useQuery({ queryKey: [...QK, status, area, origin, q, sort], queryFn: () => fetchChecklist({ status, area, origin, q, sort }) });
  const items = list.data?.data ?? [];
  const sel = useSelection(items.map((x) => String(x.id)), [status, area, origin, q, sort]);
  const bulk = useBulkRun(bulkChecklist, [QK], (b) => `${CHECKLIST_STATUS_KO[b.status]} 상태로 바꿨습니다`, sel.clear);
  const run = (s: ChecklistStatus) => (ids: string[]) => bulk.mutate({ status: s, ids: ids.map(Number) });
  const m = list.data?.meta as ChecklistMeta | undefined;
  const c = (k: string) => m?.counts?.[k]?.n ?? 0;
  const statusCount: Record<string, number> = { open: c("open") + c("fixing"), regressed: c("regressed"), fixed: c("fixed"), watch: c("watch"), wontfix: c("wontfix") };

  return (
    <div>
      <AdminTitle title="개선 체크리스트" desc="시안 판정과 시험에서 걸린 항목이 같은 줄에 횟수로 쌓입니다. 고친 항목이 다시 걸리면 다시 열립니다." />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={ListChecks} label="열린 항목" value={m ? (statusCount.open ?? 0) : null} sub={`고치는 중 ${c("fixing")}`} />
        <Stat icon={RotateCcw} label="다시 걸림" value={m ? (statusCount.regressed ?? 0) : null} accent />
        <Stat icon={CircleCheck} label="고침" value={m ? c("fixed") : null} />
        <Stat icon={Wrench} label="지켜봄·안 고침" value={m ? c("watch") + c("wontfix") : null} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <ChoiceButton size="sm" label="상태" value={status === "open" ? "" : status} allLabel="열림·고치는 중" onChange={(v) => set({ status: v })}
          options={STATUS_FILTER.filter(([id]) => id !== "open").map(([id, label]) => ({ id, label, count: id === "all" ? null : statusCount[id] ?? 0 }))} />
        <ChoiceButton size="sm" label="분야" value={area} onChange={(v) => set({ area: v })}
          options={(m?.areas ?? []).map((a) => ({ id: a.id, label: a.name, count: m?.open_by_area?.[a.id] ?? 0, hint: "열린 항목 수" }))} />
        <ChoiceButton size="sm" label="출처" value={origin} onChange={(v) => set({ origin: v })}
          options={Object.entries(CHECKLIST_ORIGIN_KO).map(([id, label]) => ({ id, label }))} />
        <ChoiceButton size="sm" label="정렬" value={sort === "hits" ? "" : sort} allLabel="많이 걸린 순" onChange={(v) => set({ sort: v })}
          options={SORTS.filter(([id]) => id !== "hits").map(([id, label]) => ({ id, label }))} />
        <SearchBox value={q} onSearch={(v) => set({ q: v })} placeholder="제목·내용 검색" />
        <span className="ml-auto text-sm tabular-nums text-ink-4">{items.length.toLocaleString()}건</span>
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-line">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <SelectAllCell sel={sel} />
              <TableHead>항목</TableHead>
              <TableHead className="hidden w-[130px] md:table-cell">분야</TableHead>
              <TableHead className="w-[120px] max-sm:w-[88px]">상태</TableHead>
              <TableHead className="w-[72px] max-sm:w-[52px]">횟수</TableHead>
              <TableHead className="hidden w-[150px] lg:table-cell">마지막 발견</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((x) => (
              <TableRow key={x.id} role="button" tabIndex={0} onClick={() => setOpenId(x.id)} onKeyDown={(e) => { if (e.key === "Enter") setOpenId(x.id); }} className="cursor-pointer" data-state={openId === x.id ? "selected" : undefined}>
                <SelectCell sel={sel} id={String(x.id)} label={x.title} />
                <TableCell className="text-left">
                  <span className="block truncate font-semibold">{x.title}</span>
                  <span className="block truncate text-xs text-ink-4">{CHECKLIST_ORIGIN_KO[x.origin]} · {x.slug}</span>
                </TableCell>
                <TableCell className="hidden text-center md:table-cell">{x.area_name}</TableCell>
                <TableCell className="text-center"><StatusTags x={x} /></TableCell>
                <TableCell className="text-right tabular-nums">{x.hits.toLocaleString()}</TableCell>
                <TableCell className="hidden text-center tabular-nums text-ink-3 lg:table-cell">{fmtAt(x.last_seen)}</TableCell>
              </TableRow>
            ))}
            {list.data && items.length === 0 && <TableRow><TableCell colSpan={6} className="py-12 text-center text-ink-4">해당하는 항목이 없습니다.</TableCell></TableRow>}
            {list.isLoading && <TableRow><TableCell colSpan={6} className="py-6"><Skeleton className="h-10 w-full" /></TableCell></TableRow>}
            {list.isError && <TableRow><TableCell colSpan={6} className="py-12 text-center text-ink-4">목록을 불러오지 못했습니다.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <BulkBar sel={sel} actions={[
        { label: "고침", icon: <CircleCheck aria-hidden />, onRun: run("fixed"), disabled: bulk.isPending },
        { label: "고치는 중", onRun: run("fixing"), disabled: bulk.isPending },
        { label: "다시 열기", onRun: run("open"), disabled: bulk.isPending },
        { label: "지켜봄", onRun: run("watch"), disabled: bulk.isPending },
        { label: "안 고침", confirm: "고른 항목 {n}개를 안 고침으로 둘까요? 열린 목록에서 빠집니다.", onRun: run("wontfix"), disabled: bulk.isPending },
      ]} />

      <Sheet open={openId !== null} onOpenChange={(v) => { if (!v) setOpenId(null); }}>
        <SheetContent className="w-full overflow-y-auto bg-ground text-ink sm:max-w-[920px]">
          {openId !== null && <Detail id={openId} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub, accent }: { icon: typeof ListChecks; label: string; value: number | null; sub?: string; accent?: boolean }) {
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="flex flex-row items-center justify-between px-4 pb-0">
        <CardTitle className="text-sm font-medium text-ink-3">{label}</CardTitle>
        <Icon className={accent ? "size-4 text-point" : "size-4 text-ink-4"} aria-hidden />
      </CardHeader>
      <CardContent className="px-4">
        {value === null ? <Skeleton className="h-7 w-16" /> : <p className={`text-2xl font-extrabold tabular-nums tracking-[-0.02em] ${accent && value > 0 ? "text-point-ink" : ""}`}>{value.toLocaleString()}</p>}
        {sub && <p className="mt-1 text-xs text-ink-4">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function StatusTags({ x }: { x: Pick<ChecklistItem, "status" | "regressed"> }) {
  return (
    <span className="inline-flex flex-wrap justify-center gap-1">
      <Tag tone={x.status === "fixed" || x.status === "wontfix" ? "line" : x.status === "fixing" ? "ink" : "soft"}>{CHECKLIST_STATUS_KO[x.status]}</Tag>
      {x.regressed && <Tag tone="warn">다시 걸림</Tag>}
    </span>
  );
}

function Detail({ id }: { id: number }) {
  const q = useQuery({ queryKey: [...QK, "detail", id], queryFn: () => fetchChecklistItem(id) });
  if (q.isError) return <div className="p-6 text-md text-ink-3">항목을 불러오지 못했습니다.</div>;
  if (!q.data) return <div className="flex flex-col gap-3 p-6"><Skeleton className="h-7 w-2/3" /><Skeleton className="h-40 w-full" /></div>;
  // 받은 값이 바뀌면(저장 후 다시 받음) 입력 칸을 새 값으로 — key 로 다시 그린다
  return <DetailBody key={`${q.data.id}:${q.data.status}:${q.data.fix_note ?? ""}:${q.data.fix_commit ?? ""}`} x={q.data} />;
}

function DetailBody({ x }: { x: ChecklistItem }) {
  const qc = useQueryClient();
  const id = x.id;
  const [status, setStatus] = useState<ChecklistStatus>(x.status);
  const [note, setNote] = useState(x.fix_note ?? "");
  const [commit, setCommit] = useState(x.fix_commit ?? "");
  const [preview, setPreview] = useState<string | null>(x.evidence?.find((e) => e.mockup)?.mockup?.preview_url ?? null);
  const save = useMutation({
    mutationFn: () => updateChecklistItem(id, { status, fix_note: note, fix_commit: commit }),
    onSuccess: () => { toast.success("저장했습니다."); void qc.invalidateQueries({ queryKey: [...QK] }); },
    onError: (e) => toastError(e),
  });
  const ev = x.evidence ?? [];
  const dirty = status !== x.status || note !== (x.fix_note ?? "") || commit !== (x.fix_commit ?? "");
  return (
    <>
      <SheetHeader className="border-b border-line px-6 py-5">
        <SheetTitle className="text-xl font-bold text-ink">{x.title}</SheetTitle>
        <SheetDescription className="text-ink-4">{x.area_name} · {CHECKLIST_ORIGIN_KO[x.origin]} · {x.hits}번 걸림</SheetDescription>
      </SheetHeader>
      <div className="px-6 py-5">
        <dl className="divide-y divide-line">
          <Field label="상태"><StatusTags x={x} /></Field>
          <Field label="처음 발견">{fmtAt(x.first_seen)}</Field>
          <Field label="마지막 발견">{fmtAt(x.last_seen)}</Field>
          {x.fixed_at && <Field label="고친 시각">{fmtAt(x.fixed_at)}</Field>}
          <Field label="식별자"><span className="break-all text-sm text-ink-3">{x.slug}</span></Field>
        </dl>
        {x.detail && <Copy className="mt-4 text-sm leading-[1.7] text-ink-2" text={x.detail} />}

        <Separator className="my-5" />
        <h3 className="text-md font-bold">처리</h3>
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={status} onValueChange={(v) => setStatus(v as ChecklistStatus)}>
              <SelectTrigger size="sm" className="w-[200px]" aria-label="상태"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(CHECKLIST_STATUS_KO) as ChecklistStatus[]).map((s) => <SelectItem key={s} value={s}>{CHECKLIST_STATUS_KO[s]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input value={commit} onChange={(e) => setCommit(e.target.value)} placeholder="고친 커밋(선택)" aria-label="고친 커밋" className="h-9 w-[200px] text-sm" />
            <Button size="sm" className="ml-auto" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>저장</Button>
          </div>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="고친 방법이나 판단 이유를 적습니다." aria-label="고친 방법" rows={3} className="text-sm" />
        </div>

        <Separator className="my-5" />
        <h3 className="text-md font-bold">근거 <span className="text-sm font-normal text-ink-4">최근 {ev.length}건</span></h3>
        {preview && <MockupPreview className="mt-3" src={preview} title="근거 시안" height="44vh" lead={<span>근거 시안 미리보기</span>} />}
        <ul className="mt-3 flex flex-col gap-1.5">
          {ev.map((e, i) => (
            <li key={i} className="rounded-lg bg-ground-3 px-3 py-2 text-sm text-ink-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-4">
                <span className="tabular-nums">{e.at ?? "—"}</span>
                {e.src && <span>{e.src}</span>}
                {typeof e.score === "number" && <span className="tabular-nums">{e.score}점</span>}
                {e.ref && <span className="truncate">레퍼런스 {e.ref}</span>}
                {e.mockup && (
                  <span className="ml-auto inline-flex gap-1">
                    <Button size="xs" variant={preview === e.mockup.preview_url ? "outline" : "ghost"} onClick={() => setPreview(e.mockup!.preview_url)}>미리보기</Button>
                    <Button size="xs" variant="ghost" asChild><a href={e.mockup.preview_url} target="_blank" rel="noreferrer"><ExternalLink aria-hidden />새 창</a></Button>
                  </span>
                )}
                {!e.mockup && e.token && <span className="ml-auto">시안 {e.token.slice(0, 8)} (지워짐)</span>}
              </div>
              {e.note && <p className="mt-1 leading-[1.6]">{e.note}</p>}
            </li>
          ))}
          {ev.length === 0 && <li className="py-6 text-center text-sm text-ink-4">남은 근거가 없습니다.</li>}
        </ul>
      </div>
    </>
  );
}

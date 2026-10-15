// 관리자 · 솔루션 개선 체크리스트(powerAssets·powerGuide·powerMCP) — /admin/qa/:module. 같은 결함은 한 줄에 횟수·근거로 쌓이고, 고친 줄이 다시 걸리면 다시 열린다.
// 출처: routes/admin-site-checklist.tsx 를 솔루션 경로로 일반화(사용자 2026-10-15 "각 솔루션마다 개선 체크리스트"). 통합 검수는 routes/admin-qa.tsx.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, Eye, ListChecks, Plus, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { AdminTitle, BulkBar, Field, SearchBox, SelectAllCell, SelectCell, SortHead, useQueryState, useSelection, useSort } from "@/components/admin/admin-ui";
import { useBulkRun } from "@/lib/admin-bulk2";
import { ChoiceButton } from "@/components/hb/choice-button";
import { toastError } from "@/components/hb/confirm";
import { Copy } from "@/components/hb/copy";
import { Tag } from "@/components/hb/tag";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { fmtAt } from "@/lib/admin";
import {
  QA_MODULES, QA_ORIGIN_KO, QA_STATUS_KO, addQaItem, bulkQa, fetchQaChecklist, fetchQaItem, updateQaItem,
  type QaItem, type QaMeta, type QaModule, type QaStatus,
} from "@/lib/qa";
import type { Route } from "./+types/admin-qa-checklist";

export const meta: Route.MetaFunction = ({ params }) => [{ title: `개선 체크리스트 · ${QA_MODULES[params.module as QaModule] ?? "솔루션"} — powerPlus 관리자` }];

const QK = ["admin", "qa"] as const;
const STATUS_FILTER: Array<[string, string]> = [["open", "열림·고치는 중"], ["regressed", "다시 걸림"], ["fixed", "고침"], ["watch", "지켜봄"], ["wontfix", "안 고침"], ["all", "전체"]];
const SORTS: Array<[string, string]> = [["hits", "많이 걸린 순"], ["recent", "최근 순"]];

export default function AdminQaChecklist() {
  const mod = (useParams().module ?? "") as QaModule;
  if (!QA_MODULES[mod]) return <p className="py-12 text-center text-ink-4">없는 체크리스트입니다.</p>;
  return <ModuleChecklist key={mod} mod={mod} />;
}

function ModuleChecklist({ mod }: { mod: QaModule }) {
  const { get, set } = useQueryState();
  const status = get("status") || "open";
  const area = get("area");
  const origin = get("origin");
  const q = get("q");
  const sort = get("sort") || "hits";
  const [openId, setOpenId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const list = useQuery({ queryKey: [...QK, mod, status, area, origin, q, sort], queryFn: () => fetchQaChecklist(mod, { status, area, origin, q, sort }) });
  const items = list.data?.data ?? [];
  const s = useSort(items, {
    title: (x) => x.title, area: (x) => x.area_name, status: (x) => QA_STATUS_KO[x.status], hits: (x) => x.hits, last: (x) => x.last_seen,
  });
  const sel = useSelection(items.map((x) => String(x.id)), [status, area, origin, q, sort]);
  const bulk = useBulkRun(bulkQa(mod), [QK], (b) => `${QA_STATUS_KO[b.status]} 상태로 바꿨습니다`, sel.clear);
  const run = (st: QaStatus) => (ids: string[]) => bulk.mutate({ status: st, ids: ids.map(Number) });
  const m = list.data?.meta as QaMeta | undefined;
  const c = (k: string) => m?.counts?.[k]?.n ?? 0;
  const statusCount: Record<string, number> = { open: c("open") + c("fixing"), regressed: c("regressed"), fixed: c("fixed"), watch: c("watch"), wontfix: c("wontfix") };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <AdminTitle title={`${QA_MODULES[mod]} 개선 체크리스트`} desc={m?.loop ? `자가 개선: ${m.loop}. 모든 솔루션은 통합 검수에서 함께 봅니다.` : "같은 결함은 한 줄에 횟수로 쌓입니다. 모든 솔루션은 통합 검수에서 함께 봅니다."} />
        <div className="flex gap-2"><Button size="sm" variant="outline" asChild><Link to="/admin/qa">통합 검수</Link></Button><Button size="sm" onClick={() => setAdding(true)}><Plus aria-hidden />직접 추가</Button></div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={ListChecks} label="열린 항목" value={m ? statusCount.open ?? 0 : null} sub={`고치는 중 ${c("fixing")}`} />
        <Stat icon={Eye} label="지켜봄" value={m ? c("watch") : null} sub="확인하지 못한 항목" />
        <Stat icon={RotateCcw} label="다시 걸림" value={m ? statusCount.regressed ?? 0 : null} accent />
        <Stat icon={CircleCheck} label="고침" value={m ? c("fixed") : null} sub={`안 고침 ${c("wontfix")}`} />
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <ChoiceButton size="sm" label="상태" value={status === "open" ? "" : status} allLabel="열림·고치는 중" onChange={(v) => set({ status: v })}
          options={STATUS_FILTER.filter(([id]) => id !== "open").map(([id, label]) => ({ id, label, count: id === "all" ? null : statusCount[id] ?? 0 }))} />
        <ChoiceButton size="sm" label="분야" value={area} onChange={(v) => set({ area: v })}
          options={(m?.areas ?? []).map((a) => ({ id: a.id, label: a.name, count: m?.open_by_area?.[a.id] ?? 0, hint: "열린 항목 수" }))} />
        <ChoiceButton size="sm" label="출처" value={origin} onChange={(v) => set({ origin: v })}
          options={["feed", "doc", "audit", "test", "user", "manual"].map((id) => ({ id, label: QA_ORIGIN_KO[id] ?? id }))} />
        <ChoiceButton size="sm" label="정렬" value={sort === "hits" ? "" : sort} allLabel="많이 걸린 순" onChange={(v) => set({ sort: v })}
          options={SORTS.filter(([id]) => id !== "hits").map(([id, label]) => ({ id, label }))} />
        <SearchBox value={q} onSearch={(v) => set({ q: v })} placeholder="제목·내용·식별자 검색" />
        <span className="ml-auto text-sm tabular-nums text-ink-4">{items.length.toLocaleString()}건</span>
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-line">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <SelectAllCell sel={sel} />
              <SortHead s={s} k="title">항목</SortHead>
              <SortHead s={s} k="area" className="hidden w-[150px] md:table-cell">분야</SortHead>
              <SortHead s={s} k="status" className="w-[120px] max-sm:w-[88px]">상태</SortHead>
              <SortHead s={s} k="hits" className="w-[84px] max-sm:w-[52px]">횟수</SortHead>
              <SortHead s={s} k="last" className="hidden w-[160px] lg:table-cell">마지막 발견</SortHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {s.rows.map((x) => (
              <TableRow key={x.id} role="button" tabIndex={0} onClick={() => setOpenId(x.id)} onKeyDown={(e) => { if (e.key === "Enter") setOpenId(x.id); }} className="cursor-pointer" data-state={openId === x.id ? "selected" : undefined}>
                <SelectCell sel={sel} id={String(x.id)} label={x.title} />
                <TableCell className="text-left">
                  <span className="block truncate font-semibold">{x.title}</span>
                  <span className="block truncate text-xs text-ink-4">{QA_ORIGIN_KO[x.origin] ?? x.origin} · {x.slug}{x.detail ? ` · ${x.detail}` : ""}</span>
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
        { label: "안 고침", confirm: "고른 항목 {n}개를 안 고침으로 둘까요?", onRun: run("wontfix"), disabled: bulk.isPending },
      ]} />

      <Sheet open={openId !== null} onOpenChange={(v) => { if (!v) setOpenId(null); }}>
        <SheetContent className="w-full overflow-y-auto bg-ground text-ink sm:max-w-[760px]">
          {openId !== null && <Detail mod={mod} id={openId} />}
        </SheetContent>
      </Sheet>
      <Sheet open={adding} onOpenChange={setAdding}>
        <SheetContent className="w-full overflow-y-auto bg-ground text-ink sm:max-w-[560px]">
          {adding && <AddForm mod={mod} areas={m?.areas ?? []} onDone={() => setAdding(false)} />}
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

function StatusTags({ x }: { x: Pick<QaItem, "status" | "regressed"> }) {
  return (
    <span className="inline-flex flex-wrap justify-center gap-1">
      <Tag tone={x.status === "fixed" || x.status === "wontfix" ? "line" : x.status === "fixing" ? "ink" : "soft"}>{QA_STATUS_KO[x.status]}</Tag>
      {x.regressed && <Tag tone="warn">다시 걸림</Tag>}
    </span>
  );
}

function Detail({ mod, id }: { mod: QaModule; id: number }) {
  const q = useQuery({ queryKey: [...QK, mod, "detail", id], queryFn: () => fetchQaItem(mod, id) });
  if (q.isError) return <div className="p-6 text-md text-ink-3">항목을 불러오지 못했습니다.</div>;
  if (!q.data) return <div className="flex flex-col gap-3 p-6"><Skeleton className="h-7 w-2/3" /><Skeleton className="h-40 w-full" /></div>;
  return <DetailBody key={`${q.data.id}:${q.data.status}:${q.data.fix_note ?? ""}:${q.data.fix_commit ?? ""}`} mod={mod} x={q.data} />;
}

function DetailBody({ mod, x }: { mod: QaModule; x: QaItem }) {
  const qc = useQueryClient();
  const id = x.id;
  const [status, setStatus] = useState<QaStatus>(x.status);
  const [note, setNote] = useState(x.fix_note ?? "");
  const [commit, setCommit] = useState(x.fix_commit ?? "");
  const save = useMutation({
    mutationFn: () => updateQaItem(mod, id, { status, fix_note: note, fix_commit: commit }),
    onSuccess: () => { toast.success("저장했습니다."); void qc.invalidateQueries({ queryKey: [...QK] }); },
    onError: (e) => toastError(e),
  });
  const ev = x.evidence ?? [];
  const dirty = status !== x.status || note !== (x.fix_note ?? "") || commit !== (x.fix_commit ?? "");
  return (
    <>
      <SheetHeader className="border-b border-line px-6 py-5">
        <SheetTitle className="text-xl font-bold text-ink">{x.title}</SheetTitle>
        <SheetDescription className="text-ink-4">{x.area_name} · {QA_ORIGIN_KO[x.origin] ?? x.origin} · {x.hits}번 걸림</SheetDescription>
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
            <Select value={status} onValueChange={(v) => setStatus(v as QaStatus)}>
              <SelectTrigger size="sm" className="w-[200px]" aria-label="상태"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(QA_STATUS_KO) as QaStatus[]).map((st) => <SelectItem key={st} value={st}>{QA_STATUS_KO[st]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input value={commit} onChange={(e) => setCommit(e.target.value)} placeholder="고친 커밋(선택)" aria-label="고친 커밋" className="h-9 w-[200px] text-sm" />
            <Button size="sm" className="ml-auto" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>저장</Button>
          </div>
          <label className="text-sm font-semibold text-ink-2" htmlFor="qa-fix">고친 방법·메모</label>
          <Textarea id="qa-fix" value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 동의어 사전에 이어 줬다." rows={3} className="text-sm" />
        </div>

        <Separator className="my-5" />
        <h3 className="text-md font-bold">근거 <span className="text-sm font-normal text-ink-4">최근 {ev.length}건</span></h3>
        <ul className="mt-3 flex flex-col gap-1.5">
          {ev.map((e, i) => (
            <li key={i} className="rounded-lg bg-ground-3 px-3 py-2 text-sm text-ink-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-4">
                <span className="tabular-nums">{e.at ?? "—"}</span>
                {e.by && <span>{e.by}</span>}
                {e.verdict && <Tag tone={e.verdict === "미흡" ? "warn" : "line"}>{e.verdict}</Tag>}
                {e.target && <span className="truncate">대상 {e.target}</span>}
                {e.how && <span className="truncate">방법 {e.how}</span>}
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

function AddForm({ mod, areas, onDone }: { mod: QaModule; areas: Array<{ id: string; name: string }>; onDone: () => void }) {
  const qc = useQueryClient();
  const [area, setArea] = useState("misc");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [rule, setRule] = useState("");
  const add = useMutation({
    mutationFn: () => addQaItem(mod, { area, title: title.trim(), detail: detail.trim() || undefined, fix_note: rule.trim() || undefined }),
    onSuccess: (r) => { toast.success(r.created ? "추가했습니다." : "같은 항목이 있어 횟수를 올렸습니다."); void qc.invalidateQueries({ queryKey: [...QK] }); onDone(); },
    onError: (e) => toastError(e),
  });
  return (
    <>
      <SheetHeader className="border-b border-line px-6 py-5">
        <SheetTitle className="text-xl font-bold text-ink">항목 직접 추가</SheetTitle>
        <SheetDescription className="text-ink-4">{QA_MODULES[mod]}에서 발견한 문제를 적습니다.</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-3 px-6 py-5">
        <Select value={area} onValueChange={setArea}>
          <SelectTrigger size="sm" className="w-[200px]" aria-label="분야"><SelectValue /></SelectTrigger>
          <SelectContent>{areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
        </Select>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목" aria-label="제목" className="h-9 text-sm" />
        <Textarea value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="내용(선택)" aria-label="내용" rows={3} className="text-sm" />
        <Textarea value={rule} onChange={(e) => setRule(e.target.value)} placeholder="고친 방법·메모(선택)" aria-label="고친 방법·메모" rows={2} className="text-sm" />
        <Button size="sm" className="self-end" disabled={!title.trim() || add.isPending} onClick={() => add.mutate()}>추가</Button>
      </div>
    </>
  );
}

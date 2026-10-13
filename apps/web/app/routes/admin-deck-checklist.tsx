// 관리자 · powerDeck 개선 체크리스트 — 장표 작업에서 걸린 것(와이어 검사·엔진 보고·사용자 의견·실패)을 한 줄에 횟수·근거로 쌓는다.
// 출처: routes/admin-mock-checklist.tsx 를 장표용으로.
// 자가 개선: 열린 항목 중 두 번 이상 걸렸거나 다시 걸린 것은 다음 장표 작업 때 엔진 프롬프트에 규칙으로 들어간다(Checklist::lessons).
//   '엔진에 넣을 규칙'(fix_note)을 적으면 그 문장이, 비어 있으면 항목 제목·내용이 들어간다. 고침·지켜봄·안 고침으로 바꾸면 빠진다.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BrainCircuit, CircleCheck, ExternalLink, ListChecks, Plus, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { AdminTitle, BulkBar, Field, SearchBox, SelectAllCell, SelectCell, SortHead, useQueryState, useSelection, useSort } from "@/components/admin/admin-ui";
import { useBulkRun } from "@/lib/admin-bulk2";
import { ChoiceButton } from "@/components/hb/choice-button";
import { toastError } from "@/components/hb/confirm";
import { Copy, MBr } from "@/components/hb/copy";
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
  DECK_ORIGIN_KO, DECK_STATUS_KO, addDeckChecklistItem, bulkDeckChecklist, fetchDeckChecklist, fetchDeckChecklistItem, fetchDeckLessons, updateDeckChecklistItem,
  type DeckChecklistItem, type DeckChecklistMeta, type DeckChecklistStatus,
} from "@/lib/deck-checklist";
import type { Route } from "./+types/admin-deck-checklist";

export const meta: Route.MetaFunction = () => [{ title: "개선 체크리스트 · powerDeck — powerPlus 관리자" }];

const QK = ["admin", "deck-checklist"] as const;
const STATUS_FILTER: Array<[string, string]> = [["open", "열림·고치는 중"], ["fed", "엔진 반영 중"], ["regressed", "다시 걸림"], ["fixed", "고침"], ["watch", "지켜봄"], ["wontfix", "안 고침"], ["all", "전체"]];
const SORTS: Array<[string, string]> = [["hits", "많이 걸린 순"], ["recent", "최근 순"]];

export default function AdminDeckChecklist() {
  const { get, set } = useQueryState();
  const status = get("status") || "open";
  const area = get("area");
  const origin = get("origin");
  const q = get("q");
  const sort = get("sort") || "hits";
  const [openId, setOpenId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const list = useQuery({ queryKey: [...QK, status, area, origin, q, sort], queryFn: () => fetchDeckChecklist({ status, area, origin, q, sort }) });
  const items = list.data?.data ?? [];
  const s = useSort(items, {
    title: (x) => x.title, area: (x) => x.area_name, status: (x) => DECK_STATUS_KO[x.status], hits: (x) => x.hits, last: (x) => x.last_seen,
  });
  const sel = useSelection(items.map((x) => String(x.id)), [status, area, origin, q, sort]);
  const bulk = useBulkRun(bulkDeckChecklist, [QK], (b) => `${DECK_STATUS_KO[b.status]} 상태로 바꿨습니다`, sel.clear);
  const run = (st: DeckChecklistStatus) => (ids: string[]) => bulk.mutate({ status: st, ids: ids.map(Number) });
  const m = list.data?.meta as DeckChecklistMeta | undefined;
  const c = (k: string) => m?.counts?.[k]?.n ?? 0;
  const statusCount: Record<string, number> = { open: c("open") + c("fixing"), fed: c("fed"), regressed: c("regressed"), fixed: c("fixed"), watch: c("watch"), wontfix: c("wontfix") };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <AdminTitle title="장표 개선 체크리스트" desc="장표 작업에서 걸린 문제가 같은 줄에 횟수로 쌓입니다. 두 번 이상 걸린 열린 항목은 다음 작업 때 엔진에 규칙으로 들어갑니다." />
        <Button size="sm" onClick={() => setAdding(true)}><Plus aria-hidden />직접 추가</Button>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={ListChecks} label="열린 항목" value={m ? statusCount.open ?? 0 : null} sub={`고치는 중 ${c("fixing")}`} />
        <Stat icon={BrainCircuit} label="엔진 반영 중" value={m ? statusCount.fed ?? 0 : null} sub="다음 작업 프롬프트에 들어감" />
        <Stat icon={RotateCcw} label="다시 걸림" value={m ? statusCount.regressed ?? 0 : null} accent />
        <Stat icon={CircleCheck} label="고침" value={m ? c("fixed") : null} sub={`지켜봄·안 고침 ${c("watch") + c("wontfix")}`} />
      </div>

      <Lessons />

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <ChoiceButton size="sm" label="상태" value={status === "open" ? "" : status} allLabel="열림·고치는 중" onChange={(v) => set({ status: v })}
          options={STATUS_FILTER.filter(([id]) => id !== "open").map(([id, label]) => ({ id, label, count: id === "all" ? null : statusCount[id] ?? 0 }))} />
        <ChoiceButton size="sm" label="분야" value={area} onChange={(v) => set({ area: v })}
          options={(m?.areas ?? []).map((a) => ({ id: a.id, label: a.name, count: m?.open_by_area?.[a.id] ?? 0, hint: "열린 항목 수" }))} />
        <ChoiceButton size="sm" label="출처" value={origin} onChange={(v) => set({ origin: v })}
          options={Object.entries(DECK_ORIGIN_KO).map(([id, label]) => ({ id, label }))} />
        <ChoiceButton size="sm" label="정렬" value={sort === "hits" ? "" : sort} allLabel="많이 걸린 순" onChange={(v) => set({ sort: v })}
          options={SORTS.filter(([id]) => id !== "hits").map(([id, label]) => ({ id, label }))} />
        <SearchBox value={q} onSearch={(v) => set({ q: v })} placeholder="제목·내용·규칙 검색" />
        <span className="ml-auto text-sm tabular-nums text-ink-4">{items.length.toLocaleString()}건</span>
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-line">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <SelectAllCell sel={sel} />
              <SortHead s={s} k="title">항목</SortHead>
              <SortHead s={s} k="area" className="hidden w-[130px] md:table-cell">분야</SortHead>
              <SortHead s={s} k="status" className="w-[150px] max-sm:w-[96px]">상태</SortHead>
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
                  <span className="block truncate text-xs text-ink-4">{DECK_ORIGIN_KO[x.origin]}{x.fix_note ? ` · 규칙: ${x.fix_note}` : ` · ${x.slug}`}</span>
                </TableCell>
                <TableCell className="hidden text-center md:table-cell">{x.area_name}</TableCell>
                <TableCell className="text-center"><StatusTags x={x} /></TableCell>
                <TableCell className="text-right tabular-nums">{x.hits.toLocaleString()}</TableCell>
                <TableCell className="hidden text-center tabular-nums text-ink-3 lg:table-cell">{fmtAt(x.last_seen)}</TableCell>
              </TableRow>
            ))}
            {list.data && items.length === 0 && <TableRow><TableCell colSpan={6} className="py-12 text-center text-ink-4">해당하는 항목이 없습니다.<MBr />장표 작업이 돌면 저절로 쌓입니다.</TableCell></TableRow>}
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
        { label: "안 고침", confirm: "고른 항목 {n}개를 안 고침으로 둘까요? 엔진 규칙에서도 빠집니다.", onRun: run("wontfix"), disabled: bulk.isPending },
      ]} />

      <Sheet open={openId !== null} onOpenChange={(v) => { if (!v) setOpenId(null); }}>
        <SheetContent className="w-full overflow-y-auto bg-ground text-ink sm:max-w-[760px]">
          {openId !== null && <Detail id={openId} />}
        </SheetContent>
      </Sheet>
      <Sheet open={adding} onOpenChange={setAdding}>
        <SheetContent className="w-full overflow-y-auto bg-ground text-ink sm:max-w-[560px]">
          {adding && <AddForm areas={m?.areas ?? []} onDone={() => setAdding(false)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** 지금 엔진에 들어가는 규칙 — 다음 장표 작업 프롬프트에 그대로 붙는다 */
function Lessons() {
  const q = useQuery({ queryKey: [...QK, "lessons"], queryFn: fetchDeckLessons });
  const ls = q.data ?? [];
  return (
    <div className="mt-6 rounded-xl border border-line px-5 py-4">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 className="text-md font-bold">지금 엔진에 넣는 규칙</h2>
        <span className="text-sm text-ink-4">다음 장표 작업 때 이 {ls.length}줄이 프롬프트에 붙습니다.</span>
      </div>
      {q.isLoading && <Skeleton className="mt-3 h-12 w-full" />}
      {q.data && ls.length === 0 && <p className="mt-3 text-sm text-ink-4">아직 없습니다.<MBr />같은 문제가 두 번 걸리면 여기에 올라옵니다.</p>}
      {ls.length > 0 && (
        <ol className="mt-3 flex flex-col gap-1.5 text-sm text-ink-2">
          {ls.map((l, i) => (
            <li key={l.id} className="flex gap-2">
              <span className="w-5 shrink-0 text-right tabular-nums text-ink-4">{i + 1}.</span>
              <span className="min-w-0 flex-1">{l.text}</span>
              <span className="shrink-0 tabular-nums text-ink-4">{l.hits}번</span>
            </li>
          ))}
        </ol>
      )}
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

function StatusTags({ x }: { x: Pick<DeckChecklistItem, "status" | "regressed" | "fed"> }) {
  return (
    <span className="inline-flex flex-wrap justify-center gap-1">
      <Tag tone={x.status === "fixed" || x.status === "wontfix" ? "line" : x.status === "fixing" ? "ink" : "soft"}>{DECK_STATUS_KO[x.status]}</Tag>
      {x.fed && <Tag tone="ink">엔진 반영</Tag>}
      {x.regressed && <Tag tone="warn">다시 걸림</Tag>}
    </span>
  );
}

function Detail({ id }: { id: number }) {
  const q = useQuery({ queryKey: [...QK, "detail", id], queryFn: () => fetchDeckChecklistItem(id) });
  if (q.isError) return <div className="p-6 text-md text-ink-3">항목을 불러오지 못했습니다.</div>;
  if (!q.data) return <div className="flex flex-col gap-3 p-6"><Skeleton className="h-7 w-2/3" /><Skeleton className="h-40 w-full" /></div>;
  return <DetailBody key={`${q.data.id}:${q.data.status}:${q.data.fix_note ?? ""}:${q.data.fix_commit ?? ""}`} x={q.data} />;
}

function DetailBody({ x }: { x: DeckChecklistItem }) {
  const qc = useQueryClient();
  const id = x.id;
  const [status, setStatus] = useState<DeckChecklistStatus>(x.status);
  const [note, setNote] = useState(x.fix_note ?? "");
  const [commit, setCommit] = useState(x.fix_commit ?? "");
  const save = useMutation({
    mutationFn: () => updateDeckChecklistItem(id, { status, fix_note: note, fix_commit: commit }),
    onSuccess: () => { toast.success("저장했습니다."); void qc.invalidateQueries({ queryKey: [...QK] }); },
    onError: (e) => toastError(e),
  });
  const ev = x.evidence ?? [];
  const dirty = status !== x.status || note !== (x.fix_note ?? "") || commit !== (x.fix_commit ?? "");
  return (
    <>
      <SheetHeader className="border-b border-line px-6 py-5">
        <SheetTitle className="text-xl font-bold text-ink">{x.title}</SheetTitle>
        <SheetDescription className="text-ink-4">{x.area_name} · {DECK_ORIGIN_KO[x.origin]} · {x.hits}번 걸림</SheetDescription>
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
            <Select value={status} onValueChange={(v) => setStatus(v as DeckChecklistStatus)}>
              <SelectTrigger size="sm" className="w-[200px]" aria-label="상태"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(DECK_STATUS_KO) as DeckChecklistStatus[]).map((st) => <SelectItem key={st} value={st}>{DECK_STATUS_KO[st]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input value={commit} onChange={(e) => setCommit(e.target.value)} placeholder="고친 커밋(선택)" aria-label="고친 커밋" className="h-9 w-[200px] text-sm" />
            <Button size="sm" className="ml-auto" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>저장</Button>
          </div>
          <label className="text-sm font-semibold text-ink-2" htmlFor="deck-rule">엔진에 넣을 규칙</label>
          <Textarea id="deck-rule" value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 표지 제목은 두 줄을 넘기지 않는다. 비워 두면 항목 제목·내용이 들어갑니다." rows={3} className="text-sm" />
          <p className="text-xs text-ink-4">열림·고치는 중이고 두 번 이상 걸렸거나 다시 걸린 항목만 엔진에 들어갑니다.<MBr />엔진·실패 분야는 넣지 않습니다.</p>
        </div>

        <Separator className="my-5" />
        <h3 className="text-md font-bold">근거 <span className="text-sm font-normal text-ink-4">최근 {ev.length}건</span></h3>
        <ul className="mt-3 flex flex-col gap-1.5">
          {ev.map((e, i) => (
            <li key={i} className="rounded-lg bg-ground-3 px-3 py-2 text-sm text-ink-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-4">
                <span className="tabular-nums">{e.at ?? "—"}</span>
                {e.title && <span className="truncate">{e.title}</span>}
                {e.slide ? <span className="tabular-nums">{e.slide}장</span> : null}
                {e.url && (
                  <Button size="xs" variant="ghost" className="ml-auto" asChild>
                    <Link to={e.url} target="_blank" rel="noreferrer"><ExternalLink aria-hidden />작업 열기</Link>
                  </Button>
                )}
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

function AddForm({ areas, onDone }: { areas: Array<{ id: string; name: string }>; onDone: () => void }) {
  const qc = useQueryClient();
  const [area, setArea] = useState("misc");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [rule, setRule] = useState("");
  const add = useMutation({
    mutationFn: () => addDeckChecklistItem({ area, title: title.trim(), detail: detail.trim() || undefined, fix_note: rule.trim() || undefined }),
    onSuccess: (r) => { toast.success(r.created ? "추가했습니다." : "같은 항목이 있어 횟수를 올렸습니다."); void qc.invalidateQueries({ queryKey: [...QK] }); onDone(); },
    onError: (e) => toastError(e),
  });
  return (
    <>
      <SheetHeader className="border-b border-line px-6 py-5">
        <SheetTitle className="text-xl font-bold text-ink">항목 직접 추가</SheetTitle>
        <SheetDescription className="text-ink-4">장표를 보다 발견한 문제를 적습니다.<MBr />규칙을 적고 두 번 이상 걸리면 엔진에 들어갑니다.</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-3 px-6 py-5">
        <Select value={area} onValueChange={setArea}>
          <SelectTrigger size="sm" className="w-[200px]" aria-label="분야"><SelectValue /></SelectTrigger>
          <SelectContent>{areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
        </Select>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="제목 (예: 표지 제목이 세 줄로 넘침)" aria-label="제목" className="h-9 text-sm" />
        <Textarea value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="내용(선택)" aria-label="내용" rows={3} className="text-sm" />
        <Textarea value={rule} onChange={(e) => setRule(e.target.value)} placeholder="엔진에 넣을 규칙(선택)" aria-label="엔진에 넣을 규칙" rows={2} className="text-sm" />
        <Button size="sm" className="self-end" disabled={!title.trim() || add.isPending} onClick={() => add.mutate()}>추가</Button>
      </div>
    </>
  );
}

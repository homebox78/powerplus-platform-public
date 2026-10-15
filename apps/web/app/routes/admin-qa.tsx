// 관리자 · 통합 검수 — 여섯 개선 체크리스트(powerDeck·powerMock·powerAssets·powerGuide·powerMCP·사이트 공통)를 한 절차로 본다.
// 사용자 2026-10-15 "각 솔루션마다 개선 체크리스트가 있고, 이것들이 취합 체크리스트로 전체가 하나의 검수 프로세스로 자가 개선".
// 서버: api/routes/qa_checklist.php GET /admin/qa/overview · /admin/qa/items, POST /admin/qa/items/{source}/{id}.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import { Link } from "react-router";
import { toast } from "sonner";
import { AdminTitle, Pager, SearchBox, useQueryState } from "@/components/admin/admin-ui";
import { ChoiceButton } from "@/components/hb/choice-button";
import { toastError } from "@/components/hb/confirm";
import { Tag } from "@/components/hb/tag";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtAt } from "@/lib/admin";
import { fetchQaItems, fetchQaOverview, QA_ORIGIN_KO, QA_STATUS_KO, updateQaAny, type QaItem, type QaStatus } from "@/lib/qa";
import { cn } from "@/lib/utils";
import type { Route } from "./+types/admin-qa";

export const meta: Route.MetaFunction = () => [{ title: "통합 검수 — powerPlus 관리자" }];

const STEPS = [
  { n: "1", t: "발견", d: "판정기·자동 수집·시험·사용자 의견이 같은 결함을 한 줄에 쌓는다" },
  { n: "2", t: "고치는 중", d: "다시 걸림 → 많이 걸린 순으로 집는다" },
  { n: "3", t: "고침", d: "고친 방법과 커밋을 남긴다" },
  { n: "4", t: "지켜봄", d: "고친 줄이 다시 걸리면 자동으로 다시 열린다" },
];
const STATUS_FILTER: Array<[string, string]> = [["regressed", "다시 걸림"], ["fixing", "고치는 중"], ["fixed", "고침"], ["watch", "지켜봄"], ["wontfix", "안 고침"], ["all", "전체"]];
const ymd = (s: string | null) => (s ? s.slice(0, 10).replace(/-/g, ".") : "—");

export default function AdminQa() {
  const ov = useQuery({ queryKey: ["admin", "qa", "overview"], queryFn: fetchQaOverview });
  const rows = ov.data ?? [];
  const sum = (k: "open" | "fixing" | "regressed" | "new_7d" | "fixed_7d") => rows.reduce((n, r) => n + r[k], 0);
  return (
    <div>
      <AdminTitle title="통합 검수" desc="솔루션마다 쌓인 개선 체크리스트를 한 절차로 봅니다. 상태를 바꾸면 각 솔루션 체크리스트에 그대로 반영됩니다." />

      <ol className="mt-7 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
        {STEPS.map((s) => (
          <li key={s.n} className="bg-ground px-4 py-3">
            <p className="text-sm font-bold"><span className="mr-1.5 tabular-nums text-ink-4">{s.n}</span>{s.t}</p>
            <p className="mt-1 text-xs leading-[1.55] text-ink-4">{s.d}</p>
          </li>
        ))}
      </ol>

      <div className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm text-ink-3">
        <span>열림 <b className="text-ink tabular-nums">{sum("open") + sum("fixing")}</b></span>
        <span>다시 걸림 <b className={cn("tabular-nums", sum("regressed") > 0 ? "text-point-ink" : "text-ink")}>{sum("regressed")}</b></span>
        <span>7일 새로 <b className="text-ink tabular-nums">{sum("new_7d")}</b></span>
        <span>7일 고침 <b className="text-ink tabular-nums">{sum("fixed_7d")}</b></span>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-line">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead>솔루션 · 자가 개선 고리</TableHead>
              <TableHead className="w-[76px] max-sm:w-[56px]">열림</TableHead>
              <TableHead className="w-[88px] max-sm:w-[64px]">다시 걸림</TableHead>
              <TableHead className="hidden w-[80px] md:table-cell">7일 새로</TableHead>
              <TableHead className="hidden w-[80px] md:table-cell">7일 고침</TableHead>
              <TableHead className="hidden w-[76px] lg:table-cell">지켜봄</TableHead>
              <TableHead className="hidden w-[112px] lg:table-cell">가장 오래된 열림</TableHead>
              <TableHead className="w-[48px]"><span className="sr-only">열기</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.source}>
                <TableCell className="text-left">
                  <Link to={r.page} className="block truncate font-semibold hover:underline">{r.name}</Link>
                  <span className="block truncate text-xs text-ink-4" title={r.loop}>{r.loop}</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{(r.open + r.fixing).toLocaleString()}</TableCell>
                <TableCell className={cn("text-right tabular-nums", r.regressed > 0 && "font-bold text-point-ink")}>{r.regressed.toLocaleString()}</TableCell>
                <TableCell className="hidden text-right tabular-nums md:table-cell">{r.new_7d.toLocaleString()}</TableCell>
                <TableCell className="hidden text-right tabular-nums md:table-cell">{r.fixed_7d.toLocaleString()}</TableCell>
                <TableCell className="hidden text-right tabular-nums lg:table-cell">{r.watch.toLocaleString()}</TableCell>
                <TableCell className="hidden text-center tabular-nums text-ink-3 lg:table-cell">{ymd(r.oldest_open)}</TableCell>
                <TableCell className="text-center"><Button variant="ghost" size="icon" className="size-8" asChild><Link to={r.page} aria-label={`${r.name} 체크리스트 열기`}><ChevronRight className="size-4" /></Link></Button></TableCell>
              </TableRow>
            ))}
            {ov.isLoading && <TableRow><TableCell colSpan={8} className="py-6"><Skeleton className="h-10 w-full" /></TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <h2 className="mt-10 text-xl font-extrabold tracking-[-0.02em]">검수할 항목</h2>
      <p className="mt-1 text-sm text-ink-4">여섯 체크리스트를 다시 걸림 → 고치는 중 → 많이 걸린 순으로 한 줄에 놓았습니다.</p>
      <Items sources={rows.map((r) => ({ id: r.source, label: r.name, count: r.open + r.fixing }))} />
    </div>
  );
}

function Items({ sources }: { sources: Array<{ id: string; label: string; count: number }> }) {
  const { get, set, page } = useQueryState();
  const f = { source: get("source"), status: get("status") || "open", q: get("q"), sort: get("sort"), page };
  const list = useQuery({ queryKey: ["admin", "qa", "items", f], queryFn: () => fetchQaItems(f) });
  const items = list.data?.data ?? [];
  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ChoiceButton size="sm" label="솔루션" value={f.source} onChange={(v) => set({ source: v })} options={sources.map((s) => ({ ...s, hint: "열린 항목 수" }))} />
        <ChoiceButton size="sm" label="상태" value={f.status === "open" ? "" : f.status} allLabel="열림·고치는 중" onChange={(v) => set({ status: v })} options={STATUS_FILTER.map(([id, label]) => ({ id, label }))} />
        <ChoiceButton size="sm" label="정렬" value={f.sort} allLabel="검수 순서" onChange={(v) => set({ sort: v })} options={[{ id: "recent", label: "최근 발견 순" }]} />
        <SearchBox value={f.q} onSearch={(v) => set({ q: v })} placeholder="제목·내용·식별자 검색" />
        <span className="ml-auto text-sm tabular-nums text-ink-4">{(list.data?.total ?? 0).toLocaleString()}건</span>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-line">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead>항목</TableHead>
              <TableHead className="hidden w-[120px] md:table-cell">솔루션</TableHead>
              <TableHead className="w-[120px] max-sm:w-[88px]">상태</TableHead>
              <TableHead className="w-[72px] max-sm:w-[52px]">횟수</TableHead>
              <TableHead className="hidden w-[150px] lg:table-cell">마지막 발견</TableHead>
              <TableHead className="w-[52px]"><span className="sr-only">처리</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((x) => <ItemRow key={`${x.source}:${x.id}`} x={x} />)}
            {list.data && items.length === 0 && <TableRow><TableCell colSpan={6} className="py-12 text-center text-ink-4">해당하는 항목이 없습니다.</TableCell></TableRow>}
            {list.isLoading && <TableRow><TableCell colSpan={6} className="py-6"><Skeleton className="h-10 w-full" /></TableCell></TableRow>}
            {list.isError && <TableRow><TableCell colSpan={6} className="py-12 text-center text-ink-4">목록을 불러오지 못했습니다.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <Pager page={page} total={list.data?.total ?? 0} limit={list.data?.limit ?? 50} onPage={(p) => set({ page: String(p) })} />
    </>
  );
}

function ItemRow({ x }: { x: QaItem }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (status: QaStatus) => updateQaAny(x.source, x.id, { status }),
    onSuccess: (_, st) => { toast.success(`'${QA_STATUS_KO[st]}'으로 바꿨습니다.`); void qc.invalidateQueries({ queryKey: ["admin", "qa"] }); },
    onError: (e) => toastError(e),
  });
  return (
    <TableRow>
      <TableCell className="text-left">
        <span className="block truncate font-semibold">{x.title}</span>
        <span className="block truncate text-xs text-ink-4"><span className="md:hidden">{x.source_name} · </span>{QA_ORIGIN_KO[x.origin] ?? x.origin} · {x.slug}{x.fix_note ? ` · ${x.fix_note}` : ""}</span>
      </TableCell>
      <TableCell className="hidden text-center md:table-cell">{x.source_name}</TableCell>
      <TableCell className="text-center">
        <span className="inline-flex flex-wrap justify-center gap-1">
          <Tag tone={x.status === "fixed" || x.status === "wontfix" ? "line" : x.status === "fixing" ? "ink" : "soft"}>{QA_STATUS_KO[x.status]}</Tag>
          {x.regressed && <Tag tone="warn">다시 걸림</Tag>}
        </span>
      </TableCell>
      <TableCell className="text-right tabular-nums">{x.hits.toLocaleString()}</TableCell>
      <TableCell className="hidden text-center tabular-nums text-ink-3 lg:table-cell">{fmtAt(x.last_seen)}</TableCell>
      <TableCell className="text-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="size-8" aria-label="상태 바꾸기" disabled={m.isPending}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="text-xs text-ink-4">상태 바꾸기</DropdownMenuLabel>
            {(Object.keys(QA_STATUS_KO) as QaStatus[]).filter((s) => s !== x.status).map((s) => <DropdownMenuItem key={s} onSelect={() => m.mutate(s)}>{QA_STATUS_KO[s]}</DropdownMenuItem>)}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link to={sourcePage(x.source)}>{x.source_name} 체크리스트에서 자세히</Link></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function sourcePage(s: QaItem["source"]): string {
  return s === "deck" ? "/admin/deck/checklist" : s === "mock" ? "/admin/mock/checklist" : s === "site" ? "/admin/site/checklist" : `/admin/qa/${s}`;
}

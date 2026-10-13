// 관리자 · 장표 작업 — deck_jobs 전체(상태·주인·시각·실패 사유) + 엔진 상태 카드 + 30일 작업 추이(shadcn Chart)
// + 행 클릭 시 오른쪽 Sheet 상세(정보·파일·기록·공유 수준 Select·소유자 변경·취소/재실행/삭제). 기획 §9.2 powerDeck > 작업·엔진·품질.
// 부품은 shadcn/ui(Table·Sheet·Select·Badge·Skeleton·AlertDialog·Chart) + hb(ChoiceButton·Copy) — 다른 관리자 화면과 같은 톤.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LiveStatus } from "@/components/hb/live-status";
import { Ban, Cpu, ExternalLink, FileText, MoreHorizontal, RotateCcw, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Area, AreaChart, CartesianGrid, Label, Pie, PieChart, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { AdminTitle, BulkBar, Field, Pager, SearchBox, SortHead, useQueryState, useSelection, useSort } from "@/components/admin/admin-ui";
import { bulkDeckJobs, useBulkRun } from "@/lib/admin-bulk2";
import { Checkbox } from "@/components/ui/checkbox";
import { ChoiceButton } from "@/components/hb/choice-button";
import { Copy } from "@/components/hb/copy";
import { toastError } from "@/components/hb/confirm";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import {
  cancelAdminDeckJob, DECK_STATUS_KO, deleteAdminDeckJob, fetchAdminDeckEngines, fetchAdminDeckJob, fetchAdminDeckJobs, fetchAdminDeckStats,
  fmtAt, fmtBytes, fmtSec, patchAdminDeckJob, requeueAdminDeckJob, SHARE_KO,
} from "@/lib/admin";
import { cn } from "@/lib/utils";
import { MobileCarousel } from "@/components/hb/mobile-carousel";
import { useMobileSections } from "@/components/hb/mobile-sections";
import type { Route } from "./+types/admin-deck";

export const meta: Route.MetaFunction = () => [{ title: "장표 작업 — powerPlus 관리자" }];

const STATUS_IDS = ["queued", "running", "review", "hold", "done", "failed", "canceled", "deleted"] as const;

/** 상태 → shadcn Badge 변형(완료 ok·실패 경고·진행 강조·나머지 중립) */
function StatusBadge({ status }: { status: string }) {
  const cls = status === "done" ? "bg-ok-soft text-ok" : status === "failed" ? "bg-warn-soft text-warn" : status === "running" ? "bg-ink text-white" : status === "deleted" ? "bg-ground-3 text-ink-4 line-through" : "bg-ground-3 text-ink-3";
  return <Badge variant="outline" className={cn("h-6 border-transparent px-2.5 text-xs font-semibold", cls)}>{DECK_STATUS_KO[status] ?? status}</Badge>;
}

const PIE_COLORS: Record<string, string> = { done: "var(--color-chart)", failed: "var(--color-warn)", running: "var(--color-point, #E46B37)", review: "var(--color-ink-3)", queued: "var(--color-line-3)", hold: "var(--color-ink-4)", canceled: "var(--color-line-2)", deleted: "var(--color-line)" };
const pieConfig = Object.fromEntries(STATUS_IDS.map((id) => [id, { label: DECK_STATUS_KO[id] ?? id, color: PIE_COLORS[id] }])) satisfies ChartConfig;
const chartConfig = { done: { label: "완료", color: "var(--color-chart)" }, failed: { label: "실패", color: "var(--color-warn)" }, other: { label: "그 외", color: "var(--color-line-3)" } } satisfies ChartConfig;

export default function AdminDeck() {
  const { get, set, page } = useQueryState();
  const status = get("status");
  const q = get("q");
  const list = useQuery({ queryKey: ["admin", "deck", status, q, page], queryFn: () => fetchAdminDeckJobs({ status, q, page }) });
  const engines = useQuery({ queryKey: ["admin", "deck", "engines"], queryFn: fetchAdminDeckEngines, refetchInterval: 30_000 });
  const stats = useQuery({ queryKey: ["admin", "deck", "stats", 30], queryFn: () => fetchAdminDeckStats(30) });
  const [openId, setOpenId] = useState<string | null>(null);
  const items = list.data?.data ?? [];
  const sel = useSelection(items.map((j) => j.id), [status, q, page]);
  const bulk = useBulkRun(bulkDeckJobs, [["admin", "deck"]], (b) => (b.action === "cancel" ? "취소했습니다" : "지웠습니다"), sel.clear);
  const counts = (list.data?.meta?.counts ?? {}) as Record<string, number>;
  const e = engines.data;
  const s = stats.data;
  const series = (s?.series ?? []).map((d) => ({ ...d, other: d.total - d.done - d.failed, day: d.date.slice(5).replace("-", ".") }));

  const pie = STATUS_IDS.map((id) => ({ status: id, count: counts[id] ?? 0, fill: `var(--color-${id})` })).filter((d) => d.count > 0);
  const pieTotal = pie.reduce((n, d) => n + d.count, 0);
  const jobsRunning = (e?.queue.running ?? 0);
  const queueTotal = e ? e.queue.queued + e.queue.running + e.queue.hold + e.queue.review : 0;
  // 모바일에서는 차트·엔진 카드 셋을 탭 하나로(PC 는 그대로)
  const ms = useMobileSections("보기", [{ value: "trend", label: "30일 추이" }, { value: "pie", label: "상태 분포" }, { value: "engine", label: "엔진" }]);

  return (
    <div className="flex flex-col gap-6">
      <AdminTitle title="장표 작업" desc="모든 사용자의 장표 변환 작업입니다. 행을 누르면 상세가 열리고, 거기서 취소·재실행·삭제·공유 수준을 다룹니다." />

      {/* 통계 카드 4 — shadcn create preview 의 stat card 문법(제목·부제·큰 값·보조 설명) */}
      <MobileCarousel label="장표 지표" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="엔진" desc={e ? `${e.workers.filter((w) => w.online).length}대 온라인 · ${e.workers.length}대 등록` : ""} loading={!e}
          value={e ? (e.online ? "온라인" : "오프라인") : ""} badge={e ? <LiveStatus state={e.online ? "ok" : "warn"}>{e.online ? "연결됨" : "멈춤"}</LiveStatus> : null} />
        <StatCard title="대기열" desc={e ? `진행 ${e.queue.running} · 확인 대기 ${e.queue.review} · 보류 ${e.queue.hold}` : ""} loading={!e}
          value={e ? `${e.queue.queued}건` : ""} badge={e && e.queue.stale > 0 ? <Badge variant="outline" className="h-6 border-transparent bg-warn-soft text-warn">응답 없음 {e.queue.stale}</Badge> : null} />
        <StatCard title="30일 완료율" desc={s ? `${s.summary.done.toLocaleString()} / ${s.summary.total.toLocaleString()}건 · 실패 ${s.summary.failed}` : ""} loading={!s}
          value={s ? (s.summary.done_rate == null ? "—" : `${s.summary.done_rate}%`) : ""} progress={s?.summary.done_rate ?? undefined} />
        <StatCard title="평균 소요" desc={s ? `완료 작업 기준 · 사용 $${s.summary.spent_usd.toFixed(2)}` : ""} loading={!s} value={s ? fmtSec(s.summary.avg_sec) : ""} />
      </MobileCarousel>

      {ms.bar}

      <div className={cn("grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]", ms.value === "engine" && "max-sm:hidden")}>
        {/* 30일 추이 — shadcn Chart "Area Chart - Stacked"(일별 변환 수) + 상태 분포 "Pie Chart - Donut with Text" */}
        <Card className={ms.hide("trend")}>
          <CardHeader>
            <CardTitle>최근 30일 작업</CardTitle>
            <CardDescription>만든 날 기준 일별 변환 수 · 완료·실패·그 외</CardDescription>
          </CardHeader>
          <CardContent>
            {s ? (
              <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full">
                <AreaChart data={series} margin={{ left: -16, right: 8, top: 8 }}>
                  <defs>
                    {(["done", "failed", "other"] as const).map((k) => (
                      <linearGradient key={k} id={`fill-${k}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={`var(--color-${k})`} stopOpacity={0.6} />
                        <stop offset="95%" stopColor={`var(--color-${k})`} stopOpacity={0.08} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} interval={6} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" labelFormatter={(_, p) => `${p?.[0]?.payload?.date ?? ""}`} />} />
                  <Area dataKey="other" type="natural" stackId="a" fill="url(#fill-other)" stroke="var(--color-other)" />
                  <Area dataKey="failed" type="natural" stackId="a" fill="url(#fill-failed)" stroke="var(--color-failed)" />
                  <Area dataKey="done" type="natural" stackId="a" fill="url(#fill-done)" stroke="var(--color-done)" />
                  <ChartLegend content={<ChartLegendContent />} />
                </AreaChart>
              </ChartContainer>
            ) : <Skeleton className="h-[220px] w-full" />}
          </CardContent>
        </Card>

        {/* 상태 분포 — 도넛 가운데에 전체 건수 */}
        <Card className={cn("flex flex-col", ms.hide("pie"))}>
          <CardHeader className="items-center pb-0">
            <CardTitle>상태 분포</CardTitle>
            <CardDescription>현재 목록 기준 · 전체 {pieTotal.toLocaleString()}건</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 pb-0">
            {list.data ? (
              <ChartContainer config={pieConfig} className="mx-auto aspect-square max-h-[220px]">
                <PieChart>
                  <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                  <Pie data={pie} dataKey="count" nameKey="status" innerRadius={58} strokeWidth={4}>
                    <Label content={({ viewBox }) => {
                      if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null;
                      return (
                        <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                          <tspan x={viewBox.cx} y={viewBox.cy} className="fill-ink text-2xl font-extrabold tabular-nums">{pieTotal.toLocaleString()}</tspan>
                          <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 22} className="fill-ink-4 text-xs">작업</tspan>
                        </text>
                      );
                    }} />
                  </Pie>
                  <ChartLegend content={<ChartLegendContent nameKey="status" />} className="flex-wrap" />
                </PieChart>
              </ChartContainer>
            ) : <Skeleton className="mx-auto aspect-square max-h-[220px] w-[220px]" />}
          </CardContent>
        </Card>
      </div>

      <div className={cn("grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]", ms.value !== "engine" && "max-sm:hidden")}>
        {/* 엔진 상태 — 카드 제목/부제 + 상태 Badge + 진행바 */}
        <Card className={cn("xl:col-span-2", ms.hide("engine"))}>
          <CardHeader>
            <CardTitle>엔진 상태</CardTitle>
            <CardDescription>{e ? `지금 ${jobsRunning}건 진행 · 대기열 ${queueTotal}건` : "불러오는 중"}</CardDescription>
            {e && <CardAction><LiveStatus state={e.online ? "ok" : "warn"}>{e.online ? "연결됨" : "끊김"}</LiveStatus></CardAction>}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!e && [0, 1].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            {e && e.workers.length === 0 && <Copy className="text-md text-ink-4" text="등록된 엔진이 없습니다." />}
            {e?.workers.map((w) => (
              <div key={w.name} className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", w.online ? "bg-ok-soft text-ok" : "bg-ground-3 text-ink-4")} aria-hidden><Cpu className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-md font-semibold">{w.name}</div>
                    <div className="truncate text-xs text-ink-4">{w.online ? `진행 ${w.running}건` : `마지막 통신 ${fmtAt(w.seen_at)}`}</div>
                  </div>
                  <LiveStatus state={w.online ? "ok" : "off"}>{w.online ? "연결됨" : "끊김"}</LiveStatus>
                </div>
                <Progress value={w.online ? Math.min(100, w.running * 100) : 0} aria-label={`${w.name} 사용률`} className="h-1.5" />
              </div>
            ))}
            {e && (
              <div className="flex flex-col gap-2 border-t border-line pt-4">
                <QueueRow label="대기" value={e.queue.queued} total={queueTotal} />
                <QueueRow label="진행" value={e.queue.running} total={queueTotal} />
                <QueueRow label="확인 대기" value={e.queue.review} total={queueTotal} />
                <QueueRow label="보류" value={e.queue.hold} total={queueTotal} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 작업 목록 — 검색 + 상태 칩 + 목록 행(아이콘 박스·제목/부제·우측 값·… 메뉴) */}
      <Card>
        <CardHeader>
          <CardTitle>작업 목록</CardTitle>
          <CardDescription>{(list.data?.total ?? 0).toLocaleString()}건</CardDescription>
          <CardAction className="flex flex-wrap items-center gap-2 max-sm:col-span-2 max-sm:col-start-1 max-sm:row-start-3 max-sm:justify-self-stretch">
            <label className="flex h-8 items-center gap-2 text-sm text-ink-3"><Checkbox aria-label="이 쪽 모두 고르기" checked={sel.allOn ? true : sel.someOn ? "indeterminate" : false} onCheckedChange={sel.togglePage} />이 쪽 모두</label>
            <ChoiceButton size="sm" label="상태" value={status} onChange={(v) => set({ status: v })} options={STATUS_IDS.map((id) => ({ id, label: DECK_STATUS_KO[id] ?? id, count: counts[id] ?? 0 }))} />
            <SearchBox size="sm" value={q} onSearch={(v) => set({ q: v })} placeholder="제목·파일·이메일·작업 번호" />
          </CardAction>
        </CardHeader>
        <CardContent className="px-0">
          <ul className="divide-y divide-line">
            {items.map((j) => (
              <li key={j.id} role="button" tabIndex={0} aria-label={`${j.title || j.filename || j.id} 상세`} className="flex cursor-pointer items-center gap-3 px-6 py-3 outline-none hover:bg-ground-2 focus-visible:bg-ground-2"
                onClick={() => setOpenId(j.id)} onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setOpenId(j.id); } }}>
                <span className="flex w-5 shrink-0 justify-center" onClick={(ev) => ev.stopPropagation()} onKeyDown={(ev) => ev.stopPropagation()}><Checkbox aria-label={`${j.title || j.filename || j.id} 고르기`} checked={sel.has(j.id)} onCheckedChange={() => sel.toggle(j.id)} /></span>
                <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", j.status === "failed" ? "bg-warn-soft text-warn" : j.status === "done" ? "bg-ok-soft text-ok" : "bg-ground-3 text-ink-3")} aria-hidden><FileText className="size-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-md font-semibold">{j.title || j.filename || "제목 없는 작업"}</div>
                  <div className="truncate text-xs text-ink-4">{j.owner || j.email}{j.filename ? ` · ${j.filename}` : ""}{j.slides != null ? ` · ${j.slides}장` : ""}</div>
                  {j.status === "failed" && j.error && <div className="mt-0.5 line-clamp-1 text-xs text-warn">{j.error}</div>}
                </div>
                {j.status === "running" && j.progress != null && <Progress value={j.progress} className="hidden h-1.5 w-24 md:block" aria-label="진행률" />}
                <div className="hidden text-right lg:block">
                  <div className="text-xs tabular-nums text-ink-3">{fmtAt(j.created_at)}</div>
                  {j.spent_usd != null && j.spent_usd > 0 && <div className="text-xs tabular-nums text-ink-4">${j.spent_usd.toFixed(2)}</div>}
                </div>
                <StatusBadge status={j.status} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label="작업 메뉴" onClick={(ev) => ev.stopPropagation()} onKeyDown={(ev) => ev.stopPropagation()}><MoreHorizontal className="size-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={(ev) => ev.stopPropagation()}>
                    <DropdownMenuItem onSelect={() => setOpenId(j.id)}>상세 보기</DropdownMenuItem>
                    <DropdownMenuItem asChild><Link to={j.url}>결과 화면 열기</Link></DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => { void navigator.clipboard?.writeText(j.id); toast.success("작업 번호를 복사했습니다."); }}>작업 번호 복사</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
            {list.data && items.length === 0 && <li className="px-6 py-12 text-center text-md text-ink-4">해당하는 작업이 없습니다.</li>}
            {list.isLoading && [0, 1, 2].map((i) => <li key={i} className="px-6 py-3"><Skeleton className="h-10 w-full" /></li>)}
          </ul>
          <div className="px-6">
            <BulkBar sel={sel} actions={[
              { label: "취소", icon: <Ban aria-hidden />, confirm: "고른 작업 {n}개를 취소할까요? 진행 중인 작업은 현재 단계를 마치고 멈춥니다. 완료·실패한 작업은 건너뜁니다.", onRun: (ids) => bulk.mutate({ action: "cancel", ids }), disabled: bulk.isPending },
              { label: "삭제", icon: <Trash2 aria-hidden />, danger: true, confirm: "고른 작업 {n}개와 파일을 지울까요? 되돌릴 수 없습니다. 진행 중인 작업은 건너뜁니다.", onRun: (ids) => bulk.mutate({ action: "delete", ids }), disabled: bulk.isPending },
            ]} />
          </div>
          <div className="px-6"><Pager page={page} total={list.data?.total ?? 0} limit={list.data?.limit ?? 30} onPage={(p) => set({ page: String(p) })} /></div>
        </CardContent>
      </Card>

      <Sheet open={!!openId} onOpenChange={(v) => { if (!v) setOpenId(null); }}>
        <SheetContent className="w-full overflow-y-auto bg-ground text-ink sm:max-w-[560px]">
          {openId && <JobDetail id={openId} onClose={() => setOpenId(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** 통계 카드 — shadcn Card 문법(제목·부제·큰 값·배지·진행바) */
function StatCard({ title, desc, value, badge, progress, loading, className }: { title: string; desc: string; value: string; badge?: React.ReactNode; progress?: number; loading: boolean; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl font-extrabold tabular-nums">{loading ? <Skeleton className="h-8 w-24" /> : value}</CardTitle>
        {badge && <CardAction>{badge}</CardAction>}
      </CardHeader>
      {(desc || progress != null) && (
        <CardContent className="flex flex-col gap-2">
          {progress != null && <Progress value={progress} className="h-1.5" aria-label={title} />}
          {desc && <Copy className="text-xs text-ink-4" text={desc} />}
        </CardContent>
      )}
    </Card>
  );
}

/** 대기열 한 줄 — 라벨 · 진행바 · 값 */
function QueueRow({ label, value, total }: { label: string; value: number; total: number }) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)_40px] items-center gap-3 text-sm">
      <span className="text-ink-4">{label}</span>
      <Progress value={total ? (value / total) * 100 : 0} className="h-1.5" aria-label={label} />
      <span className="text-right tabular-nums">{value}</span>
    </div>
  );
}

function JobDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const d = useQuery({ queryKey: ["admin", "deck", "job", id], queryFn: () => fetchAdminDeckJob(id), refetchInterval: (q) => (q.state.data?.status === "running" ? 5_000 : false) });
  const j = d.data;
  const fs = useSort(j?.files.items ?? [], { kind: (f) => f.kind, name: (f) => f.name, size: (f) => f.size });
  const [shared, setShared] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [askDelete, setAskDelete] = useState(false);
  const done = (msg: string) => { toast.success(msg); void qc.invalidateQueries({ queryKey: ["admin", "deck"] }); };
  const cancel = useMutation({ mutationFn: () => cancelAdminDeckJob(id), onSuccess: (r) => done(r.status === "running" ? "취소를 요청했습니다. 엔진이 단계를 마치면 멈춥니다." : "취소했습니다."), onError: (e) => toastError(e) });
  const requeue = useMutation({ mutationFn: () => requeueAdminDeckJob(id), onSuccess: () => done("대기열에 다시 올렸습니다."), onError: (e) => toastError(e) });
  const remove = useMutation({ mutationFn: () => deleteAdminDeckJob(id), onSuccess: (r) => { done(`작업을 지웠습니다. 파일 ${r.files_removed}개를 삭제했습니다.`); onClose(); }, onError: (e) => toastError(e) });
  const save = useMutation({
    mutationFn: () => patchAdminDeckJob(id, { ...(shared !== null ? { shared: Number(shared) } : {}), ...(email !== null ? { email: email.trim() } : {}) }),
    onSuccess: () => { setShared(null); setEmail(null); done("저장했습니다."); }, onError: (e) => toastError(e),
  });

  if (!j) {
    return (
      <>
        <SheetHeader className="border-b border-line px-6 py-5"><SheetTitle className="text-xl font-bold text-ink">작업 상세</SheetTitle><SheetDescription className="text-ink-4">{id}</SheetDescription></SheetHeader>
        <div className="flex flex-col gap-3 px-6">{d.isError ? <Copy className="text-md text-warn" text="작업을 불러오지 못했습니다." /> : [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-6 w-full" />)}</div>
      </>
    );
  }
  const st = j.status;
  const canCancel = ["queued", "review", "hold", "running"].includes(st) && !(st === "running" && j.cancel_requested);
  const canRequeue = ["failed", "canceled", "done"].includes(st);
  const canDelete = st !== "running" && st !== "deleted";
  const shareVal = shared ?? String(j.shared);
  const emailVal = email ?? j.email;
  const dirty = (shared !== null && Number(shared) !== j.shared) || (email !== null && email.trim() !== j.email);
  const busy = cancel.isPending || requeue.isPending || remove.isPending || save.isPending;

  return (
    <>
      <SheetHeader className="border-b border-line px-6 py-5">
        <SheetTitle className="text-xl font-bold text-ink">{j.title || j.filename || "제목 없는 작업"}</SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-2 text-ink-4"><StatusBadge status={st} /><span className="tabular-nums">{j.id}</span>{j.cancel_requested && st === "running" && <span className="text-warn">취소 요청됨</span>}</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-6 px-6 pb-8">
        <dl className="divide-y divide-line">
          <Field label="주인">{j.owner ?? "—"}<span className="block truncate text-xs text-ink-4">{j.email}</span></Field>
          <Field label="원본">{j.filename ?? "—"}<span className="block text-xs text-ink-4">{fmtBytes(j.size)} · {j.kind === "design" ? "디자인" : "다듬기"} · {j.phase}{j.slides != null ? ` · ${j.slides}장` : ""}</span></Field>
          <Field label="단계">{j.stage ?? "—"}<span className="ml-2 tabular-nums text-ink-4">{j.progress}%</span></Field>
          <Field label="엔진">{j.worker ?? "—"}{j.heartbeat_at && <span className="block text-xs text-ink-4">마지막 통신 {fmtAt(j.heartbeat_at)}</span>}</Field>
          <Field label="시각"><span className="block">만듦 {fmtAt(j.created_at)}</span>{j.started_at && <span className="block">시작 {fmtAt(j.started_at)}</span>}{j.finished_at && <span className="block">끝 {fmtAt(j.finished_at)}{j.duration_sec != null ? ` · ${fmtSec(j.duration_sec)}` : ""}</span>}{j.deleted_at && <span className="block text-warn">삭제 {fmtAt(j.deleted_at)}</span>}</Field>
          <Field label="크레딧"><span className="tabular-nums">${j.spent_usd.toFixed(4)}</span>{j.budget_usd != null && <span className="ml-1 text-ink-4">/ 예산 ${j.budget_usd.toFixed(2)}</span>}</Field>
          <Field label="파일">{j.files.count}개 · {fmtBytes(j.files.bytes)}{j.files.count > 0 && <span className="block text-xs text-ink-4">{Object.entries(j.files.by_kind).map(([k, n]) => `${k} ${n}`).join(" · ")}</span>}</Field>
          {j.error && <Field label="실패 사유"><span className="whitespace-pre-wrap break-words text-warn">{j.error}</span></Field>}
          {j.note && <Field label="요청 사항"><span className="whitespace-pre-wrap">{j.note}</span></Field>}
        </dl>

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-ink-4">공유 · 소유자</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-ink-4" htmlFor="deck-share">공유 수준</label>
              <Select value={shareVal} onValueChange={setShared}>
                <SelectTrigger id="deck-share" size="sm" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{[0, 1, 2, 3].map((n) => <SelectItem key={n} value={String(n)}>{SHARE_KO[n]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-ink-4" htmlFor="deck-email">소유자 이메일</label>
              <Input id="deck-email" type="email" value={emailVal} onChange={(ev) => setEmail(ev.target.value)} className="h-9 text-sm" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => save.mutate()} disabled={!dirty || busy}><Save aria-hidden />저장</Button>
            <Button size="sm" variant="outline" asChild><Link to={j.url} target="_blank" rel="noopener"><ExternalLink aria-hidden />결과 화면</Link></Button>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-ink-4">작업 조작</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => cancel.mutate()} disabled={!canCancel || busy}><Ban aria-hidden />취소</Button>
            <Button size="sm" variant="outline" onClick={() => requeue.mutate()} disabled={!canRequeue || busy}><RotateCcw aria-hidden />다시 돌리기</Button>
            <Button size="sm" variant="destructive" onClick={() => setAskDelete(true)} disabled={!canDelete || busy}><Trash2 aria-hidden />삭제</Button>
          </div>
          <Copy className="text-xs text-ink-4" text="삭제하면 원본·결과 파일이 지워지고 작업 기록만 남습니다. 진행 중인 작업은 먼저 취소해야 합니다." />
        </section>

        {j.events.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-ink-4">최근 기록</h3>
            <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
              {j.events.map((ev) => (
                <li key={ev.id} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 px-3 py-2 text-sm">
                  <span className="tabular-nums text-ink-4">{fmtAt(ev.ts)}</span>
                  <span className={cn("min-w-0 break-words", ev.kind === "error" ? "text-warn" : ev.kind === "warn" ? "text-ink-2" : "")}>{ev.message}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {j.files.items.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-ink-4">파일</h3>
            <div className="mt-2 overflow-hidden rounded-xl border border-line">
              <Table className="table-fixed">
                <TableHeader><TableRow><SortHead s={fs} k="kind" className="w-[76px]">종류</SortHead><SortHead s={fs} k="name">이름</SortHead><SortHead s={fs} k="size" className="w-[84px]">크기</SortHead></TableRow></TableHeader>
                <TableBody>
                  {fs.rows.slice(0, 40).map((f) => (
                    <TableRow key={`${f.kind}/${f.name}`}>
                      <TableCell className="text-center text-xs">{f.kind}</TableCell>
                      <TableCell className="truncate text-left text-sm" title={f.name}>{f.name}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{fmtBytes(f.size)}</TableCell>
                    </TableRow>
                  ))}
                  {j.files.items.length > 40 && <TableRow><TableCell colSpan={3} className="text-center text-xs text-ink-4">외 {j.files.items.length - 40}개</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </section>
        )}
      </div>

      <AlertDialog open={askDelete} onOpenChange={setAskDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이 작업을 지울까요?</AlertDialogTitle>
            <AlertDialogDescription asChild><Copy as="div" text={`“${j.title || j.filename || j.id}”의 파일 ${j.files.count}개(${fmtBytes(j.files.bytes)})가 서버에서 지워집니다. 되돌릴 수 없습니다. 작업 기록과 사용 금액은 남습니다.`} /></AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction className="border-warn bg-warn text-white hover:bg-warn/90" onClick={() => remove.mutate()}>지우기</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

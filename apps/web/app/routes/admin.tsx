// 관리자 대시보드 — 기획 §9.2. 구조는 shadcn blocks dashboard-01(KPI 카드 4 → 추이 카드(기간 토글+AreaChart) → Tabs+DataTable)을 따르고,
// 지표는 옛 파워플러스 관리자(UsageService::analytics)에서 살아남은 것만: 핵심 3지표·추이·요일×시간·카테고리 실사용·인기 에셋·활발한 사용자·최근 삽입.
// 데이터 = GET /admin/stats(합계·감사 로그) + GET /admin/analytics(분석, 한 번). 가드는 admin-layout.tsx. 색은 무채색, 주황(point)은 추세 배지 한 곳만.
import { SegTabs } from "@/components/hb/seg-tabs";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Columns3, MoreHorizontal, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Label, Line, LineChart, Pie, PieChart, XAxis, YAxis } from "recharts";
import { Copy } from "@/components/hb/copy";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminTitle, SortHead, useSort } from "@/components/admin/admin-ui";
import { AtText } from "@/components/admin/at-text";
import { AUDIT_KO, auditTargetKo, type AdminAnalytics, type AdminStats, type AnalyticsPeriod, CHANNEL_KO, DECK_STATUS_KO, fetchAnalytics, fetchStats, fetchSystem, fmtAt } from "@/lib/admin";
import { useMe } from "@/lib/auth";
import { LiveStatus } from "@/components/hb/live-status";
import type { AdminSystem, MetricsRange, ServerMetrics } from "@/lib/admin";
import { fetchServerMetrics } from "@/lib/admin";
import { cn } from "@/lib/utils";
import { MobileCarousel } from "@/components/hb/mobile-carousel";
import type { Route } from "./+types/admin";

export const meta: Route.MetaFunction = () => [{ title: "대시보드 — powerPlus 관리자" }];

const PERIOD_KO: Record<AnalyticsPeriod, string> = { day: "일", month: "월", year: "년" };
const n = (v: number | undefined | null) => (v === undefined || v === null ? "—" : v.toLocaleString());

export default function AdminDashboard() {
  const { isAdmin } = useMe();
  const [period, setPeriod] = useState<AnalyticsPeriod>("month");
  const stats = useQuery({ queryKey: ["admin", "stats"], queryFn: fetchStats, enabled: isAdmin });
  const an = useQuery({ queryKey: ["admin", "analytics", period], queryFn: () => fetchAnalytics(period), enabled: isAdmin, placeholderData: (prev) => prev });
  const s = stats.data;
  const a = an.data;
  // 최근 변경 기록 정렬
  const aud = useSort(s?.audit ?? [], { at: (x) => x.created_at, action: (x) => x.action, target: (x) => auditTargetKo(x.target), actor: (x) => x.actor ?? "" });

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div><AdminTitle title="대시보드" desc="오늘 처리할 일 → 서비스 상태 → 추이 순으로 봅니다." /></div>

      <TodoStrip s={s} />

      <SystemStrip />

      <TrendCard a={a} period={period} onPeriod={setPeriod} fetching={an.isFetching} />

      <ModuleCards a={a} loading={an.isLoading} />

      <div className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MiniKpi label="사용자" value={n(s?.users.total)} sub={s ? `임직원 ${s.users.staff.toLocaleString()} · 외부 ${s.users.external.toLocaleString()}` : ""} to="/admin/users" />
        <MiniKpi label="에셋" value={n(s?.assets)} sub="powerAssets" to="/admin/assets" />
        <MiniKpi label="장표 작업" value={n(s?.deck_jobs)} sub="powerDeck" to="/admin/deck" />
        <MiniKpi label="시안" value={n(s?.mockups)} sub="powerMock" to="/admin/mockups" />
        <MiniKpi label="열린 문의" value={n(s?.contacts_open)} sub="답변 전" to="/admin/contacts" alert={(s?.contacts_open ?? 0) > 0} />
        <MiniKpi label="삭제요청 대기" value={n(s?.removals.pending)} sub={s && s.removals.overdue > 0 ? `기한 지남 ${s.removals.overdue}건` : "48시간 안에 처리"} to="/admin/removals" alert={(s?.removals.overdue ?? 0) > 0} />
      </div>

      <ModuleTabs a={a} loading={an.isLoading} />

      <ServerResources />

      <Card>
        <CardHeader>
          <CardTitle>최근 변경 기록</CardTitle>
          <CardDescription>권한·콘텐츠를 바꾼 기록 10건입니다.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <SortHead s={aud} k="at" className="w-28 md:w-[150px]">시각</SortHead>
                <SortHead s={aud} k="action" className="w-32 md:w-[170px]">동작</SortHead>
                <SortHead s={aud} k="target">대상</SortHead>
                <SortHead s={aud} k="actor" className="hidden w-[220px] md:table-cell">한 사람</SortHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aud.rows.map((x) => (
                <TableRow key={x.id}>
                  <TableCell className="text-center tabular-nums text-ink-3"><AtText at={x.created_at} /></TableCell>
                  <TableCell className="text-center"><Badge variant="outline" className="max-w-full" title={AUDIT_KO[x.action] ?? x.action}><span className="truncate">{AUDIT_KO[x.action] ?? x.action}</span></Badge></TableCell>
                  <TableCell className="truncate text-left text-ink-3" title={auditTargetKo(x.target)}>{auditTargetKo(x.target)}</TableCell>
                  <TableCell className="hidden truncate text-left md:table-cell">{x.actor ?? "익명·시스템"}</TableCell>
                </TableRow>
              ))}
              {s && s.audit.length === 0 && <TableRow><TableCell colSpan={4} className="py-10 text-center text-ink-4">기록이 없습니다.</TableCell></TableRow>}
              {stats.isLoading && <TableRow><TableCell colSpan={4} className="py-8"><Skeleton className="h-5 w-full" /></TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

/** 도넛 진행(ui.shadcn.com/create 통계 카드 문법) — conic-gradient 한 줄, 의존성 0 */
function Donut({ pct }: { pct: number }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="grid size-12 place-items-center rounded-full" style={{ background: `conic-gradient(var(--color-ink) ${p}%, var(--color-ground-4) 0)` }} role="img" aria-label={`${p}%`}>
      <div className="grid size-9 place-items-center rounded-full bg-ground text-[11px] font-bold tabular-nums">{Math.round(p)}%</div>
    </div>
  );
}

/** 오늘 할 일 — 열린 문의·삭제요청 대기. 둘 다 0 이면 "처리할 것 없음" 한 줄. */
function TodoStrip({ s }: { s?: AdminStats }) {
  if (!s) return null;
  const items = [
    { n: s.contacts_open, label: "답변 전 문의", to: "/admin/contacts", urgent: false },
    { n: s.removals.pending, label: s.removals.overdue > 0 ? `삭제요청 대기 · 기한 지남 ${s.removals.overdue}건` : "삭제요청 대기", to: "/admin/removals?status=pending", urgent: s.removals.overdue > 0 },
  ].filter((x) => x.n > 0);
  if (!items.length) return <p className="rounded-panel border border-line bg-ground-2 px-4 py-3 text-md text-ink-3">오늘 처리할 것 없음</p>;
  return (
    <div className="flex flex-wrap gap-2" aria-label="오늘 할 일">
      {items.map((x) => (
        <Link key={x.to} to={x.to} className={cn("inline-flex min-h-10 items-center gap-2 rounded-panel border px-4 py-2 text-md font-semibold transition-colors hover:bg-ground-2", x.urgent ? "border-point text-point-ink" : "border-line text-ink")}>
          {x.urgent && <AlertTriangle className="size-4 shrink-0" aria-hidden />}
          {x.label} <span className="tabular-nums">{x.n}</span>
          <ArrowRight className="size-4 shrink-0" aria-hidden />
        </Link>
      ))}
    </div>
  );
}

function MiniKpi({ label, value, sub, to, alert }: { label: string; value: string; sub: string; to?: string; alert?: boolean }) {
  const body = (
    <>
      <span className="text-xs text-ink-4">{label}</span>
      <span className={cn("mt-1 text-[22px] font-extrabold tabular-nums leading-none tracking-[-0.02em]", alert && "text-point-ink")}>{value}</span>
      <span className={cn("mt-1.5 truncate text-xs", alert ? "font-semibold text-point-ink" : "text-ink-4")}>{sub}</span>
    </>
  );
  return (
    <Card size="sm" className={cn("min-w-0 transition-shadow", to && "hover:ring-ink")}>
      {to ? <Link to={to} className="flex min-w-0 flex-col px-3">{body}</Link> : <div className="flex min-w-0 flex-col px-3">{body}</div>}
    </Card>
  );
}

// ── ② 추이 카드 — 제목·부제 + 우측 SegTabs(일/월/년) + AreaChart(그라데이션, 겹침) ──
const trendConfig = {
  uses: { label: "에셋 삽입", color: "var(--color-chart)" },
  logins: { label: "로그인", color: "var(--color-line-3)" },
  deck: { label: "장표 작업", color: "var(--color-chart-2)" },
  mock: { label: "시안 판정", color: "var(--color-line)" },
} satisfies ChartConfig;

function fmtBucket(b: string, p: AnalyticsPeriod) {
  if (p === "day") return b.slice(5).replace("-", ".");
  if (p === "month") return `${b.slice(2, 4)}.${b.slice(5)}`;
  return b;
}

function TrendCard({ a, period, onPeriod, fetching }: { a?: AdminAnalytics; period: AnalyticsPeriod; onPeriod: (p: AnalyticsPeriod) => void; fetching: boolean }) {
  const data = a?.trend ?? [];
  const sum = (k: keyof typeof trendConfig) => data.reduce((t, x) => t + x[k], 0);
  return (
    <Card className="min-w-0 @container/trend">
      <CardHeader>
        <CardTitle>추이</CardTitle>
        <CardDescription>
          <span className="hidden @[540px]/trend:inline">기간별 로그인·에셋 삽입·장표 작업·시안 판정 수입니다.</span>
          <span className="@[540px]/trend:hidden">기간별 활동 수</span>
        </CardDescription>
        <CardAction>
          <SegTabs label="기간" value={period} onChange={onPeriod} items={(Object.keys(PERIOD_KO) as AnalyticsPeriod[]).map((p) => ({ value: p, label: PERIOD_KO[p] }))} />
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-2 sm:px-6">
        {!a ? (
          <Skeleton className="h-[260px] w-full" />
        ) : data.length === 0 ? (
          <div className="flex h-[260px] items-center justify-center text-ink-4">아직 기록이 없습니다.</div>
        ) : (
          <ChartContainer config={trendConfig} className={cn("aspect-auto h-[260px] w-full transition-opacity", fetching && "opacity-60")}>
            <AreaChart data={data} margin={{ left: 4, right: 4 }}>
              <defs>
                {(Object.keys(trendConfig) as Array<keyof typeof trendConfig>).map((k) => (
                  <linearGradient key={k} id={`fill-${k}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={`var(--color-${k})`} stopOpacity={0.6} />
                    <stop offset="95%" stopColor={`var(--color-${k})`} stopOpacity={0.05} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="bucket" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={(v: string) => fmtBucket(v, period)} />
              <YAxis width={36} tickLine={false} axisLine={false} allowDecimals={false} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" labelFormatter={(v) => fmtBucket(String(v), period)} />} />
              <Area dataKey="mock" type="monotone" fill="url(#fill-mock)" stroke="var(--color-mock)" dot={{ r: 2 }} />
              <Area dataKey="deck" type="monotone" fill="url(#fill-deck)" stroke="var(--color-deck)" dot={{ r: 2 }} />
              <Area dataKey="logins" type="monotone" fill="url(#fill-logins)" stroke="var(--color-logins)" dot={{ r: 2 }} />
              <Area dataKey="uses" type="monotone" fill="url(#fill-uses)" stroke="var(--color-uses)" strokeWidth={2} dot={{ r: 2.5, fill: "var(--color-uses)" }} activeDot={{ r: 4 }} />
              <ChartLegend content={<ChartLegendContent />} />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
      <CardFooter className="flex-wrap gap-x-6 gap-y-1 border-t-0 bg-transparent pt-0 text-sm text-ink-4">
        {a && data.length > 0 && (Object.keys(trendConfig) as Array<keyof typeof trendConfig>).map((k) => (
          <span key={k}>{trendConfig[k].label} <b className="tabular-nums text-ink">{sum(k).toLocaleString()}</b></span>
        ))}
        {a && <span className="basis-full text-xs">로그인은 사용자별 마지막 로그인 기준이라 과거 구간은 적게 보입니다.</span>}
      </CardFooter>
    </Card>
  );
}

// ── ③ Tabs(개수 Badge) + 열 설정 Dropdown + DataTable ──
type TabKey = "assets" | "users" | "recent" | "cats" | "heat";
const TAB_KO: Record<TabKey, string> = { assets: "인기 에셋", users: "활발한 사용자", recent: "최근 삽입", cats: "카테고리", heat: "요일×시간" };
const COLS: Record<TabKey, Array<{ key: string; label: string }>> = {
  assets: [{ key: "thumb", label: "썸네일" }, { key: "cat", label: "분류" }, { key: "uses", label: "삽입" }],
  users: [{ key: "kind", label: "구분" }, { key: "email", label: "이메일" }, { key: "share", label: "비중" }],
  recent: [{ key: "thumb", label: "썸네일" }, { key: "cat", label: "분류" }, { key: "channel", label: "경로" }, { key: "user", label: "사용자" }],
  cats: [{ key: "items", label: "등록" }, { key: "used", label: "쓰인 에셋" }, { key: "bar", label: "막대" }],
  heat: [],
};
const PAGE = 15;

function DetailTabs({ a, loading }: { a?: AdminAnalytics; loading: boolean }) {
  const [tab, setTab] = useState<TabKey>("assets");
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const show = (k: string) => !hidden[`${tab}:${k}`];
  const toggle = (k: string) => setHidden((h) => ({ ...h, [`${tab}:${k}`]: !h[`${tab}:${k}`] }));
  const counts: Record<TabKey, number> = {
    assets: a?.top_assets.length ?? 0, users: a?.top_users.length ?? 0, recent: a?.recent.length ?? 0, cats: a?.categories.length ?? 0,
    heat: a ? a.heatmap.flat().reduce((t, v) => t + v, 0) : 0,
  };
  // 표마다 정렬 — 순위·선택 칸은 원래 순서(받은 순서)를 기준으로 둔다
  const ta = useSort(a?.top_assets ?? [], { name: (x) => x.name ?? "", cat: (x) => x.category_ko, uses: (x) => x.uses });
  const tu = useSort(a?.top_users ?? [], { name: (u) => u.name, kind: (u) => u.kind, email: (u) => u.email ?? "", uses: (u) => u.uses, share: (u) => u.share });
  const tr = useSort(a?.recent ?? [], { at: (r) => r.at, name: (r) => r.asset?.name ?? "", cat: (r) => r.asset?.category_ko ?? "", channel: (r) => CHANNEL_KO[r.channel] ?? r.channel, user: (r) => r.user ?? "" });
  const tc = useSort(a?.categories ?? [], { cat: (c) => c.category_ko, uses: (c) => c.uses, used: (c) => c.used_items, items: (c) => c.items, ratio: (c) => c.uses });
  // 최근 삽입은 전체를 정렬한 뒤 쪽으로 나눈다
  const recentPage = useMemo(() => tr.rows.slice((page - 1) * PAGE, page * PAGE), [tr.rows, page]);
  const lastPage = Math.max(1, Math.ceil((a?.recent.length ?? 0) / PAGE));
  const maxCat = Math.max(1, ...(a?.categories.map((c) => c.uses) ?? [1]));
  const maxAsset = Math.max(1, ...(a?.top_assets.map((x) => x.uses) ?? [1]));
  const pick = (id: string) => (
    <Checkbox checked={!!picked[id]} onCheckedChange={(v) => setPicked((p) => ({ ...p, [id]: v === true }))} aria-label="선택" />
  );
  const rowMenu = (items: Array<{ label: string; to?: string }>) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="text-ink-4" aria-label="더 보기"><MoreHorizontal /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((it) => it.to ? <DropdownMenuItem key={it.label} asChild><Link to={it.to}>{it.label}</Link></DropdownMenuItem> : <DropdownMenuItem key={it.label}>{it.label}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const thumb = (src: string | null, alt: string) => (
    <Avatar className="size-16 rounded-lg bg-ground-3 ring-1 ring-line">
      {src && <AvatarImage src={src} alt={alt} className="object-contain p-1" />}
      <AvatarFallback className="rounded-lg text-xs text-ink-4">없음</AvatarFallback>
    </Avatar>
  );

  return (
    <Tabs value={tab} onValueChange={(v) => { setTab(v as TabKey); setPage(1); }} className="min-w-0 gap-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <TabsList className="h-auto flex-wrap">
          {(Object.keys(TAB_KO) as TabKey[]).map((k) => (
            <TabsTrigger key={k} value={k} className="h-9 px-3">
              {TAB_KO[k]}
              <Badge variant="secondary" className="ml-0.5 h-4 min-w-5 px-1 tabular-nums">{loading ? "…" : counts[k].toLocaleString()}</Badge>
            </TabsTrigger>
          ))}
        </TabsList>
        {COLS[tab].length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm"><Columns3 aria-hidden /> 열 설정</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuLabel>보이는 열</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {COLS[tab].map((c) => (
                <DropdownMenuCheckboxItem key={c.key} checked={show(c.key)} onCheckedChange={() => toggle(c.key)}>{c.label}</DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <Card className="min-w-0 py-0">
        {loading && <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>}

        <TabsContent value="assets">
          {a && (
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">{pick("all:assets")}</TableHead>
                  <TableHead className="w-14">순위</TableHead>
                  {show("thumb") && <TableHead className="hidden w-24 sm:table-cell">썸네일</TableHead>}
                  <SortHead s={ta} k="name">에셋</SortHead>
                  {show("cat") && <SortHead s={ta} k="cat" className="hidden w-24 md:table-cell">분류</SortHead>}
                  {show("uses") && <SortHead s={ta} k="uses" className="w-20 md:w-40">삽입</SortHead>}
                  <TableHead className="w-[68px]"><span className="sr-only">메뉴</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ta.rows.map((x) => { const i = a.top_assets.indexOf(x); return (
                  <TableRow key={x.id} data-state={picked[x.id] ? "selected" : undefined}>
                    <TableCell className="text-center">{pick(x.id)}</TableCell>
                    <TableCell className="text-center"><RankBadge i={i} /></TableCell>
                    {show("thumb") && <TableCell className="hidden sm:table-cell">{thumb(x.thumb_url, "")}</TableCell>}
                    <TableCell className="min-w-0 text-left">
                      <span className="block truncate font-medium">{x.name ?? "이름 없음"}</span>
                      <span className="block truncate text-xs text-ink-4">{x.id}</span>
                    </TableCell>
                    {show("cat") && <TableCell className="hidden text-center md:table-cell"><Badge variant="outline">{x.category_ko}</Badge></TableCell>}
                    {show("uses") && (
                      <TableCell className="min-w-0">
                        <span className="flex items-center justify-end gap-2.5">
                          <span className="hidden h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-ground-4 md:block" aria-hidden>
                            <span className="block h-full rounded-full bg-ink" style={{ width: `${Math.round((x.uses / maxAsset) * 100)}%` }} />
                          </span>
                          <span className="min-w-10 text-right tabular-nums font-semibold">{x.uses.toLocaleString()}</span>
                        </span>
                      </TableCell>
                    )}
                    <TableCell className="text-center">{rowMenu([{ label: "에셋 보기", to: `/assets/items/${x.id}` }, { label: "관리자에서 열기", to: `/admin/assets?q=${x.id}` }])}</TableCell>
                  </TableRow>
                ); })}
                {a.top_assets.length === 0 && <Empty cols={7} />}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="users">
          {a && (
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">{pick("all:users")}</TableHead>
                  <TableHead className="w-14">순위</TableHead>
                  <SortHead s={tu} k="name">사용자</SortHead>
                  {show("kind") && <SortHead s={tu} k="kind" className="w-20">구분</SortHead>}
                  {show("email") && <SortHead s={tu} k="email" className="hidden w-[220px] md:table-cell">이메일</SortHead>}
                  <SortHead s={tu} k="uses" className="w-24">삽입</SortHead>
                  {show("share") && <SortHead s={tu} k="share" className="hidden w-20 sm:table-cell">비중</SortHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tu.rows.map((u) => { const i = a.top_users.indexOf(u); return (
                  <TableRow key={`${u.email}-${i}`} data-state={picked[`u${i}`] ? "selected" : undefined}>
                    <TableCell className="text-center">{pick(`u${i}`)}</TableCell>
                    <TableCell className="text-center"><RankBadge i={i} /></TableCell>
                    <TableCell className="min-w-0 text-left">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Avatar className="size-8"><AvatarFallback className="text-xs">{u.name.slice(0, 1)}</AvatarFallback></Avatar>
                        <span className="truncate font-medium">{u.name}</span>
                      </span>
                    </TableCell>
                    {show("kind") && <TableCell className="text-center"><Badge variant={u.kind === "staff" ? "default" : "secondary"}>{u.kind === "staff" ? "임직원" : "외부"}</Badge></TableCell>}
                    {show("email") && <TableCell className="hidden truncate text-left text-ink-3 md:table-cell">{u.email ?? "—"}</TableCell>}
                    <TableCell className="text-right tabular-nums font-semibold">{u.uses.toLocaleString()}</TableCell>
                    {show("share") && <TableCell className="hidden text-right sm:table-cell tabular-nums text-ink-3">{u.share}%</TableCell>}
                  </TableRow>
                ); })}
                {a.top_users.length === 0 && <Empty cols={7} />}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="recent">
          {a && (
            <>
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <SortHead s={tr} k="at" className="w-28 md:w-[150px]">시각</SortHead>
                    {show("thumb") && <TableHead className="hidden w-20 sm:table-cell">썸네일</TableHead>}
                    <SortHead s={tr} k="name">에셋</SortHead>
                    {show("cat") && <SortHead s={tr} k="cat" className="hidden w-24 md:table-cell">분류</SortHead>}
                    {show("channel") && <SortHead s={tr} k="channel" className="hidden w-20 sm:table-cell">경로</SortHead>}
                    {show("user") && <SortHead s={tr} k="user" className="hidden w-[200px] md:table-cell">사용자</SortHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentPage.map((r, i) => (
                    <TableRow key={`${r.at}-${i}`}>
                      <TableCell className="text-center tabular-nums text-ink-3"><AtText at={r.at} /></TableCell>
                      {show("thumb") && <TableCell className="hidden sm:table-cell">{thumb(r.asset?.thumb_url ?? null, "")}</TableCell>}
                      <TableCell className="min-w-0 text-left">
                        {r.asset ? (
                          <>
                            <span className="block truncate font-medium">{r.asset.name ?? "이름 없음"}</span>
                            <span className="block truncate text-xs text-ink-4">{r.asset.id}</span>
                          </>
                        ) : <span className="text-ink-4">삭제된 에셋</span>}
                      </TableCell>
                      {show("cat") && <TableCell className="hidden text-center md:table-cell">{r.asset && <Badge variant="outline">{r.asset.category_ko}</Badge>}</TableCell>}
                      {show("channel") && <TableCell className="hidden text-center sm:table-cell"><Badge variant="secondary">{CHANNEL_KO[r.channel]}</Badge></TableCell>}
                      {show("user") && (
                        <TableCell className="hidden min-w-0 text-left md:table-cell">
                          <span className="block truncate">{r.user ?? "익명·키"}</span>
                          {r.email && <span className="block truncate text-xs text-ink-4">{r.email}</span>}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {a.recent.length === 0 && <Empty cols={6} />}
                </TableBody>
              </Table>
              {lastPage > 1 && (
                <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-ink-4">
                  <span className="tabular-nums">{page} / {lastPage} 쪽 · 최근 {a.recent.length}건</span>
                  <Pagination className="mx-0 w-auto">
                    <PaginationContent>
                      <PaginationItem><PaginationPrevious href="#" onClick={(e) => { e.preventDefault(); setPage((p) => Math.max(1, p - 1)); }} aria-disabled={page <= 1} className={cn(page <= 1 && "pointer-events-none opacity-40")} /></PaginationItem>
                      {Array.from({ length: lastPage }, (_, i) => i + 1).map((p) => (
                        <PaginationItem key={p}><PaginationLink href="#" isActive={p === page} onClick={(e) => { e.preventDefault(); setPage(p); }}>{p}</PaginationLink></PaginationItem>
                      ))}
                      <PaginationItem><PaginationNext href="#" onClick={(e) => { e.preventDefault(); setPage((p) => Math.min(lastPage, p + 1)); }} aria-disabled={page >= lastPage} className={cn(page >= lastPage && "pointer-events-none opacity-40")} /></PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="cats">
          {a && (
            <div className="grid min-w-0 gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              {show("bar") && (
                <ChartContainer config={{ uses: { label: "삽입", color: "var(--color-chart)" } }} className="aspect-auto h-[240px] min-w-0">
                  <BarChart data={a.categories} layout="vertical" margin={{ left: 0, right: 12 }}>
                    <CartesianGrid horizontal={false} />
                    <YAxis type="category" dataKey="category_ko" width={64} tickLine={false} axisLine={false} />
                    <XAxis type="number" hide />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" labelFormatter={(_v, p) => String(p?.[0]?.payload?.category_ko ?? "")} />} />
                    <Bar dataKey="uses" fill="var(--color-uses)" radius={4} />
                  </BarChart>
                </ChartContainer>
              )}
              {show("bar") && <CategoryDonut cats={a.categories} />}
              <div className="min-w-0 lg:col-span-2"><Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <SortHead s={tc} k="cat">분류</SortHead>
                    <SortHead s={tc} k="uses" className="w-24">삽입</SortHead>
                    {show("used") && <SortHead s={tc} k="used" className="hidden w-24 sm:table-cell">쓰인 에셋</SortHead>}
                    {show("items") && <SortHead s={tc} k="items" className="w-24">등록</SortHead>}
                    <SortHead s={tc} k="ratio" className="hidden w-20 sm:table-cell">비율</SortHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tc.rows.map((c) => (
                    <TableRow key={c.category}>
                      <TableCell className="text-left font-medium">{c.category_ko}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{c.uses.toLocaleString()}</TableCell>
                      {show("used") && <TableCell className="hidden text-right sm:table-cell tabular-nums text-ink-3">{c.used_items.toLocaleString()}</TableCell>}
                      {show("items") && <TableCell className="text-right tabular-nums text-ink-3">{c.items.toLocaleString()}</TableCell>}
                      <TableCell className="hidden text-right tabular-nums text-ink-4 sm:table-cell">{Math.round((c.uses / maxCat) * 100)}%</TableCell>
                    </TableRow>
                  ))}
                  {a.categories.length === 0 && <Empty cols={5} />}
                </TableBody>
              </Table></div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="heat">
          {a && <Heatmap grid={a.heatmap} />}
        </TabsContent>
      </Card>
    </Tabs>
  );
}

function RankBadge({ i }: { i: number }) {
  return <Badge variant={i < 3 ? "default" : "outline"} className="min-w-6 justify-center tabular-nums">{i + 1}</Badge>;
}

function Empty({ cols }: { cols: number }) {
  return <TableRow><TableCell colSpan={cols} className="py-10 text-center text-ink-4">아직 기록이 없습니다.</TableCell></TableRow>;
}

// ── 요일×시간 히트맵 — 의존성 0, HTML grid(30px + 24칸) + 강도는 rgba 알파 ──
const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
/** 구성비 — shadcn Chart 예시 "Pie Chart - Donut with Text"(가운데 합계) + 툴팁. 무채색 단계로, 1위만 주황. */
function CategoryDonut({ cats }: { cats: AdminAnalytics["categories"] }) {
  const total = cats.reduce((s, c) => s + c.uses, 0);
  const shades = ["var(--color-point)", "var(--color-chart)", "var(--color-chart-2)", "var(--color-line-3)", "var(--color-ink-4)", "var(--color-line)", "var(--color-ground-4)"];
  const data = cats.slice(0, 7).map((c, i) => ({ ...c, fill: shades[i] ?? shades[shades.length - 1] }));
  const config = Object.fromEntries(data.map((c) => [c.category, { label: c.category_ko, color: c.fill }])) as ChartConfig;
  if (total === 0) return null;
  return (
    <ChartContainer config={config} className="mx-auto aspect-square h-[240px] min-w-0">
      <PieChart>
        <ChartTooltip cursor={false} content={<ChartTooltipContent nameKey="category" hideLabel formatter={(v, _n, item) => <span className="flex w-full justify-between gap-3"><span>{String(item?.payload?.category_ko ?? "")}</span><span className="font-mono-safe font-medium tabular-nums">{Number(v).toLocaleString()}건 · {Math.round((Number(v) / total) * 100)}%</span></span>} />} />
        <Pie data={data} dataKey="uses" nameKey="category" innerRadius={62} outerRadius={92} strokeWidth={2} stroke="var(--color-ground)">
          {data.map((c) => <Cell key={c.category} fill={c.fill} />)}
          <Label content={({ viewBox }) => {
            if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null;
            const { cx, cy } = viewBox as { cx: number; cy: number };
            return (
              <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                <tspan x={cx} y={cy} className="fill-ink text-2xl font-extrabold tabular-nums">{total.toLocaleString()}</tspan>
                <tspan x={cx} y={(cy ?? 0) + 20} className="fill-ink-4 text-xs">누적 삽입</tspan>
              </text>
            );
          }} />
        </Pie>
        <ChartLegend content={<ChartLegendContent nameKey="category" />} className="flex-wrap" />
      </PieChart>
    </ChartContainer>
  );
}

function Heatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  return (
    <div className="min-w-0 p-4">
      <div className="grid gap-px" style={{ gridTemplateColumns: "30px repeat(24, minmax(0, 1fr))" }}>
        <div />
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="text-center text-[10px] tabular-nums text-ink-4">{h % 3 === 0 ? h : ""}</div>
        ))}
        {grid.map((row, d) => (
          <div key={d} className="contents">
            <div className="flex items-center text-xs text-ink-4">{DAYS[d]}</div>
            {row.map((v, h) => (
              <div
                key={h}
                title={`${DAYS[d]}요일 ${h}시 · ${v.toLocaleString()}건`}
                className="aspect-square rounded-md bg-ink"
                style={{ opacity: v === 0 ? 0.06 : 0.15 + 0.85 * (v / max) }}
              />
            ))}
          </div>
        ))}
      </div>
      <Copy className="mt-3 text-xs text-ink-4" text={`에셋 삽입이 몰리는 요일·시간입니다. 가장 진한 칸이 ${max.toLocaleString()}건입니다.`} />
    </div>
  );
}

// ── ① 모듈 종합 KPI 4칸(같은 비중) — 최근 30일 수 + 직전 30일 대비 Badge + 보조 지표 두 줄 ──
function deltaPct(c: number, p: number): number | null {
  if (p <= 0) return c > 0 ? null : 0;
  return Math.round(((c - p) / p) * 1000) / 10;
}

function ModuleCards({ a, loading }: { a?: AdminAnalytics; loading: boolean }) {
  const m = a?.modules;
  const cards: Array<{ key: string; module: string; label: string; value: string; c: number; p: number; foot: string; sub: string; to: string; point?: boolean }> = [
    { key: "assets", module: "powerAssets", label: "최근 30일 에셋 삽입", value: n(m?.assets.c30), c: m?.assets.c30 ?? 0, p: m?.assets.p30 ?? 0, foot: `삽입한 사용자 ${n(m?.assets.users30)}명`, sub: `누적 ${n(m?.assets.total)}건`, to: "/admin/assets" },
    { key: "deck", module: "powerDeck", label: "최근 30일 장표 작업", value: n(m?.deck.c30), c: m?.deck.c30 ?? 0, p: m?.deck.p30 ?? 0, foot: `완료율 ${m ? `${m.deck.done_pct}%` : "—"} · 실패 ${n(m?.deck.failed30)}`, sub: `대기열 ${n(m?.deck.queue)}건 · 누적 ${n(m?.deck.total)}건`, to: "/admin/deck" },
    { key: "mock", module: "powerMock", label: "최근 30일 시안 판정", value: n(m?.mock.c30), c: m?.mock.c30 ?? 0, p: m?.mock.p30 ?? 0, foot: `평균 ${m?.mock.avg30 ?? "—"}점 · 통과 ${n(m?.mock.pass30)}`, sub: `게시 ${n(m?.mock.published)} · 갤러리 ${n(m?.mock.gallery)}(공개 ${n(m?.mock.shared)})`, to: "/admin/mockups" },
    { key: "users", module: "플랫폼", label: "최근 30일 활성 사용자", value: n(m?.users.active30), c: m?.users.active30 ?? 0, p: m?.users.active_p30 ?? 0, foot: `전체 ${n(m?.users.total)}명`, sub: `임직원 ${n(m?.users.staff)} · 외부 ${n(m?.users.external)}`, to: "/admin/users", point: true },
  ];
  return (
    <MobileCarousel label="모듈 지표" className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => {
        const d = m ? deltaPct(c.c, c.p) : null;
        const up = (d ?? 0) >= 0;
        const Icon = up ? TrendingUp : TrendingDown;
        return (
          <Card key={c.key} className="@container/card min-w-0">
            <CardHeader>
              <CardDescription className="flex min-w-0 flex-col gap-0.5">
                <span className="text-xs font-semibold text-ink-3">{c.module}</span>
                <span className="truncate">{c.label}</span>
              </CardDescription>
              <CardTitle className={cn("text-2xl font-extrabold tabular-nums tracking-[-0.02em] @[250px]/card:text-3xl", c.point && "text-point-ink")}>
                {loading ? <Skeleton className="h-8 w-20" /> : c.value}
              </CardTitle>
              <CardAction>
                {m && (
                  <Badge variant="outline" className="tabular-nums" title="직전 30일 대비">
                    {d === null ? "신규" : (<><Icon aria-hidden />{`${up ? "+" : ""}${d}%`}</>)}
                  </Badge>
                )}
              </CardAction>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-1 border-t-0 bg-transparent pt-0 text-sm">
              <Link to={c.to} className="-my-2.5 line-clamp-1 py-2.5 font-medium hover:underline">{c.foot}</Link>
              <div className="line-clamp-1 text-ink-4">{c.sub}</div>
            </CardFooter>
          </Card>
        );
      })}
    </MobileCarousel>
  );
}

// ── ③ 모듈별 Tabs: 개요 · powerAssets · powerDeck · powerMock · 사용자 ──
type ModTab = "overview" | "assets" | "deck" | "mock" | "users";
const MOD_TAB: Record<ModTab, string> = { overview: "개요", assets: "powerAssets", deck: "powerDeck", mock: "powerMock", users: "사용자" };

function ModuleTabs({ a, loading }: { a?: AdminAnalytics; loading: boolean }) {
  const [tab, setTab] = useState<ModTab>("overview");
  const counts: Record<ModTab, number | null> = {
    overview: null, assets: a?.top_assets.length ?? 0, deck: a?.deck_recent.length ?? 0, mock: a?.mock_recent.length ?? 0, users: a?.cross_users.length ?? 0,
  };
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as ModTab)} className="min-w-0 gap-4">
      <TabsList className="h-auto max-w-full flex-wrap justify-start">
        {(Object.keys(MOD_TAB) as ModTab[]).map((k) => (
          <TabsTrigger key={k} value={k} className="h-9 flex-none px-3">
            {MOD_TAB[k]}
            {counts[k] !== null && <Badge variant="secondary" className="ml-0.5 h-4 min-w-5 px-1 tabular-nums">{loading ? "…" : (counts[k] ?? 0).toLocaleString()}</Badge>}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="overview" className="min-w-0">{a ? <Overview a={a} /> : <Skeleton className="h-[300px] w-full" />}</TabsContent>
      <TabsContent value="assets" className="flex min-w-0 flex-col gap-4">
        {a && <AssetSummary a={a} />}
        <DetailTabs a={a} loading={loading} />
      </TabsContent>
      <TabsContent value="deck" className="min-w-0">{a && <DeckPanel a={a} />}</TabsContent>
      <TabsContent value="mock" className="min-w-0">{a && <MockPanel a={a} />}</TabsContent>
      <TabsContent value="users" className="min-w-0">{a && <CrossUsers a={a} />}</TabsContent>
    </Tabs>
  );
}

const STATUS_SHADES = ["var(--color-chart)", "var(--color-chart-2)", "var(--color-line-3)", "var(--color-ink-4)", "var(--color-line)", "var(--color-ground-4)", "var(--color-line-2)"];

/** 개요 — 모듈별 상태 분포 세 칸: 장표 상태(도넛) · 시안 점수 구간(막대) · 에셋 분류별 삽입(가로 막대) */
function Overview({ a }: { a: AdminAnalytics }) {
  const deckData = a.deck_status.map((x, i) => ({ ...x, label: DECK_STATUS_KO[x.status] ?? x.status, fill: STATUS_SHADES[i % STATUS_SHADES.length] }));
  const deckTotal = deckData.reduce((t, x) => t + x.n, 0);
  const deckCfg = Object.fromEntries(deckData.map((x) => [x.status, { label: x.label, color: x.fill }])) as ChartConfig;
  const cats = a.categories.filter((c) => c.uses > 0).slice(0, 6);
  return (
    <MobileCarousel label="상태 분포" className="grid min-w-0 gap-4 lg:grid-cols-3">
      <Card className="min-w-0">
        <CardHeader><CardTitle>powerDeck 작업 상태</CardTitle><CardDescription>전체 {deckTotal.toLocaleString()}건</CardDescription></CardHeader>
        <CardContent className="min-w-0">
          {deckTotal === 0 ? <div className="grid h-[220px] place-items-center text-ink-4">작업이 없습니다.</div> : (
            <ChartContainer config={deckCfg} className="mx-auto aspect-auto h-[220px] w-full min-w-0">
              <PieChart>
                <ChartTooltip cursor={false} content={<ChartTooltipContent nameKey="status" hideLabel formatter={(v, _n, item) => <span className="flex w-full justify-between gap-3"><span>{String(item?.payload?.label ?? "")}</span><span className="font-medium tabular-nums">{Number(v).toLocaleString()}건</span></span>} />} />
                <Pie data={deckData} dataKey="n" nameKey="status" innerRadius={52} outerRadius={78} strokeWidth={2} stroke="var(--color-ground)">
                  {deckData.map((x) => <Cell key={x.status} fill={x.fill} />)}
                </Pie>
                <ChartLegend content={<ChartLegendContent nameKey="status" />} className="flex-wrap" />
              </PieChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
      <Card className="min-w-0">
        <CardHeader><CardTitle>powerMock 점수 구간</CardTitle><CardDescription>판정한 시안의 마지막 점수</CardDescription></CardHeader>
        <CardContent className="min-w-0">
          <ChartContainer config={{ n: { label: "시안", color: "var(--color-chart)" } }} className="aspect-auto h-[220px] w-full min-w-0">
            <BarChart data={a.score_bins} margin={{ left: 0, right: 4 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="bin" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis width={28} tickLine={false} axisLine={false} allowDecimals={false} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dashed" labelFormatter={(v) => `${v}점`} />} />
              <Bar dataKey="n" fill="var(--color-n)" radius={4} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
      <Card className="min-w-0">
        <CardHeader><CardTitle>powerAssets 분류별 삽입</CardTitle><CardDescription>누적 삽입 상위 분류</CardDescription></CardHeader>
        <CardContent className="min-w-0">
          <ChartContainer config={{ uses: { label: "삽입", color: "var(--color-chart)" } }} className="aspect-auto h-[220px] w-full min-w-0">
            <BarChart data={cats} layout="vertical" margin={{ left: 0, right: 12 }}>
              <CartesianGrid horizontal={false} />
              <YAxis type="category" dataKey="category_ko" width={64} tickLine={false} axisLine={false} />
              <XAxis type="number" hide />
              <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" labelFormatter={(_v, p) => String(p?.[0]?.payload?.category_ko ?? "")} />} />
              <Bar dataKey="uses" fill="var(--color-uses)" radius={4} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </MobileCarousel>
  );
}

/** powerAssets 전용 지표(누적 삽입·상위 3명 비중) — 맨 위 KPI 에서 내려온 것 */
function AssetSummary({ a }: { a: AdminAnalytics }) {
  const h = a.hero;
  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <Card size="sm" className="min-w-0">
        <CardHeader><CardDescription>누적 삽입</CardDescription><CardTitle className="text-2xl font-extrabold tabular-nums">{n(h.ins_total)}</CardTitle></CardHeader>
        <CardFooter className="border-t-0 bg-transparent pt-0 text-sm text-ink-4">사용자 {n(h.users_total)}명이 삽입</CardFooter>
      </Card>
      <Card size="sm" className="min-w-0">
        <CardHeader>
          <CardDescription>상위 3명 비중</CardDescription>
          <CardTitle className="text-2xl font-extrabold tabular-nums">{h.top3_pct}%</CardTitle>
          <CardAction><Donut pct={h.top3_pct} /></CardAction>
        </CardHeader>
        <CardFooter className="border-t-0 bg-transparent pt-0 text-sm text-ink-4">{n(h.top3)}건 / {n(h.ins_total)}건</CardFooter>
      </Card>
    </div>
  );
}

function statusBadge(st: string) {
  const v = st === "done" ? "secondary" : "outline";
  return <Badge variant={v} className={cn(st === "failed" && "border-point text-point-ink")}>{DECK_STATUS_KO[st] ?? st}</Badge>;
}

/** powerDeck — 최근 작업 + 실패 사유 */
function DeckPanel({ a }: { a: AdminAnalytics }) {
  const dr = useSort(a.deck_recent, { title: (j) => j.title, status: (j) => DECK_STATUS_KO[j.status] ?? j.status, slides: (j) => j.slides, user: (j) => j.user ?? j.email ?? "", at: (j) => j.at });
  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card className="min-w-0 py-0">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <SortHead s={dr} k="title">작업</SortHead>
              <SortHead s={dr} k="status" className="w-20">상태</SortHead>
              <SortHead s={dr} k="slides" className="hidden w-16 md:table-cell">장 수</SortHead>
              <SortHead s={dr} k="user" className="hidden w-36 lg:table-cell">요청자</SortHead>
              <SortHead s={dr} k="at" className="w-32">요청 시각</SortHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dr.rows.map((j) => (
              <TableRow key={j.id}>
                <TableCell className="min-w-0 text-left">
                  <span className="block truncate font-medium" title={j.title}>{j.title || "(제목 없음)"}</span>
                  {j.error && <span className="block truncate text-xs text-point-ink" title={j.error}>{j.error}</span>}
                </TableCell>
                <TableCell className="text-center">{statusBadge(j.status)}</TableCell>
                <TableCell className="hidden text-right tabular-nums md:table-cell">{j.slides ?? "—"}</TableCell>
                <TableCell className="hidden truncate text-left text-ink-3 lg:table-cell" title={j.email ?? ""}>{j.user ?? j.email ?? "—"}</TableCell>
                <TableCell className="text-center tabular-nums text-ink-3"><AtText at={j.at} /></TableCell>
              </TableRow>
            ))}
            {a.deck_recent.length === 0 && <Empty cols={5} />}
          </TableBody>
        </Table>
      </Card>
      <Card className="min-w-0">
        <CardHeader><CardTitle>실패 사유</CardTitle><CardDescription>실패한 작업의 오류 앞부분으로 묶었습니다.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-2">
          {a.deck_fail.length === 0 ? <p className="py-6 text-center text-ink-4">실패한 작업이 없습니다.</p> : a.deck_fail.map((f) => (
            <div key={f.reason} className="flex min-w-0 items-center gap-3 text-sm">
              <span className="min-w-0 flex-1 truncate" title={f.reason}>{f.reason}</span>
              <span className="font-semibold tabular-nums">{f.n}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/** powerMock — 최근 판정 시안(점수·통과·게시) */
function MockPanel({ a }: { a: AdminAnalytics }) {
  const mr = useSort(a.mock_recent, { title: (m) => m.title, score: (m) => m.score, passed: (m) => (m.passed === null ? null : m.passed ? 1 : 0), device: (m) => m.device, published: (m) => (m.published ? 1 : 0), user: (m) => m.user ?? m.email ?? "", at: (m) => m.at });
  return (
    <Card className="min-w-0 py-0">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <SortHead s={mr} k="title">시안</SortHead>
            <SortHead s={mr} k="score" className="w-16">점수</SortHead>
            <SortHead s={mr} k="passed" className="w-20">판정</SortHead>
            <SortHead s={mr} k="device" className="hidden w-16 md:table-cell">기기</SortHead>
            <SortHead s={mr} k="published" className="hidden w-16 md:table-cell">게시</SortHead>
            <SortHead s={mr} k="user" className="hidden w-36 lg:table-cell">만든 사람</SortHead>
            <SortHead s={mr} k="at" className="w-32">판정 시각</SortHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mr.rows.map((m) => (
            <TableRow key={m.token}>
              <TableCell className="truncate text-left font-medium" title={m.title}>{m.title || "(제목 없음)"}</TableCell>
              <TableCell className="text-center font-semibold tabular-nums">{m.score ?? "—"}</TableCell>
              <TableCell className="text-center">{m.passed === null ? "—" : <Badge variant={m.passed ? "secondary" : "outline"}>{m.passed ? "통과" : "미통과"}</Badge>}</TableCell>
              <TableCell className="hidden text-center text-ink-3 md:table-cell">{m.device === "pc" ? "PC" : "모바일"}</TableCell>
              <TableCell className="hidden text-center text-ink-3 md:table-cell">{m.published ? "게시" : "—"}</TableCell>
              <TableCell className="hidden truncate text-left text-ink-3 lg:table-cell" title={m.email ?? ""}>{m.user ?? m.email ?? "—"}</TableCell>
              <TableCell className="text-center tabular-nums text-ink-3"><AtText at={m.at} /></TableCell>
            </TableRow>
          ))}
          {a.mock_recent.length === 0 && <Empty cols={7} />}
        </TableBody>
      </Table>
    </Card>
  );
}

/** 사용자 — 모듈 교차(사용자별 에셋 삽입·장표·시안 건수) + 구성 막대 */
function CrossUsers({ a }: { a: AdminAnalytics }) {
  const max = Math.max(1, ...a.cross_users.map((u) => u.total));
  const cu = useSort(a.cross_users, { name: (u) => u.name, kind: (u) => u.kind, assets: (u) => u.assets, deck: (u) => u.deck, mock: (u) => u.mock });
  return (
    <Card className="min-w-0 py-0">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <SortHead s={cu} k="name">사용자</SortHead>
            <SortHead s={cu} k="kind" className="hidden w-20 sm:table-cell">구분</SortHead>
            <SortHead s={cu} k="assets" className="w-20">에셋 삽입</SortHead>
            <SortHead s={cu} k="deck" className="w-16">장표</SortHead>
            <SortHead s={cu} k="mock" className="w-16">시안</SortHead>
            <TableHead className="hidden w-40 md:table-cell">구성</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cu.rows.map((u, i) => (
            <TableRow key={`${u.email ?? u.name}-${i}`}>
              <TableCell className="min-w-0 text-left">
                <span className="block truncate font-medium">{u.name}</span>
                <span className="block truncate text-xs text-ink-4">{u.email ?? "—"}</span>
              </TableCell>
              <TableCell className="hidden text-center sm:table-cell"><Badge variant="outline">{u.kind === "staff" ? "임직원" : "외부"}</Badge></TableCell>
              <TableCell className="text-right tabular-nums">{u.assets.toLocaleString()}</TableCell>
              <TableCell className="text-right tabular-nums">{u.deck.toLocaleString()}</TableCell>
              <TableCell className="text-right tabular-nums">{u.mock.toLocaleString()}</TableCell>
              <TableCell className="hidden md:table-cell">
                <div className="flex h-2 overflow-hidden rounded-full bg-ground-4" style={{ width: `${Math.max(6, (u.total / max) * 100)}%` }} title={`에셋 ${u.assets} · 장표 ${u.deck} · 시안 ${u.mock}`}>
                  <span className="bg-ink" style={{ flex: u.assets }} />
                  <span className="bg-ink-3" style={{ flex: u.deck }} />
                  <span className="bg-line-3" style={{ flex: u.mock }} />
                </div>
              </TableCell>
            </TableRow>
          ))}
          {a.cross_users.length === 0 && <Empty cols={6} />}
        </TableBody>
      </Table>
    </Card>
  );
}

/** 서버 연결 상태 — 대시보드 맨 위에 항상(30초마다 다시 읽는다). 연결됨이면 초록 점이 깜빡인다 */
function SystemStrip() {
  const { isAdmin } = useMe();
  const q = useQuery({ queryKey: ["admin", "system"], queryFn: fetchSystem, enabled: isAdmin, refetchInterval: 30_000, refetchIntervalInBackground: false });
  const d: AdminSystem | undefined = q.data;
  const down = q.isError;
  const items: { label: string; ok: boolean | null; sub: string; to?: string }[] = [
    { label: "API 서버", ok: down ? false : d ? d.api.ok : null, sub: down ? "응답 없음" : d ? "PHP " + d.api.php : "" },
    { label: "데이터베이스", ok: d ? d.db.ok : down ? false : null, sub: d ? d.db.ms + "ms" : "" },
    { label: "장표 엔진", ok: d ? d.engine.ok : down ? false : null, to: "/admin/deck",
      sub: d ? (d.engine.ok ? d.engine.online + "대 · 진행 " + d.engine.running + " · 대기 " + d.engine.queued : d.engine.last_seen ? "마지막 통신 " + fmtAt(d.engine.last_seen) : "등록된 엔진 없음") : "" },
    { label: "AI 키(OpenRouter)", ok: d ? d.ai.ok : down ? false : null, to: "/admin/ai", sub: d ? (d.ai.ok ? "오늘 판단 $" + d.ai.jev_today_usd.toFixed(4) : "키 없음·풀 수 없음") : "" },
    { label: "메일(SMTP)", ok: d ? d.mail.ok : down ? false : null, to: "/admin/mail", sub: d ? (d.mail.ok ? "발송 설정됨" : "설정 없음") : "" },
    { label: "powerMCP", ok: d ? d.mcp.ok : down ? false : null, sub: d ? (d.mcp.ok ? (d.mcp.version ? "v" + d.mcp.version : "") + (d.mcp.tools ? " · 도구 " + d.mcp.tools : "") : "응답 없음") : "" },
  ];
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-md">서버 연결 상태</CardTitle>
        <CardAction className="text-sm text-ink-4">{d ? fmtAt(d.checked_at) + " 확인 · 30초마다" : q.isLoading ? "확인 중" : ""}</CardAction>
      </CardHeader>
      <CardContent className="grid min-w-0 grid-cols-2 gap-2 px-4 md:grid-cols-3 xl:grid-cols-6">
        {items.map((it) => {
          const body = (
            <div className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-line px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 max-sm:flex-col max-sm:items-start">
                <span className="min-w-0 text-sm font-semibold text-ink-2">{it.label}</span>
                <LiveStatus state={it.ok === null ? "off" : it.ok ? "ok" : "warn"}>{it.ok === null ? "확인 중" : it.ok ? "연결됨" : "끊김"}</LiveStatus>
              </div>
              <span className="truncate text-sm text-ink-4">{it.sub || " "}</span>
            </div>
          );
          return it.to ? <Link key={it.label} to={it.to} className="min-w-0">{body}</Link> : <div key={it.label} className="min-w-0">{body}</div>;
        })}
      </CardContent>
    </Card>
  );
}

// ── 서버 자원 — superadmin 만. 지금 값 4칸 + 기간 추이(CPU%·메모리%, 디스크 GB) + DB 상위 표·저장 폴더 크기. 60초마다 다시 읽는다 ──
// 경고(디스크·메모리 85%+, 스왑 50%+)만 주황, 나머지는 무채색.
const RANGE_KO: Record<MetricsRange, string> = { "24h": "24시간", "7d": "7일", "30d": "30일" };
const resConfig = {
  cpu: { label: "CPU %", color: "var(--color-chart)" },
  mem: { label: "메모리 %", color: "var(--color-chart-2)" },
} satisfies ChartConfig;
const diskConfig = { disk_gb: { label: "디스크 사용 GB", color: "var(--color-chart)" } } satisfies ChartConfig;

function fmtMb(mb: number | null | undefined) {
  if (mb === null || mb === undefined) return "—";
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb).toLocaleString()} MB`;
}
function fmtUptime(s: number | null) {
  if (s === null) return "—";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return d > 0 ? `${d}일 ${h}시간` : `${h}시간 ${Math.floor((s % 3600) / 60)}분`;
}
function fmtAxis(at: string, range: MetricsRange) {
  if (range === "24h") return at.slice(11, 16);
  const md = `${at.slice(5, 7)}.${at.slice(8, 10)}`;
  return range === "7d" ? `${md} ${at.slice(11, 13)}시` : md;
}

function Gauge({ label, pct, value, sub, warn }: { label: string; pct: number | null; value: string; sub: string; warn: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-line px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-semibold text-ink-2">{label}</span>
        <span className={cn("text-lg font-extrabold tabular-nums", warn ? "text-point-ink" : "text-ink")}>{pct === null ? "—" : `${pct.toFixed(1)}%`}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-ground-3" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}>
        <div className={cn("h-full rounded-full transition-[width]", warn ? "bg-point" : "bg-ink")} style={{ width: `${Math.max(0, Math.min(100, pct ?? 0))}%` }} />
      </div>
      <span className="truncate text-sm text-ink-4">{value}{sub ? ` · ${sub}` : ""}</span>
    </div>
  );
}

function ServerResources() {
  const { hasRole } = useMe();
  const isSuper = hasRole("superadmin");
  const [range, setRange] = useState<MetricsRange>("24h");
  const [open, setOpen] = useState(true);
  const q = useQuery({ queryKey: ["admin", "metrics", range], queryFn: () => fetchServerMetrics(range), enabled: isSuper && open, refetchInterval: 60_000, refetchIntervalInBackground: false, placeholderData: (prev) => prev });
  // 큰 표·폴더 정렬 — 훅이라 아래 조기 반환보다 먼저 둔다
  const tb = useSort(q.data?.db.tables ?? [], { name: (t) => t.name, rows: (t) => t.rows, size: (t) => t.total_mb });
  const fd = useSort(q.data?.folders?.items ?? [], { name: (x) => x.name, size: (x) => x.mb });
  if (!isSuper) return null;
  const d: ServerMetrics | undefined = q.data;
  const nw = d?.now;
  const mem = nw?.mem ?? null;
  const memPct = mem && mem.total_mb > 0 ? (mem.used_mb / mem.total_mb) * 100 : null;
  const swapPct = mem ? (mem.swap_total_mb > 0 ? (mem.swap_used_mb / mem.swap_total_mb) * 100 : 0) : null;
  const disk = nw?.disk ?? null;
  const diskPct = disk && disk.total_gb > 0 ? (disk.used_gb / disk.total_gb) * 100 : null;
  const series = d?.series ?? [];

  return (
    <Card className="min-w-0 gap-4 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-md">서버 자원</CardTitle>
        <CardDescription>서버 전체 수치입니다(같은 서버의 다른 사이트 포함).</CardDescription>
        <CardAction className="flex items-center gap-2">
          {open && <SegTabs label="기간" value={range} onChange={setRange} items={(Object.keys(RANGE_KO) as MetricsRange[]).map((r) => ({ value: r, label: RANGE_KO[r] }))} />}
          <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? "접기" : "펼치기"}</Button>
        </CardAction>
      </CardHeader>
      {open && <CardContent className="flex min-w-0 flex-col gap-4 px-4">
        {!d ? (
          q.isError ? <div className="py-6 text-center text-ink-4">불러오지 못했습니다.</div> : <Skeleton className="h-[120px] w-full" />
        ) : !nw?.supported ? (
          <div className="rounded-lg border border-line px-4 py-6 text-center text-ink-4">이 서버에서는 측정할 수 없음</div>
        ) : (
          <>
            <div className="grid min-w-0 grid-cols-2 gap-2 xl:grid-cols-4">
              <Gauge label="CPU" pct={nw.cpu_pct} warn={(nw.cpu_pct ?? 0) >= 85}
                value={nw.cores ? `${nw.cores}코어` : "—"} sub={nw.load ? `부하 ${nw.load.map((x) => x.toFixed(2)).join(" / ")}` : ""} />
              <Gauge label="메모리" pct={memPct} warn={(memPct ?? 0) >= 85} value={`${fmtMb(mem?.used_mb)} / ${fmtMb(mem?.total_mb)}`} sub={`가용 ${fmtMb(mem?.avail_mb)}`} />
              <Gauge label="스왑" pct={swapPct} warn={(swapPct ?? 0) >= 50} value={mem && mem.swap_total_mb > 0 ? `${fmtMb(mem.swap_used_mb)} / ${fmtMb(mem.swap_total_mb)}` : "스왑 없음"} sub="" />
              <Gauge label="디스크(/)" pct={diskPct} warn={(diskPct ?? 0) >= 85} value={disk ? `${disk.used_gb.toFixed(1)} / ${disk.total_gb.toFixed(1)} GB` : "—"} sub={disk ? `남음 ${disk.free_gb.toFixed(1)} GB` : ""} />
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-4">
              <span>가동 <b className="tabular-nums text-ink">{fmtUptime(nw.uptime_s)}</b></span>
              <span>DB <b className="tabular-nums text-ink">{fmtMb(d.db.total_mb)}</b></span>
              {nw.data_disk && <span>저장 폴더 디스크 <b className="tabular-nums text-ink">{nw.data_disk.used_gb.toFixed(1)} / {nw.data_disk.total_gb.toFixed(1)} GB</b></span>}
              <span>{d.last_sample_at ? `마지막 표본 ${fmtAt(d.last_sample_at)} · 5분마다` : "아직 표본 없음"}</span>
            </div>
          </>
        )}

        {d && nw?.supported && (
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <div className="min-w-0">
              <h3 className="mb-2 text-sm font-semibold text-ink-2">CPU·메모리 사용률(%)</h3>
              {series.length === 0 ? (
                <div className="flex h-[200px] items-center justify-center text-ink-4">아직 기록이 없습니다.</div>
              ) : (
                <ChartContainer config={resConfig} className={cn("aspect-auto h-[200px] w-full min-w-0", q.isFetching && "opacity-60")}>
                  <AreaChart data={series} margin={{ left: 4, right: 4 }}>
                    <defs>
                      {(Object.keys(resConfig) as Array<keyof typeof resConfig>).map((k) => (
                        <linearGradient key={k} id={`fill-res-${k}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={`var(--color-${k})`} stopOpacity={0.5} />
                          <stop offset="95%" stopColor={`var(--color-${k})`} stopOpacity={0.05} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="at" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} tickFormatter={(v: string) => fmtAxis(v, range)} />
                    <YAxis width={32} domain={[0, 100]} tickLine={false} axisLine={false} />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
                    <Area dataKey="mem" type="monotone" fill="url(#fill-res-mem)" stroke="var(--color-mem)" connectNulls />
                    <Area dataKey="cpu" type="monotone" fill="url(#fill-res-cpu)" stroke="var(--color-cpu)" strokeWidth={2} connectNulls />
                    <ChartLegend content={<ChartLegendContent />} />
                  </AreaChart>
                </ChartContainer>
              )}
            </div>
            <div className="min-w-0">
              <h3 className="mb-2 text-sm font-semibold text-ink-2">디스크 사용(GB)</h3>
              {series.length === 0 ? (
                <div className="flex h-[200px] items-center justify-center text-ink-4">아직 기록이 없습니다.</div>
              ) : (
                <ChartContainer config={diskConfig} className={cn("aspect-auto h-[200px] w-full min-w-0", q.isFetching && "opacity-60")}>
                  <LineChart data={series} margin={{ left: 4, right: 4 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="at" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} tickFormatter={(v: string) => fmtAxis(v, range)} />
                    <YAxis width={40} domain={["auto", "auto"]} tickLine={false} axisLine={false} />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
                    <Line dataKey="disk_gb" type="monotone" stroke="var(--color-disk_gb)" strokeWidth={2} dot={false} connectNulls />
                  </LineChart>
                </ChartContainer>
              )}
            </div>
          </div>
        )}

        {d && (
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <div className="min-w-0">
              <h3 className="mb-2 text-sm font-semibold text-ink-2">DB 큰 표 10</h3>
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <SortHead s={tb} k="name" className="text-center">표</SortHead>
                    <SortHead s={tb} k="rows" className="w-[96px] text-center">행(추정)</SortHead>
                    <SortHead s={tb} k="size" className="w-[96px] text-center">크기</SortHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.db.tables.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center text-ink-4">정보 없음</TableCell></TableRow>
                  ) : tb.rows.map((t) => (
                    <TableRow key={t.name}>
                      <TableCell className="truncate text-left" title={t.name}>{t.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{t.rows.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums" title={`데이터 ${fmtMb(t.data_mb)} · 색인 ${fmtMb(t.index_mb)}`}>{fmtMb(t.total_mb)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="min-w-0">
              <h3 className="mb-2 text-sm font-semibold text-ink-2">
                저장 폴더별 크기{d.folders ? ` · ${fmtAt(d.folders.sampled_at)} 기준` : ""}
              </h3>
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <SortHead s={fd} k="name" className="text-center">폴더</SortHead>
                    <SortHead s={fd} k="size" className="w-[96px] text-center">크기</SortHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!d.folders || d.folders.items.length === 0 ? (
                    <TableRow><TableCell colSpan={2} className="text-center text-ink-4">아직 잰 기록이 없습니다(1시간에 한 번).</TableCell></TableRow>
                  ) : fd.rows.map((f) => (
                    <TableRow key={f.name}>
                      <TableCell className="truncate text-left" title={f.name}>{f.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMb(f.mb)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>}
    </Card>
  );
}

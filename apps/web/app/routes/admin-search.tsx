// 관리자 · 검색 품질 — asset_search_logs 최근 N일: KPI 카드(검색·무결과율·검색어 수·사용자) + 일별 무결과율 추이(shadcn Chart) + 인기/무결과 검색어 TOP10.
// 무결과 검색어 = 다음에 만들 에셋 목록(파워플러스 교훈 — 무결과율이 에셋 확충의 평가 지표). 옛 관리자 analytics.search 기능만 참고, 화면은 Card·Table 로 새로.
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import { AdminTitle, SortHead, useQueryState, useSort } from "@/components/admin/admin-ui";
import { ChoiceButton } from "@/components/hb/choice-button";
import { Copy } from "@/components/hb/copy";
import { Tag } from "@/components/hb/tag";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchSearchQuality, fmtAt } from "@/lib/admin";
import { useMobileSections } from "@/components/hb/mobile-sections";
import { cn } from "@/lib/utils";
import type { Route } from "./+types/admin-search";

export const meta: Route.MetaFunction = () => [{ title: "검색 품질 — powerPlus 관리자" }];

const DAYS = [{ id: "7", label: "7일" }, { id: "30", label: "30일" }, { id: "90", label: "90일" }];
const chartConfig = { zero_rate: { label: "무결과율(%)", color: "var(--color-point, #E46B37)" }, total: { label: "검색 수", color: "var(--color-chart)" } } satisfies ChartConfig;
const topConfig = { count: { label: "횟수", color: "var(--color-chart)" }, } satisfies ChartConfig;
const zeroConfig = { count: { label: "횟수", color: "var(--color-point, #E46B37)" }, } satisfies ChartConfig;
const rateTone = (r: number): "ok" | "warn" | "soft" => (r === 0 ? "ok" : r <= 10 ? "soft" : "warn");

export default function AdminSearch() {
  const { get, set } = useQueryState();
  const days = Number(get("days") || 30);
  const q = useQuery({ queryKey: ["admin", "search-quality", days], queryFn: () => fetchSearchQuality(days) });
  const s = q.data;
  const top = useSort(s?.top ?? [], { q: (t) => t.q, count: (t) => t.count, results: (t) => t.results });
  const zero = useSort(s?.zero_top ?? [], { q: (t) => t.q, count: (t) => t.count, last: (t) => t.last_at });
  // 모바일은 차트 카드 셋을 탭 하나로(PC 는 그대로)
  const ms = useMobileSections("보기", [{ value: "daily", label: "일별" }, { value: "top", label: "인기" }, { value: "zero", label: "무결과" }]);
  return (
    <div>
      <AdminTitle title="검색 품질" desc="사용자가 무엇을 찾고 무엇을 못 찾는지 봅니다. 무결과 검색어가 곧 다음에 만들 에셋 목록입니다." />
      <div className="mt-7 flex flex-wrap items-center gap-2">
        <ChoiceButton size="sm" label="기간" value={String(days)} onChange={(v) => set({ days: v === "30" ? "" : v })} options={DAYS} allLabel="30일" />
        {s && <span className="ml-auto text-sm text-ink-4">채널 {Object.entries(s.channels).map(([k, n]) => `${k} ${n.toLocaleString()}`).join(" · ") || "—"}</span>}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="검색" value={s ? s.total.toLocaleString() : null} sub={`최근 ${days}일`} />
        <Kpi label="무결과율" value={s ? `${s.zero_rate}%` : null} sub={s ? `${s.zero.toLocaleString()}건이 0건` : ""} tone={s ? rateTone(s.zero_rate) : undefined} />
        <Kpi label="검색어 종류" value={s ? s.distinct.toLocaleString() : null} sub="서로 다른 검색어" />
        <Kpi label="검색한 사용자" value={s ? s.users.toLocaleString() : null} sub="로그인 사용자 기준" />
      </div>

      <div className="mt-5 sm:hidden">{ms.bar}</div>

      <Card className={cn("mt-5", ms.hide("daily"))}>
        <CardHeader>
          <CardTitle>일별 무결과율</CardTitle>
          <CardDescription>날마다 검색 중 결과가 0건이던 비율입니다.</CardDescription>
        </CardHeader>
        <CardContent>
          {s ? (
            s.daily.length === 0 ? <p className="py-10 text-center text-ink-4">이 기간에 검색 기록이 없습니다.</p> : (
              <ChartContainer config={chartConfig} className="aspect-auto h-[200px] w-full">
                <AreaChart data={s.daily.map((d) => ({ ...d, day: d.day.slice(5) }))} margin={{ left: 0, right: 8, top: 4 }}>
                  <defs>
                    <linearGradient id="fillZero" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-zero_rate)" stopOpacity={0.6} /><stop offset="95%" stopColor="var(--color-zero_rate)" stopOpacity={0.05} /></linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} interval="preserveStartEnd" />
                  <YAxis domain={[0, 100]} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => `${v}%`} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" labelFormatter={(v) => `${v}일`} formatter={(v, _n, p) => (<div className="flex w-full items-center gap-2"><span className="text-muted-foreground">무결과율</span><span className="ml-auto font-medium tabular-nums">{Number(v)}% <span className="font-normal text-muted-foreground">({p.payload.zero}/{p.payload.total})</span></span></div>)} />} />
                  <Area dataKey="zero_rate" type="natural" fill="url(#fillZero)" stroke="var(--color-zero_rate)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ChartContainer>
            )
          ) : <Skeleton className="h-[200px] w-full" />}
        </CardContent>
      </Card>

      <div className={cn("mt-5 grid gap-5 lg:grid-cols-2", ms.value === "daily" && "max-sm:hidden")}>
        <Card className={ms.hide("top")}>
          <CardHeader><CardTitle>인기 검색어 TOP 10</CardTitle><CardDescription>결과가 있던 검색만 셉니다.</CardDescription></CardHeader>
          <CardContent className="px-0">
            {s && <TopBars rows={s.top} config={topConfig} />}
            <Table className="table-fixed">
              <TableHeader><TableRow><TableHead className="w-[56px]">순위</TableHead><SortHead s={top} k="q">검색어</SortHead><SortHead s={top} k="count" className="w-[80px]">횟수</SortHead><SortHead s={top} k="results" className="w-[88px]">결과</SortHead></TableRow></TableHeader>
              <TableBody>
                {top.rows.map((t) => (
                  <TableRow key={t.q}><TableCell className="text-center tabular-nums">{(s?.top ?? []).indexOf(t) + 1}</TableCell><TableCell className="truncate text-left font-semibold">{t.q}</TableCell><TableCell className="text-right tabular-nums">{t.count.toLocaleString()}</TableCell><TableCell className="text-right tabular-nums text-ink-3">{t.results.toLocaleString()}</TableCell></TableRow>
                ))}
                {s && s.top.length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-ink-4">없음</TableCell></TableRow>}
                {!s && <TableRow><TableCell colSpan={4} className="py-8 text-center text-ink-4">불러오는 중</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card className={ms.hide("zero")}>
          <CardHeader><CardTitle>무결과 검색어 TOP 10</CardTitle><CardDescription>이 기간에 한 번도 결과를 못 낸 검색어입니다.</CardDescription></CardHeader>
          <CardContent className="px-0">
            {s && <TopBars rows={s.zero_top} config={zeroConfig} />}
            <Table className="table-fixed">
              <TableHeader><TableRow><TableHead className="w-[56px]">순위</TableHead><SortHead s={zero} k="q">검색어</SortHead><SortHead s={zero} k="count" className="w-[80px]">횟수</SortHead><SortHead s={zero} k="last" className="hidden w-[120px] sm:table-cell">마지막</SortHead></TableRow></TableHeader>
              <TableBody>
                {zero.rows.map((t) => (
                  <TableRow key={t.q}><TableCell className="text-center tabular-nums">{(s?.zero_top ?? []).indexOf(t) + 1}</TableCell><TableCell className="truncate text-left font-semibold">{t.q}</TableCell><TableCell className="text-right tabular-nums">{t.count.toLocaleString()}</TableCell><TableCell className="hidden text-center tabular-nums text-ink-3 sm:table-cell">{fmtAt(t.last_at).slice(0, 10)}</TableCell></TableRow>
                ))}
                {s && s.zero_top.length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-ink-4">없음</TableCell></TableRow>}
                {!s && <TableRow><TableCell colSpan={4} className="py-8 text-center text-ink-4">불러오는 중</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <Copy className="mt-4 text-sm text-ink-4" text="무결과 검색어는 에셋 등록 뒤에도 다시 검색되기 전까지 목록에 남습니다. 동의어 사전에 넣을 말인지도 같이 보세요." />
    </div>
  );
}

function TopBars({ rows, config }: { rows: { q: string; count: number }[]; config: ChartConfig }) {
  if (rows.length === 0) return null;
  return (
    <ChartContainer config={config} className="aspect-auto w-full px-4" style={{ height: rows.length * 30 + 16 }}>
      <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 36, top: 4, bottom: 4 }} barSize={18}>
        <CartesianGrid horizontal={false} />
        <YAxis dataKey="q" type="category" tickLine={false} axisLine={false} width={96} tick={{ fontSize: 12 }} tickFormatter={(v: string) => (v.length > 8 ? v.slice(0, 8) + "…" : v)} />
        <XAxis dataKey="count" type="number" hide />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={4}>
          <LabelList dataKey="count" position="right" offset={8} className="fill-foreground" fontSize={12} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string | null; sub: string; tone?: "ok" | "warn" | "soft" }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="flex items-center gap-2 text-2xl tabular-nums">{value === null ? <Skeleton className="h-7 w-20" /> : value}{tone && value !== null && <Tag tone={tone}>{tone === "ok" ? "좋음" : tone === "soft" ? "보통" : "주의"}</Tag>}</CardTitle>
        {sub && <CardDescription>{sub}</CardDescription>}
      </CardHeader>
    </Card>
  );
}

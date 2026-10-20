// 관리자 · 방문자 통계(2026-10-20, 사용자 "방문자 통계 전체·솔루션별·브라우저·디바이스별 등 디테일한 통계 관리 페이지").
// 데이터 = stat_hits(화면 이동마다 한 줄 + 키 호출 한 줄, 설계 docs/db-design.md §6.2) → GET /admin/stats 집계. 화면은 admin-search 와 같은 Card·Table·Chart.
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { AdminTitle, SortHead, useQueryState, useSort } from "@/components/admin/admin-ui";
import { ChoiceButton } from "@/components/hb/choice-button";
import { Copy } from "@/components/hb/copy";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchVisitStats, fmtAt, type StatGroup, type VisitStats } from "@/lib/admin";
import { cn } from "@/lib/utils";
import type { Route } from "./+types/admin-stats";

export const meta: Route.MetaFunction = () => [{ title: "방문자 통계 — powerPlus 관리자" }];

const DAYS = [{ id: "7", label: "7일" }, { id: "30", label: "30일" }, { id: "90", label: "90일" }, { id: "180", label: "180일" }, { id: "365", label: "1년" }];
export const MOD_KO: Record<string, string> = { home: "홈", assets: "powerAssets", deck: "powerDeck", mock: "powerMock", guide: "powerGuide", community: "커뮤니티", mcp: "powerMCP 안내", account: "계정", help: "안내·도움말", admin: "관리자", etc: "기타" };
const CH_KO: Record<string, string> = { web: "웹", addin: "PPT 애드인", mcp: "powerMCP", api: "REST 키" };
const DEV_KO: Record<string, string> = { desktop: "PC", mobile: "모바일", tablet: "태블릿" };
const WD = ["월", "화", "수", "목", "금", "토", "일"];
const dailyConfig = { uv: { label: "방문자", color: "var(--color-chart)" }, pv: { label: "페이지뷰", color: "var(--color-point, #E46B37)" } } satisfies ChartConfig;

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
const n = (v: number) => v.toLocaleString();

export default function AdminStats() {
  const { get, set } = useQueryState();
  const days = Number(get("days") || 30);
  const module = get("module") || "";
  const channel = get("channel") || "";
  const admin = get("admin") || "";
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86400_000);
  const q = useQuery({ queryKey: ["admin", "stats", days, module, channel, admin], queryFn: () => fetchVisitStats({ from: ymd(from), to: ymd(to), module, channel, admin }) });
  const s = q.data;
  return (
    <div>
      <AdminTitle title="방문자 통계" desc="누가 언제 어떤 솔루션을 어떤 기기로 쓰는지 봅니다. 화면 이동과 키 호출을 한 줄씩 셉니다." />
      <div className="mt-7 flex flex-wrap items-center gap-2">
        <ChoiceButton size="sm" label="기간" value={String(days)} onChange={(v) => set({ days: v === "30" ? "" : v })} options={DAYS} allLabel="30일" showAll={false} />
        <ChoiceButton size="sm" label="솔루션" value={module} onChange={(v) => set({ module: v })} options={Object.entries(MOD_KO).map(([id, label]) => ({ id, label }))} />
        <ChoiceButton size="sm" label="채널" value={channel} onChange={(v) => set({ channel: v })} options={Object.entries(CH_KO).map(([id, label]) => ({ id, label }))} />
        <ChoiceButton size="sm" label="관리자 화면" value={admin} onChange={(v) => set({ admin: v })} options={[{ id: "1", label: "포함" }]} allLabel="뺌" />
        {s && <span className="ml-auto text-sm text-ink-4">{s.from} ~ {s.to}{s.first_at ? ` · 기록 시작 ${fmtAt(s.first_at).slice(0, 10)}` : " · 아직 기록 없음"}</span>}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="방문자" value={s && n(s.total.uv)} sub={s ? diff(s.total.uv, s.prev.uv) : ""} />
        <Kpi label="방문" value={s && n(s.total.visits)} sub={s ? diff(s.total.visits, s.prev.visits) : ""} />
        <Kpi label="페이지뷰" value={s && n(s.total.pv)} sub={s ? diff(s.total.pv, s.prev.pv) : ""} />
        <Kpi label="회원 방문자" value={s && n(s.total.members)} sub={s ? `방문자의 ${pct(s.total.members, s.total.uv)}%` : ""} />
        <Kpi label="처음 온 방문자" value={s && n(s.total.new_visitors)} sub={s ? `방문자의 ${pct(s.total.new_visitors, s.total.uv)}%` : ""} />
        <Kpi label="방문당 페이지" value={s && String(s.total.pages_per_visit)} sub="페이지뷰 ÷ 방문" />
        <Kpi label="한 페이지만 보고 나감" value={s && `${pct(s.total.bounce, s.total.visits)}%`} sub={s ? `${n(s.total.bounce)}번의 방문` : ""} />
        <Kpi label="직접 들어온 방문" value={s && n(s.direct_visits)} sub="주소 입력·북마크·사내 링크" />
      </div>

      <Card className="mt-5">
        <CardHeader><CardTitle>일별 추이</CardTitle><CardDescription>날마다 방문자와 페이지뷰입니다.</CardDescription></CardHeader>
        <CardContent>
          {!s ? <Skeleton className="h-[220px] w-full" /> : s.daily.length === 0 ? <Empty /> : (
            <ChartContainer config={dailyConfig} className="aspect-auto h-[220px] w-full">
              <AreaChart data={s.daily.map((d) => ({ ...d, day: d.day.slice(5) }))} margin={{ left: 0, right: 8, top: 4 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} interval="preserveStartEnd" />
                <YAxis tickLine={false} axisLine={false} width={44} allowDecimals={false} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" labelFormatter={(v) => `${v}일`} />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Area dataKey="pv" type="monotone" fill="var(--color-pv)" fillOpacity={0.12} stroke="var(--color-pv)" strokeWidth={2} dot={false} />
                <Area dataKey="uv" type="monotone" fill="var(--color-uv)" fillOpacity={0.25} stroke="var(--color-uv)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card className="mt-5">
        <CardHeader><CardTitle>솔루션별</CardTitle><CardDescription>방문자 = 그 솔루션 화면을 한 번이라도 본 사람(브라우저) 수입니다.</CardDescription></CardHeader>
        <CardContent className="px-0"><GroupTable rows={s?.modules} label="솔루션" ko={MOD_KO} total={s?.total.uv ?? 0} /></CardContent>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>채널</CardTitle><CardDescription>웹·PPT 애드인·powerMCP(키 호출)입니다.</CardDescription></CardHeader>
          <CardContent><ShareList rows={s?.channels} ko={CH_KO} by="pv" unit="번" /></CardContent></Card>
        <Card><CardHeader><CardTitle>기기</CardTitle><CardDescription>웹·애드인 방문자 기준입니다.</CardDescription></CardHeader>
          <CardContent><ShareList rows={s?.devices} ko={DEV_KO} /></CardContent></Card>
        <Card><CardHeader><CardTitle>브라우저</CardTitle><CardDescription>웹·애드인 방문자 기준입니다.</CardDescription></CardHeader>
          <CardContent><ShareList rows={s?.browsers} /></CardContent></Card>
        <Card><CardHeader><CardTitle>운영체제</CardTitle><CardDescription>웹·애드인 방문자 기준입니다.</CardDescription></CardHeader>
          <CardContent><ShareList rows={s?.os} /></CardContent></Card>
        <Card><CardHeader><CardTitle>화면 폭</CardTitle><CardDescription>방문 때 브라우저 창 폭(px)입니다.</CardDescription></CardHeader>
          <CardContent><ShareList rows={s && [...s.widths].sort((a, b) => wOrder(a.key) - wOrder(b.key))} /></CardContent></Card>
        <Card><CardHeader><CardTitle>언어</CardTitle><CardDescription>브라우저 언어 설정입니다.</CardDescription></CardHeader>
          <CardContent><ShareList rows={s?.langs} /></CardContent></Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>유입 경로</CardTitle><CardDescription>바깥 사이트에서 들어온 방문입니다. 사이트 안 이동은 빼고 셉니다.</CardDescription></CardHeader>
          <CardContent className="px-0"><GroupTable rows={s?.refs} label="들어온 곳" total={s?.total.visits ?? 0} by="visits" /></CardContent></Card>
        <Card><CardHeader><CardTitle>활동 많은 회원 10</CardTitle><CardDescription>로그인한 상태로 본 페이지 수입니다.</CardDescription></CardHeader>
          <CardContent className="px-0"><MemberTable rows={s?.members} /></CardContent></Card>
      </div>

      <Card className="mt-5">
        <CardHeader><CardTitle>인기 페이지 20</CardTitle><CardDescription>쿼리(?)를 뺀 주소 기준입니다.</CardDescription></CardHeader>
        <CardContent className="px-0"><PageTable rows={s?.pages} /></CardContent>
      </Card>

      <Card className="mt-5">
        <CardHeader><CardTitle>요일·시간대</CardTitle><CardDescription>페이지뷰가 많을수록 진합니다(한국 시간).</CardDescription></CardHeader>
        <CardContent>{s ? <Heat rows={s.heat} /> : <Skeleton className="h-[180px] w-full" />}</CardContent>
      </Card>
      <Copy className="mt-4 text-sm text-ink-4" text="방문자는 브라우저 기준이라 같은 사람이 PC와 휴대폰으로 오면 둘로 셉니다. IP·브라우저 정보 원문은 저장하지 않습니다. 기록은 400일 보관합니다." />
    </div>
  );
}

const wOrder = (k: string) => ["~479", "480~767", "768~1023", "1024~1439", "1440~1919", "1920~", "모름"].indexOf(k);

function diff(now: number, prev: number) {
  if (prev === 0) return now > 0 ? "지난 기간 기록 없음" : "";
  const d = Math.round(((now - prev) / prev) * 1000) / 10;
  return `지난 기간보다 ${d > 0 ? "+" : ""}${d}%`;
}

function Kpi({ label, value, sub }: { label: string; value: string | null | undefined; sub: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value == null ? <Skeleton className="h-7 w-20" /> : value}</CardTitle>
        {sub && <CardDescription>{sub}</CardDescription>}
      </CardHeader>
    </Card>
  );
}

function Empty() {
  return <p className="py-10 text-center text-ink-4">이 기간에 기록이 없습니다.</p>;
}

/** 막대 목록 — 이름 · 막대 · 수(비율). 방문자(uv) 기준이 기본 */
function ShareList({ rows, ko, by = "uv", unit = "명" }: { rows?: StatGroup[] | null; ko?: Record<string, string>; by?: "uv" | "pv"; unit?: string }) {
  if (!rows) return <Skeleton className="h-[140px] w-full" />;
  if (rows.length === 0) return <Empty />;
  const total = rows.reduce((a, r) => a + r[by], 0);
  const max = Math.max(...rows.map((r) => r[by]), 1);
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.slice(0, 10).map((r) => (
        <li key={r.key} className="grid grid-cols-[96px_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-ink-2">{ko?.[r.key] ?? (r.key || "모름")}</span>
          <span className="h-2 rounded-full bg-line"><span className="block h-2 rounded-full bg-ink" style={{ width: `${(r[by] / max) * 100}%` }} /></span>
          <span className="text-right tabular-nums text-ink-3">{n(r[by])}{unit} <span className="text-ink-4">{pct(r[by], total)}%</span></span>
        </li>
      ))}
    </ul>
  );
}

function GroupTable({ rows, label, ko, total, by = "uv" }: { rows?: StatGroup[]; label: string; ko?: Record<string, string>; total: number; by?: "uv" | "visits" }) {
  const t = useSort(rows ?? [], { key: (r) => ko?.[r.key] ?? r.key, uv: (r) => r.uv, visits: (r) => r.visits, pv: (r) => r.pv });
  return (
    <Table className="table-fixed">
      <TableHeader><TableRow><SortHead s={t} k="key">{label}</SortHead><SortHead s={t} k="uv" className="w-[88px]">방문자</SortHead><SortHead s={t} k="visits" className="w-[80px]">방문</SortHead><SortHead s={t} k="pv" className="hidden w-[96px] sm:table-cell">페이지뷰</SortHead><TableHead className="w-[72px]">비율</TableHead></TableRow></TableHeader>
      <TableBody>
        {t.rows.map((r) => (
          <TableRow key={r.key}>
            <TableCell className="truncate text-left font-semibold">{ko?.[r.key] ?? r.key}</TableCell>
            <TableCell className="text-right tabular-nums">{n(r.uv)}</TableCell>
            <TableCell className="text-right tabular-nums">{n(r.visits)}</TableCell>
            <TableCell className="hidden text-right tabular-nums text-ink-3 sm:table-cell">{n(r.pv)}</TableCell>
            <TableCell className="text-right tabular-nums text-ink-3">{pct(r[by], total)}%</TableCell>
          </TableRow>
        ))}
        {rows && rows.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-ink-4">없음</TableCell></TableRow>}
        {!rows && <TableRow><TableCell colSpan={5} className="py-8 text-center text-ink-4">불러오는 중</TableCell></TableRow>}
      </TableBody>
    </Table>
  );
}

function PageTable({ rows }: { rows?: VisitStats["pages"] }) {
  const t = useSort(rows ?? [], { path: (r) => r.path, module: (r) => r.module, pv: (r) => r.pv, uv: (r) => r.uv });
  return (
    <Table className="table-fixed">
      <TableHeader><TableRow><TableHead className="w-[56px]">순위</TableHead><SortHead s={t} k="path">주소</SortHead><SortHead s={t} k="module" className="hidden w-[128px] sm:table-cell">솔루션</SortHead><SortHead s={t} k="pv" className="w-[96px]">페이지뷰</SortHead><SortHead s={t} k="uv" className="w-[88px]">방문자</SortHead></TableRow></TableHeader>
      <TableBody>
        {t.rows.map((r) => (
          <TableRow key={r.path}>
            <TableCell className="text-center tabular-nums">{(rows ?? []).indexOf(r) + 1}</TableCell>
            <TableCell className="truncate text-left font-mono text-sm">{r.path}</TableCell>
            <TableCell className="hidden text-center text-ink-3 sm:table-cell">{MOD_KO[r.module] ?? r.module}</TableCell>
            <TableCell className="text-right tabular-nums">{n(r.pv)}</TableCell>
            <TableCell className="text-right tabular-nums text-ink-3">{n(r.uv)}</TableCell>
          </TableRow>
        ))}
        {rows && rows.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-ink-4">없음</TableCell></TableRow>}
        {!rows && <TableRow><TableCell colSpan={5} className="py-8 text-center text-ink-4">불러오는 중</TableCell></TableRow>}
      </TableBody>
    </Table>
  );
}

function MemberTable({ rows }: { rows?: VisitStats["members"] }) {
  return (
    <Table className="table-fixed">
      <TableHeader><TableRow><TableHead className="w-[56px]">순위</TableHead><TableHead>회원</TableHead><TableHead className="w-[96px]">페이지뷰</TableHead><TableHead className="w-[72px]">온 날</TableHead><TableHead className="hidden w-[112px] sm:table-cell">마지막</TableHead></TableRow></TableHeader>
      <TableBody>
        {(rows ?? []).map((r, i) => (
          <TableRow key={`${r.name}-${i}`}>
            <TableCell className="text-center tabular-nums">{i + 1}</TableCell>
            <TableCell className="truncate text-left font-semibold">{r.name}</TableCell>
            <TableCell className="text-right tabular-nums">{n(r.pv)}</TableCell>
            <TableCell className="text-right tabular-nums">{r.days}일</TableCell>
            <TableCell className="hidden text-center tabular-nums text-ink-3 sm:table-cell">{fmtAt(r.last).slice(5, 16)}</TableCell>
          </TableRow>
        ))}
        {rows && rows.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-ink-4">없음</TableCell></TableRow>}
        {!rows && <TableRow><TableCell colSpan={5} className="py-8 text-center text-ink-4">불러오는 중</TableCell></TableRow>}
      </TableBody>
    </Table>
  );
}

/** 요일 7 × 시간 24 — 칸 진하기 = 페이지뷰. 모바일은 칸이 좁아져도 가로 스크롤 없이 */
function Heat({ rows }: { rows: VisitStats["heat"] }) {
  if (rows.length === 0) return <Empty />;
  const m = new Map(rows.map((r) => [`${r.wd}-${r.h}`, r.pv]));
  const max = Math.max(...rows.map((r) => r.pv), 1);
  return (
    <div className="grid min-w-0 grid-cols-[24px_repeat(24,minmax(0,1fr))] gap-[2px] text-xs">
      <span />
      {Array.from({ length: 24 }, (_, h) => <span key={h} className={cn("text-center tabular-nums text-ink-4", h % 3 !== 0 && "max-sm:invisible")}>{h}</span>)}
      {WD.map((w, wd) => (
        <div key={w} className="contents">
          <span className="self-center text-center text-ink-3">{w}</span>
          {Array.from({ length: 24 }, (_, h) => {
            const v = m.get(`${wd}-${h}`) ?? 0;
            return <span key={h} title={`${w} ${h}시 · ${v.toLocaleString()}`} className="aspect-square rounded-[3px] bg-ink" style={{ opacity: v === 0 ? 0.06 : 0.15 + (v / max) * 0.85 }} />;
          })}
        </div>
      ))}
    </div>
  );
}

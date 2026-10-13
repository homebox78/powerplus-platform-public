// 관리자 · powerGuide 현황 — api/routes/admin_guide.php (사용자 2026-10-14 "admin 에 파워가이드 관리·설정 메뉴가 없네?").
// powerGuide 내용은 코드가 정본(packages/kit · modules/guide/data · guide-files)이라 편집 화면이 아니라
// ① 배포된 자료가 제대로 실렸는지 ② 부품·체크리스트 구성 ③ MCP·REST 로 얼마나 불리는지 ④ 어디를 고치면 되는지를 본다. 틀은 admin-search.tsx 와 같다.
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { AdminTitle, SortHead, useQueryState, useSort } from "@/components/admin/admin-ui";
import { ChoiceButton } from "@/components/hb/choice-button";
import { Copy } from "@/components/hb/copy";
import { Tag } from "@/components/hb/tag";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchGuideAdmin, fmtAt } from "@/lib/admin";
import type { Route } from "./+types/admin-guide";

export const meta: Route.MetaFunction = () => [{ title: "powerGuide — powerPlus 관리자" }];

const DAYS = [{ id: "7", label: "7일" }, { id: "30", label: "30일" }, { id: "90", label: "90일" }];
const chartConfig = { calls: { label: "호출", color: "var(--color-chart)" } } satisfies ChartConfig;
// 판정 이름 — modules/guide/screens.tsx VERDICT 와 같은 말
const VERDICT: Record<string, { label: string; tone: "ok" | "warn" | "soft" | "ink" }> = {
  P: { label: "통과", tone: "ok" }, "수정됨": { label: "수정됨", tone: "ok" }, "의도": { label: "의도된 차이", tone: "soft" },
  "사이트": { label: "사이트 담당", tone: "soft" }, "?": { label: "판단 불가", tone: "warn" }, F: { label: "미흡", tone: "ink" },
};
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
// 고치는 곳 — 화면에서 편집하지 않는 이유와 순서
const EDIT = [
  { what: "부품(React·Vue 코드·문서)", where: "packages/kit", how: "버전을 올리고 키트를 빌드합니다. 큰 개편은 versions.json 에 한 줄 더합니다." },
  { what: "토큰(17종 형식)", where: "apps/web/public/guide-files", how: "평면 JSON 을 고친 뒤 build-tailwind-theme 를 다시 돌립니다." },
  { what: "KRDS 지침·패턴·체크리스트", where: "apps/web/app/modules/guide/data", how: "원천을 고치면 배포 때 build-guide-data 가 서버용 사본을 만듭니다." },
];

export default function AdminGuide() {
  const { get, set } = useQueryState();
  const days = Number(get("days") || 30);
  const q = useQuery({ queryKey: ["admin", "guide", days], queryFn: () => fetchGuideAdmin(days) });
  const s = q.data;
  const tools = useSort(s?.usage.tools ?? [], { tool: (t) => t.tool, calls: (t) => t.calls, keys: (t) => t.keys });
  const broken = s ? s.files.filter((f) => !f.ok).length : 0;
  return (
    <div>
      <AdminTitle title="powerGuide" desc="부품·토큰·KRDS 지침이 제대로 실렸는지, 얼마나 쓰이는지 봅니다. 내용은 코드가 정본이라 여기서 고치지 않습니다." />

      <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="부품" value={s ? s.counts.components.toLocaleString() : null} sub={s ? `KRDS ${s.counts.by_source.krds} · shadcn ${s.counts.by_source.shadcn} · 둘 다 ${s.counts.by_source.both}` : ""} />
        <Kpi label="토큰 형식" value={s ? `${s.counts.tokens}종` : null} sub={s ? `키트 v${s.counts.kit_version || "—"}` : ""} />
        <Kpi label="KRDS 지침" value={s ? s.counts.krds_components.toLocaleString() : null} sub={s ? `기본 패턴 ${s.counts.krds_patterns}개` : ""} />
        <Kpi label="검증 체크리스트" value={s ? s.counts.checklist.toLocaleString() : null} sub={s?.counts.checklist_at ? `판정 ${fmtAt(s.counts.checklist_at).slice(0, 10)}` : ""} />
      </div>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">자료 상태{s && <Tag tone={broken ? "warn" : "ok"}>{broken ? `${broken}개 없음` : "모두 정상"}</Tag>}</CardTitle>
          <CardDescription>파일이 없으면 그 자료를 쓰는 화면과 MCP 도구가 멈춥니다.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table className="min-w-[720px] table-fixed">
            <TableHeader><TableRow><TableHead className="w-[170px]">자료</TableHead><TableHead className="w-[210px]">파일</TableHead><TableHead>쓰는 곳</TableHead><TableHead className="w-[80px]">크기</TableHead><TableHead className="w-[150px]">갱신</TableHead><TableHead className="w-[72px]">상태</TableHead></TableRow></TableHeader>
            <TableBody>
              {s?.files.map((f) => (
                <TableRow key={f.label}>
                  <TableCell className="text-left font-semibold">{f.label}</TableCell>
                  <TableCell className="truncate text-left text-ink-3">{f.path || "—"}</TableCell>
                  <TableCell className="truncate text-left text-ink-3">{f.feeds}</TableCell>
                  <TableCell className="text-right tabular-nums">{f.ok ? kb(f.size) : "—"}</TableCell>
                  <TableCell className="text-center tabular-nums text-ink-3">{f.updated_at ? fmtAt(f.updated_at).slice(0, 16) : "—"}</TableCell>
                  <TableCell className="text-center"><Tag tone={f.ok ? "ok" : "warn"}>{f.ok ? "정상" : "없음"}</Tag></TableCell>
                </TableRow>
              ))}
              {!s && <TableRow><TableCell colSpan={6} className="py-8 text-center text-ink-4">불러오는 중</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>부품 분류</CardTitle><CardDescription>분류마다 부품 수와 출처(KRDS 원형 · shadcn · 둘을 합친 것)입니다.</CardDescription></CardHeader>
          <CardContent className="px-0">
            <Table className="table-fixed">
              <TableHeader><TableRow><TableHead>분류</TableHead><TableHead className="w-[64px]">부품</TableHead><TableHead className="w-[64px]">KRDS</TableHead><TableHead className="w-[72px]">shadcn</TableHead><TableHead className="w-[64px]">둘 다</TableHead></TableRow></TableHeader>
              <TableBody>
                {s?.groups.map((g) => (
                  <TableRow key={g.id}><TableCell className="text-left font-semibold">{g.label}</TableCell><TableCell className="text-right tabular-nums font-semibold">{g.count}</TableCell><TableCell className="text-right tabular-nums text-ink-3">{g.krds}</TableCell><TableCell className="text-right tabular-nums text-ink-3">{g.shadcn}</TableCell><TableCell className="text-right tabular-nums text-ink-3">{g.both}</TableCell></TableRow>
                ))}
                {!s && <TableRow><TableCell colSpan={5} className="py-8 text-center text-ink-4">불러오는 중</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>체크리스트 판정</CardTitle><CardDescription>KRDS 검증 항목을 키트 기준으로 판정한 결과입니다.</CardDescription></CardHeader>
          <CardContent className="px-0">
            <Table className="table-fixed">
              <TableHeader><TableRow><TableHead>판정</TableHead><TableHead className="w-[88px]">항목</TableHead><TableHead className="w-[88px]">비율</TableHead></TableRow></TableHeader>
              <TableBody>
                {s?.verdicts.map((v) => (
                  <TableRow key={v.verdict}>
                    <TableCell className="text-center"><Tag tone={VERDICT[v.verdict]?.tone ?? "soft"}>{VERDICT[v.verdict]?.label ?? v.verdict}</Tag></TableCell>
                    <TableCell className="text-right tabular-nums">{v.count}</TableCell>
                    <TableCell className="text-right tabular-nums text-ink-3">{s.counts.checklist ? `${Math.round((v.count / s.counts.checklist) * 100)}%` : "—"}</TableCell>
                  </TableRow>
                ))}
                {!s && <TableRow><TableCell colSpan={3} className="py-8 text-center text-ink-4">불러오는 중</TableCell></TableRow>}
              </TableBody>
            </Table>
            <div className="px-6 pt-3 text-sm"><Link to="/guide/a11y" className="font-semibold underline underline-offset-4">항목별 근거 보기</Link></div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-extrabold tracking-[-0.02em]">이용</h2>
        <span className="ml-auto" />
        <ChoiceButton size="sm" label="기간" value={String(days)} onChange={(v) => set({ days: v === "30" ? "" : v })} options={DAYS} allLabel="30일" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="guide 도구 호출" value={s ? s.usage.total.toLocaleString() : null} sub={`최근 ${days}일 · MCP·REST`} />
        <Kpi label="부른 키" value={s ? s.usage.keys.toLocaleString() : null} sub="서로 다른 API 키" />
        <Kpi label="전체 호출 중" value={s ? `${s.usage.share}%` : null} sub="모든 모듈 호출 대비" />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>일별 호출</CardTitle><CardDescription>웹 화면 열람은 세지 않고 키로 부른 것만 셉니다.</CardDescription></CardHeader>
          <CardContent>
            {s ? (
              s.usage.daily.length === 0 ? <p className="py-10 text-center text-ink-4">이 기간에 호출이 없습니다.</p> : (
                <ChartContainer config={chartConfig} className="aspect-auto h-[200px] w-full">
                  <AreaChart data={s.usage.daily.map((d) => ({ ...d, day: d.day.slice(5) }))} margin={{ left: 0, right: 8, top: 4 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} interval="preserveStartEnd" />
                    <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" labelFormatter={(v) => `${v}일`} />} />
                    <Area dataKey="calls" type="monotone" fill="var(--color-calls)" fillOpacity={0.15} stroke="var(--color-calls)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ChartContainer>
              )
            ) : <Skeleton className="h-[200px] w-full" />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>도구별 호출</CardTitle><CardDescription>AI 도구가 어떤 규칙 자료를 많이 찾는지 봅니다.</CardDescription></CardHeader>
          <CardContent className="px-0">
            <Table className="table-fixed">
              <TableHeader><TableRow><SortHead s={tools} k="tool">도구</SortHead><SortHead s={tools} k="calls" className="w-[88px]">호출</SortHead><SortHead s={tools} k="keys" className="w-[72px]">키</SortHead></TableRow></TableHeader>
              <TableBody>
                {tools.rows.map((t) => (
                  <TableRow key={t.tool}><TableCell className="truncate text-left font-semibold">{t.tool}</TableCell><TableCell className="text-right tabular-nums">{t.calls.toLocaleString()}</TableCell><TableCell className="text-right tabular-nums text-ink-3">{t.keys}</TableCell></TableRow>
                ))}
                {s && s.usage.tools.length === 0 && <TableRow><TableCell colSpan={3} className="py-8 text-center text-ink-4">없음</TableCell></TableRow>}
                {!s && <TableRow><TableCell colSpan={3} className="py-8 text-center text-ink-4">불러오는 중</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-10">
        <CardHeader><CardTitle>내용을 고치려면</CardTitle><CardDescription>코드가 정본이라 저장소에서 고치고 배포하면 이 화면과 MCP 에 함께 반영됩니다.</CardDescription></CardHeader>
        <CardContent className="px-0">
          <Table className="min-w-[640px] table-fixed">
            <TableHeader><TableRow><TableHead className="w-[200px]">무엇</TableHead><TableHead className="w-[260px]">어디</TableHead><TableHead>어떻게</TableHead></TableRow></TableHeader>
            <TableBody>
              {EDIT.map((e) => (
                <TableRow key={e.what}><TableCell className="text-left font-semibold">{e.what}</TableCell><TableCell className="text-left font-mono text-sm text-ink-3">{e.where}</TableCell><TableCell className="text-left"><Copy text={e.how} /></TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string | null; sub: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value === null ? <Skeleton className="h-7 w-20" /> : value}</CardTitle>
        {sub && <CardDescription>{sub}</CardDescription>}
      </CardHeader>
    </Card>
  );
}

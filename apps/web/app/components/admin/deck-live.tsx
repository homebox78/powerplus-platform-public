// 지금 도는 장표 작업 — 관리자 대시보드 맨 위(팀장 2026-10-28 "모든 사용자가 돌리거나 작업하는 작업이 모니터링되게").
// 데이터 = GET /admin/deck/live(api/routes/admin.php), 7초마다. 탭이 가려지면 쉬고(refetchIntervalInBackground=false),
// 앞 요청이 아직 진행 중이면 React Query 가 새 요청을 만들지 않고 그 요청을 기다린다(겹쳐 쏘지 않음).
// 주황(point)은 늦었거나 멈춘 것만 — 응답이 2분 넘게 없는 진행 작업, 오늘 실패. 표는 가로 스크롤 없이 화면 폭에 따라 칸을 줄인다.
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { LiveStatus } from "@/components/hb/live-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type DeckLiveJob, type DeckLiveStatus, fetchDeckLive } from "@/lib/admin";
import { useMe } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type { Job } from "@/modules/deck/legacy/api";
import { stageLabel } from "@/modules/deck/legacy/stages";

const STATUS_KO: Record<DeckLiveStatus, string> = { running: "진행 중", queued: "대기", review: "확인 대기", hold: "시작 대기" };
/** 응답(heartbeat)이 이만큼 없으면 경고색 — 운영 현황판 '멈춘 작업'(10분)보다 먼저 눈에 띄게 */
const STALE_SEC = 120;

/** 종류 — 사용자가 고른 말로 */
const kindKo = (j: DeckLiveJob) => {
  if (j.phase === "edit") return "글 고치기";
  if (j.kind !== "design") return "초안 다듬기";
  if (j.purpose === "submit") return "세로 제안서";
  if (j.purpose === "company") return "회사소개서";
  return "가로 발표 장표";
};
/** 단계 — 엔진이 보고한 이름이 아니라 사용자 말(stages.ts 의 label) */
const stageKo = (j: DeckLiveJob) => {
  if (j.status === "queued") return j.queue_pos ? `대기 ${j.queue_pos}번째` : "대기열";
  if (j.status === "hold") return "자료 올리는 중 · 시작 전";
  if (j.status === "review") return `${j.stage ? stageLabel({ kind: j.kind, phase: j.phase, stage: j.stage, opts: { purpose: j.purpose } } as unknown as Job) : "확인"} · 사용자 확인 기다림`;
  if (j.cancel_requested) return "멈추는 중…";
  return stageLabel({ kind: j.kind, phase: j.phase, stage: j.stage, opts: { purpose: j.purpose } } as unknown as Job);
};
const dur = (s: number) => {
  s = Math.max(0, Math.round(s));
  if (s < 60) return `${s}초`;
  if (s < 3600) return `${Math.floor(s / 60)}분`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 ${Math.floor((s % 3600) / 60)}분`;
  return `${Math.floor(s / 86400)}일`;
};
const usd = (v: number) => `$${v.toFixed(v >= 10 ? 1 : 2)}`;

export function DeckLivePanel() {
  const { isAdmin } = useMe();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["admin", "deck-live"], queryFn: fetchDeckLive, enabled: isAdmin, refetchInterval: 7_000, refetchIntervalInBackground: false });
  // 새로 고침 사이에도 경과·응답 초가 흐르게 — 받은 뒤 지난 초를 더한다(1초 시계, 탭이 가려지면 멈춤)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => { if (document.visibilityState === "visible") setNow(Date.now()); }, 1000);
    return () => window.clearInterval(t);
  }, []);
  const d = q.data;
  const since = d ? Math.max(0, (now - q.dataUpdatedAt) / 1000) : 0;

  if (!isAdmin) return null;
  if (q.isLoading) return <Skeleton className="h-[220px] w-full rounded-panel" />;
  if (!d) return null;

  const eng = d.engine;
  const busy = eng.workers.reduce((t, w) => t + w.running, 0);
  const stale = d.jobs.filter((j) => j.heartbeat_sec !== null && j.heartbeat_sec + since >= STALE_SEC).length;
  const c = d.counts;
  const t = d.today;

  return (
    <Card className="min-w-0 gap-3 py-4" aria-label="지금 도는 장표 작업">
      <CardHeader className="px-4">
        <CardTitle className="text-md">지금 도는 장표 작업</CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>진행 <b className="tabular-nums text-ink">{c.running}</b> · 대기 <b className="tabular-nums text-ink">{c.queued}</b> · 확인 대기 <b className="tabular-nums text-ink">{c.review}</b> · 시작 대기 <b className="tabular-nums text-ink">{c.hold}</b></span>
          {stale > 0 && <span className="font-semibold text-point-ink"><AlertTriangle className="mr-0.5 inline size-3.5 align-[-2px]" aria-hidden />응답 없는 작업 {stale}</span>}
          <span className="text-xs text-ink-4">7초마다 새로 고침</span>
        </CardDescription>
        <CardAction><Button size="sm" variant="outline" asChild><Link to="/admin/deck">전체 작업</Link></Button></CardAction>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-3 px-0">
        {/* 엔진 한 줄 */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-4 text-sm text-ink-3">
          <LiveStatus state={eng.online ? "ok" : "off"}>{eng.online ? "엔진 켜짐" : "엔진 꺼짐"}</LiveStatus>
          {eng.online ? (
            <span className="min-w-0 truncate">
              엔진 {eng.workers.length}대 · 자리 {eng.slots === null ? "?" : eng.slots}개 중 <b className="tabular-nums text-ink">{busy}</b>개 사용
              <span className="hidden text-ink-4 sm:inline"> — {eng.workers.map((w) => `${w.name}${w.slots ? ` ${w.running}/${w.slots}` : ` ${w.running}`}`).join(" · ")}</span>
            </span>
          ) : (
            <span className={cn(c.queued > 0 && "font-semibold text-point-ink")}>2분 넘게 연결된 엔진이 없습니다{c.queued > 0 ? ` — 대기 ${c.queued}건이 기다리는 중` : ""}.</span>
          )}
        </div>

        {d.jobs.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-ink-4">지금 도는 작업이 없습니다.</div>
        ) : (
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[88px]">상태</TableHead>
                <TableHead>작업</TableHead>
                <TableHead className="hidden w-[190px] md:table-cell">사용자</TableHead>
                <TableHead className="w-[120px] sm:w-[180px]">단계 · 진행</TableHead>
                <TableHead className="hidden w-[84px] lg:table-cell">경과</TableHead>
                <TableHead className="hidden w-[96px] md:table-cell">마지막 응답</TableHead>
                <TableHead className="hidden w-[76px] lg:table-cell">비용</TableHead>
                <TableHead className="hidden w-[120px] xl:table-cell">엔진</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.jobs.map((j) => {
                const hb = j.heartbeat_sec === null ? null : j.heartbeat_sec + since;
                const late = hb !== null && hb >= STALE_SEC;
                const ev = j.last_event?.message ?? "";
                const who = j.owner ?? j.email;
                return (
                  <TableRow key={j.id} className="cursor-pointer" tabIndex={0} onClick={() => navigate(j.url)}
                    onKeyDown={(e) => { if (e.key === "Enter") navigate(j.url); }} aria-label={`${j.title} 작업 열기`}>
                    <TableCell className="text-center">
                      <Badge variant={j.status === "running" ? "default" : "outline"} className={cn("max-w-full", late && "border-point bg-point-soft text-point-ink")}>
                        <span className="truncate">{STATUS_KO[j.status]}</span>
                      </Badge>
                    </TableCell>
                    <TableCell className="min-w-0 text-left">
                      <Link to={j.url} onClick={(e) => e.stopPropagation()} className="block truncate font-semibold hover:underline" title={j.title}>{j.title || "(제목 없음)"}</Link>
                      <span className="block truncate text-xs text-ink-4" title={`${kindKo(j)} · ${who}`}>
                        {kindKo(j)}<span className="md:hidden"> · {who}</span>
                      </span>
                      {ev && <span className={cn("block truncate text-xs", j.last_event?.kind === "warn" || j.last_event?.kind === "error" ? "text-point-ink" : "text-ink-3")} title={ev}>{ev}</span>}
                    </TableCell>
                    <TableCell className="hidden min-w-0 text-left md:table-cell">
                      <span className="block truncate text-sm" title={who}>{who}</span>
                      {j.owner && j.owner !== j.email && <span className="block truncate text-xs text-ink-4" title={j.email}>{j.email}</span>}
                    </TableCell>
                    <TableCell className="min-w-0 text-left">
                      <span className="block truncate text-sm" title={stageKo(j)}>{stageKo(j)}</span>
                      {j.status === "running" && (
                        <span className="mt-1 flex items-center gap-2">
                          <Progress value={j.progress} className="h-1.5" aria-label={`진행률 ${j.progress}%`} />
                          <span className="w-9 shrink-0 text-right text-xs tabular-nums text-ink-3">{j.progress}%</span>
                        </span>
                      )}
                      <span className="block truncate text-xs text-ink-4 lg:hidden">{dur(j.elapsed_sec + since)}{hb !== null ? ` · 응답 ${dur(hb)} 전` : ""}</span>
                    </TableCell>
                    <TableCell className="hidden text-center text-sm tabular-nums text-ink-3 lg:table-cell" title={j.status === "running" ? "시작한 뒤" : "들어온 뒤"}>{dur(j.elapsed_sec + since)}</TableCell>
                    <TableCell className={cn("hidden text-center text-sm tabular-nums md:table-cell", late ? "font-semibold text-point-ink" : "text-ink-3")}
                      title={late ? "엔진 소식이 2분 넘게 없습니다 — 15분이 넘으면 대기열로 되돌아갑니다" : undefined}>
                      {hb === null ? "—" : `${dur(hb)} 전`}
                    </TableCell>
                    <TableCell className="hidden text-right text-sm tabular-nums lg:table-cell" title={j.budget_usd !== null ? `한도 ${usd(j.budget_usd)}` : undefined}>{usd(j.spent_usd)}</TableCell>
                    <TableCell className="hidden truncate text-center text-sm text-ink-3 xl:table-cell" title={j.worker ?? undefined}>{j.worker ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {/* 오늘 끝난 작업 한 줄 + 실패 요약 */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-4 text-sm text-ink-3">
          <span className="shrink-0">오늘 끝남 <b className="tabular-nums text-ink">{t.done}</b> · 실패 <b className={cn("tabular-nums", t.failed > 0 ? "text-point-ink" : "text-ink")}>{t.failed}</b>{t.canceled > 0 ? ` · 취소 ${t.canceled}` : ""}</span>
          {t.failures.length > 0 && (
            <span className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-1">
              {t.failures.map((f) => (
                <Link key={f.id} to={f.url} className="min-w-0 max-w-full truncate text-point-ink hover:underline"
                  title={`${f.title} — ${f.owner ?? ""}${f.error ? ` · ${f.error}` : ""}`}>
                  {f.title || "(제목 없음)"} <span className="text-ink-4">({f.owner ?? "—"}{f.stage ? ` · ${f.stage}에서 멈춤` : ""})</span>
                </Link>
              ))}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

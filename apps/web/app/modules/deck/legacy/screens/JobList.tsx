// 장표 작업 목록 — 출처: powerDeck web/src/screens/JobList.tsx (옛 화면 그대로 이식, eslint.config.js legacy 구역).
import { useState, type MouseEvent, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { BulkBar, useSelection } from "@/components/admin/admin-ui";
import { Checkbox } from "@/components/ui/checkbox";
import { postJson } from "@/lib/api";
import { api, fileUrl, fmtSize, usd, type Job } from "../api";
import { Arrow, Modal, Ms, STATUS, Seg, StatusPill, cn, parseTs, useToastOn, useContextMenu, type CtxItem } from "../ui";
import { stageLabel } from "../stages";
import { DESIGN_TYPES } from "../DesignTypes";
import { WireCanvas } from "../Wireframe";

type Filter = "all" | "live" | "review" | "done" | "failed";
type View = "list" | "card";

const FILTERS: readonly (readonly [Filter, string])[] = [["all", "전체"], ["live", "진행 중"], ["review", "확인 대기"], ["done", "완료"], ["failed", "실패"]];
const inFilter = (j: Job, f: Filter) =>
  f === "all" ? true
    : f === "live" ? j.status === "hold" || j.status === "queued" || j.status === "running"
    : f === "failed" ? j.status === "failed" || j.status === "canceled"
    : j.status === f;

const COLS = "216px minmax(0,1fr) 88px 160px 80px 80px 100px 56px";
/** AI 원가(달러)는 관리자에게만 — 일반 사용자 목록에서는 그 칸을 뺀다(종합평가 4-4) */
const COLS_USER = "216px minmax(0,1fr) 88px 160px 80px 100px 56px";
const VIEW_KEY = "pd_jv3";   // 카드 보기가 기본 — 예전에 기억된 값(목록)은 버린다(2026-10-07 다시 초기화)
const p2 = (n: number) => String(n).padStart(2, "0");
/** 만든 때 — 10.03 14:22 */
const fmtDate = (s: string) => { const d = parseTs(s); return d ? `${p2(d.getMonth() + 1)}.${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}` : "—"; };
/** 이 작업을 어떤 설정으로 시작했는가 — 디자인 타입 · 용도 · 강조색 (내용으로 만든 작업만) */
function Opts({ job }: { job: Job }) {
  if (job.kind !== "design") return null;
  const id = job.opts?.style || "a", t = DESIGN_TYPES.find((x) => x.id === id);
  const chip = "flex-none whitespace-nowrap h-[22px] px-1.5 rounded-md bg-bar text-[12px] font-semibold text-ink2 inline-flex items-center gap-1";
  return (
    <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
      <span className={chip} title={t?.desc}><b className="font-bold text-ink">타입 {id.toUpperCase()}</b>{t?.name}</span>
      <span className={chip}>{job.opts?.purpose === "submit" ? "제출용" : job.opts?.purpose === "company" ? "회사소개" : "발표용"}</span>
      {job.theme && <span className={chip} title="강조색"><span className="w-2.5 h-2.5 rounded-full border border-black/10" style={{ background: job.theme.slice(0, 7) }} /><span className="font-mono text-[12px]">{job.theme.slice(0, 7).toUpperCase()}</span></span>}
    </div>
  );
}

const kindLabel = (j: Job) => (j.kind === "design" ? <>내용<Arrow size={14} />장표</> : "초안 다듬기");
/** 진행 중 · 확인 대기 — 취소할 수 있는 작업 */
const isLive = (j: Job) => j.status === "queued" || j.status === "running" || j.status === "review";

/** 단계 칸에 보일 말 — 진행률·대기 순번·확인 대기·멈춘 단계 */
/** 카드의 상태 꼬리표 옆 말 — 꼬리표와 겹치는 "완료"·"실패"·"취소됨"은 빼고 남는 정보만 */
const cardStage = (j: Job): string | null => {
  if (j.status === "done") return j.report?.score != null ? `검수 ${j.report.score}` : null;
  if (j.status === "canceled" || j.status === "hold") return null;
  if (j.status === "failed") return j.stage ? `${stageLabel(j)}에서 멈춤` : null;
  return stageText(j);
};
const stageText = (j: Job) => {
  const design = j.kind === "design";
  if (j.status === "running") return j.cancel_requested ? "멈추는 중…" : `${j.phase === "pilot" ? "한 장 시안 · " : ""}${j.progress}% · ${stageLabel(j)}`;
  if (j.status === "review") return design ? "와이어프레임·시안을 확인해 주세요" : "한 장 시안을 확인해 주세요";
  if (j.status === "queued") return j.queue_pos ? `대기 ${j.queue_pos}번째` : "대기 중";
  if (j.status === "hold") return "시작 대기 — 검토 시작을 누르면 진행";
  if (j.status === "done") return j.report?.score != null ? `완료 · 검수 ${j.report.score}` : "완료";
  if (j.status === "failed") return j.stage ? `${stageLabel(j)}에서 멈춤` : "실패";
  return "취소됨";
};

/** 썸네일 — 실제 썸네일이 있으면 그것을, 없으면 빈 장표 틀 */
function Thumb({ job, card }: { job: Job; card?: boolean }) {
  const [bad, setBad] = useState(false);   // 그림을 못 받으면 빈 틀 모양으로
  if (job.thumb && !bad) {
    const design = job.kind === "design";
    const kind = job.thumb_kind ?? (job.status === "done" ? "after" : design && (job.phase ?? "plan") === "plan" ? "mockup" : "before");
    return <img src={fileUrl(job.id, kind, job.thumb)} alt="" loading="lazy" className="w-full h-full object-cover object-top" onError={() => setBad(true)} />;
  }
  // 시안 전 — 첫 장의 와이어프레임을 그대로(기획이 있을 때). 3:2 캔버스의 위쪽을 보여 준다
  if (job.wire1?.blocks?.length) return <div className="w-full h-full overflow-hidden pointer-events-none"><WireCanvas blocks={job.wire1.blocks} title={job.wire1.title} keyword={job.wire1.keyword} section={job.wire1.section} /></div>;
  // 기획도 아직 — 와이어프레임 모양의 빈 틀(회색 선 · X 표시 그림 자리)
  const g = card ? 10 : 6, line = "bg-[var(--color-line-3)] rounded-full";
  const X = <svg className="absolute inset-0 text-line-3" width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100" aria-hidden><path d="M0 0L100 100M100 0L0 100" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" fill="none" /></svg>;
  return (
    <div className="w-full h-full flex flex-col bg-white">
      <div className="h-[13%] bg-[var(--color-line)] border-b border-[var(--color-ink-4)]" />
      <div className={cn(line, "h-[5px] w-[52%] mx-auto")} style={{ marginTop: g, marginBottom: g }} />
      <div className="flex-1 min-h-0 grid" style={{ gridTemplateColumns: "1fr 2fr 1fr", gap: g, margin: `0 ${g * 1.6}px ${g * 1.4}px` }}>
        <div className="border border-[var(--color-ink-4)] flex flex-col gap-[5px] p-[7%]"><span className={cn(line, "h-[3px] w-[70%] !bg-[var(--color-ink-4)]")} /><span className={cn(line, "h-[3px] w-full")} /><span className={cn(line, "h-[3px] w-[80%]")} /></div>
        <div className="relative border border-[var(--color-ink-4)]">{X}</div>
        <div className="border border-[var(--color-ink-4)] flex flex-col gap-[5px] p-[7%]"><span className={cn(line, "h-[3px] w-[70%] !bg-[var(--color-ink-4)]")} /><span className={cn(line, "h-[3px] w-full")} /><span className={cn(line, "h-[3px] w-[80%]")} /></div>
      </div>
    </div>
  );
}

/** 내 작업 — 창을 닫았다 와도 여기서 이어 본다. 목록·카드 보기, 작업마다 제목 편집·취소·삭제. */
export function JobList({ jobs, all, isAdmin, onToggleAll, onOpen, onNew, onChanged }: {
  jobs: Job[] | null; all: boolean; isAdmin: boolean; onToggleAll: () => void; onOpen: (id: string) => void; onNew: () => void; onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useToastOn(err);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [ask, setAsk] = useState<{ job: Job; kind: "cancel" | "delete" } | null>(null);   // 확인 모달
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [view, setView] = useState<View>(() => { try { return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "card"; } catch { return "card"; } });
  const pickView = (v: View) => { setView(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* 무시 */ } };

  const run = async (j: Job, kind: "cancel" | "delete") => {
    setAsk(null); setBusy(j.id); setErr(null);
    try {
      if (kind === "cancel") await api(`/jobs/${j.id}/cancel`, { method: "POST" });
      else await api(`/jobs/${j.id}`, { method: "DELETE" });
      onChanged();
    } catch (e) { setErr((e as Error).message); }
    setBusy(null);
  };
  /** 삭제와 취소는 먼저 묻는다 */
  const act = (j: Job, kind: "cancel" | "delete") => setAsk({ job: j, kind });
  // 오른쪽 클릭 — 열기 · 이름 바꾸기 · 취소 · 삭제
  const ctx = useContextMenu();
  const jobMenu = (j: Job): CtxItem[] => [
    { head: j.title.slice(0, 24) },
    { label: "열기", icon: "open_in_new", onClick: () => onOpen(j.id) },
    { label: "이름 바꾸기", icon: "edit", onClick: () => setEditing({ id: j.id, title: j.title }) },
    "-",
    ...(isLive(j) ? [{ label: j.cancel_requested ? "취소 요청됨" : "작업 취소", icon: "stop_circle", disabled: busy === j.id || !!j.cancel_requested, onClick: () => act(j, "cancel") }] : []),
    { label: "삭제", icon: "delete", danger: true, disabled: delOff(j), hint: j.status === "running" ? "먼저 취소" : undefined, onClick: () => act(j, "delete") },
  ];
  const rename = async () => {
    if (!editing) return;
    const t = editing.title.trim();
    const j = jobs?.find((x) => x.id === editing.id);
    setEditing(null);
    if (!t || !j || t === j.title) return;
    setBusy(j.id); setErr(null);
    try { await api(`/jobs/${j.id}`, { method: "PATCH", body: JSON.stringify({ title: t }) }); onChanged(); }
    catch (e) { setErr((e as Error).message); }
    setBusy(null);
  };

  const key = q.trim().toLowerCase();
  const shown = (jobs ?? []).filter((j) => inFilter(j, filter) && (!key || j.title.toLowerCase().includes(key)));
  const stop = (e: MouseEvent) => e.stopPropagation();
  // 여러 개 고르기 — 내 작업에서만(관리자 전체 보기는 남의 작업이라 고르지 않는다). 진행 중 작업은 못 지운다
  const selectable = (j: Job) => !all && j.status !== "running";
  const sel = useSelection(shown.filter(selectable).map((j) => j.id), [all, filter, q, view]);
  const bulkDelete = async (ids: string[]) => {
    setErr(null);
    try {
      const r = await postJson<{ count: number }>("/me/bulk/deck-jobs/delete", { ids });
      sel.clear(); onChanged();
      if (r.count < ids.length) setErr(`${ids.length}개 중 ${r.count}개를 지웠습니다. 진행 중인 작업은 건너뜁니다.`);
    } catch (e) { setErr((e as Error).message); }
  };
  const base = isAdmin ? COLS : COLS_USER;
  const cols = all ? base : `28px ${base}`;
  const pickBox = (j: Job, card?: boolean): ReactNode => !all && (
    <label onClick={stop} className={cn("grid place-items-center cursor-pointer", card ? "absolute top-2.5 right-2.5 w-8 h-8 rounded-md bg-white/90 shadow-[0_1px_3px_rgba(17,17,17,.18)]" : "w-8 h-8")}>
      <Checkbox aria-label={`고르기: ${j.title}`} disabled={!selectable(j)} checked={sel.has(j.id)} onCheckedChange={() => sel.toggle(j.id)} />
    </label>
  );

  /* 줄·카드가 같이 쓰는 조각 */
  const titleOf = (j: Job, cls: string) => editing?.id === j.id ? (
    <input autoFocus className="field !h-8 text-[14px] font-semibold" value={editing.title} maxLength={120} onClick={stop}
      onChange={(e) => setEditing({ id: j.id, title: e.target.value })}
      onKeyDown={(e) => { if (e.key === "Enter") rename(); if (e.key === "Escape") setEditing(null); }} onBlur={rename} />
  ) : (
    <div className="flex items-center gap-1 min-w-0 group/t">
      <button className={cn("truncate text-left min-w-0 py-1.5 -my-1.5 hover:underline", cls)} title={j.title} onClick={(e) => { stop(e); onOpen(j.id); }}>{j.title}</button>
      <button className="btn-icon !w-8 !h-8 opacity-0 group-hover/t:opacity-100 [@media(hover:none)]:opacity-100 focus-visible:opacity-100" title="제목 바꾸기" aria-label="제목 바꾸기"
        onClick={(e) => { stop(e); setEditing({ id: j.id, title: j.title }); }}><Ms name="edit" size={17} /></button>
    </div>
  );
  const cancelBtn = (j: Job): ReactNode => isLive(j) && (
    <button className="flex-none whitespace-nowrap h-8 px-2.5 rounded-md border border-line bg-white text-[12.5px] font-semibold text-ink2 hover:bg-panel hover:text-ink disabled:text-faint disabled:hover:bg-white"
      disabled={busy === j.id || !!j.cancel_requested} onClick={(e) => { stop(e); act(j, "cancel"); }}>
      {j.cancel_requested ? "취소 요청됨" : "취소"}
    </button>
  );
  const costOf = (j: Job) => (j.kind === "design" && (j.spent_usd ?? 0) > 0 ? usd(j.spent_usd, 3) : "—");
  const budgetOf = (j: Job) => (isAdmin && j.kind === "design" && (j.spent_usd ?? 0) > 0 && j.budget_usd != null ? `한도 ${usd(j.budget_usd)}` : null);
  const delOff = (j: Job) => busy === j.id || j.status === "running";
  const delTitle = (j: Job) => (j.status === "running" ? "진행 중인 작업은 먼저 취소해 주세요" : "삭제");

  return (
    <>
      <header className="head">
        <div className="head-title">{all ? "전체 작업" : "내 작업"}</div><span className="text-dim flex-none">{jobs?.length ?? "—"}</span>
        <Seg className="ml-4" value={filter} onChange={setFilter} options={FILTERS} />
        {!all && view === "card" && shown.some(selectable) && (
          <label className="ml-3 flex-none inline-flex items-center gap-2 text-[13px] font-semibold text-dim cursor-pointer whitespace-nowrap">
            <Checkbox checked={sel.allOn ? true : sel.someOn ? "indeterminate" : false} onCheckedChange={sel.togglePage} />모두 고르기
          </label>
        )}
        <div className="ml-auto inline-flex flex-none bg-bar rounded-md p-[3px] gap-0.5">
          {([["card", "grid_view", "카드 보기"], ["list", "view_list", "목록 보기"]] as const).map(([v, icon, label]) => (
            <button key={v} title={label} aria-label={label} aria-pressed={view === v} onClick={() => pickView(v)}
              className={cn("w-[34px] h-8 rounded-md grid place-items-center p-0", view === v ? "bg-white text-ink shadow-[0_1px_2px_rgba(17,17,17,.12)]" : "text-dim hover:text-ink")}>
              <Ms name={icon} size={21} />
            </button>
          ))}
        </div>
        <input className="field !h-[38px] !w-[240px] !px-3 flex-none" type="search" placeholder="작업 이름 검색" aria-label="작업 이름 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        {isAdmin && (
          <button className={cn("flex-none whitespace-nowrap h-[42px] px-[18px] inline-flex items-center justify-center gap-1.5 text-[13.5px] font-semibold hover:text-ink", all ? "text-orange-d" : "text-dim")}
            aria-pressed={all} onClick={onToggleAll}>
            <Ms name="admin_panel_settings" size={19} />{all ? "내 작업만" : "전체 보기 (관리자)"}
          </button>
        )}
      </header>

      <div className="pd-grow px-6 py-4">
        {err && <div role="alert" className="mb-3 flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-warn)]"><Ms name="error" size={18} />{err}</div>}
        {jobs === null ? (
          <div className="mt-16 flex flex-col items-center text-center" role="status">
            <span className="w-14 h-14 rounded-full bg-bar grid place-items-center text-faint"><Ms name="hourglass_top" size={28} className="pulse" /></span>
            <div className="mt-4 text-[14px] font-bold text-dim">작업 목록을 불러오는 중…</div>
          </div>
        ) : jobs.length === 0 ? (
          <div className="mt-16 flex flex-col items-center text-center">
            <span className="w-14 h-14 rounded-full bg-bar grid place-items-center text-faint"><Ms name="slideshow" size={28} /></span>
            <div className="mt-4 text-[14px] font-bold">아직 변환한 장표가 없습니다</div>
            <button className="btn-next mt-5" onClick={onNew}><Ms name="add" size={19} />새 변환</button>
          </div>
        ) : shown.length === 0 ? (
          <div className="mt-16 flex flex-col items-center text-center">
            <span className="w-14 h-14 rounded-full bg-bar grid place-items-center text-faint"><Ms name="search_off" size={28} /></span>
            <div className="mt-4 text-[14px] font-bold">조건에 맞는 작업이 없습니다</div>
            <button className="btn-back mt-5" onClick={() => { setFilter("all"); setQ(""); }}>전체 보기</button>
          </div>
        ) : view === "list" ? (
          <div data-view="list" data-all={all ? "" : undefined} role="table" aria-label="작업 목록" className={cn("border border-line rounded-md overflow-hidden", all ? "min-w-[1010px]" : "min-w-[1052px]")}>
            <div className="grid gap-3.5 items-center px-4 h-9 bg-panel border-b border-line text-[12.5px] font-semibold text-dim text-center whitespace-nowrap" style={{ gridTemplateColumns: cols }}>
              {!all && <span onClick={stop} className="grid place-items-center"><Checkbox aria-label="보이는 작업 모두 고르기" checked={sel.allOn ? true : sel.someOn ? "indeterminate" : false} onCheckedChange={sel.togglePage} /></span>}
              <span>썸네일</span><span>작업</span><span>상태</span><span>단계</span><span>엔진</span>{isAdmin && <span className="text-right">AI 비용</span>}<span>만든 때</span><span>삭제</span>
            </div>
            {shown.map((j) => (
              <div key={j.id} onClick={() => onOpen(j.id)} onContextMenu={(e) => ctx.open(e, jobMenu(j))} style={{ gridTemplateColumns: cols }}
                className={cn("grid gap-3.5 items-center px-4 py-2.5 border-b border-line-soft last:border-b-0 cursor-pointer hover:bg-panel transition-colors duration-150", busy === j.id && "opacity-60")}>
                {pickBox(j)}
                <div className="w-[216px] max-sm:w-[108px] aspect-video rounded-md border border-line overflow-hidden bg-white"><Thumb job={j} /></div>
                <div className="min-w-0">
                  {titleOf(j, "font-semibold")}
                  <div className="text-[13px] text-dim mt-0.5 truncate">
                    {kindLabel(j)}{j.slides ? ` · ${j.slides}장` : ""}{j.size > 0 ? ` · ${fmtSize(j.size)}` : ""}{all ? ` · ${j.email}` : ""}
                  </div>
                  <div className="mt-1.5"><Opts job={j} /></div>
                </div>
                <span className="pd-jl-sub justify-self-center"><StatusPill status={j.status} /></span>
                <div className="pd-jl-sub min-w-0 flex flex-col items-center gap-1.5">
                  <span className="max-w-full text-[13px] text-ink2 text-center break-keep">{stageText(j)}</span>
                  {cancelBtn(j)}
                </div>
                <span className="pd-jl-hide font-mono text-[12.5px] text-dim text-center truncate" title={j.worker ?? undefined}>{j.worker || "—"}</span>
                {isAdmin && (
                  <div className="pd-jl-hide text-right min-w-0">
                    <div className="font-semibold">{costOf(j)}</div>
                    {budgetOf(j) && <div className="text-[12px] text-faint whitespace-nowrap">{budgetOf(j)}</div>}
                  </div>
                )}
                <span className="pd-jl-sub font-mono text-[12.5px] text-dim text-center whitespace-nowrap">{fmtDate(j.created_at)}</span>
                <button className="pd-jl-hide justify-self-center w-9 h-9 rounded-md grid place-items-center text-faint hover:bg-[var(--color-warn-soft)] hover:text-[var(--color-warn)] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-faint"
                  disabled={delOff(j)} title={delTitle(j)} aria-label={`삭제: ${j.title}`} onClick={(e) => { stop(e); act(j, "delete"); }}><Ms name="delete" size={21} /></button>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(340px,100%),1fr))" }}>
            {shown.map((j) => (
              <div key={j.id} onClick={() => onOpen(j.id)} onContextMenu={(e) => ctx.open(e, jobMenu(j))}
                className={cn("border border-line rounded-field overflow-hidden bg-white cursor-pointer flex flex-col transition-[box-shadow,border-color] duration-150 hover:border-[var(--color-line-3)] hover:shadow-[0_6px_20px_rgba(17,17,17,.08)]", busy === j.id && "opacity-60")}>
                <div className="relative aspect-video bg-side border-b border-line-soft overflow-hidden">
                  <Thumb job={j} card />
                  {pickBox(j, true)}
                  <span className="absolute top-2.5 left-2.5 whitespace-nowrap text-[12.5px] font-bold bg-[rgba(17,17,17,.72)] text-white rounded-md px-2 py-[3px]">{kindLabel(j)}</span>
                </div>
                <div className="pt-3.5 px-4 pb-2.5 flex flex-col gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <StatusPill status={j.status} />
                    {cardStage(j) && <span className="text-[13px] font-semibold truncate min-w-0" style={{ color: (STATUS[j.status] ?? STATUS.queued)!.fg }} title={cardStage(j) ?? undefined}>{cardStage(j)}</span>}
                    {isAdmin && <span className="ml-auto flex-none whitespace-nowrap font-semibold text-dim" title={budgetOf(j) ?? undefined}>{costOf(j)}{budgetOf(j) && <span className="font-normal text-[12px] text-faint"> / {usd(j.budget_usd)}</span>}</span>}
                  </div>
                  {titleOf(j, "font-bold text-[15.5px]")}
                  <div className="text-[13px] text-faint truncate">
                    {fmtDate(j.created_at)}{j.slides ? ` · ${j.slides}장` : ""}{j.size > 0 ? ` · ${fmtSize(j.size)}` : ""}{all ? ` · ${j.email}` : ""}
                  </div>
                  <Opts job={j} />
                </div>
                <div className="pt-1 pr-2.5 pb-3 pl-4 flex items-center gap-2 mt-auto">
                  <span className="font-mono text-[12px] text-faint truncate min-w-0">{j.worker || "—"}</span>
                  <span className="ml-auto" />
                  {cancelBtn(j)}
                  <button className="flex-none whitespace-nowrap h-[34px] px-2.5 rounded-md inline-flex items-center gap-1 text-[13.5px] font-semibold text-faint hover:bg-[var(--color-warn-soft)] hover:text-[var(--color-warn)] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-faint"
                    disabled={delOff(j)} title={j.status === "running" ? delTitle(j) : `삭제: ${j.title}`} aria-label={`삭제: ${j.title}`} onClick={(e) => { stop(e); act(j, "delete"); }}><Ms name="delete" size={19} />삭제</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {!all && <BulkBar sel={sel} actions={[{ label: "삭제", icon: <Trash2 aria-hidden />, danger: true, confirm: "고른 작업 {n}개를 지웁니다. 기획·시안·장표 파일이 모두 지워지고 되돌릴 수 없습니다.", onRun: bulkDelete }]} />}
      </div>

      {ask && (
        <Modal width={420} onClose={() => setAsk(null)}>
          <div className="px-[22px] pt-[22px] pb-[18px] flex flex-col gap-3.5">
            <div className="flex gap-3 items-start">
              <div className="w-10 h-10 rounded-md bg-[var(--color-warn-soft)] text-[var(--color-warn)] grid place-items-center flex-none"><Ms name={ask.kind === "delete" ? "delete" : "stop_circle"} size={23} /></div>
              <div className="min-w-0">
                <div className="text-[17px] font-bold">{ask.kind === "delete" ? "작업을 삭제할까요?" : "변환을 멈출까요?"}</div>
                <div className="text-[13.5px] text-ink2 mt-1 leading-[1.5] break-keep">{ask.job.title}</div>
              </div>
            </div>
            <div className="text-[13.5px] text-dim leading-[1.55] break-keep">
              {ask.kind === "delete"
                ? "기획, 시안 이미지, 장표 파일이 모두 지워지고 되돌릴 수 없습니다. 이미 쓴 AI 비용은 과금 내역에 그대로 남습니다."
                : "엔진이 지금 단계를 마치는 대로 멈춥니다."}
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn-back !h-10 !px-[18px] !text-ink" onClick={() => setAsk(null)}><Ms name="close" size={19} />{ask.kind === "delete" ? "취소" : "계속하기"}</button>
              <button className="flex-none whitespace-nowrap h-10 px-[18px] rounded-md bg-[var(--color-warn)] hover:bg-[var(--color-warn)] text-white font-bold inline-flex items-center justify-center gap-1.5"
                onClick={() => run(ask.job, ask.kind)}><Ms name={ask.kind === "delete" ? "delete" : "stop_circle"} size={19} />{ask.kind === "delete" ? "삭제" : "멈추기"}</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

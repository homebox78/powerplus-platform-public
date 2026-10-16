// 결과 화면(원본·시안과 결과를 장별로 짝지어 보기) — 출처: powerDeck web/src/screens/Result.tsx (옛 화면 그대로 이식, eslint.config.js legacy 구역).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { REVIEW_COLS, TextEdit, Thumbs } from "./TextEdit";
import { isEditing, api, fileUrl, fmtSize, isDesign, usd, type Job, type JobFile, type PlanSlide } from "../api";
import { cn, fmtDur, GenStamp, GuestHeader, JobHeader, Ms, parseTs, Seg, useToastOn, useContextMenu, type CtxItem, toast, sent } from "../ui";
import { Files } from "./ResultFiles";
import { Script } from "./ResultScript";
import { Detail } from "./ResultDetail";
import { CommentPanel, PinImage, useFeedback } from "../Feedback";
import { OverviewCanvas } from "../OverviewCanvas";

type Props = { job: Job; me: string; isAdmin?: boolean; onNew?: () => void; onRetry: () => void; onChange?: (j: Job) => void; onLogout?: () => void; onPlan?: () => void };
type Pair = { b?: JobFile; a?: JobFile; label?: string };   // label = 표지·목차·간지(쪽번호 없는 앞장)

/** 장별로 원본(또는 시안, before)과 결과(after)를 짝짓는다.
 *  표지·목차·간지(front_cover/toc/divN.jpg)도 장표 순서대로 끼운다 — 표지·목차는 맨 앞, 간지 N 은 N번째 장(章)의 첫 본문 장 바로 앞.
 *  앞장의 번호는 소수(0.1, 0.2, 첫 장 − 0.5 …) — 쪽번호와 겹치지 않는다 */
function useSlides(job: Job) {
  const before = job.files?.before, after = job.files?.after, plan = job.plan;
  return useMemo(() => {
    const m = new Map<number, Pair>();
    for (const f of before ?? []) if (f.slide) m.set(f.slide, { ...m.get(f.slide), b: f });
    for (const f of after ?? []) if (f.slide) m.set(f.slide, { ...m.get(f.slide), a: f });
    const starts: number[] = [];   // 장(章)마다 첫 본문 장
    let prev = "";
    for (const s of plan?.slides ?? []) {
      const ch = (s.chapter ?? (s.section ?? "").split(" · ")[0])!.trim();
      if (ch !== prev) { starts.push(s.n); prev = ch; }
    }
    for (const f of after ?? []) {
      const mm = /^front_(cover|toc|div|end|qna)(\d*)\.jpg$/.exec(f.name);
      if (!mm || f.slide) continue;
      const i = Number(mm[2] || 1);
      const key = mm[1] === "cover" ? 0.1 : mm[1] === "toc" ? 0.2 : mm[1] === "end" ? 99990 : mm[1] === "qna" ? 99991 : (starts[i - 1] ?? 900 + i) - 0.5 + i / 1000;
      m.set(key, { a: f, label: mm[1] === "cover" ? "표지" : mm[1] === "toc" ? "목차" : mm[1] === "end" ? "엔딩" : mm[1] === "qna" ? "질의응답" : `간지 ${i}` });
    }
    return [...m.entries()].sort((x, y) => x[0] - y[0]);
  }, [before, after, plan]);
}
const beforeUrl = (job: Job, f: JobFile) => fileUrl(job.id, "before", f.name);
const afterUrl = (job: Job, f: JobFile) => fileUrl(job.id, "after", f.name) + `&v=${f.ts ?? 0}`;   // 글 고치기로 다시 그리면 바뀐다
const thumbUrl = (job: Job, p: Pair) => (p.a ? afterUrl(job, p.a) : beforeUrl(job, p.b!));

/** ←→ ↑↓ 키로 장 이동 — 글을 치는 중에는 끼어들지 않는다 */
function useSlideKeys(on: boolean, slides: [number, Pair][], sel: number, setSel: (n: number) => void) {
  useEffect(() => {
    if (!on) return;
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const i = slides.findIndex((s) => s[0] === sel);
      if (e.key === "ArrowDown" || e.key === "ArrowRight") { if (slides[i + 1]) setSel(slides[i + 1]![0]); e.preventDefault(); }
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") { if (slides[i - 1]) setSel(slides[i - 1]![0]); e.preventDefault(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [on, slides, sel, setSel]);
}

/** ‹ n / N › */
function Pager({ slides, sel, onSel }: { slides: [number, Pair][]; sel: number; onSel: (n: number) => void }) {
  const i = slides.findIndex((s) => s[0] === sel);
  const B = "w-[34px] h-[34px] p-0 border border-line bg-white rounded-md grid place-items-center text-ink hover:bg-panel disabled:text-faint disabled:hover:bg-white";
  return (
    <div className="flex-none flex items-center gap-1">
      <button className={B} title="이전 장" aria-label="이전 장" disabled={i <= 0} onClick={() => onSel(slides[i - 1]![0])}><Ms name="chevron_left" size={20} /></button>
      <span className="text-[13px] text-ink3 min-w-[44px] text-center whitespace-nowrap">{slides.length ? `${Math.max(1, i + 1)} / ${slides.length}` : "—"}</span>
      <button className={B} title="다음 장" aria-label="다음 장" disabled={i < 0 || i >= slides.length - 1} onClick={() => onSel(slides[i + 1]![0])}><Ms name="chevron_right" size={20} /></button>
    </div>
  );
}

const SHEET = "rounded-md bg-white shadow-[0_1px_3px_rgba(17,17,17,.08),0_0_0_1px_var(--color-line)]";
/** 장표 그림 — 폭은 부모를 채우되 fit(쓸 수 있는 높이)을 넘지 않게. 비율은 그림 그대로(시안은 3:2 인 것도 있다) */
function Sheet({ src, alt, fit, ts }: { src: string; alt?: string; fit: string; ts?: number }) {
  const [r, setR] = useState(16 / 9);
  return (
    <div className="relative w-full" style={{ maxWidth: `calc((${fit}) * ${r})` }}>
      <img src={src} alt={alt} draggable={false} className={cn("block w-full", SHEET)}
        onLoad={(e) => { const i = e.currentTarget; if (i.naturalWidth && i.naturalHeight) setR(i.naturalWidth / i.naturalHeight); }} />
      <GenStamp at={ts} />
    </div>
  );
}
const NoSheet = ({ children }: { children: ReactNode }) => (
  <div className="aspect-[16/9] border border-dashed border-[var(--color-line-3)] rounded-md grid place-items-center text-center text-faint text-[13.5px] leading-[1.6] bg-panel">{children}</div>
);
const Empty = ({ text }: { text: string }) => (
  <div className="flex-1 grid place-items-center text-[13.5px] text-faint px-8 text-center whitespace-pre-wrap leading-[1.6]">{text}</div>
);

/** 나란히 — 왼쪽 시안(또는 원본), 오른쪽 결과 장표. right 에 결과 쪽(핀을 꽂는 그림 등)을 준다 */
function SideBySide({ job, cur, baseLabel, rightLabel, right, fit }: { job: Job; cur: Pair; baseLabel: string; rightLabel: ReactNode; right: ReactNode; fit: string }) {
  return (
    <div className="grid gap-4 items-start" style={{ gridTemplateColumns: cur.b ? "repeat(auto-fit,minmax(min(320px,100%),1fr))" : "1fr" }}>
      {cur.b && (
        <div className="flex flex-col gap-1.5 min-w-0">
          <div className="text-[13px] font-semibold text-dim">{baseLabel}</div>
          <Sheet src={beforeUrl(job, cur.b)} alt={baseLabel} fit={fit} ts={job.kind === "design" ? cur.b.ts : undefined} />
        </div>
      )}
      {/* 비교할 시안이 없는 장(표지·목차·간지)은 결과 한 장을 가운데에 */}
      <div className={cn("flex flex-col gap-1.5 min-w-0", !cur.b && "w-full max-w-[1100px] mx-auto")}>
        <div className="text-[13px] font-semibold text-orange-d">{rightLabel}</div>
        {right}
      </div>
    </div>
  );
}

/**
 * 4단계 — 결과(완료 / 실패). 탭 셋: 검토(나란히 · 겹쳐서 · 글 고치기 + 의견 · 수정 요청) · 산출물(파일 · 발표 대본) · 상세(확인 목록 · 기록 · 비용).
 * 공유 링크로 들어온 팀원(job.mine === false)은 사이드바 없는 검토 화면 — 보고 의견만 남긴다.
 */
export function Result(p: Props) {
  return p.job.mine === false ? <Shared {...p} /> : <Owner {...p} />;
}

type Tab = "review" | "script" | "files" | "detail";
type Mode = "side" | "over" | "edit" | "frames" | "grid" | "canvas";

/** 세로 제안서(제출용)·회사소개서(테마 A·B) — 비교할 시안이 없다(before 없음). 쪽 보기·캔버스로 연다 */
const isVertical = (job: Job) => isDesign(job) && (job.opts?.purpose === "submit" || job.opts?.purpose === "company") && !(job.files?.before?.length);
const isLandscape = (job: Job) => job.opts?.purpose === "company";
const KIND: Record<string, string> = { cover: "표지", toc: "목차", div: "간지", body: "본문" };

/** 세로 제안서 — 가운데에 장표 3열(사용자 2026-10-14 "센터에 장표가 가로 3개씩"). 장표를 누르면 그 자리에 의견 */
function VerticalGrid({ job, slides, sel, onSel, fb }: { job: Job; slides: [number, Pair][]; sel: number; onSel: (n: number) => void; fb: ReturnType<typeof useFeedback> }) {
  const pages = job.report?.pages;
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.querySelector(`[data-n="${sel}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [sel]);
  return (
    <div ref={box} className={cn("grid gap-x-4 gap-y-5 items-start", isLandscape(job) ? "grid-cols-2" : "grid-cols-3")}>
      {slides.map(([n, p]) => {
        const pg = pages?.find((x) => x.n === n), on = n === sel;
        return (
          <div key={n} data-n={n} onClickCapture={() => onSel(n)} className="flex flex-col gap-1.5 min-w-0">
            <div className={cn("flex items-center gap-1.5 text-[13px] font-semibold min-w-0", on ? "text-orange-d" : "text-dim")}>
              <span className="flex-none">{n}</span>
              <span className="truncate">{pg ? `${KIND[pg.kind] ?? ""}${pg.kind === "body" ? ` · ${pg.title}` : ""}` : p.label ?? ""}</span>
            </div>
            {p.a ? <PinImage fb={fb} slide={n} src={afterUrl(job, p.a)} alt={`${n}쪽`} className={cn(SHEET, on && "!shadow-[0_0_0_2px_var(--color-point)]")} />
              : <NoSheet>이 쪽의 렌더가 아직 없습니다</NoSheet>}
          </div>
        );
      })}
    </div>
  );
}

/** 세로 제안서 캔버스 — 표지·목차 한 줄 + 장(章)마다 간지·본문 한 줄. 누르면 그 쪽을 3열 보기에서 연다 */
function VerticalCanvas({ job, slides, sel, onOpen }: { job: Job; slides: [number, Pair][]; sel: number; onOpen: (n: number) => void }) {
  const groups = useMemo(() => {
    const pages = job.report?.pages ?? [];
    const g = new Map<string, PlanSlide[]>();
    for (const [n, p] of slides) {
      const pg = pages.find((x) => x.n === n);
      const k = slides.findIndex((x) => x[0] === n);
      const ch = pg?.ch ?? `${Math.floor(k / 6) * 6 + 1}~${Math.min(slides.length, Math.floor(k / 6) * 6 + 6)}쪽`;   // 쪽 정보가 없는 옛 작업은 6장씩 한 줄
      g.set(ch, [...(g.get(ch) ?? []), { n, title: pg ? (pg.kind === "body" ? pg.title : KIND[pg.kind] ?? pg.title) : p.label ?? `${n}쪽`, section: pg ? KIND[pg.kind] : undefined, content: "" }]);
    }
    return [...g.entries()];
  }, [job.report?.pages, slides]);
  const src = useMemo(() => new Map(slides.map(([n, p]) => [n, p.a ? afterUrl(job, p.a) : ""])), [slides, job]);
  return (
    <OverviewCanvas portrait={!isLandscape(job)} jobId={job.id} groups={groups} sel={sel} title={(x) => x.title} onOpen={onOpen} badge={() => null}
      thumb={(x) => src.get(x.n) ? <img src={src.get(x.n)} alt="" draggable={false} className={cn("block w-full object-cover", isLandscape(job) ? "aspect-video" : "aspect-[210/297]")} />
        : <div className={cn("bg-panel", isLandscape(job) ? "aspect-video" : "aspect-[210/297]")} />} />
  );
}

/**
 * 고친 과정 보기 — 엔진이 쌓은 중간 렌더(files.frames, 이름 fNNN_sNN.jpg)를 순서대로 넘겨 본다.
 * 옛 파워덱의 타임랩스 진입점이 이식에서 빠져 있던 것을 되살림(2026-10-10, 테스트 보고서 하).
 */
function FramesView({ job, slide }: { job: Job; slide: number }) {
  const all = job.files?.frames ?? [];
  const list = useMemo(() => {
    const mine = all.filter((f) => f.slide == null || f.slide === slide);
    return (mine.length ? mine : all).slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [all, slide]);
  const [i, setI] = useState(0);
  useEffect(() => { setI(0); }, [slide]);
  if (!list.length) return <Empty text="고친 과정 그림이 없습니다." />;
  const cur = list[Math.min(i, list.length - 1)]!;
  return (
    <div className="flex-1 min-h-0 overflow-auto scroll-thin p-5 flex flex-col items-center gap-3">
      <img src={fileUrl(job.id, "frames", cur.name) + `&v=${cur.ts ?? 0}`} alt={`고친 과정 ${i + 1}`} className="max-w-full h-auto shadow-md" style={{ maxHeight: "calc(100vh - 340px)" }} />
      <div className="flex items-center gap-3 w-full max-w-[720px]">
        <button className="btn-icon" aria-label="이전 단계" disabled={i <= 0} onClick={() => setI(i - 1)}><Ms name="chevron_left" size={20} /></button>
        <input type="range" min={0} max={list.length - 1} value={i} onChange={(e) => setI(Number(e.target.value))} className="flex-1" aria-label="고친 과정 단계" />
        <button className="btn-icon" aria-label="다음 단계" disabled={i >= list.length - 1} onClick={() => setI(i + 1)}><Ms name="chevron_right" size={20} /></button>
        <span className="text-[13px] text-dim whitespace-nowrap">{i + 1} / {list.length}</span>
      </div>
    </div>
  );
}

function Owner({ job, me, isAdmin, onRetry, onChange, onPlan }: Props) {
  const fb = useFeedback(job, me, "result");       // 완성 장표 위 핀 의견
  const design = isDesign(job);
  const baseLabel = design ? "시안" : "원본";
  const ok = job.status === "done" || isEditing(job);   // 글 고치기 반영 중에도 결과 화면 그대로
  const slides = useSlides(job);
  const [sel, setSel] = useState(slides[0]?.[0] ?? 1);
  const [tab, setTab] = useState<Tab>("review");
  const vert = isVertical(job);
  const [mode0, setMode] = useState<Mode>(vert ? "grid" : design ? "side" : "over");
  const mode: Mode = mode0 === "edit" && !ok ? (vert ? "grid" : "side") : mode0;
  const home: Mode = vert ? "grid" : "side";
  // 발표 대본 탭은 한 번 열면 계속 붙여 둔다 — 대본을 만드는 중에 다른 탭을 눌러도 진행과 화면이 사라지지 않게
  const [scriptSeen, setScriptSeen] = useState(false);
  useEffect(() => { if (tab === "script") setScriptSeen(true); }, [tab]);
  const reload = async () => onChange?.(await api<Job>(`/jobs/${job.id}`));
  const report = job.report;
  const checks = report?.checklist ?? [];
  const results = job.files?.result ?? [];
  const draft = job.files?.draft?.[0];
  const dur = job.started_at && job.finished_at ? (parseTs(job.finished_at)!.getTime() - parseTs(job.started_at)!.getTime()) / 1000 : 0;
  const cur = slides.find((s) => s[0] === sel)?.[1];
  const hasFrames = (job.files?.frames?.length ?? 0) > 0;   // 고친 과정 그림이 있을 때만 진입점
  useSlideKeys(tab === "review", slides, sel, setSel);

  // 수정 요청 — 확정된 시안과 이 요청(+ 반영 예정 의견)으로 장표를 다시 만든다
  const [revise, setRevise] = useState("");
  const [busy, setBusy] = useState(false);
  const [rerr, setRerr] = useState<string | null>(null);
  useToastOn(rerr);
  const sendRevise = async () => {
    setBusy(true); setRerr(null);
    try { onChange?.(await api<Job>(`/jobs/${job.id}/approve`, { method: "POST", body: JSON.stringify({ mode: "revise", feedback: revise.trim() }) })); }
    catch (e) { setRerr((e as Error).message); }
    setBusy(false);
  };

  // 오른쪽 클릭 — 보기 바꾸기 · 장 이동 · 수정 요청 · 공유 · 받기
  const ctx = useContextMenu();
  const reviseBox = useRef<HTMLTextAreaElement>(null);
  const share = async () => {
    try {
      if (!job.shared) onChange?.(await api<Job>(`/jobs/${job.id}`, { method: "PATCH", body: JSON.stringify({ shared: true }) }));
      await navigator.clipboard.writeText(location.href);
      toast("공유 링크를 복사했습니다 — 팀원은 결과 장표를 보고 의견을 남길 수 있습니다", "ok");
    } catch (e) { setRerr((e as Error).message); }
  };
  const at = slides.findIndex((s) => s[0] === sel);
  const reviewMenu = (): CtxItem[] => [
    { head: cur?.label || `${sel}쪽` },
    ...(vert ? [{ label: "장표 보기", icon: "grid_view", on: mode === "grid", onClick: () => setMode("grid") },
      { label: "캔버스", icon: "account_tree", on: mode === "canvas", onClick: () => setMode("canvas") }]
      : [{ label: "나란히", icon: "view_column_2", on: mode === "side", onClick: () => setMode("side") },
        { label: "겹쳐서", icon: "compare", on: mode === "over", onClick: () => setMode("over") }]),
    ...(ok ? [{ label: "글 고치기", icon: "edit_note", on: mode0 === "edit", onClick: () => setMode("edit") }] : []),
    "-",
    { label: "이전 장", icon: "chevron_left", disabled: at <= 0, onClick: () => slides[at - 1] && setSel(slides[at - 1]![0]) },
    { label: "다음 장", icon: "chevron_right", disabled: at >= slides.length - 1, onClick: () => slides[at + 1] && setSel(slides[at + 1]![0]) },
    ...(design && ok ? ["-" as const, { label: "수정 요청 쓰기", icon: "rate_review", onClick: () => { setMode(mode0 === "edit" ? home : mode0); setTimeout(() => reviseBox.current?.focus(), 50); } },
      { label: "팀원에게 공유", icon: "share", onClick: share }] : []),
    ...(ok && results[0] ? ["-" as const, { label: "내보내기 (pptx)", icon: "download", onClick: () => { location.href = fileUrl(job.id, "result", results[0]!.name, true); } }] : []),
  ];
  const meta = [job.slides ? `${job.slides}장` : "", dur > 0 ? `${fmtDur(dur)} 걸림` : "", report?.score != null ? `검수 점수 ${report.score}` : "", isAdmin && design && (job.spent_usd ?? 0) > 0 ? `AI 비용 ${usd(job.spent_usd, 3)}` : ""].filter(Boolean).join(" · ");
  const retryTitle = design ? "확정된 시안으로 장표를 처음부터 다시 만듭니다" : "같은 원본으로 처음부터 다시 변환합니다";
  const ext = (n: string) => /\.([a-z0-9]+)$/i.exec(n)?.[1]?.toLowerCase() ?? "pptx";
  const actions = (
    <>
      {!results[0] && draft && (
        // 멈추거나 실패해도 그때까지 만든 판은 받을 수 있게
        <a className="btn-back" href={fileUrl(job.id, "draft", draft.name, true) + `&v=${draft.ts ?? 0}`}><Ms name="download" size={17} />멈춘 지점까지 받기 · {fmtSize(draft.size)}</a>
      )}
      {onPlan && <button className="btn-back" onClick={onPlan} title="실패해도 남아 있는 기획·와이어·시안을 다시 봅니다"><Ms name="view_quilt" size={18} />기획·시안 보기</button>}
      <button className={ok ? "btn-back" : "btn-next"} onClick={onRetry} title={retryTitle}><Ms name="refresh" size={19} />다시 돌리기</button>
      {ok && results[0] && (
        <a className="btn-next" href={fileUrl(job.id, "result", results[0].name, true)}><Ms name="download" size={17} />{design ? "내보내기" : "결과 내려받기"} · {ext(results[0].name)} {fmtSize(results[0].size)}</a>
      )}
    </>
  );

  const hint = mode === "grid" ? "장표를 누르면 그 자리에 의견이 남습니다 · 좌우 방향키로 쪽 이동"
    : mode === "canvas" ? "표지·목차와 장(章)마다 한 줄씩 · 카드를 누르면 그 쪽을 엽니다 · Ctrl+휠로 확대"
    : mode === "side" ? (design ? "오른쪽 결과 장표에서 고칠 곳을 누르면 그 자리에 의견이 남습니다 · 좌우 방향키로 장 이동" : `${baseLabel}과 결과를 나란히 봅니다 · 좌우 방향키로 장 이동`)
    : mode === "over" ? `가운데 손잡이를 끌어 ${baseLabel}과 결과를 비교하세요 · 좌우 방향키로 장 이동`
    : mode === "frames" ? "엔진이 고쳐 간 순서대로 중간 그림을 넘겨 봅니다"
    : "고칠 글을 누르면 오른쪽에서 바로 고칩니다 — 글만 바뀌고 서식 · 위치는 그대로입니다";
  const toolbar = (
    <div className="head panel !gap-2.5 overflow-hidden">
      <Seg<Mode> value={mode} onChange={setMode} options={[...(vert ? [["grid", "장표 보기"], ["canvas", "캔버스"]] as const : [["side", "나란히"], ["over", "겹쳐서"]] as const), ...(ok ? [["edit", "글 고치기"] as const] : []), ...(hasFrames ? [["frames", "고친 과정 보기"] as const] : [])]} />
      {/* 안내문은 좁은 화면(390)에서 쪽 이동 버튼과 겹쳐 숨긴다 — 모드 이름이 곧 안내 */}
      <span className="hidden md:block flex-1 min-w-0 text-[13px] text-dim leading-[1.5] break-words" title={hint}>{sent(hint)}</span>
      <span className="md:hidden flex-1" />
      <Pager slides={slides} sel={sel} onSel={setSel} />
    </div>
  );
  const FIT = "100vh - 300px";
  const noResult = <NoSheet>보여 줄 장표가 없습니다<br />{ok ? "이 장의 렌더가 아직 없습니다" : "「기록 보기」에서 원인을 확인해 주세요"}</NoSheet>;

  return (
    <>
      {ctx.node}
      <JobHeader job={job} meta={meta || undefined} actions={actions} tab={tab} onTab={setTab}
        tabs={[["review", "검토"], ...(ok ? [["script", "발표 대본"] as [Tab, string]] : []), ["files", "산출물"], ["detail", !ok ? "상세 · 오류" : checks.length ? `상세 · 확인 ${checks.length}` : "상세"]]} />

      {tab === "review" && (mode === "edit" ? (
        <TextEdit job={job} onChange={(j) => onChange?.(j)} toolbar={toolbar} sel={sel} onSel={setSel} />
      ) : (
        <div className="pd-cols flex-1 min-h-0 grid" style={{ gridTemplateColumns: !slides.length || vert ? (design ? "minmax(0,1fr) minmax(260px,300px)" : "minmax(0,1fr)") : design ? REVIEW_COLS : "104px minmax(0,1fr)" }} onContextMenu={(e) => ctx.open(e, reviewMenu())}>
          {slides.length > 0 && !vert && <Thumbs sel={sel} onSel={setSel} items={slides.map(([n, f]) => ({ n, src: thumbUrl(job, f), label: f.label, badge: design && !f.label ? fb.open.filter((c) => c.slide === n).length : 0 }))} />}
          <div className="flex flex-col min-h-0 min-w-0 bg-side">
            {toolbar}
            {!ok && (
              <div className="flex-none mx-4 mt-3 px-3.5 py-2.5 rounded-md bg-[var(--color-warn-soft)] border border-[var(--color-warn-line)] flex items-start gap-2.5">
                <span className="w-[18px] h-[18px] mt-px rounded-full bg-[var(--color-warn)] text-white grid place-items-center text-[12px] font-extrabold flex-none">!</span>
                <div className="flex-1 min-w-0 text-[13.5px] leading-[1.5] text-[var(--color-warn)] break-words line-clamp-4">
                  <b>{job.status === "canceled" ? "변환을 멈췄습니다." : "장표를 만들지 못했습니다."}</b> {job.error || (job.status === "canceled" ? "" : "엔진이 실패 사유를 남기지 않았습니다.")} 머리줄의 「다시 돌리기」로 {design ? "확정된 시안에서 장표를 다시 만들 수 있습니다" : "같은 원본으로 다시 변환할 수 있습니다"}.
                </div>
                <button className="border-0 bg-transparent p-0 text-[var(--color-warn)] font-semibold text-[13px] whitespace-nowrap flex-none hover:underline" onClick={() => setTab("detail")}>기록 보기</button>
              </div>
            )}
            {isEditing(job) && (
              <div className="flex-none mx-4 mt-3 rounded-md bg-orange-soft border border-orange-line px-3.5 py-2.5 flex items-center gap-2.5 text-[13.5px] font-semibold text-orange-d">
                <i className="w-2.5 h-2.5 rounded-full bg-orange pulse flex-none" />고친 글을 장표에 반영하는 중입니다 — 30초 안팎이면 그림이 바뀝니다.
              </div>
            )}
            {!slides.length ? <Empty text={ok ? "장별 렌더가 아직 없습니다." : "보여 줄 장표가 없습니다."} />
              : (
                mode === "canvas" ? (
                  <div className="flex-1 min-h-0 flex flex-col p-4"><VerticalCanvas job={job} slides={slides} sel={sel} onOpen={(n) => { setSel(n); setMode("grid"); }} /></div>
                ) : (
                <div className="flex-1 min-h-0 overflow-auto scroll-thin p-5">
                  {mode === "grid" && <VerticalGrid job={job} slides={slides} sel={sel} onSel={setSel} fb={fb} />}
                  {cur && mode === "side" && (
                    <SideBySide job={job} cur={cur} fit={FIT} baseLabel={design ? "시안 (확정본)" : "원본"} rightLabel={design ? "결과 장표 — 눌러서 의견" : "결과 장표"}
                      right={!cur.a ? noResult : design && !cur.label ? <PinImage fb={fb} slide={sel} src={afterUrl(job, cur.a)} alt="결과" className={SHEET} fit={FIT}><GenStamp at={cur.a.ts} /></PinImage> : <Sheet src={afterUrl(job, cur.a)} alt="결과" fit={FIT} ts={cur.a.ts} />} />
                  )}
                  {cur && mode === "over" && <Compare key={sel} before={cur.b && beforeUrl(job, cur.b)} after={cur.a && afterUrl(job, cur.a)} beforeLabel={baseLabel} />}
                  {mode === "frames" && <FramesView job={job} slide={sel} />}
                </div>
              ))}
          </div>
          {design && (
            <CommentPanel fb={fb} onGo={(c) => { setSel(c.slide); setMode(home); }} onJob={(j) => onChange?.(j)} empty="결과 장표에서 고칠 곳을 눌러 보세요."
              foot={ok && (
                <div className="flex-none border-t border-line px-[18px] py-3.5 flex flex-col gap-2 bg-panel">
                  <div className="font-bold">수정 요청</div>
                  {(job.feedback ?? "").trim() && (
                    <details className="group rounded-md bg-white border border-line px-3 py-2 text-[12.5px]">
                      <summary className="list-none [&::-webkit-details-marker]:hidden flex items-center gap-1 font-semibold text-dim cursor-pointer whitespace-nowrap"><Ms name="chevron_right" size={16} className="transition-transform group-open:rotate-90" />앞서 준 요청 — 계속 지켜집니다</summary>
                      <div className="mt-1.5 text-ink2 whitespace-pre-line leading-[1.6] max-h-[120px] overflow-y-auto scroll-thin">{job.feedback}</div>
                    </details>
                  )}
                  <textarea ref={reviseBox} className="field !min-h-[76px] !p-3 !leading-[1.5] resize-y" maxLength={3000} value={revise} onChange={(e) => setRevise(e.target.value)} aria-label="수정 요청"
                    placeholder="예: 3쪽 표 머리 색을 남색으로 / 전체 본문 글자 8pt로" />
                  <span className="text-[12.5px] text-dim leading-[1.45]">
                    의견과 함께 확정된 시안을 보고 장표를 다시 만듭니다
                    {fb.accepted.length > 0 && <><br /><b className="text-ok">장표 위 의견 {fb.accepted.length}개(반영 예정)도 함께 반영합니다.</b></>}
                    {fb.accepted.length > 0 && fb.pending.length > 0 && <span className="text-[var(--color-ink-2)]"> 검토 대기 {fb.pending.length}개는 반영되지 않습니다.</span>}
                  </span>
                  {rerr && <div className="text-[13px] font-semibold text-[var(--color-warn)]">{rerr}</div>}
                  {!busy && !isEditing(job) && !revise.trim() && fb.accepted.length === 0 && (
                    <span className="text-[12.5px] text-faint leading-[1.45]">다시 만들려면 수정 요청을 적거나, 장표 위 의견을 ‘반영 예정’으로 확정해 주세요.</span>
                  )}
                  <button className="btn-dark !h-10 w-full" disabled={busy || isEditing(job) || (!revise.trim() && fb.accepted.length === 0)} onClick={sendRevise}
                    title={isEditing(job) ? "글 고치기를 반영하는 중입니다 — 끝난 뒤 보낼 수 있습니다" : "어느 장을 어떻게 바꿀지 적거나, 장표 위 의견을 '반영 예정'으로 확정한 뒤 누르세요"}>
                    <Ms name="autorenew" size={19} />{busy ? "넘기는 중…" : isEditing(job) ? "글 고치기 반영 중…" : fb.accepted.length > 0 ? `다시 만들기 · 의견 ${fb.accepted.length}` : "다시 만들기"}
                  </button>
                </div>
              )} />
          )}
        </div>
      ))}

      {scriptSeen && ok && <div className={cn("flex-1 min-h-0 flex flex-col", tab !== "script" && "hidden")}><Script job={job} onChange={reload} /></div>}
      {tab === "files" && <Files job={job} ok={ok} onScript={() => setTab("script")} />}
      {tab === "detail" && <Detail job={job} isAdmin={isAdmin} onSlide={(n) => { setSel(n); setTab("review"); }} />}
    </>
  );
}

/** 공유받은 시안 검토 — 사이드바 없이 장 목록 | 결과 장표(눌러서 의견) | 의견 목록. 파일 받기·수정은 못 한다 */
function Shared({ job, me, onChange, onLogout }: Props) {
  const fb = useFeedback(job, me, "result");
  const design = isDesign(job);
  const baseLabel = design ? "시안" : "원본";
  const slides = useSlides(job);
  const [sel, setSel] = useState(slides[0]?.[0] ?? 1);
  // 의견은 '내용으로 장표 만들기' 작업에서만 받는다 — 다듬기 작업은 원본과 비교해 보기만
  const [view0, setView] = useState<"pin" | "side" | "over">(design ? "pin" : "over");
  const cur = slides.find((s) => s[0] === sel)?.[1];
  const view = view0 !== "pin" && !cur?.b ? "pin" : view0;
  useSlideKeys(true, slides, sel, setSel);
  const people = [...new Set(fb.comments.flatMap((c) => [c.email, ...c.replies.map((r) => r.email)]))];
  const hasBase = slides.some(([, f]) => f.b);
  const FIT = "100vh - 180px";
  const sheet = !cur?.a ? <NoSheet>결과 장표 없음</NoSheet>
    : design && !cur.label ? <PinImage fb={fb} slide={sel} src={afterUrl(job, cur.a)} alt="결과" className={SHEET} fit={FIT}><GenStamp at={cur.a.ts} /></PinImage>
    : <Sheet src={afterUrl(job, cur.a)} alt="결과" fit={FIT} ts={cur.a.ts} />;
  return (
    <>
      <GuestHeader job={job} me={me} people={people} onLogout={onLogout} />
      <div className="pd-cols flex-1 min-h-0 grid" style={{ gridTemplateColumns: design ? "200px minmax(0,1fr) 340px" : "200px minmax(0,1fr)" }}>
        <div className="border-r border-line bg-panel flex flex-col min-h-0">
          <div className="head sm panel !gap-1.5 !px-3.5 !bg-transparent"><span className="font-bold">{slides.length}장</span>{design && <span className="text-[13px] text-dim">의견 {fb.comments.length}개</span>}</div>
          <div className="flex-1 min-h-0 overflow-y-auto scroll-thin p-2.5 flex flex-col gap-2.5">
            {slides.map(([n, f]) => {
              const cnt = fb.open.filter((c) => c.slide === n).length, on = sel === n;
              return (
                <button key={n} onClick={() => setSel(n)} className={cn("border-0 p-1.5 rounded-md text-left flex flex-col gap-1.5 flex-none", on ? "bg-white" : "bg-transparent hover:bg-[var(--color-line)]")} style={{ boxShadow: on ? "0 0 0 1.5px var(--color-point)" : "none" }}>
                  <span className="relative block w-full aspect-[16/9] bg-white border border-line rounded-md overflow-hidden">
                    <img src={thumbUrl(job, f)} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-contain" />
                    {cnt > 0 && <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-[5px] rounded-full bg-orange text-white text-[12px] font-bold inline-flex items-center justify-center" title={`의견 ${cnt}개`}>{cnt}</span>}
                  </span>
                  <span className="flex justify-between gap-1.5 text-[12.5px] px-0.5 min-w-0">
                    <span className="text-dim whitespace-nowrap flex-none">{f.label ?? `${n}쪽`}</span>
                    <span className="font-semibold text-ink3 truncate">{job.plan?.slides.find((s) => s.n === n)?.section ?? ""}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col min-h-0 min-w-0 bg-side">
          <div className="head sm panel !gap-2.5">
            {/* 안내문은 좁은 화면(390)에서 쪽 이동과 겹쳐 숨긴다 */}
            <span className="hidden md:inline-flex items-center gap-1.5 text-[13.5px] text-ink2 min-w-0 flex-1">
              <Ms name={design ? "ads_click" : "compare"} size={18} className="text-orange" />
              <span className="truncate">{!design ? `가운데 손잡이를 끌어 ${baseLabel}과 결과를 비교하세요` : view === "over" ? "가운데 손잡이를 끌어 시안과 결과를 비교하세요" : "고칠 곳을 누르면 그 자리에 의견이 남습니다"}</span>
            </span>
            <span className="md:hidden flex-1" />
            {hasBase && <Seg sm value={view} onChange={setView} options={design ? [["pin", "결과만"], ["side", "시안과 나란히"], ["over", "겹쳐서"]] : [["over", "겹쳐서"], ["side", "나란히"]]} />}
            <Pager slides={slides} sel={sel} onSel={setSel} />
          </div>
          {!slides.length ? <Empty text="아직 볼 장표가 없습니다." /> : (
            <div className={cn("flex-1 min-h-0 overflow-auto scroll-thin p-6", view === "pin" && "flex items-start justify-center")}>
              {view === "pin" && sheet}
              {cur && view === "side" && <SideBySide job={job} cur={cur} fit="100vh - 220px" baseLabel={design ? "시안 (확정본)" : "원본"} rightLabel={design ? "결과 장표 — 눌러서 의견" : "결과 장표"} right={sheet} />}
              {cur && view === "over" && <Compare key={sel} before={cur.b && beforeUrl(job, cur.b)} after={cur.a && afterUrl(job, cur.a)} beforeLabel={baseLabel} fit="100vh - 180px" />}
            </div>
          )}
        </div>

        {design && <CommentPanel guest fb={fb} onGo={(c) => { setSel(c.slide); if (view === "over") setView("pin"); }} onJob={(j) => onChange?.(j)} empty="가운데 장표에서 고칠 곳을 누르세요." />}
      </div>
    </>
  );
}

/** 원본·결과를 겹쳐 놓고 손잡이로 가르는 비교 뷰. fit = 쓸 수 있는 높이(CSS 식) — 그림이 화면을 넘지 않게 */
export function Compare({ before, after, beforeLabel = "원본", fit = "100vh - 260px" }: { before?: string; after?: string; beforeLabel?: string; fit?: string }) {
  const [x, setX] = useState(50);
  const [ratio, setRatio] = useState(16 / 9);
  const box = useRef<HTMLDivElement>(null);
  const drag = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    setX(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  };
  const wrap = { maxWidth: `calc((${fit}) * ${ratio})` };
  const onLoad = (e: React.SyntheticEvent<HTMLImageElement>) => { const i = e.currentTarget; if (i.naturalWidth && i.naturalHeight) setRatio(i.naturalWidth / i.naturalHeight); };
  if (!before || !after) return <img src={after ?? before} alt="" onLoad={onLoad} className={cn("block w-full mx-auto", SHEET)} style={wrap} />;
  return (
    <div ref={box} className={cn("relative w-full mx-auto overflow-hidden select-none touch-none cursor-ew-resize", SHEET)} style={{ ...wrap, aspectRatio: String(ratio) }}
      tabIndex={0} role="slider" aria-label="원본·결과 비교" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(x)}
      onKeyDown={(e) => {
        const st = e.shiftKey ? 10 : 2;
        if (e.key === "ArrowLeft") { e.preventDefault(); setX((v) => Math.max(0, v - st)); }
        else if (e.key === "ArrowRight") { e.preventDefault(); setX((v) => Math.min(100, v + st)); }
        else if (e.key === "Home") { e.preventDefault(); setX(0); }
        else if (e.key === "End") { e.preventDefault(); setX(100); }
      }}
      onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag(e.clientX); }}
      onPointerMove={(e) => e.buttons && drag(e.clientX)}>
      <img src={after} alt="결과" onLoad={onLoad} className="absolute inset-0 w-full h-full object-contain" draggable={false} />
      <div className="absolute inset-0 bg-white" style={{ clipPath: `inset(0 ${100 - x}% 0 0)` }}>
        <img src={before} alt={beforeLabel} className="absolute inset-0 w-full h-full object-contain" draggable={false} />
      </div>
      <div className="absolute inset-y-0 pointer-events-none" style={{ left: `${x}%` }}>
        <div className="absolute inset-y-0 -ml-px w-0.5 bg-orange" />
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-white border-2 border-orange grid place-items-center text-orange-d">
          <Ms name="unfold_more" size={19} style={{ transform: "rotate(90deg)" }} />
        </div>
      </div>
      <span className="absolute left-2.5 top-2.5 text-[12px] font-bold bg-[rgba(17,17,17,.72)] text-white rounded-md px-[7px] py-0.5 pointer-events-none">{beforeLabel}</span>
      <span className="absolute right-2.5 top-2.5 text-[12px] font-bold bg-orange text-white rounded-md px-[7px] py-0.5 pointer-events-none">결과</span>
    </div>
  );
}

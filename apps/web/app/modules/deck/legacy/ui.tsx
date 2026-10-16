// 옛 화면 공용 UI 부품(셸·상태 표시·단계·모달·토스트·아바타 등) — 출처: powerDeck web/src/ui.tsx (옛 화면 그대로 이식, eslint.config.js legacy 구역).
import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { WideToggle } from "@/components/hb/work-space";
import { pdGo } from "./nav";
import { thumb } from "./DesignTypes";
import { VERTICAL_STYLES, verticalThumb, verticalToneName } from "./VerticalThemes";
import { COMPANY_THEMES, companyThumb, companyThemeName, companyToneName } from "./CompanyThemes";
import type { Job } from "./api";
import { hasMockup, isPlanPhase } from "./stages";
import styleData from "./data/styles.json";
import fontData from "./data/fonts.json";

const STYLES = (styleData as { styles: { id: string; name: string; desc: string }[] }).styles;
const FONTS = fontData as unknown as { title: { id: string; name: string }[]; body: { id: string; name: string }[] };

export const cn = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

/*
 * 디자인 기준 — reference/design_sample/design_handoff_powerdeck_redesign/README.md (개선안).
 * 색·버튼·세그먼트·머리줄 같은 공통 모양은 index.css 의 클래스(.btn-next .btn-back .btn-danger .btn-icon .seg .head .sec-ic .card-on .badge .radio)로,
 * 여러 화면이 같이 쓰는 부품은 이 파일에 둔다.
 */

/** 아이콘 — Google Material Symbols Outlined. name 은 심벌 이름(close, download, add …). 크기는 옆 글자 +5px 안팎 */
export function Ms({ name, size = 19, fill, className, style }: { name: string; size?: number; fill?: boolean; className?: string; style?: CSSProperties }) {
  return <span aria-hidden className={cn("ms", fill && "ms-fill", className)} style={{ fontSize: size, width: size, height: size, ...style }}>{name}</span>;
}

/** 글 사이 화살표 — 특수문자 → 대신 아이콘 */
export const Arrow = ({ size = 15 }: { size?: number }) => <Ms name="arrow_forward" size={size} className="align-[-3px] mx-0.5" />;

/** 로고 — 장표 두 장이 겹친 모양(뒷장 연주황 · 앞장 주황) + 반짝임. 주황 바탕 칸은 쓰지 않는다. size 24(사이드바) / 36(로그인) */
export function Logo({ size = 24 }: { size?: number }) {
  const k = size / 24, bw = size >= 32 ? 2.5 : 2;
  return (
    <span className="relative inline-block flex-none" style={{ width: size, height: size }} aria-hidden>
      <span className="absolute" style={{ left: 6 * k, top: 2 * k, width: 15 * k, height: 12 * k, border: `${bw}px solid var(--color-orange-line)`, borderRadius: 3 * k }} />
      <span className="absolute" style={{ left: 1 * k, top: 7 * k, width: 15 * k, height: 12 * k, border: `${bw}px solid var(--color-point)`, borderRadius: 3 * k, background: "rgba(255,255,255,.55)" }} />
      <Ms name="auto_awesome" fill size={9 * k} className="absolute text-orange" style={{ left: 16 * k, top: 16 * k }} />
    </span>
  );
}

/** 상태 색 — 사이드바 점·배지가 같이 쓴다 */
export const STATUS: Record<string, { label: string; bg: string; fg: string; dot: string }> = {
  hold: { label: "시작 대기", bg: "var(--color-ground-3)", fg: "var(--color-ink-3)", dot: "var(--color-ink-4)" },
  queued: { label: "대기", bg: "var(--color-ground-3)", fg: "var(--color-ink-3)", dot: "var(--color-ink-4)" },
  running: { label: "변환 중", bg: "var(--color-orange-tint)", fg: "var(--color-point-ink)", dot: "var(--color-point)" },
  review: { label: "확인 대기", bg: "var(--color-mark-soft)", fg: "var(--color-ink-2)", dot: "var(--color-ink-2)" },
  failed: { label: "실패", bg: "var(--color-warn-soft)", fg: "var(--color-warn)", dot: "var(--color-warn)" },
  done: { label: "완료", bg: "var(--color-ok-soft)", fg: "var(--color-ok)", dot: "var(--color-ok)" },
  canceled: { label: "취소", bg: "var(--color-ground-3)", fg: "var(--color-ink-4)", dot: "var(--color-ink-4)" },
};

/** 상태 배지 — 72×24 고정(목록·카드). small 은 머리줄 제목 옆의 작은 배지 */
export function StatusPill({ status, small }: { status: string; small?: boolean }) {
  const s = STATUS[status] ?? { label: status, bg: "var(--color-ground-3)", fg: "var(--color-ink-3)", dot: "var(--color-ink-4)" };
  if (small) return <span className="flex-none whitespace-nowrap text-[12.5px] font-bold rounded-md px-[7px] py-0.5" style={{ background: s.bg, color: s.fg }}>{s.label}</span>;
  return <span className="badge" style={{ background: s.bg, color: s.fg }}>{s.label}</span>;
}

/* ── 머리줄 ── */

const STEP_LABELS = ["초안 올리기", "대기·분석", "디자인 변환", "완료"];
const STEP_LABELS_DESIGN = ["내용 입력", "기획", "시안", "장표 제작", "완료"];
/** 세로 제안서(제출용) — 시안 이미지 없이 기획에서 바로 PPT(engine/vertical.py) */
const STEP_LABELS_VERTICAL = ["내용 입력", "기획", "PPT 제작", "완료"];
const isSubmitJob = (job: Job) => job.kind === "design" && (job.opts?.purpose === "submit" || job.opts?.purpose === "company");   // 회사소개서(테마 A·B)도 시안 없이 PPT 바로

/** 작업이 지금 몇 번째 단계인가 — 장표 변환 0~3, 기획 작업 0~4(내용·기획·시안·장표·완료) */
const jobStep = (job: Job) => {
  // 실패·취소는 멈춘 단계에 머문다(그 단계가 빨간 ! 로 보인다)
  if (isSubmitJob(job)) return job.status === "done" ? 3 : job.stage === "시안 생성" || job.stage === "시안 정리" ? 2 : 1;   // 엔진 보고 이름은 그대로(stages.ts STAGES_VERTICAL)
  if (job.kind === "design") return job.status === "done" ? 4 : !isPlanPhase(job) && job.status !== "review" ? 3 : hasMockup(job) ? 2 : 1;
  return job.status === "queued" || job.status === "hold" ? 1 : job.status === "done" ? 3 : 2;
};

/** 단계 표시 — 끝난 단계는 초록 ✓, 지금 단계는 주황 번호, 실패한 단계는 빨간 ! */
function StepTrail({ labels, step, failed, done }: { labels: string[]; step: number; failed?: boolean; done?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 flex-none">
      {labels.map((l, i) => {
        const ok = i < step || (done && i === step), cur = i === step && !ok, bad = cur && failed;
        return (
          <span key={l} className="contents">
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full grid place-items-center text-[11px] font-bold"
                style={{ background: bad ? "var(--color-warn)" : ok ? "var(--color-ok-soft)" : cur ? "var(--color-ink)" : "var(--color-ground-3)", color: bad ? "#fff" : ok ? "var(--color-ok)" : cur ? "var(--color-ground)" : "var(--color-ink-4)" }}>
                {bad ? "!" : ok ? <Ms name="check" size={12} /> : i + 1}
              </span>
              <span className={cn("text-[13px] font-semibold", !cur && "max-md:sr-only")} style={{ color: bad ? "var(--color-warn)" : ok || cur ? "var(--color-ink)" : "var(--color-ink-4)" }}>{l}</span>
            </span>
            {i < labels.length - 1 && <span className="w-3.5 h-px bg-[var(--color-line-3)]" />}
          </span>
        );
      })}
    </div>
  );
}

/** 이 작업이 실제로 쓴 AI 모델(관리자만) — 서버 사용 기록(ai_usage)을 작업 종류별로. 모델마다 기획·대본 품질을 견주려고 */
const USE_KIND: Record<string, string> = { plan: "기획·와이어", digest: "자료 요약", script: "대본·QA", build: "장표 제작", image: "이미지",
  eplan: "기획(구독)", edigest: "요약(구독)", engine: "제작(구독)", hf: "이미지" };
const USE_ORDER = ["digest", "plan", "eplan", "edigest", "script", "build", "engine", "image", "hf"];
function UsedModels({ costs }: { costs: NonNullable<Job["costs"]> }) {
  const rows = [...costs].sort((a, b) => USE_ORDER.indexOf(a.kind) - USE_ORDER.indexOf(b.kind));
  return (
    <span className="block">
      {rows.map((c, i) => (
        <span key={i} className="flex items-baseline gap-2 min-w-0">
          <span className="text-dim text-[12.5px] w-[76px] flex-none">{USE_KIND[c.kind] ?? c.kind}</span>
          <span className="font-mono text-[12.5px] truncate min-w-0" title={c.model}>{c.model}</span>
          <span className="ml-auto text-dim text-[12px] whitespace-nowrap">{c.n}회{c.usd > 0 ? ` · $${c.usd.toFixed(c.usd < 0.1 ? 3 : 2)}` : ""}</span>
        </span>
      ))}
    </span>
  );
}

/**
 * 이 작업을 어떤 설정으로 시작했는가 — 머리줄 제목 옆 「설정」을 누르면 요약이 뜬다(용도·디자인 타입·서체·강조색·장 수·시안·구성·자료·요청).
 * 진행 중·기획 확인·결과 어느 화면에서나 같다.
 */
function JobSettings({ job, onEdit }: { job: Job; onEdit?: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const f = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", f); window.addEventListener("keydown", k);
    return () => { window.removeEventListener("mousedown", f); window.removeEventListener("keydown", k); };
  }, [open]);
  const o = job.opts, design = job.kind === "design";
  const style = STYLES.find((s) => s.id === (o?.style || "a"));
  const vstyle = VERTICAL_STYLES.find((s) => s.id === (o?.vstyle || "band"));
  const font = (list: { id: string; name: string }[], id?: string) => list.find((f) => f.id === id)?.name ?? list[0]?.name ?? "";
  const front = o?.front ? ([["cover", "표지"], ["toc", "목차"], ["divider", "간지"]] as const).filter(([k]) => o.front![k]).map(([, l]) => l) : [];
  const rows: [string, ReactNode][] = [
    ["방식", design ? "내용으로 장표 만들기" : "초안 PPT 다듬기"],
    ...(design ? [
      ["용도", o?.purpose === "submit" ? "제출용 — 평가위원이 읽고 점수를 매긴다" : o?.purpose === "company" ? "회사소개용 — 회사를 처음 보는 사람에게" : "발표용 — 짧은 시간에 '왜 우리인가'"],
      // 제출용은 세로 제안서 스타일·톤(opts.vstyle·vtone) — 발표장표 타입(opts.style)을 보이면 안 된다(10-15 사용자 '세로인데 발표장표 테마로 나옴')
      ["디자인", o?.purpose === "company" ? <span className="flex items-center gap-2.5 min-w-0">
        <img src={companyThumb(o?.ctheme || "a", 1, o?.ctone || "blue")} alt="" className="w-[72px] aspect-video object-cover rounded-md border border-line flex-none" />
        <span className="min-w-0"><span className="block font-semibold">테마 {(o?.ctheme || "a").toUpperCase()} · {companyThemeName(o?.ctheme)} · {companyToneName(o?.ctone)}</span><span className="block text-[12.5px] text-dim leading-[1.45]">{COMPANY_THEMES.find((t) => t.id === (o?.ctheme || "a"))?.desc}</span></span>
      </span> : o?.purpose === "submit" ? <span className="flex items-center gap-2.5 min-w-0">
        <img src={verticalThumb(vstyle?.id ?? "band", 1)} alt="" className="w-[48px] aspect-[1/1.414] object-cover object-top rounded-md border border-line flex-none" />
        <span className="min-w-0"><span className="block font-semibold">세로 제안서 · {vstyle?.name} · {verticalToneName(o?.vtone)}</span><span className="block text-[12.5px] text-dim leading-[1.45]">{vstyle?.desc}</span></span>
      </span> : <span className="flex items-center gap-2.5 min-w-0">
        <img src={thumb(style?.id ?? "a", 1)} alt="" className="w-[72px] aspect-[3/2] object-cover object-top rounded-md border border-line flex-none" />
        <span className="min-w-0"><span className="block font-semibold">타입 {(style?.id ?? "a").toUpperCase()} · {style?.name}</span><span className="block text-[12.5px] text-dim leading-[1.45]">{style?.desc}</span></span>
      </span>],
    ] as [string, ReactNode][] : []),
    ["서체", o?.purpose === "company" ? "프리텐다드(회사소개서 고정)" : `${font(FONTS.title, o?.font_title)} / ${font(FONTS.body, o?.font_body)}`],
    ...(design && o?.purpose === "company" ? [
      ["장 수", o?.slides ? `${o.slides}장 안팎` : "14장 안팎"],
    ] as [string, ReactNode][] : design ? [
      ["강조색", job.theme ? <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-full border border-black/10" style={{ background: job.theme.slice(0, 7) }} /><span className="font-mono text-[13px]">{job.theme.slice(0, 7).toUpperCase()}</span></span> : "기본"],
      ["장 수", o?.slides ? `${o.slides}장으로 지정` : `알아서${job.slides ? ` — 지금 ${job.slides}장` : ""}`],
      ...(o?.purpose === "submit" ? [] : [["시안", o?.mockups === "all" ? "전부 바로 만들기" : o?.mockups === "sample" ? `샘플 ${o.sample}장 먼저` : "기획부터 보기"] as [string, ReactNode]]),
      ["구성", front.length ? front.join(" · ") + " 넣기" : "본문만"],
    ] as [string, ReactNode][] : []),
    ["자료", job.docs?.length ? <span className="block">{job.docs.slice(0, 4).map((d) => <span key={d.id} className="block truncate" title={d.name}>{d.name}</span>)}{job.docs.length > 4 && <span className="text-dim">외 {job.docs.length - 4}개</span>}</span>
      : job.source_kind === "pptx" ? job.filename : "직접 적은 내용"],
    ["요청", job.note?.trim() ? <span className="block whitespace-pre-wrap break-words max-h-[120px] overflow-y-auto scroll-thin">{job.note.trim()}</span> : "없음"],
    ...(job.admin && job.costs?.length ? [["모델", <UsedModels costs={job.costs} />]] as [string, ReactNode][] : []),
  ];
  return (
    <span ref={box} className="relative flex-none">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} title="이 작업을 시작할 때 고른 설정"
        className={cn("pp-hit h-6 pl-1.5 pr-2 rounded-md border text-[12.5px] font-semibold inline-flex items-center gap-1 whitespace-nowrap", open ? "border-orange text-orange-d bg-orange-soft" : "border-line text-ink2 bg-white hover:bg-panel")}>
        <Ms name="tune" size={15} />설정
      </button>
      {open && (
        <div className="absolute z-40 left-0 top-[30px] w-[420px] bg-white rounded-field border border-line shadow-[0_16px_40px_-12px_rgba(17,17,17,.3)] p-1.5 whitespace-normal">
          <div className="flex items-center px-3 pt-2 pb-1.5"><span className="text-[14px] font-bold">이 작업의 설정</span>
            <button className="pp-hit btn-icon ml-auto !w-7 !h-7" title="닫기" aria-label="닫기" onClick={() => setOpen(false)}><Ms name="close" size={18} /></button></div>
          {rows.map(([k, v]) => (
            <div key={k} className="grid gap-3 px-3 py-2 border-t border-line-soft text-[13.5px] leading-[1.5]" style={{ gridTemplateColumns: "52px minmax(0,1fr)" }}>
              <span className="text-dim whitespace-nowrap">{k}</span><span className="min-w-0 text-[var(--color-ink)]">{v}</span>
            </div>
          ))}
          {onEdit && (
            <div className="p-2 border-t border-line-soft">
              <button type="button" className="btn-dark w-full !h-10" onClick={() => { setOpen(false); onEdit(); }}><Ms name="tune" size={18} />디자인 타입 · 서체 · 강조색 바꾸기</button>
            </div>
          )}
        </div>
      )}
    </span>
  );
}

/**
 * 작업 화면 공통 머리줄 — 1행(최소 72px): 「내 작업 /」 경로 + 제목 + 상태 배지, 아래 줄에 작업 정보 · 단계 표시, 오른쪽 끝에 그 화면의 행동 버튼(actions).
 * tabs 를 주면 2행(44px) 탭이 붙는다(결과 화면만).
 */
export function JobHeader<T extends string>({ job, meta, actions, tabs, tab, onTab, onSettings }: {
  job: Job; meta?: ReactNode; actions?: ReactNode; tabs?: [T, ReactNode][]; tab?: T; onTab?: (t: T) => void;
  /** 주면 「설정」 안에 바꾸기 버튼이 생긴다(시안 만들기 전 확인 단계) */
  onSettings?: () => void;
}) {
  const step = jobStep(job);
  // 높이를 재서 아래 칸 머리(.pd .head)가 이 줄 바로 밑에 붙게 — 고정값이면 줄이 길어질 때 겹친다(사용자 2026-10-07)
  const hdrRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = hdrRef.current; if (!el) return;
    const root = document.documentElement;
    const ro = new ResizeObserver(() => root.style.setProperty("--pd-jobhead", el.offsetHeight + "px"));
    ro.observe(el);
    return () => { ro.disconnect(); root.style.removeProperty("--pd-jobhead"); };
  }, []);
  return (
    <header ref={hdrRef} className="sticky-follow sticky top-[var(--hdr-offset)] z-30 border-b border-line px-4 lg:px-6 flex-none bg-white">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 min-h-[72px] py-2.5">
        <div className="min-w-0 flex-1 basis-[280px]">
          <div className="flex items-center gap-2 min-w-0">
            <a href="#/list" className="pp-hit text-[14px] text-dim whitespace-nowrap hover:text-ink">내 작업</a><span className="text-[var(--color-line-3)]">/</span>
            <div className="font-bold text-[15.5px] truncate" title={job.title}>{job.title}</div>
            <StatusPill status={job.status} small />
            <JobSettings job={job} onEdit={onSettings} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 mt-[5px] min-w-0">
            {meta && <><span className="text-[13px] text-dim truncate min-w-0">{meta}</span><span className="w-px h-3 bg-line flex-none" /></>}
            <StepTrail labels={isSubmitJob(job) ? STEP_LABELS_VERTICAL : job.kind === "design" ? STEP_LABELS_DESIGN : STEP_LABELS} step={step} failed={job.status === "failed" || job.status === "canceled"} done={job.status === "done"} />
          </div>
        </div>
        <div className="pd-acts flex flex-wrap items-center gap-2 max-lg:w-full">{actions}<WideToggle inline size="icon" /></div>
      </div>
      {tabs && (
        <div className="flex flex-wrap items-center min-h-11 gap-x-5 lg:gap-x-6">
          {tabs.map(([k, l]) => (
            <button key={k} onClick={() => onTab?.(k)} className={cn("h-10 px-0.5 bg-transparent text-[14px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap", tab === k ? "text-ink" : "text-dim hover:text-ink")}
              style={{ boxShadow: `inset 0 -2px 0 ${tab === k ? "var(--color-ink)" : "transparent"}` }}>{l}</button>
          ))}
        </div>
      )}
    </header>
  );
}

/**
 * 공유받은 시안 검토 머리줄(56px) — 로고 · 「검토 요청」 · 장표 제목 · "○○ 님이 공유", 오른쪽에 함께 보는 사람 아바타(32px, -8px 겹침) · 로그아웃.
 * people: 이메일 목록(작업 주인·의견 남긴 사람·나). 나는 테두리 링으로 구분한다.
 */
export function GuestHeader({ job, me, people, onLogout }: { job: Job; me: string; people?: string[]; onLogout?: () => void }) {
  // 공유받은 사람 응답엔 email 이 없다 — 주인 표시는 서버가 주는 owner_label(앞 2자+***)로(상1, 2026-10-10)
  const owner = job.email || job.owner_label || "";
  const list = [...new Set([owner, ...(people ?? []), me])].filter(Boolean);
  const role = (e: string) => (e === me ? "나" : e === owner ? "작업 주인" : "의견 남김");
  return (
    <header className="head">
      {/* 공유받은 사람 화면 — 로고는 눌러도 아무 데도 가지 않는다(검토 화면 밖으로 나가지 않게) */}
      <Logo size={24} />
      <span className="text-[17px] font-black tracking-[-0.03em]">powerDeck</span>
      <span className="vsep mx-1" />
      <span className="flex-none text-[12.5px] font-bold rounded-md px-[7px] py-0.5 bg-orange-soft text-orange-d">{me ? "검토 요청" : "보기 전용"}</span>
      <span className="font-bold text-[15.5px] truncate min-w-0">{job.title}</span>
      <span className="text-[13px] text-dim flex-none">· {job.owner_label ?? job.email?.split("@")[0] ?? "작업 주인"} 님이 공유</span>
      <span className="ml-auto flex items-center flex-none">
        {list.slice(0, 6).map((e, i) => (
          <Avatar key={e} name={e} size={32} className={i ? "-ml-2" : ""} style={{ border: "2px solid #fff", boxShadow: e === me ? `0 0 0 2px ${avatarColor(e)}` : undefined, zIndex: 10 - i }} />
        ))}
        <span className="ml-2.5 text-[13px] text-ink2" title={list.map((e) => `${e} (${role(e)})`).join("\n")}>{list.length}명</span>
      </span>
      {onLogout && (me
        ? <button onClick={onLogout} title="로그아웃" aria-label="로그아웃" className="btn-icon !w-9 !h-9"><Ms name="logout" size={20} /></button>
        : <button onClick={onLogout} title="로그인하면 의견을 남길 수 있습니다" className="btn-back !h-9 !px-3.5 ml-2"><Ms name="login" size={18} />로그인</button>)}
    </header>
  );
}

/** 세그먼트 버튼 — options: [값, 라벨][] */
export function Seg<T extends string>({ value, onChange, options, sm, className }: { value: T; onChange: (v: T) => void; options: readonly (readonly [T, ReactNode])[]; sm?: boolean; className?: string }) {
  return (
    <div className={cn("seg", sm && "sm", className)}>
      {options.map(([v, l]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}
    </div>
  );
}

/** 항목(섹션) 제목 — 28px 연주황 칸의 아이콘 + 17px/800 제목 + 13px 회색 설명 */
export function SecTitle({ icon, title, desc, right }: { icon: string; title: ReactNode; desc?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <span className="sec-ic"><Ms name={icon} size={18} /></span>
      <span className="sec-title">{title}</span>
      {desc && <span className="sec-desc truncate">{desc}</span>}
      {right && <span className="ml-auto flex-none">{right}</span>}
    </div>
  );
}

/** 셀렉트 — OS 기본 대신 직접 그린 드롭다운. 높이 42px, 양쪽 14px, 열면 아래에 흰 레이어 */
export function Select<T extends string>({ value, onChange, options, className, disabled, placeholder, label }: {
  value: T; onChange: (v: T) => void; options: readonly (readonly [T, ReactNode])[]; className?: string; disabled?: boolean; placeholder?: string; label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);   // 키보드로 가리키는 후보
  const box = useRef<HTMLDivElement>(null);
  const toggle = () => { if (!open) setHi(Math.max(0, options.findIndex(([v]) => v === value))); setOpen((o) => !o); };
  useEffect(() => {
    if (!open) return;
    const f = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const d = e.key === "ArrowDown" ? 1 : -1;
        const n = options.length ? (((hi < 0 ? options.findIndex(([v]) => v === value) : hi) + d + options.length) % options.length) : -1;
        setHi(n);
        document.getElementById(`pd-opt-${n}`)?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter" && hi >= 0 && options[hi]) { e.preventDefault(); onChange(options[hi][0]); setOpen(false); }
    };
    window.addEventListener("mousedown", f); window.addEventListener("keydown", k);
    return () => { window.removeEventListener("mousedown", f); window.removeEventListener("keydown", k); };
  }, [open, hi, options, onChange, value]);
  const cur = options.find(([v]) => v === value);
  return (
    <div ref={box} className={cn("relative", className)}>
      <button type="button" disabled={disabled} onClick={toggle} aria-haspopup="listbox" aria-expanded={open} aria-label={label}
        className={cn("w-full h-[42px] pl-3.5 pr-2.5 rounded-md border bg-white text-[14px] text-left flex items-center gap-2", open ? "border-orange shadow-[0_0_0_3px_var(--color-orange-soft)]" : "border-line", disabled && "bg-panel text-dim")}>
        <span className={cn("flex-1 min-w-0 truncate", !cur && "text-faint")}>{cur ? cur[1] : placeholder}</span>
        <Ms name="arrow_drop_down" size={22} className="text-dim" />
      </button>
      {open && (
        <div className="absolute z-40 left-0 right-0 top-[46px] max-h-[280px] overflow-y-auto bg-white rounded-md border border-line shadow-[0_12px_32px_-8px_rgba(17,17,17,.25)] p-1" role="listbox" aria-label={label}>
          {options.map(([v, l], i) => (
            <button key={v} id={`pd-opt-${i}`} type="button" role="option" aria-selected={v === value} onClick={() => { onChange(v); setOpen(false); }}
              onMouseEnter={() => setHi(i)}
              className={cn("w-full h-9 px-2.5 rounded-md text-[14px] text-left flex items-center gap-2", v === value ? "bg-orange-soft text-orange-d font-semibold" : "hover:bg-panel", open && i === hi && v !== value && "bg-panel")}>
              <span className="flex-1 min-w-0 truncate">{l}</span>{v === value && <Ms name="check" size={17} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const AVATAR = ["#7C3AED", "#0891B2", "#DB2777", "var(--color-ok)", "var(--color-point)", "var(--color-ink-2)"];
/** 이름(이메일)에서 정해지는 고유 색 — 같은 사람은 어디서나 같은 색 */
export const avatarColor = (name: string) => { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AVATAR[h % AVATAR.length]; };
export function Avatar({ name, size = 24, gray, className, style }: { name: string; size?: number; gray?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <span className={cn("rounded-full grid place-items-center flex-none font-extrabold", className)} title={name}
      style={{ width: size, height: size, fontSize: size * 0.46, background: gray ? "var(--color-line)" : avatarColor(name), color: gray ? "var(--color-ink-3)" : "#fff", ...style }}>
      {(name[0] ?? "?").toUpperCase()}
    </span>
  );
}

/** 모달 — 가운데 흰 창(radius 14). 닫기는 X 아이콘만 */
export function Modal({ title, onClose, width = 480, children, foot }: { title?: ReactNode; onClose?: () => void; width?: number; children: ReactNode; foot?: ReactNode }) {
  useEffect(() => {
    if (!onClose) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-8 bg-[rgba(17,17,17,.45)]" onClick={onClose} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : "대화 상자"}>
      <div className="w-full max-h-full flex flex-col bg-white rounded-field shadow-[0_24px_64px_-16px_rgba(17,17,17,.45)] overflow-hidden" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        {title && (
          <div className="flex-none flex items-center gap-2 h-14 pl-5 pr-3 border-b border-line">
            <div className="text-[16px] font-bold truncate">{title}</div>
            {onClose && <button className="btn-icon ml-auto" title="닫기" aria-label="닫기" onClick={onClose}><Ms name="close" size={20} /></button>}
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
        {foot && <div className="flex-none flex items-center justify-end gap-2 px-5 py-3.5 border-t border-line bg-panel">{foot}</div>}
      </div>
    </div>
  );
}

/* ── 토스트 — 모든 오류·경고를 화면 아래 가운데에 잠깐 띄운다 ── */

type ToastKind = "error" | "warn" | "ok";
/** 어디서든 부른다. 서버 요청 실패(조회 제외)는 api.ts 가 알아서 띄운다 */
export const toast = (msg: string, kind: ToastKind = "error") => { window.dispatchEvent(new CustomEvent("pd:toast", { detail: { msg, kind } })); };
/** 화면의 오류 상태(err)가 생기면 토스트로도 알린다 */
export function useToastOn(err: string | null | undefined, kind: ToastKind = "error") {
  useEffect(() => { if (err) toast(err, kind); }, [err, kind]);
}

export function Toaster() {
  const [list, setList] = useState<{ id: number; msg: string; kind: ToastKind; at: number }[]>([]);
  useEffect(() => {
    let seq = 0;
    const f = (e: Event) => {
      const d = (e as CustomEvent<{ msg: string; kind?: ToastKind }>).detail;
      if (!d?.msg) return;
      const id = ++seq, now = Date.now();
      // 같은 말이 잇달아 오면(화면 표시 + 요청 실패) 한 번만
      setList((l) => (l.some((t) => t.msg === d.msg && now - t.at < 4000) ? l : [...l.slice(-3), { id, msg: d.msg, kind: d.kind ?? "error", at: now }]));
      window.setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), d.kind === "ok" ? 3000 : 6000);
    };
    window.addEventListener("pd:toast", f);
    return () => window.removeEventListener("pd:toast", f);
  }, []);
  if (!list.length) return null;
  const look = { error: ["var(--color-warn-soft)", "var(--color-warn-line)", "var(--color-warn)", "error"], warn: ["var(--color-mark-soft)", "var(--color-mark)", "var(--color-ink-2)", "warning"], ok: ["var(--color-ok-soft)", "var(--color-ok-line)", "var(--color-ok)", "check_circle"] } as const;
  return (
    <div className="fixed z-[100] left-1/2 -translate-x-1/2 bottom-6 flex flex-col items-center gap-2 pointer-events-none" role="status" aria-live="polite">
      {list.map((t) => {
        const [bg, bd, fg, ic] = look[t.kind];
        return (
          <div key={t.id} className="pointer-events-auto fadein flex items-start gap-2 max-w-[560px] pl-3.5 pr-2 py-2.5 rounded-md border shadow-[0_12px_32px_-10px_rgba(17,17,17,.35)] text-[14px] font-semibold leading-[1.5]"
            style={{ background: bg, borderColor: bd, color: fg }}>
            <Ms name={ic} size={20} className="mt-px" />
            <span className="min-w-0 break-words">{t.msg}</span>
            <button className="flex-none w-6 h-6 rounded-md grid place-items-center opacity-60 hover:opacity-100" style={{ color: fg }} title="닫기" aria-label="닫기"
              onClick={() => setList((l) => l.filter((x) => x.id !== t.id))}><Ms name="close" size={17} /></button>
          </div>
        );
      })}
    </div>
  );
}

/* ── 확인 모달 — 브라우저 기본 confirm 대신. `if (await ask("지울까요?", { danger: true }))` ── */

type AskOpts = { title?: string; ok?: string; cancel?: string; danger?: boolean };
/** 확인을 묻는다 — 확인이면 true. 화면 어디서든 부른다(Asker 가 main.tsx 에 한 번 떠 있다) */
export const ask = (msg: string, opts: AskOpts = {}) => new Promise<boolean>((resolve) => {
  window.dispatchEvent(new CustomEvent("pd:ask", { detail: { msg, opts, resolve } }));
});

export function Asker() {
  const [q, setQ] = useState<{ msg: string; opts: AskOpts; resolve: (v: boolean) => void } | null>(null);
  useEffect(() => {
    const f = (e: Event) => {
      const d = (e as CustomEvent<{ msg: string; opts: AskOpts; resolve: (v: boolean) => void }>).detail;
      setQ((old) => { old?.resolve(false); return d; });
    };
    window.addEventListener("pd:ask", f);
    return () => window.removeEventListener("pd:ask", f);
  }, []);
  useEffect(() => {
    if (!q) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); q.resolve(false); setQ(null); }
      else if (e.key === "Enter") { e.preventDefault(); q.resolve(true); setQ(null); }
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [q]);
  if (!q) return null;
  const done = (v: boolean) => { q.resolve(v); setQ(null); };
  const { danger } = q.opts;
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center p-8 bg-[rgba(17,17,17,.45)]" onClick={() => done(false)} role="alertdialog" aria-modal="true">
      <div className="w-full max-w-[440px] bg-white rounded-field shadow-[0_24px_64px_-16px_rgba(17,17,17,.45)] p-6 fadein" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3.5">
          <span className={cn("w-10 h-10 rounded-md grid place-items-center flex-none", danger ? "bg-[var(--color-warn-soft)] text-[var(--color-warn)]" : "bg-orange-soft text-orange")}>
            <Ms name={danger ? "delete" : "help"} size={22} />
          </span>
          <div className="min-w-0 pt-0.5">
            <div className="text-[16px] font-bold">{q.opts.title ?? (danger ? "지울까요?" : "확인해 주세요")}</div>
            <div className="mt-1.5 text-[14px] text-ink2 leading-[1.65] break-keep whitespace-pre-line">{q.msg}</div>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-back" onClick={() => done(false)}>{q.opts.cancel ?? "취소"}</button>
          <button autoFocus className={danger ? "btn-dark !bg-[var(--color-warn)] hover:!bg-[var(--color-warn)]" : "btn-next"} onClick={() => done(true)}>{q.opts.ok ?? (danger ? "지우기" : "확인")}</button>
        </div>
      </div>
    </div>
  );
}

export const fmtDur = (sec: number) => {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}시간 ${m}분` : m ? `${m}분 ${s}초` : `${s}초`;
};
/** 서버 시각 문자열(NOW() — 서버 로컬, 타임존 없음) → Date. 'Z' 를 붙이면 +9시간이 되던 것(중5, 2026-10-10)이라 로컬로 그대로 읽는다.
 *  ISO 로 타임존이 이미 붙어 오면(…Z, +09:00) 그대로 쓴다 */
export const parseTs = (s: string | null | undefined) => (s ? new Date(s.replace(" ", "T")) : null);
/** 서버 UTC 시각 문자열(gmdate — wire_at) → Date */
const parseUtc = (s: string | null | undefined) => {
  if (!s) return null;
  const t = s.replace(" ", "T");
  return new Date(/(Z|[+-]\d\d:?\d\d)$/.test(t) ? t : t + "Z");
};

/** 장 그림 우측 위 생성 시각 — 다시 돌린 뒤 새로 만든 것인지 구분한다. at: 서버 시각 문자열 또는 유닉스 초. 부모는 relative */
export function GenStamp({ at, label = "생성", utc }: { at: string | number | null | undefined; label?: string;
  /** 문자열이 서버 UTC(wire_at)면 true — 나머지 문자열은 서버 로컬 */
  utc?: boolean }) {
  const d = typeof at === "number" ? (at > 0 ? new Date(at * 1000) : null) : utc ? parseUtc(at) : parseTs(at);
  if (!d || isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  const t = `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  return (
    <span className="absolute top-1.5 right-1.5 z-[5] pointer-events-none rounded-md bg-ink/70 px-1.5 py-[1px] font-mono text-[11.5px] font-semibold text-white whitespace-nowrap" title={`${label} ${t}`}>
      {label} {t}
    </span>
  );
}


/* ── 오른쪽 클릭 메뉴 — 화면마다 그 자리에서 할 일을 모아 보여 준다 ── */
export type CtxItem = { label: string; icon?: string; onClick?: () => void; disabled?: boolean; danger?: boolean; on?: boolean; hint?: string } | "-" | { head: string };
/** onContextMenu 에 open(e, items) 를 걸고, node 를 화면 어디엔가 그린다. 입력칸·상자 편집처럼 자기 메뉴가 있는 곳(이미 막은 이벤트)은 건드리지 않는다 */
export function useContextMenu() {
  const [m, setM] = useState<{ x: number; y: number; items: CtxItem[] } | null>(null);
  useEffect(() => {
    if (!m) return;
    const close = () => setM(null);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setM(null); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", key);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", key); window.removeEventListener("resize", close); window.removeEventListener("scroll", close, true); };
  }, [m]);
  const open = (e: React.MouseEvent, items: CtxItem[]) => {
    if (e.defaultPrevented) return;   // 상자 편집처럼 자기 메뉴가 있는 곳
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea, select, [contenteditable=true]")) return;   // 입력칸은 공통 메뉴(잘라내기·복사·붙여넣기)로
    const list = items.filter((x, i, a) => x !== "-" || (i > 0 && a[i - 1] !== "-" && i < a.length - 1));
    if (!list.length) return;
    e.preventDefault();
    e.stopPropagation();
    const h = list.reduce((n, x) => n + (x === "-" ? 9 : "head" in x ? 28 : 36), 12);
    setM({ x: Math.min(e.clientX, window.innerWidth - 248), y: Math.max(8, Math.min(e.clientY, window.innerHeight - h - 8)), items: list });
  };
  const node = m && createPortal(
    <div role="menu" className="fixed z-[80] w-[240px] bg-white rounded-md border border-line shadow-[0_12px_32px_-8px_rgba(17,17,17,.3)] p-1 text-[13.5px] font-semibold text-ink3"
      style={{ left: m.x, top: m.y }} onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      {m.items.map((x, i) => x === "-" ? <div key={i} className="h-px bg-line-soft my-1" />
        : "head" in x ? <div key={i} className="px-2.5 pt-1.5 pb-0.5 text-[12px] font-bold text-faint">{x.head}</div>
        : (
          <button key={i} type="button" role="menuitem" disabled={x.disabled} onClick={() => { setM(null); x.onClick?.(); }}
            className={cn("w-full h-9 px-2.5 rounded-md flex items-center gap-2 text-left whitespace-nowrap disabled:text-faint disabled:hover:bg-transparent", x.danger ? "text-[var(--color-warn)] hover:bg-[var(--color-warn-soft)]" : "hover:bg-panel", x.on && "text-orange-d")}>
            <Ms name={x.on ? "check" : x.icon ?? "chevron_right"} size={18} className={cn(!x.icon && !x.on && "opacity-0")} />
            <span className="truncate">{x.label}</span>
            {x.hint && <span className="ml-auto text-[12px] font-medium text-faint">{x.hint}</span>}
          </button>
        ))}
    </div>, document.body);
  return { open, node };
}


/**
 * 공통 오른쪽 클릭 메뉴 — 화면 전용 메뉴가 없는 곳에서도 브라우저 메뉴 대신 이것이 뜬다(powerDeck 안에서는 브라우저 메뉴·소스 보기를 쓰지 않는다).
 * 입력칸이면 잘라내기·복사·붙여넣기·모두 선택, 아니면 이동(새 변환·내 작업·설정). 소스 보기·개발자 도구 단축키(Ctrl+U · F12 · Ctrl+Shift+I/J/C)도 막는다.
 */
export function GlobalContextMenu() {
  const { open, node } = useContextMenu();
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      if (e.defaultPrevented) return;   // 화면 전용 메뉴나 상자 메뉴가 이미 열렸다
      e.preventDefault();
      const t = e.target as HTMLElement;
      const box = t.closest("input, textarea") as HTMLInputElement | HTMLTextAreaElement | null;
      const sel = window.getSelection()?.toString() ?? "";
      const go = (h: string) => { pdGo(h); };
      const items: CtxItem[] = box ? [
        { label: "잘라내기", icon: "content_cut", disabled: box.readOnly || box.disabled || box.selectionStart === box.selectionEnd, onClick: () => { box.focus(); document.execCommand("cut"); } },
        { label: "복사", icon: "content_copy", disabled: box.selectionStart === box.selectionEnd, onClick: () => { box.focus(); document.execCommand("copy"); } },
        { label: "붙여넣기", icon: "content_paste", disabled: box.readOnly || box.disabled, onClick: async () => { try { const v = await navigator.clipboard.readText(); box.focus(); document.execCommand("insertText", false, v); } catch { toast("붙여넣기는 Ctrl+V 로 해 주세요", "warn"); } } },
        { label: "모두 선택", icon: "select_all", onClick: () => { box.focus(); box.select(); } },
      ] : [
        ...(sel ? [{ label: "복사", icon: "content_copy", onClick: () => navigator.clipboard.writeText(sel).catch(() => document.execCommand("copy")) }, "-" as const] : []),
        { label: "새 변환", icon: "add", onClick: () => go("/") },
        { label: "내 작업", icon: "list", onClick: () => go("/list") },
        { label: "설정", icon: "settings", onClick: () => go("/settings") },
        "-",
        { label: "새로고침", icon: "refresh", onClick: () => location.reload() },
      ];
      openRef.current({ ...e, clientX: e.clientX, clientY: e.clientY, target: document.body, defaultPrevented: false, preventDefault: () => {}, stopPropagation: () => {}, shiftKey: false } as unknown as React.MouseEvent, items);
    };
    const onKey = (e: KeyboardEvent) => {   // 소스 보기 · 개발자 도구
      const k = e.key.toLowerCase();
      if (e.key === "F12" || ((e.ctrlKey || e.metaKey) && (k === "u" && !(e.target as HTMLElement)?.closest?.("textarea, input") || (e.shiftKey && (k === "i" || k === "j" || k === "c"))))) {
        e.preventDefault(); e.stopPropagation();
      }
    };
    document.addEventListener("contextmenu", onCtx);
    window.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("contextmenu", onCtx); window.removeEventListener("keydown", onKey, true); };
  }, []);
  return node;
}

/** 설명글 — 문장이 끝나는 마침표마다 줄바꿈(사이트 공통 규칙, 사용자 2026-10-06). 문자열이 아니면 그대로 */
export function sent(v: ReactNode): ReactNode {
  if (typeof v !== "string") return v;
  const parts = v.split(/(?<=[.!?])\s+(?=\S)/).filter(Boolean);
  return parts.map((s, i) => <Fragment key={i}>{s}{i < parts.length - 1 && <br />}</Fragment>);
}

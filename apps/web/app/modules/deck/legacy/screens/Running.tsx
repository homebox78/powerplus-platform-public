import { pdGo } from "../nav";
import { useEffect, useState } from "react";
import { LiveDot } from "@/components/hb/live-status";
import { fileUrl, fmtSize, isDesign, usd, type Engine, type Job } from "../api";
import { clampProgress, hasMockup, isPlanPhase, stageIndex, stagesOf } from "../stages";
import { cn, fmtDur, JobHeader, Ms, parseTs, useContextMenu, sent } from "../ui";
import { useIsMobile } from "@/hooks/use-mobile";
import { PaneToggle, usePane } from "@/components/hb/work-space";
import { TipTicker } from "../TipTicker";

const TIPS: [string, string][] = [
  ["키메시지는 결론부터", "평가위원은 맨 위 한 줄만 읽고 넘어갑니다. '무엇을 하겠다'보다 '그래서 무엇이 좋아지는가'를 적으세요."],
  ["한 장에 한 가지", "한 장이 전하려는 것이 둘이면 둘 다 기억에 남지 않습니다. 나눌 수 있으면 나누세요."],
  ["숫자는 크게, 설명은 작게", "60%, 108MM 같은 수치는 그림보다 먼저 눈에 들어옵니다. 근거 수치를 앞에 세우세요."],
  ["강조색은 한 곳만", "분홍·빨강이 세 군데 이상이면 아무것도 강조되지 않습니다. 장마다 딱 한 곳."],
  ["시안에 핀을 꽂으세요", "고칠 곳을 눌러 의견을 남기고 '반영'으로 확정하면, 제작할 때 그 자리에 그대로 반영됩니다."],
  ["상자 안 여백이 품질", "카드 안 글이 한쪽으로 쏠리면 급하게 만든 장표로 보입니다. 좌우·상하 여백을 같게 맞춥니다."],
  ["8장씩 나눠서", "한 번에 8장까지가 가장 안정적입니다. 방향을 먼저 확인하고 늘리면 다시 만드는 비용이 줄어듭니다."],
  ["발표 대본까지", "장표가 완성되면 '발표 대본' 탭에서 노래방처럼 글자가 차오르는 연습 화면을 만들 수 있습니다."],
];

type PlanSlide = { n: number; section?: string; title?: string; message?: string; content?: string; layout?: string };

/** 기획 미리 보기 — 기획이 나오면 엔진이 plan.json 을 먼저 올린다. 시안을 기다리는 동안 제목·목차·섹션별 내용을 읽고 고칠 곳을 생각해 둘 수 있게 */
function PlanPreview({ job }: { job: Job }) {
  const f = (job.files?.mockup ?? []).find((x) => x.name === "plan.json");
  const [plan, setPlan] = useState<{ title?: string; slides: PlanSlide[] } | null>(null);
  useEffect(() => {
    if (!f) return;
    let off = false;
    fetch(fileUrl(job.id, "mockup", f.name) + `&v=${f.ts ?? 0}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!off && d && Array.isArray(d.slides)) setPlan(d); })
      .catch(() => {});
    return () => { off = true; };
  }, [job.id, f?.ts]);
  const [more, setMore] = useState<number[]>([]);   // 훅은 아래 return null 보다 앞에 — 기획이 올라오는 순간 훅 개수가 바뀌면 React #310
  if (!f || !plan?.slides?.length) return null;
  const clean = (t?: string) => String(t ?? "").replace(/\*\*/g, "").trim();
  const lines = (t?: string) => clean(t).split("\n").map((l) => l.replace(/^#+\s*/, "").trim()).filter((l) => l && !l.includes("보강 필요"));
  // 섹션(장) 묶음 — 기획의 section 앞부분(“Ⅰ. 사업의 이해 · 현황” → “Ⅰ. 사업의 이해”)
  const groups: { name: string; slides: PlanSlide[] }[] = [];
  for (const sl of plan.slides) {
    const name = clean(sl.section).split(" · ")[0]!.trim() || "본문";
    const g = groups[groups.length - 1];
    if (g && g.name === name) g.slides.push(sl); else groups.push({ name, slides: [sl] });
  }
  return (
    <div className="pt-5 border-t border-line-soft">
      <div className="flex items-baseline gap-3 mb-1">
        <span className="font-bold">기획 미리 보기</span>
        <span className="text-[13px] text-dim">시안을 기다리는 동안 읽어 보고, 확인 단계에서 고칠 곳을 생각해 두세요</span>
      </div>
      <div className="rounded-md border border-line bg-panel p-5 mt-3">
        <div className="text-[12.5px] font-bold text-orange-d">제목</div>
        <div className="text-[19px] font-bold leading-snug mt-0.5">{clean(plan.title) || job.title}</div>
        <div className="text-[12.5px] font-bold text-orange-d mt-4">목차 · {plan.slides.length}장</div>
        <ol className="mt-1.5 grid gap-x-8 gap-y-1" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(260px,100%),1fr))" }}>
          {groups.map((g, k) => (
            <li key={k} className="flex items-baseline gap-2 min-w-0">
              <span className="font-bold text-ink2 flex-none">{String(k + 1).padStart(2, "0")}</span>
              <span className="font-semibold truncate">{g.name}</span>
              <span className="text-[12.5px] text-dim flex-none">{g.slides[0]!.n === g.slides[g.slides.length - 1]!.n ? `${g.slides[0]!.n}쪽` : `${g.slides[0]!.n}–${g.slides[g.slides.length - 1]!.n}쪽`}</span>
            </li>
          ))}
        </ol>
      </div>
      {groups.map((g, k) => (
        <div key={k} className="mt-5">
          <div className="flex items-baseline gap-2 mb-2">
            <span className="font-bold text-orange-d">{String(k + 1).padStart(2, "0")}</span>
            <span className="font-bold">{g.name}</span>
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(320px,100%),1fr))" }}>
            {g.slides.map((sl) => (
              <div key={sl.n} className="rounded-md border border-line bg-panel p-4 fadein">
                <div className="flex items-center gap-2 text-[12.5px] text-dim mb-1.5 min-w-0">
                  <span className="flex-none font-bold text-orange-d">{sl.n}쪽</span>
                  {clean(sl.section).includes(" · ") && <span className="truncate">{clean(sl.section).split(" · ").slice(1).join(" · ").trim()}</span>}
                </div>
                <div className="font-bold leading-snug">{clean(sl.title)}</div>
                {sl.message && <div className="text-[13px] text-ink2 mt-1 leading-snug">{clean(sl.message)}</div>}
                {lines(sl.content).length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-[12.5px] text-dim leading-snug">
                    {(more.includes(sl.n) ? lines(sl.content) : lines(sl.content).slice(0, 6)).map((l, i) => <li key={i} className="truncate" title={l}>{l}</li>)}
                  </ul>
                )}
                {lines(sl.content).length > 6 && (
                  <button type="button" className="mt-1.5 text-[12.5px] font-semibold text-orange-d hover:underline" aria-expanded={more.includes(sl.n)}
                    onClick={() => setMore((m) => m.includes(sl.n) ? m.filter((n) => n !== sl.n) : [...m, sl.n])}>
                    {more.includes(sl.n) ? "접기" : `더 보기 (${lines(sl.content).length - 6}줄)`}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** 기다리는 동안 — 장표 팁이 7초마다 넘어간다(멈출 수 있음). 점으로 바로 가기 */
function Tips({ plan, mock }: { plan: boolean; mock: boolean }) {
  const [i, setI] = useState(() => Math.floor(Math.random() * TIPS.length));
  const [play, setPlay] = useState(true);
  useEffect(() => {
    if (!play) return;
    const t = setInterval(() => setI((v) => (v + 1) % TIPS.length), 7000);
    return () => clearInterval(t);
  }, [play]);
  const [t, d] = TIPS[i]!;
  return (
    <div className="w-full text-left p-4 rounded-md border-0 bg-panel flex items-center gap-4">
      <span className="min-w-0 flex-1 flex flex-col gap-1.5 fadein" key={i} role="status">
        <span className="text-[12.5px] font-bold text-orange-d">{plan ? (mock ? "시안을 만드는 동안" : "기획을 만드는 동안") : "장표를 만드는 동안"} · 장표 팁 {i + 1}/{TIPS.length}</span>
        <span className="text-[15px] font-bold">{t}</span>
        <span className="text-[14px] text-ink2 leading-[1.55] break-keep">{sent(d)}</span>
      </span>
      <span className="flex items-center gap-2 flex-none">
        <span className="flex gap-1" role="group" aria-label="팁 바로 가기">
          {TIPS.map((_, k) => <button key={k} type="button" onClick={() => setI(k)} title={`팁 ${k + 1}`} aria-label={`팁 ${k + 1}`} aria-current={k === i}
            className="w-4 h-4 grid place-items-center"><i className={cn("w-1.5 h-1.5 rounded-full", k === i ? "bg-orange" : "bg-line")} /></button>)}
        </span>
        <button type="button" onClick={() => setPlay((v) => !v)} title={play ? "자동 넘기기 멈추기" : "자동 넘기기 계속"} aria-label={play ? "자동 넘기기 멈추기" : "자동 넘기기 계속"} aria-pressed={play}
          className="btn-icon !w-8 !h-8"><Ms name={play ? "pause" : "play_arrow"} size={18} /></button>
        <button type="button" onClick={() => setI((v) => (v + 1) % TIPS.length)} title="다음 팁" aria-label="다음 팁" className="btn-icon !w-8 !h-8"><Ms name="skip_next" size={18} /></button>
      </span>
    </div>
  );
}

const agoText = (s: number) => (s < 60 ? "방금" : s < 3600 ? `${Math.floor(s / 60)}분 전` : `${Math.floor(s / 3600)}시간 전`);

/** 2·3단계 — 대기 / 변환 중. 단계·진행률·작업 기록·렌더가 실시간으로 올라온다. */
/** onCancel·onStart 는 작업 주인일 때만 온다 — 공유받은 사람 화면에는 버튼이 없다(중4, 2026-10-10) */
export function Running({ job, engine, onCancel, onStart }: { job: Job; engine: Engine | null; onCancel?: () => void; onNew: () => void; onStart?: () => void }) {
  const [side, setSide] = usePane("deck-running-side");
  const narrow = useIsMobile();
  const hold = job.status === "hold";
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const queued = job.status === "queued" || hold;
  const plan = isPlanPhase(job);
  const design = isDesign(job);
  const STAGES = stagesOf(job);
  const cur = stageIndex(job.stage, STAGES);
  const started = parseTs(job.started_at);
  const elapsed = started ? (now - started.getTime()) / 1000 : 0;
  // 기획·시안 단계는 나오는 시안을, 제작 단계는 시안(before)·작업 중 렌더(live)를 보여 준다
  const before = plan ? (job.files?.mockup ?? []).filter((f) => f.slide) : (job.files?.before ?? []);
  const events = (job.events ?? []).slice(-80).reverse();
  // 장마다 작업 중 렌더(live)가 있으면 그것, 없으면 원본. live 는 같은 이름으로 덮어써지므로 ts 로 캐시를 깬다.
  const live = job.files?.live ?? [];
  const liveTs = live.reduce((m, f) => Math.max(m, f.ts ?? 0), 0);
  const slides = before.map((b) => {
    const l = live.find((x) => x.slide === b.slide);
    return { n: b.slide ?? 0, live: !!l, url: l ? fileUrl(job.id, "live", l.name) + `&v=${l.ts ?? 0}` : fileUrl(job.id, plan ? "mockup" : "before", b.name) + `&v=${b.ts ?? 0}` };
  });
  // 남은 시간 = 지금까지 걸린 시간 × 남은 진행률 ÷ 지난 진행률. 앞 단계(문서 읽기·실측)는 진행률이 낮게 잡혀 있어 10% 전엔 내지 않는다.
  const p = clampProgress(job.stage, job.progress, plan, design && !plan);
  const eta = !queued && started && p >= 10 && p < 100 ? Math.max(60, (elapsed * (100 - p)) / p) : null;
  const draft = job.files?.draft?.[0];
  const [pick, setPick] = useState<number | null>(null);
  const sel = slides.find((s) => s.n === pick) ?? slides.find((s) => s.live) ?? slides[0];
  const docs = job.docs?.length ?? 0;

  // 머리줄 작업 정보 — 장 수 · 크기 · 맥락 자료 · 지금까지 비용
  const meta = [
    job.slides ? `${job.slides}장` : null,
    job.size > 0 ? fmtSize(job.size) : "내용 입력",
    docs > 0 && !hold ? `맥락 자료 ${docs}개 반영` : null,
    design && (job.spent_usd ?? 0) > 0 ? `AI 비용 ${usd(job.spent_usd, 3)}${job.budget_usd != null ? ` / ${usd(job.budget_usd)}` : ""}` : null,
  ].filter(Boolean).join(" · ");

  // 오른쪽 클릭 — 멈추기 · 내 작업
  const rmenu = useContextMenu();
  return (
    <>
      {rmenu.node}
      <JobHeader job={job} meta={meta} actions={<>
        {!plan && draft && (
          <a className="btn-back" href={fileUrl(job.id, "draft", draft.name, true) + `&v=${draft.ts ?? 0}`}
            title={draft.ts ? agoText(now / 1000 - draft.ts) + " 올라온 판" : ""}>
            <Ms name="download" size={19} />지금까지 받기 <span className="font-medium text-dim">({fmtSize(draft.size)}{draft.ts ? ` · ${agoText(now / 1000 - draft.ts)}` : ""})</span>
          </a>
        )}
        {onCancel && (
          <button className="btn-back" disabled={job.cancel_requested} onClick={onCancel}>
            <Ms name={queued ? "close" : "pause"} size={19} />{hold ? "취소" : queued ? "대기 취소" : "멈추기"}
          </button>
        )}
        {hold && onStart && <><span className="vsep" /><button className="btn-next" onClick={onStart}><Ms name="play_arrow" size={19} />검토 시작</button></>}
      </>} />

      <div className="flex-1 min-h-0 grid" style={{ gridTemplateColumns: narrow ? "minmax(0,1fr)" : `minmax(0,1fr) ${side ? "320px" : "44px"}` }} onContextMenu={(e) => rmenu.open(e, [
        ...(onCancel ? [{ label: hold ? "취소" : job.status === "queued" ? "대기 취소" : "멈추기", icon: job.status === "queued" || hold ? "close" : "pause", disabled: !!job.cancel_requested, onClick: onCancel }, "-" as const] : []),
        { label: "내 작업", icon: "list", onClick: () => { pdGo("/list"); } },
      ])}>
        <div className="min-w-0 overflow-y-auto overflow-x-hidden scroll-thin px-4 py-5 lg:px-10 lg:py-8">
          <div className="w-full flex flex-col gap-5">
            {/* 제목 · 경과 · 남은 시간 */}
            <div className="flex items-end gap-6">
              <div className="min-w-0 flex-1">
                <div className="text-[21px] font-bold tracking-[-0.02em]">
                  {hold ? "시작 대기 — 검토 시작을 누르면 진행합니다" : queued ? "변환 차례를 기다리는 중" : job.cancel_requested ? "멈추는 중" : plan ? "기획하고 시안을 만드는 중" : design ? "시안대로 장표를 만드는 중" : job.phase === "pilot" ? "한 장 시안을 만드는 중" : "디자인을 입히는 중"}
                </div>
                <div className="text-dim mt-1 truncate">
                  {hold ? "아직 대기열에 넣지 않았습니다 — 자료를 더 올린 뒤 시작할 수 있습니다" : queued ? (job.queue_pos ? `대기 ${job.queue_pos}번째` : "대기열에 있습니다") : cur >= 0 ? `${STAGES[cur]!.label ?? STAGES[cur]!.name} — ${STAGES[cur]!.desc}` : (job.stage ?? "준비")}
                </div>
                {plan && !job.cancel_requested && <TipTicker />}
              </div>
              {!queued && <>
                <div className="text-right flex-none">
                  <div className="text-[12.5px] text-dim whitespace-nowrap">경과</div>
                  <div className="font-bold text-[16px] whitespace-nowrap">{fmtDur(elapsed)}</div>
                </div>
                <div className="text-right flex-none">
                  <div className="text-[12.5px] text-dim whitespace-nowrap">남은 시간(추정){eta !== null && <span className="font-bold text-orange-d"> · {new Date(now + eta * 1000).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 완료 예상</span>}</div>
                  {eta === null ? <div className="font-bold text-[16px] text-faint whitespace-nowrap">계산 중</div> : <div className="font-bold text-[16px] whitespace-nowrap">약 {fmtDur(eta)}</div>}
                </div>
              </>}
            </div>

            {queued ? (
              /* 대기 · 자료 올리는 중 안내 */
              <div className="rounded-md border border-line px-4 py-4 flex items-center gap-3">
                <span className="sec-ic"><Ms name={hold ? "upload_file" : "schedule"} size={18} /></span>
                <div className="min-w-0 flex-1 text-[14px] text-ink2 leading-[1.6] break-keep">
                  {hold ? <>시작 대기 중입니다. 맥락 자료 <b className="text-ink">{docs}개</b>가 붙어 있습니다. {onStart ? <>오른쪽 위 <b className="text-ink">검토 시작</b>을 누르면 지금 자료로 진행합니다.</> : <>작업 주인이 검토 시작을 누르면 진행합니다.</>}</> : <>
                    {job.queue_pos ? <>대기 <b className="text-ink">{job.queue_pos}번째</b>입니다. </> : null}
                    {engine?.online ? "앞 작업이 끝나면 바로 시작합니다." : "제작 서버가 멈춰 있습니다. 다시 켜지는 대로 자동으로 시작합니다."}
                  </>}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="relative flex-1 pt-[33px]">
                  {/* 진행률 끝을 따라 걷는 강아지(web/public/dog.svg — 제자리 걷기 애니메이션, 발이 막대 위에 닿게) */}
                  <img src={`${import.meta.env.BASE_URL}dog.svg`} alt="" aria-hidden
                    className="absolute top-0 w-[36px] h-[33px] origin-bottom pointer-events-none transition-[left,transform] duration-700"
                    style={{ left: Math.max(2, Math.min(98, p)) + "%", transform: `translateX(-50%) scale(${1 + 0.1 * Math.max(0, Math.min(100, p)) / 100})` }} />
                  <div className="pbar live"><i style={{ width: Math.max(2, p) + "%" }} /></div>
                </div>
                <span className="flex-none font-extrabold text-[24px] leading-none tracking-[-0.02em] text-orange-d">{p}<span className="text-[15px] font-bold">%</span></span>
              </div>
            )}

            {/* 단계 목록 — 끝난 단계 ✓, 지금 단계 강조. 단계가 많으면 두 줄로 */}
            <div className={cn("grid gap-px rounded-md border border-line bg-line-soft overflow-hidden", STAGES.length > 6 && "grid-cols-2")}>
              {STAGES.map((s, i) => {
                const done = !queued && i < cur, on = !queued && i === cur;
                return (
                  <div key={s.name} className={cn("flex items-center gap-3 px-4 py-3.5 min-w-0", on ? "bg-orange-tint" : "bg-white")}>
                    <span className={cn("w-[22px] h-[22px] rounded-full grid place-items-center flex-none text-[12px] font-bold", done ? "bg-[var(--color-ok-soft)] text-ok" : on ? "bg-orange text-white" : "bg-track text-faint")}>
                      {done ? <Ms name="check" size={15} /> : on ? <i className="w-2 h-2 rounded-full bg-white pulse" /> : i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className={cn("font-bold truncate", on ? "text-orange-d" : done ? "text-ink" : "text-dim")}>{s.label ?? s.name}</div>
                      <div className="text-[13px] text-dim mt-0.5 truncate" title={s.desc}>{s.desc}</div>
                    </div>
                    <span className={cn("flex-none whitespace-nowrap text-[13px] font-semibold", done ? "text-ok" : on ? "text-orange-d" : "text-faint")}>{done ? "완료" : on ? "진행 중" : "대기"}</span>
                  </div>
                );
              })}
            </div>

            {!queued && <Tips plan={plan} mock={hasMockup(job)} />}

            {/* 안내 한 줄 + 엔진 상태 */}
            <div className="flex items-center gap-4 text-[13px] text-faint">
              <span className="min-w-0 flex-1 truncate">
                창을 닫아도 계속 진행됩니다.
                {!queued && (plan ? " 시안이 다 나오면 장별로 확인·수정합니다." : !draft ? " 첫 판이 저장되면 머리줄에 '지금까지 받기'가 생깁니다." : "")}
              </span>
              {engine && (
                <span className="flex-none flex items-center gap-2 text-ink2 whitespace-nowrap" title={engine.workers.map((w) => w.name).join(", ")}>
                  <LiveDot state={engine.online ? "ok" : "off"} />
                  {engine.online ? "제작 서버 정상" : "제작 서버 멈춤 — 올려 두면 다시 켜질 때 시작합니다"}
                  {engine.queued + engine.running > 0 && <span className="text-dim">· 진행 {engine.running} · 대기 {engine.queued}</span>}
                </span>
              )}
            </div>

            {plan && <PlanPreview job={job} />}

            {/* 미리보기 — 시안이 나오는 대로, 제작 중에는 작업 중 렌더 */}
            {slides.length > 0 ? (
              <div className="pt-5 border-t border-line-soft">
                <div className="flex items-center gap-3 mb-3 min-w-0">
                  <span className="font-bold whitespace-nowrap flex-none">{liveTs ? "작업 중인 장표" : plan ? `시안 ${before.length}장 (나오는 대로)` : `${design ? "시안" : "원본"} ${before.length}장`}</span>
                  {liveTs ? (
                    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-orange-d whitespace-nowrap flex-none">
                      <i className="w-1.5 h-1.5 rounded-full bg-orange pulse" />{agoText(now / 1000 - liveTs)} 갱신
                    </span>
                  ) : (
                    <span className="text-[13px] text-dim truncate min-w-0">엔진이 장표를 렌더하면 여기에 작업 중 모습이 올라옵니다</span>
                  )}
                </div>
                  {sel && (
                    <div className="relative mx-auto rounded-md border border-line bg-panel overflow-hidden" style={{ maxWidth: "calc((100vh - 220px) * 16 / 9)" }}>
                      <img key={sel.url} src={sel.url} alt={`${sel.n}쪽`} className="w-full aspect-[16/9] object-contain fadein" />
                      <span className="absolute left-2.5 top-2.5 text-[12px] font-bold px-2 py-[3px] rounded-md bg-ink/75 text-white whitespace-nowrap">
                        {sel.n}쪽 · {sel.live ? "작업 중" : plan || design ? "시안" : "원본"}
                      </span>
                    </div>
                  )}
                  <div className="mt-2.5 grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
                    {slides.map((s) => (
                      <button key={s.n} type="button" onClick={() => setPick(s.n)} title={`${s.n}쪽`} aria-label={`${s.n}쪽 보기`} aria-pressed={s.n === sel?.n}
                        className={cn("relative p-0 rounded-md overflow-hidden border-2 bg-panel", s.n === sel?.n ? "border-orange" : "border-transparent hover:border-line")}>
                        <img src={s.url} alt={`${s.n}쪽`} loading="lazy" className="block w-full aspect-[16/9] object-cover" />
                        {s.live && <i className="absolute right-1 top-1 w-1.5 h-1.5 rounded-full bg-orange" />}
                      </button>
                    ))}
                  </div>
              </div>
            ) : (
              <div className="pt-5 border-t border-line-soft">
                <div className="rounded-md border border-dashed border-line bg-panel px-4 py-8 text-center text-[13.5px] text-dim leading-[1.6]" role="status">
                  {queued ? "엔진이 시작하면 원본·시안·작업 중 모습이 여기에 올라옵니다." : "엔진이 장표를 렌더하면 여기에 작업 중 모습이 올라옵니다."}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 작업 기록 (접으면 44px 레일 — 2026-10-07 공간 확보) */}
        {!side ? <aside className={cn("min-w-0 min-h-0 flex flex-col items-center gap-2 border-line bg-panel pt-2.5", narrow ? "border-t pb-2.5" : "border-l")}><PaneToggle open={side} onToggle={setSide} label="작업 기록" side="right" /></aside> :
        <aside className={cn("relative min-w-0 min-h-0 border-line bg-panel", narrow ? "border-t" : "border-l")}>
          {/* 높이는 왼쪽 본문이 정한다 — 기록이 그보다 길 때만 이 칸 안에서 세로 스크롤(사용자 2026-10-07) */}
          <div className={narrow ? "flex flex-col" : "absolute inset-0 flex flex-col"}>
          <div className="head panel !bg-panel">
            <span className="font-bold">작업 기록</span>
            {events.length > 0 && <span className="text-[13px] text-dim">{events.length}</span>}
            <PaneToggle open={side} onToggle={setSide} label="작업 기록" side="right" className="ml-auto" />
          </div>
          <div className="pd-keep-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden scroll-thin px-4 pb-4">
            {events.length === 0 && <div className="py-4 text-[13px] text-faint">{queued ? "시작하면 여기에 기록이 올라옵니다." : "아직 기록이 없습니다."}</div>}
            {events.map((e) => (
              <div key={e.id} className="py-2.5 border-b border-line-soft fadein">
                {e.kind === "think" && <div className="text-[12px] font-bold text-orange-d mb-0.5">엔진 메모</div>}
                <div className={cn("text-[13px] leading-[1.5] break-keep [overflow-wrap:anywhere] whitespace-pre-line",
                  e.kind === "error" ? "text-[var(--color-warn)] font-semibold" : e.kind === "warn" ? "text-orange-d font-semibold" : e.kind === "done" ? "text-ok font-semibold" : e.kind === "think" ? "text-ink2" : "text-[var(--color-ink)]")}>{e.message}</div>
                <div className="font-mono text-[12px] text-faint mt-0.5">{parseTs(e.ts)?.toTimeString().slice(0, 8)}</div>
              </div>
            ))}
          </div>
          </div>
        </aside>}
      </div>
    </>
  );
}

// 겹쳐서 보기(원본·시안 비교 손잡이) — 출처: powerDeck web/src/screens/Review.tsx (옛 화면 그대로 이식, eslint.config.js legacy 구역).
import { useRef, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { PaneToggle, usePane } from "@/components/hb/work-space";
import { api, fileUrl, fmtSize, type Job } from "../api";
import { cn, JobHeader, Ms, ask, useToastOn } from "../ui";

/** 겹쳐서 보기 — 가운데 손잡이를 끌어 원본과 시안을 비교한다. 한쪽만 있으면 그 그림만 */
function Overlay({ before, after }: { before?: string; after?: string }) {
  const [x, setX] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const drag = (clientX: number) => {
    const r = box.current!.getBoundingClientRect();
    setX(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  };
  const badge = "absolute top-3 h-6 px-2.5 rounded-full bg-black/55 text-white text-[12px] font-bold flex items-center whitespace-nowrap";
  if (!before || !after) return <img src={after ?? before} alt={after ? "시안" : "원본"} className="block w-full aspect-[16/9] object-contain rounded-md border border-line bg-white" />;
  return (
    <div ref={box} className="relative w-full aspect-[16/9] rounded-md border border-line overflow-hidden select-none touch-none bg-white cursor-ew-resize"
      tabIndex={0} role="slider" aria-label="원본·시안 비교" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(x)}
      onKeyDown={(e) => {
        const st = e.shiftKey ? 10 : 2;
        if (e.key === "ArrowLeft") { e.preventDefault(); setX((v) => Math.max(0, v - st)); }
        else if (e.key === "ArrowRight") { e.preventDefault(); setX((v) => Math.min(100, v + st)); }
        else if (e.key === "Home") { e.preventDefault(); setX(0); }
        else if (e.key === "End") { e.preventDefault(); setX(100); }
      }}
      onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag(e.clientX); }}
      onPointerMove={(e) => e.buttons && drag(e.clientX)}>
      <img src={after} alt="시안" className="absolute inset-0 w-full h-full object-contain" draggable={false} />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - x}% 0 0)` }}>
        <img src={before} alt="원본" className="absolute inset-0 w-full h-full object-contain bg-white" draggable={false} />
      </div>
      <div className="absolute inset-y-0 pointer-events-none" style={{ left: `${x}%` }}>
        <div className="absolute inset-y-0 -ml-px w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,.15)]" />
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-white shadow-lg grid place-items-center text-orange-d">
          <Ms name="compare" size={20} />
        </div>
      </div>
      <span className={badge + " left-3 pointer-events-none"}>원본</span>
      <span className={badge + " right-3 pointer-events-none"}>시안</span>
    </div>
  );
}

/**
 * 한 장 시안 확인 — 대표 장 하나를 먼저 마감해 보여 주고, 사용자가 보고 의견을 준 뒤 나머지를 진행한다.
 * 15~30분 기다렸다가 방향이 틀린 걸 아는 대신, 10분 안에 방향을 잡는다.
 *  - 이대로 진행: 시안의 결정(톤·에셋 세트·도식 처리)으로 나머지 장 (머리줄 오른쪽 주요 버튼)
 *  - 의견 반영해 진행: 의견을 더해 나머지 장(의견은 누적되어 끝까지 지킨다)
 *  - 이 장 다시: 의견을 반영해 시안 한 장을 다시 (의견 칸 아래)
 */
export function Review({ job, onChange }: { job: Job; onChange: (j: Job) => void; onNew: () => void }) {
  const [side, setSide] = usePane("deck-review-side");
  const narrow = useIsMobile();
  const [fb, setFb] = useState("");
  const [busy, setBusy] = useState<"continue" | "redo" | "cancel" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useToastOn(err);
  const n = job.pilot_slide ?? job.report?.pilot_slide ?? null;
  const b = job.files?.before?.find((f) => f.slide === n);
  const a = job.files?.after?.find((f) => f.slide === n);
  const pilot = job.files?.pilot?.find((f) => f.name === "pilot.pptx");
  const rep = job.report;
  const assets = rep?.assets_used ?? [];
  const prev = (job.feedback ?? "").trim();

  const send = async (mode: "continue" | "redo") => {
    setErr(null);
    setBusy(mode);
    try {
      onChange(await api<Job>(`/jobs/${job.id}/approve`, { method: "POST", body: JSON.stringify({ mode, feedback: fb.trim() }) }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const cancel = async () => {
    if (!(await ask("그만두시겠습니까? 지금까지 만든 시안은 버려집니다.", { title: "그만두기", ok: "그만두기", danger: true }))) return;
    setErr(null);
    setBusy("cancel");
    try {
      onChange(await api<Job>(`/jobs/${job.id}/cancel`, { method: "POST" }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const meta = [`한 장 시안${n ? ` ${n}쪽` : ""}`, job.slides ? `전체 ${job.slides}장` : null, job.size > 0 ? fmtSize(job.size) : null].filter(Boolean).join(" · ");

  return (
    <>
      <JobHeader job={job} meta={meta} actions={<>
        <button className="btn-danger" disabled={!!busy} onClick={cancel}><Ms name="close" size={20} />그만두기</button>
        <span className="vsep" />
        {pilot && (
          <a className="btn-back" href={fileUrl(job.id, "pilot", "pilot.pptx", true)} title="시안 파일 받기 (pilot.pptx)">
            <Ms name="download" size={19} />시안 파일 <span className="font-medium text-dim">({fmtSize(pilot.size)})</span>
          </a>
        )}
        <button className="btn-next" disabled={!!busy} onClick={() => send("continue")}>
          <Ms name="play_arrow" size={19} />{busy === "continue" ? "넘기는 중…" : fb.trim() ? "의견 반영해 나머지 장 진행" : "이대로 나머지 장 진행"}
        </button>
      </>} />

      <div className="flex-1 min-h-0 grid" style={{ gridTemplateColumns: narrow ? "minmax(0,1fr)" : `minmax(0,1fr) ${side ? "320px" : "44px"}` }}>
        {/* 가운데 — 원본과 시안 겹쳐 보기 */}
        <div className="min-w-0 min-h-0 flex flex-col">
          <div className="head">
            <span className="font-bold flex-none">한 장 시안{n ? ` · ${n}쪽` : ""}</span>
            <span className="text-[13px] text-dim truncate min-w-0">{b && a ? "가운데 손잡이를 끌어 원본과 시안을 비교하세요" : "이 방향으로 나머지 장을 진행할지 확인하세요"}</span>
          </div>
          <div className="flex-1 min-h-0 overflow-auto scroll-thin bg-panel p-6 grid place-items-center">
            {b || a ? (
              <div className="w-full" style={{ maxWidth: "calc((100vh - 200px) * 16 / 9)" }}>
                <Overlay before={b && fileUrl(job.id, "before", b.name)} after={a && fileUrl(job.id, "after", a.name)} />
              </div>
            ) : (
              <div className="text-[14px] text-dim text-center leading-[1.6]">시안 렌더를 불러오지 못했습니다.<br />{pilot
                ? <><a className="text-orange-d font-semibold hover:underline" href={fileUrl(job.id, "pilot", "pilot.pptx", true)}>시안 파일(pptx)로 확인</a>해 주세요.</>
                : "머리줄의 「시안 파일」을 내려받아 확인해 주세요."}</div>
            )}
          </div>
        </div>

        {/* 오른쪽 — 시안 설명 · 의견 (접으면 44px 레일 — 2026-10-07 공간 확보) */}
        {!side ? <aside className={cn("min-w-0 min-h-0 flex flex-col items-center gap-2 border-line bg-panel pt-2.5", narrow ? "border-t pb-2.5" : "border-l")}><PaneToggle open={side} onToggle={setSide} label="시안 설명·의견" side="right" /></aside> :
        <aside className={cn("min-w-0 min-h-0 flex flex-col border-line bg-white", narrow ? "border-t" : "border-l")}>
          <div className="head panel"><span className="font-bold truncate min-w-0 flex-1">이 방향으로 나머지 장을 진행할까요?</span><PaneToggle open={side} onToggle={setSide} label="시안 설명·의견" side="right" /></div>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scroll-thin p-4 flex flex-col gap-4">
            {rep?.summary && <div className="text-[14px] text-ink2 leading-[1.6] break-keep [overflow-wrap:anywhere]">{rep.summary}</div>}

            {(rep?.changes?.length ?? 0) > 0 && (
              <div>
                <div className="text-[13px] font-bold text-dim mb-1.5">이 장에서 바꾼 것</div>
                {rep!.changes!.slice(0, 8).map((c) => (
                  <div key={c} className="flex gap-1.5 py-0.5 text-[13px] text-ink2 leading-[1.55] break-keep [overflow-wrap:anywhere]">
                    <Ms name="check" size={17} className="mt-[2px] text-ok" />{c}
                  </div>
                ))}
              </div>
            )}
            {assets.length > 0 && (
              <div className="text-[13px] text-ink2">powerPlus 에셋 <b className="text-ink">{assets.length}개</b>를 넣었습니다.</div>
            )}

            {prev && (
              <div className="rounded-md bg-panel border border-line px-3.5 py-2.5">
                <div className="text-[12.5px] font-bold text-dim mb-1">앞서 준 의견(계속 반영됨)</div>
                <div className="text-[13px] text-ink2 whitespace-pre-line leading-[1.6] [overflow-wrap:anywhere]">{prev}</div>
              </div>
            )}
          </div>

          {/* 의견 칸 — 이 장 다시 만들기는 칸 아래 가로 전체 폭 */}
          <div className="flex-none border-t border-line p-4 flex flex-col gap-2.5">
            <label className="text-[13px] font-bold text-ink2" htmlFor="pd-review-fb">의견 <span className="font-medium text-dim">(없으면 비워 두세요)</span></label>
            <textarea id="pd-review-fb" className="field" rows={5} maxLength={3000} value={fb} onChange={(e) => setFb(e.target.value)}
              placeholder={"예: 아이콘은 더 단순한 선 아이콘으로 / 표 머리 색을 남색으로 / 오른쪽 도식은 원본 그대로 두기"} />
            {err && <div className="text-[13px] font-semibold text-[var(--color-warn)] [overflow-wrap:anywhere]">{err}</div>}
            <button className="btn-dark w-full !h-10" disabled={!!busy || !fb.trim()} onClick={() => send("redo")}
              title={fb.trim() ? "" : "의견을 적으면 이 장을 다시 만듭니다"}>
              <Ms name="refresh" size={19} />{busy === "redo" ? "올리는 중…" : "의견 반영해 이 장 다시"}
            </button>
            <div className="text-[12.5px] text-faint leading-[1.5] break-keep">의견을 적고 머리줄의 진행 버튼을 누르면 의견을 반영해 나머지 장을 만듭니다.</div>
          </div>
        </aside>}
      </div>
    </>
  );
}

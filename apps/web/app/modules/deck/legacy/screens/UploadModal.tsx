// 올리기 진행 창 — 출처: powerDeck web/src/screens/UploadModal.tsx (옛 화면 그대로 이식, eslint.config.js legacy 구역).
import { fmtSize, type UploadProgress } from "../api";
import { cn, fmtDur, Ms } from "../ui";

/** 올리기 단계 한 줄 — state: 끝남 / 지금 / 아직. p 는 지금 올리는 파일의 실제 진행(조각 업로드) */
export type UpStep = { key: string; label: string; size?: number; state: "done" | "cur" | "todo"; p?: UploadProgress | null };

/* index.css 를 고치지 않으려고 이 모달의 움직임은 여기에 둔다 — 종이가 점선을 따라 서버로, 지금 단계 원의 맥박 */
const CSS = `
@keyframes pdu-fly { 0% { transform: translate(0,0) rotate(-6deg); opacity: 0; } 12% { opacity: 1; } 88% { opacity: 1; } 100% { transform: translate(calc(100cqw - 134px),0) rotate(6deg); opacity: 0; } }
@keyframes pdu-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(0,0,0,.35); } 50% { box-shadow: 0 0 0 6px rgba(0,0,0,0); } }
.pdu-fly { opacity: 0; animation: pdu-fly 1.8s ease-in-out infinite; }
.pdu-pulse { animation: pdu-pulse 1.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .pdu-fly { display: none; } .pdu-pulse { animation: none; } }
`;

/** 문서 → 서버로 종이 3장이 날아간다. 다 올리면 서버 칸이 초록 체크 */
function Flight({ done }: { done: boolean }) {
  const tile = "relative z-[1] w-[52px] h-[52px] rounded-field grid place-items-center flex-none";
  return (
    <div className="relative h-[52px] flex items-center justify-between" style={{ containerType: "inline-size" }} aria-hidden>
      <div className={cn(tile, "bg-orange-soft text-orange")}><Ms name="description" size={27} /></div>
      <div className="absolute left-16 right-16 top-1/2" style={{ borderTop: `1.5px ${done ? "solid" : "dashed"} var(--color-orange-line)` }} />
      {!done && [0, 1, 2].map((k) => (
        <div key={k} className="pdu-fly absolute left-14 top-3 w-[22px] h-7 rounded-md bg-white shadow-[0_2px_6px_rgba(0,0,0,.2)]" style={{ border: "1.5px solid var(--color-point)", animationDelay: `${k * 0.6}s` }}>
          <i className="block mt-1.5 mx-1 h-0.5 rounded-md bg-orange-line" /><i className="block mt-[3px] mx-1 w-[60%] h-0.5 rounded-md bg-orange-line" />
        </div>
      ))}
      <div className={cn(tile, done ? "bg-ok-soft text-ok pop" : "bg-orange-soft text-orange")}><Ms name={done ? "check" : "dns"} size={27} /></div>
    </div>
  );
}

/**
 * 올리기 모달 — 퍼센트 + 진행 막대, 날아가는 종이, 단계(작업 만들기 → 파일 올리기 → 기획 시작) + 파일별 진행 막대, 「멈추기」.
 * 진행 값은 모두 실제 업로드에서 온다(Upload.tsx 의 start).
 */
export function UploadModal({ heading, title, pct, steps, onStop }: { heading: string; title: string; pct: number; steps: UpStep[]; onStop: () => void }) {
  const done = steps.length > 0 && steps.every((s) => s.state === "done");
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-8 bg-[rgba(17,17,17,.45)] backdrop-blur-[3px] fadein" role="dialog" aria-modal aria-label={heading}>
      <style>{CSS}</style>
      <div className="w-full max-w-[560px] max-h-full flex flex-col bg-white rounded-field shadow-[0_24px_64px_rgba(17,17,17,.28)] overflow-hidden">
        <div className="flex-none px-[26px] pt-6 pb-5 border-b border-line-soft flex flex-col gap-[18px]">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-md bg-orange-soft text-orange grid place-items-center flex-none"><Ms name="cloud_upload" size={23} /></div>
            <div className="flex-1 min-w-0">
              <div className="text-[17px] font-bold whitespace-nowrap truncate">{heading}</div>
              <div className="text-[13.5px] text-dim mt-[3px] truncate">{title}</div>
            </div>
            <div className="text-[27px] font-extrabold tracking-[-0.03em] text-ink leading-none flex-none">{pct}<span className="text-[15px] font-semibold text-dim">%</span></div>
          </div>
          <Flight done={done} />
          <div className="h-1.5 rounded-md bg-track overflow-hidden"><div className="h-full rounded-md bg-orange transition-[width] duration-300" style={{ width: pct + "%" }} /></div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto scroll-thin px-[18px] py-3.5 flex flex-col gap-1.5">
          {steps.map((st) => {
            const pc = st.p ? Math.floor((st.p.sent / Math.max(1, st.p.total)) * 100) : 0;
            return (
              <div key={st.key} className={cn("flex-none flex flex-col gap-2 px-3.5 py-3 rounded-md", st.state === "cur" && "bg-[var(--color-orange-tint)]")}>
                <div className="flex items-center gap-2.5">
                  <span className={cn("w-[22px] h-[22px] rounded-full grid place-items-center flex-none", st.state === "done" ? "bg-ok-soft text-ok pop" : st.state === "cur" ? "bg-orange text-white pdu-pulse" : "bg-bar text-faint")}>
                    <Ms name={st.state === "done" ? "check" : st.state === "cur" ? "progress_activity" : "more_horiz"} size={16} />
                  </span>
                  <span className={cn("flex-1 min-w-0 truncate font-semibold", st.state === "todo" ? "text-faint" : "text-ink")}>{st.label}</span>
                  <span className="font-mono text-[12.5px] text-dim flex-none">{st.p ? `${pc}%` : st.size ? fmtSize(st.size) : ""}</span>
                </div>
                {st.p && (
                  <div className="pl-8 flex flex-col gap-[5px]">
                    <div className="h-1 rounded-md bg-track overflow-hidden"><div className="h-full bg-orange transition-[width] duration-300" style={{ width: pc + "%" }} /></div>
                    <span className="font-mono text-[12px] text-faint">{fmtSize(st.p.sent)} / {fmtSize(st.p.total)}{st.p.speed > 0 && ` · ${fmtSize(st.p.speed)}/s · 남은 시간 ${fmtDur(st.p.eta)}`}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex-none px-[22px] py-3.5 border-t border-line-soft bg-panel flex items-center gap-3">
          <span className="flex-1 text-[13px] text-dim leading-[1.5]">창을 닫지 마세요. 끊겨도 다시 시작하면 받은 부분부터 이어서 올립니다.</span>
          <button type="button" className="btn-back" onClick={onStop}><Ms name="pause" size={19} />멈추기</button>
        </div>
      </div>
    </div>
  );
}

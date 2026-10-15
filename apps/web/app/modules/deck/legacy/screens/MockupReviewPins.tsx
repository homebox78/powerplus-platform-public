// 시안 검토의 핀 의견 — 출처: powerDeck web/src/screens/MockupReviewPins.tsx (옛 화면 그대로 이식, eslint.config.js legacy 구역).
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { PinComment } from "../api";
import { Avatar, avatarColor, cn, Ms, parseTs } from "../ui";

/* 기획 확인 · 공유받은 시안 검토가 같이 쓰는 핀 의견 부품 — 핀, 입력창, 스레드 창, 의견 목록 */

export const who = (email: string) => email.split("@")[0];
/** '3분 전' · '2일 전' — 서버 시각(UTC 저장) 기준 */
export const ago = (ts: string) => {
  const t = parseTs(ts)?.getTime();
  if (!t) return "";
  const s = Math.max(0, (Date.now() - t) / 1000);
  return s < 60 ? "방금" : s < 3600 ? `${Math.floor(s / 60)}분 전` : s < 86400 ? `${Math.floor(s / 3600)}시간 전` : s < 86400 * 30 ? `${Math.floor(s / 86400)}일 전` : `${Math.floor(s / 86400 / 30)}개월 전`;
};

export type Draft = { x: number; y: number; body: string };
/** 핀 의견을 다루는 손잡이 — 상태와 서버 호출은 화면(MockupReview)이 쥐고 있다 */
export type PinCtl = {
  me: string; mine: boolean;            // mine = 작업 주인(반영 여부를 정하고, 남의 의견도 지울 수 있다)
  canResolve: boolean;                  // 해결 표시 — 주인·편집자(공유 2)만
  comments: PinComment[]; showDone: boolean;
  focus: number | null; setFocus: (id: number | null) => void;
  draft: Draft | null; setDraft: (d: Draft | null) => void;
  add: () => void;
  patch: (c: PinComment, b: Record<string, unknown>) => void;
  reply: (c: PinComment, text: string) => void;
  edit: (c: PinComment, rid: number, text: string) => void;      // rid 0 = 의견 본문, 그 외 = 답글 id
  remove: (c: PinComment, rid: number) => void;
};

/** 의견 상태 — 검토 대기(노랑) → 반영 예정(초록) / 반영 안 함(회색) */
export const State = ({ c }: { c: PinComment }) => (
  <span className={cn("inline-flex items-center flex-none h-[22px] px-2 rounded-md text-[12px] font-bold whitespace-nowrap",
    c.resolved ? "bg-bar text-dim" : c.accepted ? "bg-ok-soft text-ok" : "bg-[var(--color-mark-soft)] text-[var(--color-ink-2)]")}>
    {c.resolved ? (c.accepted ? "반영됨" : "반영 안 함") : c.accepted ? "반영 예정" : "검토 대기"}
  </span>
);

/** 창을 가장자리에서 반대쪽으로 펼친다 — x 가 절반을 넘으면 왼쪽으로, y 가 flip 을 넘으면 위로 */
const popAt = (x: number, y: number, w: number, flip: number) => ({
  left: x > 0.5 ? `max(0px, calc(${x * 100}% - ${w}px))` : `min(${x * 100}%, calc(100% - ${w}px))`,
  top: y > flip ? `calc(${y * 100}% - 40px)` : `calc(${y * 100}% + 10px)`,
  transform: y > flip ? "translateY(-100%)" : undefined,
});

/** 위로 펼친 창이 장표 위쪽 밖으로 나가면(스크롤로 닿지 못한다) 그만큼 아래로 내린다 */
function useBelowTop() {
  const ref = useRef<HTMLDivElement>(null);
  const [dy, setDy] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current, par = el?.offsetParent;
    if (!el || !par) return;
    const r = el.getBoundingClientRect(), k = r.width / el.offsetWidth || 1;   // k = 글자 크기 확대 배율
    const need = Math.max(0, (par.getBoundingClientRect().top - r.top) / k + dy);
    if (Math.abs(need - dy) > 0.5) setDy(need);
  });
  return { ref, dy };
}

const PIN = "absolute w-8 h-8 p-0 border-2 border-white text-white text-[13px] font-extrabold inline-flex items-center justify-center shadow-[0_2px_6px_rgba(17,17,17,.25)] uppercase";
const pinAt = (x: number, y: number) => ({ left: `${x * 100}%`, top: `${y * 100}%`, transform: "translate(-50%,-100%)", borderRadius: "50% 50% 50% 4px" });

/** 장표(시안·와이어프레임) 위에 겹치는 핀 — position:relative 인 상자 안에 넣는다. 좌표는 0~1 */
export function PinLayer({ p, slide }: { p: PinCtl; slide: number }) {
  const pins = p.comments.filter((c) => c.slide === slide && (p.showDone || !c.resolved));
  const cur = pins.find((c) => c.id === p.focus);
  const d = p.draft;
  const dpop = useBelowTop();
  return (
    <>
      {pins.map((c) => (
        // 작성자 색 아바타 핀. 닫은 의견은 초록 ✓, 검토 대기는 점선 테두리
        <button key={c.id} data-pin type="button" title={`${who(c.email)} · ${c.body}`} onClick={() => { p.setFocus(p.focus === c.id ? null : c.id); p.setDraft(null); }}
          className={cn(PIN, "z-20", !c.resolved && !c.accepted && "border-dashed")}
          style={{ ...pinAt(c.x, c.y), background: c.resolved ? "var(--color-ok)" : avatarColor(c.email), outline: p.focus === c.id ? "3px solid var(--color-orange-soft)" : undefined }}>
          {c.resolved ? <Ms name="check" size={17} /> : who(c.email)![0]}
        </button>
      ))}
      {d && (
        <>
          <span data-pin className={cn(PIN, "z-20")} style={{ ...pinAt(d.x, d.y), background: avatarColor(p.me) }}>{who(p.me)![0]}</span>
          <div ref={dpop.ref} data-pin onClick={(e) => e.stopPropagation()} className="absolute z-30 w-[300px] bg-white border border-line rounded-field shadow-[0_12px_32px_rgba(17,17,17,.18)] p-3 flex flex-col gap-2.5 cursor-default text-left"
            style={{ ...popAt(d.x, d.y, 300, 0.55), marginTop: dpop.dy }}>
            <div className="text-[13px] font-bold text-ink3">{slide}쪽 · 이 위치에 의견</div>
            <textarea autoFocus className="field min-h-[84px] !resize-y !px-3 !py-2.5 !leading-[1.5]" maxLength={2000} placeholder="예: 이 수치 출처를 표 아래에 적어 주세요"
              value={d.body} onChange={(e) => p.setDraft({ ...d, body: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); p.add(); } if (e.key === "Escape") p.setDraft(null); }} />
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-faint flex-1 whitespace-nowrap">Enter 남기기 · Esc 취소</span>
              <button className="btn-back !h-[34px] !px-4 !text-[13.5px]" onClick={() => p.setDraft(null)}>취소</button>
              <button className="btn-dark !h-[34px] !px-4 !text-[13.5px]" disabled={!d.body.trim()} onClick={p.add}><Ms name="send" size={17} />남기기</button>
            </div>
          </div>
        </>
      )}
      {cur && <Thread key={cur.id} c={cur} p={p} />}
    </>
  );
}

/** 스레드 창(340px) — 머리줄(해결 체크 · 닫기), 본문(의견과 답변들 · 상태), 아래 답변 입력 */
function Thread({ c, p }: { c: PinComment; p: PinCtl }) {
  const [text, setText] = useState("");
  const [menu, setMenu] = useState<number | null>(null);                          // ⋯ 메뉴가 열린 글 (0 = 의견 본문, 그 외 = 답글 id)
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
  const send = () => { if (!text.trim()) return; p.reply(c, text.trim()); setText(""); };
  const save = () => { if (editing?.text.trim()) p.edit(c, editing.id, editing.text.trim()); setEditing(null); };
  const canResolve = p.canResolve;   // 해결 표시는 주인·편집자만(의견 작성자 본인은 글 수정·삭제만)
  const pop = useBelowTop();
  return (
    <div ref={pop.ref} data-pin onClick={(e) => e.stopPropagation()} className="absolute z-30 w-[340px] bg-white border border-line rounded-field shadow-[0_12px_32px_rgba(17,17,17,.18)] flex flex-col cursor-default text-left"
      style={{ ...popAt(c.x, c.y, 340, 0.5), marginTop: pop.dy }}>
      <div className="h-12 flex-none flex items-center gap-2 pl-3.5 pr-2 border-b border-line-soft">
        <span className="font-bold whitespace-nowrap flex-none">의견</span>
        <span className="text-[12.5px] text-faint whitespace-nowrap flex-none font-mono">#{c.id} · {c.slide}쪽</span>
        <span className="ml-auto" />
        {canResolve && (
          <button title={c.resolved ? "다시 열기" : "해결로 표시"} aria-label={c.resolved ? "다시 열기" : "해결로 표시"} onClick={() => p.patch(c, { resolved: !c.resolved })}
            className={cn("w-8 h-8 p-0 rounded-full border inline-flex items-center justify-center flex-none", c.resolved ? "bg-[var(--color-ok)] border-[var(--color-ok)] text-white" : "bg-white border-line text-ink2 hover:border-[var(--color-ok)] hover:text-[var(--color-ok)]")}>
            <Ms name="check" size={18} />
          </button>
        )}
        <button className="btn-icon" title="닫기 (Esc)" aria-label="닫기" onClick={() => p.setFocus(null)}><Ms name="close" size={20} /></button>
      </div>
      <div className="max-h-[260px] overflow-y-auto scroll-thin px-3.5 py-3 flex flex-col gap-3">
        {[{ id: 0, email: c.email, body: c.body, created_at: c.created_at }, ...c.replies].map((r) => {
          const isMine = r.email === p.me, canDel = isMine || p.mine;
          return (
            <div key={r.id} className="flex gap-2.5 group/msg">
              <Avatar name={r.email} size={26} />
              <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
                <div className="relative flex items-center gap-1.5">
                  <span className="font-bold text-[13.5px] truncate">{who(r.email)}</span>
                  <span className="text-[12px] text-faint whitespace-nowrap flex-none">{ago(r.created_at)}</span>
                  {canDel && (
                    <button title="더 보기" aria-label="더 보기" onClick={() => setMenu(menu === r.id ? null : r.id)}
                      className={cn("btn-icon !w-6 !h-6 !rounded-md ml-auto", menu === r.id ? "!bg-bar !text-ink" : "opacity-0 group-hover/msg:opacity-100 focus:opacity-100")}><Ms name="more_horiz" size={18} /></button>
                  )}
                  {menu === r.id && (
                    <div className="absolute right-0 top-7 z-10 w-[120px] bg-white border border-line rounded-md shadow-[0_12px_32px_-8px_rgba(17,17,17,.25)] p-1">
                      {isMine && <button className="w-full h-8 px-2.5 rounded-md text-[13.5px] text-left hover:bg-panel" onClick={() => { setEditing({ id: r.id, text: r.body }); setMenu(null); }}>편집</button>}
                      <button className="w-full h-8 px-2.5 rounded-md text-[13.5px] text-left text-[var(--color-warn)] hover:bg-[var(--color-warn-soft)]" onClick={() => { setMenu(null); p.remove(c, r.id); }}>{r.id === 0 ? "의견 삭제" : "답변 삭제"}</button>
                    </div>
                  )}
                </div>
                {editing?.id === r.id ? (
                  <div className="flex flex-col gap-1.5">
                    <textarea autoFocus className="field !px-3 !py-2 !leading-[1.5]" rows={3} maxLength={2000} value={editing.text} onChange={(e) => setEditing({ id: r.id, text: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } if (e.key === "Escape") { e.stopPropagation(); setEditing(null); } }} />
                    <div className="flex justify-end gap-1.5">
                      <button className="btn-back !h-[30px] !px-4 !text-[13px]" onClick={() => setEditing(null)}>취소</button>
                      <button className="btn-dark !h-[30px] !px-4 !text-[13px]" onClick={save}>저장</button>
                    </div>
                  </div>
                ) : <div className="text-[14px] leading-[1.5] text-[var(--color-ink)] whitespace-pre-wrap break-words">{r.body}</div>}
              </div>
            </div>
          );
        })}
        <div className="flex items-center gap-1.5 flex-wrap">
          <State c={c} />
          {/* 반영 여부는 작업 주인만 정한다 */}
          {p.mine && !c.resolved && <>
            <button className={cn("ml-auto h-7 px-2.5 rounded-md text-[12.5px] font-bold whitespace-nowrap flex-none", c.accepted ? "border border-line bg-white text-ink2 hover:bg-panel" : "bg-orange text-white hover:bg-orange-d")}
              onClick={() => p.patch(c, { accepted: !c.accepted })}>{c.accepted ? "반영 취소" : "장표에 반영"}</button>
            <button className="h-7 px-2.5 rounded-md border border-line bg-white text-[12.5px] font-bold text-ink2 whitespace-nowrap flex-none hover:bg-panel" onClick={() => p.patch(c, { resolved: true })}>반영 안 함</button>
          </>}
        </div>
      </div>
      <div className="flex-none border-t border-line-soft px-3 py-2.5 flex items-center gap-2">
        <Avatar name={p.me} size={26} />
        <input className="flex-1 min-w-0 h-[38px] rounded-card border border-line bg-panel px-3.5 text-[14px] outline-none focus:border-orange focus:bg-white" placeholder="답변" maxLength={2000} value={text}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) send(); }} />
        <button title="보내기" aria-label="보내기" disabled={!text.trim()} onClick={send} className="w-[38px] h-[38px] p-0 flex-none rounded-full bg-orange text-white inline-flex items-center justify-center hover:bg-orange-d disabled:opacity-40"><Ms name="send" size={18} /></button>
      </div>
    </div>
  );
}

/** 의견 목록 — 누르면 그 장과 핀으로 간다. 지우기는 내가 쓴 것(작업 주인은 모두) */
export function CommentList({ p, list, onGo, empty }: { p: PinCtl; list: PinComment[]; onGo: (c: PinComment) => void; empty: ReactNode }) {
  if (!list.length) return <div className="h-full min-h-[200px] grid place-items-center text-center text-faint text-[13.5px] leading-[1.6] p-5">{empty}</div>;
  return (
    <>
      {list.map((c) => (
        <div key={c.id} role="button" tabIndex={0} onClick={() => onGo(c)} onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) onGo(c); }}
          className={cn("flex gap-2.5 px-[18px] py-3.5 border-b border-line-soft cursor-pointer hover:bg-panel", p.focus === c.id ? "bg-[var(--color-orange-tint)]" : "bg-white")}>
          <Avatar name={c.email} size={28} />
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-[13.5px] truncate">{who(c.email)}</span>
              <span className="text-[12px] text-faint whitespace-nowrap flex-none">{ago(c.created_at)}</span>
              <span className="ml-auto flex-none"><State c={c} /></span>
            </div>
            <div className="text-[12.5px] text-faint font-semibold whitespace-nowrap"><span className="font-mono">#{c.id}</span> · {c.slide}쪽{c.replies.length > 0 && ` · 답변 ${c.replies.length}`}</div>
            <div className={cn("text-[14px] leading-[1.5] break-words line-clamp-3", c.resolved ? "text-dim line-through" : "text-[var(--color-ink)]")}>{c.body}</div>
          </div>
          {(p.mine || c.email === p.me) && (
            <button className="btn-icon danger !w-[30px] !h-[30px] !rounded-md" title="삭제" aria-label="삭제" onClick={(e) => { e.stopPropagation(); p.remove(c, 0); }}><Ms name="delete" size={18} /></button>
          )}
        </div>
      ))}
    </>
  );
}

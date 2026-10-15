// 장표 의견 패널(의견 상태: 검토 대기 → 반영 예정 → 반영됨/안 함) — 출처: powerDeck web/src/Feedback.tsx (옛 화면 그대로 이식, eslint.config.js legacy 구역).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, unwrapList, type Job, type PinComment } from "./api";
import { Avatar, avatarColor, cn, Ms, parseTs, useToastOn, ask } from "./ui";

const who = (email: string) => email.split("@")[0];
const ago = (ts: string) => {
  const t = parseTs(ts)?.getTime();
  if (!t) return "";
  const s = Math.max(0, (Date.now() - t) / 1000);
  return s < 60 ? "방금" : s < 3600 ? `${Math.floor(s / 60)}분 전` : s < 86400 ? `${Math.floor(s / 3600)}시간 전` : s < 86400 * 30 ? `${Math.floor(s / 86400)}일 전` : `${Math.floor(s / 86400 / 30)}개월 전`;
};

/** 의견 상태 — 검토 대기(노랑) → 반영 예정(주황) → 반영됨(초록) / 반영 안 함(회색) */
export const State = ({ c }: { c: PinComment }) => (
  <span className={cn("inline-flex items-center flex-none h-[22px] px-2 rounded-md text-[12px] font-bold whitespace-nowrap",
    c.resolved ? (c.accepted ? "bg-ok-soft text-ok" : "bg-bar text-dim") : c.accepted ? "bg-orange-soft text-orange-d" : "bg-[var(--color-mark-soft)] text-[var(--color-ink-2)]")}>
    {c.resolved ? (c.accepted ? "반영됨" : "반영 안 함") : c.accepted ? "반영 예정" : "검토 대기"}
  </span>
);

/**
 * 핀 의견 상태·동작 — 이미지 위 핀(PinImage)과 오른쪽 목록(CommentPanel)이 함께 쓴다.
 * target: 어느 그림 위의 의견인가 (mockup = 시안, result = 완성 장표)
 */
export function useFeedback(job: Job, me: string, target: "mockup" | "result") {
  const [all, setAll] = useState<PinComment[]>(job.comments ?? []);
  const [focus, setFocus] = useState<number | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useToastOn(err);
  useEffect(() => {  // 팀원 의견이 들어오는지 8초마다
    const f = () => api<{ data: PinComment[] }>(`/jobs/${job.id}/comments`).then((r) => setAll(unwrapList(r))).catch(() => {});
    const t = setInterval(f, 8000);
    return () => clearInterval(t);
  }, [job.id]);
  const comments = all.filter((c) => (c.target ?? "mockup") === target);
  const open = comments.filter((c) => !c.resolved);
  const authors = [...new Set(all.map((c) => c.email))];
  const act = async (f: Promise<{ data: PinComment[] }>) => { try { setAll(unwrapList(await f)); } catch (e) { setErr((e as Error).message); } };
  const base = `/jobs/${job.id}/comments`;
  return {
    job, me, target, mine: job.mine !== false,
    /** 해결 표시 권한 — 작업 주인·편집자(공유 2)만. 의견 작성자 본인은 글 수정·삭제만(하, 2026-10-10) */
    canResolve: job.mine !== false || !!job.can_edit,
    comments, open, focus, setFocus, showDone, setShowDone, err, authors,
    /** 사람마다 고유 색 — 같은 사람은 어디서나 같은 색(ui 의 avatarColor) */
    colorOf: (email: string) => avatarColor(email),
    accepted: open.filter((c) => c.accepted), pending: open.filter((c) => !c.accepted),
    pinNo: (c: PinComment) => comments.filter((x) => x.slide === c.slide).findIndex((x) => x.id === c.id) + 1,
    add: (slide: number, x: number, y: number, body: string) => act(api(base, { method: "POST", body: JSON.stringify({ slide, x, y, body, target }) })),
    patch: (c: PinComment, b: Record<string, unknown>) => act(api(`${base}/${c.id}`, { method: "PATCH", body: JSON.stringify(b) })),
    remove: (c: PinComment) => act(api(`${base}/${c.id}`, { method: "DELETE" })),
    reply: (c: PinComment, body: string) => act(api(`${base}/${c.id}/replies`, { method: "POST", body: JSON.stringify({ body }) })),
    editReply: (c: PinComment, rid: number, body: string) => act(api(`${base}/${c.id}/replies/${rid}`, { method: "PATCH", body: JSON.stringify({ body }) })),
    removeReply: (c: PinComment, rid: number) => act(api(`${base}/${c.id}/replies/${rid}`, { method: "DELETE" })),
  };
}
export type Feedback = ReturnType<typeof useFeedback>;

/** 핀 옆에 뜨는 창의 자리 — 가장자리에서는 반대쪽으로 펼친다(x 50% 넘으면 왼쪽, y 가 flipY 를 넘으면 위). 세로로 넘치면 창 안에서 스크롤 */
const popAt = (x: number, y: number, w: number, flipY: number) => ({
  width: w, maxWidth: "100%", maxHeight: "78%", overflowY: "auto" as const,
  left: x > 0.5 ? `max(0px, calc(${x * 100}% - ${w}px))` : `max(0px, min(${x * 100}%, calc(100% - ${w}px)))`,
  top: y > flipY ? `max(0px, calc(${y * 100}% - 40px))` : `min(calc(${y * 100}% + 10px), calc(100% - 120px))`,
  transform: y > flipY ? "translateY(-100%)" : undefined,
});
const POP = "absolute z-20 bg-white border border-line rounded-field shadow-[0_12px_32px_rgba(17,17,17,.18)] cursor-default text-left flex flex-col";
const PIN = "absolute w-8 h-8 p-0 border-2 border-white text-white text-[12.5px] font-extrabold inline-flex items-center justify-center shadow-[0_2px_6px_rgba(17,17,17,.25)] uppercase";
const pinAt = (x: number, y: number) => ({ left: `${x * 100}%`, top: `${y * 100}%`, transform: "translate(-50%,-100%)", borderRadius: "50% 50% 50% 4px" });

/**
 * 이미지 + 핀. 빈 곳을 누르면 그 자리에 내 아바타 핀과 입력창, 핀을 누르면 스레드 창.
 * 폭은 부모를 채운다. fit(쓸 수 있는 높이의 CSS 식, 예 "100vh - 180px")을 주면 그림이 그 높이를 넘지 않게 폭을 줄인다.
 */
export function PinImage({ fb, slide, src, alt, className, fit, children }: { fb: Feedback; slide: number; src: string; alt?: string; className?: string; fit?: string; children?: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(16 / 9);
  const [draft, setDraft] = useState<{ x: number; y: number; body: string } | null>(null);
  const [replyText, setReplyText] = useState("");
  const [menu, setMenu] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
  const { focus, setFocus, me, mine } = fb;
  useEffect(() => { setDraft(null); setMenu(null); setEditing(null); setReplyText(""); }, [slide, focus]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" && (e.target as HTMLElement)?.tagName !== "TEXTAREA") { setFocus(null); setDraft(null); setMenu(null); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [setFocus]);

  const pins = fb.comments.filter((c) => c.slide === slide && (fb.showDone || !c.resolved));
  const sel = pins.find((c) => c.id === focus);
  const click = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-pin]")) return;
    if (focus !== null || draft) { setFocus(null); setDraft(null); return; }
    if (fb.job.anon) { window.dispatchEvent(new CustomEvent("pd:toast", { detail: { msg: "로그인하면 의견을 남길 수 있습니다 — 지금은 보기만 됩니다.", kind: "error" } })); return; }
    const r = box.current!.getBoundingClientRect();
    setDraft({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, body: "" });
  };
  const addPin = () => { if (draft?.body.trim()) fb.add(slide, draft.x, draft.y, draft.body.trim()); setDraft(null); };
  const sendReply = (c: PinComment) => { if (replyText.trim()) { fb.reply(c, replyText.trim()); setReplyText(""); } };
  const saveEdit = (c: PinComment) => {
    if (editing?.text.trim()) { if (editing.id === 0) fb.patch(c, { body: editing.text.trim() }); else fb.editReply(c, editing.id, editing.text.trim()); }
    setEditing(null);
  };
  const removeMsg = async (c: PinComment, rid: number) => {
    setMenu(null);
    if (rid === 0) { if (await ask("이 의견과 답글을 모두 지웁니다.", { danger: true })) { setFocus(null); fb.remove(c); } }
    else if (await ask("이 답글을 지웁니다.", { danger: true })) fb.removeReply(c, rid);
  };

  return (
    <div ref={box} onClick={click} className="relative w-full cursor-crosshair select-none" style={fit ? { maxWidth: `calc((${fit}) * ${ratio})` } : undefined}>
      <img src={src} alt={alt} draggable={false} className={cn("block w-full", className)}
        onLoad={(e) => { const i = e.currentTarget; if (i.naturalWidth && i.naturalHeight) setRatio(i.naturalWidth / i.naturalHeight); }} />
      {children}
      {pins.map((c) => (
        <button key={c.id} data-pin type="button" onClick={() => setFocus(focus === c.id ? null : c.id)} title={`${who(c.email)} · ${c.body}`} aria-label={`${c.slide}쪽 의견: ${c.body.slice(0, 80)} (${who(c.email)})`}
          className={cn(PIN, !c.resolved && !c.accepted && "border-dashed")}
          style={{ ...pinAt(c.x, c.y), background: c.resolved ? "var(--color-ok)" : avatarColor(c.email), outline: focus === c.id ? "3px solid var(--color-orange-soft)" : undefined }}>
          {c.resolved ? <Ms name="check" size={18} /> : who(c.email)![0]}
        </button>
      ))}

      {draft && (
        <>
          <span data-pin className={PIN} style={{ ...pinAt(draft.x, draft.y), background: avatarColor(me) }}>{who(me)![0]}</span>
          <div data-pin className={cn(POP, "p-3 gap-2.5")} style={popAt(draft.x, draft.y, 300, 0.55)}>
            <div className="text-[13px] font-bold text-ink3">{slide}쪽 · 이 위치에 의견</div>
            <textarea autoFocus className="field !min-h-[84px] !py-2.5 !px-3 !leading-[1.5] resize-y" maxLength={2000} placeholder="예: 이 수치 출처를 표 아래에 적어 주세요"
              value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addPin(); } if (e.key === "Escape") setDraft(null); }} />
            <div className="flex items-center gap-2">
              <span className="flex-1 text-[12px] text-faint whitespace-nowrap">Enter 남기기 · Esc 취소</span>
              <button className="btn-back !h-[34px] !px-4 !text-[13.5px]" onClick={() => setDraft(null)}>취소</button>
              <button className="btn-dark !h-[34px] !px-4 !text-[13.5px]" disabled={!draft.body.trim()} onClick={addPin}><Ms name="send" size={17} />남기기</button>
            </div>
          </div>
        </>
      )}

      {sel && (
        <div data-pin className={POP} style={popAt(sel.x, sel.y, 340, 0.5)}>
          <div className="flex-none h-12 flex items-center gap-2 pl-3.5 pr-2 border-b border-line-soft">
            <span className="font-bold whitespace-nowrap flex-none">의견</span>
            <span className="text-[12.5px] text-faint whitespace-nowrap flex-none">#{sel.id} · {sel.slide}쪽</span>
            {fb.canResolve && (
              <button title={sel.resolved ? "다시 열기" : "해결로 표시"} aria-label={sel.resolved ? "다시 열기" : "해결로 표시"} onClick={() => fb.patch(sel, { resolved: !sel.resolved })}
                className={cn("ml-auto w-8 h-8 p-0 rounded-full border inline-flex items-center justify-center flex-none", sel.resolved ? "bg-[var(--color-ok)] border-[var(--color-ok)] text-white" : "bg-white border-line text-ink2 hover:border-[var(--color-ok)] hover:text-[var(--color-ok)]")}>
                <Ms name="check" size={18} />
              </button>
            )}
            <button title="닫기" aria-label="닫기" className={cn("btn-icon", !fb.canResolve && "ml-auto")} onClick={() => setFocus(null)}><Ms name="close" size={20} /></button>
          </div>
          <div className="max-h-[260px] overflow-y-auto scroll-thin px-3.5 py-3 flex flex-col gap-3">
            {[{ id: 0, email: sel.email, body: sel.body, created_at: sel.created_at }, ...sel.replies].map((r) => {
              const isMine = r.email === me, canDel = isMine || mine;
              return (
                <div key={r.id} className="flex gap-2.5 group/msg">
                  <Avatar name={r.email} size={26} />
                  <div className="min-w-0 flex-1 flex flex-col gap-[3px]">
                    <div className="flex items-center gap-1.5 relative">
                      <span className="font-bold text-[13.5px] truncate">{who(r.email)}</span><span className="text-[12px] text-faint whitespace-nowrap flex-none">{ago(r.created_at)}</span>
                      {canDel && (
                        <button title="더 보기" aria-label="더 보기" onClick={() => setMenu(menu === r.id ? null : r.id)}
                          className={cn("btn-icon !w-6 !h-6 ml-auto", menu === r.id ? "!bg-bar !text-ink" : "text-faint hover:text-ink")} aria-expanded={menu === r.id}>
                          <Ms name="more_horiz" size={18} />
                        </button>
                      )}
                      {menu === r.id && (
                        <div className="absolute right-0 top-7 z-30 w-[116px] rounded-md bg-white border border-line shadow-[0_12px_32px_-8px_rgba(17,17,17,.25)] p-1">
                          {isMine && <button className="w-full text-left px-2.5 h-8 rounded-md text-[13px] font-semibold hover:bg-panel" onClick={() => { setEditing({ id: r.id, text: r.body }); setMenu(null); }}>편집</button>}
                          <button className="w-full text-left px-2.5 h-8 rounded-md text-[13px] font-semibold hover:bg-[var(--color-warn-soft)] hover:text-[var(--color-warn)]" onClick={() => removeMsg(sel, r.id)}>{r.id === 0 ? "의견 삭제" : "댓글 삭제"}</button>
                        </div>
                      )}
                    </div>
                    {editing?.id === r.id ? (
                      <div>
                        <textarea autoFocus className="field !py-2 !px-2.5 !text-[13.5px] !leading-[1.5]" rows={3}
                          value={editing.text} onChange={(e) => setEditing({ id: r.id, text: e.target.value })}
                          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(sel); } if (e.key === "Escape") setEditing(null); }} />
                        <div className="flex justify-end gap-1.5 mt-1.5">
                          <button className="btn-back !h-7 !px-4 !text-[12.5px]" onClick={() => setEditing(null)}>취소</button>
                          <button className="btn-dark !h-7 !px-4 !text-[12.5px]" onClick={() => saveEdit(sel)}>저장</button>
                        </div>
                      </div>
                    ) : <div className="text-[14px] leading-[1.5] text-[var(--color-ink)] whitespace-pre-wrap break-words">{r.body}</div>}
                  </div>
                </div>
              );
            })}
            <div className="flex items-center gap-1.5 flex-wrap">
              <State c={sel} />
              {mine && !sel.resolved && <>
                <button className={cn("ml-auto !h-7 !px-2.5 !text-[12.5px]", sel.accepted ? "btn-back" : "btn-dark")} onClick={() => fb.patch(sel, { accepted: !sel.accepted })}>{sel.accepted ? "반영 취소" : "장표에 반영"}</button>
                <button className="btn-back !h-7 !px-4 !text-[12.5px]" onClick={() => fb.patch(sel, { resolved: true })}>반영 안 함</button>
              </>}
            </div>
          </div>
          <div className="flex-none border-t border-line-soft px-3 py-2.5 flex items-center gap-2">
            <Avatar name={me} size={26} />
            <input className="flex-1 min-w-0 h-[38px] rounded-full border border-line bg-panel px-3.5 text-[14px] outline-none focus:border-orange" placeholder="답변" value={replyText}
              onChange={(e) => setReplyText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); sendReply(sel); } }} />
            <button title="보내기" aria-label="보내기" className="w-[38px] h-[38px] p-0 border-0 rounded-full bg-orange text-white inline-flex items-center justify-center flex-none disabled:opacity-45" disabled={!replyText.trim()} onClick={() => sendReply(sel)}><Ms name="send" size={18} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 공유 링크 권한 — 0 끔 · 1 로그인한 사람 의견 · 2 로그인한 사람 편집(시안 확인의 기획·와이어프레임) · 3 링크만 있으면 누구나 보기(로그인 없이) */
export const SHARE_LEVELS = [
  [1, "로그인한 사람 · 의견만"],
  [2, "로그인한 사람 · 편집 가능"],
  [3, "링크만 있으면 누구나 보기"],
] as const;
export const shareLevel = (j: Job) => j.share ?? (j.shared ? 1 : 0);
/** 링크 권한 고르기 — 고르면 바로 그 권한으로 공유가 켜진다 */
export function ShareLevel({ job, onJob }: { job: Job; onJob: (j: Job) => void }) {
  const lv = shareLevel(job);
  const set = async (v: number) => { try { onJob(await api<Job>(`/jobs/${job.id}`, { method: "PATCH", body: JSON.stringify({ shared: v }) })); } catch { /* api 가 토스트 */ } };
  return (
    <label className="flex items-center gap-2 text-[13px] min-w-0">
      <span className="text-dim whitespace-nowrap flex-none">링크 권한</span>
      <select className="field !h-8 !py-0 !text-[13px] font-semibold flex-1 min-w-0" value={lv || 1} onChange={(e) => set(Number(e.target.value))}
        title={[
          "의견만: 로그인한 팀원이 보고 의견을 남깁니다",
          "편집 가능: 로그인한 팀원이 기획 글·와이어프레임을 고치고 A·B 를 확정합니다(시안·장표 만들기와 공유 설정은 주인만)",
          "누구나 보기: 로그인 없이 주소만으로 시안·장표를 봅니다(의견·자료는 보이지 않음). 로그인하면 의견을 남길 수 있습니다",
        ].join("\n")}>
        {SHARE_LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

/**
 * 오른쪽 의견 목록. 항목을 누르면 onGo(그 장으로 이동) 뒤 스레드 창이 열린다. 폭은 부모(격자 칸)가 정한다.
 * 작업 주인: 머리줄(56px)에 「팀원에게 공유」, 아래 foot(수정 요청 칸).
 * guest(공유받은 사람): 머리줄 48px, 안내문과 맨 아래 "의견만 남길 수 있습니다".
 */
export function CommentPanel({ fb, onGo, onJob, empty, guest, foot }: { fb: Feedback; onGo: (c: PinComment) => void; onJob: (j: Job) => void; empty?: string; guest?: boolean; foot?: ReactNode }) {
  const { job, mine, me, comments, open, showDone } = fb;
  const [copied, setCopied] = useState(false);
  const listed = showDone ? comments : open;
  const share = async () => {
    try {
      if (!job.shared) onJob(await api<Job>(`/jobs/${job.id}`, { method: "PATCH", body: JSON.stringify({ shared: 1 }) }));
      await navigator.clipboard.writeText(location.href);
      setCopied(true); setTimeout(() => setCopied(false), 2500);
    } catch { /* 클립보드 거부 — 주소창에서 복사 */ }
  };
  const toggle = (
    <button className="ml-auto flex-none whitespace-nowrap h-[30px] px-2 rounded-md text-[13px] font-semibold text-dim hover:bg-side" onClick={() => fb.setShowDone(!showDone)}>
      {showDone ? "닫은 것 숨기기" : `닫은 것 보기 ${comments.length - open.length}`}
    </button>
  );
  return (
    <aside className="border-l border-line bg-white flex flex-col min-h-0 min-w-0">
      <div className={cn("head panel !gap-2 !px-[18px]", guest && "sm")}>
        <span className="font-bold flex-none">의견</span>
        <span className="min-w-5 h-5 px-1.5 rounded-full bg-orange text-white text-[12px] font-bold inline-flex items-center justify-center flex-none">{open.length}</span>
        {mine && !guest ? (
          <span className="ml-auto flex items-center gap-1 min-w-0">
            <button className={cn("btn-back !h-8 !px-4 !text-[13px] min-w-0", job.shared && "!text-ok !border-[var(--color-ok-line)] !bg-ok-soft")} onClick={share} title="공유 링크를 복사합니다 — 받은 팀원은 로그인하면 결과 장표를 보고 의견을 남길 수 있습니다">
              <Ms name={copied ? "check" : "share"} size={18} /><span className="truncate">{copied ? "링크를 복사했습니다" : job.shared ? "공유 중 · 링크 복사" : "팀원에게 공유"}</span>
            </button>
            {job.shared && <button className="btn-icon danger" title="공유 끄기 — 팀원이 더 볼 수 없습니다" aria-label="공유 끄기"
              onClick={async () => onJob(await api<Job>(`/jobs/${job.id}`, { method: "PATCH", body: JSON.stringify({ shared: false }) }))}><Ms name="link_off" size={19} /></button>}
          </span>
        ) : toggle}
      </div>
      {mine && !guest && <div className="flex-none px-[18px] pt-3"><ShareLevel job={job} onJob={onJob} /></div>}
      <div className="flex-none px-[18px] py-3 border-b border-line-soft text-[13px] text-dim leading-[1.55]">
        {mine
          ? <>팀원 의견은 ‘검토 대기’로 들어오고, 내가 ‘장표에 반영’을 누른 의견만 장표에 반영됩니다.</>
          : <>남긴 의견은 작업 주인에게 ‘검토 대기’로 전달되고, 주인이 반영하기를 누르면 장표에 반영됩니다.</>}
        {mine && !guest && (
          <div className="flex items-center gap-2 mt-1 -mr-2 min-w-0">
            {fb.pending.length > 0 && <span className="text-[12.5px] font-bold text-[var(--color-ink-2)] truncate min-w-0">검토 대기 {fb.pending.length}개 — 눌러서 반영 여부를 정해 주세요</span>}
            {toggle}
          </div>
        )}
        {fb.err && <div className="mt-1 text-[12.5px] font-semibold text-[var(--color-warn)]">{fb.err}</div>}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto scroll-thin">
        {listed.map((c) => (
          <div key={c.id} role="button" tabIndex={0} aria-label={`${c.slide}쪽 의견 열기: ${c.body.slice(0, 80)}`} onClick={() => { onGo(c); fb.setFocus(c.id); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onGo(c); fb.setFocus(c.id); } }}
            className={cn("flex gap-2.5 pl-[18px] pr-2.5 py-3.5 border-b border-line-soft cursor-pointer hover:bg-panel", fb.focus === c.id && "bg-[var(--color-orange-tint)]")}>
            <Avatar name={c.email} size={28} />
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-bold text-[13.5px] truncate min-w-0">{who(c.email)}</span><span className="text-[12px] text-faint whitespace-nowrap flex-none">{ago(c.created_at)}</span>
                <span className="ml-auto flex-none"><State c={c} /></span>
              </div>
              <div className="text-[12.5px] text-faint font-semibold truncate">#{c.id} · {c.slide}쪽{c.replies.length > 0 && ` · 답변 ${c.replies.length} (${who(c.replies[c.replies.length - 1]!.email)} ${ago(c.replies[c.replies.length - 1]!.created_at)})`}</div>
              <div className={cn("text-[14px] leading-[1.5] break-words line-clamp-3", c.resolved ? "text-dim line-through" : "text-[var(--color-ink)]")}>{c.body}</div>
            </div>
            {(mine || c.email === me) ? (
              <button title={`삭제: ${c.slide}쪽 의견`} aria-label={`삭제: ${c.slide}쪽 의견`} className="btn-icon danger !w-[30px] !h-[30px] !text-faint"
                onClick={async (e) => { e.stopPropagation(); if (await ask("이 의견과 답글을 모두 지웁니다.", { danger: true })) { if (fb.focus === c.id) fb.setFocus(null); fb.remove(c); } }}><Ms name="delete" size={18} /></button>
            ) : <span className="w-2 flex-none" />}
          </div>
        ))}
        {!listed.length && <div className="h-full min-h-[160px] grid place-items-center text-center text-faint text-[13.5px] leading-[1.6] p-5"><span>{guest ? "아직 남긴 의견이 없습니다." : "아직 의견이 없습니다."}<br />{empty ?? "이미지에서 고칠 곳을 눌러 보세요."}</span></div>}
      </div>
      {foot}
      {guest && (
        <div className="flex-none border-t border-line px-[18px] py-3.5 bg-panel text-[12.5px] text-dim leading-[1.45]">공유받은 시안은 의견만 남길 수 있습니다. 파일 받기와 수정은 작업 주인만 할 수 있습니다.</div>
      )}
    </aside>
  );
}

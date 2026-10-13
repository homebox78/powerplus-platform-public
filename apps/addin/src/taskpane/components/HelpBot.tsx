// powerPlus AI Help — 작업창 전용 도움말 봇. 웹의 우측 하단 봇(apps/web hb/assist-bot)과 같은 /assist/ask 를 부르되
// context=addin 이라 에셋·시작하기·계정 도움말에서만 고른다. 답은 사람이 쓴 도움말 그대로(판단 모델은 고르기만 한다).
// 링크는 사이트 경로라 작업창 밖 새 브라우저 창으로 연다.
import * as React from "react";
import { api, SITE_BASE } from "../api/config";

type Answer = { kind: string; title?: string; body?: string; message?: string; links?: Array<[string, string]> };
type Msg = { who: "me" | "bot"; text: string; ans?: Answer };

// 본문 속 주소는 새 창 링크로 (웹 hb/copy.tsx Linkify 와 같은 규칙, 사용자 지시 2026-10-07)
const URL_RE = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)+(?:com|kr|net|org|io|dev|ai)(?:\/[^\s)<>]*)?/gi;
function Linkify({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    let url = m[0];
    const trail = url.match(/[.,;:!?'"]+$/)?.[0] ?? "";
    if (trail) url = url.slice(0, -trail.length);
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    out.push(<a key={at} href={/^https?:\/\//i.test(url) ? url : `https://${url}`} target="_blank" rel="noreferrer">{url}</a>);
    last = at + url.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

const SUGGEST = ["설치가 안 돼요", "자료 찾는 법", "삽입이 안 될 때", "자료 요청하기"];

function openSite(path: string) {
  window.open(SITE_BASE + path, "_blank", "noopener");
}

export const BotIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#555555" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="4" y="7" width="16" height="12" rx="4" />
    <path d="M12 3v4M9 12.5v1M15 12.5v1M9.5 16.5h5" />
  </svg>
);

export default function HelpBot({ onClose }: { onClose: () => void }) {
  const [msgs, setMsgs] = React.useState<Msg[]>([]);
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [msgs, busy]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function ask(text: string) {
    const t = text.trim();
    if (t.length < 2 || busy) return;
    setMsgs((m) => [...m, { who: "me", text: t }]);
    setQ("");
    setBusy(true);
    try {
      const r = await api<Answer>("/assist/ask", { method: "POST", body: { q: t, context: "addin" } });
      const a = r.data ?? { kind: "none" };
      setMsgs((m) => [...m, { who: "bot", text: a.title || a.message || "", ans: a }]);
    } catch (e) {
      setMsgs((m) => [...m, { who: "bot", text: e instanceof Error ? e.message : "지금은 답할 수 없습니다.", ans: { kind: "error", links: [["/contact", "문의하기"]] } }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div className="sheet helpbot" role="dialog" aria-label="powerPlus AI Help" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__grip" />
        <div className="helpbot__head">
          <span className="helpbot__title">{BotIcon} powerPlus AI Help</span>
          <button className="helpbot__close" onClick={onClose} aria-label="닫기">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555555" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="helpbot__body">
          {msgs.length === 0 && (
            <div className="helpbot__intro">
              <p>설치·검색·삽입처럼 작업창에서 막히는 것을 물어보세요.</p>
              <p>답은 도움말 문서에서 찾아 드립니다.</p>
              <div className="helpbot__chips">
                {SUGGEST.map((s) => (
                  <button key={s} className="helpbot__chip" onClick={() => ask(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m, i) =>
            m.who === "me" ? (
              <div key={i} className="helpbot__me">{m.text}</div>
            ) : (
              <div key={i} className="helpbot__bot">
                {m.text && <div className="helpbot__bot-title">{m.text}</div>}
                {m.ans?.body && <div className="helpbot__bot-body"><Linkify text={m.ans.body} /></div>}
                {m.ans?.links?.length ? (
                  <div className="helpbot__links">
                    {m.ans.links.map(([to, label]) => (
                      <button key={to + label} className="helpbot__link" onClick={() => openSite(to)}>{label} ↗</button>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          )}
          {busy && <div className="helpbot__bot helpbot__bot--busy"><span className="spinner" /> 찾는 중…</div>}
          <div ref={endRef} />
        </div>
        <form className="helpbot__form" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
          <input
            className="helpbot__input"
            value={q}
            maxLength={500}
            placeholder="궁금한 것을 적어 주세요"
            onChange={(e) => setQ(e.target.value)}
            aria-label="질문"
          />
          <button className="helpbot__send" type="submit" disabled={busy || q.trim().length < 2}>보내기</button>
        </form>
      </div>
    </div>
  );
}

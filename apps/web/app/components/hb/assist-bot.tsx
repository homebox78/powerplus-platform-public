import { ArrowUp, Bot, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ApiError, postJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Linkify } from "@/components/hb/copy";

// 우측 하단 powerPlus AI Help — 질문을 받으면 서버(/assist/ask)가 판단 모델 Jev 로 도움말 문서 하나를 고르고, 그 문서를 그대로 보여 준다.
// 답은 사람이 쓴 도움말이라 지어낸 말이 나오지 않는다. 도움말에 없으면 할 수 있는 서비스로 안내하거나 문의로 넘긴다.
type Answer = { kind: "doc" | "scope" | "none" | "unavailable"; title?: string; body?: string; message?: string; confidence?: number; links?: [string, string][] };
type Msg = { role: "user"; text: string } | { role: "bot"; a: Answer };

const SUGGEST = ["powerMCP 는 어떻게 연결하나요?", "MCP 키는 어디서 받나요?", "애드인 설치 방법", "올린 장표 파일은 언제 지워지나요?"];

export function AssistBot({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [msgs, busy]);
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => { if (e.key === "Escape") onOpenChange(false); };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [open, onOpenChange]);

  const ask = async (text: string) => {
    const t = text.trim();
    if (t.length < 2 || busy) return;
    setQ("");
    setMsgs((m) => [...m, { role: "user", text: t }]);
    setBusy(true);
    try {
      const a = await postJson<Answer>("/assist/ask", { q: t });
      setMsgs((m) => [...m, { role: "bot", a }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "bot", a: { kind: "unavailable", message: e instanceof ApiError ? e.message : "지금은 답할 수 없습니다.", links: [["/contact", "문의하기"]] } }]);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  return (
    <div role="dialog" aria-label="powerPlus AI Help"
      className="hb-pop fixed bottom-24 right-[84px] z-50 flex h-[min(560px,calc(100dvh-140px))] w-[min(380px,calc(100vw-104px))] flex-col overflow-hidden rounded-2xl bg-ground text-ink shadow-[0_16px_48px_rgba(0,0,0,.18)] ring-1 ring-line md:bottom-8 md:right-[104px]">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <span className="inline-flex size-9 items-center justify-center rounded-full bg-point text-white"><Bot className="size-5" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">powerPlus AI Help</p>
          <p className="text-xs text-ink-4">도움말에서 답을 찾아 드립니다</p>
        </div>
        <button type="button" onClick={() => onOpenChange(false)} aria-label="닫기" className="inline-flex size-9 items-center justify-center rounded-full hover:bg-ground-3"><X className="size-4" aria-hidden /></button>
      </div>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <Bubble>
          <p>무엇을 도와드릴까요?</p>
          <p>사용법·powerMCP 연결·파일 보관 같은 질문에 답합니다.</p>
        </Bubble>
        {msgs.length === 0 && (
          <div className="flex flex-col items-start gap-2">
            {SUGGEST.map((s) => (
              <button key={s} type="button" onClick={() => ask(s)} className="rounded-full bg-ground-3 px-3 py-1.5 text-left text-sm hover:bg-line">{s}</button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => m.role === "user"
          ? <div key={i} className="flex justify-end"><p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink px-3.5 py-2.5 text-sm text-ground">{m.text}</p></div>
          : <BotAnswer key={i} a={m.a} onNav={() => onOpenChange(false)} />)}
        {busy && <Bubble><span className="inline-flex gap-1" aria-label="답을 찾는 중"><Dot /><Dot d="150ms" /><Dot d="300ms" /></span></Bubble>}
      </div>

      <form className="flex items-end gap-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); void ask(q); }}>
        <textarea ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} rows={1} maxLength={500} placeholder="질문을 입력하세요" aria-label="질문"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void ask(q); } }}
          className="max-h-28 min-h-10 min-w-0 flex-1 resize-none rounded-panel bg-ground-3 px-4 py-2.5 text-sm outline-none" />
        <button type="submit" disabled={busy || q.trim().length < 2} aria-label="보내기"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-ground disabled:opacity-30"><ArrowUp className="size-4" aria-hidden /></button>
      </form>
    </div>
  );
}

function Bubble({ children }: { children: React.ReactNode }) {
  return <div className="max-w-[90%] space-y-1 rounded-2xl rounded-bl-md bg-ground-3 px-3.5 py-2.5 text-sm leading-relaxed">{children}</div>;
}

function Dot({ d = "0ms" }: { d?: string }) {
  return <span className="size-1.5 animate-bounce rounded-full bg-ink-4" style={{ animationDelay: d }} />;
}

function BotAnswer({ a, onNav }: { a: Answer; onNav: () => void }) {
  return (
    <Bubble>
      {a.title && <p className="font-bold">{a.title}</p>}
      {(a.body ?? a.message) && <p className="whitespace-pre-wrap"><Linkify text={(a.body ?? a.message) as string} /></p>}
      {!!a.links?.length && (
        <div className="flex flex-wrap gap-2 pt-1.5">
          {a.links.map(([to, label]) => (
            <Link key={to + label} to={to} onClick={onNav} className={cn("rounded-full px-3 py-1 text-xs font-bold ring-1 ring-line", "bg-ground hover:bg-line")}>{label}</Link>
          ))}
        </div>
      )}
    </Bubble>
  );
}

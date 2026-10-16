// 출처: homebox-handoff apps/web/app/components/hb/email-login.tsx — 경로 /auth/otp/*, 서버가 debug 때 주는 dev_code 표시. 이메일 OTP 는 모든 사용자의 로그인 수단(기획 §17.1)
// 인증 코드 단계 모양은 powerDeck 로그인(D:\powerDeck\web\src\screens\Login.tsx)을 따른다: 라벨·남은 시간, 6칸 입력, 보낸 상태·다시 보내기(1분 간격).
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, MailCheck, Pencil, Send, TimerOff } from "lucide-react";
import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy } from "@/components/hb/copy";
import { ApiError, postJson } from "@/lib/api";
import { cn } from "@/lib/utils";

const field = "h-11 rounded-field border-0 bg-ground-3 px-4 text-md shadow-none";
/** 코드가 살아 있는 시간(분)·다시 보내기 간격(초) — 서버 Otp 기본값과 같다 */
const CODE_TTL_MIN = 10;
const RESEND_SEC = 60;
const EMPTY = ["", "", "", "", "", ""];
const mmss = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;

export function EmailLogin({ signup, onDone, onStep }: { signup: boolean; onDone: () => void; onStep?: (sent: boolean) => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState<string[]>(EMPTY);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  // 휴면·차단은 무엇을 하면 되는지(hint)까지 보여 준다
  const msg = (e: unknown) => (e instanceof ApiError ? (e.hint && (e.code === "DORMANT" || e.code === "BLOCKED") ? `${e.message} ${e.hint}` : e.message) : "잠시 뒤에 다시 시도해 주세요.");

  const sent = sentAt !== null;
  const code = otp.join("");
  const filled = code.length === 6;
  const elapsed = sent ? Math.max(0, Math.floor((now - sentAt) / 1000)) : 0;
  const left = Math.max(0, CODE_TTL_MIN * 60 - elapsed);
  const resendIn = Math.max(0, RESEND_SEC - elapsed);

  useEffect(() => {
    if (!sent) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [sent]);

  // 보낸 직후 첫 칸에 커서 — 칸이 그려진 뒤라야 잡힌다
  useEffect(() => { if (sentAt !== null) boxes.current[0]?.focus(); }, [sentAt]);

  const focusBox = (i: number) => { const el = boxes.current[Math.max(0, Math.min(5, i))]; el?.focus(); el?.select(); };

  const request = async () => {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const r = await postJson<{ sent: boolean; dev_code?: string }>("/auth/otp/request", { email: email.trim() });
      const t = Date.now();
      setDevCode(r.dev_code ?? null); setOtp(EMPTY); setNow(t); setSentAt(t); onStep?.(true);
    } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  };
  const verify = async (c = code) => {
    if (busy || c.length !== 6) return;
    setBusy(true); setErr(null);
    try {
      await postJson("/auth/otp/verify", { email: email.trim(), code: c });
      await qc.invalidateQueries({ queryKey: ["me"] });
      onDone();
    } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  };
  const editEmail = () => { onStep?.(false); setSentAt(null); setOtp(EMPTY); setErr(null); setDevCode(null); };

  /** i 번째 칸부터 숫자를 채운다 — 한 글자면 다음 칸으로, 여러 글자(붙여넣기·자동 완성)면 차례로 */
  const put = (i: number, raw: string) => {
    const d = raw.replace(/\D/g, "");
    const next = [...otp];
    if (!d) { next[i] = ""; setOtp(next); return; }
    const from = d.length >= 6 ? 0 : i;
    [...d].slice(0, 6 - from).forEach((ch, k) => { next[from + k] = ch; });
    setOtp(next);
    focusBox(from + d.length);
  };
  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) {
      e.preventDefault();
      const next = [...otp]; next[i - 1] = ""; setOtp(next); focusBox(i - 1);
    } else if (e.key === "ArrowLeft" && i > 0) { e.preventDefault(); focusBox(i - 1); }
    else if (e.key === "ArrowRight" && i < 5) { e.preventDefault(); focusBox(i + 1); }
  };
  const onPaste = (i: number, e: ClipboardEvent<HTMLInputElement>) => { e.preventDefault(); put(i, e.clipboardData.getData("text")); };

  return (
    <form className="flex w-full flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); if (!sent) void request(); else void verify(); }}>
      {err && <Alert variant="destructive"><AlertCircle aria-hidden /><AlertDescription><Copy as="span" text={err} /></AlertDescription></Alert>}

      <div className="flex flex-col gap-1.5">
        {sent && <label htmlFor="pp-login-email" className="text-sm font-bold text-ink">이메일</label>}
        <div className="flex gap-2">
          <Input id="pp-login-email" type="email" required autoComplete="email" placeholder="이메일 주소 입력" aria-label="이메일" className={cn(field, "min-w-0 flex-1 disabled:opacity-100 disabled:text-ink-3")} value={email} disabled={sent} onChange={(e) => setEmail(e.target.value)} />
          {sent && <Button type="button" variant="outline" size="lg" className="shrink-0 rounded-field border-line-3 shadow-none" onClick={editEmail}><Pencil aria-hidden />이메일 변경</Button>}
        </div>
        {!sent && <p className="text-center text-[13px] text-ink-4">비밀번호 없이, 메일로 받은 인증번호 6자리로 들어갑니다</p>}
      </div>

      {sent && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-ink">인증번호 6자리</span>
            <span className="text-sm font-semibold tabular-nums text-point-ink" role="timer" aria-label={`남은 시간 ${mmss(left)}`}>{mmss(left)}</span>
          </div>
          <div className="grid grid-cols-6 gap-2">
            {otp.map((v, i) => (
              <input key={i} ref={(el) => { boxes.current[i] = el; }} value={v} inputMode="numeric" maxLength={6} aria-label={`인증번호 ${i + 1}번째 자리`}
                autoComplete={i === 0 ? "one-time-code" : "off"}
                className={cn("h-12 w-full min-w-0 rounded-field border bg-ground text-center text-[22px] font-bold tabular-nums text-ink outline-none transition-[border-color,box-shadow] focus:border-point focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-point)_22%,transparent)]", v ? "border-ink" : "border-line-3")}
                onChange={(e) => put(i, e.target.value)} onKeyDown={(e) => onKey(i, e)} onPaste={(e) => onPaste(i, e)} onFocus={(e) => e.target.select()} />
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 text-[13px]">
            {left > 0
              ? <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-ok"><MailCheck className="size-4 shrink-0" aria-hidden /><span className="truncate">메일로 보냈습니다</span></span>
              : <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-warn"><TimerOff className="size-4 shrink-0" aria-hidden /><span className="truncate">시간이 지났습니다 · 다시 보내 주세요</span></span>}
            <button type="button" className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap font-semibold text-point-ink hover:underline disabled:text-ink-4 disabled:no-underline"
              disabled={busy || resendIn > 0} title={resendIn > 0 ? "1분에 한 번 다시 보낼 수 있습니다" : undefined} onClick={() => void request()}>
              <Send className="size-4" aria-hidden />다시 보내기{resendIn > 0 && <span className="tabular-nums">{resendIn}s</span>}
            </button>
          </div>
          {devCode && <p className="text-xs text-ink-4">개발 환경 — 메일 대신 코드: <b className="tabular-nums text-ink">{devCode}</b></p>}
        </div>
      )}

      <Button type="submit" size="lg" className="w-full rounded-field disabled:border-line-3 disabled:bg-ground-3 disabled:text-ink-4 disabled:opacity-100" disabled={busy || (sent ? !filled : !email.trim())}>
        {!sent ? (busy ? "보내는 중…" : "인증번호 받기") : busy ? "확인 중…" : signup ? "가입하기" : "로그인"}
      </Button>
    </form>
  );
}

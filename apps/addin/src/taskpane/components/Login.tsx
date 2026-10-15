// 작업창 로그인 — 출처: powerPlus addin/src/taskpane/components/Login.tsx.
import * as React from "react";
import { requestCode, verifyCode } from "../api/auth";

/** 이메일 OTP 로그인. 1단계 이메일 입력 → 2단계 인증코드 입력. */
export default function Login({ onSuccess }: { onSuccess: (email: string) => void }) {
  const [step, setStep] = React.useState<"email" | "code">("email");
  const [email, setEmail] = React.useState("");
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [info, setInfo] = React.useState("");

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setBusy(true);
    try {
      const r = await requestCode(email.trim());
      setStep("code");
      setInfo(r.devCode ? `개발용 코드: ${r.devCode}` : "6자리 인증코드를 이메일로 보냈습니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "요청에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await verifyCode(email.trim(), code.trim());
      onSuccess(email.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "인증에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login__card">
        <div className="login__logo" aria-hidden>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z" /><path d="m7 16.5-4.74-2.85" /><path d="m7 16.5 5-3" /><path d="M7 16.5v5.17" /><path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z" /><path d="m17 16.5-5-3" /><path d="m17 16.5 4.74-2.85" /><path d="M17 16.5v5.17" /><path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z" /><path d="M12 8 7.26 5.15" /><path d="m12 8 4.74-2.85" /><path d="M12 13.5V8" /></svg>
        </div>
        <h1 className="login__title">power<b>Assets</b></h1>
        <p className="login__subtitle">powerPlus 계정으로 로그인</p>

        {step === "email" ? (
          <form onSubmit={handleRequest} className="login__form">
            <label className="login__label" htmlFor="login-email">
              이메일
            </label>
            <input
              id="login-email"
              className="login__input"
              type="email"
              autoComplete="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
            <button className="login__btn" type="submit" disabled={busy || !email.trim()}>
              {busy ? "전송 중…" : "인증코드 받기"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="login__form">
            <label className="login__label" htmlFor="login-code">
              인증코드 ({email})
            </label>
            <input
              id="login-code"
              className="login__input login__input--code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              required
              autoFocus
            />
            <button className="login__btn" type="submit" disabled={busy || code.length < 6}>
              {busy ? "확인 중…" : "로그인"}
            </button>
            <button
              type="button"
              className="login__link"
              onClick={() => {
                setStep("email");
                setCode("");
                setError("");
                setInfo("");
              }}
            >
              이메일 다시 입력
            </button>
          </form>
        )}

        {info && <p className="login__info">{info}</p>}
        {error && <p className="login__error">{error}</p>}
      </div>
    </div>
  );
}

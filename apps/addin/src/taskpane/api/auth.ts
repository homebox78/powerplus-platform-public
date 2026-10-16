// 이메일 OTP 로그인 — 확인되면 서버가 "powerAssets 애드인" 키를 발급하고, 작업창은 그 키를 Bearer 로 쓴다(Office 웹 작업창은 쿠키가 막힐 수 있다).
// 출처: powerPlus addin/src/taskpane/api/auth.ts. 경로만 플랫폼(/auth/otp/request · /addin/login · /addin/logout)으로.
import { api, getToken } from "./config";

export { getToken };
const TOKEN_KEY = "pa_token";
const EMAIL_KEY = "pa_email";

export function getEmail(): string | null {
  try { return localStorage.getItem(EMAIL_KEY); } catch { return null; }
}

function setSession(token: string, email: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(EMAIL_KEY, email);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EMAIL_KEY);
}

interface RequestCodeResult {
  /** 개발 서버(debug)일 때만 서버가 코드를 내려준다. */
  devCode?: string;
}

export async function requestCode(email: string): Promise<RequestCodeResult> {
  const r = await api<{ dev_code?: string }>("/auth/otp/request", { method: "POST", body: { email } });
  return { devCode: r.data?.dev_code };
}

export async function verifyCode(email: string, code: string): Promise<void> {
  const r = await api<{ token: string; email: string }>("/addin/login", { method: "POST", body: { email, code } });
  setSession(r.data.token, r.data.email);
}

export async function logout(): Promise<void> {
  try {
    if (getToken()) await api("/addin/logout", { method: "POST", body: {} });
  } catch {
    // 네트워크 오류는 무시 — 로컬은 아래에서 정리
  }
  clearSession();
}

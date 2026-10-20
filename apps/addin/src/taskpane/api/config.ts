// powerAssets 애드인 — 플랫폼 REST(/api/v1) 하나만 쓴다.
// 출처: powerPlus addin/src/taskpane/api/config.ts. 옛 서버(hom2box.com/powerPlus) 대신 같은 출처(powerplus.hom2box.com)를 부른다.
// 작업창이 플랫폼에서 서비스되면 같은 출처 상대 경로, 로컬 개발(webpack dev)은 운영 주소.
const IS_DEV_HOST = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
export const SITE_BASE = IS_DEV_HOST ? "https://powerplus.hom2box.com" : window.location.origin;
const API_BASE = SITE_BASE + "/api/v1";

const TOKEN_KEY = "pa_token";

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

/** 로그인이 필요(401)함을 알리는 전용 에러 — 상위에서 로그인 화면으로 전환. */
export class AuthRequiredError extends Error {}

/** 플랫폼 응답 { data, total, ... } 와 오류 { error, code } 를 다룬다. 쓰기 요청엔 X-Requested-With(CSRF 규약). */
export async function api<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {}
): Promise<{ data: T; total?: number; [k: string]: unknown }> {
  const token = getToken();
  const headers: Record<string, string> = { "X-Requested-With": "powerAssets" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(API_BASE + path, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: init.signal,
    cache: "no-store",
  });
  if (res.status === 401) throw new AuthRequiredError("로그인이 필요합니다.");
  if (res.status === 204) return { data: undefined as T };
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body && body.error) || `서버 응답 ${res.status}`);
  return body;
}

/** 방문자 통계(관리자 › 방문자 통계, 2026-10-20) — 작업창이 열릴 때·탭을 바꿀 때 한 줄(channel addin). 결과는 기다리지 않는다.
 *  애드인 API 호출은 키 호출로 세지 않으므로(Keys::actorFor) 이 알림이 애드인 이용의 기준이다. */
export function trackAddin(path: string): void {
  try {
    const rand = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("").slice(0, 16);
    let vid = "", sid = "";
    try {
      vid = localStorage.getItem("pp_vid") || ""; if (!vid) { vid = rand(); localStorage.setItem("pp_vid", vid); }
      const at = Number(sessionStorage.getItem("pp_sid_at") || 0);
      sid = sessionStorage.getItem("pp_sid") || "";
      if (!sid || Date.now() - at > 30 * 60_000) { sid = rand(); sessionStorage.setItem("pp_sid", sid); }
      sessionStorage.setItem("pp_sid_at", String(Date.now()));
    } catch { vid = vid || rand(); sid = sid || rand(); }
    const headers: Record<string, string> = { "Content-Type": "application/json", "X-Requested-With": "powerAssets" };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    void fetch(API_BASE + "/stats/hit", { method: "POST", headers, keepalive: true, cache: "no-store",
      body: JSON.stringify({ path, vid, sid, channel: "addin", w: window.innerWidth, lang: navigator.language }) }).catch(() => {});
  } catch { /* 통계는 실패해도 작업창에 영향 없음 */ }
}

/** 서버가 준 /api/v1/... 경로를 절대 주소로. */
export function abs(u?: string | null): string | undefined {
  if (!u) return undefined;
  return /^https?:/i.test(u) ? u : SITE_BASE + u;
}

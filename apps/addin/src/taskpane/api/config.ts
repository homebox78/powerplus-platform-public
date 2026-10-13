// powerAssets 애드인 — 플랫폼 REST(/api/v1) 하나만 쓴다.
// 출처: powerPlus addin/src/taskpane/api/config.ts. 옛 서버(hom2box.com/powerPlus) 대신 같은 출처(powerplus.hom2box.com)를 부른다.
// 작업창이 플랫폼에서 서비스되면 같은 출처 상대 경로, 로컬 개발(webpack dev)은 운영 주소.
const IS_DEV_HOST = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
export const SITE_BASE = IS_DEV_HOST ? "https://powerplus.hom2box.com" : window.location.origin;
export const API_BASE = SITE_BASE + "/api/v1";

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

/** 서버가 준 /api/v1/... 경로를 절대 주소로. */
export function abs(u?: string | null): string | undefined {
  if (!u) return undefined;
  return /^https?:/i.test(u) ? u : SITE_BASE + u;
}

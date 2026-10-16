// 출처: homebox-handoff apps/web/app/lib/api.ts — REST v1 규약(기획 §10·설계서 §2.2)으로 변경:
// base 는 /api/v1, 성공 {data,total?,page?,limit?,meta?} / 실패 {error,code,hint?}. 상태 변경 요청은 X-Requested-With 필수(CSRF).
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public hint?: string) {
    super(message);
  }
}

export const apiBase = "/api/v1";

interface ListResult<T> { data: T[]; total?: number; page?: number; limit?: number; meta?: Record<string, unknown> }

/** 응답 봉투를 벗겨 data 만 돌려준다. 204 는 null. */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  headers.set("X-Requested-With", "powerplus");
  const res = await fetch(`${apiBase}${path}`, { credentials: "same-origin", ...init, headers });
  if (res.status === 204) return null as T;
  const body = (await res.json().catch(() => null)) as { data?: T; error?: string; code?: string; hint?: string } | null;
  if (!res.ok) {
    throw new ApiError(res.status, body?.code ?? "HTTP_ERROR", body?.error ?? `HTTP ${res.status}`, body?.hint);
  }
  return (body?.data ?? body) as T;
}

/** 목록 응답은 봉투째(total·page 가 필요하다). */
export async function apiList<T>(path: string, init?: RequestInit): Promise<ListResult<T>> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  headers.set("X-Requested-With", "powerplus");
  const res = await fetch(`${apiBase}${path}`, { credentials: "same-origin", ...init, headers });
  const body = (await res.json().catch(() => null)) as (ListResult<T> & { error?: string; code?: string; hint?: string }) | null;
  if (!res.ok || !body) throw new ApiError(res.status, body?.code ?? "HTTP_ERROR", body?.error ?? `HTTP ${res.status}`, body?.hint);
  return body;
}

export const postJson = <T,>(path: string, body: unknown, method: "POST" | "PATCH" | "PUT" = "POST") =>
  apiFetch<T>(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// 출처: homebox-handoff apps/web/app/lib/auth.ts — Actor 응답(설계서 §2.2: user·kind·plan·roles·via)으로 변경
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, postJson } from "@/lib/api";

export type Provider = "google" | "naver" | "kakao" | "email";
export type Role = "superadmin" | "admin" | "curator" | "support";

export interface Me {
  user: { id: string; email: string | null; name: string | null; avatar_url: string | null; birthday: string | null; marketing_opt_in: boolean; name_changed_at: string | null; created_at: string | null } | null;
  kind: "staff" | "external" | "anon" | "worker";
  plan: "staff" | "free" | "pro" | "team";
  roles: Role[];
  via: "session" | "key" | "worker" | "none";
  logins?: Array<{ provider: Provider; email: string | null; email_verified: 0 | 1; last_login_at: string | null }>;
  limits?: { api_daily: number };
  billing_visible?: boolean;
  /** 가입 동의 상태 — required 면 웹이 동의 화면을 띄우고, 서버는 로그인 기능을 428 로 막는다. */
  consent?: { required: boolean; version: string; missing: string[]; agreed_at: string | null };
}

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: () => apiFetch<Me>("/me"),
  staleTime: 60_000,
});

/** 로그인한 사용자면 me.user 가 있다. superadmin 은 admin 이하 역할을 전부 가진 것으로 본다(서버 Actor::hasRole 과 같은 규칙). */
export function useMe() {
  const q = useQuery(meQuery);
  const me = q.data && q.data.user ? q.data : null;
  const has = (r: Role) => !!me && (me.roles.includes("superadmin") || me.roles.includes(r) || (r !== "superadmin" && me.roles.includes("admin")));
  return { me, loading: q.isLoading, isAdmin: has("admin"), hasRole: has };
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<null>("/auth/logout", { method: "POST" }),
    onSuccess: () => { qc.setQueryData(meQuery.queryKey, undefined); void qc.invalidateQueries({ queryKey: ["me"] }); },
  });
}

/** 소셜 로그인 시작 — 전체 페이지 이동 */
export function oauthUrl(provider: Exclude<Provider, "email">, next = "/"): string {
  return `/api/v1/auth/${provider}?next=${encodeURIComponent(next)}`;
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string; marketing_opt_in?: boolean; birthday?: string | null }) => postJson<Me>("/me", body, "PATCH"),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["me"] }),
  });
}

export const PROVIDER_KO: Record<string, string> = { google: "Google", naver: "네이버", kakao: "카카오", email: "이메일" };
export const PLAN_KO: Record<Me["plan"], string> = { staff: "임직원", free: "Free", pro: "Pro", team: "Team" };

/** 프로필 사진 올리기(multipart) / 지우기 */
export function useAvatar() {
  const qc = useQueryClient();
  const done = () => void qc.invalidateQueries({ queryKey: ["me"] });
  const upload = useMutation({ mutationFn: (file: File) => { const fd = new FormData(); fd.append("file", file); return apiFetch<Me>("/me/avatar", { method: "POST", body: fd }); }, onSuccess: done });
  const remove = useMutation({ mutationFn: () => apiFetch<Me>("/me/avatar", { method: "DELETE" }), onSuccess: done });
  return { upload, remove };
}

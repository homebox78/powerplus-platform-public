// 출처: homebox-handoff apps/web/app/lib/community.ts — REST v1 봉투(apiFetch/apiList/postJson)·글 id 는 public_id(문자열)·관련 기관 대신 모듈 연결
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiList, postJson } from "@/lib/api";
import { useMe } from "@/lib/auth";

export interface CommunityAuthor { id: string; name: string; avatar: string | null; admin: boolean; staff: boolean }
interface CommunityCategory { id: string; name: string; desc: string; count: number }
export interface CommunityPostItem {
  id: string; category: string; title: string; excerpt: string; locked?: boolean; module: string | null; pinned: boolean;
  comments: number; likes: number; views: number; created_at: string; author: CommunityAuthor;
}
interface CommunityComment { id: number; body: string; created_at: string; author: CommunityAuthor; can_delete: boolean }
interface CommunityPost {
  id: string; category: string; title: string; body: string; module: string | null; pinned: boolean;
  likes: number; views: number; created_at: string; updated_at: string; author: CommunityAuthor;
  liked: boolean; can_edit: boolean; comments: CommunityComment[];
}
export interface NotificationItem { id: number; kind: string; title: string; body?: string | null; link: string | null; read: boolean; created_at: string }

export const categoriesQuery = queryOptions({
  queryKey: ["community", "categories"],
  queryFn: () => apiFetch<{ items: CommunityCategory[]; total: number; can_notice: boolean; can_staff: boolean }>("/community/categories"),
  staleTime: 30_000,
});

export const postsQuery = (p: { category?: string; q?: string; sort?: "new" | "popular"; mine?: boolean }) =>
  queryOptions({
    queryKey: ["community", "posts", p],
    queryFn: async () => {
      const s = new URLSearchParams();
      if (p.category) s.set("category", p.category);
      if (p.q) s.set("q", p.q);
      if (p.sort === "popular") s.set("sort", "popular");
      if (p.mine) s.set("mine", "1");
      s.set("limit", "50");
      const r = await apiList<CommunityPostItem>(`/community/posts?${s}`);
      return { items: r.data, total: r.total ?? r.data.length };
    },
    staleTime: 15_000,
  });

export const postQuery = (id: string) =>
  queryOptions({ queryKey: ["community", "post", id], queryFn: () => apiFetch<CommunityPost>(`/community/posts/${id}`), staleTime: 5_000 });

export function useCommunityMutations() {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ["community"] });
  return {
    create: useMutation({ mutationFn: (b: { category: string; title: string; body: string; module?: string | null }) => postJson<{ id: string }>("/community/posts", b), onSuccess: refresh }),
    update: useMutation({ mutationFn: ({ id, ...b }: { id: string; category?: string; title?: string; body?: string; module?: string | null }) => postJson<null>(`/community/posts/${id}`, b, "PATCH"), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (id: string) => apiFetch<null>(`/community/posts/${id}`, { method: "DELETE" }), onSuccess: refresh }),
    comment: useMutation({ mutationFn: ({ id, body }: { id: string; body: string }) => postJson<{ id: number }>(`/community/posts/${id}/comments`, { body }), onSuccess: refresh }),
    removeComment: useMutation({ mutationFn: (id: number) => apiFetch<null>(`/community/comments/${id}`, { method: "DELETE" }), onSuccess: refresh }),
    like: useMutation({ mutationFn: (id: string) => postJson<{ liked: boolean; likes: number }>(`/community/posts/${id}/like`, {}), onSuccess: refresh }),
  };
}

interface UnreadLatest { id: number; kind: string; title: string; body: string | null; link: string | null }

/** 헤더 종: 안 읽은 개수와 가장 최근 안 읽은 알림 — 30초마다·창으로 돌아올 때 다시 가져온다(창이 숨으면 멈춤) */
export function useUnread() {
  const { me } = useMe();
  const q = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: () => apiFetch<{ count: number; latest: UnreadLatest | null }>("/notifications/unread"),
    enabled: !!me, refetchInterval: 30_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true, staleTime: 10_000,
  });
  return { count: q.data?.count ?? 0, latest: q.data?.latest ?? null };
}

interface NotifyPref { id: string; label: string; desc: string; mail: boolean }
export function useNotifyPrefs() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notifications", "prefs"], queryFn: () => apiFetch<{ email: string; items: NotifyPref[] }>("/notifications/prefs") });
  const save = useMutation({
    mutationFn: (mail: Record<string, boolean>) => postJson<{ mail: Record<string, boolean> }>("/notifications/prefs", { mail }, "PUT"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", "prefs"] }),
  });
  return { q, save };
}

export function useNotifications(enabled: boolean) {
  return useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => apiFetch<{ items: NotificationItem[]; unread: number }>("/notifications?limit=30"),
    enabled, staleTime: 5_000,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { ids?: number[]; all?: boolean }) => postJson<{ unread: number }>("/notifications/read", b),
    onSuccess: (r) => { qc.setQueryData(["notifications", "unread"], { count: r.unread }); void qc.invalidateQueries({ queryKey: ["notifications", "list"] }); },
  });
}

/** 방금·N분 전·N시간 전, 그 외 YYYY.MM.DD */
export function shortDate(s: string): string {
  const d = new Date(s.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return s.slice(0, 10).replaceAll("-", ".");
  const now = new Date();
  const mins = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  if (d.toDateString() === now.toDateString()) return `${Math.floor(mins / 60)}시간 전`;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

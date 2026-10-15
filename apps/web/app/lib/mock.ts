// powerMock 시안·갤러리·포인트 — api/routes/mock.php 와 짝. 출처: homebox-handoff apps/web/app/lib/gallery.ts 를 REST v1 봉투로.
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiList, postJson } from "@/lib/api";

export interface MockupItem {
  id: string; token: string; title: string; ref_id: string | null; device: "pc" | "mobile"; bytes: number;
  score: number | null; passed: boolean | null; check_count: number; published: boolean; path: string | null; views: number;
  thumb_url: string | null; discarded: boolean; expires_at: string; created_at: string; checked_at: string | null;
  gallery: { id: number; status: "study" | "shared" | "hidden"; likes: number; unlocks: number } | null;
}
export interface GalleryOwner { name: string; avatar: string | null; badge: { id: string; name: string } | null }
export interface GalleryItem {
  id: number; title: string; score: number; device: "pc" | "mobile"; kind: "mix" | "single"; thumb_url: string;
  /** 메인·서브 구분, 서브의 페이지 유형(greeting·board_list…), 세트 열쇠(메인 token)와 보이는 범위 안 세트 장수 */
  role?: "main" | "sub"; page?: string | null; set?: string; set_size?: number;
  status: "study" | "shared" | "hidden"; likes: number; views: number; unlocks: number; note: string | null;
  owner: GalleryOwner; mine: boolean; liked: boolean; unlocked: boolean; created_at: string; shared_at: string | null;
}
export interface GalleryNotes {
  summary: string; height: unknown; similarity: unknown; sources: unknown;
  frame: { left: number | null; right: number | null; gap: number | null; row_gap: number | null } | null; fixes: string[];
  /** 감점 없는 참고 사항(판정 notes) — 서버가 문자열로 정리해 준다 */
  notes?: string[];
}
/** 내 시안 상세용 판정 요약 — GET /mock/mockups/{token} 의 check(판정 결과 원문 일부) */
export interface MockupCheck { summary?: string; fixes?: Array<string | { message?: string }>; notes?: Array<string | { message?: string }> }
export interface Leader { name: string; avatar: string | null; points: number; shared: number; badge: { id: string; name: string } | null }
export interface PointsInfo {
  points: number; ledger: Array<{ delta: number; reason: string; name: string; created_at: string }>;
  rules: Array<{ reason: string; points: number; name: string; daily_cap: number | null }>; unlock_cost: number; cut: number;
}

export const myMockupsQuery = queryOptions({
  queryKey: ["mock", "mine"],
  queryFn: async () => { const r = await apiList<MockupItem>("/mock/mockups?limit=100"); return { items: r.data, total: r.total ?? r.data.length, meta: (r.meta ?? {}) as { cut?: number; points?: number } }; },
  staleTime: 10_000,
});

export const galleryQuery = (p: { view: "shared" | "mine"; sort: "popular" | "new" | "score"; type?: "all" | "main" | "sub"; set?: string }) =>
  queryOptions({
    queryKey: ["mock", "gallery", p],
    queryFn: async () => {
      const r = await apiList<GalleryItem>(`/mock/gallery?view=${p.view}&sort=${p.sort}&limit=60${p.type && p.type !== "all" ? `&type=${p.type}` : ""}${p.set ? `&set=${encodeURIComponent(p.set)}` : ""}`);
      return { items: r.data, total: r.total ?? r.data.length, meta: (r.meta ?? {}) as { points?: number | null; unlock_cost?: number; cut?: number } };
    },
    staleTime: 10_000,
  });

export const leadersQuery = queryOptions({ queryKey: ["mock", "leaders"], queryFn: () => apiFetch<{ items: Leader[] }>("/mock/gallery/leaders"), staleTime: 60_000 });
export const galleryDetailQuery = (id: number | null) =>
  queryOptions({
    queryKey: ["mock", "gallery", "detail", id],
    queryFn: () => apiFetch<{ item: GalleryItem; notes: GalleryNotes | null; html_url: string | null; points: number | null; unlock_cost: number }>(`/mock/gallery/${id}`),
    enabled: id !== null, staleTime: 5_000,
  });
export const pointsQuery = (enabled: boolean) => queryOptions({ queryKey: ["mock", "points"], queryFn: () => apiFetch<PointsInfo>("/mock/points"), enabled, staleTime: 10_000 });

export function useMockMutations() {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ["mock"] });
  return {
    remove: useMutation({ mutationFn: (token: string) => apiFetch<null>(`/mock/mockups/${token}`, { method: "DELETE" }), onSuccess: refresh }),
    publish: useMutation({ mutationFn: (token: string) => postJson<MockupItem>("/mock/mockups", { mode: "publish", token }), onSuccess: refresh }),
    unlock: useMutation({ mutationFn: (id: number) => postJson<{ ok: boolean; points: number }>(`/mock/gallery/${id}/unlock`, {}), onSuccess: refresh }),
    like: useMutation({ mutationFn: (id: number) => postJson<{ liked: boolean; likes: number }>(`/mock/gallery/${id}/like`, {}), onSuccess: refresh }),
    share: useMutation({ mutationFn: ({ id, title, note }: { id: number; title?: string; note?: string }) => postJson<{ ok: boolean; awarded: number; points: number }>(`/mock/gallery/${id}/share`, { title, note }), onSuccess: refresh }),
    hide: useMutation({ mutationFn: (id: number) => postJson<{ ok: boolean }>(`/mock/gallery/${id}/hide`, {}), onSuccess: refresh }),
  };
}

export const useGalleryDetail = (id: number | null) => useQuery(galleryDetailQuery(id));
export const fmtDate = (s: string | null | undefined) => (s ? s.slice(0, 10).replace(/-/g, ".") : "—");

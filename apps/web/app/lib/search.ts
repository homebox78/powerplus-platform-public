// 통합 검색 데이터 — /api/v1/search (api/routes/search.php 와 1:1). 가이드 탭은 정적 데이터라 화면에서 거른다.
import { queryOptions } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export type SearchType = "assets" | "community" | "deck" | "mockups";
interface SearchAsset { type: "asset"; id: string; title: string; category: string; category_ko: string; visibility: string; ai: boolean; thumb_url: string | null; url: string }
interface SearchPost { type: "post"; id: string; title: string; category: string; excerpt: string; author: string; comments: number; likes: number; created_at: string; url: string }
interface SearchDeck { type: "deck"; id: string; title: string | null; filename: string | null; status: string; slides: number | null; created_at: string; url: string }
interface SearchMockup { type: "mockup"; id: string; title: string; score: number | null; passed: boolean | null; device: string | null; published: boolean; discarded: boolean; created_at: string; url: string; preview_url: string }
type SearchItem = SearchAsset | SearchPost | SearchDeck | SearchMockup;
interface SearchResult { q: string; type: SearchType; counts: Record<SearchType, number>; items: SearchItem[]; signed_in?: boolean }

export const searchQuery = (q: string, type: SearchType) =>
  queryOptions({
    queryKey: ["search", q, type],
    queryFn: () => apiFetch<SearchResult>(`/search?q=${encodeURIComponent(q)}&type=${type}&limit=48`),
    enabled: q.length > 0,
    staleTime: 30_000,
  });

/** 가이드 탭 — 부품 카탈로그(키트 registry)와 같은 원천 */
interface KitRegistry { version: string; groups: [string, string][]; metas: { id: string; title: string; group: string; source: "krds" | "shadcn" | "both"; note?: string }[] }
export const kitRegistryQuery = queryOptions({
  queryKey: ["kit-registry"],
  queryFn: async () => (await fetch("/kit-files/registry.json")).json() as Promise<KitRegistry>,
  staleTime: Infinity,
});

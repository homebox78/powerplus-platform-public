// 에셋 목록·주제·추천어·비슷한·세트 — 출처: powerPlus addin/src/taskpane/api/assets.ts.
// 플랫폼 /api/v1/assets/* 로 바꾸고, 응답(hydrate 형)을 옛 작업창의 Asset 모양으로 맞춘다(id = public_id).
// 서버 미연결 시 로컬 mock 폴백은 그대로 둔다(오프라인 데모).
import type { Asset } from "../data/mockAssets";
import { filterAssets } from "../data/mockAssets";
import { api, abs, AuthRequiredError } from "./config";

export { AuthRequiredError };

interface Item {
  id: string;
  category: string;
  name: string | null;
  alt?: string | null;
  slide_kind?: string | null;
  slide_page?: string | null;
  thumb_url?: string | null;
  keywords?: string[];
  set?: { id: string; name: string } | null;
}

interface FetchResult {
  assets: Asset[];
  total: number;
  offline: boolean;
  corrected?: Record<string, string> | null;
}

const file = (id: string, kind: string) => abs(`/api/v1/assets/items/${encodeURIComponent(id)}/file/${kind}`);

/** 플랫폼 에셋 → 작업창 Asset. 원본·장표는 삽입할 때 Bearer 로 받는다(useInsert). */
function toAsset(x: Item): Asset {
  return {
    id: x.id,
    name: x.name ?? x.alt ?? null,
    category: x.category,
    tags: x.keywords ?? [],
    thumb_url: abs(x.thumb_url),
    image_url: x.category === "ppt" ? abs(x.thumb_url) : file(x.id, "original"),
    slide_url: x.category === "ppt" ? file(x.id, "slide") : undefined,
    slide_kind: x.slide_kind ?? undefined,
    slide_page: x.slide_page ?? undefined,
  };
}

const SORT: Record<string, string> = { latest: "newest", popular: "popular", name: "name", favorites: "popular" };

export async function fetchAssets(
  category: string,
  query: string,
  page = 1,
  limit = 60,
  signal?: AbortSignal,
  sort: string = "latest",
  kind: string = "",
  ptype: string = "",
  topic: string = ""
): Promise<FetchResult> {
  const p = new URLSearchParams({ page: String(page), limit: String(limit), sort: SORT[sort] ?? "newest", channel: "addin" });
  if (category && category !== "all") p.set("category", category);
  if (query.trim()) p.set("q", query.trim());
  if (kind) p.set("slide_kind", kind);
  if (ptype) p.set("slide_page", ptype);
  if (topic) p.set("tag", topic);
  try {
    const r = await api<Item[]>(`/assets/items?${p}`, { signal });
    return { assets: (r.data || []).map(toAsset), total: Number(r.total ?? 0), offline: false, corrected: null };
  } catch (e) {
    if (signal?.aborted || e instanceof AuthRequiredError) throw e;
    const all = filterAssets(category, query);
    return { assets: page === 1 ? all : [], total: all.length, offline: true };
  }
}

export interface Topic {
  key: string;
  label: string;
  count: number;
}

/** 카테고리 안의 주제(많이 붙은 키워드). 실패하면 빈 배열 — 주제 줄만 안 보인다. */
export async function fetchTopics(category: string, signal?: AbortSignal): Promise<Topic[]> {
  if (!category || category === "all") return [];
  try {
    const r = await api<{ topics: Array<{ tag: string; count: number }> }>(`/assets/topics?category=${encodeURIComponent(category)}`, { signal });
    return (r.data?.topics ?? []).slice(0, 12).map((t) => ({ key: t.tag, label: t.tag, count: t.count }));
  } catch {
    return [];
  }
}


/** 즐겨찾기·최근: id 목록으로 그 에셋만(받은 순서대로). */
export async function fetchByIds(ids: string[], signal?: AbortSignal): Promise<Asset[]> {
  if (!ids.length) return [];
  try {
    const r = await api<Item[]>(`/assets/items?limit=120&ids=${encodeURIComponent(ids.slice(0, 120).join(","))}`, { signal });
    const map = new Map((r.data || []).map((x) => [x.id, toAsset(x)]));
    return ids.map((id) => map.get(id)).filter((a): a is Asset => !!a);
  } catch (e) {
    if (signal?.aborted || e instanceof AuthRequiredError) throw e;
    const set = new Set(ids);
    return filterAssets("all", "").filter((a) => set.has(a.id));
  }
}

export async function fetchSimilar(id: string, limit = 12, signal?: AbortSignal): Promise<Asset[]> {
  try {
    const r = await api<Item[]>(`/assets/items/${encodeURIComponent(id)}/similar?limit=${limit}`, { signal });
    return (r.data || []).map(toAsset);
  } catch (e) {
    if (signal?.aborted || e instanceof AuthRequiredError) throw e;
    return [];
  }
}

/** 같은 스타일 세트 — 그 에셋이 속한 세트를 통째로. 세트가 없으면 빈 목록. */
const setOf = new Map<string, string | null>();
export async function fetchStyleSet(id: string, page = 1, limit = 60, signal?: AbortSignal): Promise<{ data: Asset[]; total: number }> {
  try {
    if (!setOf.has(id)) {
      const d = await api<Item>(`/assets/items/${encodeURIComponent(id)}`, { signal });
      setOf.set(id, d.data?.set?.id ?? null);
    }
    const sid = setOf.get(id);
    if (!sid) return { data: [], total: 0 };
    const r = await api<Item[]>(`/assets/items?set=${encodeURIComponent(sid)}&page=${page}&limit=${limit}`, { signal });
    return { data: (r.data || []).map(toAsset), total: Number(r.total ?? 0) };
  } catch (e) {
    if (signal?.aborted || e instanceof AuthRequiredError) throw e;
    return { data: [], total: 0 };
  }
}

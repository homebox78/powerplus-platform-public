// 사이트 품질 개선 체크리스트 — /api/v1/admin/site/checklist (api/routes/site_checklist.php, 관리자·큐레이터).
// 출처: lib/deck-checklist.ts 를 사이트 전체 품질용으로(엔진 되먹임 lessons·fed 는 없다).
import { apiFetch, apiList, postJson } from "@/lib/api";
import type { BulkResult } from "@/lib/admin-bulk2";

export type SiteChecklistStatus = "open" | "fixing" | "fixed" | "watch" | "wontfix";
export type SiteChecklistOrigin = "audit" | "test" | "user" | "manual";
export interface SiteChecklistEvidence { at?: string; by?: string; verdict?: string; target?: string; how?: string; note?: string }
export interface SiteChecklistItem {
  id: number; slug: string; area: string; area_name: string; title: string; detail: string | null;
  origin: SiteChecklistOrigin; status: SiteChecklistStatus; hits: number; regressed: boolean;
  fix_note: string | null; fix_commit: string | null; first_seen: string; last_seen: string; fixed_at: string | null;
  evidence?: SiteChecklistEvidence[];
}
export interface SiteChecklistMeta {
  counts: Record<string, { n: number; hits: number }>;
  open_by_area: Record<string, number>;
  areas: Array<{ id: string; name: string }>;
}

export const SITE_STATUS_KO: Record<SiteChecklistStatus, string> = { open: "열림", fixing: "고치는 중", fixed: "고침", watch: "지켜봄", wontfix: "안 고침" };
export const SITE_ORIGIN_KO: Record<SiteChecklistOrigin, string> = { audit: "품질 판정", test: "시험", user: "사용자 의견", manual: "직접" };

const qs = (o: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const fetchSiteChecklist = (o: { status?: string; area?: string; origin?: string; q?: string; sort?: string }) =>
  apiList<SiteChecklistItem>(`/admin/site/checklist${qs(o)}`);
export const fetchSiteChecklistItem = (id: number) => apiFetch<SiteChecklistItem>(`/admin/site/checklist/${id}`);
export const updateSiteChecklistItem = (id: number, body: Partial<Pick<SiteChecklistItem, "status" | "fix_note" | "fix_commit" | "title" | "detail" | "area">>) =>
  postJson<SiteChecklistItem>(`/admin/site/checklist/${id}`, body);
export const addSiteChecklistItem = (body: { area: string; title: string; detail?: string; fix_note?: string }) =>
  postJson<{ id: number; created: boolean }>("/admin/site/checklist", body);
export const bulkSiteChecklist = (b: { status: SiteChecklistStatus; ids: number[] }) =>
  postJson<BulkResult>("/admin/bulk/site/checklist", b);

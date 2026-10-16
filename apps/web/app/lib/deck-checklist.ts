// powerDeck 개선 체크리스트 — /api/v1/admin/deck/checklist (api/routes/deck_checklist.php, 관리자·큐레이터).
// 출처: lib/mock-checklist.ts 를 장표용으로. 열린 항목 중 두 번 이상 걸린 것(또는 다시 걸린 것)은 엔진 프롬프트에 규칙으로 들어간다.
import { apiFetch, apiList, postJson } from "@/lib/api";
import type { BulkResult } from "@/lib/admin-bulk2";

export type DeckChecklistStatus = "open" | "fixing" | "fixed" | "watch" | "wontfix";
export type DeckChecklistOrigin = "wire" | "report" | "user" | "fail" | "manual";
export interface DeckChecklistEvidence { at?: string; job?: string | null; title?: string | null; slide?: number | null; note?: string | null; url?: string }
export interface DeckChecklistItem {
  id: number; slug: string; area: string; area_name: string; title: string; detail: string | null;
  origin: DeckChecklistOrigin; status: DeckChecklistStatus; hits: number; regressed: boolean; fed: boolean;
  fix_note: string | null; fix_commit: string | null; first_seen: string; last_seen: string; fixed_at: string | null;
  evidence?: DeckChecklistEvidence[];
}
export interface DeckChecklistMeta {
  counts: Record<string, { n: number; hits: number }>;
  open_by_area: Record<string, number>;
  areas: Array<{ id: string; name: string }>;
}
interface DeckLesson { id: number; area: string; hits: number; text: string }

export const DECK_STATUS_KO: Record<DeckChecklistStatus, string> = { open: "열림", fixing: "고치는 중", fixed: "고침", watch: "지켜봄", wontfix: "안 고침" };
export const DECK_ORIGIN_KO: Record<DeckChecklistOrigin, string> = { wire: "와이어 검사", report: "엔진 보고", user: "사용자 의견", fail: "실패", manual: "직접" };

const qs = (o: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const fetchDeckChecklist = (o: { status?: string; area?: string; origin?: string; q?: string; sort?: string }) =>
  apiList<DeckChecklistItem>(`/admin/deck/checklist${qs(o)}`);
export const fetchDeckChecklistItem = (id: number) => apiFetch<DeckChecklistItem>(`/admin/deck/checklist/${id}`);
export const fetchDeckLessons = () => apiFetch<DeckLesson[]>("/admin/deck/checklist/lessons");
export const updateDeckChecklistItem = (id: number, body: Partial<Pick<DeckChecklistItem, "status" | "fix_note" | "fix_commit" | "title" | "detail" | "area">>) =>
  postJson<DeckChecklistItem>(`/admin/deck/checklist/${id}`, body);
export const addDeckChecklistItem = (body: { area: string; title: string; detail?: string; fix_note?: string }) =>
  postJson<{ id: number; created: boolean }>("/admin/deck/checklist", body);
export const bulkDeckChecklist = (b: { status: DeckChecklistStatus; ids: number[] }) =>
  postJson<BulkResult>("/admin/bulk/deck/checklist", b);

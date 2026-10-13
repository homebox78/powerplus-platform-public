// powerMock 개선 체크리스트 — /api/v1/admin/mock/checklist (api/routes/mock.php 끝, 관리자·큐레이터).
// 출처: homebox-handoff apps/web/app/routes/admin-checklist.tsx 의 데이터 형.
import { apiFetch, apiList, postJson } from "@/lib/api";

export type ChecklistStatus = "open" | "fixing" | "fixed" | "watch" | "wontfix";
export interface ChecklistEvidence {
  at?: string; src?: string; ref?: string; token?: string; score?: number; note?: string;
  mockup?: { id: string; title: string | null; preview_url: string };
}
export interface ChecklistItem {
  id: number; slug: string; area: string; area_name: string; title: string; detail: string | null;
  origin: "judge" | "test" | "pref" | "manual"; status: ChecklistStatus; hits: number; regressed: boolean;
  fix_note: string | null; fix_commit: string | null; first_seen: string; last_seen: string; fixed_at: string | null;
  evidence?: ChecklistEvidence[];
}
export interface ChecklistMeta {
  counts: Record<string, { n: number; hits: number }>;
  open_by_area: Record<string, number>;
  areas: Array<{ id: string; name: string }>;
}

export const CHECKLIST_STATUS_KO: Record<ChecklistStatus, string> = { open: "열림", fixing: "고치는 중", fixed: "고침", watch: "지켜봄", wontfix: "안 고침" };
export const CHECKLIST_ORIGIN_KO: Record<ChecklistItem["origin"], string> = { judge: "판정", test: "시험", pref: "선호", manual: "직접" };

const qs = (o: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const fetchChecklist = (o: { status?: string; area?: string; origin?: string; q?: string; sort?: string }) =>
  apiList<ChecklistItem>(`/admin/mock/checklist${qs(o)}`);
export const fetchChecklistItem = (id: number) => apiFetch<ChecklistItem>(`/admin/mock/checklist/${id}`);
export const updateChecklistItem = (id: number, body: Partial<Pick<ChecklistItem, "status" | "fix_note" | "fix_commit" | "title" | "detail" | "area">>) =>
  postJson<ChecklistItem>(`/admin/mock/checklist/${id}`, body);

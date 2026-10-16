// 솔루션별 개선 체크리스트(powerAssets·powerGuide·powerMCP) + 통합 검수 — /api/v1/admin/qa/… (api/routes/qa_checklist.php, 관리자·큐레이터).
// deck·mock·site 체크리스트는 각자 lib 가 있고, 통합 검수(overview·items)는 여섯 체크리스트를 한 모양으로 받는다.
import { apiFetch, apiList, postJson } from "@/lib/api";
import type { BulkResult } from "@/lib/admin-bulk2";

export type QaModule = "assets" | "guide" | "mcp";
export type QaSource = QaModule | "deck" | "mock" | "site";
export type QaStatus = "open" | "fixing" | "fixed" | "watch" | "wontfix";
export interface QaEvidence { at?: string; by?: string; verdict?: string; target?: string; how?: string; note?: string }
export interface QaItem {
  id: number; source: QaSource; source_name: string; slug: string; area: string; area_name: string; title: string; detail: string | null;
  origin: string; status: QaStatus; hits: number; regressed: boolean; fix_note: string | null; fix_commit: string | null;
  first_seen: string; last_seen: string; fixed_at: string | null; evidence?: QaEvidence[];
}
export interface QaMeta {
  module: QaModule; name: string; loop: string;
  counts: Record<string, { n: number; hits: number }>;
  open_by_area: Record<string, number>;
  areas: Array<{ id: string; name: string }>;
}
interface QaOverview {
  source: QaSource; name: string; page: string; loop: string;
  open: number; fixing: number; fixed: number; watch: number; wontfix: number; regressed: number; new_7d: number; fixed_7d: number;
  oldest_open: string | null; last_seen: string | null;
}

export const QA_MODULES: Record<QaModule, string> = { assets: "powerAssets", guide: "powerGuide", mcp: "powerMCP" };
export const QA_STATUS_KO: Record<QaStatus, string> = { open: "열림", fixing: "고치는 중", fixed: "고침", watch: "지켜봄", wontfix: "안 고침" };
/** 출처는 체크리스트마다 종류가 달라 모르는 값은 그대로 보인다 */
export const QA_ORIGIN_KO: Record<string, string> = {
  audit: "품질 판정", test: "시험", user: "사용자 의견", feed: "자동 수집", doc: "문서", manual: "직접",
  judge: "판정기", pref: "사용자 지시", wire: "와이어 검사", report: "엔진 보고", fail: "작업 실패",
};

const qs = (o: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const fetchQaChecklist = (m: QaModule, o: { status?: string; area?: string; origin?: string; q?: string; sort?: string }) =>
  apiList<QaItem>(`/admin/qa/${m}/checklist${qs(o)}`);
export const fetchQaItem = (m: QaModule, id: number) => apiFetch<QaItem>(`/admin/qa/${m}/checklist/${id}`);
export const updateQaItem = (m: QaModule, id: number, body: Partial<Pick<QaItem, "status" | "fix_note" | "fix_commit" | "title" | "detail" | "area">>) =>
  postJson<QaItem>(`/admin/qa/${m}/checklist/${id}`, body);
export const addQaItem = (m: QaModule, body: { area: string; title: string; detail?: string; fix_note?: string }) =>
  postJson<{ id: number; created: boolean }>(`/admin/qa/${m}/checklist`, body);
export const bulkQa = (m: QaModule) => (b: { status: QaStatus; ids: number[] }) => postJson<BulkResult>(`/admin/bulk/qa/${m}/checklist`, b);

export const fetchQaOverview = () => apiFetch<QaOverview[]>("/admin/qa/overview");
export const fetchQaItems = (o: { source?: string; status?: string; q?: string; sort?: string; page?: number }) => apiList<QaItem>(`/admin/qa/items${qs(o)}`);
export const updateQaAny = (source: QaSource, id: number, body: { status?: QaStatus; fix_note?: string; fix_commit?: string }) =>
  postJson<QaItem>(`/admin/qa/items/${source}/${id}`, body);

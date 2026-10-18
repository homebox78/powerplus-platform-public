// 관리자 일괄 처리 API — 여러 개 골라 한꺼번에(서버: api/routes/admin_bulk.php).
// 출처: routes/admin-assets.tsx 의 useBulk(POST /admin/assets/bulk) 호출 방식. lib/admin.ts 와 따로 둔다(작업 충돌 방지).
import { postJson } from "@/lib/api";

/** already = 포인트 일괄 지급에서 같은 사유로 오늘(한국 시각) 이미 받아 건너뛴 사람 수(서버가 유일 키로 막는다) */
export type BulkResult = { action: string; count: number; skipped?: number; already?: number };

export type UserBulkBody =
  | { action: "block"; ids: string[]; reason: string }
  | { action: "unblock"; ids: string[] }
  | { action: "plan"; ids: string[]; plan: "free" | "pro" | "team"; until?: string }
  | { action: "points"; ids: string[]; amount: number; reason: string };

export const bulkUsers = (b: UserBulkBody) => postJson<BulkResult>("/admin/users/bulk", b);

export const bulkContacts = (b: { action: "status"; ids: string[]; status: "open" | "answered" | "closed" } | { action: "delete"; ids: string[] }) =>
  postJson<BulkResult>("/admin/contacts/bulk", b);

export const bulkRemovals = (b: { ids: string[]; status: "received" | "reviewing" | "done" | "rejected"; resolution?: string }) =>
  postJson<BulkResult>("/admin/removals/bulk", b);

export const bulkRequests = (b: { action: "status"; ids: string[]; status: "new" | "done" | "rejected" } | { action: "delete"; ids: string[] }) =>
  postJson<BulkResult>("/admin/requests/bulk", b);

/** 결과 문구 — 건너뛴 것이 있으면 함께 알린다 */
export const bulkMessage = (r: BulkResult, verb: string) =>
  `${r.count.toLocaleString()}개를 ${verb}.`
  + (r.already ? ` 이미 지급 ${r.already.toLocaleString()}명은 건너뛰었습니다(같은 사유·같은 날).` : "")
  + (r.skipped ? ` ${r.skipped.toLocaleString()}개는 대상이 아니라 건너뛰었습니다.` : "");

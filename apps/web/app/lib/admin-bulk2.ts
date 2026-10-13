// 관리자 일괄 처리 API 2 — 커뮤니티 글·댓글, 시안·갤러리, 변경 이력, 도움말, 장표 작업, 개선 체크리스트(서버: api/routes/admin_bulk2.php).
// 출처: lib/admin-bulk.ts 의 호출 방식. lib/admin.ts 와 따로 둔다(작업 충돌 방지).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { toastError } from "@/components/hb/confirm";
import { postJson } from "@/lib/api";
import { bulkMessage, type BulkResult } from "@/lib/admin-bulk";

export type { BulkResult };

export const bulkCommunityPosts = (b: { action: "hide" | "show" | "pin" | "unpin" | "delete"; ids: string[] }) =>
  postJson<BulkResult>("/admin/bulk/community/posts", b);

export const bulkCommunityComments = (b: { action: "hide" | "show" | "delete"; ids: number[] }) =>
  postJson<BulkResult>("/admin/bulk/community/comments", b);

export const bulkMockups = (b: { action: "discard" | "restore" | "gallery_hide" | "gallery_delete"; ids: string[] }) =>
  postJson<BulkResult>("/admin/bulk/mockups", b);

export const bulkChangelog = (b: { action: "publish" | "unpublish" | "delete"; ids: string[] }) =>
  postJson<BulkResult>("/admin/bulk/changelog", b);

export const bulkHelpDocs = (b: { action: "publish" | "unpublish" | "delete"; ids: string[] }) =>
  postJson<BulkResult>("/admin/bulk/help/docs", b);

export const bulkDeckJobs = (b: { action: "cancel" | "delete"; ids: string[] }) =>
  postJson<BulkResult>("/admin/bulk/deck/jobs", b);

export const bulkChecklist = (b: { status: "open" | "fixing" | "fixed" | "watch" | "wontfix"; ids: number[] }) =>
  postJson<BulkResult>("/admin/bulk/mock/checklist", b);

/** 일괄 작업 공용 훅 — 끝나면 결과 토스트 · 목록 다시 받기 · 고른 것 비우기 */
export function useBulkRun<B>(fn: (b: B) => Promise<BulkResult>, invalidate: ReadonlyArray<readonly unknown[]>, verb: (b: B) => string, onDone: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r, b) => {
      toast.success(bulkMessage(r, verb(b)));
      for (const k of invalidate) void qc.invalidateQueries({ queryKey: [...k] });
      onDone();
    },
    onError: (e) => toastError(e),
  });
}

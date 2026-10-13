import { toast } from "sonner";
import { Copy } from "@/components/hb/copy";

// 브라우저 confirm() 대체 (shadcn Sonner, 사용자 지시 2026-09-24 "메시지는 sonner 사용"): 확인 액션이 있는 토스트.
// 파괴적 동작(삭제·폐기·해지)은 실행 전 이 토스트로 한 번 더 묻고, 결과도 toast.success / toast.error 로 알린다.
export function confirmToast(message: string, onConfirm: () => void, opts: { action?: string; description?: string } = {}) {
  toast(<Copy as="span" text={message} />, { description: opts.description ? <Copy as="span" text={opts.description} /> : undefined, duration: 8000, action: { label: opts.action ?? "확인", onClick: onConfirm }, cancel: { label: "취소", onClick: () => {} } });
}

/** react-query onError 공용: ApiError.message 있으면 그대로, 없으면 기본 문구 */
export function toastError(e: unknown, fallback = "처리하지 못했습니다. 잠시 후 다시 시도해 주세요.") {
  toast.error(<Copy as="span" text={e instanceof Error && e.message ? e.message : fallback} />);
}

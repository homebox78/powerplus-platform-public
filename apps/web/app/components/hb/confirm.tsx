import { toast } from "sonner";
import { Copy } from "@/components/hb/copy";

// 브라우저 confirm() 대체 (shadcn Sonner, 사용자 지시 2026-09-24 "메시지는 sonner 사용"): 확인 액션이 있는 토스트.
// 파괴적 동작(삭제·폐기·해지)은 실행 전 이 토스트로 한 번 더 묻고, 결과도 toast.success / toast.error 로 알린다.
export function confirmToast(message: string, onConfirm: () => void, opts: { action?: string; description?: string } = {}) {
  toast(<Copy as="span" text={message} />, { description: opts.description ? <Copy as="span" text={opts.description} /> : undefined, duration: 8000, action: { label: opts.action ?? "확인", onClick: onConfirm }, cancel: { label: "취소", onClick: () => {} } });
}

/**
 * react-query onError 공용: ApiError.message 있으면 그대로, 없으면 기본 문구.
 * 서버 hint 가 사람이 읽는 안내(한글 문장 — "한 번에 5,000개까지… 좁혀 주세요", "일 한도 100건")면 아래 줄로 같이 보인다.
 * 예전엔 hint 를 버려 한도·거절 오류가 '무엇을 하면 되는지'를 못 보였다(2026-10-18 전수조사 C). 'reply'·'upload' 같은 칸 이름 hint 는 싣지 않는다.
 */
export function toastError(e: unknown, fallback = "처리하지 못했습니다. 잠시 후 다시 시도해 주세요.") {
  const msg = e instanceof Error && e.message ? e.message : fallback;
  const hint = (e as { hint?: unknown } | null)?.hint;
  const desc = typeof hint === "string" && /[가-힣]/.test(hint) && hint.trim() !== msg.trim() ? hint.trim() : undefined;
  toast.error(<Copy as="span" text={msg} />, desc ? { description: <Copy as="span" text={desc} /> } : undefined);
}

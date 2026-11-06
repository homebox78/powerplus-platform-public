// 목록·상세를 못 읽었을 때 — 서버 오류를 "비어 있음"으로 보이지 않게 이유와 다시 시도를 준다(2026-11-01 검수 M18).
import { Button } from "@/components/ui/button";
import { Copy } from "@/components/hb/copy";

export function LoadError({ what, error, onRetry, className }: { what: string; error?: unknown; onRetry: () => void; className?: string }) {
  const detail = error instanceof Error && error.message ? ` (${error.message})` : "";
  return (
    <section role="alert" className={`rounded-panel border border-dashed border-line-3 p-10 text-center ${className ?? ""}`} data-testid="load-error">
      <Copy className="text-md text-ink-3" text={`${what}을(를) 불러오지 못했습니다${detail}. 잠시 뒤 다시 시도해 주세요.`} />
      <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>다시 시도</Button>
    </section>
  );
}

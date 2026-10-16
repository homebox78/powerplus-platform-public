// 연결 상태 표시 — 점 + 글. 연결됨(ok)이면 초록 점이 깜빡인다(styles/app.css .hb-live-dot).
// 관리자 대시보드·엔진·AI 설정과 프론트(powerDeck 제작 서버·설정)가 같은 모양을 쓴다(사용자 지시 2026-10-07).
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type LiveState = "ok" | "warn" | "wait" | "off";

export function LiveDot({ state, className }: { state: LiveState; className?: string }) {
  return <i className={cn("hb-live-dot", className)} data-state={state} aria-hidden />;
}

/** 알약 모양 — 연결됨·끊김 같은 상태 한 덩어리 */
export function LiveStatus({ state, children, className, title }: { state: LiveState; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} data-state={state} className={cn("hb-live-pill inline-flex h-6 flex-none items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-[12.5px] font-semibold",
      state === "ok" ? "" : state === "warn" ? "bg-warn-soft text-warn" : state === "wait" ? "bg-point-soft text-point-ink" : "bg-ground-3 text-ink-4", className)}>
      <LiveDot state={state} />
      {children}
    </span>
  );
}

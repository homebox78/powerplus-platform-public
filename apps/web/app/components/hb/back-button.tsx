// 출처: homebox-handoff apps/web/app/components/hb/back-button.tsx — 그대로(도움말 문서 상세의 뒤로가기)
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router";
import { cn } from "@/lib/utils";

// 상세 화면 공통 뒤로가기: 들어온 동선으로 돌아간다(history.back). 주소로 바로 들어와 이전 기록이 없을 때만 fallback 으로.
export function BackButton({ fallback, label = "뒤로", className }: { fallback: string; label?: string; className?: string }) {
  const navigate = useNavigate();
  const back = () => (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0 ? navigate(-1) : navigate(fallback));
  return (
    <button type="button" onClick={back} className={cn("inline-flex h-9 items-center gap-1.5 rounded-chip text-sm font-semibold text-ink-3 hover:text-ink", className)}>
      <ArrowLeft className="size-4" aria-hidden />{label}
    </button>
  );
}

// 출처: homebox-handoff apps/web/app/components/hb/saved-badge.tsx — 이동 대상만 /account/saved 로.
// 저장 표시: 목록 썸네일마다 저장했는지 한눈에 — 모서리의 작은 원형 북마크. 누르면 내 저장으로(카드 클릭은 막는다).
import { Bookmark } from "lucide-react";
import { useNavigate } from "react-router";
import { cn } from "@/lib/utils";

export function SavedBadge({ className }: { className?: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate("/account/saved"); }}
      className={cn("absolute -right-[5px] -top-[5px] z-20 inline-flex size-7 items-center justify-center rounded-full bg-point text-white shadow-[0_2px_8px_rgba(0,0,0,.35)] hover:bg-point/90", className)}
      aria-label="저장됨 — 내 저장 보기" title="저장됨 · 내 저장 보기">
      <Bookmark className="size-3.5 fill-current" aria-hidden />
    </button>
  );
}

// 저장 버튼 — 홈박스 카드의 "저장"(흰 pill, 저장되면 bg-ink "저장됨") 을 플랫폼 공용으로.
// 카드 안(role=button 행)에 놓이므로 클릭이 카드로 번지지 않게 막는다. 비로그인은 useToggleSave 가 로그인 안내 토스트.
import { Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsSaved, useToggleSave, type SaveType } from "@/lib/saved";
import { cn } from "@/lib/utils";

export function SaveButton({ type, id, variant = "white", size = "sm", className, iconOnly = false }: { type: SaveType; id: string | number; variant?: "white" | "outline"; size?: "sm" | "xs" | "icon-sm"; className?: string; iconOnly?: boolean }) {
  const saved = useIsSaved(type, id);
  const toggle = useToggleSave();
  return (
    <Button
      type="button" variant={variant} size={size} aria-pressed={saved} aria-label={iconOnly ? (saved ? "저장됨" : "저장") : undefined} title={iconOnly ? (saved ? "저장됨" : "저장") : undefined}
      className={cn(saved && "border-ink bg-ink text-white hover:bg-ink/90 hover:text-white", className)}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(type, id); }}
    >
      <Bookmark className={cn(saved && "fill-current")} aria-hidden />{iconOnly ? null : saved ? "저장됨" : "저장"}
    </Button>
  );
}

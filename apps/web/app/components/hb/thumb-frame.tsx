// 출처: homebox-handoff apps/web/app/components/hb/thumb-frame.tsx (2026-10-06 그대로 이식 — 플랫폼 디자인 베이스 = 홈박스)
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

// docs/03 §3: 썸네일 프레임 border line bg-ground-2, hover 오버레이 bg-black/50 + 흰 pill 버튼, Free 잠금 blur(10px)
interface ThumbFrameProps {
  children: React.ReactNode;
  ratio?: "16/10" | "16/9" | "2/1" | "auto";
  radius?: "thumb" | "card" | "lg";
  hover?: React.ReactNode;
  locked?: boolean;
  lockedLabel?: string;
  className?: string;
}

export function ThumbFrame({ children, ratio = "16/10", radius = "thumb", hover, locked = false, lockedLabel, className }: ThumbFrameProps) {
  return (
    <span
      className={cn(
        "hb-thumb group/thumb relative block w-full overflow-hidden border border-line bg-ground-2",
        radius === "thumb" ? "rounded-thumb" : radius === "lg" ? "rounded-panel border-0" : "rounded-card",
        ratio === "16/10" && "aspect-[16/10]",
        ratio === "16/9" && "aspect-[16/9]",
        ratio === "2/1" && "aspect-[2/1]",
        className,
      )}
    >
      {children}
      {hover && (
        <span className="absolute inset-0 flex items-center justify-center gap-2 bg-ink/50 opacity-0 transition-opacity group-hover/thumb:opacity-100 group-focus-within/thumb:opacity-100">
          {hover}
        </span>
      )}
      {locked && <LockedOverlay label={lockedLabel} />}
    </span>
  );
}

/** Free 잠금: backdrop-blur-[10px] bg-white/55 + 자물쇠 + "Pro에서 열람" */
function LockedOverlay({ label = "Pro에서 열람" }: { label?: string }) {
  return (
    <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/55 backdrop-blur-[10px] dark:bg-ground/65">
      <Lock className="size-[22px] text-ink" aria-hidden />
      <span className="text-sm font-bold">{label}</span>
    </span>
  );
}

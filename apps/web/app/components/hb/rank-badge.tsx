// 시안 제작자 등급 배지 — 새싹·장인·명장마다 아이콘을 붙인다(사용자 2026-10-08).
// 등급 기준은 서버(api/routes/mock.php $badge): 공유 1편 새싹 · 5편 장인 · 15편 명장.
import { Crown, Hammer, Sprout, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ICON: Record<string, { icon: LucideIcon; cls: string }> = {
  sprout: { icon: Sprout, cls: "bg-[#E8F5E9] text-[#2E7D32]" },
  expert: { icon: Hammer, cls: "bg-[#EEF2F7] text-[#3F4E63]" },
  master: { icon: Crown, cls: "bg-point/10 text-point-ink" },
};

export function RankBadge({ badge, className }: { badge: { id: string; name: string } | null | undefined; className?: string }) {
  if (!badge) return null;
  const m = ICON[badge.id] ?? ICON.sprout!;
  const Icon = m.icon;
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full px-1.5 align-middle text-xs font-semibold", m.cls, className)} title={`등급 ${badge.name}`}>
      <Icon className="size-3" aria-hidden />{badge.name}
    </span>
  );
}

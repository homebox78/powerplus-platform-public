// 출처: homebox-handoff apps/web/app/components/hb/bottom-tab-bar.tsx — 탭을 모듈 4종 + 커뮤니티 5개로 — 계정은 우측 상단 아바타가 맡는다(사용자 2026-10-06)
import { NavLink } from "react-router";
import { EXTRA_NAV, MODULES } from "@/lib/modules";
import { cn } from "@/lib/utils";

const TABS = [...MODULES.map((m) => ({ to: m.to, label: m.name.replace("power", ""), Icon: m.icon })), ...EXTRA_NAV.map((n) => ({ to: n.to, label: n.short, Icon: n.icon }))];

export function BottomTabBar() {
  return (
    <nav aria-label="모바일 탭" className="fixed inset-x-0 bottom-0 z-40 flex h-20 border-t border-line bg-ground md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      {TABS.map(({ to, label, Icon }) => (
        <NavLink key={to} to={to} className={({ isActive }) => cn("flex flex-1 flex-col items-center justify-center gap-1 text-xs font-medium text-ink-4", isActive && "font-semibold text-ink")}>
          <Icon className="size-[22px]" aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

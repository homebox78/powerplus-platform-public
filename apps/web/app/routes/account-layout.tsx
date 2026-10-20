// 출처: homebox-handoff apps/web/app/routes/account-layout.tsx — 메뉴를 기획 §8.1 마이페이지 트리로. 모듈 패널(내 에셋·내 장표·내 목업·내 가이드)은 S2 에서 추가.
import { Bookmark, CreditCard, MessagesSquare, KeyRound, Settings, ShieldCheck, User } from "lucide-react";
import { useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { PageSkeleton } from "@/components/hb/page-skeleton";
import { useMe } from "@/lib/auth";
import { PLANS_UI } from "@/lib/plans-ui";
import { cn } from "@/lib/utils";
import { SETTINGS, visibleSubs } from "./account-settings";

const MENU: { to: string; label: string; icon: typeof User; end?: boolean; billing?: boolean; admin?: boolean }[] = [
  { to: "/account", label: "프로필", icon: User, end: true },
  { to: "/account/saved", label: "저장", icon: Bookmark },
  { to: "/account/posts", label: "내 글", icon: MessagesSquare },
  { to: "/account/keys", label: "API · MCP 키", icon: KeyRound },
  { to: "/account/settings", label: "설정", icon: Settings },
  { to: "/account/plan", label: "플랜·결제", icon: CreditCard, billing: true },
  { to: "/admin", label: "관리자", icon: ShieldCheck, admin: true },
];

export default function AccountLayout() {
  const { me, loading, isAdmin } = useMe();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  useEffect(() => { if (!loading && !me) navigate(`/login?next=${encodeURIComponent(pathname + search)}`, { replace: true }); }, [me, loading, navigate, pathname, search]);
  if (!me) return <PageSkeleton kind="form" />;
  const inSettings = pathname.startsWith("/account/settings");
  const [, , , curSection = SETTINGS[0]!.id, curSub] = pathname.split("/");
  // 플랜·결제 메뉴 = PLANS_UI(2026-10-20 사내 전용 운영 동안 끔) && billing_visible
  const menu = MENU.filter((m) => (!m.admin || isAdmin) && (!m.billing || (PLANS_UI && me.billing_visible)));
  const item = (m: (typeof MENU)[number], mobile = false) => (
    <NavLink key={m.to} to={m.to} end={m.end} className={({ isActive }) => cn("inline-flex shrink-0 items-center rounded-lg text-md transition-colors", mobile ? "h-9 gap-[5px] px-3" : "h-10 gap-2.5", isActive ? "font-semibold text-ink" : "text-ink-3 hover:text-ink")}>
      <m.icon className="size-[18px]" aria-hidden />{m.label}
    </NavLink>
  );
  return (
    <div className="container-page work-wide grid grid-cols-1 gap-8 pb-12 pt-10 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
      <nav className="sticky-follow sticky top-[calc(var(--hdr-offset)+32px)] hidden flex-col gap-1 self-start lg:flex" aria-label="계정 메뉴">
        {menu.map((m) => m.to === "/account/settings" ? (
          <div key={m.to}>
            {item(m)}
            {/* 설정 하위 — 항목(장표 변환 …)과 그 하위 메뉴. 본문 안에 사이드를 두지 않는다(사용자 지시: UI 공간 낭비) */}
            {inSettings && (
              <div className="ml-[9px] mt-1 flex flex-col gap-0.5 border-l border-line pl-4">
                {SETTINGS.map((sec) => {
                  const subs = visibleSubs(sec.subs, isAdmin);
                  const secOn = curSection === sec.id;
                  return (
                    <div key={sec.id} className="flex flex-col gap-0.5">
                      <NavLink to={`/account/settings/${sec.id}`} className={cn("flex h-8 items-center text-sm transition-colors", secOn ? "font-semibold text-ink" : "text-ink-3 hover:text-ink")}>{sec.label}</NavLink>
                      {secOn && subs.length > 1 && subs.map((sb, i) => {
                        const on = curSub ? curSub === sb.id : i === 0;
                        return <NavLink key={sb.id} to={`/account/settings/${sec.id}/${sb.id}`} className={cn("flex h-7 items-center pl-3 text-[13px] transition-colors", on ? "font-semibold text-ink" : "text-ink-4 hover:text-ink")}>{sb.label}</NavLink>;
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : item(m))}
      </nav>
      <nav className="-mx-1 flex flex-wrap gap-1 border-b border-line pb-2 lg:hidden" aria-label="계정 메뉴">{menu.map((m) => item(m, true))}</nav>
      <div className="w-full min-w-0"><Outlet /></div>
    </div>
  );
}

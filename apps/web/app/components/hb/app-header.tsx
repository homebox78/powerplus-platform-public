// 출처: homebox-handoff apps/web/app/components/hb/app-header.tsx — 주 메뉴를 플랫폼 모듈 4종으로, 계정 메뉴를 §8 마이페이지 구조로
import { FileSliders, KeyRound, LayoutTemplate, PlusCircle, Search, Settings, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import { BrandName } from "@/components/hb/brand-name";
import { NotificationBell } from "@/components/hb/notification-bell";
import { ThemeSwitch } from "@/components/hb/theme-switch";
import { SearchInput } from "@/components/hb/search-input";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PLAN_KO, useLogout, useMe } from "@/lib/auth";
import { EXTRA_NAV, MODULES } from "@/lib/modules";
import { cn } from "@/lib/utils";

const ITEM = "hb-dark-item h-10 rounded-xl px-3 text-md text-white";

/** 스크롤 내리면 헤더가 위로 사라지고 올리면 다시 — 사용자 2026-10-06. 숨김 여부는 html[data-hdr=hidden] 으로 내보내 sticky 카드 머리가 top 을 맞춘다(.pd .head) */
function useHideOnScroll() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const on = () => {
      const y = window.scrollY;
      const h = y > last && y > 80;
      if (h !== hidden) setHidden(h);
      last = y;
    };
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, [hidden]);
  useEffect(() => { document.documentElement.dataset.hdr = hidden ? "hidden" : "shown"; }, [hidden]);
  return hidden;
}

function HeaderSearch({ initialQ, onSubmit }: { initialQ: string; onSubmit: (v: string) => void }) {
  const [open, setOpen] = useState(!!initialQ);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) ref.current?.focus(); }, [open]);
  return (
    <form role="search" data-search-open={open || undefined} className="flex items-center" onSubmit={(e) => { e.preventDefault(); onSubmit((ref.current?.value ?? "").trim()); }}>
      <div className={cn("overflow-hidden transition-[width,opacity] duration-300 ease-out", open ? "w-[min(360px,36vw)] opacity-100 lg:w-[min(360px,52vw)]" : "w-0 opacity-0")} aria-hidden={!open}>
        <SearchInput ref={ref} name="q" kbd={false} tabIndex={open ? 0 : -1} defaultValue={initialQ} className="w-[min(360px,36vw)] lg:w-[min(360px,52vw)]" placeholder="에셋, 가이드, 내 장표 검색…"
          onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
          onBlur={(e) => { if (!e.currentTarget.value.trim()) setOpen(false); }} />
      </div>
      {!open && <Button type="button" variant="ghost" size="icon" aria-label="검색 열기" onClick={() => setOpen(true)}><Search /></Button>}
    </form>
  );
}

export function AppHeader() {
  const hidden = useHideOnScroll();
  const navigate = useNavigate();
  const { search, pathname } = useLocation();
  // 검색 화면은 본문에 큰 검색칸이 있어 헤더 칸을 펼치지 않는다(폭이 밀려 가로 넘침)
  const initialQ = pathname === "/search" ? "" : new URLSearchParams(search).get("q") ?? "";
  const { me, isAdmin } = useMe();
  const logout = useLogout();
  const u = me?.user;
  const initial = (u?.name ?? u?.email ?? "?").trim().charAt(0).toUpperCase();
  return (
    <header className={cn("sticky top-0 z-40 h-header shrink-0 border-b border-line-2 bg-ground transition-transform duration-200", hidden && "-translate-y-full")}>
      <div className="container-hb flex h-full items-center gap-6 xl:gap-8">
        <Link to="/" className="pp-logo inline-flex min-h-11 items-center text-[24px] text-ink" aria-label="powerPlus 홈"><BrandName name="powerPlus" /></Link>
        <nav aria-label="주 메뉴" className="hidden gap-4 lg:flex xl:gap-6">
          {[...MODULES, ...EXTRA_NAV].map((m) => (
            <NavLink key={m.to} to={m.to} title={m.short !== m.name ? `${m.name} · ${m.short}` : undefined} className={({ isActive }) => cn("whitespace-nowrap text-[16px] font-medium text-ink-4 hover:text-ink", isActive && "font-semibold text-ink")}>
              {m.name}
              {/* 한글 보조 표기(사이트종합평가리포트 4-3) — 폭 여유가 있는 xl 부터 이름 옆에 작게 */}
              {m.short !== m.name && <span className="ml-1 hidden text-[13px] font-normal text-ink-4 xl:inline">{m.short}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          {/* 검색은 평소 아이콘만 — 누르면 입력칸이 옆으로 펼쳐진다(사용자 2026-10-08 "상단 검색이 공간을 차지") */}
          <HeaderSearch initialQ={initialQ} onSubmit={(v) => navigate(v ? `/search?q=${encodeURIComponent(v)}` : "/search")} />
          {/* powerMCP 안내(/powermcp). /mcp 는 MCP 서버 주소라 페이지로 쓰지 않는다 */}
          <Button asChild variant="outline" size="xs" className="hidden md:inline-flex"><Link to="/powermcp">powerMCP</Link></Button>
          {u ? (
            <>
              <NotificationBell />
              {me!.billing_visible && me!.plan === "free" && <Button asChild size="sm" className="hidden sm:inline-flex"><Link to="/account/plan">Pro 시작하기</Link></Button>}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className={`hb-avatar-btn ml-1 inline-flex size-9 items-center justify-center rounded-full text-sm font-bold text-white ${u.avatar_url ? "" : "overflow-hidden bg-[#C9C9C9]"}`} aria-label="내 계정 메뉴">
                    {u.avatar_url ? <img src={u.avatar_url} alt="" className="size-full rounded-full object-cover" referrerPolicy="no-referrer" /> : initial}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={10} className="w-[260px] rounded-panel border-0 bg-[#2A2A2C] p-2 text-white outline-none ring-0" style={{ boxShadow: "0 16px 48px rgba(0,0,0,.35)" }}>
                  {/* 홈박스 계정 메뉴(Mobbin 구조)를 통합 플랫폼 기준으로: 프로필 → 마이페이지 항목 → 관리자 → 테마 → 안내 → 로그아웃 → 정책 */}
                  <div className="px-3 pb-3 pt-2.5">
                    <div className="text-md font-bold">{u.name ?? "이름 없음"}</div>
                    <div className="truncate text-sm text-white/55">{u.email}</div>
                    <Button asChild size="sm" variant="ghost" className="mt-3 w-full rounded-full border-0 bg-[#3D3D40] text-white hover:bg-[#4A4A4D] hover:text-white"><Link to="/account">프로필 설정 · {PLAN_KO[me!.plan]}</Link></Button>
                  </div>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuItem asChild className={ITEM}><Link to="/account/keys"><KeyRound aria-hidden />API · MCP 키</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild className={ITEM}><Link to="/deck/jobs"><FileSliders aria-hidden />내 장표 작업</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild className={ITEM}><Link to="/mock/mockups"><LayoutTemplate aria-hidden />내 시안</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild className={ITEM}><Link to="/assets/requests"><PlusCircle aria-hidden />자료 요청</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild className={ITEM}><Link to="/account/settings"><Settings aria-hidden />설정</Link></DropdownMenuItem>
                  {isAdmin && <DropdownMenuItem asChild className={ITEM}><Link to="/admin"><ShieldCheck aria-hidden />관리자</Link></DropdownMenuItem>}
                  <DropdownMenuSeparator className="bg-white/10" />
                  <div className="flex items-center justify-between px-3 py-2"><span className="text-md">테마</span><ThemeSwitch /></div>
                  <DropdownMenuSeparator className="bg-white/10" />
                  {me!.billing_visible && <DropdownMenuItem asChild className={ITEM}><Link to="/pricing">요금제</Link></DropdownMenuItem>}
                  <DropdownMenuItem asChild className={ITEM}><Link to="/docs">MCP 연결 가이드</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild className={ITEM}><Link to="/community?c=notice">공지사항</Link></DropdownMenuItem>
                  <DropdownMenuItem asChild className={ITEM}><Link to="/help">도움말 센터</Link></DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => logout.mutate()} className={ITEM}>로그아웃</DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <div className="flex items-center gap-3 px-3 pb-1.5 pt-2 text-xs text-white/50"><Link to="/legal/privacy" className="hover:text-white">개인정보</Link><Link to="/legal/terms" className="hover:text-white">약관</Link><Link to="/legal/copyright" className="hover:text-white">저작권</Link></div>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Link to="/login" className="inline-flex min-h-11 items-center px-2 text-md font-semibold">로그인</Link>
              <Button asChild size="sm"><Link to="/signup">무료로 시작</Link></Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

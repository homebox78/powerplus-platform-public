// 관리자 틀 — shadcn blocks sidebar-07 구조 그대로(사용자 지시 2026-10-06 "관리자 모드는 shadcn blocks 스타일, 사이드메뉴는 접히는 아이콘식").
//   [SidebarProvider] [Sidebar collapsible=icon: 머리(로고 = 대시보드 링크) · 그룹 라벨 + 메뉴(하위 Collapsible)] [SidebarInset: 고정 헤더(Trigger·Breadcrumb·이동·사용자 메뉴) + 본문]
// 레이아웃 라우트 하나가 가드·메뉴, 본문은 <Outlet />. 화면이 없는 메뉴는 넣지 않는다. 노출은 역할 기준 — 서버도 같은 역할로 막는다.
// 다른 작업자가 메뉴를 더할 땐 GROUPS 의 자기 줄만 추가한다(children 으로 하위 메뉴 가능).
import { BarChart3, BookOpenText, Scale, SwatchBook, ChevronDown, ChevronRight, ClipboardList, Coins, Contrast, CreditCard, ExternalLink, FileSearch, History, Images, Inbox, LayoutTemplate, ListChecks, LogOut, Mail, MessagesSquare, Moon, Presentation, ShieldCheck, Sparkles, Sun, Trash2, Users } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { BrandName } from "@/components/hb/brand-name";
import { PageSkeleton } from "@/components/hb/page-skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, SidebarProvider, SidebarRail, SidebarTrigger } from "@/components/ui/sidebar";
import { ROLE_KO } from "@/lib/admin";
import { useLogout, useMe } from "@/lib/auth";

interface Item { to: string; label: string; icon: typeof Users; end?: boolean; role: "admin" | "curator" | "support"; children?: Array<{ to: string; label: string; role?: Item["role"]; end?: boolean }> }
// 메뉴 정리(사용자 2026-10-16 "중구난방, 성격에 맞게, 순서도 중요도에 맞게") — 묶음 = 성격, 순서 = 중요도:
//   ① 요청 처리(사용자가 답을 기다리는 일) ② 모듈 운영(솔루션별 일상 관리 화면만) ③ 품질 검수(통합 검수 + 여섯 개선 체크리스트 취합)
//   ④ 콘텐츠(공개 글·메일 문구) ⑤ 회원·설정(자주 안 바꾸는 규칙·키). 대시보드는 메뉴에 두지 않고 사이드바 로고(사용자 2026-10-10).
const GROUPS: Array<{ label: string; items: Item[] }> = [
  { label: "요청 처리", items: [
    { to: "/admin/contacts", label: "문의", icon: Inbox, role: "support" },
    { to: "/admin/requests", label: "자료 요청", icon: FileSearch, role: "support" },
    { to: "/admin/removals", label: "삭제요청", icon: Trash2, role: "support" },
  ] },
  // 같은 서비스끼리 한 묶음 — 부모를 누르면 펼치고 접힌다. 기본은 펼침(사용자 지시 2026-10-07). 하위가 하나뿐이면 묶지 않는다.
  { label: "모듈 운영", items: [
    { to: "/admin/assets", label: "powerAssets", icon: Images, role: "curator", children: [
      { to: "/admin/assets", label: "에셋" },
      { to: "/admin/search", label: "검색 통계" },
    ] },
    { to: "/admin/deck", label: "powerDeck", icon: Presentation, role: "admin", children: [
      { to: "/admin/deck", label: "장표 작업", end: true },
      { to: "/admin/deck-settings/bill", label: "이력 · 과금" },
      { to: "/admin/deck-settings/ref", label: "참조 자료" },
    ] },
    { to: "/admin/mockups", label: "powerMock 시안", icon: LayoutTemplate, role: "admin" },
    // powerGuide 는 코드가 정본이라 편집 없이 현황(자료 상태·구성·MCP 이용)만(사용자 2026-10-14)
    { to: "/admin/guide", label: "powerGuide 현황", icon: SwatchBook, role: "curator" },
  ] },
  // 통계 = 사이트 전체(솔루션을 가로지르는 숫자) — 방문자 통계(2026-10-20). 검색 통계는 powerAssets 하위에 그대로
  { label: "통계", items: [
    { to: "/admin/stats", label: "방문자 통계", icon: BarChart3, role: "admin" },
  ] },
  // 품질 검수 = 솔루션별 개선 체크리스트를 한 절차로(통합 검수, 사용자 2026-10-15) + 체크리스트 여섯 개를 이 묶음에 모은다(사용자 2026-10-16)
  { label: "품질 검수", items: [
    { to: "/admin/qa", label: "통합 검수", icon: ListChecks, role: "curator", end: true },
    { to: "/admin/site/checklist", label: "개선 체크리스트", icon: ClipboardList, role: "curator", children: [
      { to: "/admin/site/checklist", label: "사이트 공통" },
      { to: "/admin/qa/assets", label: "powerAssets" },
      { to: "/admin/deck/checklist", label: "powerDeck" },
      { to: "/admin/mock/checklist", label: "powerMock" },
      { to: "/admin/qa/guide", label: "powerGuide" },
      { to: "/admin/qa/mcp", label: "powerMCP" },
    ] },
  ] },
  { label: "콘텐츠", items: [
    { to: "/admin/community", label: "커뮤니티", icon: MessagesSquare, role: "admin" },
    { to: "/admin/help", label: "도움말", icon: BookOpenText, role: "admin" },
    { to: "/admin/changelog", label: "변경 이력", icon: History, role: "admin" },
    { to: "/admin/policies", label: "약관·정책", icon: Scale, role: "admin" },
    { to: "/admin/mail", label: "메일 서식", icon: Mail, role: "admin" },
  ] },
  // AI 설정 = 모든 서비스의 AI(키·모델·Jev) 한 곳 — powerDeck 전용처럼 보이지 않게 독립 메뉴(사용자 지시 2026-10-07)
  { label: "회원·설정", items: [
    { to: "/admin/users", label: "사용자·역할", icon: Users, role: "admin" },
    { to: "/admin/point-rules", label: "포인트 규칙", icon: Coins, role: "admin" },
    { to: "/admin/billing", label: "구독·결제", icon: CreditCard, role: "admin" },
    { to: "/admin/ai", label: "AI 설정", icon: Sparkles, role: "admin" },
  ] },
];

const ADMIN_ONLY = GROUPS.flatMap((g) => g.items.flatMap((i): Array<{ to: string; role: Item["role"]; end?: boolean }> => (i.children ? i.children.map((c) => ({ to: c.to, role: c.role ?? i.role, end: c.end })) : [{ to: i.to, role: i.role, end: i.end }]))).filter((i) => i.role === "admin").map((i) => ({ to: i.to, end: i.to === "/admin" || i.end }));
const hit = (p: string, to: string, end?: boolean) => (end ? p === to : p === to || p.startsWith(to + "/"));
const THEMES = [{ id: "light", label: "라이트", Icon: Sun }, { id: "dark", label: "다크", Icon: Moon }, { id: "system", label: "시스템", Icon: Contrast }] as const;

/** 모바일에서도 쓰는 관리자 화면(나머지는 PC 안내) */
const MOBILE_OK = ["/admin/contacts", "/admin/removals", "/admin/login"];

export default function AdminLayout() {
  const { me, loading, isAdmin, hasRole } = useMe();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const isCurator = hasRole("curator");
  const isSupport = hasRole("support");
  const isOps = isAdmin || isSupport || isCurator;
  const home = isAdmin ? "/admin" : isSupport ? "/admin/contacts" : "/admin/assets";
  const allowed = (role: Item["role"]) => isAdmin || (role === "support" && isSupport) || (role === "curator" && isCurator);
  useEffect(() => {
    if (loading) return;
    if (!me) navigate(`/admin/login?next=${encodeURIComponent(pathname + search)}`, { replace: true });
    else if (!isOps) return; // 권한 없음은 조용히 홈으로 보내지 않고 아래 안내 화면(2026-10-09 시험 지적)
    else if (!isAdmin && (ADMIN_ONLY.some((t) => hit(pathname, t.to, t.end)) || (!isSupport && (pathname.startsWith("/admin/contacts") || pathname.startsWith("/admin/removals"))) || (!isCurator && pathname.startsWith("/admin/assets")))) navigate(home, { replace: true });
  }, [me, loading, isOps, isAdmin, isSupport, isCurator, home, navigate, pathname, search]);
  if (!me) return <PageSkeleton kind="list" />;
  if (!isOps) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-[560px] flex-col items-center justify-center px-4 py-20 text-center" data-testid="admin-forbidden">
        <ShieldCheck className="size-10 text-ink-4" aria-hidden />
        <h1 className="mt-4 text-2xl font-extrabold tracking-[-0.02em]">권한이 없습니다</h1>
        <p className="mt-2 text-md text-ink-3">관리자·큐레이터·지원 역할이 있는 계정만 관리자 화면을 쓸 수 있습니다.</p>
        {me.user?.email && <p className="mt-1 text-sm text-ink-4">지금 로그인: {me.user.email}</p>}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link to="/" className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-semibold text-ground">홈으로</Link>
          <Link to={`/admin/login?next=${encodeURIComponent(pathname + search)}`} className="inline-flex h-10 items-center rounded-full border border-line px-5 text-sm font-semibold">다른 계정으로 로그인</Link>
        </div>
      </main>
    );
  }

  const groups = GROUPS.map((g) => ({ ...g, items: g.items.map((i) => (i.children ? { ...i, children: i.children.filter((c) => allowed(c.role ?? i.role)) } : i)).filter((i) => (i.children ? i.children.length > 0 : allowed(i.role))) })).filter((g) => g.items.length > 0);
  const topRole = (["superadmin", "admin", "curator", "support"] as const).find((r) => me.roles.includes(r));
  // 브레드크럼: 그룹 › 메뉴 › 하위
  const cur = groups.flatMap((g) => g.items.map((i) => ({ g, i }))).find(({ i }) => (i.children ? i.children.some((c) => hit(pathname, c.to, c.end)) : hit(pathname, i.to, i.end)));
  const sub = cur?.i.children?.find((c) => hit(pathname, c.to, c.end));

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" aria-label="관리자 메뉴" className="hb-admin-side">
        <SidebarHeader>
          <SidebarMenu><SidebarMenuItem><SidebarMenuButton size="lg" asChild tooltip="대시보드"><Link to="/admin" aria-label="관리자 대시보드">
            <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-ink text-ground"><ShieldCheck className="size-4" aria-hidden /></span>
            <span className="grid flex-1 text-left text-sm leading-tight"><span className="pp-logo truncate text-[17px]"><BrandName name="powerPlus" /></span><span className="truncate text-xs text-ink-4">관리자{topRole ? ` · ${ROLE_KO[topRole] ?? ""}` : ""}</span></span>
          </Link></SidebarMenuButton></SidebarMenuItem></SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          {groups.map((g) => (
            <Collapsible key={g.label} defaultOpen className="group/grp"><SidebarGroup>
              <SidebarGroupLabel asChild><CollapsibleTrigger className="w-full">{g.label}<ChevronDown className="ml-auto size-3.5 transition-transform duration-200 group-data-[state=closed]/grp:-rotate-90" aria-hidden /></CollapsibleTrigger></SidebarGroupLabel>
              <CollapsibleContent><SidebarMenu>
                {g.items.map((i) => {
                  const on = i.children ? i.children.some((c) => hit(pathname, c.to, c.end)) : hit(pathname, i.to, i.end);
                  if (i.children) {
                    return (
                      <Collapsible key={i.to} asChild defaultOpen className="group/collapsible">
                        <SidebarMenuItem>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuButton tooltip={i.label} isActive={on}>
                              <i.icon aria-hidden /><span>{i.label}</span>
                              <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" aria-hidden />
                            </SidebarMenuButton>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <SidebarMenuSub>
                              {i.children.map((c) => (
                                <SidebarMenuSubItem key={c.to}>
                                  <SidebarMenuSubButton asChild isActive={hit(pathname, c.to, c.end)}><NavLink to={c.to} end={c.end}><span>{c.label}</span></NavLink></SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              ))}
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </SidebarMenuItem>
                      </Collapsible>
                    );
                  }
                  return (
                    <SidebarMenuItem key={i.to}>
                      <SidebarMenuButton asChild tooltip={i.label} isActive={on}>
                        <NavLink to={i.to} end={i.end}><i.icon aria-hidden /><span>{i.label}</span></NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu></CollapsibleContent>
            </SidebarGroup></Collapsible>
          ))}
        </SidebarContent>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-w-0">
        {/* 머리 줄은 위에 고정 — 이동·사용자 메뉴를 오른쪽 끝에(사용자 2026-10-10) */}
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-line bg-ground px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-vertical:h-4" />
          <Breadcrumb>
            <BreadcrumbList className="flex-nowrap">
              <BreadcrumbItem className="hidden md:block"><BreadcrumbLink asChild><Link to="/admin">관리자</Link></BreadcrumbLink></BreadcrumbItem>
              {cur && <><BreadcrumbSeparator className="hidden md:block" /><BreadcrumbItem className={sub ? "hidden md:block" : undefined}>{sub ? <BreadcrumbLink asChild><Link to={cur.i.to}>{cur.i.label}</Link></BreadcrumbLink> : <BreadcrumbPage>{cur.i.label}</BreadcrumbPage>}</BreadcrumbItem></>}
              {sub && <><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>{sub.label}</BreadcrumbPage></BreadcrumbItem></>}
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <SiteSwitcher />
            <UserMenu name={me.user?.name ?? ""} email={me.user?.email ?? ""} avatar={me.user?.avatar_url} />
          </div>
        </header>
        <div className="mx-auto flex w-full min-w-0 max-w-[1920px] flex-1 flex-col gap-4 p-4 pb-16 md:p-6">
          {/* 모바일 지원 범위(리포트 4-7) — 대시보드·문의 답변·삭제요청 처리만. 나머지 화면은 막지 않고 안내만 한다. */}
          {!MOBILE_OK.some((p) => pathname === p || pathname.startsWith(p + "/")) && pathname !== "/admin" && (
            <p className="rounded-card border border-line bg-ground-2 px-4 py-3 text-sm text-ink-3 md:hidden">
              이 화면은 PC 에서 이용해 주세요. 모바일은 대시보드·문의 답변·삭제요청 처리만 지원합니다.
            </p>
          )}
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

/** 머리 줄 오른쪽 '사용자모드' 버튼 — 사이트를 새 창으로(드롭다운 없앰, 사용자 2026-10-15) */
function SiteSwitcher() {
  return (
    <Button variant="ghost" size="sm" className="h-9 gap-1.5 px-2.5" asChild>
      <a href="/" target="_blank" rel="noreferrer" aria-label="사용자모드(새 창)"><span className="max-sm:hidden">사용자모드</span><ExternalLink className="size-4" aria-hidden /></a>
    </Button>
  );
}

/** 머리 줄 오른쪽 사용자 메뉴 — 테마·로그아웃 */
function UserMenu({ name, email, avatar }: { name: string; email: string; avatar?: string | null }) {
  const logout = useLogout();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const initial = (name || email || "?").slice(0, 1).toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex size-9 items-center justify-center rounded-full outline-none hover:bg-ground-3 focus-visible:ring-2 focus-visible:ring-ink/30" aria-label="사용자 메뉴">
          <Avatar className="size-8 rounded-full">{avatar && <AvatarImage src={avatar} alt="" className="rounded-full" />}<AvatarFallback className="rounded-full">{initial}</AvatarFallback></Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60 rounded-lg" side="bottom" align="end" sideOffset={6}>
        <DropdownMenuLabel className="p-0 font-normal">
          <span className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <Avatar className="size-8 rounded-lg">{avatar && <AvatarImage src={avatar} alt="" />}<AvatarFallback className="rounded-lg">{initial}</AvatarFallback></Avatar>
            <span className="grid flex-1 text-left text-sm leading-tight"><span className="truncate font-medium">{name || "이름 없음"}</span><span className="truncate text-xs text-ink-4">{email}</span></span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-ink-4">테마</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme ?? "light"} onValueChange={setTheme}>
            {THEMES.map((t) => <DropdownMenuRadioItem key={t.id} value={t.id}><t.Icon aria-hidden />{t.label}</DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link to="/account">내 계정</Link></DropdownMenuItem>
        <DropdownMenuItem onSelect={() => logout.mutate(undefined, { onSuccess: () => navigate("/admin/login", { replace: true }) })}><LogOut aria-hidden />로그아웃</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

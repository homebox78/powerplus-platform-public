// 모듈 화면 틀 — 기획 §14.4: 랜딩(시작하기) → 작업 단위 하위 메뉴. 하위 메뉴는 lib/modules.ts 가 단일 원천.
// 각 화면의 실내용은 S2 에서 모듈을 옮겨 오며 채운다 — 지금은 "이 화면이 하는 일" 한 줄 + 자리.
import { Lock } from "lucide-react";
import { Link, NavLink, Navigate, useLocation, useParams, useSearchParams } from "react-router";
import { BrandName } from "@/components/hb/brand-name";
import { MobileCarousel } from "@/components/hb/mobile-carousel";
import { DOWNLOAD_COUNT } from "@/modules/guide/downloads";
import { Copy } from "@/components/hb/copy";
import { MemberLock } from "@/components/hb/member-gate";
import { WideToggle, useWideInlinePresent } from "@/components/hb/work-space";
import { Button } from "@/components/ui/button";
import { useMe } from "@/lib/auth";
import { MODULES, menuHref, type ModuleMenu, type PlatformModule } from "@/lib/modules";
import { cn } from "@/lib/utils";
import { ASSET_SCREENS, AssetsLandingStats } from "@/modules/assets/screens";
import { GUIDE_SCREENS, GuideLandingSteps } from "@/modules/guide/screens";
import { useGuideOverrides, type GuideCopy } from "@/modules/guide/overrides";
import { DECK_SCREENS, DeckLandingSteps } from "@/modules/deck/screens";
import { MOCK_SCREENS, MockLandingSteps } from "@/modules/mock/screens";

// 모듈별 실내용 — 작업 단위 slug → 화면. 없는 조합은 아래 자리 안내가 뜬다.
const SCREENS: Record<string, Record<string, () => React.JSX.Element>> = { assets: ASSET_SCREENS, deck: DECK_SCREENS, guide: GUIDE_SCREENS, mock: MOCK_SCREENS };
const LANDING_EXTRA: Record<string, () => React.JSX.Element | null> = { assets: AssetsLandingStats, deck: DeckLandingSteps, guide: GuideLandingSteps, mock: MockLandingSteps };

export default function ModulePage() {
  const { pathname } = useLocation();
  const { sub = "" } = useParams();
  const { me, member, loading } = useMe();
  const [sp] = useSearchParams();
  const m0 = MODULES.find((x) => pathname.startsWith(x.to)) ?? MODULES[0]!;
  const gov = useGuideOverrides();
  const m = m0.id === "guide" ? withGuideCopy(m0, gov.copy) : m0; // 가이드 부제·소개·메뉴 글 = 관리자 덮어쓰기(2026-10-14)
  const item = m.menu.find((i) => i.slug === sub) ?? m.menu[0]!;
  const landing = item.slug === "";
  // powerDeck 공유 링크(/deck/jobs?id=…)는 로그인 없이 연다 — 볼 수 있는지는 서버가 작업의 링크 권한(shared=3)으로 정한다
  const openLink = m.id === "deck" && item.slug === "jobs" && !!sp.get("id");
  // 회원 전용(2026-10-16): 랜딩(소개) 말고는 Pro·Team·임직원만 — 서버도 같은 판정으로 API 를 막는다
  const gated = !landing && !openLink && !loading && !member;
  // 넓게 보기 — 작업 화면(장표 변환·내 작업, 시안)에만. 랜딩·목록 소개 화면은 기본 폭 그대로
  const wideOk = !landing && !gated && ((m.id === "deck" && (item.slug === "convert" || item.slug === "jobs")) || (m.id === "mock" && item.slug === "mockups"));
  const wideInline = useWideInlinePresent();
  // 옛 "최근 업데이트"·검색 주소는 둘러보기로(합침 2026-10-12) — 검색어·종류는 그대로 넘긴다
  if (m.id === "assets" && (sub === "recent" || sub === "search")) return <Navigate to={`/assets/browse${sp.toString() ? `?${sp}` : ""}`} replace />;
  return (
    <div className={cn("container-hb pb-12 pt-10 [html[data-wide='1']_&]:pt-6", wideOk && "work-wide")}>
      <nav className="wide-hide text-sm text-ink-4" aria-label="경로">
        <Link to="/" className="pp-hit hover:text-ink">powerPlus</Link> <span aria-hidden>›</span> <Link to={m.to} className="pp-hit hover:text-ink">{m.name}</Link>
        {!landing && <> <span aria-hidden>›</span> {item.label}</>}
      </nav>
      {/* 모바일은 아이콘·타이틀·설명글 모두 75%(2026-10-15 사용자 "25% 작게") */}
      <div className="wide-hide mt-3 flex items-center gap-4 max-sm:gap-3">
        <span className="inline-flex size-12 items-center justify-center rounded-ci bg-ink text-white max-sm:size-9"><m.icon className="size-5 max-sm:size-[15px]" aria-hidden /></span>
        <div><h1 className="pp-module-title text-5xl max-sm:text-[calc(var(--text-5xl)*0.75)]"><BrandName name={m.name} /></h1><p className="mt-0.5 text-md text-ink-3 max-sm:text-[calc(var(--text-md)*0.75)]">{m.sub}</p></div>
      </div>
      <nav className="wide-hide mt-8 flex flex-wrap gap-0 border-b border-line" aria-label={`${m.name} 메뉴`}>
        {m.menu.map((i) => (
          <NavLink key={i.slug} to={menuHref(m, i)} end className={({ isActive }) => cn("relative inline-flex h-14 shrink-0 items-center gap-1.5 whitespace-nowrap px-4 text-md font-medium text-ink-4 transition-colors hover:text-ink", isActive && "font-bold text-ink after:absolute after:-bottom-px after:left-4 after:right-4 after:h-0.5 after:bg-ink")}>
            {i.label}{i.slug !== "" && !member && <Lock className="size-3.5 opacity-60" aria-label="회원 전용" />}
          </NavLink>
        ))}
      </nav>
      {landing ? (
        <>
          <ModuleBanner m={m} />
          {LANDING_EXTRA[m.id] && (() => { const X = LANDING_EXTRA[m.id]!; return <X />; })()}
          <McpBand />
        </>
      ) : (
        <>
          <div className="mt-10 flex items-center gap-3 empty:hidden [html[data-wide='1']_&]:mt-0"><h2 className="wide-hide text-[26px] font-extrabold leading-[1.25] tracking-[-0.025em]">{item.label}</h2>{wideOk && !wideInline && <WideToggle className="ml-auto" />}</div>
          <p className="wide-hide mt-2 max-w-[720px] text-md leading-[1.7] text-ink-3"><Copy as="span" text={item.desc} /></p>
          {gated ? (
            <MemberLock reason={me ? (me.access?.reason ?? "PLAN_REQUIRED") : "UNAUTHORIZED"} />
          ) : loading && !landing && !openLink ? null : SCREENS[m.id]?.[item.slug] ? (
            (() => { const S = SCREENS[m.id]![item.slug]!; return <S />; })()
          ) : (
            <section className="mt-5 rounded-panel border border-dashed border-line-3 p-10 text-center text-md text-ink-4">
              <Copy text={`${m.name} · ${item.label} 화면은 S2 단계에서 옮겨 옵니다.`} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** 가이드 모듈 글 덮어쓰기 — 메뉴 열쇠는 slug(시작하기는 '_') */
function withGuideCopy(m: PlatformModule, c: GuideCopy): PlatformModule {
  return {
    ...m,
    sub: c.module?.sub || m.sub, desc: c.module?.desc || m.desc, free: c.module?.free || m.free,
    menu: m.menu.map((i) => ({ ...i, label: c.menu?.[i.slug || "_"]?.label || i.label, desc: c.menu?.[i.slug || "_"]?.desc || i.desc })),
  };
}

/** 각 솔루션 소개 하단 공통 — powerMCP 연결 안내. /powermcp 의 "키는 마이페이지에서" 띠와 같은 형태(사용자 2026-10-07) */
/**
 * 모듈 배너 — 설명 + 첫 행동 버튼 + 모듈 그림(21:9). 메뉴 탭과 같은 카드 묶음을 겹쳐 그리던 것을 대신한다
 * (디자인 점검 리포트 2026-10-08 §3 — 메뉴를 두 번 읽게 하지 않는다). 그림: public/img/module/<모듈>-v2.webp
 */
type Act = { label: string; to: string; external?: boolean };
const BANNER: Record<string, { primary: Act; secondary: Act; note?: string }> = {
  assets: { primary: { label: "PowerPoint 애드인 설치", to: "/api/v1/assets/setup/download", external: true }, secondary: { label: "웹에서 둘러보기", to: "/assets/browse" } },
  deck: { primary: { label: "pptx 올리고 한 장 먼저 보기", to: "/deck/convert" }, secondary: { label: "내 작업", to: "/deck/jobs" }, note: "1GB 까지, 끊겨도 이어 올립니다." },
  mock: { primary: { label: "powerMCP 연결", to: "/powermcp" }, secondary: { label: "시안 갤러리", to: "/mock/mockups" } },
  guide: { primary: { label: `토큰 내려받기 · ${DOWNLOAD_COUNT}종`, to: "/guide/tokens" }, secondary: { label: "부품 보기", to: "/guide/components" } },
};

/** 랜딩 카드 = 하위 메뉴 + 메뉴 밖 바로가기(powerAssets 는 설치·사용 도움말을 자료 요청 다음 카드로 — 사용자 2026-10-07) */
const LANDING_LINKS: Partial<Record<string, ModuleMenu[]>> = {
  assets: [{ slug: "/help/assets", label: "설치·사용 방법", desc: "애드인 설치부터 사용까지 도움말에 정리해 두었습니다." }],
};
function cardsOf(m: PlatformModule): ModuleMenu[] { return [...m.menu.filter((i) => i.slug), ...(LANDING_LINKS[m.id] ?? [])]; }

function ActButton({ a, primary }: { a: Act; primary?: boolean }) {
  const variant = primary ? "default" : "outline";
  return (
    <Button asChild size="lg" variant={variant}>
      {a.external ? <a href={a.to}>{a.label}</a> : <Link to={a.to}>{a.label}</Link>}
    </Button>
  );
}

function ModuleBanner({ m }: { m: PlatformModule }) {
  const { member } = useMe();
  const b = BANNER[m.id];
  return (
    <>
      <section className="mt-5 grid overflow-hidden rounded-panel border border-line bg-ground-2 md:h-[264px] md:grid-cols-[1fr_minmax(0,46%)]" aria-label={`${m.name} 소개`}>
        <img src={`/img/module/${m.id}-v2.webp`} alt="" aria-hidden className="aspect-[21/9] w-full object-cover md:order-2 md:aspect-auto md:h-full md:min-h-0" />
        <div className="flex flex-col justify-center px-6 py-7 sm:px-10 md:py-6">
          <p className="max-w-[620px] text-lg leading-[1.7] text-ink-2"><Copy as="span" text={m.desc} /></p>
          {b && (
            <div className="mt-6 flex flex-wrap gap-2">
              <ActButton a={b.primary} primary />
              <ActButton a={b.secondary} />
            </div>
          )}
          <p className="mt-4 text-balance text-sm text-ink-3">무료 범위 · {m.free}{b?.note ? ` · ${b.note}` : ""}</p>
        </div>
      </section>
      {/* 하는 일 — 하위 메뉴 카드(배너는 시안에서 더한 것, 원래 카드는 그대로 둔다). powerMock 은 자기 랜딩에 "할 수 있는 일" 카드가 따로 있다 */}
      {m.id !== "mock" && <MobileCarousel as="section" label="하는 일" className={cn("mt-5 grid grid-cols-1 gap-4 md:grid-cols-2", ({ 2: "", 3: "lg:grid-cols-3", 4: "xl:grid-cols-4", 5: "lg:grid-cols-3 xl:grid-cols-5" } as Record<number, string>)[cardsOf(m).length] ?? "lg:grid-cols-3")} aria-label="하는 일">
        {cardsOf(m).map((i) => (
          <Link key={i.slug} to={i.slug.startsWith("/") ? i.slug : menuHref(m, i)} className="rounded-panel border border-line bg-ground p-6 transition-colors hover:bg-ground-2">
            <div className="flex items-center gap-2 text-lg font-bold">{i.label}{i.slug !== "" && !member && <Lock className="size-4 text-ink-4" aria-label="회원 전용" />}</div>
            <p className="mt-2 text-md leading-[1.7] text-ink-3"><Copy as="span" text={i.desc} /></p>
          </Link>
        ))}
      </MobileCarousel>}
    </>
  );
}

function McpBand() {
  return (
    <section className="mt-11" aria-label="연결 방법">
      {/* 주황 글자는 사이트 공통 #E46B37 하나(사용자 2026-10-13) */}
      <div className="flex flex-col items-start gap-5 rounded-banner bg-dark px-8 py-12 text-white md:flex-row md:items-center md:px-14 dark:bg-ground-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-extrabold tracking-[-0.02em]">연결 방법은 <BrandName name="powerMCP" /> 에서</h2>
          <Copy className="mt-3 text-md leading-[1.7] text-white/70" text="키 만들기와 도구별 설정을 한곳에 모았습니다. AI 도구에 연결하면 이 서비스를 말로 부릅니다." />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="lg" variant="white"><Link to="/powermcp"><BrandName name="powerMCP" /> 열기</Link></Button>
          <Button asChild size="lg" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"><Link to="/docs">자세한 문서</Link></Button>
        </div>
      </div>
    </section>
  );
}

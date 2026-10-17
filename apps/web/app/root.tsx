// 출처: homebox-handoff apps/web/app/root.tsx — 홈박스 전용 프로바이더(필터 팔레트·업그레이드·기관 요청)는 뺐다. 모듈을 옮겨 올 때 필요한 것만 다시 붙인다.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ThemeProvider } from "next-themes";
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration, useLocation } from "react-router";
import { AdminShell } from "@/components/admin/admin-shell";
import type { Route } from "./+types/root";
import { AppFooter } from "@/components/hb/app-footer";
import { AppHeader } from "@/components/hb/app-header";
import { BottomTabBar } from "@/components/hb/bottom-tab-bar";
import { ConsentGate } from "@/components/hb/consent-gate";
import { ScrollTop } from "@/components/hb/scroll-top";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { descForPath, ogTitleForPath, SITE, SITE_DESC, SITE_OG_IMAGE, SITE_URL, titleForPath } from "@/lib/page-title";
import "./styles/app.css";

export const links: Route.LinksFunction = () => [{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }];

// 자기 meta 가 없는 화면(모듈 탭·설정·404 등)의 탭 제목 — 경로로 만든다(lib/page-title). 화면이 meta 를 내면 그쪽이 이긴다.
export const meta: Route.MetaFunction = ({ location }) => {
  return [{ title: titleForPath(location.pathname) }];
};

// 주소 정규형(검색 결과·공유 미리보기 중복 방지) — 쿼리·끝 슬래시를 뺀 운영 주소. React 19 가 <head> 로 올린다.
// 화면별 설명·공유 미리보기(품질 판정 SEO-002) — lib/page-title descForPath·ogTitleForPath.
// 자기 description 을 내는 화면(docs·powermcp)은 descForPath 가 null → 설명을 비워 두 개가 되지 않게
function PageMeta() {
  const p = useLocation().pathname;
  const d = descForPath(p);
  return (
    <>
      {d && <meta name="description" content={d} />}
      <meta property="og:title" content={ogTitleForPath(p)} />
      <meta property="og:description" content={d ?? SITE_DESC} />
    </>
  );
}

function Canonical() {
  const p = useLocation().pathname.replace(/\/+$/, "") || "/";
  return <link rel="canonical" href={SITE_URL + p} />;
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* 기본 설명·공유 미리보기(사이트 종합 평가 리포트 1-6). 제목은 각 화면 meta(없으면 root meta) */}
        <PageMeta />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={SITE} />
        <meta property="og:image" content={SITE_OG_IMAGE} />
        <meta property="og:locale" content="ko_KR" />
        <meta name="twitter:card" content="summary_large_image" />
        <Meta />
        <Links />
      </head>
      <body className="flex min-h-dvh flex-col">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  // /admin 은 공개 사이트와 분리된 별도 사이트처럼(사용자 지시 2026-10-06) — 공개 헤더·푸터·문의 버튼·탭바 없이 관리자 셸만
  const admin = useLocation().pathname.startsWith("/admin");
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: false } } }));
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={200}>
          <Canonical />
          <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-white">본문 바로가기</a>
          {admin ? <AdminShell /> : (
            <>
              <div className="wide-out contents"><AppHeader /></div>
              <main id="content" className="flex-1"><Outlet /></main>
              <div className="wide-out contents"><AppFooter /></div>
              <ScrollTop />
              <div className="wide-out contents"><BottomTabBar /></div>
            </>
          )}
          <ConsentGate />
          <Toaster position="bottom-center" richColors closeButton />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

// 첫 화면 껍데기 — SPA 빌드가 index.html 에 미리 그려 둔다. 스크립트가 다 받아지기 전 4~6초 흰 화면이던 것(2026-10-17 점검)을
// 로고 글자 하나로 채운다. 무거운 자산 없이 인라인 스타일만(CSS 파일이 늦어도 보이게). 주황은 사이트 공통 #E46B37
export function HydrateFallback() {
  return (
    <div role="status" aria-label="불러오는 중" style={{ flex: 1, minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: "#fff", fontFamily: "Pretendard, system-ui, -apple-system, 'Malgun Gothic', sans-serif" }}>
      <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.03em", color: "#1a1a1a" }}>power<span style={{ color: "#E46B37" }}>Plus</span></div>
      <div style={{ fontSize: 14, color: "#8a8a8a" }}>SI 실무자의 올인원</div>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "오류가 발생했습니다";
  let detail = "잠시 후 다시 시도해 주세요.";
  if (isRouteErrorResponse(error)) {
    title = error.status === 404 ? "페이지를 찾을 수 없습니다" : `오류 ${error.status}`;
    detail = error.statusText || detail;
  } else if (import.meta.env.DEV && error instanceof Error) {
    detail = error.message;
  }
  return (
    <div className="container-hb py-24 text-center">
      <h1 className="text-4xl font-extrabold tracking-[-0.03em]">{title}</h1>
      <p className="mt-3 text-md text-ink-4">{detail}</p>
    </div>
  );
}

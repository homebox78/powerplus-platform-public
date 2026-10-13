// 출처: homebox-handoff apps/web/app/components/hb/docs-frame.tsx — 탭·문서 목록을 powerPlus 통합 문서(/docs)로.
// 문서 센터 = 상단 탭(powerMCP·REST API·정책·도움말·소개) → [왼쪽 문서 목록 | 본문 | 오른쪽 "이 페이지"(스크롤 위치 강조)].
// 좁은 화면은 왼쪽 목록 대신 지금 묶음의 문서를 줄바꿈 칩으로 보여 준다(가로 스크롤 없이).
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { cn } from "@/lib/utils";

export interface DocNavGroup { group: string; tab: string; items: Array<[string, string]> }

/** 문서 목록 — 기획 §22 문서 센터. 정책 문서는 /legal/:doc 과 같은 내용을 문서 틀 안에서 보여 준다. */
export const DOC_NAV: DocNavGroup[] = [
  { group: "AI 연결", tab: "/docs", items: [["/docs", "MCP 연결 가이드"], ["/docs/clients", "클라이언트별 설정"], ["/docs/tools", "도구 목록"], ["/account/keys", "MCP 키 발급"]] },
  { group: "개발자", tab: "/docs/api", items: [["/docs/api", "API 문서"], ["/docs/limits", "호출 한도"], ["/docs/errors", "오류 코드"]] },
  { group: "정책", tab: "/docs/terms", items: [["/docs/terms", "이용약관"], ["/docs/copyright", "저작권 정책"], ["/docs/bot", "수집 로봇 안내"]] },
];
export const DOC_TABS: Array<[string, string]> = [["/docs", "powerMCP"], ["/docs/api", "REST API"], ["/docs/terms", "정책"], ["/help", "도움말"], ["/about", "소개"]];

/** /docs/mcp 는 /docs 와 같은 문서 */
const norm = (p: string) => (p.replace(/\/+$/, "") === "/docs/mcp" ? "/docs" : p.replace(/\/+$/, "") || "/");

export function DocsFrame({ toc, children }: { toc: Array<{ id: string; title: string }>; children: React.ReactNode }) {
  const { pathname } = useLocation();
  const here = norm(pathname);
  const group = DOC_NAV.find((g) => g.items.some(([to]) => to === here));
  const [active, setActive] = useState(toc[0]?.id ?? "");
  const ids = toc.map((t) => t.id).join(",");
  useEffect(() => {
    const io = new IntersectionObserver((ents) => {
      const vis = ents.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setActive(vis[0].target.id);
    }, { rootMargin: "-120px 0px -60% 0px" });
    ids.split(",").forEach((id) => { const el = id ? document.getElementById(id) : null; if (el) io.observe(el); });
    return () => io.disconnect();
  }, [ids]);

  return (
    <div className="pb-24">
      <div className="sticky-follow sticky top-[var(--hdr-offset)] z-20 border-b border-line bg-white/90 backdrop-blur dark:bg-ground/90">
        <nav className="container-page flex min-h-14 flex-wrap items-center gap-1 py-2.5" aria-label="문서">
          {DOC_TABS.map(([to, label]) => {
            const on = group ? group.tab === to : here === to;
            return <Link key={to} to={to} aria-current={on ? "page" : undefined} className={cn("inline-flex h-10 shrink-0 items-center rounded-chip px-4 text-md transition-colors", on ? "bg-ground-3 font-semibold text-ink" : "text-ink-3 hover:text-ink")}>{label}</Link>;
          })}
        </nav>
      </div>
      {group && (
        <nav className="container-page flex flex-wrap gap-1.5 pt-5 lg:hidden" aria-label={`${group.group} 문서`}>
          {group.items.map(([to, label]) => (
            <Link key={to} to={to} className={cn("inline-flex h-10 items-center rounded-chip border px-3 text-sm", to === here ? "border-ink bg-ink font-semibold text-white" : "border-line text-ink-3 hover:text-ink")}>{label}</Link>
          ))}
        </nav>
      )}
      <div className="container-page grid grid-cols-1 gap-10 pt-8 lg:grid-cols-[180px_minmax(0,1fr)] lg:pt-12 xl:grid-cols-[180px_minmax(0,1fr)_180px]">
        <aside className="sticky-follow sticky top-[calc(var(--hdr-offset)+104px)] hidden self-start lg:block" aria-label="문서 목록">
          {DOC_NAV.map((g) => (
            <div key={g.group} className="mb-7">
              <div className="text-sm font-semibold text-ink-4">{g.group}</div>
              <ul className="mt-2 flex flex-col">
                {g.items.map(([to, label]) => <li key={to}><Link to={to} aria-current={to === here ? "page" : undefined} className={cn("block rounded-lg px-3 py-2 text-md", to === here ? "bg-ground-3 font-semibold" : "text-ink-3 hover:text-ink")}>{label}</Link></li>)}
              </ul>
            </div>
          ))}
        </aside>
        <article className="min-w-0">{children}</article>
        <nav className="sticky-follow sticky top-[calc(var(--hdr-offset)+104px)] hidden self-start xl:block" aria-label="이 페이지">
          <div className="text-sm font-semibold text-ink-4">이 페이지</div>
          <ul className="mt-3 flex flex-col gap-1 border-l border-line">
            {toc.map((t) => <li key={t.id}><a href={`#${t.id}`} className={cn("-ml-px block border-l-2 py-3 pl-4 text-sm", active === t.id ? "border-point font-semibold text-ink" : "border-transparent text-ink-3 hover:text-ink")}>{t.title}</a></li>)}
          </ul>
        </nav>
      </div>
    </div>
  );
}

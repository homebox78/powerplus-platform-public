// 출처: homebox-handoff apps/web/app/routes/search.tsx (S08 통합검색 — 큰 검색창 + 선 탭(건수) + 탭별 결과) 의 틀·톤을 이식.
// 플랫폼판(기획 §13.2-4): 탭 = 에셋 · 가이드 · 커뮤니티 · 내 장표 작업 · 내 시안.
// 권한은 서버가 탭마다 그 모듈의 판정으로 거른다(에셋·커뮤니티 = 공개 범위, 장표·시안 = 본인 것만). 가이드는 정적 데이터라 여기서 거른다.
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FileText, MessageSquare, Presentation } from "lucide-react";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { Copy } from "@/components/hb/copy";
import { SearchInput } from "@/components/hb/search-input";
import { Tag } from "@/components/hb/tag";
import { ThumbFrame } from "@/components/hb/thumb-frame";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { categoriesQuery } from "@/lib/community";
import { fmtDate } from "@/lib/mock";
import { kitRegistryQuery, searchQuery, type SearchType } from "@/lib/search";
import { KRDS_COMPONENTS } from "@/modules/guide/data/krds";
import { KRDS_PATTERNS } from "@/modules/guide/data/krds-patterns";
import { STATUS } from "@/modules/deck/legacy/ui";
import { cn } from "@/lib/utils";
import type { Route } from "./+types/search";
import { MemberGate } from "@/components/hb/member-gate";

export const meta: Route.MetaFunction = ({ location }) => [{ title: `${new URLSearchParams(location.search).get("q") ?? ""} 검색 — powerPlus`.trim() }];

type Tab = SearchType | "guide";
const TABS: Array<[Tab, string]> = [["assets", "에셋"], ["guide", "가이드"], ["community", "커뮤니티"], ["deck", "내 장표 작업"], ["mockups", "내 시안"]];
const SIGNED_ONLY: Tab[] = ["deck", "mockups"];

interface GuideHit { key: string; title: string; kind: string; desc: string; to: string; external: boolean }

/** 가이드 — 부품 카탈로그 + KRDS 대응표(컴포넌트·패턴). 화면 안 검색 */
function useGuideHits(q: string): GuideHit[] {
  const kit = useQuery(kitRegistryQuery);
  return useMemo(() => {
    const k = q.trim().toLowerCase().replace(/\s+/g, "");
    if (!k) return [];
    const hit = (...s: Array<string | undefined>) => s.some((x) => (x ?? "").toLowerCase().replace(/\s+/g, "").includes(k));
    const parts: GuideHit[] = (kit.data?.metas ?? []).filter((m) => hit(m.title, m.id, m.note)).map((m) => ({
      key: `kit-${m.id}`, title: m.title, kind: "부품", desc: m.note ?? m.id, to: `/kit-files/preview/index.html?embed=1&c=${m.id}`, external: true,
    }));
    const comps: GuideHit[] = KRDS_COMPONENTS.filter((c) => hit(c.ko, c.en)).map((c) => ({
      key: `krds-${c.cat}-${c.ko}`, title: c.ko, kind: "KRDS 컴포넌트", desc: `${c.en} · ${c.cat}${c.id ? "" : " · 미대응"}`, to: "/guide/krds", external: false,
    }));
    const pats: GuideHit[] = KRDS_PATTERNS.filter((p) => hit(p.ko, p.desc)).map((p) => ({
      key: `pat-${p.ko}`, title: p.ko, kind: "KRDS 패턴", desc: p.desc, to: "/guide/krds", external: false,
    }));
    return [...parts, ...comps, ...pats];
  }, [q, kit.data]);
}

// 회원 전용(2026-10-16) — 서버도 같은 판정으로 API 를 막는다
export default function SearchPage() {
  return <MemberGate title="통합 검색"><SearchPageBody /></MemberGate>;
}

function SearchPageBody() {
  const [params, setParams] = useSearchParams();
  const q = (params.get("q") ?? "").trim();
  const type = (TABS.some(([t]) => t === params.get("type")) ? params.get("type") : "assets") as Tab;
  // 가이드 탭을 보는 동안에도 다른 탭 건수는 서버에서 받는다(에셋 결과를 같이 받아 둔다)
  const res = useQuery(searchQuery(q, type === "guide" ? "assets" : type));
  const guide = useGuideHits(q);
  const cats = useQuery(categoriesQuery);
  const catName = (id: string) => cats.data?.items.find((c) => c.id === id)?.name ?? id;
  const signedIn = res.data?.signed_in ?? false;
  const count = (t: Tab) => (t === "guide" ? guide.length : (res.data?.counts[t] ?? 0));
  const setType = (t: string) => { const p = new URLSearchParams(params); p.set("type", t); setParams(p, { replace: true }); };
  const label = TABS.find(([t]) => t === type)![1];
  const items = type === "guide" ? [] : (res.data?.items ?? []);
  const empty = type === "guide" ? guide.length === 0 : items.length === 0;

  return (
    <div className="container-hb pb-12 pt-10">
      {/* 화면 제목(품질 판정 A11Y-001) — 검색창이 곧 머리라 눈에는 숨기고 읽기 도구에만 */}
      <h1 className="sr-only">통합 검색</h1>
      <form role="search" onSubmit={(e) => { e.preventDefault(); const v = String(new FormData(e.currentTarget).get("q") ?? "").trim(); const p = new URLSearchParams(params); if (v) p.set("q", v); else p.delete("q"); setParams(p); }} className="mx-auto flex max-w-[640px] items-center gap-3">
        <SearchInput key={q} size="hero" name="q" defaultValue={q} kbd={false} placeholder="에셋, 가이드, 커뮤니티, 내 장표·시안 검색" autoFocus className="flex-1" />
      </form>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 text-center text-sm text-ink-4">
        {q ? <span>“<b className="text-ink">{q}</b>” 검색 결과</span> : <span>검색어를 입력하면 다섯 곳을 한 번에 찾습니다.</span>}
      </div>

      <Tabs value={type} onValueChange={setType} className="mt-6 gap-0">
        <TabsList variant="line" className="h-auto w-full flex-wrap justify-start gap-0 border-b border-line p-0">
          {TABS.map(([t, l]) => (
            <TabsTrigger key={t} value={t} className="h-14 flex-none rounded-none px-4 text-md font-medium text-ink-4 group-data-horizontal/tabs:after:-bottom-px after:h-0.5 data-active:font-bold data-active:text-ink">
              {l}<span className="ml-1.5 rounded-chip bg-ground-3 px-1.5 py-0.5 text-xs font-semibold text-ink-3">{q ? count(t).toLocaleString() : 0}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="mt-8">
        {!q ? (
          <div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-ink-4">이런 검색어로 시작해 보세요</span>{["아이콘", "민원", "버튼", "인사말", "공지"].map((w) => <Link key={w} to={`/search?q=${encodeURIComponent(w)}`} className="rounded-chip border border-line-3 px-3 py-1 hover:bg-ground-2">{w}</Link>)}</div>
        ) : type !== "guide" && res.isLoading ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-[200px] rounded-card" />)}</div>
        ) : type !== "guide" && res.isError ? (
          <p className="py-16 text-center text-ink-4">검색에 실패했습니다.</p>
        ) : SIGNED_ONLY.includes(type) && !signedIn ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center text-ink-4">
            <Copy as="span" text={`${label}은(는) 로그인하면 내 것만 찾습니다.`} />
            <Link to={`/login?next=${encodeURIComponent(`/search?q=${q}&type=${type}`)}`} className="rounded-chip border border-line-3 px-4 py-1.5 text-sm text-ink hover:bg-ground-2">로그인</Link>
          </div>
        ) : empty ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center text-ink-4"><img src="/img/empty-search-v2.webp" alt="" aria-hidden className="size-40 rounded-panel object-cover" /><span>“{q}”에 맞는 {label} 결과가 없습니다.</span><span className="text-sm">다른 탭이나 짧은 검색어로 시도해 보세요.</span></div>
        ) : type === "guide" ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {guide.map((g) => {
              const body = (
                <>
                  <span className="flex items-center gap-2"><span className="min-w-0 truncate text-lg font-bold">{g.title}</span><Tag tone="soft">{g.kind}</Tag>{g.external && <ExternalLink className="ml-auto size-4 shrink-0 text-ink-4" aria-hidden />}</span>
                  <span className="line-clamp-2 text-sm leading-[1.6] text-ink-3">{g.desc}</span>
                </>
              );
              const cls = "flex flex-col gap-2 rounded-panel border border-line bg-ground p-5 transition-colors hover:bg-ground-2";
              return g.external ? <a key={g.key} href={g.to} target="_blank" rel="noreferrer" className={cls}>{body}</a> : <Link key={g.key} to={g.to} className={cls}>{body}</Link>;
            })}
          </div>
        ) : type === "assets" ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {items.map((x) => x.type === "asset" && (
              <Link key={x.id} to={x.url} className="group flex min-w-0 flex-col gap-2.5 rounded-card focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2">
                <ThumbFrame ratio="16/10" radius="card" className="bg-ground-3">
                  {x.thumb_url && <img src={x.thumb_url} alt="" loading="lazy" className="absolute inset-0 m-auto max-h-[78%] max-w-[78%] object-contain" />}
                </ThumbFrame>
                <span className="flex min-w-0 items-center gap-2"><span className="min-w-0 truncate text-md font-bold">{x.title}</span>{x.ai && <Tag tone="soft">AI</Tag>}</span>
                <span className="text-sm text-ink-4">{x.category_ko}</span>
              </Link>
            ))}
          </div>
        ) : type === "community" ? (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {items.map((x) => x.type === "post" && (
              <li key={x.id}>
                <Link to={x.url} className="flex flex-col gap-1.5 px-5 py-4 transition-colors hover:bg-ground-2">
                  <span className="flex min-w-0 items-center gap-2"><Tag tone="soft">{catName(x.category)}</Tag><span className="min-w-0 truncate text-md font-bold">{x.title}</span></span>
                  <span className="line-clamp-2 text-sm text-ink-3">{x.excerpt}</span>
                  <span className="flex items-center gap-3 text-xs text-ink-4"><span>{x.author}</span><span>{fmtDate(x.created_at)}</span><span className="inline-flex items-center gap-1"><MessageSquare className="size-3.5" aria-hidden />{x.comments}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        ) : type === "deck" ? (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {items.map((x) => x.type === "deck" && (
              <li key={x.id}>
                <Link to={x.url} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-ground-2">
                  <Presentation className="size-5 shrink-0 text-ink-3" aria-hidden />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5"><span className="truncate text-md font-bold">{x.title || x.filename || "제목 없는 작업"}</span><span className="truncate text-xs text-ink-4">{x.filename}</span></span>
                  <span className="hidden w-[64px] shrink-0 text-right text-sm tabular-nums text-ink-3 sm:block">{x.slides ?? "—"}장</span>
                  <Tag tone={x.status === "done" ? "ok" : x.status === "failed" ? "warn" : "soft"}>{STATUS[x.status]?.label ?? x.status}</Tag>
                  <span className="hidden w-[92px] shrink-0 text-center text-sm tabular-nums text-ink-4 md:block">{fmtDate(x.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((x) => x.type === "mockup" && (
              <div key={x.id} className="flex min-w-0 flex-col gap-2.5">
                <a href={x.preview_url} target="_blank" rel="noreferrer" className="block rounded-card focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2" aria-label={`${x.title} 미리보기`}>
                  <ThumbFrame ratio="16/10" radius="card" className="flex items-center justify-center bg-ground-3"><FileText className="size-8 text-ink-4" aria-hidden /></ThumbFrame>
                </a>
                <Link to={x.url} className="flex min-w-0 items-center gap-2 hover:underline"><span className="min-w-0 truncate text-md font-bold">{x.title}</span></Link>
                <span className="flex flex-wrap items-center gap-1.5 text-sm text-ink-4">
                  {x.score !== null && <Tag tone={x.passed ? "ok" : "warn"}>{x.score}점</Tag>}
                  {x.published && <Tag tone="ink">게시</Tag>}
                  {x.discarded && <Tag tone="line">폐기</Tag>}
                  <span className={cn("ml-auto tabular-nums")}>{fmtDate(x.created_at)}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

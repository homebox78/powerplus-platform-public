// 출처: homebox-handoff apps/web/app/routes/help.tsx — 카테고리 아이콘을 powerPlus 분류(시작·에셋·장표·목업·가이드·계정)로, 히어로 #111 을 토큰 bg-dark 로, 문서 카드 흰 바탕에 다크 모드 대응, 제목 powerPlus
import { MobileCarousel } from "@/components/hb/mobile-carousel";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { BookOpenText, Boxes, Bot, ChevronRight, FileSliders, KeyRound, Rocket, Search, ThumbsDown, ThumbsUp } from "lucide-react";
// 카테고리별 아이콘 — 모듈 아이콘(modules.ts)과 같은 모양
const CAT_ICON: Record<string, typeof Rocket> = { start: Rocket, assets: Boxes, deck: FileSliders, mock: Bot, guide: BookOpenText, account: KeyRound };
import { toast } from "sonner";
import { Copy } from "@/components/hb/copy";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchHelpDocs } from "@/lib/admin";
import { buildHelpTree, type HelpArticle, type HelpCategory } from "@/lib/help-content";
import type { Route } from "./+types/help";
import { BackButton } from "@/components/hb/back-button";

// 도움말 센터 — Mobbin Help Center 구조 (체크리스트 E1~E4, 2026-09-24).
// /help = 검정 히어로 + 검색 + 카테고리 카드 / /help/:cat = 문서 목록 / /help/:cat/:article = 문서 한 장.
// 문서는 /help/docs(API, core_help_docs 발행본)에서 받아 카테고리 트리로 — 관리자 /admin/help 에서 고친 것이 바로 보인다.
/** powerAssets 애드인 설치 파일 — 이 플랫폼이 /addin/ 에서 내준다(서버가 최신 설치 파일 주소로 보낸다). 시작하기 다운로드 버튼과 같은 주소 */
const ADDIN_SETUP = "/api/v1/assets/setup/download";

export const meta: Route.MetaFunction = () => [{ title: "도움말 센터 — powerPlus" }];

export default function HelpPage() {
  const { cat, article } = useParams();
  const docs = useQuery({ queryKey: ["help", "docs"], queryFn: fetchHelpDocs, staleTime: 60_000 });
  const tree = useMemo(() => buildHelpTree(docs.data ?? []), [docs.data]);
  if (docs.isPending) return <div className="container-page py-20"><Skeleton className="h-10 w-1/2" /><Skeleton className="mt-6 h-40 w-full" /></div>;
  const c = tree.find((x) => x.id === cat);
  const a = c?.articles.find((x) => x.slug === article);
  if (cat && !c) return <NotFound />;
  if (c && article && !a) return <NotFound />;
  if (c && a) return <ArticleView cat={c} art={a} />;
  if (c) return <CategoryView cat={c} />;
  return <HelpHome tree={tree} />;
}

function Crumb({ items }: { items: Array<[string, string?]> }) {
  return (
    <nav aria-label="경로" className="flex flex-wrap items-center gap-1.5 text-sm text-ink-3">
      {items.map(([label, to], i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="size-3.5" aria-hidden />}
          {to ? <Link to={to} className="hover:text-ink">{label}</Link> : <span className="font-semibold text-ink">{label}</span>}
        </span>
      ))}
    </nav>
  );
}

function HelpHome({ tree }: { tree: HelpCategory[] }) {
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    const k = q.trim();
    if (!k) return [];
    return tree.flatMap((c) => c.articles.filter((a) => (a.title + a.body.join(" ")).includes(k)).map((a) => ({ c, a })));
  }, [q, tree]);
  return (
    <div className="pb-14">
      <section className="bg-dark text-white dark:bg-ground-3">
        <div className="container-page flex flex-col items-center py-20 text-center">
          <h1 className="text-[40px] font-extrabold tracking-[-0.03em] md:text-[56px]">무엇을 도와드릴까요?</h1>
          <label className="relative mt-8 w-full max-w-[560px]">
            <span className="sr-only">도움말 검색</span>
            <Search className="pointer-events-none absolute left-5 top-1/2 size-5 -translate-y-1/2 text-white/60" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="도움말 검색" className="h-14 w-full rounded-full bg-white/10 pl-14 pr-5 text-lg text-white placeholder:text-white/50" />
          </label>
          {q.trim() && (
            <div className="mt-4 w-full max-w-[560px] rounded-2xl bg-[#2A2A2C] p-2 text-left">
              {hits.length === 0 && <p className="px-4 py-3 text-md text-white/60">찾는 문서가 없습니다. <Link to="/contact" className="pp-hit underline underline-offset-4">문의하기</Link></p>}
              {hits.map(({ c, a }) => (
                <Link key={c.id + a.slug} to={`/help/${c.id}/${a.slug}`} className="hb-dark-item flex flex-col rounded-xl px-4 py-3">
                  <span className="text-md font-semibold">{a.title}</span>
                  <span className="text-sm text-white/60">{c.title}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
      <MobileCarousel label="도움말 분류" className="container-page mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tree.map((c) => (
          <Link key={c.id} to={`/help/${c.id}`} className="group flex gap-5 rounded-panel bg-ground-3 p-7 transition-colors hover:bg-ground-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white dark:bg-ground">{(() => { const I = CAT_ICON[c.id] ?? Rocket; return <I className="size-6" aria-hidden />; })()}</span>
            <span className="flex min-w-0 flex-col">
              <span className="text-xl font-bold">{c.title}</span>
              <span className="mt-1 text-md text-ink-3">{c.desc}</span>
              <span className="mt-4 text-sm text-ink-4">문서 {c.articles.length}개</span>
            </span>
          </Link>
        ))}
      </MobileCarousel>
      <p className="container-page mt-14 text-center text-md text-ink-3">원하는 답이 없나요? <Link to="/contact" className="pp-hit font-semibold text-ink underline underline-offset-4">문의하기</Link></p>
    </div>
  );
}

function CategoryView({ cat }: { cat: HelpCategory }) {
  return (
    <div className="container-page pb-14 pt-12">
      <BackButton fallback="/help" className="mb-3" />
      <Crumb items={[["도움말 센터", "/help"], [cat.title]]} />
      <h1 className="mt-6 text-5xl font-extrabold tracking-[-0.03em]">{cat.title}</h1>
      <p className="mt-3 text-lg text-ink-3">{cat.desc}</p>
      <ul className="mt-10 flex flex-col gap-3">
        {cat.articles.map((a) => (
          <li key={a.slug}>
            <Link to={`/help/${cat.id}/${a.slug}`} className="flex items-center gap-4 rounded-panel bg-ground-3 px-6 py-5 transition-colors hover:bg-ground-4">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-lg font-semibold">{a.title}</span>
                <span className="mt-1 text-sm text-ink-4">최종 수정일 {a.updated}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-ink-4" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ArticleView({ cat, art }: { cat: HelpCategory; art: HelpArticle }) {
  const [voted, setVoted] = useState<null | boolean>(null);
  const vote = (yes: boolean) => { setVoted(yes); toast.success(yes ? "도움이 되었다니 다행입니다." : "알려 주셔서 고맙습니다.", yes ? undefined : { description: "더 필요한 내용은 문의로 보내 주세요." }); };
  const others = cat.articles.filter((a) => a.slug !== art.slug);
  return (
    <div className="container-page pb-14 pt-12">
      <BackButton fallback={`/help/${cat.id}`} className="mb-3" />
      <Crumb items={[["도움말 센터", "/help"], [cat.title, `/help/${cat.id}`], [art.title]]} />
      <article className="mt-6 rounded-banner border border-line bg-white p-8 dark:bg-ground-2 md:p-12">
        <h1 className="text-4xl font-extrabold tracking-[-0.03em]">{art.title}</h1>
        <p className="mt-3 text-sm text-ink-4">최종 수정일 {art.updated}</p>
        <div className="mt-8 flex flex-col gap-4">
          {art.body.map((p, i) => p.includes("powerAssets_Setup.exe")
            ? <p key={i} className="text-md leading-[1.8] text-ink-2">{p.split("powerAssets_Setup.exe")[0]}<a href={ADDIN_SETUP} download className="font-semibold text-ink underline underline-offset-4">powerAssets_Setup.exe</a>{p.split("powerAssets_Setup.exe")[1]}</p>
            : <Copy key={i} className="text-md leading-[1.8] text-ink-2" text={p} />)}
        </div>
        {cat.id === "assets" && art.slug === "install" && (
          <div className="mt-8 flex flex-col gap-2 rounded-2xl bg-ground-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-md">설치 파일(<a href={ADDIN_SETUP} download className="font-semibold underline underline-offset-4">powerAssets_Setup.exe</a>)을 받아 실행합니다.</span>
            <Button size="sm" asChild><a href={ADDIN_SETUP} download>설치 파일 받기</a></Button>
          </div>
        )}
        {art.steps && (
          <ol className="mt-8 flex flex-col gap-3">
            {art.steps.map((s, i) => (
              <li key={i} className="flex items-start gap-4 rounded-2xl bg-ground-3 px-5 py-4 text-md">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-ink text-sm font-bold text-white">{i + 1}</span>
                <span className="pt-0.5">{s}</span>
              </li>
            ))}
          </ol>
        )}
        <div className="mt-12 flex flex-col items-center gap-4 border-t border-line pt-8 text-center">
          <p className="text-md font-semibold">도움이 되었나요?</p>
          <div className="flex gap-2">
            <Button size="sm" variant={voted === true ? "default" : "outline"} onClick={() => vote(true)} aria-pressed={voted === true}><ThumbsUp aria-hidden />예</Button>
            <Button size="sm" variant={voted === false ? "default" : "outline"} onClick={() => vote(false)} aria-pressed={voted === false}><ThumbsDown aria-hidden />아니오</Button>
          </div>
        </div>
      </article>
      {others.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-bold">이 카테고리의 다른 문서</h2>
          <ul className="mt-4 flex flex-col gap-2">
            {others.map((a) => <li key={a.slug}><Link to={`/help/${cat.id}/${a.slug}`} className="flex items-center justify-between rounded-2xl px-4 py-3 text-md hover:bg-ground-3">{a.title}<ChevronRight className="size-4 text-ink-4" aria-hidden /></Link></li>)}
          </ul>
        </section>
      )}
    </div>
  );
}

function NotFound() {
  return (
    <div className="container-page py-28 text-center">
      <p className="text-xl font-bold">문서를 찾을 수 없습니다.</p>
      <Link to="/help" className="mt-4 inline-block text-md underline underline-offset-4">도움말 센터로</Link>
    </div>
  );
}

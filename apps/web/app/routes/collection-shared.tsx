// 출처: homebox-handoff apps/web/app/routes/collection-shared.tsx — API /c/{token}(공개, noindex), 편집 없음.
// 보는 사람이 볼 수 없는 항목은 서버가 그림·식별자를 빼고 잠근다(G30) — 이 화면은 받은 대로 그린다.
import { useQuery } from "@tanstack/react-query";
import { Bookmark } from "lucide-react";
import { Link, useParams } from "react-router";
import { Copy } from "@/components/hb/copy";
import { SavedItemCard } from "@/components/hb/saved-item-card";
import { Tag } from "@/components/hb/tag";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import type { Collection, CollectionItem } from "@/lib/saved";
import type { Route } from "./+types/collection-shared";

export const meta: Route.MetaFunction = () => [{ title: "공유 컬렉션 — powerPlus" }, { name: "robots", content: "noindex" }];

export default function SharedCollectionPage() {
  const { token = "" } = useParams();
  const q = useQuery({ queryKey: ["collection-shared", token], queryFn: () => apiFetch<{ collection: Collection; items: CollectionItem[] }>(`/c/${encodeURIComponent(token)}`), retry: false });

  if (q.isLoading) {
    return (
      <div className="container-page pb-12 pt-10">
        <Skeleton className="h-10 w-72" />
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="aspect-[16/10] rounded-card" />)}</div>
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="container-page flex flex-col items-center py-28 text-center">
        <Bookmark className="size-8 text-ink-4" aria-hidden />
        <h1 className="mt-4 text-2xl font-bold">공유 링크를 열 수 없습니다.</h1>
        <Copy className="mt-2 text-md text-ink-3" text="링크가 잘못됐거나, 주인이 공유를 끈 컬렉션입니다." />
        <Link to="/" className="mt-6 text-md font-semibold underline underline-offset-4">powerPlus 둘러보기</Link>
      </div>
    );
  }
  const { collection: c, items } = q.data;
  return (
    <div className="container-page pb-12 pt-10">
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-4"><Tag tone="line">공유 컬렉션</Tag><span>{c.owner ?? "회원"} · 읽기 전용 · {c.updated_at.slice(0, 10).replaceAll("-", ".")} 갱신</span></div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 break-keep text-4xl font-extrabold tracking-[-0.03em]">{c.name}</h1>
        <Tag tone="line">{c.items_n}개</Tag>
        {c.mine && <Link to={`/account/saved/${c.id}`} className="ml-auto text-sm font-semibold underline underline-offset-4">내 저장에서 편집</Link>}
      </div>
      {c.memo && <p className="mt-4 max-w-[720px] whitespace-pre-line text-md leading-[1.7] text-ink-3">{c.memo}</p>}
      {items.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-3 rounded-card border border-dashed border-line-3 py-20 text-ink-4"><Bookmark className="size-8" aria-hidden /><span>담긴 항목이 없습니다.</span></div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-4">
          {items.map((it, i) => <SavedItemCard key={`${it.type}-${it.ref ?? i}`} it={it} />)}
        </div>
      )}
    </div>
  );
}

// 마이페이지 · 내 글 — 커뮤니티 왼쪽 메뉴의 "내 글"을 이리로 옮겼다(사용자 2026-10-08).
// 서버는 그대로 /community/posts?mine=1. 글을 누르면 커뮤니티 본문(/community/:id)으로 간다.
import { useQuery } from "@tanstack/react-query";
import { Eye, Heart, MessageCircle, PenLine } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Tag } from "@/components/hb/tag";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { postsQuery } from "@/lib/community";
import type { Route } from "./+types/account-posts";

export const meta: Route.MetaFunction = () => [{ title: "내 글 — powerPlus" }];

const CAT: Record<string, string> = { notice: "공지사항", qna: "질문·답변", showcase: "작업 공유", tip: "제보·제안", free: "자유", staff: "사내 게시판" };
const day = (s: string) => s.slice(0, 10).replaceAll("-", ".");

export default function AccountPostsPage() {
  const [sort, setSort] = useState<"new" | "popular">("new");
  const q = useQuery(postsQuery({ mine: true, sort }));
  const items = q.data?.items ?? [];
  return (
    <div>
      <nav className="text-sm text-ink-4" aria-label="경로"><Link to="/account" className="hover:text-ink">계정</Link> <span aria-hidden>›</span> 내 글</nav>
      <div className="mt-3 flex flex-wrap items-end gap-4">
        <h1 className="text-4xl font-extrabold tracking-[-0.03em]">내 글</h1>
        <div className="flex gap-1.5 pb-1.5"><Tag tone="line">{q.data?.total ?? 0}개</Tag></div>
        <span className="flex-1" />
        <div role="radiogroup" aria-label="정렬" className="flex rounded-lg bg-ground-3 p-1">
          {(["new", "popular"] as const).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={sort === s} onClick={() => setSort(s)}
              className="h-8 rounded-md px-3 text-sm font-semibold text-ink-4 aria-checked:bg-ground aria-checked:text-ink aria-checked:shadow-sm">
              {s === "new" ? "최신순" : "인기순"}
            </button>
          ))}
        </div>
        <Button asChild size="md"><Link to="/community"><PenLine aria-hidden />커뮤니티로</Link></Button>
      </div>
      <p className="mt-3 text-md text-ink-3">커뮤니티에 쓴 글을 모아 봅니다.</p>

      <div className="mt-7 overflow-hidden rounded-xl border border-line">
        {q.isLoading && <div className="grid gap-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>}
        {!q.isLoading && items.length === 0 && (
          <div className="py-16 text-center text-ink-4">
            <p>아직 쓴 글이 없습니다.</p>
            <Button asChild variant="outline" size="sm" className="mt-4"><Link to="/community">커뮤니티에 글 쓰기</Link></Button>
          </div>
        )}
        <ul className="divide-y divide-line">
          {items.map((p) => (
            <li key={p.id}>
              <Link to={`/community/${p.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-ground-2">
                <Tag tone="line" className="shrink-0">{CAT[p.category] ?? p.category}</Tag>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-ink">{p.title}</div>
                  {p.excerpt && <div className="mt-0.5 truncate text-sm text-ink-4">{p.excerpt}</div>}
                </div>
                <div className="hidden shrink-0 items-center gap-3 text-sm tabular-nums text-ink-4 sm:flex">
                  <span className="inline-flex items-center gap-1"><Eye className="size-3.5" aria-hidden />{p.views}</span>
                  <span className="inline-flex items-center gap-1"><Heart className="size-3.5" aria-hidden />{p.likes}</span>
                  <span className="inline-flex items-center gap-1"><MessageCircle className="size-3.5" aria-hidden />{p.comments}</span>
                </div>
                <span className="w-20 shrink-0 text-center text-sm tabular-nums text-ink-4">{day(p.created_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// 출처: homebox-handoff apps/web/app/routes/community.tsx (shadcn blocks sidebar-09) — 플랫폼 상위 메뉴 "커뮤니티"로.
//  사용자 지시(2026-10-06): 기존 커뮤니티를 살려 외부 메뉴로 — 공지사항부터 게시판·커뮤니티 용도.
//  [아이콘 레일: 분류] [글 목록: 인기순·검색 — 경로 줄 왼쪽 버튼으로 접기] [본문: 경로 줄 + 글·댓글]
//  주소: /community?c=분류&q=검색&sort=popular · /community/:id(public_id). 사내 게시판 분류는 없앰(자유게시판을 사내용으로 씀, 2026-10-13).
import { useEffect, useRef, useState } from "react";
import { MBr } from "@/components/hb/copy";
import { WideToggle } from "@/components/hb/work-space";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, Eye, Heart, MessageCircle, MessageCircleQuestion, MessagesSquare, Megaphone, Palette, Lock, PanelLeft, PenLine, Rows3, Search, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { SidebarInput, SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { confirmToast, toastError } from "@/components/hb/confirm";
import { SaveButton } from "@/components/hb/save-button";
import { useMe } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { categoriesQuery, postQuery, postsQuery, shortDate, useCommunityMutations, type CommunityAuthor, type CommunityPostItem } from "@/lib/community";
import { MODULES } from "@/lib/modules";
import { cn } from "@/lib/utils";
import type { Route } from "./+types/community";

export const meta: Route.MetaFunction = () => [{ title: "커뮤니티 — powerPlus" }];

const RAIL = [
  { id: "", name: "전체", icon: Rows3 },
  { id: "notice", name: "공지사항", icon: Megaphone },
  { id: "qna", name: "질문·답변", icon: MessageCircleQuestion },
  { id: "showcase", name: "작업 공유", icon: Palette },
  { id: "free", name: "자유", icon: MessagesSquare },
] as const;
const catName = (id: string) => RAIL.find((r) => r.id === id)?.name ?? "전체";
const moduleName = (id: string | null) => MODULES.find((m) => m.id === id)?.name ?? null;
type EditorValue = { id?: string; category: string; title: string; body: string; module: string | null };

export default function CommunityPage() {
  const { id: postId = null } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { me, isAdmin } = useMe();
  const cat = params.get("c") ?? "";
  const q = params.get("q") ?? "";
  const popular = params.get("sort") === "popular";
  const [editor, setEditor] = useState<null | EditorValue>(null);

  const setParam = (k: string, v: string) => setParams((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });
  const cats = useQuery(categoriesQuery);
  const posts = useQuery(postsQuery({ category: cat === "mine" ? undefined : cat || undefined, q, sort: popular ? "popular" : "new", mine: cat === "mine" }));
  const listSearch = params.toString() ? `?${params}` : "";
  const openWrite = () => {
    if (!me) { toast("글을 쓰려면 로그인이 필요합니다.", { action: { label: "로그인", onClick: () => navigate("/login") } }); return; }
    const allowed = cat && cat !== "mine" && (cat !== "notice" || isAdmin);
    setEditor({ category: allowed ? cat : "qna", title: "", body: "", module: null });
  };

  return (
    <div className="container-page work-wide py-6">
      <div className="flex min-h-[600px] overflow-clip rounded-2xl border border-line-2 bg-ground">
        <SidebarProvider className="min-h-0" style={{ "--sidebar-width": "min(22rem, calc(100vw - 6rem))" } as React.CSSProperties}>
          {/* ① 아이콘 레일 */}
          <nav aria-label="커뮤니티 분류" className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-line-2 bg-ground-2 py-3">
            <Link to="/community" className="mb-2 inline-flex size-9 items-center justify-center rounded-lg bg-ink text-ground" aria-label="커뮤니티 처음으로"><MessagesSquare className="size-4" aria-hidden /></Link>
            {RAIL.map((r) => {
              const active = cat === r.id;
              const count = r.id === "" ? cats.data?.total : cats.data?.items.find((c) => c.id === r.id)?.count;
              return (
                <Tooltip key={r.id || "all"}>
                  <TooltipTrigger asChild>
                    <Link to={{ pathname: "/community", search: r.id ? `?c=${r.id}` : "" }} aria-label={r.name} aria-current={active ? "page" : undefined}
                      className={cn("relative inline-flex size-10 items-center justify-center rounded-lg text-ink-3 hover:bg-ground-3 hover:text-ink", active && "bg-ground text-ink shadow-[0_1px_3px_rgba(0,0,0,.08)] ring-1 ring-line-2")}>
                      <r.icon className="size-[18px]" aria-hidden />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">{r.name}{count !== undefined ? ` · ${count}` : ""}</TooltipContent>
                </Tooltip>
              );
            })}
            <div className="mt-auto">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" onClick={openWrite} aria-label="글쓰기" className="inline-flex size-10 items-center justify-center rounded-lg text-ink-3 hover:bg-ground-3 hover:text-ink"><PenLine className="size-[18px]" aria-hidden /></button>
                </TooltipTrigger>
                <TooltipContent side="right">글쓰기</TooltipContent>
              </Tooltip>
            </div>
          </nav>

          {/* ② 글 목록 */}
          <ListPanel title={cat ? catName(cat) : "커뮤니티"} desc={cats.data?.items.find((c) => c.id === cat)?.desc ?? (cat === "mine" ? "내가 쓴 글" : q ? "모든 분류의 글" : "모든 분류의 최근 글 4개")}
            popular={popular} onPopular={(v) => setParam("sort", v ? "popular" : "")}
            onSearch={(v) => setParam("q", v.trim())}
            items={cat === "" && !q
              // 전체 = 모든 분류의 최근 글 4개만(사용자 2026-10-07·10-13) — 더 보려면 분류를 고른다
              ? [...(posts.data?.items ?? [])].sort((x, y) => (x.created_at < y.created_at ? 1 : -1)).slice(0, 4)
              : posts.data?.items ?? []} loading={posts.isLoading} activeId={postId} listSearch={listSearch} q={q} fill={cat === "" && !q && !postId} />

          {/* ③ 본문 */}
          <div className="flex min-w-0 flex-1 flex-col max-lg:peer-data-[open=true]:hidden">
            <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line-2 px-4">
              <ListToggle hasPost={!!postId} />
              <span aria-hidden className="h-5 w-px shrink-0 bg-line-2" />
              <Breadcrumb className="min-w-0 flex-1">
                <BreadcrumbList className="flex-nowrap">
                  <BreadcrumbItem><BreadcrumbLink asChild><Link to="/community">커뮤니티</Link></BreadcrumbLink></BreadcrumbItem>
                  <BreadcrumbSeparator />
                  {postId ? <PostCrumb id={postId} /> : <BreadcrumbItem><BreadcrumbPage>{catName(cat)}</BreadcrumbPage></BreadcrumbItem>}
                </BreadcrumbList>
              </Breadcrumb>
              <WideToggle className="max-sm:hidden" />
              <Button size="sm" className="shrink-0" onClick={openWrite} aria-label="글쓰기"><PenLine aria-hidden /><span className="max-sm:hidden">글쓰기</span></Button>
            </header>
            <div className="min-h-0 flex-1">
              {postId ? <PostView id={postId} onEdit={(p) => setEditor(p)} backTo={`/community${listSearch}`} />
                : cat === "" && !q ? <Dashboard counts={cats.data?.items ?? []} /> : <Welcome cat={cat} count={posts.data?.items.length ?? 0} onWrite={openWrite} />}
            </div>
          </div>
        </SidebarProvider>
      </div>
      {editor && <EditorDialog value={editor} isAdmin={isAdmin} onClose={() => setEditor(null)} onSaved={(nid) => { setEditor(null); navigate(`/community/${nid}${listSearch}`); }} />}
    </div>
  );
}

function ListPanel({ title, desc, popular, onPopular, onSearch, items, loading, activeId, listSearch, q, fill }: {
  title: string; desc: string; popular: boolean; onPopular: (v: boolean) => void; onSearch: (v: string) => void;
  items: CommunityPostItem[]; loading: boolean; activeId: string | null; listSearch: string; q: string; fill?: boolean;
}) {
  const { open, setOpen } = useSidebar();
  // 1024 미만(태블릿·모바일)은 목록과 본문을 나란히 못 둔다(768 에서 작성자·날짜가 한 글자씩 세로로 — 종합평가 1-3)
  // → 목록이 열리면 전체 폭, 글을 고르면 목록을 닫고 본문만. 글 주소로 바로 들어오면 본문부터.
  const closeOnMobile = () => { if (window.innerWidth < 1024) setOpen(false); };
  // setOpen 은 open 이 바뀔 때마다 새로 만들어진다 — 의존에 넣으면 목록 버튼으로 연 직후 다시 닫힌다. 글이 바뀔 때만 맞춘다.
  const setOpenRef = useRef(setOpen);
  useEffect(() => { setOpenRef.current = setOpen; });
  useEffect(() => { if (window.innerWidth < 1024) setOpenRef.current(!activeId); }, [activeId]);
  return (
    <div data-open={open} className={cn("peer shrink-0 overflow-hidden border-line-2 transition-[width] duration-200 ease-linear", open ? "w-(--sidebar-width) border-r max-lg:w-auto max-lg:flex-1 max-lg:border-r-0" : "w-0")} aria-hidden={!open}>
      <div className="flex h-full w-(--sidebar-width) flex-col max-lg:w-full">
        <div className="flex flex-col gap-3 border-b border-line-2 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              {activeId ? <h2 className="truncate text-lg font-bold">{title}</h2> : <h1 className="truncate text-lg font-bold">{title}</h1>}
              <p className="truncate text-sm text-ink-3">{desc}</p>
            </div>
            <Label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm font-medium text-ink-2">
              <span>인기순</span><Switch aria-label="인기순으로 보기" checked={popular} onCheckedChange={onPopular} className="shadow-none" />
            </Label>
          </div>
          <form key={q} role="search" className="relative" onSubmit={(e) => { e.preventDefault(); onSearch(String(new FormData(e.currentTarget).get("q") ?? "")); }}>
            <span className="sr-only">글 검색</span>
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-4" aria-hidden />
            <SidebarInput name="q" defaultValue={q} placeholder="제목·내용 검색 (Enter)" className="h-9 bg-ground pl-8" aria-label="글 검색" />
          </form>
        </div>
        <div className="min-h-0 flex-1">
          {loading ? (
            <p className="p-6 text-center text-sm text-ink-3">불러오는 중…</p>
          ) : items.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-ink-3">{q ? `‘${q}’에 맞는 글이 없습니다.` : "아직 글이 없습니다."}</p>
          ) : (
            // 첫 화면(전체)은 글 4개가 오른쪽 최근 게시물 높이만큼 나눠 채운다(사용자 2026-10-13 "높이 맞추기")
            <ul className={cn(fill && "lg:flex lg:h-full lg:flex-col lg:pb-6")}>
              {items.map((p) => (
                <li key={p.id} className={cn(fill && "lg:flex lg:flex-1 lg:flex-col")}>
                  <Link to={`/community/${p.id}${listSearch}`} onClick={closeOnMobile} aria-current={p.id === activeId ? "page" : undefined}
                    className={cn("flex flex-col gap-1.5 border-b border-line-2 px-4 py-3.5 hover:bg-ground-2", fill && "lg:flex-1 lg:justify-center", p.id === activeId && "bg-ground-3 hover:bg-ground-3")}>
                    <span className="flex items-center gap-2 text-xs text-ink-3">
                      <span className="truncate font-medium text-ink-2">{p.author.name}</span>
                      <AuthorBadge a={p.author} />
                      <span className="ml-auto shrink-0">{shortDate(p.created_at)}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      {p.pinned && <Megaphone className="size-3.5 shrink-0 text-point-ink" aria-label="고정 공지" />}
                      <span className="line-clamp-1 font-semibold text-ink">{p.title}</span>
                    </span>
                    {p.locked
                      ? <span className="inline-flex items-center gap-1 text-sm text-ink-4"><Lock className="size-3.5" aria-hidden />로그인하면 볼 수 있습니다</span>
                      : <span className="line-clamp-2 text-sm leading-snug text-ink-3">{p.excerpt}</span>}
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-4">
                      <span className="rounded-full bg-ground-3 px-2 py-0.5 text-ink-3">{catName(p.category)}</span>
                      {moduleName(p.module) && <span className="rounded-full bg-ground-3 px-2 py-0.5 text-ink-3">{moduleName(p.module)}</span>}
                      <span className="inline-flex items-center gap-1"><MessageCircle className="size-3.5" aria-hidden />{p.comments}</span>
                      <span className="inline-flex items-center gap-1"><Heart className="size-3.5" aria-hidden />{p.likes}</span>
                      <span className="inline-flex items-center gap-1"><Eye className="size-3.5" aria-hidden />{p.views}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/** 글 목록 펴기·접기. 1024 미만에서 글을 보고 있으면 '목록으로' 뒤로 버튼이 된다. */
function ListToggle({ hasPost }: { hasPost: boolean }) {
  const { open, setOpen } = useSidebar();
  return (
    <>
      {hasPost && (
        <Button type="button" variant="ghost" size="sm" className="shrink-0 lg:hidden" onClick={() => setOpen(true)}>
          <ArrowLeft aria-hidden />목록
        </Button>
      )}
      <Button type="button" variant="ghost" size="icon-sm" className={cn("shrink-0", hasPost && "max-lg:hidden")} onClick={() => setOpen(!open)} aria-label="글 목록 접기·펴기" aria-expanded={open}>
        <PanelLeft aria-hidden />
      </Button>
    </>
  );
}

function AuthorBadge({ a }: { a: CommunityAuthor }) {
  if (a.admin) return <span className="rounded-md bg-ink px-1.5 py-px text-[10px] font-bold text-ground">운영</span>;
  if (a.staff) return <span className="rounded-md bg-ground-3 px-1.5 py-px text-xs font-bold text-ink-2">임직원</span>;
  return null;
}

function PostCrumb({ id }: { id: string }) {
  const p = useQuery(postQuery(id));
  if (!p.data) return <BreadcrumbItem><BreadcrumbPage>글</BreadcrumbPage></BreadcrumbItem>;
  return (
    <>
      <BreadcrumbItem className="hidden md:inline-flex"><BreadcrumbLink asChild><Link to={`/community?c=${p.data.category}`}>{catName(p.data.category)}</Link></BreadcrumbLink></BreadcrumbItem>
      <BreadcrumbSeparator className="hidden md:inline-flex" />
      <BreadcrumbItem className="min-w-0"><BreadcrumbPage className="truncate">{p.data.title}</BreadcrumbPage></BreadcrumbItem>
    </>
  );
}

function Avatar({ a, size = 36 }: { a: CommunityAuthor; size?: number }) {
  return a.avatar
    ? <img src={a.avatar} alt="" referrerPolicy="no-referrer" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
    : <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-[#C9C9C9] font-bold text-white" style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden>{a.name.charAt(0)}</span>;
}

function PostView({ id, onEdit, backTo }: { id: string; onEdit: (p: EditorValue) => void; backTo: string }) {
  const q = useQuery(postQuery(id));
  const { me } = useMe();
  const m = useCommunityMutations();
  const navigate = useNavigate();
  const [comment, setComment] = useState("");
  if (q.isLoading) return <p className="p-10 text-center text-sm text-ink-3">불러오는 중…</p>;
  // 공지 말고는 로그인한 회원만 본문을 본다(사용자 2026-10-13) — 비회원은 로그인 안내
  if (!q.data && q.error instanceof ApiError && q.error.status === 401) return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-ground-3"><Lock className="size-6 text-ink-2" aria-hidden /></span>
      <p className="mt-5 text-lg font-bold">로그인한 회원만 볼 수 있는 글입니다.</p>
      <p className="mt-1 text-sm text-ink-3">공지사항은 로그인 없이 볼 수 있습니다.</p>
      <Button className="mt-6" onClick={() => navigate("/login")}>로그인</Button>
    </div>
  );
  if (!q.data) return <p className="p-10 text-center text-sm text-ink-3">글을 찾을 수 없습니다.<MBr />삭제되었거나 볼 권한이 없습니다.</p>;
  const p = q.data;
  const mod = MODULES.find((x) => x.id === p.module);
  const needLogin = () => toast("로그인이 필요합니다.", { action: { label: "로그인", onClick: () => navigate("/login") } });

  return (
    <article className="mx-auto w-full max-w-[860px] px-6 py-8 sm:px-10">
      <span className="rounded-full bg-ground-3 px-2.5 py-1 text-xs font-medium text-ink-2">{catName(p.category)}</span>
      <h1 className="mt-3 text-[28px] font-bold leading-tight tracking-[-0.01em]">{p.title}</h1>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-2 pb-5">
        <Avatar a={p.author} />
        <div className="min-w-[150px] flex-1">
          <div className="flex items-center gap-1.5 whitespace-nowrap text-md font-semibold">{p.author.name}<AuthorBadge a={p.author} /></div>
          <div className="whitespace-nowrap text-sm text-ink-3">{shortDate(p.created_at)} · 조회 {p.views}</div>
        </div>
        {p.can_edit && (
          <div className="ml-auto flex shrink-0 gap-1.5">
            <Button size="xs" variant="outline" onClick={() => onEdit({ id: p.id, category: p.category, title: p.title, body: p.body, module: p.module })}>고치기</Button>
            <Button size="xs" variant="outline" onClick={() => confirmToast("이 글을 지울까요?", () => m.remove.mutate(p.id, { onSuccess: () => { toast.success("글을 지웠습니다."); navigate(backTo); }, onError: (e) => toastError(e) }), { action: "지우기" })}>지우기</Button>
          </div>
        )}
      </div>
      <div className="py-7 text-[15px] leading-[1.8] whitespace-pre-wrap break-words text-ink">{p.body}</div>
      {mod && <p className="mb-6 text-sm text-ink-3">관련 모듈: <Link to={mod.to} className="font-medium text-ink underline underline-offset-2">{mod.name}</Link></p>}
      <div className="flex justify-center gap-2 pb-8">
        <Button variant={p.liked ? "default" : "outline"} size="sm" disabled={m.like.isPending}
          onClick={() => me ? m.like.mutate(p.id, { onError: (e) => toastError(e) }) : needLogin()} aria-pressed={p.liked}>
          <Heart className={cn(p.liked && "fill-current")} aria-hidden />좋아요 {p.likes}
        </Button>
        <SaveButton type="post" id={p.id} variant="outline" />
      </div>

      <section aria-label="댓글" className="border-t border-line-2 pt-6">
        <h3 className="text-md font-bold">댓글 {p.comments.length}</h3>
        <ul className="mt-3">
          {p.comments.map((c) => (
            <li key={c.id} className="flex gap-3 border-b border-line-2 py-4 last:border-b-0">
              <Avatar a={c.author} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold">{c.author.name}</span>
                  <AuthorBadge a={c.author} />
                  <span className="text-ink-4">{shortDate(c.created_at)}</span>
                  {c.can_delete && (
                    <button type="button" aria-label="댓글 지우기" className="ml-auto inline-flex size-7 items-center justify-center rounded-full text-ink-4 hover:bg-ground-3 hover:text-ink"
                      onClick={() => confirmToast("댓글을 지울까요?", () => m.removeComment.mutate(c.id, { onError: (e) => toastError(e) }), { action: "지우기" })}><Trash2 className="size-3.5" aria-hidden /></button>
                  )}
                </div>
                <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap break-words text-ink-2">{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
        {me ? (
          <form className="mt-4 flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); const b = comment.trim(); if (!b) return; m.comment.mutate({ id: p.id, body: b }, { onSuccess: () => setComment(""), onError: (err) => toastError(err) }); }}>
            <Label htmlFor="c-body" className="sr-only">댓글 쓰기</Label>
            <Textarea id="c-body" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="댓글을 남겨 주세요." className="min-h-24" maxLength={3000} />
            <div className="flex justify-end"><Button type="submit" size="sm" disabled={!comment.trim() || m.comment.isPending}>댓글 등록</Button></div>
          </form>
        ) : (
          <p className="mt-4 rounded-xl bg-ground-2 px-4 py-4 text-center text-sm text-ink-3">댓글을 쓰려면 <Link to="/login" className="font-semibold text-ink underline underline-offset-2">로그인</Link>해 주세요.</p>
        )}
      </section>
    </article>
  );
}

// 커뮤니티 첫 화면 — 게시판마다 최근 글 5개(사용자 지시 2026-10-07 "메인 대시보드 형태로 각 게시판 최근 게시물").
function Dashboard({ counts }: { counts: { id: string; count: number }[] }) {
  const boards = RAIL.filter((r) => r.id);
  return (
    <div className="p-5 md:p-6">
      <h2 className="text-xl font-bold">최근 게시물</h2>
      <p className="mt-1 text-sm text-ink-3">게시판마다 새로 올라온 글입니다.</p>
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {boards.map((b) => <BoardCard key={b.id} b={b} count={counts.find((c) => c.id === b.id)?.count} />)}
      </div>
    </div>
  );
}

function BoardCard({ b, count }: { b: (typeof RAIL)[number]; count?: number }) {
  const q = useQuery(postsQuery({ category: b.id, sort: "new" }));
  const items = (q.data?.items ?? []).slice(0, 5);
  return (
    <section className="flex flex-col rounded-panel border border-line bg-ground p-5">
      <div className="flex items-center gap-2">
        <span className="inline-flex size-8 items-center justify-center rounded-lg bg-ground-3"><b.icon className="size-4 text-ink-2" aria-hidden /></span>
        <h3 className="text-md font-bold">{b.name}</h3>
        {count !== undefined && <span className="text-sm text-ink-4">{count}</span>}
        <Link to={`/community?c=${b.id}`} className="ml-auto -my-1.5 inline-flex min-h-8 items-center px-1 text-sm text-ink-3 hover:text-ink">더 보기</Link>
      </div>
      <ul className="mt-3 flex flex-1 flex-col divide-y divide-line">
        {q.isLoading ? <li className="h-24 animate-pulse rounded-lg bg-ground-3" />
          : items.length === 0 ? <li className="py-6 text-center text-sm text-ink-4">아직 글이 없습니다.</li>
          : items.map((p) => (
            <li key={p.id}>
              <Link to={`/community/${p.id}?c=${b.id}`} className="flex items-center gap-3 py-2.5 hover:text-ink">
                <span className="min-w-0 flex-1 truncate text-sm">{p.pinned && <span className="mr-1 font-bold">[고정]</span>}{p.title}</span>
                {p.comments > 0 && <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-ink-4"><MessageCircle className="size-3" aria-hidden />{p.comments}</span>}
                <span className="w-20 shrink-0 whitespace-nowrap text-center text-xs text-ink-4">{shortDate(p.created_at)}</span>
              </Link>
            </li>
          ))}
      </ul>
    </section>
  );
}

function Welcome({ cat, count, onWrite }: { cat: string; count: number; onWrite: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-ground-3"><MessagesSquare className="size-6 text-ink-2" aria-hidden /></span>
      <h2 className="mt-5 text-2xl font-bold">{cat ? `${catName(cat)} 게시판` : "powerPlus 커뮤니티"}</h2>
      <p className="mt-2 text-md text-ink-3">공지를 보고, 질문하고, 작업을 나누는 곳입니다.</p>
      <p className="text-md text-ink-3">{count > 0 ? "왼쪽 목록에서 글을 골라 보세요." : "첫 글을 남겨 주세요."}</p>
      <Button className="mt-6" onClick={onWrite}><PenLine aria-hidden />글쓰기</Button>
    </div>
  );
}

function EditorDialog({ value, isAdmin, onClose, onSaved }: {
  value: EditorValue; isAdmin: boolean; onClose: () => void; onSaved: (id: string) => void;
}) {
  const [v, setV] = useState(value);
  const m = useCommunityMutations();
  const busy = m.create.isPending || m.update.isPending;
  const options = RAIL.filter((r) => r.id && (r.id !== "notice" || isAdmin));
  const save = () => {
    if (v.title.trim().length < 2) return toast.error("제목은 2자 이상 써 주세요.");
    if (v.body.trim().length < 2) return toast.error("내용은 2자 이상 써 주세요.");
    const b = { category: v.category, title: v.title.trim(), body: v.body.trim(), module: v.module };
    if (value.id) m.update.mutate({ id: value.id, ...b }, { onSuccess: () => { toast.success("글을 고쳤습니다."); onSaved(value.id!); }, onError: (e) => toastError(e) });
    else m.create.mutate(b, { onSuccess: (r) => { toast.success("글을 올렸습니다."); onSaved(r.id); }, onError: (e) => toastError(e) });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-ground text-ink sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{value.id ? "글 고치기" : "글쓰기"}</DialogTitle>
          <DialogDescription>개인정보와 발주처 대외비는 남기지 말아 주세요.</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <div className="grid gap-4 sm:grid-cols-[160px_160px_1fr]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="w-cat">분류</Label>
              <Select value={v.category} onValueChange={(c) => setV({ ...v, category: c })}>
                <SelectTrigger id="w-cat" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{options.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="w-mod">관련 모듈</Label>
              <Select value={v.module ?? "none"} onValueChange={(c) => setV({ ...v, module: c === "none" ? null : c })}>
                <SelectTrigger id="w-mod" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="none">없음</SelectItem>{MODULES.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="w-title">제목</Label>
              <Input id="w-title" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} maxLength={120} placeholder="제목" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="w-body">내용</Label>
            <Textarea id="w-body" value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} className="min-h-60" maxLength={20000} placeholder="내용을 써 주세요." />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>취소</Button>
            <Button type="submit" disabled={busy}>{value.id ? "고치기" : "올리기"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

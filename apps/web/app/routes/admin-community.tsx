// 관리자 · 커뮤니티 — 글(숨김·고정·분류 바꾸기·삭제) · 댓글(숨김·삭제) · 공지 쓰기(전체 알림). api/routes/admin2.php /admin/community/*.
// 탭·표·Select·Switch·Dialog·AlertDialog 는 shadcn/ui 공식 부품(사용자 지시 2026-10-06). 숨김 = deleted_at(되돌림 가능), 삭제 = 행 제거(2단계 확인).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, MessagesSquare, Pin, Trash2 } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { MBr } from "@/components/hb/copy";
import { AdminTitle, BulkBar, ConfirmDelete, Field, Pager, RowSwitch, SearchBox, SelectAllCell, SelectCell, SortHead, useQueryState, useSelection, useSort } from "@/components/admin/admin-ui";
import { bulkCommunityComments, bulkCommunityPosts, useBulkRun } from "@/lib/admin-bulk2";
import { ChoiceButton } from "@/components/hb/choice-button";
import { toastError } from "@/components/hb/confirm";
import { Tag } from "@/components/hb/tag";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { COMM_CAT_KO, COMM_MODULE_KO, createAdminNotice, deleteAdminComment, deleteAdminPost, fetchAdminComments, fetchAdminPost, fetchAdminPosts, fmtAt, patchAdminPost, setAdminComment, type AdminComment, type CommCategory, postAiTags } from "@/lib/admin";
import type { Route } from "./+types/admin-community";

export const meta: Route.MetaFunction = () => [{ title: "커뮤니티 — powerPlus 관리자" }];

const CATS = Object.keys(COMM_CAT_KO) as CommCategory[];
const STATES: Array<[string, string]> = [["visible", "보이는 글"], ["hidden", "숨긴 글"], ["pinned", "고정 글"]];
const QK = ["admin", "community"] as const;
const chartConfig = { n: { label: "글", color: "var(--color-chart)" } } satisfies ChartConfig;

export default function AdminCommunity() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get("tab") === "comments" ? "comments" : "posts";
  const [notice, setNotice] = useState(false);
  return (
    <div>
      <AdminTitle title="커뮤니티" desc="글과 댓글을 숨기거나 지우고, 공지를 올립니다. 공지는 전체 회원에게 알림으로 갑니다." />
      <Tabs value={tab} onValueChange={(v) => setSp((p) => { const n = new URLSearchParams(p); n.set("tab", v); n.delete("page"); return n; }, { replace: true })} className="mt-6">
        <div className="flex flex-wrap items-center gap-2">
          <TabsList><TabsTrigger value="posts">글</TabsTrigger><TabsTrigger value="comments">댓글</TabsTrigger></TabsList>
          <Button size="sm" className="ml-auto" onClick={() => setNotice(true)}><Megaphone aria-hidden />공지 쓰기</Button>
        </div>
        <TabsContent value="posts"><Posts /></TabsContent>
        <TabsContent value="comments"><Comments /></TabsContent>
      </Tabs>
      <NoticeDialog open={notice} onClose={() => setNotice(false)} />
    </div>
  );
}

// ── 글
function Posts() {
  const { get, set, page } = useQueryState();
  const cat = get("cat"); const state = get("state"); const q = get("q");
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useQuery({ queryKey: [...QK, "posts", cat, state, q, page], queryFn: () => fetchAdminPosts({ cat, state, q, page }) });
  const items = list.data?.data ?? [];
  const counts = (list.data?.meta?.counts ?? {}) as Record<string, number>;
  const sel = useSelection(items.map((p) => p.id), [cat, state, q, page]);
  const st = useSort(items, { cat: (p) => COMM_CAT_KO[p.category], title: (p) => p.title, author: (p) => p.author.name, cmt: (p) => p.comments, views: (p) => p.views, at: (p) => p.created_at, hidden: (p) => p.hidden });
  const POST_VERB: Record<string, string> = { hide: "숨겼습니다", show: "다시 보이게 했습니다", pin: "고정했습니다", unpin: "고정을 풀었습니다", delete: "지웠습니다" };
  const bulk = useBulkRun(bulkCommunityPosts, [QK], (b) => POST_VERB[b.action] ?? "바꿨습니다", sel.clear);
  return (
    <>
      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          <Stat label="전체 글" value={list.data?.total ?? null} />
          <Stat label="숨긴 글" value={counts.hidden ?? null} />
        </div>
        <Card className="gap-2 py-4">
          <CardHeader className="px-4 pb-0"><CardTitle className="text-sm font-medium text-ink-3">분류별 글 수</CardTitle><CardDescription className="text-xs">현재 필터 기준</CardDescription></CardHeader>
          <CardContent className="px-4">
            {list.data ? (
              <ChartContainer config={chartConfig} className="aspect-auto h-[120px] w-full">
                <BarChart data={CATS.map((id) => ({ cat: COMM_CAT_KO[id], n: counts[id] ?? 0 }))} margin={{ left: -16, right: 4, top: 4 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="cat" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} fontSize={12} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="n" fill="var(--color-n)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ChartContainer>
            ) : <Skeleton className="h-[120px] w-full" />}
          </CardContent>
        </Card>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <ChoiceButton size="sm" label="분류" value={cat} onChange={(v) => set({ cat: v })} options={CATS.map((id) => ({ id, label: COMM_CAT_KO[id], count: counts[id] ?? 0 }))} />
        <ChoiceButton size="sm" label="상태" value={state} onChange={(v) => set({ state: v })} options={STATES.map(([id, label]) => ({ id, label }))} />
        <SearchBox value={q} onSearch={(v) => set({ q: v })} placeholder="제목·본문·글쓴이 검색" />
        <span className="ml-auto text-sm tabular-nums text-ink-4">{(list.data?.total ?? 0).toLocaleString()}건</span>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-line">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <SelectAllCell sel={sel} />
              <SortHead s={st} k="cat" className="w-[104px] max-sm:w-[88px]">분류</SortHead>
              <SortHead s={st} k="title">제목</SortHead>
              <SortHead s={st} k="author" className="hidden w-[150px] md:table-cell">글쓴이</SortHead>
              <SortHead s={st} k="cmt" className="hidden w-[72px] sm:table-cell">댓글</SortHead>
              <SortHead s={st} k="views" className="hidden w-[72px] sm:table-cell">조회</SortHead>
              <SortHead s={st} k="at" className="hidden w-[140px] lg:table-cell">작성</SortHead>
              <SortHead s={st} k="hidden" className="w-[96px] max-sm:w-[64px]">상태</SortHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {st.rows.map((p) => (
              <TableRow key={p.id} role="button" tabIndex={0} className="cursor-pointer" onClick={() => setOpenId(p.id)} onKeyDown={(e) => { if (e.key === "Enter") setOpenId(p.id); }}>
                <SelectCell sel={sel} id={p.id} label={p.title} />
                <TableCell className="text-center"><Tag tone={p.category === "notice" ? "ink" : "line"}>{COMM_CAT_KO[p.category]}</Tag></TableCell>
                <TableCell className="text-left"><span className="flex items-center gap-1.5">{p.pinned && <Pin className="size-3.5 shrink-0 text-point" aria-hidden />}<span className="truncate font-semibold">{p.title}</span>{postAiTags(p).length > 0 && <span className="shrink-0 text-xs font-bold text-point-ink">{postAiTags(p).join(" · ")}</span>}</span><span className="block truncate text-xs text-ink-4">{p.excerpt}</span></TableCell>
                <TableCell className="hidden text-left md:table-cell"><span className="block truncate">{p.author.name}{p.author.staff && <Tag tone="soft" className="ml-1">임직원</Tag>}</span><span className="block truncate text-xs text-ink-4">{p.author.email}</span></TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">{p.comments}</TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">{p.views}</TableCell>
                <TableCell className="hidden text-center tabular-nums text-ink-3 lg:table-cell">{fmtAt(p.created_at)}</TableCell>
                <TableCell className="text-center">{p.hidden ? <Tag tone="warn">숨김</Tag> : <Tag tone="ok">공개</Tag>}</TableCell>
              </TableRow>
            ))}
            {list.data && items.length === 0 && <TableRow><TableCell colSpan={8} className="py-12 text-center text-ink-4">해당하는 글이 없습니다.</TableCell></TableRow>}
            {list.isLoading && <TableRow><TableCell colSpan={8} className="py-6"><Skeleton className="h-10 w-full" /></TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <BulkBar sel={sel} actions={[
        { label: "숨김", onRun: (ids) => bulk.mutate({ action: "hide", ids }), disabled: bulk.isPending },
        { label: "다시 보이기", onRun: (ids) => bulk.mutate({ action: "show", ids }), disabled: bulk.isPending },
        { label: "고정", icon: <Pin aria-hidden />, onRun: (ids) => bulk.mutate({ action: "pin", ids }), disabled: bulk.isPending },
        { label: "고정 풀기", onRun: (ids) => bulk.mutate({ action: "unpin", ids }), disabled: bulk.isPending },
        { label: "삭제", icon: <Trash2 aria-hidden />, danger: true, confirm: "고른 글 {n}개를 지울까요? 댓글·좋아요도 함께 사라지고 되돌릴 수 없습니다. 잠시 감추려면 숨김을 쓰세요.", onRun: (ids) => bulk.mutate({ action: "delete", ids }), disabled: bulk.isPending },
      ]} />
      <Pager page={page} total={list.data?.total ?? 0} limit={list.data?.limit ?? 30} onPage={(p) => set({ page: String(p) })} />
      <Sheet open={!!openId} onOpenChange={(v) => { if (!v) setOpenId(null); }}>
        <SheetContent className="w-full overflow-y-auto bg-ground text-ink sm:max-w-[640px]">{openId && <PostDetail id={openId} onClose={() => setOpenId(null)} />}</SheetContent>
      </Sheet>
    </>
  );
}

function PostDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: [...QK, "post", id], queryFn: () => fetchAdminPost(id) });
  const refresh = () => void qc.invalidateQueries({ queryKey: [...QK] });
  const patch = useMutation({ mutationFn: (b: Parameters<typeof patchAdminPost>[1]) => patchAdminPost(id, b), onSuccess: () => { toast.success("반영했습니다."); refresh(); }, onError: (e) => toastError(e) });
  const del = useMutation({ mutationFn: () => deleteAdminPost(id), onSuccess: () => { toast.success("글을 지웠습니다. 댓글·좋아요도 함께 지워졌습니다."); refresh(); onClose(); }, onError: (e) => toastError(e) });
  const [ask, setAsk] = useState(false);
  const p = q.data;
  if (!p) return <div className="flex flex-col gap-3 p-6"><Skeleton className="h-7 w-2/3" /><Skeleton className="h-40 w-full" /></div>;
  return (
    <>
      <SheetHeader className="border-b border-line px-6 py-5">
        <SheetTitle className="text-xl font-bold text-ink">{p.title}</SheetTitle>
        <SheetDescription className="text-ink-4">{p.author.name}{p.author.email ? ` · ${p.author.email}` : ""} · <span className="whitespace-nowrap">{fmtAt(p.created_at)}</span></SheetDescription>
      </SheetHeader>
      <div className="px-6 py-5">
        <div className="grid gap-4 rounded-xl border border-line p-4">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="post-cat" className="text-md">분류</Label>
            <Select value={p.category} onValueChange={(v) => patch.mutate({ category: v as CommCategory })}>
              <SelectTrigger id="post-cat" size="sm" className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>{CATS.map((c) => <SelectItem key={c} value={c}>{COMM_CAT_KO[c]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <RowSwitch id="post-pin" label="상단 고정" desc="목록 맨 위에 둡니다." checked={p.pinned} onChange={(v) => patch.mutate({ pinned: v })} />
          <RowSwitch id="post-hide" label="숨김" desc="회원에게 안 보입니다. 다시 켤 수 있습니다." checked={p.hidden} onChange={(v) => patch.mutate({ hidden: v })} />
        </div>
        <dl className="mt-4 divide-y divide-line">
          <Field label="관련 모듈">{p.module ? COMM_MODULE_KO[p.module] ?? p.module : "—"}</Field>
          <Field label="반응">댓글 {p.comments} · 좋아요 {p.likes} · 조회 {p.views}</Field>
          <Field label="주소"><a href={`/community/${p.id}`} target="_blank" rel="noreferrer" className="underline underline-offset-4">/community/{p.id}</a></Field>
        </dl>
        <section className="mt-4"><h3 className="text-md font-bold">본문</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-[1.8] text-ink-2">{p.body}</p></section>
        <div className="mt-6 flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setAsk(true)} disabled={del.isPending}><Trash2 aria-hidden />글 삭제</Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={onClose}>닫기</Button>
        </div>
      </div>
      <ConfirmDelete open={ask} onOpenChange={setAsk} title="이 글을 지울까요?" desc="댓글과 좋아요가 함께 지워지며 되돌릴 수 없습니다. 잠시만 감추려면 숨김을 쓰세요." onConfirm={() => del.mutate()} />
    </>
  );
}

// ── 댓글
function Comments() {
  const { get, set, page } = useQueryState();
  const state = get("state"); const q = get("q"); const post = get("post");
  const qc = useQueryClient();
  const list = useQuery({ queryKey: [...QK, "comments", state, q, post, page], queryFn: () => fetchAdminComments({ state, q, post, page }) });
  const items = list.data?.data ?? [];
  const counts = (list.data?.meta?.counts ?? {}) as Record<string, number>;
  const refresh = () => void qc.invalidateQueries({ queryKey: [...QK] });
  const toggle = useMutation({ mutationFn: (c: AdminComment) => setAdminComment(c.id, c.hidden ? "show" : "hide"), onSuccess: () => refresh(), onError: (e) => toastError(e) });
  const del = useMutation({ mutationFn: (id: number) => deleteAdminComment(id), onSuccess: () => { toast.success("댓글을 지웠습니다."); refresh(); }, onError: (e) => toastError(e) });
  const [ask, setAsk] = useState<number | null>(null);
  const sel = useSelection(items.map((c) => String(c.id)), [state, q, post, page]);
  const ct = useSort(items, { body: (c) => c.body, post: (c) => c.post.title, author: (c) => c.author.name, at: (c) => c.created_at });
  const CMT_VERB: Record<string, string> = { hide: "숨겼습니다", show: "다시 보이게 했습니다", delete: "지웠습니다" };
  const bulk = useBulkRun(bulkCommunityComments, [QK], (b) => CMT_VERB[b.action] ?? "바꿨습니다", sel.clear);
  const run = (action: "hide" | "show" | "delete") => (ids: string[]) => bulk.mutate({ action, ids: ids.map(Number) });
  return (
    <>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <ChoiceButton size="sm" label="상태" value={state} onChange={(v) => set({ state: v })} options={[{ id: "visible", label: "보이는 댓글", count: counts.visible ?? 0 }, { id: "hidden", label: "숨긴 댓글", count: counts.hidden ?? 0 }]} />
        <SearchBox value={q} onSearch={(v) => set({ q: v })} placeholder="댓글·글쓴이 검색" />
        {post && <Button size="sm" variant="ghost" onClick={() => set({ post: "" })}>글 필터 해제</Button>}
        <span className="ml-auto text-sm tabular-nums text-ink-4">{(list.data?.total ?? 0).toLocaleString()}건</span>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-line">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <SelectAllCell sel={sel} />
              <SortHead s={ct} k="body">댓글</SortHead>
              <SortHead s={ct} k="post" className="hidden w-[200px] md:table-cell">글</SortHead>
              <SortHead s={ct} k="author" className="hidden w-[140px] sm:table-cell">글쓴이</SortHead>
              <SortHead s={ct} k="at" className="hidden w-[140px] lg:table-cell">작성</SortHead>
              <TableHead className="w-[150px] max-sm:w-[120px]">처리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ct.rows.map((c) => (
              <TableRow key={c.id} className={c.hidden ? "opacity-60" : undefined}>
                <SelectCell sel={sel} id={String(c.id)} label="댓글" />
                <TableCell className="text-left"><span className="line-clamp-2 whitespace-pre-wrap text-sm">{c.body}</span></TableCell>
                <TableCell className="hidden text-left md:table-cell"><button type="button" className="block max-w-full truncate text-left underline-offset-4 hover:underline" onClick={() => set({ post: c.post.id })}>{c.post.title}</button><span className="block text-xs text-ink-4">{COMM_CAT_KO[c.post.category]}</span></TableCell>
                <TableCell className="hidden text-left sm:table-cell"><span className="block truncate">{c.author.name}</span><span className="block truncate text-xs text-ink-4">{c.author.email}</span></TableCell>
                <TableCell className="hidden text-center tabular-nums text-ink-3 lg:table-cell">{fmtAt(c.created_at)}</TableCell>
                <TableCell className="text-center">
                  <span className="inline-flex items-center gap-1">
                    <Button size="xs" variant="outline" disabled={toggle.isPending} onClick={() => toggle.mutate(c)}>{c.hidden ? "다시 보이기" : "숨김"}</Button>
                    <Button size="xs" variant="ghost" aria-label="삭제" disabled={del.isPending} onClick={() => setAsk(c.id)}><Trash2 aria-hidden /></Button>
                  </span>
                </TableCell>
              </TableRow>
            ))}
            {list.data && items.length === 0 && <TableRow><TableCell colSpan={6} className="py-12 text-center text-ink-4">해당하는 댓글이 없습니다.</TableCell></TableRow>}
            {list.isLoading && <TableRow><TableCell colSpan={6} className="py-6"><Skeleton className="h-10 w-full" /></TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <BulkBar sel={sel} actions={[
        { label: "숨김", onRun: run("hide"), disabled: bulk.isPending },
        { label: "다시 보이기", onRun: run("show"), disabled: bulk.isPending },
        { label: "삭제", icon: <Trash2 aria-hidden />, danger: true, confirm: "고른 댓글 {n}개를 지울까요? 되돌릴 수 없습니다.", onRun: run("delete"), disabled: bulk.isPending },
      ]} />
      <Pager page={page} total={list.data?.total ?? 0} limit={list.data?.limit ?? 30} onPage={(p) => set({ page: String(p) })} />
      <ConfirmDelete open={ask !== null} onOpenChange={(v) => { if (!v) setAsk(null); }} title="이 댓글을 지울까요?" desc="되돌릴 수 없습니다. 잠시만 감추려면 숨김을 쓰세요." onConfirm={() => { if (ask !== null) del.mutate(ask); }} />
    </>
  );
}

// ── 공지 쓰기
function NoticeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(""); const [body, setBody] = useState(""); const [pinned, setPinned] = useState(true); const [notify, setNotify] = useState(true); const [module, setModule] = useState("none");
  const create = useMutation({
    mutationFn: () => createAdminNotice({ title: title.trim(), body: body.trim(), pinned, notify, module: module === "none" ? null : module }),
    onSuccess: () => { toast.success(notify ? "공지를 올리고 전체 알림을 보냈습니다." : "공지를 올렸습니다."); void qc.invalidateQueries({ queryKey: [...QK] }); setTitle(""); setBody(""); onClose(); },
    onError: (e) => toastError(e),
  });
  const ok = title.trim().length >= 2 && body.trim().length >= 2;
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader><DialogTitle>공지 쓰기</DialogTitle><DialogDescription>공지사항 분류로 올라갑니다.<MBr />알림을 켜면 전체 회원의 알림 종에 들어갑니다.</DialogDescription></DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); if (ok) create.mutate(); }}>
          <div className="grid gap-2"><Label htmlFor="n-title">제목</Label><Input id="n-title" className="h-9 text-sm" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="예: 10월 에셋 업데이트 안내" /></div>
          <div className="grid gap-2"><Label htmlFor="n-body">본문</Label><Textarea id="n-body" value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder="문단은 빈 줄로 나눕니다." /></div>
          <div className="grid gap-2">
            <Label htmlFor="n-mod">관련 모듈</Label>
            <Select value={module} onValueChange={setModule}>
              <SelectTrigger id="n-mod" size="sm" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">없음</SelectItem>{Object.entries(COMM_MODULE_KO).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 rounded-xl border border-line p-4">
            <RowSwitch id="n-pin" label="상단 고정" desc="목록 맨 위에 둡니다." checked={pinned} onChange={setPinned} />
            <RowSwitch id="n-notify" label="전체 알림" desc="모든 회원에게 알림을 보냅니다." checked={notify} onChange={setNotify} />
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>취소</Button><Button type="submit" disabled={!ok || create.isPending}><MessagesSquare aria-hidden />올리기</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── 통계 카드(shadcn preview 요소 모음의 통계 카드 문법)
function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <Card className="gap-1 py-4">
      <CardHeader className="px-4 pb-0"><CardTitle className="text-sm font-medium text-ink-3">{label}</CardTitle></CardHeader>
      <CardContent className="px-4">{value === null ? <Skeleton className="h-7 w-16" /> : <p className="text-2xl font-extrabold tabular-nums tracking-[-0.02em]">{value.toLocaleString()}</p>}</CardContent>
    </Card>
  );
}

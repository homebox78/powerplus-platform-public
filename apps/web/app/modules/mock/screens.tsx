// powerMock 작업 단위 화면 — 시안(내 시안·갤러리·공유·열람·포인트), 기획·컴포넌트 안내, 시작하기 STEP.
// 출처: homebox-handoff apps/web/app/routes/gallery.tsx(갤러리 2열 그리드·순위·포인트 안내·공유 창·sandbox iframe) 를 REST v1·module.tsx 틀로.
// 기획 §20: 수집 레퍼런스 탐색은 공개하지 않는다 — 여기엔 사용자 산출물(시안)만. 제작·판정은 MCP(powerMCP) 가 하고 이 화면은 결과를 본다.
import { ArrowLeft, Copy as CopyIcon, ExternalLink, Eye, Heart, Layers, Lock, MoreHorizontal, Share2, Trash2, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MobileCarousel } from "@/components/hb/mobile-carousel";
import { MockupPreview } from "@/components/hb/mockup-preview";
import { BulkBar, SelectAllCell, SelectCell, useSelection } from "@/components/admin/admin-ui";
import { ChoiceButton } from "@/components/hb/choice-button";
import { confirmToast, toastError } from "@/components/hb/confirm";
import { Copy } from "@/components/hb/copy";
import { StepCards } from "@/components/hb/step-cards";
import { SaveButton } from "@/components/hb/save-button";
import { RankBadge } from "@/components/hb/rank-badge";
import { SavedBadge } from "@/components/hb/saved-badge";
import { SectionHeading } from "@/components/hb/section-heading";
import { Tag } from "@/components/hb/tag";
import { ThumbFrame } from "@/components/hb/thumb-frame";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, postJson } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { PLANS_UI } from "@/lib/plans-ui";
import { useIsSaved } from "@/lib/saved";
import { fmtDate, galleryQuery, leadersQuery, myMockupsQuery, pointsQuery, useGalleryDetail, useMockMutations, type GalleryItem, type MockupCheck, type MockupItem } from "@/lib/mock";
import { cn } from "@/lib/utils";
import { WireframeScreen } from "./wireframe";

const SORT_KO = { new: "최신순", popular: "인기순", score: "점수순" } as const;
const DEVICE_KO = { pc: "PC", mobile: "모바일" } as const;

const copyText = (s: string, done = "복사했습니다.") => navigator.clipboard.writeText(s).then(() => toast.success(done), () => toast.error("복사하지 못했습니다."));

// ---------------------------------------------------------------- 내 시안
function MyMockups({ onGallery }: { onGallery: (id: number) => void }) {
  const q = useQuery(myMockupsQuery);
  const m = useMockMutations();
  const [share, setShare] = useState<MockupItem | null>(null);
  const [preview, setPreview] = useState<MockupItem | null>(null);
  const qc = useQueryClient();
  const items = q.data?.items ?? [];
  // 여러 개 지우기 — 서버가 내 시안만 지운다(/me/bulk/mockups/delete)
  const sel = useSelection(items.map((it) => it.token));
  const bulkDelete = async (ids: string[]) => {
    try {
      const r = await postJson<{ count: number }>("/me/bulk/mockups/delete", { ids });
      sel.clear(); void qc.invalidateQueries({ queryKey: ["mock"] });
      toast.success("시안 " + r.count + "개를 지웠습니다.");
    } catch (e) { toastError(e); }
  };
  if (q.isPending) return <Skeleton className="mt-6 h-56 rounded-card" />;
  const cut = q.data?.meta.cut ?? 80;
  if (preview) return <PreviewPage item={preview} onBack={() => setPreview(null)} />;
  if (items.length === 0) {
    return (
      <section className="mt-6 rounded-panel border border-dashed border-line-3 p-10 text-center">
        <p className="text-md text-ink-3"><Copy as="span" text="아직 시안이 없습니다. AI 도구에서 powerMCP 로 시안을 점검하면 여기에 쌓입니다." /></p>
        <Button asChild variant="outline" size="sm" className="mt-4"><Link to="/mock">연결 방법 보기</Link></Button>
      </section>
    );
  }
  return (
    <>
      <p className="mt-6 text-sm text-ink-4">시안 {items.length}개 · 판정을 통과한 시안({cut + 1}점 이상·치명 0)만 보관되고, 보관본을 갤러리에 공유하면 포인트가 쌓입니다. 시안 주소는 만든 뒤 30일 동안 열립니다.</p>
      <Table className="mt-4 table-fixed">
        <TableHeader>
          <TableRow>
            <SelectAllCell sel={sel} /><TableHead className="w-auto">시안</TableHead><TableHead className="max-md:hidden w-[72px]">기기</TableHead><TableHead className="max-md:hidden w-[88px]">점수</TableHead><TableHead className="max-md:hidden w-[96px]">판정</TableHead>
            <TableHead className="max-md:hidden w-[112px]">게시</TableHead><TableHead className="max-md:hidden w-[112px]">갤러리</TableHead><TableHead className="max-md:hidden w-[104px]">만든 날</TableHead><TableHead className="w-[268px] max-md:w-[100px]">동작</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((it) => (
            <TableRow key={it.token} className={cn(it.discarded && "opacity-60")}>
              <SelectCell sel={sel} id={it.token} label={it.title} />
              <TableCell className="text-left">
                <span className="flex items-center gap-3">
                  {it.thumb_url ? <img src={it.thumb_url} alt="" className="h-10 w-16 shrink-0 rounded-md object-cover object-top max-md:hidden" /> : <span className="h-10 w-16 shrink-0 rounded-md bg-ground-3 max-md:hidden" aria-hidden />}
                  <span className="min-w-0"><span className="block truncate font-semibold max-md:line-clamp-2 max-md:whitespace-normal">{it.title}</span><span className="block truncate text-sm text-ink-4"><span title={it.ref_id || undefined}>{it.ref_id ? (it.ref_id.startsWith("wire1:") ? `와이어 · 참고 ${(it.ref_id.split(":")[3] ?? "").split(".").filter(Boolean).length || 1}곳` : `참고 ${it.ref_id.startsWith("mix") ? Math.max(1, it.ref_id.split(":").length - 1) : 1}곳`) : "참고 없음"}</span> · 판정 {it.check_count}회{it.score !== null && <span className="md:hidden"> · {it.score}점</span>}</span></span>
                </span>
              </TableCell>
              <TableCell className="max-md:hidden">{DEVICE_KO[it.device]}</TableCell>
              <TableCell className="text-right max-md:hidden">{it.score === null ? "—" : `${it.score}점`}</TableCell>
              <TableCell className="max-md:hidden">{it.passed === null ? <Tag tone="line">미판정</Tag> : it.passed ? <Tag tone="soft">통과</Tag> : <Tag tone="warn">미통과</Tag>}</TableCell>
              <TableCell className="max-md:hidden">{it.published && it.path ? <span className="inline-flex items-center gap-1.5"><button type="button" onClick={() => setPreview(it)} className="pp-hit text-ink underline-offset-2 hover:underline">열기</button><a href={it.path} target="_blank" rel="noreferrer" aria-label="새 창으로 열기" title="새 창으로 열기" className="pp-hit text-ink-4 hover:text-ink"><ExternalLink className="size-3.5" aria-hidden /></a></span> : <span className="text-ink-4">—</span>}</TableCell>
              <TableCell className="max-md:hidden">{it.gallery ? (it.gallery.status === "shared" ? <button type="button" onClick={() => onGallery(it.gallery!.id)} className="text-ink underline-offset-2 hover:underline">공유 중 · ♥{it.gallery.likes}</button> : it.gallery.status === "hidden" ? <span className="text-ink-4">내림</span> : <Tag tone="soft">보관</Tag>) : it.discarded ? <span className="text-ink-4">폐기({cut}점 이하)</span> : <span className="text-ink-4">—</span>}</TableCell>
              <TableCell className="max-md:hidden">{fmtDate(it.created_at)}</TableCell>
              <TableCell>
                <span className="flex items-center gap-1 max-md:hidden">
                  <Button variant="ghost" size="xs" onClick={() => setPreview(it)} aria-label="미리보기"><Eye aria-hidden /></Button>
                  {it.passed && !it.published && <Button variant="outline" size="xs" onClick={() => m.publish.mutate(it.token, { onSuccess: () => toast.success("게시했습니다. 주소를 복사해 공유하세요."), onError: (e) => toastError(e) })}>게시</Button>}
                  {it.published && it.path && <Button variant="ghost" size="xs" onClick={() => void copyText(`${location.origin}${it.path}`, "시안 주소를 복사했습니다.")} aria-label="주소 복사"><CopyIcon aria-hidden /></Button>}
                  {it.gallery && it.gallery.status !== "shared" && <Button variant="outline" size="xs" onClick={() => setShare(it)}><Share2 aria-hidden />공유</Button>}
                  {it.gallery?.status === "shared" && <Button variant="ghost" size="xs" onClick={() => m.hide.mutate(it.gallery!.id, { onSuccess: () => toast.success("갤러리에서 내렸습니다."), onError: (e) => toastError(e) })}>내리기</Button>}
                  <Button variant="ghost" size="xs" aria-label="삭제" onClick={() => confirmToast("이 시안을 지울까요? 게시 주소도 닫힙니다.", () => m.remove.mutate(it.token, { onSuccess: () => toast.success("지웠습니다."), onError: (e) => toastError(e) }), { action: "지우기" })}><Trash2 aria-hidden /></Button>
                </span>
                <span className="flex items-center gap-1 md:hidden">
                  <Button variant="ghost" size="xs" onClick={() => setPreview(it)} aria-label="미리보기"><Eye aria-hidden /></Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="xs" aria-label="더보기"><MoreHorizontal aria-hidden /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {it.passed && !it.published && <DropdownMenuItem onSelect={() => m.publish.mutate(it.token, { onSuccess: () => toast.success("게시했습니다. 주소를 복사해 공유하세요."), onError: (e) => toastError(e) })}>게시</DropdownMenuItem>}
                      {it.published && it.path && <DropdownMenuItem onSelect={() => void copyText(`${location.origin}${it.path}`, "시안 주소를 복사했습니다.")}>주소 복사</DropdownMenuItem>}
                      {it.gallery && it.gallery.status !== "shared" && <DropdownMenuItem onSelect={() => setShare(it)}>갤러리에 공유</DropdownMenuItem>}
                      {it.gallery?.status === "shared" && <DropdownMenuItem onSelect={() => m.hide.mutate(it.gallery!.id, { onSuccess: () => toast.success("갤러리에서 내렸습니다."), onError: (e) => toastError(e) })}>갤러리에서 내리기</DropdownMenuItem>}
                      <DropdownMenuItem onSelect={() => confirmToast("이 시안을 지울까요? 게시 주소도 닫힙니다.", () => m.remove.mutate(it.token, { onSuccess: () => toast.success("지웠습니다."), onError: (e) => toastError(e) }), { action: "지우기" })}>삭제</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <BulkBar sel={sel} actions={[{ label: "삭제", icon: <Trash2 aria-hidden />, danger: true, confirm: "고른 시안 {n}개를 지웁니다. 게시 주소도 닫히고 갤러리에서 내려갑니다.", onRun: (ids) => void bulkDelete(ids) }]} />
      <ShareDialog item={share} onClose={() => setShare(null)} />
    </>
  );
}

function ShareDialog({ item, onClose }: { item: MockupItem | null; onClose: () => void }) {
  const m = useMockMutations();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const submit = () => {
    if (!item?.gallery) return;
    m.share.mutate({ id: item.gallery.id, title: title.trim() || undefined, note: note.trim() || undefined }, {
      onSuccess: (r) => { toast.success(r.awarded ? `갤러리에 올렸습니다. ${r.awarded}P 적립.` : "갤러리에 올렸습니다."); setTitle(""); setNote(""); onClose(); },
      onError: (e) => toastError(e),
    });
  };
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-panel p-8 sm:max-w-none" style={{ width: "min(560px, 96vw)" }}>
        <DialogHeader>
          <DialogTitle className="text-2xl font-extrabold tracking-[-0.02em]">갤러리에 공유</DialogTitle>
          <DialogDescription className="text-md text-ink-3"><Copy as="span" text="다른 회원이 포인트로 열어 보면 나에게도 포인트가 쌓입니다. 시안 안의 글·그림은 그대로 공개됩니다." /></DialogDescription>
        </DialogHeader>
        <div className="mt-2 grid gap-4">
          <div><Label htmlFor="sh-title">제목</Label><Input id="sh-title" className="mt-1.5" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={item?.title ?? ""} maxLength={120} /></div>
          <div><Label htmlFor="sh-note">설명(선택)</Label><Textarea id="sh-note" className="mt-1.5" rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="참고한 구성, 신경 쓴 점을 적어 두면 보는 사람에게 도움이 됩니다." maxLength={1000} /></div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>취소</Button><Button onClick={submit} disabled={m.share.isPending}>공유하기</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- 갤러리
/** 서브 페이지 유형 이름 — 모르는 유형은 "서브" */
const PAGE_KO: Record<string, string> = {
  main: "메인", greeting: "인사말", org: "조직도", organization: "조직도", org_chart: "조직도", history: "연혁", location: "오시는 길", map: "오시는 길",
  board_list: "게시판 목록", board_view: "게시판 상세", gallery: "갤러리", gallery_list: "갤러리", photo: "갤러리", content: "콘텐츠", faq: "자주 묻는 질문",
  search: "통합검색", sitemap: "사이트맵", login: "로그인", vision: "비전", intro: "소개",
};
const pageLabel = (g: GalleryItem) => (g.role === "sub" ? (g.page ? PAGE_KO[g.page] ?? "서브" : "서브") : "메인");

function GalleryCard({ g, onOpen, unlockCost, onSet }: { g: GalleryItem; onOpen: (id: number) => void; unlockCost: number; onSet?: (set: string) => void }) {
  const m = useMockMutations();
  const saved = useIsSaved("gallery", g.id);
  const setN = g.set_size ?? 1;
  return (
    <div role="button" tabIndex={0} onClick={() => onOpen(g.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(g.id); } }} className="group flex min-w-0 cursor-pointer flex-col gap-3 text-left" aria-label={`${g.title} 상세`}>
      <div className="relative">
        <ThumbFrame radius="lg" ratio="16/10" className="bg-ground-3 p-[9%]" locked={!g.unlocked} lockedLabel={`${unlockCost}P 로 열기`} hover={<><Button variant="white" size="sm" type="button" onClick={(e) => { e.stopPropagation(); onOpen(g.id); }}>{g.unlocked ? "열기" : `${unlockCost}P 로 열기`}</Button><SaveButton type="gallery" id={g.id} /></>}>
          <span className="relative flex w-full overflow-hidden rounded-md bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]"><img src={g.thumb_url} alt="" loading="lazy" className="aspect-[16/10] w-full object-cover object-top" /></span>
        </ThumbFrame>
        {saved && <SavedBadge />}
        {onSet && g.set && setN > 1 && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onSet(g.set!); }} className="absolute left-3 top-3 z-10 inline-flex h-7 items-center gap-1 rounded-chip bg-ink px-2.5 text-xs font-semibold text-white hover:bg-ink-2" aria-label={`${g.title} 세트 ${setN}장 함께 보기`}>
            <Layers className="size-3.5" aria-hidden />세트 {setN}장
          </button>
        )}
      </div>
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1.5"><Tag tone={g.role === "sub" ? "line" : "soft"} className="h-5 px-[7px]">{pageLabel(g)}</Tag><span className="truncate text-md font-bold tracking-[-0.01em]">{g.title}</span></span>
          <span className="truncate text-sm text-ink-4">{g.owner.name}{g.owner.badge ? <RankBadge badge={g.owner.badge} className="ml-1" /> : null} · {DEVICE_KO[g.device]} · {fmtDate(g.shared_at ?? g.created_at)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-sm font-semibold text-ink-3">
          <span>{g.score > 0 ? `${g.score}점` : "판정 전"}</span>
          <button type="button" aria-pressed={g.liked} aria-label="좋아요" onClick={(e) => { e.stopPropagation(); m.like.mutate(g.id, { onError: (e) => toastError(e) }); }} className={cn("inline-flex items-center gap-1", g.liked && "text-point")}><Heart className={cn("size-4", g.liked && "fill-current")} aria-hidden />{g.likes}</button>
        </span>
      </span>
    </div>
  );
}

function Gallery({ open, onOpen }: { open: number | null; onOpen: (id: number | null) => void }) {
  const [sp, setSp] = useSearchParams();
  const view = sp.get("view") === "mine" ? "mine" : "shared";
  // 기본 정렬 = 최신순(사용자 2026-10-18 "갤러리 정렬은 기본값 최신순으로")
  const sort = (["popular", "new", "score"].includes(sp.get("sort") ?? "") ? sp.get("sort") : "new") as "popular" | "new" | "score";
  const type = (["main", "sub"].includes(sp.get("type") ?? "") ? sp.get("type") : "all") as "all" | "main" | "sub";
  const setKey = sp.get("set") ?? "";
  const set = (k: string, v: string) => setSp((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });
  const openSet = (s: string) => { setSp((p) => { const n = new URLSearchParams(p); n.set("set", s); return n; }); document.getElementById("mock-gallery")?.scrollIntoView({ block: "start" }); };
  const q = useQuery(galleryQuery({ view, sort, type: setKey ? "all" : type, set: setKey || undefined }));
  const leaders = useQuery(leadersQuery);
  const { me } = useMe();
  const [points, setPoints] = useState(false);
  const cost = q.data?.meta.unlock_cost ?? 30;
  if (open !== null) return <GalleryDetail id={open} onClose={() => onOpen(null)} onOpen={onOpen} />;
  return (
    <div id="mock-gallery" className="mt-6 grid scroll-mt-24 grid-cols-1 gap-12 lg:grid-cols-[1fr_300px]">
      <div>
        {setKey ? (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => setSp((p) => { const n = new URLSearchParams(p); n.delete("set"); return n; })} className="inline-flex h-9 items-center gap-1.5 text-sm font-semibold text-ink-3 hover:text-ink"><ArrowLeft className="size-4" aria-hidden />전체 시안</button>
            <span className="h-5 w-px bg-line" aria-hidden />
            <h3 className="min-w-0 truncate text-lg font-bold">{q.data?.items[0]?.title ?? "세트"}<span className="ml-2 text-sm font-semibold text-ink-4">세트</span></h3>
            <span className="ml-auto text-sm text-ink-4">{q.data ? `메인 ${q.data.items.filter((x) => x.role !== "sub").length} · 서브 ${q.data.items.filter((x) => x.role === "sub").length}` : ""}</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <ChoiceButton label="범위" value={view} onChange={(v) => set("view", v)} options={[{ id: "shared", label: "공유된 시안" }, { id: "mine", label: "내가 만든 시안" }]} size="sm" />
            <ChoiceButton label="구분" value={type} onChange={(v) => set("type", v === "all" ? "" : v)} options={[{ id: "all", label: "전체" }, { id: "main", label: "메인" }, { id: "sub", label: "서브" }]} size="sm" />
            <span className="h-5 w-px bg-line" aria-hidden />
            <ChoiceButton label="정렬" value={sort} onChange={(v) => set("sort", v)} options={Object.entries(SORT_KO).map(([id, label]) => ({ id, label }))} size="sm" />
            <span className="ml-auto text-sm text-ink-4">{q.data ? `${q.data.total}개` : ""}</span>
          </div>
        )}
        {q.isPending ? (
          <div className="mt-8 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-[16/10] rounded-panel" />)}</div>
        ) : (q.data?.items.length ?? 0) === 0 ? (
          <section className="mt-5 rounded-panel border border-dashed border-line-3 p-10 text-center text-md text-ink-4"><Copy text={view === "mine" ? "보관된 내 시안이 없습니다. 판정 점수가 기준을 넘으면 자동으로 보관됩니다." : "아직 공유된 시안이 없습니다. 첫 시안을 공유해 보세요."} /></section>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{q.data!.items.map((g) => <GalleryCard key={g.id} g={g} onOpen={onOpen} unlockCost={cost} onSet={setKey ? undefined : openSet} />)}</div>
        )}
      </div>
      <aside className="flex flex-col gap-8">
        <section className="rounded-panel border border-line bg-ground p-6">
          <h3 className="flex items-center gap-2 text-lg font-bold"><Trophy className="size-5" aria-hidden />이달의 제작자</h3>
          <ol className="mt-4 flex flex-col gap-3">
            {(leaders.data?.items ?? []).slice(0, 5).map((l, i) => (
              <li key={`${l.name}-${i}`} className="flex items-center gap-3 text-md"><span className="w-5 text-sm font-bold text-ink-4">{i + 1}</span><span className="min-w-0 flex-1 truncate font-semibold">{l.name}{l.badge ? <RankBadge badge={l.badge} className="ml-1.5" /> : null}</span><span className="text-sm text-ink-3">{l.points.toLocaleString()}P</span></li>
            ))}
            {leaders.data && leaders.data.items.length === 0 && <li className="text-sm text-ink-4">최근 30일 적립이 없습니다.</li>}
          </ol>
        </section>
        <section className="rounded-panel border border-line bg-ground p-6">
          <h3 className="text-lg font-bold">포인트</h3>
          <p className="mt-2 text-md leading-[1.7] text-ink-3"><Copy as="span" text={`시안 공유 50P, 내 시안이 열릴 때마다 10P. 다른 사람 시안은 ${cost}P 로 엽니다.`} /></p>
          {me ? <Button variant="outline" size="sm" className="mt-4" onClick={() => setPoints(true)}>내 포인트 {q.data?.meta.points ?? "—"}P</Button> : <Button asChild variant="outline" size="sm" className="mt-4"><Link to="/login?next=/mock/mockups">로그인</Link></Button>}
        </section>
      </aside>
      <PointsDialog open={points} onClose={() => setPoints(false)} />
    </div>
  );
}

/** 내 시안 상세 — 홈박스 갤러리 상세처럼 모달이 아니라 화면을 바꿔 연다(사용자 2026-10-07 "기존 홈박스 방식으로, 모달이 아니라"). 시안은 축소하지 않고 그대로 */
function PreviewPage({ item, onBack }: { item: MockupItem; onBack: () => void }) {
  const src = `/api/v1/mock/mockups/${item.token}/html`;
  useEffect(() => { document.getElementById("mock-detail")?.scrollIntoView({ block: "start" }); }, []);
  return (
    <div id="mock-detail" className="mt-6 scroll-mt-24">
      <button type="button" onClick={onBack} className="inline-flex h-9 items-center gap-1.5 text-sm font-semibold text-ink-3 hover:text-ink"><ArrowLeft className="size-4" aria-hidden />내 시안</button>
      <div className="mt-4 flex flex-wrap items-start gap-4">
        <div className="min-w-0">
          <h2 className="text-3xl font-extrabold tracking-[-0.02em]">{item.title}</h2>
          <p className="mt-2 text-sm text-ink-3">{DEVICE_KO[item.device]} · {item.score === null ? "미판정" : `${item.score}점`} · 판정 {item.check_count}회</p>
        </div>
      </div>
      <MockupPreview className="mt-6" src={src} fullUrl={item.published && item.path ? item.path : src} title={item.title} device={item.device === "mobile" ? "phone" : "pc"} />
      {item.check_count > 0 && <CheckedItems token={item.token} />}
    </div>
  );
}

/** 판정 결과의 문장 목록(fixes·notes) — 문자열·{message} 둘 다 온다 */
const checkLines = (v: MockupCheck["fixes"]) => (v ?? []).map((x) => (typeof x === "string" ? x : String(x?.message ?? ""))).filter(Boolean).slice(0, 12);

/** 이 시안 판정에서 걸린 개선 체크리스트 항목 + 판정 요약·고칠 점·참고 노트(2026-10-09 시험: notes 가 저장만 되고 보이지 않았다) */
interface CheckedItem { id: number; title: string; area_name: string; status: string; hits: number; regressed: boolean }
function CheckedItems({ token }: { token: string }) {
  const q = useQuery({ queryKey: ["mock", "mockup", token, "checklist"], queryFn: () => apiFetch<{ checklist?: CheckedItem[]; check?: MockupCheck | null }>(`/mock/mockups/${token}`), staleTime: 60_000 });
  const list = q.data?.checklist ?? [];
  const fixes = checkLines(q.data?.check?.fixes);
  const notes = checkLines(q.data?.check?.notes);
  const summary = q.data?.check?.summary ?? "";
  if (list.length === 0 && fixes.length === 0 && notes.length === 0 && !summary) return null;
  return (
    <section className="mt-4 text-sm">
      {(summary || fixes.length > 0 || notes.length > 0) && (
        <div className="mb-4 rounded-card border border-line p-5">
          <h3 className="text-md font-bold">판정 노트</h3>
          {summary && <p className="mt-2 text-ink-2">{summary}</p>}
          {fixes.length > 0 && <div className="mt-3"><h4 className="font-semibold">고칠 점 {fixes.length}건</h4><ul className="mt-1.5 list-disc space-y-1 pl-4 text-ink-3">{fixes.map((f, i) => <li key={i}>{f}</li>)}</ul></div>}
          {notes.length > 0 && <div className="mt-3"><h4 className="font-semibold">참고 {notes.length}건</h4><ul className="mt-1.5 list-disc space-y-1 pl-4 text-ink-3" data-testid="check-notes">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul></div>}
        </div>
      )}
      {list.length > 0 && <h3 className="font-semibold text-ink">판정에서 걸린 항목 {list.length}건</h3>}
      {list.length > 0 && <ul className="mt-2 flex flex-wrap gap-1.5">
        {list.map((c) => (
          <li key={c.id} className="inline-flex items-center gap-1.5 rounded-lg bg-ground-3 px-2.5 py-1 text-ink-2" title={`${c.area_name} · 지금까지 ${c.hits}번 걸림`}>
            <span>{c.title}</span>
            {c.regressed && <Tag tone="warn">다시 걸림</Tag>}
          </li>
        ))}
      </ul>}
    </section>
  );
}

function GalleryDetail({ id, onClose, onOpen }: { id: number; onClose: () => void; onOpen: (id: number) => void }) {
  const q = useGalleryDetail(id);
  const m = useMockMutations();
  const { me } = useMe();
  const g = q.data?.item;
  // 같은 세트(메인 + 그 메인 기준 서브)를 탭처럼 — 세트 안에서 바로 옮겨 다닌다
  const sib = useQuery({ ...galleryQuery({ view: g?.mine ? "mine" : "shared", sort: "new", set: g?.set }), enabled: !!g?.set });
  const members = sib.data?.items ?? [];
  const unlock = () => { if (!g) return; m.unlock.mutate(g.id, { onSuccess: (r) => { toast.success(`열었습니다. 남은 포인트 ${r.points}P`); void q.refetch(); }, onError: (e) => toastError(e) }); };
  const cost = q.data?.unlock_cost ?? 30;
  useEffect(() => { document.getElementById("mock-detail")?.scrollIntoView({ block: "start" }); }, [id]);
  return (
    <div id="mock-detail" className="mt-6 scroll-mt-24">
      <button type="button" onClick={onClose} className="inline-flex h-9 items-center gap-1.5 text-sm font-semibold text-ink-3 hover:text-ink"><ArrowLeft className="size-4" aria-hidden />갤러리</button>
      {q.isPending ? <Skeleton className="mt-4 h-[70vh] rounded-card" /> : !g ? <p className="py-20 text-center text-ink-4">시안을 찾을 수 없습니다.</p> : (
        <>
          <div className="mt-4 flex flex-wrap items-start gap-4">
            <div className="min-w-0">
              <h2 className="text-3xl font-extrabold tracking-[-0.02em]">{g.title}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-3">
                <span className="rounded-full bg-dark px-2.5 py-0.5 text-xs font-bold text-white">{g.score > 0 ? `${g.score}점` : "판정 전"}</span>
                <span>{DEVICE_KO[g.device]}</span><span>·</span><span>{g.owner.name}</span><RankBadge badge={g.owner.badge} />
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="md" aria-pressed={g.liked} onClick={() => m.like.mutate(g.id, { onSuccess: () => void q.refetch(), onError: (e) => toastError(e) })}><Heart className={cn(g.liked && "fill-current text-point")} aria-hidden />{g.likes}</Button>
              {q.data?.html_url
                ? null
                : me ? <Button size="md" onClick={unlock} disabled={m.unlock.isPending}><Lock aria-hidden />{cost}P 로 열어 보기</Button>
                : <Button size="md" asChild><Link to="/login?next=/mock/mockups">로그인하고 열기</Link></Button>}
            </div>
          </div>
          {members.length > 1 && (
            <nav aria-label="같은 세트" className="mt-5 flex flex-wrap items-center gap-2">
              <span className="mr-1 inline-flex items-center gap-1 text-sm font-semibold text-ink-3"><Layers className="size-4" aria-hidden />세트 {members.length}장</span>
              {members.map((x) => (
                <Button key={x.id} size="sm" variant={x.id === g.id ? "default" : "outline"} aria-current={x.id === g.id ? "page" : undefined} onClick={() => { if (x.id !== g.id) onOpen(x.id); }}>{pageLabel(x)}</Button>
              ))}
            </nav>
          )}
          {g.note && <Copy className="mt-4 max-w-[820px] rounded-card bg-ground-2 px-5 py-4 text-md text-ink-2" text={g.note} />}
          <div className="mt-6 grid gap-6">
            <div>
              {q.data?.html_url
                ? <MockupPreview src={q.data.html_url} title={g.title} device={g.device === "mobile" ? "phone" : "pc"} />
                : <div className="relative overflow-hidden rounded-card border border-line bg-ground-3"><img src={g.thumb_url} alt="" className="w-full" /><div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-6 pb-6 pt-24 text-white"><Copy className="text-md" text={me ? `포인트 ${cost}P 로 열면 시안 전체를 직접 눌러 보고 판정 노트를 볼 수 있습니다. 한 번 열면 계속 볼 수 있습니다. 보유 ${q.data?.points ?? 0}P.` : "로그인하면 가입 포인트로 바로 열어 볼 수 있습니다."} /></div></div>}
            </div>
            <aside className="space-y-3">
              <section className="rounded-card border border-line p-5">
                <h3 className="text-md font-bold">판정 노트</h3>
                {!q.data?.notes ? <Copy className="mt-2 text-sm text-ink-4" text="시안을 열면 판정이 무엇을 쟀고 어디가 아쉬웠는지 볼 수 있습니다." /> : (
                  <div className="mt-3 space-y-3 text-sm">
                    {q.data.notes.summary && <p className="text-ink-2">{q.data.notes.summary}</p>}
                    {q.data.notes.fixes.length > 0 && <div><h4 className="font-semibold">판정이 남긴 점 {q.data.notes.fixes.length}건</h4><ul className="mt-1.5 list-disc space-y-1 pl-4 text-ink-3">{q.data.notes.fixes.map((f, i) => <li key={i}>{f}</li>)}</ul></div>}
                    {(q.data.notes.notes ?? []).length > 0 && <div><h4 className="font-semibold">참고 {q.data.notes.notes!.length}건</h4><ul className="mt-1.5 list-disc space-y-1 pl-4 text-ink-3">{q.data.notes.notes!.map((n, i) => <li key={i}>{n}</li>)}</ul></div>}
                  </div>
                )}
              </section>
              <p className="text-xs text-ink-4">열람 {g.unlocks} · 좋아요 {g.likes}</p>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

function PointsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const q = useQuery(pointsQuery(open));
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-panel p-8 sm:max-w-none" style={{ width: "min(640px, 96vw)" }}>
        <DialogHeader><DialogTitle className="text-2xl font-extrabold tracking-[-0.02em]">내 포인트 {q.data ? `${q.data.points.toLocaleString()}P` : ""}</DialogTitle><DialogDescription className="text-md text-ink-3">적립 규칙과 최근 내역</DialogDescription></DialogHeader>
        {q.isPending ? <Skeleton className="h-48 rounded-card" /> : q.data && (
          <div className="grid gap-6">
            <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              {q.data.rules.map((r) => <li key={r.reason} className="flex justify-between gap-2"><span className="text-ink-3">{r.name}</span><span className={cn("font-semibold", r.points < 0 && "text-ink-4")}>{r.points > 0 ? "+" : ""}{r.points}P{r.daily_cap ? ` · 일 ${r.daily_cap}회` : ""}</span></li>)}
            </ul>
            <Table>
              <TableHeader><TableRow><TableHead>내역</TableHead><TableHead className="w-[80px]">포인트</TableHead><TableHead className="w-[104px]">날짜</TableHead></TableRow></TableHeader>
              <TableBody>
                {q.data.ledger.length === 0 && <TableRow><TableCell colSpan={3} className="text-ink-4">아직 내역이 없습니다.</TableCell></TableRow>}
                {q.data.ledger.map((l, i) => <TableRow key={i}><TableCell className="text-left">{l.name}</TableCell><TableCell className="text-right">{l.delta > 0 ? "+" : ""}{l.delta}</TableCell><TableCell>{fmtDate(l.created_at)}</TableCell></TableRow>)}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MockupsScreen() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get("tab") === "gallery" || sp.get("gallery") ? "gallery" : "mine";
  const open = sp.get("gallery") ? Number(sp.get("gallery")) : null;
  const setOpen = (id: number | null) => setSp((p) => { const n = new URLSearchParams(p); if (id === null) n.delete("gallery"); else { n.set("gallery", String(id)); n.set("tab", "gallery"); } return n; }, { replace: true });
  return (
    <Tabs value={tab} onValueChange={(v) => setSp((p) => { const n = new URLSearchParams(p); n.set("tab", v); n.delete("gallery"); return n; }, { replace: true })} className="mt-8 gap-0">
      <TabsList variant="line" className="h-auto w-full justify-start gap-0 border-b border-line p-0"><TabsTrigger value="mine" className="h-14 flex-none rounded-none px-4 text-md font-medium text-ink-4 group-data-horizontal/tabs:after:-bottom-px after:h-0.5 data-active:font-bold data-active:text-ink">내 시안</TabsTrigger><TabsTrigger value="gallery" className="h-14 flex-none rounded-none px-4 text-md font-medium text-ink-4 group-data-horizontal/tabs:after:-bottom-px after:h-0.5 data-active:font-bold data-active:text-ink">갤러리</TabsTrigger></TabsList>
      <TabsContent value="mine" className="mt-6"><MyMockups onGallery={setOpen} /></TabsContent>
      <TabsContent value="gallery" className="mt-6"><Gallery open={open} onOpen={setOpen} /></TabsContent>
    </Tabs>
  );
}

// ---------------------------------------------------------------- 기획(와이어프레임 — ./wireframe.tsx)·컴포넌트 안내
function ComponentsScreen() {
  return (
    <section className="mt-5 grid gap-4 md:grid-cols-2">
      <div className="rounded-panel border border-line bg-ground p-6">
        <h3 className="text-lg font-bold">부품 카탈로그</h3>
        <p className="mt-2 text-md leading-[1.7] text-ink-3"><Copy as="span" text="시안이 쓰는 부품은 powerGuide 의 KRDS 77종 키트와 같습니다. React·Vue 두 판에서 코드를 복사합니다." /></p>
        <Button asChild size="sm" className="mt-4"><Link to="/guide/components">부품 보러 가기</Link></Button>
      </div>
      <div className="rounded-panel border border-line bg-ground p-6">
        <h3 className="text-lg font-bold">시안에서 코드로</h3>
        <p className="mt-2 text-md leading-[1.7] text-ink-3"><Copy as="span" text="판정을 통과한 시안은 AI 도구에서 powerMCP 에 '코드로 받기'를 요청하면 React·Vue 페이지 코드와 부품 대응표를 받습니다. 받은 코드는 키트 기준으로 타입 검사가 끝난 상태입니다." /></p>
      </div>
    </section>
  );
}

/** 시작하기(랜딩) — "파워목업으로 무엇을 할 수 있나" + "이렇게 요청하면 이렇게 나온다" 소개(사용자 2026-10-07).
 *  연결 안내(키 발급·도구별 설정)는 powerMCP 화면 한 곳에 둔다 — 여기선 링크 카드 하나. 예시 썸네일은 공유된 갤러리 점수 상위 3개(없으면 섹션 숨김). */
const MOCK_CAN: { title: string; desc: string; soon?: boolean; to: string }[] = [
  { title: "기획 와이어프레임", desc: "레퍼런스 구성을 따라 화면 와이어를 짭니다. 바로 고치고 판정합니다.", to: "/mock/plan" },
  { title: "시안 제작", desc: "만들 화면을 말하면 시안이 나옵니다. 메인과 서브 페이지 모두 됩니다.", to: "/mock/mockups" },
  { title: "시안 판정·고치기", desc: "만든 시안을 점수로 판정합니다. 고칠 곳만 AI 가 고칩니다.", to: "/mock/mockups" },
  { title: "게시·공유·코드", desc: "통과한 시안은 주소로 공유합니다. React·Vue 코드도 받습니다.", to: "/mock/components" },
];
const MOCK_FLOW: [string, string][] = [
  ["연결", "쓰는 AI 도구에 powerMCP 를 연결합니다."],
  ["요청", "만들 화면을 평소 말로 요청합니다."],
  ["판정", "점수가 기준을 넘을 때까지 고칩니다."],
  ["게시", "주소로 공유하고 갤러리에 올립니다."],
];

export function MockLandingSteps() {
  const { me, loading, member, canView } = useMe();
  // 갤러리는 로그인 뒤 보기 — 비로그인 랜딩에서는 부르지 않는다(예시 섹션은 비어 있으면 숨김, 2026-10-17 점검)
  const ex = useQuery({ ...galleryQuery({ view: "shared", sort: "score" }), enabled: canView });
  const top = (ex.data?.items ?? []).slice(0, 3);
  return (
    <>
      {/* 비회원 안내 — 기획·시안·컴포넌트와 MCP 는 Pro·Team·임직원 전용(2026-10-16 회원 전용 전환) */}
      {!loading && !member && (
        <section className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-panel border border-line bg-ground-2 px-6 py-5" aria-label="로그인 안내" data-testid="mock-login-cta">
          {/* 2026-10-20 사내 전용 운영 — PLANS_UI 가 꺼져 있으면 플랜(Pro 이상)·전환 문구 대신 사내 이용 안내 */}
          <Copy className="text-md text-ink-2" text={PLANS_UI
            ? (me ? "지금 계정은 보기만 됩니다. 기획·시안·컴포넌트 사용은 Pro 이상 회원만 됩니다." : "기획·시안·컴포넌트는 Pro 이상 회원이 씁니다. 로그인하면 볼 수 있습니다.")
            : (me ? "지금 계정은 보기만 됩니다. 이용 권한은 관리자에게 문의해 주세요." : "기획·시안·컴포넌트는 사내 임직원·승인된 협력사 계정으로 씁니다. 로그인하면 볼 수 있습니다.")} />
          <Button size="md" asChild>{me ? <Link to="/contact">{PLANS_UI ? "전환 요청" : "관리자에게 문의"}</Link> : <Link to="/login?next=/mock">로그인</Link>}</Button>
        </section>
      )}
      <section className="mt-8" aria-label="할 수 있는 일">
        <SectionHeading title="할 수 있는 일" />
        <MobileCarousel as="ul" label="할 수 있는 일" className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {MOCK_CAN.map((c) => (
            <li key={c.title} className="rounded-panel border border-line bg-ground p-6">
              <Link to={c.to} className="block">
                <span className="flex items-center gap-2 text-lg font-bold">{c.title}{c.soon && <Tag tone="soft">준비 중</Tag>}</span>
                <span className="mt-2 block text-md leading-[1.7] text-ink-3"><Copy as="span" text={c.desc} /></span>
              </Link>
            </li>
          ))}
        </MobileCarousel>
      </section>
      <section className="mt-8" aria-label="사용 흐름">
        <SectionHeading title="사용 흐름" />
        <StepCards cols={4} items={MOCK_FLOW.map(([title, desc], i) => ({ title, desc, img: `/img/steps/mock-${i + 1}-v3.html` }))} />
      </section>
      {top.length > 0 && (
        <section className="mt-8" aria-label="요청 예시">
          <SectionHeading title="이렇게 요청하면 이렇게 나옵니다" to="/mock/mockups?tab=gallery" more="갤러리 보기" />
          <MobileCarousel as="ul" label="요청 예시" className={cn("mt-6 grid grid-cols-1 gap-x-8 gap-y-10 md:grid-cols-2", top.length === 3 && "lg:grid-cols-3")}>
            {top.map((g) => (
              <li key={g.id} className="flex min-w-0 flex-col gap-4">
                <p className="relative self-start rounded-card rounded-bl-md bg-ground-3 px-4 py-3 text-md font-semibold leading-[1.6]">
                  “{g.title} {DEVICE_KO[g.device]} 시안 만들어 줘.”
                </p>
                <ThumbFrame radius="lg" ratio="16/10" className="bg-ground-3 p-[9%]">
                  <span className="relative flex w-full overflow-hidden rounded-md bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]"><img src={g.thumb_url} alt={`${g.title} 시안`} loading="lazy" className="aspect-[16/10] w-full object-cover object-top" /></span>
                </ThumbFrame>
                <span className="text-sm text-ink-4">{g.score > 0 ? `판정 ${g.score}점` : "판정 전"}</span>
              </li>
            ))}
          </MobileCarousel>
        </section>
      )}
    </>
  );
}

export const MOCK_SCREENS: Record<string, () => React.JSX.Element> = { plan: WireframeScreen, mockups: MockupsScreen, components: ComponentsScreen };

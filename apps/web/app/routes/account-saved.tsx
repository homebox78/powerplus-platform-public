// 출처: homebox-handoff apps/web/app/routes/collections.tsx — 마이페이지 "저장"(/account/saved) 으로 옮기고 대상을 모듈 교차(에셋·시안·글)로.
// 목록: 컬렉션 카드(썸네일 4) + 최근 저장(종류 선택). 상세(/account/saved/:id): 항목 그리드·메모(blur 저장)·공유 링크(켜기·복사)·항목 빼기·삭제.
// 그림·잠금은 서버가 Access::can 을 거쳐 준다. 화면은 받은 대로 그린다.
// 2026-10-07: 상세에 여러 개 빼기(/me/bulk/collections/{id}/remove)·넓게 보기·메모 패널 접기.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Link2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { BulkBar, useSelection } from "@/components/admin/admin-ui";
import { BackButton } from "@/components/hb/back-button";
import { ChoiceButton } from "@/components/hb/choice-button";
import { confirmToast, toastError } from "@/components/hb/confirm";
import { Copy } from "@/components/hb/copy";
import { SavedItemCard } from "@/components/hb/saved-item-card";
import { SectionHeading } from "@/components/hb/section-heading";
import { Tag } from "@/components/hb/tag";
import { PaneToggle, usePane } from "@/components/hb/work-space";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, postJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Collection, CollectionItem, SaveType } from "@/lib/saved";
import type { Route } from "./+types/account-saved";

export const meta: Route.MetaFunction = () => [{ title: "저장 — powerPlus" }];

const TYPES: { id: SaveType; label: string }[] = [{ id: "asset", label: "에셋" }, { id: "gallery", label: "시안" }, { id: "post", label: "글" }];
const day = (s: string) => s.slice(0, 10).replaceAll("-", ".");

export default function AccountSavedPage() {
  const { id } = useParams();
  return id ? <CollectionDetail id={id} /> : <SavedHome />;
}

function SavedHome() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [type, setType] = useState("");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const cq = useQuery({ queryKey: ["collections"], queryFn: () => apiFetch<{ items: Collection[]; limit: number }>("/collections") });
  const iq = useQuery({ queryKey: ["saved", "full", type], queryFn: () => apiFetch<{ items: CollectionItem[] }>(`/saved?full=1${type ? `&type=${type}` : ""}`) });
  const create = useMutation({
    mutationFn: () => postJson<Collection>("/collections", { name: name.trim() }),
    onSuccess: (c) => { void qc.invalidateQueries({ queryKey: ["collections"] }); setOpen(false); setName(""); navigate(`/account/saved/${c.id}`); },
    onError: (e) => toastError(e, "컬렉션을 만들지 못했습니다."),
  });
  const cols = cq.data?.items ?? [];
  const limit = cq.data?.limit ?? -1;
  const canCreate = limit < 0 || cols.length < limit;
  const items = iq.data?.items ?? [];

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0">
          <h1 className="text-4xl font-extrabold tracking-[-0.03em]">저장</h1>
          <Copy className="mt-1.5 text-md text-ink-3" text="에셋·시안·글의 저장 버튼을 누르면 '내 저장'에 담깁니다. 컬렉션으로 나눠 제안·설계 근거로 묶어 두세요." />
        </div>
        <span className="flex-1" />
        <Button size="md" onClick={() => setOpen(true)} disabled={!canCreate} title={canCreate ? undefined : `컬렉션은 ${limit}개까지 만들 수 있습니다.`}><Plus aria-hidden />새 컬렉션</Button>
      </div>

      <section className="flex flex-col gap-5">
        <SectionHeading title="컬렉션" size={24} />
        {cq.isLoading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="aspect-[16/10] rounded-card" />)}</div>
        ) : cols.length === 0 ? (
          <Empty text="아직 컬렉션이 없습니다. 처음 저장하면 '내 저장' 컬렉션이 생깁니다." />
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {cols.map((c) => (
              <Link key={c.id} to={`/account/saved/${c.id}`} className="group flex min-w-0 flex-col gap-3 rounded-card focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2">
                <div className="grid aspect-[16/10] grid-cols-2 gap-1 overflow-hidden rounded-thumb border border-line bg-ground-2 p-1">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="relative overflow-hidden rounded-md bg-white dark:bg-ground-3">{c.thumbs?.[i] && <img src={c.thumbs[i]} alt="" className="absolute inset-0 size-full object-cover object-top" loading="lazy" />}</div>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-2"><span className="truncate text-md font-bold">{c.name}</span><span className="shrink-0 text-sm text-ink-4">{c.items_n}개</span></div>
                <div className="flex items-center gap-1.5">
                  {c.is_default && <Tag tone="soft">기본</Tag>}
                  {c.shared && <Tag tone="ok">공유 중</Tag>}
                  <span className="text-xs text-ink-4">{day(c.updated_at)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[24px] font-extrabold leading-[1.25] tracking-[-0.025em]">최근 저장</h2>
          <span className="flex-1" />
          <ChoiceButton size="sm" label="종류" value={type} onChange={setType} options={TYPES} />
        </div>
        {iq.isLoading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="aspect-[16/10] rounded-card" />)}</div>
        ) : items.length === 0 ? (
          <Empty text="저장한 항목이 없습니다." />
        ) : (
          <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((it, i) => <SavedItemCard key={`${it.type}-${it.ref ?? i}`} it={it} />)}
          </div>
        )}
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="hb-dark-dialog rounded-panel">
          <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(); }} className="flex flex-col gap-5">
            <DialogHeader><DialogTitle>새 컬렉션</DialogTitle></DialogHeader>
            <div className="flex flex-col gap-1.5"><Label htmlFor="c-name">이름</Label><Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus placeholder="예: OO시 제안 레퍼런스" /></div>
            <DialogFooter><Button type="submit" disabled={!name.trim() || create.isPending}>만들기</Button><Button type="button" variant="outline" onClick={() => setOpen(false)}>취소</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line-3 px-4 py-16 text-ink-4">
      <Bookmark className="size-8" aria-hidden />
      <Copy as="span" text={text} className="text-center" />
    </div>
  );
}

function CollectionDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["collections", id], queryFn: () => apiFetch<{ collection: Collection; items: CollectionItem[] }>(`/collections/${id}`), retry: false });
  const [memo, setMemo] = useState<string | null>(null);
  const [editName, setEditName] = useState<string | null>(null);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["collections"] }); void qc.invalidateQueries({ queryKey: ["saved"] }); };
  const patch = useMutation({ mutationFn: (b: Record<string, unknown>) => postJson<Collection>(`/collections/${id}`, b, "PATCH"), onSuccess: () => { refresh(); toast.success("저장했습니다."); }, onError: (e) => toastError(e) });
  const share = useMutation({ mutationFn: (on: boolean) => postJson<Collection>(`/collections/${id}/share`, { on }), onSuccess: (c) => { refresh(); toast.success(c.shared ? "공유 링크를 켰습니다." : "공유 링크를 껐습니다."); }, onError: (e) => toastError(e) });
  const remove = useMutation({ mutationFn: (it: CollectionItem) => apiFetch<null>(`/collections/${id}/items/${it.type}/${encodeURIComponent(it.ref ?? "")}`, { method: "DELETE" }), onSuccess: refresh, onError: (e) => toastError(e) });
  const [side, setSide] = usePane("saved-side");
  const keyOf = (it: CollectionItem) => it.type + ":" + (it.ref ?? "");
  const sel = useSelection((q.data?.items ?? []).filter((it) => it.ref).map(keyOf), [id]);
  const bulkRemove = async (ids: string[]) => {
    try {
      const r = await postJson<{ count: number }>("/me/bulk/collections/" + id + "/remove", { ids });
      sel.clear(); refresh(); toast.success(r.count + "개를 뺐습니다.");
    } catch (e) { toastError(e); }
  };
  const del = useMutation({ mutationFn: () => apiFetch<null>(`/collections/${id}`, { method: "DELETE" }), onSuccess: () => { refresh(); navigate("/account/saved"); }, onError: (e) => toastError(e) });

  if (q.isLoading) return <div className="flex flex-col gap-6"><Skeleton className="h-10 w-72" /><Skeleton className="h-64 w-full rounded-card" /></div>;
  if (q.isError || !q.data) return <div className="py-24 text-center text-ink-4"><p>컬렉션을 찾을 수 없습니다.</p><Link to="/account/saved" className="mt-4 inline-block font-semibold underline underline-offset-4">저장으로</Link></div>;
  const { collection: c, items } = q.data;
  const saveName = () => {
    const v = (editName ?? "").trim();
    setEditName(null);
    if (v && v !== c.name) patch.mutate({ name: v });
  };
  const shareUrl = c.shared && c.share_token ? `${window.location.origin}/c/${c.share_token}` : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <BackButton fallback="/account/saved" className="mb-2" />
        <nav className="text-sm text-ink-4" aria-label="경로"><Link to="/account/saved" className="hover:text-ink">저장</Link> <span aria-hidden>›</span> {c.name}</nav>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {editName === null ? (
            <h1 className="flex min-w-0 items-center gap-2 break-keep text-4xl font-extrabold tracking-[-0.03em]">
              {c.name}
              <Button variant="ghost" size="icon-sm" aria-label="이름 고치기" title="이름 고치기" onClick={() => setEditName(c.name)}><Pencil aria-hidden /></Button>
            </h1>
          ) : (
            // 이름 고치기 — Enter·바깥 클릭이면 저장, Esc 면 취소
            <form className="flex min-w-0 items-center gap-2" onSubmit={(e) => { e.preventDefault(); saveName(); }}>
              <Input aria-label="컬렉션 이름" className="h-11 w-[min(480px,70vw)] text-xl font-bold" value={editName} maxLength={80} autoFocus onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setEditName(null); }} onBlur={saveName} />
              <Button type="submit" size="md" disabled={!editName.trim()}>저장</Button>
            </form>
          )}
          <Tag tone="line">{c.items_n}개</Tag>
          {c.is_default && <Tag tone="soft">기본</Tag>}
          <span className="flex-1" />
          {items.some((it) => it.ref) && (
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-3">
              <Checkbox checked={sel.allOn ? true : sel.someOn ? "indeterminate" : false} onCheckedChange={sel.togglePage} />모두 고르기
            </label>
          )}
          <PaneToggle open={side} onToggle={setSide} label="메모·공유" side="right" className="hidden xl:inline-flex" />
          <Button variant="outline" size="sm" onClick={() => confirmToast(`'${c.name}' 컬렉션을 삭제할까요?`, () => del.mutate(), { action: "삭제", description: "담긴 항목도 함께 빠집니다." })}><Trash2 aria-hidden />삭제</Button>
        </div>
      </div>

      <div className={cn("grid grid-cols-1 gap-6", side && "xl:grid-cols-[minmax(0,1fr)_300px]")}>
        <div className="min-w-0">
          {items.length === 0 ? (
            <Empty text="담긴 항목이 없습니다. 에셋·시안·글의 저장 버튼을 눌러 보세요." />
          ) : (
            <div className={cn("grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2", !side && "xl:grid-cols-3")}>
              {items.map((it, i) => (
                <div key={`${it.type}-${it.ref ?? i}`} className="relative min-w-0">
                  <SavedItemCard it={it} onRemove={it.ref ? () => remove.mutate(it) : undefined} />
                  {it.ref && <span className="absolute left-3 top-3 z-10 grid size-8 place-items-center rounded-md bg-ground/90 shadow-sm"><Checkbox aria-label={"고르기: " + (it.card?.title ?? it.type_ko)} checked={sel.has(keyOf(it))} onCheckedChange={() => sel.toggle(keyOf(it))} /></span>}
                </div>
              ))}
            </div>
          )}
        </div>
        <aside className={cn("flex min-w-0 flex-col gap-5", !side && "xl:hidden")}>
          <div className="rounded-card border border-line p-5">
            <h3 className="text-md font-bold">메모</h3>
            <Textarea className="mt-2 min-h-28 rounded-field" placeholder="제안서에 쓸 관찰, 비교 포인트" maxLength={2000} value={memo ?? c.memo ?? ""} onChange={(e) => setMemo(e.target.value)} onBlur={() => { if (memo !== null && memo !== (c.memo ?? "")) patch.mutate({ memo }); }} />
          </div>
          <div className="rounded-card border border-line p-5">
            <div className="flex items-center justify-between gap-3"><h3 className="text-md font-bold">공유 링크</h3><Switch checked={c.shared} disabled={share.isPending} onCheckedChange={(v) => share.mutate(v)} aria-label="공유 링크 켜기" /></div>
            <Copy className="mt-1.5 text-sm text-ink-4" text="켜면 로그인 없이 링크로 봅니다. 권한 밖 항목은 잠겨 보입니다." />
            {shareUrl && (
              <div className="mt-3 flex min-w-0 items-center gap-2 rounded-chip bg-ground-3 py-1 pl-3 pr-1 text-sm">
                <Link2 className="size-4 shrink-0 text-ink-4" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{shareUrl}</span>
                <Button variant="ghost" size="xs" onClick={() => { void navigator.clipboard?.writeText(shareUrl); toast.success("링크를 복사했습니다."); }}>복사</Button>
              </div>
            )}
          </div>
        </aside>
      </div>
      <BulkBar sel={sel} actions={[{ label: "컬렉션에서 빼기", icon: <Trash2 aria-hidden />, danger: true, confirm: "고른 {n}개를 이 컬렉션에서 뺍니다.", onRun: (ids) => void bulkRemove(ids) }]} />
    </div>
  );
}

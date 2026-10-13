// 관리자 · 에셋 — asset_items 백오피스. 격자(분류·공개 범위·검색·여러 개 골라 공개 범위 일괄) + 카드 클릭 → 오른쪽 Sheet 상세(메타·태그·세트·공개 범위 수정, 삭제·복원)
// + '에셋 등록' Dialog(파일·분류·이름·태그) + 휴지통·세트 탭. 옛 파워플러스 관리자(server/admin/index.html)의 기능 목록만 참고했고 화면은 현재 관리자 부품으로 새로 그렸다.
// 권한(서버가 같은 규칙으로 막는다): admin 이상은 어느 범위로든, 큐레이터는 사내 전용(internal)으로 올리기만. 바꾼 기록은 core_audit.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RotateCcw, Save, Trash2, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AdminTitle, Field, Pager, SearchBox, SortHead, useQueryState, useSort } from "@/components/admin/admin-ui";
import { ChoiceButton } from "@/components/hb/choice-button";
import { confirmToast, toastError } from "@/components/hb/confirm";
import { Copy } from "@/components/hb/copy";
import { Tag } from "@/components/hb/tag";
import { ThumbFrame } from "@/components/hb/thumb-frame";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { fetchAdminAsset, fetchAdminAssetCategories, fetchAdminAssets, fetchAdminAssetTrash, fetchAdminSets, fmtAt, VIS_KO, type AdminAsset, type AdminAssetDetail, type AdminAssetSet, type AssetVis } from "@/lib/admin";
import { apiFetch, postJson } from "@/lib/api";
import { CATEGORY_KO } from "@/lib/assets";
import { useMe } from "@/lib/auth";
import { cn } from "@/lib/utils";
import type { Route } from "./+types/admin-assets";

export const meta: Route.MetaFunction = () => [{ title: "에셋 — powerPlus 관리자" }];

const VIS_TONE: Record<AssetVis, "ink" | "soft" | "ok" | "line" | "warn"> = { internal: "ink", partner: "soft", pro: "soft", free: "ok", public: "ok", private: "line" };
const VIS_IDS = Object.keys(VIS_KO) as AssetVis[];
const fmtBytes = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`);
/** 쉼표·줄바꿈으로 적은 태그 → 배열 */
const splitTags = (s: string) => Array.from(new Set(s.split(/[,\n]+/).map((t) => t.trim().toLowerCase()).filter(Boolean)));

/** 일괄 처리 — 고른 것(ids) 또는 지금 조건 전부(all). 소프트 삭제라 휴지통에서 되돌릴 수 있다. */
type BulkBody = { action: "delete" | "restore"; ids?: string[]; all?: boolean; filter?: { category?: string; visibility?: string; q?: string } };
function useBulk(onDone: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: BulkBody) => postJson<{ action: string; count: number }>("/admin/assets/bulk", b),
    onSuccess: (r) => {
      toast.success(r.action === "delete" ? `${r.count.toLocaleString()}개를 휴지통으로 옮겼습니다. 복원할 수 있습니다.` : `${r.count.toLocaleString()}개를 복원했습니다.`);
      void qc.invalidateQueries({ queryKey: ["admin", "assets"] }); void qc.invalidateQueries({ queryKey: ["admin", "asset-categories"] });
      onDone();
    },
    onError: (e) => toastError(e),
  });
}

export default function AdminAssets() {
  const { get, set, page } = useQueryState();
  const me = useMe();
  const isSuper = me.hasRole("superadmin");
  const tab = get("tab") || "items";
  const category = get("category");
  const visibility = get("visibility");
  const q = get("q");
  const [picked, setPicked] = useState<string[]>([]);
  const [to, setTo] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin", "assets", category, visibility, q, page], queryFn: () => fetchAdminAssets({ category, visibility, q, page }), enabled: tab === "items" });
  const cats = useQuery({ queryKey: ["admin", "asset-categories"], queryFn: fetchAdminAssetCategories });
  const items = list.data?.data ?? [];
  const counts = (list.data?.meta?.counts ?? {}) as Partial<Record<AssetVis, number>>;
  const allowed = (list.data?.meta?.allowed ?? []) as AssetVis[];
  const allOn = items.length > 0 && items.every((x) => picked.includes(x.id));
  const invalidate = () => { void qc.invalidateQueries({ queryKey: ["admin", "assets"] }); void qc.invalidateQueries({ queryKey: ["admin", "asset-categories"] }); void qc.invalidateQueries({ queryKey: ["admin", "asset"] }); };

  const change = useMutation({
    mutationFn: (b: { ids: string[]; visibility: string }) => postJson<{ changed: number; skipped: number; blocked: number; missing: number }>("/admin/assets/visibility", b),
    onSuccess: (r, v) => {
      const extra = [r.skipped && `이미 같은 범위 ${r.skipped}개`, r.blocked && `권한 밖 ${r.blocked}개`, r.missing && `없음 ${r.missing}개`].filter(Boolean).join(" · ");
      toast.success(`${r.changed}개를 ${VIS_KO[v.visibility as AssetVis]}(으)로 바꿨습니다.${extra ? ` (${extra})` : ""}`);
      setPicked([]); setTo(""); invalidate();
    },
    onError: (e) => toastError(e),
  });
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const apply = () => {
    if (!to || picked.length === 0) return;
    confirmToast(`선택한 ${picked.length}개를 ${VIS_KO[to as AssetVis]}(으)로 바꿀까요?`, () => change.mutate({ ids: picked, visibility: to }), {
      action: "바꾸기", description: to !== "internal" ? "외부에 보이는 범위가 넓어집니다. 사내 자료가 섞이지 않았는지 확인하세요." : undefined,
    });
  };
  const bulk = useBulk(() => setPicked([]));
  const total = list.data?.total ?? 0;
  const delPicked = () => confirmToast(`선택한 ${picked.length}개를 휴지통으로 옮길까요?`, () => bulk.mutate({ action: "delete", ids: picked }), { action: "삭제", description: "애드인·검색·MCP 에서 바로 사라집니다. 휴지통에서 복원할 수 있습니다." });
  const delAll = () => confirmToast(`지금 조건의 에셋 ${total.toLocaleString()}개를 모두 휴지통으로 옮길까요?`, () => bulk.mutate({ action: "delete", all: true, filter: { category, visibility, q } }), { action: "모두 삭제", description: category || visibility || q ? "분류·공개 범위·검색어 조건에 맞는 것만 옮깁니다. 휴지통에서 복원할 수 있습니다." : "조건이 없어 전체 에셋이 대상입니다. 휴지통에서 복원할 수 있습니다." });
  const catOptions = (cats.data ?? []).filter((c) => c.id !== "mockup_sample" || isSuper).map((c) => ({ id: c.id, label: c.label, count: c.count }));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <AdminTitle title="에셋" desc="등록·수정·공개 범위·세트를 한 곳에서 다룹니다. 카드를 누르면 오른쪽에 상세가 열립니다." />
        <Button size="sm" onClick={() => setRegistering(true)} className="mt-1"><Plus aria-hidden />에셋 등록</Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => { setPicked([]); set({ tab: v === "items" ? "" : v }); }} className="mt-6">
        <TabsList>
          <TabsTrigger value="items">에셋</TabsTrigger>
          <TabsTrigger value="sets">세트</TabsTrigger>
          <TabsTrigger value="trash">휴지통{cats.data ? ` ${cats.data.reduce((n, c) => n + c.deleted, 0)}` : ""}</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "sets" && <SetsPane isSuper={isSuper} />}
      {tab === "trash" && <TrashPane onOpen={setOpenId} />}
      {tab === "items" && (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <ChoiceButton size="sm" label="분류" value={category} onChange={(v) => { setPicked([]); set({ category: v }); }} options={catOptions.length ? catOptions : Object.entries(CATEGORY_KO).filter(([id]) => id !== "mockup_sample" || isSuper).map(([id, label]) => ({ id, label }))} />
            <ChoiceButton size="sm" label="공개 범위" value={visibility} onChange={(v) => { setPicked([]); set({ visibility: v }); }} options={VIS_IDS.map((id) => ({ id, label: VIS_KO[id], count: counts[id] ?? 0 }))} />
            <SearchBox value={q} onSearch={(v) => { setPicked([]); set({ q: v }); }} placeholder="이름·태그·에셋 번호 검색" />
            <span className="ml-auto text-sm tabular-nums text-ink-4">{(list.data?.total ?? 0).toLocaleString()}개</span>
          </div>

          {/* 일괄 변경 줄 — 고른 게 있을 때만 버튼이 살아난다. 같은 줄 컨트롤은 높이 44 */}
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-ground-2 px-4 py-3">
            <Button size="sm" variant="outline" onClick={() => setPicked(allOn ? [] : items.map((x) => x.id))} disabled={items.length === 0}>{allOn ? "이 쪽 선택 해제" : "이 쪽 모두 선택"}</Button>
            <span className="text-sm tabular-nums text-ink-3">{picked.length}개 선택</span>
            <Button size="sm" variant="outline" onClick={delPicked} disabled={picked.length === 0 || bulk.isPending}><Trash2 aria-hidden />선택 삭제</Button>
            <Button size="sm" variant="outline" onClick={delAll} disabled={total === 0 || bulk.isPending}>모두 삭제{total ? ` ${total.toLocaleString()}` : ""}</Button>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <ChoiceButton size="sm" label="바꿀 범위" allLabel="고르세요" value={to} onChange={setTo} options={allowed.map((id) => ({ id, label: VIS_KO[id] }))} />
              <Button size="sm" onClick={apply} disabled={!to || picked.length === 0 || change.isPending}>바꾸기</Button>
            </div>
          </div>
          {allowed.length === 1 && <Copy className="mt-2 text-sm text-ink-4" text="큐레이터는 사내 전용으로 올리기만 할 수 있습니다. 범위를 낮추려면 관리자에게 요청하세요." />}

          <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
            {list.isLoading && Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-[160px] rounded-card" />)}
            {items.map((x) => <AssetCard key={x.id} x={x} picked={picked.includes(x.id)} onPick={() => toggle(x.id)} onOpen={() => setOpenId(x.id)} />)}
          </div>
          {list.data && items.length === 0 && <p className="py-16 text-center text-ink-4">해당하는 에셋이 없습니다.</p>}
          <Pager page={page} total={list.data?.total ?? 0} limit={list.data?.limit ?? 48} onPage={(p) => { setPicked([]); set({ page: String(p), tab: "" }); }} />
        </>
      )}

      <Sheet open={!!openId} onOpenChange={(v) => { if (!v) setOpenId(null); }}>
        <SheetContent className="w-full overflow-y-auto bg-ground text-ink sm:max-w-[560px]">
          {openId && <AssetDetail key={openId} id={openId} isAdmin={me.hasRole("admin")} isSuper={isSuper} onClose={() => setOpenId(null)} onChanged={invalidate} />}
        </SheetContent>
      </Sheet>

      <RegisterDialog open={registering} onOpenChange={setRegistering} isAdmin={me.hasRole("admin")} isSuper={isSuper} onDone={(id) => { invalidate(); setOpenId(id); }} />
    </div>
  );
}

/** 격자 카드 — 카드 = 상세 열기, 왼쪽 위 체크 = 일괄 선택(둘을 분리: 겹치면 클릭이 모호하다) */
function AssetCard({ x, picked, onPick, onOpen, trashed }: { x: AdminAsset; picked: boolean; onPick: () => void; onOpen: () => void; trashed?: boolean }) {
  return (
    <div className="relative flex min-w-0 flex-col gap-2">
      <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }} aria-label={`${x.name || x.category_ko} 상세 열기`} className="flex min-w-0 cursor-pointer flex-col gap-2 rounded-card text-left focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2">
        <ThumbFrame ratio="16/10" radius="card" className={cn("bg-ground-3", trashed && "opacity-70", picked && "border-ink opacity-100 ring-2 ring-ink")}>
          {x.thumb_url && <img src={x.thumb_url} alt="" loading="lazy" className="absolute inset-0 m-auto max-h-[89%] max-w-[89%] object-contain" />}
        </ThumbFrame>
        <span className="flex min-w-0 items-center gap-1.5"><span className="min-w-0 truncate text-sm font-semibold">{x.name || x.category_ko}</span><Tag tone={VIS_TONE[x.visibility]} className="ml-auto">{VIS_KO[x.visibility]}</Tag></span>
        <span className="truncate text-xs text-ink-4">{x.category_ko} · {trashed ? `${fmtAt(x.deleted_at ?? x.updated_at).slice(0, 10)} 삭제` : fmtAt(x.updated_at).slice(0, 10)}</span>
      </div>
      <span className="absolute left-2 top-2 inline-flex size-7 items-center justify-center rounded-md border border-line-3 bg-white/90" onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={picked} onCheckedChange={onPick} aria-label={`${x.name || x.category_ko} 선택`} />
      </span>
    </div>
  );
}

/** 상세 — 메타 수정 폼. 보낸 키만 서버가 바꾼다. */
function AssetDetail({ id, isAdmin, isSuper, onClose, onChanged }: { id: string; isAdmin: boolean; isSuper: boolean; onClose: () => void; onChanged: () => void }) {
  const d = useQuery({ queryKey: ["admin", "asset", id], queryFn: () => fetchAdminAsset(id) });
  if (d.isLoading || !d.data) {
    return (
      <>
        <SheetHeader className="border-b border-line px-6 py-5"><SheetTitle className="text-xl font-bold text-ink">에셋</SheetTitle><SheetDescription className="text-ink-4">불러오는 중</SheetDescription></SheetHeader>
        <div className="flex flex-col gap-4 px-6 pb-8"><Skeleton className="aspect-[16/10] w-full rounded-card" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-24 w-full" /></div>
      </>
    );
  }
  return <AssetForm key={d.data.updated_at + String(d.data.deleted_at)} a={d.data} isAdmin={isAdmin} isSuper={isSuper} onClose={onClose} onChanged={onChanged} />;
}

function AssetForm({ a, isAdmin, isSuper, onClose, onChanged }: { a: AdminAssetDetail; isAdmin: boolean; isSuper: boolean; onClose: () => void; onChanged: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(a.name ?? "");
  const [alt, setAlt] = useState(a.alt ?? "");
  const [category, setCategory] = useState(a.category);
  const [visibility, setVisibility] = useState<AssetVis>(a.visibility);
  const [ai, setAi] = useState(a.ai);
  const [ko, setKo] = useState(a.tags.ko.join(", "));
  const [en, setEn] = useState(a.tags.en.join(", "));
  const [setId, setSetId] = useState(a.set?.id ?? "");
  const [askDelete, setAskDelete] = useState(false);
  const sets = useQuery({ queryKey: ["admin", "sets", category], queryFn: () => fetchAdminSets({ category }) });
  const gone = a.deleted_at !== null;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["admin", "asset", a.id] }); onChanged(); };
  const save = useMutation({
    mutationFn: () => postJson<AdminAssetDetail>(`/admin/assets/${a.id}`, { name, alt, category, visibility, ai, set: setId, tags: { ko: splitTags(ko), en: splitTags(en) } }, "PATCH"),
    onSuccess: () => { toast.success("저장했습니다."); refresh(); },
    onError: (e) => toastError(e),
  });
  const del = useMutation({
    mutationFn: () => apiFetch<{ id: string }>(`/admin/assets/${a.id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("휴지통으로 옮겼습니다. 복원할 수 있습니다."); refresh(); onClose(); },
    onError: (e) => toastError(e),
  });
  const restore = useMutation({
    mutationFn: () => postJson<AdminAssetDetail>(`/admin/assets/${a.id}/restore`, {}),
    onSuccess: () => { toast.success("복원했습니다."); refresh(); },
    onError: (e) => toastError(e),
  });
  const visOptions = isAdmin ? VIS_IDS.filter((v) => v !== "private" || a.visibility === "private") : (["internal"] as AssetVis[]);
  const original = a.files.find((f) => f.kind === "original" || f.kind === "slide");
  return (
    <>
      <SheetHeader className="border-b border-line px-6 py-5">
        <SheetTitle className="text-xl font-bold text-ink">{a.name || a.category_ko}</SheetTitle>
        <SheetDescription className="text-ink-4">{a.id} · {fmtAt(a.created_at)} 등록{gone ? ` · ${fmtAt(a.deleted_at)} 삭제` : ""}</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-6 px-6 pb-8">
        <ThumbFrame ratio="16/10" radius="card" className="bg-ground-3">
          {a.thumb_url && <img src={a.thumb_url} alt="" className="absolute inset-0 m-auto max-h-[89%] max-w-[89%] object-contain" />}
        </ThumbFrame>
        <div className="flex flex-wrap items-center gap-2">
          <Tag tone={VIS_TONE[a.visibility]}>{VIS_KO[a.visibility]}</Tag>
          {a.ai && <Tag tone="soft">AI 생성</Tag>}
          {gone && <Tag tone="warn">삭제됨</Tag>}
          {original?.url && <a href={original.url} target="_blank" rel="noreferrer" className="ml-auto text-sm underline underline-offset-4">원본 열기</a>}
        </div>
        <dl className="divide-y divide-line">
          <Field label="크기">{a.w && a.h ? `${a.w}×${a.h}` : "—"}{original ? ` · ${fmtBytes(original.bytes)}` : ""}</Field>
          <Field label="사용">삽입 {a.uses.toLocaleString()}회 · 즐겨찾기 {a.favorites.toLocaleString()}</Field>
          {a.style_group && <Field label="스타일 그룹">{a.style_group}</Field>}
          {a.legacy_key && <Field label="옛 번호">{a.legacy_key}</Field>}
          {a.tags.meta.length > 0 && <Field label="메타 태그"><span className="flex flex-wrap gap-1">{a.tags.meta.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}</span></Field>}
        </dl>

        <fieldset disabled={gone} className="flex flex-col gap-4 disabled:opacity-60">
          <div className="grid gap-1.5"><Label htmlFor="a-name">이름</Label><Input className="h-9 text-sm" id="a-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder="비우면 분류명으로 보입니다" /></div>
          <div className="grid gap-1.5"><Label htmlFor="a-alt">설명(대체 글)</Label><Input className="h-9 text-sm" id="a-alt" value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={300} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>분류</Label>
              <Select value={category} onValueChange={(v) => { setCategory(v); setSetId(""); }}>
                <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(CATEGORY_KO).filter(([id]) => id !== "mockup_sample" || isSuper).map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>공개 범위</Label>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as AssetVis)}>
                <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{visOptions.map((v) => <SelectItem key={v} value={v}>{VIS_KO[v]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>세트</Label>
            <Select value={setId || "__none"} onValueChange={(v) => setSetId(v === "__none" ? "" : v)}>
              <SelectTrigger size="sm" className="w-full"><SelectValue placeholder="세트 없음" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">세트 없음</SelectItem>
                {(sets.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.count})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5"><Label htmlFor="a-ko">국문 태그 <span className="font-normal text-ink-4">쉼표로 구분 · {splitTags(ko).length}개</span></Label><Textarea id="a-ko" value={ko} onChange={(e) => setKo(e.target.value)} rows={3} className="text-sm" /></div>
          <div className="grid gap-1.5"><Label htmlFor="a-en">영문 태그 <span className="font-normal text-ink-4">{splitTags(en).length}개</span></Label><Textarea id="a-en" value={en} onChange={(e) => setEn(e.target.value)} rows={3} className="text-sm" /></div>
          <div className="flex items-center justify-between rounded-xl border border-line px-4 py-3"><Label htmlFor="a-ai">AI 생성 에셋</Label><Switch id="a-ai" checked={ai} onCheckedChange={setAi} /></div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-2">
          {gone ? (
            <Button size="sm" onClick={() => restore.mutate()} disabled={restore.isPending}><RotateCcw aria-hidden />복원</Button>
          ) : (
            <>
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}><Save aria-hidden />저장</Button>
              <Button size="sm" variant="outline" className="ml-auto text-warn" onClick={() => setAskDelete(true)} disabled={del.isPending}><Trash2 aria-hidden />삭제</Button>
            </>
          )}
        </div>
      </div>

      <AlertDialog open={askDelete} onOpenChange={setAskDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이 에셋을 휴지통으로 옮길까요?</AlertDialogTitle>
            <AlertDialogDescription asChild><Copy text="애드인·검색·MCP 에서 바로 사라집니다. 파일은 남으므로 휴지통에서 복원할 수 있습니다." /></AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={() => del.mutate()}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** 등록 — multipart. 이미지(또는 장표 .pptx + 썸네일). 원본 크기 그대로, 썸네일은 서버가 만든다. */
function RegisterDialog({ open, onOpenChange, isAdmin, isSuper, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; isAdmin: boolean; isSuper: boolean; onDone: (id: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [thumb, setThumb] = useState<File | null>(null);
  const [category, setCategory] = useState("icon");
  const [visibility, setVisibility] = useState<AssetVis>("internal");
  const [name, setName] = useState("");
  const [ko, setKo] = useState("");
  const [en, setEn] = useState("");
  const [ai, setAi] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const reset = () => { setFile(null); setThumb(null); setName(""); setKo(""); setEn(""); setAi(false); setVisibility("internal"); };
  const up = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("파일을 골라 주세요.");
      const fd = new FormData();
      fd.set("file", file);
      if (thumb) fd.set("thumb", thumb);
      fd.set("category", category); fd.set("visibility", visibility); fd.set("name", name);
      fd.set("tags_ko", ko); fd.set("tags_en", en); fd.set("ai", ai ? "1" : "0");
      return apiFetch<AdminAssetDetail>("/admin/assets", { method: "POST", body: fd });
    },
    onSuccess: (r) => { toast.success(`등록했습니다. ${r.category_ko} · ${r.id}`); reset(); onOpenChange(false); onDone(r.id); },
    onError: (e) => toastError(e),
  });
  const pick = (f: File | null) => { setFile(f); if (f && !name) setName(f.name.replace(/\.[^.]+$/, "")); };
  const isPpt = category === "ppt";
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!up.isPending) onOpenChange(v); }}>
      <DialogContent className="bg-ground text-ink sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>에셋 등록</DialogTitle>
          <DialogDescription asChild><Copy className="text-ink-4" text="원본은 크기 그대로 저장되고 썸네일은 자동으로 만듭니다. 공개 범위는 사내 전용이 기본입니다." /></DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div
            role="button" tabIndex={0} onClick={() => inputRef.current?.click()} onKeyDown={(e) => { if (e.key === "Enter") inputRef.current?.click(); }}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0] ?? null); }}
            className={cn("flex min-h-[132px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center", drag ? "border-ink bg-ground-3" : "border-line-3 bg-ground-2")}
          >
            <Upload className="size-6 text-ink-4" aria-hidden />
            {file ? <span className="text-sm font-semibold">{file.name} <span className="font-normal text-ink-4">· {fmtBytes(file.size)}</span></span> : <span className="text-sm">{isPpt ? "장표 파일(.pptx)을 끌어다 놓거나 눌러서 고르세요" : "이미지를 끌어다 놓거나 눌러서 고르세요"}</span>}
            <span className="text-xs text-ink-4">{isPpt ? "40MB 이하" : "JPG · PNG · WEBP · GIF, 20MB 이하"}</span>
            <input ref={inputRef} type="file" aria-label="에셋 파일 올리기" className="sr-only" accept={isPpt ? ".ppt,.pptx" : "image/*"} onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          </div>
          {file && <Button variant="ghost" size="sm" className="self-start" onClick={() => pick(null)}><X aria-hidden />파일 비우기</Button>}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>분류</Label>
              <Select value={category} onValueChange={(v) => { setCategory(v); setFile(null); }}>
                <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(CATEGORY_KO).filter(([id]) => id !== "mockup_sample" || isSuper).map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>공개 범위</Label>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as AssetVis)}>
                <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{(isAdmin ? VIS_IDS.filter((v) => v !== "private") : (["internal"] as AssetVis[])).map((v) => <SelectItem key={v} value={v}>{VIS_KO[v]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {isPpt && (
            <div className="grid gap-1.5">
              <Label htmlFor="r-thumb">썸네일 이미지(선택)</Label>
              <Input className="h-9 text-sm" id="r-thumb" type="file" accept="image/*" onChange={(e) => setThumb(e.target.files?.[0] ?? null)} />
            </div>
          )}
          <div className="grid gap-1.5"><Label htmlFor="r-name">이름</Label><Input className="h-9 text-sm" id="r-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} /></div>
          <div className="grid gap-1.5"><Label htmlFor="r-ko">국문 태그 <span className="font-normal text-ink-4">쉼표 구분 · {splitTags(ko).length}개</span></Label><Textarea id="r-ko" value={ko} onChange={(e) => setKo(e.target.value)} rows={2} className="text-sm" placeholder="검색에 걸릴 낱말. 동의어·용도·형태·색까지" /></div>
          <div className="grid gap-1.5"><Label htmlFor="r-en">영문 태그 <span className="font-normal text-ink-4">{splitTags(en).length}개</span></Label><Textarea id="r-en" value={en} onChange={(e) => setEn(e.target.value)} rows={2} className="text-sm" /></div>
          <div className="flex items-center justify-between rounded-xl border border-line px-4 py-3"><Label htmlFor="r-ai">AI 생성 에셋</Label><Switch id="r-ai" checked={ai} onCheckedChange={setAi} /></div>
        </div>
        <DialogFooter>
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)} disabled={up.isPending}>취소</Button>
          <Button size="sm" onClick={() => up.mutate()} disabled={!file || up.isPending}>{up.isPending ? "올리는 중" : "등록"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 휴지통 — 소프트 삭제된 에셋. 카드를 누르면 상세에서 복원 */
function TrashPane({ onOpen }: { onOpen: (id: string) => void }) {
  const { set, page } = useQueryState();
  const list = useQuery({ queryKey: ["admin", "assets", "trash", page], queryFn: () => fetchAdminAssetTrash({ page }) });
  const items = list.data?.data ?? [];
  const total = list.data?.total ?? 0;
  const [picked, setPicked] = useState<string[]>([]);
  const bulk = useBulk(() => setPicked([]));
  const allOn = items.length > 0 && items.every((x) => picked.includes(x.id));
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <>
      <Copy className="mt-5 text-sm text-ink-4" text="삭제한 에셋은 여기에 남습니다. 골라서 복원하거나 상세를 열어 복원할 수 있습니다." />
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-ground-2 px-4 py-3">
        <Button size="sm" variant="outline" onClick={() => setPicked(allOn ? [] : items.map((x) => x.id))} disabled={items.length === 0}>{allOn ? "이 쪽 선택 해제" : "이 쪽 모두 선택"}</Button>
        <span className="text-sm tabular-nums text-ink-3">{picked.length}개 선택</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => bulk.mutate({ action: "restore", ids: picked })} disabled={picked.length === 0 || bulk.isPending}><RotateCcw aria-hidden />선택 복원</Button>
          <Button size="sm" variant="outline" onClick={() => confirmToast(`휴지통의 ${total.toLocaleString()}개를 모두 복원할까요?`, () => bulk.mutate({ action: "restore", all: true }), { action: "모두 복원" })} disabled={total === 0 || bulk.isPending}>모두 복원{total ? ` ${total.toLocaleString()}` : ""}</Button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
        {list.isLoading && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[160px] rounded-card" />)}
        {items.map((x) => <AssetCard key={x.id} x={x} picked={picked.includes(x.id)} onPick={() => toggle(x.id)} onOpen={() => onOpen(x.id)} trashed />)}
      </div>
      {list.data && items.length === 0 && <p className="py-16 text-center text-ink-4">휴지통이 비어 있습니다.</p>}
      <Pager page={page} total={list.data?.total ?? 0} limit={list.data?.limit ?? 48} onPage={(p) => set({ page: String(p), tab: "trash" })} />
    </>
  );
}

/** 세트 — 이름 편집(표). 커버를 누르면 첫 에셋 상세 */
function SetsPane({ isSuper }: { isSuper: boolean }) {
  const { get, set } = useQueryState();
  const category = get("category");
  const q = get("q");
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin", "sets", category, q], queryFn: () => fetchAdminSets({ category, q }) });
  const [editing, setEditing] = useState<AdminAssetSet | null>(null);
  const [name, setName] = useState("");
  const save = useMutation({
    mutationFn: (s: AdminAssetSet) => postJson<AdminAssetSet>(`/admin/sets/${s.id}`, { name }, "PATCH"),
    onSuccess: () => { toast.success("세트 이름을 바꿨습니다."); setEditing(null); void qc.invalidateQueries({ queryKey: ["admin", "sets"] }); },
    onError: (e) => toastError(e),
  });
  const rows = list.data ?? [];
  const st = useSort(rows, { name: (x) => x.name, cat: (x) => x.category_ko, style: (x) => x.style, count: (x) => x.count });
  return (
    <>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <ChoiceButton size="sm" label="분류" value={category} onChange={(v) => set({ category: v, tab: "sets" })} options={Object.entries(CATEGORY_KO).filter(([id]) => id !== "mockup_sample" || isSuper).map(([id, label]) => ({ id, label }))} />
        <SearchBox value={q} onSearch={(v) => set({ q: v, tab: "sets" })} placeholder="세트 이름 검색" />
        <span className="ml-auto text-sm tabular-nums text-ink-4">{rows.length.toLocaleString()}개</span>
      </div>
      <div className="mt-5 overflow-hidden rounded-xl border border-line">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[72px]">커버</TableHead>
              <SortHead s={st} k="name">이름</SortHead>
              <SortHead s={st} k="cat" className="w-[110px]">분류</SortHead>
              <SortHead s={st} k="style" className="hidden w-[90px] sm:table-cell">스타일</SortHead>
              <SortHead s={st} k="count" className="w-[80px]">에셋</SortHead>
              <TableHead className="w-[96px]">편집</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {st.rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="text-center"><span className="inline-block size-12 overflow-hidden rounded-md bg-ground-3 align-middle">{s.cover_url && <img src={s.cover_url} alt="" loading="lazy" className="size-full object-contain" />}</span></TableCell>
                <TableCell className="text-left">
                  {editing?.id === s.id ? (
                    <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); save.mutate(s); }}>
                      <Input className="h-9 text-sm" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus aria-label="세트 이름" />
                      <Button type="submit" size="sm" disabled={save.isPending}>저장</Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>취소</Button>
                    </form>
                  ) : <span className="block truncate font-semibold">{s.name}</span>}
                </TableCell>
                <TableCell className="text-center">{s.category_ko}</TableCell>
                <TableCell className="hidden text-center sm:table-cell">{s.style ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{s.count.toLocaleString()}</TableCell>
                <TableCell className="text-center"><Button size="sm" variant="outline" onClick={() => { setEditing(s); setName(s.name); }}>이름</Button></TableCell>
              </TableRow>
            ))}
            {list.data && rows.length === 0 && <TableRow><TableCell colSpan={6} className="py-12 text-center text-ink-4">세트가 없습니다.</TableCell></TableRow>}
            {list.isLoading && <TableRow><TableCell colSpan={6} className="py-12 text-center text-ink-4">불러오는 중</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <Copy className="mt-3 text-sm text-ink-4" text="세트는 같은 스타일 묶음입니다. 에셋을 세트에 넣거나 빼는 것은 에셋 상세에서 합니다." />
    </>
  );
}

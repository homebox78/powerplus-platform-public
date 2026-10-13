// 관리자 · 시안 — mock_mockups 전체(점수·판정·게시·폐기·주인) + 행 클릭 Sheet 상세(미리보기 툴바·판정 지적·폐기/복구·갤러리 내리기/올리기/삭제).
// 기획 §9.2 powerMock > 시안·갤러리. 상단 통계 카드·목록 행·AlertDialog 는 shadcn/ui 공식 문법(사용자 지시 2026-10-06).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, ExternalLink, Heart, LayoutTemplate, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AdminTitle, BulkBar, Field, Pager, SearchBox, SelectAllCell, SelectCell, SortHead, useQueryState, useSelection, useSort } from "@/components/admin/admin-ui";
import { bulkMockups, useBulkRun } from "@/lib/admin-bulk2";
import { ChoiceButton } from "@/components/hb/choice-button";
import { toastError } from "@/components/hb/confirm";
import { MockupPreview } from "@/components/hb/mockup-preview";
import { Tag } from "@/components/hb/tag";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { deleteAdminGallery, discardAdminMockup, fetchAdminMockup, fetchAdminMockups, fmtAt, restoreAdminMockup, setAdminGallery, type AdminMockup } from "@/lib/admin";
import type { Route } from "./+types/admin-mockups";

export const meta: Route.MetaFunction = () => [{ title: "시안 — powerPlus 관리자" }];

const STATES: Array<[string, string]> = [["passed", "통과"], ["failed", "미통과"], ["unchecked", "판정 전"], ["published", "게시됨"], ["discarded", "폐기"], ["shared", "갤러리 공개"]];
const QK = ["admin", "mockups"] as const;

export default function AdminMockups() {
  const { get, set, page } = useQueryState();
  const state = get("state");
  const q = get("q");
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useQuery({ queryKey: [...QK, state, q, page], queryFn: () => fetchAdminMockups({ state, q, page }) });
  const items = list.data?.data ?? [];
  const sel = useSelection(items.map((m) => m.id), [state, q, page]);
  const st = useSort(items, { title: (m) => m.title, owner: (m) => m.owner, score: (m) => m.score, state: (m) => (m.discarded ? 0 : m.published ? 3 : m.passed ? 2 : m.passed === false ? 1 : null), at: (m) => m.created_at, gallery: (m) => m.gallery?.status });
  const VERB: Record<string, string> = { discard: "폐기했습니다", restore: "복원했습니다", gallery_hide: "갤러리에서 숨겼습니다", gallery_delete: "갤러리에서 지웠습니다" };
  const bulk = useBulkRun(bulkMockups, [QK], (b) => VERB[b.action] ?? "바꿨습니다", sel.clear);
  const run = (action: "discard" | "restore" | "gallery_hide" | "gallery_delete") => (ids: string[]) => bulk.mutate({ action, ids });
  const counts = (list.data?.meta?.counts ?? {}) as Record<string, number>;

  return (
    <div>
      <AdminTitle title="시안" desc="AI 가 만든 시안의 판정·게시 상태입니다. 행을 누르면 미리보기와 처리 메뉴가 열립니다." />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={LayoutTemplate} label="전체" value={list.data?.total ?? null} />
        <Stat icon={ShieldCheck} label="통과" value={counts.passed ?? null} sub={`미통과 ${counts.failed ?? 0}`} />
        <Stat icon={Eye} label="게시됨" value={counts.published ?? null} />
        <Stat icon={Heart} label="갤러리 공개" value={counts.shared ?? null} sub={`폐기 ${counts.discarded ?? 0}`} />
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <ChoiceButton size="sm" label="상태" value={state} onChange={(v) => set({ state: v })} options={STATES.map(([id, label]) => ({ id, label, count: counts[id] ?? 0 }))} />
        <SearchBox value={q} onSearch={(v) => set({ q: v })} placeholder="제목·레퍼런스·주인 검색" />
        <span className="ml-auto text-sm tabular-nums text-ink-4">{(list.data?.total ?? 0).toLocaleString()}건</span>
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-line">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <SelectAllCell sel={sel} />
              <SortHead s={st} k="title">시안</SortHead>
              <SortHead s={st} k="owner" className="hidden w-[170px] md:table-cell">주인</SortHead>
              <SortHead s={st} k="score" className="w-[64px]">점수</SortHead>
              <SortHead s={st} k="state" className="hidden w-[150px] sm:table-cell">상태</SortHead>
              <SortHead s={st} k="at" className="hidden w-[150px] lg:table-cell">만든 시각</SortHead>
              <SortHead s={st} k="gallery" className="w-[96px]">갤러리</SortHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {st.rows.map((m) => (
              <TableRow key={m.id} role="button" tabIndex={0} onClick={() => setOpenId(m.id)} onKeyDown={(e) => { if (e.key === "Enter") setOpenId(m.id); }} className="cursor-pointer" data-state={openId === m.id ? "selected" : undefined}>
                <SelectCell sel={sel} id={m.id} label={m.title ?? "시안"} />
                <TableCell className="text-left">
                  <span className="block truncate font-semibold">{m.title}</span>
                  <span className="block truncate text-xs text-ink-4">{m.id}{m.ref_id ? ` · ${m.ref_id}` : ""}{m.device ? ` · ${m.device === "mobile" ? "모바일" : "PC"}` : ""} · 판정 {m.checks}회</span>
                </TableCell>
                <TableCell className="hidden text-left md:table-cell">
                  <span className="block truncate">{m.owner || "—"}</span>
                  <span className="block truncate text-xs text-ink-4">{m.owner_email}</span>
                </TableCell>
                <TableCell className="text-center tabular-nums">{m.score ?? "—"}</TableCell>
                <TableCell className="hidden text-center sm:table-cell"><StateTags m={m} /></TableCell>
                <TableCell className="hidden text-center tabular-nums text-ink-3 lg:table-cell">{fmtAt(m.created_at)}</TableCell>
                <TableCell className="text-center">
                  {m.gallery?.status === "shared" ? <Tag tone="ink">공개</Tag> : m.gallery?.status === "hidden" ? <Tag tone="line">내림</Tag> : m.gallery ? <Tag tone="soft">보관</Tag> : <span className="text-sm text-ink-4">—</span>}
                </TableCell>
              </TableRow>
            ))}
            {list.data && items.length === 0 && <TableRow><TableCell colSpan={7} className="py-12 text-center text-ink-4">해당하는 시안이 없습니다.</TableCell></TableRow>}
            {list.isLoading && <TableRow><TableCell colSpan={7} className="py-6"><Skeleton className="h-10 w-full" /></TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <BulkBar sel={sel} actions={[
        { label: "폐기", danger: true, confirm: "고른 시안 {n}개를 폐기할까요? 갤러리에 올라간 것은 숨겨집니다. 나중에 복원할 수 있습니다.", onRun: run("discard"), disabled: bulk.isPending },
        { label: "복원", onRun: run("restore"), disabled: bulk.isPending },
        { label: "갤러리 숨김", onRun: run("gallery_hide"), disabled: bulk.isPending },
        { label: "갤러리에서 삭제", icon: <Trash2 aria-hidden />, danger: true, confirm: "고른 시안 {n}개를 갤러리에서 지울까요? 좋아요·열람 기록이 사라지고 되돌릴 수 없습니다. 시안 자체는 남습니다.", onRun: run("gallery_delete"), disabled: bulk.isPending },
      ]} />
      <Pager page={page} total={list.data?.total ?? 0} limit={list.data?.limit ?? 30} onPage={(p) => set({ page: String(p) })} />

      <Sheet open={!!openId} onOpenChange={(v) => { if (!v) setOpenId(null); }}>
        <SheetContent className="w-full overflow-y-auto bg-ground text-ink sm:max-w-[920px]">
          {openId && <Detail id={openId} onClose={() => setOpenId(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub }: { icon: typeof Eye; label: string; value: number | null; sub?: string }) {
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="flex flex-row items-center justify-between px-4 pb-0">
        <CardTitle className="text-sm font-medium text-ink-3">{label}</CardTitle>
        <Icon className="size-4 text-ink-4" aria-hidden />
      </CardHeader>
      <CardContent className="px-4">
        {value === null ? <Skeleton className="h-7 w-16" /> : <p className="text-2xl font-extrabold tabular-nums tracking-[-0.02em]">{value.toLocaleString()}</p>}
        {sub && <p className="mt-1 text-xs text-ink-4">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function StateTags({ m }: { m: Pick<AdminMockup, "passed" | "published" | "discarded"> }) {
  return (
    <span className="inline-flex flex-wrap justify-center gap-1">
      {m.passed === null ? <Tag tone="line">판정 전</Tag> : <Tag tone={m.passed ? "ok" : "warn"}>{m.passed ? "통과" : "미통과"}</Tag>}
      {m.published && <Tag tone="ink">게시</Tag>}
      {m.discarded && <Tag tone="line">폐기</Tag>}
    </span>
  );
}

function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: [...QK, "detail", id], queryFn: () => fetchAdminMockup(id) });
  const refresh = () => { void qc.invalidateQueries({ queryKey: [...QK] }); };
  const [ask, setAsk] = useState<null | "discard" | "galleryDelete">(null);
  const discard = useMutation({ mutationFn: () => discardAdminMockup(id), onSuccess: () => { toast.success("폐기했습니다. 갤러리 공개도 내렸습니다."); refresh(); }, onError: (e) => toastError(e) });
  const restore = useMutation({ mutationFn: () => restoreAdminMockup(id), onSuccess: () => { toast.success("복구했습니다."); refresh(); }, onError: (e) => toastError(e) });
  const gallery = useMutation({ mutationFn: (v: { gid: number; act: "hide" | "show" }) => setAdminGallery(v.gid, v.act), onSuccess: (_, v) => { toast.success(v.act === "hide" ? "갤러리에서 내렸습니다." : "갤러리에 다시 올렸습니다."); refresh(); }, onError: (e) => toastError(e) });
  const gdel = useMutation({ mutationFn: (gid: number) => deleteAdminGallery(gid), onSuccess: () => { toast.success("갤러리 항목을 지웠습니다. 시안은 남아 있습니다."); refresh(); }, onError: (e) => toastError(e) });
  const m = q.data;
  if (q.isError) return <div className="p-6 text-md text-ink-3">시안을 불러오지 못했습니다.</div>;
  if (!m) return <div className="flex flex-col gap-3 p-6"><Skeleton className="h-7 w-2/3" /><Skeleton className="h-[50vh] w-full" /></div>;
  const busy = discard.isPending || restore.isPending || gallery.isPending || gdel.isPending;
  return (
    <>
      <SheetHeader className="border-b border-line px-6 py-5">
        <SheetTitle className="text-xl font-bold text-ink">{m.title ?? "제목 없음"}</SheetTitle>
        <SheetDescription className="text-ink-4">{m.id}{m.ref_id ? ` · 레퍼런스 ${m.ref_id}` : ""}{m.device ? ` · ${m.device === "mobile" ? "모바일" : "PC"}` : ""} · 판정 {m.checks}회</SheetDescription>
      </SheetHeader>
      <div className="px-6 py-5">
        <MockupPreview src={m.preview_url} fullUrl={m.public_url} title={m.title ?? "시안"} height="52vh" device={m.device === "mobile" ? "phone" : "pc"} lead={<StateTags m={m} />} />

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {m.discarded
            ? <Button size="sm" variant="outline" disabled={busy} onClick={() => restore.mutate()}>폐기 복구</Button>
            : <Button size="sm" variant="outline" disabled={busy} onClick={() => setAsk("discard")}><Trash2 aria-hidden />폐기</Button>}
          {m.gallery && m.gallery.status === "shared" && <Button size="sm" variant="outline" disabled={busy} onClick={() => gallery.mutate({ gid: m.gallery!.id, act: "hide" })}>갤러리 내리기</Button>}
          {m.gallery && m.gallery.status === "hidden" && !m.discarded && <Button size="sm" variant="outline" disabled={busy} onClick={() => gallery.mutate({ gid: m.gallery!.id, act: "show" })}>갤러리 다시 올리기</Button>}
          {m.gallery && <Button size="sm" variant="ghost" disabled={busy} onClick={() => setAsk("galleryDelete")}>갤러리 항목 삭제</Button>}
          {m.public_url && <Button size="sm" variant="ghost" asChild><a href={m.public_url} target="_blank" rel="noreferrer"><ExternalLink aria-hidden />게시 주소</a></Button>}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={onClose}>닫기</Button>
        </div>

        <Separator className="my-5" />
        <dl className="divide-y divide-line">
          <Field label="주인">{m.owner || "—"}{m.owner_email && <span className="ml-2 text-sm text-ink-4">{m.owner_email}</span>}</Field>
          <Field label="점수">{m.score ?? "—"}{m.checked_at && <span className="ml-2 text-sm text-ink-4">마지막 판정 {fmtAt(m.checked_at)}</span>}</Field>
          <Field label="게시">{m.published ? `${fmtAt(m.published_at)} · 만료 ${fmtAt(m.expires_at)}` : "안 함"}</Field>
          <Field label="폐기">{m.discarded ? fmtAt(m.discarded_at) : "—"}</Field>
          <Field label="갤러리">{m.gallery ? `${{ study: "보관", shared: "공개", hidden: "내림" }[m.gallery.status]} · 좋아요 ${m.gallery.likes} · 열람 ${m.gallery.unlocks} · 조회 ${m.gallery.views}` : "—"}</Field>
          <Field label="크기·조회">{(m.bytes / 1024).toFixed(0)} KB · {m.views}회</Field>
          <Field label="만든 시각">{fmtAt(m.created_at)}</Field>
        </dl>

        {m.check && (
          <section className="mt-5">
            <h3 className="text-md font-bold">판정 내용</h3>
            {m.check.summary && <p className="mt-2 text-sm leading-[1.7] text-ink-3">{m.check.summary}</p>}
            {m.check.fixes.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1.5">
                {m.check.fixes.map((f, i) => (
                  <li key={i} className="rounded-lg bg-ground-3 px-3 py-2 text-sm text-ink-2">
                    {typeof f === "string" ? f : String((f as { msg?: string; message?: string; text?: string }).msg ?? (f as { message?: string }).message ?? (f as { text?: string }).text ?? JSON.stringify(f))}
                    {typeof f !== "string" && (f as { at?: string }).at ? <span className="ml-2 text-xs text-ink-4">{String((f as { at?: string }).at)}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      <AlertDialog open={ask !== null} onOpenChange={(v) => { if (!v) setAsk(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ask === "discard" ? "이 시안을 폐기할까요?" : "갤러리 항목을 지울까요?"}</AlertDialogTitle>
            <AlertDialogDescription>{ask === "discard" ? "갤러리 공개가 내려가고 목록에서 폐기로 표시됩니다. 시안 파일은 남아 있어 복구할 수 있습니다." : "좋아요·열람 기록이 함께 지워지며 되돌릴 수 없습니다. 시안 자체는 남습니다."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (ask === "discard") discard.mutate(); else if (m.gallery) gdel.mutate(m.gallery.id); setAsk(null); }}>{ask === "discard" ? "폐기" : "삭제"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

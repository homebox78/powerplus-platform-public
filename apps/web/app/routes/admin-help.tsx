// 관리자 · 도움말 — core_help_docs 목록(카테고리·검색) + Sheet 편집(카테고리 Select·제목·slug·본문 Textarea·발행 Switch) + 새 문서 + 삭제(2단계).
// 공개 /help 는 발행된 문서만 /help/docs 로 받는다. 본문 규칙은 lib/help-content.ts parseHelpBody(빈 줄 = 문단, "1. " 줄 = 단계).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpenText, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AdminTitle, BulkBar, ConfirmDelete, Pager, RowSwitch, SearchBox, SelectAllCell, SelectCell, SortHead, useQueryState, useSelection, useSort } from "@/components/admin/admin-ui";
import { bulkHelpDocs, useBulkRun } from "@/lib/admin-bulk2";
import { ChoiceButton } from "@/components/hb/choice-button";
import { toastError } from "@/components/hb/confirm";
import { Tag } from "@/components/hb/tag";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { createAdminHelpDoc, deleteAdminHelpDoc, fetchAdminHelpDocs, fmtAt, patchAdminHelpDoc, type HelpDoc, type HelpDocInput } from "@/lib/admin";
import { HELP_CATEGORIES, HELP_CAT_KO, parseHelpBody } from "@/lib/help-content";
import type { Route } from "./+types/admin-help";

export const meta: Route.MetaFunction = () => [{ title: "도움말 — powerPlus 관리자" }];

const QK = ["admin", "help"] as const;
const PAGE = 30;

export default function AdminHelp() {
  const { get, set, page } = useQueryState();
  const cat = get("cat"); const q = get("q");
  const [open, setOpen] = useState<HelpDoc | "new" | null>(null);
  const list = useQuery({ queryKey: [...QK, cat, q], queryFn: () => fetchAdminHelpDocs({ cat, q }) });
  const all = list.data?.data ?? [];
  const items = all.slice((page - 1) * PAGE, page * PAGE);
  const sel = useSelection(items.map((d) => d.id), [cat, q, page]);
  const st = useSort(items, { cat: (d) => HELP_CAT_KO[d.category] ?? d.category, title: (d) => d.title, slug: (d) => d.slug, order: (d) => d.order, upd: (d) => d.updated_at, pub: (d) => d.published });
  const VERB: Record<string, string> = { publish: "발행했습니다", unpublish: "발행을 껐습니다", delete: "지웠습니다" };
  const bulk = useBulkRun(bulkHelpDocs, [QK, ["help", "docs"]], (b) => VERB[b.action] ?? "바꿨습니다", sel.clear);
  const run = (action: "publish" | "unpublish" | "delete") => (ids: string[]) => bulk.mutate({ action, ids });
  const counts = (list.data?.meta?.counts ?? {}) as Record<string, number>;
  const published = all.filter((d) => d.published).length;
  return (
    <div>
      <AdminTitle title="도움말" desc="도움말 센터 문서를 고치고 새로 씁니다. 발행을 끄면 센터에서 사라집니다." />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="전체 문서" value={list.data ? all.length : null} />
        <Stat label="발행" value={list.data ? published : null} />
        <Stat label="미발행" value={list.data ? all.length - published : null} />
        <Stat label="카테고리" value={HELP_CATEGORIES.length} />
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <ChoiceButton size="sm" label="카테고리" value={cat} onChange={(v) => set({ cat: v })} options={HELP_CATEGORIES.map((c) => ({ id: c.id, label: c.title, count: counts[c.id] ?? 0 }))} />
        <SearchBox value={q} onSearch={(v) => set({ q: v })} placeholder="제목·본문 검색" />
        <Button size="sm" className="ml-auto" onClick={() => setOpen("new")}><Plus aria-hidden />새 문서</Button>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-line">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <SelectAllCell sel={sel} />
              <SortHead s={st} k="cat" className="w-[130px] max-sm:w-[104px]">카테고리</SortHead>
              <SortHead s={st} k="title">제목</SortHead>
              <SortHead s={st} k="slug" className="hidden w-[180px] md:table-cell">주소(slug)</SortHead>
              <SortHead s={st} k="order" className="hidden w-[64px] sm:table-cell">순서</SortHead>
              <SortHead s={st} k="upd" className="hidden w-[140px] lg:table-cell">수정</SortHead>
              <SortHead s={st} k="pub" className="w-[88px] max-sm:w-[64px]">발행</SortHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {st.rows.map((d) => (
              <TableRow key={d.id} role="button" tabIndex={0} className="cursor-pointer" onClick={() => setOpen(d)} onKeyDown={(e) => { if (e.key === "Enter") setOpen(d); }}>
                <SelectCell sel={sel} id={d.id} label={d.title} />
                <TableCell className="text-center"><Tag tone="line">{HELP_CAT_KO[d.category] ?? d.category}</Tag></TableCell>
                <TableCell className="text-left"><span className="block truncate font-semibold">{d.title}</span><span className="block truncate text-xs text-ink-4">{parseHelpBody(d.body).body[0] ?? ""}</span></TableCell>
                <TableCell className="hidden truncate text-left text-sm text-ink-3 md:table-cell">{d.slug}</TableCell>
                <TableCell className="hidden text-center tabular-nums sm:table-cell">{d.order}</TableCell>
                <TableCell className="hidden text-center tabular-nums text-ink-3 lg:table-cell">{fmtAt(d.updated_at)}</TableCell>
                <TableCell className="text-center">{d.published ? <Tag tone="ok">발행</Tag> : <Tag tone="warn">숨김</Tag>}</TableCell>
              </TableRow>
            ))}
            {list.data && items.length === 0 && <TableRow><TableCell colSpan={7} className="py-12 text-center text-ink-4">해당하는 문서가 없습니다.</TableCell></TableRow>}
            {list.isLoading && <TableRow><TableCell colSpan={7} className="py-6"><Skeleton className="h-10 w-full" /></TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <BulkBar sel={sel} actions={[
        { label: "발행", onRun: run("publish"), disabled: bulk.isPending },
        { label: "발행 끄기", onRun: run("unpublish"), disabled: bulk.isPending },
        { label: "삭제", icon: <Trash2 aria-hidden />, danger: true, confirm: "고른 문서 {n}개를 지울까요? 공개 화면에서 바로 사라집니다.", onRun: run("delete"), disabled: bulk.isPending },
      ]} />
      <Pager page={page} total={all.length} limit={PAGE} onPage={(p) => set({ page: String(p) })} />
      <Sheet open={open !== null} onOpenChange={(v) => { if (!v) setOpen(null); }}>
        <SheetContent className="w-full overflow-y-auto bg-ground text-ink sm:max-w-[640px]">{open !== null && <Editor doc={open === "new" ? null : open} onClose={() => setOpen(null)} />}</SheetContent>
      </Sheet>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <Card className="gap-1 py-4">
      <CardHeader className="flex flex-row items-center justify-between px-4 pb-0"><CardTitle className="text-sm font-medium text-ink-3">{label}</CardTitle><BookOpenText className="size-4 text-ink-4" aria-hidden /></CardHeader>
      <CardContent className="px-4">{value === null ? <Skeleton className="h-7 w-16" /> : <p className="text-2xl font-extrabold tabular-nums tracking-[-0.02em]">{value.toLocaleString()}</p>}</CardContent>
    </Card>
  );
}

function Editor({ doc, onClose }: { doc: HelpDoc | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState<Required<HelpDocInput>>({ category: doc?.category ?? "start", slug: doc?.slug ?? "", title: doc?.title ?? "", body: doc?.body ?? "", order: doc?.order ?? 0, published: doc?.published ?? true });
  const [ask, setAsk] = useState(false);
  const refresh = () => { void qc.invalidateQueries({ queryKey: [...QK] }); void qc.invalidateQueries({ queryKey: ["help", "docs"] }); };
  const save = useMutation({
    mutationFn: () => (doc ? patchAdminHelpDoc(doc.id, f) : createAdminHelpDoc(f)),
    onSuccess: () => { toast.success(doc ? "저장했습니다." : "문서를 만들었습니다."); refresh(); onClose(); },
    onError: (e) => toastError(e),
  });
  const del = useMutation({ mutationFn: () => deleteAdminHelpDoc(doc!.id), onSuccess: () => { toast.success("문서를 지웠습니다."); refresh(); onClose(); }, onError: (e) => toastError(e) });
  const set = <K extends keyof HelpDocInput>(k: K, v: Required<HelpDocInput>[K]) => setF((s) => ({ ...s, [k]: v }));
  const preview = parseHelpBody(f.body);
  const ok = f.title.trim().length >= 2 && f.body.trim().length >= 2 && /^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$/.test(f.slug);
  return (
    <>
      <SheetHeader className="border-b border-line px-6 py-5">
        <SheetTitle className="text-xl font-bold text-ink">{doc ? "문서 편집" : "새 문서"}</SheetTitle>
        <SheetDescription className="text-ink-4">{doc ? `${HELP_CAT_KO[doc.category] ?? doc.category} · 수정 ${fmtAt(doc.updated_at)}` : "빈 줄로 문단을 나누고, 단계는 “1. ” 로 시작하는 줄로 씁니다."}</SheetDescription>
      </SheetHeader>
      <form className="grid gap-4 px-6 py-5" onSubmit={(e) => { e.preventDefault(); if (ok) save.mutate(); }}>
        <div className="grid gap-2">
          <Label htmlFor="h-cat">카테고리</Label>
          <Select value={f.category} onValueChange={(v) => set("category", v)}>
            <SelectTrigger id="h-cat" size="sm" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{HELP_CATEGORIES.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid gap-2"><Label htmlFor="h-title">제목</Label><Input id="h-title" className="h-9 text-sm" value={f.title} onChange={(e) => set("title", e.target.value)} maxLength={200} /></div>
        <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-3">
          <div className="grid gap-2"><Label htmlFor="h-slug">주소(slug)</Label><Input id="h-slug" className="h-9 text-sm" value={f.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} placeholder="영문 소문자·숫자·하이픈" aria-invalid={f.slug !== "" && !/^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$/.test(f.slug)} /></div>
          <div className="grid gap-2"><Label htmlFor="h-order">순서</Label><Input id="h-order" type="number" min={0} max={999} value={f.order} onChange={(e) => set("order", Number(e.target.value) || 0)} className="h-9 text-center text-sm" /></div>
        </div>
        <div className="grid gap-2"><Label htmlFor="h-body">본문</Label><Textarea id="h-body" value={f.body} onChange={(e) => set("body", e.target.value)} rows={12} /></div>
        <div className="rounded-xl border border-line p-4">
          <RowSwitch id="h-pub" label="발행" desc="끄면 도움말 센터에서 안 보입니다." checked={f.published} onChange={(v) => set("published", v)} />
        </div>
        {(preview.body.length > 0 || preview.steps) && (
          <section className="rounded-xl bg-ground-3 p-4">
            <h3 className="text-sm font-bold text-ink-3">미리보기</h3>
            <div className="mt-2 flex flex-col gap-2">{preview.body.map((p, i) => <p key={i} className="text-sm leading-[1.7] text-ink-2">{p}</p>)}</div>
            {preview.steps && <ol className="mt-3 flex flex-col gap-1.5">{preview.steps.map((s, i) => <li key={i} className="flex items-start gap-2 text-sm"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-white">{i + 1}</span><span>{s}</span></li>)}</ol>}
          </section>
        )}
        <div className="flex items-center gap-2">
          {doc && <Button type="button" size="sm" variant="outline" onClick={() => setAsk(true)} disabled={del.isPending}><Trash2 aria-hidden />삭제</Button>}
          <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={onClose}>닫기</Button>
          <Button type="submit" size="sm" disabled={!ok || save.isPending}>{doc ? "저장" : "만들기"}</Button>
        </div>
      </form>
      <ConfirmDelete open={ask} onOpenChange={setAsk} title="이 문서를 지울까요?" desc="도움말 센터에서 바로 사라집니다. 잠시만 감추려면 발행을 끄세요." onConfirm={() => del.mutate()} />
    </>
  );
}

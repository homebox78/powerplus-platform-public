// 관리자 · 변경 이력 — core_changelog 목록(서비스·검색) + Sheet 편집(서비스·갈래·버전·날짜·제목·바뀐 점·발행) + 새 이력 + 삭제(2단계).
// 공개 화면(powerGuide 변경 이력 등)은 발행된 것만 /changelog?module= 로 받는다. 틀은 admin-help.tsx 와 같다.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AdminTitle, BulkBar, ConfirmDelete, Pager, RowSwitch, SearchBox, SelectAllCell, SelectCell, SortHead, useQueryState, useSelection, useSort } from "@/components/admin/admin-ui";
import { bulkChangelog, useBulkRun } from "@/lib/admin-bulk2";
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
import { CHANGELOG_MODULES, createAdminChangelog, deleteAdminChangelog, fetchAdminChangelog, fmtAt, patchAdminChangelog, type ChangelogEntry, type ChangelogModule } from "@/lib/admin";
import type { Route } from "./+types/admin-changelog";

export const meta: Route.MetaFunction = () => [{ title: "변경 이력 — powerPlus 관리자" }];

const QK = ["admin", "changelog"] as const;
const PAGE = 30;
const MOD_KO = Object.fromEntries(CHANGELOG_MODULES.map((m) => [m.id, m.label])) as Record<ChangelogModule, string>;
const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

export default function AdminChangelog() {
  const { get, set, page } = useQueryState();
  const mod = get("module"); const q = get("q");
  const [open, setOpen] = useState<ChangelogEntry | "new" | null>(null);
  const list = useQuery({ queryKey: [...QK, mod, q], queryFn: () => fetchAdminChangelog({ module: mod, q }) });
  const all = list.data?.data ?? [];
  const items = all.slice((page - 1) * PAGE, page * PAGE);
  const sel = useSelection(items.map((d) => d.id), [mod, q, page]);
  const st = useSort(items, { mod: (d) => MOD_KO[d.module] ?? d.module, track: (d) => d.track, ver: (d) => d.version, title: (d) => d.title, date: (d) => d.date, pub: (d) => d.published });
  const VERB: Record<string, string> = { publish: "발행했습니다", unpublish: "발행을 껐습니다", delete: "지웠습니다" };
  const bulk = useBulkRun(bulkChangelog, [QK, ["changelog"]], (b) => VERB[b.action] ?? "바꿨습니다", sel.clear);
  const run = (action: "publish" | "unpublish" | "delete") => (ids: string[]) => bulk.mutate({ action, ids });
  // 공개 변경 이력 화면에서 관리자가 누른 "수정"·"새 이력"(?edit=id · ?new=1) 을 바로 연다
  const editId = get("edit"); const isNew = get("new");
  const fromUrl: ChangelogEntry | "new" | null = isNew ? "new" : editId ? all.find((d) => d.id === editId) ?? null : null;
  const shown = open ?? fromUrl;
  const close = () => { setOpen(null); if (editId || isNew) set({ edit: "", new: "" }); };
  const counts = (list.data?.meta?.counts ?? {}) as Record<string, number>;
  const published = all.filter((d) => d.published).length;
  const latest = all[0]?.date ?? null;
  return (
    <div>
      <AdminTitle title="변경 이력" desc="서비스별 업데이트 노트를 쓰고 고칩니다. 발행한 이력은 각 서비스의 변경 이력 화면에 바로 보입니다." />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="전체 이력" value={list.data ? all.length : null} />
        <Stat label="발행" value={list.data ? published : null} />
        <Stat label="숨김" value={list.data ? all.length - published : null} />
        <Stat label="마지막 업데이트" text={list.data ? (latest ? latest.replace(/-/g, ".") : "—") : null} />
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <ChoiceButton size="sm" label="서비스" value={mod} onChange={(v) => set({ module: v })} options={CHANGELOG_MODULES.map((m) => ({ id: m.id, label: m.label, count: counts[m.id] ?? 0 }))} />
        <SearchBox value={q} onSearch={(v) => set({ q: v })} placeholder="버전·제목·내용 검색" />
        <Button size="sm" className="ml-auto" onClick={() => setOpen("new")}><Plus aria-hidden />새 이력</Button>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-line">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <SelectAllCell sel={sel} />
              <SortHead s={st} k="mod" className="w-[130px] max-sm:hidden">서비스</SortHead>
              <SortHead s={st} k="track" className="hidden w-[120px] md:table-cell">갈래</SortHead>
              <SortHead s={st} k="ver" className="w-[88px] max-sm:w-[64px]">버전</SortHead>
              <SortHead s={st} k="title">제목</SortHead>
              <SortHead s={st} k="date" className="hidden w-[120px] sm:table-cell">날짜</SortHead>
              <SortHead s={st} k="pub" className="w-[88px] max-sm:w-[64px]">발행</SortHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {st.rows.map((d) => (
              <TableRow key={d.id} role="button" tabIndex={0} className="cursor-pointer" onClick={() => setOpen(d)} onKeyDown={(e) => { if (e.key === "Enter") setOpen(d); }}>
                <SelectCell sel={sel} id={d.id} label={d.title} />
                <TableCell className="text-center max-sm:hidden"><Tag tone="line">{MOD_KO[d.module] ?? d.module}</Tag></TableCell>
                <TableCell className="hidden truncate text-left text-sm text-ink-3 md:table-cell">{d.track || "—"}</TableCell>
                <TableCell className="text-center font-semibold tabular-nums">v{d.version}</TableCell>
                <TableCell className="text-left"><span className="block truncate font-semibold">{d.title}</span><span className="block truncate text-xs text-ink-4">{d.notes[0] ?? ""}</span></TableCell>
                <TableCell className="hidden text-center tabular-nums text-ink-3 sm:table-cell">{d.date.replace(/-/g, ".")}</TableCell>
                <TableCell className="text-center">{d.published ? <Tag tone="ok">발행</Tag> : <Tag tone="warn">숨김</Tag>}</TableCell>
              </TableRow>
            ))}
            {list.data && items.length === 0 && <TableRow><TableCell colSpan={7} className="py-12 text-center text-ink-4">해당하는 이력이 없습니다.</TableCell></TableRow>}
            {list.isLoading && <TableRow><TableCell colSpan={7} className="py-6"><Skeleton className="h-10 w-full" /></TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <BulkBar sel={sel} actions={[
        { label: "발행", onRun: run("publish"), disabled: bulk.isPending },
        { label: "발행 끄기", onRun: run("unpublish"), disabled: bulk.isPending },
        { label: "삭제", icon: <Trash2 aria-hidden />, danger: true, confirm: "고른 이력 {n}개를 지울까요? 공개 화면에서 바로 사라집니다.", onRun: run("delete"), disabled: bulk.isPending },
      ]} />
      <Pager page={page} total={all.length} limit={PAGE} onPage={(p) => set({ page: String(p) })} />
      <Sheet open={shown !== null} onOpenChange={(v) => { if (!v) close(); }}>
        <SheetContent className="w-full overflow-y-auto bg-ground text-ink sm:max-w-[640px]">{shown !== null && <Editor key={shown === "new" ? "new" : shown.id} entry={shown === "new" ? null : shown} defModule={(mod as ChangelogModule) || "guide"} onClose={close} />}</SheetContent>
      </Sheet>
    </div>
  );
}

function Stat({ label, value, text }: { label: string; value?: number | null; text?: string | null }) {
  const v = text !== undefined ? text : value === null || value === undefined ? null : value.toLocaleString();
  return (
    <Card className="gap-1 py-4">
      <CardHeader className="flex flex-row items-center justify-between px-4 pb-0"><CardTitle className="text-sm font-medium text-ink-3">{label}</CardTitle><History className="size-4 text-ink-4" aria-hidden /></CardHeader>
      <CardContent className="px-4">{v === null ? <Skeleton className="h-7 w-16" /> : <p className="text-2xl font-extrabold tabular-nums tracking-[-0.02em]">{v}</p>}</CardContent>
    </Card>
  );
}

function Editor({ entry, defModule, onClose }: { entry: ChangelogEntry | null; defModule: ChangelogModule; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    module: entry?.module ?? defModule, track: entry?.track ?? "", version: entry?.version ?? "", date: entry?.date ?? today(),
    title: entry?.title ?? "", notes: (entry?.notes ?? []).join("\n"), published: entry?.published ?? true,
  });
  const [ask, setAsk] = useState(false);
  const refresh = () => { void qc.invalidateQueries({ queryKey: [...QK] }); void qc.invalidateQueries({ queryKey: ["changelog"] }); };
  const body = { ...f, notes: f.notes.split("\n").map((s) => s.trim()).filter(Boolean) };
  const save = useMutation({
    mutationFn: () => (entry ? patchAdminChangelog(entry.id, body) : createAdminChangelog(body)),
    onSuccess: () => { toast.success(entry ? "저장했습니다." : "이력을 만들었습니다."); refresh(); onClose(); },
    onError: (e) => toastError(e),
  });
  const del = useMutation({ mutationFn: () => deleteAdminChangelog(entry!.id), onSuccess: () => { toast.success("이력을 지웠습니다."); refresh(); onClose(); }, onError: (e) => toastError(e) });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const ok = f.title.trim().length >= 2 && /^[0-9A-Za-z][0-9A-Za-z.-]{0,19}$/.test(f.version) && /^\d{4}-\d{2}-\d{2}$/.test(f.date) && body.notes.length > 0;
  return (
    <>
      <SheetHeader className="border-b border-line px-6 py-5">
        <SheetTitle className="text-xl font-bold text-ink">{entry ? "이력 편집" : "새 이력"}</SheetTitle>
        <SheetDescription className="text-ink-4">{entry ? `${MOD_KO[entry.module]} · 수정 ${fmtAt(entry.updated_at)}` : "바뀐 점은 한 줄에 하나씩 씁니다."}</SheetDescription>
      </SheetHeader>
      <form className="grid gap-4 px-6 py-5" onSubmit={(e) => { e.preventDefault(); if (ok) save.mutate(); }}>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor="c-mod">서비스</Label>
            <Select value={f.module} onValueChange={(v) => set("module", v as ChangelogModule)}>
              <SelectTrigger id="c-mod" size="sm" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{CHANGELOG_MODULES.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-2"><Label htmlFor="c-track">갈래(선택)</Label><Input id="c-track" className="h-9 text-sm" value={f.track} onChange={(e) => set("track", e.target.value)} maxLength={40} placeholder="예: 부품 키트" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2"><Label htmlFor="c-ver">버전</Label><Input id="c-ver" className="h-9 text-sm" value={f.version} onChange={(e) => set("version", e.target.value)} placeholder="1.2.0" /></div>
          <div className="grid gap-2"><Label htmlFor="c-date">날짜</Label><Input id="c-date" type="date" className="h-9 text-sm" value={f.date} onChange={(e) => set("date", e.target.value)} /></div>
        </div>
        <div className="grid gap-2"><Label htmlFor="c-title">제목</Label><Input id="c-title" className="h-9 text-sm" value={f.title} onChange={(e) => set("title", e.target.value)} maxLength={200} /></div>
        <div className="grid gap-2"><Label htmlFor="c-notes">바뀐 점(한 줄에 하나)</Label><Textarea id="c-notes" value={f.notes} onChange={(e) => set("notes", e.target.value)} rows={8} /></div>
        <div className="rounded-xl border border-line p-4">
          <RowSwitch id="c-pub" label="발행" desc="끄면 공개 변경 이력에서 안 보입니다." checked={f.published} onChange={(v) => set("published", v)} />
        </div>
        <div className="flex items-center gap-2">
          {entry && <Button type="button" size="sm" variant="outline" onClick={() => setAsk(true)} disabled={del.isPending}><Trash2 aria-hidden />삭제</Button>}
          <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={onClose}>닫기</Button>
          <Button type="submit" size="sm" disabled={!ok || save.isPending}>{entry ? "저장" : "만들기"}</Button>
        </div>
      </form>
      <ConfirmDelete open={ask} onOpenChange={setAsk} title="이 이력을 지울까요?" desc="공개 변경 이력에서 바로 사라집니다. 잠시만 감추려면 발행을 끄세요." onConfirm={() => del.mutate()} />
    </>
  );
}

// 관리자 · 약관·정책 — 문서(이용약관·개인정보처리방침·저작권·이메일 무단수집 거부·수집 로봇)별 판(버전) 목록과 편집.
// 고칠 때는 지난 판을 덮지 않고 새 판을 만든다(사용자 2026-10-07 "버전별로 관리, 셀렉터로 골라 보게"). 공개 화면은 /legal/:doc 셀렉터.
// 첫 판 1.0 은 화면 코드(docs-content.ts)에 있어 읽기만 된다 — "이 판으로 새 버전"으로 복사해 고친다. 틀은 admin-changelog.tsx 와 같다.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MBr } from "@/components/hb/copy";
import { ExternalLink, FileText, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { AdminTitle, ConfirmDelete, RowSwitch, SortHead, useQueryState, useSort } from "@/components/admin/admin-ui";
import { ChoiceButton } from "@/components/hb/choice-button";
import { toastError } from "@/components/hb/confirm";
import { Tag } from "@/components/hb/tag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  blocksToText, createPolicy, deletePolicy, fetchAdminPolicies, fmtDate, mergeVersions, nextVersion, patchPolicy, POLICY_DOCS, textToBlocks,
  type PolicyDocId, type PolicyVersion, type ShownVersion,
} from "@/lib/policy";
import type { Route } from "./+types/admin-policies";

export const meta: Route.MetaFunction = () => [{ title: "약관·정책 — powerPlus 관리자" }];

const QK = ["admin", "policies"] as const;
const today = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const STATUS: Record<ShownVersion["status"], { label: string; tone: "ok" | "line" | "warn" | "soft" }> = {
  current: { label: "현재", tone: "ok" }, past: { label: "지난 판", tone: "line" }, upcoming: { label: "시행 예정", tone: "warn" },
};
/** 편집 창: 기존 판 고치기(edit) 또는 어떤 판을 바탕으로 새 판(new). */
type Open = { mode: "edit"; v: PolicyVersion } | { mode: "new"; from: PolicyVersion } | null;

export default function AdminPolicies() {
  const { get, set } = useQueryState();
  const doc = (POLICY_DOCS.find((d) => d.id === get("doc"))?.id ?? "terms") as PolicyDocId;
  const [open, setOpen] = useState<Open>(null);
  const list = useQuery({ queryKey: [...QK], queryFn: () => fetchAdminPolicies() });
  const rows = (list.data?.data ?? []).filter((v) => v.doc === doc);
  // 숨긴 판도 관리 목록엔 보이되, 현재 판 판정은 발행된 것만으로
  const shown = mergeVersions(doc, rows.filter((v) => v.published), today());
  const hidden = rows.filter((v) => !v.published).map((v) => ({ ...v, status: "past" as const }));
  const all = [...shown, ...hidden].sort((a, b) => (a.effective_on < b.effective_on ? 1 : a.effective_on > b.effective_on ? -1 : 0));
  const counts = (list.data?.meta?.counts ?? {}) as Record<string, number>;
  const latest = shown[0];
  const st = useSort(all, { ver: (v) => v.version, eff: (v) => v.effective_on, summary: (v) => v.summary, status: (v) => STATUS[v.status].label, pub: (v) => v.published });
  return (
    <div>
      <AdminTitle title="약관·정책" desc="문서를 고칠 때는 새 판을 만듭니다. 지난 판은 그대로 남아 공개 화면에서 버전을 골라 볼 수 있습니다." />
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <ChoiceButton size="sm" showAll={false} label="문서" value={doc} onChange={(v) => set({ doc: v })} options={POLICY_DOCS.map((d) => ({ id: d.id, label: d.label, count: (counts[d.id] ?? 0) + 1 }))} />
        <Button asChild size="sm" variant="outline"><Link to={`/legal/${doc}`} target="_blank" rel="noreferrer"><ExternalLink aria-hidden />공개 화면</Link></Button>
        <Button size="sm" className="ml-auto" disabled={!latest} onClick={() => latest && setOpen({ mode: "new", from: latest })}><Plus aria-hidden />새 버전</Button>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-line">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <SortHead s={st} k="ver" className="w-[90px] max-sm:w-[56px]">버전</SortHead>
              <SortHead s={st} k="eff" className="w-[120px] max-sm:w-[92px]">시행일</SortHead>
              <SortHead s={st} k="summary" className="max-sm:hidden">바뀐 점</SortHead>
              <SortHead s={st} k="status" className="w-[100px] max-sm:w-[84px]">상태</SortHead>
              <SortHead s={st} k="pub" className="hidden w-[90px] sm:table-cell">발행</SortHead>
              <TableHead className="w-[150px] max-sm:w-auto">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {st.rows.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="text-center font-semibold tabular-nums">{v.version}</TableCell>
                <TableCell className="whitespace-nowrap text-center tabular-nums text-ink-3">{fmtDate(v.effective_on)}</TableCell>
                <TableCell className="truncate text-left text-sm max-sm:hidden">{v.id === "base" ? <span className="text-ink-4">첫 판(화면 코드)</span> : v.summary || <span className="text-ink-4">—</span>}</TableCell>
                <TableCell className="text-center"><Tag tone={STATUS[v.status].tone}>{STATUS[v.status].label}</Tag></TableCell>
                <TableCell className="hidden text-center sm:table-cell">{v.published ? <Tag tone="ok">발행</Tag> : <Tag tone="warn">숨김</Tag>}</TableCell>
                <TableCell className="text-center">
                  <div className="flex justify-center gap-1">
                    {v.id !== "base" && <Button size="sm" variant="ghost" onClick={() => setOpen({ mode: "edit", v })}>편집</Button>}
                    <Button size="sm" variant="ghost" onClick={() => setOpen({ mode: "new", from: v })}>복사</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {list.isLoading && <TableRow><TableCell colSpan={6} className="py-6"><Skeleton className="h-10 w-full" /></TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <p className="mt-3 text-sm text-ink-4">"복사"는 그 판 내용으로 새 판을 엽니다. 현재 판은 시행일이 지난 발행 판 중 가장 최근 것입니다.</p>
      <Sheet open={open !== null} onOpenChange={(o) => { if (!o) setOpen(null); }}>
        <SheetContent className="w-full overflow-y-auto bg-ground text-ink sm:max-w-[860px]">
          {open && <Editor key={open.mode === "edit" ? open.v.id : `new-${open.from.id}`} open={open} versions={all} onClose={() => setOpen(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Editor({ open, versions, onClose }: { open: NonNullable<Open>; versions: PolicyVersion[]; onClose: () => void }) {
  const qc = useQueryClient();
  const src = open.mode === "edit" ? open.v : open.from;
  const label = POLICY_DOCS.find((d) => d.id === src.doc)!.label;
  const [f, setF] = useState({
    version: open.mode === "edit" ? src.version : nextVersion(versions),
    effective_on: open.mode === "edit" ? src.effective_on : today(),
    summary: open.mode === "edit" ? src.summary : "",
    title: src.spec.title, lead: src.spec.lead ?? "", draft: src.spec.draft ?? "",
    body: blocksToText(src.spec.blocks), published: open.mode === "edit" ? src.published : true,
  });
  const [ask, setAsk] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const blocks = textToBlocks(f.body);
  const refresh = () => { void qc.invalidateQueries({ queryKey: [...QK] }); void qc.invalidateQueries({ queryKey: ["policy", src.doc] }); };
  const input = {
    doc: src.doc, version: f.version.trim(), effective_on: f.effective_on, summary: f.summary.trim(), published: f.published,
    spec: { title: f.title.trim(), ...(f.lead.trim() ? { lead: f.lead.trim() } : {}), ...(f.draft.trim() ? { draft: f.draft.trim() } : {}), blocks },
  };
  const save = useMutation({
    mutationFn: () => (open.mode === "edit" ? patchPolicy(src.id, input) : createPolicy(input)),
    onSuccess: () => { toast.success(open.mode === "edit" ? "저장했습니다." : `버전 ${input.version} 을 만들었습니다.`); refresh(); onClose(); },
    onError: (e) => toastError(e),
  });
  const del = useMutation({ mutationFn: () => deletePolicy(src.id), onSuccess: () => { toast.success("판을 지웠습니다."); refresh(); onClose(); }, onError: (e) => toastError(e) });
  const inForce = open.mode === "edit" && src.effective_on <= today() && src.published;
  const ok = f.title.trim().length >= 2 && /^[0-9][0-9.]{0,19}$/.test(f.version.trim()) && /^\d{4}-\d{2}-\d{2}$/.test(f.effective_on) && blocks.length > 0
    && (open.mode === "edit" || f.summary.trim().length > 0);
  return (
    <>
      <SheetHeader className="border-b border-line px-6 py-5">
        <SheetTitle className="text-xl font-bold text-ink">{open.mode === "edit" ? `${label} 버전 ${src.version} 편집` : `${label} 새 버전`}</SheetTitle>
        <SheetDescription className="text-ink-4">{open.mode === "edit" ? "이 판 내용을 고칩니다." : `버전 ${src.version} 내용을 바탕으로 새 판을 만듭니다. 지난 판은 그대로 남습니다.`}</SheetDescription>
      </SheetHeader>
      <form className="grid gap-4 px-6 py-5" onSubmit={(e) => { e.preventDefault(); if (ok) save.mutate(); }}>
        {inForce && <p className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">이미 시행 중인 판입니다.<MBr />오타 말고 내용을 바꾸려면 새 버전을 만드세요.</p>}
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2"><Label htmlFor="p-ver">버전</Label><Input id="p-ver" className="h-9 text-sm" value={f.version} onChange={(e) => set("version", e.target.value)} placeholder="1.1" /></div>
          <div className="grid gap-2"><Label htmlFor="p-date">시행일</Label><Input id="p-date" type="date" className="h-9 text-sm" value={f.effective_on} onChange={(e) => set("effective_on", e.target.value)} /></div>
        </div>
        <div className="grid gap-2"><Label htmlFor="p-sum">바뀐 점{open.mode === "new" ? "" : "(선택)"}</Label><Input id="p-sum" className="h-9 text-sm" value={f.summary} onChange={(e) => set("summary", e.target.value)} maxLength={500} placeholder="예: 제12조 국외 이전 업체 추가" /></div>
        <div className="grid gap-2"><Label htmlFor="p-title">문서 제목</Label><Input id="p-title" className="h-9 text-sm" value={f.title} onChange={(e) => set("title", e.target.value)} maxLength={100} /></div>
        <div className="grid gap-2"><Label htmlFor="p-lead">머리글(선택)</Label><Textarea id="p-lead" value={f.lead} onChange={(e) => set("lead", e.target.value)} rows={2} /></div>
        <div className="grid gap-2"><Label htmlFor="p-draft">초안 안내(선택 — 비우면 안 보임)</Label><Input id="p-draft" className="h-9 text-sm" value={f.draft} onChange={(e) => set("draft", e.target.value)} maxLength={500} /></div>
        <div className="grid gap-2">
          <div className="flex items-center justify-between"><Label htmlFor="p-body">본문</Label><span className="text-xs text-ink-4">항목 {blocks.length}개</span></div>
          <Textarea id="p-body" value={f.body} onChange={(e) => set("body", e.target.value)} rows={22} className="text-sm leading-[1.6]" />
          <p className="text-xs leading-[1.6] text-ink-4">"## 제목" 줄이 항목을 엽니다. 한 줄이 한 문단, "- " 로 시작하면 목록, "|" 로 시작하면 표(첫 줄이 머리)입니다.</p>
        </div>
        <div className="rounded-xl border border-line p-4">
          <RowSwitch id="p-pub" label="발행" desc="끄면 공개 화면의 버전 목록에서 빠집니다." checked={f.published} onChange={(v) => set("published", v)} />
        </div>
        <div className="flex items-center gap-2">
          {open.mode === "edit" && <Button type="button" size="sm" variant="outline" onClick={() => setAsk(true)} disabled={del.isPending}><Trash2 aria-hidden />삭제</Button>}
          <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={onClose}>닫기</Button>
          <Button type="submit" size="sm" disabled={!ok || save.isPending}><FileText aria-hidden />{open.mode === "edit" ? "저장" : "새 버전 만들기"}</Button>
        </div>
      </form>
      <ConfirmDelete open={ask} onOpenChange={setAsk} title="이 판을 지울까요?" desc="공개 화면의 버전 목록에서 사라집니다. 잠시 감추려면 발행을 끄세요." onConfirm={() => del.mutate()} />
    </>
  );
}

// 관리자 · powerGuide 내용 편집(2026-10-14 사용자 "관리자 모드 가이드 메뉴에서 /guide 를 모두 관리 가능해야").
// 원본은 코드(키트 빌드·KRDS 추출·체크리스트 판정)이고 여기서는 그 위 덮어쓰기만 고친다 — 원본과 다른 칸만 저장, 비우면 원본으로.
// 저장 = PUT /admin/guide/overrides/{section}(영역 통째). 웹 /guide 와 REST·MCP(Pp\Guide\Data)가 같은 값을 합친다.
// 틀은 admin-changelog.tsx 의 목록 + Sheet 편집과 같다.
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SearchBox, useQueryState } from "@/components/admin/admin-ui";
import { ChoiceButton } from "@/components/hb/choice-button";
import { toastError } from "@/components/hb/confirm";
import { Tag } from "@/components/hb/tag";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { MODULES } from "@/lib/modules";
import { KRDS_COMPONENTS } from "@/modules/guide/data/krds";
import { KRDS_PATTERNS } from "@/modules/guide/data/krds-patterns";
import report from "@/modules/guide/data/krds-report.json";
import tokens from "@/modules/guide/data/tokens.json";
import { DOWNLOADS } from "@/modules/guide/downloads";
import { saveGuideOverride, useGuideOverrides, useInvalidateGuide, type GuideOverrides, type GuideSection } from "@/modules/guide/overrides";
import { GUIDE_STEPS } from "@/modules/guide/screens";

// ── 공용: 칸 정의 → 편집 패널 ─────────────────────────
type FieldType = "text" | "textarea" | "lines" | "switch" | "number" | "select";
type Field = { key: string; label: string; type: FieldType; original?: string | string[] | number | boolean; options?: { id: string; label: string }[]; hint?: string; max?: number };
type Val = string | boolean;

const asText = (v: Field["original"]): string => (Array.isArray(v) ? v.join("\n") : v === undefined || v === null || typeof v === "boolean" ? "" : String(v));
const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

/** 패널 값 → 덮어쓰기(원본과 같거나 빈 칸은 뺀다) */
function diffOf(fields: Field[], vals: Record<string, Val>): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const f of fields) {
    const v = vals[f.key];
    if (f.type === "switch") { if (v === true) o[f.key] = true; continue; }
    const s = typeof v === "string" ? v.trim() : "";
    if (s === "" || s === asText(f.original).trim()) continue;
    o[f.key] = f.type === "lines" ? lines(s) : f.type === "number" ? Number(s) : s;
  }
  return o;
}

function ItemSheet({ open, title, desc, fields, current, onClose, onSave, saving }: {
  open: boolean; title: string; desc: string; fields: Field[]; current: Record<string, unknown>;
  onClose: () => void; onSave: (diff: Record<string, unknown>) => void; saving: boolean;
}) {
  const init = () => Object.fromEntries(fields.map((f) => {
    const c = current[f.key];
    if (f.type === "switch") return [f.key, c === true];
    return [f.key, c !== undefined ? asText(c as Field["original"]) : asText(f.original)];
  })) as Record<string, Val>;
  const [vals, setVals] = useState<Record<string, Val>>(init);
  const set = (k: string, v: Val) => setVals((p) => ({ ...p, [k]: v }));
  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-full overflow-y-auto bg-ground text-ink sm:max-w-[680px]">
        <SheetHeader className="border-b border-line px-6 py-5">
          <SheetTitle className="text-xl font-bold text-ink">{title}</SheetTitle>
          <SheetDescription className="text-ink-4">{desc}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 px-6 py-5">
          {fields.map((f) => {
            const id = `ge-${f.key}`;
            const v = vals[f.key];
            const changed = f.type !== "switch" && typeof v === "string" && v.trim() !== "" && v.trim() !== asText(f.original).trim();
            return (
              <div key={f.key} className="grid gap-2">
                {f.type === "switch" ? (
                  <div className="flex items-center justify-between gap-4"><Label htmlFor={id} className="text-md">{f.label}</Label><Switch id={id} aria-label={f.label} checked={v === true} onCheckedChange={(x) => set(f.key, x)} /></div>
                ) : (
                  <>
                    <div className="flex items-center gap-2"><Label htmlFor={id}>{f.label}</Label>{changed && <Tag tone="ok">고침</Tag>}{changed && <button type="button" className="ml-auto text-xs font-semibold text-ink-4 underline underline-offset-2" onClick={() => set(f.key, asText(f.original))}>원본으로</button>}</div>
                    {f.type === "textarea" || f.type === "lines" ? (
                      <Textarea id={id} value={String(v ?? "")} onChange={(e) => set(f.key, e.target.value)} rows={f.type === "lines" ? 6 : 4} maxLength={f.max} />
                    ) : f.type === "select" ? (
                      <Select value={String(v || asText(f.original))} onValueChange={(x) => set(f.key, x)}>
                        <SelectTrigger id={id} className="h-9 w-[220px] text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>{(f.options ?? []).map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <Input id={id} className="h-9 text-sm" type={f.type === "number" ? "number" : "text"} value={String(v ?? "")} onChange={(e) => set(f.key, e.target.value)} maxLength={f.max} />
                    )}
                    {f.hint && <p className="text-xs text-ink-4">{f.hint}</p>}
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div className="sticky bottom-0 flex items-center gap-2 border-t border-line bg-ground px-6 py-4">
          <Button variant="outline" onClick={() => setVals(Object.fromEntries(fields.map((f) => [f.key, f.type === "switch" ? false : asText(f.original)])) as Record<string, Val>)}>모두 원본으로</Button>
          <span className="ml-auto" />
          <Button variant="outline" onClick={onClose}>닫기</Button>
          <Button disabled={saving} onClick={() => onSave(diffOf(fields, vals))}>{saving ? "저장 중" : "저장"}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** 영역 하나 저장 — 열쇠 하나를 고치거나(diff 비면 삭제) 영역 통째 */
function useSaveSection<S extends GuideSection>(section: S) {
  const ov = useGuideOverrides();
  const refresh = useInvalidateGuide();
  const m = useMutation({
    mutationFn: (data: GuideOverrides[S]) => saveGuideOverride(section, data),
    onSuccess: () => { toast.success("저장했습니다. /guide 와 MCP 에 바로 반영됩니다."); refresh(); },
    onError: (e) => toastError(e),
  });
  const saveKey = (key: string, diff: Record<string, unknown>) => {
    const cur = { ...(ov[section] as Record<string, unknown>) };
    if (Object.keys(diff).length) cur[key] = diff; else delete cur[key];
    return m.mutateAsync(cur as GuideOverrides[S]);
  };
  return { ov: ov[section] as Record<string, Record<string, unknown>>, saveKey, save: m.mutateAsync, saving: m.isPending };
}

const stateTag = (o: Record<string, unknown> | undefined) => !o || !Object.keys(o).length ? <Tag tone="soft">원본</Tag> : o.hidden ? <Tag tone="warn">숨김</Tag> : <Tag tone="ok">고침</Tag>;

function ListCard({ title, desc, filters, children, count }: { title: string; desc: string; filters?: React.ReactNode; children: React.ReactNode; count: number }) {
  return (
    <Card className="mt-6">
      <CardHeader><CardTitle>{title}</CardTitle><CardDescription>{desc}</CardDescription></CardHeader>
      <CardContent className="px-0">
        {filters && <div className="flex flex-wrap items-center gap-2 px-6 pb-4">{filters}<span className="ml-auto text-sm text-ink-4">{count}개</span></div>}
        {children}
      </CardContent>
    </Card>
  );
}

// ── 소개·메뉴 ─────────────────────────────────────────
const GUIDE_MOD = MODULES.find((m) => m.id === "guide")!;
const INTRO_KO = { tokens: "토큰 화면 첫 안내문", components: "부품 화면 첫 안내문(원본 없음)", krds: "KRDS 대응표 첫 안내문", a11y: "접근성 화면 첫 안내문", changelog: "변경 이력 첫 안내문(원본 없음)" } as const;
export function GuideCopyEditor() {
  const ov = useGuideOverrides();
  const refresh = useInvalidateGuide();
  const c = ov.copy;
  const [open, setOpen] = useState<null | "module" | `menu:${string}` | `step:${number}` | `intro:${keyof typeof INTRO_KO}`>(null);
  const save = useMutation({ mutationFn: (d: GuideOverrides["copy"]) => saveGuideOverride("copy", d), onSuccess: () => { toast.success("저장했습니다. /guide 에 바로 반영됩니다."); refresh(); setOpen(null); }, onError: (e) => toastError(e) });
  const rows: { id: NonNullable<typeof open>; what: string; now: string; changed: boolean }[] = [
    { id: "module", what: "모듈 부제·소개·무료 안내", now: c.module?.desc || GUIDE_MOD.desc, changed: !!c.module && Object.keys(c.module).length > 0 },
    ...GUIDE_MOD.menu.map((i) => ({ id: `menu:${i.slug || "_"}` as const, what: `메뉴 · ${i.label}`, now: c.menu?.[i.slug || "_"]?.desc || i.desc, changed: !!c.menu?.[i.slug || "_"] })),
    ...GUIDE_STEPS.map(([t, d], i) => ({ id: `step:${i}` as const, what: `적용 순서 ${i + 1}`, now: `${c.steps?.[i]?.title || t} — ${c.steps?.[i]?.desc || d}`, changed: !!(c.steps?.[i]?.title || c.steps?.[i]?.desc) })),
    ...(Object.keys(INTRO_KO) as (keyof typeof INTRO_KO)[]).map((k) => ({ id: `intro:${k}` as const, what: INTRO_KO[k], now: c.intro?.[k] || "(원본 문구)", changed: !!c.intro?.[k] })),
  ];
  let fields: Field[] = []; let title = ""; let current: Record<string, unknown> = {};
  if (open === "module") { title = "모듈 소개"; fields = [{ key: "sub", label: "부제", type: "text", original: GUIDE_MOD.sub, max: 80 }, { key: "desc", label: "소개(배너 글)", type: "textarea", original: GUIDE_MOD.desc, max: 300 }, { key: "free", label: "요금 안내", type: "text", original: GUIDE_MOD.free, max: 60 }]; current = c.module ?? {}; }
  else if (open?.startsWith("menu:")) { const slug = open.slice(5); const i = GUIDE_MOD.menu.find((x) => (x.slug || "_") === slug)!; title = `메뉴 · ${i.label}`; fields = [{ key: "label", label: "메뉴 이름", type: "text", original: i.label, max: 30 }, { key: "desc", label: "설명(카드·화면 머리)", type: "textarea", original: i.desc, max: 160 }]; current = c.menu?.[slug] ?? {}; }
  else if (open?.startsWith("step:")) { const n = Number(open.slice(5)); const s = GUIDE_STEPS[n]!; title = `적용 순서 ${n + 1}`; fields = [{ key: "title", label: "제목", type: "text", original: s[0], max: 60 }, { key: "desc", label: "설명", type: "textarea", original: s[1], max: 200 }]; current = c.steps?.[n] ?? {}; }
  else if (open?.startsWith("intro:")) { const k = open.slice(6) as keyof typeof INTRO_KO; title = INTRO_KO[k]; fields = [{ key: "text", label: "안내문", type: "textarea", original: "", max: 600, hint: "비우면 원래 문구(숫자가 자동으로 들어가는 문장)를 씁니다." }]; current = c.intro?.[k] ? { text: c.intro[k] } : {}; }
  const onSave = (d: Record<string, unknown>) => {
    const n: GuideOverrides["copy"] = JSON.parse(JSON.stringify(c));
    if (open === "module") n.module = d as never;
    else if (open?.startsWith("menu:")) { n.menu = { ...(n.menu ?? {}) }; if (Object.keys(d).length) n.menu[open.slice(5)] = d as never; else delete n.menu[open.slice(5)]; }
    else if (open?.startsWith("step:")) { const i = Number(open.slice(5)); const st = [...(n.steps ?? [])]; while (st.length <= i) st.push({}); st[i] = d as never; n.steps = st; }
    else if (open?.startsWith("intro:")) { n.intro = { ...(n.intro ?? {}), [open.slice(6)]: (d.text as string) || undefined }; }
    save.mutate(n);
  };
  return (
    <ListCard title="소개·메뉴·안내문" desc="모듈 소개, 메뉴 이름·설명, 시작하기 적용 순서, 화면마다 첫 안내문입니다." count={rows.length}>
      <Table className="min-w-[680px] table-fixed">
        <TableHeader><TableRow><TableHead className="w-[220px]">자리</TableHead><TableHead>지금 보이는 글</TableHead><TableHead className="w-[80px]">상태</TableHead><TableHead className="w-[80px]">편집</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map((r) => (
          <TableRow key={r.id}><TableCell className="text-left font-semibold">{r.what}</TableCell><TableCell className="truncate text-left text-ink-3">{r.now}</TableCell><TableCell className="text-center">{r.changed ? <Tag tone="ok">고침</Tag> : <Tag tone="soft">원본</Tag>}</TableCell><TableCell className="text-center"><Button size="sm" variant="outline" onClick={() => setOpen(r.id)}>수정</Button></TableCell></TableRow>
        ))}</TableBody>
      </Table>
      {open && <ItemSheet key={open} open title={title} desc="원본과 다르게 고친 칸만 저장합니다. 비우면 원본으로 돌아갑니다." fields={fields} current={current} onClose={() => setOpen(null)} onSave={onSave} saving={save.isPending} />}
    </ListCard>
  );
}

// ── 부품 ─────────────────────────────────────────────
type RegMeta = { id: string; title: string; group: string; source: string; note?: string };
type Doc = { summary?: string; note?: string; notes?: string[] };
export function GuideComponentsEditor() {
  const reg = useQuery({ queryKey: ["kit-registry-raw"], queryFn: async () => (await fetch("/kit-files/registry.json")).json() as Promise<{ groups: [string, string][]; metas: RegMeta[] }>, staleTime: Infinity });
  const { ov, saveKey, saving } = useSaveSection("components");
  const { get, set } = useQueryState();
  const q = get("q"); const group = get("group");
  const [edit, setEdit] = useState<RegMeta | null>(null);
  const doc = useQuery({ queryKey: ["kit-doc-raw", edit?.id], enabled: !!edit, queryFn: async () => (await fetch(`/kit-files/docs/${edit!.id}.json`)).json() as Promise<Doc> });
  const list = (reg.data?.metas ?? []).filter((m) => (!group || m.group === group) && (!q || m.title.includes(q) || m.id.includes(q)));
  const gl = (id: string) => reg.data?.groups.find((g) => g[0] === id)?.[1] ?? id;
  return (
    <ListCard title="부품" desc="이름·요약·메모·주의 사항·숨김·순서를 고칩니다. 코드와 미리보기는 키트 빌드(packages/kit)가 정본입니다." count={list.length}
      filters={<><ChoiceButton size="sm" label="분류" value={group} onChange={(v) => set({ group: v })} options={(reg.data?.groups ?? []).map(([id, label]) => ({ id, label }))} /><SearchBox value={q} onSearch={(v) => set({ q: v })} placeholder="부품 이름·id" /></>}>
      <Table className="min-w-[680px] table-fixed">
        <TableHeader><TableRow><TableHead className="w-[180px]">부품</TableHead><TableHead className="w-[150px]">id</TableHead><TableHead className="w-[110px]">분류</TableHead><TableHead>보이는 이름</TableHead><TableHead className="w-[80px]">상태</TableHead><TableHead className="w-[80px]">편집</TableHead></TableRow></TableHeader>
        <TableBody>{list.map((m) => (
          <TableRow key={m.id}><TableCell className="text-left font-semibold">{m.title}</TableCell><TableCell className="text-left font-mono text-sm text-ink-3">{m.id}</TableCell><TableCell className="text-center text-sm">{gl(m.group)}</TableCell><TableCell className="truncate text-left text-ink-3">{(ov[m.id]?.title as string) || m.title}</TableCell><TableCell className="text-center">{stateTag(ov[m.id])}</TableCell><TableCell className="text-center"><Button size="sm" variant="outline" onClick={() => setEdit(m)}>수정</Button></TableCell></TableRow>
        ))}</TableBody>
      </Table>
      {edit && (doc.data || doc.isError) && <ItemSheet key={edit.id} open title={`부품 · ${edit.title}`} desc={`${edit.id} — 원본과 다르게 고친 칸만 저장합니다.`} current={ov[edit.id] ?? {}} saving={saving} onClose={() => setEdit(null)}
        onSave={(d) => saveKey(edit.id, d).then(() => setEdit(null))}
        fields={[
          { key: "title", label: "이름", type: "text", original: edit.title, max: 40 },
          { key: "summary", label: "요약(상세 첫 줄)", type: "textarea", original: doc.data?.summary ?? "", max: 300 },
          { key: "note", label: "메모(목록·상세)", type: "text", original: edit.note ?? doc.data?.note ?? "", max: 300 },
          { key: "notes", label: "주의 사항(한 줄에 하나)", type: "lines", original: doc.data?.notes ?? [] },
          { key: "order", label: "순서(작을수록 앞, 비우면 원래 순서)", type: "number", original: "" },
          { key: "hidden", label: "숨기기(목록·상세·MCP 에서 빠집니다)", type: "switch" },
        ]} />}
    </ListCard>
  );
}

// ── KRDS 컴포넌트·패턴 ─────────────────────────────────
export function GuideKrdsEditor() {
  const comp = useSaveSection("krds");
  const pat = useSaveSection("patterns");
  const { get, set } = useQueryState();
  const kind = get("kind") || "components"; const q = get("q");
  const [edit, setEdit] = useState<string | null>(null);
  const items = kind === "patterns" ? KRDS_PATTERNS : KRDS_COMPONENTS;
  const list = (items as { ko: string; en?: string; cat?: string; id: string }[]).filter((c) => !q || c.ko.includes(q) || (c.en ?? "").toLowerCase().includes(q.toLowerCase()));
  const s = kind === "patterns" ? pat : comp;
  const it = edit ? (items as (typeof KRDS_COMPONENTS[number] & { desc?: string })[]).find((x) => x.ko === edit) : undefined;
  return (
    <ListCard title="KRDS 대응표" desc="지침 글(사용·접근성·상호작용·개발), 우리 키트 메모, 숨김을 고칩니다. 원본은 krds.go.kr 추출본입니다." count={list.length}
      filters={<><ChoiceButton size="sm" label="종류" value={kind} onChange={(v) => set({ kind: v === "components" ? "" : v, q: "" })} options={[{ id: "components", label: `컴포넌트 ${KRDS_COMPONENTS.length}` }, { id: "patterns", label: `기본 패턴 ${KRDS_PATTERNS.length}` }]} showAll={false} /><SearchBox value={q} onSearch={(v) => set({ q: v })} placeholder="이름" /></>}>
      <Table className="min-w-[620px] table-fixed">
        <TableHeader><TableRow><TableHead className="w-[200px]">이름</TableHead><TableHead className="w-[180px]">영문·분류</TableHead><TableHead className="w-[90px]">대응</TableHead><TableHead className="w-[80px]">상태</TableHead><TableHead className="w-[80px]">편집</TableHead></TableRow></TableHeader>
        <TableBody>{list.map((c) => (
          <TableRow key={c.ko}><TableCell className="text-left font-semibold">{c.ko}</TableCell><TableCell className="truncate text-left text-sm text-ink-3">{c.en ? `${c.en} · ${c.cat}` : "기본 패턴"}</TableCell><TableCell className="text-center">{c.id ? <Tag tone="ok">대응</Tag> : <Tag tone="warn">미대응</Tag>}</TableCell><TableCell className="text-center">{stateTag(s.ov[c.ko])}</TableCell><TableCell className="text-center"><Button size="sm" variant="outline" onClick={() => setEdit(c.ko)}>수정</Button></TableCell></TableRow>
        ))}</TableBody>
      </Table>
      {it && <ItemSheet key={`${kind}-${it.ko}`} open title={`${kind === "patterns" ? "기본 패턴" : "KRDS"} · ${it.ko}`} desc="지침은 한 줄에 하나씩 씁니다. 원본과 같으면 저장하지 않습니다." current={s.ov[it.ko] ?? {}} saving={s.saving} onClose={() => setEdit(null)}
        onSave={(d) => s.saveKey(it.ko, d).then(() => setEdit(null))}
        fields={[
          ...(kind === "patterns" ? [{ key: "desc", label: "설명", type: "textarea" as const, original: it.desc ?? "", max: 1200 }] : [{ key: "note", label: "우리 키트 메모(펼친 줄 맨 위)", type: "textarea" as const, original: "", max: 400 }]),
          { key: "usage", label: "사용 지침", type: "lines", original: it.usage },
          { key: "a11y", label: "접근성", type: "lines", original: it.a11y },
          { key: "interaction", label: "상호작용", type: "lines", original: it.interaction },
          { key: "dev", label: "개발", type: "lines", original: it.dev },
          { key: "hidden", label: "숨기기(대응표·MCP 지침 검색에서 빠집니다)", type: "switch" },
        ]} />}
    </ListCard>
  );
}

// ── 접근성 체크리스트 ─────────────────────────────────
type Row = { idx: number; section: string; component: string; text: string; verdict: string; evidence: string | null; fix?: string | null };
const ROWS = (report as { rows: Row[] }).rows;
const VERDICT_OPT = [{ id: "P", label: "통과" }, { id: "수정됨", label: "수정됨" }, { id: "의도", label: "의도된 차이" }, { id: "사이트", label: "사이트 담당" }, { id: "?", label: "판단 불가" }, { id: "F", label: "미흡" }];
const VKO = Object.fromEntries(VERDICT_OPT.map((v) => [v.id, v.label]));
export function GuideChecklistEditor() {
  const { ov, saveKey, saving } = useSaveSection("checklist");
  const { get, set } = useQueryState();
  const v = get("verdict"); const q = get("q");
  const [edit, setEdit] = useState<Row | null>(null);
  const eff = (r: Row) => (ov[String(r.idx)]?.verdict as string) || r.verdict;
  const list = useMemo(() => ROWS.filter((r) => (!v || eff(r) === v) && (!q || r.component.includes(q) || r.text.includes(q))), [v, q, ov]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <ListCard title="접근성 체크리스트" desc="판정·근거·고칠 방향·숨김을 고칩니다. 판정을 바꾸면 /guide/a11y 요약 건수와 MCP guide_get_checklist 가 함께 바뀝니다." count={list.length}
      filters={<><ChoiceButton size="sm" label="판정" value={v} onChange={(x) => set({ verdict: x })} options={VERDICT_OPT} /><SearchBox value={q} onSearch={(x) => set({ q: x })} placeholder="항목·기준" /></>}>
      <Table className="min-w-[760px] table-fixed">
        <TableHeader><TableRow><TableHead className="w-[64px]">번호</TableHead><TableHead className="w-[150px]">항목</TableHead><TableHead>기준</TableHead><TableHead className="w-[110px]">판정</TableHead><TableHead className="w-[80px]">상태</TableHead><TableHead className="w-[80px]">편집</TableHead></TableRow></TableHeader>
        <TableBody>{list.map((r) => (
          <TableRow key={r.idx}><TableCell className="text-center tabular-nums text-ink-4">{r.idx}</TableCell><TableCell className="truncate text-left text-sm">{r.component}</TableCell><TableCell className="truncate text-left text-sm text-ink-3">{r.text}</TableCell><TableCell className="text-center"><Tag tone="soft">{VKO[eff(r)] ?? eff(r)}</Tag></TableCell><TableCell className="text-center">{stateTag(ov[String(r.idx)])}</TableCell><TableCell className="text-center"><Button size="sm" variant="outline" onClick={() => setEdit(r)}>수정</Button></TableCell></TableRow>
        ))}</TableBody>
      </Table>
      {edit && <ItemSheet key={edit.idx} open title={`체크리스트 ${edit.idx} · ${edit.component}`} desc={edit.text} current={ov[String(edit.idx)] ?? {}} saving={saving} onClose={() => setEdit(null)}
        onSave={(d) => saveKey(String(edit.idx), d).then(() => setEdit(null))}
        fields={[
          { key: "verdict", label: "판정", type: "select", original: edit.verdict, options: VERDICT_OPT },
          { key: "evidence", label: "근거", type: "textarea", original: edit.evidence ?? "", max: 1200 },
          { key: "fix", label: "고칠 방향", type: "textarea", original: edit.fix ?? "", max: 600 },
          { key: "hidden", label: "숨기기(판정표·MCP 에서 빠집니다)", type: "switch" },
        ]} />}
    </ListCard>
  );
}

// ── 토큰 설명·내려받기 ─────────────────────────────────
type TNode = { $value: string | number; $description?: string };
function tokenLeaves(tree: Record<string, unknown>, prefix = ""): { path: string; node: TNode }[] {
  const out: { path: string; node: TNode }[] = [];
  for (const [k, v] of Object.entries(tree)) {
    if (k.startsWith("$") || !v || typeof v !== "object") continue;
    const p = prefix ? `${prefix}.${k}` : k;
    if ("$value" in (v as object)) out.push({ path: p, node: v as TNode }); else out.push(...tokenLeaves(v as Record<string, unknown>, p));
  }
  return out;
}
const SEMANTIC = tokenLeaves((tokens as unknown as Record<string, Record<string, unknown>>).semantic ?? {}, "semantic");
export function GuideTokensEditor() {
  const tk = useSaveSection("tokens");
  const dl = useSaveSection("downloads");
  const { get, set } = useQueryState();
  const kind = get("kind") || "downloads"; const q = get("q");
  const [edit, setEdit] = useState<string | null>(null);
  const toks = SEMANTIC.filter((t) => !q || t.path.includes(q) || (t.node.$description ?? "").includes(q));
  const dls = DOWNLOADS.filter((d) => !q || d.file.includes(q) || d.label.includes(q));
  const editTok = kind === "tokens" && edit ? SEMANTIC.find((t) => t.path === edit) : undefined;
  const editDl = kind === "downloads" && edit ? DOWNLOADS.find((d) => d.file === edit) : undefined;
  return (
    <ListCard title="토큰·내려받기" desc="의미 토큰의 쓰임 설명, 내려받기 형식 이름·용도·숨김을 고칩니다. 토큰 값은 토큰 원본(guide-files)을 고치고 다시 빌드합니다." count={kind === "tokens" ? toks.length : dls.length}
      filters={<><ChoiceButton size="sm" label="종류" value={kind} onChange={(x) => set({ kind: x === "downloads" ? "" : x, q: "" })} options={[{ id: "downloads", label: `내려받기 ${DOWNLOADS.length}` }, { id: "tokens", label: `의미 토큰 ${SEMANTIC.length}` }]} showAll={false} /><SearchBox value={q} onSearch={(x) => set({ q: x })} placeholder="이름" /></>}>
      {kind === "tokens" ? (
        <Table className="min-w-[620px] table-fixed">
          <TableHeader><TableRow><TableHead className="w-[240px]">토큰</TableHead><TableHead>쓰임</TableHead><TableHead className="w-[80px]">상태</TableHead><TableHead className="w-[80px]">편집</TableHead></TableRow></TableHeader>
          <TableBody>{toks.map((t) => (
            <TableRow key={t.path}><TableCell className="text-left font-mono text-sm">{t.path}</TableCell><TableCell className="truncate text-left text-sm text-ink-3">{(tk.ov[t.path]?.description as string) || t.node.$description || "—"}</TableCell><TableCell className="text-center">{stateTag(tk.ov[t.path])}</TableCell><TableCell className="text-center"><Button size="sm" variant="outline" onClick={() => setEdit(t.path)}>수정</Button></TableCell></TableRow>
          ))}</TableBody>
        </Table>
      ) : (
        <Table className="min-w-[620px] table-fixed">
          <TableHeader><TableRow><TableHead className="w-[200px]">형식</TableHead><TableHead>어디에 쓰나</TableHead><TableHead className="w-[220px]">파일</TableHead><TableHead className="w-[80px]">상태</TableHead><TableHead className="w-[80px]">편집</TableHead></TableRow></TableHeader>
          <TableBody>{dls.map((d) => (
            <TableRow key={d.file}><TableCell className="text-left font-semibold">{(dl.ov[d.file]?.label as string) || d.label}</TableCell><TableCell className="truncate text-left text-sm text-ink-3">{(dl.ov[d.file]?.use as string) || d.use}</TableCell><TableCell className="truncate text-left font-mono text-sm text-ink-3">{d.file}</TableCell><TableCell className="text-center">{stateTag(dl.ov[d.file])}</TableCell><TableCell className="text-center"><Button size="sm" variant="outline" onClick={() => setEdit(d.file)}>수정</Button></TableCell></TableRow>
          ))}</TableBody>
        </Table>
      )}
      {editTok && <ItemSheet key={editTok.path} open title={`토큰 · ${editTok.path}`} desc={`값 ${String(editTok.node.$value)} — 값은 토큰 원본에서 고칩니다.`} current={tk.ov[editTok.path] ?? {}} saving={tk.saving} onClose={() => setEdit(null)}
        onSave={(d) => tk.saveKey(editTok.path, d).then(() => setEdit(null))} fields={[{ key: "description", label: "쓰임 설명", type: "textarea", original: editTok.node.$description ?? "", max: 300 }]} />}
      {editDl && <ItemSheet key={editDl.file} open title={`내려받기 · ${editDl.file}`} desc="파일 자체는 토큰 빌드가 만듭니다." current={dl.ov[editDl.file] ?? {}} saving={dl.saving} onClose={() => setEdit(null)}
        onSave={(d) => dl.saveKey(editDl.file, d).then(() => setEdit(null))}
        fields={[{ key: "label", label: "형식 이름", type: "text", original: editDl.label, max: 60 }, { key: "use", label: "어디에 쓰나", type: "textarea", original: editDl.use, max: 200 }, { key: "hidden", label: "숨기기(목록에서 빠집니다)", type: "switch" }]} />}
    </ListCard>
  );
}

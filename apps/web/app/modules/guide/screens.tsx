// powerGuide 작업 단위 화면 — 토큰·부품·KRDS 대응표·접근성·변경 이력. 회원 전용(2026-10-16 결정 — 옛 "전부 무료·외부 유입 입구"는 뒤집힘).
// 출처: D:\solideos (Solid Flow) 의 tokens/tokens.json·app/src/data/krds*.ts·dist 산출물(downloads.ts, 종 수는 배열 길이) + packages/kit(KRDS 77종 React·Vue, 체크리스트 274항목).
// 디자인 = 기존 홈박스 값 그대로(ChoiceButton 알약 44·SectionHeading 26/800·표 규칙: 헤더 가운데·가변 텍스트 왼쪽·비교 숫자 오른쪽·그 외 가운데).
// 회사 종속 표현(솔리데오·CI 크림슨)은 "예시 스킨"으로 내린다(기획 §4). 토큰 원본 이름(solideo-*)은 파일명이라 그대로 둔다.
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { useMemo, useState } from "react";
import { ChoiceButton } from "@/components/hb/choice-button";
import { CodeBlock } from "@/components/hb/code-block";
import { Copy, MBr } from "@/components/hb/copy";
import { StepCards } from "@/components/hb/step-cards";
import { SearchInput } from "@/components/hb/search-input";
import { SectionHeading } from "@/components/hb/section-heading";
import { Tag } from "@/components/hb/tag";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CHANGELOG_MODULES, fetchChangelog, type ChangelogEntry, type ChangelogModule } from "@/lib/admin";
import { useMe } from "@/lib/auth";
import { DOWNLOADS } from "./downloads";
import { ComponentArt } from "./component-art";
import { applyChecklist, applyItems, applyMetas, useGuideOverrides } from "./overrides";
import { KRDS_CATEGORIES, KRDS_COMPONENTS, type KrdsComponent } from "./data/krds";
import { KRDS_PATTERNS } from "./data/krds-patterns";
import report from "./data/krds-report.json";
import tokens from "./data/tokens.json";

// ───────────────────────── 토큰 ─────────────────────────
type TokenNode = { $value: string | number; $type?: string; $description?: string };
type TokenTree = { [k: string]: TokenNode | TokenTree | string };
const T = tokens as unknown as TokenTree & { $version: string };

const isLeaf = (v: unknown): v is TokenNode => !!v && typeof v === "object" && "$value" in (v as object);
/** "{primitive.gray.900}" 참조를 실제 값으로 푼다(2단까지). */
function resolve(v: string | number): string {
  if (typeof v !== "string") return String(v);
  const m = /^\{([^}]+)\}$/.exec(v);
  if (!m) return v;
  let cur: unknown = T;
  for (const k of m[1]!.split(".")) cur = (cur as Record<string, unknown>)?.[k];
  return isLeaf(cur) ? resolve(cur.$value) : v;
}
function leaves(tree: TokenTree | undefined, prefix = ""): { path: string; node: TokenNode }[] {
  if (!tree) return [];
  const out: { path: string; node: TokenNode }[] = [];
  for (const [k, v] of Object.entries(tree)) {
    if (k.startsWith("$")) continue;
    const p = prefix ? `${prefix}.${k}` : k;
    if (isLeaf(v)) out.push({ path: p, node: v });
    else if (v && typeof v === "object") out.push(...leaves(v as TokenTree, p));
  }
  return out;
}
/** 배포 파일(solideo-tokens.css)의 변수 이름 — primitive·semantic 머리는 뗀다(scripts/build-guide-tokens.mjs varName 과 같은 규칙). */
const cssVar = (path: string) => `--${path.replace(/^(primitive|semantic)\./, "").replace(/\./g, "-")}`;

const COLOR_GROUPS: { id: string; label: string; tree: () => TokenTree | undefined; note?: string }[] = [
  { id: "gray", label: "Gray", tree: () => (T.primitive as TokenTree).gray as TokenTree },
  { id: "ink", label: "Ink", tree: () => (T.primitive as TokenTree).ink as TokenTree },
  { id: "blue", label: "Blue", tree: () => (T.primitive as TokenTree).blue as TokenTree },
  { id: "green", label: "Green", tree: () => (T.primitive as TokenTree).green as TokenTree },
  { id: "amber", label: "Amber", tree: () => (T.primitive as TokenTree).amber as TokenTree },
  { id: "red", label: "Red", tree: () => (T.primitive as TokenTree).red as TokenTree },
  { id: "brand", label: "Brand", tree: () => (T.primitive as TokenTree).brand as TokenTree, note: "주색 단계. 기본값은 KRDS 주색이고, 회사·기관 색은 스킨(skin-*.css)이 이 단계만 덮어쓴다(예시 스킨: 솔리데오 크림슨)." },
];
const SEMANTIC_GROUPS = ["text", "bg", "fill", "border", "icon", "accent"] as const;

function Swatch({ hex, label, sub }: { hex: string; label: string; sub?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="block aspect-[4/3] w-full rounded-md border border-line" style={{ background: hex }} aria-hidden />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-bold">{label}</span>
        <span className="truncate text-xs text-ink-4">{hex}{sub ? ` · ${sub}` : ""}</span>
      </span>
    </div>
  );
}


function GuideTokens() {
  const ov = useGuideOverrides(); // 관리자 덮어쓰기 — 토큰 쓰임 설명·내려받기 이름·숨김·안내문
  const downloads = DOWNLOADS.filter((d) => !ov.downloads[d.file]?.hidden).map((d) => ({ ...d, label: ov.downloads[d.file]?.label || d.label, use: ov.downloads[d.file]?.use || d.use }));
  const [group, setGroup] = useState("gray");
  const g = COLOR_GROUPS.find((x) => x.id === group) ?? COLOR_GROUPS[0]!;
  const colors = leaves(g.tree());
  const space = leaves(T.space as TokenTree);
  const radius = leaves(T.radius as TokenTree);
  const fontSize = leaves((T.font as TokenTree).size as TokenTree);
  const fontWeight = leaves((T.font as TokenTree).weight as TokenTree);
  const shadow = leaves(T.shadow as TokenTree);
  const semantic = SEMANTIC_GROUPS.map((k) => ({ k, items: leaves((T.semantic as TokenTree)[k] as TokenTree, `semantic.${k}`) }));
  return (
    <div className="mt-8 flex flex-col gap-14">
      <section>
        <SectionHeading title="색" />
        <Copy className="mt-2 text-md text-ink-3" text={ov.copy.intro?.tokens || "원시 팔레트(primitive)는 값이고, 의미 토큰(semantic)은 역할입니다. 화면은 의미 토큰만 씁니다."} />
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <ChoiceButton label="팔레트" value={group} onChange={(v) => setGroup(v || "gray")} options={COLOR_GROUPS.map((c) => ({ id: c.id, label: c.label }))} allLabel="Gray" />
          {g.note && <span className="text-sm text-ink-4"><Copy as="span" text={g.note} /></span>}
        </div>
        <div className="mt-6 grid grid-cols-3 gap-x-5 gap-y-6 sm:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10">
          {colors.map(({ path, node }) => <Swatch key={path} hex={resolve(node.$value)} label={path.split(".").pop()!} />)}
        </div>
        <h3 className="mt-12 text-xl font-bold">의미 토큰</h3>
        <Tabs defaultValue="text" className="mt-4">
          <TabsList>{SEMANTIC_GROUPS.map((k) => <TabsTrigger key={k} value={k}>{k}</TabsTrigger>)}</TabsList>
          {semantic.map(({ k, items }) => (
            <TabsContent key={k} value={k}>
              <Table>
                <TableHeader><TableRow><TableHead className="w-[220px]">토큰</TableHead><TableHead className="w-[80px]">색</TableHead><TableHead className="w-[110px]">값</TableHead><TableHead className="w-[220px]">참조</TableHead><TableHead className="text-left">쓰임</TableHead></TableRow></TableHeader>
                <TableBody>
                  {items.map(({ path, node }) => (
                    <TableRow key={path}>
                      <TableCell className="text-left"><code className="text-sm">{cssVar(path)}</code></TableCell>
                      <TableCell><span className="mx-auto block size-6 rounded-md border border-line" style={{ background: resolve(node.$value) }} aria-hidden /></TableCell>
                      <TableCell className="text-sm">{resolve(node.$value)}</TableCell>
                      <TableCell className="text-sm text-ink-4">{typeof node.$value === "string" && node.$value.startsWith("{") ? node.$value.slice(1, -1) : "—"}</TableCell>
                      <TableCell className="text-left text-sm text-ink-3">{ov.tokens[path]?.description || node.$description || ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
          ))}
        </Tabs>
      </section>

      <section>
        <SectionHeading title="타이포그래피" />
        <div className="mt-6 flex flex-col gap-4">
          {fontSize.map(({ path, node }) => (
            <div key={path} className="flex items-baseline gap-6 border-b border-line pb-4">
              <span className="w-[120px] shrink-0 text-sm text-ink-4">{path.split(".").pop()} · {String(node.$value)}</span>
              <span style={{ fontSize: String(node.$value), lineHeight: 1.3 }} className="truncate font-bold">공공 서비스는 읽히는 글자부터</span>
            </div>
          ))}
          <div className="flex flex-wrap gap-6 pt-2">
            {fontWeight.map(({ path, node }) => <span key={path} style={{ fontWeight: Number(node.$value) }} className="text-lg">{path.split(".").pop()} {String(node.$value)}</span>)}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-12 lg:grid-cols-2">
        <div>
          <SectionHeading title="간격" size={24} />
          <div className="mt-6 flex flex-col gap-3">
            {space.map(({ path, node }) => (
              <div key={path} className="flex items-center gap-4"><span className="w-[72px] shrink-0 text-sm text-ink-4">space-{path} · {String(node.$value)}</span><span className="h-4 rounded-sm bg-ink" style={{ width: String(node.$value) }} aria-hidden /></div>
            ))}
          </div>
        </div>
        <div>
          <SectionHeading title="형태" size={24} />
          <div className="mt-6 grid grid-cols-3 gap-6 sm:grid-cols-4">
            {radius.map(({ path, node }) => (
              <div key={path} className="flex flex-col items-center gap-2"><span className="size-16 border-2 border-ink" style={{ borderRadius: String(node.$value) }} aria-hidden /><span className="text-sm text-ink-4">{path} · {String(node.$value)}</span></div>
            ))}
          </div>
          <h3 className="mt-10 text-xl font-bold">그림자</h3>
          <div className="mt-4 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {shadow.map(({ path, node }) => (
              <div key={path} className="flex flex-col items-center gap-2"><span className="size-16 rounded-lg bg-ground" style={{ boxShadow: String(node.$value) }} aria-hidden /><span className="text-sm text-ink-4">shadow-{path}</span></div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <SectionHeading title="내려받기" />
        <Copy className="mt-2 text-md text-ink-3" text={`토큰 원본 하나에서 만든 산출물 ${downloads.length}종입니다. 빌드 도구 없이 파일 복사만으로 씁니다. 버전 ${T.$version}.`} />
        <Table className="mt-6">
          <TableHeader><TableRow><TableHead className="w-[200px]">형식</TableHead><TableHead className="text-left">어디에 쓰나</TableHead><TableHead className="w-[260px]">파일</TableHead><TableHead className="w-[120px]">받기</TableHead></TableRow></TableHeader>
          <TableBody>
            {downloads.map((d) => (
              <TableRow key={d.file}>
                <TableCell className="font-semibold">{d.label}</TableCell>
                <TableCell className="text-left text-sm text-ink-3">{d.use}</TableCell>
                <TableCell className="text-left"><code className="text-sm">{d.file}</code></TableCell>
                <TableCell><Button asChild variant="outline" size="sm"><a href={`/guide-files/${d.file}?v=${T.$version}`} download><Download aria-hidden />받기</a></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <h3 className="mt-10 text-xl font-bold">바로 쓰기</h3>
        <CodeBlock className="mt-4" code={`<link rel="stylesheet" href="solideo-tokens.css">\n<!-- 다크 모드 -->\n<html data-theme="dark">\n\n.card { background: var(${cssVar("semantic.bg.primary")}); color: var(${cssVar("semantic.text.primary")}); border-radius: var(--radius-md); }\n.button { background: var(${cssVar("semantic.fill.accent")}); color: var(${cssVar("semantic.text.inverse")}); }\n\n<!-- 회사·기관 색(예시 스킨) — 역할 토큰 이름은 그대로, 주색 단계만 바뀐다 -->\n<link rel="stylesheet" href="skin-solideo.css">`} />
      </section>
    </div>
  );
}

// ───────────────────────── 부품 ─────────────────────────
interface KitRegistry { version: string; groups: [string, string][]; metas: { id: string; title: string; group: string; source: "krds" | "shadcn" | "both"; note?: string }[] }

function GuideComponents() {
  const { data, isLoading } = useQuery({ queryKey: ["kit-registry"], queryFn: async () => (await fetch("/kit-files/registry.json")).json() as Promise<KitRegistry>, staleTime: Infinity });
  const [group, setGroup] = useState("");
  const [q, setQ] = useState("");
  const [fw, setFw] = useState<"react" | "vue">("react");
  const ov = useGuideOverrides(); // 관리자 덮어쓰기 — 부품 이름·숨김·순서·안내문
  const metas = useMemo(() => applyMetas(data?.metas ?? [], ov.components), [data, ov.components]);
  const list = useMemo(() => metas.filter((m) => (!group || m.group === group) && (!q || m.title.includes(q) || m.id.includes(q))), [metas, group, q]);
  const groupLabel = (id: string) => data?.groups.find((g) => g[0] === id)?.[1] ?? id;
  return (
    <div className="mt-8">
      {ov.copy.intro?.components && <Copy className="mb-6 text-md text-ink-3" text={ov.copy.intro.components} />}
      <div className="flex flex-wrap items-center gap-3">
        <ChoiceButton label="분류" value={group} onChange={setGroup} options={(data?.groups ?? []).map(([id, label]) => ({ id, label, count: metas.filter((m) => m.group === id).length }))} />
        <ChoiceButton label="코드" value={fw} onChange={(v) => setFw((v as "react" | "vue") || "react")} options={[{ id: "react", label: "React" }, { id: "vue", label: "Vue" }]} showAll={false} />
        <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="부품 이름" className="w-full sm:w-[260px]" />
        <Button asChild variant="outline" className="ml-auto"><a href="/kit-files/powerguide-kit-krds.zip" download><Download aria-hidden />키트 통째 받기</a></Button>
      </div>
      <p className="mt-4 text-sm text-ink-4">{isLoading ? "불러오는 중" : `${list.length}개 · 키트 v${data?.version ?? ""}`}</p>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {list.map((m) => (
          <Link key={m.id} to={`/guide/components/${m.id}`} onClick={() => { try { localStorage.setItem("pp-guide-fw", fw); } catch { /* 저장 불가 */ } }} className="group flex flex-col overflow-hidden rounded-panel border border-line bg-ground transition-shadow hover:shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
            <span className="block aspect-[5/3] overflow-hidden border-b border-line"><ComponentArt id={m.id} className="size-full transition-transform duration-300 group-hover:scale-[1.03]" /></span>
            <span className="flex items-center gap-2 px-5 py-4 max-sm:px-3 max-sm:py-3"><span className="truncate text-md font-bold max-sm:text-sm">{m.title}</span><Tag tone="soft" className="ml-auto shrink-0 max-sm:hidden">{groupLabel(m.group)}</Tag></span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────── KRDS 대응표 ─────────────────────────
// KRDS 지침 id → 키트 부품 id(guide-component 의 KRDS_ALIAS 를 거꾸로). 대응 줄은 부품 문서로, 미대응 줄은 KRDS 원문으로(품질 판정 GDE-011)
const KIT_OF: Record<string, string> = { "gov-banner": "masthead", modal: "dialog", radio: "radio-group", tab: "tabs", "tab-bar": "tabs", "text-field": "input", "in-page-nav": "in-page-navigation", "top-navigation": "navigation-menu", "critical-alert": "alert", "bottom-sheet": "drawer", disclosure: "collapsible", snackbar: "toast" };
const KRDS_SRC = "https://www.krds.go.kr/html/site/component/component_summary.html";
function KrdsRow({ c, kitIds }: { c: KrdsComponent & { note?: string }; kitIds: Set<string> }) {
  const kit = c.id ? [KIT_OF[c.id], c.id].find((x) => x && kitIds.has(x)) : undefined;
  const [open, setOpen] = useState(false);
  const has = (a: string[]) => a.length > 0;
  return (
    <>
      <TableRow className="cursor-pointer" onClick={() => setOpen((v) => !v)}>
        <TableCell className="text-left font-semibold">{c.ko}</TableCell>
        <TableCell className="text-left text-sm text-ink-3">{c.en}</TableCell>
        <TableCell className="text-sm">{c.cat}</TableCell>
        <TableCell>{c.id ? <Tag tone="ok">대응</Tag> : <Tag tone="warn">미대응</Tag>}</TableCell>
        <TableCell onClick={(e) => e.stopPropagation()}>{kit ? <Link to={`/guide/components/${kit}`} className="pp-hit text-sm font-semibold underline underline-offset-2">부품 보기</Link> : <a href={KRDS_SRC} target="_blank" rel="noreferrer" className="pp-hit text-sm font-semibold text-ink-3 underline underline-offset-2">KRDS 원문<span className="sr-only"> (새 창)</span></a>}</TableCell>
        <TableCell className="text-sm">{c.kwcag.length}</TableCell>
      </TableRow>
      {open && (
        <TableRow className="bg-ground-2 hover:bg-ground-2">
          <TableCell colSpan={6} className="text-left">
            <div className="grid grid-cols-1 gap-6 py-2 md:grid-cols-2">
              {c.note && <div className="md:col-span-2 rounded-md bg-ground px-4 py-3 text-sm leading-[1.7]"><span className="font-bold">우리 키트 메모</span> <Copy as="span" text={c.note} /></div>}
              {([["사용 지침", c.usage], ["접근성", c.a11y], ["상호작용", c.interaction], ["개발", c.dev]] as [string, string[]][]).filter(([, a]) => has(a)).map(([t, a]) => (
                <div key={t}><div className="text-sm font-bold">{t}</div><ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm leading-[1.7] text-ink-3">{a.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
              ))}
              {has(c.kwcag) && <div className="md:col-span-2"><span className="text-sm font-bold">KWCAG</span> <span className="text-sm text-ink-3">{c.kwcag.join(" · ")}</span></div>}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function GuideKrds() {
  const reg = useQuery({ queryKey: ["kit-registry"], queryFn: async () => (await fetch("/kit-files/registry.json")).json() as Promise<KitRegistry>, staleTime: Infinity });
  const kitIds = useMemo(() => new Set((reg.data?.metas ?? []).map((m) => m.id)), [reg.data]);
  const [cat, setCat] = useState("");
  const [tab, setTab] = useState("components");
  const ov = useGuideOverrides(); // 관리자 덮어쓰기 — 지침 글·키트 메모·숨김·안내문
  const all = useMemo(() => applyItems(KRDS_COMPONENTS, ov.krds), [ov.krds]);
  const patterns = useMemo(() => applyItems(KRDS_PATTERNS, ov.patterns), [ov.patterns]);
  const comps = all.filter((c) => !cat || c.cat === cat);
  const mapped = all.filter((c) => c.id).length;
  return (
    <div className="mt-8">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList><TabsTrigger value="components">컴포넌트 {all.length}</TabsTrigger><TabsTrigger value="patterns">기본 패턴 {patterns.length}</TabsTrigger></TabsList>
        <TabsContent value="components">
          <Copy className="mt-4 text-md text-ink-3" text={ov.copy.intro?.krds || `KRDS 컴포넌트 ${all.length}종 중 ${mapped}종이 우리 부품과 대응합니다. 공공 SI 검수는 이 분류로 대조합니다. 줄을 누르면 지침이 펼쳐집니다.`} />
          <div className="mt-6"><ChoiceButton label="분류" value={cat} onChange={setCat} options={KRDS_CATEGORIES.map((k) => ({ id: k, label: k, count: all.filter((c) => c.cat === k).length }))} /></div>
          <Table className="mt-6">
            <TableHeader><TableRow><TableHead className="w-[200px]">컴포넌트</TableHead><TableHead className="w-[200px]">영문</TableHead><TableHead className="w-[150px]">분류</TableHead><TableHead className="w-[100px]">대응</TableHead><TableHead className="w-[120px]">바로 가기</TableHead><TableHead className="w-[90px]">KWCAG</TableHead></TableRow></TableHeader>
            <TableBody>{comps.map((c) => <KrdsRow key={`${c.cat}-${c.ko}`} c={c} kitIds={kitIds} />)}</TableBody>
          </Table>
        </TabsContent>
        <TabsContent value="patterns">
          <Copy className="mt-4 text-md text-ink-3" text="컴포넌트가 무엇을 쓰는가라면, 기본 패턴은 어떻게 엮는가입니다." />
          <div className="mt-6 grid grid-cols-1 items-start gap-4 md:grid-cols-2">
            {patterns.map((p) => (
              <details key={p.ko} className="group rounded-panel border border-line bg-ground p-5">
                <summary className="flex cursor-pointer list-none items-center gap-3 text-lg font-bold">{p.ko}{p.id ? <Tag tone="ok">대응</Tag> : <Tag tone="warn">미대응</Tag>}</summary>
                <p className="mt-3 text-md leading-[1.7] text-ink-3">{p.desc}</p>
                <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
                  {([["사용 지침", p.usage], ["접근성", p.a11y], ["상호작용", p.interaction], ["개발", p.dev]] as [string, string[]][]).filter(([, a]) => a.length).map(([t, a]) => (
                    <div key={t}><div className="text-sm font-bold">{t}</div><ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm leading-[1.7] text-ink-3">{a.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ───────────────────────── 접근성 ─────────────────────────
type ReportRow = { idx: number; section: string; component: string; text: string; verdict: string; evidence: string | null; fix?: string | null };
const REPORT = report as { at: string; summary: Record<string, number>; rows: ReportRow[] };
const VERDICT: Record<string, { label: string; tone: "ok" | "warn" | "soft" | "ink" }> = {
  P: { label: "통과", tone: "ok" }, "수정됨": { label: "수정됨", tone: "ok" }, "의도": { label: "의도된 차이", tone: "soft" },
  "사이트": { label: "사이트 담당", tone: "soft" }, "?": { label: "판단 불가", tone: "warn" }, F: { label: "미흡", tone: "ink" },
};
const SECTION_KO: Record<string, string> = { style: "스타일", component: "컴포넌트", pattern: "기본 패턴", service: "서비스 패턴" };

// 근거 글에 섞인 내부 파일·함수 이름을 사람이 읽는 말로(품질 판정 GEN-019) — 판정 원본(krds-report.json)은 그대로 둔다
const CODE_IN_PARENS = /\s*\((?=[^)]*(?:\.(?:css|tsx?|vue|json|js)\b|\/|\(\)|=|--))[^()]*(?:\([^()]*\)[^()]*)*\)/g;
const CODE_TOKEN = /(?:[\w.*-]+\/)+[\w.*-]+\.(?:css|tsx?|vue|json|js)|[\w-]+\.(?:css|tsx?|vue|json|js)\b|[\w.]+\(\)|data-hb-style="krds"|--[\w-]+(?:~\d+)?/g;
function humanize(s: string | null | undefined) {
  if (!s) return "서비스 화면에서 지켜야 하는 항목입니다.";
  return s
    .replace(CODE_IN_PARENS, "")
    .replace(/data-hb-style="krds"/g, "KRDS 원형 모드")
    .replace(CODE_TOKEN, "키트 코드")
    .replace(/(키트 코드)(\s*[·,]\s*키트 코드)+/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function GuideA11y() {
  const reg = useQuery({ queryKey: ["kit-registry"], queryFn: async () => (await fetch("/kit-files/registry.json")).json() as Promise<KitRegistry>, staleTime: Infinity });
  const [verdict, setVerdict] = useState<string[]>(["F", "?"]);
  const [section, setSection] = useState("");
  const ov = useGuideOverrides(); // 관리자 덮어쓰기 — 판정·근거·고칠 방향·숨김·안내문(요약 건수도 다시 센다)
  const merged = useMemo(() => applyChecklist(REPORT.rows, ov.checklist), [ov.checklist]);
  const rows = merged.rows.filter((r) => (!verdict.length || verdict.includes(r.verdict)) && (!section || r.section === section));
  const total = merged.rows.length;
  return (
    <div className="mt-8">
      <Copy className="text-md text-ink-3" text={ov.copy.intro?.a11y || `디지털 정부 서비스 UI/UX 가이드라인 자체 검증 체크리스트 ${total}항목을 키트 코드에 대조한 결과입니다. 자동 검사(axe-core WCAG 2.1 A·AA, 키보드 포커스)는 React·Vue 77종 모두 위반 0입니다.`} />
      {/* 검사일·키트 버전(품질 판정 GDE-012) — 판정이 어느 판 기준인지 */}
      <p className="mt-2 text-sm text-ink-4">검사일 {REPORT.at.slice(0, 10).replace(/-/g, ".")} · 키트 v{reg.data?.version ?? "…"} 기준</p>
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {Object.entries(merged.summary).map(([k, n]) => (
          <div key={k} className="rounded-panel border border-line bg-ground p-5"><div className="text-sm text-ink-4">{VERDICT[k]?.label ?? k}</div><div className="mt-1 text-3xl font-extrabold tracking-[-0.03em]">{n}</div></div>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <ChoiceButton label="판정" multiple value={verdict} onChange={setVerdict} options={Object.entries(VERDICT).map(([id, v]) => ({ id, label: v.label, count: merged.summary[id] ?? 0 }))} />
        <ChoiceButton label="영역" value={section} onChange={setSection} options={Object.entries(SECTION_KO).map(([id, label]) => ({ id, label, count: merged.rows.filter((r) => r.section === id).length }))} />
        <span className="text-sm text-ink-4">{rows.length}항목</span>
      </div>
      {/* 1024 미만: 표 대신 카드 목록 — 고정 폭 열이 설명 칸을 0px 로 눌러 한 글자씩 세로로 쌓이던 문제(종합평가 1-2) */}
      <ul className="mt-6 flex flex-col gap-3 lg:hidden">
        {rows.map((r) => (
          <li key={r.idx} className="rounded-panel border border-line bg-ground p-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-4">
              <span className="whitespace-nowrap">{r.idx}</span><span aria-hidden>·</span>
              <span className="whitespace-nowrap">{SECTION_KO[r.section] ?? r.section}</span>
              <span className="ml-auto"><Tag tone={VERDICT[r.verdict]?.tone ?? "soft"}>{VERDICT[r.verdict]?.label ?? r.verdict}</Tag></span>
            </div>
            <div className="mt-2 text-md font-bold">{r.component}</div>
            <p className="mt-1 text-sm leading-[1.6]"><Copy as="span" text={r.text} /></p>
            <p className="mt-2 text-sm leading-[1.6] text-ink-3"><Copy as="span" text={humanize(r.evidence)} />{r.fix ? <span className="mt-1 block text-ink"><Copy as="span" text={"→ " + humanize(r.fix)} /></span> : null}</p>
          </li>
        ))}
      </ul>
      <div className="hidden lg:block">
        <Table className="mt-6 table-fixed">
        <TableHeader><TableRow><TableHead className="w-[60px]">번호</TableHead><TableHead className="w-[110px]">영역</TableHead><TableHead className="w-[160px]">항목</TableHead><TableHead className="text-left">기준</TableHead><TableHead className="w-[110px]">판정</TableHead><TableHead className="text-left">근거 · 고칠 방향</TableHead></TableRow></TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.idx}>
              <TableCell className="text-sm text-ink-4">{r.idx}</TableCell>
              <TableCell className="text-sm">{SECTION_KO[r.section] ?? r.section}</TableCell>
              <TableCell className="whitespace-normal text-left text-sm">{r.component}</TableCell>
              <TableCell className="whitespace-normal text-left text-sm leading-[1.6]"><Copy as="span" text={r.text} /></TableCell>
              <TableCell><Tag tone={VERDICT[r.verdict]?.tone ?? "soft"}>{VERDICT[r.verdict]?.label ?? r.verdict}</Tag></TableCell>
              <TableCell className="whitespace-normal text-left text-sm leading-[1.6] text-ink-3"><Copy as="span" text={humanize(r.evidence)} />{r.fix ? <span className="mt-1 block text-ink"><Copy as="span" text={"→ " + humanize(r.fix)} /></span> : null}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        </Table>
      </div>
      <p className="mt-4 text-sm text-ink-4">판정 시각 {REPORT.at.slice(0, 10)} · 사이트 담당 항목은 부품이 아니라 서비스 화면에서 지켜야 하는 것입니다.</p>
    </div>
  );
}

// ───────────────────────── 변경 이력 ─────────────────────────
function GuideChangelog() {
  // 이력은 관리자 화면(/admin/changelog)에서 쓴다 — 갈래(부품 키트·토큰·규칙…)별로 나눠 보여 준다.
  // ?module= 로 다른 모듈 이력도 본다(없거나 모르는 값이면 guide) — 주소에 적힌 값이 실제로 동작하게(보고서 하)
  const [sp] = useSearchParams();
  const modParam = sp.get("module");
  const mod: ChangelogModule = CHANGELOG_MODULES.some((m) => m.id === modParam) ? (modParam as ChangelogModule) : "guide";
  const { data, isLoading } = useQuery({ queryKey: ["changelog", mod], queryFn: () => fetchChangelog(mod), staleTime: 60_000 });
  const { isAdmin } = useMe();
  const ov = useGuideOverrides();
  const tracks =[...new Set((data ?? []).map((v) => v.track || "전체"))];
  const Row = ({ v }: { v: ChangelogEntry }) => (
    <li className="flex gap-6 border-b border-line py-5">
      <div className="w-[120px] shrink-0"><div className="text-lg font-extrabold">v{v.version}</div><div className="text-sm text-ink-4">{v.date.replace(/-/g, ".")}</div></div>
      <div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div className="text-md font-bold">{v.title}</div>{isAdmin && <a href={`/admin/changelog?edit=${v.id}`} className="shrink-0 rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-ink-3 hover:bg-ground-3">수정·삭제</a>}</div><ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm leading-[1.7] text-ink-3">{v.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></div>
    </li>
  );
  const adminBar = isAdmin && (
    <div className="mt-6 flex items-center justify-between gap-3 rounded-panel border border-line bg-ground-3 px-5 py-3 text-sm text-ink-3">
      <span>관리자에게만 보입니다.<MBr />이력은 관리자 화면에서 쓰고 고칩니다.</span>
      <span className="flex gap-2"><a href="/admin/changelog?module=guide&new=1" className="rounded-md bg-ink px-3 py-1.5 font-semibold text-white">새 이력</a><a href="/admin/changelog?module=guide" className="rounded-md border border-line bg-ground px-3 py-1.5 font-semibold">관리</a></span>
    </div>
  );
  if (isLoading) return <div className="mt-8 h-40 animate-pulse rounded-panel bg-ground-3" />;
  return (
    <>{adminBar}{ov.copy.intro?.changelog && <Copy className="mt-6 text-md text-ink-3" text={ov.copy.intro.changelog} />}<div className={`mt-8 grid grid-cols-1 gap-12 ${tracks.length > 1 ? "lg:grid-cols-2" : ""}`}>
      {tracks.map((t) => (
        <section key={t}><SectionHeading title={t} size={24} /><ul className="mt-2">{(data ?? []).filter((v) => (v.track || "전체") === t).map((v) => <Row key={v.id} v={v} />)}</ul></section>
      ))}
    </div></>
  );
}

// ───────────────────────── 랜딩 보강 ─────────────────────────
/** 시작하기 '적용 순서' 원본 — 관리자 덮어쓰기(copy.steps[i])가 있으면 그 칸만 바꾼다 */
export const GUIDE_STEPS = [
  ["토큰을 가져온다", "CSS 변수 한 파일이면 어떤 스택이든 시작됩니다. Tailwind·shadcn·Spring 형식도 있습니다.", "/guide/tokens"],
  ["부품을 고른다", "KRDS 77종이 React·Vue 두 판으로 있습니다. 미리보기에서 눌러 보고 코드를 복사합니다.", "/guide/components"],
  ["KRDS 로 대조한다", "검수가 KRDS 분류로 오므로 대응표에서 빠진 것부터 챙깁니다.", "/guide/krds"],
  ["접근성 결과를 본다", "자체 검증 체크리스트 판정표에서 사이트 담당 항목을 확인합니다.", "/guide/a11y"],
] as const;

export function GuideLandingSteps() {
  const ov = useGuideOverrides();
  return (
    <section className="mt-8" aria-label="적용 순서">
      <SectionHeading title="적용 순서" />
      <StepCards cols={4} items={GUIDE_STEPS.map(([title, desc, to], i) => ({ title: ov.copy.steps?.[i]?.title || title, desc: ov.copy.steps?.[i]?.desc || desc, to, img: `/img/steps/guide-${i + 1}-v3.html` }))} />
    </section>
  );
}

export const GUIDE_SCREENS: Record<string, () => React.JSX.Element> = {
  tokens: GuideTokens, components: GuideComponents, krds: GuideKrds, a11y: GuideA11y, changelog: GuideChangelog,
};


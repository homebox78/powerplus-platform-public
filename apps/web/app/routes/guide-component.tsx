// powerGuide 부품 문서 — /guide/components/:id. shadcn 문서(ui.shadcn.com/docs/components/…)와 같은 짜임(사용자 2026-10-06):
//  제목·설명 → React/Vue 탭 → 미리보기(+코드 보기) → 설치(명령·직접) → 사용법 → 알아 둘 점 → KRDS 지침 → 이전·다음.
// 재료: public/kit-files/docs/<id>.json · r/<id>.json — packages/kit/scripts/build-docs.mjs 가 키트 빌드 때 만든다.
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Copy as CopyIcon, Download } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Copy } from "@/components/hb/copy";
import { BackButton } from "@/components/hb/back-button";
import { Tag } from "@/components/hb/tag";
import { cn } from "@/lib/utils";
import { KRDS_COMPONENTS } from "@/modules/guide/data/krds";
import { applyMetas, useGuideOverrides } from "@/modules/guide/overrides";

interface DocFile { path: string; code: string }
interface FwDoc { demo: string; files: DocFile[]; deps: string[] }
interface ComponentDoc { id: string; title: string; group: string; groupLabel: string; source: string; note: string; summary: string; notes: string[]; usage: string; react: FwDoc; vue: FwDoc }
interface KitRegistry { version: string; groups: [string, string][]; metas: { id: string; title: string; group: string; source: string; note?: string }[] }
type Fw = "react" | "vue";

const SOURCE_KO: Record<string, string> = { krds: "KRDS", shadcn: "shadcn", both: "KRDS + shadcn" };
// 화면 폭을 다 쓰는 부품 — 미리보기를 가운데 720px 에 가두지 않는다
const WIDE = new Set(["header", "footer", "masthead", "data-table", "sidebar", "navigation-menu", "menubar", "mobile-menu", "side-navigation", "resizable", "table", "carousel", "tutorial-panel", "help-panel", "structured-list", "in-page-navigation"]);
// KRDS 지침(Solid Flow 대응표)의 id 와 키트 id 가 다른 것
const KRDS_ALIAS: Record<string, string[]> = { masthead: ["gov-banner"], dialog: ["modal"], "radio-group": ["radio"], tabs: ["tab", "tab-bar"], input: ["text-field"], "in-page-navigation": ["in-page-nav"], "navigation-menu": ["top-navigation"], alert: ["critical-alert"], drawer: ["bottom-sheet"], collapsible: ["disclosure"], toast: ["toast", "snackbar"] };
const PM = ["pnpm", "npm", "yarn", "bun"] as const;
const pmCmd = (pm: (typeof PM)[number], pkg: string) => ({ pnpm: `pnpm dlx ${pkg}`, npm: `npx ${pkg}`, yarn: `yarn dlx ${pkg}`, bun: `bunx --bun ${pkg}` })[pm];
const pmAdd = (pm: (typeof PM)[number], deps: string[]) => `${pm === "npm" ? "npm install" : pm === "bun" ? "bun add" : `${pm} add`} ${deps.join(" ")}`;

// ── 코드 강조: 정규식 한 번으로 주석·문자열·예약어·태그만 가른다(라이브러리 없음) ──
const TOKEN = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(import|from|export|default|function|return|const|let|type|interface|as|if|else|new|true|false|null|undefined|setup|lang)\b|(<\/?[A-Za-z][\w.-]*)/g;
function highlight(code: string) {
  const out: React.ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (const m of code.matchAll(TOKEN)) {
    if (m.index! > last) out.push(code.slice(last, m.index));
    const [t, com, str, kw, tag] = m;
    out.push(<span key={k++} className={com ? "text-[#6A9955]" : str ? "text-[#CE9178]" : kw ? "text-[#569CD6]" : tag ? "text-[#4EC9B0]" : ""}>{t}</span>);
    last = m.index! + t.length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

function useCopy() {
  const [done, setDone] = useState(false);
  const copy = async (s: string) => { try { await navigator.clipboard.writeText(s); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* 클립보드 차단 — 조용히 */ } };
  return { done, copy };
}

/** 문서용 코드 상자 — VS Code 어두운 테마(Dark+) 색 · 줄 번호 · 복사 · (선택) 접기/펼치기 */
function DocCode({ code, title, collapsed: startCollapsed, className }: { code: string; title?: string; collapsed?: boolean; className?: string }) {
  const { done, copy } = useCopy();
  const [collapsed, setCollapsed] = useState(!!startCollapsed);
  const foldable = !!startCollapsed;
  const lines = useMemo(() => code.replace(/\n+$/, "").split("\n"), [code]);
  const body = useMemo(() => highlight(lines.join("\n")), [lines]);
  return (
    <div className={cn("relative overflow-hidden rounded-card bg-[#1E1E1E]", className)}>
      {title && <div className="flex h-11 items-center border-b border-[#2B2B2B] bg-[#252526] px-5 text-sm font-medium text-[#CCCCCC]">{title}</div>}
      <button type="button" onClick={() => copy(code)} aria-label="코드 복사" className={cn("absolute right-3 z-10 inline-flex size-8 items-center justify-center rounded-chip bg-[#1E1E1E] text-[#9D9D9D] hover:bg-[#2A2D2E] hover:text-white", title ? "top-1.5" : "top-3")}>
        {done ? <Check className="size-4" aria-hidden /> : <CopyIcon className="size-4" aria-hidden />}
      </button>
      <div className={cn("pp-code flex overflow-x-auto py-4 text-[13px] leading-[1.75]", collapsed && "max-h-[132px] overflow-y-hidden")}>
        <div aria-hidden className="select-none pl-5 pr-4 text-right text-[#858585]">{lines.map((_, i) => <div key={i}>{i + 1}</div>)}</div>
        <pre className="m-0 min-w-0 flex-1 pr-12 text-[#D4D4D4]">{body}</pre>
      </div>
      {collapsed && (
        <div className="absolute inset-x-0 bottom-0 flex h-[110px] items-center justify-center bg-gradient-to-b from-[#1E1E1E]/0 via-[#1E1E1E]/80 to-[#1E1E1E]">
          <Button size="sm" variant="outline" className="border-[#3C3C3C] bg-[#2D2D2D] text-[#CCCCCC] hover:bg-[#37373D] hover:text-white" onClick={() => setCollapsed(false)}>코드 보기</Button>
        </div>
      )}
      {foldable && !collapsed && (
        <div className="flex justify-center border-t border-[#2B2B2B] py-3">
          <Button size="sm" variant="outline" className="border-[#3C3C3C] bg-[#2D2D2D] text-[#CCCCCC] hover:bg-[#37373D] hover:text-white" onClick={() => setCollapsed(true)}>코드 접기</Button>
        </div>
      )}
    </div>
  );
}

/** 밑줄 탭 — shadcn 문서의 Base UI · React Aria · Radix UI 줄과 같은 모양 */
function LineTabs<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: [T, string, boolean?][]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-6 border-b border-line">
      {items.map(([v, text, disabled]) => (
        <button key={v} type="button" role="tab" aria-selected={value === v} disabled={disabled} onClick={() => onChange(v)}
          className={cn("relative h-11 min-w-8 text-md transition-colors disabled:cursor-not-allowed disabled:opacity-40", value === v ? "font-semibold text-ink after:absolute after:-bottom-px after:left-0 after:right-0 after:h-0.5 after:bg-ink" : "text-ink-4 hover:text-ink")}>
          {text}
        </button>
      ))}
    </div>
  );
}

/** 미리보기 — 키트 미리보기(?bare=1)를 같은 출처 iframe 으로 띄우고 내용 높이에 맞춘다 */
function Preview({ id, fw }: { id: string; fw: Fw }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [h, setH] = useState(320);
  const src = `/kit-files/preview/${fw === "vue" ? "vue.html" : "index.html"}?embed=1&bare=1&c=${id}${WIDE.has(id) ? "&wide=1" : ""}`;
  useEffect(() => {
    const f = ref.current;
    if (!f) return;
    let ro: ResizeObserver | null = null;
    const fit = () => {
      const demo = f.contentDocument?.querySelector(".pv-demo");
      if (!demo) return;
      // 열린 드롭다운·팝오버·대화상자(body 끝에 붙는 층 포함)까지 다 보이게 — 데모 아래로 삐져나온 만큼 더 늘린다(사용자 2026-10-08)
      const doc = f.contentDocument!;
      // iframe 높이를 내용에 맞추므로 안쪽 세로 스크롤은 필요 없다(빈 상태 등 짧은 부품에 스크롤바가 보였다, 2026-10-09)
      doc.documentElement.style.overflow = "hidden";
      const measure = () => {
        const r = demo.getBoundingClientRect();
        let bottom = r.bottom;
        const layers = [...demo.querySelectorAll<HTMLElement>("*"), ...[...doc.body.children].filter((e) => e.id !== "app").flatMap((e) => [e as HTMLElement, ...e.querySelectorAll<HTMLElement>("*")])];
        for (const e of layers) {
          const b = e.getBoundingClientRect();
          if (b.width > 0 && b.height > 0 && b.bottom > bottom) bottom = b.bottom;
        }
        // 문서 전체 높이(scrollHeight)는 쓰지 않는다 — 미리보기가 min-height:100vh 라 iframe 높이를 그대로 되돌려 주어
        // 늘어나기만 하고 줄지 않았다(아코디언을 펼칠 때마다 빈 칸이 커짐, 사용자 2026-10-09). 데모 높이 + 삐져나온 층 + 위아래 여백만.
        setH(Math.min(3200, Math.max(260, Math.ceil(r.height + Math.max(0, bottom - r.bottom)) + 96)));
      };
      let raf = 0;
      const soon = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
      measure();
      ro?.disconnect();
      ro = new ResizeObserver(soon);
      ro.observe(demo);
      new MutationObserver(soon).observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style", "hidden", "aria-expanded", "data-state", "open"] });
    };
    const onLoad = () => { setTimeout(fit, 120); setTimeout(fit, 600); };
    f.addEventListener("load", onLoad);
    if (f.contentDocument?.readyState === "complete") onLoad();
    return () => { f.removeEventListener("load", onLoad); ro?.disconnect(); };
  }, [src]);
  return <iframe ref={ref} key={src} src={src} title={`${id} 미리보기`} className="block w-full border-0 bg-ground" style={{ height: h }} />;
}

// 데모 코드에서 import 줄과 그 뒤를 가른다 — 사용법은 import 줄 + 부품 머리 주석의 사용 예
function importLines(demo: string) { return demo.split("\n").filter((l) => /^import .*@\/components\/kit/.test(l)).join("\n"); }
function vueTemplate(demo: string) { const m = demo.match(/<template>\n?([\s\S]*?)\n?<\/template>/); return m ? m[1]!.replace(/^ {2}/gm, "") : ""; }

const TOC: [string, string][] = [["preview", "미리보기"], ["install", "설치"], ["usage", "사용법"], ["notes", "알아 둘 점"], ["krds", "KRDS 지침"]];

export default function GuideComponent() {
  const { id = "" } = useParams();
  const [fw, setFw] = useState<Fw>(() => (typeof localStorage !== "undefined" && localStorage.getItem("pp-guide-fw") === "vue" ? "vue" : "react"));
  const [how, setHow] = useState<"cli" | "manual">("cli");
  const [pm, setPm] = useState<(typeof PM)[number]>("npm");
  const reg = useQuery({ queryKey: ["kit-registry"], queryFn: async () => (await fetch("/kit-files/registry.json")).json() as Promise<KitRegistry>, staleTime: Infinity });
  const doc = useQuery({ queryKey: ["kit-doc", id], queryFn: async () => { const r = await fetch(`/kit-files/docs/${id}.json`); if (!r.ok) throw new Error("없는 부품"); return r.json() as Promise<ComponentDoc>; }, staleTime: Infinity, retry: false });
  const pickFw = (v: Fw) => { setFw(v); try { localStorage.setItem("pp-guide-fw", v); } catch { /* 저장 불가 환경 */ } };
  // 관리자 덮어쓰기(2026-10-14) — 부품 이름·숨김·순서, 문서 요약·메모·주의 사항
  const ov = useGuideOverrides();
  const metas = useMemo(() => applyMetas(reg.data?.metas ?? [], ov.components), [reg.data, ov.components]);
  const at = metas.findIndex((m) => m.id === id);
  const prev = at > 0 ? metas[at - 1] : undefined;
  const next = at >= 0 && at < metas.length - 1 ? metas[at + 1] : undefined;
  const o = ov.components[id];
  const d = doc.data && o ? { ...doc.data, ...(o.title ? { title: o.title } : {}), ...(o.summary ? { summary: o.summary } : {}), ...(o.note ? { note: o.note } : {}), ...(o.notes?.length ? { notes: o.notes } : {}) } : doc.data;
  const f = d?.[fw];
  const vueOnlyManual = fw === "vue";
  const mode = vueOnlyManual ? "manual" : how;
  const registryUrl = typeof location !== "undefined" ? `${location.origin}/kit-files/r/${id}.json` : `/kit-files/r/${id}.json`;
  // 별칭이 같은 지침을 두 번 가리킬 수 있다(toast → toast·snackbar 등) → 지침 id 기준으로 한 번만
  const krds = useMemo(() => {
    const seen = new Set<string>();
    return [id, ...(KRDS_ALIAS[id] ?? [])].flatMap((k) => KRDS_COMPONENTS.filter((c) => c.id === k)).filter((c) => !seen.has(c.id) && seen.add(c.id));
  }, [id]);
  const usage = d ? (fw === "react" ? `${importLines(d.react.demo)}\n\n${d.usage}` : `<script setup lang="ts">\n${importLines(d.vue.demo)}\n</script>\n\n<template>\n${vueTemplate(d.vue.demo).split("\n").map((l) => "  " + l).join("\n")}\n</template>`) : "";
  const toc = TOC.filter(([k]) => (k !== "notes" || (d?.notes.length ?? 0) > 0) && (k !== "krds" || krds.length > 0));
  useEffect(() => { window.scrollTo({ top: 0 }); }, [id]);

  return (
    <div className="container-hb pb-12">
      <div className="grid grid-cols-1 gap-10 pt-10 lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)_170px]">
        {/* 부품 목록 */}
        <aside className="hidden self-start pb-6 pr-2 lg:block" aria-label="부품 목록">
          <Link to="/guide/components" className="block px-3 text-sm font-semibold text-ink-4 hover:text-ink">전체 부품 {metas.length}</Link>
          {(reg.data?.groups ?? []).map(([g, label]) => (
            <div key={g} className="mt-4 border-t border-line pt-4 first-of-type:border-t-0">
              <div className="flex items-center justify-between px-3 text-xs font-bold tracking-wide text-ink-4"><span>{label}</span><span className="font-semibold tabular-nums text-ink-4">{metas.filter((m) => m.group === g).length}</span></div>
              <ul className="mt-1.5 flex flex-col">
                {metas.filter((m) => m.group === g).map((m) => (
                  <li key={m.id}><NavLink to={`/guide/components/${m.id}`} className={({ isActive }) => cn("block rounded-lg px-3 py-1.5 text-md", isActive ? "bg-ground-3 font-semibold text-ink" : "text-ink-3 hover:text-ink")}>{m.title}</NavLink></li>
                ))}
              </ul>
            </div>
          ))}
        </aside>

        <article className="min-w-0">
          {/* 들어온 동선으로 돌아가기, 기록이 없으면 부품 목록(품질 판정 NAV-013) */}
          <BackButton fallback="/guide/components" className="mb-1" />
          <nav className="text-sm text-ink-4" aria-label="경로">
            <Link to="/guide" className="pp-hit hover:text-ink">powerGuide</Link> <span aria-hidden>›</span> <Link to="/guide/components" className="pp-hit hover:text-ink">부품</Link> <span aria-hidden>›</span> {d?.title ?? id}
          </nav>
          {doc.isError ? (
            <div className="mt-10"><h1 className="text-3xl font-bold">부품을 찾을 수 없습니다</h1><p className="mt-3 text-ink-3"><Link to="/guide/components" className="underline">부품 목록</Link>에서 다시 고르세요.</p></div>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap items-start gap-3">
                {/* 문서를 받기 전엔 빈 제목 대신 부품 id 를 보여 준다(제목 자리가 비어 보이던 것) */}
                <h1 className="text-[34px] font-extrabold leading-tight tracking-[-0.03em]" aria-busy={!d}>{d?.title ?? id}</h1>
                <div className="ml-auto flex items-center gap-2">
                  <Button asChild variant="outline" size="sm" disabled={!prev}>{prev ? <Link to={`/guide/components/${prev.id}`} aria-label={`이전: ${prev.title}`}><ArrowLeft aria-hidden /></Link> : <span aria-hidden className="pointer-events-none opacity-30"><ArrowLeft /></span>}</Button>
                  <Button asChild variant="outline" size="sm" disabled={!next}>{next ? <Link to={`/guide/components/${next.id}`} aria-label={`다음: ${next.title}`}><ArrowRight aria-hidden /></Link> : <span aria-hidden className="pointer-events-none opacity-30"><ArrowRight /></span>}</Button>
                </div>
              </div>
              {d && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-4">
                  <code className="pp-code text-ink-3">{d.id}</code><span aria-hidden>·</span><Tag tone="soft">{d.groupLabel}</Tag><Tag tone="soft">{SOURCE_KO[d.source] ?? d.source}</Tag>
                </div>
              )}
              {d && <p className="mt-4 max-w-[720px] text-lg leading-[1.7] text-ink-3"><Copy as="span" text={d.note || d.summary} /></p>}

              <div className="mt-8"><LineTabs label="코드 판" value={fw} onChange={pickFw} items={[["react", "React"], ["vue", "Vue"]]} /></div>

              {/* 미리보기 */}
              <section id="preview" className="scroll-mt-19 pt-6" aria-label="미리보기">
                <div className="overflow-hidden rounded-card border border-line">
                  <Preview id={id} fw={fw} />
                  {f && <DocCode key={`${id}-${fw}`} code={f.demo} collapsed className="rounded-none border-t border-line" />}
                </div>
              </section>

              {/* 설치 */}
              <section id="install" className="scroll-mt-19 pt-9">
                <h2 className="text-2xl font-bold">설치</h2>
                <div className="mt-4"><LineTabs label="설치 방법" value={mode} onChange={setHow} items={[["cli", "명령", vueOnlyManual], ["manual", "직접 붙여 넣기"]]} /></div>
                {vueOnlyManual && <p className="mt-3 text-sm text-ink-4">Vue 판은 명령 설치가 없어 파일을 직접 붙여 넣습니다.</p>}
                {mode === "cli" && f && (
                  <div className="mt-5 flex flex-col gap-5">
                    <div className="overflow-hidden rounded-card bg-ground-2">
                      <div className="flex items-center gap-1 border-b border-line px-4 py-2.5">
                        {PM.map((p) => <button key={p} type="button" onClick={() => setPm(p)} aria-pressed={pm === p} className={cn("pp-code h-8 rounded-lg px-2.5 text-[13px]", pm === p ? "bg-ground font-semibold text-ink shadow-[0_1px_2px_rgba(0,0,0,.08)]" : "text-ink-4 hover:text-ink")}>{p}</button>)}
                      </div>
                      <CmdLine code={pmCmd(pm, `shadcn@latest add ${registryUrl}`)} />
                    </div>
                    <p className="text-md leading-[1.7] text-ink-3"><Copy as="span" text={`shadcn 이 설정된 React 프로젝트에서 실행합니다. 파일은 components/kit/ 아래에 들어갑니다.`} /></p>
                    <KitCommon />
                  </div>
                )}
                {mode === "manual" && f && (
                  <ol className="mt-5 flex flex-col gap-8">
                    {f.deps.length > 0 && (
                      <Step n={1} title="의존성을 설치합니다">
                        <div className="overflow-hidden rounded-card bg-ground-2"><CmdLine code={pmAdd(pm, f.deps)} /></div>
                      </Step>
                    )}
                    <Step n={f.deps.length > 0 ? 2 : 1} title="키트 공통 파일을 한 번 불러옵니다"><KitCommon bare /></Step>
                    <Step n={f.deps.length > 0 ? 3 : 2} title={`아래 파일 ${f.files.length}개를 components/kit/ 에 붙여 넣습니다`}>
                      <div className="flex flex-col gap-3">{f.files.map((x) => <FileBlock key={x.path} file={x} />)}</div>
                    </Step>
                  </ol>
                )}
              </section>

              {/* 사용법 */}
              <section id="usage" className="scroll-mt-19 pt-9">
                <h2 className="text-2xl font-bold">사용법</h2>
                {d && <DocCode key={`u-${id}-${fw}`} code={usage} className="mt-5" />}
              </section>

              {d && d.notes.length > 0 && (
                <section id="notes" className="scroll-mt-19 pt-9">
                  <h2 className="text-2xl font-bold">알아 둘 점</h2>
                  <ul className="mt-4 flex list-disc flex-col gap-2 pl-5 text-md leading-[1.75] text-ink-3">{d.notes.map((n, i) => <li key={i}><Copy as="span" text={n} /></li>)}</ul>
                </section>
              )}

              {krds.length > 0 && (
                <section id="krds" className="scroll-mt-19 pt-9">
                  <h2 className="text-2xl font-bold">KRDS 지침</h2>
                  {krds.map((c) => (
                    <div key={`${c.id}:${c.cat}:${c.ko}`} className="mt-5 rounded-panel border border-line p-6">
                      <div className="flex flex-wrap items-baseline gap-2"><span className="text-lg font-bold">{c.ko}</span><span className="text-sm text-ink-4">{c.en} · {c.cat}</span></div>
                      <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
                        {([["사용 지침", c.usage], ["접근성", c.a11y], ["상호작용", c.interaction], ["개발", c.dev]] as [string, string[]][]).filter(([, a]) => a.length > 0).map(([t, a]) => (
                          <div key={t}><div className="text-sm font-bold">{t}</div><ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm leading-[1.7] text-ink-3">{a.map((s, i) => <li key={i} className="text-balance">{s}</li>)}</ul></div>
                        ))}
                      </div>
                      {c.kwcag.length > 0 && <p className="mt-4 text-sm text-ink-3"><span className="font-bold text-ink">KWCAG</span> {c.kwcag.join(" · ")}</p>}
                    </div>
                  ))}
                </section>
              )}

              <nav className="mt-16 flex items-center justify-between gap-3 border-t border-line pt-6" aria-label="이전·다음 부품">
                {prev ? <Button asChild variant="outline"><Link to={`/guide/components/${prev.id}`}><ArrowLeft aria-hidden />{prev.title}</Link></Button> : <span />}
                {next ? <Button asChild variant="outline"><Link to={`/guide/components/${next.id}`}>{next.title}<ArrowRight aria-hidden /></Link></Button> : <span />}
              </nav>
            </>
          )}
        </article>

        <nav className="sticky-follow sticky top-[calc(var(--hdr-offset)+32px)] hidden self-start xl:block" aria-label="이 페이지">
          <div className="text-sm font-semibold text-ink-4">이 페이지</div>
          <ul className="mt-3 flex flex-col gap-1 border-l border-line">
            {toc.map(([k, t]) => <li key={k}><a href={`#${k}`} className="-ml-px block border-l-2 border-transparent py-1.5 pl-4 text-sm text-ink-3 hover:border-ink hover:text-ink">{t}</a></li>)}
          </ul>
        </nav>
      </div>
    </div>
  );
}

function CmdLine({ code }: { code: string }) {
  const { done, copy } = useCopy();
  return (
    <div className="relative flex items-center gap-3 px-5 py-4">
      <code className="pp-code min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-[13px] text-ink-2">{code}</code>
      <button type="button" onClick={() => copy(code)} aria-label="명령 복사" className="inline-flex size-8 shrink-0 items-center justify-center rounded-chip text-ink-4 hover:bg-ground-3 hover:text-ink">{done ? <Check className="size-4" aria-hidden /> : <CopyIcon className="size-4" aria-hidden />}</button>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-4">
      <span className="inline-flex size-7 items-center justify-center rounded-full bg-ground-3 text-sm font-bold">{n}</span>
      <div className="min-w-0"><div className="pt-0.5 text-md font-semibold">{title}</div><div className="mt-3">{children}</div></div>
    </li>
  );
}

/** 키트 공통(kit.css · 글꼴 · 아이콘) — 부품마다가 아니라 프로젝트에 한 번 */
function KitCommon({ bare }: { bare?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-3", !bare && "rounded-panel border border-line p-5")}>
      {!bare && <div className="text-md font-semibold">처음 한 번 — 키트 공통 파일</div>}
      <p className="text-md leading-[1.7] text-ink-3"><Copy as="span" text="키트 묶음의 kit.css · fonts · icons 를 프로젝트에 두고 앱 시작 파일에서 불러옵니다. 부품을 감싸는 곳에 hb-kit 클래스를 붙입니다." /></p>
      <DocCode code={`// main.tsx (Vue 는 main.ts)\nimport "./kit/kit.css";\n\n// 레이아웃 바깥에\n<div className="hb-kit">…</div>`} />
      <div><Button asChild variant="outline" size="sm"><a href="/kit-files/powerguide-kit-krds.zip" download><Download aria-hidden />키트 묶음 받기</a></Button></div>
    </div>
  );
}

function FileBlock({ file }: { file: DocFile }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-card border border-line">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex h-12 w-full items-center gap-2 bg-ground px-5 text-left text-md hover:bg-ground-2">
        <span className="pp-code font-medium">components/kit/{file.path}</span>
        <span className="text-sm text-ink-4">{file.code.split("\n").length}줄</span>
        <ChevronDown className={cn("ml-auto size-4 text-ink-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && <DocCode code={file.code} className="rounded-none border-t border-line" />}
    </div>
  );
}

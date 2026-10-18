// 와이어 상자 글 읽기 — 엔진 engine/design.py(wire_chart·wire_steps·wire_kpis…)와 같은 규칙(2026-10-18). chart 는 시험 묶음 engine/tests/wire_chart_cases.json 으로 대조(wireParse.test.ts).
// 종류 한 벌(이름·아이콘·크기·부류)은 data/wire_kinds.json — 정본 engine/wire_kinds.json 의 바이트 사본(preflight 10번).
import reg from "./data/wire_kinds.json";
import type { WireKind } from "./api";

export type KindInfo = { k: WireKind; label: string; hint: string; icon: string; size: { w: number; h: number }; cls: "visual" | "text" | "band"; pic?: boolean; form?: boolean; data?: boolean; fmt: string };
type Reg = { meta: Record<string, string[]>; chart_types: { id: string; label: string; aliases: string[] }[]; kinds: KindInfo[] };
export const REG = reg as unknown as Reg;
export const KIND_LIST = REG.kinds;
export const KIND_INFO = Object.fromEntries(KIND_LIST.map((x) => [x.k, x])) as Record<WireKind, KindInfo>;
export const CHART_LABEL = Object.fromEntries(REG.chart_types.map((t) => [t.id, t.label])) as Record<string, string>;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const META_KEY: Record<string, string> = Object.fromEntries(Object.entries(REG.meta).flatMap(([k, names]) => names.map((n) => [n.toLowerCase(), k])));
const META_RE = new RegExp(`^\\s*[-•]?\\s*(${Object.keys(META_KEY).sort((a, b) => b.length - a.length).map(esc).join("|")})\\s*[:：]\\s*(.*)$`, "i");
const ALIAS: Record<string, string> = Object.fromEntries(REG.chart_types.flatMap((t) => t.aliases.map((a) => [a.toLowerCase().replace(/ /g, ""), t.id])));

export type Meta = { type?: string; unit?: string; highlight?: string; callout?: string; message?: string; source?: string };
/** 데이터 그림 머리 줄(유형·단위·강조·말풍선·메시지·출처) → [meta, 나머지 줄] */
export function meta(d?: string): [Meta, string[]] {
  const m: Record<string, string> = {}, rest: string[] = [];
  for (const l of (d || "").split("\n")) {
    const x = l.match(META_RE);
    if (x) m[META_KEY[x[1]!.toLowerCase()]!] = x[2]!.trim();
    else rest.push(l);
  }
  return [m as Meta, rest];
}
export const isData = (k: string) => !!KIND_INFO[k as WireKind]?.data;

export const cellsOf = (l: string) => l.trim().replace(/^\|+/, "").replace(/\|+$/, "").split("|").map((c) => c.trim());
const SOURCE = /^\s*[-•]?\s*(출처|자료)\s*[:：]/;
const PIC = /^\s*(그림|장면|삽화|말풍선|figure|scene|picture|image|illustration|photo|drawing|bubble|speech bubble)\s*[:：]\s*/i;

function cellVal(x: string): [number | null, string] {
  const m = (x || "").match(/^\s*([-+−]?[\d,]*\.?\d+)\s*(\S*)/);
  if (!m) return [null, ""];
  const u = m[2] || "";
  return [parseFloat(m[1]!.replace(/,/g, "").replace("−", "-")), [...u].length <= 5 && !/\d/.test(u) ? u : ""];
}

export type Chart = { type: string; unit: string; series: string[]; rows: [string, (number | null)[]][]; highlight: string; callout: string; message: string; source: string };
const HEAD = /^\s*(구분|항목|분류|연도|년도|기간|지표|category|label|item)?\s*$/i;
/** chart 글 → 유형·계열·행 — design.wire_chart 와 같다. 옛 '라벨 | 값'·'구분 | 도입 전 | 도입 후' 그대로 읽힌다 */
export function chart(d?: string): Chart {
  const [mt, lines] = meta(d);
  let series: string[] = [], unit = mt.unit || "";
  const rows: [string, (number | null)[]][] = [];
  for (const raw of lines) {
    const l = raw.replace(/^\s*[-•]\s*/, "").trim();
    if (!l) continue;
    let c: string[];
    if (l.includes("|")) c = cellsOf(l);
    else if (/[:：]/.test(l)) { const i = l.search(/[:：]/); c = [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }
    else { const m = l.match(/^(.+?)\s+([-+−]?[\d,]*\.?\d+\s*\S{0,4})$/); c = m ? [m[1]!.trim(), m[2]!] : [l]; }
    const vals = c.slice(1).map(cellVal);
    const allNull = vals.every((v) => v[0] === null);
    if (c.length >= 2 && !rows.length && !series.length && ((allNull && c.length >= 3) || HEAD.test(c[0]!))) { series = c.slice(1, 5); continue; }
    if (!allNull) {
      if (!unit) unit = vals.length && vals[0]![0] !== null ? vals[0]![1] : "";
      rows.push([c[0]!, vals.map((v) => v[0])]);
    }
  }
  let n = series.length || Math.max(1, ...rows.map(([, vs]) => vs.reduce<number>((a, v, i) => (v !== null ? i + 1 : a), 1)));
  n = Math.max(1, Math.min(4, n));
  const out = rows.map(([lab, vs]) => [lab, [...vs, ...Array(n).fill(null)].slice(0, n)] as [string, (number | null)[]]);
  let t = ALIAS[(mt.type || "").trim().toLowerCase().replace(/ /g, "")] || "";
  if (!t) t = n === 2 ? "pair" : "bar";
  else if (t === "pair" && n !== 2) t = "bar";
  else if (t === "stacked" && n < 2) t = "bar";
  return { type: t, unit, series: series.slice(0, n), rows: out, highlight: mt.highlight || "", callout: mt.callout || "", message: mt.message || "", source: mt.source || "" };
}
/** 가로 라벨 중 찍을 번호 — 12개 이하면 모두, 많으면 처음·끝·강조·해가 바뀌는 점(엔진 design.axis_keep 과 같다, E2E 742) */
export function axisKeep(labels: string[], hl = ""): Set<number> {
  const n = labels.length;
  if (n <= 12) return new Set(labels.map((_, i) => i));
  const keep = new Set([0, n - 1]), yr = (s: string) => s.match(/^\s*((?:19|20)\d\d)/)?.[1];
  for (let i = 1; i < n; i++) if (yr(labels[i]!) && yr(labels[i]!) !== yr(labels[i - 1]!)) keep.add(i);
  labels.forEach((l, i) => { if (hl && (l === hl || l.includes(hl))) keep.add(i); });
  return keep;
}
/** 꺾은선 세로 범위 — 값 최소·최대 + 여유 12%(엔진 design.line_range) */
export function lineRange(rows: [string, (number | null)[]][], n: number): [number, number] {
  const vs = rows.flatMap(([, r]) => r.slice(0, n)).filter((v): v is number => v !== null);
  if (!vs.length) return [0, 1];
  const lo = Math.min(...vs), hi = Math.max(...vs);
  if (hi - lo < 1e-9) return [0, hi || 1];
  return [lo - (hi - lo) * 0.12, hi + (hi - lo) * 0.12];
}
export const chartNums = (c: Chart) => c.rows.reduce((a, [, vs]) => a + vs.filter((v) => v !== null).length, 0);
const WF_TOTAL = /^\s*(합계|총계|총합|계|최종|누계|total|sum)(?![\p{L}\p{N}_])/iu;
/** 폭포 → [라벨, 아래, 위, 합계인가, 증감] */
export function wfSteps(c: Chart): [string, number, number, boolean, number][] {
  let run = 0;
  return c.rows.map(([lab, vs], i) => {
    const v = vs[0] ?? 0;
    if (i === 0) { run = v; return [lab, 0, v, true, v]; }
    if (WF_TOTAL.test(lab)) { run = vs[0] ?? run; return [lab, 0, run, true, run]; }
    const a = run; run += v;
    return [lab, Math.min(a, run), Math.max(a, run), false, v];
  });
}

/** '단계: 설명' 줄 — flow·phase·hub·pyramid·cycle… */
export const steps = (d?: string) => (d || "").split("\n").map((l) => l.replace(/^\s*([-•]|\d+[.)])\s*/, "").trim()).filter(Boolean)
  .map((l) => { const i = l.search(/[:：]/); return i > 0 ? { t: l.slice(0, i).trim(), d: l.slice(i + 1).trim() } : { t: l, d: "" }; });
/** 일정 — 첫 줄 '구분 | M | M+1 …', 활동 '이름 | 시작-끝 | 막대 글', 마일스톤 '◆ 이름 | 칸' (칸은 1부터) */
export const gantt = (d?: string) => {
  const ls = (d || "").split("\n").filter((l) => l.trim());
  const head = ls.length ? cellsOf(ls[0]!).slice(1) : [];
  const rows: { t: string; a: number; e: number; l: string }[] = [], pins: { t: string; a: number }[] = [];
  for (const l of ls.slice(1)) {
    const c = cellsOf(l), m = (c[1] || "").match(/^(\d+)\s*(?:[-~–]\s*(\d+))?$/);
    if (!m) continue;
    const a = +m[1]! - 1, e = Math.max(a, +(m[2] || m[1])! - 1);
    if (c[0]!.startsWith("◆")) pins.push({ t: c[0]!.replace(/^◆\s*/, ""), a });
    else rows.push({ t: c[0]!, a, e, l: c[2] || "" });
  }
  return { head, rows, pins };
};
/** 큰 수치·달성률 — '수치 | 설명 | 칩', 머리 줄 제외 */
export const kpis = (d?: string) => meta(d)[1].map((l) => cellsOf(l.replace(/^\s*[-•]\s*/, ""))).filter((c) => c[0]).map((c) => ({ v: c[0]!, c: c[1] || "", ch: c[2] || "" }));
export const numOf = (x: string) => { const m = (x || "").match(/-?[\d,]*\.?\d+/); return m ? parseFloat(m[0].replace(/,/g, "")) : null; };
/** 비율 막대 — '이름 | 값' */
export const parts = (d?: string) => meta(d)[1].map((l) => l.replace(/^\s*[-•]\s*/, "")).filter((l) => l.trim())
  .map((l) => (l.includes("|") ? cellsOf(l) : l.split(/[:：]/, 2).map((x) => x.trim()))).map((c) => ({ t: c[0]!, v: c.length > 1 ? numOf(c[1]!) : null }))
  .filter((x): x is { t: string; v: number } => !!x.t && x.v !== null && x.v > 0);
/** 깔때기 — '단계: 설명 | 수치' */
export const funnel = (d?: string) => steps(d).filter((s) => !SOURCE.test(`${s.t}: ${s.d}`)).map((s) => { const c = s.d.includes("|") ? cellsOf(s.d) : [s.d]; return { t: s.t, d: c[0] || "", n: c[1] || "" }; });
/** 로드맵·능선 — '[기간] 이름: 설명' */
export const road = (d?: string) => steps(d).map((s) => { const m = s.t.match(/^\s*\[([^\]]+)\]\s*(.*)$/); return m ? { p: m[1]!.trim(), t: m[2]!.trim(), d: s.d } : { p: "", t: s.t, d: s.d }; });
/** 2×2 — 첫 줄 '축: 가로 | 세로', 네 칸 */
export const matrix = (d?: string) => {
  let axes: [string, string] = ["", ""];
  const q: { t: string; d: string }[] = [];
  for (const s of steps(d)) {
    if (/^(축|기준|axis|axes)$/i.test(s.t) && !axes[0]) { const c = cellsOf(s.d); axes = [c[0] || "", c[1] || ""]; } else q.push(s);
  }
  return { axes, q: q.slice(0, 4) };
};
/** 수렴-확산 — '문제 | 이름: 설명' / '해결 | 이름: 설명' (머리말 없으면 반씩) */
export const converge = (d?: string) => {
  const pr: { t: string; d: string }[] = [], so: { t: string; d: string }[] = [], plain: { t: string; d: string }[] = [];
  for (const raw of (d || "").split("\n")) {
    if (!raw.trim() || SOURCE.test(raw)) continue;
    const l = raw.replace(/^\s*[-•]\s*/, "").trim(), i = l.indexOf("|"), tag = i >= 0 ? l.slice(0, i).trim() : "", rest = i >= 0 ? l.slice(i + 1) : "";
    if (rest && /^(문제|현황|원인|AS-?IS|before)/i.test(tag)) pr.push(...steps(rest));
    else if (rest && /^(해결|개선|효과|TO-?BE|after)/i.test(tag)) so.push(...steps(rest));
    else plain.push(...steps(l));
  }
  if (!pr.length && !so.length && plain.length) { const h = Math.ceil(plain.length / 2); return { pr: plain.slice(0, h).slice(0, 4), so: plain.slice(h).slice(0, 4) }; }
  return { pr: pr.slice(0, 4), so: so.slice(0, 4) };
};
/** 표 — 칸 목록, ★ 열 */
export const table = (d?: string) => {
  const cells = meta(d)[1].filter((l) => l.includes("|") && !/^[\s|:-]+$/.test(l)).map(cellsOf);
  let star = -1;
  if (cells.length) cells[0] = cells[0]!.map((c, i) => { if (star < 0 && c.startsWith("★")) { star = i; return c.replace(/^★\s*/, ""); } return c; });
  return { cells, star };
};

const NG = /^(NG|DON'?T|기존|현행|현재|AS-?IS|전|이전|도입 전|before|✕|×|X)(?![\p{L}\p{N}_])/iu, OK = /^(OK|DO|개선|제안|TO-?BE|후|이후|도입 후|after|○|✓|O)(?![\p{L}\p{N}_])/iu;
/** 전후 비교 — 'NG | …' / 'OK | …' (머리말 없으면 번갈아) */
export function dodont(d?: string) {
  const names = ["", ""], ng: string[] = [], ok: string[] = [], plain: string[] = [];
  for (const raw of (d || "").split("\n")) {
    const l = raw.replace(/^\s*[-•]\s*/, "").trim();
    if (!l || SOURCE.test(l)) continue;
    const i = l.indexOf("|"), tag = (i >= 0 ? l.slice(0, i) : l).trim(), rest = i >= 0 ? l.slice(i + 1).trim() : "";
    if (rest && NG.test(tag)) { names[0] ||= tag; ng.push(rest); } else if (rest && OK.test(tag)) { names[1] ||= tag; ok.push(rest); } else plain.push(rest || tag);
  }
  const [a, b] = !ng.length && !ok.length ? [plain.filter((_, i) => i % 2 === 0), plain.filter((_, i) => i % 2 === 1)] : [ng, ok];
  return { nn: names[0] || "NG", on: names[1] || "OK", ng: a.slice(0, 5), ok: b.slice(0, 5) };
}
/** 진행 막대 — '항목 | 값 | 목표'(목표 없으면 100) */
export function progress(d?: string) {
  const [mt, lines] = meta(d);
  let unit = mt.unit || "";
  const out: { t: string; v: number; tg: number }[] = [];
  for (const raw of lines) {
    const l = raw.replace(/^\s*[-•]\s*/, "").trim();
    const c = l.includes("|") ? cellsOf(l) : l.split(/[:：]/, 2).map((x) => x.trim());
    if (c.length < 2) continue;
    const [v, u] = cellVal(c[1]!);
    if (v === null) continue;
    const tg = c.length > 2 ? cellVal(c[2]!)[0] : null;
    unit ||= u;
    out.push({ t: c[0]!, v, tg: tg && tg > 0 ? tg : 100 });
  }
  return { items: out.slice(0, 6), unit: unit || "%" };
}
/** 주체별 절차 — 첫 줄 '주체 | 단계…', 다음 줄 '주체 | 일 | | 일' */
export function swim(d?: string) {
  const rows = (d || "").split("\n").filter((l) => l.includes("|") && !/^[\s|:-]+$/.test(l)).map(cellsOf);
  if (rows.length < 2) return { head: [] as string[], lanes: [] as { t: string; cells: string[] }[] };
  const head = rows[0]!.slice(1, 7);
  return { head, lanes: rows.slice(1, 6).filter((r) => r[0]).map((r) => ({ t: r[0]!, cells: [...r.slice(1), ...Array(head.length).fill("")].slice(0, head.length) })) };
}
/** 화면 핀 — '그림: …' + '1 | 이름: 설명 | 30,40' */
export function pins(d?: string) {
  let pic = "";
  const out: { no: string; t: string; d: string; pos: [number, number] | null }[] = [];
  for (const l of (d || "").split("\n")) {
    if (!l.trim() || SOURCE.test(l)) continue;
    if (PIC.test(l)) { pic = l.replace(PIC, "").trim(); continue; }
    const c = l.includes("|") ? cellsOf(l.replace(/^\s*[-•]\s*/, "")) : [String(out.length + 1), l.trim()];
    const body = c.length > 1 ? c[1]! : c[0]!, i = body.search(/[:：]/);
    const m = (c[2] || "").match(/^\s*(\d+(?:\.\d+)?)\s*[,/ ]\s*(\d+(?:\.\d+)?)\s*$/);
    out.push({ no: c[0]!.replace(/\D/g, "") || String(out.length + 1), t: (i > 0 ? body.slice(0, i) : body).trim(), d: i > 0 ? body.slice(i + 1).trim() : "",
               pos: m ? [Math.min(100, +m[1]!), Math.min(100, +m[2]!)] : null });
  }
  return { pic, pins: out.slice(0, 6) };
}
/** 인용 — 문장(t, 없으면 d 첫 줄)·화자('— …' 줄) */
export function quote(t?: string, d?: string) {
  const lines = (d || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const who = (lines.find((l) => /^[—–-]/.test(l)) || "").replace(/^[—–-]+\s*/, "");
  const q = (t || "").trim() || lines.find((l) => !/^[—–-]/.test(l)) || "";
  return { q: q.replace(/^["“”'‘’「」\s]+|["“”'‘’「」\s]+$/g, ""), who };
}

// ── 2차 16종(2026-10-18, docs/와이어-유형-분석-컨텐츠모음.md §7) — 엔진 engine/wireforms.py 와 같은 읽기 규칙 ──
const lns = (d?: string) => (d || "").split("\n").map((l) => l.trim()).filter((l) => l && !l.includes("보강 필요"));
const bul = (l: string) => l.replace(/^\s*([-•·]|\d+[.)])\s+/, "").trim();
const hd = (l: string, ...names: string[]) => { const m = l.match(new RegExp(`^\\s*[-•]?\\s*(${names.join("|")})\\s*[:：]\\s*(.*)$`, "i")); return m ? m[2]!.trim() : null; };
const spl = (s?: string) => (s || "").split(/[,，、]/).map((x) => x.trim()).filter(Boolean);
const colon = (s: string): [string, string] => { const m = s.match(/^([^:：]+)[:：]\s*(.*)$/); return m ? [m[1]!.trim(), m[2]!.trim()] : [s.trim(), ""]; };
const unq = (s?: string) => (s || "").trim().replace(/^["“”'‘’「」\s]+|["“”'‘’「」\s]+$/g, "");
const PIC2 = /^\s*(그림|장면|삽화|figure|scene|picture|image|illustration|photo)\s*[:：]\s*/i;
const SRC2 = /^\s*[-•]?\s*(출처|자료|source)\s*[:：]\s*(.+)$/i;
const ARR = /\s*(?:-+>|→|=>|⇒)\s*/;
const per = (l: string): [string, string] => { const m = l.match(/^\s*\[([^\]]+)\]\s*(.*)$/); return m ? [m[1]!.trim(), m[2]!.trim()] : ["", l.trim()]; };

export type Arch = { dir: string; hl: string; zones: { name: string; nodes: { name: string; db: boolean }[] }[]; links: { a: string; b: string; label: string }[] };
export function arch(d?: string): Arch {
  const o: Arch = { dir: "가로", hl: "", zones: [], links: [] };
  for (const l of lns(d)) {
    let v = hd(l, "방향", "direction");
    if (v !== null) { o.dir = /세로|vertical|위/i.test(v) ? "세로" : "가로"; continue; }
    v = hd(l, "강조", "highlight");
    if (v !== null) { o.hl = v; continue; }
    const m = l.match(/^\s*[-•]?\s*\[([^\]]+)\]\s*(.*)$/);
    if (m) { o.zones.push({ name: m[1]!.trim(), nodes: spl(m[2]).map((x) => ({ name: x.replace(/^DB\s*[:：]\s*/i, "").trim(), db: /^DB\s*[:：]/i.test(x) })).slice(0, 8) }); continue; }
    if (ARR.test(l)) {
      const i = l.indexOf("|"), body = i >= 0 ? l.slice(0, i) : l, lab = i >= 0 ? l.slice(i + 1).trim() : "";
      const parts = body.split(ARR).map((p) => p.replace(/^[\s\-•]+|[\s\-•]+$/g, "")).filter(Boolean);
      for (let j = 0; j + 1 < parts.length; j++) o.links.push({ a: parts[j]!, b: parts[j + 1]!, label: lab });
    }
  }
  o.zones = o.zones.slice(0, 6); o.links = o.links.slice(0, 8);
  return o;
}
export const archNodes = (o: Arch) => o.zones.reduce((a, z) => a + z.nodes.length, 0);
export function zoneOf(o: Arch, name: string) {
  const n = name.trim();
  let i = o.zones.findIndex((z) => z.name === n);
  if (i < 0) i = o.zones.findIndex((z) => z.nodes.some((x) => x.name === n));
  if (i < 0) i = o.zones.findIndex((z) => !!n && (z.name.includes(n) || n.includes(z.name)));
  return i;
}

export function stepcols(d?: string) {
  const steps: { name: string; period: string; items: string[] }[] = [], plain: string[] = [];
  let result = "";
  for (const l of lns(d)) {
    const v = hd(l, "결과", "result");
    if (v !== null) { result = v; continue; }
    const m = l.match(/^\s*#+\s*(.+)$/);
    if (m) { const c = cellsOf(m[1]!); steps.push({ name: c[0]!, period: c[1] || "", items: [] }); }
    else if (steps.length) steps[steps.length - 1]!.items.push(bul(l));
    else plain.push(l);
  }
  if (!steps.length) for (const l of plain) { const [nm, rest] = colon(bul(l)); steps.push({ name: nm, period: "", items: spl(rest) }); }
  return { steps: steps.slice(0, 6).map((s) => ({ ...s, items: s.items.slice(0, 6) })), result };
}

const DER: [RegExp, number][] = [[/^(특성|현황|환경|배경|요구|이슈|문제|여건)/, 0], [/^(시사점|성공\s*요인|핵심|고려|과제)/, 1], [/^(전략|방안|추진|대응)/, 2]];
export function derive(d?: string) {
  const names = ["", "", ""], cols: string[][] = [[], [], []];
  for (const l of lns(d)) {
    if (!l.includes("|")) continue;
    const b = bul(l), i = b.indexOf("|"), tag = b.slice(0, i).trim(), rest = b.slice(i + 1).trim();
    const hit = DER.find(([re]) => re.test(tag));
    if (hit) { names[hit[1]] ||= tag; cols[hit[1]]!.push(rest); }
  }
  const strats = cols[2]!.map((s, k) => { const m = s.match(/^\s*(\d{1,2})[.)]?\s+(.*)$/); const [nm, det] = colon(m ? m[2]! : s); return { no: m ? m[1]!.padStart(2, "0") : String(k + 1).padStart(2, "0"), name: nm, items: spl(det).slice(0, 4) }; });
  return { names: [names[0] || "특성", names[1] || "시사점", names[2] || "전략"], feats: cols[0]!.slice(0, 5), imps: cols[1]!.slice(0, 5), strats: strats.slice(0, 5) };
}

export function askanswer(d?: string) {
  let pic = "";
  const qa: { who: string; q: string; a: string }[] = [];
  for (const l of lns(d)) {
    if (PIC2.test(l)) { pic = l.replace(PIC2, "").trim(); continue; }
    if (l.includes("|")) { const c = cellsOf(bul(l)); qa.push({ who: /^(질문|Q)$/i.test(c[0]!) ? "" : c[0]!, q: unq(c[1]), a: c[2] || "" }); }
  }
  return { pic, qa: qa.slice(0, 4) };
}

export function linkage(d?: string) {
  const o = { left: [] as { name: string; items: string[] }[], right: [] as { name: string; items: string[] }[], center: [] as string[], ways: ["", ""] as [string, string], pic: "" };
  for (const l of lns(d)) {
    if (PIC2.test(l)) { o.pic = l.replace(PIC2, "").trim(); continue; }
    const v = hd(l, "방식", "연계\\s*방식", "interface");
    if (v !== null) { const w = v.includes("|") ? cellsOf(v) : spl(v); o.ways = [w[0] || "", w[1] || w[0] || ""]; continue; }
    if (!l.includes("|")) continue;
    const b = bul(l), i = b.indexOf("|"), tag = b.slice(0, i).trim(), rest = b.slice(i + 1).trim();
    const side = /^(왼쪽|좌|left)/i.test(tag) ? "left" : /^(오른쪽|우|right)/i.test(tag) ? "right" : /^(가운데|중앙|기능|center)/i.test(tag) ? "center" : "";
    if (side === "center") o.center.push(rest);
    else if (side) { const [nm, items] = colon(rest); o[side].push({ name: nm, items: spl(items).slice(0, 6) }); }
  }
  return { ...o, left: o.left.slice(0, 8), right: o.right.slice(0, 8), center: o.center.slice(0, 6) };
}

export function org(d?: string) {
  let root: { name: string; note: string } | null = null;
  const teams: { name: string; role: string; n: string }[] = [], sup: string[] = [];
  for (const l of lns(d)) {
    const b = bul(l);
    let m = b.match(/^(총괄|총괄\s*책임자?|PM|사업\s*책임자|사업\s*관리|책임자|대표)\s*[:：]\s*(.*)$/i);
    if (m && !root) { const c = cellsOf(m[2]!); root = { name: c[0]!, note: c[1] || "" }; continue; }
    m = b.match(/^(지원|지원\s*조직|자문|자문단|협력)\s*[:：]\s*(.*)$/);
    if (m) { sup.push(...spl(m[2]!.replace(/\|/g, ","))); continue; }
    const [nm, rest] = colon(b), c = rest ? cellsOf(rest) : [""];
    teams.push({ name: nm, role: c[0] || "", n: c[1] || "" });
  }
  return { root, teams: teams.slice(0, 7), sup: sup.slice(0, 3) };
}

export function voices(d?: string) {
  let pic = "", src = "";
  const says: string[] = [];
  for (const l of lns(d)) {
    if (PIC2.test(l)) { pic = l.replace(PIC2, "").trim(); continue; }
    const m = l.match(SRC2);
    if (m) { src = m[2]!.trim(); continue; }
    const s = unq(bul(l));
    if (s) says.push(s);
  }
  return { pic, says: says.slice(0, 6), src };
}

const BEFORE = /^(AS-?IS|기존|현행|이전|전|before)(?![\p{L}\p{N}_])/iu, AFTER = /^(TO-?BE|개선|이후|후|제안|after)(?![\p{L}\p{N}_])/iu;
type ShiftSide = { name: string; pic: string; note: string };
export function screenshift(d?: string) {
  const o = { before: null as ShiftSide | null, after: null as ShiftSide | null, changes: [] as { label: string; value: string }[] };
  for (const l of lns(d)) {
    if (!l.includes("|")) continue;
    const c = cellsOf(bul(l)), tag = c[0]!, rest = c.slice(1);
    const pic = rest.find((x) => PIC2.test(x))?.replace(PIC2, "").trim() || "", note = rest.filter((x) => x && !PIC2.test(x)).join(" / ");
    if (BEFORE.test(tag)) o.before = { name: tag, pic, note };
    else if (AFTER.test(tag)) o.after = { name: tag, pic, note };
    else if (/^(변화|효과|차이|change)/i.test(tag) && rest.length) o.changes.push({ label: rest.length > 1 ? rest[0]! : "", value: rest[rest.length - 1]! });
  }
  o.changes = o.changes.slice(0, 3);
  return o;
}

const TRI_START = /^(이슈|문제|현황|원인|과제|방안|해결|대응|효과|기대|결과|개선)/;
export function triad(d?: string) {
  let hl = "", head: string[] = [];
  const rows: string[][] = [];
  for (const l of lns(d)) {
    const v = hd(l, "강조", "highlight");
    if (v !== null) { hl = v; continue; }
    if (!l.includes("|")) continue;
    const c = [...cellsOf(bul(l)), "", "", ""].slice(0, 3);
    // 머리 줄 — 이슈·방안·효과… 로 시작하는 칸이 둘 이상('효과(도입 전 → 도입 후)'도). 머리를 또 적은 줄은 버린다(E2E 742) — 엔진 wireforms.triad 와 같다
    if (!head.length && !rows.length && c.filter((x) => [...x].length <= 24 && TRI_START.test(x)).length >= 2) { head = c; continue; }
    if (head.length && c.every((x, i) => x.replace(/\s+/g, "") === (head[i] || "").replace(/\s+/g, ""))) continue;
    rows.push(c);
  }
  return { head: ["이슈", "방안", "효과"].map((x, i) => head[i] || x), rows: rows.slice(0, 5), hl };
}

export type FNode = { type: "step" | "if" | "end"; text: string; yes?: string; no?: string };
export function flowchart(d?: string) {
  const nodes: FNode[] = [];
  for (const l of lns(d)) {
    const b = bul(l);
    if (/^[?？◇]/.test(b)) {
      const c = cellsOf(b.replace(/^[?？◇\s]+/, ""));
      let yes = "", no = "";
      for (const x of c.slice(1)) {
        const y = x.match(/^(예|네|yes|y|충족|통과|적합)\s*(?:→|->|:)\s*(.*)$/i);
        if (y) { yes = y[2]!.trim(); continue; }
        const n = x.match(/^(아니오|아니요|no|n|미충족|불통과|부적합|실패)\s*(?:→|->|:)\s*(.*)$/i);
        if (n) no = n[2]!.trim();
      }
      nodes.push({ type: "if", text: c[0]!, yes, no });
    } else if (/^[◎●■]/.test(b)) nodes.push({ type: "end", text: b.replace(/^[◎●■\s]+/, "").trim() });
    else nodes.push({ type: "step", text: b });
  }
  return { nodes: nodes.slice(0, 9) };
}
export function flowIndex(nodes: FNode[], name?: string) {
  const n = (name || "").trim();
  if (!n) return -1;
  const i = nodes.findIndex((x) => x.text === n);
  return i >= 0 ? i : nodes.findIndex((x) => x.text.includes(n) || n.includes(x.text));
}

export function rowgrid(d?: string) {
  let hl = "", head: string[] = [];
  const rows: { name: string; cells: string[]; chips: boolean }[] = [];
  for (const l of lns(d)) {
    const v = hd(l, "강조", "highlight");
    if (v !== null) { hl = v; continue; }
    const b = bul(l);
    if (b.includes("|")) {
      const c = cellsOf(b);
      if (!rows.length && !head.length && /^(구분|영역|분야|항목|관점|단계)?$/.test(c[0]!)) { head = c.slice(1, 7); continue; }
      rows.push({ name: c[0]!, cells: c.slice(1, 7), chips: false });
    } else { const [nm, rest] = colon(b); if (rest) rows.push({ name: nm, cells: spl(rest).slice(0, 8), chips: true }); }
  }
  return { head, rows: rows.slice(0, 6), hl };
}

export function timeline(d?: string) {
  let goal = "", hl = "";
  const ev: { p: string; t: string; d: string; side: string }[] = [];
  for (const l of lns(d)) {
    const v = hd(l, "목표", "goal");
    if (v !== null) { goal = v; continue; }
    const h = hd(l, "강조", "highlight");   // 머리 줄 — 사건으로 읽지 않는다(E2E 742)
    if (h !== null) { hl = h; continue; }
    const [p, rest] = per(bul(l));
    let c = cellsOf(rest), side = "";
    if (c.length > 1 && /^(위|아래|상|하|up|down)$/i.test(c[c.length - 1]!)) { side = /^(위|상|up)$/i.test(c[c.length - 1]!) ? "up" : "down"; c = c.slice(0, -1); }
    const [t, x] = colon(c.join(" "));
    ev.push({ p, t, d: x, side });
  }
  return { ev: ev.slice(0, 8), goal, hl };
}

export function stairs(d?: string) {
  let who = "";
  const st: { p: string; t: string; d: string }[] = [];
  for (const l of lns(d)) {
    const v = hd(l, "인물", "person");
    if (v !== null || PIC2.test(l)) { who = v ?? l.replace(PIC2, "").trim(); continue; }
    const [p, rest] = per(bul(l)), [t, x] = colon(rest);
    st.push({ p, t, d: x });
  }
  return { steps: st.slice(0, 6), who };
}

export function consortium(d?: string) {
  const cos: { name: string; lead: boolean; share: string; role: string; note: string }[] = [];
  for (const l of lns(d)) {
    const c = cellsOf(bul(l));
    if (!c[0]) continue;
    const share = c.slice(1).find((x) => /^\d+(?:\.\d+)?\s*%$/.test(x)) || "", rest = c.slice(1).filter((x) => x && x !== share);
    cos.push({ name: c[0].replace(/^[★☆*\s]+/, "").trim(), lead: c[0].startsWith("★"), share, role: rest[0] || "", note: rest[1] || "" });
  }
  return { cos: cos.slice(0, 4) };
}

export function trace(d?: string) {
  let head: string[] = [];
  const rows: [string, string, string[]][] = [];
  for (const l of lns(d)) {
    if (!l.includes("|")) continue;
    const c = cellsOf(bul(l));
    if (!head.length && !rows.length && /^(기능\s*)?(요구(사항)?|요건|제약(사항)?|ID|구분|항목)$/i.test(c[0]!)) { head = c.slice(0, 3); continue; }
    if (c.length >= 3) rows.push([c[0]!, c[1]!, spl(c[2])]);
    else if (c.length === 2) rows.push([c[0]!, "", spl(c[1])]);
  }
  const left: string[] = [], mid: string[] = [], right: string[] = [];
  for (const [a, m, rs] of rows) { if (!left.includes(a)) left.push(a); if (m && !mid.includes(m)) mid.push(m); for (const r of rs) if (!right.includes(r)) right.push(r); }
  const three = mid.length > 0, dft = three ? ["요구사항", "상세", "방안"] : ["요구사항", "방안"];
  const h = head.length ? (three ? [...head, "", "", ""].slice(0, 3) : [head[0]!, head[head.length - 1]!]) : dft;
  return { head: dft.map((x, i) => h[i] || x), rows: rows.slice(0, 12), left: left.slice(0, 10), mid: mid.slice(0, 10), right: right.slice(0, 8) };
}

export function twinhub(d?: string) {
  const hubs = lns(d).map((l) => {
    const b = bul(l), i = b.indexOf("|"), tag = i >= 0 ? b.slice(0, i).trim() : "", rest = i >= 0 ? b.slice(i + 1).trim() : b;
    const [nm, nodes] = colon(rest);
    return { label: tag, center: nm, nodes: spl(nodes).slice(0, 8) };
  });
  return { hubs: hubs.slice(0, 2) };
}

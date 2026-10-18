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

// 와이어 상자 스케치 — 종류마다 회색조 모양(엔진 design.py wire_png 와 같은 구성, 2026-10-18). 글 읽기는 wireParse.ts.
// 흐름·일정·단계·수치는 글이 많아 HTML 로, 나머지 도식은 상자 px 크기 그대로의 SVG(1단위 = 1px)로 그린다.
import type { ReactNode } from "react";
import type { WireBlock } from "./api";
import { cn } from "./ui";
import * as P from "./wireParse";

/** 큰 수치 글자 크기 — 칸이 좁으면(썸네일·모바일) 글자 수에 맞춰 줄인다. 칸 폭(container 단위)을 넘지 않게 — "290만개" 가 칸 밖으로 나가던 문제(종합평가 2-7) */
export const fitBig = (px: number, text: string) => `min(${px}px, calc(96cqi / ${Math.max(1, [...text].length) * 0.62}))`;

// 회색 단계(밝음 → 어두움) · 글
const G = ["#f3f4f6", "#e5e7eb", "#cfd4da", "#a3abb5", "#737c88", "#454c57", "#262b33"] as const;
const INK = "#1f2329", SUB = "#5b636e";
const tone = (i: number, n: number, lo = 2, hi = 5) => G[Math.round(lo + ((hi - lo) * i) / Math.max(1, n - 1))]!;
const light = (c: string) => G.indexOf(c as (typeof G)[number]) < 4;

/** 글자 폭 어림 — 한글·한자 1em, 숫자·대문자 0.62em, 나머지 0.5em */
const cw = (ch: string) => (/[ᄀ-ᇿ㄰-㆏가-힯一-鿿]/.test(ch) ? 0.96 : /[A-Z0-9%#@]/.test(ch) ? 0.62 : ch === " " ? 0.3 : 0.52);
const tw = (s: string, size: number) => [...s].reduce((a, c) => a + cw(c), 0) * size;
/** 폭 w 안에서 띄어쓰기 단위로 줄 나누기(넘치는 낱말은 글자 단위), max 줄까지 */
function wrap(s: string, w: number, size: number, max = 3): string[] {
  const out: string[] = [];
  for (const raw of s.split("\n")) {
    let cur = "";
    for (const word of raw.split(" ")) {
      const nx = cur ? `${cur} ${word}` : word;
      if (tw(nx, size) <= w) { cur = nx; continue; }
      if (cur) out.push(cur);
      cur = "";
      for (const ch of word) { if (cur && tw(cur + ch, size) > w) { out.push(cur); cur = ""; } cur += ch; }
    }
    if (cur) out.push(cur);
  }
  return out.slice(0, Math.max(1, max));
}
/** 여러 줄 글 — y 는 첫 줄 위쪽. 돌려주는 값은 다음 y */
function Tx({ x, y, w, s, t, fill = SUB, bold, anchor = "start", max = 3, lh = 1.25 }: {
  x: number; y: number; w: number; s: number; t?: string; fill?: string; bold?: boolean; anchor?: "start" | "middle" | "end"; max?: number; lh?: number;
}) {
  if (!t || w < s) return null;
  const ls = wrap(t, w, s, max);
  return <text x={x} y={y} fontSize={s} fontWeight={bold ? 700 : 400} fill={fill} textAnchor={anchor} dominantBaseline="hanging">
    {ls.map((l, i) => <tspan key={i} x={x} dy={i ? s * lh : 0}>{l}</tspan>)}
  </text>;
}
const linesH = (t: string | undefined, w: number, s: number, max = 3, lh = 1.25) => (t ? wrap(t, w, s, max).length * s * lh : 0);
const fmt = (v: number, unit = "") => (Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v).toLocaleString("ko-KR") : v.toLocaleString("ko-KR", { maximumFractionDigits: 1 })) + (unit === "%" ? "%" : "");

type Box = { b: WireBlock; fs: number; W: number; H: number };
/** 위 제목(있으면) — 도식 영역의 시작 y */
function head({ b, fs, W }: Box, nodes: ReactNode[]): number {
  if (!b.t) return fs * 0.4;
  nodes.push(<Tx key="t" x={fs * 0.6} y={fs * 0.5} w={W - fs * 1.2} s={fs * 0.98} t={b.t} fill={INK} bold max={2} lh={1.2} />);
  return fs * 0.5 + linesH(b.t, W - fs * 1.2, fs * 0.98, 2, 1.2) + fs * 0.4;
}

function chartSvg(x: Box, c: P.Chart, out: ReactNode[]) {
  const { fs, W, H } = x;
  const s = fs * 0.66, top = head(x, out), pad = fs * 0.6, hl = c.highlight;
  const hot = (lab: string) => !!hl && (hl === lab || lab.includes(hl));
  let bot = H - fs * 0.4;
  if (c.source) { out.push(<Tx key="src" x={pad} y={bot - s} w={W - pad * 2} s={s * 0.92} t={`출처: ${c.source}`} max={1} />); bot -= s * 1.4; }
  const n = c.rows[0]?.[1].length ?? 1, t = c.type, rows = c.rows.slice(0, t === "line" ? 60 : 10), keep = P.axisKeep(rows.map((r) => r[0]), hl);   // 꺾은선은 점이 많아도 모두, 라벨은 처음·끝·강조·해 바뀜(엔진 axis_keep)
  const names = c.series.length ? c.series : t === "pair" ? ["이전", "지금"] : Array.from({ length: n }, (_, i) => `계열${i + 1}`);
  const sTone = (j: number) => (t === "pair" ? (j ? G[5] : G[2]) : (t === "line" || t === "combo") && j === n - 1 ? G[6] : tone(j, n, 2, 5));
  if (["pair", "stacked", "combo"].includes(t) || (n > 1 && ["bar", "line"].includes(t))) {   // 범례
    let lx = pad;
    names.forEach((nm, j) => {
      out.push(<rect key={`lg${j}`} x={lx} y={bot - s * 0.95} width={s * 0.8} height={s * 0.8} fill={sTone(j)} />, <Tx key={`lt${j}`} x={lx + s} y={bot - s * 1.05} w={W} s={s * 0.9} t={nm} max={1} />);
      lx += s * 1.6 + tw(nm, s * 0.9);
    });
    bot -= s * 1.5;
  }
  if (c.unit && c.unit !== "%") out.push(<Tx key="u" x={W - pad} y={top - s * 0.2} w={W} s={s * 0.9} t={`(단위: ${c.unit})`} anchor="end" max={1} />);
  const v0 = (vs: (number | null)[], j = 0) => vs[j] ?? 0;
  if (t === "donut") {
    const vs = rows.slice(0, 8).map(([l, v]) => [l, Math.max(0, v0(v))] as const), tot = vs.reduce((a, [, v]) => a + v, 0) || 1;
    const r = Math.max(4, Math.min((W - pad * 2) * 0.24, (bot - top) * 0.46)), cx = pad + r, cy = (top + bot) / 2;
    let a0 = -Math.PI / 2;
    vs.forEach(([lab, v], i) => {
      const a1 = a0 + (2 * Math.PI * v) / tot, big = a1 - a0 > Math.PI ? 1 : 0;
      const p = (a: number, rr: number) => `${cx + rr * Math.cos(a)} ${cy + rr * Math.sin(a)}`;
      out.push(<path key={`d${i}`} d={`M${p(a0, r)}A${r} ${r} 0 ${big} 1 ${p(a1 - 0.0001, r)}L${p(a1 - 0.0001, r * 0.56)}A${r * 0.56} ${r * 0.56} 0 ${big} 0 ${p(a0, r * 0.56)}Z`}
        fill={hot(lab) ? G[6] : tone(i, vs.length, 5, 2)} stroke="#fff" strokeWidth={1.5} />);
      out.push(<rect key={`dl${i}`} x={cx + r + fs * 0.8} y={cy - vs.length * s * 0.75 + i * s * 1.5} width={s * 0.8} height={s * 0.8} fill={hot(lab) ? G[6] : tone(i, vs.length, 5, 2)} />,
        <Tx key={`dt${i}`} x={cx + r + fs * 0.8 + s * 1.2} y={cy - vs.length * s * 0.75 + i * s * 1.5 - s * 0.1} w={W - (cx + r + fs * 2)} s={s} max={1} fill={hot(lab) ? INK : SUB} bold={hot(lab)}
          t={`${lab}  ${fmt(v, c.unit)}${c.unit === "%" ? "" : ` (${Math.round((v / tot) * 100)}%)`}`} />);
      a0 = a1;
    });
    if (c.callout) out.push(<Tx key="co" x={cx} y={cy - s * 0.6} w={r} s={s * 1.3} t={c.callout} fill={INK} bold anchor="middle" max={1} />);
    return;
  }
  if (t === "hbar") {
    const vs = [...rows].map(([l, v]) => [l, v0(v)] as const).sort((a, b) => b[1] - a[1]).slice(0, 8), mx = Math.max(...vs.map((x) => x[1]), 1);
    const lw = (W - pad * 2) * 0.26, rh = (bot - top) / vs.length;
    vs.forEach(([lab, v], i) => {
      const y = top + i * rh, on = hot(lab) || (!hl && i === 0), bw = Math.max(2, ((W - pad * 2 - lw - fs * 3) * v) / mx);
      out.push(<Tx key={`hl${i}`} x={pad} y={y + rh / 2 - s / 2} w={lw - s} s={s} t={lab} max={1} fill={on ? INK : SUB} bold={on} />,
        <rect key={`hb${i}`} x={pad + lw} y={y + rh * 0.2} width={bw} height={rh * 0.6} fill={on ? G[6] : G[3]} />,
        <Tx key={`hv${i}`} x={pad + lw + bw + s * 0.4} y={y + rh / 2 - s / 2} w={fs * 3} s={s} t={fmt(v, c.unit)} max={1} fill={INK} bold={on} />);
      if (on && c.callout) out.push(<Tx key="co" x={W - pad} y={y + rh / 2 - s / 2} w={W} s={s} t={c.callout} fill={INK} bold anchor="end" max={1} />);
    });
    return;
  }
  // 세로 축 유형 — 막대·짝·누적·폭포·꺾은선·막대+선
  const many = t === "line" && rows.length > 12, base = bot - s * 1.5, yTop = top + s * (many ? 0.8 : 1.6), cwid = (W - pad * 2) / Math.max(1, rows.length);
  const cx = (i: number) => pad + (i + 0.5) * cwid;
  out.push(<line key="ax" x1={pad} x2={W - pad} y1={base} y2={base} stroke={G[3]} />);
  rows.forEach(([lab], i) => keep.has(i) && out.push(<Tx key={`xl${i}`} x={cx(i)} y={base + s * 0.3} w={many ? tw(lab, s * 0.9) + 4 : cwid * 0.95} s={s * 0.9} t={lab} max={1} anchor="middle" fill={hot(lab) ? INK : SUB} bold={hot(lab)} />));
  let mark: [number, number] | null = null;
  if (t === "waterfall") {
    const st = P.wfSteps(c).slice(0, rows.length), lo = Math.min(0, ...st.map((x) => x[1])), hi = Math.max(...st.map((x) => x[2]), 1);
    const Y = (v: number) => base - ((base - yTop) * (v - lo)) / (hi - lo || 1);
    st.forEach(([lab, a, e, total, dv], i) => {
      const bx = cx(i) - cwid * 0.3;
      out.push(<rect key={`w${i}`} x={bx} y={Y(e)} width={cwid * 0.6} height={Math.max(2, Y(a) - Y(e))} fill={hot(lab) ? G[6] : total ? G[5] : dv >= 0 ? G[3] : G[1]} stroke={!total && dv < 0 ? G[3] : "none"} />,
        <Tx key={`wv${i}`} x={cx(i)} y={Y(e) - s * 1.2} w={cwid} s={s * 0.9} anchor="middle" max={1} fill={INK} bold={total} t={total ? fmt(e, c.unit) : `${dv >= 0 ? "+" : "−"}${fmt(Math.abs(dv), c.unit)}`} />);
      if (i) { const p = st[i - 1]!, pv = p[3] || p[4] >= 0 ? p[2] : p[1]; out.push(<line key={`wc${i}`} x1={cx(i - 1) + cwid * 0.3} x2={bx} y1={Y(pv)} y2={Y(pv)} stroke={G[3]} strokeDasharray="3 2" />); }
      if (hot(lab) || (!hl && i === st.length - 1)) mark = [cx(i), Y(e) - s * 1.2];
    });
  } else {
    const nb = t === "line" ? 0 : t === "combo" ? n - 1 : t === "stacked" ? 1 : n, stack = t === "stacked";
    const mx = Math.max(1, ...rows.map(([, vs]) => (stack ? vs.reduce<number>((a, v) => a + (v ?? 0), 0) : Math.max(...vs.slice(0, nb || n).map((v) => v ?? 0)))));
    const [lo, hi] = t === "line" ? P.lineRange(rows, n) : [0, mx];   // 꺾은선은 값 범위로(0 기준 아님) — 엔진 line_range
    const Y = (v: number) => base - ((base - yTop) * (v - lo)) / (hi - lo || 1);
    rows.forEach(([lab, vs], i) => {
      if (!nb) return;
      const bw = (cwid * 0.7) / nb;
      let acc = 0;
      for (let j = 0; j < (stack ? n : nb); j++) {
        const v = v0(vs, j);
        if (stack) { out.push(<rect key={`s${i}${j}`} x={cx(i) - cwid * 0.3} y={Y(acc + v)} width={cwid * 0.6} height={Math.max(0, Y(acc) - Y(acc + v))} fill={hot(lab) && j === n - 1 ? G[6] : sTone(j)} stroke="#fff" />); acc += v; continue; }
        const bx = cx(i) - cwid * 0.35 + j * bw, on = n === 1 ? hot(lab) || (!hl && i === rows.length - 1) : hot(lab) && j === nb - 1;
        out.push(<rect key={`b${i}${j}`} x={bx + 1} y={Y(v)} width={Math.max(1, bw - 2)} height={Math.max(1, base - Y(v))} fill={on ? G[6] : n === 1 ? G[3] : sTone(j)} />,
          <Tx key={`bv${i}${j}`} x={bx + bw / 2} y={Y(v) - s * 1.1} w={bw + s} s={s * 0.82} anchor="middle" max={1} fill={INK} bold={on} t={fmt(v, c.unit)} />);
      }
      if (stack) out.push(<Tx key={`sv${i}`} x={cx(i)} y={Y(acc) - s * 1.1} w={cwid} s={s * 0.85} anchor="middle" max={1} fill={INK} t={fmt(acc, c.unit)} />);
      if (hot(lab) || (!hl && i === rows.length - 1)) mark = [cx(i), Y(stack ? acc : Math.max(...vs.slice(0, nb).map((v) => v ?? 0))) - s * 1.2];
    });
    if (t === "line" || t === "combo") {
      for (const j of t === "line" ? Array.from({ length: n }, (_, k) => k) : [n - 1]) {
        const lm = Math.max(1, ...rows.map(([, vs]) => v0(vs, j)));
        const Yl = t === "line" ? Y : (v: number) => base - ((base - yTop) * 0.9 * v) / lm;
        const pts = rows.map(([, vs], i) => [cx(i), Yl(v0(vs, j))] as const);
        out.push(<polyline key={`l${j}`} points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={sTone(j)} strokeWidth={2} />);
        pts.forEach(([px, py], i) => {
          const big = hot(rows[i]![0]) || (!hl && i === pts.length - 1 && j === n - 1);
          out.push(<circle key={`p${j}${i}`} cx={px} cy={py} r={big ? s * 0.42 : many ? s * 0.14 : s * 0.28} fill="#fff" stroke={sTone(j)} strokeWidth={2} />);
          if (big || ((n === 1 || t === "combo") && !many) || (many && (i === 0 || i === pts.length - 1) && j === n - 1)) out.push(<Tx key={`pv${j}${i}`} x={px} y={py - s * 1.4} w={cwid} s={s * 0.82} anchor="middle" max={1} fill={INK} bold={big} t={fmt(v0(rows[i]![1], j), c.unit)} />);
          if (big && j === n - 1) mark = [px, py - s * 1.4];
        });
      }
    }
  }
  if (c.callout && mark) {
    const [mx_, my] = mark as [number, number], w_ = tw(c.callout, s * 0.85) + s;
    out.push(<g key="call"><rect x={mx_ - w_ / 2} y={my - s * 1.5} width={w_} height={s * 1.3} rx={s * 0.65} fill={G[6]} />
      <Tx x={mx_} y={my - s * 1.3} w={w_} s={s * 0.85} t={c.callout} fill="#fff" bold anchor="middle" max={1} /></g>);
  }
}

/** 종류별 SVG 도식. 그릴 거리가 모자라면 null(글 상자로 보인다) */
function svgFor(x: Box): ReactNode[] | null {
  const { b, fs, W, H } = x, out: ReactNode[] = [], s = fs * 0.72, pad = fs * 0.6;
  const st = P.steps(b.d);
  switch (b.k) {
    case "chart": {
      const c = P.chart(b.d);
      if (P.chartNums(c) < 2) return null;
      chartSvg(x, c, out);
      return out;
    }
    case "fishbone": {
      if (st.length < 2) return null;
      const hw = Math.min(W * 0.24, fs * 9), my = H / 2, hx = W - hw - pad;
      out.push(<line key="sp" x1={pad} x2={hx} y1={my} y2={my} stroke={G[5]} strokeWidth={3} />, <rect key="hd" x={hx + 4} y={my - fs * 1.6} width={hw} height={fs * 3.2} rx={4} fill={G[6]} />,
        <Tx key="ht" x={hx + 4 + fs * 0.4} y={my - fs * 1.2} w={hw - fs * 0.8} s={fs * 0.8} t={b.t} fill="#fff" bold max={2} />);
      const top = st.filter((_, i) => i % 2 === 0), bot = st.filter((_, i) => i % 2 === 1);
      [[-1, top], [1, bot]].forEach(([side, g]) => (g as typeof st).forEach((c, i, arr) => {
        const seg = (hx - pad) / arr.length, bx = pad + seg * (i + 0.7), ey = (side as number) < 0 ? fs * 0.8 : H - fs * 0.8, sx = bx - seg * 0.35;
        out.push(<line key={`f${side}${i}`} x1={bx} y1={my} x2={sx} y2={ey} stroke={G[3]} strokeWidth={2} />,
          <Tx key={`fc${side}${i}`} x={sx} y={(side as number) < 0 ? ey - s * 0.9 : ey - s * 0.1} w={seg * 0.9} s={s} t={c.t} fill={INK} bold max={1} />,
          <Tx key={`fd${side}${i}`} x={(bx + sx) / 2 + s * 0.4} y={(my + ey) / 2 - s * 0.6} w={seg * 0.6} s={s * 0.85} t={c.d.replace(/[,，]\s*/g, "\n")} max={3} />);
      }));
      return out;
    }
    case "hub": {
      if (st.length < 3) return null;
      const cx = W / 2, cy = H / 2, r = Math.min(W, H) * 0.15, rx = W * 0.36, ry = H * 0.36, nw = Math.min(W * 0.26, fs * 9);
      st.slice(0, 8).forEach((c, i, a) => {
        const an = -Math.PI / 2 + (2 * Math.PI * i) / a.length, px = cx + rx * Math.cos(an), py = cy + ry * Math.sin(an);
        out.push(<line key={`hl${i}`} x1={cx} y1={cy} x2={px} y2={py} stroke={G[3]} />, <rect key={`hr${i}`} x={px - nw / 2} y={py - fs * 1.2} width={nw} height={fs * 2.4} rx={4} fill={G[0]} stroke={G[2]} />,
          <Tx key={`ht${i}`} x={px} y={py - fs * 0.95} w={nw - 8} s={s} t={c.t} fill={INK} bold anchor="middle" max={1} />, <Tx key={`hd${i}`} x={px} y={py + fs * 0.05} w={nw - 8} s={s * 0.85} t={c.d} anchor="middle" max={1} />);
      });
      out.push(<circle key="c" cx={cx} cy={cy} r={r} fill={G[6]} />, <Tx key="ct" x={cx} y={cy - fs * 0.5} w={r * 1.7} s={fs * 0.8} t={b.t} fill="#fff" bold anchor="middle" max={2} />);
      return out;
    }
    case "pyramid": {
      if (st.length < 2) return null;
      const top = head(x, out), ss = st.slice(0, 5), n = ss.length, pw = W * 0.48, lh = (H - top - pad) / n, pc = pad + pw / 2;
      ss.forEach((c, i) => {
        const y = top + i * lh, t0 = i / n, t1 = (i + 1) / n, col = tone(i, n, 6, 3);
        out.push(<polygon key={`p${i}`} points={`${pc - (pw / 2) * t0},${y + 1} ${pc + (pw / 2) * t0},${y + 1} ${pc + (pw / 2) * t1},${y + lh - 1} ${pc - (pw / 2) * t1},${y + lh - 1}`} fill={col} />,
          <Tx key={`pt${i}`} x={pc} y={y + lh * (i ? 0.35 : 0.55)} w={pw * t1} s={s * 0.9} t={c.t} fill={light(col) ? INK : "#fff"} bold anchor="middle" max={1} />,
          <line key={`pl${i}`} x1={pc + (pw / 2) * ((t0 + t1) / 2) + 4} x2={pad + pw + fs * 0.6} y1={y + lh / 2} y2={y + lh / 2} stroke={G[2]} />,
          <Tx key={`pd${i}`} x={pad + pw + fs * 0.8} y={y + lh / 2 - s * 0.6} w={W - pw - fs * 2} s={s * 0.9} t={c.d} max={2} />);
      });
      return out;
    }
    case "matrix": {
      const { axes, q } = P.matrix(b.d);
      if (q.length < 2) return null;
      let top = head(x, out);
      if (axes[1]) { out.push(<Tx key="ay" x={pad + fs} y={top} w={W} s={s * 0.9} t={`↑ ${axes[1]}`} fill={INK} max={1} />); top += s * 1.5; }
      const gx = pad + fs, gy = H - fs * 1.4, gw = (W - gx - pad) / 2, gh = (gy - top) / 2;
      q.forEach((c, i) => {
        const qx = gx + (i % 2) * gw, qy = top + Math.floor(i / 2) * gh, hot = i === 1;
        out.push(<rect key={`q${i}`} x={qx + 2} y={qy + 2} width={gw - 4} height={gh - 4} fill={hot ? G[6] : G[0]} />,
          <Tx key={`qt${i}`} x={qx + s} y={qy + s} w={gw - s * 2} s={s} t={c.t} fill={hot ? "#fff" : INK} bold max={1} />,
          <Tx key={`qd${i}`} x={qx + s} y={qy + s * 2.4} w={gw - s * 2} s={s * 0.85} t={c.d} fill={hot ? G[1] : SUB} max={2} />);
      });
      out.push(<path key="ax" d={`M${gx - 1} ${top}V${gy + 1}H${W - pad}`} fill="none" stroke={G[5]} strokeWidth={2} />);
      if (axes[0]) out.push(<Tx key="axx" x={W - pad} y={gy + s * 0.4} w={W} s={s * 0.9} t={`${axes[0]} →`} fill={INK} anchor="end" max={1} />);
      return out;
    }
    case "funnel": {
      const f = P.funnel(b.d).slice(0, 6);
      if (f.length < 2) return null;
      const top = head(x, out), n = f.length, fw = W * 0.56, lh = (H - top - pad) / n, cx = pad + fw / 2;
      f.forEach((c, i) => {
        const y = top + i * lh, w0 = fw * (1 - (0.5 * i) / n), w1 = fw * (1 - (0.5 * (i + 1)) / n), col = tone(i, n, 2, 6);
        out.push(<polygon key={`f${i}`} points={`${cx - w0 / 2},${y + 1} ${cx + w0 / 2},${y + 1} ${cx + w1 / 2},${y + lh - 1} ${cx - w1 / 2},${y + lh - 1}`} fill={col} />,
          <Tx key={`ft${i}`} x={cx} y={y + lh / 2 - s * 0.6} w={w1} s={s * 0.9} t={c.t + (c.n ? `  ${c.n}` : "")} fill={light(col) ? INK : "#fff"} bold anchor="middle" max={1} />,
          <Tx key={`fd${i}`} x={pad + fw + fs * 0.8} y={y + lh / 2 - s * 0.6} w={W - fw - fs * 2} s={s * 0.9} t={c.d} max={2} />);
      });
      return out;
    }
    case "cycle": {
      if (st.length < 3) return null;
      const ss = st.slice(0, 6), n = ss.length, cx = W / 2, cy = H / 2, rx = W * 0.32, ry = H * 0.32, nw = Math.min(W * 0.28, fs * 9), nh = fs * 2.4;
      out.push(<ellipse key="o" cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={G[3]} strokeWidth={2} />);
      ss.forEach((c, i) => {
        const a = -Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / n, ax = cx + rx * Math.cos(a), ay = cy + ry * Math.sin(a);
        out.push(<text key={`a${i}`} x={ax} y={ay} fontSize={fs * 0.8} fill={G[5]} textAnchor="middle" dominantBaseline="middle" transform={`rotate(${(a * 180) / Math.PI + 90} ${ax} ${ay})`}>▶</text>);
        const b_ = -Math.PI / 2 + (i * 2 * Math.PI) / n, px = cx + rx * Math.cos(b_), py = cy + ry * Math.sin(b_), col = tone(i, n, 2, 6);
        out.push(<rect key={`n${i}`} x={px - nw / 2} y={py - nh / 2} width={nw} height={nh} rx={4} fill={col} />,
          <Tx key={`nt${i}`} x={px} y={py - nh / 2 + s * 0.35} w={nw - 8} s={s} t={`${i + 1}. ${c.t}`} fill={light(col) ? INK : "#fff"} bold anchor="middle" max={1} />,
          <Tx key={`nd${i}`} x={px} y={py + s * 0.15} w={nw - 8} s={s * 0.82} t={c.d} fill={light(col) ? SUB : "#eee"} anchor="middle" max={1} />);
      });
      if (b.t) out.push(<Tx key="ct" x={cx} y={cy - fs * 0.5} w={rx} s={fs * 0.9} t={b.t} fill={INK} bold anchor="middle" max={2} />);
      return out;
    }
    case "venn": {
      if (st.length < 2) return null;
      const ss = st.slice(0, 3), n = ss.length, cx = W / 2, cy = H / 2, r = Math.min(W / (n === 2 ? 3.4 : 3.6), H / (n === 2 ? 2.3 : 3.4)), off = r * 0.62;
      const cs = n === 2 ? [[cx - off, cy], [cx + off, cy]] : [[cx - off, cy + off * 0.55], [cx + off, cy + off * 0.55], [cx, cy - off * 0.6]];
      cs.forEach(([px, py], i) => out.push(<circle key={`v${i}`} cx={px} cy={py} r={r} fill={tone(i, n, 3, 5)} fillOpacity={0.35} stroke={G[5]} strokeWidth={1.5} />));
      cs.forEach(([px, py], i) => {
        const dx = (px! - cx) * 0.75, dy = (py! - cy) * 0.75 + (n === 3 && i === 2 ? -r * 0.15 : 0);
        out.push(<Tx key={`vt${i}`} x={px! + dx} y={py! + dy - s} w={r * 0.9} s={s} t={ss[i]!.t} fill={INK} bold anchor="middle" max={1} />,
          <Tx key={`vd${i}`} x={px! + dx} y={py! + dy + s * 0.4} w={r * 0.9} s={s * 0.82} t={ss[i]!.d} anchor="middle" max={2} />);
      });
      if (b.t) { const w_ = tw(b.t, s) + s * 1.2; out.push(<rect key="vc" x={cx - w_ / 2} y={cy - s * 0.8} width={w_} height={s * 1.6} rx={s * 0.8} fill={G[6]} />, <Tx key="vct" x={cx} y={cy - s * 0.5} w={w_} s={s} t={b.t} fill="#fff" bold anchor="middle" max={1} />); }
      return out;
    }
    case "roadmap":
    case "ridge": {
      const rs = P.road(b.d).slice(0, 6);
      if (rs.length < 2) return null;
      const top = head(x, out), n = rs.length, sw = (W - pad * 2) / n, base = H - fs * 1.8;
      const pts = rs.map((_, i) => {
        const px = pad + (i + 0.5) * sw;
        return [px, b.k === "ridge" ? base - (base - top - fs * 3.5) * (0.25 + (0.75 * (i + 1)) / n) : (top + base) / 2 + (base - top) * 0.12 * Math.sin(((i + 0.5) / n) * Math.PI * 2)] as const;
      });
      if (b.k === "ridge") out.push(<polygon key="rg" points={[`${pad},${base}`, ...pts.map((p) => p.join(",")), `${W - pad},${pts[n - 1]![1]}`, `${W - pad},${base}`].join(" ")} fill={G[1]} />);
      out.push(<polyline key="rd" points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={b.k === "ridge" ? G[5] : G[2]} strokeWidth={b.k === "ridge" ? 2.5 : fs * 0.7} strokeLinejoin="round" strokeLinecap="round" />);
      rs.forEach((c, i) => {
        const [px, py] = pts[i]!, up = b.k === "ridge" || i % 2 === 0, col = tone(i, n, 3, 6);
        out.push(<circle key={`rc${i}`} cx={px} cy={py} r={fs * 0.4} fill={col} stroke="#fff" strokeWidth={2} />);
        const ty = up ? Math.max(top, py - fs * 3.6) : py + fs * 0.9;
        out.push(<Tx key={`rp${i}`} x={px} y={ty} w={sw - 6} s={s * 0.9} t={c.p} fill={INK} bold anchor="middle" max={1} />,
          <Tx key={`rt${i}`} x={px} y={ty + (c.p ? s * 1.15 : 0)} w={sw - 6} s={s * 0.9} t={c.t} fill={INK} anchor="middle" max={1} />);
        if (b.k === "ridge") out.push(<Tx key={`rd${i}`} x={px} y={base + s * 0.4} w={sw - 6} s={s * 0.8} t={c.d} anchor="middle" max={1} />);
        else out.push(<Tx key={`rd${i}`} x={px} y={ty + (c.p ? s * 2.3 : s * 1.15)} w={sw - 6} s={s * 0.8} t={c.d} anchor="middle" max={2} />);
      });
      return out;
    }
    case "isostack": {
      if (st.length < 2) return null;
      const top = head(x, out), ss = st.slice(0, 5), n = ss.length, sw = W * 0.42, lh = (H - top - pad) / n, th = Math.min(lh * 0.6, fs * 2.6), cx = pad + sw / 2;
      ss.forEach((c, i) => {
        const py = top + i * lh + lh * 0.1, col = tone(i, n, 2, 6), side = tone(i, n, 3, 6);
        out.push(<polygon key={`is${i}`} points={`${cx - sw / 2},${py + th / 2} ${cx},${py + th} ${cx},${py + th + 5} ${cx - sw / 2},${py + th / 2 + 5}`} fill={side} />,
          <polygon key={`is2${i}`} points={`${cx + sw / 2},${py + th / 2} ${cx},${py + th} ${cx},${py + th + 5} ${cx + sw / 2},${py + th / 2 + 5}`} fill={side} />,
          <polygon key={`it${i}`} points={`${cx - sw / 2},${py + th / 2} ${cx},${py} ${cx + sw / 2},${py + th / 2} ${cx},${py + th}`} fill={col} />,
          <Tx key={`il${i}`} x={cx} y={py + th / 2 - s * 0.55} w={sw * 0.6} s={s * 0.9} t={c.t} fill={light(col) ? INK : "#fff"} bold anchor="middle" max={1} />,
          <Tx key={`id${i}`} x={pad + sw + fs * 0.8} y={py + th / 2 - s * 0.6} w={W - sw - fs * 2} s={s * 0.9} t={c.d} max={2} />);
      });
      return out;
    }
    case "gauge": {
      const hl = P.meta(b.d)[0].highlight, ks = P.kpis(b.d).filter((k) => !/^(출처|자료)/.test(k.v) && P.numOf(k.v) !== null).slice(0, 4);
      if (!ks.length) return null;
      const top = head(x, out), kw = (W - pad * 2) / ks.length;
      ks.forEach((k, i) => {
        const r = Math.max(4, Math.min(kw * 0.32, (H - top - fs * 2.4) * 0.42)), cx = pad + kw * (i + 0.5), cy = top + r + 4, pct = Math.max(0, Math.min(100, P.numOf(k.v)!)), on = !hl || hl === k.v || k.c.includes(hl);
        const a = -Math.PI / 2 + (2 * Math.PI * pct) / 100, sw = r * 0.26, rr = r - sw / 2;
        out.push(<circle key={`g${i}`} cx={cx} cy={cy} r={rr} fill="none" stroke={G[1]} strokeWidth={sw} />,
          pct > 0 && <path key={`ga${i}`} d={`M${cx} ${cy - rr}A${rr} ${rr} 0 ${pct > 50 ? 1 : 0} 1 ${cx + rr * Math.cos(a) - (pct >= 100 ? 0.01 : 0)} ${cy + rr * Math.sin(a)}`} fill="none" stroke={on ? G[6] : G[3]} strokeWidth={sw} />,
          <Tx key={`gv${i}`} x={cx} y={cy - r * 0.2} w={r * 1.4} s={Math.max(s, r * 0.36)} t={k.v} fill={INK} bold anchor="middle" max={1} />,
          <Tx key={`gc${i}`} x={cx} y={cy + r + s * 0.4} w={kw - 8} s={s * 0.9} t={k.c} anchor="middle" max={2} />);
      });
      return out;
    }
    case "proportion": {
      const ps = P.parts(b.d).slice(0, 6), hl = P.meta(b.d)[0].highlight;
      if (ps.length < 2) return null;
      const top = head(x, out), tot = ps.reduce((a, p) => a + p.v, 0) || 1, bh = Math.min(fs * 2.6, (H - top) * 0.4);
      let cx = pad;
      ps.forEach((p, i) => {
        const w_ = ((W - pad * 2) * p.v) / tot, on = !!hl && (hl === p.t || p.t.includes(hl)), col = hl ? (on ? G[6] : G[2]) : tone(i, ps.length, 6, 2);
        out.push(<rect key={`pr${i}`} x={cx} y={top} width={Math.max(1, w_ - 2)} height={bh} fill={col} />,
          <Tx key={`pp${i}`} x={cx + 4} y={top + bh / 2 - s * 0.55} w={w_ - 6} s={s} t={`${Math.round((p.v / tot) * 100)}%`} fill={light(col) ? INK : "#fff"} bold max={1} />,
          <Tx key={`pn${i}`} x={cx + 2} y={top + bh + s * 0.4} w={Math.max(fs * 3, w_ - 4)} s={s * 0.85} t={`${p.t}\n${fmt(p.v)}`} fill={on || (!hl && i === 0) ? INK : SUB} max={2} />);
        cx += w_;
      });
      return out;
    }
    case "converge": {
      const { pr, so } = P.converge(b.d);
      if (!pr.length || !so.length) return null;
      const top = head(x, out), cw_ = W * 0.28, cx = W / 2, cy = (top + H) / 2, r = Math.min(W * 0.11, (H - top) * 0.26);
      ([[-1, pr], [1, so]] as const).forEach(([side, items]) => items.forEach((c, i) => {
        const ch = (H - top - pad) / items.length, y = top + i * ch + 2, bx = side < 0 ? pad : W - pad - cw_, my = y + (ch - 6) / 2, ex = side < 0 ? bx + cw_ : bx;
        out.push(<rect key={`cv${side}${i}`} x={bx} y={y} width={cw_} height={ch - 6} rx={4} fill={side < 0 ? G[0] : G[1]} stroke={G[2]} />,
          <Tx key={`cvt${side}${i}`} x={bx + s * 0.6} y={y + s * 0.5} w={cw_ - s * 1.2} s={s * 0.9} t={c.t} fill={INK} bold max={1} />,
          <Tx key={`cvd${side}${i}`} x={bx + s * 0.6} y={y + s * 1.7} w={cw_ - s * 1.2} s={s * 0.8} t={c.d} max={2} />,
          <path key={`cvl${side}${i}`} d={`M${ex} ${my}C${(ex + cx) / 2} ${my} ${(ex + cx) / 2} ${cy} ${cx + side * r} ${cy}`} fill="none" stroke={side < 0 ? G[3] : G[5]} strokeWidth={1.5} />);
      }));
      out.push(<circle key="cc" cx={cx} cy={cy} r={r} fill={G[6]} />, <Tx key="cct" x={cx} y={cy - s * 0.9} w={r * 1.7} s={s * 0.9} t={b.t} fill="#fff" bold anchor="middle" max={3} />);
      return out;
    }
    case "petal": {
      if (st.length < 3) return null;
      const ss = st.slice(0, 6), n = ss.length, cx = W / 2, cy = H / 2, r = Math.min(W * 0.09, H * 0.17), pr = r * 0.62, colw = W * 0.27, rows = Math.ceil(n / 2);
      ss.forEach((c, i) => {
        const a = -Math.PI / 2 + (2 * Math.PI * i) / n, px = cx + r * 1.45 * Math.cos(a), py = cy + r * 1.45 * Math.sin(a), col = tone(i, n, 2, 5), left = i >= rows, j = left ? n - 1 - i : i;
        const tx = left ? pad : W - pad - colw, ty = pad + (j * (H - pad * 2)) / rows, no = String(i + 1).padStart(2, "0");
        out.push(<line key={`pl${i}`} x1={px + (left ? -pr : pr)} y1={py} x2={left ? tx + colw : tx} y2={ty + s * 0.6} stroke={G[2]} strokeDasharray="3 2" />,
          <circle key={`pc${i}`} cx={px} cy={py} r={pr} fill={col} stroke="#fff" strokeWidth={2} />, <Tx key={`pn${i}`} x={px} y={py - s * 0.55} w={pr * 2} s={s} t={no} fill={light(col) ? INK : "#fff"} bold anchor="middle" max={1} />,
          <Tx key={`pt${i}`} x={tx} y={ty} w={colw} s={s * 0.9} t={`${no} ${c.t}`} fill={INK} bold max={1} />, <Tx key={`pd${i}`} x={tx} y={ty + s * 1.2} w={colw} s={s * 0.8} t={c.d} max={2} />);
      });
      out.push(<circle key="pcc" cx={cx} cy={cy} r={r} fill={G[6]} />, <Tx key="pct" x={cx} y={cy - s * 0.6} w={r * 1.7} s={s} t={b.t} fill="#fff" bold anchor="middle" max={2} />);
      return out;
    }
    case "stage": {
      if (st.length < 2) return null;
      const top = head(x, out), ss = st.slice(0, 5), n = ss.length, cx = W / 2, bw = W * 0.78, eh = Math.min(fs * 2, (H - top) * 0.12), by1 = H - pad, by0 = by1 - eh * 1.6;
      out.push(<ellipse key="sb" cx={cx} cy={by1 - eh / 2} rx={bw / 2} ry={eh / 2} fill={G[5]} />, <rect key="sr" x={cx - bw / 2} y={by0} width={bw} height={by1 - eh / 2 - by0} fill={G[5]} />,
        <ellipse key="st" cx={cx} cy={by0} rx={bw / 2} ry={eh / 2} fill={G[4]} />, <Tx key="stt" x={cx} y={by0 + eh * 0.3} w={bw} s={s} t={b.t} fill="#fff" bold anchor="middle" max={1} />);
      const ringY = by0 - eh * 1.6, cr = Math.max(4, Math.min((bw * 0.76) / n * 0.42, (ringY - top) * 0.3));
      out.push(<ellipse key="ring" cx={cx} cy={ringY} rx={bw * 0.42} ry={eh * 0.55} fill="none" stroke={G[3]} strokeWidth={1.5} />);
      ss.forEach((c, i) => {
        const px = cx - bw * 0.38 + (bw * 0.76 * (i + 0.5)) / n, py = top + cr + 4 + (i % 2 ? cr * 0.5 : 0);
        out.push(<line key={`sl${i}`} x1={px} x2={px} y1={py + cr} y2={ringY} stroke={G[2]} />, <circle key={`sc${i}`} cx={px} cy={py} r={cr} fill={G[0]} stroke={G[3]} strokeWidth={1.5} />,
          <Tx key={`sct${i}`} x={px} y={py - s * 0.8} w={cr * 1.6} s={s * 0.85} t={c.t} fill={INK} bold anchor="middle" max={1} />, <Tx key={`scd${i}`} x={px} y={py + s * 0.3} w={cr * 1.6} s={s * 0.72} t={c.d} anchor="middle" max={2} />);
      });
      return out;
    }
    // 2026-10-18 확장 5종
    case "dodont": {
      const v = P.dodont(b.d);
      if (!v.ng.length && !v.ok.length) return null;
      let top = head(x, out);
      const mid = W / 2, cw_ = W / 2 - pad - fs * 0.9, n = Math.max(v.ng.length, v.ok.length, 1);
      [[0, `✕ ${v.nn}`], [1, `✓ ${v.on}`]].forEach(([side, nm]) => {
        const bx = side ? mid + fs * 0.9 : pad;
        out.push(<rect key={`dh${side}`} x={bx} y={top} width={cw_} height={s * 1.7} rx={s * 0.85} fill={side ? G[6] : G[4]} />, <Tx key={`dht${side}`} x={bx + cw_ / 2} y={top + s * 0.4} w={cw_} s={s} t={nm as string} fill="#fff" bold anchor="middle" max={1} />);
      });
      top += s * 2.3;
      const rh = (H - top - pad) / n;
      for (let i = 0; i < n; i++) {
        const y = top + i * rh;
        ([[0, v.ng[i]], [1, v.ok[i]]] as const).forEach(([side, t]) => {
          if (!t) return;
          const bx = side ? mid + fs * 0.9 : pad;
          out.push(<rect key={`dr${side}${i}`} x={bx} y={y + 2} width={cw_} height={rh - 6} rx={4} fill={side ? G[1] : G[0]} stroke={side ? G[4] : G[2]} />,
            <Tx key={`drt${side}${i}`} x={bx + s * 0.7} y={y + rh / 2 - s * 0.7} w={cw_ - s * 1.4} s={s * 0.9} t={t} fill={side ? INK : SUB} bold={side === 1} max={2} />);
        });
        out.push(<polygon key={`da${i}`} points={`${mid - fs * 0.5},${y + rh / 2 - fs * 0.5} ${mid + fs * 0.2},${y + rh / 2 - fs * 0.5} ${mid + fs * 0.6},${y + rh / 2} ${mid + fs * 0.2},${y + rh / 2 + fs * 0.5} ${mid - fs * 0.5},${y + rh / 2 + fs * 0.5} ${mid - fs * 0.1},${y + rh / 2}`} fill={G[3]} />);
      }
      return out;
    }
    case "quote": {
      const { q, who } = P.quote(b.t, b.d);
      if (!q) return null;
      const big = Math.max(s * 1.1, Math.min(fs * 1.5, H * 0.16));
      out.push(<rect key="qb" x={0} y={0} width={W} height={H} fill={G[0]} />, <rect key="ql" x={0} y={pad} width={4} height={H - pad * 2} fill={G[5]} />,
        <text key="qm" x={pad + 4} y={pad * 0.4} fontSize={big * 2.4} fill={G[3]} dominantBaseline="hanging">“</text>,
        <Tx key="qt" x={pad + 8} y={pad + big * 1.6} w={W - pad * 2 - 8} s={big} t={q} fill={INK} bold max={4} lh={1.35} />);
      if (who) out.push(<Tx key="qw" x={W - pad} y={H - pad - s} w={W} s={s * 0.9} t={`— ${who}`} anchor="end" max={1} />);
      return out;
    }
    case "progress": {
      const { items, unit } = P.progress(b.d), hl = P.meta(b.d)[0].highlight;
      if (!items.length) return null;
      const top = head(x, out), rh = (H - top - pad) / items.length, lw = W * 0.3, tx1 = W - pad - fs * 3.4;
      items.forEach((p, i) => {
        const y = top + i * rh + rh / 2, on = !!hl && (hl === p.t || p.t.includes(hl)), bh = Math.min(fs * 0.9, rh * 0.42), w_ = Math.max(0, Math.min(1, p.v / p.tg)) * (tx1 - pad - lw);
        out.push(<Tx key={`gl${i}`} x={pad} y={y - s * 0.6} w={lw - s} s={s * 0.9} t={p.t} fill={on || !hl ? INK : SUB} bold={on} max={1} />,
          <rect key={`gt${i}`} x={pad + lw} y={y - bh / 2} width={tx1 - pad - lw} height={bh} rx={bh / 2} fill={G[1]} />,
          w_ > 1 && <rect key={`gf${i}`} x={pad + lw} y={y - bh / 2} width={w_} height={bh} rx={bh / 2} fill={on ? G[6] : hl ? G[3] : G[4]} />,
          <Tx key={`gv${i}`} x={tx1 + s * 0.5} y={y - s * 0.6} w={fs * 3.4} s={s * 0.9} t={unit === "%" && p.tg === 100 ? `${fmt(p.v)}%` : `${fmt(p.v)} / ${fmt(p.tg)}${unit === "%" ? "" : unit}`} fill={INK} bold={on} max={1} />);
      });
      return out;
    }
    case "swimlane": {
      const { head: hd, lanes } = P.swim(b.d);
      if (!lanes.length) return null;
      const top = head(x, out), lw = W * 0.16, cw_ = (W - lw) / Math.max(1, hd.length), hh = s * 1.7, rh = (H - top - hh) / lanes.length;
      out.push(<rect key="sh" x={0} y={top} width={W} height={hh} fill={G[2]} />);
      hd.forEach((h, j) => out.push(<Tx key={`sht${j}`} x={lw + cw_ * (j + 0.5)} y={top + s * 0.4} w={cw_} s={s * 0.9} t={h} fill={INK} bold anchor="middle" max={1} />));
      const boxes: [number, number, number, number, number, number][] = [];
      lanes.forEach((ln, i) => {
        const y = top + hh + i * rh;
        out.push(<rect key={`sl${i}`} x={0} y={y} width={W} height={rh} fill={i % 2 ? "#fff" : G[0]} stroke={G[1]} />, <rect key={`slh${i}`} x={0} y={y} width={lw} height={rh} fill={G[1]} />,
          <Tx key={`slt${i}`} x={s * 0.5} y={y + rh / 2 - s * 0.6} w={lw - s} s={s * 0.9} t={ln.t} fill={INK} bold max={2} />);
        ln.cells.forEach((c, j) => {
          if (!c.trim()) return;
          const x0 = lw + j * cw_ + s * 0.5, y0 = y + rh * 0.18, x1 = x0 + cw_ - s, y1 = y + rh * 0.82;
          out.push(<rect key={`sb${i}${j}`} x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={3} fill="#fff" stroke={G[4]} />,
            <Tx key={`sbt${i}${j}`} x={(x0 + x1) / 2} y={(y0 + y1) / 2 - s * 0.5} w={x1 - x0 - 6} s={s * 0.78} t={c} fill={INK} anchor="middle" max={2} />);
          boxes.push([j, i, x0, y0, x1, y1]);
        });
      });
      boxes.sort((a, c) => a[0] - c[0] || a[1] - c[1]);
      boxes.slice(1).forEach((q, k) => {
        const p = boxes[k]!;
        const d = q[0] === p[0] ? `M${(p[2] + p[4]) / 2} ${q[1] > p[1] ? p[5] : p[3]}V${q[1] > p[1] ? q[3] : q[5]}` : `M${p[4]} ${(p[3] + p[5]) / 2}H${(p[4] + q[2]) / 2}V${(q[3] + q[5]) / 2}H${q[2] - 2}`;
        out.push(<path key={`sa${k}`} d={d} fill="none" stroke={G[5]} strokeWidth={1.5} markerEnd="url(#wsk-arrow)" />);
      });
      out.push(<defs key="defs"><marker id="wsk-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill={G[5]} /></marker></defs>);
      return out;
    }
    case "pin": {
      const { pic, pins } = P.pins(b.d);
      if (!pins.length) return null;
      const top = head(x, out), sw = W * 0.6, sh = H - top - pad, spots: [number, number][] = [[22, 28], [72, 24], [34, 56], [76, 58], [24, 82], [62, 84]], r = Math.max(8, s * 0.95);
      out.push(<rect key="scr" x={pad} y={top} width={sw - pad} height={sh} rx={4} fill={G[0]} stroke={G[2]} />, <rect key="bar" x={pad} y={top} width={sw - pad} height={s * 1.3} rx={4} fill={G[1]} />);
      for (let i = 0; i < 5; i++) out.push(<rect key={`ph${i}`} x={pad + s} y={top + s * 2.2 + (i * (sh - s * 3)) / 5} width={(sw - pad - s * 2) * (0.9 - 0.12 * (i % 3))} height={s * 0.5} rx={s * 0.25} fill={G[1]} />);
      if (pic) out.push(<Tx key="pic" x={pad + (sw - pad) / 2} y={top + sh - s * 1.5} w={sw - pad * 2} s={s * 0.85} t={pic} fill={G[4]} anchor="middle" max={1} />);
      const lh = sh / pins.length;
      pins.forEach((p, i) => {
        const [qx, qy] = p.pos ?? spots[i % spots.length]!, px = pad + ((sw - pad) * qx) / 100, py = top + s * 1.3 + ((sh - s * 1.3) * qy) / 100, ly = top + i * lh;
        out.push(<circle key={`pp${i}`} cx={px} cy={py} r={r} fill={G[6]} stroke="#fff" strokeWidth={2} />, <Tx key={`ppn${i}`} x={px} y={py - s * 0.5} w={r * 2} s={s * 0.85} t={p.no} fill="#fff" bold anchor="middle" max={1} />,
          <circle key={`pl${i}`} cx={sw + fs * 0.6 + r} cy={ly + r} r={r} fill={G[6]} />, <Tx key={`pln${i}`} x={sw + fs * 0.6 + r} y={ly + r - s * 0.5} w={r * 2} s={s * 0.85} t={p.no} fill="#fff" bold anchor="middle" max={1} />,
          <Tx key={`plt${i}`} x={sw + fs * 0.9 + r * 2} y={ly + r - s * 0.6} w={W - sw - fs * 1.5 - r * 2} s={s * 0.9} t={p.t} fill={INK} bold max={1} />,
          <Tx key={`pld${i}`} x={sw + fs * 0.9 + r * 2} y={ly + r + s * 0.6} w={W - sw - fs * 1.5 - r * 2} s={s * 0.78} t={p.d} max={2} />);
      });
      return out;
    }
    // 2026-10-18 2차 16종(엔진 engine/wireforms.py 와 같은 구성)
    case "arch": {
      const o = P.arch(b.d);
      if (o.zones.length < 2 && P.archNodes(o) < 2) return null;
      const top = head(x, out), zs = o.zones, n = zs.length, vert = o.dir === "세로", gap = fs * 2;
      const links = o.links.map((l) => [l, P.zoneOf(o, l.a), P.zoneOf(o, l.b)] as const).filter(([, a, c]) => a >= 0 && c >= 0 && a !== c);
      const far = links.filter(([, a, c]) => Math.abs(a - c) > 1), lane = fs * 0.9 * far.length;
      const zw = vert ? W - pad * 2 - lane : (W - pad * 2 - gap * (n - 1)) / n, zh = vert ? (H - top - pad - gap * (n - 1)) / n : H - top - pad - lane;
      const R = zs.map((z, i) => {
        const zx = vert ? pad : pad + i * (zw + gap), zy = vert ? top + i * (zh + gap) : top, hot = !!o.hl && z.name.includes(o.hl);
        out.push(<rect key={`az${i}`} x={zx} y={zy} width={zw} height={zh} rx={6} fill={G[0]} stroke={hot ? G[6] : G[2]} strokeWidth={hot ? 2.5 : 1} />,
          <Tx key={`azt${i}`} x={zx + s * 0.6} y={zy + s * 0.4} w={zw - s} s={s * 0.9} t={z.name} fill={INK} bold max={1} />);
        const m = z.nodes.length, cols = vert ? Math.max(1, Math.min(m, Math.floor((zw - s) / (fs * 6)))) : zw > fs * 12 && m > 2 ? 2 : 1, rows = Math.ceil(m / cols) || 1;
        const ix = zx + s * 0.5, iy = zy + s * 1.8, iw = zw - s, ih = zh - s * 2.3, nw = (iw - 4 * (cols - 1)) / cols, nh = Math.min(fs * 2.4, (ih - 4 * (rows - 1)) / rows), t0 = iy + Math.max(0, (ih - rows * nh - 4 * (rows - 1)) / 2);
        z.nodes.forEach((nd, j) => {
          const nx = ix + (j % cols) * (nw + 4), ny = t0 + Math.floor(j / cols) * (nh + 4);
          out.push(nd.db ? <g key={`an${i}${j}`}><rect x={nx + nw * 0.2} y={ny + 3} width={nw * 0.6} height={nh - 6} fill="#fff" stroke={G[4]} /><ellipse cx={nx + nw / 2} cy={ny + 3} rx={nw * 0.3} ry={3} fill={G[1]} stroke={G[4]} /></g>
            : <rect key={`an${i}${j}`} x={nx} y={ny} width={nw} height={nh} rx={3} fill="#fff" stroke={G[3]} />,
            <Tx key={`ant${i}${j}`} x={nx + nw / 2} y={ny + nh / 2 - s * 0.45} w={nw - 6} s={s * 0.78} t={nd.name} fill={INK} bold anchor="middle" max={1} />);
        });
        return [zx, zy, zx + zw, zy + zh] as const;
      });
      links.forEach(([l, a, c], i) => {
        const ra = R[Math.min(a, c)]!, rb = R[Math.max(a, c)]!, isFar = Math.abs(a - c) > 1, k = far.findIndex((f) => f[0] === l);
        let dd: string, lx: number, ly: number;
        if (!isFar) {
          const p = vert ? pad + zw * ((i % 3) + 1) / 4 : top + zh * ((i % 3) + 1) / 4;
          const [sx, sy, ex, ey] = vert ? [p, ra[3] + 2, p, rb[1] - 2] : [ra[2] + 2, p, rb[0] - 2, p];
          dd = a < c ? `M${sx} ${sy}L${ex} ${ey}` : `M${ex} ${ey}L${sx} ${sy}`; lx = (sx + ex) / 2; ly = (sy + ey) / 2;
        } else if (vert) {
          const xx = W - pad - lane + fs * 0.5 + k * fs * 0.9, A = R[a]!, B = R[c]!;
          dd = `M${A[2]} ${(A[1] + A[3]) / 2}H${xx}V${(B[1] + B[3]) / 2}H${B[2] + 2}`; lx = xx; ly = (A[3] + B[1]) / 2;
        } else {
          const yy = H - pad - lane + fs * 0.5 + k * fs * 0.9, A = R[a]!, B = R[c]!;
          dd = `M${(A[0] + A[2]) / 2} ${A[3]}V${yy}H${(B[0] + B[2]) / 2}V${B[3] + 2}`; lx = (A[2] + B[0]) / 2; ly = yy;
        }
        out.push(<path key={`al${i}`} d={dd} fill="none" stroke={G[5]} strokeWidth={isFar ? 1.5 : 2.5} markerEnd="url(#wsk-arr2)" />);
        if (l.label) out.push(<Tx key={`alt${i}`} x={lx} y={ly - s * 1.1} w={gap + fs * 4} s={s * 0.7} t={l.label} fill={SUB} anchor="middle" max={1} />);
      });
      out.push(ARR_DEFS);
      return out;
    }
    case "stepcols": {
      const o = P.stepcols(b.d);
      if (o.steps.length < 2) return null;
      const top = head(x, out), n = o.steps.length, rw = o.result ? Math.min(W * 0.17, fs * 8) : 0, ax1 = W - pad - (rw ? rw + fs : 0), gap = 4, sw = (ax1 - pad - gap * (n - 1)) / n, ch = Math.min(fs * 2.6, (H - top) * 0.22);
      o.steps.forEach((st_, i) => {
        const sx = pad + i * (sw + gap), col = tone(i, n, 2, 5), tip = i < n - 1 ? Math.min(fs, sw * 0.14) : 0;
        out.push(<polygon key={`sc${i}`} points={`${sx},${top} ${sx + sw - tip + (tip ? gap + 2 : 0)},${top} ${sx + sw + (tip ? gap + 2 : 0)},${top + ch / 2} ${sx + sw - tip + (tip ? gap + 2 : 0)},${top + ch} ${sx},${top + ch}`} fill={col} />,
          <Tx key={`sct${i}`} x={sx + sw / 2} y={top + ch / 2 - s * (st_.period ? 1 : 0.5)} w={sw - fs} s={s * 0.95} t={st_.name} fill={light(col) ? INK : "#fff"} bold anchor="middle" max={1} />);
        if (st_.period) out.push(<Tx key={`scp${i}`} x={sx + sw / 2} y={top + ch / 2 + s * 0.1} w={sw - fs} s={s * 0.7} t={st_.period} fill={light(col) ? SUB : G[1]} anchor="middle" max={1} />);
        out.push(<rect key={`scb${i}`} x={sx} y={top + ch + 4} width={sw} height={H - pad - top - ch - 4} rx={3} fill={G[0]} />);
        let y = top + ch + s * 0.9;
        st_.items.forEach((it, j) => { out.push(<Tx key={`sci${i}${j}`} x={sx + s * 0.5} y={y} w={sw - s} s={s * 0.82} t={`· ${it}`} fill={INK} max={2} />); y += linesH(`· ${it}`, sw - s, s * 0.82, 2) + s * 0.3; });
      });
      if (rw) out.push(<rect key="scr" x={W - pad - rw} y={top} width={rw} height={H - pad - top} rx={4} fill={G[6]} />,
        <Tx key="scrt" x={W - pad - rw / 2} y={(top + H) / 2 - s} w={rw - s} s={s} t={o.result} fill="#fff" bold anchor="middle" max={3} />,
        <path key="sca" d={`M${ax1 + 2} ${(top + H) / 2}H${W - pad - rw - 3}`} stroke={G[5]} strokeWidth={2} markerEnd="url(#wsk-arr2)" />, ARR_DEFS);
      return out;
    }
    case "derive": {
      const o = P.derive(b.d);
      if (!o.strats.length || !(o.feats.length || o.imps.length)) return null;
      const top = head(x, out), gap = fs * 1.6, Wd = W - pad * 2 - gap * 2, ws = [Wd * 0.29, Wd * 0.29, Wd * 0.42], xs = [pad, pad + ws[0]! + gap, pad + ws[0]! + ws[1]! + gap * 2], hh = s * 1.7, by = top + hh + 4;
      [0, 1, 2].forEach((i) => out.push(<rect key={`dh${i}`} x={xs[i]} y={top} width={ws[i]} height={hh} rx={hh / 2} fill={[G[3], G[4], G[6]][i]} />,
        <Tx key={`dht${i}`} x={xs[i]! + ws[i]! / 2} y={top + hh / 2 - s * 0.5} w={ws[i]!} s={s * 0.9} t={o.names[i]} fill="#fff" bold anchor="middle" max={1} />));
      ([[0, o.feats], [1, o.imps]] as const).forEach(([i, items]) => {
        out.push(<rect key={`db${i}`} x={xs[i]} y={by} width={ws[i]} height={H - pad - by} rx={4} fill={i ? "#fff" : G[0]} stroke={G[2]} />);
        let y = by + s * 0.7;
        items.forEach((it, j) => { out.push(<Tx key={`di${i}${j}`} x={xs[i]! + s * 0.6} y={y} w={ws[i]! - s * 1.2} s={s * 0.82} t={`${i ? "✓" : "·"} ${it}`} fill={INK} bold={i === 1} max={2} />); y += linesH(it, ws[i]! - s * 1.2, s * 0.82, 2) + s * 0.4; });
        const my = (by + H - pad) / 2, ax = xs[i]! + ws[i]! + 3;
        out.push(<polygon key={`da${i}`} points={`${ax},${my - fs * 0.6} ${ax + gap - fs * 0.8},${my - fs * 0.6} ${ax + gap - 4},${my} ${ax + gap - fs * 0.8},${my + fs * 0.6} ${ax},${my + fs * 0.6} ${ax + fs * 0.4},${my}`} fill={G[3]} />);
      });
      out.push(<rect key="dr" x={xs[2]} y={by} width={ws[2]} height={H - pad - by} rx={4} fill={G[6]} />);
      const rh = (H - pad - by) / o.strats.length;
      o.strats.forEach((st_, j) => {
        const y = by + j * rh, big = Math.min(fs * 1.5, rh * 0.42);
        out.push(<Tx key={`dsn${j}`} x={xs[2]! + s * 0.7} y={y + s * 0.6} w={fs * 3} s={big} t={st_.no} fill={G[2]} bold max={1} />,
          <Tx key={`dst${j}`} x={xs[2]! + s * 0.9 + big * 1.4} y={y + s * 0.7} w={ws[2]! - big * 1.6 - s * 1.4} s={s * 0.9} t={st_.name} fill="#fff" bold max={1} />,
          <Tx key={`dsd${j}`} x={xs[2]! + s * 0.9 + big * 1.4} y={y + s * 1.9} w={ws[2]! - big * 1.6 - s * 1.4} s={s * 0.72} t={st_.items.join(" · ")} fill={G[2]} max={2} />);
      });
      return out;
    }
    case "askanswer": {
      const o = P.askanswer(b.d);
      if (!o.qa.some((q) => q.q)) return null;
      const sides = o.qa.length > 1 ? [o.qa.filter((_, i) => i % 2 === 0), o.qa.filter((_, i) => i % 2 === 1)] : [o.qa, []], sw = W * (sides[1]!.length ? 0.29 : 0.36);
      const cx0 = pad + sw + fs * 0.6, cx1 = sides[1]!.length ? W - pad - sw - fs * 0.6 : W - pad;
      sides.forEach((g, si) => g.forEach((q, gi) => {
        const gh = (H - pad * 2) / g.length, gy = pad + gi * gh, sx = si ? W - pad - sw : pad, pcx = sx + sw / 2, r = Math.min(sw * 0.18, gh * 0.15), pcy = gy + gh * 0.58, bh = Math.min(fs * 4.5, pcy - r - gy - s);
        out.push(<rect key={`qb${si}${gi}`} x={sx} y={pcy - r - s - bh} width={sw} height={bh} rx={s} fill="#fff" stroke={G[3]} />,
          <Tx key={`qq${si}${gi}`} x={pcx} y={pcy - r - s - bh / 2 - s * 0.6} w={sw - s} s={s * 0.85} t={`“${q.q}”`} fill={INK} bold anchor="middle" max={2} />,
          <circle key={`qh${si}${gi}`} cx={pcx} cy={pcy - r * 0.4} r={r * 0.45} fill={si ? G[4] : G[3]} />, <path key={`qp${si}${gi}`} d={`M${pcx - r * 0.85} ${pcy + r * 0.9}A${r * 0.85} ${r * 0.85} 0 0 1 ${pcx + r * 0.85} ${pcy + r * 0.9}Z`} fill={si ? G[4] : G[3]} />,
          <Tx key={`qa${si}${gi}`} x={pcx} y={pcy + r + s * 0.4} w={sw} s={s * 0.9} t={q.a} fill={G[6]} bold anchor="middle" max={2} />);
      }));
      out.push(<rect key="qs" x={cx0} y={pad} width={cx1 - cx0} height={H - pad * 2 - fs * 2} rx={4} fill={G[0]} stroke={G[6]} strokeWidth={2} />, <rect key="qsb" x={cx0} y={pad} width={cx1 - cx0} height={s} rx={3} fill={G[1]} />);
      if (o.pic) out.push(<Tx key="qsp" x={(cx0 + cx1) / 2} y={H / 2 - s} w={cx1 - cx0 - fs} s={s * 0.85} t={o.pic} fill={SUB} anchor="middle" max={2} />);
      if (b.t) { const w_ = tw(b.t, s) + s * 1.6; out.push(<rect key="qt" x={(cx0 + cx1) / 2 - w_ / 2} y={H - pad - fs * 1.6} width={w_} height={s * 1.7} rx={s * 0.85} fill={G[6]} />, <Tx key="qtt" x={(cx0 + cx1) / 2} y={H - pad - fs * 1.6 + s * 0.35} w={w_} s={s} t={b.t} fill="#fff" bold anchor="middle" max={1} />); }
      return out;
    }
    case "linkage": {
      const o = P.linkage(b.d);
      if (!o.left.length && !o.right.length) return null;
      const lw = W * 0.22, pw = Math.max(fs * 1.3, W * 0.045), g = fs * 0.6, hasR = o.right.length > 0, cx0 = pad + lw + g + pw + g, cx1 = W - pad - (hasR ? lw + g + pw + g : 0), y0 = pad, y1 = H - pad;
      ([["left", o.left, o.ways[0]], ["right", o.right, o.ways[1]]] as const).forEach(([side, items, way]) => {
        if (!items.length) return;
        const sx = side === "left" ? pad : W - pad - lw, px = side === "left" ? sx + lw + g : sx - g - pw;
        out.push(<rect key={`lp${side}`} x={px} y={y0} width={pw} height={y1 - y0} rx={pw / 2} fill={G[3]} />);
        [...way.replace(/\s/g, "")].slice(0, 12).forEach((ch, i, a) => out.push(<text key={`lw${side}${i}`} x={px + pw / 2} y={(y0 + y1) / 2 + (i - a.length / 2) * s * 1.1} fontSize={s * 0.9} fontWeight={700} fill="#fff" textAnchor="middle" dominantBaseline="hanging">{ch}</text>));
        const rows = items.reduce((a, it) => a + 1 + it.items.length, 0), rh = Math.min(fs * 1.8, (y1 - y0) / rows - 3);
        let ly = y0 + Math.max(0, ((y1 - y0) - rows * (rh + 3)) / 2);
        items.forEach((it, i) => {
          const gy = ly;
          out.push(<rect key={`lg${side}${i}`} x={sx} y={ly} width={lw} height={rh} rx={2} fill={it.items.length ? G[4] : G[0]} stroke={G[2]} />,
            <Tx key={`lgt${side}${i}`} x={sx + lw / 2} y={ly + rh / 2 - s * 0.42} w={lw - 6} s={s * 0.78} t={it.name} fill={it.items.length ? "#fff" : INK} bold anchor="middle" max={1} />);
          ly += rh + 3;
          it.items.forEach((t_, j) => { out.push(<rect key={`li${side}${i}${j}`} x={sx + s * 0.5} y={ly} width={lw - s} height={rh} rx={2} fill={G[0]} stroke={G[1]} />, <Tx key={`lit${side}${i}${j}`} x={sx + lw / 2} y={ly + rh / 2 - s * 0.4} w={lw - s * 1.5} s={s * 0.72} t={t_} fill={INK} anchor="middle" max={1} />); ly += rh + 3; });
          const my = it.items.length ? (gy + ly) / 2 : gy + rh / 2, ex = side === "left" ? sx + lw : sx;
          out.push(<line key={`ll${side}${i}`} x1={ex} x2={side === "left" ? px : px + pw} y1={my} y2={my} stroke={G[3]} />);
        });
        const my = (y0 + y1) / 2;
        out.push(<path key={`la${side}`} d={side === "left" ? `M${px + pw + 1} ${my}H${cx0 - 2}` : `M${cx1 + 1} ${my}H${px - 2}`} stroke={G[5]} strokeWidth={2} markerEnd="url(#wsk-arr2)" />);
      });
      const hh = s * 1.8;
      out.push(<rect key="lc" x={cx0} y={y0} width={cx1 - cx0} height={y1 - y0} rx={4} fill="#fff" stroke={G[2]} />, <rect key="lch" x={cx0} y={y0} width={cx1 - cx0} height={hh} rx={4} fill={G[6]} />,
        <Tx key="lct" x={(cx0 + cx1) / 2} y={y0 + hh / 2 - s * 0.5} w={cx1 - cx0 - s} s={s * 0.95} t={b.t} fill="#fff" bold anchor="middle" max={1} />, ARR_DEFS);
      let y = y0 + hh + s * 0.6;
      o.center.forEach((c, i) => { out.push(<Tx key={`lcc${i}`} x={cx0 + s * 0.7} y={y} w={cx1 - cx0 - s * 1.4} s={s * 0.85} t={`✓ ${c}`} fill={INK} max={2} />); y += linesH(`✓ ${c}`, cx1 - cx0 - s * 1.4, s * 0.85, 2) + s * 0.3; });
      if (o.pic) { const sh = (y1 - y) * 0.75; out.push(<rect key="lcs" x={cx0 + s} y={y1 - sh - s * 0.5} width={cx1 - cx0 - s * 2} height={sh} rx={3} fill={G[0]} stroke={G[2]} />, <Tx key="lcp" x={(cx0 + cx1) / 2} y={y1 - sh / 2 - s} w={cx1 - cx0 - s * 3} s={s * 0.8} t={o.pic} fill={SUB} anchor="middle" max={2} />); }
      return out;
    }
    case "org": {
      const o = P.org(b.d);
      if (!o.root && o.teams.length < 2) return null;
      const top = head(x, out), cx = W / 2, rw = Math.min(W * 0.36, fs * 16), rh = Math.min(fs * 3.6, (H - top) * 0.3), root = o.root ?? { name: "", note: "" };
      out.push(<rect key="or" x={cx - rw / 2} y={top} width={rw} height={rh} rx={4} fill="#fff" stroke={G[6]} strokeWidth={2} />, <rect key="orh" x={cx - rw / 2} y={top} width={rw} height={s * 1.6} rx={3} fill={G[6]} />,
        <Tx key="ort" x={cx} y={top + s * 0.3} w={rw - s} s={s * 0.95} t={root.name} fill="#fff" bold anchor="middle" max={1} />,
        <Tx key="orn" x={cx} y={top + s * 2} w={rw - s} s={s * 0.75} t={root.note} anchor="middle" max={2} />);
      const ts = o.teams, n = Math.max(1, ts.length), g = fs * 0.5, tw_ = (W - pad * 2 - g * (n - 1)) / n, bus = top + rh + (H - top - rh) * 0.2, ty = bus + fs;
      out.push(<line key="otr" x1={cx} x2={cx} y1={top + rh} y2={bus} stroke={G[5]} strokeWidth={2} />);
      if (ts.length) out.push(<line key="obus" x1={pad + tw_ / 2} x2={W - pad - tw_ / 2} y1={bus} y2={bus} stroke={G[5]} strokeWidth={2} />);
      ts.forEach((t_, i) => {
        const tx = pad + i * (tw_ + g);
        out.push(<line key={`ol${i}`} x1={tx + tw_ / 2} x2={tx + tw_ / 2} y1={bus} y2={ty} stroke={G[5]} strokeWidth={2} />, <rect key={`ob${i}`} x={tx} y={ty} width={tw_} height={H - pad - ty} rx={3} fill={G[0]} stroke={G[2]} />,
          <rect key={`obh${i}`} x={tx} y={ty} width={tw_} height={s * 1.6} rx={3} fill={G[4]} />, <Tx key={`obt${i}`} x={tx + tw_ / 2} y={ty + s * 0.3} w={tw_ - 6} s={s * 0.85} t={t_.name} fill="#fff" bold anchor="middle" max={1} />,
          <circle key={`obc${i}`} cx={tx + tw_ / 2} cy={ty + s * 2.8} r={s * 0.7} fill="#fff" stroke={G[2]} />,
          <Tx key={`obr${i}`} x={tx + tw_ / 2} y={ty + s * 3.8} w={tw_ - 8} s={s * 0.75} t={t_.role} anchor="middle" max={3} />,
          <Tx key={`obn${i}`} x={tx + tw_ / 2} y={H - pad - s * 1.4} w={tw_ - 8} s={s * 0.8} t={t_.n} fill={G[6]} bold anchor="middle" max={1} />);
      });
      if (o.sup.length) {
        const sw = Math.min(W * 0.22, fs * 9), sh = s * 1.4 * o.sup.length + s;
        out.push(<rect key="os" x={pad} y={top} width={sw} height={sh} fill="none" stroke={G[3]} strokeDasharray="4 3" />, <line key="osl" x1={pad + sw} x2={cx - rw / 2} y1={top + sh / 2} y2={top + sh / 2} stroke={G[3]} strokeDasharray="4 3" />);
        o.sup.forEach((t_, i) => out.push(<Tx key={`ost${i}`} x={pad + sw / 2} y={top + s * 0.5 + i * s * 1.4} w={sw - 6} s={s * 0.8} t={t_} fill={INK} bold anchor="middle" max={1} />));
      }
      return out;
    }
    case "voices": {
      const o = P.voices(b.d);
      if (!o.says.length) return null;
      const qh = b.t ? fs * 2.4 : 0, cx = W / 2, cy = (H - qh) / 2, r = Math.min((H - qh) * 0.32, W * 0.13), bw = W / 2 - r - fs * 1.8;
      out.push(<circle key="vc" cx={cx} cy={cy} r={r} fill={G[0]} stroke={G[2]} />, <circle key="vh" cx={cx} cy={cy - r * 0.3} r={r * 0.27} fill={G[3]} />, <path key="vb" d={`M${cx - r * 0.55} ${cy + r * 0.6}A${r * 0.55} ${r * 0.55} 0 0 1 ${cx + r * 0.55} ${cy + r * 0.6}Z`} fill={G[3]} />);
      ([[-1, o.says.filter((_, i) => i % 2 === 0)], [1, o.says.filter((_, i) => i % 2 === 1)]] as const).forEach(([side, g]) => g.forEach((t_, i) => {
        const gh = (H - qh - pad * 2) / g.length, bh = Math.min(gh - s, fs * 3), by = pad + i * gh + (gh - bh) / 2, bx = side < 0 ? pad : W - pad - bw, tx = side < 0 ? bx + bw : bx;
        out.push(<rect key={`vs${side}${i}`} x={bx} y={by} width={bw} height={bh} rx={bh / 2.5} fill="#fff" stroke={G[3]} />, <polygon key={`vt${side}${i}`} points={`${tx},${by + bh / 2 - 5} ${tx},${by + bh / 2 + 5} ${tx - side * fs * 0.8},${by + bh / 2}`} fill={G[3]} />,
          <Tx key={`vst${side}${i}`} x={bx + bw / 2} y={by + bh / 2 - s * 0.55} w={bw - s} s={s * 0.85} t={`“${t_}”`} fill={INK} bold anchor="middle" max={2} />);
      }));
      if (b.t) out.push(<Tx key="vq" x={cx} y={H - qh} w={W - pad * 2} s={fs * 1.2} t={b.t} fill={G[6]} bold anchor="middle" max={1} />);
      if (o.src) out.push(<Tx key="vsrc" x={W - pad} y={H - s * 1.2} w={W} s={s * 0.75} t={`출처: ${o.src}`} anchor="end" max={1} />);
      return out;
    }
    case "screenshift": {
      const o = P.screenshift(b.d);
      if (!o.before || !o.after) return null;
      const top = head(x, out) + s * 1.6, ch = o.changes.length ? fs * 2.2 : 0, bot = H - pad - ch - s * 1.8, bw = W * 0.3, aw = W * 0.1, rx0 = pad + bw + aw, bh = (bot - top) * 0.62, by = top + (bot - top - bh) / 2;
      ([[0, o.before, pad, pad + bw, by, by + bh], [1, o.after, rx0, W - pad, top, bot]] as const).forEach(([side, v, sx0, sx1, sy0, sy1]) => {
        const w_ = tw(v.name, s * 0.8) + s * 1.4;
        out.push(<rect key={`ssl${side}`} x={(sx0 + sx1) / 2 - w_ / 2} y={sy0 - s * 1.6} width={w_} height={s * 1.3} rx={s * 0.65} fill={side ? G[6] : G[1]} />,
          <Tx key={`sslt${side}`} x={(sx0 + sx1) / 2} y={sy0 - s * 1.45} w={w_} s={s * 0.8} t={v.name} fill={side ? "#fff" : INK} bold anchor="middle" max={1} />,
          <rect key={`ss${side}`} x={sx0} y={sy0} width={sx1 - sx0} height={sy1 - sy0} rx={3} fill={side ? G[0] : "#f9fafb"} stroke={side ? G[6] : G[2]} strokeWidth={side ? 2 : 1} />,
          <rect key={`ssb${side}`} x={sx0} y={sy0} width={sx1 - sx0} height={s} rx={2} fill={G[1]} />,
          <Tx key={`ssp${side}`} x={(sx0 + sx1) / 2} y={(sy0 + sy1) / 2} w={sx1 - sx0 - s} s={s * 0.8} t={v.pic} fill={SUB} anchor="middle" max={2} />,
          <Tx key={`ssn${side}`} x={(sx0 + sx1) / 2} y={sy1 + s * 0.3} w={sx1 - sx0} s={s * 0.85} t={v.note} fill={side ? G[6] : SUB} bold={side === 1} anchor="middle" max={1} />);
        if (side) [[0.28, 0.32], [0.7, 0.45], [0.45, 0.78]].forEach(([px, py], i) => out.push(<circle key={`ssc${i}`} cx={sx0 + (sx1 - sx0) * px!} cy={sy0 + (sy1 - sy0) * py!} r={s * 0.6} fill={G[6]} stroke="#fff" strokeWidth={1.5} />));
      });
      const my = (top + bot) / 2, ax = pad + bw + 4;
      out.push(<polygon key="ssa" points={`${ax},${my - fs * 0.8} ${ax + aw - fs * 1.4},${my - fs * 0.8} ${ax + aw - 6},${my} ${ax + aw - fs * 1.4},${my + fs * 0.8} ${ax},${my + fs * 0.8} ${ax + fs * 0.6},${my}`} fill={G[3]} />);
      const n = o.changes.length, cw_ = (W - pad * 2 - s * (n - 1)) / Math.max(1, n);
      o.changes.forEach((c, i) => out.push(<rect key={`ssch${i}`} x={pad + i * (cw_ + s)} y={H - pad - ch + 4} width={cw_} height={ch - 4} rx={(ch - 4) / 2} fill={G[0]} stroke={G[2]} />,
        <Tx key={`sscht${i}`} x={pad + i * (cw_ + s) + cw_ / 2} y={H - pad - ch / 2 - s * 0.4} w={cw_ - s} s={s * 0.85} t={`${c.label ? c.label + "  " : ""}${c.value}`} fill={G[6]} bold anchor="middle" max={1} />));
      return out;
    }
    case "triad": {
      const o = P.triad(b.d);
      if (!o.rows.length) return null;
      let top = head(x, out);
      const gap = fs * 1.4, Wd = W - pad * 2 - gap * 2, ws = [Wd * 0.3, Wd * 0.36, Wd * 0.34], xs = [pad, pad + ws[0]! + gap, pad + ws[0]! + ws[1]! + gap * 2], hh = s * 1.6;
      [0, 1, 2].forEach((i) => out.push(<rect key={`th${i}`} x={xs[i]} y={top} width={ws[i]} height={hh} rx={hh / 2} fill={[G[3], G[4], G[6]][i]} />, <Tx key={`tht${i}`} x={xs[i]! + ws[i]! / 2} y={top + hh / 2 - s * 0.5} w={ws[i]!} s={s * 0.9} t={o.head[i]} fill="#fff" bold anchor="middle" max={1} />));
      top += hh + 4;
      const rh = (H - pad - top) / o.rows.length;
      o.rows.forEach((r, j) => {
        const y = top + j * rh, hot = !!o.hl && r[0]!.includes(o.hl);
        [0, 1, 2].forEach((i) => out.push(<rect key={`tr${j}${i}`} x={xs[i]} y={y + 2} width={ws[i]} height={rh - 4} rx={3} fill={[G[0], "#fff", G[6]][i]} stroke={i === 2 ? "none" : hot && !i ? G[6] : G[2]} strokeWidth={hot && !i ? 2 : 1} />,
          <Tx key={`trt${j}${i}`} x={xs[i]! + ws[i]! / 2} y={y + rh / 2 - s * 0.55} w={ws[i]! - s} s={s * 0.85} t={r[i]} fill={i === 2 ? "#fff" : i || hot ? INK : SUB} bold={i > 0 || hot} anchor="middle" max={2} />));
        [0, 1].forEach((i) => out.push(<path key={`ta${j}${i}`} d={`M${xs[i]! + ws[i]! + 3} ${y + rh / 2}H${xs[i + 1]! - 3}`} stroke={G[3]} strokeWidth={2} markerEnd="url(#wsk-arr2)" />));
      });
      out.push(ARR_DEFS);
      return out;
    }
    case "flowchart": {
      const nodes = P.flowchart(b.d).nodes;
      if (nodes.length < 2) return null;
      const top = head(x, out), vert = H - top > W * 0.55, n = nodes.length;
      const pos = nodes.map((_, i) => vert ? [pad + (W - pad * 2) * 0.36, top + ((H - top) / n) * (i + 0.5)] as const : [pad + ((W - pad * 2) / n) * (i + 0.5), top + (H - top) * 0.34] as const);
      const nw = vert ? Math.min(W * 0.42, fs * 12) : Math.min(((W - pad * 2) / n) * 0.8, fs * 8), nh = vert ? Math.min(fs * 2.2, ((H - top) / n) * 0.62) : Math.min(fs * 3, (H - top) * 0.26);
      const half = nodes.map((nd) => (nd.type === "if" ? [nw * 0.49, nh * 0.65] : [nw / 2, nh / 2]) as [number, number]);
      nodes.forEach((nd, i) => {
        const [cx, cy] = pos[i]!, [hw, hh] = half[i]!;
        out.push(nd.type === "if" ? <polygon key={`fn${i}`} points={`${cx},${cy - hh} ${cx + hw},${cy} ${cx},${cy + hh} ${cx - hw},${cy}`} fill={G[4]} />
          : <rect key={`fn${i}`} x={cx - hw} y={cy - hh} width={hw * 2} height={hh * 2} rx={nd.type === "end" ? hh : 3} fill={nd.type === "end" ? G[6] : "#fff"} stroke={G[4]} />,
          <Tx key={`fnt${i}`} x={cx} y={cy - s * 0.45} w={nd.type === "if" ? hw : hw * 2 - s} s={s * 0.8} t={nd.text} fill={nd.type === "step" ? INK : "#fff"} bold anchor="middle" max={1} />);
        if (i < n - 1) {
          const [nx, ny] = pos[i + 1]!, [nhw, nhh] = half[i + 1]!;
          out.push(<path key={`fa${i}`} d={vert ? `M${cx} ${cy + hh}V${ny - nhh - 2}` : `M${cx + hw} ${cy}H${nx - nhw - 2}`} stroke={G[5]} strokeWidth={1.5} markerEnd="url(#wsk-arr2)" />);
          if (nd.type === "if") out.push(<Tx key={`fy${i}`} x={vert ? cx + s * 0.4 : cx + hw + 3} y={vert ? cy + hh : cy - s * 1.2} w={fs * 2} s={s * 0.7} t="예" fill={SUB} max={1} />);
        }
      });
      let lane = 0;
      nodes.forEach((nd, i) => {
        if (nd.type !== "if" || !nd.no) return;
        const [cx, cy] = pos[i]!, [hw, hh] = half[i]!, j = P.flowIndex(nodes, nd.no);
        lane++;
        if (j >= 0 && j !== i) {
          const [tx, ty] = pos[j]!, [thw, thh] = half[j]!;
          out.push(<path key={`fno${i}`} d={vert ? `M${cx + hw} ${cy}H${cx + Math.max(hw, thw) + fs * (0.8 + lane)}V${ty}H${tx + thw + 2}` : `M${cx} ${cy + hh}V${cy + Math.max(hh, thh) + fs * (0.8 + lane)}H${tx}V${ty + thh + 2}`} fill="none" stroke={G[3]} strokeWidth={1.5} markerEnd="url(#wsk-arr2)" />);
        } else {
          const [sx, sy] = vert ? [Math.min(W - pad - nw * 0.4, cx + hw + fs * 1.5 + nw * 0.4), cy] : [cx, Math.min(H - pad - nh / 2, cy + hh + fs * 1.5 + nh / 2)];
          out.push(<path key={`fno${i}`} d={vert ? `M${cx + hw} ${cy}H${sx - nw * 0.4 - 2}` : `M${cx} ${cy + hh}V${sy - nh / 2 - 2}`} stroke={G[3]} strokeWidth={1.5} markerEnd="url(#wsk-arr2)" />,
            <rect key={`fns${i}`} x={sx - nw * 0.4} y={sy - nh / 2} width={nw * 0.8} height={nh} rx={3} fill={G[0]} stroke={G[3]} />, <Tx key={`fnst${i}`} x={sx} y={sy - s * 0.45} w={nw * 0.8 - s} s={s * 0.78} t={nd.no} fill={INK} bold anchor="middle" max={1} />);
        }
        out.push(<Tx key={`fnl${i}`} x={vert ? cx + hw + 3 : cx + 3} y={vert ? cy - s * 1.1 : cy + hh + 2} w={fs * 3} s={s * 0.7} t="아니오" fill={SUB} max={1} />);
      });
      out.push(ARR_DEFS);
      return out;
    }
    case "rowgrid": {
      const o = P.rowgrid(b.d);
      if (!o.rows.length) return null;
      let top = head(x, out);
      const lw = W * 0.18, gx = pad + lw + s * 0.5, nc = Math.max(o.head.length, ...o.rows.filter((r) => !r.chips).map((r) => r.cells.length), 1), cwid = (W - pad - gx) / nc;
      const hot = (h?: string) => !!o.hl && !!h && h.includes(o.hl);
      if (o.head.length) {
        o.head.forEach((h, j) => { const col = hot(h) ? G[6] : tone(j, o.head.length, 2, 5); out.push(<polygon key={`rh${j}`} points={`${gx + j * cwid},${top} ${gx + (j + 1) * cwid - 4},${top} ${gx + (j + 1) * cwid + 4},${top + s * 0.8} ${gx + (j + 1) * cwid - 4},${top + s * 1.6} ${gx + j * cwid},${top + s * 1.6}`} fill={col} />, <Tx key={`rht${j}`} x={gx + (j + 0.5) * cwid} y={top + s * 0.3} w={cwid - s} s={s * 0.85} t={h} fill={light(col) ? INK : "#fff"} bold anchor="middle" max={1} />); });
        top += s * 2.1;
      }
      const rh = (H - pad - top) / o.rows.length;
      o.rows.forEach((r, i) => {
        const y = top + i * rh;
        out.push(<rect key={`rr${i}`} x={pad} y={y + 2} width={lw} height={rh - 4} rx={3} fill={G[4]} />, <Tx key={`rrt${i}`} x={pad + lw / 2} y={y + rh / 2 - s * 0.5} w={lw - s} s={s * 0.85} t={r.name} fill="#fff" bold anchor="middle" max={2} />);
        if (r.chips) {
          let cx = gx, cy = y + s * 0.4;
          const ph = Math.min(s * 1.6, rh - s * 0.8);
          r.cells.forEach((c, j) => { const w_ = tw(c, s * 0.8) + s * 1.4; if (cx + w_ > W - pad && cx > gx) { cx = gx; cy += ph + 4; } if (cy + ph > y + rh) return; out.push(<rect key={`rc${i}${j}`} x={cx} y={cy} width={w_} height={ph} rx={ph / 2} fill={G[0]} stroke={G[2]} />, <Tx key={`rct${i}${j}`} x={cx + w_ / 2} y={cy + ph / 2 - s * 0.45} w={w_} s={s * 0.8} t={c} fill={INK} anchor="middle" max={1} />); cx += w_ + 4; });
        } else r.cells.forEach((c, j) => out.push(<rect key={`rc${i}${j}`} x={gx + j * cwid + 2} y={y + 2} width={cwid - 4} height={rh - 4} rx={3} fill={hot(o.head[j]) ? G[1] : G[0]} />, <Tx key={`rct${i}${j}`} x={gx + (j + 0.5) * cwid} y={y + rh / 2 - s * 0.45} w={cwid - s} s={s * 0.8} t={c} fill={INK} bold={hot(o.head[j])} anchor="middle" max={2} />));
      });
      return out;
    }
    case "timeline": {
      const o = P.timeline(b.d);
      if (o.ev.length < 2) return null;
      const top = head(x, out), n = o.ev.length, gw = o.goal ? Math.min(W * 0.16, fs * 8) : 0, ax1 = W - pad - gw - s, my = (top + H) / 2, sw = (ax1 - pad - fs) / n, stem = (H - top) * 0.12;
      out.push(<path key="tla" d={`M${pad} ${my}H${ax1}`} stroke={G[5]} strokeWidth={4} markerEnd="url(#wsk-arr2)" />, ARR_DEFS);
      o.ev.forEach((e, i) => {
        const px = pad + fs * 0.5 + sw * (i + 0.5), up = e.side ? e.side === "up" : i % 2 === 0, cw_ = Math.min(sw * 1.7, fs * 10), chh = up ? my - stem - top - 2 : H - pad - my - stem, cy0 = up ? my - stem - chh : my + stem;
        out.push(<circle key={`tc${i}`} cx={px} cy={my} r={s * 0.5} fill={tone(i, n, 3, 6)} stroke="#fff" strokeWidth={1.5} />, <line key={`ts${i}`} x1={px} x2={px} y1={up ? my - s * 0.5 : my + s * 0.5} y2={up ? my - stem : my + stem} stroke={G[3]} />,
          <rect key={`tb${i}`} x={px - cw_ / 2} y={cy0} width={cw_} height={chh} rx={3} fill={G[0]} stroke={G[1]} />,
          <Tx key={`tp${i}`} x={px} y={cy0 + s * 0.4} w={cw_ - 6} s={s * 0.85} t={e.p} fill="#2563eb" bold anchor="middle" max={1} />,
          <Tx key={`tt${i}`} x={px} y={cy0 + s * (e.p ? 1.5 : 0.4)} w={cw_ - 6} s={s * 0.85} t={e.t} fill={INK} bold anchor="middle" max={2} />,
          <Tx key={`td${i}`} x={px} y={cy0 + s * (e.p ? 2.7 : 1.6)} w={cw_ - 6} s={s * 0.72} t={e.d} anchor="middle" max={2} />);
      });
      if (gw) out.push(<path key="tf" d={`M${W - pad - gw + s} ${my - fs * 2.6}v${fs * 2.4}M${W - pad - gw + s} ${my - fs * 2.6}l${fs * 1.4} ${fs * 0.5}l${-fs * 1.4} ${fs * 0.5}`} stroke={G[6]} strokeWidth={2} fill={G[6]} />,
        <Tx key="tg" x={W - pad - gw + s} y={my + s * 0.3} w={gw - s} s={s * 0.9} t={o.goal} fill={G[6]} bold max={3} />);
      return out;
    }
    case "stairs": {
      const o = P.stairs(b.d);
      if (o.steps.length < 2) return null;
      const n = o.steps.length, top = pad + fs * 2.6, sw = (W - pad * 2 - s) / n, sh = (H - pad - top) / (n + 0.2);
      o.steps.forEach((st_, i) => {
        const sx = pad + i * sw, sy = H - pad - (i + 1) * sh, col = tone(i, n, 1, 5);
        out.push(<rect key={`st${i}`} x={sx} y={sy} width={sw - 3} height={(i + 1) * sh} fill={col} />, <line key={`stl${i}`} x1={sx} x2={sx + sw - 3} y1={sy} y2={sy} stroke={G[5]} strokeWidth={2} />,
          <Tx key={`stp${i}`} x={sx + sw / 2} y={sy + s * 0.4} w={sw - s} s={s * 0.75} t={st_.p} fill={light(col) ? "#2563eb" : G[1]} bold anchor="middle" max={1} />,
          <Tx key={`stt${i}`} x={sx + sw / 2} y={sy + s * (st_.p ? 1.4 : 0.4)} w={sw - s} s={s * 0.9} t={st_.t} fill={light(col) ? INK : "#fff"} bold anchor="middle" max={2} />,
          <Tx key={`std${i}`} x={sx + sw / 2} y={sy + s * (st_.p ? 2.6 : 1.6)} w={sw - s} s={s * 0.72} t={st_.d} fill={light(col) ? SUB : G[1]} anchor="middle" max={2} />);
      });
      const fx = pad + n * sw - fs * 1.2, fy = H - pad - n * sh;
      out.push(<path key="stf" d={`M${fx} ${fy}v${-fs * 2}l${fs * 1.2} ${fs * 0.4}l${-fs * 1.2} ${fs * 0.4}`} stroke={G[6]} strokeWidth={2} fill={G[6]} />);
      if (b.t) out.push(<Tx key="stg" x={fx - s * 0.5} y={pad} w={W - pad * 2} s={fs * 0.95} t={b.t} fill={G[6]} bold anchor="end" max={1} />);
      return out;
    }
    case "consortium": {
      const o = P.consortium(b.d);
      if (o.cos.length < 2) return null;
      const cos = o.cos.some((c) => c.lead) ? o.cos : o.cos.map((c, i) => ({ ...c, lead: i === 0 })), top = head(x, out), pg = fs * 1.6, wts = cos.map((c) => (c.lead ? 1.35 : 1)), unit = (W - pad * 2 - pg * (cos.length - 1)) / wts.reduce((a, v) => a + v, 0), sh = cos.some((c) => c.share) ? fs * 2 : 0;
      let cx = pad;
      cos.forEach((c, i) => {
        const w_ = unit * wts[i]!, ty = top + sh + (c.lead ? 0 : fs * 0.8), by = H - pad - (c.lead ? 0 : fs * 0.8);
        if (c.share) out.push(<Tx key={`cs${i}`} x={cx + w_ / 2} y={top + (c.lead ? 0 : fs * 0.6)} w={w_} s={c.lead ? fs * 1.5 : fs * 1.2} t={c.share} fill={c.lead ? G[6] : SUB} bold anchor="middle" max={1} />);
        out.push(<rect key={`cb${i}`} x={cx} y={ty} width={w_} height={by - ty} rx={5} fill={c.lead ? G[0] : "#fff"} stroke={c.lead ? G[6] : G[2]} strokeWidth={c.lead ? 2.5 : 1} />,
          <rect key={`ch${i}`} x={cx} y={ty} width={w_} height={s * 1.8} rx={5} fill={c.lead ? G[6] : G[3]} />, <Tx key={`cn${i}`} x={cx + w_ / 2} y={ty + s * 0.4} w={w_ - s} s={s * 0.95} t={`${c.lead ? "★ " : ""}${c.name}`} fill="#fff" bold anchor="middle" max={1} />,
          <Tx key={`cr${i}`} x={cx + w_ / 2} y={ty + s * 2.5} w={w_ - s * 1.4} s={s * 0.85} t={c.role} fill={INK} bold anchor="middle" max={2} />,
          <Tx key={`co${i}`} x={cx + w_ / 2} y={ty + s * 4.8} w={w_ - s * 1.4} s={s * 0.75} t={c.note} anchor="middle" max={2} />);
        if (i < cos.length - 1) out.push(<text key={`cp${i}`} x={cx + w_ + pg / 2} y={(ty + by) / 2} fontSize={fs * 1.3} fill={G[3]} textAnchor="middle" dominantBaseline="middle">+</text>);
        cx += w_ + pg;
      });
      return out;
    }
    case "trace": {
      const o = P.trace(b.d);
      if (!o.left.length || !o.right.length) return null;
      const top = head(x, out), three = o.mid.length > 0, Wd = W - pad * 2, ws = three ? [Wd * 0.24, Wd * 0.31, Wd * 0.29] : [Wd * 0.3, Wd * 0.42], xs = three ? [pad, pad + Wd * 0.355, pad + Wd * 0.71] : [pad, pad + Wd * 0.58];
      const groups = three ? [o.left, o.mid, o.right] : [o.left, o.right], hh = s * 1.7, by = top + hh + s * 0.5, centers: Record<string, number>[] = [];
      o.head.forEach((h, i) => out.push(<rect key={`th${i}`} x={xs[i]} y={top} width={ws[i]} height={hh} rx={hh / 2} fill={i === groups.length - 1 ? G[6] : i ? G[4] : G[3]} />, <Tx key={`tht${i}`} x={xs[i]! + ws[i]! / 2} y={top + hh / 2 - s * 0.5} w={ws[i]!} s={s * 0.9} t={h} fill="#fff" bold anchor="middle" max={1} />));
      groups.forEach((items, i) => {
        const rh = (H - pad - by) / Math.max(1, items.length), bh = Math.min(rh - 4, fs * 2.6), last = i === groups.length - 1, cs: Record<string, number> = {};
        items.forEach((it, j) => { const cy = by + rh * (j + 0.5); cs[it] = cy; out.push(<rect key={`tb${i}${j}`} x={xs[i]} y={cy - bh / 2} width={ws[i]} height={bh} rx={3} fill="#fff" stroke={last ? G[6] : G[2]} strokeWidth={last ? 2 : 1} />, <Tx key={`tbt${i}${j}`} x={xs[i]! + ws[i]! / 2} y={cy - s * 0.45} w={ws[i]! - s} s={s * 0.8} t={it} fill={INK} bold anchor="middle" max={1} />); });
        centers.push(cs);
      });
      const pairs = new Set<string>();
      for (const [a, m, rs] of o.rows) { if (three) { if (m) { pairs.add(`0\u0001${a}\u0001${m}`); for (const r of rs) pairs.add(`1\u0001${m}\u0001${r}`); } } else for (const r of rs) pairs.add(`0\u0001${a}\u0001${r}`); }
      [...pairs].forEach((p, k) => {
        const [i_, a, c] = p.split("\u0001"), i = +i_!, ya = centers[i]?.[a!], yc = centers[i + 1]?.[c!];
        if (ya === undefined || yc === undefined) return;
        out.push(<line key={`tl${k}`} x1={xs[i]! + ws[i]!} y1={ya} x2={xs[i + 1]!} y2={yc} stroke="#60a5fa" strokeDasharray="3 2" />, <circle key={`tla${k}`} cx={xs[i]! + ws[i]!} cy={ya} r={2.5} fill="#2563eb" />, <circle key={`tlb${k}`} cx={xs[i + 1]!} cy={yc} r={2.5} fill={G[5]} />);
      });
      return out;
    }
    case "twinhub": {
      const o = P.twinhub(b.d);
      if (o.hubs.length < 2) return null;
      const top = head(x, out), lw = W * 0.38, aw = W * 0.08, rw = W - lw - aw;
      o.hubs.forEach((h, i) => {
        const big = i === 1, hx = big ? lw + aw : 0, w_ = big ? rw : lw, t0 = top + (h.label ? s * 1.8 : 0), cx = hx + w_ / 2, cy = (t0 + H) / 2, rx = w_ * 0.38, ry = (H - t0) * (big ? 0.4 : 0.34), r = Math.min(rx * 0.34, ry * 0.5), nw = Math.min(rx * 0.95, fs * 7), nh = s * 1.5;
        if (h.label) { const lw_ = tw(h.label, s * 0.8) + s * 1.4; out.push(<rect key={`hl${i}`} x={cx - lw_ / 2} y={top} width={lw_} height={s * 1.3} rx={s * 0.65} fill={big ? G[6] : G[1]} />, <Tx key={`hlt${i}`} x={cx} y={top + s * 0.15} w={lw_} s={s * 0.8} t={h.label} fill={big ? "#fff" : INK} bold anchor="middle" max={1} />); }
        h.nodes.forEach((nd, j) => {
          const a = -Math.PI / 2 + (2 * Math.PI * j) / h.nodes.length, px = cx + rx * Math.cos(a), py = cy + ry * Math.sin(a);
          out.push(<line key={`hn${i}${j}`} x1={cx} y1={cy} x2={px} y2={py} stroke={G[3]} />, <rect key={`hr${i}${j}`} x={px - nw / 2} y={py - nh / 2} width={nw} height={nh} rx={nh / 2} fill={G[0]} stroke={G[2]} />, <Tx key={`ht${i}${j}`} x={px} y={py - s * 0.42} w={nw - 6} s={s * 0.78} t={nd} fill={INK} bold anchor="middle" max={1} />);
        });
        out.push(<circle key={`hc${i}`} cx={cx} cy={cy} r={r} fill={big ? G[6] : G[4]} />, <Tx key={`hct${i}`} x={cx} y={cy - s * 0.5} w={r * 1.6} s={s * 0.85} t={h.center} fill="#fff" bold anchor="middle" max={2} />);
      });
      const ax = lw + 4, my = (top + H) / 2 + fs * 0.6;
      out.push(<polygon key="ha" points={`${ax},${my - fs * 0.7} ${ax + aw - fs * 1.2},${my - fs * 0.7} ${ax + aw - 4},${my} ${ax + aw - fs * 1.2},${my + fs * 0.7} ${ax},${my + fs * 0.7} ${ax + fs * 0.5},${my}`} fill={G[3]} />);
      return out;
    }
    default:
      return null;
  }
}

/** 2차 도식이 함께 쓰는 화살촉 */
const ARR_DEFS = <defs key="arrdefs"><marker id="wsk-arr2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill={G[5]} /></marker></defs>;

/** 단계 흐름(쉐브론) — 줄마다 '단계명: 설명' */
function Flow({ b, fs }: { b: WireBlock; fs: number }) {
  const ss = P.steps(b.d).slice(0, 7);
  return (
    <div className="flex-1 min-h-0 flex flex-col px-[0.7em] pt-[0.6em] pb-[0.5em]">
      {b.t && <div className="font-bold text-[var(--color-ink)] leading-tight whitespace-pre-line break-words mb-[0.5em]" style={{ fontSize: fs * 1.02 }}>{b.t}</div>}
      <div className="flex-1 min-h-0 flex items-stretch gap-[1.5%]">
        {ss.map((s, i) => (
          <div key={i} className="flex-1 min-w-0 flex flex-col">
            <div className="flex items-center justify-center text-[var(--color-ink)] font-bold text-center leading-tight px-[8%]"
              style={{ minHeight: fs * 2.4, fontSize: fs * 0.82, background: "var(--color-line-3)", clipPath: i < ss.length - 1 ? "polygon(0 0,88% 0,100% 50%,88% 100%,0 100%)" : undefined }}>{s.t.replace(/\*\*/g, "")}</div>
            {s.d && <div className="mt-[0.4em] text-[var(--color-ink-3)] leading-snug text-center" style={{ fontSize: fs * 0.74 }}>{s.d.replace(/\*\*/g, "")}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** 일정 — worker design.py wire_gantt 와 같다 */
function Gantt({ b, fs }: { b: WireBlock; fs: number }) {
  const { head: hd, rows, pins } = P.gantt(b.d);
  const n = Math.max(1, hd.length), tn = (i: number) => `hsl(0 0% ${82 - (i * 22) / Math.max(1, rows.length - 1)}%)`;
  return (
    <div className="flex-1 min-h-0 flex flex-col px-[0.7em] pt-[0.6em] pb-[0.5em]" style={{ fontSize: fs * 0.78 }}>
      {b.t && <div className="font-bold text-[var(--color-ink)] leading-tight whitespace-pre-line break-words mb-[0.4em]" style={{ fontSize: fs * 1.02 }}>{b.t}</div>}
      <div className="flex bg-[var(--color-line)] font-bold text-[var(--color-ink-2)]"><div className="w-[24%] shrink-0" />{hd.map((h, i) => <div key={i} className="flex-1 min-w-0 text-center truncate py-[0.15em] border-l border-white">{h}</div>)}</div>
      <div className="flex-1 min-h-0 flex flex-col">
        {rows.map((r, i) => (
          <div key={i} className="flex-1 min-h-0 flex items-center border-b border-[var(--color-line)]">
            <div className="w-[24%] shrink-0 pr-[0.4em] text-[var(--color-ink-2)] leading-tight">{r.t}</div>
            <div className="relative flex-1 h-full">
              <div className="absolute top-[22%] bottom-[22%] rounded-[2px] flex items-center px-[0.4em] text-[var(--color-ink)] truncate"
                style={{ left: `${(r.a / n) * 100}%`, width: `${((r.e - r.a + 1) / n) * 100}%`, background: tn(i) }}>{r.l}</div>
            </div>
          </div>
        ))}
        {pins.length > 0 && (
          <div className="relative flex-none" style={{ height: fs * 1.6, marginLeft: "24%" }}>
            {pins.map((p, i) => <span key={i} className="absolute top-[0.2em] whitespace-nowrap text-[var(--color-ink-2)]" style={{ left: `${((p.a + 0.3) / n) * 100}%` }}>◆ {p.t}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}

/** 단계 범위 — 오른쪽일수록 높고 진하게 */
function Phase({ b, fs }: { b: WireBlock; fs: number }) {
  const ss = P.steps(b.d).slice(0, 6), n = ss.length;
  return (
    <div className="flex-1 min-h-0 flex flex-col px-[0.7em] pt-[0.6em] pb-[0.5em]">
      {b.t && <div className="font-bold text-[var(--color-ink)] leading-tight whitespace-pre-line break-words mb-[0.4em]" style={{ fontSize: fs * 1.02 }}>{b.t}</div>}
      <div className="flex-1 min-h-0 flex items-end gap-[1.5%]">
        {ss.map((s, i) => {
          const dark = i / Math.max(1, n - 1) > 0.5;
          return (
            <div key={i} className="flex-1 min-w-0 rounded-[2px] px-[0.5em] py-[0.4em] overflow-hidden"
              style={{ height: `${55 + (45 * i) / Math.max(1, n - 1)}%`, background: `hsl(0 0% ${86 - (46 * i) / Math.max(1, n - 1)}%)`, color: dark ? "#fff" : "var(--color-ink)" }}>
              <div className="font-bold leading-tight" style={{ fontSize: fs * 0.9 }}>{s.t.replace(/\*\*/g, "")}</div>
              {s.d && <div className="mt-[0.3em] leading-snug" style={{ fontSize: fs * 0.74, opacity: 0.85 }}>{s.d.replace(/\*\*/g, "")}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 큰 수치 줄 — '수치 | 설명', 강조 수치는 밑줄 */
function Kpi({ b, fs, boxH }: { b: WireBlock; fs: number; boxH: number }) {
  const ks = P.kpis(b.d).filter((k) => !/^(출처|자료)/.test(k.v)).slice(0, 4), hl = P.meta(b.d)[0].highlight;
  // 좁은 칸(수치 하나당 본문 폭 14% 미만)은 세로로 쌓는다 — 서버 WireLayout::kpiStacked · 엔진 wire_png 와 같은 기준(E2E 382 3쪽 "71.4%3.2점")
  const stacked = ks.length >= 2 && b.w / ks.length < 14;
  const big = Math.max(fs * 1.1, Math.min(fs * 2.6, (stacked ? boxH / ks.length : boxH) * 0.38));
  return (
    <div className="flex-1 min-h-0 flex flex-col px-[0.7em] pt-[0.5em] pb-[0.4em]">
      {b.t && <div className="font-bold text-[var(--color-ink)] leading-tight whitespace-pre-line break-words mb-[0.3em]" style={{ fontSize: fs * 1.02 }}>{b.t}</div>}
      <div className={cn("flex-1 min-h-0 flex", stacked ? "flex-col justify-around" : "items-center")}>
        {ks.map((k, i) => {
          const on = !!hl && (hl === k.v || k.v.includes(hl) || k.c === hl);
          return (
            <div key={i} className={cn("flex-1 min-w-0 text-center px-[0.3em] [container-type:inline-size]", i > 0 && (stacked ? "border-t border-[var(--color-line-3)] pt-[0.3em]" : "border-l border-[var(--color-line-3)]"))}>
              <div className={cn("font-extrabold leading-none tracking-[-.02em] whitespace-nowrap", hl && !on ? "text-[var(--color-ink-4)]" : "text-[var(--color-ink)]", on && "underline decoration-[0.08em] underline-offset-[0.18em]")} style={{ fontSize: fitBig(big, k.v) }}>{k.v}</div>
              {k.c && <div className="mt-[0.35em] leading-snug text-[var(--color-ink-3)]" style={{ fontSize: fs * 0.8 }}>{k.c}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 상자 종류에 맞는 모양. 그릴 거리가 없으면 null — 글 상자로 보인다. W·H 는 이 영역의 px 크기 */
export function KindView({ b, fs, W, H }: { b: WireBlock; fs: number; W: number; H: number }): ReactNode {
  switch (b.k) {
    case "flow": return P.steps(b.d).length >= 2 ? <Flow b={b} fs={fs} /> : null;
    case "gantt": return P.gantt(b.d).head.length > 0 ? <Gantt b={b} fs={fs} /> : null;
    case "phase": return P.steps(b.d).length >= 2 ? <Phase b={b} fs={fs} /> : null;
    case "kpi": return P.kpis(b.d).length > 0 ? <Kpi b={b} fs={fs} boxH={H} /> : null;
    default: {
      if (W < 8 || H < 8) return null;
      const nodes = svgFor({ b, fs, W, H });
      if (!nodes) return null;
      return <svg className="flex-1 min-h-0 w-full block" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" fontFamily="inherit">{nodes}</svg>;
    }
  }
}

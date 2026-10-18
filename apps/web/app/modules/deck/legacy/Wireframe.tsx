// 와이어프레임 — 배치 틀 고르기·상자 편집(16:9 본문 좌표) — 출처: powerDeck web/src/Wireframe.tsx (옛 화면 그대로 이식, eslint.config.js legacy 구역).
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { api, type WireBlock, type WireKind } from "./api";
import { cn, Modal, Ms, Select, toast, ask } from "./ui";
import tplData from "./data/wire_templates.json";
import { KIND_INFO, KIND_LIST, isData, meta } from "./wireParse";
import { KindView, fitBig } from "./WireSketch";

/** 미리 만들어 둔 배치 틀 — 서버(api/src/WireLayout.php)가 같은 파일로 좌표를 계산한다 */
type TplCell = { span?: number; h?: number; k?: string; stack?: TplCell[] };
type Tpl = { id: string; name: string; desc: string; arrows?: boolean; rel?: string; rows: { h: number; cols: TplCell[] }[] };
const TEMPLATES = (tplData as unknown as { templates: Tpl[] }).templates;

/**
 * 와이어프레임 — 시안(이미지) 전에 장의 화면 구성을 상자로 잡는다.
 * 캔버스는 시안과 같은 3:2(머리 띠 9.4% · 바닥 6%), 상자 좌표는 본문(머리·바닥 사이, 시안 본문 그림과 같은 16:9) 기준 %.
 * MCP 판정(deck_check_wireframe)도 같은 본문 16:9 좌표를 쓴다 — 기준은 16:9 하나(2026-10-07 결정).
 * 그래서 핀 의견 좌표가 시안과 같고, 엔진이 이 배치를 그대로 그림으로 그려 이미지 모델에 넘긴다.
 */
/** 키메시지 입력칸과 그 밑에 까는 색칠한 글 — 글자 자리가 맞게 둘이 같은 모양을 쓴다 */
const TITLE_CLS = "px-1 py-0.5 text-center font-extrabold leading-[1.3] text-[var(--color-ink)] whitespace-pre-wrap break-words overflow-hidden";

const FS = 0.0131;   // 기본 글자 = 캔버스 폭 × 이 값
const HEAD =150 / 1600, FOOT = 96 / 1600;   // design.py FRAME 과 같은 비율

/** 상자 종류 한 벌 — 이름·도구줄 설명·아이콘·새 상자 기본 크기(본문 %)는 data/wire_kinds.json(정본 engine/wire_kinds.json, 2026-10-18).
 *  본문이 가로로 넓어(약 16:9) 같은 길이로 보이려면 높이 % 가 폭 % 의 1.77배다 */
const KINDS = KIND_LIST;
const KIND_ICON = Object.fromEntries(KINDS.map((x) => [x.k, x.icon])) as Record<WireKind, string>;
const KIND_SIZE = Object.fromEntries(KINDS.map((x) => [x.k, [x.size.w, x.size.h]])) as Record<WireKind, [number, number]>;
const KIND = KIND_INFO;

/** 기본 배치 — 와이어프레임이 없는 예전 기획에 넣는다(실제 장표에 가장 흔한 좌 25 · 중 50 · 우 25 + 아래 결론 띠) */
const defaultWire = (): WireBlock[] => [
  { id: "a", k: "panel", x: 2, y: 15, w: 26, h: 66, t: "상황·입력" },
  { id: "b", k: "image", x: 30, y: 15, w: 40, h: 66, t: "우리의 장치(플랫폼·절차·화면)" },
  { id: "c", k: "panel", x: 72, y: 15, w: 26, h: 66, t: "결과·전략" },
  { id: "d", k: "band", x: 2, y: 85, w: 96, h: 10, t: "한 줄 결론" },
];

const r1 = (v: number) => Math.round(v * 2) / 2;   // 0.5% 눈금
/** 12칸 격자의 칸 경계(%) — 좌우 2~98, 칸 사이 2. 서버의 배치 계산(api/src/WireLayout.php)과 같은 격자라 끌어도 같은 줄에 붙는다 */
const COL_W = (96 - 2 * 11) / 12;
const GRID_X = Array.from({ length: 12 }, (_, i) => [2 + i * (COL_W + 2), 2 + i * (COL_W + 2) + COL_W]).flat().map((v) => Math.round(v * 2) / 2);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const uid = () => Math.random().toString(36).slice(2, 8);

/** 상자 안 모양 — 종류마다 한눈에 알아보는 표시 */
/** 상자 제목 입력 — 글 길이만큼 높이가 늘고(넘친 글이 숨지 않게) Shift+Enter 로 줄바꿈, Enter 는 줄을 넣지 않는다 */
function TitleArea({ value, onChange, className, style, placeholder, autoFocus, maxLength }: {
  value: string; onChange: (v: string) => void; className?: string; style?: CSSProperties; placeholder?: string; autoFocus?: boolean; maxLength?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { const el = ref.current; if (!el) return; el.style.height = "auto"; el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`; }, [value]);
  return <textarea ref={ref} rows={1} autoFocus={autoFocus} maxLength={maxLength} className={cn("resize-none overflow-hidden whitespace-pre-wrap break-words", className)} style={style}
    value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) e.preventDefault(); }} />;
}

function Glyph({ k, fs }: { k: WireKind; fs: number }) {
  const s = Math.max(10, fs * 2.4);
  const st = { width: s, height: s };
  const c = "var(--color-ink-4)";
  switch (k) {
    case "person": return <svg style={st} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6"><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1.2-4 4-6 7-6s5.8 2 7 6" /></svg>;
    case "image": return <svg style={st} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 16l5-5 4 4 3-3 6 6" /><circle cx="16" cy="9" r="1.6" /></svg>;
    case "screen": return <svg style={st} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6"><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M8 20h8M12 16v4" /></svg>;
    case "chart": return <svg style={st} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8"><path d="M4 20V10M10 20V6M16 20v-8M22 20H2" /></svg>;
    case "table": return <svg style={st} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.5"><rect x="3" y="5" width="18" height="14" rx="1" /><path d="M3 10h18M3 14.5h18M9 5v14M15 5v14" /></svg>;
    case "flow": return <svg style={st} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6"><path d="M2 7h5l3 5-3 5H2l3-5zM10 7h5l3 5-3 5h-5l3-5z" /></svg>;
    case "map": return <svg style={st} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6"><path d="M12 21s-6-5.5-6-10a6 6 0 0112 0c0 4.5-6 10-6 10z" /><circle cx="12" cy="11" r="2" /></svg>;
    default: return null;
  }
}

/**
 * 표 열 정렬 규칙(모든 표 공통) — 머리는 모두 가운데. 몸통은 열마다:
 *   오른쪽: 비교해 읽는 수치(금액·%·천 단위 쉼표·소수·단위 붙은 수 — 자릿수가 다른 숫자)
 *   왼쪽: 제목·문장처럼 5자 이상이면서 길이가 들쭉날쭉한 글
 *   가운데: 그 밖의 모두(짧은 값, 길이가 고른 값 — 번호·연도·날짜·점수·상태)
 */
function colAlign(cells: string[]): "left" | "center" | "right" {
  const v = cells.map((c) => c.trim()).filter(Boolean);
  if (!v.length) return "left";
  const num = /^[-+−]?[₩$€¥]?\s?\d[\d,.]*\s?(원|만원|억원|억|만|천|%|점|건|명|개|회|대|년|월|일|시간|분|초|㎡|km|m|kg|t|GB|TB|MB|천원|백만원|억 원|만 원)?$/;
  const lens = v.map((c) => [...c].length);
  const uniform = Math.max(...lens) - Math.min(...lens) <= 2;
  if (v.every((c) => num.test(c))) {
    const compare = v.some((c) => /[₩$€¥%,.]|원|만|억|천/.test(c)) || !uniform;
    return compare ? "right" : "center";
  }
  return Math.max(...lens) >= 5 && !uniform ? "left" : "center";
}

/** 상자 안의 실제 글 — 항목은 줄마다(앞의 -·• 는 점으로), 표는 '가 | 나 | 다' 줄을 칸으로 */
function Body({ d, fs, light }: { d: string; fs: number; light?: boolean }) {
  const lines = d.split("\n").map((l) => l.replace(/\s+$/, "")).filter((l) => l.trim() && !/^\|?\s*:?-{2,}/.test(l.trim()));
  const rows = lines.filter((l) => l.includes("|"));
  if (rows.length >= 2 && rows.length >= lines.length - 1) {   // 표
    const cells = rows.map((r) => r.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim()));
    const nc = Math.max(...cells.map((r) => r.length));
    const aligns = Array.from({ length: nc }, (_, k) => colAlign(cells.slice(1).map((r) => r[k] ?? "")));   // 열마다 몸통 값으로 정한다(머리 제외)
    return (
      <table className="w-full border-collapse mt-[0.4em]" style={{ fontSize: fs * 0.8 }}>
        <tbody>{cells.map((r, i) => (
          <tr key={i}>{r.map((c, k) => <td key={k} style={{ textAlign: i === 0 ? "center" : aligns[k] }}
            className={cn("border border-[var(--color-line-3)] px-[0.4em] py-[0.15em] align-top", i === 0 && "bg-[var(--color-line)] font-bold text-[var(--color-ink-2)]")}>{c}</td>)}</tr>
        ))}</tbody>
      </table>
    );
  }
  return (
    <div className="mt-[0.3em] space-y-[0.15em]" style={{ fontSize: fs * 0.86 }}>
      {lines.map((l, i) => {
        const sub = /^\s{2,}|^\t/.test(l), bullet = /^\s*([-*•·]|\d+[.)])\s+/.test(l);
        const t = l.replace(/^\s*([-*•·]|\d+[.)])\s+/, "").replace(/\*\*/g, "").trim();
        return (
          <div key={i} className={cn("flex gap-[0.35em] leading-snug", light ? "text-white/90" : "text-[var(--color-ink-3)]")} style={{ paddingLeft: sub ? "1em" : 0 }}>
            {bullet && <span className={light ? "text-white/70" : "text-[var(--color-ink-4)]"}>•</span>}<span className="min-w-0">{t}</span>
          </div>
        );
      })}
    </div>
  );
}

/** 그림 자리 — '그림:' 줄은 무엇을 그릴지(옅게), 나머지 줄은 그림 위에 찍힐 글(말풍선·라벨), t 는 캡션 */
function Visual({ b, fs }: { b: WireBlock; fs: number }) {
  const lines = (b.d || "").split("\n").map((l) => l.trim()).filter(Boolean);
  const draw = lines.filter((l) => /^(그림|장면)\s*[:：]/.test(l)).map((l) => l.replace(/^(그림|장면)\s*[:：]\s*/, ""));
  const say = lines.filter((l) => !/^(그림|장면)\s*[:：]/.test(l));
  return (
    <div className="relative flex-1 min-h-0 flex flex-col p-[0.7em] gap-[0.4em]">
      <XBox className="absolute inset-0" />
      <div className="relative self-start flex items-center gap-[0.4em] text-[var(--color-ink-4)] bg-white pr-[0.4em]" style={{ fontSize: fs * 0.72 }}><Glyph k={b.k} fs={fs * 0.55} />{KIND[b.k].label}</div>
      {draw.length > 0 && <div className="relative self-start leading-snug text-[var(--color-ink-4)] bg-white/90 px-[0.3em]" style={{ fontSize: fs * 0.74 }}>{draw.join(" · ")}</div>}
      <div className="relative flex-1 min-h-0 flex flex-wrap content-center justify-center gap-[0.45em]">
        {say.map((l, i) => {
          const bubble = /^["“'‘]/.test(l);
          return <span key={i} className={cn("bg-white border text-[var(--color-ink-2)] leading-snug px-[0.6em] py-[0.25em] font-semibold", bubble ? "rounded-[1em] border-[var(--color-ink-4)]" : "rounded-[2px] border-[var(--color-ink-4)]")}
            style={{ fontSize: fs * 0.8 }}>{l.replace(/^\s*[-•]\s*/, "").replace(/\*\*/g, "")}</span>;
        })}
        {!say.length && !draw.length && <Glyph k={b.k} fs={fs * 1.6} />}
      </div>
      {b.t && <div className="relative self-center text-center font-bold text-[var(--color-ink)] leading-tight whitespace-pre-line bg-white px-[0.4em]" style={{ fontSize: fs * 0.9 }}>{b.t}</div>}
    </div>
  );
}

/** 그림·로고 자리 — 대각선 두 줄(와이어프레임 표기) */
export function XBox({ className }: { className?: string }) {
  return (
    <svg className={cn("pointer-events-none", className)} width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100" aria-hidden>
      <path d="M0 0L100 100M100 0L0 100" stroke="currentColor" className="text-line-3" strokeWidth="1" vectorEffect="non-scaling-stroke" fill="none" />
    </svg>
  );
}
/** 키메시지의 강조어 — 색 대신 밑줄 */
const KW = { textDecoration: "underline", textDecorationThickness: "0.1em", textUnderlineOffset: "0.22em" } as const;

const MENU_ITEM = "w-full h-9 px-2.5 rounded-[3px] flex items-center gap-2 text-left whitespace-nowrap hover:bg-panel";
const MENU_KEY = "ml-auto text-[12px] font-medium text-faint";

type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const HANDLES: [Handle, string, string][] = [["nw", "0%", "0%"], ["n", "50%", "0%"], ["ne", "100%", "0%"], ["e", "100%", "50%"], ["se", "100%", "100%"], ["s", "50%", "100%"], ["sw", "0%", "100%"], ["w", "0%", "50%"]];
const CURSOR: Record<Handle, string> = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize" };

function Block({ b, fs, sel, editing, onDown, onResize, onEdit, onPatch, onMenu }: {
  b: WireBlock; fs: number; sel: boolean; editing: boolean; onMenu?: (e: React.MouseEvent) => void;
  onDown?: (e: React.PointerEvent) => void; onResize?: (e: React.PointerEvent, h: Handle) => void;
  onEdit?: () => void; onPatch?: (p: Partial<WireBlock>) => void;
}) {
  const band = b.k === "band", badge = b.k === "badge", panel = b.k === "panel", text = b.k === "text";
  const visual = ["person", "image", "screen", "chart", "flow", "map", "pin"].includes(b.k);   // 그림 자리 — 장면 설명을 적는다
  const light = band || badge;
  const stop = (e: React.PointerEvent) => e.stopPropagation();
  const boxH = (fs / FS) * (2 / 3) * (1 - HEAD - FOOT) * (b.h / 100);   // 상자 높이(px) — 캔버스 폭에서 거꾸로 셈
  const boxW = (fs / FS) * (b.w / 100);
  // 데이터 그림(chart·kpi·table·gauge·proportion·progress)의 머리 줄 — 메시지는 아래 띠로, 나머지 머리 줄은 글에서 뺀다(2026-10-18)
  const data = isData(b.k);
  const [mt, rest] = data ? meta(b.d) : [{}, [] as string[]];
  const msg = data ? mt.message || "" : "";
  const dd = data ? rest.join("\n").trim() : b.d;
  const sketch = editing ? null : KindView({ b, fs, W: boxW, H: boxH - (msg ? fs * 1.7 : 0) });
  return (
    <div data-block onPointerDown={editing ? undefined : onDown} onDoubleClick={onEdit} onContextMenu={editing ? undefined : onMenu}
      className={cn("absolute flex flex-col", onDown && !editing && "cursor-move", (sel || editing) && "z-10")}
      style={{
        left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%`, borderRadius: 2,
        background: band ? "var(--color-line)" : text ? "transparent" : "#FFFFFF",
        border: text ? "1px dashed var(--color-line-3)" : badge ? "2px solid var(--color-ink-4)" : "1px solid var(--color-ink-4)",
        outline: editing ? "2px solid var(--color-ink)" : sel ? "2px solid var(--color-point)" : undefined, outlineOffset: 1,
        boxShadow: sel && !editing ? "0 2px 10px rgba(0,0,0,.35)" : undefined,
      }}>
      <div data-clip-ok className="absolute inset-0 overflow-hidden flex flex-col" style={{ borderRadius: "inherit", fontSize: fs }}>
      {editing && onPatch ? (
        <div className="flex-1 min-h-0 flex flex-col gap-1 p-[0.6em] bg-white" onPointerDown={stop}>
          <TitleArea autoFocus className="w-full flex-none font-bold leading-tight text-[var(--color-ink)] border-b border-[var(--color-line-3)] outline-none bg-transparent" style={{ fontSize: fs }} value={b.t} onChange={(t) => onPatch({ t })} placeholder="제목 (Shift+Enter 줄바꿈)" />
          <textarea className="flex-1 w-full resize-none outline-none bg-transparent text-[var(--color-ink-2)] leading-snug" style={{ fontSize: fs * 0.8 }} value={b.d ?? ""} onChange={(e) => onPatch({ d: e.target.value })}
            placeholder={"들어갈 글 — 한 줄에 하나\n- 항목\n표는 '가 | 나 | 다' 처럼"} />
        </div>
      ) : <>
        {panel && <div className="flex-none flex items-center px-[0.9em] font-bold text-[var(--color-ink)] truncate border-b border-[var(--color-ink-4)]" style={{ background: "var(--color-line)", height: fs * 2, fontSize: fs * 0.95 }}>{b.t}</div>}
        {sketch ? sketch
          : visual ? <Visual b={b} fs={fs} />
          : badge ? (
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center px-[0.9em] text-[var(--color-ink)] [container-type:inline-size]">
              {/* 낮은 상자에서 잘리지 않게 — 수치 크기를 상자 높이에 맞추고, 설명은 들어갈 자리가 있을 때만 */}
              <div className="font-extrabold leading-none tracking-[-.02em] whitespace-nowrap" style={{ fontSize: fitBig(Math.max(fs * 0.9, Math.min(fs * 2.3, boxH * (b.d && boxH > fs * 3.6 ? 0.4 : 0.6))), b.t) }}>{b.t}</div>
              {b.d && boxH > fs * 3.6 && <div className="mt-[0.4em] leading-snug text-[var(--color-ink-3)] whitespace-pre-line overflow-hidden" style={{ fontSize: fs * 0.9, maxHeight: boxH * 0.4 }}>{b.d.replace(/\*\*/g, "")}</div>}
            </div>
          ) : (() => {
            // 낮은 상자 — 위 여백 없이 세로 가운데에 놓고, 그래도 넘치면 글자를 상자 높이에 맞춰 줄인다(0.62배까지)
            const room = boxH - (panel ? fs * 2 : 0);
            const need = fs * ((!panel && b.t ? 1.4 + (b.t.split("\n").length - 1) * 1.2 : 0) + (dd ? dd.split("\n").filter((l) => l.trim()).length * 1.25 + 0.3 : 0));
            const tight = need + fs * 0.9 > room;
            const k = tight ? Math.max(0.62, Math.min(1, room / (need + fs * 0.2))) : 1;
            return (
              <div className={cn("flex-1 min-h-0 flex flex-col px-[0.9em] overflow-hidden", tight ? "justify-center" : "pt-[0.55em]", light && "justify-center text-center items-center pt-0")}>
                {!panel && b.t && <div className={cn("font-bold leading-tight text-[var(--color-ink)] whitespace-pre-line break-words", tight && "line-clamp-2")} style={{ fontSize: fs * (light ? 1.1 : 1.08) * k }}>{b.t}</div>}
                {dd && <Body d={dd} fs={fs * k} />}
              </div>
            );
          })()}
        {msg && <div className="flex-none mx-[0.5em] mb-[0.4em] px-[0.6em] rounded-[2px] flex items-center font-bold text-white truncate" style={{ height: fs * 1.4, fontSize: fs * 0.78, background: "var(--color-ink-2)" }}>▶ {msg}</div>}
      </>}
      </div>
      {onResize && sel && !editing && HANDLES.map(([h, x, y]) => (
        <span key={h} data-handle onPointerDown={(e) => onResize(e, h)} className="absolute w-[11px] h-[11px] -ml-[5.5px] -mt-[5.5px] bg-white border-2 border-[var(--color-point)] rounded-[2px] shadow-sm"
          style={{ left: x, top: y, cursor: CURSOR[h] }} />
      ))}
    </div>
  );
}

/** 기획 내용 → 와이어프레임(AI 없이). 소제목(###·**굵은 줄**·'- **이름**:')마다 상자 하나, 항목은 그 상자의 글, 표는 표 상자, 장면은 그림 자리 */
export function autoWire(content: string, scene?: string): WireBlock[] {
  type G = { t: string; lines: string[]; table: boolean };
  const groups: G[] = [];
  let cur: G | null = null;
  const start = (t: string) => { cur = { t, lines: [], table: false }; groups.push(cur); };
  for (const raw of (content || "").split("\n")) {
    const l = raw.replace(/\s+$/, "");
    if (!l.trim()) continue;
    const h = l.match(/^\s*#{1,6}\s+(.+)$/) || l.match(/^\s*\*\*([^*]+)\*\*\s*:?\s*$/);
    const lead = l.match(/^[-*]\s+\*\*([^*]+)\*\*\s*[:：]?\s*(.*)$/);
    if (h) { start(h[1]!.trim()); continue; }
    if (lead && !/^\s/.test(l)) { start(lead[1]!.trim()); if (lead[2]!.trim()) cur!.lines.push(lead[2]!.trim()); continue; }
    if (/^\s*\|/.test(l)) {
      if (!cur || (!(cur as G).table && (cur as G).lines.length)) start(cur ? "" : "");
      (cur as unknown as G).table = true;
    }
    if (!cur) start("");
    (cur as unknown as G).lines.push(l);
  }
  const gs = groups.filter((g) => g.t || g.lines.length).slice(0, 8);
  const out: WireBlock[] = [];
  const top = 15, bot = 96;
  let x0 = 2;
  if (scene && scene.trim()) {   // 장면 — 왼쪽 그림 자리
    out.push({ id: uid(), k: "image", x: 2, y: top, w: 30, h: bot - top, t: "장면", d: scene.trim().slice(0, 300) });
    x0 = 34;
  }
  if (!gs.length) return out;
  const n = gs.length, cols = n <= 3 ? n : n <= 4 ? 2 : 3, rows = Math.ceil(n / cols);
  const gap = 2, W = 98 - x0, cw = (W - gap * (cols - 1)) / cols, ch = (bot - top - gap * (rows - 1)) / rows;
  gs.forEach((g, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    out.push({ id: uid(), k: g.table ? "table" : g.lines.length > 5 ? "panel" : "card", x: r1(x0 + c * (cw + gap)), y: r1(top + r * (ch + gap)), w: r1(cw), h: r1(ch),
               t: g.t || (g.table ? "표" : ""), d: g.lines.join("\n") });
  });
  return out;
}

/** 캔버스(3:2). edit 를 주면 상자를 끌어 옮기고 크기를 바꾼다. children 은 위에 겹쳐 그린다(핀 의견) */
export function WireCanvas({ blocks, title, onTitle, onKeyword, keyword, section, accent = "#FF2A6D", sel = [], onSel, onChange, className, children, onClickBg }: {
  blocks: WireBlock[]; title?: string; onTitle?: (t: string) => void; onKeyword?: (k: string) => void; keyword?: string; section?: string; accent?: string;
  sel?: string[]; onSel?: (ids: string[]) => void; onChange?: (b: WireBlock[]) => void;
  className?: string; children?: ReactNode; onClickBg?: (e: React.MouseEvent) => void;
}) {
  const box = useRef<HTMLDivElement>(null), body = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth || 800));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fs = w * FS;   // 기본 글자(px) — 캔버스 폭에 비례(썸네일에서도 같은 모양)
  const [editing, setEditing] = useState<string | null>(null);   // 두 번 눌러 그 자리에서 글 고치는 상자
  const [titling, setTitling] = useState(false);                 // 키메시지를 그 자리에서 고치는 중
  useEffect(() => { if (editing && !sel.includes(editing)) setEditing(null); }, [sel, editing]);

  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  // 오른쪽 클릭 메뉴 — 두 번 누르기·단축키를 몰라도 고치고 지울 수 있게. 자리는 화면 좌표(글자 크기 확대 배율로 나눈 값)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; kinds?: boolean } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => { if (!(e.target as HTMLElement)?.closest?.("[data-wire-menu]")) setMenu(null); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(null); };
    window.addEventListener("pointerdown", close); window.addEventListener("wheel", close); window.addEventListener("keydown", key);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("wheel", close); window.removeEventListener("keydown", key); };
  }, [menu]);
  const openMenu = (e: React.MouseEvent, b: WireBlock) => {
    if (!onChange) return;
    e.preventDefault(); e.stopPropagation();
    // 글자 크기 확대(zoom·transform) 안에서는 fixed 좌표가 화면 좌표와 다르다 — 같은 자리에 탐침을 놓아 실제 원점과 배율을 재고 거꾸로 셈한다
    const probe = document.createElement("i");
    probe.style.cssText = "position:fixed;left:0;top:0;width:100px;height:100px;visibility:hidden;pointer-events:none";
    box.current!.appendChild(probe);
    const pr = probe.getBoundingClientRect();
    probe.remove();
    const sx = pr.width / 100 || 1, sy = pr.height / 100 || 1;
    const cx = Math.min(e.clientX + 4, window.innerWidth - 196 * sx), cy = Math.min(e.clientY + 4, window.innerHeight - 320 * sy);
    onSel?.([b.id]);
    setMenu({ id: b.id, x: (cx - pr.left) / sx, y: (cy - pr.top) / sy });
  };
  const menuDo = (fn: (b: WireBlock) => void) => { const b = blocks.find((x) => x.id === menu?.id); setMenu(null); if (b) fn(b); };
  const drag = (e: React.PointerEvent, b: WireBlock, mode: "move" | Handle) => {
    if (!onChange || e.button !== 0) return;
    // Shift+클릭은 끌지 않고 선택만 토글(여러 개 고르기)
    if (e.shiftKey && mode === "move") { e.stopPropagation(); onSel?.(sel.includes(b.id) ? sel.filter((x) => x !== b.id) : [...sel, b.id]); return; }
    e.stopPropagation();
    e.preventDefault();
    const ids = sel.includes(b.id) ? sel : [b.id];
    if (!sel.includes(b.id)) onSel?.([b.id]);
    const r = body.current!.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY, o = { ...b };
    const others = blocks.filter((x) => x.id !== b.id);
    const tx = [50, ...GRID_X, ...others.flatMap((x) => [x.x, x.x + x.w / 2, x.x + x.w])];   // 붙을 세로선 — 12칸 격자의 칸 경계 + 다른 상자
    const ty = [15, 97, ...others.flatMap((x) => [x.y, x.y + x.h / 2, x.y + x.h])];          // 붙을 가로선
    const SNAP = 0.8;
    const near = (v: number, list: number[]) => list.reduce<number | null>((best, t) => (Math.abs(t - v) < SNAP && (best === null || Math.abs(t - v) < Math.abs(best - v)) ? t : best), null);
    const move = (ev: PointerEvent) => {
      const dx = ((ev.clientX - sx) / r.width) * 100, dy = ((ev.clientY - sy) / r.height) * 100;
      let n = { ...o };
      const gx: number[] = [], gy: number[] = [];
      if (mode === "move") {
        n.x = clamp(o.x + dx, 0, 100 - o.w); n.y = clamp(o.y + dy, 0, 100 - o.h);
        for (const [off, list] of [[0, tx], [n.w / 2, tx], [n.w, tx]] as [number, number[]][]) {
          const t = near(n.x + off, list);
          if (t !== null) { n.x = t - off; gx.push(t); break; }
        }
        for (const [off, list] of [[0, ty], [n.h / 2, ty], [n.h, ty]] as [number, number[]][]) {
          const t = near(n.y + off, list);
          if (t !== null) { n.y = t - off; gy.push(t); break; }
        }
      } else {
        let L = o.x, T = o.y, R = o.x + o.w, B = o.y + o.h;
        if (mode.includes("w")) { L = clamp(o.x + dx, 0, R - 3); const t = near(L, tx); if (t !== null) { L = t; gx.push(t); } }
        if (mode.includes("e")) { R = clamp(R + dx, L + 3, 100); const t = near(R, tx); if (t !== null) { R = t; gx.push(t); } }
        if (mode.includes("n")) { T = clamp(o.y + dy, 0, B - 3); const t = near(T, ty); if (t !== null) { T = t; gy.push(t); } }
        if (mode.includes("s")) { B = clamp(B + dy, T + 3, 100); const t = near(B, ty); if (t !== null) { B = t; gy.push(t); } }
        n = { ...o, x: L, y: T, w: R - L, h: B - T };
      }
      n = { ...n, x: r1(n.x), y: r1(n.y), w: r1(n.w), h: r1(n.h) };
      setGuides({ x: gx, y: gy });
      if (mode === "move" && ids.length > 1) {   // 여러 개를 골랐으면 같은 만큼 함께 옮긴다
        const dx0 = n.x - o.x, dy0 = n.y - o.y;
        onChange(blocks.map((x) => (ids.includes(x.id)
          ? { ...x, x: r1(clamp(x.x + dx0, 0, 100 - x.w)), y: r1(clamp(x.y + dy0, 0, 100 - x.h)) } : x)));
      } else onChange(blocks.map((x) => (x.id === b.id ? n : x)));
    };
    const up = () => { setGuides({ x: [], y: [] }); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const t = (title ?? "").replace(/\*\*/g, "");
  const ks = (keyword ?? "").split(/[,，/·]/).map((s) => s.trim()).filter(Boolean);
  const kre = ks.length ? new RegExp(`(${[...ks].sort((x, y) => y.length - x.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`) : null;
  /** 키메시지 색칠 — **강조** 와 키워드는 강조색. raw 면 ** 표시도 남긴다(입력칸 밑에 깔 때 글자 자리가 맞게) */
  void accent;   // 와이어프레임은 무채색 — 강조색은 시안에서 쓴다
  const tbox = useRef<HTMLTextAreaElement | null>(null);
  /** 키메시지 고치기 시작 — 제목에 ** 표시가 남아 있으면(예전 방식) 강조어 목록으로 옮기고 제목은 깨끗하게 한다 */
  const startTitle = () => {
    const raw = title ?? "";
    if (raw.includes("**") && onKeyword && onTitle) {
      const marked = [...raw.matchAll(/\*\*([^*]+)\*\*/g)].map((m) => m[1]!.trim()).filter(Boolean);
      onKeyword([...new Set([...ks, ...marked])].join(", "));
      onTitle(raw.replace(/\*\*/g, ""));
    }
    setTitling(true);
  };
  /** 고른 글에 강조(밑줄)를 넣거나 뺀다 — 강조어 목록(keyword)에 넣고 빼는 것이라 제목 글에는 아무 표시도 남지 않는다 */
  const toggleMark = () => {
    const el = tbox.current;
    if (!el || !onKeyword) return;
    const v = el.value;
    let a = el.selectionStart, b = el.selectionEnd;
    if (a === b) {   // 고른 글이 없으면 커서가 놓인 낱말
      while (a > 0 && !/\s/.test(v[a - 1]!)) a--;
      while (b < v.length && !/\s/.test(v[b]!)) b++;
    }
    const pick = v.slice(a, b).replace(/[,，/·]/g, " ").replace(/\s+/g, " ").trim();
    if (!pick) return;
    // 이미 강조된 말과 겹치면(같거나 포함 관계) 그 강조를 뺀다. 아니면 새로 넣는다
    const hit = ks.filter((k) => k === pick || k.includes(pick) || pick.includes(k));
    onKeyword((hit.length ? ks.filter((k) => !hit.includes(k)) : [...ks, pick]).join(", "));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a, b); });
  };
  const paint = (s: string, raw: boolean) => s.split(/(\*\*[^*]+\*\*)/).map((seg, i) => {
    const m = /^\*\*([^*]+)\*\*$/.exec(seg);
    if (m) return <span key={i} style={KW}>{raw && <span className="opacity-40">**</span>}{m[1]}{raw && <span className="opacity-40">**</span>}</span>;
    return <span key={i}>{(kre ? seg.split(kre) : [seg]).map((p, j) => <span key={j} style={ks.includes(p) ? KW : undefined}>{p}</span>)}</span>;
  });
  return (
    <div ref={box} className={cn("relative w-full aspect-[3/2] bg-white select-none overflow-hidden", className)} onClick={onClickBg}>
      {/* 머리 띠 — 시안 틀과 같은 자리 */}
      <div className="absolute left-0 right-0 top-0 flex items-center gap-[1.2%] px-[2.3%] text-[var(--color-ink-2)] font-bold border-b border-[var(--color-ink-4)]" style={{ height: `${HEAD * 100}%`, background: "var(--color-line)", fontSize: fs * 1.05 }}>
        <span className="truncate">{section}</span>
      </div>
      {/* 바닥 — 발주기관 로고 · 쪽번호 · 제안사 로고 자리 */}
      <div className="absolute left-[2.3%] right-[2.3%] bottom-0 border-t border-[var(--color-line-3)] flex items-center justify-between" style={{ height: `${FOOT * 100}%` }}>
        <span className="h-[52%] w-[9%] border border-[var(--color-line-3)]"><XBox /></span>
        <span className="w-[1.2%] h-[18%] bg-[var(--color-line-3)] rounded-full" />
        <span className="h-[52%] w-[9%] border border-[var(--color-line-3)]"><XBox /></span>
      </div>
      {/* 본문 — 상자 좌표의 기준 */}
      <div ref={body} className="absolute left-0 right-0" style={{ top: `${HEAD * 100}%`, bottom: `${FOOT * 100}%` }}
        onPointerDown={(e) => { if (onChange && !(e.target as HTMLElement).closest("[data-block]")) { onSel?.([]); setEditing(null); } }}>
        {/* 키메시지 — onTitle 을 주면 눌러서 그 자리에서 고친다(**강조할 말** 은 강조색). 고치는 중에도 강조색이 보이게 같은 글을 색칠해 밑에 깔고 입력칸 글자는 투명하게 */}
        {onTitle && titling
          ? <div data-block className="absolute left-[3%] right-[3%] top-[1.5%] z-30 rounded-sm ring-2 ring-orange bg-white shadow-lg" onPointerDown={(e) => e.stopPropagation()}>
              <div aria-hidden className={cn(TITLE_CLS, "absolute inset-0 pointer-events-none")} style={{ fontSize: fs * 1.45 + 2 }}>{paint(title ?? "", true)}</div>
              <textarea autoFocus rows={1} ref={(el) => { tbox.current = el; if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }} value={title ?? ""} onChange={(e) => { onTitle(e.target.value); const el = e.target; el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }}
                onFocus={(e) => { const n = e.target.value.length; e.target.setSelectionRange(n, n); }}
                onBlur={() => setTitling(false)} onKeyDown={(e) => {
                  if ((e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) || e.key === "Escape") { e.preventDefault(); setTitling(false); }
                  else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "u" || e.key.toLowerCase() === "b")) { e.preventDefault(); toggleMark(); }
                }}
                onScroll={(e) => { const m = e.currentTarget.previousElementSibling as HTMLElement; m.scrollTop = e.currentTarget.scrollTop; }}
                placeholder="키메시지를 적으세요" spellCheck={false}
                className={cn(TITLE_CLS, "relative block w-full m-0 border-0 resize-none bg-transparent outline-none text-transparent caret-[var(--color-ink)] placeholder:text-[var(--color-ink-4)]")}
                style={{ fontSize: fs * 1.45 + 2 }} />
              <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 flex items-center gap-2 whitespace-nowrap rounded-[3px] bg-[var(--color-ink)] text-white pl-1 pr-2.5 py-1 shadow-lg" onMouseDown={(e) => e.preventDefault()}>
                <button type="button" onClick={toggleMark} className="h-7 px-2 rounded-[3px] inline-flex items-center gap-1 text-[12.5px] font-bold bg-white/15 hover:bg-white/25" title="고른 글에 밑줄 강조를 넣거나 뺍니다 (Ctrl+U)">
                  <Ms name="format_underlined" size={17} />밑줄 강조
                </button>
                <span className="text-[12px] text-white/70">강조할 말을 끌어서 고른 뒤 누르세요 · 강조된 말에서 다시 누르면 풀립니다 · Shift+Enter 줄바꿈 · Enter 로 끝</span>
              </div>
            </div>
          : <div data-block={onTitle ? "" : undefined} title={onTitle ? "눌러서 키메시지 고치기" : undefined}
              onPointerDown={onTitle ? (e) => e.stopPropagation() : undefined}
              // 누르는 순간(pointerdown) 열면 그 뒤 브라우저가 포커스를 바깥으로 옮겨 바로 닫힌다 — 클릭이 끝난 뒤 연다
              onClick={onTitle ? (e) => { e.stopPropagation(); onSel?.([]); setEditing(null); startTitle(); } : undefined}
              className={cn("absolute left-[3%] right-[3%] top-[1.5%] px-1 py-0.5 leading-[1.3] text-center font-extrabold text-[var(--color-ink)] whitespace-pre-wrap break-words line-clamp-3", onTitle && "cursor-text rounded-sm hover:ring-2 hover:ring-orange/50")}
              style={{ fontSize: fs * 1.45 + 2 }}>
              {t ? paint(title ?? "", false) : onTitle && <span className="text-[var(--color-ink-4)]">키메시지를 눌러 적으세요</span>}
            </div>}
        {blocks.map((b) => (
          <Block key={b.id} b={b} fs={fs} sel={sel.includes(b.id)} editing={editing === b.id}
            onDown={onChange ? (e) => drag(e, b, "move") : undefined} onResize={onChange ? (e, h) => drag(e, b, h) : undefined}
            onEdit={onChange ? () => { onSel?.([b.id]); setEditing(b.id); } : undefined}
            onMenu={onChange ? (e) => openMenu(e, b) : undefined}
            onPatch={onChange ? (p) => onChange(blocks.map((x) => (x.id === b.id ? { ...x, ...p } : x))) : undefined} />
        ))}
        {/* 맞춤 선 — 끌 때 다른 상자·가운데에 붙으면 보인다 */}
        {guides.x.map((x, i) => <i key={"x" + i} className="absolute top-0 bottom-0 w-px bg-[var(--color-point)] pointer-events-none z-20" style={{ left: `${x}%` }} />)}
        {guides.y.map((y, i) => <i key={"y" + i} className="absolute left-0 right-0 h-px bg-[var(--color-point)] pointer-events-none z-20" style={{ top: `${y}%` }} />)}
      </div>
      {children}
      {menu && onChange && (
        <div data-wire-menu className="fixed z-[60] w-[184px] bg-white rounded-[4px] border border-line shadow-[0_12px_32px_-8px_rgba(17,17,17,.3)] p-1 text-[13.5px] font-semibold text-ink3"
          style={{ left: menu.x, top: menu.y }} onContextMenu={(e) => e.preventDefault()}>
          {menu.kinds ? <>
            <button type="button" className={MENU_ITEM} onClick={() => setMenu({ ...menu, kinds: false })}><Ms name="chevron_left" size={18} />종류 바꾸기</button>
            <div className="h-px bg-line-soft my-1" />
            <div className="grid grid-cols-2 gap-0.5">
              {KINDS.map((x) => (
                <button key={x.k} type="button" className={cn(MENU_ITEM, "!px-2", blocks.find((b) => b.id === menu.id)?.k === x.k && "bg-orange-soft text-orange-d")}
                  onClick={() => menuDo((b) => onChange(blocks.map((y) => (y.id === b.id ? { ...y, k: x.k } : y))))}><Ms name={KIND_ICON[x.k]} size={17} />{x.label}</button>
              ))}
            </div>
          </> : <>
            <button type="button" className={MENU_ITEM} onClick={() => menuDo((b) => { onSel?.([b.id]); setEditing(b.id); })}><Ms name="edit" size={18} />글 고치기<span className={MENU_KEY}>두 번 클릭</span></button>
            <button type="button" className={MENU_ITEM} onClick={() => setMenu({ ...menu, kinds: true })}><Ms name="category" size={18} />종류 바꾸기<Ms name="chevron_right" size={18} className="ml-auto text-faint" /></button>
            <button type="button" className={MENU_ITEM} onClick={() => menuDo((b) => { const n = { ...b, id: uid(), x: clamp(b.x + 2, 0, 100 - b.w), y: clamp(b.y + 2, 0, 100 - b.h) }; onChange([...blocks, n]); onSel?.([n.id]); })}><Ms name="content_copy" size={18} />복제<span className={MENU_KEY}>Ctrl+D</span></button>
            <div className="h-px bg-line-soft my-1" />
            <button type="button" className={MENU_ITEM} onClick={() => menuDo((b) => onChange([...blocks.filter((x) => x.id !== b.id), b]))}><Ms name="flip_to_front" size={18} />맨 앞으로</button>
            <button type="button" className={MENU_ITEM} onClick={() => menuDo((b) => onChange([b, ...blocks.filter((x) => x.id !== b.id)]))}><Ms name="flip_to_back" size={18} />맨 뒤로</button>
            <div className="h-px bg-line-soft my-1" />
            <button type="button" className={cn(MENU_ITEM, "!text-[var(--color-warn)] hover:!bg-[var(--color-warn-soft)]")} onClick={() => menuDo((b) => { onChange(blocks.filter((x) => x.id !== b.id)); onSel?.([]); })}><Ms name="delete" size={18} />삭제<span className={MENU_KEY}>Delete</span></button>
          </>}
        </div>
      )}
    </div>
  );
}

/** 배치 틀 미리보기 — 줄(h 비중) · 칸(span) · 쌓기를 그대로 작은 상자로. 그림 칸은 X, 결론 띠는 회색 */
function TplThumb({ t }: { t: Tpl }) {
  const cell = (c: TplCell, key: number) => {
    const visual = KIND[c.k as WireKind]?.cls === "visual";   // 그림·도식 칸(종류 한 벌 cls) — 2차 16종(arch·stepcols…)도 X 자리로
    return (
      <span key={key} className="relative min-h-0 min-w-0 border border-[var(--color-ink-4)] rounded-[1px] overflow-hidden flex flex-col gap-[2px] p-[3px]"
        style={{ flex: `${c.h ?? 1} 1 0`, background: c.k === "band" ? "var(--color-line)" : "#fff", borderWidth: c.k === "badge" ? 1.5 : 1 }}>
        {visual ? <XBox className="absolute inset-0" />
          : c.k === "band" ? null
          : c.k === "badge" ? <span className="m-auto w-[45%] h-[3px] bg-[var(--color-ink-4)] rounded-full" />
          : <><span className="w-[55%] h-[2px] bg-[var(--color-ink-4)] rounded-full" /><span className="w-[85%] h-[2px] bg-[var(--color-line-3)] rounded-full" /><span className="w-[70%] h-[2px] bg-[var(--color-line-3)] rounded-full" /></>}
      </span>
    );
  };
  return (
    <span className="block w-full aspect-[16/9] bg-[var(--color-ground-2)] border border-line rounded-[3px] p-1.5">
      <span className="h-full flex flex-col gap-[3px]">
        <span className="flex-none mx-auto w-[46%] h-[3px] bg-[var(--color-ink-3)] rounded-full my-[2px]" />
        {t.rows.map((row, i) => {
          const band = row.cols.length === 1 && row.cols[0]!.k === "band";
          return (
            <span key={i} className="min-h-0 flex gap-[3px]" style={{ flex: band ? "0 0 9%" : `${row.h} 1 0` }}>
              {row.cols.map((c, j) => (
                <span key={j} className="relative min-w-0 flex flex-col gap-[3px]" style={{ flex: `${c.span ?? 1} 1 0` }}>
                  {(c.stack ?? [c]).map(cell)}
                  {t.arrows && i === 0 && j < row.cols.length - 1 && <span className="absolute right-[-5px] top-1/2 -translate-y-1/2 z-10 text-[9px] leading-none text-[var(--color-ink-2)]">▶</span>}
                </span>
              ))}
            </span>
          );
        })}
      </span>
    </span>
  );
}

/** 편집 도구 — 상자 추가, 고른 상자의 종류·글·지우기·복제 */
let clip: WireBlock[] = [];   // 복사한 상자(장 사이에서도 붙여 넣을 수 있게 모듈에 둔다)

export function WireTools({ blocks, sel, onSel, onChange, content, scene, onUndo, onRedo, canUndo, canRedo, onAi, aiBusy }: {
  blocks: WireBlock[]; sel: string[]; onSel: (ids: string[]) => void; onChange: (b: WireBlock[]) => void; content?: string; scene?: string;
  onUndo?: () => void; onRedo?: () => void; canUndo?: boolean; canRedo?: boolean;
  onAi?: () => void; aiBusy?: string;   // AI 로 이 장 다시 짜기(서버) — 진행 중이면 aiBusy 에 상태 글
}) {
  const cur = (sel.length ? blocks.find((b) => b.id === sel[sel.length - 1]) : undefined) ?? null;
  const multi = blocks.filter((b) => sel.includes(b.id));
  const set = (p: Partial<WireBlock>) => cur && onChange(blocks.map((b) => (b.id === cur.id ? { ...b, ...p } : b)));
  /** 고른 상자 전체를 같은 만큼 옮기기(끌기·화살표 공용) */
  const moveAll = (dx: number, dy: number) => onChange(blocks.map((b) => sel.includes(b.id)
    ? { ...b, x: r1(clamp(b.x + dx, 0, 100 - b.w)), y: r1(clamp(b.y + dy, 0, 100 - b.h)) } : b));
  const dupAll = (src: WireBlock[]) => {
    const ns = src.map((b) => ({ ...b, id: uid(), x: clamp(b.x + 2, 0, 100 - b.w), y: clamp(b.y + 2, 0, 100 - b.h) }));
    onChange([...blocks, ...ns]); onSel(ns.map((b) => b.id));
  };
  const add = (k: WireKind) => {
    // 종류에 맞는 기본 모양으로 — 인물은 세로로 길게, 흐름·결론 띠는 가로로 길게, 화면은 16:10 …  화면 가운데에 놓는다(결론 띠는 맨 아래)
    const [w, h] = KIND_SIZE[k];
    const b: WireBlock = { id: uid(), k, x: r1((100 - w) / 2), y: k === "band" ? 87 : r1(15 + (82 - h) / 2), w, h, t: KIND[k].label };
    onChange([...blocks, b]);
    onSel([b.id]);
  };
  const order = (front: boolean) => cur && onChange(front ? [...blocks.filter((b) => b.id !== cur.id), cur] : [cur, ...blocks.filter((b) => b.id !== cur.id)]);
  /** 정렬 — 하나면 화면 기준, 여러 개면 고른 것들의 묶음 기준 */
  const align = (mode: "l" | "cx" | "r" | "t" | "cy" | "b" | "w" | "h") => {
    const boxes = multi.length > 1 ? multi : cur ? [cur] : [];
    if (!boxes.length) return;
    const xs = boxes.map((b) => b.x), rs = boxes.map((b) => b.x + b.w);
    const ys = boxes.map((b) => b.y), bs = boxes.map((b) => b.y + b.h);
    const L = multi.length > 1 ? Math.min(...xs) : 2, R = multi.length > 1 ? Math.max(...rs) : 98;
    const T = multi.length > 1 ? Math.min(...ys) : 15, B = multi.length > 1 ? Math.max(...bs) : 96;
    const ref = cur ?? boxes[0];
    onChange(blocks.map((b) => {
      if (!boxes.some((x) => x.id === b.id)) return b;
      const n = { ...b };
      if (mode === "l") n.x = L;
      else if (mode === "r") n.x = R - n.w;
      else if (mode === "cx") n.x = (L + R) / 2 - n.w / 2;
      else if (mode === "t") n.y = T;
      else if (mode === "b") n.y = B - n.h;
      else if (mode === "cy") n.y = (T + B) / 2 - n.h / 2;
      else if (mode === "w") { n.w = ref!.w; n.x = clamp(n.x, 0, 100 - n.w); }
      else if (mode === "h") { n.h = ref!.h; n.y = clamp(n.y, 0, 100 - n.h); }
      return { ...n, x: r1(clamp(n.x, 0, 100 - n.w)), y: r1(clamp(n.y, 0, 100 - n.h)), w: r1(n.w), h: r1(n.h) };
    }));
  };
  useEffect(() => {   // 단축키: Ctrl+Z/Y 실행 취소·다시, Ctrl+C/V/D 복사·붙여넣기·복제, Delete 지우기, 화살표 0.5% 이동(Shift 2%)
    const f = (e: KeyboardEvent) => {
      if (/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName)) return;
      const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
      if (mod && k === "z") { e.preventDefault(); (e.shiftKey ? onRedo : onUndo)?.(); return; }
      if (mod && k === "y") { e.preventDefault(); onRedo?.(); return; }
      if (mod && k === "v" && clip.length) { e.preventDefault(); dupAll(clip.map((b) => ({ ...b }))); return; }
      if (!cur) return;
      if (mod && k === "c") { e.preventDefault(); clip = multi.map((b) => ({ ...b })); return; }
      if (mod && k === "d") { e.preventDefault(); dupAll(multi); return; }
      const st = e.shiftKey ? 2 : 0.5;
      const mv: Record<string, [number, number]> = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] };
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); onChange(blocks.filter((b) => !sel.includes(b.id))); onSel([]); }
      else if (mv[e.key]) { e.preventDefault(); moveAll(mv[e.key]![0], mv[e.key]![1]); }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  });
  // 배치 틀 — 고르면 지금 상자들의 글을 그 틀에 끼워 다시 놓는다(좌표는 서버가 격자로 계산). 되돌리기 가능
  const [tplOpen, setTplOpen] = useState(false);
  const [tplBusy, setTplBusy] = useState("");
  const pickTpl = async (id: string) => {
    setTplBusy(id);
    try {
      const r = await api<{ wire: WireBlock[] }>("/wire/tpl", { method: "POST", body: JSON.stringify({ tpl: id, blocks: blocks.map((b) => ({ k: b.k, t: b.t, d: b.d ?? "" })) }) });
      onChange(r.wire.map((b) => ({ ...b, id: uid() })));
      onSel([]); setTplOpen(false);
    } catch (e) { toast((e as Error).message); }
    setTplBusy("");
  };
  const tool = "h-9 px-3 rounded-[3px] border border-line bg-white text-[13px] font-semibold text-ink3 whitespace-nowrap flex-none inline-flex items-center justify-center gap-1.5 hover:border-orange hover:text-orange-d";
  const hist = "w-9 h-9 rounded-[3px] text-ink2 flex-none inline-flex items-center justify-center hover:bg-bar hover:text-ink disabled:text-[var(--color-line-3)] disabled:hover:bg-transparent";
  const act = "h-9 px-3 rounded-[3px] border border-line bg-white text-[13.5px] font-semibold text-ink3 whitespace-nowrap flex-none inline-flex items-center gap-1.5 hover:bg-panel";
  return (
    <div className="w-full flex flex-col gap-3.5">
      {/* 도구줄 — 되돌리기·다시 | 상자 추가(종류마다 아이콘) | 이 장 다시 놓기(배치 틀 · 기획 글 그대로 · AI) */}
      <div className="bg-white border border-line rounded-[4px]">
       <div className="flex items-center gap-2 p-2">
        <div className="flex items-center gap-0.5 flex-none self-start">
          <button title="되돌리기 (Ctrl+Z)" aria-label="되돌리기" disabled={!canUndo} onClick={onUndo} className={hist}><Ms name="undo" size={20} /></button>
          <button title="다시 하기 (Ctrl+Shift+Z)" aria-label="다시 하기" disabled={!canRedo} onClick={onRedo} className={hist}><Ms name="redo" size={20} /></button>
        </div>
        <span className="w-px self-stretch bg-line flex-none" />
        <div className="flex items-center gap-1 flex-wrap min-w-0">
          <span className="text-faint flex-none mr-0.5 inline-flex" title="상자 추가 — 누르면 화면 가운데에 생깁니다"><Ms name="add_box" size={20} /></span>
          {KINDS.map((x) => (
            <button key={x.k} title={`${x.label} — ${x.hint}`} onClick={() => add(x.k)}
              className="w-[48px] h-[46px] rounded-[3px] border border-transparent text-ink3 flex-none flex flex-col items-center justify-center gap-0.5 hover:border-orange hover:bg-orange-tint hover:text-orange-d">
              <Ms name={KIND_ICON[x.k]} size={20} /><span className="text-[12px] font-semibold leading-none whitespace-nowrap">{x.label}</span>
            </button>
          ))}
        </div>
       </div>
        <div className="flex items-center gap-1.5 flex-wrap px-3 py-2 border-t border-line-soft bg-panel rounded-b-[5px]">
          <span className="text-[12px] font-semibold text-dim whitespace-nowrap mr-auto inline-flex items-center gap-1"><Ms name="restart_alt" size={17} />이 장 다시 놓기</span>
          <button onClick={() => setTplOpen(true)} className={tool} title="미리 만들어 둔 배치에 지금 글을 끼워 넣습니다"><Ms name="dashboard" size={18} />배치 틀</button>
          <button onClick={async () => { if (!blocks.length || await ask("지금 배치를 지우고 기획 내용의 소제목마다 상자 하나씩 다시 놓습니다(되돌리기 가능).", { title: "기획 글 그대로 다시 배치할까요?", ok: "다시 배치" })) { onChange(content ? autoWire(content, scene) : defaultWire()); onSel([]); } }}
            className={tool} title="AI 없이 — 기획 내용의 소제목마다 상자 하나"><Ms name="article" size={18} />기획 글 그대로</button>
          {onAi && <button disabled={!!aiBusy} onClick={async () => { if (!blocks.length || await ask("이 장의 와이어프레임을 기획 내용으로 AI 가 다시 짭니다(되돌리기 가능).", { title: "이 장을 다시 짤까요?", ok: "다시 짜기" })) { onAi(); onSel([]); } }}
            className="h-9 px-3 rounded-[3px] border border-[var(--color-orange-line)] bg-[var(--color-orange-tint)] text-[13px] font-semibold text-orange-d whitespace-nowrap flex-none inline-flex items-center gap-1.5 hover:bg-orange-soft disabled:opacity-60"
            title="기획의 글·수치·표를 상자에 그대로 넣어 완성 목업 수준으로"><Ms name={aiBusy ? "autorenew" : "auto_awesome"} size={18} className={aiBusy ? "animate-spin" : undefined} />{aiBusy ? "AI 가 짜는 중…" : "AI로 다시 짜기"}</button>}
        </div>
      </div>
      {tplOpen && (
        <Modal title="배치 틀 고르기" width={880} onClose={() => setTplOpen(false)}>
          <div className="px-5 pt-4 text-[13.5px] text-dim leading-[1.6]">틀을 고르면 지금 상자들의 글을 그 틀에 끼워 다시 놓습니다 — 그림은 그림 칸에, 결론 띠는 맨 아래에. 상자가 틀보다 많으면 글 칸에 쌓이고, 모자라면 빈 칸이 남습니다. 마음에 안 들면 되돌리기(Ctrl+Z).</div>
          <div className="p-5 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))" }}>
            {TEMPLATES.map((t) => (
              <button key={t.id} type="button" disabled={!!tplBusy} onClick={() => pickTpl(t.id)}
                className="text-left p-2.5 rounded-[4px] border border-line bg-white hover:border-orange hover:shadow-[0_0_0_4px_var(--color-orange-soft)] disabled:opacity-60">
                <TplThumb t={t} />
                <div className="mt-2 text-[14px] font-bold">{tplBusy === t.id ? "놓는 중…" : t.name}</div>
                <div className="mt-0.5 text-[12.5px] text-dim leading-[1.45]">{t.desc}</div>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {cur ? (
        <div className="bg-white border-[1.5px] border-orange rounded-[4px] px-[18px] py-4 grid grid-cols-[150px_minmax(0,1fr)] gap-x-3.5 gap-y-3 shadow-[0_0_0_3px_var(--color-orange-soft)]">
          <div className="col-span-2 flex items-center gap-2">
            <span className="font-bold whitespace-nowrap">선택한 상자{multi.length > 1 && <span className="ml-1.5 text-[13px] text-orange-d">· {multi.length}개 (Shift+클릭으로 여러 개 고름)</span>}</span>
            <span className="text-[13px] text-dim truncate">고치면 자동 저장됩니다</span>
            <button className="btn-icon ml-auto" title="선택 풀기" aria-label="선택 풀기" onClick={() => onSel([])}><Ms name="close" size={19} /></button>
          </div>
          <Select value={cur.k} label="상자 종류" onChange={(k) => onChange(blocks.map((b) => sel.includes(b.id) ? { ...b, k } : b))} options={KINDS.map((x) => [x.k, x.label] as const)} />
          {multi.length > 1
            ? <div className="text-[13px] text-dim leading-[1.6] self-center">여러 개가 골라졌습니다 — 종류를 바꾸면 고른 것 전체에 적용됩니다. 제목·글은 한 개씩 고를 때 고칩니다.</div>
            : <TitleArea className="field font-bold !text-[15px]" maxLength={200} value={cur.t} onChange={(t) => set({ t })} placeholder="상자 제목 — Shift+Enter 줄바꿈" />}
          {multi.length > 1 ? null : (<>
            <div className="text-[13px] text-faint leading-[1.6]">두 번 눌러 바로 고치기<br />끌어서 옮기기(다른 상자에 붙음)<br />손잡이 8곳으로 크기<br />화살표로 미세 이동<br />Ctrl+C/V 복사 · Ctrl+D 복제<br />Delete 지우기</div>
            <textarea className="field min-h-[96px] !resize-y" rows={3} maxLength={1500} value={cur.d ?? ""} onChange={(e) => set({ d: e.target.value })} placeholder="들어갈 글(선택) — 한 줄에 하나" />
          </>)}
          {/* 위치·크기 숫자 입력 + 맞춤 */}
          <div className="col-span-2 flex items-center gap-1.5 flex-wrap border-t border-line-soft pt-3">
            <span className="text-[12.5px] font-semibold text-dim whitespace-nowrap mr-1">맞춤</span>
            <button className={act} title="왼쪽선을 맞춘다" onClick={() => align("l")}><Ms name="align_horizontal_left" size={17} />왼쪽</button>
            <button className={act} title="가로 가운데를 맞춘다" onClick={() => align("cx")}><Ms name="align_horizontal_center" size={17} />가로가운데</button>
            <button className={act} title="오른쪽선을 맞춘다" onClick={() => align("r")}><Ms name="align_horizontal_right" size={17} />오른쪽</button>
            <button className={act} title="윗선을 맞춘다" onClick={() => align("t")}><Ms name="align_vertical_top" size={17} />위</button>
            <button className={act} title="세로 가운데를 맞춘다" onClick={() => align("cy")}><Ms name="align_vertical_center" size={17} />세로가운데</button>
            <button className={act} title="아랫선을 맞춘다" onClick={() => align("b")}><Ms name="align_vertical_bottom" size={17} />아래</button>
            {multi.length > 1 && (<>
              <button className={act} title="고른 것의 너비를 마지막에 고른 것과 같게" onClick={() => align("w")}><Ms name="width_wide" size={17} />같은 너비</button>
              <button className={act} title="고른 것의 높이를 마지막에 고른 것과 같게" onClick={() => align("h")}><Ms name="height" size={17} />같은 높이</button>
            </>)}
          </div>
          {multi.length === 1 && (
            <div className="col-span-2 flex items-center gap-2 flex-wrap">
              <span className="text-[12.5px] font-semibold text-dim whitespace-nowrap mr-1">위치·크기</span>
              {(["x", "y", "w", "h"] as const).map((k) => (
                <label key={k} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-dim">
                  {k.toUpperCase()}
                  <input type="number" step={0.5} className="field !h-8 !w-[72px] !px-2 font-mono !text-[13px]" value={cur[k]}
                    onChange={(e) => { const v = Number(e.target.value); if (!isFinite(v)) return;
                      set(k === "x" ? { x: r1(clamp(v, 0, 100 - cur.w)) } : k === "y" ? { y: r1(clamp(v, 0, 100 - cur.h)) }
                        : k === "w" ? { w: r1(Math.max(3, Math.min(100 - cur.x, v))) } : { h: r1(Math.max(3, Math.min(100 - cur.y, v))) }); }} />
                </label>
              ))}
            </div>
          )}
          <div className="col-span-2 flex items-center gap-1.5 flex-wrap">
            <button className={act} title="Ctrl+D" onClick={() => dupAll(multi)}><Ms name="content_copy" size={17} />복제{multi.length > 1 && ` ${multi.length}개`}</button>
            <button className={act} onClick={() => order(true)}><Ms name="flip_to_front" size={17} />맨 앞으로</button>
            <button className={act} onClick={() => order(false)}><Ms name="flip_to_back" size={17} />맨 뒤로</button>
            <button className={cn(act, "!border-[var(--color-warn-line)] !text-[var(--color-warn)] hover:!bg-[var(--color-warn-soft)]")} title="Delete" onClick={() => { onChange(blocks.filter((b) => !sel.includes(b.id))); onSel([]); }}><Ms name="delete" size={17} />지우기{multi.length > 1 && ` ${multi.length}개`}</button>
          </div>
        </div>
      ) : <div className="text-[13px] text-dim leading-[1.6] px-1">상자를 <b className="font-semibold text-ink3">두 번 누르면 화면에서 바로 글을 고칩니다</b>. 끌어서 옮기고 모서리로 크기를 바꿉니다. 바꾼 것은 자동 저장되고, 시안을 만들 때 이 배치와 글대로 그립니다 — 기획 글은 참고 자료로 함께 들어갑니다.</div>}
    </div>
  );
}

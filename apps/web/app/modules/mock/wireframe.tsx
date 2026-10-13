// powerMock 기획 와이어프레임 — 요청 글·화면 종류·기관 묶음 → 레퍼런스 기반 초안(결정적) → 미리보기·가벼운 편집·판정 → 저장·시안 요청문.
// 엔진: api/src/Mock/Wire.php · API: api/routes/mock_wire.php · MCP: packages/mcp/src/tools/mock-wire.ts(같은 엔드포인트).
// 화면 규칙: 셀렉트는 ChoiceButton(네이티브 select 금지), 같은 줄 컨트롤 같은 높이(40), 칸 안쪽 스크롤 없음, 주황은 주 버튼 하나.
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Copy as CopyIcon, Columns2, ExternalLink, GripVertical, Minus, Monitor, Plus, Smartphone, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChoiceButton } from "@/components/hb/choice-button";
import { confirmToast, toastError } from "@/components/hb/confirm";
import { Copy } from "@/components/hb/copy";
import { SectionHeading } from "@/components/hb/section-heading";
import { Tag } from "@/components/hb/tag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, postJson } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { BrowserBar, SectionArt } from "./wire-art";

// ---------------------------------------------------------------- 형
export interface WireCol { span: number; k: string; t?: string; h?: number }
export interface WireRow { id: string; zone: "top" | "body" | "bottom"; cols: WireCol[] }
export interface Wire { version?: number; screen: string; org: string; title?: string; lnb: boolean; rows: WireRow[] }
interface WireIssue { sev: "error" | "warn" | "info"; code: string; row?: number; msg: string; fix: string }
interface WireCheck { score: number; pass: boolean; issues: WireIssue[]; stats: { rows: number; cells: number; body_rows: number } }
interface WireOptions { screens: { id: string; label: string; desc: string; samples: number }[]; orgs: { id: string; label: string }[]; styles?: { id: string; label: string; desc: string; main_only: boolean }[]; types: { k: string; name: string; scope: string; group?: string; kit?: boolean; h?: number }[] }
interface GenResult { wire: Wire; check: WireCheck; source: "rule" | "ai"; note: string | null; basis: { samples: number; note: string; asked: { add: string[]; remove: string[] }; style?: { asked: string; used: string; label: string; variant: number; variants: number; note?: string | null } }; prompt: string }
interface SavedWire { id: string; title: string; screen: string; screen_label: string; org: string; score: number | null; pass: boolean; rows: number; source: string; updated_at: string }

const ZONE_KO = { top: "위", body: "본문", bottom: "아래" } as const;
const SEV_KO = { error: "꼭 고칠 점", warn: "권장", info: "참고" } as const;
const optionsQuery = { queryKey: ["mock", "wire", "options"], queryFn: () => apiFetch<WireOptions>("/mock/wire/options"), staleTime: 3_600_000 };
const fmt = (s: string) => s.slice(0, 10).replace(/-/g, ".");
const copyText = (s: string, done: string) => navigator.clipboard.writeText(s).then(() => toast.success(done), () => toast.error("복사하지 못했습니다."));

/** 줄 id 다시 매기기 + 칸 합 12 맞추기는 서버 판정이 알려 준다(여기선 사용자가 고친 그대로 둔다). */
const renumber = (rows: WireRow[]): WireRow[] => rows.map((r, i) => ({ ...r, id: `r${i + 1}` }));

// ---------------------------------------------------------------- 미리보기
/** 끌어 옮기기 — 칸 이동(같은 줄·다른 줄·줄 사이에 새 줄), 줄 이동, 칸 폭 조절(12칸 격자에 스냅). */
type DropTo = { row: number; index: number } | { newAt: number };
export type WireDrag =
  | { kind: "row"; from: number; to: number }
  | { kind: "cell"; r: number; c: number; to: DropTo }
  | { kind: "resize"; r: number; c: number; span: number; next: number | null }
  | { kind: "height"; r: number; c: number; h: number };
type Live = { kind: "row" | "cell" | "resize" | "height"; r: number; c: number; target: number | null; ind: { left: number; top: number; width: number; height: number } | null; ghost: { x: number; y: number; label: string } | null; span?: number; next?: number | null; h?: number };

function WirePreview({ wire, names, device, sel, onSelect, onRow, onDrop }: {
  wire: Wire; names: Map<string, string>; device: "pc" | "mobile";
  sel: { r: number; c: number } | null; onSelect: (r: number, c: number) => void; onRow: (r: number, op: "up" | "down" | "del" | "split") => void;
  onDrop: (d: WireDrag) => void;
}) {
  const mobile = device === "mobile";
  const body = wire.rows.map((r, i) => ({ r, i })).filter((x) => x.r.zone === "body");
  const firstBody = body[0]?.i ?? -1;
  const lastBody = body[body.length - 1]?.i ?? -1;
  // 칸 높이 = 레퍼런스 실측 높이(px, 1920 기준)를 미리보기 폭에 맞춰 줄인 값 — 띠(공식 배너·경로)는 낮게, 비주얼은 높게
  // 가로와 같은 비율로 줄인다(2026-10-09 사용자 "세로로 눌린 비율") — PC 는 미리보기 틀 폭 / 1920, 모바일은 예전 비율 유지
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameW, setFrameW] = useState(1500);
  useEffect(() => {
    const el = frameRef.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => { if (e) setFrameW(e.contentRect.width); });
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const scale = mobile ? 0.36 : Math.max(0.3, Math.min(1, frameW / 1920));
  const boxH = (h?: number) => Math.max(30, Math.min(mobile ? 480 : 1400, Math.round((h ?? 240) * scale)));
  const [live, setLive] = useState<Live | null>(null);
  const moved = useRef(false);
  const GAP = 8;

  const rowEls = () => [...(frameRef.current?.querySelectorAll<HTMLElement>("[data-wrow]") ?? [])].sort((a, b) => Number(a.dataset.wrow) - Number(b.dataset.wrow));
  /** 줄 사이 꽂을 자리(0..n)와 표시선 */
  const rowSlot = (y: number) => {
    const els = rowEls();
    let at = els.findIndex((el) => { const b = el.getBoundingClientRect(); return y < b.top + b.height / 2; });
    if (at < 0) at = els.length;
    const ref = (els[at] ?? els[at - 1])?.getBoundingClientRect();
    if (!ref) return { at, ind: null };
    const top = at < els.length ? (els[at]!.getBoundingClientRect().top - GAP / 2) : (els[at - 1]!.getBoundingClientRect().bottom + GAP / 2);
    return { at, ind: { left: ref.left, top: top - 1.5, width: ref.width, height: 3 } };
  };
  /** 칸을 놓을 자리 — 줄 안이면 칸 사이, 줄 사이면 새 줄 */
  const cellSlot = (x: number, y: number) => {
    const els = rowEls();
    const inRow = els.find((el) => { const b = el.getBoundingClientRect(); return y >= b.top + 6 && y <= b.bottom - 6; });
    if (!inRow) { const s = rowSlot(y); return { to: { newAt: s.at } as DropTo, ind: s.ind, target: null }; }
    const row = Number(inRow.dataset.wrow);
    const cells = [...inRow.querySelectorAll<HTMLElement>("[data-wcell]")];
    const rb = inRow.getBoundingClientRect();
    let index = cells.findIndex((el) => { const b = el.getBoundingClientRect(); return mobile ? y < b.top + b.height / 2 : x < b.left + b.width / 2; });
    if (index < 0) index = cells.length;
    let ind;
    if (mobile) {
      const t = index < cells.length ? cells[index]!.getBoundingClientRect().top - GAP / 2 : rb.bottom + GAP / 2;
      ind = { left: rb.left, top: t - 1.5, width: rb.width, height: 3 };
    } else {
      const l = index < cells.length ? cells[index]!.getBoundingClientRect().left - GAP / 2 : (cells[cells.length - 1]?.getBoundingClientRect().right ?? rb.left) + GAP / 2;
      ind = { left: l - 1.5, top: rb.top, width: 3, height: rb.height };
    }
    return { to: { row, index } as DropTo, ind, target: row };
  };

  const begin = (e: React.PointerEvent, kind: Live["kind"], r: number, c: number) => {
    if (e.button !== 0) return;
    if (kind === "cell" && e.pointerType === "touch") return; // 손가락은 화면 스크롤이 먼저 — 줄 손잡이·버튼으로
    if (kind !== "cell") { e.preventDefault(); e.stopPropagation(); }
    const x0 = e.clientX, y0 = e.clientY;
    const cols = wire.rows[r]?.cols ?? [];
    const col = cols[c];
    const label = kind === "row" ? `${r + 1}번 줄` : names.get(col?.k ?? "") ?? col?.k ?? "";
    // 폭 조절 — 1칸 너비(칸 + 사이 간격)로 스냅, 다음 칸이 있으면 그 칸이 받아 준다
    const rowEl = frameRef.current?.querySelector<HTMLElement>(`[data-wrow="${r}"]`);
    const unit = rowEl ? (rowEl.getBoundingClientRect().width - GAP * 11) / 12 + GAP : 1;
    const span0 = col?.span ?? 12;
    const next0 = cols[c + 1]?.span ?? null;
    const used = cols.reduce((s, x) => s + x.span, 0);
    const maxSpan = next0 != null ? span0 + next0 - 1 : span0 + Math.max(0, 12 - used);
    const h0 = col?.h ?? 240;
    let state: Live | null = null;
    moved.current = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0, dy = ev.clientY - y0;
      if (!moved.current && Math.hypot(dx, dy) < 5) return;
      moved.current = true;
      if (kind === "height") {
        const h = Math.max(40, Math.round((h0 + dy / scale) / 10) * 10); // 레퍼런스 px 기준 10px 단위
        state = { kind, r, c, target: r, ind: null, ghost: { x: ev.clientX, y: ev.clientY, label: `높이 ${h}px` }, h };
      } else if (kind === "resize") {
        const span = Math.max(1, Math.min(maxSpan, span0 + Math.round(dx / unit)));
        state = { kind, r, c, target: r, ind: null, ghost: { x: ev.clientX, y: ev.clientY, label: `${span}/12` }, span, next: next0 != null ? next0 - (span - span0) : null };
      } else if (kind === "row") {
        const s = rowSlot(ev.clientY);
        state = { kind, r, c, target: s.at, ind: s.ind, ghost: { x: ev.clientX, y: ev.clientY, label } };
      } else {
        const s = cellSlot(ev.clientX, ev.clientY);
        state = { kind, r, c, target: s.target, ind: s.ind, ghost: { x: ev.clientX, y: ev.clientY, label }, ...({ to: s.to } as object) } as Live;
      }
      setLive(state);
    };
    const end = (commit: boolean) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", key);
      setLive(null);
      if (!commit || !moved.current || !state) return;
      if (state.kind === "height" && state.h != null && state.h !== h0) onDrop({ kind: "height", r, c, h: state.h });
      if (state.kind === "resize" && state.span != null && state.span !== span0) onDrop({ kind: "resize", r, c, span: state.span, next: state.next ?? null });
      if (state.kind === "row" && state.target != null && state.target !== r && state.target !== r + 1) onDrop({ kind: "row", from: r, to: state.target });
      if (state.kind === "cell") onDrop({ kind: "cell", r, c, to: (state as Live & { to: DropTo }).to });
    };
    const up = () => end(true);
    const key = (ev: KeyboardEvent) => { if (ev.key === "Escape") end(false); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", key);
  };

  const renderRow = (r: WireRow, i: number) => {
    const guides = !mobile && live && (live.kind === "resize" || live.kind === "cell") && live.target === i;
    return (
    <div key={r.id} className="group/row relative" data-wrow={i}>
      {guides && (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-10 grid grid-cols-12 gap-2">
          {Array.from({ length: 12 }).map((_, k) => <span key={k} className="rounded-md border border-dashed border-ink-4/60 bg-ink/[.04]" />)}
        </div>
      )}
      <div className={cn("grid gap-2", mobile ? "grid-cols-1" : "grid-cols-12", live?.kind === "row" && live.r === i && "opacity-40")}>
        {r.cols.map((c, ci) => {
          const on = sel?.r === i && sel.c === ci;
          const lr = live?.kind === "resize" && live.r === i;
          const raw = lr && live.c === ci ? live.span! : lr && live.c + 1 === ci && live.next != null ? live.next : c.span;
          const span = Math.max(1, Math.min(12, raw));
          const dragging = live?.kind === "cell" && live.r === i && live.c === ci;
          const lh = live?.kind === "height" && live.r === i && live.c === ci;
          const hh = boxH(lh ? live.h : c.h);
          return (
            <button key={ci} type="button" data-wcell={ci}
              onClick={() => { if (moved.current) { moved.current = false; return; } onSelect(i, ci); }}
              onPointerDown={(e) => begin(e, "cell", i, ci)}
              aria-pressed={on} aria-label={`${names.get(c.k) ?? c.k}${c.t ? ` — ${c.t}` : ""}`}
              style={{ gridColumn: mobile ? undefined : `span ${span} / span ${span}`, height: hh }}
              className={cn("group/cell relative min-w-0 cursor-grab select-none overflow-hidden rounded-md border bg-white text-left transition-shadow active:cursor-grabbing",
                r.zone === "body" ? "border-ink-4" : "border-line-3",
                dragging && "opacity-40",
                on ? "outline-2 outline-offset-1 outline-ink" : "hover:shadow-[0_2px_10px_rgba(0,0,0,.12)]")}>
              <span className={cn("pointer-events-none absolute inset-x-0 bottom-0 block", hh >= 60 ? "top-[18px]" : "top-0")}>
                <SectionArt k={c.k} span={mobile ? 12 : span} mobile={mobile} />
              </span>
              {/* 칸 이름 — 와이어 표기처럼 왼쪽 위 작은 꼬리표 */}
              <span className={cn("pointer-events-none absolute left-0 top-0 max-w-full truncate rounded-br-md px-1.5 py-[2px] text-[11px] font-semibold leading-tight",
                on ? "bg-ink text-white" : "bg-white/95 text-ink-3 ring-1 ring-line-3")}>
                {names.get(c.k) ?? c.k}{c.t ? ` · ${c.t}` : ""}{!mobile && span < 12 ? ` · ${span}/12` : ""}
              </span>
              {/* 폭 조절 손잡이 — 오른쪽 끝, 12칸 격자에 붙는다 */}
              {!mobile && (
                <span role="presentation" title="끌어서 폭 조절(12칸 격자)" onPointerDown={(e) => begin(e, "resize", i, ci)} onClick={(e) => e.stopPropagation()}
                  className={cn("absolute inset-y-0 right-0 z-20 flex w-3 cursor-col-resize touch-none items-center justify-center opacity-0 transition-opacity group-hover/cell:opacity-100",
                    (on || lr) && "opacity-100")}>
                  <span className="h-8 w-[4px] rounded-full bg-ink-3" />
                </span>
              )}
              {/* 높이 조절 손잡이 — 아래 끝, 레퍼런스 px 10 단위(2026-10-09 사용자 "세로는 안 됨") */}
              <span role="presentation" title="끌어서 높이 조절" onPointerDown={(e) => begin(e, "height", i, ci)} onClick={(e) => e.stopPropagation()}
                className={cn("absolute inset-x-0 bottom-0 z-20 flex h-3 cursor-row-resize touch-none items-center justify-center opacity-0 transition-opacity group-hover/cell:opacity-100",
                  (on || lh) && "opacity-100")}>
                <span className="h-[4px] w-8 rounded-full bg-ink-3" />
              </span>
            </button>
          );
        })}
      </div>
      <div className="pointer-events-none absolute -top-3 right-1 z-30 flex gap-1 opacity-0 transition-opacity group-hover/row:pointer-events-auto group-hover/row:opacity-100 group-focus-within/row:pointer-events-auto group-focus-within/row:opacity-100">
        <span role="button" tabIndex={-1} title="끌어서 줄 옮기기" aria-label={`${i + 1}번 줄 끌어 옮기기`} onPointerDown={(e) => begin(e, "row", i, 0)}
          className="inline-flex size-7 cursor-grab touch-none items-center justify-center rounded-md border border-line-3 bg-white text-ink-2 shadow-xs active:cursor-grabbing"><GripVertical className="size-3.5" /></span>
        <Button size="icon-sm" variant="outline" className="size-7" aria-label={`${i + 1}번 줄 위로`} onClick={() => onRow(i, "up")} disabled={i === 0}><ArrowUp className="size-3.5" /></Button>
        <Button size="icon-sm" variant="outline" className="size-7" aria-label={`${i + 1}번 줄 아래로`} onClick={() => onRow(i, "down")} disabled={i === wire.rows.length - 1}><ArrowDown className="size-3.5" /></Button>
        {r.cols.length < 4 && <Button size="icon-sm" variant="outline" className="size-7" aria-label={`${i + 1}번 줄 칸 나누기`} onClick={() => onRow(i, "split")}><Columns2 className="size-3.5" /></Button>}
        <Button size="icon-sm" variant="outline" className="size-7" aria-label={`${i + 1}번 줄 지우기`} onClick={() => onRow(i, "del")}><Trash2 className="size-3.5" /></Button>
      </div>
    </div>
    );
  };

  const rowsBefore = wire.rows.map((r, i) => ({ r, i })).filter((x) => firstBody < 0 || x.i < firstBody);
  const rowsAfter = wire.rows.map((r, i) => ({ r, i })).filter((x) => firstBody >= 0 && x.i > lastBody);
  const withLnb = wire.lnb && body.length > 0;
  return (
    <div ref={frameRef} className={cn("mx-auto overflow-hidden rounded-field border border-line-3 bg-white shadow-[0_8px_28px_rgba(0,0,0,.06)]", mobile ? "max-w-[390px]" : "w-full", live && "select-none")}>
      {live && typeof document !== "undefined" && createPortal(
        <>
          {live.ind && <div aria-hidden className="pointer-events-none fixed z-[90] rounded-full bg-ink" style={live.ind} />}
          {live.ghost && <div aria-hidden className="pointer-events-none fixed z-[90] rounded-md bg-ink px-2 py-1 text-xs font-semibold text-white shadow-lg" style={{ left: live.ghost.x + 12, top: live.ghost.y + 12 }}>{live.ghost.label}</div>}
        </>, document.body)}
      <BrowserBar url={mobile ? "m.example.go.kr" : "www.example.go.kr"} />
      <div className="grid gap-2 p-3">
        {(firstBody < 0 ? wire.rows.map((r, i) => ({ r, i })) : rowsBefore).map(({ r, i }) => renderRow(r, i))}
        {firstBody >= 0 && (
          <div className={cn("grid gap-2", withLnb && !mobile && "grid-cols-[minmax(0,3fr)_minmax(0,9fr)] items-start")}>
            {withLnb && (
              <div className={cn("relative overflow-hidden rounded-md border border-ink-4 bg-white", mobile ? "h-[90px]" : "h-[260px]")}>
                <SectionArt k="lnb" span={3} mobile={mobile} />
                <span className="absolute left-0 top-0 rounded-br-md bg-white/95 px-1.5 py-[2px] text-[11px] font-semibold leading-tight text-ink-3 ring-1 ring-line-3">LNB(왼쪽 메뉴)</span>
              </div>
            )}
            <div className="grid min-w-0 gap-2">{wire.rows.slice(firstBody, lastBody + 1).map((r, k) => renderRow(r, firstBody + k))}</div>
          </div>
        )}
        {rowsAfter.map(({ r, i }) => renderRow(r, i))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- 화면
export function WireframeScreen() {
  const { me } = useMe();
  const qc = useQueryClient();
  const opt = useQuery(optionsQuery);
  const mine = useQuery({ queryKey: ["mock", "wire", "mine"], queryFn: () => apiFetch<SavedWire[]>("/mock/wireframes"), enabled: !!me });
  const [screen, setScreen] = useState("main");
  const [org, setOrg] = useState("all");
  const [style, setStyle] = useState("auto");
  const [variant, setVariant] = useState(0);
  const [request, setRequest] = useState("");
  const [ai, setAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [gen, setGen] = useState<GenResult | null>(null);
  const [wire, setWire] = useState<Wire | null>(null);
  const [check, setCheck] = useState<WireCheck | null>(null);
  const [device, setDevice] = useState<"pc" | "mobile">("pc");
  const [sel, setSel] = useState<{ r: number; c: number } | null>(null);
  const [title, setTitle] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const firstCheck = useRef(true);

  const names = useMemo(() => new Map((opt.data?.types ?? []).map((t) => [t.k, t.name])), [opt.data]);
  // 칸 종류 = 수집 섹션 유형 + 키트 부품. 서버가 묶음 순서로 주므로 목록에서 같은 묶음끼리 모여 보이고, 아래 줄(hint)에 묶음 이름을 단다
  const typeChoices = useMemo(() => (opt.data?.types ?? []).map((t) => ({
    id: t.k, label: t.name,
    hint: [t.group, t.kit ? "부품" : t.scope === "main" ? "메인용" : t.scope === "sub" ? "서브용" : null].filter(Boolean).join(" · ") || undefined,
  })), [opt.data]);
  const typeH = useMemo(() => new Map((opt.data?.types ?? []).filter((t) => t.h).map((t) => [t.k, t.h as number])), [opt.data]);

  // 편집하면 서버 판정을 다시 받는다(결정적·비용 0, 0.4초 묶음)
  useEffect(() => {
    if (!wire) return;
    if (firstCheck.current) { firstCheck.current = false; return; }
    const t = setTimeout(() => {
      postJson<{ check: WireCheck }>("/mock/wire/check", { wire }).then((r) => setCheck(r.check), () => undefined);
    }, 400);
    return () => clearTimeout(t);
  }, [wire]);

  const generate = async (v = 0) => {
    setBusy(true);
    try {
      const r = await postJson<GenResult>("/mock/wire/generate", { screen, org, style, variant: v, request, ai });
      setVariant(r.basis.style?.variant ?? v);
      firstCheck.current = true;
      setGen(r); setWire(r.wire); setCheck(r.check); setSel(null); setSavedId(null);
      const sc = opt.data?.screens.find((s) => s.id === screen)?.label ?? "";
      setTitle(`${opt.data?.orgs.find((o) => o.id === org)?.label ?? ""} ${sc} 와이어`.trim());
      if (r.note) toast.message(r.note);
    } catch (e) { toastError(e); } finally { setBusy(false); }
  };

  const edit = (fn: (rows: WireRow[]) => WireRow[]) => setWire((w) => (w ? { ...w, rows: renumber(fn(w.rows.map((r) => ({ ...r, cols: r.cols.map((c) => ({ ...c })) })))) } : w));
  const onRow = (i: number, op: "up" | "down" | "del" | "split") => {
    setSel(null);
    edit((rows) => {
      if (op === "del") return rows.filter((_, k) => k !== i);
      if (op === "split") {
        const r = rows[i]; if (!r) return rows; const n = r.cols.length + 1; const base = Math.floor(12 / n); const rest = 12 - base * n;
        const cols = [...r.cols, { span: base, k: "content_block", h: r.cols[0]?.h }].map((c, k) => ({ ...c, span: base + (k < rest ? 1 : 0) }));
        rows[i] = { ...r, cols }; return rows;
      }
      const j = op === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= rows.length) return rows;
      const a = rows[i], b = rows[j];
      if (!a || !b) return rows;
      rows[i] = b; rows[j] = a; return rows;
    });
  };
  // 끌어 놓기 — 옮긴 줄·칸의 구역은 놓인 자리 이웃을 따른다, 칸 합은 12를 넘지 않게
  const zoneAt = (rows: WireRow[], at: number, own: WireRow["zone"]) => {
    const prev = rows[at - 1]?.zone, next = rows[at]?.zone;
    return prev === own || next === own ? own : next ?? prev ?? own;
  };
  const fit = (cols: WireCol[], keep: WireCol) => {
    let total = cols.reduce((s, c) => s + c.span, 0);
    while (total > 12) {
      const big = cols.filter((c) => c !== keep && c.span > 1).sort((a, b) => b.span - a.span)[0] ?? (keep.span > 1 ? keep : null);
      if (!big) break;
      big.span -= 1; total -= 1;
    }
  };
  const onDrop = (d: WireDrag) => {
    setSel(null);
    edit((rows) => {
      if (d.kind === "height") {
        const c = rows[d.r]?.cols[d.c]; if (c) c.h = d.h;
        return rows;
      }
      if (d.kind === "resize") {
        const r = rows[d.r]; const c = r?.cols[d.c]; if (!r || !c) return rows;
        c.span = d.span; const n = r.cols[d.c + 1]; if (n && d.next != null) n.span = Math.max(1, d.next);
        return rows;
      }
      if (d.kind === "row") {
        const [x] = rows.splice(d.from, 1); if (!x) return rows;
        const at = d.to > d.from ? d.to - 1 : d.to;
        rows.splice(at, 0, { ...x, zone: zoneAt(rows, at, x.zone) });
        return rows;
      }
      const src = rows[d.r]; const cell = src?.cols[d.c]; if (!src || !cell) return rows;
      if ("row" in d.to && d.to.row === d.r) { // 같은 줄 안에서 순서만
        const to = d.to.index > d.c ? d.to.index - 1 : d.to.index; if (to === d.c) return rows;
        src.cols.splice(d.c, 1); src.cols.splice(to, 0, cell); return rows;
      }
      src.cols.splice(d.c, 1);
      const nb = src.cols[d.c - 1] ?? src.cols[d.c]; if (nb) nb.span = Math.min(12, nb.span + cell.span); // 빈자리는 옆 칸이 받는다
      if ("row" in d.to) {
        const tgt = rows[d.to.row]; if (!tgt) return rows;
        tgt.cols.splice(d.to.index, 0, cell); fit(tgt.cols, cell);
      } else {
        rows.splice(d.to.newAt, 0, { id: "", zone: zoneAt(rows, d.to.newAt, src.zone), cols: [{ ...cell, span: 12 }] });
      }
      return rows.filter((r) => r.cols.length > 0);
    });
  };
  const addRow = () => edit((rows) => {
    const last = rows.map((r) => r.zone).lastIndexOf("body");
    const at = last >= 0 ? last + 1 : Math.max(0, rows.findIndex((r) => r.zone === "bottom"));
    rows.splice(at < 0 ? rows.length : at, 0, { id: "", zone: "body", cols: [{ span: 12, k: "content_block", h: 300 }] });
    return rows;
  });
  const cur = sel && wire ? wire.rows[sel.r]?.cols[sel.c] : null;
  const setCell = (patch: Partial<WireCol>) => sel && edit((rows) => { const r = rows[sel.r]; const c = r?.cols[sel.c]; if (r && c) r.cols[sel.c] = { ...c, ...patch }; return rows; });
  const delCell = () => { if (!sel) return; edit((rows) => { const r = rows[sel.r]; if (!r) return rows; if (r.cols.length <= 1) return rows.filter((_, k) => k !== sel.r); r.cols.splice(sel.c, 1); return rows; }); setSel(null); };

  const save = async () => {
    if (!wire) return;
    try {
      const body = { title, wire: { ...wire, title }, request, source: gen?.source ?? "rule" };
      const r = savedId ? await postJson<{ id: string }>(`/mock/wireframes/${savedId}`, body, "PUT") : await postJson<{ id: string }>("/mock/wireframes", body);
      setSavedId(r.id); void qc.invalidateQueries({ queryKey: ["mock", "wire", "mine"] });
      toast.success(savedId ? "고친 내용을 저장했습니다." : "내 와이어에 저장했습니다.");
    } catch (e) { toastError(e); }
  };
  const open = async (id: string) => {
    try {
      const r = await apiFetch<{ id: string; title: string; request: string; wire: Wire; check: WireCheck; prompt: string }>(`/mock/wireframes/${id}`);
      firstCheck.current = true;
      setWire(r.wire); setCheck(r.check); setTitle(r.title); setRequest(r.request); setSavedId(r.id); setSel(null);
      setScreen(r.wire.screen); setOrg(r.wire.org);
      setGen({ wire: r.wire, check: r.check, source: "rule", note: null, basis: { samples: 0, note: "", asked: { add: [], remove: [] } }, prompt: r.prompt });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) { toastError(e); }
  };
  const remove = (id: string) => confirmToast("이 와이어를 지울까요?", async () => {
    try { await apiFetch(`/mock/wireframes/${id}`, { method: "DELETE" }); if (savedId === id) setSavedId(null); void qc.invalidateQueries({ queryKey: ["mock", "wire", "mine"] }); toast.success("지웠습니다."); } catch (e) { toastError(e); }
  });
  // 고친 와이어 기준 요청문 — 서버 prompt 는 처음 만든 구성 기준이라, 편집 뒤엔 여기서 다시 쓴다
  const prompt = useMemo(() => {
    if (!wire) return "";
    const sc = opt.data?.screens.find((s) => s.id === wire.screen)?.label ?? wire.screen;
    const og = opt.data?.orgs.find((o) => o.id === wire.org)?.label ?? "";
    const lines = wire.rows.map((r, i) => `${i + 1}. [${r.zone}] ${r.cols.map((c) => `${names.get(c.k) ?? c.k}(${c.k}, ${c.span}/12${c.t ? `, ${c.t}` : ""})`).join(" | ")}`);
    return [`powerMock 으로 ${og} 홈페이지의 '${sc}' 화면 시안을 만들어 줘.${request ? ` 요청: ${request}` : ""}`,
      `아래 와이어프레임의 줄 순서와 칸 폭(12칸 격자)을 지켜 줘.${wire.lnb ? " 본문 왼쪽에 LNB(왼쪽 메뉴)를 둔다." : ""}`,
      ...lines,
      "순서: mock_get_replica_kit 으로 재료를 받고 → 이 구성대로 만들고 → mock_check_mockup 으로 판정 → 통과하면 mock_publish_mockup."].join("\n");
  }, [wire, names, opt.data, request]);

  if (opt.isPending) return <Skeleton className="mt-6 h-64 rounded-card" />;
  const screens = (opt.data?.screens ?? []).map((s) => ({ id: s.id, label: s.label, hint: s.desc }));
  const orgs = (opt.data?.orgs ?? []).map((o) => ({ id: o.id, label: o.label }));
  // 원형 스타일(포털·LLM·랜딩…)은 메인 전용 — 서브 화면이면 레퍼런스 구성만 고른다
  const styles = [{ id: "auto", label: "자동(요청 글로 판단)" }, ...(opt.data?.styles ?? []).filter((x) => screen === "main" || !x.main_only).map((x) => ({ id: x.id, label: x.label, hint: x.desc }))];
  const vs = gen?.basis.style;
  const issues = check?.issues ?? [];

  return (
    <div className="mt-6 grid gap-8">
      <section className="rounded-panel border border-line bg-ground p-6" aria-label="와이어프레임 만들기">
        <h3 className="text-lg font-bold">어떤 화면을 짤까요</h3>
        <Copy className="mt-1 text-md text-ink-3" text="화면 종류와 기관을 고르고 넣을 것·뺄 것을 적으면 레퍼런스 구성을 따라 초안을 짭니다. 초안은 바로 고칠 수 있습니다." />
        <Label htmlFor="wire-req" className="sr-only">요청 글</Label>
        <Textarea id="wire-req" value={request} onChange={(e) => setRequest(e.target.value)} maxLength={800} rows={3} className="mt-4 bg-white"
          placeholder="예: 챗봇이랑 관광 명소 넣고 팝업은 빼 줘." />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ChoiceButton label="화면" options={screens} value={screen} onChange={setScreen} showAll={false} size="md" />
          <ChoiceButton label="기관" options={orgs} value={org} onChange={setOrg} showAll={false} size="md" />
          <ChoiceButton label="스타일" options={styles} value={styles.some((x) => x.id === style) ? style : "auto"} onChange={(v) => setStyle(v || "auto")} showAll={false} size="md" />
          <label className="flex h-10 items-center gap-2 rounded-field border border-line-3 bg-white px-3.5 text-sm" title={me ? undefined : "로그인하면 쓸 수 있습니다"}>
            <Switch checked={ai} onCheckedChange={setAi} disabled={!me} aria-label="AI 로 한 번 더 다듬기" />
            <span className={cn(!me && "text-ink-4")}>AI 로 다듬기</span>
          </label>
          <Button size="md" onClick={() => generate(0)} disabled={busy} className="ml-auto border-point bg-point text-white hover:border-point hover:bg-point/90">
            <Sparkles aria-hidden />{busy ? "짜는 중…" : wire ? "다시 짜기" : "와이어 짜기"}
          </Button>
        </div>
      </section>

      {wire && check && (
        <section aria-label="와이어프레임 결과" className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-field bg-ground-3 p-1" role="group" aria-label="미리보기 폭">
                {(["pc", "mobile"] as const).map((d) => (
                  <button key={d} type="button" onClick={() => setDevice(d)} aria-pressed={device === d}
                    className={cn("inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-semibold", device === d ? "bg-white text-ink shadow-sm" : "text-ink-3")}>
                    {d === "pc" ? <Monitor className="size-4" aria-hidden /> : <Smartphone className="size-4" aria-hidden />}{d === "pc" ? "PC" : "모바일"}
                  </button>
                ))}
              </div>
              <Tag tone={gen?.source === "ai" ? "ink" : "soft"}>{gen?.source === "ai" ? "AI 다듬음" : "레퍼런스 초안"}</Tag>
              {gen && gen.basis.samples > 0 && <span className="text-sm text-ink-4">레퍼런스 {gen.basis.samples.toLocaleString()}장 기준</span>}
              {vs && <Tag tone="soft">{vs.label}</Tag>}
              {vs && vs.variants > 1 && (
                <div className="inline-flex items-center gap-1" role="group" aria-label="다른 구성">
                  <Button size="icon-sm" variant="outline" aria-label="이전 구성" disabled={busy} onClick={() => generate((variant - 1 + vs.variants) % vs.variants)}><ChevronLeft /></Button>
                  <span className="w-14 text-center text-sm font-semibold">{variant + 1}/{vs.variants}</span>
                  <Button size="icon-sm" variant="outline" aria-label="다음 구성" disabled={busy} onClick={() => generate((variant + 1) % vs.variants)}><ChevronRight /></Button>
                </div>
              )}
              <Button size="sm" variant="outline" className="ml-auto" onClick={addRow}><Plus aria-hidden />본문 줄 추가</Button>
            </div>
            <div className="mt-3">
              <WirePreview wire={wire} names={names} device={device} sel={sel} onSelect={(r, c) => setSel(sel?.r === r && sel.c === c ? null : { r, c })} onRow={onRow} onDrop={onDrop} />
            </div>
            {cur && sel && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-card border border-line bg-ground-2 p-3">
                <span className="text-sm font-semibold">{sel.r + 1}번 줄 · {ZONE_KO[wire.rows[sel.r]?.zone ?? "body"]}</span>
                <ChoiceButton label="칸 종류" options={typeChoices} value={cur.k} onChange={(v) => v && setCell({ k: v, t: undefined, ...(typeH.has(v) ? { h: typeH.get(v) } : {}) })} showAll={false} size="sm" />
                <div className="inline-flex items-center gap-1">
                  <Button size="icon-sm" variant="outline" aria-label="칸 좁히기" onClick={() => setCell({ span: Math.max(1, cur.span - 1) })}><Minus /></Button>
                  <span className="w-12 text-center text-sm font-semibold">{cur.span}/12</span>
                  <Button size="icon-sm" variant="outline" aria-label="칸 넓히기" onClick={() => setCell({ span: Math.min(12, cur.span + 1) })}><Plus /></Button>
                </div>
                <Button size="sm" variant="outline" onClick={delCell}><Trash2 aria-hidden />칸 지우기</Button>
              </div>
            )}
            <Copy className="mt-3 text-sm text-ink-4" text="칸을 끌어 다른 자리·다른 줄로 옮기고, 칸 오른쪽 끝은 폭(12칸 격자), 아래 끝은 높이를 바꿉니다. 줄 위 손잡이로 줄을 옮기고, 칸을 누르면 종류를 바꿉니다." />
          </div>

          <aside className="grid content-start gap-4">
            <div className="rounded-card border border-line p-5">
              <div className="flex items-baseline justify-between gap-2">
                <h4 className="text-md font-bold">판정</h4>
                <span className="text-2xl font-extrabold">{check.score}<span className="text-sm font-semibold text-ink-4">점</span></span>
              </div>
              <p className={cn("mt-1 text-sm font-semibold", check.pass ? "text-ink-2" : "text-ink-3")}>{check.pass ? "통과 — 시안으로 넘겨도 됩니다." : "고칠 점이 남아 있습니다."}</p>
              {issues.length === 0 ? <p className="mt-3 text-sm text-ink-4">고칠 점이 없습니다.</p> : (
                <ul className="mt-3 grid gap-2.5">
                  {issues.map((it, i) => (
                    <li key={i} className="text-sm">
                      <span className="flex items-center gap-1.5"><Tag tone={it.sev === "error" ? "ink" : "soft"}>{SEV_KO[it.sev]}</Tag>{it.row ? <span className="text-ink-4">{it.row}번 줄</span> : null}</span>
                      <span className="mt-1 block text-ink-2">{it.msg}</span>
                      {it.fix && <span className="block text-ink-4">{it.fix}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-card border border-line p-5">
              <h4 className="text-md font-bold">저장</h4>
              {me ? (
                <div className="mt-3">
                  {/* 제목을 보이는 칸으로 — 자동 제목이 같은 이름으로 쌓이던 것(2026-10-09 시험) */}
                  <Label htmlFor="wire-title" className="text-sm font-semibold">제목</Label>
                  <div className="mt-1.5 flex gap-2">
                    <Input id="wire-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="예: 한빛시 메인 1안" className="h-9 text-sm" />
                    <Button size="sm" className="h-9" onClick={save} disabled={!title.trim()}>{savedId ? "고친 것 저장" : "저장"}</Button>
                  </div>
                </div>
              ) : <p className="mt-2 text-sm text-ink-3"><Link to="/login?next=/mock/plan" className="font-semibold underline underline-offset-4">로그인</Link>하면 내 와이어에 저장합니다.</p>}
            </div>

            <div className="rounded-card border border-line p-5">
              <h4 className="text-md font-bold">이 와이어로 시안 받기</h4>
              <Copy className="mt-1 text-sm text-ink-3" text="powerMCP 를 연결한 AI 도구에 아래 요청문을 붙여 넣으면 이 구성대로 시안을 만들고 판정까지 합니다." />
              <pre className="mt-3 max-h-none whitespace-pre-wrap break-words rounded-md bg-ground-2 p-3 text-xs leading-[1.6] text-ink-2">{prompt}</pre>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => copyText(prompt, "요청문을 복사했습니다.")}><CopyIcon aria-hidden />요청문 복사</Button>
                <Button size="sm" variant="outline" asChild><Link to="/powermcp"><ExternalLink aria-hidden />연결 방법</Link></Button>
              </div>
            </div>
          </aside>
        </section>
      )}

      {me && (
        <section aria-label="내 와이어">
          <SectionHeading title="내 와이어" />
          {mine.isPending ? <Skeleton className="mt-4 h-24 rounded-card" /> : (mine.data ?? []).length === 0 ? (
            <p className="mt-4 text-md text-ink-4">아직 저장한 와이어가 없습니다.</p>
          ) : (
            <Table className="mt-4">
              <TableHeader><TableRow><TableHead>제목</TableHead><TableHead className="hidden w-[120px] md:table-cell">화면</TableHead><TableHead className="hidden w-[72px] md:table-cell">줄</TableHead><TableHead className="w-[80px]">점수</TableHead><TableHead className="hidden w-[104px] md:table-cell">고친 날</TableHead><TableHead className="w-[136px]">관리</TableHead></TableRow></TableHeader>
              <TableBody>
                {(mine.data ?? []).map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="whitespace-normal break-keep text-left font-semibold">{w.title}</TableCell>
                    <TableCell className="hidden md:table-cell">{w.screen_label}</TableCell>
                    <TableCell className="hidden md:table-cell">{w.rows}</TableCell>
                    <TableCell>{w.score ?? "—"}</TableCell>
                    <TableCell className="hidden md:table-cell">{fmt(w.updated_at)}</TableCell>
                    <TableCell><div className="flex justify-center gap-1.5"><Button size="xs" variant="outline" onClick={() => open(w.id)}>열기</Button><Button size="xs" variant="outline" onClick={() => remove(w.id)}>지우기</Button></div></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      )}
    </div>
  );
}

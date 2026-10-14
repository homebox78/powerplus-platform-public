/**
 * 한눈에 보기 — 캔버스 보기. 장(章)마다 한 줄, 장표는 쪽 순서대로 왼쪽→오른쪽, 이야기 흐름은 화살표로 잇는다.
 * 카드를 끌어 놓으면 순서가 바뀌고, 다른 장(章) 줄에 놓으면 그 장으로 옮겨진다(시안 검토 왼쪽 목록 끌어 놓기와 같은 저장).
 * 끄는 동안 나머지 카드가 새 자리로 비켜서고 선도 새 순서로 다시 이어진다. 놓일 칸은 점선 가이드, 가까우면 그 칸에 붙는다(스냅).
 * 선은 주황, 장표와 닿는 곳은 작은 동그라미(왼쪽=들어옴·오른쪽=나감).
 * 빈 곳을 끌어서 이동·Ctrl+휠(또는 오른쪽 아래 단추)로 확대. 그냥 휠은 페이지 스크롤(세로 스크롤은 바깥 하나 — 캔버스가 가로채지 않는다).
 * 누르면 그 장을 연다.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Background, Controls, Handle, MiniMap, Position, ReactFlow,
  type Edge, type Node, type NodeChange, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { PlanSlide } from "./api";
import { cn } from "./ui";

const W = 260, GAP_X = 48, ROW_H = 300, HEAD_W = 150;
const LINE = "var(--color-point)";
const SNAP = 56;   // 놓일 칸에서 이 거리(px) 안이면 칸에 붙인다
// 연결점 — 장표 왼쪽(들어오는 선)·오른쪽(나가는 선)의 작은 동그라미
const PORT = "!w-2.5 !h-2.5 !min-w-0 !min-h-0 !rounded-full !bg-white !border-2 !border-[var(--color-point)]";

type CardData = { s: PlanSlide; title: string; thumb: ReactNode; badge?: ReactNode; on: boolean; checks: number; lift: boolean };
type HeadData = { name: string; count: number; hot: boolean };
type SlotData = { h: number };
type Lists = number[][];   // 줄(장)마다 쪽 번호

const Card = ({ data }: NodeProps<Node<CardData>>) => (
  <div className={cn("w-[260px] flex flex-col gap-1.5 p-2 rounded-md bg-white cursor-pointer",
    data.lift ? "shadow-[0_0_0_2px_var(--color-point),0_8px_24px_rgba(0,0,0,0.18)] cursor-grabbing"
      : data.on ? "shadow-[0_0_0_2px_var(--color-point)]" : "shadow-[0_0_0_1px_var(--color-line-3)] hover:shadow-[0_0_0_1.5px_var(--color-point)]")}>
    <Handle type="target" position={Position.Left} className={PORT} isConnectable={false} />
    <div className="relative rounded-md border border-line overflow-hidden bg-white pointer-events-none">{data.thumb}{data.badge}</div>
    <div className="flex items-center gap-1.5 px-1 text-[12.5px] text-dim min-w-0">
      <span className="truncate">{data.s.n}쪽{data.s.section ? ` · ${data.s.section}` : ""}</span>
      {data.checks > 0 && <span className="ml-auto flex-none whitespace-nowrap font-semibold text-[var(--color-ink-2)]">확인 {data.checks}</span>}
    </div>
    <div className="px-1 pb-1 font-bold text-[14px] leading-[1.45] line-clamp-2">{data.title}</div>
    <Handle type="source" position={Position.Right} className={PORT} isConnectable={false} />
  </div>
);

const Head = ({ data }: NodeProps<Node<HeadData>>) => (
  <div className={cn("w-[150px] flex flex-col gap-0.5 pr-2", data.hot && "text-[var(--color-point)]")}>
    <span className={cn("text-[15px] font-bold leading-[1.35] break-keep", data.hot ? "text-[var(--color-point)]" : "text-ink2")}>{data.name}</span>
    <span className="text-[12.5px] text-dim">{data.count}장</span>
  </div>
);

// 놓일 자리 가이드 — 끄는 동안 새 순서의 빈 칸을 점선으로
const Slot = ({ data }: NodeProps<Node<SlotData>>) => (
  <div className="w-[260px] rounded-md border-2 border-dashed border-[var(--color-point)] bg-[var(--color-point-soft)]/60" style={{ height: data.h }} />
);

const nodeTypes = { card: Card, head: Head, slot: Slot };
const at = (r: number, i: number) => ({ x: HEAD_W + i * (W + GAP_X), y: r * ROW_H });

export function OverviewCanvas({ groups, sel, title, thumb, badge, onOpen, onReorder }: {
  jobId: string;
  groups: [string, PlanSlide[]][];
  sel: number | null;
  title: (s: PlanSlide) => string;
  thumb: (s: PlanSlide) => ReactNode;
  badge: (s: PlanSlide) => ReactNode;
  onOpen: (n: number) => void;
  /** 없으면 끌어 놓기 잠금(보기 전용). chapters = 장이 바뀐 쪽 → 새 장 이름 */
  onReorder?: (order: number[], chapters: Record<number, string>, keep: number) => Promise<void> | void;
}) {
  const bySlide = useMemo(() => new Map(groups.flatMap(([, ss]) => ss.map((s) => [s.n, s] as const))), [groups]);
  const real: Lists = useMemo(() => groups.map(([, ss]) => ss.map((s) => s.n)), [groups]);

  // 끄는 중인 카드와 그 자리, 저장 응답을 기다리는 새 순서(응답 전에 원래 자리로 튀지 않게)
  const [drag, setDrag] = useState<{ n: number; pos: { x: number; y: number }; h: number } | null>(null);
  const [pending, setPending] = useState<Lists | null>(null);
  useEffect(() => setPending(null), [groups]);

  // 끄는 카드 가운데가 놓인 줄·칸 → 임시 순서
  const target = (n: number, pos: { x: number; y: number }, from: Lists) => {
    const r = Math.max(0, Math.min(from.length - 1, Math.floor((pos.y + ROW_H / 2) / ROW_H)));
    const rest = from.map((l) => l.filter((x) => x !== n));
    const row = rest[r] ?? [];
    const i = Math.max(0, Math.min(row.length, Math.round((pos.x - HEAD_W) / (W + GAP_X))));
    rest[r] = [...row.slice(0, i), n, ...row.slice(i)];
    return { lists: rest, r };
  };
  const live = drag ? target(drag.n, drag.pos, pending ?? real) : null;
  const lists = live?.lists ?? pending ?? real;

  const view = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    let prev: string | null = null;
    lists.forEach((ns, r) => {
      nodes.push({ id: `h${r}`, type: "head", position: { x: 0, y: r * ROW_H + 40 }, data: { name: groups[r]?.[0] ?? "", count: ns.length, hot: live?.r === r }, draggable: false, selectable: false });
      ns.forEach((n, i) => {
        const s = bySlide.get(n);
        if (!s) return;
        const id = `s${n}`, lift = drag?.n === n, slot = at(r, i);
        // 끄는 카드 — 놓일 칸을 점선 가이드로 보이고, 가까우면 그 칸에 붙인다(스냅)
        const snap = lift && Math.hypot(drag.pos.x - slot.x, drag.pos.y - slot.y) < SNAP;
        if (lift) nodes.push({ id: "slot", type: "slot", position: slot, data: { h: drag.h }, draggable: false, selectable: false, zIndex: -1 });
        nodes.push({
          id, type: "card", position: lift && !snap ? drag.pos : slot, zIndex: lift ? 10 : 0,
          data: { s, title: title(s), thumb: thumb(s), badge: badge(s), on: sel === n, checks: s.checks?.length ?? 0, lift },
        });
        if (prev) {
          const hot = drag != null && (prev === `s${drag.n}` || lift);
          edges.push({
            id: `e${prev}-${id}`, source: prev, target: id, type: "smoothstep",
            style: { stroke: LINE, strokeWidth: hot ? 2.5 : 1.5 }, zIndex: hot ? 5 : 0,
          });
        }
        prev = id;
      });
    });
    return { nodes, edges };
  }, [lists, groups, bySlide, drag, live?.r, sel, title, thumb, badge]);

  const onNodesChange = useCallback((ch: NodeChange[]) => {
    for (const c of ch) {
      if (c.type !== "position" || !c.id.startsWith("s")) continue;
      const n = Number(c.id.slice(1));
      if (c.dragging && c.position) {
        const pos = c.position;
        setDrag((d) => ({ n, pos, h: d?.n === n ? d.h : (document.querySelector<HTMLElement>(`.react-flow__node[data-id="${c.id}"]`)?.offsetHeight ?? 220) }));
        continue;
      }
      if (c.dragging === false) {
        setDrag(null);
        if (!drag || drag.n !== n || !onReorder) continue;
        const base = pending ?? real;
        const { lists: next, r } = target(n, c.position ?? drag.pos, base);
        const order = next.flat(), was = base.findIndex((l) => l.includes(n));
        if (r === was && order.every((x, i) => x === base.flat()[i])) continue;
        setPending(next);
        Promise.resolve(onReorder(order, r !== was && groups[r] ? { [n]: groups[r][0] } : {}, n)).finally(() => setPending(null));
      }
    }
  }, [drag, onReorder, pending, real, groups]);

  return (
    <div className="relative h-[calc(100vh-260px)] min-h-[440px] rounded-md border border-line bg-panel overflow-hidden">
      <ReactFlow
        nodes={view.nodes} edges={view.edges} nodeTypes={nodeTypes}
        onNodesChange={onNodesChange} nodesDraggable={!!onReorder && !pending}
        onNodeClick={(_, n) => { if (n.type === "card") onOpen((n.data as CardData).s.n); }}
        fitView fitViewOptions={{ padding: 0.12, maxZoom: 1 }} minZoom={0.15} maxZoom={1.6}
        zoomOnScroll={false} zoomActivationKeyCode="Control" panOnScroll={false} preventScrolling={false}
        nodesConnectable={false} edgesFocusable={false} proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} color="var(--color-line)" />
        <Controls showInteractive={false} position="bottom-right" />
        <MiniMap pannable zoomable position="top-right" nodeColor={(n) => (n.type === "head" ? "transparent" : "#D4D4D4")} className="!bg-white !border !border-line max-md:!hidden" />
      </ReactFlow>
      <div className="absolute top-2.5 left-3 right-3 flex items-center gap-2 pointer-events-none">
        <span className="text-[12.5px] text-dim bg-white/90 rounded-md px-2 py-1">
          {onReorder ? "카드를 끌어 놓으면 순서가 바뀝니다 · 다른 장 줄에 놓으면 그 장으로 · Ctrl+휠로 확대" : "빈 곳을 끌어서 이동 · Ctrl+휠로 확대 · 카드를 누르면 그 장을 엽니다"}
        </span>
        {pending && <span className="text-[12.5px] font-semibold text-ink2 bg-white/90 rounded-md px-2 py-1">순서 저장 중…</span>}
      </div>
    </div>
  );
}

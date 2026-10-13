/**
 * 한눈에 보기 — 캔버스 보기. 장(章)마다 한 줄, 장표는 쪽 순서대로 왼쪽→오른쪽, 이야기 흐름은 화살표로 잇는다.
 * 끌어서 이동·Ctrl+휠(또는 오른쪽 아래 단추)로 확대. 그냥 휠은 페이지 스크롤(세로 스크롤은 바깥 하나 — 캔버스가 가로채지 않는다).
 * 카드를 끌어 옮긴 자리는 작업마다 이 브라우저에 기억한다. 누르면 그 장을 연다.
 */
import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, applyNodeChanges,
  type Edge, type Node, type NodeChange, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { PlanSlide } from "./api";
import { cn } from "./ui";

const W = 260, GAP_X = 48, ROW_H = 300, HEAD_W = 150;

type CardData = { s: PlanSlide; title: string; thumb: ReactNode; badge?: ReactNode; on: boolean; checks: number };
type HeadData = { name: string; count: number };

const Card = ({ data }: NodeProps<Node<CardData>>) => (
  <div className={cn("w-[260px] flex flex-col gap-1.5 p-2 rounded-md bg-white cursor-pointer",
    data.on ? "shadow-[0_0_0_2px_var(--color-point)]" : "shadow-[0_0_0_1px_var(--color-line)] hover:shadow-[0_0_0_1.5px_var(--color-point)]")}>
    <Handle type="target" position={Position.Left} className="!opacity-0" isConnectable={false} />
    <div className="relative rounded-md border border-line overflow-hidden bg-white pointer-events-none">{data.thumb}{data.badge}</div>
    <div className="flex items-center gap-1.5 px-1 text-[12.5px] text-dim min-w-0">
      <span className="truncate">{data.s.n}쪽{data.s.section ? ` · ${data.s.section}` : ""}</span>
      {data.checks > 0 && <span className="ml-auto flex-none whitespace-nowrap font-semibold text-[var(--color-ink-2)]">확인 {data.checks}</span>}
    </div>
    <div className="px-1 pb-1 font-bold text-[14px] leading-[1.45] line-clamp-2">{data.title}</div>
    <Handle type="source" position={Position.Right} className="!opacity-0" isConnectable={false} />
  </div>
);

const Head = ({ data }: NodeProps<Node<HeadData>>) => (
  <div className="w-[150px] flex flex-col gap-0.5 pr-2">
    <span className="text-[15px] font-bold text-ink2 leading-[1.35] break-keep">{data.name}</span>
    <span className="text-[12.5px] text-dim">{data.count}장</span>
  </div>
);

const nodeTypes = { card: Card, head: Head };

export function OverviewCanvas({ jobId, groups, sel, title, thumb, badge, onOpen }: {
  jobId: string;
  groups: [string, PlanSlide[]][];
  sel: number | null;
  title: (s: PlanSlide) => string;
  thumb: (s: PlanSlide) => ReactNode;
  badge: (s: PlanSlide) => ReactNode;
  onOpen: (n: number) => void;
}) {
  const key = `pd_mr_canvas_${jobId}`;
  const [moved, setMoved] = useState<Record<string, { x: number; y: number }>>(() => {
    try { return JSON.parse(localStorage.getItem(key) ?? "{}") ?? {}; } catch { return {}; }
  });

  const base = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    let prev: string | null = null;
    groups.forEach(([ch, ss], r) => {
      const y = r * ROW_H;
      nodes.push({ id: `h${r}`, type: "head", position: { x: 0, y: y + 40 }, data: { name: ch, count: ss.length }, draggable: false, selectable: false });
      ss.forEach((s, i) => {
        const id = `s${s.n}`;
        nodes.push({
          id, type: "card", position: moved[id] ?? { x: HEAD_W + i * (W + GAP_X), y },
          data: { s, title: title(s), thumb: thumb(s), badge: badge(s), on: sel === s.n, checks: s.checks?.length ?? 0 },
        });
        if (prev) edges.push({
          id: `e${prev}-${id}`, source: prev, target: id, type: "smoothstep",
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "var(--color-line)" },
          style: { stroke: "var(--color-line)", strokeWidth: 1.5 },
        });
        prev = id;
      });
    });
    return { nodes, edges };
  }, [groups, moved, sel, title, thumb, badge]);

  const [drag, setDrag] = useState<Node[] | null>(null);
  const onNodesChange = useCallback((ch: NodeChange[]) => {
    setDrag((cur) => applyNodeChanges(ch, cur ?? base.nodes));
    const done = ch.filter((c) => c.type === "position" && !c.dragging && c.position);
    if (done.length) {
      setMoved((m) => {
        const next = { ...m };
        for (const c of done) if (c.type === "position" && c.position) next[c.id] = c.position;
        try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* 무시 */ }
        return next;
      });
      setDrag(null);
    }
  }, [base.nodes, key]);

  const reset = () => { setMoved({}); setDrag(null); try { localStorage.removeItem(key); } catch { /* 무시 */ } };

  return (
    <div className="relative h-[calc(100vh-260px)] min-h-[440px] rounded-md border border-line bg-panel overflow-hidden">
      <ReactFlow
        nodes={drag ?? base.nodes} edges={base.edges} nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, n) => { if (n.type === "card") onOpen((n.data as CardData).s.n); }}
        fitView fitViewOptions={{ padding: 0.12, maxZoom: 1 }} minZoom={0.15} maxZoom={1.6}
        zoomOnScroll={false} zoomActivationKeyCode="Control" panOnScroll={false} preventScrolling={false}
        nodesConnectable={false} edgesFocusable={false} proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} color="var(--color-line)" />
        <Controls showInteractive={false} position="bottom-right" />
        <MiniMap pannable zoomable position="bottom-left" nodeColor={(n) => (n.type === "head" ? "transparent" : "#D4D4D4")} className="!bg-white !border !border-line max-md:!hidden" />
      </ReactFlow>
      <div className="absolute top-2.5 left-3 right-3 flex items-center gap-2 pointer-events-none">
        <span className="text-[12.5px] text-dim bg-white/90 rounded-md px-2 py-1">끌어서 이동 · Ctrl+휠로 확대 · 카드를 누르면 그 장을 엽니다</span>
        {Object.keys(moved).length > 0 && (
          <button type="button" onClick={reset} className="pointer-events-auto ml-auto h-7 px-2.5 rounded-md border border-line bg-white text-[12.5px] font-semibold text-ink2 hover:bg-bar">배치 되돌리기</button>
        )}
      </div>
    </div>
  );
}

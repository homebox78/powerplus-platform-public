"use client";
// 크기 조절 칸 — shadcn Resizable 과 같은 사용법 (직접 구현, 새 라이브러리 없음)
//   <ResizablePanelGroup direction="horizontal" style={{ height: 320 }}>
//     <ResizablePanel defaultSize={30} minSize={20}>목록</ResizablePanel>
//     <ResizableHandle withHandle />
//     <ResizablePanel defaultSize={70}>본문</ResizablePanel>
//   </ResizablePanelGroup>
// 크기는 % 단위. 손잡이는 끌어서, 또는 Tab 으로 들어가 방향키(5%씩, Shift 는 10%)·Home/End 로 조절한다.
// 손잡이는 WAI-ARIA 「창 분할(separator)」 — aria-valuenow 가 앞 칸의 크기(%).
import * as React from "react";
import { cx, useUid } from "./utils";

interface PanelInfo {
  min: number;
  max: number;
  id: string;
}
interface GroupCtx {
  direction: "horizontal" | "vertical";
  sizes: number[];
  panels: PanelInfo[];
  resize: (handle: number, sizeOfFirst: number) => void;
  groupRef: React.RefObject<HTMLDivElement | null>;
}
const ResizableCtx = React.createContext<GroupCtx | null>(null);
const PanelIndex = React.createContext(-1);
const HandleIndex = React.createContext(-1);
const useGroup = () => {
  const c = React.useContext(ResizableCtx);
  if (!c) throw new Error("ResizablePanelGroup 안에서만 쓸 수 있습니다");
  return c;
};

export interface ResizablePanelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 처음 크기(%) — 비우면 남은 크기를 나눠 갖는다 */
  defaultSize?: number;
  /** 가장 작은 크기(%) — 기본 10 */
  minSize?: number;
  /** 가장 큰 크기(%) — 기본 90 */
  maxSize?: number;
}

export const ResizablePanel = React.forwardRef<HTMLDivElement, ResizablePanelProps>(function ResizablePanel(
  { defaultSize: _d, minSize: _min, maxSize: _max, className, style, ...props },
  ref,
) {
  const g = useGroup();
  const i = React.useContext(PanelIndex);
  const size = g.sizes[i] ?? 50;
  return (
    <div
      ref={ref}
      id={g.panels[i]?.id}
      data-size={Math.round(size)}
      className={cx("hb-resizable-panel", className)}
      style={{ flex: `${size} 1 0px`, ...style }}
      {...props}
    />
  );
});

export interface ResizableHandleProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 가운데 잡는 손잡이 모양을 보인다 */
  withHandle?: boolean;
}

export const ResizableHandle = React.forwardRef<HTMLDivElement, ResizableHandleProps>(function ResizableHandle(
  { withHandle, className, "aria-label": label = "칸 크기 조절", ...props },
  ref,
) {
  const g = useGroup();
  const i = React.useContext(HandleIndex);
  const [dragging, setDragging] = React.useState(false);
  const start = React.useRef({ pos: 0, a: 0, len: 1 });
  const horizontal = g.direction === "horizontal";
  const a = g.sizes[i] ?? 50;
  const pa = g.panels[i];

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = g.groupRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    start.current = { pos: horizontal ? e.clientX : e.clientY, a, len: horizontal ? rect.width : rect.height };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const d = ((horizontal ? e.clientX : e.clientY) - start.current.pos) / start.current.len * 100;
    g.resize(i, start.current.a + d);
  };
  const stop = () => setDragging(false);
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 5;
    const back = horizontal ? "ArrowLeft" : "ArrowUp";
    const fwd = horizontal ? "ArrowRight" : "ArrowDown";
    let next: number | null = null;
    if (e.key === back) next = a - step;
    else if (e.key === fwd) next = a + step;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = 100;
    if (next === null) return;
    e.preventDefault();
    g.resize(i, next);
  };

  return (
    <div
      ref={ref}
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={horizontal ? "vertical" : "horizontal"}
      aria-controls={pa?.id}
      aria-valuenow={Math.round(a)}
      aria-valuemin={pa?.min ?? 0}
      aria-valuemax={pa?.max ?? 100}
      data-dragging={dragging}
      className={cx("hb-resizable-handle", className)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onKeyDown={onKeyDown}
      {...props}
    >
      {withHandle && <span className="hb-resizable-grip" aria-hidden="true" />}
    </div>
  );
});

export interface ResizablePanelGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  direction?: "horizontal" | "vertical";
  /** 크기가 바뀌면 칸별 %를 알려 준다 */
  onLayout?: (sizes: number[]) => void;
}

const isPanel = (c: React.ReactNode): c is React.ReactElement<ResizablePanelProps> =>
  React.isValidElement(c) && c.type === ResizablePanel;
const isHandle = (c: React.ReactNode) => React.isValidElement(c) && c.type === ResizableHandle;

export const ResizablePanelGroup = React.forwardRef<HTMLDivElement, ResizablePanelGroupProps>(function ResizablePanelGroup(
  { direction = "horizontal", onLayout, className, children, ...props },
  ref,
) {
  const groupRef = React.useRef<HTMLDivElement | null>(null);
  const items = React.Children.toArray(children);
  const panelProps = items.filter(isPanel).map((c) => c.props);
  const base = useUid("hb-panel");
  const panels: PanelInfo[] = panelProps.map((p, i) => ({ min: p.minSize ?? 10, max: p.maxSize ?? 90, id: `${base}-${i}` }));

  const [sizes, setSizes] = React.useState<number[]>(() => {
    const given = panelProps.map((p) => p.defaultSize);
    const known = given.reduce<number>((s, v) => s + (v ?? 0), 0);
    const free = given.filter((v) => v === undefined).length;
    return given.map((v) => v ?? (free ? (100 - known) / free : 0));
  });

  const resize = (h: number, want: number) => {
    setSizes((prev) => {
      const pa = panels[h];
      const pb = panels[h + 1];
      if (!pa || !pb) return prev;
      const total = prev[h] + prev[h + 1];
      const lo = Math.max(pa.min, total - pb.max);
      const hi = Math.min(pa.max, total - pb.min);
      const a = Math.min(hi, Math.max(lo, want));
      if (a === prev[h]) return prev;
      const next = [...prev];
      next[h] = a;
      next[h + 1] = total - a;
      return next;
    });
  };

  const mounted = React.useRef(false);
  React.useEffect(() => {
    if (mounted.current) onLayout?.(sizes);
    mounted.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizes]);

  let pi = 0;
  const mapped = items.map((c, k) => {
    if (isPanel(c)) return <PanelIndex.Provider key={k} value={pi++}>{c}</PanelIndex.Provider>;
    if (isHandle(c)) return <HandleIndex.Provider key={k} value={pi - 1}>{c}</HandleIndex.Provider>;
    return c;
  });

  return (
    <ResizableCtx.Provider value={{ direction, sizes, panels, resize, groupRef }}>
      <div
        ref={(el) => {
          groupRef.current = el;
          if (typeof ref === "function") ref(el);
          else if (ref) ref.current = el;
        }}
        data-direction={direction}
        className={cx("hb-resizable-group", className)}
        {...props}
      >
        {mapped}
      </div>
    </ResizableCtx.Provider>
  );
});

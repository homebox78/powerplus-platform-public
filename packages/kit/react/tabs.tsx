"use client";
// 탭 — KRDS 「탭」 · shadcn Tabs 와 같은 사용법
//   <Tabs defaultValue="notice">
//     <TabsList variant="line" full>
//       <TabsTrigger value="notice">공지사항</TabsTrigger>
//       <TabsTrigger value="news">보도자료</TabsTrigger>
//     </TabsList>
//     <TabsContent value="notice">…</TabsContent>
//   </Tabs>
//
// 접근성(WAI-ARIA 탭 패턴): 선택된 탭만 Tab 키로 들어가고(roving tabindex),
// ←/→ 로 이동·선택, Home/End 로 처음/끝. 패널은 tabpanel 로 탭과 짝지어진다.
// KRDS 마크업은 li 에 active 클래스를 둔다 → li 는 presentation, 역할은 button 이 갖는다.
import * as React from "react";
import { cx, useUid } from "./utils";

interface Ctx {
  value: string;
  setValue: (v: string) => void;
  base: string;
}
const TabsCtx = React.createContext<Ctx | null>(null);
const useTabs = () => {
  const c = React.useContext(TabsCtx);
  if (!c) throw new Error("Tabs 안에서만 쓸 수 있습니다");
  return c;
};

export interface TabsProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
}

export function Tabs({ value, defaultValue = "", onValueChange, className, children, ...props }: TabsProps) {
  const [inner, setInner] = React.useState(defaultValue);
  const base = useUid("hb-tab");
  const current = value ?? inner;
  const setValue = (v: string) => {
    if (value === undefined) setInner(v);
    onValueChange?.(v);
  };
  return (
    <TabsCtx.Provider value={{ value: current, setValue, base }}>
      <div className={cx("krds-tab-area", className)} {...props}>
        {children}
      </div>
    </TabsCtx.Provider>
  );
}

export interface TabsListProps extends React.HTMLAttributes<HTMLDivElement> {
  /** line = 밑줄형(기본) · fill = 채움형 */
  variant?: "line" | "fill";
  /** 탭을 폭 가득 나눠 채운다 */
  full?: boolean;
  "aria-label"?: string;
}

export function TabsList({ variant = "line", full, className, children, "aria-label": label, ...props }: TabsListProps) {
  const ref = React.useRef<HTMLUListElement>(null);
  const { setValue } = useTabs();
  const onKeyDown = (e: React.KeyboardEvent) => {
    const tabs = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])') ?? []);
    const i = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const next =
      e.key === "ArrowRight" ? (i + 1) % tabs.length
      : e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length
      : e.key === "Home" ? 0
      : e.key === "End" ? tabs.length - 1
      : -1;
    if (next < 0) return;
    e.preventDefault();
    tabs[next].focus();
    setValue(tabs[next].dataset.value ?? "");
  };
  return (
    <div className={cx("tab", variant, full && "full", className)} {...props}>
      <ul ref={ref} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {children}
      </ul>
    </div>
  );
}

export interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
}

export function TabsTrigger({ value, className, children, disabled, ...props }: TabsTriggerProps) {
  const t = useTabs();
  const on = t.value === value;
  return (
    <li role="presentation" className={cx(on && "active")}>
      <button
        type="button"
        role="tab"
        id={`${t.base}-t-${value}`}
        aria-controls={`${t.base}-p-${value}`}
        aria-selected={on}
        tabIndex={on ? 0 : -1}
        data-value={value}
        disabled={disabled}
        className={cx("btn-tab", className)}
        onClick={() => t.setValue(value)}
        {...props}
      >
        {children}
        {on && <i className="sr-only"> 선택됨</i>}
      </button>
    </li>
  );
}

export interface TabsContentProps extends React.HTMLAttributes<HTMLElement> {
  value: string;
}

export function TabsContent({ value, className, children, ...props }: TabsContentProps) {
  const t = useTabs();
  const on = t.value === value;
  return (
    <section
      role="tabpanel"
      id={`${t.base}-p-${value}`}
      aria-labelledby={`${t.base}-t-${value}`}
      tabIndex={0}
      hidden={!on}
      className={cx("tab-conts", on && "active", className)}
      {...props}
    >
      {children}
    </section>
  );
}

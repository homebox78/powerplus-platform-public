"use client";
// 아코디언 — KRDS 「아코디언」 · shadcn Accordion 과 같은 사용법
//   <Accordion type="single" collapsible defaultValue="q1">
//     <AccordionItem value="q1">
//       <AccordionTrigger>신청 자격은 어떻게 되나요?</AccordionTrigger>
//       <AccordionContent>…</AccordionContent>
//     </AccordionItem>
//   </Accordion>
//
// type="single" 은 한 번에 하나만 열린다(KRDS singleOpen), "multiple" 은 여러 개(multiOpen).
// 제목은 h3 기본 — 페이지 제목 계층에 맞게 headingLevel 로 바꾼다.
import * as React from "react";
import { cx, useUid } from "./utils";

type Single = { type?: "single"; value?: string; defaultValue?: string; onValueChange?: (v: string) => void; collapsible?: boolean };
type Multiple = { type: "multiple"; value?: string[]; defaultValue?: string[]; onValueChange?: (v: string[]) => void };
export type AccordionProps = (Single | Multiple) &
  Omit<React.HTMLAttributes<HTMLDivElement>, "defaultValue" | "onChange"> & {
    /** line = 선형(KRDS accordion_line) */
    variant?: "default" | "line";
    headingLevel?: 2 | 3 | 4 | 5 | 6;
  };

interface Ctx {
  isOpen: (v: string) => boolean;
  toggle: (v: string) => void;
  base: string;
  level: number;
}
const AccCtx = React.createContext<Ctx | null>(null);
const ItemCtx = React.createContext<string>("");

export function Accordion(props: AccordionProps) {
  const { type = "single", variant = "default", headingLevel = 3, className, children, ...rest } = props as AccordionProps & { type?: string };
  const multiple = type === "multiple";
  // 겉 타입은 single/multiple 로 갈라 두고, 안에서는 느슨한 한 모양으로 다룬다
  const p = props as {
    value?: string | string[];
    defaultValue?: string | string[];
    onValueChange?: (v: string | string[]) => void;
    collapsible?: boolean;
  };
  const toList = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);
  const [inner, setInner] = React.useState<string[]>(toList(p.defaultValue));
  const base = useUid("hb-acc");
  const open = p.value !== undefined ? toList(p.value) : inner;

  const toggle = (v: string) => {
    const was = open.includes(v);
    let next: string[];
    if (multiple) next = was ? open.filter((x) => x !== v) : [...open, v];
    else next = was ? (p.collapsible === false ? open : []) : [v];
    if (p.value === undefined) setInner(next);
    p.onValueChange?.(multiple ? next : (next[0] ?? ""));
  };

  // DOM 으로 새지 않게 제어용 속성은 뺀다
  const { value: _v, defaultValue: _d, onValueChange: _o, collapsible: _c, ...dom } = rest as Record<string, unknown>;
  void _v; void _d; void _o; void _c;

  return (
    <AccCtx.Provider value={{ isOpen: (v) => open.includes(v), toggle, base, level: headingLevel }}>
      <div className={cx("krds-accordion", variant === "line" && "line", className)} data-type={multiple ? "multiOpen" : "singleOpen"} {...(dom as React.HTMLAttributes<HTMLDivElement>)}>
        {children}
      </div>
    </AccCtx.Provider>
  );
}

export interface AccordionItemProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string;
}

export function AccordionItem({ value, className, children, ...props }: AccordionItemProps) {
  const c = React.useContext(AccCtx)!;
  return (
    <ItemCtx.Provider value={value}>
      <div className={cx("accordion-item", c.isOpen(value) && "active", className)} {...props}>
        {children}
      </div>
    </ItemCtx.Provider>
  );
}

export function AccordionTrigger({ className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const c = React.useContext(AccCtx)!;
  const v = React.useContext(ItemCtx);
  const on = c.isOpen(v);
  const H = `h${c.level}` as React.ElementType;
  return (
    <H className="accordion-header">
      <button
        type="button"
        id={`${c.base}-h-${v}`}
        aria-controls={`${c.base}-c-${v}`}
        aria-expanded={on}
        className={cx("btn-accordion", on && "active", className)}
        onClick={() => c.toggle(v)}
        {...props}
      >
        {children}
      </button>
    </H>
  );
}

export function AccordionContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const c = React.useContext(AccCtx)!;
  const v = React.useContext(ItemCtx);
  return (
    <div
      id={`${c.base}-c-${v}`}
      role="region"
      aria-labelledby={`${c.base}-h-${v}`}
      className="accordion-collapse collapse"
    >
      <div className={cx("accordion-body", className)} {...props}>
        {children}
      </div>
    </div>
  );
}

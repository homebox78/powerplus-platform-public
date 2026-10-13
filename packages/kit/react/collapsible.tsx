"use client";
// 접기·펼치기 — KRDS 「디스클로저」 · shadcn Collapsible 과 같은 사용법
//   <Collapsible>
//     <CollapsibleTrigger>신청 서비스 안내</CollapsibleTrigger>
//     <CollapsibleContent>…</CollapsibleContent>
//   </Collapsible>
// open / defaultOpen / onOpenChange 로 상태를 다룬다. 닫힌 내용은 inert 라 Tab 으로 들어가지 않는다.
import * as React from "react";
import { cx, useUid } from "./utils";

interface Ctx {
  open: boolean;
  setOpen: (v: boolean) => void;
  id: string;
}
const CollapsibleCtx = React.createContext<Ctx | null>(null);
const useCollapsible = () => {
  const c = React.useContext(CollapsibleCtx);
  if (!c) throw new Error("Collapsible 안에서만 쓸 수 있습니다");
  return c;
};

export interface CollapsibleProps extends React.HTMLAttributes<HTMLDivElement> {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const Collapsible = React.forwardRef<HTMLDivElement, CollapsibleProps>(function Collapsible(
  { open, defaultOpen = false, onOpenChange, className, children, ...props },
  ref,
) {
  const [inner, setInner] = React.useState(defaultOpen);
  const id = useUid("hb-disclosure");
  const current = open ?? inner;
  const setOpen = (v: boolean) => {
    if (open === undefined) setInner(v);
    onOpenChange?.(v);
  };
  return (
    <CollapsibleCtx.Provider value={{ open: current, setOpen, id }}>
      <div ref={ref} data-state={current ? "open" : "closed"} className={cx("krds-disclosure", "conts-expand-area", current && "active", className)} {...props}>
        {children}
      </div>
    </CollapsibleCtx.Provider>
  );
});

export const CollapsibleTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(function CollapsibleTrigger(
  { className, onClick, children, ...props },
  ref,
) {
  const c = useCollapsible();
  return (
    <button
      ref={ref}
      type="button"
      aria-expanded={c.open}
      aria-controls={c.id}
      className={cx("btn-conts-expand", className)}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) c.setOpen(!c.open);
      }}
      {...props}
    >
      {children}
    </button>
  );
});

export const CollapsibleContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function CollapsibleContent(
  { className, children, ...props },
  ref,
) {
  const c = useCollapsible();
  return (
    <div ref={ref} id={c.id} className="expand-wrap" inert={!c.open} aria-hidden={!c.open}>
      <div className={cx("expand-in", className)} {...props}>
        {children}
      </div>
    </div>
  );
});

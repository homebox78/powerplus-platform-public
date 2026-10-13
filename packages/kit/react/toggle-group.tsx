"use client";
// 토글 묶음 — shadcn ToggleGroup · ToggleGroupItem
//   <ToggleGroup type="single" defaultValue="list" aria-label="보기 방식">     ← 하나만 선택
//     <ToggleGroupItem value="list">목록형</ToggleGroupItem>
//     <ToggleGroupItem value="card">카드형</ToggleGroupItem>
//   </ToggleGroup>
//   <ToggleGroup type="multiple" defaultValue={["welfare"]} aria-label="분야">   ← 여러 개 선택
//     …
//   </ToggleGroup>
//
// 접근성: 묶음 안에서는 하나만 Tab 으로 들어가고(roving tabindex) ←/→(세로면 ↑/↓)·Home/End 로 이동한다.
//   single = radiogroup/radio(aria-checked), 방향키로 옮기면 바로 선택된다.
//   multiple = group/button(aria-pressed), Space·Enter 로 켜고 끈다.
import * as React from "react";
import { cx } from "./utils";

type Size = "xsmall" | "small" | "medium" | "large" | "xlarge";
interface Ctx {
  type: "single" | "multiple";
  values: string[];
  toggle: (v: string) => void;
  select: (v: string) => void;
  variant: "default" | "outline";
  size: Size;
  disabled?: boolean;
}
const TgCtx = React.createContext<Ctx | null>(null);

interface BaseProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "defaultValue" | "onChange" | "dir"> {
  variant?: "default" | "outline";
  size?: Size;
  orientation?: "horizontal" | "vertical";
  disabled?: boolean;
  /** 떨어뜨려 놓기(기본: 붙여서 한 덩어리) */
  spacing?: "attached" | "separate";
}
interface SingleProps extends BaseProps {
  type: "single";
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
}
interface MultipleProps extends BaseProps {
  type: "multiple";
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (v: string[]) => void;
}
export type ToggleGroupProps = SingleProps | MultipleProps;

const toArr = (v: string | string[] | undefined): string[] => (v === undefined ? [] : Array.isArray(v) ? v : v ? [v] : []);

export const ToggleGroup = React.forwardRef<HTMLDivElement, ToggleGroupProps>(function ToggleGroup(props, ref) {
  const {
    type,
    value,
    defaultValue,
    onValueChange,
    variant = "default",
    size = "medium",
    orientation = "horizontal",
    disabled,
    spacing = "attached",
    className,
    children,
    onKeyDown,
    ...rest
  } = props;
  const [inner, setInner] = React.useState<string[]>(toArr(defaultValue));
  const values = value !== undefined ? toArr(value) : inner;
  const root = React.useRef<HTMLDivElement | null>(null);

  const commit = (next: string[]) => {
    if (value === undefined) setInner(next);
    if (type === "single") (onValueChange as ((v: string) => void) | undefined)?.(next[0] ?? "");
    else (onValueChange as ((v: string[]) => void) | undefined)?.(next);
  };
  const toggle = (v: string) => {
    if (type === "single") commit(values[0] === v ? [] : [v]);
    else commit(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  };
  const select = (v: string) => commit(type === "single" ? [v] : values);

  // roving tabindex — 선택된 첫 항목(없으면 첫 항목)만 Tab 으로 들어간다
  React.useLayoutEffect(() => {
    const items = Array.from(root.current?.querySelectorAll<HTMLButtonElement>("[data-hb-tgi]") ?? []);
    const enabled = items.filter((b) => !b.disabled);
    const target = enabled.find((b) => b.dataset.state === "on") ?? enabled[0];
    for (const b of items) b.tabIndex = b === target ? 0 : -1;
  });

  const keys = orientation === "vertical" ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"];
  const handleKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e);
    const items = Array.from(root.current?.querySelectorAll<HTMLButtonElement>("[data-hb-tgi]:not(:disabled)") ?? []);
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    let n = -1;
    if (e.key === keys[1]) n = (i + 1) % items.length;
    else if (e.key === keys[0]) n = (i - 1 + items.length) % items.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = items.length - 1;
    if (n < 0) return;
    e.preventDefault();
    for (const b of items) b.tabIndex = -1;
    items[n].tabIndex = 0;
    items[n].focus();
    if (type === "single") select(items[n].dataset.value!);
  };

  return (
    <TgCtx.Provider value={{ type, values, toggle, select, variant, size, disabled }}>
      <div
        ref={(el) => {
          root.current = el;
          if (typeof ref === "function") ref(el);
          else if (ref) ref.current = el;
        }}
        role={type === "single" ? "radiogroup" : "group"}
        aria-orientation={type === "single" ? orientation : undefined} /* group 역할에는 aria-orientation 이 허용되지 않는다 */
        data-orientation={orientation}
        className={cx("hb-toggle-group", orientation, spacing, className)}
        onKeyDown={handleKey}
        {...rest}
      >
        {children}
      </div>
    </TgCtx.Provider>
  );
});

export interface ToggleGroupItemProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "value"> {
  value: string;
  /** KRDS 아이콘 이름 */
  icon?: string;
}

export const ToggleGroupItem = React.forwardRef<HTMLButtonElement, ToggleGroupItemProps>(function ToggleGroupItem(
  { value, icon, className, disabled, onClick, children, ...props },
  ref,
) {
  const g = React.useContext(TgCtx);
  if (!g) throw new Error("ToggleGroup 안에서만 쓸 수 있습니다");
  const on = g.values.includes(value);
  const single = g.type === "single";
  return (
    <button
      ref={ref}
      type="button"
      role={single ? "radio" : undefined}
      aria-checked={single ? on : undefined}
      aria-pressed={single ? undefined : on}
      data-state={on ? "on" : "off"}
      data-value={value}
      data-hb-tgi=""
      disabled={disabled || g.disabled}
      className={cx("hb-toggle", g.variant, g.size, className)}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        if (single) g.select(value);
        else g.toggle(value);
      }}
      {...props}
    >
      {icon && <i className={`svg-icon ico-${icon}`} aria-hidden="true" />}
      {children}
    </button>
  );
});

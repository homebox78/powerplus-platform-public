"use client";
// 토글 버튼 — shadcn Toggle (모양은 KRDS 버튼 크기·토큰)
//   <Toggle aria-label="관심 민원 등록" icon="like">관심</Toggle>
//   <Toggle pressed={on} onPressedChange={setOn}>자막 켜기</Toggle>
//
// 누를 때마다 켜짐/꺼짐이 바뀌는 버튼. aria-pressed 로 상태를 알리고, 켜짐은 색과 함께 체크 표시로도 보인다.
// variant: default(투명) · outline(테두리) / size: 버튼과 같은 xsmall~xlarge (같은 줄 버튼과 높이가 맞는다)
import * as React from "react";
import { cx } from "./utils";

export interface ToggleProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  pressed?: boolean;
  defaultPressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
  variant?: "default" | "outline";
  size?: "xsmall" | "small" | "medium" | "large" | "xlarge";
  /** KRDS 아이콘 이름 */
  icon?: string;
}

export const Toggle = React.forwardRef<HTMLButtonElement, ToggleProps>(function Toggle(
  { pressed, defaultPressed = false, onPressedChange, variant = "default", size = "medium", icon, className, onClick, children, ...props },
  ref,
) {
  const [inner, setInner] = React.useState(defaultPressed);
  const on = pressed ?? inner;
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={on}
      data-state={on ? "on" : "off"}
      className={cx("hb-toggle", variant, size, className)}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        if (pressed === undefined) setInner(!on);
        onPressedChange?.(!on);
      }}
      {...props}
    >
      {icon && <i className={`svg-icon ico-${icon}`} aria-hidden="true" />}
      {children}
    </button>
  );
});

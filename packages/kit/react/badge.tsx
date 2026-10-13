"use client";
// 배지 — KRDS 「배지」 · shadcn Badge
//   <Badge>접수중</Badge>                                   ← 기본: 테두리형 primary
//   <Badge variant="solid" color="danger">마감</Badge>
//   <Badge variant="light" color="success" size="large">완료</Badge>
//   <Badge count={1200} max={999} label="새 알림" />         ← 숫자 배지(둥근) → "999+"
//   <Badge dot label="새 글 있음" color="point" />           ← 점 배지(글자는 스크린리더용)
//
// variant: outline(테두리) · solid(채움) · light(옅은 채움)
// color: primary · secondary · gray · point · danger · warning · success · information · disabled
import * as React from "react";
import { cx } from "./utils";

export type BadgeColor = "primary" | "secondary" | "gray" | "point" | "danger" | "warning" | "success" | "information" | "disabled";

export interface BadgeProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "color"> {
  variant?: "outline" | "solid" | "light";
  color?: BadgeColor;
  size?: "medium" | "large";
  /** 숫자 배지. max 를 넘으면 "max+" */
  count?: number;
  max?: number;
  /** 점 배지 */
  dot?: boolean;
  /** 스크린리더에 덧붙여 읽을 뜻 (예: "새 알림") */
  label?: string;
}

const PREFIX = { outline: "outline-", solid: "bg-", light: "bg-light-" } as const;

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { variant, color = "primary", size = "medium", count, max = 999, dot, label, className, children, ...props },
  ref,
) {
  const isNumber = count !== undefined;
  // 숫자·점 배지는 채움형이 기본
  const v = variant ?? (isNumber || dot ? "solid" : "outline");
  const text = isNumber ? (count > max ? `${max}+` : String(count)) : children;
  return (
    <span
      ref={ref}
      className={cx("krds-badge", `${PREFIX[v]}${color}`, size === "large" && "large", isNumber && "number", dot && "dot", className)}
      {...props}
    >
      {!dot && text}
      {label && <span className="sr-only">{isNumber || dot ? ` ${label}` : label}</span>}
    </span>
  );
});

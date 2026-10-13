"use client";
// 빈 상태 — shadcn Empty (모양은 KRDS 토큰)
//   <Empty>
//     <EmptyHeader>
//       <EmptyMedia variant="icon" icon="sch" />           ← KRDS 아이콘 이름 또는 children
//       <EmptyTitle>검색 결과가 없습니다</EmptyTitle>
//       <EmptyDescription>검색어의 철자를 확인하거나 다른 낱말로 검색해 보세요.</EmptyDescription>
//     </EmptyHeader>
//     <EmptyContent><Button variant="secondary">전체 목록 보기</Button></EmptyContent>
//   </Empty>
import * as React from "react";
import { cx } from "./utils";

type Div = React.HTMLAttributes<HTMLDivElement>;

export const Empty = React.forwardRef<HTMLDivElement, Div & { bordered?: boolean }>(function Empty({ bordered, className, ...props }, ref) {
  return <div ref={ref} className={cx("hb-empty", bordered && "bordered", className)} {...props} />;
});

export const EmptyHeader = React.forwardRef<HTMLDivElement, Div>(function EmptyHeader({ className, ...props }, ref) {
  return <div ref={ref} className={cx("hb-empty-header", className)} {...props} />;
});

export interface EmptyMediaProps extends Div {
  /** icon = 원형 배경 안의 아이콘 · default = 그림을 그대로 */
  variant?: "default" | "icon";
  /** KRDS 아이콘 이름(sch · file · faq …) */
  icon?: string;
}

export const EmptyMedia = React.forwardRef<HTMLDivElement, EmptyMediaProps>(function EmptyMedia(
  { variant = "default", icon, className, children, ...props },
  ref,
) {
  return (
    <div ref={ref} aria-hidden="true" className={cx("hb-empty-media", variant === "icon" && "icon", className)} {...props}>
      {icon ? <i className={`svg-icon ico-${icon}`} /> : children}
    </div>
  );
});

export const EmptyTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(function EmptyTitle(
  { className, ...props },
  ref,
) {
  return <p ref={ref} className={cx("hb-empty-title", className)} {...props} />;
});

export const EmptyDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(function EmptyDescription(
  { className, ...props },
  ref,
) {
  return <p ref={ref} className={cx("hb-empty-description", className)} {...props} />;
});

export const EmptyContent = React.forwardRef<HTMLDivElement, Div>(function EmptyContent({ className, ...props }, ref) {
  return <div ref={ref} className={cx("hb-empty-content", className)} {...props} />;
});

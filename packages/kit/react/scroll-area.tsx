"use client";
// 스크롤 영역 — shadcn ScrollArea 와 같은 사용법 (모양은 홈박스: 얇은 막대)
//   <ScrollArea aria-label="개인정보 처리방침 전문" style={{ height: 240 }}>…</ScrollArea>
//   <ScrollArea orientation="horizontal" aria-label="바로가기">…</ScrollArea>
// 키보드 사용자도 스크롤할 수 있게 영역 자체가 Tab 으로 들어간다(tabIndex=0) — 그래서 이름(aria-label)을 꼭 준다.
import * as React from "react";
import { cx } from "./utils";

export interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 스크롤 방향 (기본 vertical) */
  orientation?: "vertical" | "horizontal" | "both";
}

export const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(function ScrollArea(
  { orientation = "vertical", className, tabIndex = 0, role = "region", ...props },
  ref,
) {
  return <div ref={ref} role={role} tabIndex={tabIndex} data-orientation={orientation} className={cx("hb-scroll-area", className)} {...props} />;
});

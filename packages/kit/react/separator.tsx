"use client";
// 구분선 — shadcn Separator (KRDS 테두리 토큰)
//   <Separator />                                  ← 가로 구분선(장식, 스크린리더 무시)
//   <Separator orientation="vertical" />           ← 세로 구분선(글자 사이 "|")
//   <Separator decorative={false} />               ← 뜻이 있는 구분(role=separator)
import * as React from "react";
import { cx } from "./utils";

export interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
  /** true(기본)이면 꾸밈 — 스크린리더가 읽지 않는다 */
  decorative?: boolean;
}

export const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(function Separator(
  { orientation = "horizontal", decorative = true, className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      role={decorative ? "none" : "separator"}
      aria-orientation={!decorative && orientation === "vertical" ? "vertical" : undefined}
      data-orientation={orientation}
      className={cx("hb-separator", orientation, className)}
      {...props}
    />
  );
});

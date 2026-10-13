"use client";
// 스켈레톤 — shadcn Skeleton (모양은 KRDS 회색 토큰)
//   <Skeleton style={{ width: 240, height: 20 }} />
//   <Skeleton shape="circle" style={{ width: 48, height: 48 }} />
//   <Skeleton shape="text" lines={3} />          ← 글줄 3개 (마지막 줄은 짧게)
//
// 스켈레톤 자체는 스크린리더에서 숨긴다(aria-hidden). 불러오는 영역에 aria-busy 와
// "불러오는 중" 안내를 따로 둔다. 움직임 줄이기 설정이면 반짝임을 멈춘다.
import * as React from "react";
import { cx } from "./utils";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  shape?: "rect" | "circle" | "text";
  /** shape="text" 일 때 줄 수 */
  lines?: number;
}

export const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(function Skeleton(
  { shape = "rect", lines = 1, className, ...props },
  ref,
) {
  if (shape === "text") {
    return (
      <div ref={ref} aria-hidden="true" className={cx("hb-skeleton-lines", className)} {...props}>
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className="hb-skeleton text" />
        ))}
      </div>
    );
  }
  return <div ref={ref} aria-hidden="true" className={cx("hb-skeleton", shape === "circle" && "circle", className)} {...props} />;
});

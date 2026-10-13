"use client";
// 비율 상자 — shadcn AspectRatio
//   <AspectRatio ratio={16 / 9}><img src="/img/visual.jpg" alt="한빛시청 전경" /></AspectRatio>
//
// 안의 사진·영상·지도는 상자를 가득 채운다(object-fit: cover). fit="contain" 이면 잘리지 않게 맞춘다.
import * as React from "react";
import { cx } from "./utils";

export interface AspectRatioProps extends React.HTMLAttributes<HTMLDivElement> {
  ratio?: number;
  fit?: "cover" | "contain";
}

export const AspectRatio = React.forwardRef<HTMLDivElement, AspectRatioProps>(function AspectRatio(
  { ratio = 1, fit = "cover", className, style, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cx("hb-aspect-ratio", fit === "contain" && "contain", className)}
      style={{ aspectRatio: String(ratio), ...style }}
      {...props}
    />
  );
});

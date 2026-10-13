"use client";
// 스피너 — KRDS 「스피너」(krds-spinner, role=status)
//   <Spinner />                                  ← 스크린리더에 "로딩 중"
//   <Spinner>민원 목록을 불러오는 중입니다</Spinner>   ← 보이는 안내 글
//   <Spinner label="검색 결과 불러오는 중" />
//
// KRDS 스피너는 부모 폭을 채우고 가운데에 놓인다. inline 이면 글자 옆 작은 인라인 스피너.
import * as React from "react";
import { cx } from "./utils";

export interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 스크린리더 안내 (기본 "로딩 중") */
  label?: string;
  /** 부모 폭을 채우지 않고 글자처럼 줄 안에 놓는다 */
  inline?: boolean;
}

export const Spinner = React.forwardRef<HTMLDivElement, SpinnerProps>(function Spinner(
  { label = "로딩 중", inline, className, children, ...props },
  ref,
) {
  return (
    <div ref={ref} role="status" className={cx("krds-spinner", inline && "hb-spinner-inline", className)} {...props}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
});

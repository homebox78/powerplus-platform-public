"use client";
// 카드 — shadcn Card 와 같은 사용법 (KRDS 에는 카드 부품이 없어 KRDS 토큰으로 지었다)
//   <Card>
//     <CardHeader>
//       <CardTitle>여권 발급 신청</CardTitle>
//       <CardDescription>처리 기간 4일(근무일 기준)</CardDescription>
//       <CardAction><Button variant="text" size="small">자세히</Button></CardAction>
//     </CardHeader>
//     <CardContent>…</CardContent>
//     <CardFooter>…</CardFooter>
//   </Card>
// CardTitle 은 기본 <h3> — 문서 구조에 맞게 as="h2" 등으로 바꾼다.
import * as React from "react";
import { cx } from "./utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** outline = 테두리(기본) · filled = 연한 면 · elevated = 그림자 */
  variant?: "outline" | "filled" | "elevated";
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = "outline", className, ...props },
  ref,
) {
  return <div ref={ref} className={cx("hb-card", variant !== "outline" && `hb-card-${variant}`, className)} {...props} />;
});

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function CardHeader(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cx("hb-card-header", className)} {...props} />;
});

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: "h2" | "h3" | "h4" | "h5" | "h6";
}

export const CardTitle = React.forwardRef<HTMLHeadingElement, CardTitleProps>(function CardTitle(
  { as: Tag = "h3", className, ...props },
  ref,
) {
  return <Tag ref={ref} className={cx("hb-card-title", className)} {...props} />;
});

export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  function CardDescription({ className, ...props }, ref) {
    return <p ref={ref} className={cx("hb-card-desc", className)} {...props} />;
  },
);

/** 머리 오른쪽 위 자리(버튼·뱃지) */
export const CardAction = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function CardAction(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cx("hb-card-action", className)} {...props} />;
});

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function CardContent(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cx("hb-card-content", className)} {...props} />;
});

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function CardFooter(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cx("hb-card-footer", className)} {...props} />;
});

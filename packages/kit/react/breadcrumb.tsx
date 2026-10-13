"use client";
// 브레드크럼 — KRDS 「브레드크럼」 · shadcn Breadcrumb 과 같은 사용법
//   <Breadcrumb>
//     <BreadcrumbList>
//       <BreadcrumbItem home><BreadcrumbLink href="/">홈</BreadcrumbLink></BreadcrumbItem>
//       <BreadcrumbItem><BreadcrumbLink href="/civil">민원 안내</BreadcrumbLink></BreadcrumbItem>
//       <BreadcrumbItem><BreadcrumbPage>여권 발급</BreadcrumbPage></BreadcrumbItem>
//     </BreadcrumbList>
//   </Breadcrumb>
// 구분 화살표는 KRDS CSS 가 그린다(마지막 항목 제외). 현재 페이지는 aria-current="page".
import * as React from "react";
import { cx } from "./utils";

export const Breadcrumb = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(function Breadcrumb(
  { className, "aria-label": label = "현재 경로", ...props },
  ref,
) {
  return <nav ref={ref} aria-label={label} className={cx("krds-breadcrumb-wrap", className)} {...props} />;
});

export const BreadcrumbList = React.forwardRef<HTMLOListElement, React.OlHTMLAttributes<HTMLOListElement>>(function BreadcrumbList(
  { className, ...props },
  ref,
) {
  return <ol ref={ref} className={cx("breadcrumb", className)} {...props} />;
});

export interface BreadcrumbItemProps extends React.LiHTMLAttributes<HTMLLIElement> {
  /** 첫 항목(홈) — 집 아이콘이 붙는다 */
  home?: boolean;
}

export const BreadcrumbItem = React.forwardRef<HTMLLIElement, BreadcrumbItemProps>(function BreadcrumbItem(
  { home, className, ...props },
  ref,
) {
  return <li ref={ref} className={cx(home && "home", className)} {...props} />;
});

export const BreadcrumbLink = React.forwardRef<HTMLAnchorElement, React.AnchorHTMLAttributes<HTMLAnchorElement>>(function BreadcrumbLink(
  { className, ...props },
  ref,
) {
  return <a ref={ref} className={cx("txt", className)} {...props} />;
});

export const BreadcrumbPage = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(function BreadcrumbPage(
  { className, ...props },
  ref,
) {
  return <span ref={ref} aria-current="page" className={cx("txt", className)} {...props} />;
});

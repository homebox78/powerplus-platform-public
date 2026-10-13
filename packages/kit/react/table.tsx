"use client";
// 표 — KRDS 「표」 · shadcn Table 과 같은 사용법
//   <Table>
//     <TableCaption>2026년 민원 처리 현황 — 구분·접수·처리·처리율로 구성</TableCaption>
//     <TableHeader><TableRow><TableHead>구분</TableHead>…</TableRow></TableHeader>
//     <TableBody><TableRow><TableHead scope="row">여권</TableHead><TableCell align="right">1,204</TableCell></TableRow></TableBody>
//   </Table>
//
// 정렬 규칙(홈박스): 머리칸은 가운데(기본), 길이가 들쭉날쭉한 글은 왼쪽(기본),
// 비교하는 숫자는 align="right", 짧은 값·날짜·상태는 align="center".
// 캡션은 KRDS 처럼 화면에서 숨기고 읽어 준다 — 보이게 하려면 <TableCaption visible>.
import * as React from "react";
import { cx } from "./utils";

export type TableAlign = "left" | "center" | "right";
const alignClass = (a?: TableAlign) => (a ? `hb-align-${a}` : undefined);

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  /** 좁은 화면에서 가로로 넘긴다 */
  scroll?: boolean;
  /** 바깥 감싸개(.krds-table-wrap)에 붙일 클래스 */
  wrapClassName?: string;
}

export const Table = React.forwardRef<HTMLTableElement, TableProps>(function Table(
  { scroll, wrapClassName, className, ...props },
  ref,
) {
  return (
    <div className={cx("krds-table-wrap", scroll && "scroll", wrapClassName)}>
      <table ref={ref} className={cx("tbl", "col", "data", "hb-table", className)} {...props} />
    </div>
  );
});

export interface TableCaptionProps extends React.HTMLAttributes<HTMLTableCaptionElement> {
  /** 캡션을 화면에도 보인다(기본: 숨기고 읽어 주기만) */
  visible?: boolean;
}

export const TableCaption = React.forwardRef<HTMLTableCaptionElement, TableCaptionProps>(function TableCaption(
  { visible, className, ...props },
  ref,
) {
  return <caption ref={ref} className={cx(visible && "hb-caption-visible", className)} {...props} />;
});

export const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  function TableHeader(props, ref) {
    return <thead ref={ref} {...props} />;
  },
);

export const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  function TableBody(props, ref) {
    return <tbody ref={ref} {...props} />;
  },
);

export const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  function TableFooter({ className, ...props }, ref) {
    return <tfoot ref={ref} className={cx("hb-tfoot", className)} {...props} />;
  },
);

export interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  /** 선택된 행(배경 강조 + aria-selected) */
  selected?: boolean;
}

export const TableRow = React.forwardRef<HTMLTableRowElement, TableRowProps>(function TableRow(
  { selected, className, ...props },
  ref,
) {
  return (
    <tr
      ref={ref}
      aria-selected={selected || undefined}
      className={cx(selected && "hb-row-selected", className)}
      {...props}
    />
  );
});

export interface TableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  align?: TableAlign;
}

/** 머리칸 <th>. 열 머리는 scope="col"(기본), 행 머리는 scope="row" */
export const TableHead = React.forwardRef<HTMLTableCellElement, TableHeadProps>(function TableHead(
  { align, scope = "col", className, ...props },
  ref,
) {
  return <th ref={ref} scope={scope} className={cx(alignClass(align), className)} {...props} />;
});

export interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  align?: TableAlign;
}

export const TableCell = React.forwardRef<HTMLTableCellElement, TableCellProps>(function TableCell(
  { align, className, ...props },
  ref,
) {
  return <td ref={ref} className={cx(alignClass(align), className)} {...props} />;
});

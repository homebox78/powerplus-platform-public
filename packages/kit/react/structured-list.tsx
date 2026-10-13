"use client";
// 구조화 목록 — KRDS 「구조화 목록」(카드형 structured_list · 표형 structured_list_table)
//
// 카드형
//   <StructuredList>
//     <StructuredListItem
//       href="/support/1" title="청년 월세 한시 특별지원" badge={<span className="krds-badge bg-light-primary">접수중</span>}
//       description="만 19~34세 무주택 청년에게 월 최대 20만 원을 12개월 지원합니다."
//       meta={[{ label: "신청 기간", value: "2026.09.01 ~ 2026.10.31" }]} tags={["주거", "청년"]}
//       action={<Button variant="secondary" asChild><a href="/apply">신청하기</a></Button>}
//     />
//   </StructuredList>
//
// 표형 — 위 도구 줄(전체선택·버튼·정렬) + <Table> 또는 <DataTable> + 페이지 나눔
//   <StructuredListTable>
//     <StructuredListToolbar sort={<StructuredListSort options={["관련도순","최신순"]} value={s} onValueChange={setS} />}>…</StructuredListToolbar>
//     <Table>…</Table>
//   </StructuredListTable>
import * as React from "react";
import { cx } from "./utils";

export interface StructuredListProps extends React.HTMLAttributes<HTMLUListElement> {
  /** 카드 크기 — 제목 글자와 안쪽 여백 */
  size?: "small" | "medium" | "large";
  /** 한 줄에 하나씩(가로 가득) */
  full?: boolean;
}

export const StructuredList = React.forwardRef<HTMLUListElement, StructuredListProps>(function StructuredList(
  { size = "medium", full, className, ...props },
  ref,
) {
  return (
    <ul
      ref={ref}
      className={cx("krds-structured-list", size === "small" && "sm", size === "large" && "lg", full && "type-full", className)}
      {...props}
    />
  );
});

export interface StructuredListMeta {
  label: string;
  value: string;
}

export interface StructuredListItemProps extends Omit<React.LiHTMLAttributes<HTMLLIElement>, "title"> {
  title: React.ReactNode;
  /** 제목·설명을 감싸는 링크 주소 */
  href?: string;
  description?: React.ReactNode;
  meta?: StructuredListMeta[];
  tags?: string[];
  /** 카드 위 뱃지 */
  badge?: React.ReactNode;
  /** 본문 오른쪽 아래 버튼(신청하기 등) */
  action?: React.ReactNode;
  /** 카드 오른쪽 위 작은 버튼들(공유·찜) */
  buttons?: React.ReactNode;
}

export const StructuredListItem = React.forwardRef<HTMLLIElement, StructuredListItemProps>(function StructuredListItem(
  { title, href, description, meta, tags, badge, action, buttons, className, ...props },
  ref,
) {
  const text = (
    <>
      <p className="c-tit">
        <span className="span">{title}</span>
      </p>
      {description && <p className="c-txt">{description}</p>}
      {meta?.map((m) => (
        <p className="c-date" key={m.label}>
          <strong className="key">{m.label}</strong>
          <span className="value">{m.value}</span>
        </p>
      ))}
    </>
  );
  return (
    <li ref={ref} className={cx("structured-item", className)} {...props}>
      <div className="in">
        {badge && <div className="card-top">{badge}</div>}
        <div className="card-body">
          {href ? (
            <a href={href} className="c-text">
              {text}
            </a>
          ) : (
            <div className="c-text hb-sl-static">{text}</div>
          )}
          {action && <div className="c-btn">{action}</div>}
        </div>
        {tags && tags.length > 0 && (
          <div className="card-btm">
            {tags.map((t) => (
              <span className="tag" key={t}>
                {t}
              </span>
            ))}
          </div>
        )}
        {buttons && <div className="card-btn">{buttons}</div>}
      </div>
    </li>
  );
});

export const StructuredListTable = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function StructuredListTable({ className, ...props }, ref) {
    return <div ref={ref} className={cx("krds-structured-list-table", "hb-sl-table", className)} {...props} />;
  },
);

export interface StructuredListToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 오른쪽 정렬 영역(StructuredListSort 등) */
  sort?: React.ReactNode;
}

/** 목록 위 도구 줄 — 왼쪽(children: 전체선택·핵심 버튼) · 오른쪽(sort) */
export const StructuredListToolbar = React.forwardRef<HTMLDivElement, StructuredListToolbarProps>(
  function StructuredListToolbar({ sort, className, children, ...props }, ref) {
    return (
      <div ref={ref} className={cx("search-list-top", "hb-sl-toolbar", className)} {...props}>
        <div className="sch-left">{children}</div>
        {sort && <div className="sch-sort hb-sl-right">{sort}</div>}
      </div>
    );
  },
);

export interface StructuredListSortProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  options: string[];
  value: string;
  onValueChange: (v: string) => void;
  label?: string;
}

/** 정렬 기준 버튼 묶음 — 누른 버튼은 aria-pressed="true" */
export function StructuredListSort({ options, value, onValueChange, label = "정렬기준", className, ...props }: StructuredListSortProps) {
  return (
    <div className={cx("hb-sl-sort", className)} role="group" aria-label={label} {...props}>
      <strong className="sort-label" aria-hidden="true">
        {label}
      </strong>
      <div className="w-sort-btn">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            className={cx(o === value && "active")}
            aria-pressed={o === value}
            onClick={() => onValueChange(o)}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

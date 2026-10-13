"use client";
// 페이지네이션 — KRDS 「페이지네이션」
//   <Pagination page={4} total={99} onPageChange={setPage} />            ← 버튼(같은 화면에서 목록만 바꿀 때)
//   <Pagination page={4} total={99} getHref={(p) => `?page=${p}`} />     ← 링크(주소가 바뀔 때)
// 1쪽·끝쪽은 항상 보이고, 현재 쪽 좌우 siblings 개를 보여 준 뒤 사이는 말줄임(…)으로 줄인다.
// 작은 화면(767px 이하)에서는 mobileSiblings(기본 1) 로 줄여 말줄임 포함 최대 7개만 보인다.
// 현재 쪽: aria-current="page" + 화면 밖 글자 "현재페이지". 첫·끝에서 이전·다음은 비활성.
import * as React from "react";
import { cx } from "./utils";

export type PaginationEntry = number | "dots";

/** 보여 줄 쪽 번호 목록을 만든다 (dots = 말줄임) */
export function paginationRange(page: number, total: number, siblings = 2): PaginationEntry[] {
  const width = siblings * 2 + 1;
  if (total <= width + 2) return Array.from({ length: Math.max(total, 1) }, (_, i) => i + 1);
  let start = Math.max(2, page - siblings);
  let end = Math.min(total - 1, page + siblings);
  if (page - siblings <= 2) end = Math.min(total - 1, width + 1);
  if (page + siblings >= total - 1) start = Math.max(2, total - width);
  const out: PaginationEntry[] = [1];
  if (start > 2) out.push("dots");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < total - 1) out.push("dots");
  out.push(total);
  return out;
}

export interface PaginationProps extends Omit<React.HTMLAttributes<HTMLElement>, "onChange"> {
  /** 현재 쪽 (1부터) */
  page: number;
  /** 전체 쪽 수 */
  total: number;
  /** 쪽을 고르면 부른다 — 있으면 링크여도 기본 이동을 막는다 */
  onPageChange?: (page: number) => void;
  /** 쪽 주소를 만든다 — 주면 <a>, 없으면 <button> */
  getHref?: (page: number) => string;
  /** 현재 쪽 좌우로 보여 줄 번호 수 (기본 2, 최대 3) */
  siblings?: number;
  /** 작은 화면(767px 이하)에서 쓸 좌우 번호 수 — 기본 1(말줄임 포함 최대 7개). 끄려면 siblings 와 같은 값 */
  mobileSiblings?: number;
}

/** 작은 화면 여부 — 서버 렌더와 첫 그리기는 넓은 화면으로 보고 마운트 뒤에 맞춘다 */
function useSmallScreen() {
  const [small, setSmall] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setSmall(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return small;
}

export const Pagination = React.forwardRef<HTMLElement, PaginationProps>(function Pagination(
  { page, total, onPageChange, getHref, siblings = 2, mobileSiblings = 1, className, "aria-label": label = "페이지 이동", ...props },
  ref,
) {
  const small = useSmallScreen();
  const near = Math.max(0, Math.min(3, small ? Math.min(mobileSiblings, siblings) : siblings));
  const go = (p: number) => (e: React.MouseEvent) => {
    if (!onPageChange) return;
    e.preventDefault();
    onPageChange(p);
  };
  const nav = (to: number, dir: "prev" | "next", text: string) => {
    const off = dir === "prev" ? page <= 1 : page >= total;
    if (off) return <span className={cx("page-navi", dir, "disabled")} aria-disabled="true">{text}</span>;
    return getHref ? (
      <a className={cx("page-navi", dir)} href={getHref(to)} onClick={go(to)}>{text}</a>
    ) : (
      <button type="button" className={cx("page-navi", dir)} onClick={go(to)}>{text}</button>
    );
  };
  return (
    <nav ref={ref} aria-label={label} className={cx("krds-pagination", className)} {...props}>
      {nav(page - 1, "prev", "이전")}
      <div className="page-links">
        {paginationRange(page, total, near).map((p, i) => {
          if (p === "dots") return <span key={`d${i}`} className="page-link link-dot" aria-hidden="true" />;
          const on = p === page;
          const body = (
            <>
              {on && <span className="sr-only">현재페이지 </span>}
              {p}
            </>
          );
          return getHref ? (
            <a key={p} className={cx("page-link", on && "active")} href={getHref(p)} aria-current={on ? "page" : undefined} onClick={go(p)}>
              {body}
            </a>
          ) : (
            <button key={p} type="button" className={cx("page-link", on && "active")} aria-current={on ? "page" : undefined} onClick={go(p)}>
              {body}
            </button>
          );
        })}
      </div>
      {nav(page + 1, "next", "다음")}
    </nav>
  );
});

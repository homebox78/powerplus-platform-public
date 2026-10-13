"use client";
// 데이터 표 — shadcn Data Table 을 KRDS 표 모양으로. 머리칸 눌러 정렬 · 행 선택 · 페이지 나눔.
//   <DataTable
//     caption="민원 신청 목록 — 접수번호·민원명·접수일·처리 상태로 구성"
//     columns={[
//       { key: "no", header: "접수번호", align: "center", sortable: true },
//       { key: "title", header: "민원명", rowHeader: true },
//       { key: "fee", header: "수수료(원)", align: "right", sortable: true, cell: (r) => r.fee.toLocaleString() },
//     ]}
//     data={rows} rowKey={(r) => r.no} selectable pageSize={5}
//   />
//
// 접근성: 정렬되는 열의 머리칸은 <button> 이고 <th aria-sort> 가 현재 정렬을 알린다.
// 선택 체크박스는 KRDS 체크 모양(.krds-form-check)에 "행 이름 선택" 레이블을 숨겨 둔다.
// 선택 개수·페이지 이동은 aria-live 로 읽어 준다. 페이지 이동은 KRDS 페이지네이션 모양(버튼).
import * as React from "react";
import { cx, useUid } from "./utils";
import type { TableAlign } from "./table";

export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  /** 칸 정렬 — 숫자 비교는 right, 짧은 값·날짜·상태는 center, 긴 글은 left(기본) */
  align?: TableAlign;
  sortable?: boolean;
  /** <col> 너비 (예: "120px", "20%") */
  width?: string;
  /** 칸 내용 — 없으면 row[key] */
  cell?: (row: T) => React.ReactNode;
  /** 정렬 기준값 — 없으면 row[key] */
  sortValue?: (row: T) => string | number;
  /** 이 열을 행 머리(<th scope="row">)로 */
  rowHeader?: boolean;
}

export type DataTableSortDir = "ascending" | "descending";
export interface DataTableSort {
  key: string;
  dir: DataTableSortDir;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  /** 표 설명(화면에 숨김) — 무엇이 어떤 열로 구성되는지 */
  caption: string;
  rowKey: (row: T) => string;
  /** 체크 레이블에 쓸 행 이름 — 없으면 첫 행 머리 열 값 */
  rowLabel?: (row: T) => string;
  selectable?: boolean;
  selected?: string[];
  defaultSelected?: string[];
  onSelectedChange?: (keys: string[]) => void;
  /** 한 페이지 행 수 (0 이면 나누지 않음) */
  pageSize?: number;
  defaultSort?: DataTableSort;
  /** 자료가 없을 때 문구 */
  emptyText?: string;
  className?: string;
}

const valueOf = <T,>(c: DataTableColumn<T>, row: T): string | number => {
  if (c.sortValue) return c.sortValue(row);
  const v = (row as Record<string, unknown>)[c.key];
  return typeof v === "number" ? v : String(v ?? "");
};

export function DataTable<T>({
  columns,
  data,
  caption,
  rowKey,
  rowLabel,
  selectable,
  selected,
  defaultSelected = [],
  onSelectedChange,
  pageSize = 10,
  defaultSort,
  emptyText = "조회된 자료가 없습니다.",
  className,
}: DataTableProps<T>) {
  const base = useUid("hb-dt");
  const [sort, setSort] = React.useState<DataTableSort | undefined>(defaultSort);
  const [page, setPage] = React.useState(1);
  const [innerSel, setInnerSel] = React.useState<string[]>(defaultSelected);
  const sel = selected ?? innerSel;
  const setSel = (keys: string[]) => {
    if (selected === undefined) setInnerSel(keys);
    onSelectedChange?.(keys);
  };

  const sorted = React.useMemo(() => {
    if (!sort) return data;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return data;
    const out = [...data].sort((a, b) => {
      const x = valueOf(col, a);
      const y = valueOf(col, b);
      const r = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "ko");
      return sort.dir === "ascending" ? r : -r;
    });
    return out;
  }, [data, columns, sort]);

  const pages = pageSize > 0 ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const cur = Math.min(page, pages);
  const rows = pageSize > 0 ? sorted.slice((cur - 1) * pageSize, cur * pageSize) : sorted;
  const pageKeys = rows.map(rowKey);
  const pageOn = pageKeys.filter((k) => sel.includes(k)).length;
  const allRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = pageOn > 0 && pageOn < pageKeys.length;
  }, [pageOn, pageKeys.length]);

  const headerCol = columns.find((c) => c.rowHeader) ?? columns[0];
  const labelOf = (row: T) => (rowLabel ? rowLabel(row) : String(valueOf(headerCol, row)));

  const toggleSort = (key: string) => {
    setSort((s) => (s?.key === key ? { key, dir: s.dir === "ascending" ? "descending" : "ascending" } : { key, dir: "ascending" }));
    setPage(1);
  };
  const toggleAll = () =>
    setSel(pageOn === pageKeys.length ? sel.filter((k) => !pageKeys.includes(k)) : [...new Set([...sel, ...pageKeys])]);
  const toggleRow = (k: string) => setSel(sel.includes(k) ? sel.filter((x) => x !== k) : [...sel, k]);

  const [live, setLive] = React.useState("");
  const go = (p: number) => {
    setPage(p);
    setLive(`${p}페이지 / 전체 ${pages}페이지`);
  };

  return (
    <div className={cx("hb-data-table", className)}>
      <div className="hb-dt-status">
        <span>
          전체 <strong>{data.length.toLocaleString()}</strong>건
          {selectable && (
            <>
              {" · "}선택 <strong>{sel.length}</strong>건
            </>
          )}
        </span>
        <span className="sr-only" aria-live="polite">
          {live || (selectable ? `${sel.length}건 선택됨` : "")}
        </span>
      </div>
      <div className="krds-table-wrap">
        <table className="tbl col data hb-table">
          <caption>{caption}</caption>
          <colgroup>
            {selectable && <col style={{ width: "64px" }} />}
            {columns.map((c) => (
              <col key={c.key} style={c.width ? { width: c.width } : undefined} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {selectable && (
                <th scope="col" className="hb-align-center hb-dt-check">
                  <div className="krds-form-check medium">
                    <input
                      ref={allRef}
                      type="checkbox"
                      id={`${base}-all`}
                      checked={pageKeys.length > 0 && pageOn === pageKeys.length}
                      onChange={toggleAll}
                      disabled={pageKeys.length === 0}
                    />
                    <label htmlFor={`${base}-all`}>
                      <span className="sr-only">이 페이지 전체 선택</span>
                    </label>
                  </div>
                </th>
              )}
              {columns.map((c) => {
                const on = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={c.sortable ? (on ? sort!.dir : "none") : undefined}
                  >
                    {c.sortable ? (
                      <button
                        type="button"
                        className={cx("hb-sort-btn", on && `is-${sort!.dir}`)}
                        onClick={() => toggleSort(c.key)}
                      >
                        {c.header}
                        <span className="hb-sort-ico" aria-hidden="true" />
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)} className="hb-align-center hb-dt-empty">
                  {emptyText}
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const k = rowKey(row);
              const on = sel.includes(k);
              return (
                <tr key={k} aria-selected={selectable ? on : undefined} className={cx(on && "hb-row-selected")}>
                  {selectable && (
                    <td className="hb-align-center hb-dt-check">
                      <div className="krds-form-check medium">
                        <input type="checkbox" id={`${base}-${k}`} checked={on} onChange={() => toggleRow(k)} />
                        <label htmlFor={`${base}-${k}`}>
                          <span className="sr-only">{labelOf(row)} 선택</span>
                        </label>
                      </div>
                    </td>
                  )}
                  {columns.map((c) => {
                    const content = c.cell ? c.cell(row) : String((row as Record<string, unknown>)[c.key] ?? "");
                    const cls = c.align ? `hb-align-${c.align}` : undefined;
                    return c.rowHeader ? (
                      <th key={c.key} scope="row" className={cls}>
                        {content}
                      </th>
                    ) : (
                      <td key={c.key} className={cls}>
                        {content}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav className="krds-pagination hb-dt-pages" aria-label="표 페이지">
          <button type="button" className={cx("page-navi", "prev", cur === 1 && "disabled")} disabled={cur === 1} onClick={() => go(cur - 1)}>
            이전
          </button>
          <div className="page-links">
            {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                type="button"
                className={cx("page-link", p === cur && "active")}
                aria-current={p === cur ? "page" : undefined}
                onClick={() => go(p)}
              >
                {p === cur && <span className="sr-only">현재페이지 </span>}
                {p}
              </button>
            ))}
          </div>
          <button type="button" className={cx("page-navi", "next", cur === pages && "disabled")} disabled={cur === pages} onClick={() => go(cur + 1)}>
            다음
          </button>
        </nav>
      )}
    </div>
  );
}

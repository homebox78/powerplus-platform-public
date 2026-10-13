"use client";
// 달력 — KRDS 「달력」(calendar · calendar_range) · shadcn Calendar 와 같은 사용법
//   <Calendar selected={day} onSelect={setDay} />                          하루 고르기
//   <Calendar mode="range" selected={range} onSelect={setRange} />         기간 고르기({ from, to })
//   <Calendar disabled={(d) => d.getDay() === 0} footer={…} />            고를 수 없는 날 · 아래 버튼 줄
//
// 키보드(WAI-ARIA 날짜 선택 패턴): 날짜 칸은 하나만 Tab 으로 들어간다.
//   ←/→ 하루 · ↑/↓ 한 주 · Home/End 그 주 처음/끝 · PageUp/PageDown 한 달(Shift 는 한 해) · Enter/Space 선택.
// 달이 바뀌면 "2026년 9월" 을 읽어 준다. 연·월 목록은 Esc 로 닫고 버튼으로 돌아간다.
// 고를 수 없는 날은 disabled 대신 aria-disabled — 방향키로 지나갈 수 있어야 하기 때문.
import * as React from "react";
import { cx } from "./utils";
import {
  WEEKDAYS,
  addMonths,
  dateKey,
  monthGrid,
  moveByKey,
  nextRange,
  sameDay,
  sameMonth,
  speakDate,
  startOfDay,
  type DateRange,
} from "./date-utils";

export type { DateRange as CalendarRange };

interface CalendarBaseProps {
  /** 처음 보여 줄 달(없으면 선택한 날 또는 오늘) */
  defaultMonth?: Date;
  /** 고를 수 없는 날 */
  disabled?: (d: Date) => boolean;
  /** 아래 버튼 줄(오늘·취소·확인 등) */
  footer?: React.ReactNode;
  /** 열리자마자 날짜 칸에 포커스 */
  autoFocus?: boolean;
  /** 연도 목록 범위 */
  fromYear?: number;
  toYear?: number;
  className?: string;
  "aria-label"?: string;
}
export interface CalendarSingleProps extends CalendarBaseProps {
  mode?: "single";
  selected?: Date | null;
  onSelect?: (d: Date) => void;
}
export interface CalendarRangeProps extends CalendarBaseProps {
  mode: "range";
  selected?: DateRange | null;
  onSelect?: (r: DateRange) => void;
}
export type CalendarProps = CalendarSingleProps | CalendarRangeProps;

export function Calendar(props: CalendarProps) {
  const { defaultMonth, disabled, footer, autoFocus, className, "aria-label": label = "달력" } = props;
  const range = props.mode === "range";
  const today = startOfDay(new Date());

  // 선택값(바깥에서 안 주면 안에서 기억)
  const [innerSingle, setInnerSingle] = React.useState<Date | null>(null);
  const [innerRange, setInnerRange] = React.useState<DateRange | null>(null);
  const single = !range ? (props.selected !== undefined ? props.selected : innerSingle) : null;
  const rng = range ? (props.selected !== undefined ? props.selected : innerRange) : null;

  const anchor = single ?? rng?.from ?? defaultMonth ?? today;
  const [month, setMonth] = React.useState(() => new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  const [focus, setFocus] = React.useState<Date>(() => startOfDay(anchor));
  const [drop, setDrop] = React.useState<"year" | "month" | null>(null);
  const grid = React.useRef<HTMLTableSectionElement>(null);
  const moveFocus = React.useRef(!!autoFocus);
  const switchRefs = { year: React.useRef<HTMLButtonElement>(null), month: React.useRef<HTMLButtonElement>(null) };
  const listRef = React.useRef<HTMLUListElement>(null);

  React.useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    grid.current?.querySelector<HTMLButtonElement>(`[data-date="${dateKey(focus)}"]`)?.focus();
  }, [focus, month]);

  React.useEffect(() => {
    if (drop) listRef.current?.querySelector<HTMLButtonElement>(".active, button")?.focus();
  }, [drop]);

  const y = month.getFullYear();
  const fromYear = props.fromYear ?? y - 10;
  const toYear = props.toYear ?? y + 10;

  const showMonth = (m: Date, keepFocus = false) => {
    const first = new Date(m.getFullYear(), m.getMonth(), 1);
    setMonth(first);
    if (!keepFocus) setFocus((f) => new Date(first.getFullYear(), first.getMonth(), Math.min(f.getDate(), new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate())));
  };

  const pick = (d: Date) => {
    if (disabled?.(d)) return;
    setFocus(d);
    if (!sameMonth(d, month)) showMonth(d, true);
    if (props.mode === "range") {
      const r = nextRange(rng, d);
      if (props.selected === undefined) setInnerRange(r);
      props.onSelect?.(r);
    } else {
      if (props.selected === undefined) setInnerSingle(d);
      props.onSelect?.(d);
    }
  };

  const onGridKey = (e: React.KeyboardEvent) => {
    const next = moveByKey(focus, e.key, e.shiftKey);
    if (!next) return;
    e.preventDefault();
    moveFocus.current = true;
    setFocus(next);
    if (!sameMonth(next, month)) showMonth(next, true);
  };

  const closeDrop = (which: "year" | "month") => {
    setDrop(null);
    switchRefs[which].current?.focus();
  };

  const inRange = (d: Date) => {
    if (!rng?.from) return false;
    const to = rng.to ?? rng.from;
    return d >= rng.from && d <= to;
  };

  return (
    <div className={cx("krds-calendar-area", "active", "hb-calendar", className)}>
      <div className={cx("calendar-wrap", !range && "single")} role="group" aria-label={label}>
        <div className="calendar-head">
          <button type="button" className="btn-cal-move prev" onClick={() => showMonth(addMonths(month, -1))}>
            <span className="sr-only">이전 달</span>
          </button>
          <div className="calendar-switch-wrap">
            {(["year", "month"] as const).map((which) => {
              const open = drop === which;
              const items =
                which === "year"
                  ? Array.from({ length: toYear - fromYear + 1 }, (_, i) => fromYear + i)
                  : Array.from({ length: 12 }, (_, i) => i);
              return (
                <div
                  key={which}
                  className="calendar-drop-down"
                  onBlur={(e) => {
                    if (open && !e.currentTarget.contains(e.relatedTarget as Node)) setDrop(null);
                  }}
                >
                  <button
                    ref={switchRefs[which]}
                    type="button"
                    className={cx("btn-cal-switch", which, open && "active")}
                    aria-expanded={open}
                    aria-haspopup="true"
                    aria-label={which === "year" ? `연도 선택, ${y}년` : `월 선택, ${month.getMonth() + 1}월`}
                    onClick={() => setDrop(open ? null : which)}
                  >
                    {which === "year" ? `${y}년` : `${month.getMonth() + 1}월`}
                  </button>
                  <div className={cx("calendar-select", which === "year" ? "calendar-year-wrap" : "calendar-mon-wrap", open && "active")}>
                    {open && (
                      <ul
                        ref={listRef}
                        className={cx("sel", which)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.stopPropagation();
                            closeDrop(which);
                          }
                        }}
                      >
                        {items.map((v) => {
                          const on = which === "year" ? v === y : v === month.getMonth();
                          return (
                            <li key={v}>
                              <button
                                type="button"
                                className={cx(on && "active")}
                                aria-current={on ? "true" : undefined}
                                onClick={() => {
                                  showMonth(which === "year" ? new Date(v, month.getMonth(), 1) : new Date(y, v, 1));
                                  closeDrop(which);
                                }}
                              >
                                {which === "year" ? `${v}년` : `${String(v + 1).padStart(2, "0")}월`}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <button type="button" className="btn-cal-move next" onClick={() => showMonth(addMonths(month, 1))}>
            <span className="sr-only">다음 달</span>
          </button>
        </div>
        <p className="sr-only" aria-live="polite">
          {y}년 {month.getMonth() + 1}월
        </p>
        <div className="calendar-body">
          <div className="calendar-table-wrap">
            <table className="calendar-tbl">
              <caption>
                {y}년 {month.getMonth() + 1}월
              </caption>
              <thead>
                <tr>
                  {WEEKDAYS.map((w) => (
                    <th key={w} scope="col">
                      <abbr title={`${w}요일`}>{w}</abbr>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody ref={grid} onKeyDown={onGridKey}>
                {monthGrid(month).map((week) => (
                  <tr key={dateKey(week[0])}>
                    {week.map((d) => {
                      const off = disabled?.(d) ?? false;
                      const other = !sameMonth(d, month);
                      const isToday = sameDay(d, today);
                      const sel = range ? inRange(d) : sameDay(d, single);
                      const isStart = range ? sameDay(d, rng?.from) : sel;
                      const isEnd = range ? sameDay(d, rng?.to ?? rng?.from) : sel;
                      const note = [isToday && "오늘", range && isStart && "시작일", range && isEnd && !isStart && "종료일", range && sel && !isStart && !isEnd && "선택 기간", off && "선택 불가"]
                        .filter(Boolean)
                        .join(", ");
                      return (
                        <td
                          key={dateKey(d)}
                          className={cx(
                            other && (d < month ? "old" : "new"),
                            d.getDay() === 0 && "day-off",
                            isToday && "today",
                            off && "disabled",
                            sel && "period",
                            sel && isStart && "start",
                            sel && isEnd && "end",
                          )}
                        >
                          <button
                            type="button"
                            className="btn-set-date"
                            data-date={dateKey(d)}
                            tabIndex={sameDay(d, focus) ? 0 : -1}
                            aria-pressed={isStart || isEnd}
                            aria-disabled={off || undefined}
                            aria-current={isToday ? "date" : undefined}
                            aria-label={speakDate(d) + (note ? `, ${note}` : "")}
                            onClick={() => pick(d)}
                          >
                            <span>{d.getDate()}</span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {footer && (
          <div className="calendar-footer">
            <div className="calendar-btn-wrap">{footer}</div>
          </div>
        )}
      </div>
    </div>
  );
}

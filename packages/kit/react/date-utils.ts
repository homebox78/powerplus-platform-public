// 달력·날짜 선택 공통 계산 (React·Vue 판이 같은 규칙을 쓴다 — vue/date-utils.ts 와 내용이 같다)
// 날짜는 항상 "그 날 0시(현지)" Date 로 다룬다.

export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** 달을 옮기되 날짜는 그 달 마지막 날을 넘지 않게 */
export function addMonths(d: Date, n: number): Date {
  const last = new Date(d.getFullYear(), d.getMonth() + n + 1, 0).getDate();
  return new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), last));
}
export const sameDay = (a?: Date | null, b?: Date | null) =>
  !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
export const sameMonth = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
export const dateKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/** 그 달을 채우는 6주 × 7일 (앞뒤 달 날짜 포함, 일요일 시작) */
export function monthGrid(month: Date): Date[][] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = addDays(first, -first.getDay());
  return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i)));
}

const pad = (n: number) => String(n).padStart(2, "0");
/** 화면 표기 YYYY.MM.DD */
export const formatDate = (d?: Date | null) => (d ? `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}` : "");
/** 읽어 주는 표기 2026년 9월 25일 금요일 */
export const speakDate = (d: Date) => `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS[d.getDay()]}요일`;

/** 입력 글자 → 날짜. 2026.09.25 · 2026-9-25 · 20260925 를 받는다. 없는 날짜면 null */
export function parseDate(text: string): Date | null {
  const t = text.trim();
  const m = t.match(/^(\d{4})[.\-/\s]?(\d{1,2})[.\-/\s]?(\d{1,2})\.?$/);
  if (!m) return null;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  const out = new Date(y, mo - 1, d);
  return out.getFullYear() === y && out.getMonth() === mo - 1 && out.getDate() === d ? out : null;
}

export interface DateRange {
  from?: Date | null;
  to?: Date | null;
}

/** 기간 선택: 시작이 없거나 둘 다 있으면 새 시작, 아니면 끝(앞이면 뒤바꿈) */
export function nextRange(r: DateRange | null | undefined, d: Date): DateRange {
  if (!r?.from || r.to) return { from: d, to: null };
  return d < r.from ? { from: d, to: r.from } : { from: r.from, to: d };
}

/** 키보드 이동 — 누른 키에 맞는 다음 날짜 (해당 없으면 null) */
export function moveByKey(d: Date, key: string, shift: boolean): Date | null {
  switch (key) {
    case "ArrowLeft": return addDays(d, -1);
    case "ArrowRight": return addDays(d, 1);
    case "ArrowUp": return addDays(d, -7);
    case "ArrowDown": return addDays(d, 7);
    case "Home": return addDays(d, -d.getDay());
    case "End": return addDays(d, 6 - d.getDay());
    case "PageUp": return addMonths(d, shift ? -12 : -1);
    case "PageDown": return addMonths(d, shift ? 12 : 1);
    default: return null;
  }
}

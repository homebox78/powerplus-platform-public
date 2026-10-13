"use client";
// 날짜 입력 — KRDS 「날짜 입력(date_input)」의 입력 칸 + 달력 열기 버튼
//   <DateInput value={d} onValueChange={setD} onOpenCalendar={() => setOpen(true)} />
//   <DateInput precision="month" />            ← 연·월만(대략적인 날짜, 값 "YYYY-MM")
//   <DateRangeInput start={a} end={b} onStartChange={setA} onEndChange={setB} />
// 숫자만 쳐도 YYYY.MM.DD 로 점을 넣어 준다. 다 차고 올바른 날짜일 때만
// onValueChange 로 값("YYYY-MM-DD" · "YYYY-MM" · "YYYY")을 넘기고(아니면 "").
// 칸 아래 형식 안내(hint)를 기본으로 보이고, 틀린 날짜면 오류 문구를 띄워 둘 다 aria-describedby 로 잇는다.
// 달력(펼침)은 달력·날짜 선택기 부품이 맡는다 — 여기서는 onOpenCalendar 로 알린다.
import * as React from "react";
import { cx, josa } from "./utils";
import { useFieldControl } from "./field";

export type DatePrecision = "day" | "month" | "year";
const LEN: Record<DatePrecision, number> = { day: 10, month: 7, year: 4 };
const PLACEHOLDER: Record<DatePrecision, string> = { day: "YYYY.MM.DD", month: "YYYY.MM", year: "YYYY" };
const EXAMPLE: Record<DatePrecision, string> = { day: "2024.03.15", month: "2024.03", year: "2024" };

/** "20240315" · "2024.3.15" → "2024.03.15"(자라는 중이면 그대로). precision 만큼만 받는다 */
export function formatDateDigits(raw: string, precision: DatePrecision = "day"): string {
  const d = raw.replace(/\D/g, "").slice(0, precision === "day" ? 8 : precision === "month" ? 6 : 4);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}.${d.slice(4)}`;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}`;
}
/** "2024.03.15" → "2024-03-15" · "2024.03" → "2024-03" · "2024" → "2024", 날짜가 아니면 "" */
export function toIsoDate(text: string, precision: DatePrecision = "day"): string {
  if (precision === "year") return /^(1[89]|2\d)\d{2}$/.test(text) ? text : "";
  if (precision === "month") {
    const m = /^(\d{4})\.(\d{2})$/.exec(text);
    return m && +m[2] >= 1 && +m[2] <= 12 ? `${m[1]}-${m[2]}` : "";
  }
  const m = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(text);
  if (!m) return "";
  const [y, mo, da] = [+m[1], +m[2], +m[3]];
  const dt = new Date(y, mo - 1, da);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== da) return "";
  return `${m[1]}-${m[2]}-${m[3]}`;
}
const fromIso = (iso?: string) => (iso ? iso.replace(/-/g, ".") : "");

export interface DateInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "value" | "defaultValue" | "type" | "onChange"> {
  /** "YYYY-MM-DD" (precision 에 따라 "YYYY-MM" · "YYYY") */
  value?: string;
  defaultValue?: string;
  onValueChange?: (iso: string) => void;
  onOpenCalendar?: () => void;
  size?: "small" | "medium" | "large";
  invalid?: boolean;
  /** 받을 단위 — day(기본) · month(연·월) · year(연도만) */
  precision?: DatePrecision;
  /** 형식 안내 문구. false 면 숨긴다 (기본 "YYYY.MM.DD 형식으로 입력합니다. 예: 2024.03.15") */
  hint?: React.ReactNode | false;
  /** 틀린 날짜일 때 문구 */
  errorText?: React.ReactNode;
  /** 달력 버튼 이름 (기본 "달력 열기") */
  calendarLabel?: string;
}

export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(function DateInput(
  { value, defaultValue, onValueChange, onOpenCalendar, size = "large", invalid, precision = "day", hint, errorText, calendarLabel = "달력 열기", className, ...props },
  ref,
) {
  const [text, setText] = React.useState(fromIso(value ?? defaultValue));
  React.useEffect(() => {
    if (value !== undefined && toIsoDate(text, precision) !== value) setText(fromIso(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const errId = `${uid}-err`;
  const wrong = text.length === LEN[precision] && !toIsoDate(text, precision);
  const showHint = hint !== false;
  const describedBy = [props["aria-describedby"], showHint ? hintId : "", wrong ? errId : ""].filter(Boolean).join(" ") || undefined;
  const f = useFieldControl({ ...props, "aria-describedby": describedBy, invalid: invalid || wrong || undefined });
  return (
    <div className={cx("hb-date-input", className)}>
      <div className="calendar-input">
        <input
          ref={ref}
          type="text"
          inputMode="numeric"
          placeholder={PLACEHOLDER[precision]}
          maxLength={LEN[precision]}
          className={cx("krds-input datepicker", size)}
          value={text}
          onChange={(e) => {
            const t = formatDateDigits(e.target.value, precision);
            setText(t);
            const iso = toIsoDate(t, precision);
            if (iso || t === "") onValueChange?.(iso);
            else if (t.length === LEN[precision]) onValueChange?.("");
          }}
          {...props}
          {...f}
        />
        {precision === "day" && (
          <button type="button" className="krds-btn medium icon form-btn-datepicker" onClick={onOpenCalendar} disabled={f.disabled}>
            <span className="sr-only">{calendarLabel}</span>
            <i className="svg-icon ico-calendar" aria-hidden="true" />
          </button>
        )}
      </div>
      {showHint && (
        <p id={hintId} className="form-hint">
          {hint ?? `${PLACEHOLDER[precision]} 형식으로 입력합니다. 예: ${EXAMPLE[precision]}`}
        </p>
      )}
      {wrong && (
        <p id={errId} className="form-hint-invalid" role="alert">
          {errorText ?? `올바른 날짜가 아닙니다. ${PLACEHOLDER[precision]} 형식으로 다시 입력해 주세요.`}
        </p>
      )}
    </div>
  );
});

export interface DateRangeInputProps {
  start?: string;
  end?: string;
  onStartChange?: (iso: string) => void;
  onEndChange?: (iso: string) => void;
  onOpenCalendar?: (which: "start" | "end") => void;
  size?: "small" | "medium" | "large";
  /** 화면낭독용 이름 (기본 "시작일"·"종료일") */
  startLabel?: string;
  endLabel?: string;
  /** 두 칸 아래 한 번 보이는 형식 안내. false 면 숨긴다 */
  hint?: React.ReactNode | false;
  className?: string;
}

/** 기간 입력 — 시작일 ~ 종료일. 종료일이 시작일보다 앞서면 종료일 칸을 오류로 표시 */
export function DateRangeInput({
  start, end, onStartChange, onEndChange, onOpenCalendar, size = "large", startLabel = "시작일", endLabel = "종료일", hint, className,
}: DateRangeInputProps) {
  const reversed = !!start && !!end && end < start;
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const errId = `${uid}-err`;
  const showHint = hint !== false;
  const desc = showHint ? hintId : undefined;
  return (
    <div className={cx("hb-date-input", className)}>
      <ul className="hb-date-range">
        <li>
          <DateInput size={size} value={start} onValueChange={onStartChange} aria-label={startLabel} hint={false} aria-describedby={desc} calendarLabel={`${startLabel} 달력 열기`} onOpenCalendar={() => onOpenCalendar?.("start")} />
        </li>
        <li className="mark" aria-hidden="true">~</li>
        <li>
          <DateInput size={size} value={end} onValueChange={onEndChange} aria-label={endLabel} hint={false} aria-describedby={[desc, reversed ? errId : ""].filter(Boolean).join(" ") || undefined} invalid={reversed} calendarLabel={`${endLabel} 달력 열기`} onOpenCalendar={() => onOpenCalendar?.("end")} />
        </li>
      </ul>
      {showHint && <p id={hintId} className="form-hint">{hint ?? "YYYY.MM.DD 형식으로 입력합니다. 예: 2024.03.15"}</p>}
      {reversed && <p id={errId} className="form-hint-invalid" role="alert">{endLabel}{josa(endLabel, "이", "가")} {startLabel}보다 앞설 수 없습니다.</p>}
    </div>
  );
}

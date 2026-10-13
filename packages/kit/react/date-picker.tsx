"use client";
// 날짜 선택 — KRDS 「날짜 입력(달력)」 · shadcn Date Picker 와 같은 사용법 (입력칸 + 달력 팝오버)
//   <DatePicker label="방문 희망일" value={day} onValueChange={setDay} />
//   <DateRangePicker label="신청 기간" value={range} onValueChange={setRange} />
//
// 입력칸에 직접 쓰거나(2026.09.25 · 20260925) 달력 버튼으로 고른다. 없는 날짜면 오류 문구를 보인다.
// 달력은 radix Popover — 열리면 선택한 날(없으면 오늘) 칸에 포커스, Esc·취소로 닫으면 달력 버튼으로 돌아간다.
// 달력 안에서 고른 날은 [확인] 을 눌러야 입력칸에 들어간다(KRDS 달력 버튼 줄: 오늘 · 취소 · 확인).
import * as React from "react";
import { Popover } from "radix-ui";
import { cx, useUid } from "./utils";
import { Calendar } from "./calendar";
import { formatDate, parseDate, startOfDay, type DateRange } from "./date-utils";

interface PickerBase {
  label?: React.ReactNode;
  id?: string;
  /** 도움말(입력 형식 안내) */
  hint?: string;
  disabled?: (d: Date) => boolean;
  /** 처음부터 달력을 연 상태 */
  defaultOpen?: boolean;
  className?: string;
}

function Hint({ id, error, hint }: { id: string; error: boolean; hint: string }) {
  return (
    <p id={id} className={error ? "form-hint-invalid" : "form-hint"}>
      {error ? "없는 날짜입니다. YYYY.MM.DD 형식으로 입력해 주세요." : hint}
    </p>
  );
}

function PickerFooter({ onToday, onCancel, onOk }: { onToday: () => void; onCancel: () => void; onOk: () => void }) {
  return (
    <>
      <button type="button" className="krds-btn small text" onClick={onToday}>
        오늘
      </button>
      <button type="button" className="krds-btn small tertiary" onClick={onCancel}>
        취소
      </button>
      <button type="button" className="krds-btn small primary" onClick={onOk}>
        확인
      </button>
    </>
  );
}

const CalendarButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  function CalendarButton(props, ref) {
    return (
      <button ref={ref} type="button" className="krds-btn medium icon form-btn-datepicker" {...props}>
        <span className="sr-only">달력 열기</span>
        <i className="svg-icon ico-calendar" aria-hidden="true" />
      </button>
    );
  },
);

export interface DatePickerProps extends PickerBase {
  value?: Date | null;
  defaultValue?: Date | null;
  onValueChange?: (d: Date | null) => void;
  placeholder?: string;
}

export function DatePicker({
  label,
  id,
  hint = "YYYY.MM.DD 형식으로 입력하거나 달력에서 고르세요.",
  disabled,
  defaultOpen,
  className,
  value,
  defaultValue = null,
  onValueChange,
  placeholder = "YYYY.MM.DD",
}: DatePickerProps) {
  const auto = useUid("hb-dp");
  const inputId = id ?? auto;
  const [inner, setInner] = React.useState<Date | null>(defaultValue);
  const cur = value !== undefined ? value : inner;
  const [text, setText] = React.useState(formatDate(cur));
  const [error, setError] = React.useState(false);
  const [open, setOpen] = React.useState(!!defaultOpen);
  const [pending, setPending] = React.useState<Date | null>(cur);

  React.useEffect(() => setText(formatDate(cur)), [cur]);

  const set = (d: Date | null) => {
    if (value === undefined) setInner(d);
    onValueChange?.(d);
    setText(formatDate(d));
    setError(false);
  };
  const commit = () => {
    if (!text.trim()) return set(null);
    const d = parseDate(text);
    if (d) set(d);
    else setError(true);
  };
  const onOpen = (o: boolean) => {
    if (o) setPending(cur);
    setOpen(o);
  };

  return (
    <div className={cx("form-group", "hb-date-picker", className)}>
      {label && (
        <div className="form-tit">
          <label htmlFor={inputId}>{label}</label>
        </div>
      )}
      <div className={cx("form-conts", "calendar-conts", error && "is-error")}>
        <Popover.Root open={open} onOpenChange={onOpen}>
          <Popover.Anchor asChild>
            <div className="calendar-input">
              <input
                id={inputId}
                type="text"
                inputMode="numeric"
                className="krds-input datepicker"
                placeholder={placeholder}
                value={text}
                aria-invalid={error || undefined}
                aria-describedby={`${inputId}-hint`}
                onChange={(e) => setText(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => e.key === "Enter" && commit()}
              />
              <Popover.Trigger asChild>
                <CalendarButton />
              </Popover.Trigger>
            </div>
          </Popover.Anchor>
          <Popover.Portal>
            <Popover.Content
              className="hb-kit hb-date-pop"
              align="start"
              sideOffset={8}
              aria-label="날짜 고르기"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <Calendar
                autoFocus
                selected={pending}
                onSelect={setPending}
                disabled={disabled}
                footer={
                  <PickerFooter
                    onToday={() => setPending(startOfDay(new Date()))}
                    onCancel={() => setOpen(false)}
                    onOk={() => {
                      set(pending);
                      setOpen(false);
                    }}
                  />
                }
              />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
      <Hint id={`${inputId}-hint`} error={error} hint={hint} />
    </div>
  );
}

export interface DateRangePickerProps extends PickerBase {
  value?: DateRange | null;
  defaultValue?: DateRange | null;
  onValueChange?: (r: DateRange | null) => void;
}

export function DateRangePicker({
  label,
  id,
  hint = "시작날짜와 종료날짜를 YYYY.MM.DD 형식으로 입력하거나 달력에서 고르세요.",
  disabled,
  defaultOpen,
  className,
  value,
  defaultValue = null,
  onValueChange,
}: DateRangePickerProps) {
  const auto = useUid("hb-drp");
  const base = id ?? auto;
  const [inner, setInner] = React.useState<DateRange | null>(defaultValue);
  const cur = value !== undefined ? value : inner;
  const [from, setFrom] = React.useState(formatDate(cur?.from));
  const [to, setTo] = React.useState(formatDate(cur?.to));
  const [error, setError] = React.useState(false);
  const [open, setOpen] = React.useState(!!defaultOpen);
  const [pending, setPending] = React.useState<DateRange | null>(cur);

  React.useEffect(() => {
    setFrom(formatDate(cur?.from));
    setTo(formatDate(cur?.to));
  }, [cur]);

  const set = (r: DateRange | null) => {
    if (value === undefined) setInner(r);
    onValueChange?.(r);
    setError(false);
  };
  const commit = () => {
    const f = from.trim() ? parseDate(from) : null;
    const t = to.trim() ? parseDate(to) : null;
    if ((from.trim() && !f) || (to.trim() && !t)) return setError(true);
    set(f || t ? (f && t && t < f ? { from: t, to: f } : { from: f, to: t }) : null);
  };

  return (
    <div className={cx("form-group", "hb-date-picker", className)}>
      {label && (
        <div className="form-tit" id={`${base}-label`}>
          {label}
        </div>
      )}
      <div className={cx("form-conts", "calendar-conts", error && "is-error")}>
        <Popover.Root
          open={open}
          onOpenChange={(o) => {
            if (o) setPending(cur);
            setOpen(o);
          }}
        >
          <Popover.Anchor asChild>
            <div className="calendar-input" role="group" aria-labelledby={label ? `${base}-label` : undefined}>
              <ul className="input-group range set">
                <li>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="krds-input datepicker"
                    placeholder="시작날짜"
                    title="시작날짜 입력"
                    value={from}
                    aria-invalid={error || undefined}
                    aria-describedby={`${base}-hint`}
                    onChange={(e) => setFrom(e.target.value)}
                    onBlur={commit}
                  />
                </li>
                <li className="mark" aria-hidden="true">
                  -
                </li>
                <li>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="krds-input datepicker"
                    placeholder="종료날짜"
                    title="종료날짜 입력"
                    value={to}
                    aria-invalid={error || undefined}
                    aria-describedby={`${base}-hint`}
                    onChange={(e) => setTo(e.target.value)}
                    onBlur={commit}
                  />
                </li>
              </ul>
              <Popover.Trigger asChild>
                <CalendarButton />
              </Popover.Trigger>
            </div>
          </Popover.Anchor>
          <Popover.Portal>
            <Popover.Content
              className="hb-kit hb-date-pop"
              align="end"
              sideOffset={8}
              aria-label="기간 고르기"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <Calendar
                mode="range"
                autoFocus
                selected={pending}
                onSelect={setPending}
                disabled={disabled}
                footer={
                  <PickerFooter
                    onToday={() => {
                      const t = startOfDay(new Date());
                      setPending({ from: t, to: t });
                    }}
                    onCancel={() => setOpen(false)}
                    onOk={() => {
                      set(pending);
                      setOpen(false);
                    }}
                  />
                }
              />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
      <Hint id={`${base}-hint`} error={error} hint={hint} />
    </div>
  );
}

"use client";
// 체크박스 — KRDS 「체크박스(checkbox·checkbox_size)」 · shadcn Checkbox 와 비슷한 사용법
//   <Checkbox label="개인정보 수집·이용에 동의합니다" description="필수 동의 항목입니다." />
//   <CheckboxGroup aria-label="관심 분야" column>…</CheckboxGroup>
// 실제 input[type=checkbox] + label 이라 스페이스 키·화면낭독기가 그대로 동작한다.
import * as React from "react";
import { cx, useUid } from "./utils";

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "type"> {
  label: React.ReactNode;
  /** 레이블 아래 부가 설명 */
  description?: React.ReactNode;
  size?: "medium" | "large";
  /** 일부만 선택된 상태(전체 선택 체크박스). 화면낭독기에는 "일부 선택"으로 읽힌다. 체크하면 풀린다 */
  indeterminate?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, size = "medium", indeterminate, id, className, onChange, onCheckedChange, ...props },
  ref,
) {
  const inner = React.useRef<HTMLInputElement | null>(null);
  const setRef = React.useCallback(
    (el: HTMLInputElement | null) => {
      inner.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) ref.current = el;
    },
    [ref],
  );
  // indeterminate 는 HTML 속성이 아니라 DOM 프로퍼티라 마운트 뒤에 넣는다
  React.useEffect(() => {
    if (inner.current) inner.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  const auto = useUid("hb-chk");
  const cid = id ?? auto;
  return (
    <div className={cx("krds-form-check", size, className)}>
      <input
        ref={setRef}
        type="checkbox"
        id={cid}
        aria-describedby={description ? `${cid}-desc` : undefined}
        onChange={(e) => {
          onChange?.(e);
          onCheckedChange?.(e.target.checked);
        }}
        {...props}
      />
      <label htmlFor={cid}>{label}</label>
      {description && (
        <div className="krds-form-check-cnt">
          <p className="krds-form-check-p" id={`${cid}-desc`}>{description}</p>
        </div>
      )}
    </div>
  );
});

export interface CheckboxGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 세로로 쌓기 (KRDS chk-column) */
  column?: boolean;
}

/** 체크박스·선택 칩 묶음 — role="group" 이므로 aria-label 이나 aria-labelledby 를 준다 */
export const CheckboxGroup = React.forwardRef<HTMLDivElement, CheckboxGroupProps>(function CheckboxGroup(
  { column = true, className, ...props },
  ref,
) {
  return <div ref={ref} role="group" className={cx("krds-check-area", column && "chk-column", className)} {...props} />;
});

"use client";
// 텍스트 영역 — KRDS 「텍스트 영역(textarea)」 · shadcn Textarea 와 같은 사용법
//   <Textarea maxLength={500} showCount placeholder="민원 내용을 적어 주세요" />
// showCount 면 KRDS 글자 수(0/500)를 붙인다. 글자 수 문구는 입력칸의 설명으로 연결된다.
import * as React from "react";
import { cx, useUid } from "./utils";
import { useFieldControl } from "./field";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  showCount?: boolean;
  invalid?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { showCount, invalid, className, value, defaultValue, onChange, maxLength, ...props },
  ref,
) {
  const [inner, setInner] = React.useState(String(defaultValue ?? ""));
  const countId = useUid("hb-count");
  const current = value !== undefined ? String(value) : inner;
  const f = useFieldControl({ ...props, invalid });
  const described = [f["aria-describedby"], showCount && countId].filter(Boolean).join(" ") || undefined;
  const area = (
    <textarea
      ref={ref}
      className={cx("krds-input", className)}
      value={current}
      maxLength={maxLength}
      onChange={(e) => {
        if (value === undefined) setInner(e.target.value);
        onChange?.(e);
      }}
      {...props}
      {...f}
      aria-describedby={described}
    />
  );
  if (!showCount) return area;
  return (
    <div className={cx("textarea-wrap", f["aria-invalid"] && "is-error")}>
      {area}
      <p className="textarea-count" id={countId}>
        <span className="sr-only">입력한 글자 수</span>
        <span className="count-now">{current.length}</span>
        {maxLength != null && <span className="count-total">/{maxLength}</span>}
      </p>
    </div>
  );
});

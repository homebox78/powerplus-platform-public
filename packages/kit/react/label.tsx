"use client";
// 레이블 — shadcn Label 과 같은 사용법 (KRDS 는 폼그룹의 .form-tit label, 단독으로 쓸 때 이것)
//   <Label htmlFor="apply-name" required>신청인 이름</Label>
import * as React from "react";
import { cx } from "./utils";

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  /** 별표(*) + 화면낭독용 "(필수)" */
  required?: boolean;
  disabled?: boolean;
}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(function Label(
  { required, disabled, className, children, ...props },
  ref,
) {
  return (
    <label ref={ref} className={cx("hb-label", disabled && "is-disabled", className)} {...props}>
      {children}
      {required && (
        <>
          <span className="hb-required" aria-hidden="true">*</span>
          <span className="sr-only">(필수)</span>
        </>
      )}
    </label>
  );
});

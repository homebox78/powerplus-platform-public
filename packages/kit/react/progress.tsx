"use client";
// 진행 막대 — shadcn Progress (모양은 KRDS 토큰)
//   <Progress value={60} aria-label="신청서 작성 진행률" />
//   <Progress value={3} max={5} label="신청 단계" showValue />   ← 위에 이름·값 표시
//   <Progress aria-label="파일 올리는 중" />                      ← value 없으면 진행 중(값 모름)
//
// role="progressbar" + aria-valuenow/min/max. 이름은 label(보이는 글) 또는 aria-label 로 준다.
import * as React from "react";
import { cx, useUid } from "./utils";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
  /** 막대 위에 보이는 이름 (막대 이름으로도 쓰인다) */
  label?: React.ReactNode;
  /** 이름 옆에 "60%" 같은 값 표시 */
  showValue?: boolean;
  size?: "small" | "medium" | "large";
  color?: "primary" | "success" | "danger";
}

export const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(function Progress(
  { value, max = 100, label, showValue, size = "medium", color = "primary", className, ...props },
  ref,
) {
  const id = useUid("hb-progress");
  const known = value !== undefined;
  const pct = known ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const text = known ? `${Math.round(pct)}%` : undefined;
  return (
    <div className={cx("hb-progress-wrap", className)}>
      {(label || showValue) && (
        <div className="hb-progress-head">
          {label && <span id={`${id}-l`}>{label}</span>}
          {showValue && text && <span className="hb-progress-value" aria-hidden="true">{text}</span>}
        </div>
      )}
      <div
        ref={ref}
        role="progressbar"
        aria-labelledby={label ? `${id}-l` : undefined}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={known ? value : undefined}
        aria-valuetext={text}
        className={cx("hb-progress", size, color, !known && "indeterminate")}
        {...props}
      >
        <div className="hb-progress-bar" style={known ? { width: `${pct}%` } : undefined} />
      </div>
    </div>
  );
});

"use client";
// 단계 표시기 — KRDS 「단계 표시기」
//   <StepIndicator steps={["유의 사항 확인", "신청인 정보", "이사 전 주소", "이사 온 주소"]} current={3} />
// 지난 단계는 done(체크), 현재 단계는 active. 색만으로 구분하지 않게 화면 밖 글자로 "완료"·"현재단계"를 읽어 준다.
import * as React from "react";
import { cx } from "./utils";

export interface StepIndicatorProps extends React.OlHTMLAttributes<HTMLOListElement> {
  /** 단계 이름 */
  steps: string[];
  /** 현재 단계 (1부터) */
  current: number;
}

export const StepIndicator = React.forwardRef<HTMLOListElement, StepIndicatorProps>(function StepIndicator(
  { steps, current, className, "aria-label": label = "진행 단계", ...props },
  ref,
) {
  return (
    <ol ref={ref} aria-label={label} className={cx("krds-step-wrap", className)} {...props}>
      {steps.map((title, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "active" : undefined;
        return (
          <li key={n} className={state} aria-current={state === "active" ? "step" : undefined}>
            <span>
              {state === "active" && <em className="sr-only">현재단계</em>}
              <i className="step">{n}단계</i>
              <span className="step-tit">
                {title}
                {state === "done" && <span className="sr-only"> 완료</span>}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
});

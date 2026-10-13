"use client";
// 코치 마크 — KRDS 「코치 마크(coach_mark)」 마크업 그대로
//   <CoachMark active={step === 1} step={1} total={3} title="1단계 : 주소 검색"
//     description="이사 전 주소를 검색해 고르세요." onNext={() => setStep(2)} onStop={() => setStep(0)}>
//     <div>…강조할 화면 영역…</div>
//   </CoachMark>
//
// 한 번에 하나의 영역만 active 로 둔다(단계는 쓰는 쪽 상태로 넘긴다). 활성 영역은 KRDS 테두리로 강조되고
// 말풍선(단계·설명·그만보기·다음으로)이 붙는다. placement="bottom" 이면 말풍선이 영역 아래에 붙는다.
// 접근성: 말풍선은 비모달 대화상자(role=dialog). 단계가 바뀌면 말풍선으로 포커스가 옮겨 가 새 설명이 읽히고,
// Esc 는 그만보기와 같다. 현재/전체 단계는 숫자와 숨은 글자로 함께 알린다.
import * as React from "react";
import { Button } from "./button";
import { cx, useUid } from "./utils";

export interface CoachMarkProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  active?: boolean;
  step: number;
  total: number;
  title: React.ReactNode;
  description?: React.ReactNode;
  placement?: "top" | "bottom";
  onNext?: () => void;
  onPrev?: () => void;
  onStop?: () => void;
  nextLabel?: string;
  stopLabel?: string;
  /** 활성이 될 때 말풍선으로 포커스를 옮긴다(기본 켜짐) */
  autoFocus?: boolean;
}

export function CoachMark({
  active = false,
  step,
  total,
  title,
  description,
  placement = "top",
  onNext,
  onPrev,
  onStop,
  nextLabel,
  stopLabel = "그만보기",
  autoFocus = true,
  className,
  children,
  ...props
}: CoachMarkProps) {
  const base = useUid("hb-coach");
  const balloon = React.useRef<HTMLDivElement>(null);
  const first = React.useRef(true);

  React.useEffect(() => {
    if (active && autoFocus && !first.current) balloon.current?.focus();
    first.current = false;
  }, [active, autoFocus]);

  const last = step >= total;
  return (
    <div
      className={cx(active && "txt-box krds-coach-mark", active && placement === "bottom" && "hb-coach-bottom", className)}
      data-coach-active={active || undefined}
      {...props}
    >
      {active && (
        <div
          ref={balloon}
          className="coach-balloon"
          role="dialog"
          aria-labelledby={`${base}-t`}
          aria-describedby={description ? `${base}-d` : undefined}
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Escape") onStop?.();
          }}
        >
          <h5 className="sr-only">따라하기 가이드</h5>
          <h6 id={`${base}-t`} className="coach-tit">{title}</h6>
          {description && <p id={`${base}-d`} className="desc">{description}</p>}
          <div className="coach-controls">
            <div className="num">
              <span className="sr-only">현재 단계</span>
              <strong>{step}</strong>
              <span className="sr-only">총 단계</span>
              <span>{total}</span>
            </div>
            <div className="btn-wrap">
              <Button size="small" variant="text" onClick={onStop}>{stopLabel}</Button>
              {onPrev && step > 1 && (
                <Button size="small" variant="tertiary" onClick={onPrev}>이전으로</Button>
              )}
              <Button size="small" variant="tertiary" onClick={last ? onStop : onNext}>
                {nextLabel ?? (last ? "마치기" : "다음으로")}
              </Button>
            </div>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

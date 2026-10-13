"use client";
// 따라하기 패널 — KRDS 「튜토리얼 패널(tutorial_panel)」. 도움 패널의 "따라하기" 탭 내용.
//   <HelpPanelContent>
//     <TutorialPanel title="이사 전 살던 곳 정보 입력하기" onBack={…} onStop={…}>
//       <TutorialTask current title="Task 1: 이사 전에 살던 곳 주소 확인" steps={["주소 조회", "조회 결과 확인"]} />
//       <TutorialTask title="Task 2: 이사 갈 가족 구성원 선택하기" steps={["세대원 선택"]} />
//     </TutorialPanel>
//   </HelpPanelContent>
//
// 각 과제의 "전체 N단계" 는 KRDS 디스클로저(버튼 aria-expanded + 내용 inert)로 펼친다.
// 현재 과제는 색과 함께 "현재 과제" 숨은 글자로 알린다.
import * as React from "react";
import { Button } from "./button";
import { cx, useUid } from "./utils";

export interface TutorialPanelProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  /** 제목 앞 "이전으로 돌아가기" 동작. 없으면 제목만 */
  onBack?: () => void;
  onStop?: () => void;
  stopLabel?: string;
}

export function TutorialPanel({ title, onBack, onStop, stopLabel = "그만 따라하기", className, children, ...props }: TutorialPanelProps) {
  return (
    <div className={cx("help-conts-area-inner", className)} {...props}>
      <div className="conts-area">
        <h4 className="help-title">
          {onBack ? (
            <button type="button" onClick={onBack}>
              <span className="sr-only">이전으로 돌아가기: </span>
              {title}
            </button>
          ) : (
            title
          )}
        </h4>
        <ul className="coach-help-process">{children}</ul>
      </div>
      {onStop && (
        <div className="help-panel-action">
          <Button variant="secondary" className="coach-btn-stop" onClick={onStop}>{stopLabel}</Button>
        </div>
      )}
    </div>
  );
}

export interface TutorialTaskProps extends Omit<React.LiHTMLAttributes<HTMLLIElement>, "title"> {
  title: React.ReactNode;
  current?: boolean;
  steps?: React.ReactNode[];
  defaultExpanded?: boolean;
}

export function TutorialTask({ title, current, steps = [], defaultExpanded = false, className, children, ...props }: TutorialTaskProps) {
  const [open, setOpen] = React.useState(defaultExpanded);
  const id = useUid("hb-task");
  return (
    <li className={className} {...props}>
      <h4 className={cx("tit", current && "current")} aria-current={current ? "step" : undefined}>
        {title}
        {current && <span className="sr-only"> (현재 과제)</span>}
      </h4>
      {steps.length > 0 && (
        <div className={cx("krds-disclosure conts-expand-area", open && "active")}>
          <button type="button" className="btn-conts-expand" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
            전체 {steps.length}단계
          </button>
          <div id={id} className="expand-wrap" inert={!open || undefined}>
            <div className="expand-in">
              <ul className="krds-info-list decimal">
                {steps.map((s, i) => (
                  <li key={i}>단계{i + 1} : {s}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
      {children}
    </li>
  );
}

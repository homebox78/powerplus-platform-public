"use client";
// 맥락 도움말 — KRDS 「맥락적 도움말(contextual_help)」 마크업 그대로
//   <ContextualHelp text="주민등록번호" title="주민등록번호를 왜 입력하나요?" side="bottom" align="left"
//     action={<a href="/guide" className="krds-btn xsmall link basic">개인정보 처리 안내 <i className="svg-icon ico-angle right" /></a>}>
//     본인 확인과 중복 신청 방지를 위해서만 씁니다.
//   </ContextualHelp>
//
// 접근성: 물음표 버튼은 aria-expanded·aria-controls 로 말풍선과 짝지어진다. 말풍선 안에 링크·닫기 버튼이
// 있어 툴팁이 아니라 비모달 대화상자(role=dialog)로 둔다. 열면 말풍선 안 첫 요소로 포커스가 가고,
// Esc·닫기 버튼으로 닫으면 물음표 버튼으로 돌아온다. 바깥을 누르거나 포커스가 밖으로 나가면 닫힌다.
import * as React from "react";
import { cx, useUid } from "./utils";

export interface ContextualHelpProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** 도움말 옆에 붙는 글(레이블 등). 없으면 버튼만 */
  text?: React.ReactNode;
  /** 말풍선 제목 */
  title: React.ReactNode;
  /** 말풍선 아래 버튼·링크 */
  action?: React.ReactNode;
  side?: "top" | "bottom";
  align?: "left" | "center" | "right";
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 물음표 버튼 이름. 기본 "도움말" — 여러 개면 무엇의 도움말인지 붙인다 */
  triggerLabel?: string;
}

export function ContextualHelp({
  text,
  title,
  action,
  side = "top",
  align = "left",
  open,
  defaultOpen = false,
  onOpenChange,
  triggerLabel = "도움말",
  className,
  children,
  ...props
}: ContextualHelpProps) {
  const [inner, setInner] = React.useState(defaultOpen);
  const isOpen = open ?? inner;
  const base = useUid("hb-ctx-help");
  const wrap = React.useRef<HTMLDivElement>(null);
  const btn = React.useRef<HTMLButtonElement>(null);
  const pop = React.useRef<HTMLDivElement>(null);
  const opened = React.useRef(false);

  const set = (v: boolean, focusBack = false) => {
    if (open === undefined) setInner(v);
    onOpenChange?.(v);
    if (!v && focusBack) btn.current?.focus();
  };

  // 사용자가 연 경우에만 말풍선 안으로 포커스를 옮긴다(처음부터 열린 미리보기는 옮기지 않는다)
  React.useEffect(() => {
    if (isOpen && opened.current) pop.current?.querySelector<HTMLElement>("a[href], button, [tabindex='0'], input, textarea")?.focus();
    opened.current = false;
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) set(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") set(false, wrap.current?.contains(document.activeElement) ?? false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  });

  return (
    <div className={cx("krds-contextual-help", side, align, className)} {...props}>
      {text !== undefined && <p className="tooltip-txt">{text}</p>}
      <div
        ref={wrap}
        className="tooltip-action"
        onBlur={(e) => {
          if (isOpen && e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) set(false);
        }}
      >
        <button
          ref={btn}
          type="button"
          className="krds-btn medium icon tooltip-btn"
          aria-expanded={isOpen}
          aria-controls={`${base}-pop`}
          onClick={() => {
            opened.current = !isOpen;
            set(!isOpen);
          }}
        >
          <span className="sr-only">{triggerLabel}</span>
          <i className="svg-icon ico-tooltip" aria-hidden="true" />
        </button>
        <div
          ref={pop}
          id={`${base}-pop`}
          role="dialog"
          aria-labelledby={`${base}-title`}
          className="tooltip-popover"
          data-open={isOpen}
        >
          <h4 id={`${base}-title`} className="tooltip-title">{title}</h4>
          <div className="tooltip-contents">
            <div>{children}</div>
            {action && <div className="btn-wrap">{action}</div>}
          </div>
          <button type="button" className="krds-btn xsmall icon tooltip-close" onClick={() => set(false, true)}>
            <span className="sr-only">닫기</span>
            <i className="svg-icon ico-modal-close" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";
// 공식 배너 — KRDS 「공식 배너(masthead)」
//   <Masthead />                                    ← 문구만 (KRDS 원형과 같음)
//   <Masthead collapsible />                         ← "공식 누리집 확인 방법" 펼침 추가
//   <Masthead collapsible details={<p>…</p>} />      ← 펼침 설명을 바꿀 때
// 누리집 맨 위에 두는 '대한민국 공식 전자정부 누리집' 표시. 펼침 버튼은 aria-expanded·aria-controls 로 연결한다.
import * as React from "react";
import { cx, useUid } from "./utils";

export interface MastheadProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "id"> {
  /** 배너 문구 */
  text?: React.ReactNode;
  /** 펼침 버튼 쓰기(기본 true) */
  collapsible?: boolean;
  /** 펼침 버튼 이름 */
  toggleLabel?: string;
  /** 펼친 영역 내용 — 비우면 공식 누리집 확인 방법 기본 안내 */
  details?: React.ReactNode;
  /** 처음부터 펼쳐 둘지 */
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** KRDS 스타일이 id 로 걸려 있다(기본 krds-masthead). 한 문서에 하나만 둔다. */
  id?: string;
}

export function MastheadDefaultDetails() {
  return (
    <>
      <div>
        <strong>누리집 주소를 확인하세요</strong>
        <p>정부기관 누리집 주소는 .go.kr 로 끝납니다. 공공기관은 .or.kr 등 다른 주소를 쓰기도 합니다.</p>
      </div>
      <div>
        <strong>보안 연결을 확인하세요</strong>
        <p>주소가 https:// 로 시작하고 주소창에 자물쇠 표시가 있으면 안전하게 연결된 누리집입니다.</p>
      </div>
    </>
  );
}

export const Masthead = React.forwardRef<HTMLDivElement, MastheadProps>(function Masthead(
  {
    text = "이 누리집은 대한민국 공식 전자정부 누리집입니다.",
    collapsible = false,
    toggleLabel = "공식 누리집 확인 방법",
    details,
    defaultOpen = false,
    open: openProp,
    onOpenChange,
    id = "krds-masthead",
    className,
    ...props
  },
  ref,
) {
  const [inner, setInner] = React.useState(defaultOpen);
  const open = openProp ?? inner;
  const bodyId = useUid("hb-masthead");
  const toggle = () => {
    setInner(!open);
    onOpenChange?.(!open);
  };

  return (
    <div ref={ref} id={id} className={cx("hb-masthead", className)} {...props}>
      <div className="toggle-wrap">
        <div className={cx("toggle-head", open && "active")}>
          <div className="inner">
            <span className="nuri-txt">{text}</span>
            {collapsible && (
              <button type="button" className="hb-masthead-toggle" aria-expanded={open} aria-controls={bodyId} onClick={toggle}>
                {toggleLabel}
                <i className="svg-icon ico-angle" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        {collapsible && (
          <div id={bodyId} className={cx("toggle-body", open && "active")} hidden={!open}>
            <div className="inner">
              <div className="hb-masthead-body">{details ?? <MastheadDefaultDetails />}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

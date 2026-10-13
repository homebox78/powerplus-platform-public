"use client";
// 버튼 — KRDS 「버튼」 · shadcn Button 과 같은 사용법
//   <Button variant="primary" size="large">신청하기</Button>
//   <Button asChild><a href="/apply">신청하기</a></Button>        ← 링크 모양 버튼
//   <Button icon="sch">검색</Button>                              ← 아이콘 붙은 버튼 (KRDS button_with_icon)
//   <Button icon="sch" iconPosition="start">검색</Button>          ← 아이콘을 앞에
//   <Button variant="text" icon="angle right">주민등록표초본</Button> ← 텍스트 버튼 + 아이콘 (KRDS button_text)
//   <Button iconOnly icon="refresh" border size="large">새로고침</Button> ← 아이콘 버튼 (KRDS button_icon)
//   <Button loading={saving}>저장</Button>                        ← 처리 중(스피너·aria-busy, 다시 눌러도 무시)
//   <Button onClick={async () => { await api.save(); }}>저장</Button> ← onClick 이 Promise 를 돌려주면 끝날 때까지 저절로 처리 중
//
// icon 은 KRDS 아이콘 이름(`svg-icon ico-<이름>` 의 <이름>). "angle right" 처럼 방향 수식어를 함께 쓸 수 있다.
// iconOnly 이면 글자(children)는 화면에 안 보이고 스크린리더 이름(sr-only)이 된다 — 글자를 꼭 넣는다.
// 처리 중에는 disabled 대신 aria-disabled 를 써서 초점이 버튼에 남게 한다(KRDS 버튼 지침).
import * as React from "react";
import { Slot } from "radix-ui";
import { cx } from "./utils";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "text";
export type ButtonSize = "xsmall" | "small" | "medium" | "large" | "xlarge";

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 자식 요소(<a> 등)에 버튼 모양만 입힌다 */
  asChild?: boolean;
  /** KRDS 아이콘 이름 — sch · go · down · angle right · refresh · help … */
  icon?: string;
  /** 아이콘 위치 (기본: 글자 뒤) */
  iconPosition?: "start" | "end";
  /** 아이콘만 보이는 버튼. 글자는 스크린리더 이름이 된다 */
  iconOnly?: boolean;
  /** 아이콘 버튼에 둥근 테두리 (새로고침·펼침 등) */
  border?: boolean;
  /** 처리 중 — 스피너를 보이고 aria-busy·aria-disabled, 누름은 무시한다 */
  loading?: boolean;
  /** 처리 중일 때 화면낭독기가 읽는 말 (기본 "처리 중") */
  loadingLabel?: string;
  /** Promise 를 돌려주면 끝날 때까지 처리 중이 된다(두 번 제출 방지) */
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => unknown;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary", size = "medium", asChild, icon, iconPosition = "end", iconOnly, border, loading, loadingLabel = "처리 중",
    className, type, children, onClick, "aria-disabled": ariaDisabled, ...props
  },
  ref,
) {
  const [pending, setPending] = React.useState(false);
  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const busy = !!loading || pending;
  const Comp: React.ElementType = asChild ? Slot.Root : "button";
  const glyph = icon && !busy ? <i className={`svg-icon ico-${icon}`} data-pos={iconPosition} aria-hidden="true" /> : null;
  // 아이콘 버튼은 KRDS 가 variant 색을 쓰지 않는다(.icon 은 투명 배경)
  const classes = cx(
    "krds-btn", !iconOnly && variant, size, iconOnly && "icon", iconOnly && border && "border", busy && "hb-btn-loading", className,
  );
  const spinner = busy ? (
    <span className="krds-spinner hb-btn-spinner" aria-hidden="true" />
  ) : null;
  const busyText = busy ? <span className="sr-only"> {loadingLabel}</span> : null;
  const label = iconOnly ? <span className="sr-only">{children}</span> : children;
  // asChild 일 때 자식 요소 안으로 아이콘을 넣으려면 Slottable 로 감싼다
  const body = asChild ? <Slot.Slottable>{children}</Slot.Slottable> : label;
  const handle = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (busy) {
      // 처리 중 두 번째 누름은 무시 — 제출·링크 이동도 막는다
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const r = onClick?.(e);
    if (r && typeof (r as Promise<unknown>).then === "function") {
      setPending(true);
      (r as Promise<unknown>).then(
        () => alive.current && setPending(false),
        () => alive.current && setPending(false),
      );
    }
  };
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? "button")}
      className={classes}
      {...props}
      aria-busy={busy || undefined}
      aria-disabled={busy || ariaDisabled || undefined}
      onClick={handle}
    >
      {iconPosition === "start" && (spinner ?? glyph)}
      {body}
      {busyText}
      {iconPosition === "end" && (spinner ?? glyph)}
    </Comp>
  );
});

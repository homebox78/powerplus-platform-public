"use client";
// 툴팁 — KRDS 「툴팁」(말풍선·상자형 tooltip-box·세로형 tooltip-vertical) · shadcn Tooltip 과 같은 사용법
//   <Tooltip>
//     <TooltipTrigger asChild><Button variant="text">도움말</Button></TooltipTrigger>
//     <TooltipContent>버튼에 제공되는 툴팁</TooltipContent>
//   </Tooltip>
//   <TooltipContent variant="box">150자 내외 설명</TooltipContent>   ← KRDS tooltip-box
//   <TooltipContent variant="vertical">위·아래로 뜨는 툴팁</TooltipContent>
//
// radix-ui Tooltip: 마우스를 올리거나 포커스하면 열리고 Esc·벗어나면 닫힌다. 버튼에 aria-describedby 로 연결.
// KRDS 지침: 툴팁 안에 링크·버튼 같은 대화형 요소를 넣지 않는다(그럴 땐 Popover). 비활성 버튼에는 달지 않는다.
// 꼬리 방향은 실제로 뜬 쪽(data-side)을 따라간다 — 화면 끝에서 반대쪽으로 뒤집혀도 꼬리가 맞다.
import * as React from "react";
import { Tooltip as T } from "radix-ui";
import { cx } from "./utils";

export const TooltipProvider = T.Provider;

export interface TooltipProps extends React.ComponentProps<typeof T.Root> {
  /** 마우스를 올린 뒤 열릴 때까지(ms) */
  delayDuration?: number;
}

/** Provider 를 따로 두지 않아도 되게 안에 품는다(여러 개를 한 Provider 로 묶으려면 TooltipProvider 를 쓴다) */
export function Tooltip({ delayDuration = 200, ...props }: TooltipProps) {
  return (
    <T.Provider delayDuration={delayDuration}>
      <T.Root {...props} />
    </T.Provider>
  );
}

export const TooltipTrigger = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof T.Trigger>>(
  function TooltipTrigger({ className, ...props }, ref) {
    return <T.Trigger ref={ref} className={cx("krds-tooltip", className)} {...props} />;
  },
);

export type TooltipVariant = "default" | "box" | "vertical";

export interface TooltipContentProps extends React.ComponentPropsWithoutRef<typeof T.Content> {
  /** default = 한 줄 말풍선(옆) · box = 상자형(여러 줄, 흰 바탕) · vertical = 한 줄 말풍선(위·아래) */
  variant?: TooltipVariant;
}

export const TooltipContent = React.forwardRef<HTMLDivElement, TooltipContentProps>(function TooltipContent(
  { variant = "default", side, sideOffset = 12, className, ...props },
  ref,
) {
  return (
    <T.Portal>
      <T.Content
        ref={ref}
        side={side ?? (variant === "default" ? "right" : "top")}
        sideOffset={sideOffset}
        className={cx("hb-kit krds-tooltip-popover active hb-tip", variant === "box" && "tooltip-box", variant === "vertical" && "tooltip-vertical", className)}
        {...props}
      />
    </T.Portal>
  );
});

"use client";
// 팝오버 — shadcn Popover 와 같은 사용법. KRDS 에 없어 모양은 KRDS 토큰(상자형 말풍선과 같은 면·테두리)으로 지었다.
//   <Popover>
//     <PopoverTrigger asChild><Button variant="secondary">알림 설정</Button></PopoverTrigger>
//     <PopoverContent>
//       <PopoverTitle>알림 받을 방법</PopoverTitle>
//       …
//     </PopoverContent>
//   </Popover>
//
// radix-ui Popover: 버튼에 aria-expanded·aria-controls, Esc·바깥 누르면 닫힘, 닫으면 버튼으로 포커스 복귀.
// 대화형 내용(입력·버튼)을 넣을 수 있다. 짧은 설명만 보여 줄 때는 Tooltip 을 쓴다.
import * as React from "react";
import { Popover as P } from "radix-ui";
import { cx } from "./utils";

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverAnchor = P.Anchor;
export const PopoverClose = P.Close;

export interface PopoverContentProps extends React.ComponentPropsWithoutRef<typeof P.Content> {
  /** 말풍선 꼬리 표시 */
  arrow?: boolean;
}

export const PopoverContent = React.forwardRef<HTMLDivElement, PopoverContentProps>(function PopoverContent(
  { className, align = "center", sideOffset = 8, arrow = false, children, ...props },
  ref,
) {
  return (
    <P.Portal>
      <P.Content ref={ref} align={align} sideOffset={sideOffset} className={cx("hb-kit hb-popover", className)} {...props}>
        {children}
        {arrow && <P.Arrow className="hb-popover-arrow" width={14} height={7} />}
      </P.Content>
    </P.Portal>
  );
});

export function PopoverTitle({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cx("hb-popover-title", className)} {...props} />;
}

export function PopoverDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cx("hb-popover-desc", className)} {...props} />;
}

"use client";
// 호버 카드 — shadcn HoverCard 와 같은 사용법(링크에 마우스를 올리거나 포커스하면 미리보기 카드).
//   <HoverCard>
//     <HoverCardTrigger href="/org/passport">민원여권과</HoverCardTrigger>
//     <HoverCardContent>…</HoverCardContent>
//   </HoverCard>
//
// radix-ui HoverCard: 마우스를 올리거나 키보드로 포커스하면 열리고, 벗어나면 닫힌다.
// 카드 안 내용은 보조 정보여야 한다 — 꼭 필요한 정보·동작은 링크가 가리키는 페이지에도 있어야 한다(키보드·화면낭독기 사용자).
import * as React from "react";
import { HoverCard as H } from "radix-ui";
import { cx } from "./utils";

export function HoverCard({ openDelay = 300, closeDelay = 200, ...props }: React.ComponentProps<typeof H.Root>) {
  return <H.Root openDelay={openDelay} closeDelay={closeDelay} {...props} />;
}

export const HoverCardTrigger = H.Trigger;

export const HoverCardContent = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof H.Content>>(
  function HoverCardContent({ className, align = "center", sideOffset = 8, ...props }, ref) {
    return (
      <H.Portal>
        <H.Content ref={ref} align={align} sideOffset={sideOffset} className={cx("hb-kit hb-hover-card", className)} {...props} />
      </H.Portal>
    );
  },
);

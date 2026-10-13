"use client";
// 시트 — shadcn Sheet 와 같은 사용법(화면 가장자리에서 밀려 나오는 패널). KRDS 에 없어 모양은 KRDS 모달 토큰으로 지었다.
//   <Sheet>
//     <SheetTrigger asChild><Button>검색 조건</Button></SheetTrigger>
//     <SheetContent side="right">
//       <SheetHeader><SheetTitle>검색 조건</SheetTitle><SheetDescription>…</SheetDescription></SheetHeader>
//       <SheetBody>…</SheetBody>
//       <SheetFooter>…</SheetFooter>
//     </SheetContent>
//   </Sheet>
//
// 동작은 radix-ui Dialog 와 같다(포커스 가두기·Esc·바깥 누르면 닫기·포커스 복귀).
import * as React from "react";
import { Dialog as D } from "radix-ui";
import { cx } from "./utils";

export type SheetSide = "right" | "left" | "top" | "bottom";

export const Sheet = D.Root;
export const SheetTrigger = D.Trigger;
export const SheetClose = D.Close;

export interface SheetContentProps extends React.ComponentPropsWithoutRef<typeof D.Content> {
  side?: SheetSide;
  showClose?: boolean;
  closeLabel?: string;
}

export const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(function SheetContent(
  { side = "right", showClose = true, closeLabel = "닫기", className, children, ...props },
  ref,
) {
  return (
    <D.Portal>
      <div className="hb-kit hb-sheet-root">
        <D.Overlay className="hb-sheet-overlay" />
        <D.Content ref={ref} data-side={side} className={cx("hb-sheet", className)} {...props}>
          {children}
          {showClose && (
            <D.Close className="krds-btn medium icon hb-sheet-close">
              <span className="sr-only">{closeLabel}</span>
              <i className="svg-icon ico-popup-close" aria-hidden="true" />
            </D.Close>
          )}
        </D.Content>
      </div>
    </D.Portal>
  );
});

export function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("hb-sheet-header", className)} {...props} />;
}

export const SheetTitle = React.forwardRef<HTMLHeadingElement, React.ComponentPropsWithoutRef<typeof D.Title>>(
  function SheetTitle({ className, ...props }, ref) {
    return <D.Title ref={ref} className={cx("hb-sheet-title", className)} {...props} />;
  },
);

export const SheetDescription = React.forwardRef<HTMLParagraphElement, React.ComponentPropsWithoutRef<typeof D.Description>>(
  function SheetDescription({ className, ...props }, ref) {
    return <D.Description ref={ref} className={cx("hb-sheet-desc", className)} {...props} />;
  },
);

/** 본문 — 길면 이 안에서만 스크롤된다 */
export function SheetBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("hb-sheet-body", className)} {...props} />;
}

export function SheetFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("hb-sheet-footer", className)} {...props} />;
}

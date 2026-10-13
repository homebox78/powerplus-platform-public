"use client";
// 대화상자 — KRDS 「모달」 · shadcn Dialog 와 같은 사용법
//   <Dialog>
//     <DialogTrigger asChild><Button>신청 안내 보기</Button></DialogTrigger>
//     <DialogContent size="medium">
//       <DialogHeader><DialogTitle>신청 안내</DialogTitle></DialogHeader>
//       <DialogBody><DialogDescription>…</DialogDescription></DialogBody>
//       <DialogFooter>
//         <DialogClose asChild><Button variant="tertiary">닫기</Button></DialogClose>
//       </DialogFooter>
//     </DialogContent>
//   </Dialog>
//
// 동작은 radix-ui Dialog(포커스 가두기·Esc 닫기·바깥 누르면 닫기·닫은 뒤 열었던 버튼으로 포커스 복귀·배경 스크롤 잠금).
// 마크업은 KRDS modal 그대로(.krds-modal > .modal-dialog > .modal-content). 포털 최상위 .krds-modal 에 hb-kit 을 붙인다.
import * as React from "react";
import { Dialog as D } from "radix-ui";
import { cx } from "./utils";

export type DialogSize = "small" | "medium" | "large";
const SIZE: Record<DialogSize, string> = { small: "modal-sm", medium: "modal-md", large: "modal-lg" };

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export interface DialogContentProps extends React.ComponentPropsWithoutRef<typeof D.Content> {
  /** small 400 · medium 560 · large 760(기본) */
  size?: DialogSize;
  /** 오른쪽 위 닫기(X) 버튼 — 기본 표시 */
  showClose?: boolean;
  closeLabel?: string;
}

export const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(function DialogContent(
  { size, showClose = true, closeLabel = "닫기", className, children, ...props },
  ref,
) {
  return (
    <D.Portal>
      <div className="krds-modal fade in shown hb-kit hb-modal">
        <div className={cx("modal-dialog", size && SIZE[size])}>
          <D.Content ref={ref} className={cx("modal-content", className)} {...props}>
            {children}
            {showClose && (
              <D.Close className="krds-btn medium icon btn-close">
                <span className="sr-only">{closeLabel}</span>
                <i className="svg-icon ico-popup-close" aria-hidden="true" />
              </D.Close>
            )}
          </D.Content>
        </div>
        <D.Overlay className="modal-back in" />
      </div>
    </D.Portal>
  );
});

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("modal-header", className)} {...props} />;
}

export const DialogTitle = React.forwardRef<HTMLHeadingElement, React.ComponentPropsWithoutRef<typeof D.Title>>(
  function DialogTitle({ className, ...props }, ref) {
    return <D.Title ref={ref} className={cx("modal-title", className)} {...props} />;
  },
);

export const DialogDescription = React.forwardRef<HTMLParagraphElement, React.ComponentPropsWithoutRef<typeof D.Description>>(
  function DialogDescription({ className, ...props }, ref) {
    return <D.Description ref={ref} className={cx("hb-modal-desc", className)} {...props} />;
  },
);

/** 본문 — 길면 이 안에서만 스크롤된다 */
export function DialogBody({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("modal-conts", className)} {...props}>
      <div className="conts-area">{children}</div>
    </div>
  );
}

export interface DialogFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 왼쪽·오른쪽 끝으로 나눠 배치(KRDS multi-conts) */
  split?: boolean;
}

export function DialogFooter({ split, className, ...props }: DialogFooterProps) {
  return <div className={cx("modal-btn btn-wrap", split && "multi-conts", className)} {...props} />;
}

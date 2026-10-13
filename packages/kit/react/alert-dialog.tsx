"use client";
// 확인 대화상자 — shadcn AlertDialog 와 같은 사용법, 모양은 KRDS 「모달」
//   <AlertDialog>
//     <AlertDialogTrigger asChild><Button>신청 취소</Button></AlertDialogTrigger>
//     <AlertDialogContent size="small">
//       <AlertDialogHeader><AlertDialogTitle>신청을 취소할까요?</AlertDialogTitle></AlertDialogHeader>
//       <AlertDialogBody><AlertDialogDescription>…</AlertDialogDescription></AlertDialogBody>
//       <AlertDialogFooter>
//         <AlertDialogCancel>돌아가기</AlertDialogCancel>
//         <AlertDialogAction onClick={cancel}>취소하기</AlertDialogAction>
//       </AlertDialogFooter>
//     </AlertDialogContent>
//   </AlertDialog>
//
// 대화상자와 다른 점: role="alertdialog", 바깥을 눌러도 닫히지 않는다(반드시 결정), 닫기(X) 버튼이 없다,
// 열리면 '취소' 버튼에 포커스가 간다(되돌릴 수 없는 동작을 실수로 누르지 않게).
import * as React from "react";
import { AlertDialog as A } from "radix-ui";
import { cx } from "./utils";
import type { ButtonSize, ButtonVariant } from "./button";

const SIZE = { small: "modal-sm", medium: "modal-md", large: "modal-lg" } as const;

export const AlertDialog = A.Root;
export const AlertDialogTrigger = A.Trigger;

export interface AlertDialogContentProps extends React.ComponentPropsWithoutRef<typeof A.Content> {
  size?: keyof typeof SIZE;
}

export const AlertDialogContent = React.forwardRef<HTMLDivElement, AlertDialogContentProps>(function AlertDialogContent(
  { size = "small", className, ...props },
  ref,
) {
  return (
    <A.Portal>
      <div className="krds-modal fade in shown hb-kit hb-modal">
        <div className={cx("modal-dialog", SIZE[size])}>
          <A.Content ref={ref} className={cx("modal-content", className)} {...props} />
        </div>
        <A.Overlay className="modal-back in" />
      </div>
    </A.Portal>
  );
});

export function AlertDialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("modal-header", className)} {...props} />;
}

export const AlertDialogTitle = React.forwardRef<HTMLHeadingElement, React.ComponentPropsWithoutRef<typeof A.Title>>(
  function AlertDialogTitle({ className, ...props }, ref) {
    return <A.Title ref={ref} className={cx("modal-title", className)} {...props} />;
  },
);

export const AlertDialogDescription = React.forwardRef<HTMLParagraphElement, React.ComponentPropsWithoutRef<typeof A.Description>>(
  function AlertDialogDescription({ className, ...props }, ref) {
    return <A.Description ref={ref} className={cx("hb-modal-desc", className)} {...props} />;
  },
);

export function AlertDialogBody({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("modal-conts", className)} {...props}>
      <div className="conts-area">{children}</div>
    </div>
  );
}

export function AlertDialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("modal-btn btn-wrap", className)} {...props} />;
}

interface ActionProps extends React.ComponentPropsWithoutRef<typeof A.Action> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/** 확인(실행) 버튼 — 누르면 닫힌다 */
export const AlertDialogAction = React.forwardRef<HTMLButtonElement, ActionProps>(function AlertDialogAction(
  { variant = "primary", size = "medium", className, ...props },
  ref,
) {
  return <A.Action ref={ref} className={cx("krds-btn", variant, size, className)} {...props} />;
});

/** 취소 버튼 — 열릴 때 포커스가 먼저 간다 */
export const AlertDialogCancel = React.forwardRef<HTMLButtonElement, ActionProps>(function AlertDialogCancel(
  { variant = "tertiary", size = "medium", className, ...props },
  ref,
) {
  return <A.Cancel ref={ref} className={cx("krds-btn", variant, size, className)} {...props} />;
});

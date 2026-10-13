"use client";
// 드로어 — 아래에서 올라오는 시트. 모양은 KRDS 「모달」 바텀시트(data-type="bottom-sheet"), 사용법은 shadcn Drawer.
//   <Drawer>
//     <DrawerTrigger asChild><Button>정렬·보기 설정</Button></DrawerTrigger>
//     <DrawerContent>
//       <DrawerHeader><DrawerTitle>정렬</DrawerTitle></DrawerHeader>
//       <DrawerBody>…</DrawerBody>
//       <DrawerFooter><DrawerClose asChild><Button>적용</Button></DrawerClose></DrawerFooter>
//     </DrawerContent>
//   </Drawer>
//
// 포커스 가두기·Esc·바깥 누르면 닫기·포커스 복귀는 radix-ui Dialog 가 맡는다.
// 위쪽 손잡이를 아래로 끌어내리면(80px 이상) 닫힌다 — 마우스·터치 보조 동작이고, 키보드는 Esc·닫기 버튼으로 닫는다.
import * as React from "react";
import { Dialog as D } from "radix-ui";
import { cx } from "./utils";

const DrawerCtx = React.createContext<(open: boolean) => void>(() => {});

export interface DrawerProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}

export function Drawer({ open, defaultOpen = false, onOpenChange, children }: DrawerProps) {
  const [inner, setInner] = React.useState(defaultOpen);
  const current = open ?? inner;
  const setOpen = React.useCallback(
    (v: boolean) => {
      if (open === undefined) setInner(v);
      onOpenChange?.(v);
    },
    [open, onOpenChange],
  );
  return (
    <DrawerCtx.Provider value={setOpen}>
      <D.Root open={current} onOpenChange={setOpen}>
        {children}
      </D.Root>
    </DrawerCtx.Provider>
  );
}

export const DrawerTrigger = D.Trigger;
export const DrawerClose = D.Close;

export interface DrawerContentProps extends React.ComponentPropsWithoutRef<typeof D.Content> {
  showClose?: boolean;
  closeLabel?: string;
  /** 끌어서 닫는 손잡이 표시 — 기본 표시 */
  handle?: boolean;
}

export const DrawerContent = React.forwardRef<HTMLDivElement, DrawerContentProps>(function DrawerContent(
  { showClose = true, closeLabel = "닫기", handle = true, className, children, style, ...props },
  ref,
) {
  const setOpen = React.useContext(DrawerCtx);
  const [dy, setDy] = React.useState(0);
  const start = React.useRef<number | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    start.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (start.current === null) return;
    setDy(Math.max(0, e.clientY - start.current));
  };
  const onPointerUp = () => {
    if (start.current === null) return;
    start.current = null;
    if (dy > 80) setOpen(false);
    setDy(0);
  };

  return (
    <D.Portal>
      <div className="krds-modal fade in shown hb-kit hb-drawer" data-type="bottom-sheet">
        <div className="modal-dialog">
          <D.Content
            ref={ref}
            className={cx("modal-content", className)}
            style={dy ? { ...style, transform: `translateY(${dy}px)`, transition: "none" } : style}
            {...props}
          >
            {handle && (
              <div
                className="hb-drawer-handle"
                aria-hidden="true"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
            )}
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

export function DrawerHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("modal-header", className)} {...props} />;
}

export const DrawerTitle = React.forwardRef<HTMLHeadingElement, React.ComponentPropsWithoutRef<typeof D.Title>>(
  function DrawerTitle({ className, ...props }, ref) {
    return <D.Title ref={ref} className={cx("modal-title", className)} {...props} />;
  },
);

export const DrawerDescription = React.forwardRef<HTMLParagraphElement, React.ComponentPropsWithoutRef<typeof D.Description>>(
  function DrawerDescription({ className, ...props }, ref) {
    return <D.Description ref={ref} className={cx("hb-modal-desc", className)} {...props} />;
  },
);

export function DrawerBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("modal-conts", className)} {...props} />;
}

export function DrawerFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("modal-btn btn-wrap", className)} {...props} />;
}

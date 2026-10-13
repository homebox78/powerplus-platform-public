"use client";
// 오른쪽 클릭 메뉴 — shadcn ContextMenu 와 같은 사용법 (모양은 드롭다운 메뉴와 같다)
//   <ContextMenu>
//     <ContextMenuTrigger className="hb-context-area">첨부파일 목록</ContextMenuTrigger>
//     <ContextMenuContent>
//       <ContextMenuItem>내려받기</ContextMenuItem>
//     </ContextMenuContent>
//   </ContextMenu>
//
// 접근성: 마우스 오른쪽 클릭뿐 아니라 키보드(Shift+F10·메뉴 키)로도 열린다(radix-ui).
// 영역만으로는 메뉴가 있는 줄 모르므로, 같은 기능을 버튼이나 드롭다운 메뉴로도 제공하는 것을 권장한다.
import * as React from "react";
import { ContextMenu as CM } from "radix-ui";
import { cx } from "./utils";

export const ContextMenu = CM.Root;
export const ContextMenuGroup = CM.Group;
export const ContextMenuSub = CM.Sub;
export const ContextMenuRadioGroup = CM.RadioGroup;

export const ContextMenuTrigger = React.forwardRef<
  HTMLSpanElement,
  React.ComponentPropsWithoutRef<typeof CM.Trigger>
>(function ContextMenuTrigger({ className, ...props }, ref) {
  return <CM.Trigger ref={ref} className={className} {...props} />;
});

export const ContextMenuContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof CM.Content>
>(function ContextMenuContent({ className, ...props }, ref) {
  return (
    <CM.Portal>
      <CM.Content ref={ref} className={cx("hb-kit", "hb-menu", className)} {...props} />
    </CM.Portal>
  );
});

export const ContextMenuItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof CM.Item> & { inset?: boolean; variant?: "default" | "danger" }
>(function ContextMenuItem({ className, inset, variant, ...props }, ref) {
  return <CM.Item ref={ref} className={cx("hb-menu-item", inset && "inset", variant === "danger" && "danger", className)} {...props} />;
});

export const ContextMenuCheckboxItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof CM.CheckboxItem>
>(function ContextMenuCheckboxItem({ className, children, ...props }, ref) {
  return (
    <CM.CheckboxItem ref={ref} className={cx("hb-menu-item", "has-indicator", className)} {...props}>
      <CM.ItemIndicator className="hb-menu-indicator hb-menu-check" />
      {children}
    </CM.CheckboxItem>
  );
});

export const ContextMenuRadioItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof CM.RadioItem>
>(function ContextMenuRadioItem({ className, children, ...props }, ref) {
  return (
    <CM.RadioItem ref={ref} className={cx("hb-menu-item", "has-indicator", className)} {...props}>
      <CM.ItemIndicator className="hb-menu-indicator hb-menu-dot" />
      {children}
    </CM.RadioItem>
  );
});

export const ContextMenuLabel = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof CM.Label> & { inset?: boolean }
>(function ContextMenuLabel({ className, inset, ...props }, ref) {
  return <CM.Label ref={ref} className={cx("hb-menu-label", inset && "inset", className)} {...props} />;
});

export const ContextMenuSeparator = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof CM.Separator>
>(function ContextMenuSeparator({ className, ...props }, ref) {
  return <CM.Separator ref={ref} className={cx("hb-menu-separator", className)} {...props} />;
});

export function ContextMenuShortcut({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cx("hb-menu-shortcut", className)} {...props} />;
}

export const ContextMenuSubTrigger = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof CM.SubTrigger> & { inset?: boolean }
>(function ContextMenuSubTrigger({ className, inset, children, ...props }, ref) {
  return (
    <CM.SubTrigger ref={ref} className={cx("hb-menu-item", inset && "inset", className)} {...props}>
      {children}
      <i className="svg-icon ico-angle right hb-menu-sub-arrow" aria-hidden="true" />
    </CM.SubTrigger>
  );
});

export const ContextMenuSubContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof CM.SubContent>
>(function ContextMenuSubContent({ className, sideOffset = 4, ...props }, ref) {
  return (
    <CM.Portal>
      <CM.SubContent ref={ref} sideOffset={sideOffset} className={cx("hb-kit", "hb-menu", className)} {...props} />
    </CM.Portal>
  );
});

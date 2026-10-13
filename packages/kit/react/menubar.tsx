"use client";
// 메뉴 막대 — shadcn Menubar 와 같은 사용법 (행정 업무 화면의 상단 명령 막대)
//   <Menubar aria-label="문서 편집">
//     <MenubarMenu>
//       <MenubarTrigger>파일</MenubarTrigger>
//       <MenubarContent>
//         <MenubarItem>새 문서<MenubarShortcut>Ctrl+N</MenubarShortcut></MenubarItem>
//       </MenubarContent>
//     </MenubarMenu>
//   </Menubar>
//
// 접근성(WAI-ARIA 메뉴 막대): ←/→ 로 막대 안 메뉴를 옮겨 다니고, ↓·Enter 로 열고,
// 열린 채 ←/→ 를 누르면 옆 메뉴가 바로 열린다. Esc 는 닫고 막대로 복귀(radix-ui).
import * as React from "react";
import { Menubar as MB } from "radix-ui";
import { cx } from "./utils";

export const MenubarMenu = MB.Menu;
export const MenubarGroup = MB.Group;
export const MenubarSub = MB.Sub;
export const MenubarRadioGroup = MB.RadioGroup;

export const Menubar = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof MB.Root>>(function Menubar(
  { className, ...props },
  ref,
) {
  return <MB.Root ref={ref} className={cx("hb-menubar", className)} {...props} />;
});

export const MenubarTrigger = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof MB.Trigger>>(
  function MenubarTrigger({ className, ...props }, ref) {
    return <MB.Trigger ref={ref} className={cx("hb-menubar-trigger", className)} {...props} />;
  },
);

export const MenubarContent = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof MB.Content>>(
  function MenubarContent({ className, align = "start", sideOffset = 6, alignOffset = -4, ...props }, ref) {
    return (
      <MB.Portal>
        <MB.Content
          ref={ref}
          align={align}
          sideOffset={sideOffset}
          alignOffset={alignOffset}
          className={cx("hb-kit", "hb-menu", className)}
          {...props}
        />
      </MB.Portal>
    );
  },
);

export const MenubarItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof MB.Item> & { inset?: boolean; variant?: "default" | "danger" }
>(function MenubarItem({ className, inset, variant, ...props }, ref) {
  return <MB.Item ref={ref} className={cx("hb-menu-item", inset && "inset", variant === "danger" && "danger", className)} {...props} />;
});

export const MenubarCheckboxItem = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof MB.CheckboxItem>>(
  function MenubarCheckboxItem({ className, children, ...props }, ref) {
    return (
      <MB.CheckboxItem ref={ref} className={cx("hb-menu-item", "has-indicator", className)} {...props}>
        <MB.ItemIndicator className="hb-menu-indicator hb-menu-check" />
        {children}
      </MB.CheckboxItem>
    );
  },
);

export const MenubarRadioItem = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof MB.RadioItem>>(
  function MenubarRadioItem({ className, children, ...props }, ref) {
    return (
      <MB.RadioItem ref={ref} className={cx("hb-menu-item", "has-indicator", className)} {...props}>
        <MB.ItemIndicator className="hb-menu-indicator hb-menu-dot" />
        {children}
      </MB.RadioItem>
    );
  },
);

export const MenubarLabel = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof MB.Label> & { inset?: boolean }
>(function MenubarLabel({ className, inset, ...props }, ref) {
  return <MB.Label ref={ref} className={cx("hb-menu-label", inset && "inset", className)} {...props} />;
});

export const MenubarSeparator = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof MB.Separator>>(
  function MenubarSeparator({ className, ...props }, ref) {
    return <MB.Separator ref={ref} className={cx("hb-menu-separator", className)} {...props} />;
  },
);

export function MenubarShortcut({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cx("hb-menu-shortcut", className)} {...props} />;
}

export const MenubarSubTrigger = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof MB.SubTrigger> & { inset?: boolean }
>(function MenubarSubTrigger({ className, inset, children, ...props }, ref) {
  return (
    <MB.SubTrigger ref={ref} className={cx("hb-menu-item", inset && "inset", className)} {...props}>
      {children}
      <i className="svg-icon ico-angle right hb-menu-sub-arrow" aria-hidden="true" />
    </MB.SubTrigger>
  );
});

export const MenubarSubContent = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof MB.SubContent>>(
  function MenubarSubContent({ className, sideOffset = 4, ...props }, ref) {
    return (
      <MB.Portal>
        <MB.SubContent ref={ref} sideOffset={sideOffset} className={cx("hb-kit", "hb-menu", className)} {...props} />
      </MB.Portal>
    );
  },
);

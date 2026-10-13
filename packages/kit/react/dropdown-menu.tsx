"use client";
// 드롭다운 메뉴 — shadcn DropdownMenu 와 같은 사용법 (모양은 KRDS 토큰)
//   <DropdownMenu>
//     <DropdownMenuTrigger asChild><Button variant="tertiary">내 민원</Button></DropdownMenuTrigger>
//     <DropdownMenuContent>
//       <DropdownMenuLabel>민원 관리</DropdownMenuLabel>
//       <DropdownMenuItem onSelect={…}>신청 내역</DropdownMenuItem>
//       <DropdownMenuSeparator />
//       <DropdownMenuSub>
//         <DropdownMenuSubTrigger>증명서 발급</DropdownMenuSubTrigger>
//         <DropdownMenuSubContent>…</DropdownMenuSubContent>
//       </DropdownMenuSub>
//     </DropdownMenuContent>
//   </DropdownMenu>
//
// 접근성(WAI-ARIA 메뉴 버튼): 동작은 radix-ui 가 맡는다 — ↑↓ 이동, → 하위 메뉴 열기, ← 닫기,
// Esc 닫고 버튼으로 포커스 복귀, 글자를 치면 그 글자로 시작하는 항목으로 이동.
// 메뉴는 body 끝에 붙으므로 최상위 요소에 hb-kit 을 붙인다.
import * as React from "react";
import { DropdownMenu as DM } from "radix-ui";
import { cx } from "./utils";

export const DropdownMenu = DM.Root;
export const DropdownMenuTrigger = DM.Trigger;
export const DropdownMenuGroup = DM.Group;
export const DropdownMenuSub = DM.Sub;
export const DropdownMenuRadioGroup = DM.RadioGroup;

export const DropdownMenuContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof DM.Content>
>(function DropdownMenuContent({ className, sideOffset = 6, align = "start", ...props }, ref) {
  return (
    <DM.Portal>
      <DM.Content ref={ref} sideOffset={sideOffset} align={align} className={cx("hb-kit", "hb-menu", className)} {...props} />
    </DM.Portal>
  );
});

export const DropdownMenuItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof DM.Item> & { inset?: boolean; variant?: "default" | "danger" }
>(function DropdownMenuItem({ className, inset, variant, ...props }, ref) {
  return <DM.Item ref={ref} className={cx("hb-menu-item", inset && "inset", variant === "danger" && "danger", className)} {...props} />;
});

export const DropdownMenuCheckboxItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof DM.CheckboxItem>
>(function DropdownMenuCheckboxItem({ className, children, ...props }, ref) {
  return (
    <DM.CheckboxItem ref={ref} className={cx("hb-menu-item", "has-indicator", className)} {...props}>
      <DM.ItemIndicator className="hb-menu-indicator hb-menu-check" />
      {children}
    </DM.CheckboxItem>
  );
});

export const DropdownMenuRadioItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof DM.RadioItem>
>(function DropdownMenuRadioItem({ className, children, ...props }, ref) {
  return (
    <DM.RadioItem ref={ref} className={cx("hb-menu-item", "has-indicator", className)} {...props}>
      <DM.ItemIndicator className="hb-menu-indicator hb-menu-dot" />
      {children}
    </DM.RadioItem>
  );
});

export const DropdownMenuLabel = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof DM.Label> & { inset?: boolean }
>(function DropdownMenuLabel({ className, inset, ...props }, ref) {
  return <DM.Label ref={ref} className={cx("hb-menu-label", inset && "inset", className)} {...props} />;
});

export const DropdownMenuSeparator = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof DM.Separator>
>(function DropdownMenuSeparator({ className, ...props }, ref) {
  return <DM.Separator ref={ref} className={cx("hb-menu-separator", className)} {...props} />;
});

/** 단축키 표시(보조 정보 — 실제 단축키 연결은 쓰는 쪽에서) */
export function DropdownMenuShortcut({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cx("hb-menu-shortcut", className)} {...props} />;
}

export const DropdownMenuSubTrigger = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof DM.SubTrigger> & { inset?: boolean }
>(function DropdownMenuSubTrigger({ className, inset, children, ...props }, ref) {
  return (
    <DM.SubTrigger ref={ref} className={cx("hb-menu-item", inset && "inset", className)} {...props}>
      {children}
      <i className="svg-icon ico-angle right hb-menu-sub-arrow" aria-hidden="true" />
    </DM.SubTrigger>
  );
});

export const DropdownMenuSubContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof DM.SubContent>
>(function DropdownMenuSubContent({ className, sideOffset = 4, ...props }, ref) {
  return (
    <DM.Portal>
      <DM.SubContent ref={ref} sideOffset={sideOffset} className={cx("hb-kit", "hb-menu", className)} {...props} />
    </DM.Portal>
  );
});

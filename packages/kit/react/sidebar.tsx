"use client";
// 사이드바 — shadcn Sidebar 와 같은 사용법 (모양은 KRDS 토큰으로 새로 지음)
//   <SidebarProvider>
//     <Sidebar aria-label="업무 메뉴">
//       <SidebarHeader>…</SidebarHeader>
//       <SidebarContent>
//         <SidebarGroup>
//           <SidebarGroupLabel>민원 업무</SidebarGroupLabel>
//           <SidebarMenu>
//             <SidebarMenuItem><SidebarMenuButton icon="file" href="/apply" isActive>신청 현황</SidebarMenuButton></SidebarMenuItem>
//           </SidebarMenu>
//         </SidebarGroup>
//       </SidebarContent>
//       <SidebarFooter>…</SidebarFooter>
//     </Sidebar>
//     <SidebarInset><SidebarTrigger /> 본문</SidebarInset>
//   </SidebarProvider>
// 접으면 아이콘만 남고, 메뉴 이름은 화면 밖 글자(스크린리더)와 마우스 풍선(title)으로 남는다.
import * as React from "react";
import { cx, useUid } from "./utils";

interface Ctx {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
  id: string;
}
const SidebarCtx = React.createContext<Ctx | null>(null);

export function useSidebar() {
  const c = React.useContext(SidebarCtx);
  if (!c) throw new Error("SidebarProvider 안에서만 쓸 수 있습니다");
  return c;
}

export interface SidebarProviderProps extends React.HTMLAttributes<HTMLDivElement> {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const SidebarProvider = React.forwardRef<HTMLDivElement, SidebarProviderProps>(function SidebarProvider(
  { open, defaultOpen = true, onOpenChange, className, children, ...props },
  ref,
) {
  const [inner, setInner] = React.useState(defaultOpen);
  const id = useUid("hb-sidebar");
  const current = open ?? inner;
  const setOpen = (v: boolean) => {
    if (open === undefined) setInner(v);
    onOpenChange?.(v);
  };
  return (
    <SidebarCtx.Provider value={{ open: current, setOpen, toggle: () => setOpen(!current), id }}>
      <div ref={ref} data-state={current ? "expanded" : "collapsed"} className={cx("hb-sidebar-wrapper", className)} {...props}>
        {children}
      </div>
    </SidebarCtx.Provider>
  );
});

export const Sidebar = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(function Sidebar({ className, ...props }, ref) {
  const s = useSidebar();
  return <aside ref={ref} id={s.id} className={cx("hb-sidebar", className)} {...props} />;
});

const box = (name: string, cls: string) => {
  const C = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
    <div ref={ref} className={cx(cls, className)} {...props} />
  ));
  C.displayName = name;
  return C;
};

export const SidebarHeader = box("SidebarHeader", "hb-sidebar-header");
export const SidebarContent = box("SidebarContent", "hb-sidebar-content");
export const SidebarFooter = box("SidebarFooter", "hb-sidebar-footer");
export const SidebarGroup = box("SidebarGroup", "hb-sidebar-group");
export const SidebarGroupLabel = box("SidebarGroupLabel", "hb-sidebar-group-label");
export const SidebarInset = box("SidebarInset", "hb-sidebar-inset");

export const SidebarMenu = React.forwardRef<HTMLUListElement, React.HTMLAttributes<HTMLUListElement>>(function SidebarMenu({ className, ...props }, ref) {
  return <ul ref={ref} className={cx("hb-sidebar-menu", className)} {...props} />;
});

export const SidebarMenuItem = React.forwardRef<HTMLLIElement, React.LiHTMLAttributes<HTMLLIElement>>(function SidebarMenuItem({ className, ...props }, ref) {
  return <li ref={ref} className={cx("hb-sidebar-menu-item", className)} {...props} />;
});

export interface SidebarMenuButtonProps extends React.HTMLAttributes<HTMLElement> {
  /** 주면 <a>, 없으면 <button> */
  href?: string;
  /** 지금 보고 있는 메뉴 */
  isActive?: boolean;
  /** KRDS 아이콘 이름 (svg-icon ico-<이름>) */
  icon?: string;
  /** 접었을 때 풍선 글자 (기본: 글자 children) */
  tooltip?: string;
}

export const SidebarMenuButton = React.forwardRef<HTMLElement, SidebarMenuButtonProps>(function SidebarMenuButton(
  { href, isActive, icon, tooltip, className, children, ...props },
  ref,
) {
  const s = useSidebar();
  const text = tooltip ?? (typeof children === "string" ? children : undefined);
  const body = (
    <>
      {icon && <i className={`svg-icon ico-${icon}`} aria-hidden="true" />}
      <span className="hb-sidebar-label">{children}</span>
    </>
  );
  const common = {
    className: cx("hb-sidebar-menu-button", className),
    "data-active": isActive ? "true" : undefined,
    title: !s.open ? text : undefined,
    ...props,
  };
  return href ? (
    <a ref={ref as React.Ref<HTMLAnchorElement>} href={href} aria-current={isActive ? "page" : undefined} {...common}>
      {body}
    </a>
  ) : (
    <button ref={ref as React.Ref<HTMLButtonElement>} type="button" {...common}>
      {body}
    </button>
  );
});

export const SidebarTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(function SidebarTrigger(
  { className, onClick, children, ...props },
  ref,
) {
  const s = useSidebar();
  return (
    <button
      ref={ref}
      type="button"
      aria-expanded={s.open}
      aria-controls={s.id}
      className={cx("hb-sidebar-trigger", className)}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) s.toggle();
      }}
      {...props}
    >
      <i className="svg-icon ico-all" aria-hidden="true" />
      <span className="sr-only">{children ?? "사이드 메뉴 펼침"}</span>
    </button>
  );
});

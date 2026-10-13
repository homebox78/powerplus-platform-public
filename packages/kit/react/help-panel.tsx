"use client";
// 도움 패널 — KRDS 「도움 패널(help_panel)」 마크업 그대로. 화면 오른쪽에서 열리는 보조 패널.
//   <HelpPanel>
//     <HelpPanelTrigger />                         ← "도움말" 열기 버튼
//     <HelpPanelContent>
//       <Tabs defaultValue="help" className="layer">…도움 / 따라하기 탭…</Tabs>
//       또는 바로
//       <HelpPanelSection>
//         <HelpPanelTitle>전자문서지갑</HelpPanelTitle>
//         <HelpPanelDescription><p>…</p></HelpPanelDescription>
//         <HelpPanelLinks><HelpPanelLink href="…" icon="go" newWindow>앱 내려받기</HelpPanelLink></HelpPanelLinks>
//       </HelpPanelSection>
//     </HelpPanelContent>
//   </HelpPanel>
//
// 접근성: 열기 버튼은 aria-expanded·aria-controls 로 패널과 짝. 열면 패널(role=complementary)로 포커스가
// 옮겨 가고, "접어두기" 버튼이나 Esc 로 닫으면 열기 버튼으로 돌아온다. 닫힌 패널은 KRDS CSS 가
// visibility:hidden 으로 숨겨 Tab 으로 들어가지 않는다.
// inline 을 주면 화면 고정이 아니라 가장 가까운 .hb-help-stage 안에 붙는다(미리보기·문서용).
import * as React from "react";
import { cx, useUid } from "./utils";

interface Ctx {
  open: boolean;
  setOpen: (v: boolean, focusBack?: boolean) => void;
  panelId: string;
  inline: boolean;
  trigger: React.RefObject<HTMLButtonElement | null>;
  userOpened: React.MutableRefObject<boolean>;
}
const HelpCtx = React.createContext<Ctx | null>(null);
const useHelp = () => {
  const c = React.useContext(HelpCtx);
  if (!c) throw new Error("HelpPanel 안에서만 쓸 수 있습니다");
  return c;
};

export interface HelpPanelProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  inline?: boolean;
  children?: React.ReactNode;
}

export function HelpPanel({ open, defaultOpen = false, onOpenChange, inline = false, children }: HelpPanelProps) {
  const [inner, setInner] = React.useState(defaultOpen);
  const panelId = useUid("hb-help");
  const trigger = React.useRef<HTMLButtonElement | null>(null);
  const userOpened = React.useRef(false);
  const isOpen = open ?? inner;
  const setOpen = (v: boolean, focusBack = false) => {
    if (open === undefined) setInner(v);
    onOpenChange?.(v);
    if (!v && focusBack) setTimeout(() => trigger.current?.focus(), 0);
  };
  return <HelpCtx.Provider value={{ open: isOpen, setOpen, panelId, inline, trigger, userOpened }}>{children}</HelpCtx.Provider>;
}

export const HelpPanelTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  function HelpPanelTrigger({ className, children = "도움말", onClick, ...props }, ref) {
    const c = useHelp();
    return (
      <button
        ref={(el) => {
          c.trigger.current = el;
          if (typeof ref === "function") ref(el);
          else if (ref) ref.current = el;
        }}
        type="button"
        className={cx("krds-btn small tertiary btn-help-panel expand btn-help-exec", className)}
        aria-expanded={c.open}
        aria-controls={c.panelId}
        onClick={(e) => {
          onClick?.(e);
          c.userOpened.current = true;
          c.setOpen(true);
        }}
        {...props}
      >
        <i className="svg-icon ico-fold" aria-hidden="true" /> {children}
      </button>
    );
  },
);

export interface HelpPanelContentProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 패널 이름(스크린리더). 기본 "도움말" */
  label?: string;
  foldLabel?: string;
}

export function HelpPanelContent({ label = "도움말", foldLabel = "접어두기", className, children, ...props }: HelpPanelContentProps) {
  const c = useHelp();
  const wrap = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (c.open && c.userOpened.current) setTimeout(() => wrap.current?.focus(), 50);
    c.userOpened.current = false;
  }, [c.open, c.userOpened]);
  return (
    <div
      id={c.panelId}
      className={cx("krds-help-panel", c.open && "expand", c.inline && "hb-help-panel-inline", className)}
      {...props}
    >
      <div
        ref={wrap}
        className="help-panel-wrap"
        role="complementary"
        aria-label={label}
        tabIndex={c.open ? 0 : undefined}
        onKeyDown={(e) => {
          if (e.key === "Escape") c.setOpen(false, true);
        }}
      >
        <div className="help-conts-area">
          {children}
          <button type="button" className="krds-btn small tertiary btn-help-panel fold" onClick={() => c.setOpen(false, true)}>
            <span className="sr-only">{label}</span> {foldLabel} <i className="svg-icon ico-angle right" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

export interface HelpPanelSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  /** help = 도움 본문 · related = 관련 서비스(윗줄로 구분) */
  variant?: "help" | "related";
}

/** 도움 내용 한 덩어리. related 는 conts-wrap 을 여러 개 넣을 수 있게 children 을 그대로 둔다 */
export function HelpPanelSection({ variant = "help", className, children, ...props }: HelpPanelSectionProps) {
  return (
    <div className={cx("conts-area", variant === "help" ? "help-conts" : "related-service", className)} {...props}>
      {variant === "help" ? <div className="conts-wrap">{children}</div> : children}
    </div>
  );
}

/** 관련 서비스 안의 묶음 하나 */
export function HelpPanelGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("conts-wrap", className)} {...props} />;
}

export function HelpPanelTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h4 className={cx("help-title", className)} {...props} />;
}

export function HelpPanelDescription({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("conts-desc", className)} {...props} />;
}

export function HelpPanelLinks({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) {
  return <ul className={cx("link-list", className)} {...props} />;
}

export interface HelpPanelLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  /** go = 바깥 링크 · angle = 안쪽 이동 · call·faq = 앞에 붙는 아이콘 */
  icon?: "go" | "angle" | "call" | "faq";
  /** 새 창으로 연다(title 에 "새 창 열림"을 붙인다) */
  newWindow?: boolean;
}

export function HelpPanelLink({ icon = "angle", newWindow, className, children, ...props }: HelpPanelLinkProps) {
  const lead = icon === "call" || icon === "faq";
  return (
    <li>
      <a
        className={cx("krds-btn xsmall link basic", className)}
        {...(newWindow ? { target: "_blank", rel: "noopener", title: "새 창 열림" } : {})}
        {...props}
      >
        {lead && <i className={`svg-icon ico-${icon}`} aria-hidden="true" />}
        {children}
        {icon === "go" && <i className="svg-icon ico-go" aria-hidden="true" />}
        {icon === "angle" && <i className="svg-icon ico-angle right" aria-hidden="true" />}
      </a>
    </li>
  );
}

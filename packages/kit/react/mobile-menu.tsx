"use client";
// 전체 메뉴(모바일) — KRDS 「메인 메뉴 : 모바일」
//   const [open, setOpen] = useState(false);
//   <button aria-expanded={open} onClick={() => setOpen(true)}>전체메뉴</button>
//   <MobileMenu open={open} onOpenChange={setOpen} items={[
//     { label: "민원", children: [
//       { label: "민원 신청", href: "…" },
//       { label: "증명서 발급", children: [{ label: "주민등록등본", href: "…" }, …] },   ← 3뎁스 펼침
//     ] },
//   ]} utilities={[…]} services={[…]} loginLabel="로그인" onSearch={(q) => …} bottomLinks={[…]} />
// 왼쪽 1뎁스를 누르면 오른쪽 목록이 그 묶음으로 스크롤되고, 스크롤하면 왼쪽 선택이 따라온다.
// 대화상자(role=dialog, aria-modal): 열리면 첫 요소로 포커스, Tab 은 안에서만 돈다, Esc·닫기·어두운 바깥 누르면 닫히고 여는 버튼으로 돌아간다.
// KRDS 는 1024px 이상 화면에서 이 메뉴를 숨긴다. 견본처럼 문서 안에 펼쳐 두려면 inline.
import * as React from "react";
import { cx, useUid } from "./utils";

export interface MobileMenuLink {
  label: string;
  href?: string;
  current?: boolean;
  external?: boolean;
  children?: MobileMenuLink[];
}
export interface MobileMenuSection {
  label: string;
  children: MobileMenuLink[];
}

export interface MobileMenuProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onSubmit"> {
  items: MobileMenuSection[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 문서 안에 펼쳐 둔다(견본·미리보기) — 대화상자가 아니다 */
  inline?: boolean;
  /** 맨 위 작은 글자 메뉴 (누리집 안내 등) */
  utilities?: Array<{ label: string; href?: string }>;
  /** 로그인 버튼 글자 — 비우면 안 보임 */
  loginLabel?: string;
  onLogin?: () => void;
  /** 아이콘 바로가기 (최대 4개) — icon 은 KRDS 아이콘 이름(없으면 회색 자리표시) */
  services?: Array<{ label: string; href?: string; icon?: string }>;
  /** 주면 메뉴 검색 칸이 생긴다 */
  onSearch?: (query: string) => void;
  /** 맨 아래 링크 */
  bottomLinks?: Array<{ label: string; href?: string; external?: boolean }>;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const MobileMenu = React.forwardRef<HTMLDivElement, MobileMenuProps>(function MobileMenu(
  { items, open = false, onOpenChange, inline, utilities, loginLabel, onLogin, services, onSearch, bottomLinks, className, "aria-label": label = "전체메뉴", ...props },
  ref,
) {
  const shown = inline || open;
  const base = useUid("hb-mgnb");
  const [active, setActive] = React.useState(0);
  const [depth3, setDepth3] = React.useState<Set<string>>(() => {
    const s = new Set<string>();
    items.forEach((sec, i) => sec.children.forEach((c, j) => c.children?.some((d) => d.current) && s.add(`${i}-${j}`)));
    return s;
  });
  const [q, setQ] = React.useState("");
  const panelRef = React.useRef<HTMLDivElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const restore = React.useRef<HTMLElement | null>(null);

  const close = () => onOpenChange?.(false);

  // 열릴 때: 포커스 옮기고, 배경 스크롤 막고, 닫힐 때 되돌린다
  React.useEffect(() => {
    if (inline || !open) return;
    restore.current = document.activeElement as HTMLElement | null;
    // 패널은 visibility 전환이 끝나야 포커스를 받는다 → 받을 때까지 다음 프레임에 다시 시도
    let n = 0;
    let t = 0;
    const tryFocus = () => {
      const el = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      el?.focus();
      if (document.activeElement !== el && n++ < 60) t = requestAnimationFrame(tryFocus);
    };
    tryFocus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(t);
      document.body.style.overflow = prev;
      restore.current?.focus?.();
    };
  }, [open, inline]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (inline) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== "Tab") return;
    const list = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((el) => el.offsetParent !== null);
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  // 오른쪽을 스크롤하면 왼쪽 선택이 따라온다
  const onScroll = () => {
    const body = bodyRef.current;
    if (!body) return;
    const lists = Array.from(body.querySelectorAll<HTMLElement>(".gnb-sub-list"));
    const top = body.scrollTop + 8;
    let cur = 0;
    lists.forEach((el, i) => {
      if (el.offsetTop - lists[0].offsetTop <= top) cur = i;
    });
    setActive(cur);
  };

  const jump = (i: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    const body = bodyRef.current;
    const target = document.getElementById(`${base}-${i}`);
    if (!body || !target) return;
    const first = body.querySelector<HTMLElement>(".gnb-sub-list");
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    body.scrollTo({ top: target.offsetTop - (first?.offsetTop ?? 0), behavior: reduce ? "auto" : "smooth" });
    setActive(i);
    target.focus({ preventScroll: true });
  };

  const toggle3 = (k: string) =>
    setDepth3((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const ext = (on?: boolean) => (on ? { target: "_blank", title: "새 창 열림", rel: "noopener" } : {});

  return (
    <div
      ref={ref}
      className={cx("krds-main-menu-mobile", shown && "is-open", !inline && "is-backdrop", inline && "hb-inline", className)}
      onClick={(e) => {
        if (!inline && e.target === e.currentTarget) close();
      }}
      {...props}
    >
      <div
        ref={panelRef}
        className="gnb-wrap"
        role={inline ? "navigation" : "dialog"}
        aria-modal={inline ? undefined : true}
        aria-label={label}
        onKeyDown={onKeyDown}
      >
        <div className="gnb-header">
          {utilities?.length ? (
            <div className="gnb-utils">
              <ul className="utility-list">
                {utilities.map((u, i) => (
                  <li key={i}>
                    <a href={u.href} className="krds-btn xsmall text">{u.label}</a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {loginLabel && (
            <div className="gnb-login">
              <button type="button" className="krds-btn large text" onClick={onLogin}>
                <i className="svg-icon ico-log" aria-hidden="true" /> {loginLabel}
              </button>
            </div>
          )}
          {services?.length ? (
            <div className="gnb-service-menu">
              {services.map((s, i) => (
                <a key={i} href={s.href} className={cx("link", s.icon && "hb-has-icon")}>
                  {s.icon && <i className={`svg-icon ico-${s.icon}`} aria-hidden="true" />}
                  {s.label}
                </a>
              ))}
            </div>
          ) : null}
          {onSearch && (
            <form
              className="sch-input"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                onSearch(q);
              }}
            >
              <input
                type="search"
                className="krds-input"
                placeholder="찾고자 하는 메뉴명을 입력해 주세요"
                aria-label="찾고자 하는 메뉴명 입력"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <button type="submit" className="krds-btn medium icon ico-search">
                <span className="sr-only">검색</span>
                <i className="svg-icon ico-sch" aria-hidden="true" />
              </button>
            </form>
          )}
        </div>

        <div className="gnb-body" ref={bodyRef} onScroll={onScroll}>
          <div className="gnb-menu">
            <div className="menu-wrap">
              <ul>
                {items.map((sec, i) => (
                  <li key={i}>
                    <a href={`#${base}-${i}`} className={cx("gnb-main-trigger", active === i && "active")} aria-current={active === i ? "true" : undefined} onClick={jump(i)}>
                      {sec.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div className="submenu-wrap">
              {items.map((sec, i) => (
                <div key={i} className="gnb-sub-list" id={`${base}-${i}`} tabIndex={-1} aria-labelledby={`${base}-${i}-t`}>
                  <h2 className="sub-title" id={`${base}-${i}-t`}>{sec.label}</h2>
                  <ul>
                    {sec.children.map((c, j) => {
                      if (!c.children?.length) {
                        return (
                          <li key={j}>
                            <a href={c.href} className={cx("gnb-sub-trigger", c.current && "selected")} aria-current={c.current ? "page" : undefined} {...ext(c.external)}>
                              {c.label}
                            </a>
                          </li>
                        );
                      }
                      const k = `${i}-${j}`;
                      const on = depth3.has(k);
                      const d3 = `${base}-d3-${k}`;
                      return (
                        <li key={j}>
                          <button type="button" className={cx("gnb-sub-trigger", "has-depth3", on && "active")} aria-expanded={on} aria-controls={d3} onClick={() => toggle3(k)}>
                            {c.label}
                          </button>
                          <div className={cx("depth3-wrap", on && "is-open")} id={d3}>
                            <ul>
                              {c.children.map((d, m) => (
                                <li key={m}>
                                  <a href={d.href} className={cx("depth3-trigger", d.current && "selected")} aria-current={d.current ? "page" : undefined} {...ext(d.external)}>
                                    {d.label}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          {bottomLinks?.length ? (
            <div className="gnb-bottom">
              {bottomLinks.map((b, i) => (
                <a key={i} href={b.href} className="krds-btn small text" {...ext(b.external)}>
                  {b.label} <i className={cx("svg-icon", b.external ? "ico-go" : "ico-angle right")} aria-hidden="true" />
                </a>
              ))}
            </div>
          ) : null}
        </div>

        {!inline && (
          <button type="button" className="krds-btn medium icon hb-mobile-menu-close" onClick={close}>
            <span className="sr-only">전체메뉴 닫기</span>
            <i className="svg-icon ico-popup-close" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
});

"use client";
// 사이드 메뉴(LNB) — KRDS 「사이드 메뉴」
//   <SideNavigation title="민원 안내" items={[
//     { label: "민원 신청", children: [
//       { label: "여권 발급", href: "/passport", current: true },
//       { label: "증명서 발급", children: [ { label: "주민등록등본", href: "…" }, … ] },   ← 4뎁스는 옆으로 덮는 판
//     ] },
//     { label: "자주 묻는 질문", href: "/faq" },
//   ]} />
// 2뎁스: 하위가 있으면 펼침 버튼(aria-expanded), 없으면 링크. 현재 페이지를 품은 항목은 처음부터 펼친다.
// 3뎁스에 하위가 있으면 4뎁스 판이 메뉴 위로 덮인다 — 판의 제목 버튼·Esc 로 닫고 원래 버튼으로 포커스가 돌아온다.
// KRDS 견본의 menubar/menu 역할은 방향키 조작을 약속하므로 쓰지 않고, 사이트 메뉴 권장 형태(펼침 버튼 + 링크)로 둔다.
import * as React from "react";
import { cx, useUid } from "./utils";

export interface SideNavigationItem {
  label: string;
  href?: string;
  /** 지금 보고 있는 페이지 */
  current?: boolean;
  children?: SideNavigationItem[];
}

export interface SideNavigationProps extends React.HTMLAttributes<HTMLElement> {
  /** 1뎁스 이름(메뉴 제목) */
  title: string;
  items: SideNavigationItem[];
}

const hasCurrent = (it: SideNavigationItem): boolean => !!it.current || !!it.children?.some(hasCurrent);

export const SideNavigation = React.forwardRef<HTMLElement, SideNavigationProps>(function SideNavigation(
  { title, items, className, "aria-label": label, ...props },
  ref,
) {
  const base = useUid("hb-lnb");
  const [open, setOpen] = React.useState<Set<number>>(() => new Set(items.map((it, i) => (hasCurrent(it) ? i : -1)).filter((i) => i >= 0)));
  const [popup, setPopup] = React.useState<string | null>(null);
  const triggers = React.useRef(new Map<string, HTMLButtonElement | null>());
  const titles = React.useRef(new Map<string, HTMLButtonElement | null>());

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  // 판은 visibility 전환(0.4초)이 끝나야 포커스를 받을 수 있다 → 받을 때까지 다음 프레임에 다시 시도
  React.useEffect(() => {
    if (!popup) return;
    const el = titles.current.get(popup);
    let n = 0;
    let raf = 0;
    const tryFocus = () => {
      el?.focus();
      if (document.activeElement !== el && n++ < 60) raf = requestAnimationFrame(tryFocus);
    };
    tryFocus();
    return () => cancelAnimationFrame(raf);
  }, [popup]);

  const closePopup = (key: string, refocus: boolean) => {
    setPopup((p) => (p === key ? null : p));
    if (refocus) triggers.current.get(key)?.focus();
  };

  return (
    <nav ref={ref} aria-label={label ?? title} className={cx("krds-side-navigation", className)} {...props}>
      <h2 className="lnb-tit">{title}</h2>
      <ul className="lnb-list">
        {items.map((it, i) => {
          const subId = `${base}-${i}`;
          if (!it.children?.length) {
            return (
              <li key={i} className={cx("lnb-item", it.current && "active")}>
                <a href={it.href} className={cx("lnb-btn", "lnb-link", it.current && "active")} aria-current={it.current ? "page" : undefined}>
                  {it.label}
                </a>
              </li>
            );
          }
          const on = open.has(i);
          return (
            <li key={i} className={cx("lnb-item", on && "active")}>
              <button type="button" className={cx("lnb-btn", "lnb-toggle", on && "active")} aria-expanded={on} aria-controls={subId} onClick={() => toggle(i)}>
                {it.label}
              </button>
              <div className="lnb-submenu">
                <ul id={subId}>
                  {it.children.map((sub, j) => {
                    const key = `${i}-${j}`;
                    if (!sub.children?.length) {
                      return (
                        <li key={j} className={cx("lnb-subitem", sub.current && "active")}>
                          <a href={sub.href} className={cx("lnb-btn", "lnb-link", sub.current && "selected")} aria-current={sub.current ? "page" : undefined}>
                            {sub.label}
                          </a>
                        </li>
                      );
                    }
                    const popId = `${base}-p-${key}`;
                    const pop = popup === key;
                    return (
                      <li key={j} className={cx("lnb-subitem", hasCurrent(sub) && "active")}>
                        <button
                          type="button"
                          ref={(el) => {
                            triggers.current.set(key, el);
                          }}
                          className={cx("lnb-btn", "lnb-toggle-popup", hasCurrent(sub) && "selected")}
                          aria-expanded={pop}
                          aria-controls={popId}
                          aria-haspopup="true"
                          onClick={() => setPopup(key)}
                        >
                          {sub.label}
                        </button>
                        <div
                          className={cx("lnb-submenu-lv2", pop && "active")}
                          id={popId}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              e.stopPropagation();
                              closePopup(key, true);
                            }
                          }}
                          onBlur={(e) => {
                            if (pop && !e.currentTarget.contains(e.relatedTarget as Node | null)) closePopup(key, false);
                          }}
                        >
                          <button
                            type="button"
                            className="lnb-btn-tit"
                            ref={(el) => {
                              titles.current.set(key, el);
                            }}
                            onClick={() => closePopup(key, true)}
                          >
                            {sub.label}
                            <span className="sr-only"> 닫고 이전 메뉴로</span>
                          </button>
                          <ul>
                            {sub.children.map((leaf, k) => (
                              <li key={k}>
                                <a href={leaf.href} className={cx("lnb-btn", leaf.current && "selected")} aria-current={leaf.current ? "page" : undefined}>
                                  {leaf.label}
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
            </li>
          );
        })}
      </ul>
    </nav>
  );
});

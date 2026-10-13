"use client";
// 주 메뉴(PC, 메가 메뉴) — KRDS 「메인 메뉴 : 데스크탑」
//   <NavigationMenu items={[
//     { label: "민원", groups: [
//       { label: "민원 신청", title: "민원 신청", titleHref: "/civil", links: [{ label: "여권 발급", href: "…" }, …],
//         banner: { badge: "신규 서비스", label: "모바일 신분증", href: "…" } },
//       { label: "민원 서식", href: "/forms" },                         ← 하위 없이 바로 이동
//     ] },
//     { label: "분야별 정보", title: "분야별 정보", links: [ … ] },       ← 2뎁스 없이 한 목록
//     { label: "열린 시장실", href: "/mayor" },                          ← 바로 이동
//   ]} />
// 1뎁스 버튼을 누르면 아래로 판이 열린다(aria-expanded). 판 왼쪽 2뎁스는 누르거나·마우스를 올리거나·포커스가 가면 오른쪽 목록이 바뀐다.
// 닫기: Esc(여는 버튼으로 포커스 복귀) · 바깥 누르기 · 포커스가 메뉴 밖으로 나가기.
// 키보드: 1뎁스끼리 ←/→ 이동, ↓ 로 판을 열고 안으로 들어간다.
import * as React from "react";
import { cx, useUid } from "./utils";

export interface NavigationMenuLink {
  label: string;
  href?: string;
  current?: boolean;
  /** 설명이 있으면 「설명형」 목록으로 그린다 */
  description?: string;
  /** 새 창으로 연다 */
  external?: boolean;
}
export interface NavigationMenuBanner {
  badge?: string;
  label: string;
  href?: string;
}
export interface NavigationMenuGroup {
  label: string;
  /** 하위 목록 없이 바로 이동하는 2뎁스 */
  href?: string;
  external?: boolean;
  /** 오른쪽 목록 제목 (기본: label) */
  title?: string;
  /** 제목 옆 「바로가기」 */
  titleHref?: string;
  links?: NavigationMenuLink[];
  banner?: NavigationMenuBanner;
  /** 배너 자리 — bottom(목록 아래, 기본) · right(오른쪽 칸, 목록은 2열) */
  bannerPosition?: "bottom" | "right";
}
export interface NavigationMenuEntry {
  label: string;
  /** 판 없이 바로 이동하는 1뎁스 */
  href?: string;
  /** 2뎁스 묶음 (왼쪽 칸 + 오른쪽 목록) */
  groups?: NavigationMenuGroup[];
  /** 2뎁스 없이 한 목록만 둘 때 */
  title?: string;
  links?: NavigationMenuLink[];
  banner?: NavigationMenuBanner;
  /** 한 목록일 때 배너 자리 — right(기본, 목록 3열) · bottom(목록 4열) */
  bannerPosition?: "bottom" | "right";
}

export interface NavigationMenuProps extends React.HTMLAttributes<HTMLElement> {
  items: NavigationMenuEntry[];
  /** 열린 1뎁스 이름 (없으면 "") */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

const groupHasCurrent = (g: NavigationMenuGroup) => !!g.links?.some((l) => l.current);
const entryHasCurrent = (e: NavigationMenuEntry) => !!e.links?.some((l) => l.current) || !!e.groups?.some(groupHasCurrent);
const opensPanel = (e: NavigationMenuEntry) => !!(e.groups?.length || e.links?.length);

function SubContent({ title, titleHref, links, banner }: { title: string; titleHref?: string; links: NavigationMenuLink[]; banner?: NavigationMenuBanner }) {
  const described = links.some((l) => l.description);
  return (
    <>
      <div className="gnb-sub-content">
        <h2 className="sub-title">
          <span>{title}</span>
          {titleHref && (
            <a href={titleHref} className="krds-btn link basic small">
              <span className="sr-only">{title} </span>
              <span className="underline">바로가기</span>
              <i className="svg-icon ico-angle right" aria-hidden="true" />
            </a>
          )}
        </h2>
        <ul className={cx(described && "type-description")}>
          {links.map((l, k) => {
            const ext = l.external ? { target: "_blank", title: "새 창 열림", rel: "noopener" } : {};
            return described ? (
              <li key={k}>
                <h3 className="tit">
                  <a href={l.href} aria-current={l.current ? "page" : undefined} {...ext}>
                    {l.label}
                    {l.external && <i className="svg-icon ico-go" aria-hidden="true" />}
                  </a>
                </h3>
                {l.description && <p className="txt">{l.description}</p>}
              </li>
            ) : (
              <li key={k}>
                <a href={l.href} className={cx(l.current && "active")} aria-current={l.current ? "page" : undefined} {...ext}>
                  {l.label}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
      {banner && (
        <div className="gnb-sub-banner">
          {banner.badge && <span className="krds-badge bg-secondary">{banner.badge}</span>}
          <a href={banner.href} className="krds-btn medium text">
            {banner.label} <i className="svg-icon ico-angle right" aria-hidden="true" />
          </a>
        </div>
      )}
    </>
  );
}

export const NavigationMenu = React.forwardRef<HTMLElement, NavigationMenuProps>(function NavigationMenu(
  { items, value, defaultValue = "", onValueChange, className, "aria-label": label = "주 메뉴", ...props },
  ref,
) {
  const [inner, setInner] = React.useState(defaultValue);
  const base = useUid("hb-gnb");
  const openLabel = value ?? inner;
  const setOpen = (v: string) => {
    if (value === undefined) setInner(v);
    onValueChange?.(v);
  };
  const [subActive, setSubActive] = React.useState<Record<number, number>>(() => {
    const init: Record<number, number> = {};
    items.forEach((e, i) => {
      if (!e.groups) return;
      const cur = e.groups.findIndex(groupHasCurrent);
      init[i] = cur >= 0 ? cur : e.groups.findIndex((g) => g.links?.length);
    });
    return init;
  });
  const rootRef = React.useRef<HTMLElement | null>(null);
  const mainTriggers = React.useRef<Array<HTMLElement | null>>([]);

  const openIndex = items.findIndex((e) => e.label === openLabel && opensPanel(e));

  React.useEffect(() => {
    if (openIndex < 0) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen("");
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openIndex]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && openIndex >= 0) {
      e.preventDefault();
      setOpen("");
      mainTriggers.current[openIndex]?.focus();
      return;
    }
    const t = e.target as HTMLElement;
    const i = mainTriggers.current.indexOf(t);
    if (i < 0) return;
    const list = mainTriggers.current.filter(Boolean) as HTMLElement[];
    const at = list.indexOf(t);
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const n = e.key === "ArrowRight" ? (at + 1) % list.length : (at - 1 + list.length) % list.length;
      list[n].focus();
    } else if (e.key === "ArrowDown" && opensPanel(items[i])) {
      e.preventDefault();
      setOpen(items[i].label);
      window.setTimeout(() => {
        document.getElementById(`${base}-${i}`)?.querySelector<HTMLElement>("a, button")?.focus();
      }, 0);
    }
  };

  return (
    <nav
      ref={(el) => {
        rootRef.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      }}
      aria-label={label}
      className={cx("krds-main-menu", className)}
      onKeyDown={onKeyDown}
      onBlur={(e) => {
        if (openIndex >= 0 && e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) setOpen("");
      }}
      {...props}
    >
      <div className="inner">
        <ul className="gnb-menu">
          {items.map((entry, i) => {
            const setRef = (el: HTMLElement | null) => {
              mainTriggers.current[i] = el;
            };
            if (!opensPanel(entry)) {
              return (
                <li key={i}>
                  <a ref={setRef} href={entry.href} className="gnb-main-trigger is-link">
                    {entry.label}
                  </a>
                </li>
              );
            }
            const on = openIndex === i;
            const wrapId = `${base}-${i}`;
            return (
              <li key={i}>
                <button
                  ref={setRef}
                  type="button"
                  className={cx("gnb-main-trigger", on && "active", entryHasCurrent(entry) && "selected")}
                  aria-expanded={on}
                  aria-controls={wrapId}
                  onClick={() => setOpen(on ? "" : entry.label)}
                >
                  {entry.label}
                </button>
                <div id={wrapId} className={cx("gnb-toggle-wrap", on && "is-open")}>
                  {entry.groups?.length ? (
                    <div className="gnb-main-list" data-has-submenu="true">
                      <ul>
                        {entry.groups.map((g, j) => {
                          if (!g.links?.length) {
                            const ext = g.external ? { target: "_blank", title: "새 창 열림", rel: "noopener" } : {};
                            return (
                              <li key={j}>
                                <a href={g.href} className={cx("gnb-sub-trigger", "is-link", g.external && "external-link")} {...ext}>
                                  {g.label}
                                </a>
                              </li>
                            );
                          }
                          const act = subActive[i] === j;
                          const listId = `${wrapId}-${j}`;
                          const pick = () => setSubActive((s) => (s[i] === j ? s : { ...s, [i]: j }));
                          return (
                            <li key={j}>
                              <button
                                type="button"
                                className={cx("gnb-sub-trigger", act && "active")}
                                aria-expanded={act}
                                aria-controls={listId}
                                onClick={pick}
                                onFocus={pick}
                                onMouseEnter={pick}
                              >
                                {g.label}
                              </button>
                              <div id={listId} className={cx("gnb-sub-list", act && "active", g.bannerPosition === "right" && "between")}>
                                <SubContent title={g.title ?? g.label} titleHref={g.titleHref} links={g.links} banner={g.banner} />
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : (
                    <div className="gnb-main-list">
                      <div className={cx("gnb-sub-list", "single-list", entry.bannerPosition !== "bottom" && "between")}>
                        <SubContent title={entry.title ?? entry.label} links={entry.links ?? []} banner={entry.banner} />
                      </div>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
});

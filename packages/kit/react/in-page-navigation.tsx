"use client";
// 콘텐츠 내 탐색 — KRDS 「콘텐츠 내 탐색」(이 페이지의 구성)
//   <InPageNavigation title="장애아동수당" items={[{ id: "overview", label: "서비스 개요" }, …]}
//     action={<a className="krds-btn medium" href="/apply">온라인 신청하기</a>} />
// 본문의 각 구역(id)이 화면에 들어오면 해당 목록 항목이 선택(active + aria-current)된다.
// 항목을 누르면 그 구역으로 스크롤하고 포커스를 옮긴다(움직임 줄이기면 바로 이동).
// KRDS 기본은 화면 오른쪽 고정 — 문서 흐름 안에 두려면 position="static".
import * as React from "react";
import { cx, useUid } from "./utils";

export interface InPageNavigationItem {
  /** 본문 구역의 id */
  id: string;
  label: string;
}

export interface InPageNavigationProps extends React.HTMLAttributes<HTMLDivElement> {
  items: InPageNavigationItem[];
  /** 페이지(서비스) 이름 */
  title: string;
  /** 위 작은 글자 (기본 「이 페이지의 구성」) */
  caption?: string;
  /** 아래 버튼 자리 */
  action?: React.ReactNode;
  /** 버튼 아래 안내 */
  info?: React.ReactNode;
  /** fixed = 화면 오른쪽 고정(KRDS 기본) · static = 문서 안 */
  position?: "fixed" | "static";
}

export const InPageNavigation = React.forwardRef<HTMLDivElement, InPageNavigationProps>(function InPageNavigation(
  { items, title, caption = "이 페이지의 구성", action, info, position = "fixed", className, ...props },
  ref,
) {
  const [active, setActive] = React.useState(items[0]?.id);
  const tid = useUid("hb-ipn");
  const key = items.map((i) => i.id).join("|");

  React.useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const first = items.find((i) => seen.get(i.id));
        if (first) setActive(first.id);
      },
      { rootMargin: "0px 0px -55% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const jump = (id: string) => (e: React.MouseEvent) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    setActive(id);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
    history.replaceState?.(null, "", `#${id}`);
  };

  return (
    <div ref={ref} className={cx("krds-in-page-navigation-type", position === "static" && "hb-static", className)} {...props}>
      <div className="krds-in-page-navigation-area">
        <div className="in-page-navigation-header">
          <p className="quick-caption">{caption}</p>
          <p className="quick-title" id={tid}>{title}</p>
        </div>
        <nav className="in-page-navigation-list" aria-labelledby={tid}>
          <ul>
            {items.map((it) => (
              <li key={it.id}>
                <a href={`#${it.id}`} className={cx(active === it.id && "active")} aria-current={active === it.id ? "location" : undefined} onClick={jump(it.id)}>
                  {it.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        {(action || info) && (
          <div className="in-page-navigation-action">
            {action}
            {info && <p className="quick-info">{info}</p>}
          </div>
        )}
      </div>
    </div>
  );
});

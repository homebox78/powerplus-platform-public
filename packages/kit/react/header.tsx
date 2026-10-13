"use client";
// 헤더 — KRDS 「헤더(header)」
//   <Header siteName="한빛시" logoSrc="/img/logo.svg"
//     utilityLinks={[{ label: "한빛시의회", href: "…", external: true }]}
//     utility={[<LanguageSwitcher key="lang" />, <Resize key="size" />]}
//     loginHref="/login" joinHref="/join" onSearchClick={openSearch} onMenuClick={openMenu} menuControls="mobile-nav">
//     <MainMenu … />            ← 메인 메뉴는 children 으로 받는다(헤더 아래 줄에 놓인다)
//   </Header>
// 로고는 이미지 주소로 받는다(정부 상징·기관 로고를 코드로 그리지 않는다). 없으면 기관명 글자.
// 전체메뉴 버튼은 KRDS 와 같이 1024px 이상에서 숨는다(데스크톱은 메인 메뉴를 쓴다).
import * as React from "react";
import { cx } from "./utils";

export interface HeaderUtilityLink {
  label: string;
  href: string;
  /** 새 창 열기 */
  external?: boolean;
}

export interface HeaderProps extends Omit<React.HTMLAttributes<HTMLElement>, "id"> {
  /** 누리집 이름(로고 대체 글자) */
  siteName: string;
  logoSrc?: string;
  logoAlt?: string;
  homeHref?: string;
  /** 맨 위 작은 링크 */
  utilityLinks?: HeaderUtilityLink[];
  /** 맨 위 줄에 더 넣을 부품(언어 변경·글자 크기 등). 배열이면 항목마다 칸을 나눈다 */
  utility?: React.ReactNode;
  /** 오른쪽 버튼 — 기본(통합검색·로그인·회원가입·전체메뉴)을 통째로 바꿀 때 */
  actions?: React.ReactNode;
  onSearchClick?: () => void;
  loginHref?: string;
  joinHref?: string;
  onMenuClick?: () => void;
  /** 전체메뉴가 여는 영역 id */
  menuControls?: string;
  /** 전체메뉴가 열려 있는지 */
  menuExpanded?: boolean;
  /** 화면 위에 붙이기(KRDS 기본). 미리보기·문서 안에서는 false */
  sticky?: boolean;
  /** KRDS 스타일이 id 로 걸려 있다(기본 krds-header). 한 문서에 하나만 둔다. */
  id?: string;
  /** 로고를 감쌀 제목 수준(KRDS 는 h2, 메인 화면은 h1 을 권장) */
  logoLevel?: "h1" | "h2" | "div";
}

export const Header = React.forwardRef<HTMLElement, HeaderProps>(function Header(
  {
    siteName,
    logoSrc,
    logoAlt,
    homeHref = "/",
    utilityLinks = [],
    utility,
    actions,
    onSearchClick,
    loginHref,
    joinHref,
    onMenuClick,
    menuControls,
    menuExpanded,
    sticky = true,
    id = "krds-header",
    logoLevel = "h2",
    className,
    children,
    ...props
  },
  ref,
) {
  const Logo = logoLevel;
  const extra = React.Children.toArray(utility);
  const hasUtility = utilityLinks.length > 0 || extra.length > 0;

  return (
    <header ref={ref} id={id} className={cx(!sticky && "hb-header--static", className)} {...props}>
      <div className="header-in">
        <div className="header-container">
          <div className="inner">
            {hasUtility && (
              <div className="header-utility">
                <ul className="utility-list">
                  {utilityLinks.map((l) => (
                    <li key={l.href + l.label}>
                      <a
                        href={l.href}
                        className="krds-btn small text"
                        target={l.external ? "_blank" : undefined}
                        rel={l.external ? "noopener noreferrer" : undefined}
                        title={l.external ? "새 창 열기" : undefined}
                      >
                        {l.label}{" "}
                        {l.external && <i className="svg-icon ico-go" aria-hidden="true" />}
                      </a>
                    </li>
                  ))}
                  {extra.map((node, i) => (
                    <li key={i}>{node}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="header-branding">
              <Logo className={cx("logo", "hb-gov-logo-box")}>
                <a href={homeHref} className="hb-gov-logo">
                  {logoSrc ? <img src={logoSrc} alt={logoAlt ?? siteName} /> : <span className="hb-gov-logo-text">{siteName}</span>}
                </a>
              </Logo>
              <div className="header-actions">
                {actions ?? (
                  <>
                    <button type="button" className="btn-navi sch" title="통합검색 레이어" onClick={onSearchClick}>
                      통합검색
                    </button>
                    {loginHref && (
                      <a href={loginHref} className="btn-navi login">
                        로그인
                      </a>
                    )}
                    {joinHref && (
                      <a href={joinHref} className="btn-navi join">
                        회원가입
                      </a>
                    )}
                    <button
                      type="button"
                      className="btn-navi all"
                      aria-controls={menuControls}
                      aria-expanded={menuControls ? !!menuExpanded : undefined}
                      onClick={onMenuClick}
                    >
                      전체메뉴
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        {children}
      </div>
    </header>
  );
});

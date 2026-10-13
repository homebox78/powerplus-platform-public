"use client";
// 푸터 — KRDS 「푸터(footer)」
//   <Footer orgName="한빛시" logoSrc="/img/logo-gray.svg"
//     address="(00000) 한빛시 한빛로 1 한빛시청"
//     contacts={[{ label: "대표전화 000-000-0000", note: "평일 09시~18시" }]}
//     links={[{ label: "찾아오시는 길", href: "/map" }]}
//     sns={[{ type: "youtube", href: "…" }]}
//     policyLinks={[{ label: "개인정보처리방침", href: "/privacy", point: true }]}
//     relatedSites={[{ title: "관련 기관", links: [{ label: "한빛시의회", href: "…" }] }]}
//     copyright="© 한빛시. All rights reserved."
//     identifier={{ orgName: "한빛시" }} />
// 관련 사이트 버튼을 누르면 목록이 버튼 줄 아래에 펼쳐진다(aria-expanded · Esc 로 닫기).
import * as React from "react";
import { cx, useUid } from "./utils";
import { Identifier, type IdentifierProps } from "./identifier";

export interface FooterLink {
  label: string;
  href: string;
  /** 강조(개인정보처리방침) */
  point?: boolean;
  external?: boolean;
}
export interface FooterContact {
  label: string;
  note?: string;
}
export type FooterSnsType = "instagram" | "youtube" | "x" | "facebook" | "blog";
export interface FooterSns {
  type: FooterSnsType;
  href: string;
  /** 보이지 않는 이름(비우면 종류 이름) */
  label?: string;
}
export interface FooterRelatedGroup {
  title: string;
  links: Array<{ label: string; href: string }>;
}

const SNS: Record<FooterSnsType, [string, string]> = {
  instagram: ["인스타그램", "ico-instagram"],
  youtube: ["유튜브", "ico-youtube"],
  x: ["X", "ico-sns-x"],
  facebook: ["페이스북", "ico-facebook"],
  blog: ["블로그", "ico-blog"],
};

export interface FooterProps extends Omit<React.HTMLAttributes<HTMLElement>, "id"> {
  orgName: string;
  logoSrc?: string;
  logoAlt?: string;
  address?: React.ReactNode;
  contacts?: FooterContact[];
  links?: FooterLink[];
  sns?: FooterSns[];
  policyLinks?: FooterLink[];
  copyright?: React.ReactNode;
  relatedSites?: FooterRelatedGroup[];
  /** 운영기관 식별자 — 넘기면 맨 아래에 붙는다 */
  identifier?: IdentifierProps;
  /** KRDS 스타일이 id 로 걸려 있다(기본 krds-footer) */
  id?: string;
}

export const Footer = React.forwardRef<HTMLElement, FooterProps>(function Footer(
  {
    orgName,
    logoSrc,
    logoAlt,
    address,
    contacts = [],
    links = [],
    sns = [],
    policyLinks = [],
    copyright,
    relatedSites = [],
    identifier,
    id = "krds-footer",
    className,
    children,
    ...props
  },
  ref,
) {
  const [openIdx, setOpenIdx] = React.useState<number | null>(null);
  const base = useUid("hb-foot");
  const btns = React.useRef<Array<HTMLButtonElement | null>>([]);
  const open = openIdx === null ? null : relatedSites[openIdx];

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && openIdx !== null) {
      e.preventDefault();
      btns.current[openIdx]?.focus();
      setOpenIdx(null);
    }
  };

  return (
    <footer ref={ref} id={id} className={className} onKeyDown={onKeyDown} {...props}>
      {relatedSites.length > 0 && (
        <>
          <div className="foot-quick">
            <div className="inner">
              {relatedSites.map((g, i) => (
                <button
                  key={g.title}
                  ref={(el) => {
                    btns.current[i] = el;
                  }}
                  type="button"
                  className="link"
                  aria-expanded={openIdx === i}
                  aria-controls={`${base}-rel`}
                  onClick={() => setOpenIdx(openIdx === i ? null : i)}
                >
                  {g.title}
                </button>
              ))}
            </div>
          </div>
          <div id={`${base}-rel`} className="hb-foot-related" hidden={!open}>
            {open && (
              <div className="inner">
                <p className="hb-foot-related-title">{open.title}</p>
                <ul>
                  {open.links.map((l) => (
                    <li key={l.href + l.label}>
                      <a href={l.href} target="_blank" rel="noopener noreferrer" title="새 창 열기">
                        {l.label}
                        <i className="svg-icon ico-go" aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
      <div className="inner">
        <div className={cx("f-logo", "hb-gov-logo")}>
          {logoSrc ? <img src={logoSrc} alt={logoAlt ?? orgName} /> : <span className="hb-gov-logo-text">{orgName}</span>}
        </div>
        <div className="f-cnt">
          <div className="f-info">
            {address && <p className="info-addr">{address}</p>}
            {contacts.length > 0 && (
              <ul className="info-cs">
                {contacts.map((c) => (
                  <li key={c.label}>
                    <strong className="strong">{c.label}</strong>
                    {c.note && <span className="span">({c.note})</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {(links.length > 0 || sns.length > 0) && (
            <div className="f-link">
              {links.length > 0 && (
                <div className="link-go">
                  {links.map((l) => (
                    <a key={l.href + l.label} href={l.href} className="krds-btn medium text">
                      {l.label} <i className="svg-icon ico-angle right" aria-hidden="true" />
                    </a>
                  ))}
                </div>
              )}
              {sns.length > 0 && (
                <div className="link-sns">
                  {sns.map((s) => (
                    <a key={s.type + s.href} href={s.href} className="krds-btn xlarge icon border" target="_blank" rel="noopener noreferrer" title="새 창 열기">
                      <span className="sr-only">{s.label ?? SNS[s.type][0]}</span>
                      <i className={cx("svg-icon", SNS[s.type][1])} aria-hidden="true" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {children}
        {(policyLinks.length > 0 || copyright || identifier) && (
          <div className="f-btm">
            <div className="f-btm-text">
              {policyLinks.length > 0 && (
                <div className="f-menu">
                  {policyLinks.map((l) => (
                    <a key={l.href + l.label} href={l.href} className={l.point ? "point" : undefined}>
                      {l.label}
                    </a>
                  ))}
                </div>
              )}
              {copyright && <p className="f-copy">{copyright}</p>}
            </div>
            {identifier && <Identifier {...identifier} />}
          </div>
        )}
      </div>
    </footer>
  );
});

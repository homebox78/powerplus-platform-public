"use client";
// 운영기관 식별자 — KRDS 「운영기관 식별자(identifier)」
//   <Identifier orgName="한빛시" />                                   ← "이 누리집은 한빛시 누리집입니다."
//   <Identifier orgName="한빛시" logoSrc="/img/logo.svg" logoAlt="한빛시" />
//   <Identifier orgName="한빛시 문화재단"
//               logos={[{ src: "/img/hanbit.svg", alt: "한빛시" }, { src: "/img/foundation.svg", alt: "한빛시 문화재단" }]} />
// 로고는 이미지로만 받는다(정부 상징·기관 로고를 코드로 그리지 않는다). 없으면 문구만 보인다.
// logos 는 여러 기관이 함께 운영할 때 — 배열 순서가 곧 위계(상위 기관 → 운영 기관)다.
import * as React from "react";
import { cx } from "./utils";

export interface IdentifierLogo {
  src: string;
  /** 대체 글자 — 기관 이름 */
  alt: string;
}

export interface IdentifierProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 운영기관 이름 */
  orgName?: string;
  /** 문구 — 비우면 "이 누리집은 {orgName} 누리집입니다." */
  text?: React.ReactNode;
  /** 로고 이미지 주소 (로고 하나) */
  logoSrc?: string;
  /** 로고 대체 글자(비우면 orgName) */
  logoAlt?: string;
  /** 로고 여러 개 — 순서 = 위계. 주면 logoSrc 대신 쓴다 */
  logos?: IdentifierLogo[];
}

export const Identifier = React.forwardRef<HTMLDivElement, IdentifierProps>(function Identifier(
  { orgName = "", text, logoSrc, logoAlt, logos, className, ...props },
  ref,
) {
  const list: IdentifierLogo[] = logos?.length ? logos : logoSrc ? [{ src: logoSrc, alt: logoAlt ?? orgName }] : [];
  return (
    <div ref={ref} className={cx("krds-identifier", className)} {...props}>
      {list.length > 1 ? (
        <span className="hb-identifier-logos">
          {list.map((l, i) => (
            <span key={`${l.src}-${i}`} className="logo hb-gov-logo">
              <img src={l.src} alt={l.alt} />
            </span>
          ))}
        </span>
      ) : (
        list.length === 1 && (
          <span className="logo hb-gov-logo">
            <img src={list[0].src} alt={list[0].alt} />
          </span>
        )
      )}
      <span className="ban-txt">{text ?? `이 누리집은 ${orgName} 누리집입니다.`}</span>
    </div>
  );
});

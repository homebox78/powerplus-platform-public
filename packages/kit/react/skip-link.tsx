"use client";
// 건너뛰기 링크 — KRDS 「건너뛰기 링크(skip_link)」
//   <SkipLink href="#contents" />                               ← "본문 바로가기"
//   <SkipLink links={[{ href: "#contents", label: "본문 바로가기" }, { href: "#gnb", label: "주메뉴 바로가기" }]} />
// 문서 맨 앞에 둔다. 평소엔 숨어 있고 Tab 으로 초점을 받으면 화면 맨 위에 나타난다.
//   inline  : 화면 고정 대신 놓인 자리에 나타난다
//   preview : 늘 보이게(문서·미리보기용)
import * as React from "react";
import { cx } from "./utils";

export interface SkipLinkItem {
  href: string;
  label: string;
}

export interface SkipLinkProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "id"> {
  href?: string;
  /** 링크 여러 개 */
  links?: SkipLinkItem[];
  inline?: boolean;
  preview?: boolean;
  /** KRDS 스타일이 id 로 걸려 있다(기본 krds-skip-link) */
  id?: string;
  children?: React.ReactNode;
}

export const SkipLink = React.forwardRef<HTMLDivElement, SkipLinkProps>(function SkipLink(
  { href = "#contents", links, inline, preview, id = "krds-skip-link", className, children, ...props },
  ref,
) {
  const cls = cx(inline && "hb-skip--inline", preview && "hb-skip--preview", className);
  return (
    <div ref={ref} id={id} className={cls || undefined} {...props}>
      {links && links.length > 0 ? (
        <ul className="hb-skip-list">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href}>{l.label}</a>
            </li>
          ))}
        </ul>
      ) : (
        <a href={href}>{children ?? "본문 바로가기"}</a>
      )}
    </div>
  );
});

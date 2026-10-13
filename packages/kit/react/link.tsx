"use client";
// 링크 — KRDS 「링크」(krds-btn link)
//   <Link href="/notice">공지사항 보기</Link>
//   <Link href="https://www.gov.kr" external>정부24 바로가기</Link>   ← 새 창 + 이동 아이콘 + "새 창 열림" 안내
//   <Link href="/guide" tone="basic" underline="hover">이용 안내</Link>
//
// tone: primary(링크색, 기본) · basic(본문 글자색)
// underline: always(기본) · hover(마우스·포커스 때만) · none
// keepColor: 방문·마우스·누름 상태에도 색을 바꾸지 않는다(KRDS pure)
//   <Link href="/files/guide.pdf" download fileSize={2_400_000}>신청 안내서</Link>
//     ← 첨부파일: 글 뒤 [pdf, 2.3MB] 표시 + 다운로드 아이콘 + 화면낭독용 "다운로드". 형식은 href 확장자로(fileType 으로 덮기)
import * as React from "react";
import { Slot } from "radix-ui";
import { cx } from "./utils";
import { formatFileSize } from "./file-upload";

/** 첨부파일 꼬리표 — "pdf, 2.3MB" (형식은 주지 않으면 주소 확장자) */
export function fileMeta(href?: string, fileType?: string, fileSize?: number): string {
  const ext = fileType ?? (href ? /\.([a-z0-9]{2,5})(?:[?#].*)?$/i.exec(href)?.[1] : undefined);
  return [ext?.toLowerCase(), fileSize != null ? formatFileSize(fileSize) : ""].filter(Boolean).join(", ");
}

export interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  size?: "xsmall" | "small" | "medium" | "large" | "xlarge" | "inherit";
  tone?: "primary" | "basic";
  underline?: "always" | "hover" | "none";
  keepColor?: boolean;
  /** 새 창으로 연다 — target·rel·안내 문구·이동 아이콘을 붙인다 */
  external?: boolean;
  /** 첨부파일 형식 (기본: href 확장자) — download 와 함께 쓴다 */
  fileType?: string;
  /** 첨부파일 크기(바이트) */
  fileSize?: number;
  /** 라우터 링크 등 자식 요소에 모양만 입힌다 */
  asChild?: boolean;
}

export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { size = "large", tone = "primary", underline = "always", keepColor, external, fileType, fileSize, asChild, className, children, ...props },
  ref,
) {
  const Comp: React.ElementType = asChild ? Slot.Root : "a";
  const text =
    underline === "none" ? (
      <span>{children}</span>
    ) : (
      <span className={cx("underline", underline === "hover" && "hidden-underline")}>{children}</span>
    );
  const extra = external ? { target: "_blank", rel: "noopener noreferrer" } : {};
  const isFile = props.download != null && props.download !== false;
  const meta = isFile ? fileMeta(props.href, fileType, fileSize) : "";
  return (
    <Comp
      ref={ref}
      className={cx("krds-btn", "link", size === "inherit" ? "hb-link-inherit" : size, tone === "basic" && "basic", keepColor && "pure", className)}
      {...extra}
      {...props}
    >
      {asChild ? <Slot.Slottable>{children}</Slot.Slottable> : text}
      {isFile && (
        <>
          {meta && <span className="hb-file-meta"> [{meta}]</span>}
          <span className="sr-only"> 다운로드</span>
          <i className="svg-icon ico-down" data-pos="end" aria-hidden="true" />
        </>
      )}
      {external && (
        <>
          <span className="sr-only">(새 창 열림)</span>
          <i className="svg-icon ico-go" data-pos="end" aria-hidden="true" />
        </>
      )}
    </Comp>
  );
});

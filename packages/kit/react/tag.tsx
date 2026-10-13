"use client";
// 태그 — KRDS 「태그」(krds-tag-wrap · krds-btn-tag)
//   <TagGroup size="medium" aria-label="선택한 조건">
//     <Tag onRemove={() => …} removeLabel="복지 조건 삭제">복지</Tag>   ← 삭제 버튼이 있는 태그
//   </TagGroup>
//   <TagGroup size="small" aria-label="관련 주제">
//     <Tag href="/search?q=청년">청년</Tag>                            ← 링크 태그 (KRDS tag_link)
//   </TagGroup>
//
// 삭제하면 다음(없으면 이전) 태그의 삭제 버튼, 다 지우면 묶음으로 포커스가 옮겨 가고
// 묶음 안 알림 칸이 "복지를 삭제했습니다" 를 화면낭독기에 읽힌다.
// 크기는 TagGroup 이 정한다(small · medium · large). 태그 스타일은 TagGroup 안에서만 적용된다.
import * as React from "react";
import { afterTagRemove, cx } from "./utils";

export interface TagGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "small" | "medium" | "large";
}

export const TagGroup = React.forwardRef<HTMLDivElement, TagGroupProps>(function TagGroup(
  { size = "medium", className, role, children, ...props },
  ref,
) {
  return (
    <div ref={ref} role={role ?? (props["aria-label"] ? "group" : undefined)} className={cx("krds-tag-wrap", size, className)} {...props}>
      {children}
      <span className="sr-only hb-tag-live" aria-live="polite" />
    </div>
  );
});

export interface TagProps extends React.HTMLAttributes<HTMLElement> {
  /** 링크 태그 */
  href?: string;
  /** 넘기면 삭제 버튼이 생긴다 */
  onRemove?: () => void;
  /** 삭제 버튼의 스크린리더 이름 — 기본은 "{태그 글자} 삭제" */
  removeLabel?: string;
}

export const Tag = React.forwardRef<HTMLElement, TagProps>(function Tag(
  { href, onRemove, removeLabel, className, children, ...props },
  ref,
) {
  const text = typeof children === "string" || typeof children === "number" ? String(children) : "";
  const label = removeLabel ?? (text ? `${text} 삭제` : "삭제");
  if (href) {
    return (
      <a ref={ref as React.Ref<HTMLAnchorElement>} href={href} className={cx("krds-btn-tag", "link", className)} {...props}>
        {children}
      </a>
    );
  }
  return (
    <span ref={ref as React.Ref<HTMLSpanElement>} className={cx("krds-btn-tag", className)} {...props}>
      {children}
      {onRemove && (
        <button
          type="button"
          className="btn-delete"
          onClick={(e) => {
            const btn = e.currentTarget;
            const name = (btn.parentElement?.textContent ?? "").replace(label, "").trim() || text;
            afterTagRemove(btn, name);
            onRemove();
          }}
        >
          <span className="sr-only">{label}</span>
        </button>
      )}
    </span>
  );
});

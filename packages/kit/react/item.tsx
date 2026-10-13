"use client";
// 항목 — shadcn Item 과 같은 사용법 (한 줄짜리 목록 항목: 아이콘·그림 + 제목·설명 + 오른쪽 버튼)
//   <ItemGroup>
//     <Item variant="outline">
//       <ItemMedia variant="icon"><i className="svg-icon ico-file" aria-hidden="true" /></ItemMedia>
//       <ItemContent>
//         <ItemTitle>주민등록표 등본 발급</ItemTitle>
//         <ItemDescription>온라인 발급 · 수수료 무료</ItemDescription>
//       </ItemContent>
//       <ItemActions><Button size="small" variant="secondary">신청</Button></ItemActions>
//     </Item>
//     <ItemSeparator />
//   </ItemGroup>
//   <Item asChild><a href="/guide">…</a></Item>   ← 항목 전체가 링크
// ItemGroup 은 role="list", Item 은 role="listitem"(링크로 쓰면 링크 역할 유지).
import * as React from "react";
import { Slot } from "radix-ui";
import { cx } from "./utils";

export const ItemGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function ItemGroup(
  { className, ...props },
  ref,
) {
  return <div ref={ref} role="list" className={cx("hb-item-group", className)} {...props} />;
});

export interface ItemProps extends React.HTMLAttributes<HTMLDivElement> {
  /** default = 면 없음 · outline = 테두리 · muted = 연한 면 */
  variant?: "default" | "outline" | "muted";
  size?: "default" | "small";
  asChild?: boolean;
}

export const Item = React.forwardRef<HTMLDivElement, ItemProps>(function Item(
  { variant = "default", size = "default", asChild, className, role, ...props },
  ref,
) {
  const Comp: React.ElementType = asChild ? Slot.Root : "div";
  return (
    <Comp
      ref={ref}
      role={asChild ? role : (role ?? "listitem")}
      className={cx("hb-item", variant !== "default" && `hb-item-${variant}`, size === "small" && "hb-item-small", className)}
      {...props}
    />
  );
});

export interface ItemMediaProps extends React.HTMLAttributes<HTMLDivElement> {
  /** icon = 둥근 면 위 아이콘 · image = 그림 틀 */
  variant?: "default" | "icon" | "image";
}

export const ItemMedia = React.forwardRef<HTMLDivElement, ItemMediaProps>(function ItemMedia(
  { variant = "default", className, ...props },
  ref,
) {
  return <div ref={ref} className={cx("hb-item-media", variant !== "default" && `hb-item-media-${variant}`, className)} {...props} />;
});

export const ItemContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function ItemContent(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cx("hb-item-content", className)} {...props} />;
});

export const ItemTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  function ItemTitle({ className, ...props }, ref) {
    return <p ref={ref} className={cx("hb-item-title", className)} {...props} />;
  },
);

export const ItemDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  function ItemDescription({ className, ...props }, ref) {
    return <p ref={ref} className={cx("hb-item-desc", className)} {...props} />;
  },
);

export const ItemActions = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function ItemActions(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cx("hb-item-actions", className)} {...props} />;
});

export const ItemSeparator = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function ItemSeparator({ className, ...props }, ref) {
    return <div ref={ref} aria-hidden="true" className={cx("hb-item-sep", className)} {...props} />;
  },
);

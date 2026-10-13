"use client";
// 버튼 묶음 — shadcn ButtonGroup · ButtonGroupText (KRDS 버튼을 붙여 한 덩어리로)
//   <ButtonGroup aria-label="보기 방식">
//     <Button variant="tertiary">목록</Button>
//     <Button variant="tertiary">지도</Button>
//   </ButtonGroup>
//   <ButtonGroup aria-label="검색">
//     <ButtonGroupText>민원</ButtonGroupText>
//     <Button variant="tertiary" iconOnly icon="sch">검색</Button>
//   </ButtonGroup>
//
// 버튼 사이 모서리는 없애고 테두리를 한 줄로 겹친다. 같은 묶음의 버튼은 크기(size)를 같게 준다.
// orientation="vertical" 이면 위아래로 붙인다. 이름(aria-label)을 꼭 준다.
import * as React from "react";
import { cx } from "./utils";

export interface ButtonGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
}

export const ButtonGroup = React.forwardRef<HTMLDivElement, ButtonGroupProps>(function ButtonGroup(
  { orientation = "horizontal", className, ...props },
  ref,
) {
  return <div ref={ref} role="group" data-orientation={orientation} className={cx("hb-button-group", orientation, className)} {...props} />;
});

export interface ButtonGroupTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: "xsmall" | "small" | "medium" | "large" | "xlarge";
}

export const ButtonGroupText = React.forwardRef<HTMLSpanElement, ButtonGroupTextProps>(function ButtonGroupText(
  { size = "medium", className, ...props },
  ref,
) {
  return <span ref={ref} className={cx("hb-button-group-text", size, className)} {...props} />;
});

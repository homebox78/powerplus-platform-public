"use client";
// 텍스트 목록 — KRDS 「텍스트 목록」(krds-info-list)
//   <TextList>                                   ← 기본: 점 글머리(KRDS decimal)
//     <TextListItem>신청 대상: 한빛시 거주 만 19~34세 청년</TextListItem>
//     <TextListItem>
//       제출 서류
//       <TextList type="dash"><TextListItem>주민등록표 등본 1부</TextListItem></TextList>   ← 2단계
//     </TextListItem>
//   </TextList>
//   <TextList type="ordered">
//     <TextListItem num="1.">온라인 신청서 작성</TextListItem>          ← 번호 목록(ol)
//   </TextList>
//
// type: bullet(●) · dash(-) · hollow(○) · ordered(번호 — 각 항목 num 에 "1." "가." "①" 등)
// 목록을 3단계까지 겹칠 수 있다(단계마다 글자 크기·들여쓰기는 KRDS 가 정한다).
import * as React from "react";
import { cx } from "./utils";

const TYPE = { bullet: "decimal", dash: "dash", hollow: "hollow", ordered: "ordered" } as const;

export interface TextListProps extends React.HTMLAttributes<HTMLElement> {
  type?: keyof typeof TYPE;
}

export const TextList = React.forwardRef<HTMLElement, TextListProps>(function TextList({ type = "bullet", className, ...props }, ref) {
  const cls = cx("krds-info-list", TYPE[type], className);
  return type === "ordered" ? (
    <ol ref={ref as React.Ref<HTMLOListElement>} className={cls} {...props} />
  ) : (
    <ul ref={ref as React.Ref<HTMLUListElement>} className={cls} {...props} />
  );
});

export interface TextListItemProps extends React.LiHTMLAttributes<HTMLLIElement> {
  /** 번호 목록의 번호 글자 ("1." · "가." · "①") */
  num?: string;
}

export const TextListItem = React.forwardRef<HTMLLIElement, TextListItemProps>(function TextListItem({ num, children, ...props }, ref) {
  return (
    <li ref={ref} {...props}>
      {num && <span className="num">{num} </span>}
      {children}
    </li>
  );
});

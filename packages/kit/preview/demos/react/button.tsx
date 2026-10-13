import * as React from "react";
import { Button } from "../../../react";

export const meta = {
  id: "button",
  title: "버튼",
  group: "action",
  source: "both",
  note: "위계(주요·보조·3순위·텍스트) · 크기 5종 · 아이콘 붙은 버튼 · 텍스트 버튼 · 아이콘 버튼 · 처리 중(loading — onClick 이 Promise 를 돌려주면 끝날 때까지 스피너, 다시 눌러도 무시)",
};

const sizes = ["xsmall", "small", "medium", "large", "xlarge"] as const;

export default function Demo() {
  const [sent, setSent] = React.useState(0);
  return (
    <>
      <div className="pv-row">
        <Button variant="primary">민원 신청하기</Button>
        <Button variant="secondary">임시 저장</Button>
        <Button variant="tertiary">취소</Button>
        <Button variant="text">자세히 보기</Button>
        <Button disabled>신청 마감</Button>
      </div>
      <div className="pv-row">
        {sizes.map((s) => (
          <Button key={s} size={s}>{s}</Button>
        ))}
      </div>
      <div className="pv-row">
        <Button size="small" icon="sch">검색</Button>
        <Button variant="secondary" icon="down">서식 내려받기</Button>
        <Button variant="tertiary" size="large" icon="upload" iconPosition="start">파일 올리기</Button>
        <Button asChild variant="tertiary" icon="go">
          <a href="#button">정부24 바로가기</a>
        </Button>
      </div>
      <div className="pv-row">
        <Button variant="text" size="xsmall" icon="like">찜하기</Button>
        <Button variant="text" size="small" icon="angle right">주민등록표초본</Button>
        <Button variant="text" size="medium" icon="sch">검색</Button>
        <Button variant="text" size="xlarge" icon="more">자세히 보기</Button>
        <Button variant="text" icon="filter" disabled>필터</Button>
      </div>
      <div className="pv-row">
        <Button iconOnly icon="sch">검색</Button>
        <Button iconOnly icon="help" size="medium">도움말</Button>
        <Button iconOnly border icon="refresh" size="large">새로고침</Button>
        <Button iconOnly border icon="angle down" size="large" disabled>열기</Button>
      </div>
      <div className="pv-row">
        <Button loading>저장 중</Button>
        <Button
          variant="secondary"
          data-pv="pending"
          onClick={() => new Promise<void>((r) => setTimeout(() => { setSent((n) => n + 1); r(); }, 1500))}
        >
          신청서 제출
        </Button>
        <span style={{ fontSize: 14 }} aria-live="polite">제출 횟수 {sent}</span>
      </div>
    </>
  );
}

import { Button, ButtonGroup, ButtonGroupText } from "../../../react";

export const meta = { id: "button-group", title: "버튼 묶음", group: "action", source: "shadcn", note: "버튼을 붙여 한 덩어리로 · 글자 칸 · 세로 묶음" };

export default function Demo() {
  return (
    <>
      <div className="pv-row">
        <ButtonGroup aria-label="게시글 이동">
          <Button variant="tertiary" icon="angle left" iconPosition="start">이전 글</Button>
          <Button variant="tertiary">목록</Button>
          <Button variant="tertiary" icon="angle right">다음 글</Button>
        </ButtonGroup>
        <ButtonGroup aria-label="민원 검색">
          <ButtonGroupText>민원 번호</ButtonGroupText>
          <Button variant="tertiary" iconOnly icon="sch">검색</Button>
        </ButtonGroup>
      </div>
      <div className="pv-row">
        <ButtonGroup aria-label="공유">
          <Button variant="secondary" size="small" icon="print" iconPosition="start">인쇄</Button>
          <Button variant="secondary" size="small" icon="share" iconPosition="start">공유</Button>
          <Button variant="secondary" size="small" icon="scrap" iconPosition="start">스크랩</Button>
        </ButtonGroup>
        <ButtonGroup orientation="vertical" aria-label="지도 확대·축소">
          <Button variant="tertiary" size="small">확대</Button>
          <Button variant="tertiary" size="small">축소</Button>
        </ButtonGroup>
      </div>
    </>
  );
}

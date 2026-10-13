import { ToggleGroup, ToggleGroupItem } from "../../../react";

export const meta = { id: "toggle-group", title: "토글 묶음", group: "action", source: "shadcn", note: "하나만 선택(radiogroup, 방향키로 이동·선택) · 여러 개 선택 · 떨어뜨려 놓기" };

export default function Demo() {
  return (
    <>
      <div className="pv-row">
        <ToggleGroup type="single" variant="outline" defaultValue="list" aria-label="보기 방식">
          <ToggleGroupItem value="list">목록형</ToggleGroupItem>
          <ToggleGroupItem value="card">카드형</ToggleGroupItem>
          <ToggleGroupItem value="map">지도형</ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup type="single" variant="outline" size="small" defaultValue="recent" aria-label="정렬">
          <ToggleGroupItem value="recent">최신순</ToggleGroupItem>
          <ToggleGroupItem value="view">조회순</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="pv-row">
        <ToggleGroup type="multiple" variant="outline" spacing="separate" defaultValue={["welfare", "youth"]} aria-label="관심 분야">
          <ToggleGroupItem value="welfare">복지</ToggleGroupItem>
          <ToggleGroupItem value="youth">청년</ToggleGroupItem>
          <ToggleGroupItem value="traffic">교통</ToggleGroupItem>
          <ToggleGroupItem value="culture">문화</ToggleGroupItem>
          <ToggleGroupItem value="safety" disabled>안전</ToggleGroupItem>
        </ToggleGroup>
      </div>
    </>
  );
}

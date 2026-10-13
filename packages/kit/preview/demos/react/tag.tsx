import * as React from "react";
import { Tag, TagGroup } from "../../../react";

export const meta = { id: "tag", title: "태그", group: "action", source: "krds", note: "삭제 버튼 태그(누르면 사라짐) · 링크 태그 · 크기 3종" };

export default function Demo() {
  const [tags, setTags] = React.useState(["복지", "청년", "주거 지원"]);
  return (
    <>
      <TagGroup size="large" aria-label="선택한 검색 조건">
        {tags.map((t) => (
          <Tag key={t} onRemove={() => setTags(tags.filter((x) => x !== t))} removeLabel={`${t} 조건 삭제`}>{t}</Tag>
        ))}
      </TagGroup>
      <TagGroup size="medium" aria-label="관련 주제">
        <Tag href="#tag">출산·육아</Tag>
        <Tag href="#tag">교통</Tag>
        <Tag href="#tag">문화행사</Tag>
      </TagGroup>
      <TagGroup size="small" aria-label="관련 부서">
        <Tag href="#tag">복지정책과</Tag>
        <Tag href="#tag">청년일자리과</Tag>
      </TagGroup>
    </>
  );
}

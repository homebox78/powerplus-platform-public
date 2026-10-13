import * as React from "react";
import { Pagination } from "../../../react";

export const meta = { id: "pagination", title: "페이지네이션", group: "nav", source: "krds", note: "위: 버튼(목록만 바꿈) · 아래: 링크(주소가 바뀜) · 쪽이 적으면 말줄임 없이 모두 보인다 · 767px 이하에서는 말줄임 포함 최대 7개(mobileSiblings)." };

export default function Demo() {
  const [page, setPage] = React.useState(4);
  return (
    <>
      <Pagination page={page} total={99} onPageChange={setPage} />
      <Pagination page={1} total={5} getHref={(p) => `#page-${p}`} aria-label="공지사항 목록 페이지 이동" />
    </>
  );
}

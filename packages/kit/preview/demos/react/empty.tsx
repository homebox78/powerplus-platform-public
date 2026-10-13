import { Button, Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../../../react";

export const meta = { id: "empty", title: "빈 상태", group: "action", source: "shadcn", note: "검색 결과 없음 · 신청 내역 없음" };

export default function Demo() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <Empty bordered>
        <EmptyHeader>
          <EmptyMedia variant="icon" icon="sch" />
          <EmptyTitle>“청년 월세” 검색 결과가 없습니다</EmptyTitle>
          <EmptyDescription>검색어의 철자를 확인하거나 더 짧은 낱말로 다시 검색해 보세요.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="secondary" size="small">전체 목록 보기</Button>
          <Button variant="tertiary" size="small">검색 조건 초기화</Button>
        </EmptyContent>
      </Empty>
      <Empty bordered>
        <EmptyHeader>
          <EmptyMedia variant="icon" icon="file" />
          <EmptyTitle>신청한 민원이 없습니다</EmptyTitle>
          <EmptyDescription>민원을 신청하면 처리 과정을 이곳에서 확인할 수 있습니다.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button size="small">민원 신청하기</Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}

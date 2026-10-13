import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../react";

export const meta = { id: "tabs", title: "탭", group: "nav", source: "both" };

export default function Demo() {
  return (
    <>
      <Tabs defaultValue="notice">
        <TabsList variant="line" full aria-label="소식">
          <TabsTrigger value="notice">공지사항</TabsTrigger>
          <TabsTrigger value="press">보도자료</TabsTrigger>
          <TabsTrigger value="job">채용정보</TabsTrigger>
        </TabsList>
        <TabsContent value="notice">2026년 하반기 주민자치 프로그램 수강생 모집 안내</TabsContent>
        <TabsContent value="press">시, 스마트 민원 창구 전 동으로 확대</TabsContent>
        <TabsContent value="job">기간제 근로자(도서관 운영 보조) 채용 공고</TabsContent>
      </Tabs>
      <Tabs defaultValue="a" className="pv-mt">
        <TabsList variant="fill" aria-label="분야">
          <TabsTrigger value="a">복지</TabsTrigger>
          <TabsTrigger value="b">교통</TabsTrigger>
          <TabsTrigger value="c">문화</TabsTrigger>
        </TabsList>
        <TabsContent value="a">복지 분야 소식</TabsContent>
        <TabsContent value="b">교통 분야 소식</TabsContent>
        <TabsContent value="c">문화 분야 소식</TabsContent>
      </Tabs>
    </>
  );
}

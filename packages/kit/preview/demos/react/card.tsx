import { Button, Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../../react";

export const meta = {
  id: "card",
  title: "카드",
  group: "layout",
  source: "shadcn",
  note: "variant: outline(기본) · filled · elevated. CardTitle 은 기본 h3 — 문서 구조에 맞게 as 로 바꾼다.",
};

export default function Demo() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
      <Card>
        <CardHeader>
          <CardTitle>여권 발급 신청</CardTitle>
          <CardDescription>처리 기간 4일(근무일 기준)</CardDescription>
          <CardAction>
            <span className="krds-badge bg-light-primary">온라인</span>
          </CardAction>
        </CardHeader>
        <CardContent>
          <p>정부24에서 신청하고 사진·신분증을 지참해 한빛시청 민원여권과에서 받습니다.</p>
        </CardContent>
        <CardFooter>
          <Button variant="primary" size="medium">신청하기</Button>
          <Button variant="tertiary" size="medium">준비물 보기</Button>
        </CardFooter>
      </Card>
      <Card variant="filled">
        <CardHeader>
          <CardTitle>이번 달 민원 처리</CardTitle>
          <CardDescription>2026년 9월 1일 ~ 24일</CardDescription>
        </CardHeader>
        <CardContent>
          <p style={{ fontSize: 32, fontWeight: 700 }}>10,469건</p>
          <p>처리율 99.6% · 지난달보다 1.2%p 올랐습니다.</p>
        </CardContent>
      </Card>
      <Card variant="elevated">
        <CardHeader>
          <CardTitle>시민 제안 공모</CardTitle>
          <CardDescription>접수 2026.09.01 ~ 09.30</CardDescription>
        </CardHeader>
        <CardContent>
          <p>생활 속 불편을 줄이는 아이디어를 보내 주세요. 우수 제안은 시정에 반영합니다.</p>
        </CardContent>
        <CardFooter>
          <Button variant="secondary" size="medium">제안하기</Button>
        </CardFooter>
      </Card>
    </div>
  );
}

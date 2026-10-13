import * as React from "react";
import {
  Button,
  StructuredList,
  StructuredListItem,
  StructuredListSort,
  StructuredListTable,
  StructuredListToolbar,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../react";

export const meta = {
  id: "structured-list",
  title: "구조화 목록",
  group: "data",
  source: "krds",
  note: "카드형(structured_list) · 표형(structured_list_table). 표형은 도구 줄(전체선택·정렬) + 표를 담는다.",
};

const cards = [
  {
    badge: <span className="krds-badge bg-light-primary">접수중</span>,
    title: "청년 월세 한시 특별지원",
    desc: "만 19~34세 무주택 청년에게 월 최대 20만 원을 12개월 동안 지원합니다. 부모와 따로 사는 청년이 대상입니다.",
    period: "2026.09.01 ~ 2026.10.31",
    tags: ["주거", "청년"],
  },
  {
    badge: <span className="krds-badge bg-light-success">상시</span>,
    title: "어르신 교통카드 발급",
    desc: "만 65세 이상 한빛시민은 시내버스·도시철도를 무료로 이용할 수 있습니다. 주민센터에서 바로 발급합니다.",
    period: "상시 접수",
    tags: ["교통", "어르신"],
  },
  {
    badge: <span className="krds-badge bg-secondary">마감</span>,
    title: "소상공인 경영안정자금",
    desc: "매출이 줄어든 관내 소상공인에게 최대 2천만 원의 운영자금을 연 2% 이자로 빌려드립니다.",
    period: "2026.07.01 ~ 2026.08.29",
    tags: ["경제", "창업"],
  },
];

const files = [
  { kind: "고시", title: "2026년 도시계획시설 결정 고시", size: "1.2MB", date: "2026.09.22" },
  { kind: "공고", title: "한빛시 공공청사 주차장 운영 변경 공고", size: "384KB", date: "2026.09.19" },
  { kind: "계획", title: "2026 한빛시 탄소중립 이행계획", size: "5.6MB", date: "2026.09.12" },
];

export default function Demo() {
  const [sort, setSort] = React.useState("관련도순");
  return (
    <>
      <StructuredList>
        {cards.map((c) => (
          <StructuredListItem
            key={c.title}
            href="#"
            badge={c.badge}
            title={c.title}
            description={c.desc}
            meta={[{ label: "신청 기간", value: c.period }]}
            tags={c.tags}
            action={
              <Button variant="secondary" size="medium" asChild>
                <a href="#" title={`${c.title} 신청하기`}>신청하기</a>
              </Button>
            }
          />
        ))}
      </StructuredList>

      <StructuredListTable className="pv-mt">
        <StructuredListToolbar
          sort={<StructuredListSort options={["관련도순", "최신순", "인기순"]} value={sort} onValueChange={setSort} />}
        >
          <div className="krds-form-check">
            <input type="checkbox" id="sl-all" />
            <label htmlFor="sl-all">전체선택</label>
          </div>
          <Button variant="text" size="medium">
            <i className="svg-icon ico-down" aria-hidden="true" /> 선택 내려받기
          </Button>
        </StructuredListToolbar>
        <Table>
          <TableCaption>고시·공고 자료 목록 — 유형, 제목, 크기, 게시일, 내려받기로 구성</TableCaption>
          <colgroup>
            <col style={{ width: "12%" }} />
            <col />
            <col style={{ width: "12%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "16%" }} />
          </colgroup>
          <TableHeader>
            <TableRow>
              <TableHead>유형</TableHead>
              <TableHead>제목</TableHead>
              <TableHead>크기</TableHead>
              <TableHead>게시일</TableHead>
              <TableHead>
                <span className="sr-only">내려받기</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {files.map((f) => (
              <TableRow key={f.title}>
                <TableCell align="center">{f.kind}</TableCell>
                <TableHead scope="row" align="left">{f.title}</TableHead>
                <TableCell align="right">{f.size}</TableCell>
                <TableCell align="center">{f.date}</TableCell>
                <TableCell align="center">
                  <Button variant="text" size="medium" aria-label={`${f.title} 내려받기`}>
                    <i className="svg-icon ico-down" aria-hidden="true" /> 내려받기
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </StructuredListTable>
    </>
  );
}

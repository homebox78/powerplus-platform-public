import { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "../../../react";

export const meta = {
  id: "table",
  title: "표",
  group: "data",
  source: "both",
  note: "머리칸 가운데 · 긴 글 왼쪽 · 비교 숫자 오른쪽 · 짧은 값·날짜 가운데. 캡션은 숨기고 읽어 준다(visible 로 보이게).",
};

const rows = [
  { kind: "여권 발급", dept: "민원여권과", recv: 1204, done: 1188, date: "2026.09.24" },
  { kind: "주민등록표 등본·초본", dept: "시민봉사과", recv: 8342, done: 8342, date: "2026.09.24" },
  { kind: "건축물대장 열람·발급", dept: "건축과", recv: 657, done: 641, date: "2026.09.23" },
  { kind: "자동차 이전등록", dept: "차량등록사업소", recv: 312, done: 298, date: "2026.09.23" },
];

export default function Demo() {
  return (
    <Table>
      <TableCaption visible>
        한빛시 9월 넷째 주 민원 처리 현황 — 민원 종류, 담당 부서, 접수 건수, 처리 건수, 기준일로 구성
      </TableCaption>
      <colgroup>
        <col />
        <col style={{ width: "18%" }} />
        <col style={{ width: "14%" }} />
        <col style={{ width: "14%" }} />
        <col style={{ width: "16%" }} />
      </colgroup>
      <TableHeader>
        <TableRow>
          <TableHead>민원 종류</TableHead>
          <TableHead>담당 부서</TableHead>
          <TableHead>접수(건)</TableHead>
          <TableHead>처리(건)</TableHead>
          <TableHead>기준일</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.kind}>
            <TableHead scope="row" align="left">{r.kind}</TableHead>
            <TableCell align="center">{r.dept}</TableCell>
            <TableCell align="right">{r.recv.toLocaleString()}</TableCell>
            <TableCell align="right">{r.done.toLocaleString()}</TableCell>
            <TableCell align="center">{r.date}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableHead scope="row" colSpan={2} align="left">합계</TableHead>
          <TableCell align="right">10,515</TableCell>
          <TableCell align="right">10,469</TableCell>
          <TableCell align="center">-</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

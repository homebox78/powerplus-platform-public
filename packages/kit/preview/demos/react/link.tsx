import { Link } from "../../../react";

export const meta = { id: "link", title: "링크", group: "action", source: "krds", note: "링크색·본문색 · 밑줄 항상/마우스 올릴 때/없음 · 새 창 링크(이동 아이콘·새 창 안내) · 첨부파일 링크(다운로드 아이콘·[형식, 크기])" };

export default function Demo() {
  return (
    <>
      <div className="pv-row">
        <Link href="#link" size="small">공지사항 전체 보기</Link>
        <Link href="#link" size="medium" keepColor>상태가 바뀌어도 색 유지</Link>
        <Link href="https://www.gov.kr" external>정부24 바로가기</Link>
      </div>
      <div className="pv-row">
        <Link href="#link" tone="basic" external>민원 서식 모음(새 창)</Link>
        <Link href="#link" tone="basic" underline="hover">개인정보처리방침</Link>
        <Link href="#link" tone="basic" underline="none">찾아오시는 길</Link>
      </div>
      <div className="pv-row">
        <Link href="/files/guide.pdf" download fileSize={2400000}>신청 안내서</Link>
        <Link href="/files/form.hwp" tone="basic" download fileSize={86000}>민원 신청서 양식</Link>
      </div>
    </>
  );
}

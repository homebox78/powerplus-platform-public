import { Field, FieldLabel, FieldControl, FieldDescription, FieldError, Select, Input, Button } from "../../../react";

export const meta = {
  id: "select",
  title: "선택 상자",
  group: "form",
  source: "krds",
  note: "네이티브 select 대신 버튼+목록. ↑↓·Enter·Esc·글자 입력으로 찾기, 아래 자리가 없으면 위로 열림. 맨 아래 줄은 입력·선택·버튼 높이를 맞춘 예시.",
};

const SIDO = [
  { value: "hanbit", label: "한빛시" },
  { value: "saesol", label: "새솔군" },
  { value: "pureun", label: "푸른구" },
  { value: "gangbyeon", label: "강변구(통합 예정)", disabled: true },
  { value: "haeon", label: "해온시" },
  { value: "dalbit", label: "달빛군" },
];
const TYPES = [
  { value: "all", label: "전체" },
  { value: "title", label: "제목" },
  { value: "body", label: "내용" },
  { value: "dept", label: "담당 부서" },
];
const SORT = [
  { value: "new", label: "최신순" },
  { value: "view", label: "조회순" },
  { value: "name", label: "이름순" },
];

export default function Demo() {
  return (
    <>
      <div className="fieldset" style={{ maxWidth: 480 }}>
        <Field>
          <FieldLabel>거주 지역</FieldLabel>
          <FieldControl><Select options={SIDO} placeholder="시·군·구 선택" /></FieldControl>
          <FieldDescription>주민등록상 주소지를 골라 주세요.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel>거주 지역(선택 완료)</FieldLabel>
          <FieldControl><Select size="medium" options={SIDO} defaultValue="hanbit" /></FieldControl>
        </Field>
        <Field invalid>
          <FieldLabel>신청 구분</FieldLabel>
          <FieldControl><Select size="medium" options={TYPES} placeholder="구분 선택" /></FieldControl>
          <FieldError>신청 구분을 골라 주세요.</FieldError>
        </Field>
        <Field disabled>
          <FieldLabel>처리 기관</FieldLabel>
          <FieldControl><Select size="small" options={SIDO} defaultValue="hanbit" /></FieldControl>
        </Field>
      </div>
      <div className="pv-row">
        <span>정렬</span>
        <Select variant="sort" size="small" options={SORT} defaultValue="new" aria-label="정렬 기준(small)" />
        <Select variant="sort" size="medium" options={SORT} defaultValue="view" aria-label="정렬 기준(medium)" />
        <Select variant="sort" size="large" options={SORT} defaultValue="name" aria-label="정렬 기준(large)" />
      </div>
      <form role="search" className="hb-form-row" data-same-row="" style={{ maxWidth: 720 }} onSubmit={(e) => e.preventDefault()}>
        <div className="hb-fixed" style={{ width: 140 }}>
          <Select size="medium" options={TYPES} defaultValue="all" aria-label="검색 범위" />
        </div>
        <div className="hb-grow">
          <Input size="medium" placeholder="공지사항 검색어를 입력하세요" aria-label="검색어" />
        </div>
        <Button type="submit" size="medium" className="hb-fixed">검색</Button>
      </form>
    </>
  );
}

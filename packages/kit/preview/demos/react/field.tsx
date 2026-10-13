import * as React from "react";
import { Field, FieldLabel, FieldControl, FieldDescription, FieldError, FieldSet, Input, Select, Button } from "../../../react";

export const meta = { id: "field", title: "필드(폼 레이아웃)", group: "form", source: "both", note: "레이블·입력·도움말·오류를 한 묶음으로. 입력 요소가 id·도움말·오류를 자동으로 연결합니다." };

const DONG = [
  { value: "center", label: "중앙동" },
  { value: "river", label: "강변동" },
  { value: "hill", label: "새솔동" },
];

export default function Demo() {
  const [name, setName] = React.useState("");
  const [tried, setTried] = React.useState(false);
  const nameErr = tried && !name.trim() ? "신청인 이름을 입력해 주세요." : "";
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setTried(true);
      }}
      style={{ maxWidth: 560 }}
    >
      <FieldSet legend="전입 신고 신청인 정보">
        <Field required invalid={!!nameErr}>
          <FieldLabel>신청인 이름</FieldLabel>
          <FieldControl><Input size="medium" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></FieldControl>
          <FieldDescription>주민등록상의 이름을 적어 주세요.</FieldDescription>
          {nameErr && <FieldError>{nameErr}</FieldError>}
        </Field>
        <Field required>
          <FieldLabel>전입할 동</FieldLabel>
          <FieldControl><Select size="medium" options={DONG} placeholder="동 선택" /></FieldControl>
        </Field>
        <Field>
          <FieldLabel optional>상세 주소</FieldLabel>
          <FieldControl><Input size="medium" placeholder="아파트 동·호수" /></FieldControl>
        </Field>
        <div><Button type="submit" size="medium">신청하기</Button></div>
      </FieldSet>
    </form>
  );
}

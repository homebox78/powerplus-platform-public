import { Field, FieldLabel, FieldDescription, InputGroup, InputGroupAddon, InputGroupText, InputGroupInput, InputGroupButton, InputGroupTextarea } from "../../../react";

export const meta = { id: "input-group", title: "입력 그룹", group: "form", source: "shadcn", note: "입력 앞뒤에 단위·아이콘·버튼을 붙입니다. 테두리는 그룹 하나가 갖습니다." };

export default function Demo() {
  return (
    <div className="fieldset" style={{ maxWidth: 560 }}>
      <Field>
        <FieldLabel>신청 금액</FieldLabel>
        <InputGroup size="medium">
          <InputGroupInput inputMode="numeric" defaultValue="1,200,000" />
          <InputGroupAddon align="end"><InputGroupText>원</InputGroupText></InputGroupAddon>
        </InputGroup>
      </Field>
      <Field>
        <FieldLabel>누리집 주소</FieldLabel>
        <InputGroup size="medium">
          <InputGroupAddon><InputGroupText>https://</InputGroupText></InputGroupAddon>
          <InputGroupInput defaultValue="www.hanbit.go.kr" />
        </InputGroup>
      </Field>
      <Field>
        <FieldLabel>휴대전화 인증</FieldLabel>
        <InputGroup size="medium">
          <InputGroupInput inputMode="tel" placeholder="010-0000-0000" />
          <InputGroupAddon align="end"><InputGroupButton variant="secondary">인증번호 받기</InputGroupButton></InputGroupAddon>
        </InputGroup>
        <FieldDescription>인증번호는 3분 동안 유효합니다.</FieldDescription>
      </Field>
      <Field invalid>
        <FieldLabel>이메일</FieldLabel>
        <InputGroup size="medium">
          <InputGroupInput defaultValue="hanbit" />
          <InputGroupAddon align="end"><InputGroupText>@hanbit.go.kr</InputGroupText></InputGroupAddon>
        </InputGroup>
      </Field>
      <Field>
        <FieldLabel>답변 요청 내용</FieldLabel>
        <InputGroup multiline>
          <InputGroupTextarea placeholder="담당 부서에 전할 내용을 적어 주세요." />
          <InputGroupAddon align="end"><InputGroupButton variant="primary">보내기</InputGroupButton></InputGroupAddon>
        </InputGroup>
      </Field>
    </div>
  );
}

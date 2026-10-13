import { Field, FieldLabel, FieldControl, FieldDescription, FieldMessage, Input, PasswordInput, ClearableInput } from "../../../react";

export const meta = { id: "input", title: "입력 필드", group: "form", source: "both", note: "크기 4종(small·medium·large·xlarge), 상태(오류·성공·정보·읽기 전용·비활성), 비밀번호 보기·내용 삭제 버튼." };

export default function Demo() {
  return (
    <div style={{ display: "grid", gap: 24, maxWidth: 560 }}>
      <div className="fieldset">
        {(["small", "medium", "large"] as const).map((s) => (
          <Field key={s}>
            <FieldLabel>주소 검색 ({s})</FieldLabel>
            <FieldControl><Input size={s} placeholder="한빛시 도로명 또는 건물명" /></FieldControl>
          </Field>
        ))}
        <Field>
          <FieldLabel>통합 검색 (xlarge)</FieldLabel>
          <FieldControl><Input size="xlarge" placeholder="찾으시는 민원을 입력하세요" /></FieldControl>
        </Field>
      </div>
      <div className="fieldset">
        <Field invalid>
          <FieldLabel>주민등록번호 앞자리</FieldLabel>
          <FieldControl><Input size="medium" defaultValue="99133" inputMode="numeric" /></FieldControl>
          <FieldMessage tone="error">생년월일 6자리를 입력해 주세요.</FieldMessage>
        </Field>
        <Field>
          <FieldLabel>아이디</FieldLabel>
          <FieldControl state="success"><Input size="medium" defaultValue="hanbit2026" /></FieldControl>
          <FieldMessage tone="success">사용할 수 있는 아이디입니다.</FieldMessage>
        </Field>
        <Field>
          <FieldLabel>우편번호</FieldLabel>
          <FieldControl state="information"><Input size="medium" defaultValue="34521" /></FieldControl>
          <FieldMessage tone="information">도로명주소 기준 우편번호입니다.</FieldMessage>
        </Field>
        <Field>
          <FieldLabel>신청 부서</FieldLabel>
          <FieldControl><Input size="medium" defaultValue="한빛시 민원여권과" readOnly /></FieldControl>
          <FieldDescription>신청 부서는 바꿀 수 없습니다.</FieldDescription>
        </Field>
        <Field disabled>
          <FieldLabel>담당자</FieldLabel>
          <FieldControl><Input size="medium" defaultValue="배정 전" /></FieldControl>
        </Field>
      </div>
      <div className="fieldset">
        <Field>
          <FieldLabel>비밀번호</FieldLabel>
          <PasswordInput size="large" defaultValue="hanbit!2026" placeholder="8~12자의 영문자, 숫자, 특수문자 조합" />
          <FieldDescription>눈 모양 버튼을 누르면 입력한 비밀번호가 보입니다.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel>검색어</FieldLabel>
          <ClearableInput size="large" defaultValue="여권 재발급" placeholder="검색어를 입력하세요" />
        </Field>
      </div>
    </div>
  );
}

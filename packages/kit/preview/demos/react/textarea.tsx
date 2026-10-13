import { Field, FieldLabel, FieldControl, FieldDescription, FieldError, Textarea } from "../../../react";

export const meta = { id: "textarea", title: "텍스트 영역", group: "form", source: "both" };

export default function Demo() {
  return (
    <div className="fieldset" style={{ maxWidth: 640 }}>
      <Field required>
        <FieldLabel>민원 내용</FieldLabel>
        <FieldControl>
          <Textarea showCount maxLength={500} placeholder="불편하셨던 점을 구체적으로 적어 주세요." defaultValue="한빛시청 앞 횡단보도 신호가 너무 짧아 어르신들이 건너기 어렵습니다." />
        </FieldControl>
        <FieldDescription>개인정보(주민등록번호·계좌번호)는 적지 마세요.</FieldDescription>
      </Field>
      <Field invalid>
        <FieldLabel>처리 요청 사유</FieldLabel>
        <FieldControl>
          <Textarea showCount maxLength={200} defaultValue="" placeholder="사유를 적어 주세요." />
        </FieldControl>
        <FieldError>처리 요청 사유를 입력해 주세요.</FieldError>
      </Field>
    </div>
  );
}

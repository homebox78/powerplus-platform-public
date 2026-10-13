import * as React from "react";
import { InputOTP } from "../../../react";

export const meta = { id: "input-otp", title: "인증번호 입력", group: "form", source: "shadcn", note: "한 칸에 한 글자, 붙여넣으면 칸마다 나눠 채웁니다." };

export default function Demo() {
  const [done, setDone] = React.useState("");
  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <p className="hb-label">휴대전화 인증번호</p>
        <InputOTP length={6} size="medium" aria-label="휴대전화 인증번호" onComplete={setDone} defaultValue="4821" />
        <p className="form-hint" style={{ fontSize: 15 }}>{done ? `입력 완료: ${done}` : "문자로 받은 6자리 숫자를 입력하세요. (남은 시간 2:48)"}</p>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <p className="hb-label">이메일 확인 코드</p>
        <InputOTP length={6} size="medium" pattern="alphanumeric" separatorAfter={3} aria-label="이메일 확인 코드" />
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <p className="hb-label">잘못된 인증번호</p>
        <InputOTP length={4} size="medium" invalid defaultValue="1234" aria-label="잘못된 인증번호 예시" />
      </div>
    </div>
  );
}

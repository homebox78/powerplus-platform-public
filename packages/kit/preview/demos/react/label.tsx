import { Label, Input } from "../../../react";

export const meta = { id: "label", title: "레이블", group: "form", source: "shadcn", note: "필수 표시는 별표와 화면낭독용 '(필수)' 글자를 함께 둡니다." };

export default function Demo() {
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 480 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <Label htmlFor="lb-name" required>신청인 이름</Label>
        <Input id="lb-name" size="medium" placeholder="홍길동" autoComplete="name" />
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <Label htmlFor="lb-tel">연락처</Label>
        <Input id="lb-tel" size="medium" placeholder="010-0000-0000" inputMode="tel" autoComplete="tel" />
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <Label htmlFor="lb-no" disabled>접수번호(자동 부여)</Label>
        <Input id="lb-no" size="medium" value="2026-한빛-004817" disabled readOnly />
      </div>
    </div>
  );
}

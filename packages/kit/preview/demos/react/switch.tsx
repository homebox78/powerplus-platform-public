import { Switch } from "../../../react";

export const meta = { id: "switch", title: "토글 스위치", group: "form", source: "both" };

export default function Demo() {
  return (
    <>
      <div className="pv-row">
        <Switch label="민원 처리 알림 받기" />
        <Switch label="행사 소식 받기" defaultChecked />
        <Switch label="야간 알림(준비 중)" disabled />
      </div>
      <div className="pv-row">
        <Switch size="large" label="크기 large" defaultChecked />
        <Switch size="medium" label="크기 medium" />
      </div>
    </>
  );
}

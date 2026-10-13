import { Slider } from "../../../react";

export const meta = { id: "slider", title: "슬라이더", group: "form", source: "shadcn", note: "실제 range 입력이라 ←→·Home·End·PageUp/Down 이 그대로 동작합니다." };

export default function Demo() {
  return (
    <div style={{ display: "grid", gap: 28, maxWidth: 480 }}>
      <Slider label="글자 크기" min={80} max={150} step={10} defaultValue={100} unit="%" marks={["80%", "115%", "150%"]} />
      <Slider label="검색 반경" min={1} max={20} defaultValue={5} unit="km" marks={["1km", "20km"]} />
      <Slider label="음성 읽기 속도(준비 중)" min={0} max={2} step={0.5} defaultValue={1} unit="배" disabled />
    </div>
  );
}

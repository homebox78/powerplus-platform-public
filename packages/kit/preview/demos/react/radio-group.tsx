import { RadioGroup, RadioGroupItem } from "../../../react";

export const meta = { id: "radio-group", title: "라디오 버튼", group: "form", source: "both", note: "같은 묶음 안에서 방향키로 이동·선택합니다." };

export default function Demo() {
  return (
    <>
      <RadioGroup aria-label="상태 예시" defaultValue="b">
        <RadioGroupItem value="a" label="기본" />
        <RadioGroupItem value="b" label="선택됨" />
        <RadioGroupItem value="c" label="비활성화" disabled />
      </RadioGroup>
      <RadioGroup aria-label="증명서 수령 방법" defaultValue="mail" column>
        <RadioGroupItem value="visit" label="방문 수령" description="한빛시청 민원실(1층)에서 평일 9시~18시에 받으실 수 있습니다." />
        <RadioGroupItem value="mail" label="우편 수령" description="등기우편으로 3~5일 안에 도착합니다." />
        <RadioGroupItem value="online" label="온라인 발급" description="정부24에서 바로 출력할 수 있습니다." />
      </RadioGroup>
      <RadioGroup aria-label="크기 예시" size="large" defaultValue="l">
        <RadioGroupItem value="l" label="크기 large" />
        <RadioGroupItem value="l2" label="크기 large" />
      </RadioGroup>
    </>
  );
}

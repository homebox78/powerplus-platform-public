import { Tts } from "../../../react";

export const meta = {
  id: "tts",
  title: "음성 읽기",
  group: "gov",
  source: "krds",
  note: "브라우저 음성 합성으로 글을 읽고, 다시 누르면 멈춘다. 지원하지 않는 브라우저에서는 버튼이 꺼지고 안내가 보인다.",
};

export default function Demo() {
  return (
    <>
      <p id="hb-tts-demo-text">
        한빛시는 10월 1일부터 전자민원 창구를 새로 엽니다. 주민등록 등본과 가족관계증명서를 집에서 바로 발급받을 수 있습니다.
      </p>
      <div className="pv-row pv-mt">
        <Tts target="#hb-tts-demo-text" />
        <Tts target="#hb-tts-demo-text" variant="play" />
        <Tts target="#hb-tts-demo-text" iconOnly aria-label="공지 읽어주기" />
        <Tts text="비활성 예시" disabled label="읽어주기" />
      </div>
      <div className="pv-row">
        <Tts size="xsmall" text="작은 크기 음성 읽기" label="아주 작게" />
        <Tts size="small" text="작은 크기 음성 읽기" label="작게" />
        <Tts size="medium" text="보통 크기 음성 읽기" label="보통" />
      </div>
    </>
  );
}

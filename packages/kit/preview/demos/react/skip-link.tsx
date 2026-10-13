import { SkipLink } from "../../../react";

export const meta = {
  id: "skip-link",
  title: "건너뛰기 링크",
  group: "gov",
  source: "krds",
  note: "평소엔 숨어 있다가 Tab 으로 초점을 받으면 나타난다. 위는 늘 보이게 한 미리보기, 아래는 실제 동작(Tab 을 눌러 보세요).",
};

export default function Demo() {
  return (
    <>
      <SkipLink preview id="krds-skip-link" links={[
        { href: "#contents", label: "본문 바로가기" },
        { href: "#gnb", label: "주메뉴 바로가기" },
      ]} />
      <p className="pv-mt">아래 자리에 초점이 오면 "본문 바로가기"가 나타납니다.</p>
      <SkipLink inline href="#contents" />
    </>
  );
}

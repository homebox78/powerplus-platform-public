import { Kbd, KbdGroup } from "../../../react";

export const meta = { id: "kbd", title: "키보드 키", group: "action", source: "shadcn", note: "단축키 안내 · 키 조합" };

export default function Demo() {
  return (
    <>
      <p>본문으로 바로 가려면 <Kbd>Tab</Kbd> 키를 누른 뒤 <Kbd>Enter</Kbd> 키를 누르세요.</p>
      <p>
        화면 글자 크게: <KbdGroup><Kbd>Ctrl</Kbd><span>+</span><Kbd>+</Kbd></KbdGroup>
        {"  "}· 작게: <KbdGroup><Kbd>Ctrl</Kbd><span>+</span><Kbd>-</Kbd></KbdGroup>
      </p>
    </>
  );
}

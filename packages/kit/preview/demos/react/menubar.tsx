import * as React from "react";
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "../../../react";

export const meta = {
  id: "menubar",
  title: "메뉴 막대",
  group: "overlay",
  source: "shadcn",
  note: "←/→ 로 메뉴 사이 이동 · ↓·Enter 로 열기 · 열린 채 ←/→ 면 옆 메뉴가 열린다",
};

export default function Demo() {
  const [ruler, setRuler] = React.useState(true);
  const [zoom, setZoom] = React.useState("100");
  const [last, setLast] = React.useState("");
  return (
    <>
      <Menubar aria-label="공문서 편집">
        <MenubarMenu>
          <MenubarTrigger data-testid="mb-file">파일</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onSelect={() => setLast("새 공문서")}>
              새 공문서<MenubarShortcut>Ctrl+N</MenubarShortcut>
            </MenubarItem>
            <MenubarItem onSelect={() => setLast("불러오기")}>
              불러오기<MenubarShortcut>Ctrl+O</MenubarShortcut>
            </MenubarItem>
            <MenubarSub>
              <MenubarSubTrigger>서식 내려받기</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem onSelect={() => setLast("기안문 서식")}>기안문</MenubarItem>
                <MenubarItem onSelect={() => setLast("시행문 서식")}>시행문</MenubarItem>
                <MenubarItem onSelect={() => setLast("보도자료 서식")}>보도자료</MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSeparator />
            <MenubarItem onSelect={() => setLast("인쇄")}>
              인쇄<MenubarShortcut>Ctrl+P</MenubarShortcut>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger>편집</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onSelect={() => setLast("되돌리기")}>
              되돌리기<MenubarShortcut>Ctrl+Z</MenubarShortcut>
            </MenubarItem>
            <MenubarItem disabled>다시 하기</MenubarItem>
            <MenubarSeparator />
            <MenubarItem onSelect={() => setLast("찾기")}>찾기</MenubarItem>
            <MenubarItem onSelect={() => setLast("바꾸기")}>바꾸기</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger>보기</MenubarTrigger>
          <MenubarContent>
            <MenubarCheckboxItem checked={ruler} onCheckedChange={(v) => setRuler(v === true)}>눈금자</MenubarCheckboxItem>
            <MenubarSeparator />
            <MenubarRadioGroup value={zoom} onValueChange={setZoom}>
              <MenubarRadioItem value="75">75%</MenubarRadioItem>
              <MenubarRadioItem value="100">100%</MenubarRadioItem>
              <MenubarRadioItem value="150">150%</MenubarRadioItem>
            </MenubarRadioGroup>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
      <p className="pv-note" aria-live="polite">
        {last ? `실행: ${last}` : "메뉴를 열어 보세요."} · 눈금자 {ruler ? "보임" : "숨김"} · 확대 {zoom}%
      </p>
    </>
  );
}

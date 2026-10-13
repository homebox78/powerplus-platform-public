import * as React from "react";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "../../../react";

export const meta = {
  id: "context-menu",
  title: "오른쪽 클릭 메뉴",
  group: "overlay",
  source: "shadcn",
  note: "마우스 오른쪽 클릭 또는 영역에 포커스를 두고 Shift+F10 으로 연다. 같은 기능을 버튼으로도 제공할 것.",
};

export default function Demo() {
  const [preview, setPreview] = React.useState(true);
  const [done, setDone] = React.useState("");
  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger className="hb-context-area" tabIndex={0} data-testid="cm-area">
          첨부파일: 2026년 한빛시 주민참여예산 공모 안내문.hwpx (182KB)
          <br />
          이 영역에서 마우스 오른쪽 버튼을 누르세요.
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuLabel>첨부파일</ContextMenuLabel>
          <ContextMenuItem onSelect={() => setDone("내려받기")}>
            내려받기<ContextMenuShortcut>Ctrl+S</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => setDone("바로보기")}>바로보기</ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>다른 형식으로 받기</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem onSelect={() => setDone("PDF로 받기")}>PDF</ContextMenuItem>
              <ContextMenuItem onSelect={() => setDone("ODT로 받기")}>ODT(개방형 문서)</ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator />
          <ContextMenuCheckboxItem checked={preview} onCheckedChange={(v) => setPreview(v === true)}>
            목록에서 미리보기 표시
          </ContextMenuCheckboxItem>
          <ContextMenuSeparator />
          <ContextMenuItem variant="danger" onSelect={() => setDone("첨부 삭제")}>첨부 삭제</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <p className="pv-note" aria-live="polite">
        {done ? `실행: ${done}` : "아직 실행한 메뉴가 없습니다."} · 미리보기 {preview ? "표시" : "숨김"}
      </p>
    </>
  );
}

import * as React from "react";
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../../../react";

export const meta = {
  id: "dropdown-menu",
  title: "드롭다운 메뉴",
  group: "overlay",
  source: "shadcn",
  note: "↑↓ 이동 · → 하위 메뉴 · Esc 닫기 · 글자를 치면 그 글자로 시작하는 항목으로 이동",
};

export default function Demo() {
  const [alarm, setAlarm] = React.useState(true);
  const [sms, setSms] = React.useState(false);
  const [sort, setSort] = React.useState("recent");
  const [picked, setPicked] = React.useState("");
  return (
    <>
      <div className="pv-row">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="tertiary" data-testid="dm-trigger">
              나의 민원 <i className="svg-icon ico-angle" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>홍길동 님</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => setPicked("신청 내역")}>
                신청 내역<DropdownMenuShortcut>Alt+1</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setPicked("처리 현황")}>
                처리 현황<DropdownMenuShortcut>Alt+2</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>증명서 발급</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onSelect={() => setPicked("주민등록표 등본")}>주민등록표 등본</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setPicked("가족관계증명서")}>가족관계증명서</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setPicked("지방세 납세증명서")}>지방세 납세증명서</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem disabled>전자문서지갑(점검 중)</DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>알림 받기</DropdownMenuLabel>
            <DropdownMenuCheckboxItem checked={alarm} onCheckedChange={(v) => setAlarm(v === true)}>
              처리 결과 알림
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={sms} onCheckedChange={(v) => setSms(v === true)}>
              문자 메시지로도 받기
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="danger" onSelect={() => setPicked("로그아웃")}>로그아웃</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="medium">
              정렬: {sort === "recent" ? "최신순" : sort === "views" ? "조회순" : "제목순"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuRadioGroup value={sort} onValueChange={setSort}>
              <DropdownMenuRadioItem value="recent">최신순</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="views">조회순</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="title">제목순</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="pv-note" aria-live="polite">
        {picked ? `고른 메뉴: ${picked}` : "메뉴를 열어 항목을 골라 보세요."} · 알림 {alarm ? "켬" : "끔"} · 문자 {sms ? "켬" : "끔"}
      </p>
    </>
  );
}

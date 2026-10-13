import * as React from "react";
import {
  Button,
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "../../../react";

export const meta = {
  id: "command",
  title: "명령 팔레트",
  group: "overlay",
  source: "shadcn",
  note: "입력칸에 포커스를 둔 채 ↑↓ 로 고르고 Enter. 동의어(예: 이사 → 전입신고)로도 찾아진다.",
};

const MENUS = [
  { group: "자주 찾는 민원", items: [
    { v: "전입신고", k: ["이사", "주소 이전"], s: "Alt+1" },
    { v: "주민등록표 등본 발급", k: ["등본", "증명서"] },
    { v: "여권 재발급 신청", k: ["여권"] },
    { v: "대형폐기물 배출 신고", k: ["가구", "스티커", "폐기물"] },
  ] },
  { group: "분야별 정보", items: [
    { v: "주민참여예산", k: ["예산", "제안"] },
    { v: "청년 월세 지원", k: ["청년", "주거", "월세"] },
    { v: "공공시설 예약", k: ["체육관", "회의실", "대관"] },
  ] },
];

function Menus({ onPick }: { onPick: (v: string) => void }) {
  return (
    <>
      <CommandInput placeholder="찾을 민원이나 메뉴를 입력하세요" />
      <CommandList aria-label="찾은 메뉴">
        <CommandEmpty>찾는 메뉴가 없습니다. 다른 낱말로 찾아 보세요.</CommandEmpty>
        {MENUS.map((g, gi) => (
          <React.Fragment key={g.group}>
            {gi > 0 && <CommandSeparator />}
            <CommandGroup heading={g.group}>
              {g.items.map((it) => (
                <CommandItem key={it.v} value={it.v} keywords={it.k} onSelect={onPick}>
                  {it.v}
                  {"s" in it && it.s && <CommandShortcut>{it.s}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          </React.Fragment>
        ))}
      </CommandList>
    </>
  );
}

export default function Demo() {
  const [picked, setPicked] = React.useState("");
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <div style={{ maxWidth: 560 }}>
        <Command label="민원 메뉴 찾기" data-testid="cmd">
          <Menus onPick={setPicked} />
        </Command>
      </div>
      <div className="pv-row">
        <Button variant="tertiary" onClick={() => setOpen(true)}>
          <i className="svg-icon ico-sch" aria-hidden="true" /> 메뉴 찾기 창 열기
        </Button>
        <span className="pv-note" aria-live="polite">{picked ? `고른 메뉴: ${picked}` : "메뉴를 골라 보세요."}</span>
      </div>
      <CommandDialog open={open} onOpenChange={setOpen} title="민원 메뉴 찾기">
        <Menus
          onPick={(v) => {
            setPicked(v);
            setOpen(false);
          }}
        />
      </CommandDialog>
    </>
  );
}

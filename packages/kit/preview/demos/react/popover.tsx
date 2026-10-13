import * as React from "react";
import { Button, Popover, PopoverTrigger, PopoverContent, PopoverTitle, PopoverDescription, PopoverClose } from "../../../react";

export const meta = {
  id: "popover",
  title: "팝오버",
  group: "overlay",
  source: "shadcn",
  note: "버튼을 눌러 여는 작은 레이어. 입력·버튼을 넣을 수 있고, Esc·바깥을 누르면 닫혀 버튼으로 포커스가 돌아온다.",
};

const WAYS = ["문자 메시지", "전자우편", "카카오 알림톡"];

export default function Demo() {
  const [ways, setWays] = React.useState<string[]>(["문자 메시지"]);
  const [saved, setSaved] = React.useState("문자 메시지");
  return (
    <div className="pv-row">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="secondary">처리 결과 알림 설정</Button>
        </PopoverTrigger>
        <PopoverContent aria-labelledby="pop-r-title" align="start" arrow>
          <PopoverTitle id="pop-r-title">처리 결과를 받을 방법</PopoverTitle>
          <PopoverDescription>민원 처리가 끝나면 고른 방법으로 알려 드립니다.</PopoverDescription>
          <div className="krds-check-area chk-column">
            {WAYS.map((w, i) => (
              <div key={w} className="krds-form-check">
                <input
                  type="checkbox"
                  id={`pop-r-${i}`}
                  checked={ways.includes(w)}
                  onChange={(e) => setWays(e.target.checked ? [...ways, w] : ways.filter((x) => x !== w))}
                />
                <label htmlFor={`pop-r-${i}`}>{w}</label>
              </div>
            ))}
          </div>
          <div className="pv-row" style={{ justifyContent: "flex-end", margin: "16px 0 0" }}>
            <PopoverClose asChild>
              <Button size="small" onClick={() => setSaved(ways.join(", ") || "받지 않음")}>저장</Button>
            </PopoverClose>
          </div>
        </PopoverContent>
      </Popover>
      <p role="status">받을 방법: {saved}</p>
    </div>
  );
}

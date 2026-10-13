import { Button, Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetBody, SheetFooter, SheetClose } from "../../../react";

export const meta = {
  id: "sheet",
  title: "시트",
  group: "overlay",
  source: "shadcn",
  note: "화면 가장자리(오른쪽·왼쪽·위·아래)에서 밀려 나오는 패널. 검색 조건·보조 메뉴처럼 본문을 두고 잠깐 여는 내용에 쓴다.",
};

const MENU = ["민원 안내", "여권 발급", "주민등록 발급", "인감·본인서명", "가족관계 등록", "자동차 등록"];

export default function Demo() {
  return (
    <div className="pv-row">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="secondary">상세 검색 조건</Button>
        </SheetTrigger>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>상세 검색 조건</SheetTitle>
            <SheetDescription>한빛시 공지사항에서 찾을 조건을 고르세요.</SheetDescription>
          </SheetHeader>
          <SheetBody>
            <div className="fieldset">
            <div className="form-group">
              <div className="form-tit">
                <label htmlFor="sheet-r-kw">검색어</label>
              </div>
              <div className="form-conts">
                <input type="text" id="sheet-r-kw" className="krds-input" placeholder="예: 여권 재발급" />
              </div>
            </div>
            <div className="form-group" role="group" aria-labelledby="sheet-r-dept">
              <div className="form-tit" id="sheet-r-dept">담당 부서</div>
              <div className="krds-check-area">
                {["민원여권과", "세무과", "교통행정과"].map((d, i) => (
                  <div key={d} className="krds-form-check">
                    <input type="checkbox" id={`sheet-r-dept-${i}`} defaultChecked={i === 0} />
                    <label htmlFor={`sheet-r-dept-${i}`}>{d}</label>
                  </div>
                ))}
              </div>
            </div>
            </div>
          </SheetBody>
          <SheetFooter>
            <SheetClose asChild>
              <Button variant="tertiary">초기화</Button>
            </SheetClose>
            <SheetClose asChild>
              <Button>검색</Button>
            </SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet>
        <SheetTrigger asChild>
          <Button variant="tertiary">민원 메뉴(왼쪽)</Button>
        </SheetTrigger>
        <SheetContent side="left" aria-describedby={undefined}>
          <SheetHeader>
            <SheetTitle>민원 메뉴</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <ul style={{ display: "grid", gap: 16 }}>
              {MENU.map((m) => (
                <li key={m}>
                  <a href="#sheet">{m}</a>
                </li>
              ))}
            </ul>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  );
}

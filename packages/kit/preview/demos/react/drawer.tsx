import * as React from "react";
import { Button, Drawer, DrawerTrigger, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerBody, DrawerFooter, DrawerClose } from "../../../react";

export const meta = {
  id: "drawer",
  title: "드로어(바텀시트)",
  group: "overlay",
  source: "both",
  note: "KRDS 모달의 바텀시트. 아래에서 올라오고, 위쪽 손잡이를 끌어내리거나 Esc·닫기로 닫는다.",
};

const SORTS = ["최신순", "조회순", "마감 임박순"];

export default function Demo() {
  const [sort, setSort] = React.useState(SORTS[0]);
  const [pick, setPick] = React.useState(SORTS[0]);
  return (
    <div className="pv-row">
      <Drawer onOpenChange={(o) => o && setPick(sort)}>
        <DrawerTrigger asChild>
          <Button variant="secondary">정렬: {sort}</Button>
        </DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>정렬 방식</DrawerTitle>
          </DrawerHeader>
          <DrawerBody>
            <DrawerDescription>한빛시 행사·공모 목록을 어떤 순서로 볼지 고르세요.</DrawerDescription>
            <fieldset className="krds-check-area">
              <legend className="sr-only">정렬 방식</legend>
              {SORTS.map((s, i) => (
                <div key={s} className="krds-form-check">
                  <input type="radio" name="drawer-r-sort" id={`drawer-r-${i}`} checked={pick === s} onChange={() => setPick(s)} />
                  <label htmlFor={`drawer-r-${i}`}>{s}</label>
                </div>
              ))}
            </fieldset>
          </DrawerBody>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant="tertiary">취소</Button>
            </DrawerClose>
            <DrawerClose asChild>
              <Button onClick={() => setSort(pick)}>적용</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

// 모바일 탭 묶음 — 640px 미만에서만 큰 덩어리(차트 카드·설정 칸) 여러 개를 탭 하나로 묶어 한 번에 하나만 보인다(사용자 2026-10-10
// "관리자 모드도 모바일에서 너무 아래로 나열된 것들은 캐러셀·아코디언·탭으로").
// 640px 이상은 아무것도 바뀌지 않는다 — 탭 줄은 sm:hidden, 숨김은 max-sm:hidden 뿐이라 PC 그리드·순서가 그대로다.
// 쓰는 법: const ms = useMobileSections("보기", [{ value: "a", label: "추이" }, …]); {ms.bar} 을 덩어리 위에 두고,
// 각 덩어리 className 에 ms.hide("a") 를 더하거나(카드), 감싸야 하면 <div className={ms.wrap("a")}> (display:contents — PC 그리드 칸을 바꾸지 않는다).
import { useState } from "react";
import { SegTabs, type SegItem } from "@/components/hb/seg-tabs";
import { cn } from "@/lib/utils";

export function useMobileSections<T extends string>(label: string, items: SegItem<T>[]) {
  const [value, setValue] = useState<T>(items[0]!.value);
  const bar = (
    <div className="sm:hidden">
      <SegTabs label={label} value={value} onChange={setValue} items={items}
        className="flex w-full flex-nowrap" itemClassName="min-w-0 flex-1 px-2" />
    </div>
  );
  const hide = (k: T) => (k === value ? "" : "max-sm:hidden");
  const wrap = (k: T) => cn("contents", hide(k));
  return { bar, hide, wrap, value };
}

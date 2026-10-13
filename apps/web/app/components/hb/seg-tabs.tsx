// 세그먼트 탭 — 회색 판 위에 고른 칸만 흰 면으로 떠오른다(사용자 2026-10-07 "한 덩어리로 안 보이게 탭 형식으로").
// 칸마다 테두리를 두르는 outline 토글 대신 이것을 쓴다. 대시보드 기간·메일 서식·미리보기 폭·상태 필터 공용.
import type { ReactNode } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

export type SegItem<T extends string> = { value: T; label: ReactNode; title?: string };

export function SegTabs<T extends string>({ value, onChange, items, label, className, itemClassName }: {
  value: T;
  onChange: (v: T) => void;
  items: SegItem<T>[];
  label: string;
  className?: string;
  itemClassName?: string;
}) {
  return (
    <ToggleGroup type="single" value={value} onValueChange={(v) => v && onChange(v as T)} size="sm" spacing={0} aria-label={label}
      className={cn("w-fit flex-wrap gap-0.5 rounded-lg bg-ground-3 p-1", className)}>
      {items.map((it) => (
        <ToggleGroupItem key={it.value} value={it.value} aria-label={it.title} title={it.title}
          className={cn("h-8 rounded-md! px-4 text-sm font-medium text-ink-4 hover:bg-transparent hover:text-ink aria-checked:bg-ground aria-checked:font-bold aria-checked:text-ink aria-checked:shadow-[0_1px_3px_rgba(0,0,0,0.12)] data-[state=on]:bg-ground data-[state=on]:text-ink", itemClassName)}>
          {it.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

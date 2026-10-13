/**
 * 테마 전환 (사용자 지시 2026-09-26 "다크모드나 해당 옵션들도 동작하게").
 * next-themes 가 <html class="dark"> 를 붙이고 localStorage 에 기억한다. 시스템 = 운영체제 설정을 따른다.
 * 서버 렌더가 없는 SPA 지만 첫 그림에서 선택 표시가 튀지 않게 마운트 뒤에만 강조한다.
 */
import { Contrast, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { id: "light", label: "라이트", Icon: Sun },
  { id: "dark", label: "다크", Icon: Moon },
  { id: "system", label: "시스템 설정", Icon: Contrast },
] as const;

export function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 여부 표시(하이드레이션 전 강조 방지)
  useEffect(() => setMounted(true), []);
  const current = mounted ? (theme ?? "light") : "";
  return (
    <span className="flex rounded-full bg-white/10 p-0.5" role="radiogroup" aria-label="테마">
      {OPTIONS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={current === id}
          aria-label={label}
          title={label}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setTheme(id); }}
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-full transition-colors",
            current === id ? "bg-white/25 text-white" : "text-white/55 hover:bg-white/10 hover:text-white",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </button>
      ))}
    </span>
  );
}

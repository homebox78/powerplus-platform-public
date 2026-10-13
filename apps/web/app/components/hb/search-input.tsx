import { Search } from "lucide-react";
import { forwardRef, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// docs/03 §3 검색창: pill bg-ground-3, 좌 아이콘, 우 단축키 kbd. 헤더 520×44 / 홈 720×60
// 단축키 표시는 맥이면 ⌘K, 그 밖(Windows 등)은 Ctrl K — 서버 렌더는 Ctrl K, 맥만 마운트 뒤 바꾼다(사이트종합평가리포트 3-2-9).
export interface SearchInputProps extends Omit<React.ComponentProps<"input">, "size"> {
  size?: "header" | "hero";
  kbd?: boolean;
  className?: string;
}

function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  const p = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? "";
  return /mac|iphone|ipad/i.test(p);
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput({ size = "header", kbd = true, className, "aria-label": ariaLabel = "검색", ...props }, ref) {
  const hero = size === "hero";
  const inner = useRef<HTMLInputElement | null>(null);
  const [mac, setMac] = useState(false);
  useEffect(() => {
    if (!kbd) return;
    setMac(isMac());
    // 표시한 단축키는 실제로 동작해야 한다 — ⌘K / Ctrl K 로 이 검색창에 초점
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); inner.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [kbd]);
  const setRef = (el: HTMLInputElement | null) => {
    inner.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  };
  return (
    <label
      className={cn(
        // 포커스 시 링 없음(사용자 지시) — 배경만 한 단계 진해져 상태를 표현
        "flex items-center gap-2.5 rounded-chip bg-ground-3 text-ink-4 transition-colors focus-within:bg-ground-4",
        hero ? "h-[60px] px-5 text-lg" : "h-10 px-4 text-sm",
        className,
      )}
    >
      <Search className={cn("shrink-0 text-ink-3", hero ? "size-5" : "size-[18px]")} aria-hidden />
      <input
        ref={setRef}
        type="search"
        aria-label={ariaLabel}
        className={cn("min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-4 max-md:placeholder:text-transparent", hero ? "text-lg" : "text-md")}
        {...props}
      />
      {kbd && (
        <kbd aria-hidden className="whitespace-nowrap rounded-md border border-line-3 bg-white px-1.5 py-0.5 font-sans text-xs text-ink-4 max-md:hidden">{mac ? "⌘K" : "Ctrl K"}</kbd>
      )}
    </label>
  );
});

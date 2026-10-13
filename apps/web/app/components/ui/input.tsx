import * as React from "react"
import { cn } from "@/lib/utils"

// 높이 규칙: Input 기본 h-11 = Button size="lg"(44) — 2026-10-06 사용자 "한 단계 작게"로 전부 한 단계 축소. 같은 줄/폼의 입력과 버튼은 항상 같은 높이(size sm 버튼 옆엔 className="h-9" 로 맞춘다).
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-field border border-input bg-transparent px-3.5 py-1 text-md transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-line-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }

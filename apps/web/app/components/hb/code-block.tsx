import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

// docs/03 §3 코드 블록: p-5 rounded-card bg-dark text-[#E8E8E8] text-sm/1.7 mono + 우상단 복사 버튼
export function CodeBlock({ code, children, className, label = "코드 복사" }: { code: string; children?: React.ReactNode; className?: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 클립보드 차단 환경 — 조용히 무시 */
    }
  };
  return (
    <div className={cn("relative rounded-card bg-dark p-5 text-sm leading-[1.7] text-[#E8E8E8]", className)}>
      <button
        type="button"
        onClick={copy}
        aria-label={label}
        className="absolute right-3 top-3 inline-flex size-9 items-center justify-center rounded-chip text-white/70 hover:bg-white/10 hover:text-white"
      >
        {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      </button>
      <pre className="m-0 whitespace-pre-wrap break-words">{children ?? code}</pre>
    </div>
  );
}

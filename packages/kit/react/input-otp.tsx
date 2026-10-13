"use client";
// 인증번호 입력 — shadcn InputOTP 와 비슷한 사용법 (KRDS 에 없음 → 칸 모양은 KRDS 입력 칸)
//   <InputOTP length={6} aria-label="휴대전화 인증번호" onComplete={(code) => …} />
// 한 칸에 한 글자. 입력하면 다음 칸으로, 지우면 앞 칸으로, ←→ 로 칸 이동,
// 붙여넣기(예: 문자로 받은 6자리)는 칸마다 나눠 채운다. 첫 칸은 one-time-code 자동완성.
import * as React from "react";
import { cx } from "./utils";

export interface InputOTPProps {
  length?: number;
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  onComplete?: (v: string) => void;
  /** 숫자만(기본) · 영문·숫자 */
  pattern?: "digits" | "alphanumeric";
  /** 이 칸 뒤에 구분선 (예: 3 → 3자리-3자리) */
  separatorAfter?: number;
  size?: "small" | "medium" | "large";
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
}

export const InputOTP = React.forwardRef<HTMLDivElement, InputOTPProps>(function InputOTP(
  {
    length = 6, value, defaultValue = "", onValueChange, onComplete, pattern = "digits", separatorAfter,
    size = "large", disabled, invalid, className, ...aria
  },
  ref,
) {
  const [inner, setInner] = React.useState(defaultValue);
  const current = (value ?? inner).slice(0, length);
  const cells = React.useRef<Array<HTMLInputElement | null>>([]);
  const ok = pattern === "digits" ? /[0-9]/ : /[0-9a-zA-Z]/;
  const label = aria["aria-label"] ?? "인증번호";

  const commit = (next: string) => {
    if (value === undefined) setInner(next);
    onValueChange?.(next);
    if (next.length === length && !next.includes(" ")) onComplete?.(next);
  };
  const setAt = (i: number, chars: string) => {
    const arr = current.padEnd(length, " ").split("");
    let j = i;
    for (const c of chars) {
      if (j >= length) break;
      if (!ok.test(c)) continue;
      arr[j++] = c;
    }
    commit(arr.join("").replace(/\s+$/, ""));
    cells.current[Math.min(j, length - 1)]?.focus();
  };

  return (
    <div ref={ref} role="group" aria-label={label} aria-describedby={aria["aria-describedby"]} className={cx("hb-otp", className)}>
      {Array.from({ length }, (_, i) => {
        const ch = current[i] && current[i] !== " " ? current[i] : "";
        return (
          <React.Fragment key={i}>
            <input
              ref={(el) => { cells.current[i] = el; }}
              className={cx("krds-input", size, "hb-otp-slot")}
              type="text"
              inputMode={pattern === "digits" ? "numeric" : "text"}
              autoComplete={i === 0 ? "one-time-code" : "off"}
              maxLength={1}
              value={ch}
              disabled={disabled}
              aria-invalid={invalid || undefined}
              aria-label={`${label} ${length}자리 중 ${i + 1}번째`}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                setAt(i, v.slice(-1));
              }}
              onPaste={(e) => {
                e.preventDefault();
                setAt(i, e.clipboardData.getData("text").trim());
              }}
              onKeyDown={(e) => {
                if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                  e.preventDefault();
                  setAt(i, e.key);
                } else if (e.key === "Backspace") {
                  e.preventDefault();
                  const arr = current.padEnd(length, " ").split("");
                  if (ch) arr[i] = " ";
                  else if (i > 0) { arr[i - 1] = " "; cells.current[i - 1]?.focus(); }
                  commit(arr.join("").replace(/\s+$/, ""));
                } else if (e.key === "ArrowLeft" && i > 0) { e.preventDefault(); cells.current[i - 1]?.focus(); }
                else if (e.key === "ArrowRight" && i < length - 1) { e.preventDefault(); cells.current[i + 1]?.focus(); }
                else if (e.key === "Home") { e.preventDefault(); cells.current[0]?.focus(); }
                else if (e.key === "End") { e.preventDefault(); cells.current[length - 1]?.focus(); }
              }}
            />
            {separatorAfter === i + 1 && i < length - 1 && <span className="hb-otp-sep" aria-hidden="true" />}
          </React.Fragment>
        );
      })}
    </div>
  );
});

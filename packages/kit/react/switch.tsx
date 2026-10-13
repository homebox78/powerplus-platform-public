"use client";
// 토글 스위치 — KRDS 「토글 스위치(toggle_switch·toggle_switch_size)」 · shadcn Switch 와 같은 사용법
//   <Switch label="알림 받기" defaultChecked onCheckedChange={(on) => …} />
// 실제 checkbox 에 role="switch" — 화면낭독기가 "켬/끔"으로 읽는다. 스페이스로 전환.
import * as React from "react";
import { cx, useUid } from "./utils";

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "type"> {
  label: React.ReactNode;
  size?: "medium" | "large";
  onCheckedChange?: (checked: boolean) => void;
}

export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { label, size = "medium", id, className, onChange, onCheckedChange, ...props },
  ref,
) {
  const auto = useUid("hb-sw");
  const sid = id ?? auto;
  return (
    <div className={cx("krds-form-toggle-switch", size, className)}>
      <input
        ref={ref}
        type="checkbox"
        role="switch"
        id={sid}
        onChange={(e) => {
          onChange?.(e);
          onCheckedChange?.(e.target.checked);
        }}
        {...props}
      />
      <label htmlFor={sid}>
        <span className="switch-toggle" aria-hidden="true"><i /></span>
        {label}
      </label>
    </div>
  );
});

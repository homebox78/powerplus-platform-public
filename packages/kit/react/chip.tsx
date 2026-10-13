"use client";
// 선택 칩 — KRDS 「체크박스 칩(checkbox_chip)」·「라디오 칩(radio_chip)」
//   <CheckboxGroup aria-label="관심 분야">
//     <CheckboxChip label="복지" defaultChecked />
//     <CheckboxChip label="교통" />
//   </CheckboxGroup>
//   <RadioGroup aria-label="조회 기간" defaultValue="1m">
//     <RadioChip value="1w" label="1주일" />
//     <RadioChip value="1m" label="1개월" />
//   </RadioGroup>
// 겉모양은 둥근 칩, 속은 실제 체크박스·라디오라 키보드·화면낭독기 동작은 그대로다.
import * as React from "react";
import { cx, useUid } from "./utils";
import { RadioGroupContext } from "./radio-group";

export interface CheckboxChipProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "type"> {
  label: React.ReactNode;
  onCheckedChange?: (checked: boolean) => void;
}

export const CheckboxChip = React.forwardRef<HTMLInputElement, CheckboxChipProps>(function CheckboxChip(
  { label, id, className, onChange, onCheckedChange, ...props },
  ref,
) {
  const auto = useUid("hb-chip");
  const cid = id ?? auto;
  return (
    <div className={cx("krds-form-chip", className)}>
      <input
        ref={ref}
        type="checkbox"
        className="checkbox"
        id={cid}
        onChange={(e) => {
          onChange?.(e);
          onCheckedChange?.(e.target.checked);
        }}
        {...props}
      />
      <label className="krds-form-chip-outline" htmlFor={cid}>{label}</label>
    </div>
  );
});

export interface RadioChipProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "type" | "value"> {
  value: string;
  label: React.ReactNode;
}

export const RadioChip = React.forwardRef<HTMLInputElement, RadioChipProps>(function RadioChip(
  { value, label, id, disabled, className, ...props },
  ref,
) {
  const g = React.useContext(RadioGroupContext);
  if (!g) throw new Error("RadioChip 은 RadioGroup 안에서만 쓸 수 있습니다");
  const auto = useUid("hb-rchip");
  const cid = id ?? auto;
  return (
    <div className={cx("krds-form-chip", className)}>
      <input
        ref={ref}
        type="radio"
        className="radio"
        id={cid}
        name={g.name}
        value={value}
        checked={g.value === value}
        disabled={disabled ?? g.disabled}
        onChange={(e) => e.target.checked && g.setValue(value)}
        {...props}
      />
      <label className="krds-form-chip-outline" htmlFor={cid}>{label}</label>
    </div>
  );
});

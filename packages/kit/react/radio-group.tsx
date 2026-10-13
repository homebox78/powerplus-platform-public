"use client";
// 라디오 버튼 — KRDS 「라디오 버튼(radio_button·radio_size)」 · shadcn RadioGroup 과 같은 사용법
//   <RadioGroup aria-label="수령 방법" defaultValue="mail" column>
//     <RadioGroupItem value="visit" label="방문 수령" />
//     <RadioGroupItem value="mail" label="우편 수령" description="3~5일 걸립니다." />
//   </RadioGroup>
// 실제 input[type=radio] 를 같은 name 으로 묶는다 → ↑↓←→ 이동·선택은 브라우저가 처리한다.
// RadioChip(chip.tsx) 도 이 RadioGroup 안에서 쓴다.
import * as React from "react";
import { cx, useUid } from "./utils";

export interface RadioGroupContextValue {
  name: string;
  value: string | undefined;
  setValue: (v: string) => void;
  disabled: boolean;
  size: "medium" | "large";
}
export const RadioGroupContext = React.createContext<RadioGroupContextValue | null>(null);

export interface RadioGroupProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue"> {
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  disabled?: boolean;
  size?: "medium" | "large";
  column?: boolean;
  /** 선택 칩을 폭 가득 나눠 채운다 (KRDS chip-wrap) */
  fill?: boolean;
}

export const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(function RadioGroup(
  { name, value, defaultValue, onValueChange, disabled = false, size = "medium", column = true, fill, className, ...props },
  ref,
) {
  const auto = useUid("hb-rdo");
  const [inner, setInner] = React.useState(defaultValue);
  const current = value ?? inner;
  const setValue = (v: string) => {
    if (value === undefined) setInner(v);
    onValueChange?.(v);
  };
  return (
    <RadioGroupContext.Provider value={{ name: name ?? auto, value: current, setValue, disabled, size }}>
      <div ref={ref} role="radiogroup" className={cx(fill ? "chip-wrap" : "krds-check-area", column && !fill && "chk-column", className)} {...props} />
    </RadioGroupContext.Provider>
  );
});

export interface RadioGroupItemProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "type" | "value"> {
  value: string;
  label: React.ReactNode;
  description?: React.ReactNode;
}

export const RadioGroupItem = React.forwardRef<HTMLInputElement, RadioGroupItemProps>(function RadioGroupItem(
  { value, label, description, id, disabled, className, ...props },
  ref,
) {
  const g = React.useContext(RadioGroupContext);
  if (!g) throw new Error("RadioGroup 안에서만 쓸 수 있습니다");
  const auto = useUid("hb-rdo-i");
  const rid = id ?? auto;
  return (
    <div className={cx("krds-form-check", g.size, className)}>
      <input
        ref={ref}
        type="radio"
        id={rid}
        name={g.name}
        value={value}
        checked={g.value === value}
        disabled={disabled ?? g.disabled}
        aria-describedby={description ? `${rid}-desc` : undefined}
        onChange={(e) => e.target.checked && g.setValue(value)}
        {...props}
      />
      <label htmlFor={rid}>{label}</label>
      {description && (
        <div className="krds-form-check-cnt">
          <p className="krds-form-check-p" id={`${rid}-desc`}>{description}</p>
        </div>
      )}
    </div>
  );
});

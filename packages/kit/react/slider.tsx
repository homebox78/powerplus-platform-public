"use client";
// 슬라이더 — shadcn Slider 와 비슷한 사용법 (KRDS 에 없음 → css/parts/b-form.css)
//   <Slider label="글자 크기" min={80} max={150} step={10} defaultValue={100} unit="%" />
// 실제 input[type=range] — ←→↑↓·Home·End·PageUp/Down 이 브라우저 기본으로 동작하고,
// 화면낭독기에는 aria-valuetext 로 단위를 붙여 읽힌다(예: "120%").
import * as React from "react";
import { cx, useUid } from "./utils";

export interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange"> {
  label?: React.ReactNode;
  value?: number;
  defaultValue?: number;
  onValueChange?: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** 값 뒤에 붙일 단위 (예: "%", "km") */
  unit?: string;
  /** 눈금 글자 (양끝·가운데 등) */
  marks?: string[];
  /** 현재 값 표시 숨기기 */
  hideValue?: boolean;
}

export const Slider = React.forwardRef<HTMLInputElement, SliderProps>(function Slider(
  { label, value, defaultValue, onValueChange, min = 0, max = 100, step = 1, unit = "", marks, hideValue, id, className, style, ...props },
  ref,
) {
  const [inner, setInner] = React.useState(defaultValue ?? min);
  const current = value ?? inner;
  const auto = useUid("hb-slider");
  const sid = id ?? auto;
  const pct = max > min ? ((current - min) / (max - min)) * 100 : 0;
  const text = `${current}${unit}`;
  return (
    <div className={cx("hb-slider-wrap", className)}>
      {(label || !hideValue) && (
        <div className="hb-slider-head">
          {label && <label className="hb-label" htmlFor={sid}>{label}</label>}
          {!hideValue && <output className="hb-slider-output" htmlFor={sid}>{text}</output>}
        </div>
      )}
      <input
        ref={ref}
        type="range"
        id={sid}
        className="hb-slider"
        min={min}
        max={max}
        step={step}
        value={current}
        aria-valuetext={text}
        style={{ ...style, ["--hb-slider-pct" as string]: `${pct}%` }}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (value === undefined) setInner(v);
          onValueChange?.(v);
        }}
        {...props}
      />
      {marks && marks.length > 0 && (
        <div className="hb-slider-marks" aria-hidden="true">
          {marks.map((m) => <span key={m}>{m}</span>)}
        </div>
      )}
    </div>
  );
});

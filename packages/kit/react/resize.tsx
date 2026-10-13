"use client";
// 글자 크기 조절 — KRDS 「화면 크기 조정(resize)」
//   <Resize />                          ← 기본: 가장 가까운 .hb-kit 의 글자 크기를 바꾼다
//   <Resize target="#contents" />       ← 특정 영역만
//   <Resize mode="zoom" />              ← KRDS 원본처럼 zoom 으로 통째로 키운다
// 단계: 작게 0.9 · 보통 1 · 조금 크게 1.1 · 크게 1.3 · 가장 크게 1.5 (KRDS --krds-zoom-* 토큰)
import * as React from "react";
import { cx } from "./utils";
import { useGovDrop, resolveTarget } from "./gov-drop";
import { SCALE_STEPS, applyScale, scaleOf, type ScaleStep } from "./gov-scale";

export type ResizeStep = ScaleStep;

const LABELS: Record<ScaleStep, string> = { sm: "작게", md: "보통", lg: "조금 크게", xlg: "크게", xxlg: "가장 크게" };

export interface ResizeProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue"> {
  /** 크기를 바꿀 영역(선택자 또는 요소). 비우면 이 부품을 감싼 .hb-kit */
  target?: string | HTMLElement | null;
  value?: ResizeStep;
  defaultValue?: ResizeStep;
  onValueChange?: (step: ResizeStep, scale: number) => void;
  mode?: "font" | "zoom";
  /** 버튼 이름 */
  label?: string;
  /** 단계 이름 바꾸기 */
  labels?: Partial<Record<ResizeStep, string>>;
  align?: "center" | "left" | "right";
}

export const Resize = React.forwardRef<HTMLDivElement, ResizeProps>(function Resize(
  { target, value: valueProp, defaultValue = "md", onValueChange, mode = "font", label = "화면크기", labels, align = "center", className, ...props },
  ref,
) {
  const d = useGovDrop();
  const [inner, setInner] = React.useState<ResizeStep>(defaultValue);
  const value = valueProp ?? inner;
  const names = { ...LABELS, ...labels };

  const el = () => (target ? resolveTarget(target) : (d.wrapProps.ref.current?.closest<HTMLElement>(".hb-kit") ?? resolveTarget(null)));

  // 값이 바뀌면 대상에 적용하고, 다음 적용·사라질 때 원래대로 되돌린다
  React.useEffect(() => {
    const t = el();
    if (!t) return;
    applyScale(t, scaleOf(value), mode);
    return () => applyScale(t, 1, mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, mode, target]);

  const pick = (step: ResizeStep, keepOpen = false) => {
    setInner(step);
    onValueChange?.(step, scaleOf(step));
    if (!keepOpen) d.close(true);
  };
  const setRefs = (node: HTMLDivElement | null) => {
    d.wrapProps.ref.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };

  return (
    <div
      {...props}
      ref={setRefs}
      onKeyDown={d.wrapProps.onKeyDown}
      onBlur={d.wrapProps.onBlur}
      className={cx("krds-drop-wrap krds-resize", align !== "center" && `drop-${align}`, d.wrapClass, className)}
      data-adjust="scale"
    >
      <button {...d.btnProps} className="krds-btn small text drop-btn">
        {label}{" "}
        <span className="sr-only">, 현재 {names[value]}</span>
        <i className="svg-icon ico-toggle" aria-hidden="true" />
      </button>
      <div className="drop-menu" id={d.menuId}>
        <div className="drop-in">
          <ul className="drop-list">
            {SCALE_STEPS.map((s) => (
              <li key={s}>
                <button type="button" className={cx("item-link", s, value === s && "active")} aria-pressed={value === s} data-adjust-scale={s} onClick={() => pick(s)}>
                  {names[s]}
                </button>
              </li>
            ))}
          </ul>
          <div className="drop-bottom">
            <button type="button" className="krds-btn medium text" data-adjust-scale="md" onClick={() => pick("md")}>
              <i className="svg-icon ico-reset" aria-hidden="true" /> 초기화
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

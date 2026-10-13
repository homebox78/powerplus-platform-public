"use client";
// 입력 필드 — KRDS 「텍스트 입력(text_input)」 크기·상태·아이콘 · shadcn Input 과 같은 사용법
//   <Input size="medium" placeholder="이름을 입력하세요" />
//   <PasswordInput />                 비밀번호 보기/가리기 버튼 (KRDS ico-pw-visible)
//   <ClearableInput />                값이 있을 때만 "내용 삭제" 버튼 (KRDS btn-delete-input)
// Field 안에서 쓰면 id·도움말 연결·오류 상태를 자동으로 받는다.
import * as React from "react";
import { cx } from "./utils";
import { useFieldControl } from "./field";

export type InputSize = "small" | "medium" | "large" | "xlarge";

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: InputSize;
  /** 오류 상태 (Field 밖에서 단독으로 쓸 때) */
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = "large", invalid, className, type = "text", ...props },
  ref,
) {
  const f = useFieldControl({ ...props, invalid });
  return <input ref={ref} type={type} className={cx("krds-input", size, className)} {...props} {...f} />;
});

// ── 입력 안 오른쪽 버튼 틀 (KRDS .form-conts.btn-ico-wrap)
function useControllable(value: string | undefined, defaultValue: string | undefined, onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void) {
  const [inner, setInner] = React.useState(defaultValue ?? "");
  const current = value ?? inner;
  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (value === undefined) setInner(e.target.value);
    onChange?.(e);
  };
  return [current, handle, setInner] as const;
}

export interface PasswordInputProps extends Omit<InputProps, "type" | "value" | "defaultValue"> {
  value?: string;
  defaultValue?: string;
}

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { value, defaultValue, onChange, size = "large", ...props },
  ref,
) {
  const [shown, setShown] = React.useState(false);
  const [current, handle] = useControllable(value, defaultValue, onChange);
  return (
    <div className="form-conts btn-ico-wrap">
      <Input ref={ref} size={size} type={shown ? "text" : "password"} value={current} onChange={handle} autoComplete="current-password" {...props} />
      <button type="button" className="krds-btn medium icon" aria-pressed={shown} onClick={() => setShown((s) => !s)} disabled={props.disabled}>
        <span className="sr-only">{shown ? "입력한 비밀번호 가리기" : "입력한 비밀번호 보기"}</span>
        <i className={cx("svg-icon", shown ? "ico-pw-visible-on" : "ico-pw-visible")} aria-hidden="true" />
      </button>
    </div>
  );
});

export interface ClearableInputProps extends Omit<InputProps, "value" | "defaultValue"> {
  value?: string;
  defaultValue?: string;
  /** 삭제 버튼을 누른 뒤 (제어형이면 여기서 값을 비운다) */
  onClear?: () => void;
}

export const ClearableInput = React.forwardRef<HTMLInputElement, ClearableInputProps>(function ClearableInput(
  { value, defaultValue, onChange, onClear, placeholder, size = "large", ...props },
  ref,
) {
  const inner = React.useRef<HTMLInputElement>(null);
  React.useImperativeHandle(ref, () => inner.current as HTMLInputElement);
  const [current, handle, setInner] = useControllable(value, defaultValue, onChange);
  const clear = () => {
    if (value === undefined) setInner("");
    onClear?.();
    inner.current?.focus();
  };
  return (
    // KRDS CSS 는 placeholder 가 가려졌을 때(=값이 있을 때)만 삭제 버튼을 보인다 → placeholder 는 항상 둔다
    <div className="form-conts btn-ico-wrap" data-delete="true">
      <Input ref={inner} size={size} value={current} onChange={handle} placeholder={placeholder ?? " "} {...props} />
      <button type="button" className="krds-btn medium icon pure btn-delete-input" onClick={clear} tabIndex={current ? 0 : -1}>
        <span className="sr-only">내용 삭제</span>
        <i className="svg-icon ico-delete-fill" aria-hidden="true" />
      </button>
    </div>
  );
});

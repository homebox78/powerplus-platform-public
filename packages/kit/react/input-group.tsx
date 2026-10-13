"use client";
// 입력 그룹 — shadcn InputGroup 과 같은 사용법 (KRDS 에 없는 모양 → css/parts/b-form.css)
//   <InputGroup size="medium">
//     <InputGroupInput aria-label="신청 금액" inputMode="numeric" />
//     <InputGroupAddon align="end"><InputGroupText>원</InputGroupText></InputGroupAddon>
//   </InputGroup>
// 앞(align="start")·뒤(align="end")에 글자·아이콘·버튼을 붙인다. 테두리는 그룹 하나가 갖고,
// 안쪽 입력에 포커스가 들어오면 그룹 테두리가 진해진다(:focus-within).
import * as React from "react";
import { cx } from "./utils";
import { useFieldControl, useFieldContext } from "./field";

export interface InputGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "small" | "medium" | "large";
  invalid?: boolean;
  disabled?: boolean;
  /** 여러 줄 입력(InputGroupTextarea)을 담을 때 */
  multiline?: boolean;
}

export const InputGroup = React.forwardRef<HTMLDivElement, InputGroupProps>(function InputGroup(
  { size = "large", invalid, disabled, multiline, className, ...props },
  ref,
) {
  const f = useFieldContext();
  const bad = invalid ?? f?.invalid;
  return (
    <div
      ref={ref}
      role="group"
      className={cx("hb-input-group", size, bad && "is-error", (disabled ?? f?.disabled) && "is-disabled", multiline && "is-multiline", className)}
      {...props}
    />
  );
});

export interface InputGroupAddonProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: "start" | "end";
}

export const InputGroupAddon = React.forwardRef<HTMLDivElement, InputGroupAddonProps>(function InputGroupAddon(
  { align = "start", className, children, ...props },
  ref,
) {
  const textOnly = typeof children === "string" || (React.isValidElement(children) && children.type === InputGroupText);
  return (
    <div ref={ref} className={cx("hb-input-group-addon", align, textOnly && "text", className)} {...props}>
      {children}
    </div>
  );
});

export const InputGroupText = React.forwardRef<HTMLSpanElement, React.HTMLAttributes<HTMLSpanElement>>(
  function InputGroupText({ className, ...props }, ref) {
    return <span ref={ref} className={cx("hb-input-group-text", className)} {...props} />;
  },
);

export interface InputGroupInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  invalid?: boolean;
}

export const InputGroupInput = React.forwardRef<HTMLInputElement, InputGroupInputProps>(function InputGroupInput(
  { invalid, className, type = "text", ...props },
  ref,
) {
  const f = useFieldControl({ ...props, invalid });
  return <input ref={ref} type={type} className={cx("hb-input-group-input", className)} {...props} {...f} />;
});

export interface InputGroupTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const InputGroupTextarea = React.forwardRef<HTMLTextAreaElement, InputGroupTextareaProps>(function InputGroupTextarea(
  { invalid, className, ...props },
  ref,
) {
  const f = useFieldControl({ ...props, invalid });
  return <textarea ref={ref} className={cx("hb-input-group-input", className)} {...props} {...f} />;
});

export interface InputGroupButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "tertiary" | "text";
  size?: "xsmall" | "small" | "medium";
}

/** 그룹 안 버튼 — KRDS 버튼 모양, 기본은 작은 텍스트 버튼 */
export const InputGroupButton = React.forwardRef<HTMLButtonElement, InputGroupButtonProps>(function InputGroupButton(
  { variant = "text", size = "small", className, type = "button", ...props },
  ref,
) {
  return <button ref={ref} type={type} className={cx("krds-btn", variant, size, className)} {...props} />;
});

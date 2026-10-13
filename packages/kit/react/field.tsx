"use client";
// 필드 — KRDS 「폼 레이아웃(form_layout)」 · shadcn Field 와 같은 사용법
//   <Field required invalid={!!err}>
//     <FieldLabel>이름</FieldLabel>
//     <FieldControl><Input /></FieldControl>
//     <FieldDescription>주민등록상의 이름을 적어 주세요.</FieldDescription>
//     {err && <FieldError>{err}</FieldError>}
//   </Field>
//
// Field 안의 Input·Textarea·Select 는 id·aria-describedby·aria-invalid·required 를 자동으로 받는다.
// 도움말·오류 문구가 실제로 있을 때만 aria-describedby 에 넣는다(없는 id 를 가리키지 않게).
// 필수 표시는 별표(*) + 화면낭독용 "필수" 글자를 함께 둔다(색만으로 표시하지 않음).
import * as React from "react";
import { cx, useUid } from "./utils";

export type FieldState = "error" | "success" | "information";

export interface FieldContextValue {
  id: string;
  invalid: boolean;
  required: boolean;
  disabled: boolean;
  describedBy: string | undefined;
  register: (kind: "desc" | "msg", on: boolean) => void;
}
export const FieldContext = React.createContext<FieldContextValue | null>(null);
/** Field 안이면 연결 정보를, 밖이면 null 을 준다 */
export const useFieldContext = () => React.useContext(FieldContext);

/** 입력 요소가 Field 에서 받을 속성(직접 준 값이 우선) */
export function useFieldControl(p: {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: React.AriaAttributes["aria-invalid"];
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const f = useFieldContext();
  const invalid = p.invalid ?? f?.invalid ?? false;
  const described = [p["aria-describedby"], f?.describedBy].filter(Boolean).join(" ") || undefined;
  return {
    id: p.id ?? f?.id,
    "aria-describedby": described,
    "aria-invalid": p["aria-invalid"] ?? (invalid ? true : undefined),
    required: p.required ?? (f?.required || undefined),
    disabled: p.disabled ?? (f?.disabled || undefined),
  };
}

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 입력 요소 id (생략하면 자동) */
  id?: string;
  required?: boolean;
  invalid?: boolean;
  disabled?: boolean;
}

export const Field = React.forwardRef<HTMLDivElement, FieldProps>(function Field(
  { id, required = false, invalid = false, disabled = false, className, children, ...props },
  ref,
) {
  const auto = useUid("hb-field");
  const fid = id ?? auto;
  const [has, setHas] = React.useState({ desc: false, msg: false });
  const register = React.useCallback((kind: "desc" | "msg", on: boolean) => {
    setHas((h) => (h[kind] === on ? h : { ...h, [kind]: on }));
  }, []);
  const describedBy = [has.desc && `${fid}-desc`, has.msg && `${fid}-msg`].filter(Boolean).join(" ") || undefined;
  return (
    <FieldContext.Provider value={{ id: fid, invalid, required, disabled, describedBy, register }}>
      <div ref={ref} className={cx("form-group", className)} {...props}>
        {children}
      </div>
    </FieldContext.Provider>
  );
});

export interface FieldLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  /** 필수가 아닐 때 "(선택)" 을 붙인다 */
  optional?: boolean;
}

export const FieldLabel = React.forwardRef<HTMLLabelElement, FieldLabelProps>(function FieldLabel(
  { optional, className, children, htmlFor, ...props },
  ref,
) {
  const f = useFieldContext();
  return (
    <div className="form-tit">
      <label ref={ref} htmlFor={htmlFor ?? f?.id} className={className} {...props}>
        {children}
        {f?.required && (
          <>
            {" "}
            <span className="hb-required" aria-hidden="true">*</span>
            <span className="sr-only">(필수)</span>
          </>
        )}
        {optional && <span className="hb-optional"> (선택)</span>}
      </label>
    </div>
  );
});

export interface FieldControlProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 입력 칸 테두리 상태 (Field 의 invalid 가 켜지면 error 가 기본) */
  state?: FieldState;
}

export const FieldControl = React.forwardRef<HTMLDivElement, FieldControlProps>(function FieldControl(
  { state, className, ...props },
  ref,
) {
  const f = useFieldContext();
  const s = state ?? (f?.invalid ? "error" : undefined);
  return <div ref={ref} className={cx("form-conts", s && `is-${s}`, className)} {...props} />;
});

export const FieldDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  function FieldDescription({ className, ...props }, ref) {
    const f = useFieldContext();
    React.useEffect(() => {
      f?.register("desc", true);
      return () => f?.register("desc", false);
    }, [f?.register]); // eslint-disable-line react-hooks/exhaustive-deps
    return <p ref={ref} id={f ? `${f.id}-desc` : undefined} className={cx("form-hint", className)} {...props} />;
  },
);

export interface FieldMessageProps extends React.HTMLAttributes<HTMLParagraphElement> {
  tone?: FieldState;
}

/** 상태 문구(오류·성공·정보). 오류는 화면낭독기가 바로 읽도록 role="alert" */
export const FieldMessage = React.forwardRef<HTMLParagraphElement, FieldMessageProps>(function FieldMessage(
  { tone = "error", className, ...props },
  ref,
) {
  const f = useFieldContext();
  React.useEffect(() => {
    f?.register("msg", true);
    return () => f?.register("msg", false);
  }, [f?.register]); // eslint-disable-line react-hooks/exhaustive-deps
  const cls = tone === "error" ? "form-hint-invalid" : tone === "success" ? "form-hint-success" : "form-hint-information";
  return (
    <p
      ref={ref}
      id={f ? `${f.id}-msg` : undefined}
      role={tone === "error" ? "alert" : undefined}
      className={cx(cls, className)}
      {...props}
    />
  );
});

/** 오류 문구 — FieldMessage tone="error" 의 줄임 */
export const FieldError = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  function FieldError(props, ref) {
    return <FieldMessage ref={ref} tone="error" {...props} />;
  },
);

export interface FieldSetProps extends React.FieldsetHTMLAttributes<HTMLFieldSetElement> {
  legend?: React.ReactNode;
}

/** 여러 필드 묶음 — 제목이 있으면 fieldset/legend, 없으면 KRDS .fieldset 세로 배치 */
export const FieldSet = React.forwardRef<HTMLFieldSetElement, FieldSetProps>(function FieldSet(
  { legend, className, children, ...props },
  ref,
) {
  return (
    <fieldset ref={ref} className={cx("hb-fieldset", className)} {...props}>
      {legend && <legend className="hb-fieldset-legend">{legend}</legend>}
      <div className="fieldset">{children}</div>
    </fieldset>
  );
});

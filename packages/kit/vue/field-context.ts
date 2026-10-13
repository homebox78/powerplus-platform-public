// Field(폼그룹) ↔ 입력 요소 연결 — React 판 field.tsx 의 FieldContext·useFieldControl 과 같은 역할.
// Field 가 provide 하고, Input·Textarea·Select 등이 inject 해서 id·aria-describedby·aria-invalid·required 를 받는다.
import { computed, inject, useAttrs, type ComputedRef } from "vue";

export interface HbFieldContext {
  id: string;
  invalid: boolean;
  required: boolean;
  disabled: boolean;
  desc: boolean;
  msg: boolean;
  describedBy: string | undefined;
}

export const HB_FIELD = "hb-field";

export function useField(): HbFieldContext | null {
  return inject<HbFieldContext | null>(HB_FIELD, null);
}

/** 입력 요소가 Field 에서 받을 속성 (직접 준 값이 우선) */
export function useFieldControl(own: () => {
  id?: string;
  describedBy?: string;
  invalid?: boolean;
  required?: boolean;
  disabled?: boolean;
}): ComputedRef<{
  id: string | undefined;
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
  required: true | undefined;
  disabled: true | undefined;
}> {
  const f = useField();
  return computed(() => {
    const p = own();
    const invalid = p.invalid ?? f?.invalid ?? false;
    const described = [p.describedBy, f?.describedBy].filter(Boolean).join(" ") || undefined;
    return {
      id: p.id ?? f?.id,
      "aria-describedby": described,
      "aria-invalid": invalid ? true : undefined,
      required: (p.required ?? f?.required) ? true : undefined,
      disabled: (p.disabled ?? f?.disabled) ? true : undefined,
    };
  });
}

/** inheritAttrs:false 부품에서 class·style 은 바깥 틀에, 나머지는 안쪽 입력에 */
export function useSplitAttrs() {
  const attrs = useAttrs();
  const outer = computed(() => ({ class: attrs.class, style: attrs.style }));
  const inner = computed(() => {
    const { class: _c, style: _s, ...rest } = attrs;
    return rest;
  });
  return { outer, inner };
}

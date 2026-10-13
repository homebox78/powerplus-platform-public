<!-- 날짜 입력 — KRDS 「날짜 입력(date_input)」의 입력 칸 + 달력 열기 버튼
  <DateInput v-model="date" @open-calendar="달력열기" />   v-model 값은 "YYYY-MM-DD"(완성되지 않았거나 틀리면 "")
  <DateInput v-model="ym" precision="month" />            ← 연·월만(대략적인 날짜, 값 "YYYY-MM")
  숫자만 쳐도 YYYY.MM.DD 로 점을 넣는다. 칸 아래 형식 안내(hint)를 기본으로 보이고,
  틀린 날짜면 오류 문구를 띄워 둘 다 aria-describedby 로 잇는다. 달력은 날짜 선택기 부품이 맡는다. -->
<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import { useFieldControl } from "./field-context";

type Precision = "day" | "month" | "year";
defineOptions({ inheritAttrs: false });
const props = withDefaults(
  defineProps<{
    size?: "small" | "medium" | "large";
    invalid?: boolean;
    calendarLabel?: string;
    id?: string;
    disabled?: boolean;
    required?: boolean;
    /** 받을 단위 — day(기본) · month(연·월) · year(연도만) */
    precision?: Precision;
    /** 형식 안내 문구. false 면 숨긴다 */
    hint?: string | false;
    /** 틀린 날짜일 때 문구 */
    errorText?: string;
    describedBy?: string;
  }>(),
  { size: "large", calendarLabel: "달력 열기", invalid: undefined, disabled: undefined, required: undefined, precision: "day", hint: undefined },
);
const model = defineModel<string>();
const emit = defineEmits<{ openCalendar: [] }>();

const LEN: Record<Precision, number> = { day: 10, month: 7, year: 4 };
const PLACEHOLDER: Record<Precision, string> = { day: "YYYY.MM.DD", month: "YYYY.MM", year: "YYYY" };
const EXAMPLE: Record<Precision, string> = { day: "2024.03.15", month: "2024.03", year: "2024" };

function formatDigits(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, props.precision === "day" ? 8 : props.precision === "month" ? 6 : 4);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}.${d.slice(4)}`;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}`;
}
function toIso(text: string) {
  if (props.precision === "year") return /^(1[89]|2\d)\d{2}$/.test(text) ? text : "";
  if (props.precision === "month") {
    const mm = /^(\d{4})\.(\d{2})$/.exec(text);
    return mm && +mm[2] >= 1 && +mm[2] <= 12 ? `${mm[1]}-${mm[2]}` : "";
  }
  const m = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(text);
  if (!m) return "";
  const [y, mo, da] = [+m[1], +m[2], +m[3]];
  const dt = new Date(y, mo - 1, da);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== da) return "";
  return `${m[1]}-${m[2]}-${m[3]}`;
}
const text = ref((model.value ?? "").replace(/-/g, "."));
watch(model, (v) => {
  if ((v ?? "") !== toIso(text.value)) text.value = (v ?? "").replace(/-/g, ".");
});
const uid = useId();
const hintId = `${uid}-hint`;
const errId = `${uid}-err`;
const wrong = computed(() => text.value.length === LEN[props.precision] && !toIso(text.value));
const showHint = computed(() => props.hint !== false);
const f = useFieldControl(() => ({
  id: props.id,
  describedBy: [props.describedBy, showHint.value ? hintId : "", wrong.value ? errId : ""].filter(Boolean).join(" ") || undefined,
  invalid: props.invalid || wrong.value || undefined,
  disabled: props.disabled,
  required: props.required,
}));

function onInput(e: Event) {
  const t = formatDigits((e.target as HTMLInputElement).value);
  text.value = t;
  (e.target as HTMLInputElement).value = t;
  const iso = toIso(t);
  if (iso || t === "" || t.length === LEN[props.precision]) model.value = iso;
}
</script>

<template>
  <div :class="['hb-date-input', $attrs.class]">
    <div class="calendar-input">
      <input
        type="text"
        inputmode="numeric"
        :placeholder="PLACEHOLDER[precision]"
        :maxlength="LEN[precision]"
        :class="['krds-input datepicker', size]"
        :value="text"
        v-bind="{ ...$attrs, class: undefined, ...f }"
        @input="onInput"
      />
      <button v-if="precision === 'day'" type="button" class="krds-btn medium icon form-btn-datepicker" :disabled="f.disabled" @click="emit('openCalendar')">
        <span class="sr-only">{{ calendarLabel }}</span>
        <i class="svg-icon ico-calendar" aria-hidden="true"></i>
      </button>
    </div>
    <p v-if="showHint" :id="hintId" class="form-hint">{{ hint ?? `${PLACEHOLDER[precision]} 형식으로 입력합니다. 예: ${EXAMPLE[precision]}` }}</p>
    <p v-if="wrong" :id="errId" class="form-hint-invalid" role="alert">
      {{ errorText ?? `올바른 날짜가 아닙니다. ${PLACEHOLDER[precision]} 형식으로 다시 입력해 주세요.` }}
    </p>
  </div>
</template>

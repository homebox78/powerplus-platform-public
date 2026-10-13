<!-- 기간 선택 — KRDS 「날짜 입력(기간)」 입력칸 두 개 + 기간 달력 팝오버
  <DateRangePicker label="신청 기간" v-model="range" />   ({ from, to }) -->
<script setup lang="ts">
import { ref, watch } from "vue";
import { PopoverAnchor, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from "reka-ui";
import Calendar from "./Calendar.vue";
import { formatDate, parseDate, startOfDay, type DateRange } from "./date-utils";
import { useUid } from "./utils";

const props = withDefaults(
  defineProps<{
    modelValue?: DateRange | null;
    label?: string;
    id?: string;
    hint?: string;
    disabled?: (d: Date) => boolean;
    defaultOpen?: boolean;
  }>(),
  { modelValue: undefined, hint: "시작날짜와 종료날짜를 YYYY.MM.DD 형식으로 입력하거나 달력에서 고르세요." },
);
const emit = defineEmits<{ "update:modelValue": [DateRange | null] }>();

const base = props.id ?? useUid("hb-drp");
const inner = ref<DateRange | null>(null);
const cur = () => (props.modelValue !== undefined ? props.modelValue : inner.value);
const from = ref(formatDate(cur()?.from));
const to = ref(formatDate(cur()?.to));
const error = ref(false);
const open = ref(!!props.defaultOpen);
const pending = ref<DateRange | null>(cur());

watch(
  () => props.modelValue,
  (v) => {
    from.value = formatDate(v?.from);
    to.value = formatDate(v?.to);
  },
);

function set(r: DateRange | null) {
  inner.value = r;
  emit("update:modelValue", r);
  from.value = formatDate(r?.from);
  to.value = formatDate(r?.to);
  error.value = false;
}
function commit() {
  const f = from.value.trim() ? parseDate(from.value) : null;
  const t = to.value.trim() ? parseDate(to.value) : null;
  if ((from.value.trim() && !f) || (to.value.trim() && !t)) {
    error.value = true;
    return;
  }
  set(f || t ? (f && t && t < f ? { from: t, to: f } : { from: f, to: t }) : null);
}
function onOpen(o: boolean) {
  if (o) pending.value = cur();
  open.value = o;
}
function onPick(v: Date | DateRange) {
  pending.value = v as DateRange;
}
function today() {
  const t = startOfDay(new Date());
  pending.value = { from: t, to: t };
}
function ok() {
  set(pending.value);
  open.value = false;
}
function stop(e: Event) {
  e.preventDefault();
}
</script>

<template>
  <div class="form-group hb-date-picker">
    <div v-if="label" :id="`${base}-label`" class="form-tit">{{ label }}</div>
    <div :class="['form-conts', 'calendar-conts', { 'is-error': error }]">
      <PopoverRoot :open="open" @update:open="onOpen">
        <PopoverAnchor as-child>
          <div class="calendar-input" role="group" :aria-labelledby="label ? `${base}-label` : undefined">
            <ul class="input-group range set">
              <li>
                <input
                  v-model="from"
                  type="text"
                  inputmode="numeric"
                  class="krds-input datepicker"
                  placeholder="시작날짜"
                  title="시작날짜 입력"
                  :aria-invalid="error || undefined"
                  :aria-describedby="`${base}-hint`"
                  @blur="commit"
                />
              </li>
              <li class="mark" aria-hidden="true">-</li>
              <li>
                <input
                  v-model="to"
                  type="text"
                  inputmode="numeric"
                  class="krds-input datepicker"
                  placeholder="종료날짜"
                  title="종료날짜 입력"
                  :aria-invalid="error || undefined"
                  :aria-describedby="`${base}-hint`"
                  @blur="commit"
                />
              </li>
            </ul>
            <PopoverTrigger as-child>
              <button type="button" class="krds-btn medium icon form-btn-datepicker">
                <span class="sr-only">달력 열기</span>
                <i class="svg-icon ico-calendar" aria-hidden="true" />
              </button>
            </PopoverTrigger>
          </div>
        </PopoverAnchor>
        <PopoverPortal>
          <PopoverContent class="hb-kit hb-date-pop" align="end" :side-offset="8" aria-label="기간 고르기" @open-auto-focus="stop">
            <Calendar mode="range" auto-focus :model-value="pending" :disabled="disabled" @update:model-value="onPick">
              <template #footer>
                <button type="button" class="krds-btn small text" @click="today">오늘</button>
                <button type="button" class="krds-btn small tertiary" @click="open = false">취소</button>
                <button type="button" class="krds-btn small primary" @click="ok">확인</button>
              </template>
            </Calendar>
          </PopoverContent>
        </PopoverPortal>
      </PopoverRoot>
    </div>
    <p :id="`${base}-hint`" :class="error ? 'form-hint-invalid' : 'form-hint'">
      {{ error ? "없는 날짜입니다. YYYY.MM.DD 형식으로 입력해 주세요." : hint }}
    </p>
  </div>
</template>

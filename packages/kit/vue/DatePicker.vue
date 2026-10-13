<!-- 날짜 선택 — KRDS 「날짜 입력(달력)」 · shadcn-vue Date Picker 와 같은 사용법 (입력칸 + 달력 팝오버)
  <DatePicker label="방문 희망일" v-model="day" />
  입력칸에 직접 쓰거나(2026.09.25 · 20260925) 달력 버튼으로 고른다. 달력은 reka-ui Popover,
  달력에서 고른 날은 [확인] 을 눌러야 들어간다(오늘 · 취소 · 확인). React 판과 같은 마크업. -->
<script setup lang="ts">
import { ref, watch } from "vue";
import { PopoverAnchor, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from "reka-ui";
import Calendar from "./Calendar.vue";
import { formatDate, parseDate, startOfDay, type DateRange } from "./date-utils";
import { useUid } from "./utils";

const props = withDefaults(
  defineProps<{
    modelValue?: Date | null;
    label?: string;
    id?: string;
    hint?: string;
    placeholder?: string;
    disabled?: (d: Date) => boolean;
    defaultOpen?: boolean;
  }>(),
  {
    modelValue: undefined,
    hint: "YYYY.MM.DD 형식으로 입력하거나 달력에서 고르세요.",
    placeholder: "YYYY.MM.DD",
  },
);
const emit = defineEmits<{ "update:modelValue": [Date | null] }>();

const inputId = props.id ?? useUid("hb-dp");
const inner = ref<Date | null>(null);
const cur = () => (props.modelValue !== undefined ? props.modelValue : inner.value);
const text = ref(formatDate(cur()));
const error = ref(false);
const open = ref(!!props.defaultOpen);
const pending = ref<Date | null>(cur());

watch(
  () => props.modelValue,
  (v) => {
    text.value = formatDate(v);
  },
);

function set(d: Date | null) {
  inner.value = d;
  emit("update:modelValue", d);
  text.value = formatDate(d);
  error.value = false;
}
function commit() {
  if (!text.value.trim()) return set(null);
  const d = parseDate(text.value);
  if (d) set(d);
  else error.value = true;
}
function onOpen(o: boolean) {
  if (o) pending.value = cur();
  open.value = o;
}
function onPick(v: Date | DateRange) {
  pending.value = v as Date;
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
    <div v-if="label" class="form-tit"><label :for="inputId">{{ label }}</label></div>
    <div :class="['form-conts', 'calendar-conts', { 'is-error': error }]">
      <PopoverRoot :open="open" @update:open="onOpen">
        <PopoverAnchor as-child>
          <div class="calendar-input">
            <input
              :id="inputId"
              v-model="text"
              type="text"
              inputmode="numeric"
              class="krds-input datepicker"
              :placeholder="placeholder"
              :aria-invalid="error || undefined"
              :aria-describedby="`${inputId}-hint`"
              @blur="commit"
              @keydown.enter="commit"
            />
            <PopoverTrigger as-child>
              <button type="button" class="krds-btn medium icon form-btn-datepicker">
                <span class="sr-only">달력 열기</span>
                <i class="svg-icon ico-calendar" aria-hidden="true" />
              </button>
            </PopoverTrigger>
          </div>
        </PopoverAnchor>
        <PopoverPortal>
          <PopoverContent class="hb-kit hb-date-pop" align="start" :side-offset="8" aria-label="날짜 고르기" @open-auto-focus="stop">
            <Calendar auto-focus :model-value="pending" :disabled="disabled" @update:model-value="onPick">
              <template #footer>
                <button type="button" class="krds-btn small text" @click="pending = startOfDay(new Date())">오늘</button>
                <button type="button" class="krds-btn small tertiary" @click="open = false">취소</button>
                <button type="button" class="krds-btn small primary" @click="ok">확인</button>
              </template>
            </Calendar>
          </PopoverContent>
        </PopoverPortal>
      </PopoverRoot>
    </div>
    <p :id="`${inputId}-hint`" :class="error ? 'form-hint-invalid' : 'form-hint'">
      {{ error ? "없는 날짜입니다. YYYY.MM.DD 형식으로 입력해 주세요." : hint }}
    </p>
  </div>
</template>

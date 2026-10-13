<!-- 기간 입력 — 시작일 ~ 종료일. 종료일이 시작일보다 앞서면 종료일 칸을 오류로 표시
  <DateRangeInput v-model:start="from" v-model:end="to" @open-calendar="(which) => …" />
  형식 안내는 두 칸 아래 한 번(hint, false 면 숨김), 순서가 뒤집히면 오류 문구를 띄운다. -->
<script setup lang="ts">
import { computed, useId } from "vue";
import DateInput from "./DateInput.vue";
import { josa } from "./utils";

const props = withDefaults(defineProps<{ size?: "small" | "medium" | "large"; startLabel?: string; endLabel?: string; hint?: string | false }>(), {
  size: "large",
  startLabel: "시작일",
  endLabel: "종료일",
  hint: undefined,
});
const start = defineModel<string>("start");
const end = defineModel<string>("end");
const emit = defineEmits<{ openCalendar: ["start" | "end"] }>();
const reversed = computed(() => !!start.value && !!end.value && end.value < start.value);
const uid = useId();
const hintId = `${uid}-hint`;
const errId = `${uid}-err`;
const desc = computed(() => (props.hint !== false ? hintId : undefined));
const endDesc = computed(() => [desc.value, reversed.value ? errId : ""].filter(Boolean).join(" ") || undefined);
</script>

<template>
  <div class="hb-date-input">
    <ul class="hb-date-range">
      <li>
        <DateInput v-model="start" :size="size" :aria-label="startLabel" :hint="false" :described-by="desc" :calendar-label="`${startLabel} 달력 열기`" @open-calendar="emit('openCalendar', 'start')" />
      </li>
      <li class="mark" aria-hidden="true">~</li>
      <li>
        <DateInput v-model="end" :size="size" :aria-label="endLabel" :hint="false" :described-by="endDesc" :invalid="reversed" :calendar-label="`${endLabel} 달력 열기`" @open-calendar="emit('openCalendar', 'end')" />
      </li>
    </ul>
    <p v-if="hint !== false" :id="hintId" class="form-hint">{{ hint ?? "YYYY.MM.DD 형식으로 입력합니다. 예: 2024.03.15" }}</p>
    <p v-if="reversed" :id="errId" class="form-hint-invalid" role="alert">{{ endLabel }}{{ josa(endLabel, "이", "가") }} {{ startLabel }}보다 앞설 수 없습니다.</p>
  </div>
</template>

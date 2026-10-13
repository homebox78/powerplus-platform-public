<!-- 달력 — KRDS 「달력」(calendar · calendar_range) · shadcn-vue Calendar 와 같은 사용법
  <Calendar v-model="day" />                              하루 고르기 (Date | null)
  <Calendar mode="range" v-model="range" />               기간 고르기 ({ from, to })
  <Calendar :disabled="(d) => d.getDay() === 0"><template #footer>…</template></Calendar>
  키보드: ←/→ 하루 · ↑/↓ 한 주 · Home/End 그 주 처음/끝 · PageUp/PageDown 한 달(Shift 한 해) · Enter/Space 선택.
  고를 수 없는 날은 aria-disabled(방향키로 지나갈 수 있게). React 판과 같은 마크업. -->
<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import {
  WEEKDAYS,
  addMonths,
  dateKey,
  monthGrid,
  moveByKey,
  nextRange,
  sameDay,
  sameMonth,
  speakDate,
  startOfDay,
  type DateRange,
} from "./date-utils";

const props = withDefaults(
  defineProps<{
    mode?: "single" | "range";
    modelValue?: Date | DateRange | null;
    defaultMonth?: Date;
    disabled?: (d: Date) => boolean;
    autoFocus?: boolean;
    fromYear?: number;
    toYear?: number;
    ariaLabel?: string;
  }>(),
  { mode: "single", modelValue: undefined, ariaLabel: "달력" },
);
const emit = defineEmits<{ "update:modelValue": [Date | DateRange] }>();

const range = computed(() => props.mode === "range");
const today = startOfDay(new Date());
const inner = ref<Date | DateRange | null>(null);
const value = computed(() => (props.modelValue !== undefined ? props.modelValue : inner.value));
const single = computed(() => (!range.value ? (value.value as Date | null) : null));
const rng = computed(() => (range.value ? (value.value as DateRange | null) : null));

const anchor = single.value ?? rng.value?.from ?? props.defaultMonth ?? today;
const month = ref(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
const focus = ref(startOfDay(anchor));
const drop = ref<"year" | "month" | null>(null);
const grid = ref<HTMLElement | null>(null);
const listEl = ref<HTMLElement | null>(null);
const yearBtn = ref<HTMLButtonElement | null>(null);
const monthBtn = ref<HTMLButtonElement | null>(null);

const y = computed(() => month.value.getFullYear());
const years = computed(() => {
  const from = props.fromYear ?? y.value - 10;
  const to = props.toYear ?? y.value + 10;
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
});
const weeks = computed(() => monthGrid(month.value));

async function focusDate() {
  await nextTick();
  grid.value?.querySelector<HTMLButtonElement>(`[data-date="${dateKey(focus.value)}"]`)?.focus();
}
onMounted(() => {
  if (props.autoFocus) focusDate();
});
watch(drop, async (d) => {
  if (!d) return;
  await nextTick();
  listEl.value?.querySelector<HTMLButtonElement>(".active, button")?.focus();
});

function showMonth(m: Date, keepFocus = false) {
  const first = new Date(m.getFullYear(), m.getMonth(), 1);
  month.value = first;
  if (!keepFocus) {
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    focus.value = new Date(first.getFullYear(), first.getMonth(), Math.min(focus.value.getDate(), last));
  }
}
function pick(d: Date) {
  if (props.disabled?.(d)) return;
  focus.value = d;
  if (!sameMonth(d, month.value)) showMonth(d, true);
  const v = range.value ? nextRange(rng.value, d) : d;
  inner.value = v;
  emit("update:modelValue", v);
}
function onGridKey(e: KeyboardEvent) {
  const next = moveByKey(focus.value, e.key, e.shiftKey);
  if (!next) return;
  e.preventDefault();
  focus.value = next;
  if (!sameMonth(next, month.value)) showMonth(next, true);
  focusDate();
}
function closeDrop(which: "year" | "month") {
  drop.value = null;
  (which === "year" ? yearBtn : monthBtn).value?.focus();
}
function onDropBlur(e: FocusEvent) {
  const box = e.currentTarget as HTMLElement;
  if (drop.value && !box.contains(e.relatedTarget as Node)) drop.value = null;
}
function chooseYear(v: number) {
  showMonth(new Date(v, month.value.getMonth(), 1));
  closeDrop("year");
}
function chooseMonth(v: number) {
  showMonth(new Date(y.value, v, 1));
  closeDrop("month");
}

function cell(d: Date) {
  const off = props.disabled?.(d) ?? false;
  const other = !sameMonth(d, month.value);
  const isToday = sameDay(d, today);
  let sel: boolean;
  if (range.value) {
    const r = rng.value;
    sel = !!r?.from && d >= r.from && d <= (r.to ?? r.from);
  } else sel = sameDay(d, single.value);
  const isStart = range.value ? sameDay(d, rng.value?.from) : sel;
  const isEnd = range.value ? sameDay(d, rng.value?.to ?? rng.value?.from) : sel;
  const note = [
    isToday && "오늘",
    range.value && isStart && "시작일",
    range.value && isEnd && !isStart && "종료일",
    range.value && sel && !isStart && !isEnd && "선택 기간",
    off && "선택 불가",
  ]
    .filter(Boolean)
    .join(", ");
  return {
    cls: {
      old: other && d < month.value,
      new: other && d > month.value,
      "day-off": d.getDay() === 0,
      today: isToday,
      disabled: off,
      period: sel,
      start: sel && isStart,
      end: sel && isEnd,
    },
    pressed: isStart || isEnd,
    off,
    isToday,
    label: speakDate(d) + (note ? `, ${note}` : ""),
  };
}
</script>

<template>
  <div class="krds-calendar-area active hb-calendar">
    <div :class="['calendar-wrap', { single: !range }]" role="group" :aria-label="ariaLabel">
      <div class="calendar-head">
        <button type="button" class="btn-cal-move prev" @click="showMonth(addMonths(month, -1))">
          <span class="sr-only">이전 달</span>
        </button>
        <div class="calendar-switch-wrap">
          <div class="calendar-drop-down" @focusout="onDropBlur">
            <button
              ref="yearBtn"
              type="button"
              :class="['btn-cal-switch', 'year', { active: drop === 'year' }]"
              :aria-expanded="drop === 'year'"
              aria-haspopup="true"
              :aria-label="`연도 선택, ${y}년`"
              @click="drop = drop === 'year' ? null : 'year'"
            >
              {{ y }}년
            </button>
            <div :class="['calendar-select', 'calendar-year-wrap', { active: drop === 'year' }]">
              <ul v-if="drop === 'year'" ref="listEl" class="sel year" @keydown.esc.stop="closeDrop('year')">
                <li v-for="v in years" :key="v">
                  <button type="button" :class="{ active: v === y }" :aria-current="v === y ? 'true' : undefined" @click="chooseYear(v)">
                    {{ v }}년
                  </button>
                </li>
              </ul>
            </div>
          </div>
          <div class="calendar-drop-down" @focusout="onDropBlur">
            <button
              ref="monthBtn"
              type="button"
              :class="['btn-cal-switch', 'month', { active: drop === 'month' }]"
              :aria-expanded="drop === 'month'"
              aria-haspopup="true"
              :aria-label="`월 선택, ${month.getMonth() + 1}월`"
              @click="drop = drop === 'month' ? null : 'month'"
            >
              {{ month.getMonth() + 1 }}월
            </button>
            <div :class="['calendar-select', 'calendar-mon-wrap', { active: drop === 'month' }]">
              <ul v-if="drop === 'month'" ref="listEl" class="sel month" @keydown.esc.stop="closeDrop('month')">
                <li v-for="v in 12" :key="v">
                  <button
                    type="button"
                    :class="{ active: v - 1 === month.getMonth() }"
                    :aria-current="v - 1 === month.getMonth() ? 'true' : undefined"
                    @click="chooseMonth(v - 1)"
                  >
                    {{ String(v).padStart(2, "0") }}월
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <button type="button" class="btn-cal-move next" @click="showMonth(addMonths(month, 1))">
          <span class="sr-only">다음 달</span>
        </button>
      </div>
      <p class="sr-only" aria-live="polite">{{ y }}년 {{ month.getMonth() + 1 }}월</p>
      <div class="calendar-body">
        <div class="calendar-table-wrap">
          <table class="calendar-tbl">
            <caption>{{ y }}년 {{ month.getMonth() + 1 }}월</caption>
            <thead>
              <tr>
                <th v-for="w in WEEKDAYS" :key="w" scope="col"><abbr :title="`${w}요일`">{{ w }}</abbr></th>
              </tr>
            </thead>
            <tbody ref="grid" @keydown="onGridKey">
              <tr v-for="week in weeks" :key="dateKey(week[0])">
                <td v-for="d in week" :key="dateKey(d)" :class="cell(d).cls">
                  <button
                    type="button"
                    class="btn-set-date"
                    :data-date="dateKey(d)"
                    :tabindex="sameDay(d, focus) ? 0 : -1"
                    :aria-pressed="cell(d).pressed"
                    :aria-disabled="cell(d).off || undefined"
                    :aria-current="cell(d).isToday ? 'date' : undefined"
                    :aria-label="cell(d).label"
                    @click="pick(d)"
                  >
                    <span>{{ d.getDate() }}</span>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div v-if="$slots.footer" class="calendar-footer">
        <div class="calendar-btn-wrap"><slot name="footer" /></div>
      </div>
    </div>
  </div>
</template>

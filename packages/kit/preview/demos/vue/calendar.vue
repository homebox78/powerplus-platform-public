<script setup lang="ts">
import { ref } from "vue";
import { Calendar } from "../../../vue";

type Range = { from?: Date | null; to?: Date | null };
const day = ref<Date | Range>(new Date(2026, 8, 25));
const range = ref<Date | Range>({ from: new Date(2026, 8, 7), to: new Date(2026, 8, 16) });
const closedMonday = (d: Date) => d.getDay() === 1;
const d = () => day.value as Date;
const r = () => range.value as Range;
</script>

<template>
  <div class="pv-row" style="align-items: flex-start; gap: 32px">
    <div>
      <p class="pv-note" style="margin: 0 0 8px">시립도서관 방문일 — {{ d().getMonth() + 1 }}월 {{ d().getDate() }}일</p>
      <Calendar v-model="day" :disabled="closedMonday" aria-label="방문일 달력" />
    </div>
    <div>
      <p class="pv-note" style="margin: 0 0 8px">
        축제 기간 — {{ r().from ? `${r().from!.getMonth() + 1}.${r().from!.getDate()}` : "?" }} ~
        {{ r().to ? `${r().to!.getMonth() + 1}.${r().to!.getDate()}` : "?" }}
      </p>
      <Calendar v-model="range" mode="range" aria-label="축제 기간 달력" />
    </div>
  </div>
</template>

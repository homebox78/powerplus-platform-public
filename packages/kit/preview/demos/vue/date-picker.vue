<script setup lang="ts">
import { ref } from "vue";
import { DatePicker, DateRangePicker } from "../../../vue";

const day = ref<Date | null>(new Date(2026, 8, 25));
const range = ref<{ from?: Date | null; to?: Date | null } | null>(null);
const sunday = (d: Date) => d.getDay() === 0;
</script>

<template>
  <div class="pv-row" style="align-items: flex-start; gap: 32px">
    <DatePicker v-model="day" label="방문 희망일" :disabled="sunday" />
    <DateRangePicker v-model="range" label="신청 기간" />
  </div>
</template>

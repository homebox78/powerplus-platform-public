<!-- 정렬 기준 버튼 묶음 — v-model 로 값, 누른 버튼은 aria-pressed="true"
  <StructuredListSort v-model="sort" :options="['관련도순', '최신순', '인기순']" /> -->
<script setup lang="ts">
withDefaults(defineProps<{ options: string[]; modelValue: string; label?: string }>(), { label: "정렬기준" });
const emit = defineEmits<{ "update:modelValue": [string] }>();
</script>

<template>
  <div class="hb-sl-sort" role="group" :aria-label="label">
    <strong class="sort-label" aria-hidden="true">{{ label }}</strong>
    <div class="w-sort-btn">
      <button
        v-for="o in options"
        :key="o"
        type="button"
        :class="{ active: o === modelValue }"
        :aria-pressed="o === modelValue"
        @click="emit('update:modelValue', o)"
      >
        {{ o }}
      </button>
    </div>
  </div>
</template>

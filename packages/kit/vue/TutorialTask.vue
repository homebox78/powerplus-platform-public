<!-- 따라하기 패널 · 과제 하나. "전체 N단계" 는 KRDS 디스클로저(aria-expanded + 닫히면 inert) -->
<script setup lang="ts">
import { ref } from "vue";
import { useUid } from "./utils";

const props = withDefaults(defineProps<{ title: string; current?: boolean; steps?: string[]; defaultExpanded?: boolean }>(), {
  current: false,
  steps: () => [],
  defaultExpanded: false,
});
const open = ref(props.defaultExpanded);
const id = useUid("hb-task");
</script>

<template>
  <li>
    <h4 :class="['tit', { current }]" :aria-current="current ? 'step' : undefined">
      {{ title }}<span v-if="current" class="sr-only"> (현재 과제)</span>
    </h4>
    <div v-if="steps.length" :class="['krds-disclosure conts-expand-area', { active: open }]">
      <button type="button" class="btn-conts-expand" :aria-expanded="open" :aria-controls="id" @click="open = !open">
        전체 {{ steps.length }}단계
      </button>
      <div :id="id" class="expand-wrap" :inert="!open || undefined">
        <div class="expand-in">
          <ul class="krds-info-list decimal">
            <li v-for="(s, i) in steps" :key="i">단계{{ i + 1 }} : {{ s }}</li>
          </ul>
        </div>
      </div>
    </div>
    <slot />
  </li>
</template>

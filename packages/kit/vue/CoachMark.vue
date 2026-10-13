<!-- 코치 마크 — KRDS 「코치 마크(coach_mark)」 마크업 그대로
  <CoachMark :active="step === 1" :step="1" :total="3" title="1단계 : 주소 검색"
    description="이사 전 주소를 검색해 고르세요." @next="step = 2" @stop="step = 0">
    <div>…강조할 화면 영역…</div>
  </CoachMark>
  한 번에 하나만 active. 단계가 바뀌면 말풍선(role=dialog)으로 포커스가 옮겨 가고, Esc 는 그만보기와 같다.
  @prev 를 걸면 2단계부터 "이전으로" 버튼이 나온다. -->
<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, ref, watch } from "vue";
import Button from "./Button.vue";
import { useUid } from "./utils";

const props = withDefaults(
  defineProps<{
    active?: boolean;
    step: number;
    total: number;
    title: string;
    description?: string;
    placement?: "top" | "bottom";
    nextLabel?: string;
    stopLabel?: string;
    autoFocus?: boolean;
  }>(),
  { active: false, placement: "top", stopLabel: "그만보기", autoFocus: true },
);
const emit = defineEmits<{ next: []; prev: []; stop: [] }>();
const base = useUid("hb-coach");
const balloon = ref<HTMLElement>();
const last = computed(() => props.step >= props.total);
const inst = getCurrentInstance();
const hasPrev = computed(() => !!inst?.vnode.props?.onPrev);

watch(
  () => props.active,
  (on) => {
    if (on && props.autoFocus) nextTick(() => balloon.value?.focus());
  },
);
</script>

<template>
  <div :class="[active && 'txt-box krds-coach-mark', active && placement === 'bottom' && 'hb-coach-bottom']" :data-coach-active="active || undefined">
    <div
      v-if="active"
      ref="balloon"
      class="coach-balloon"
      role="dialog"
      :aria-labelledby="`${base}-t`"
      :aria-describedby="description ? `${base}-d` : undefined"
      tabindex="-1"
      @keydown.esc="emit('stop')"
    >
      <h5 class="sr-only">따라하기 가이드</h5>
      <h6 :id="`${base}-t`" class="coach-tit">{{ title }}</h6>
      <p v-if="description" :id="`${base}-d`" class="desc">{{ description }}</p>
      <div class="coach-controls">
        <div class="num">
          <span class="sr-only">현재 단계</span>
          <strong>{{ step }}</strong>
          <span class="sr-only">총 단계</span>
          <span>{{ total }}</span>
        </div>
        <div class="btn-wrap">
          <Button size="small" variant="text" @click="emit('stop')">{{ stopLabel }}</Button>
          <Button v-if="hasPrev && step > 1" size="small" variant="tertiary" @click="emit('prev')">이전으로</Button>
          <Button size="small" variant="tertiary" @click="last ? emit('stop') : emit('next')">
            {{ nextLabel ?? (last ? "마치기" : "다음으로") }}
          </Button>
        </div>
      </div>
    </div>
    <slot />
  </div>
</template>

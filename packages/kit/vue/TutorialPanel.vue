<!-- 따라하기 패널 — KRDS 「튜토리얼 패널(tutorial_panel)」. 도움 패널의 "따라하기" 탭 내용
  <TutorialPanel title="이사 전 살던 곳 정보 입력하기" @back="…" @stop="…">
    <TutorialTask current title="Task 1: 이사 전에 살던 곳 주소 확인" :steps="['주소 조회', '조회 결과 확인']" />
  </TutorialPanel>
  @back 을 걸면 제목이 "이전으로 돌아가기" 버튼이 되고, @stop 을 걸면 "그만 따라하기" 버튼이 나온다. -->
<script setup lang="ts">
import { computed, getCurrentInstance } from "vue";
import Button from "./Button.vue";

withDefaults(defineProps<{ title: string; stopLabel?: string }>(), { stopLabel: "그만 따라하기" });
const emit = defineEmits<{ back: []; stop: [] }>();
const inst = getCurrentInstance();
const hasBack = computed(() => !!inst?.vnode.props?.onBack);
const hasStop = computed(() => !!inst?.vnode.props?.onStop);
</script>

<template>
  <div class="help-conts-area-inner">
    <div class="conts-area">
      <h4 class="help-title">
        <button v-if="hasBack" type="button" @click="emit('back')"><span class="sr-only">이전으로 돌아가기: </span>{{ title }}</button>
        <template v-else>{{ title }}</template>
      </h4>
      <ul class="coach-help-process"><slot /></ul>
    </div>
    <div v-if="hasStop" class="help-panel-action">
      <Button variant="secondary" class="coach-btn-stop" @click="emit('stop')">{{ stopLabel }}</Button>
    </div>
  </div>
</template>

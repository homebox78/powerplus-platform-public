<!-- 공식 배너 — KRDS 「공식 배너(masthead)」
  <Masthead />                                  ← 기본 문구 + "공식 누리집 확인 방법" 펼침
  <Masthead><template #details>…</template></Masthead>   ← 펼침 설명을 바꿀 때
  <Masthead />                                  ← 문구만 (KRDS 원형과 같음, 펼침은 collapsible)
  v-model:open 으로 펼침 상태를 묶을 수 있다. -->
<script setup lang="ts">
import { computed, ref } from "vue";
import { useUid } from "./utils";

const props = withDefaults(
  defineProps<{
    text?: string;
    collapsible?: boolean;
    toggleLabel?: string;
    defaultOpen?: boolean;
    open?: boolean;
    id?: string;
  }>(),
  {
    text: "이 누리집은 대한민국 공식 전자정부 누리집입니다.",
    collapsible: false,
    toggleLabel: "공식 누리집 확인 방법",
    defaultOpen: false,
    open: undefined,
    id: "krds-masthead",
  },
);
const emit = defineEmits<{ "update:open": [boolean] }>();
const inner = ref(props.defaultOpen);
const isOpen = computed(() => props.open ?? inner.value);
const bodyId = useUid("hb-masthead");
function toggle() {
  inner.value = !isOpen.value;
  emit("update:open", !isOpen.value);
}
</script>

<template>
  <div :id="id" class="hb-masthead">
    <div class="toggle-wrap">
      <div :class="['toggle-head', { active: isOpen }]">
        <div class="inner">
          <span class="nuri-txt"><slot>{{ text }}</slot></span>
          <button v-if="collapsible" type="button" class="hb-masthead-toggle" :aria-expanded="isOpen" :aria-controls="bodyId" @click="toggle">
            {{ toggleLabel }}
            <i class="svg-icon ico-angle" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div v-if="collapsible" :id="bodyId" :class="['toggle-body', { active: isOpen }]" :hidden="!isOpen">
        <div class="inner">
          <div class="hb-masthead-body">
            <slot name="details">
              <div>
                <strong>누리집 주소를 확인하세요</strong>
                <p>정부기관 누리집 주소는 .go.kr 로 끝납니다. 공공기관은 .or.kr 등 다른 주소를 쓰기도 합니다.</p>
              </div>
              <div>
                <strong>보안 연결을 확인하세요</strong>
                <p>주소가 https:// 로 시작하고 주소창에 자물쇠 표시가 있으면 안전하게 연결된 누리집입니다.</p>
              </div>
            </slot>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

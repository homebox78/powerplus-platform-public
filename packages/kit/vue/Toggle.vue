<!-- 토글 버튼 — shadcn-vue Toggle (KRDS 버튼 크기·토큰)
  <Toggle icon="like">관심</Toggle>
  <Toggle v-model:pressed="on">자막 켜기</Toggle>
  aria-pressed 로 상태를 알리고, 켜짐은 색과 체크 표시로 보인다. size 는 버튼과 같은 xsmall~xlarge. -->
<script setup lang="ts">
import { computed, ref } from "vue";

const props = withDefaults(
  defineProps<{
    pressed?: boolean;
    defaultPressed?: boolean;
    variant?: "default" | "outline";
    size?: "xsmall" | "small" | "medium" | "large" | "xlarge";
    icon?: string;
  }>(),
  { pressed: undefined, defaultPressed: false, variant: "default", size: "medium" },
);
const emit = defineEmits<{ "update:pressed": [boolean] }>();
const inner = ref(props.defaultPressed);
const on = computed(() => props.pressed ?? inner.value);
function flip() {
  const next = !on.value;
  inner.value = next;
  emit("update:pressed", next);
}
</script>

<template>
  <button type="button" :aria-pressed="on" :data-state="on ? 'on' : 'off'" :class="['hb-toggle', variant, size]" @click="flip">
    <i v-if="icon" :class="`svg-icon ico-${icon}`" aria-hidden="true"></i>
    <slot />
  </button>
</template>

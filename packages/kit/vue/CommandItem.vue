<!-- 명령 팔레트 · 항목 (role=option). value 로 거르고 @select 로 고른 값을 받는다 -->
<script setup lang="ts">
import { computed, inject, type Ref } from "vue";
import { useUid } from "./utils";

const props = withDefaults(defineProps<{ value: string; keywords?: string[]; disabled?: boolean }>(), { keywords: () => [] });
const emit = defineEmits<{ select: [string] }>();
const c = inject<{ active: Ref<string | null>; filter: (t: string) => boolean }>("hb-cmd")!;
const id = useUid("hb-cmd-o");
const shown = computed(() => c.filter([props.value, ...props.keywords].join(" ")));
const on = computed(() => c.active.value === id);
</script>

<template>
  <div
    v-if="shown"
    :id="id"
    role="option"
    :aria-selected="on"
    :aria-disabled="disabled || undefined"
    :data-value="value"
    class="hb-menu-item hb-command-item"
    @mousemove="!disabled && !on && (c.active.value = id)"
    @click="!disabled && emit('select', value)"
  >
    <slot />
  </div>
</template>

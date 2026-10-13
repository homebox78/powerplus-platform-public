<script setup lang="ts">
import { computed, inject, useSlots, type ComputedRef } from "vue";

/** href 가 있으면 <a>, 없으면 <button>. icon = KRDS 아이콘 이름. tooltip = 접었을 때 풍선 글자(기본: 글자) */
const props = defineProps<{ href?: string; isActive?: boolean; icon?: string; tooltip?: string }>();
const s = inject<{ isOpen: ComputedRef<boolean> }>("hb-sidebar")!;
const slots = useSlots();
const title = computed(() => {
  if (s.isOpen.value) return undefined;
  if (props.tooltip) return props.tooltip;
  const first = slots.default?.()[0];
  return typeof first?.children === "string" ? first.children.trim() : undefined;
});
</script>

<template>
  <component
    :is="href ? 'a' : 'button'"
    :href="href"
    :type="href ? undefined : 'button'"
    :aria-current="href && isActive ? 'page' : undefined"
    :data-active="isActive ? 'true' : undefined"
    :title="title"
    class="hb-sidebar-menu-button"
  >
    <i v-if="icon" :class="`svg-icon ico-${icon}`" aria-hidden="true" />
    <span class="hb-sidebar-label"><slot /></span>
  </component>
</template>

<!-- 태그 — KRDS krds-btn-tag. TagGroup 안에 둔다.
  <Tag removable @remove="…">복지</Tag>                ← 삭제 버튼(기본 이름 "복지 삭제")
  <Tag href="/search?q=청년">청년</Tag>                 ← 링크 태그
  삭제하면 다음(없으면 이전) 태그의 삭제 버튼, 다 지우면 묶음으로 포커스가 옮겨 가고
  묶음 안 알림 칸이 "복지를 삭제했습니다" 를 화면낭독기에 읽힌다. -->
<script setup lang="ts">
import { computed, ref, useSlots } from "vue";
import { afterTagRemove } from "./utils";

const props = defineProps<{ href?: string; removable?: boolean; removeLabel?: string }>();
const emit = defineEmits<{ remove: [] }>();
const slots = useSlots();
const box = ref<HTMLElement | null>(null);
const text = computed(() => {
  const n = slots.default?.() ?? [];
  return n.map((v) => (typeof v.children === "string" ? v.children : "")).join("").trim();
});
const label = computed(() => props.removeLabel ?? (text.value ? `${text.value} 삭제` : "삭제"));
function remove(e: MouseEvent) {
  const btn = e.currentTarget as HTMLElement;
  const name = (box.value?.textContent ?? "").replace(label.value, "").trim() || text.value;
  afterTagRemove(btn, name);
  emit("remove");
}
</script>

<template>
  <a v-if="href" :href="href" class="krds-btn-tag link"><slot /></a>
  <span v-else ref="box" class="krds-btn-tag">
    <slot />
    <button v-if="removable" type="button" class="btn-delete" @click="remove">
      <span class="sr-only">{{ label }}</span>
    </button>
  </span>
</template>

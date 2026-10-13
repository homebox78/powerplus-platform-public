<!-- 명령 팔레트 · 묶음 (role=group, 제목과 짝). 걸러서 비면 숨긴다 -->
<script setup lang="ts">
import { inject, nextTick, onMounted, ref, watch, type Ref } from "vue";
import { useUid } from "./utils";

defineProps<{ heading?: string }>();
const c = inject<{ search: Ref<string> }>("hb-cmd")!;
const id = useUid("hb-cmd-g");
const el = ref<HTMLElement>();
const empty = ref(false);
const check = () => (empty.value = !el.value?.querySelector('[role="option"]'));
onMounted(check);
watch(c.search, () => nextTick(check));
</script>

<template>
  <div ref="el" role="group" :aria-labelledby="heading ? id : undefined" :hidden="empty" class="hb-command-group">
    <div v-if="heading" :id="id" role="presentation" class="hb-menu-label">{{ heading }}</div>
    <slot />
  </div>
</template>

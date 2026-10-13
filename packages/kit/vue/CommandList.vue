<!-- 명령 팔레트 · 결과 목록 상자 (role=listbox) -->
<script setup lang="ts">
import { inject } from "vue";
defineProps<{ ariaLabel?: string }>();
const c = inject<{ listId: string }>("hb-cmd")!;
</script>

<template>
  <div :id="c.listId" role="listbox" :aria-label="ariaLabel ?? '검색 결과'" class="hb-command-list"><slot /></div>
</template>

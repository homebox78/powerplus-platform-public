<!-- 명령 팔레트 · 구분선 (검색 중에는 숨긴다) -->
<script setup lang="ts">
import { inject, type Ref } from "vue";
const c = inject<{ search: Ref<string> }>("hb-cmd")!;
</script>

<template>
  <div v-if="!c.search.value" role="none" aria-hidden="true" class="hb-menu-separator" />
</template>

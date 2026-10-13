<!-- 명령 팔레트 · 결과가 없을 때 -->
<script setup lang="ts">
import { inject, type Ref } from "vue";
const c = inject<{ count: Ref<number> }>("hb-cmd")!;
</script>

<template>
  <p v-if="c.count.value === 0" role="presentation" class="hb-command-empty"><slot>검색 결과가 없습니다.</slot></p>
</template>

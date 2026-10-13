<!-- 머리칸 <th> — 열 머리 scope="col"(기본), 행 머리 scope="row" -->
<script setup lang="ts">
withDefaults(defineProps<{ align?: "left" | "center" | "right"; scope?: string }>(), { scope: "col" });
</script>

<template>
  <th :scope="scope" :class="align ? `hb-align-${align}` : undefined"><slot /></th>
</template>

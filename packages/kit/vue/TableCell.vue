<script setup lang="ts">
defineProps<{ align?: "left" | "center" | "right" }>();
</script>

<template>
  <td :class="align ? `hb-align-${align}` : undefined"><slot /></td>
</template>

<script setup lang="ts">
defineProps<{ href?: string }>();
</script>

<template>
  <a :href="href" class="txt"><slot /></a>
</template>

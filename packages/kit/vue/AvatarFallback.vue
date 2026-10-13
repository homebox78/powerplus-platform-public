<!-- 아바타 대체 글자 — 사진이 없거나 못 불러오면 보인다. -->
<script setup lang="ts">
import { inject, ref, type Ref } from "vue";

const status = inject<Ref<string>>("hb-avatar", ref("idle"));
</script>

<template>
  <span v-if="status !== 'loaded'" class="hb-avatar-fallback"><slot /></span>
</template>

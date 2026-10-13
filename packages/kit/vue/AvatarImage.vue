<!-- 아바타 사진 — Avatar 안에 둔다. 다 불러온 뒤에만 보인다. -->
<script setup lang="ts">
import { inject, onMounted, ref, watchEffect, type Ref } from "vue";

const props = withDefaults(defineProps<{ src?: string; alt?: string }>(), { alt: "" });
const status = inject<Ref<"idle" | "loading" | "loaded" | "error">>("hb-avatar", ref("idle"));

// 서버(SSR)에는 Image 가 없다 — 불러오기는 브라우저에서 붙은 뒤에만
onMounted(() => watchEffect((onCleanup) => {
  const src = props.src;
  if (!src) {
    status.value = "error";
    return;
  }
  let live = true;
  status.value = "loading";
  const img = new Image();
  img.onload = () => live && (status.value = "loaded");
  img.onerror = () => live && (status.value = "error");
  img.src = src;
  onCleanup(() => {
    live = false;
  });
}));
</script>

<template>
  <img v-if="status === 'loaded'" :src="src" :alt="alt" class="hb-avatar-image" />
</template>

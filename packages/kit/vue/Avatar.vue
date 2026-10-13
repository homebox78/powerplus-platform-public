<!-- 아바타 — shadcn-vue Avatar
  <Avatar size="large">
    <AvatarImage src="/img/mayor.jpg" alt="한빛시장 김한빛" />
    <AvatarFallback>김</AvatarFallback>
  </Avatar>
  사진은 다 불러온 뒤에만 보이고, 실패하면 대체 글자가 보인다. 대체 글자만 쓸 땐 aria-label 로 이름을 준다. -->
<script setup lang="ts">
import { provide, ref, useAttrs } from "vue";

withDefaults(defineProps<{ size?: "small" | "medium" | "large" | "xlarge"; shape?: "circle" | "rounded" }>(), {
  size: "medium",
  shape: "circle",
});
const attrs = useAttrs();
const status = ref<"idle" | "loading" | "loaded" | "error">("idle");
provide("hb-avatar", status);
</script>

<template>
  <span :role="attrs['aria-label'] ? 'img' : undefined" :class="['hb-avatar', size, shape === 'rounded' && 'rounded']"><slot /></span>
</template>

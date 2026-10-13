<!-- 상태 문구(오류·성공·정보). 오류는 role="alert" 로 바로 읽힌다. -->
<script setup lang="ts">
import { computed, onBeforeUnmount } from "vue";
import { useField } from "./field-context";

const props = withDefaults(defineProps<{ tone?: "error" | "success" | "information" }>(), { tone: "error" });
const f = useField();
if (f) f.msg = true;
onBeforeUnmount(() => {
  if (f) f.msg = false;
});
const cls = computed(() =>
  props.tone === "error" ? "form-hint-invalid" : props.tone === "success" ? "form-hint-success" : "form-hint-information",
);
</script>

<template>
  <p :id="f ? `${f.id}-msg` : undefined" :role="tone === 'error' ? 'alert' : undefined" :class="cls"><slot /></p>
</template>

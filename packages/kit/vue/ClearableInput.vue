<!-- 내용 삭제 버튼이 붙은 입력 — KRDS 「텍스트 입력(아이콘)」 btn-delete-input.
  KRDS CSS 는 placeholder 가 가려졌을 때(값이 있을 때)만 버튼을 보이므로 placeholder 를 늘 둔다. -->
<script setup lang="ts">
import { ref } from "vue";
import Input from "./Input.vue";

defineOptions({ inheritAttrs: false });
withDefaults(defineProps<{ size?: "small" | "medium" | "large" | "xlarge"; placeholder?: string }>(), { size: "large", placeholder: " " });
const emit = defineEmits<{ clear: [] }>();
const model = defineModel<string>({ default: "" });
const wrap = ref<HTMLElement | null>(null);
function clear() {
  model.value = "";
  emit("clear");
  wrap.value?.querySelector("input")?.focus();
}
</script>

<template>
  <div ref="wrap" class="form-conts btn-ico-wrap" data-delete="true">
    <Input v-model="model" :size="size" :placeholder="placeholder" v-bind="$attrs" />
    <button type="button" class="krds-btn medium icon pure btn-delete-input" :tabindex="model ? 0 : -1" @click="clear">
      <span class="sr-only">내용 삭제</span>
      <i class="svg-icon ico-delete-fill" aria-hidden="true"></i>
    </button>
  </div>
</template>

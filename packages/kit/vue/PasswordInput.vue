<!-- 비밀번호 입력 — KRDS 「텍스트 입력(아이콘)」 보기/가리기 버튼 -->
<script setup lang="ts">
import { ref } from "vue";
import Input from "./Input.vue";

defineOptions({ inheritAttrs: false });
withDefaults(defineProps<{ size?: "small" | "medium" | "large" | "xlarge"; disabled?: boolean }>(), { size: "large", disabled: undefined });
const model = defineModel<string>();
const shown = ref(false);
</script>

<template>
  <div class="form-conts btn-ico-wrap">
    <Input v-model="model" :size="size" :type="shown ? 'text' : 'password'" :disabled="disabled" autocomplete="current-password" v-bind="$attrs" />
    <button type="button" class="krds-btn medium icon" :aria-pressed="shown" :disabled="disabled" @click="shown = !shown">
      <span class="sr-only">{{ shown ? "입력한 비밀번호 가리기" : "입력한 비밀번호 보기" }}</span>
      <i :class="['svg-icon', shown ? 'ico-pw-visible-on' : 'ico-pw-visible']" aria-hidden="true"></i>
    </button>
  </div>
</template>

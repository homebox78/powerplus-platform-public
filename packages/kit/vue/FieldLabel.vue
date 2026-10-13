<script setup lang="ts">
import { useField } from "./field-context";

const props = defineProps<{ for?: string; optional?: boolean }>();
const f = useField();
</script>

<template>
  <div class="form-tit">
    <label :for="props.for ?? f?.id">
      <slot /><template v-if="f?.required">{{ " " }}<span class="hb-required" aria-hidden="true">*</span><span class="sr-only">(필수)</span>
      </template><span v-if="optional" class="hb-optional"> (선택)</span>
    </label>
  </div>
</template>

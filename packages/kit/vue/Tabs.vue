<!-- 탭 — KRDS 「탭」 · shadcn-vue Tabs 와 같은 사용법
  <Tabs default-value="notice">
    <TabsList variant="line" full aria-label="소식">
      <TabsTrigger value="notice">공지사항</TabsTrigger>
    </TabsList>
    <TabsContent value="notice">…</TabsContent>
  </Tabs>
  v-model 로 선택값을 묶을 수 있다. 키보드: ←/→ 이동·선택, Home/End. -->
<script setup lang="ts">
import { computed, provide, ref } from "vue";
import { useUid } from "./utils";

const props = defineProps<{ modelValue?: string; defaultValue?: string }>();
const emit = defineEmits<{ "update:modelValue": [string] }>();
const inner = ref(props.defaultValue ?? "");
const value = computed(() => props.modelValue ?? inner.value);
const base = useUid("hb-tab");
provide("hb-tabs", {
  value,
  base,
  setValue(v: string) {
    inner.value = v;
    emit("update:modelValue", v);
  },
});
</script>

<template>
  <div class="krds-tab-area"><slot /></div>
</template>

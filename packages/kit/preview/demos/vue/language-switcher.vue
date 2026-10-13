<script setup lang="ts">
import { ref } from "vue";
import { LanguageSwitcher } from "../../../vue";
const lang = ref("ko");
const sites = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "English (영어)", href: "#en" },
  { code: "zh", label: "中文 (중국어)", href: "#zh" },
  { code: "ja", label: "日本語 (일본어)", href: "#ja" },
];
</script>

<template>
  <div style="min-height: 320px">
    <div class="pv-row">
      <LanguageSwitcher v-model="lang" align="left" />
      <LanguageSwitcher variant="page" model-value="ko" :languages="sites" label="Language" />
    </div>
    <p class="hb-demo-lang">선택한 언어 코드: {{ lang }}</p>
  </div>
</template>

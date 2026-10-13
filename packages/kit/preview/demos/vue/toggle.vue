<script setup lang="ts">
import { ref } from "vue";
import { Toggle } from "../../../vue";
const caption = ref(true);
</script>

<template>
  <div class="pv-row">
    <Toggle icon="like">관심 민원</Toggle>
    <Toggle v-model:pressed="caption" variant="outline">자막 {{ caption ? "켜짐" : "꺼짐" }}</Toggle>
    <Toggle variant="outline" size="small" default-pressed>새 글 알림</Toggle>
    <Toggle variant="outline" size="large">큰 글씨</Toggle>
    <Toggle variant="outline" disabled>음성 안내</Toggle>
  </div>
</template>

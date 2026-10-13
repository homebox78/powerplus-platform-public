<script setup lang="ts">
import { Skeleton } from "../../../vue";
</script>

<template>
  <div aria-busy="true" style="display: flex; gap: 16px; align-items: flex-start; max-width: 520px">
    <span class="sr-only">공지사항을 불러오는 중입니다</span>
    <Skeleton shape="circle" :style="{ width: '56px', height: '56px', flexShrink: 0 }" />
    <div style="flex: 1">
      <Skeleton :style="{ width: '50%', height: '20px', marginBottom: '12px' }" />
      <Skeleton shape="text" :lines="3" />
    </div>
  </div>
</template>

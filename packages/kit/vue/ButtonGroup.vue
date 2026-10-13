<!-- 버튼 묶음 — shadcn-vue ButtonGroup. 버튼을 붙여 한 덩어리로(모서리·테두리 겹침).
  <ButtonGroup aria-label="보기 방식"><Button variant="tertiary">목록</Button><Button variant="tertiary">지도</Button></ButtonGroup>
  orientation="vertical" 이면 위아래로. 같은 묶음의 버튼은 size 를 같게. -->
<script setup lang="ts">
withDefaults(defineProps<{ orientation?: "horizontal" | "vertical" }>(), { orientation: "horizontal" });
</script>

<template>
  <div role="group" :data-orientation="orientation" :class="['hb-button-group', orientation]"><slot /></div>
</template>

<script setup lang="ts">
import { AspectRatio } from "../../../vue";
// 예시 사진 — powerAssets 샘플(벚꽃 핀 강변 도시). 미리보기 묶음의 img/ 폴더에 들어 있다
const SCENE = "img/sample-city.webp";
const items: Array<[number, string]> = [
  [16 / 9, "16:9"],
  [4 / 3, "4:3"],
  [1, "1:1"],
];
</script>

<template>
  <div style="display: grid; grid-template-columns: 2fr 1.4fr 1fr; gap: 16px; align-items: start">
    <figure v-for="[r, name] in items" :key="name" style="margin: 0; min-width: 0">
      <AspectRatio :ratio="r"><img :src="SCENE" :alt="`한빛시 전경(${name})`" /></AspectRatio>
      <figcaption style="margin-top: 8px; font-size: 14px">{{ name }}</figcaption>
    </figure>
  </div>
</template>

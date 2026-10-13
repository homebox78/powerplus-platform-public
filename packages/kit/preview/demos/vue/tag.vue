<script setup lang="ts">
import { ref } from "vue";
import { Tag, TagGroup } from "../../../vue";
const tags = ref(["복지", "청년", "주거 지원"]);
</script>

<template>
  <TagGroup size="large" aria-label="선택한 검색 조건">
    <Tag v-for="t in tags" :key="t" removable :remove-label="`${t} 조건 삭제`" @remove="tags = tags.filter((x) => x !== t)">{{ t }}</Tag>
  </TagGroup>
  <TagGroup size="medium" aria-label="관련 주제">
    <Tag href="#tag">출산·육아</Tag>
    <Tag href="#tag">교통</Tag>
    <Tag href="#tag">문화행사</Tag>
  </TagGroup>
  <TagGroup size="small" aria-label="관련 부서">
    <Tag href="#tag">복지정책과</Tag>
    <Tag href="#tag">청년일자리과</Tag>
  </TagGroup>
</template>

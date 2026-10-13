<script setup lang="ts">
import { ToggleGroup, ToggleGroupItem } from "../../../vue";
</script>

<template>
  <div class="pv-row">
    <ToggleGroup type="single" variant="outline" default-value="list" aria-label="보기 방식">
      <ToggleGroupItem value="list">목록형</ToggleGroupItem>
      <ToggleGroupItem value="card">카드형</ToggleGroupItem>
      <ToggleGroupItem value="map">지도형</ToggleGroupItem>
    </ToggleGroup>
    <ToggleGroup type="single" variant="outline" size="small" default-value="recent" aria-label="정렬">
      <ToggleGroupItem value="recent">최신순</ToggleGroupItem>
      <ToggleGroupItem value="view">조회순</ToggleGroupItem>
    </ToggleGroup>
  </div>
  <div class="pv-row">
    <ToggleGroup type="multiple" variant="outline" spacing="separate" :default-value="['welfare', 'youth']" aria-label="관심 분야">
      <ToggleGroupItem value="welfare">복지</ToggleGroupItem>
      <ToggleGroupItem value="youth">청년</ToggleGroupItem>
      <ToggleGroupItem value="traffic">교통</ToggleGroupItem>
      <ToggleGroupItem value="culture">문화</ToggleGroupItem>
      <ToggleGroupItem value="safety" disabled>안전</ToggleGroupItem>
    </ToggleGroup>
  </div>
</template>

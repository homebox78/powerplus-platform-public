<!-- 구조화 목록 카드 하나. 슬롯: #badge(위 뱃지) · #action(본문 버튼) · #buttons(오른쪽 위 작은 버튼) -->
<script setup lang="ts">
defineProps<{
  title: string;
  href?: string;
  description?: string;
  meta?: Array<{ label: string; value: string }>;
  tags?: string[];
}>();
</script>

<template>
  <li class="structured-item">
    <div class="in">
      <div v-if="$slots.badge" class="card-top"><slot name="badge" /></div>
      <div class="card-body">
        <component :is="href ? 'a' : 'div'" :href="href" :class="['c-text', { 'hb-sl-static': !href }]">
          <p class="c-tit"><span class="span">{{ title }}</span></p>
          <p v-if="description" class="c-txt">{{ description }}</p>
          <p v-for="m in meta" :key="m.label" class="c-date">
            <strong class="key">{{ m.label }}</strong>
            <span class="value">{{ m.value }}</span>
          </p>
        </component>
        <div v-if="$slots.action" class="c-btn"><slot name="action" /></div>
      </div>
      <div v-if="tags && tags.length" class="card-btm">
        <span v-for="t in tags" :key="t" class="tag">{{ t }}</span>
      </div>
      <div v-if="$slots.buttons" class="card-btn"><slot name="buttons" /></div>
    </div>
  </li>
</template>

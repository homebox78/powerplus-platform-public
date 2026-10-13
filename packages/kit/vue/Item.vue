<!-- 항목 — shadcn-vue Item 과 같은 사용법 (한 줄짜리 목록 항목)
  <ItemGroup>
    <Item variant="outline">
      <ItemMedia variant="icon"><i class="svg-icon ico-file" aria-hidden="true" /></ItemMedia>
      <ItemContent><ItemTitle>주민등록표 등본 발급</ItemTitle><ItemDescription>온라인 발급 · 수수료 무료</ItemDescription></ItemContent>
      <ItemActions><Button size="small" variant="secondary">신청</Button></ItemActions>
    </Item>
  </ItemGroup>
  <Item as="a" href="/guide">…</Item>   ← 항목 전체가 링크(링크 역할 유지) -->
<script setup lang="ts">
withDefaults(
  defineProps<{ variant?: "default" | "outline" | "muted"; size?: "default" | "small"; as?: string }>(),
  { variant: "default", size: "default", as: "div" },
);
</script>

<template>
  <component
    :is="as"
    :role="as === 'div' ? 'listitem' : undefined"
    :class="['hb-item', variant !== 'default' && `hb-item-${variant}`, size === 'small' && 'hb-item-small']"
  >
    <slot />
  </component>
</template>

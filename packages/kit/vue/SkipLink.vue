<!-- 건너뛰기 링크 — KRDS 「건너뛰기 링크(skip_link)」
  <SkipLink href="#contents" />                     ← "본문 바로가기"
  <SkipLink :links="[{ href: '#contents', label: '본문 바로가기' }, { href: '#gnb', label: '주메뉴 바로가기' }]" />
  inline: 놓인 자리에 나타남 / preview: 늘 보이게(문서·미리보기용) -->
<script setup lang="ts">
withDefaults(
  defineProps<{
    href?: string;
    links?: Array<{ href: string; label: string }>;
    inline?: boolean;
    preview?: boolean;
    id?: string;
  }>(),
  { href: "#contents", id: "krds-skip-link" },
);
</script>

<template>
  <div :id="id" :class="{ 'hb-skip--inline': inline, 'hb-skip--preview': preview }">
    <ul v-if="links && links.length" class="hb-skip-list">
      <li v-for="l in links" :key="l.href"><a :href="l.href">{{ l.label }}</a></li>
    </ul>
    <a v-else :href="href"><slot>본문 바로가기</slot></a>
  </div>
</template>

<!-- NavigationMenu 안쪽 목록 판(내부용 — 목록 파일에 안 올라간다) -->
<script setup lang="ts">
import { computed } from "vue";

interface Link {
  label: string;
  href?: string;
  current?: boolean;
  description?: string;
  external?: boolean;
}
const props = defineProps<{
  title: string;
  titleHref?: string;
  links: Link[];
  banner?: { badge?: string; label: string; href?: string };
}>();
const described = computed(() => props.links.some((l) => l.description));
const ext = (on?: boolean) => (on ? { target: "_blank", title: "새 창 열림", rel: "noopener" } : {});
</script>

<template>
  <div class="gnb-sub-content">
    <h2 class="sub-title">
      <span>{{ title }}</span>
      <a v-if="titleHref" :href="titleHref" class="krds-btn link basic small">
        <span class="sr-only">{{ title }} </span>
        <span class="underline">바로가기</span>
        <i class="svg-icon ico-angle right" aria-hidden="true" />
      </a>
    </h2>
    <ul :class="{ 'type-description': described }">
      <li v-for="(l, k) in links" :key="k">
        <template v-if="described">
          <h3 class="tit">
            <a :href="l.href" :aria-current="l.current ? 'page' : undefined" v-bind="ext(l.external)">
              {{ l.label }}<i v-if="l.external" class="svg-icon ico-go" aria-hidden="true" />
            </a>
          </h3>
          <p v-if="l.description" class="txt">{{ l.description }}</p>
        </template>
        <a v-else :href="l.href" :class="{ active: l.current }" :aria-current="l.current ? 'page' : undefined" v-bind="ext(l.external)">{{ l.label }}</a>
      </li>
    </ul>
  </div>
  <div v-if="banner" class="gnb-sub-banner">
    <span v-if="banner.badge" class="krds-badge bg-secondary">{{ banner.badge }}</span>
    <a :href="banner.href" class="krds-btn medium text">{{ banner.label }} <i class="svg-icon ico-angle right" aria-hidden="true" /></a>
  </div>
</template>

<!-- 콘텐츠 내 탐색 — KRDS 「콘텐츠 내 탐색」(이 페이지의 구성)
  <InPageNavigation title="장애아동수당" :items="[{ id: 'overview', label: '서비스 개요' }]" position="static">
    <template #action><a class="krds-btn medium primary" href="/apply">온라인 신청하기</a></template>
    <template #info>장애아동수당 외 <strong>1건</strong></template>
  </InPageNavigation>
  본문 구역(id)이 화면에 들어오면 목록 항목이 선택(active + aria-current). 누르면 그 구역으로 스크롤·포커스.
  KRDS 기본은 화면 오른쪽 고정 — 문서 안에 두려면 position="static". -->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useUid } from "./utils";

interface Item {
  id: string;
  label: string;
}
const props = withDefaults(defineProps<{ items: Item[]; title: string; caption?: string; position?: "fixed" | "static" }>(), {
  caption: "이 페이지의 구성",
  position: "fixed",
});
const active = ref(props.items[0]?.id);
const tid = useUid("hb-ipn");
let io: IntersectionObserver | null = null;

onMounted(() => {
  if (typeof IntersectionObserver === "undefined") return;
  const seen = new Map<string, boolean>();
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) seen.set(e.target.id, e.isIntersecting);
      const first = props.items.find((i) => seen.get(i.id));
      if (first) active.value = first.id;
    },
    { rootMargin: "0px 0px -55% 0px" },
  );
  props.items.forEach((i) => {
    const el = document.getElementById(i.id);
    if (el) io!.observe(el);
  });
});
onBeforeUnmount(() => io?.disconnect());

function jump(id: string, e: MouseEvent) {
  const el = document.getElementById(id);
  if (!el) return;
  e.preventDefault();
  active.value = id;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
  history.replaceState?.(null, "", `#${id}`);
}
</script>

<template>
  <div :class="['krds-in-page-navigation-type', { 'hb-static': position === 'static' }]">
    <div class="krds-in-page-navigation-area">
      <div class="in-page-navigation-header">
        <p class="quick-caption">{{ caption }}</p>
        <p :id="tid" class="quick-title">{{ title }}</p>
      </div>
      <nav class="in-page-navigation-list" :aria-labelledby="tid">
        <ul>
          <li v-for="it in items" :key="it.id">
            <a
              :href="`#${it.id}`"
              :class="{ active: active === it.id }"
              :aria-current="active === it.id ? 'location' : undefined"
              @click="jump(it.id, $event)"
            >{{ it.label }}</a>
          </li>
        </ul>
      </nav>
      <div v-if="$slots.action || $slots.info" class="in-page-navigation-action">
        <slot name="action" />
        <p v-if="$slots.info" class="quick-info"><slot name="info" /></p>
      </div>
    </div>
  </div>
</template>

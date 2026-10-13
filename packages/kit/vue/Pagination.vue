<!-- 페이지네이션 — KRDS 「페이지네이션」
  <Pagination v-model:page="page" :total="99" />                         ← 버튼(목록만 바꿀 때)
  <Pagination :page="4" :total="99" :get-href="(p) => `?page=${p}`" />   ← 링크(주소가 바뀔 때)
  1쪽·끝쪽은 항상 보이고 현재 쪽 좌우 siblings 개, 사이는 말줄임.
  작은 화면(767px 이하)에서는 mobileSiblings(기본 1) 로 줄여 말줄임 포함 최대 7개만 보인다.
  현재 쪽: aria-current="page" + 화면 밖 글자 "현재페이지". 첫·끝에서 이전·다음은 비활성. -->
<script setup lang="ts">
import { computed, getCurrentInstance, onBeforeUnmount, onMounted, ref } from "vue";

const props = withDefaults(
  defineProps<{
    page: number;
    total: number;
    siblings?: number;
    /** 작은 화면(767px 이하)에서 쓸 좌우 번호 수 — 기본 1(말줄임 포함 최대 7개) */
    mobileSiblings?: number;
    getHref?: (page: number) => string;
    ariaLabel?: string;
  }>(),
  { siblings: 2, mobileSiblings: 1, ariaLabel: "페이지 이동" },
);
const emit = defineEmits<{ "update:page": [number] }>();

// 서버 렌더와 첫 그리기는 넓은 화면으로 보고 마운트 뒤에 맞춘다
const small = ref(false);
let mq: MediaQueryList | null = null;
const onMq = () => (small.value = !!mq?.matches);
onMounted(() => {
  if (!window.matchMedia) return;
  mq = window.matchMedia("(max-width: 767px)");
  onMq();
  mq.addEventListener("change", onMq);
});
onBeforeUnmount(() => mq?.removeEventListener("change", onMq));

type Entry = number | "dots";
const range = computed<Entry[]>(() => {
  const { page, total } = props;
  const siblings = Math.max(0, Math.min(3, small.value ? Math.min(props.mobileSiblings, props.siblings) : props.siblings));
  const width = siblings * 2 + 1;
  if (total <= width + 2) return Array.from({ length: Math.max(total, 1) }, (_, i) => i + 1);
  let start = Math.max(2, page - siblings);
  let end = Math.min(total - 1, page + siblings);
  if (page - siblings <= 2) end = Math.min(total - 1, width + 1);
  if (page + siblings >= total - 1) start = Math.max(2, total - width);
  const out: Entry[] = [1];
  if (start > 2) out.push("dots");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < total - 1) out.push("dots");
  out.push(total);
  return out;
});

// 링크일 때: 받는 쪽이 v-model:page(@update:page) 를 걸었으면 기본 이동을 막는다 (React 판 onPageChange 와 같다)
const listening = !!getCurrentInstance()?.vnode.props?.["onUpdate:page"];
function go(p: number, e: MouseEvent) {
  if (props.getHref && listening) e.preventDefault();
  emit("update:page", p);
}
const prevOff = computed(() => props.page <= 1);
const nextOff = computed(() => props.page >= props.total);
</script>

<template>
  <nav :aria-label="ariaLabel" class="krds-pagination">
    <span v-if="prevOff" class="page-navi prev disabled" aria-disabled="true">이전</span>
    <a v-else-if="getHref" class="page-navi prev" :href="getHref(page - 1)" @click="go(page - 1, $event)">이전</a>
    <button v-else type="button" class="page-navi prev" @click="go(page - 1, $event)">이전</button>
    <div class="page-links">
      <template v-for="(p, i) in range" :key="p === 'dots' ? `d${i}` : p">
        <span v-if="p === 'dots'" class="page-link link-dot" aria-hidden="true" />
        <a
          v-else-if="getHref"
          :class="['page-link', { active: p === page }]"
          :href="getHref(p)"
          :aria-current="p === page ? 'page' : undefined"
          @click="go(p, $event)"
        ><span v-if="p === page" class="sr-only">현재페이지 </span>{{ p }}</a>
        <button
          v-else
          type="button"
          :class="['page-link', { active: p === page }]"
          :aria-current="p === page ? 'page' : undefined"
          @click="go(p, $event)"
        ><span v-if="p === page" class="sr-only">현재페이지 </span>{{ p }}</button>
      </template>
    </div>
    <span v-if="nextOff" class="page-navi next disabled" aria-disabled="true">다음</span>
    <a v-else-if="getHref" class="page-navi next" :href="getHref(page + 1)" @click="go(page + 1, $event)">다음</a>
    <button v-else type="button" class="page-navi next" @click="go(page + 1, $event)">다음</button>
  </nav>
</template>

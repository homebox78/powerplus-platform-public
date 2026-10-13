<!-- 주 메뉴(PC, 메가 메뉴) — KRDS 「메인 메뉴 : 데스크탑」
  <NavigationMenu v-model="openLabel" :items="[
    { label: '민원', groups: [
      { label: '민원 신청', titleHref: '/civil', links: [{ label: '여권 발급', href: '…' }], banner: { badge: '신규 서비스', label: '모바일 신분증', href: '…' } },
      { label: '민원 서식', href: '/forms' },
    ] },
    { label: '분야별 정보', title: '분야별 정보', links: [ … ] },
    { label: '열린 시장실', href: '/mayor' },
  ]" />
  1뎁스 버튼 → 판(aria-expanded). 2뎁스는 누르기·마우스 올리기·포커스로 오른쪽 목록이 바뀐다.
  닫기: Esc(여는 버튼으로 복귀) · 바깥 누르기 · 포커스가 밖으로. 키보드: 1뎁스끼리 ←/→, ↓ 로 판 안으로. -->
<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { useUid } from "./utils";
import NavigationMenuSub from "./internal/NavigationMenuSub.vue";

interface Link {
  label: string;
  href?: string;
  current?: boolean;
  description?: string;
  external?: boolean;
}
interface Banner {
  badge?: string;
  label: string;
  href?: string;
}
interface Group {
  label: string;
  href?: string;
  external?: boolean;
  title?: string;
  titleHref?: string;
  links?: Link[];
  banner?: Banner;
  bannerPosition?: "bottom" | "right";
}
interface Entry {
  label: string;
  href?: string;
  groups?: Group[];
  title?: string;
  links?: Link[];
  banner?: Banner;
  bannerPosition?: "bottom" | "right";
}

const props = withDefaults(defineProps<{ items: Entry[]; modelValue?: string; defaultValue?: string; ariaLabel?: string }>(), {
  defaultValue: "",
  ariaLabel: "주 메뉴",
});
const emit = defineEmits<{ "update:modelValue": [string] }>();

const base = useUid("hb-gnb");
const inner = ref(props.defaultValue);
const openLabel = computed(() => props.modelValue ?? inner.value);
const setOpen = (v: string) => {
  inner.value = v;
  emit("update:modelValue", v);
};

const groupHasCurrent = (g: Group) => !!g.links?.some((l) => l.current);
const entryHasCurrent = (e: Entry) => !!e.links?.some((l) => l.current) || !!e.groups?.some(groupHasCurrent);
const opensPanel = (e: Entry) => !!(e.groups?.length || e.links?.length);

const subActive = reactive<Record<number, number>>({});
props.items.forEach((e, i) => {
  if (!e.groups) return;
  const cur = e.groups.findIndex(groupHasCurrent);
  subActive[i] = cur >= 0 ? cur : e.groups.findIndex((g) => g.links?.length);
});

const root = ref<HTMLElement>();
const mainTriggers: Array<HTMLElement | null> = [];
const setTrigger = (i: number) => (el: unknown) => {
  mainTriggers[i] = el instanceof HTMLElement ? el : null;
};
const openIndex = computed(() => props.items.findIndex((e) => e.label === openLabel.value && opensPanel(e)));

const onDown = (e: PointerEvent) => {
  if (!root.value?.contains(e.target as Node)) setOpen("");
};
watch(
  openIndex,
  (i) => {
    if (typeof document === "undefined") return; // 서버(SSR)에는 document 가 없다
    document.removeEventListener("pointerdown", onDown);
    if (i >= 0) document.addEventListener("pointerdown", onDown);
  },
  { immediate: true },
);
onBeforeUnmount(() => typeof document !== "undefined" && document.removeEventListener("pointerdown", onDown));

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && openIndex.value >= 0) {
    e.preventDefault();
    const i = openIndex.value;
    setOpen("");
    mainTriggers[i]?.focus();
    return;
  }
  const t = e.target as HTMLElement;
  const i = mainTriggers.indexOf(t);
  if (i < 0) return;
  const list = mainTriggers.filter(Boolean) as HTMLElement[];
  const at = list.indexOf(t);
  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
    e.preventDefault();
    const n = e.key === "ArrowRight" ? (at + 1) % list.length : (at - 1 + list.length) % list.length;
    list[n].focus();
  } else if (e.key === "ArrowDown" && opensPanel(props.items[i])) {
    e.preventDefault();
    setOpen(props.items[i].label);
    window.setTimeout(() => {
      document.getElementById(`${base}-${i}`)?.querySelector<HTMLElement>("a, button")?.focus();
    }, 0);
  }
}
function onFocusout(e: FocusEvent) {
  if (openIndex.value >= 0 && e.relatedTarget && !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOpen("");
}
const pick = (i: number, j: number) => {
  if (subActive[i] !== j) subActive[i] = j;
};
const ext = (on?: boolean) => (on ? { target: "_blank", title: "새 창 열림", rel: "noopener" } : {});
</script>

<template>
  <nav ref="root" :aria-label="ariaLabel" class="krds-main-menu" @keydown="onKeydown" @focusout="onFocusout">
    <div class="inner">
      <ul class="gnb-menu">
        <li v-for="(entry, i) in items" :key="i">
          <a v-if="!opensPanel(entry)" :ref="setTrigger(i)" :href="entry.href" class="gnb-main-trigger is-link">{{ entry.label }}</a>
          <template v-else>
            <button
              :ref="setTrigger(i)"
              type="button"
              :class="['gnb-main-trigger', { active: openIndex === i, selected: entryHasCurrent(entry) }]"
              :aria-expanded="openIndex === i"
              :aria-controls="`${base}-${i}`"
              @click="setOpen(openIndex === i ? '' : entry.label)"
            >{{ entry.label }}</button>
            <div :id="`${base}-${i}`" :class="['gnb-toggle-wrap', { 'is-open': openIndex === i }]">
              <div v-if="entry.groups?.length" class="gnb-main-list" data-has-submenu="true">
                <ul>
                  <li v-for="(g, j) in entry.groups" :key="j">
                    <a
                      v-if="!g.links?.length"
                      :href="g.href"
                      :class="['gnb-sub-trigger', 'is-link', { 'external-link': g.external }]"
                      v-bind="ext(g.external)"
                    >{{ g.label }}</a>
                    <template v-else>
                      <button
                        type="button"
                        :class="['gnb-sub-trigger', { active: subActive[i] === j }]"
                        :aria-expanded="subActive[i] === j"
                        :aria-controls="`${base}-${i}-${j}`"
                        @click="pick(i, j)"
                        @focus="pick(i, j)"
                        @mouseenter="pick(i, j)"
                      >{{ g.label }}</button>
                      <div
                        :id="`${base}-${i}-${j}`"
                        :class="['gnb-sub-list', { active: subActive[i] === j, between: g.bannerPosition === 'right' }]"
                      >
                        <NavigationMenuSub :title="g.title ?? g.label" :title-href="g.titleHref" :links="g.links" :banner="g.banner" />
                      </div>
                    </template>
                  </li>
                </ul>
              </div>
              <div v-else class="gnb-main-list">
                <div :class="['gnb-sub-list', 'single-list', { between: entry.bannerPosition !== 'bottom' }]">
                  <NavigationMenuSub :title="entry.title ?? entry.label" :links="entry.links ?? []" :banner="entry.banner" />
                </div>
              </div>
            </div>
          </template>
        </li>
      </ul>
    </div>
  </nav>
</template>

<!-- 전체 메뉴(모바일) — KRDS 「메인 메뉴 : 모바일」
  <MobileMenu v-model:open="open" :items="[
    { label: '민원', children: [
      { label: '민원 신청', href: '…' },
      { label: '증명서 발급', children: [{ label: '주민등록등본', href: '…' }] },   ← 3뎁스 펼침
    ] },
  ]" :utilities="[…]" :services="[…]" login-label="로그인" @search="(q) => …" :bottom-links="[…]" />
  왼쪽 1뎁스를 누르면 오른쪽이 그 묶음으로 스크롤되고, 스크롤하면 왼쪽 선택이 따라온다.
  대화상자(role=dialog, aria-modal): 열리면 첫 요소로 포커스, Tab 은 안에서만, Esc·닫기·바깥 누르면 닫히고 여는 버튼으로 복귀.
  KRDS 는 1024px 이상에서 이 메뉴를 숨긴다. 문서 안에 펼쳐 두려면 inline. -->
<script setup lang="ts">
import { getCurrentInstance, onBeforeUnmount, ref, watch } from "vue";
import { useUid } from "./utils";

interface Link {
  label: string;
  href?: string;
  current?: boolean;
  external?: boolean;
  children?: Link[];
}
interface Section {
  label: string;
  children: Link[];
}
const props = withDefaults(
  defineProps<{
    items: Section[];
    open?: boolean;
    inline?: boolean;
    utilities?: Array<{ label: string; href?: string }>;
    loginLabel?: string;
    services?: Array<{ label: string; href?: string; icon?: string }>;
    bottomLinks?: Array<{ label: string; href?: string; external?: boolean }>;
    ariaLabel?: string;
  }>(),
  { open: false, ariaLabel: "전체메뉴" },
);
const emit = defineEmits<{ "update:open": [boolean]; search: [string]; login: [] }>();
const hasSearch = !!getCurrentInstance()?.vnode.props?.onSearch;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
const base = useUid("hb-mgnb");
const active = ref(0);
const q = ref("");
const depth3 = ref(new Set<string>());
props.items.forEach((sec, i) => sec.children.forEach((c, j) => c.children?.some((d) => d.current) && depth3.value.add(`${i}-${j}`)));
const panel = ref<HTMLDivElement>();
const body = ref<HTMLDivElement>();
let restore: HTMLElement | null = null;
let timer = 0;
let prevOverflow = "";

const close = () => emit("update:open", false);

watch(
  () => props.open && !props.inline,
  (on, was) => {
    if (on) {
      restore = document.activeElement as HTMLElement | null;
      // 패널은 visibility 전환이 끝나야 포커스를 받는다 → 받을 때까지 다음 프레임에 다시 시도
      let n = 0;
      const tryFocus = () => {
        const el = panel.value?.querySelector<HTMLElement>(FOCUSABLE);
        el?.focus();
        if (document.activeElement !== el && n++ < 60) timer = requestAnimationFrame(tryFocus);
      };
      tryFocus();
      prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    } else if (was) {
      cancelAnimationFrame(timer);
      document.body.style.overflow = prevOverflow;
      restore?.focus?.();
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  cancelAnimationFrame(timer);
  if (props.open && !props.inline) document.body.style.overflow = prevOverflow;
});

function onKeydown(e: KeyboardEvent) {
  if (props.inline) return;
  if (e.key === "Escape") {
    e.preventDefault();
    close();
    return;
  }
  if (e.key !== "Tab") return;
  const list = Array.from(panel.value?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((el) => el.offsetParent !== null);
  if (!list.length) return;
  const first = list[0];
  const last = list[list.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function onScroll() {
  const b = body.value;
  if (!b) return;
  const lists = Array.from(b.querySelectorAll<HTMLElement>(".gnb-sub-list"));
  const top = b.scrollTop + 8;
  let cur = 0;
  lists.forEach((el, i) => {
    if (el.offsetTop - lists[0].offsetTop <= top) cur = i;
  });
  active.value = cur;
}

function jump(i: number, e: MouseEvent) {
  e.preventDefault();
  const b = body.value;
  const target = document.getElementById(`${base}-${i}`);
  if (!b || !target) return;
  const first = b.querySelector<HTMLElement>(".gnb-sub-list");
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  b.scrollTo({ top: target.offsetTop - (first?.offsetTop ?? 0), behavior: reduce ? "auto" : "smooth" });
  active.value = i;
  target.focus({ preventScroll: true });
}

function toggle3(k: string) {
  const next = new Set(depth3.value);
  if (next.has(k)) next.delete(k);
  else next.add(k);
  depth3.value = next;
}
const ext = (on?: boolean) => (on ? { target: "_blank", title: "새 창 열림", rel: "noopener" } : {});
function onRootClick(e: MouseEvent) {
  if (!props.inline && e.target === e.currentTarget) close();
}
</script>

<template>
  <div
    :class="['krds-main-menu-mobile', { 'is-open': inline || open, 'is-backdrop': !inline, 'hb-inline': inline }]"
    @click="onRootClick"
  >
    <div
      ref="panel"
      class="gnb-wrap"
      :role="inline ? 'navigation' : 'dialog'"
      :aria-modal="inline ? undefined : 'true'"
      :aria-label="ariaLabel"
      @keydown="onKeydown"
    >
      <div class="gnb-header">
        <div v-if="utilities?.length" class="gnb-utils">
          <ul class="utility-list">
            <li v-for="(u, i) in utilities" :key="i"><a :href="u.href" class="krds-btn xsmall text">{{ u.label }}</a></li>
          </ul>
        </div>
        <div v-if="loginLabel" class="gnb-login">
          <button type="button" class="krds-btn large text" @click="emit('login')">
            <i class="svg-icon ico-log" aria-hidden="true" /> {{ loginLabel }}
          </button>
        </div>
        <div v-if="services?.length" class="gnb-service-menu">
          <a v-for="(s, i) in services" :key="i" :href="s.href" :class="['link', { 'hb-has-icon': s.icon }]">
            <i v-if="s.icon" :class="`svg-icon ico-${s.icon}`" aria-hidden="true" />{{ s.label }}
          </a>
        </div>
        <form v-if="hasSearch" class="sch-input" role="search" @submit.prevent="emit('search', q)">
          <input
            v-model="q"
            type="search"
            class="krds-input"
            placeholder="찾고자 하는 메뉴명을 입력해 주세요"
            aria-label="찾고자 하는 메뉴명 입력"
          />
          <button type="submit" class="krds-btn medium icon ico-search">
            <span class="sr-only">검색</span>
            <i class="svg-icon ico-sch" aria-hidden="true" />
          </button>
        </form>
      </div>

      <div ref="body" class="gnb-body" @scroll="onScroll">
        <div class="gnb-menu">
          <div class="menu-wrap">
            <ul>
              <li v-for="(sec, i) in items" :key="i">
                <a
                  :href="`#${base}-${i}`"
                  :class="['gnb-main-trigger', { active: active === i }]"
                  :aria-current="active === i ? 'true' : undefined"
                  @click="jump(i, $event)"
                >{{ sec.label }}</a>
              </li>
            </ul>
          </div>
          <div class="submenu-wrap">
            <div v-for="(sec, i) in items" :id="`${base}-${i}`" :key="i" class="gnb-sub-list" tabindex="-1" :aria-labelledby="`${base}-${i}-t`">
              <h2 :id="`${base}-${i}-t`" class="sub-title">{{ sec.label }}</h2>
              <ul>
                <li v-for="(c, j) in sec.children" :key="j">
                  <a
                    v-if="!c.children?.length"
                    :href="c.href"
                    :class="['gnb-sub-trigger', { selected: c.current }]"
                    :aria-current="c.current ? 'page' : undefined"
                    v-bind="ext(c.external)"
                  >{{ c.label }}</a>
                  <template v-else>
                    <button
                      type="button"
                      :class="['gnb-sub-trigger', 'has-depth3', { active: depth3.has(`${i}-${j}`) }]"
                      :aria-expanded="depth3.has(`${i}-${j}`)"
                      :aria-controls="`${base}-d3-${i}-${j}`"
                      @click="toggle3(`${i}-${j}`)"
                    >{{ c.label }}</button>
                    <div :id="`${base}-d3-${i}-${j}`" :class="['depth3-wrap', { 'is-open': depth3.has(`${i}-${j}`) }]">
                      <ul>
                        <li v-for="(d, m) in c.children" :key="m">
                          <a
                            :href="d.href"
                            :class="['depth3-trigger', { selected: d.current }]"
                            :aria-current="d.current ? 'page' : undefined"
                            v-bind="ext(d.external)"
                          >{{ d.label }}</a>
                        </li>
                      </ul>
                    </div>
                  </template>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div v-if="bottomLinks?.length" class="gnb-bottom">
          <a v-for="(b, i) in bottomLinks" :key="i" :href="b.href" class="krds-btn small text" v-bind="ext(b.external)">
            {{ b.label }} <i :class="['svg-icon', b.external ? 'ico-go' : 'ico-angle right']" aria-hidden="true" />
          </a>
        </div>
      </div>

      <button v-if="!inline" type="button" class="krds-btn medium icon hb-mobile-menu-close" @click="close">
        <span class="sr-only">전체메뉴 닫기</span>
        <i class="svg-icon ico-popup-close" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

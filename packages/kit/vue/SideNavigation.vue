<!-- 사이드 메뉴(LNB) — KRDS 「사이드 메뉴」
  <SideNavigation title="민원 안내" :items="[
    { label: '민원 신청', children: [
      { label: '여권 발급', href: '/passport', current: true },
      { label: '증명서 발급', children: [{ label: '주민등록등본', href: '…' }] },   ← 4뎁스는 덮는 판
    ] },
    { label: '자주 묻는 질문', href: '/faq' },
  ]" />
  2뎁스: 하위가 있으면 펼침 버튼, 없으면 링크. 현재 페이지를 품은 항목은 처음부터 펼친다.
  3뎁스에 하위가 있으면 4뎁스 판이 덮인다 — 제목 버튼·Esc 로 닫고 원래 버튼으로 포커스 복귀. -->
<script setup lang="ts">
import { nextTick, ref } from "vue";
import { useUid } from "./utils";

interface Item {
  label: string;
  href?: string;
  current?: boolean;
  children?: Item[];
}
const props = defineProps<{ title: string; items: Item[]; ariaLabel?: string }>();

const hasCurrent = (it: Item): boolean => !!it.current || !!it.children?.some(hasCurrent);
const base = useUid("hb-lnb");
const open = ref(new Set(props.items.map((it, i) => (hasCurrent(it) ? i : -1)).filter((i) => i >= 0)));
const popup = ref<string | null>(null);
const triggers = new Map<string, HTMLElement>();
const titles = new Map<string, HTMLElement>();

function toggle(i: number) {
  const next = new Set(open.value);
  if (next.has(i)) next.delete(i);
  else next.add(i);
  open.value = next;
}
// 판은 visibility 전환(0.4초)이 끝나야 포커스를 받을 수 있다 → 받을 때까지 다음 프레임에 다시 시도
async function openPopup(key: string) {
  popup.value = key;
  await nextTick();
  const el = titles.get(key);
  let n = 0;
  const tryFocus = () => {
    if (popup.value !== key) return;
    el?.focus();
    if (document.activeElement !== el && n++ < 60) requestAnimationFrame(tryFocus);
  };
  tryFocus();
}
function closePopup(key: string, refocus: boolean) {
  if (popup.value === key) popup.value = null;
  if (refocus) triggers.get(key)?.focus();
}
function onPopupFocusout(key: string, e: FocusEvent) {
  if (popup.value === key && !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) closePopup(key, false);
}
const setRef = (map: Map<string, HTMLElement>, key: string) => (el: unknown) => {
  if (el instanceof HTMLElement) map.set(key, el);
};
</script>

<template>
  <nav :aria-label="ariaLabel ?? title" class="krds-side-navigation">
    <h2 class="lnb-tit">{{ title }}</h2>
    <ul class="lnb-list">
      <li v-for="(it, i) in items" :key="i" :class="['lnb-item', { active: it.children?.length ? open.has(i) : it.current }]">
        <a
          v-if="!it.children?.length"
          :href="it.href"
          :class="['lnb-btn', 'lnb-link', { active: it.current }]"
          :aria-current="it.current ? 'page' : undefined"
        >{{ it.label }}</a>
        <template v-else>
          <button
            type="button"
            :class="['lnb-btn', 'lnb-toggle', { active: open.has(i) }]"
            :aria-expanded="open.has(i)"
            :aria-controls="`${base}-${i}`"
            @click="toggle(i)"
          >{{ it.label }}</button>
          <div class="lnb-submenu">
            <ul :id="`${base}-${i}`">
              <li
                v-for="(sub, j) in it.children"
                :key="j"
                :class="['lnb-subitem', { active: hasCurrent(sub) }]"
              >
                <a
                  v-if="!sub.children?.length"
                  :href="sub.href"
                  :class="['lnb-btn', 'lnb-link', { selected: sub.current }]"
                  :aria-current="sub.current ? 'page' : undefined"
                >{{ sub.label }}</a>
                <template v-else>
                  <button
                    :ref="setRef(triggers, `${i}-${j}`)"
                    type="button"
                    :class="['lnb-btn', 'lnb-toggle-popup', { selected: hasCurrent(sub) }]"
                    :aria-expanded="popup === `${i}-${j}`"
                    :aria-controls="`${base}-p-${i}-${j}`"
                    aria-haspopup="true"
                    @click="openPopup(`${i}-${j}`)"
                  >{{ sub.label }}</button>
                  <div
                    :id="`${base}-p-${i}-${j}`"
                    :class="['lnb-submenu-lv2', { active: popup === `${i}-${j}` }]"
                    @keydown.esc.stop="closePopup(`${i}-${j}`, true)"
                    @focusout="onPopupFocusout(`${i}-${j}`, $event)"
                  >
                    <button :ref="setRef(titles, `${i}-${j}`)" type="button" class="lnb-btn-tit" @click="closePopup(`${i}-${j}`, true)">
                      {{ sub.label }}<span class="sr-only"> 닫고 이전 메뉴로</span>
                    </button>
                    <ul>
                      <li v-for="(leaf, k) in sub.children" :key="k">
                        <a
                          :href="leaf.href"
                          :class="['lnb-btn', { selected: leaf.current }]"
                          :aria-current="leaf.current ? 'page' : undefined"
                        >{{ leaf.label }}</a>
                      </li>
                    </ul>
                  </div>
                </template>
              </li>
            </ul>
          </div>
        </template>
      </li>
    </ul>
  </nav>
</template>

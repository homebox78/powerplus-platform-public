<!-- 언어 변경 — KRDS 「언어 변경(language_switcher · language_switcher_page)」
  <LanguageSwitcher v-model="lang" />                     ← 드롭다운형: 이 누리집 안에서 언어를 바꾼다
  <LanguageSwitcher variant="page" model-value="ko" :languages="[{ code: 'en', label: 'English (영어)', href: '…' }]" />
                                                          ← 페이지형: 언어별 누리집으로 새 창 이동
  네이티브 select 를 쓰지 않는다. 버튼(aria-expanded) + 목록. 키보드 ↓/↑·Home/End·Esc. -->
<script setup lang="ts">
import { computed, ref } from "vue";
import { useGovDrop } from "./govDrop";

interface LanguageOption {
  code: string;
  label: string;
  href?: string;
}
const props = withDefaults(
  defineProps<{
    languages?: LanguageOption[];
    modelValue?: string;
    defaultValue?: string;
    variant?: "dropdown" | "page";
    label?: string;
    align?: "center" | "left" | "right";
  }>(),
  {
    languages: () => [
      { code: "ko", label: "한국어" },
      { code: "en", label: "English (영어)" },
      { code: "zh", label: "中文 (중국어)" },
      { code: "ja", label: "日本語 (일본어)" },
      { code: "vi", label: "Tiếng Việt (베트남어)" },
    ],
    defaultValue: "ko",
    variant: "dropdown",
    label: "언어 변경",
    align: "center",
  },
);
const emit = defineEmits<{ "update:modelValue": [string] }>();
const d = useGovDrop();
const { wrap, btn, open, wrapClass, menuId } = d;
const inner = ref(props.defaultValue);
const value = computed(() => props.modelValue ?? inner.value);
const current = computed(() => props.languages.find((l) => l.code === value.value));
const list = computed(() => (props.variant === "page" ? props.languages.filter((l) => l.code !== value.value) : props.languages));

function pick(code: string) {
  inner.value = code;
  emit("update:modelValue", code);
  d.close(true);
}
</script>

<template>
  <div
    ref="wrap"
    :class="['krds-drop-wrap krds-language', align !== 'center' && `drop-${align}`, wrapClass]"
    @keydown="d.onWrapKeyDown"
    @focusout="d.onWrapFocusOut"
  >
    <button
      ref="btn"
      type="button"
      class="krds-btn small text drop-btn"
      :aria-expanded="open"
      :aria-controls="menuId"
      @click="d.onBtnClick"
      @keydown="d.onBtnKeyDown"
    >
      <i class="svg-icon ico-global" aria-hidden="true" />
      {{ label }}
      <span v-if="current" class="sr-only">, 현재 {{ current.label }}</span>
      <i class="svg-icon ico-toggle" aria-hidden="true" />
    </button>
    <div :id="menuId" class="drop-menu">
      <div class="drop-in">
        <div v-if="variant === 'page' && current" class="drop-top">
          <p class="current-laguage">
            <span>현재 언어</span>
            <strong :lang="current.code">{{ current.label }}</strong>
          </p>
        </div>
        <ul class="drop-list">
          <li v-for="l in list" :key="l.code">
            <a
              v-if="variant === 'page'"
              :href="l.href ?? '#'"
              class="item-link"
              :lang="l.code"
              :hreflang="l.code"
              target="_blank"
              rel="noopener noreferrer"
              title="새 창 열림"
              @click="d.close()"
              >{{ l.label }}<i class="svg-icon ico-go" aria-hidden="true"
            /></a>
            <a
              v-else-if="l.href"
              :href="l.href"
              :class="['item-link', { active: l.code === value }]"
              :lang="l.code"
              :hreflang="l.code"
              :aria-current="l.code === value ? 'true' : undefined"
              @click="pick(l.code)"
              >{{ l.label }}<span v-if="l.code === value" class="sr-only"> 선택됨</span></a
            >
            <button
              v-else
              type="button"
              :class="['item-link', { active: l.code === value }]"
              :lang="l.code"
              :aria-pressed="l.code === value"
              @click="pick(l.code)"
            >
              {{ l.label }}<span v-if="l.code === value" class="sr-only"> 선택됨</span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

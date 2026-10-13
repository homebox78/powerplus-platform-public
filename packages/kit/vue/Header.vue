<!-- 헤더 — KRDS 「헤더(header)」
  <Header site-name="한빛시" logo-src="/img/logo.svg" :utility-links="[{ label: '한빛시의회', href: '…', external: true }]"
    login-href="/login" join-href="/join" menu-controls="mobile-nav" @search="openSearch" @menu="openMenu">
    <template #utility><li><LanguageSwitcher /></li><li><Resize /></li></template>   ← 맨 위 줄에 더 넣을 부품(li 로 감싼다)
    <MainMenu … />                                                                  ← 메인 메뉴는 기본 슬롯
  </Header>
  로고는 이미지 주소로 받는다(정부 상징·기관 로고를 코드로 그리지 않는다). 없으면 기관명 글자.
  #actions 슬롯으로 오른쪽 버튼(통합검색·로그인·회원가입·전체메뉴)을 통째로 바꿀 수 있다. -->
<script setup lang="ts">
import { computed, useSlots } from "vue";

const props = withDefaults(
  defineProps<{
    siteName: string;
    logoSrc?: string;
    logoAlt?: string;
    homeHref?: string;
    utilityLinks?: Array<{ label: string; href: string; external?: boolean }>;
    loginHref?: string;
    joinHref?: string;
    menuControls?: string;
    menuExpanded?: boolean;
    sticky?: boolean;
    id?: string;
    logoLevel?: "h1" | "h2" | "div";
  }>(),
  { homeHref: "/", utilityLinks: () => [], sticky: true, id: "krds-header", logoLevel: "h2" },
);
defineEmits<{ search: []; menu: [] }>();
const slots = useSlots();
const hasUtility = computed(() => props.utilityLinks.length > 0 || !!slots.utility);
</script>

<template>
  <header :id="id" :class="{ 'hb-header--static': !sticky }">
    <div class="header-in">
      <div class="header-container">
        <div class="inner">
          <div v-if="hasUtility" class="header-utility">
            <ul class="utility-list">
              <li v-for="l in utilityLinks" :key="l.href + l.label">
                <a
                  :href="l.href"
                  class="krds-btn small text"
                  :target="l.external ? '_blank' : undefined"
                  :rel="l.external ? 'noopener noreferrer' : undefined"
                  :title="l.external ? '새 창 열기' : undefined"
                >
                  {{ l.label }} <i v-if="l.external" class="svg-icon ico-go" aria-hidden="true" />
                </a>
              </li>
              <slot name="utility" />
            </ul>
          </div>
          <div class="header-branding">
            <component :is="logoLevel" class="logo hb-gov-logo-box">
              <a :href="homeHref" class="hb-gov-logo">
                <img v-if="logoSrc" :src="logoSrc" :alt="logoAlt ?? siteName" />
                <span v-else class="hb-gov-logo-text">{{ siteName }}</span>
              </a>
            </component>
            <div class="header-actions">
              <slot name="actions">
                <button type="button" class="btn-navi sch" title="통합검색 레이어" @click="$emit('search')">통합검색</button>
                <a v-if="loginHref" :href="loginHref" class="btn-navi login">로그인</a>
                <a v-if="joinHref" :href="joinHref" class="btn-navi join">회원가입</a>
                <button
                  type="button"
                  class="btn-navi all"
                  :aria-controls="menuControls"
                  :aria-expanded="menuControls ? !!menuExpanded : undefined"
                  @click="$emit('menu')"
                >
                  전체메뉴
                </button>
              </slot>
            </div>
          </div>
        </div>
      </div>
      <slot />
    </div>
  </header>
</template>

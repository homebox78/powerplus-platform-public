<script setup lang="ts">
import { ref } from "vue";
import { Header, LanguageSwitcher } from "../../../vue";
const msg = ref("");
const utilityLinks = [
  { label: "한빛시의회", href: "#council", external: true },
  { label: "누리집 안내", href: "#guide" },
];
const menus = ["한빛소개", "분야별정보", "참여소통", "정보공개"];
</script>

<template>
  <div style="min-height: 320px">
    <Header
      site-name="한빛시"
      :sticky="false"
      :utility-links="utilityLinks"
      login-href="#login"
      join-href="#join"
      menu-controls="hb-demo-mobile-nav"
      @search="msg = '통합검색을 눌렀습니다.'"
      @menu="msg = '전체메뉴를 눌렀습니다.'"
    >
      <template #utility>
        <li><LanguageSwitcher /></li>
      </template>
      <!-- 실제로는 메인 메뉴 부품(navigation-menu)을 넣는다 -->
      <nav
        aria-label="주메뉴"
        class="inner"
        style="display: flex; gap: 32px; padding: 14px 24px; border-top: 1px solid var(--krds-light-color-divider-gray-light); font-weight: 700"
      >
        <a v-for="m in menus" :key="m" :href="`#${m}`">{{ m }}</a>
      </nav>
    </Header>
    <p class="pv-note" role="status">{{ msg }}</p>
  </div>
</template>

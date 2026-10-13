<script setup lang="ts">
import { ref } from "vue";
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "../../../vue";

const ruler = ref(true);
const zoom = ref("100");
const last = ref("");
</script>

<template>
  <Menubar aria-label="공문서 편집">
    <MenubarMenu>
      <MenubarTrigger data-testid="mb-file">파일</MenubarTrigger>
      <MenubarContent>
        <MenubarItem @select="last = '새 공문서'">새 공문서<MenubarShortcut>Ctrl+N</MenubarShortcut></MenubarItem>
        <MenubarItem @select="last = '불러오기'">불러오기<MenubarShortcut>Ctrl+O</MenubarShortcut></MenubarItem>
        <MenubarSub>
          <MenubarSubTrigger>서식 내려받기</MenubarSubTrigger>
          <MenubarSubContent>
            <MenubarItem @select="last = '기안문 서식'">기안문</MenubarItem>
            <MenubarItem @select="last = '시행문 서식'">시행문</MenubarItem>
            <MenubarItem @select="last = '보도자료 서식'">보도자료</MenubarItem>
          </MenubarSubContent>
        </MenubarSub>
        <MenubarSeparator />
        <MenubarItem @select="last = '인쇄'">인쇄<MenubarShortcut>Ctrl+P</MenubarShortcut></MenubarItem>
      </MenubarContent>
    </MenubarMenu>
    <MenubarMenu>
      <MenubarTrigger>편집</MenubarTrigger>
      <MenubarContent>
        <MenubarItem @select="last = '되돌리기'">되돌리기<MenubarShortcut>Ctrl+Z</MenubarShortcut></MenubarItem>
        <MenubarItem disabled>다시 하기</MenubarItem>
        <MenubarSeparator />
        <MenubarItem @select="last = '찾기'">찾기</MenubarItem>
        <MenubarItem @select="last = '바꾸기'">바꾸기</MenubarItem>
      </MenubarContent>
    </MenubarMenu>
    <MenubarMenu>
      <MenubarTrigger>보기</MenubarTrigger>
      <MenubarContent>
        <MenubarCheckboxItem v-model="ruler">눈금자</MenubarCheckboxItem>
        <MenubarSeparator />
        <MenubarRadioGroup v-model="zoom">
          <MenubarRadioItem value="75">75%</MenubarRadioItem>
          <MenubarRadioItem value="100">100%</MenubarRadioItem>
          <MenubarRadioItem value="150">150%</MenubarRadioItem>
        </MenubarRadioGroup>
      </MenubarContent>
    </MenubarMenu>
  </Menubar>
  <p class="pv-note" aria-live="polite">{{ last ? `실행: ${last}` : "메뉴를 열어 보세요." }} · 눈금자 {{ ruler ? "보임" : "숨김" }} · 확대 {{ zoom }}%</p>
</template>

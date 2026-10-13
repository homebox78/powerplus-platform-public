<script setup lang="ts">
import { computed, ref } from "vue";
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../../../vue";

const alarm = ref(true);
const sms = ref(false);
const sort = ref("recent");
const picked = ref("");
const sortLabel = computed(() => (sort.value === "recent" ? "최신순" : sort.value === "views" ? "조회순" : "제목순"));
</script>

<template>
  <div class="pv-row">
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button variant="tertiary" data-testid="dm-trigger">나의 민원 <i class="svg-icon ico-angle" aria-hidden="true" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>홍길동 님</DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem @select="picked = '신청 내역'">신청 내역<DropdownMenuShortcut>Alt+1</DropdownMenuShortcut></DropdownMenuItem>
          <DropdownMenuItem @select="picked = '처리 현황'">처리 현황<DropdownMenuShortcut>Alt+2</DropdownMenuShortcut></DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>증명서 발급</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem @select="picked = '주민등록표 등본'">주민등록표 등본</DropdownMenuItem>
              <DropdownMenuItem @select="picked = '가족관계증명서'">가족관계증명서</DropdownMenuItem>
              <DropdownMenuItem @select="picked = '지방세 납세증명서'">지방세 납세증명서</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem disabled>전자문서지갑(점검 중)</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>알림 받기</DropdownMenuLabel>
        <DropdownMenuCheckboxItem v-model="alarm">처리 결과 알림</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem v-model="sms">문자 메시지로도 받기</DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="danger" @select="picked = '로그아웃'">로그아웃</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>

    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <Button variant="secondary" size="medium">정렬: {{ sortLabel }}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuRadioGroup v-model="sort">
          <DropdownMenuRadioItem value="recent">최신순</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="views">조회순</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="title">제목순</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
  <p class="pv-note" aria-live="polite">
    {{ picked ? `고른 메뉴: ${picked}` : "메뉴를 열어 항목을 골라 보세요." }} · 알림 {{ alarm ? "켬" : "끔" }} · 문자 {{ sms ? "켬" : "끔" }}
  </p>
</template>

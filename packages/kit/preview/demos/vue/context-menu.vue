<script setup lang="ts">
import { ref } from "vue";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "../../../vue";

const preview = ref(true);
const done = ref("");
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger class="hb-context-area" tabindex="0" data-testid="cm-area">
      첨부파일: 2026년 한빛시 주민참여예산 공모 안내문.hwpx (182KB)
      <br />
      이 영역에서 마우스 오른쪽 버튼을 누르세요.
    </ContextMenuTrigger>
    <ContextMenuContent>
      <ContextMenuLabel>첨부파일</ContextMenuLabel>
      <ContextMenuItem @select="done = '내려받기'">내려받기<ContextMenuShortcut>Ctrl+S</ContextMenuShortcut></ContextMenuItem>
      <ContextMenuItem @select="done = '바로보기'">바로보기</ContextMenuItem>
      <ContextMenuSub>
        <ContextMenuSubTrigger>다른 형식으로 받기</ContextMenuSubTrigger>
        <ContextMenuSubContent>
          <ContextMenuItem @select="done = 'PDF로 받기'">PDF</ContextMenuItem>
          <ContextMenuItem @select="done = 'ODT로 받기'">ODT(개방형 문서)</ContextMenuItem>
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuSeparator />
      <ContextMenuCheckboxItem v-model="preview">목록에서 미리보기 표시</ContextMenuCheckboxItem>
      <ContextMenuSeparator />
      <ContextMenuItem variant="danger" @select="done = '첨부 삭제'">첨부 삭제</ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
  <p class="pv-note" aria-live="polite">{{ done ? `실행: ${done}` : "아직 실행한 메뉴가 없습니다." }} · 미리보기 {{ preview ? "표시" : "숨김" }}</p>
</template>

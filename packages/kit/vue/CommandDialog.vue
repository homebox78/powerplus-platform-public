<!-- 명령 팔레트를 대화상자로 — v-model:open 으로 여닫는다. 제목은 화면에 숨기고 스크린리더가 읽는다.
  모달 동작(포커스 가두기·Esc·바깥 누르기 닫기·포커스 복귀)은 reka-ui Dialog. -->
<script setup lang="ts">
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from "reka-ui";
import Command from "./Command.vue";

withDefaults(defineProps<{ title?: string; label?: string }>(), { title: "메뉴 찾기" });
</script>

<template>
  <DialogRoot>
    <DialogPortal>
      <DialogOverlay class="hb-kit hb-command-overlay" />
      <DialogContent class="hb-kit hb-command-dialog" :aria-describedby="undefined">
        <DialogTitle class="sr-only">{{ title }}</DialogTitle>
        <Command :label="label ?? title"><slot /></Command>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup lang="ts">
import { ref } from "vue";
import {
  Button,
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "../../../vue";

const MENUS: Array<{ group: string; items: Array<{ v: string; k: string[]; s?: string }> }> = [
  { group: "자주 찾는 민원", items: [
    { v: "전입신고", k: ["이사", "주소 이전"], s: "Alt+1" },
    { v: "주민등록표 등본 발급", k: ["등본", "증명서"] },
    { v: "여권 재발급 신청", k: ["여권"] },
    { v: "대형폐기물 배출 신고", k: ["가구", "스티커", "폐기물"] },
  ] },
  { group: "분야별 정보", items: [
    { v: "주민참여예산", k: ["예산", "제안"] },
    { v: "청년 월세 지원", k: ["청년", "주거", "월세"] },
    { v: "공공시설 예약", k: ["체육관", "회의실", "대관"] },
  ] },
];
const picked = ref("");
const open = ref(false);
function pickInDialog(v: string) {
  picked.value = v;
  open.value = false;
}
</script>

<template>
  <div style="max-width: 560px">
    <Command label="민원 메뉴 찾기" data-testid="cmd">
      <CommandInput placeholder="찾을 민원이나 메뉴를 입력하세요" />
      <CommandList aria-label="찾은 메뉴">
        <CommandEmpty>찾는 메뉴가 없습니다. 다른 낱말로 찾아 보세요.</CommandEmpty>
        <template v-for="(g, gi) in MENUS" :key="g.group">
          <CommandSeparator v-if="gi > 0" />
          <CommandGroup :heading="g.group">
            <CommandItem v-for="it in g.items" :key="it.v" :value="it.v" :keywords="it.k" @select="picked = $event">
              {{ it.v }}<CommandShortcut v-if="it.s">{{ it.s }}</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </template>
      </CommandList>
    </Command>
  </div>
  <div class="pv-row">
    <Button variant="tertiary" @click="open = true"><i class="svg-icon ico-sch" aria-hidden="true" /> 메뉴 찾기 창 열기</Button>
    <span class="pv-note" aria-live="polite">{{ picked ? `고른 메뉴: ${picked}` : "메뉴를 골라 보세요." }}</span>
  </div>
  <CommandDialog v-model:open="open" title="민원 메뉴 찾기">
    <CommandInput placeholder="찾을 민원이나 메뉴를 입력하세요" />
    <CommandList aria-label="찾은 메뉴">
      <CommandEmpty>찾는 메뉴가 없습니다. 다른 낱말로 찾아 보세요.</CommandEmpty>
      <template v-for="(g, gi) in MENUS" :key="g.group">
        <CommandSeparator v-if="gi > 0" />
        <CommandGroup :heading="g.group">
          <CommandItem v-for="it in g.items" :key="it.v" :value="it.v" :keywords="it.k" @select="pickInDialog">
            {{ it.v }}<CommandShortcut v-if="it.s">{{ it.s }}</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </template>
    </CommandList>
  </CommandDialog>
</template>

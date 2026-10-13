<!-- 명령 팔레트 — shadcn-vue Command 와 같은 사용법 (검색 입력 + 결과 목록, 직접 구현)
  <Command label="메뉴 찾기">
    <CommandInput placeholder="찾을 메뉴를 입력하세요" />
    <CommandList>
      <CommandEmpty>찾는 메뉴가 없습니다.</CommandEmpty>
      <CommandGroup heading="민원">
        <CommandItem value="전입신고" :keywords="['이사']" @select="…">전입신고</CommandItem>
      </CommandGroup>
    </CommandList>
  </Command>
  Vue 판은 CommandItem 에 value 를 꼭 준다(거르기에 쓴다).
  접근성: 포커스는 입력칸에 두고 ↑↓ 로 옮긴 현재 항목을 aria-activedescendant 로 알린다. Enter 로 고른다. -->
<script setup lang="ts">
import { nextTick, onMounted, provide, ref, watch } from "vue";
import { useUid } from "./utils";

const props = withDefaults(defineProps<{ label?: string; shouldFilter?: boolean }>(), { label: "검색 결과", shouldFilter: true });
const search = ref("");
const active = ref<string | null>(null);
const count = ref(0);
const listId = useUid("hb-cmd-list");
const root = ref<HTMLElement>();

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
function recount() {
  const el = root.value;
  if (!el) return;
  const opts = Array.from(el.querySelectorAll<HTMLElement>('[role="option"]:not([aria-disabled="true"])'));
  count.value = el.querySelectorAll('[role="option"]').length;
  if (!opts.some((o) => o.id === active.value)) active.value = opts[0]?.id ?? null;
}
onMounted(recount);
watch(search, () => nextTick(recount));

provide("hb-cmd", {
  search,
  active,
  count,
  listId,
  recount,
  filter: (text: string) => !props.shouldFilter || !search.value || norm(text).includes(norm(search.value)),
});
</script>

<template>
  <div ref="root" class="hb-command" :data-label="label">
    <slot />
    <p class="sr-only" role="status" aria-live="polite">{{ search ? `검색 결과 ${count}건` : "" }}</p>
  </div>
</template>

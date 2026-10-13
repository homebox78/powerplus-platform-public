<!-- 텍스트 목록 — KRDS 「텍스트 목록」(krds-info-list)
  <TextList><TextListItem>신청 대상: 한빛시 거주 청년</TextListItem></TextList>
  <TextList type="ordered"><TextListItem num="1.">온라인 신청서 작성</TextListItem></TextList>
  type: bullet(●, 기본) · dash(-) · hollow(○) · ordered(번호 ol). 3단계까지 겹칠 수 있다. -->
<script setup lang="ts">
withDefaults(defineProps<{ type?: "bullet" | "dash" | "hollow" | "ordered" }>(), { type: "bullet" });
const TYPE = { bullet: "decimal", dash: "dash", hollow: "hollow", ordered: "ordered" } as const;
</script>

<template>
  <component :is="type === 'ordered' ? 'ol' : 'ul'" :class="['krds-info-list', TYPE[type]]"><slot /></component>
</template>

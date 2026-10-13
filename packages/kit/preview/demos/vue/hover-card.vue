<script setup lang="ts">
import { HoverCard, HoverCardTrigger, HoverCardContent } from "../../../vue";
</script>

<template>
  <div>
    여권 민원은
    <HoverCard>
      <HoverCardTrigger href="#hover-card" class="krds-btn medium link pure">
        <span class="underline">한빛시 민원여권과</span>
      </HoverCardTrigger>
      <HoverCardContent align="start">
        <p class="hb-popover-title">민원여권과</p>
        <p>여권 발급·재발급, 주민등록 등·초본, 인감증명 발급을 맡습니다.</p>
        <dl style="display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin-top: 12px">
          <dt>위치</dt>
          <dd>한빛시청 본관 1층</dd>
          <dt>운영</dt>
          <dd>평일 09:00~18:00, 목요일 20:00까지</dd>
          <dt>전화</dt>
          <dd>내선 2345</dd>
        </dl>
      </HoverCardContent>
    </HoverCard>
    에서 처리합니다.
  </div>
</template>

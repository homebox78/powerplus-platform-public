<script setup lang="ts">
import { ContextualHelp } from "../../../vue";
</script>

<template>
  <div style="display: flex; flex-wrap: wrap; gap: 48px; align-items: flex-start; min-height: 300px">
    <ContextualHelp
      text="세대주와의 관계"
      title="세대주와의 관계는 어떻게 적나요?"
      side="bottom"
      align="left"
      default-open
      trigger-label="세대주와의 관계 도움말"
    >
      <p>주민등록표에 적힌 관계를 그대로 고릅니다. 세대주 본인이면 ‘본인’, 배우자의 부모는 ‘배우자의 부·모’로 고릅니다.</p>
      <template #action>
        <a href="#relation-guide" class="krds-btn xsmall link basic">관계 표기 안내 <i class="svg-icon ico-angle right" aria-hidden="true" /></a>
      </template>
    </ContextualHelp>

    <ContextualHelp text="납부 기한" title="납부 기한이 지나면" side="bottom" align="center" trigger-label="납부 기한 도움말">
      <p>기한 다음 날부터 3%의 가산금이 붙습니다. 한빛시 세무과(031-000-1234)로 분할 납부를 상담할 수 있습니다.</p>
    </ContextualHelp>

    <ContextualHelp text="본인인증" title="본인인증 수단" side="bottom" align="right" trigger-label="본인인증 도움말">
      <p>공동인증서, 금융인증서, 간편인증(민간 인증서) 중 하나로 인증합니다.</p>
    </ContextualHelp>
  </div>
</template>

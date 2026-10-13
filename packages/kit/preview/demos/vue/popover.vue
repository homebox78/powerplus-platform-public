<script setup lang="ts">
import { ref } from "vue";
import { Button, Popover, PopoverTrigger, PopoverContent, PopoverTitle, PopoverDescription, PopoverClose } from "../../../vue";

const WAYS = ["문자 메시지", "전자우편", "카카오 알림톡"];
const ways = ref<string[]>(["문자 메시지"]);
const saved = ref("문자 메시지");
</script>

<template>
  <div class="pv-row">
    <Popover>
      <PopoverTrigger as-child>
        <Button variant="secondary">처리 결과 알림 설정</Button>
      </PopoverTrigger>
      <PopoverContent aria-labelledby="pop-v-title" align="start" arrow>
        <PopoverTitle id="pop-v-title">처리 결과를 받을 방법</PopoverTitle>
        <PopoverDescription>민원 처리가 끝나면 고른 방법으로 알려 드립니다.</PopoverDescription>
        <div class="krds-check-area chk-column">
          <div v-for="(w, i) in WAYS" :key="w" class="krds-form-check">
            <input :id="'pop-v-' + i" v-model="ways" type="checkbox" :value="w" />
            <label :for="'pop-v-' + i">{{ w }}</label>
          </div>
        </div>
        <div class="pv-row" style="justify-content: flex-end; margin: 16px 0 0">
          <PopoverClose as-child>
            <Button size="small" @click="saved = ways.join(', ') || '받지 않음'">저장</Button>
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
    <p role="status">받을 방법: {{ saved }}</p>
  </div>
</template>

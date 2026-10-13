<script setup lang="ts">
import { Button, Tooltip, TooltipTrigger, TooltipContent } from "../../../vue";

const BOX = "여권 사진은 최근 6개월 안에 찍은 가로 3.5cm, 세로 4.5cm 컬러 사진이어야 합니다. 모자·색안경을 쓰면 안 되며, 배경은 흰색이어야 합니다.";
</script>

<template>
  <div class="pv-row">
    <Tooltip>
      <TooltipTrigger as-child>
        <Button variant="text" size="small">처리 기간 <i class="svg-icon ico-angle right" aria-hidden="true" /></Button>
      </TooltipTrigger>
      <TooltipContent>근무일 기준 4일이 걸립니다</TooltipContent>
    </Tooltip>
    <Tooltip>
      <TooltipTrigger as-child>
        <Button variant="tertiary" class="icon">
          <span class="sr-only">수수료 도움말</span>
          <i class="svg-icon ico-help" aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>10년 복수여권 수수료 53,000원</TooltipContent>
    </Tooltip>
    <Tooltip>
      <TooltipTrigger as-child>
        <Button variant="secondary">도움말</Button>
      </TooltipTrigger>
      <TooltipContent>신청서 작성 요령을 안내합니다</TooltipContent>
    </Tooltip>
  </div>
  <div class="pv-row">
    <Tooltip>
      <TooltipTrigger as-child>
        <Button variant="text" size="small">사진 규격(상자형) <i class="svg-icon ico-angle right" aria-hidden="true" /></Button>
      </TooltipTrigger>
      <TooltipContent variant="box">{{ BOX }}</TooltipContent>
    </Tooltip>
    <Tooltip>
      <TooltipTrigger as-child>
        <Button variant="text" size="small">수령 장소(세로형) <i class="svg-icon ico-angle right" aria-hidden="true" /></Button>
      </TooltipTrigger>
      <TooltipContent variant="vertical">한빛시청 본관 1층 민원여권과</TooltipContent>
    </Tooltip>
  </div>
</template>

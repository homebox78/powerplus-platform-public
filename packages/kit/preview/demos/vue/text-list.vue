<script setup lang="ts">
import { TextList, TextListItem } from "../../../vue";
</script>

<template>
  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 32px">
    <TextList>
      <TextListItem>신청 대상: 한빛시에 주민등록을 둔 만 19~34세 청년</TextListItem>
      <TextListItem>
        제출 서류
        <TextList type="dash">
          <TextListItem>주민등록표 등본 1부</TextListItem>
          <TextListItem>
            소득 증빙 서류
            <TextList type="hollow">
              <TextListItem>근로소득 원천징수영수증</TextListItem>
              <TextListItem>사업소득 확인서</TextListItem>
            </TextList>
          </TextListItem>
        </TextList>
      </TextListItem>
      <TextListItem>문의: 청년일자리과 031-000-0000</TextListItem>
    </TextList>
    <TextList type="ordered">
      <TextListItem num="1.">한빛시 누리집에 로그인합니다.</TextListItem>
      <TextListItem num="2.">
        온라인 신청서를 작성합니다.
        <TextList type="ordered">
          <TextListItem num="가.">기본 정보 입력</TextListItem>
          <TextListItem num="나.">첨부 서류 올리기</TextListItem>
        </TextList>
      </TextListItem>
      <TextListItem num="3.">접수 결과를 문자로 받습니다.</TextListItem>
    </TextList>
  </div>
</template>

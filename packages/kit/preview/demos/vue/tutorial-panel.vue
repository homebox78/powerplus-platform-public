<script setup lang="ts">
import { ref } from "vue";
import {
  HelpPanel,
  HelpPanelContent,
  HelpPanelTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TutorialPanel,
  TutorialTask,
} from "../../../vue";

const following = ref(true);
</script>

<template>
  <div class="hb-help-stage">
    <div class="hb-help-stage-body">
      <h3>전입신고</h3>
      <p>{{ following ? "오른쪽 따라하기 패널을 보며 차례대로 입력하세요." : "따라하기를 그만두었습니다. 도움말 버튼으로 다시 열 수 있습니다." }}</p>
    </div>
    <HelpPanel inline default-open>
      <HelpPanelTrigger />
      <HelpPanelContent label="전입신고 도움말">
        <Tabs default-value="follow" class="layer">
          <TabsList aria-label="도움말 종류">
            <TabsTrigger value="help">도움</TabsTrigger>
            <TabsTrigger value="follow">따라하기</TabsTrigger>
          </TabsList>
          <TabsContent value="help">
            <p>전입신고는 이사한 날부터 14일 안에 해야 합니다.</p>
          </TabsContent>
          <TabsContent value="follow">
            <TutorialPanel title="이사 전 살던 곳 정보 입력하기" @back="() => undefined" @stop="following = false">
              <TutorialTask current default-expanded title="과제 1: 이사 전에 살던 곳 주소 확인" :steps="['주소 조회', '조회 결과 확인']" />
              <TutorialTask title="과제 2: 이사 갈 가족 구성원 선택하기" :steps="['세대원 선택']" />
              <TutorialTask title="과제 3: 신청서 확인 후 제출" :steps="['입력 내용 확인', '제출']" />
            </TutorialPanel>
          </TabsContent>
        </Tabs>
      </HelpPanelContent>
    </HelpPanel>
  </div>
</template>

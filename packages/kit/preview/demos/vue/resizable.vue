<script setup lang="ts">
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../../../vue";
</script>

<template>
  <div style="height: 320px; border: 1px solid var(--krds-light-color-border-gray-light); border-radius: 12px; overflow: hidden">
    <ResizablePanelGroup direction="horizontal">
      <ResizablePanel :default-size="30" :min-size="20" :max-size="50">
        <div style="padding: 16px; height: 100%">
          <p style="font-weight: 700; margin-bottom: 8px">민원 목록</p>
          <p>여권 발급 · 전입 신고 · 증명서 발급</p>
        </div>
      </ResizablePanel>
      <ResizableHandle with-handle aria-label="목록과 본문 폭 조절" />
      <ResizablePanel :default-size="70">
        <ResizablePanelGroup direction="vertical">
          <ResizablePanel :default-size="60">
            <div style="padding: 16px; height: 100%">
              <p style="font-weight: 700; margin-bottom: 8px">여권 발급 신청</p>
              <p>신청서를 작성하고 사진을 등록한 뒤 수수료를 결제합니다.</p>
            </div>
          </ResizablePanel>
          <ResizableHandle with-handle aria-label="본문과 도움말 높이 조절" />
          <ResizablePanel :default-size="40">
            <div style="padding: 16px; height: 100%; background: var(--krds-light-color-surface-gray-subtle)">
              <p style="font-weight: 700; margin-bottom: 8px">도움말</p>
              <p>사진은 최근 6개월 안에 찍은 것이어야 합니다.</p>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>
  </div>
</template>

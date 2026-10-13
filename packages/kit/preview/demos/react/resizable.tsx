import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../../../react";

export const meta = {
  id: "resizable",
  title: "크기 조절 칸",
  group: "nav",
  source: "shadcn",
  note: "손잡이를 끌거나, Tab 으로 손잡이에 들어가 ←/→(세로는 ↑/↓, Shift 는 10%)·Home/End 로 조절한다.",
};

const box = { padding: 16, height: "100%" } as const;

export default function Demo() {
  return (
    <div style={{ height: 320, border: "1px solid var(--krds-light-color-border-gray-light)", borderRadius: 12, overflow: "hidden" }}>
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
          <div style={box}>
            <p style={{ fontWeight: 700, marginBottom: 8 }}>민원 목록</p>
            <p>여권 발급 · 전입 신고 · 증명서 발급</p>
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle aria-label="목록과 본문 폭 조절" />
        <ResizablePanel defaultSize={70}>
          <ResizablePanelGroup direction="vertical">
            <ResizablePanel defaultSize={60}>
              <div style={box}>
                <p style={{ fontWeight: 700, marginBottom: 8 }}>여권 발급 신청</p>
                <p>신청서를 작성하고 사진을 등록한 뒤 수수료를 결제합니다.</p>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle aria-label="본문과 도움말 높이 조절" />
            <ResizablePanel defaultSize={40}>
              <div style={{ ...box, background: "var(--krds-light-color-surface-gray-subtle)" }}>
                <p style={{ fontWeight: 700, marginBottom: 8 }}>도움말</p>
                <p>사진은 최근 6개월 안에 찍은 것이어야 합니다.</p>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

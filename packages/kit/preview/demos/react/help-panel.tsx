import {
  HelpPanel,
  HelpPanelContent,
  HelpPanelDescription,
  HelpPanelGroup,
  HelpPanelLink,
  HelpPanelLinks,
  HelpPanelSection,
  HelpPanelTitle,
  HelpPanelTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TutorialPanel,
  TutorialTask,
} from "../../../react";

export const meta = {
  id: "help-panel",
  title: "도움 패널",
  group: "overlay",
  source: "krds",
  note: "실제로는 화면 오른쪽에 고정된다. 미리보기는 inline 으로 상자 안에 가뒀고 열린 상태로 시작한다(접어두기 → 도움말 버튼으로 다시 열기).",
};

export default function Demo() {
  return (
    <div className="hb-help-stage">
      <div className="hb-help-stage-body">
        <h3>전자증명서 발급</h3>
        <p>발급받은 전자증명서는 전자문서지갑에 보관됩니다. 발급 방법이 궁금하면 오른쪽 도움말을 여세요.</p>
      </div>
      <HelpPanel inline defaultOpen>
        <HelpPanelTrigger />
        <HelpPanelContent label="전자증명서 도움말">
          <Tabs defaultValue="help" className="layer">
            <TabsList aria-label="도움말 종류">
              <TabsTrigger value="help">도움</TabsTrigger>
              <TabsTrigger value="follow">따라하기</TabsTrigger>
            </TabsList>
            <TabsContent value="help">
              <div className="help-conts-area-inner">
                <HelpPanelSection>
                  <HelpPanelTitle>전자문서지갑</HelpPanelTitle>
                  <HelpPanelDescription>
                    <p>전자문서지갑에서는 전자증명서를 출력할 수 없고, 화면을 캡처해 쓸 수도 없습니다. 발급받은 증명서는 열람용으로 내려받을 수 있습니다.</p>
                  </HelpPanelDescription>
                  <HelpPanelLinks>
                    <HelpPanelLink href="#android" icon="go" newWindow>안드로이드 앱 내려받기</HelpPanelLink>
                    <HelpPanelLink href="#ios" icon="go" newWindow>iOS 앱 내려받기</HelpPanelLink>
                  </HelpPanelLinks>
                </HelpPanelSection>
                <HelpPanelSection variant="related">
                  <HelpPanelGroup>
                    <HelpPanelTitle>관련 서비스·민원</HelpPanelTitle>
                    <HelpPanelLinks>
                      <HelpPanelLink href="#copy">주민등록표 등본</HelpPanelLink>
                      <HelpPanelLink href="#abstract">주민등록표 초본</HelpPanelLink>
                    </HelpPanelLinks>
                  </HelpPanelGroup>
                  <HelpPanelGroup>
                    <HelpPanelTitle>기타 문의</HelpPanelTitle>
                    <HelpPanelLinks>
                      <HelpPanelLink href="#call" icon="call">민원 문의 전화번호 찾기</HelpPanelLink>
                      <HelpPanelLink href="#faq" icon="faq">자주 묻는 질문 확인하기</HelpPanelLink>
                    </HelpPanelLinks>
                  </HelpPanelGroup>
                </HelpPanelSection>
              </div>
            </TabsContent>
            <TabsContent value="follow">
              <TutorialPanel title="전자증명서 발급받기" onStop={() => undefined}>
                <TutorialTask current title="1. 발급할 증명서 고르기" steps={["증명서 검색", "발급 용도 선택"]} />
                <TutorialTask title="2. 본인인증 하기" steps={["인증 수단 선택"]} />
              </TutorialPanel>
            </TabsContent>
          </Tabs>
        </HelpPanelContent>
      </HelpPanel>
    </div>
  );
}

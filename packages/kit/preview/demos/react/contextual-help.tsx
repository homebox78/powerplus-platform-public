import { ContextualHelp } from "../../../react";

export const meta = {
  id: "contextual-help",
  title: "맥락 도움말",
  group: "overlay",
  source: "krds",
  note: "물음표 버튼을 누를 때만 보인다. 아래 예시 하나는 열린 상태로 시작한다.",
};

export default function Demo() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 48, alignItems: "flex-start", minHeight: 300 }}>
      <ContextualHelp
        text="세대주와의 관계"
        title="세대주와의 관계는 어떻게 적나요?"
        side="bottom"
        align="left"
        defaultOpen
        triggerLabel="세대주와의 관계 도움말"
        action={
          <a href="#relation-guide" className="krds-btn xsmall link basic">
            관계 표기 안내 <i className="svg-icon ico-angle right" aria-hidden="true" />
          </a>
        }
      >
        <p>주민등록표에 적힌 관계를 그대로 고릅니다. 세대주 본인이면 &lsquo;본인&rsquo;, 배우자의 부모는 &lsquo;배우자의 부&middot;모&rsquo;로 고릅니다.</p>
      </ContextualHelp>

      <ContextualHelp text="납부 기한" title="납부 기한이 지나면" side="bottom" align="center" triggerLabel="납부 기한 도움말">
        <p>기한 다음 날부터 3%의 가산금이 붙습니다. 한빛시 세무과(031-000-1234)로 분할 납부를 상담할 수 있습니다.</p>
      </ContextualHelp>

      <ContextualHelp text="본인인증" title="본인인증 수단" side="bottom" align="right" triggerLabel="본인인증 도움말">
        <p>공동인증서, 금융인증서, 간편인증(민간 인증서) 중 하나로 인증합니다.</p>
      </ContextualHelp>
    </div>
  );
}

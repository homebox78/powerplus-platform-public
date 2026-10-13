import * as React from "react";
import { Header, LanguageSwitcher } from "../../../react";

export const meta = {
  id: "header",
  title: "헤더",
  group: "gov",
  source: "krds",
  note: "로고는 logoSrc 이미지로 받고 없으면 누리집 이름 글자. 메인 메뉴는 children 으로 넣는다. 전체메뉴 버튼은 1024px 미만에서만 보인다.",
};

export default function Demo() {
  const [msg, setMsg] = React.useState("");
  return (
    <div style={{ minHeight: 320 }}>
      <Header
        siteName="한빛시"
        sticky={false}
        utilityLinks={[
          { label: "한빛시의회", href: "#council", external: true },
          { label: "누리집 안내", href: "#guide" },
        ]}
        utility={[<LanguageSwitcher key="lang" />]}
        loginHref="#login"
        joinHref="#join"
        onSearchClick={() => setMsg("통합검색을 눌렀습니다.")}
        onMenuClick={() => setMsg("전체메뉴를 눌렀습니다.")}
        menuControls="hb-demo-mobile-nav"
      >
        {/* 실제로는 메인 메뉴 부품(navigation-menu)을 넣는다 */}
        <nav aria-label="주메뉴" className="inner" style={{ display: "flex", gap: 32, padding: "14px 24px", borderTop: "1px solid var(--krds-light-color-divider-gray-light)", fontWeight: 700 }}>
          {["한빛소개", "분야별정보", "참여소통", "정보공개"].map((m) => (
            <a key={m} href={`#${m}`}>{m}</a>
          ))}
        </nav>
      </Header>
      <p className="pv-note" role="status">{msg}</p>
    </div>
  );
}

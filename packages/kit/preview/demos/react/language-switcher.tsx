import * as React from "react";
import { LanguageSwitcher } from "../../../react";

export const meta = {
  id: "language-switcher",
  title: "언어 변경",
  group: "gov",
  source: "krds",
  note: "드롭다운형은 누리집 안에서 언어를 바꾸고, 페이지형은 언어별 누리집을 새 창으로 연다. 네이티브 select 를 쓰지 않는다.",
};

const SITES = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "English (영어)", href: "#en" },
  { code: "zh", label: "中文 (중국어)", href: "#zh" },
  { code: "ja", label: "日本語 (일본어)", href: "#ja" },
];

export default function Demo() {
  const [lang, setLang] = React.useState("ko");
  return (
    <div style={{ minHeight: 320 }}>
      <div className="pv-row">
        <LanguageSwitcher value={lang} onValueChange={setLang} align="left" />
        <LanguageSwitcher variant="page" value="ko" languages={SITES} label="Language" />
      </div>
      <p className="hb-demo-lang">선택한 언어 코드: {lang}</p>
    </div>
  );
}

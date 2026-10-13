import { Identifier } from "../../../react";

export const meta = {
  id: "identifier",
  title: "운영기관 식별자",
  group: "gov",
  source: "krds",
  note: "로고는 logoSrc 이미지로 받는다(정부 상징을 코드로 그리지 않는다). 없으면 문구만. 여러 기관이 함께 운영하면 logos 배열 — 순서가 위계다.",
};

// 시연용 자리표시 로고(실제 기관 로고가 아니다)
const ph = (label: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="32"><rect width="120" height="32" rx="4" fill="#e6e8ea"/><text x="60" y="21" font-size="13" text-anchor="middle" fill="#464c53" font-family="sans-serif">${label}</text></svg>`,
  )}`;

export default function Demo() {
  return (
    <div style={{ padding: 16, background: "var(--krds-light-color-surface-gray-subtler)" }}>
      <Identifier orgName="한빛시" />
      <Identifier className="pv-mt" text="이 누리집은 한빛시 문화관광과에서 운영합니다." />
      <Identifier
        className="pv-mt"
        orgName="한빛시 문화재단"
        logos={[
          { src: ph("상위 기관"), alt: "한빛시" },
          { src: ph("운영 기관"), alt: "한빛시 문화재단" },
        ]}
      />
    </div>
  );
}

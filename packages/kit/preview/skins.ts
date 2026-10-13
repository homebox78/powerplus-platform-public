// 스킨 = KRDS 기본 색 단계(primary 5~95)·글꼴·모서리를 덮어쓰는 CSS 변수 묶음.
// 부품 코드는 바뀌지 않는다. 레퍼런스 사이트 토큰이 이 모양으로 들어온다(6단계).
export interface Skin {
  id: string;
  label: string;
  vars: Record<string, string>;
}

// 주색 하나로 5~95 단계를 만든다 (밝게는 흰색, 어둡게는 검정과 섞는다)
// KRDS 는 버튼·링크에 primary, 탭·아코디언·선택 상태에 secondary 를 쓴다 → 스킨은 둘 다 채운다.
export function scale(hex: string, key: "primary" | "secondary" = "primary"): Record<string, string> {
  const n = parseInt(hex.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const mix = (t: number[], w: number) => "#" + rgb.map((c, i) => Math.round(c + (t[i] - c) * w).toString(16).padStart(2, "0")).join("");
  const steps: Array<[number, number[], number]> = [
    [5, [255, 255, 255], 0.92], [10, [255, 255, 255], 0.84], [20, [255, 255, 255], 0.66], [30, [255, 255, 255], 0.46],
    [40, [255, 255, 255], 0.22], [50, [0, 0, 0], 0], [60, [0, 0, 0], 0.2], [70, [0, 0, 0], 0.42],
    [80, [0, 0, 0], 0.6], [90, [0, 0, 0], 0.76], [95, [0, 0, 0], 0.84],
  ];
  const out: Record<string, string> = {};
  for (const [s, t, w] of steps) out[`--krds-color-light-${key}-${s}`] = mix(t, w);
  return out;
}

// 모서리는 radius 토큰만 바꾼다 — 숫자 토큰(--krds-number-*)은 여백·간격에도 쓰여서 건드리면 배치가 무너진다.
export function radius(sm: number, md: number, lg: number): Record<string, string> {
  const o: Record<string, string> = {};
  for (const k of ["xsmall1", "xsmall2", "xsmall3", "small1", "small2", "small3"]) o[`--krds-radius-${k}`] = `${sm}px`;
  for (const k of ["medium1", "medium2", "medium3", "medium4"]) o[`--krds-radius-${k}`] = `${md}px`;
  for (const k of ["large1", "large2", "xlarge1", "xlarge2"]) o[`--krds-radius-${k}`] = `${lg}px`;
  return o;
}

export const SKINS: Skin[] = [
  { id: "krds", label: "기본 파랑", vars: {} },
  {
    id: "purple",
    label: "보라 · 둥근 모서리 (예: 성남시)",
    vars: { ...scale("#A50082"), ...scale("#6E0057", "secondary"), ...radius(6, 12, 16) },
  },
  {
    id: "green",
    label: "초록 · 각진 모서리",
    vars: { ...scale("#12803C"), ...scale("#0B5A2A", "secondary"), ...radius(0, 0, 0) },
  },
];

// 레이어 부품(대화상자·팝오버)은 body 끝에 붙으므로 문서 루트에도 같이 건다.
export function applySkin(el: HTMLElement, skin: Skin) {
  for (const t of [el, document.documentElement]) {
    for (const s of SKINS) for (const k of Object.keys(s.vars)) t.style.removeProperty(k);
    for (const [k, v] of Object.entries(skin.vars)) t.style.setProperty(k, v);
  }
}

// 스타일 층 = 부품 겉모습 (powerGuide = 깔끔한 제품 톤 / KRDS = 원형). 스킨(색)과 따로 고른다.
export const STYLES = [
  { id: "powerguide", label: "powerGuide" },
  { id: "krds", label: "KRDS 원형" },
] as const;
export function applyStyle(id: string) {
  if (id === "krds") document.documentElement.setAttribute("data-hb-style", "krds");
  else document.documentElement.removeAttribute("data-hb-style");
}

// 글자 크기 조절 도우미 — resize 부품이 쓴다(.ts 라 index 로 내보내지 않는다)
//   font 모드: 대상 요소에 KRDS 글자 크기 토큰(--krds-*font-size*) 을 배율만큼 다시 선언한다.
//              키트 부품은 모두 이 토큰으로 글자 크기를 정하므로 대상 안의 글자가 실제로 커진다.
//   zoom 모드: KRDS 원본과 같이 대상의 zoom 을 바꾼다(글자·여백·그림 모두 커짐).
export type ScaleStep = "sm" | "md" | "lg" | "xlg" | "xxlg";
export const SCALE_STEPS: ScaleStep[] = ["sm", "md", "lg", "xlg", "xxlg"];
const FALLBACK: Record<ScaleStep, number> = { sm: 0.9, md: 1, lg: 1.1, xlg: 1.3, xxlg: 1.5 };
const VAR: Record<ScaleStep, string> = {
  sm: "--krds-zoom-small",
  md: "--krds-zoom-medium",
  lg: "--krds-zoom-large",
  xlg: "--krds-zoom-xlarge",
  xxlg: "--krds-zoom-xxlarge",
};

export function scaleOf(step: ScaleStep): number {
  if (typeof document === "undefined") return FALLBACK[step];
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(VAR[step]));
  return Number.isFinite(v) && v > 0 ? v : FALLBACK[step];
}

let names: string[] | null = null;
function fontSizeTokens(): string[] {
  if (names) return names;
  const found = new Set<string>();
  const walk = (rules: CSSRuleList) => {
    for (const r of Array.from(rules)) {
      if ("style" in r && (r as CSSStyleRule).style) {
        const st = (r as CSSStyleRule).style;
        for (let i = 0; i < st.length; i++) {
          const p = st[i];
          if (p.startsWith("--krds-") && p.includes("font-size")) found.add(p);
        }
      }
      if ("cssRules" in r && (r as CSSGroupingRule).cssRules) walk((r as CSSGroupingRule).cssRules);
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      walk(sheet.cssRules);
    } catch {
      /* 다른 출처 스타일시트는 읽을 수 없다 */
    }
  }
  names = Array.from(found);
  return names;
}

const BASE = "hbScaleBase";

/** 대상 요소에 배율을 적용한다. 1 이면 원래대로 되돌린다. */
export function applyScale(el: HTMLElement, scale: number, mode: "font" | "zoom" = "font") {
  if (mode === "zoom") {
    (el.style as CSSStyleDeclaration & { zoom: string }).zoom = scale === 1 ? "" : String(scale);
    return;
  }
  const tokens = fontSizeTokens();
  // 원래 값(px)을 한 번만 적어 둔다 — 여러 번 바꿔도 배율이 누적되지 않게
  let base: Record<string, number>;
  if (el.dataset[BASE]) base = JSON.parse(el.dataset[BASE]!);
  else {
    base = {};
    const cs = getComputedStyle(el);
    for (const t of tokens) {
      const v = cs.getPropertyValue(t).trim();
      if (/^-?\d*\.?\d+px$/.test(v)) base[t] = parseFloat(v);
    }
    el.dataset[BASE] = JSON.stringify(base);
  }
  for (const [t, px] of Object.entries(base)) {
    if (scale === 1) el.style.removeProperty(t);
    else el.style.setProperty(t, `${Math.round(px * scale * 10) / 10}px`);
  }
  if (scale === 1) delete el.dataset[BASE];
}

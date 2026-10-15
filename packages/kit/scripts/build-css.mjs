// KRDS 원본 CSS → 홈박스 키트 CSS
//
// 만드는 파일 (packages/kit/dist/css)
//   tokens.css  KRDS 토큰 768개. rem → px 로 바꿔 받는 쪽 루트 글자 크기(62.5%)에 기대지 않게 한다.
//   kit.css     tokens + 공통(아이콘·변수) + 범위 제한 초기화 + KRDS 부품 + 홈박스 추가 부품
//   icons/      KRDS 아이콘 SVG (원본 저장소의 잘못된 경로 img/img/... 를 여기로 바로잡는다)
//   fonts/      Pretendard GOV (OFL)
//
// 초기화 스타일(ul·button·a 등)은 원본이 전역이라 받는 쪽 사이트를 건드린다.
// → `:where(.hb-kit)` 아래로 가둔다(특이도 0 이라 부품 스타일을 이기지 않는다).
// 부품 CSS 의 전역 선택자(label, input[type=checkbox])도 같은 방식으로 가둔다.
import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";

const root = path.resolve(import.meta.dirname, "..");
const src = path.join(root, "krds");
const out = path.join(root, "dist", "css");
fs.mkdirSync(path.join(out, "icons"), { recursive: true });
fs.mkdirSync(path.join(out, "fonts"), { recursive: true });

const read = (f) => fs.readFileSync(path.join(src, f), "utf8");

// rem → px (KRDS 는 html{font-size:62.5%} 기준이라 1rem = 10px)
const remToPx = (css) =>
  css.replace(/(-?\d*\.?\d+)rem\b/g, (_, n) => `${+(parseFloat(n) * 10).toFixed(3)}px`);

// 아이콘 경로 바로잡기
const fixUrls = (css) =>
  css.replace(/url\((['"]?)[^)'"]*?\/icon\/([^)'"]+)\1\)/g, (_, q, file) => `url(${q}icons/${file}${q})`);

const SCOPE = ":where(.hb-kit)";
const scopeSelector = (sel) =>
  sel
    .split(",")
    .map((s) => {
      s = s.trim();
      if (!s) return s;
      if (/^(html|body|:root)$/.test(s)) return SCOPE;
      if (s.startsWith(SCOPE)) return s;
      return `${SCOPE} ${s}`;
    })
    .join(", ");

// 전역 선택자(클래스·속성 없이 요소로 시작) 판별
const isGlobalSelector = (s) => /^(\*|[a-z][a-z0-9]*)(\s|,|:|\[|$|>|\+|~)/i.test(s.trim()) && !/^[a-z0-9]+\.[a-z-]/i.test(s.trim());

function scopeRules(css, { all }) {
  const ast = postcss.parse(css);
  ast.walkRules((rule) => {
    if (rule.parent?.type === "atrule" && /keyframes/.test(rule.parent.name)) return;
    const parts = rule.selector.split(",").map((s) => s.trim());
    // html·body 규칙은 문서 루트용이다 — .hb-kit(감싸는 요소·레이어)에는 글자 속성만 옮기고
    // 위치·크기·배경·넘침은 버린다(받는 쪽 레이아웃과 포털 레이어를 깨뜨린다).
    if (all && parts.every((p) => /^(html|body)$/.test(p))) {
      rule.walkDecls((d) => {
        if (/^(position|width|height|background(-color)?|overflow(-x|-y)?|scroll-behavior)$/.test(d.prop)) d.remove();
      });
      if (!rule.nodes.length) {
        rule.remove();
        return;
      }
    }
    if (all) {
      rule.selector = scopeSelector(rule.selector);
    } else if (parts.some(isGlobalSelector)) {
      rule.selector = parts.map((p) => (isGlobalSelector(p) ? scopeSelector(p) : p)).join(", ");
    }
  });
  return ast.toString();
}

// 파생 토큰(var() 를 참조하는 값)은 `.hb-kit` 에서도 다시 선언한다.
// CSS 변수는 선언된 요소에서 계산이 끝난 뒤 상속되므로, :root 에만 두면
// 안쪽에서 기본 색(primary-50 등)을 바꿔도 버튼 채움색 같은 파생 토큰이 따라오지 않는다.
// 기본 값(리터럴)은 :root 에만 둬야 theme.css(:root) 덮어쓰기가 살아 있다.
function splitDerived(css) {
  const ast = postcss.parse(css);
  const derived = [];
  ast.walkRules((rule) => {
    if (rule.selector.trim() !== ":root") return;
    rule.walkDecls((d) => {
      if (d.prop.startsWith("--") && d.value.includes("var(")) derived.push(`${d.prop}:${d.value};`);
    });
  });
  return `${ast.toString()}\n.hb-kit{${derived.join("")}}\n`;
}

// ── 1. 토큰
let tokens = read("css/krds_tokens.css");
tokens = splitDerived(remToPx(tokens).replace(/@charset[^;]+;/, ""));
// 글꼴 이름: 토큰은 'Pretendard GOV' 한 단어만 → 폴백을 붙인다
tokens += `\n:root{--krds-typo-font-type:"Pretendard GOV", "Pretendard", system-ui, -apple-system, "Malgun Gothic", sans-serif;}\n`;

// ── 1-1. KRDS 주색 → powerGuide 정본 brand 단계 별칭 (2026-10-15, MCP 개선 O-12 토큰 정본 결정)
// 정본 = apps/web/app/modules/guide/data/tokens.json(→ guide-files/solideo-tokens.flat.json). 키트의 --krds-color-light-primary-* 는
// 값을 따로 갖지 않고 정본 --brand-* 를 가리킨다. 값이 정본과 같은 단계만 바꾸고(화면 그대로), 다르거나 대응 단계가 없으면 KRDS 값을 남긴다.
//  - 정본 기본값 블록은 :where(:root)(특이도 0) — 받는 쪽이 solideo-tokens.css·skin-*.css 를 어느 순서로 불러도 그쪽 --brand-* 가 이긴다.
//  - 별칭은 :root 에만 둔다(splitDerived 뒤에 바꾼다) — .hb-kit 에서 다시 선언하면 theme.css·목업(KitPage)이 :root 에서
//    --krds-color-light-primary-* 를 직접 덮는 기존 방식이 가려진다. 직접 덮기는 그대로 이긴다.
const flatFile = path.resolve(root, "../../apps/web/public/guide-files/solideo-tokens.flat.json");
const KRDS_TO_BRAND = { 5: 100, 10: 150, 20: 200, 30: 300, 40: 400, 50: 500, 60: 600, 70: 700, 80: 800 };
const brandAlias = { aliased: [], kept: [] };
if (fs.existsSync(flatFile)) {
  const canon = JSON.parse(fs.readFileSync(flatFile, "utf8")).tokens ?? {};
  const block = [];
  tokens = tokens.replace(/(:root\s*\{)([^}]*)\}/, (all, open, body) => {
    const next = body.replace(/(--krds-color-light-primary-(\d+))\s*:\s*(#[0-9a-fA-F]{6})\s*;/g, (decl, name, step, hex) => {
      const b = KRDS_TO_BRAND[step];
      const c = b ? canon[`brand-${b}`]?.value : undefined;
      if (c && c.toLowerCase() === hex.toLowerCase()) {
        brandAlias.aliased.push(`${name}→--brand-${b}`);
        block.push(`--brand-${b}:${c};`);
        return `${name}:var(--brand-${b});`;
      }
      brandAlias.kept.push(`${name} ${hex}${b ? ` (정본 --brand-${b} ${c ?? "없음"})` : " (정본 대응 단계 없음)"}`);
      return decl;
    });
    return `${open}${next}}`;
  });
  if (block.length) tokens = `/* powerGuide 정본 brand 단계 기본값(특이도 0) — solideo-tokens.css · skin-*.css 가 덮는다 */\n:where(:root){${block.join("")}}\n` + tokens;
} else {
  console.log(`⚠ 정본 토큰(${path.relative(root, flatFile)})이 없어 KRDS 주색 별칭을 건너뜀 — scripts/build-guide-tokens.mjs 먼저`);
}

// ── 2. 공통 (변수·아이콘까지만, 초기화는 가둬서)
let common = read("css/common.css").replace(/@import[^;]+;/, "").replace(/@charset[^;]+;/, "");
const resetAt = common.search(/\nhtml,\s*body\s*\{/);
const commonVars = common.slice(0, resetAt);
const commonReset = common.slice(resetAt);
// 루트 글자 크기 62.5% 는 버린다 (px 로 바꿨으니 필요 없고, 받는 쪽을 깨뜨린다)
const reset = scopeRules(remToPx(commonReset).replace(/font-size:\s*62\.5%;?/g, ""), { all: true });

// ── 3. 부품
let component = read("css/component.css").replace(/@charset[^;]+;/, "");
component = scopeRules(fixUrls(remToPx(component)), { all: false });

// ── 4. 글꼴
const fonts = ["Regular", "Medium", "Bold"]
  .map((w, i) => {
    const file = `PretendardGOV-${w}.subset.woff2`;
    fs.copyFileSync(path.join(src, "fonts", file), path.join(out, "fonts", file));
    return `@font-face{font-family:"Pretendard GOV";font-weight:${[400, 500, 700][i]};font-display:swap;src:url(fonts/${file}) format("woff2");}`;
  })
  .join("\n");

// ── 5. 홈박스 추가 부품 (KRDS 에 없는 shadcn 부품 · 묶음별 파일 css/parts/*.css)
const partsDir = path.join(root, "css", "parts");
const extra = fs.existsSync(partsDir)
  ? fs
      .readdirSync(partsDir)
      .filter((f) => f.endsWith(".css"))
      .sort()
      .map((f) => `/* parts/${f} */\n` + fs.readFileSync(path.join(partsDir, f), "utf8"))
      .join("\n")
  : "";

// ── 6. powerGuide 스타일 층 (css/style/powerguide.css) — <html data-hb-style="krds"> 면 꺼진다
const styleFile = path.join(root, "css", "style", "powerguide.css");
const style = fs.existsSync(styleFile) ? fs.readFileSync(styleFile, "utf8") : "";

for (const f of fs.readdirSync(path.join(src, "icons"))) {
  fs.copyFileSync(path.join(src, "icons", f), path.join(out, "icons", f));
}

const banner = `/*!
 * HOMEBOX Kit — KRDS 기반 부품 스타일
 * 본 저작물은 행정안전부에서 2024년 작성하여 공공누리 제1유형으로 개방한
 * '범정부 UI/UX 디자인시스템(KRDS)'을 이용하였으며, 해당 저작물은
 * 'KRDS 디자인시스템 홈페이지(https://www.krds.go.kr)'에서 무료로 다운받으실 수 있습니다.
 * 변경 사항: rem→px 변환, 초기화 스타일 범위 제한(.hb-kit), 아이콘 경로 수정, 홈박스 추가 부품.
 */\n`;

fs.writeFileSync(path.join(out, "tokens.css"), banner + tokens);
const kit = [
  banner,
  fonts,
  "/* ── 토큰 */",
  tokens,
  "/* ── 공통 변수·아이콘 */",
  splitDerived(fixUrls(remToPx(commonVars))),
  "/* ── 초기화(.hb-kit 안에서만) */",
  `.hb-kit{font-family:var(--krds-font-family-base);font-size:var(--krds-pc-font-size-body-medium);line-height:1.5;color:var(--krds-light-color-text-basic);word-break:keep-all;overflow-wrap:break-word;}`,
  reset,
  "/* ── KRDS 부품 */",
  component,
  "/* ── 홈박스 추가 부품 */",
  extra,
  "/* ── 홈박스 스타일 층 */",
  style,
].join("\n");
fs.writeFileSync(path.join(out, "kit.css"), kit);

const kb = (s) => `${Math.round(Buffer.byteLength(s) / 1024)}KB`;
console.log(`tokens.css ${kb(tokens)} · kit.css ${kb(kit)} · 아이콘 ${fs.readdirSync(path.join(out, "icons")).length}개`);
const left = (kit.match(/\d+\.?\d*rem\b/g) || []).length;
if (left) console.log(`⚠ rem 남음 ${left}건`);
console.log(`KRDS 주색 → 정본 --brand-* 별칭 ${brandAlias.aliased.length}개${brandAlias.kept.length ? ` · KRDS 값 유지 ${brandAlias.kept.length}개: ${brandAlias.kept.join(", ")}` : ""}`);

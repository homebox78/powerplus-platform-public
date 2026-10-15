/**
 * powerGuide 디자인 토큰 빌드 — 정본 하나(tokens.json) → 내려받기 산출물(apps/web/public/guide-files)
 *
 *   node scripts/build-guide-tokens.mjs
 *
 * 출처: D:\solideos tokens/build.mjs · tokens/verify.mjs · tools/build-components-css.mjs (v1.3.2, HEAD 5dcdb89) 를 옮겨 왔다.
 * 바꾼 점(2026-10-15, MCP 개선 O-12 토큰 정본 결정):
 *  - 정본 = 역할(semantic) 토큰. 주색 단계 이름은 회사색(crimson)이 아니라 중립 이름 brand. 기본값은 KRDS 주색과 같은 값이라
 *    키트(kit.css)의 --krds-color-light-primary-* 가 이 단계를 그대로 가리킬 수 있다(packages/kit/scripts/build-css.mjs).
 *  - 회사·기관 색은 스킨(apps/web/app/modules/guide/data/skins/*.json) → skin-<id>.css 로 brand 단계만 덮어쓴다.
 *    솔리데오 크림슨은 예시 스킨(skin-solideo.css). 옛 이름 --crimson-* 는 그 스킨 파일에만 별칭으로 남긴다.
 *  - 검증(대비·참조·부품 CSS 의 정의 없는 var)을 빌드 안에서 돌린다 — 실패하면 아무 파일도 쓰지 않는다.
 *  - 끝에 scripts/build-tailwind-theme.mjs(Tailwind v4 @theme · v3 프리셋)를 이어서 돌린다.
 * 산출물은 손으로 고치지 않는다 — tokens.json·스킨을 고치고 이 스크립트를 다시 돌린다.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "apps/web/app/modules/guide/data");
const OUT = join(ROOT, "apps/web/public/guide-files");
const SRC_LABEL = "apps/web/app/modules/guide/data/tokens.json";
const GEN_LABEL = "node scripts/build-guide-tokens.mjs";

const src = JSON.parse(readFileSync(join(DATA, "tokens.json"), "utf8"));
const SKINS = existsSync(join(DATA, "skins"))
  ? readdirSync(join(DATA, "skins")).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(readFileSync(join(DATA, "skins", f), "utf8")))
  : [];

/* ------------------------------------------------------------------ 평탄화 */
function flatten(node, path = [], out = []) {
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("$")) continue;
    if (value && typeof value === "object" && "$value" in value) {
      out.push({ path: [...path, key], value: value.$value, type: value.$type, desc: value.$description });
    } else if (value && typeof value === "object") {
      flatten(value, [...path, key], out);
    }
  }
  return out;
}
const tokens = flatten(src);

/** primitive.gray.900 → gray-900 · semantic.text.primary → text-primary · space.4 → space-4 */
const varName = (path) => (path[0] === "primitive" || path[0] === "semantic" ? path.slice(1) : path).join("-");
const byPath = new Map(tokens.map((t) => [t.path.join("."), t]));

function resolve(value, seen = new Set()) {
  if (typeof value !== "string") return value;
  const m = value.match(/^\{([^}]+)\}$/);
  if (!m) return value;
  if (seen.has(m[1])) throw new Error(`토큰 순환 참조: ${m[1]}`);
  const target = byPath.get(m[1]);
  if (!target) throw new Error(`토큰 참조를 찾을 수 없습니다: ${m[1]}`);
  return resolve(target.value, new Set([...seen, m[1]]));
}
/** CSS 에서는 참조를 var() 로 남겨 스킨·다크 모드가 런타임에 바뀌게 한다 */
function cssValue(value) {
  if (typeof value !== "string") return String(value);
  const m = value.match(/^\{([^}]+)\}$/);
  return m ? `var(--${varName(m[1].split("."))})` : value;
}
const resolved = tokens.map((t) => ({ ...t, name: varName(t.path), flat: resolve(t.value) }));
const BRAND_STEPS = resolved.filter((t) => t.path[0] === "primitive" && t.path[1] === "brand").map((t) => t.path[2]);

/* --------------------------------------------------------- 이전 명칭 alias */
/* 기존 SI 프로젝트가 v0 이름으로 붙어 있을 수 있어 유지한다. 옛 crimson 단계는 brand 로(값은 스킨이 정한다). */
const ALIASES = [
  ["color-brand", "fill-accent"],
  ["color-brand-hover", "fill-accent-hover"],
  ["color-brand-pressed", "fill-accent-pressed"],
  ["color-brand-subtle", "fill-accent-subtle"],
  ["color-brand-border", "brand-200"],
  ["color-bg", "bg-primary"],
  ["color-bg-page", "bg-primary"],
  ["color-bg-subtle", "bg-secondary"],
  ["color-bg-muted", "fill-secondary"],
  ["color-bg-inverse", "bg-inverse"],
  ["color-text", "text-primary"],
  ["color-text-secondary", "text-secondary"],
  ["color-text-tertiary", "text-tertiary"],
  ["color-text-inverse", "text-inverse"],
  ["color-text-brand", "text-accent"],
  ["color-border", "border-primary"],
  ["color-border-strong", "border-strong"],
  ["color-focus", "border-focus"],
  ["color-gray-ghost", "gray-200"],
  ["color-success", "text-positive"],
  ["color-warning", "text-caution"],
  ["color-danger", "fill-critical"],
  ["color-info", "blue-500"],
  ["sds-ink", "ink-700"],
  ["sds-gray-100", "gray-100"],
  ["sds-gray-200", "gray-200"],
  ["sds-gray-300", "gray-300"],
  ["sds-gray-900", "gray-900"],
  ["sds-red-300", "brand-300"],
  ["sds-red-500", "brand-500"],
  ["sds-red-700", "brand-700"],
  ["sds-blue-500", "blue-500"],
];

const HEAD = (what) =>
  `/* powerGuide 디자인 토큰 — ${what}\n` +
  `   자동 생성 파일입니다. 직접 수정하지 마세요.\n` +
  `   원본: ${SRC_LABEL} · 생성: ${GEN_LABEL}\n` +
  `   정본은 역할(semantic) 토큰입니다. 회사·기관 색은 skin-*.css 로 brand 단계만 덮어씁니다.\n` +
  `   version ${src.$version} */\n\n`;

/* --------------------------------------------------------------------- CSS */
function buildCss() {
  const lines = [HEAD("CSS Custom Properties") + ":root {"];
  let group = "";
  for (const t of resolved) {
    const g = (t.path.slice(0, -1).join(".") || t.path[0]).replace(/^(primitive|semantic)\./, "");
    if (g !== group) { group = g; lines.push(`\n  /* ${g} */`); }
    lines.push(`  --${t.name}: ${cssValue(t.value)};${t.desc ? ` /* ${t.desc} */` : ""}`);
  }
  lines.push("\n  /* alias — 이전 명칭. 신규 코드에서는 사용하지 마세요. */");
  for (const [from, to] of ALIASES) lines.push(`  --${from}: var(--${to});`);
  lines.push("}\n");
  lines.push("/* KRDS 글자 크기 설정 · <html data-font-scale=\"base | lg | xl\"> */");
  lines.push('html[data-font-scale="lg"] { font-size: 112.5%; }');
  lines.push('html[data-font-scale="xl"] { font-size: 125%; }\n');
  return lines.join("\n");
}

function buildScss() {
  const lines = [HEAD("Sass variables").replace(/\/\*|\*\//g, "//").replace(/^\/\/ /gm, "// ")];
  for (const t of resolved) lines.push(`$${t.name}: ${t.flat};`);
  lines.push("\n$solideo-tokens: (");
  lines.push(resolved.map((t) => `  "${t.name}": ${t.flat}`).join(",\n"));
  lines.push(");\n");
  return lines.join("\n");
}
const buildLess = () => HEAD("Less variables") + resolved.map((t) => `@${t.name}: ${t.flat};`).join("\n") + "\n";

const camel = (s) => s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
function jsObject() {
  const obj = {};
  for (const t of resolved) obj[camel(t.name)] = t.flat;
  return obj;
}
function buildJs() {
  const body = Object.entries(jsObject()).map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`).join("\n");
  return HEAD("ESM") + `export const tokens = {\n${body}\n};\n\nexport default tokens;\n`;
}
function buildCjs() {
  const body = Object.entries(jsObject()).map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`).join("\n");
  return HEAD("CommonJS") + `const tokens = {\n${body}\n};\n\nmodule.exports = tokens;\nmodule.exports.tokens = tokens;\n`;
}
function buildDts() {
  const body = Object.keys(jsObject()).map((k) => `  readonly ${k}: string;`).join("\n");
  return HEAD("TypeScript declarations") +
    `export interface SolideoTokens {\n${body}\n}\n\nexport declare const tokens: SolideoTokens;\nexport default tokens;\n`;
}

function buildProperties() {
  const head = `# powerGuide 디자인 토큰 — ${src.$version}\n` +
    `# 자동 생성 파일입니다. 직접 수정하지 마세요. (원본: ${SRC_LABEL})\n` +
    `# Spring: @PropertySource("classpath:solideo-tokens.properties")\n` +
    `# JSP:    <spring:eval expression="@environment.getProperty('solideo.fill.accent')" />\n\n`;
  return head + resolved.map((t) => `solideo.${t.path.filter((p) => p !== "primitive" && p !== "semantic").join(".")}=${t.flat}`).join("\n") + "\n";
}

/** 평면 JSON — tokens(정본 기본값) + skins(예시 스킨이 덮어쓰는 brand 단계). REST·MCP guide_check_code 가 읽는다. */
function buildFlatJson() {
  const o = {};
  // layer = semantic(역할 — 정본, 화면은 이것만) · primitive(팔레트) · 그 밖은 묶음 이름(space·radius…)
  for (const t of resolved) o[t.name] = { value: t.flat, type: t.type, layer: t.path[0], ...(t.desc ? { description: t.desc } : {}) };
  const skins = {};
  for (const s of SKINS) {
    skins[s.id] = { label: s.label, file: `skin-${s.id}.css`, tokens: Object.fromEntries(Object.entries(s.brand).map(([k, v]) => [`brand-${k}`, v])) };
  }
  return JSON.stringify({ version: src.$version, canonical: "semantic", tokens: o, skins }, null, 2) + "\n";
}

/* ------------------------------------------------ Quasar (Vue) SASS 변수 */
function buildQuasar() {
  const v = (p) => resolve(`{${p}}`);
  const map = [
    ["primary", "semantic.fill.accent", "주요 행동 · 브랜드"],
    ["secondary", "semantic.accent.secondary", "보조 강조"],
    ["accent", "primitive.brand.400", "포인트"],
    ["dark", "primitive.gray.900", "다크 표면"],
    ["dark-page", "primitive.gray.850", "다크 배경"],
    ["positive", "semantic.text.positive", "성공"],
    ["negative", "semantic.fill.critical", "오류 · 삭제"],
    ["info", "primitive.blue.500", "안내"],
    ["warning", "semantic.text.caution", "주의"],
  ];
  let s = `// powerGuide 디자인 토큰 — Quasar SASS variables (${src.$version})\n` +
    `// 자동 생성 파일입니다(원본: ${SRC_LABEL}). src/quasar-variables.sass 로 복사해 사용하세요.\n` +
    `// quasar.config.js → framework: { config: { brand: { ... } } } 대신 이 파일을 씁니다. 주색은 기본값(KRDS 주색)이며 스킨 색은 직접 바꿉니다.\n\n`;
  for (const [name, path, desc] of map) s += `$${name.padEnd(10)}: ${v(path)}   // ${desc}\n`;
  s += `\n// 전체 팔레트 (필요할 때 직접 참조)\n`;
  for (const t of resolved) s += `$sds-${t.name}: ${t.flat}\n`;
  s += `\n// 타이포 · 간격\n$typography-font-family: ${resolve("{font.family.sans}")}\n`;
  s += `$button-border-radius: ${resolve("{radius.sm}")}\n`;
  s += `$generic-border-radius: ${resolve("{radius.md}")}\n`;
  return s;
}

function buildJava() {
  const constName = (t) => t.path.filter((p) => p !== "primitive" && p !== "semantic").join("_").replace(/-/g, "_").toUpperCase();
  const body = resolved
    .map((t) => `    /** ${t.path.join(".")}${t.desc ? " — " + t.desc : ""} */\n    public static final String ${constName(t)} = "${t.flat}";`)
    .join("\n");
  return `package com.solideo.designsystem;\n\n` +
    `/**\n * powerGuide 디자인 토큰 (v${src.$version})\n *\n` +
    ` * 자동 생성 파일입니다. 직접 수정하지 마세요. (원본: ${SRC_LABEL})\n` +
    ` * 서버에서 색 값이 필요한 경우(메일 템플릿 · PDF · 리포트)에 사용합니다.\n` +
    ` * 화면 CSS에는 solideo-tokens.css 를 쓰고 이 클래스를 쓰지 마세요.\n` +
    ` *\n * <pre>\n * model.addAttribute("brand", SolideoTokens.FILL_ACCENT);\n * </pre>\n */\n` +
    `public final class SolideoTokens {\n\n    private SolideoTokens() {}\n\n${body}\n}\n`;
}

/* ------------------------------------ shadcn/ui + Tailwind v4 테마 레이어 */
const SHADCN_MAP = [
  ["background", "--bg-primary"], ["foreground", "--text-primary"],
  ["card", "--bg-primary"], ["card-foreground", "--text-primary"],
  ["popover", "--bg-primary"], ["popover-foreground", "--text-primary"],
  ["primary", "--fill-accent"], ["primary-foreground", "--text-inverse"],
  ["secondary", "--fill-secondary"], ["secondary-foreground", "--text-primary"],
  ["muted", "--bg-tertiary"], ["muted-foreground", "--text-secondary"],
  ["accent", "--fill-accent-subtle"], ["accent-foreground", "--text-accent"],
  ["destructive", "--fill-critical"], ["destructive-foreground", "--text-inverse"],
  ["border", "--border-primary"], ["input", "--border-strong"], ["ring", "--border-focus"],
  ["sidebar", "--bg-primary"], ["sidebar-foreground", "--text-primary"],
  ["sidebar-primary", "--fill-accent"], ["sidebar-primary-foreground", "--text-inverse"],
  ["sidebar-accent", "--fill-secondary"], ["sidebar-accent-foreground", "--text-primary"],
  ["sidebar-border", "--border-primary"], ["sidebar-ring", "--border-focus"],
  ["chart-1", "--brand-500"], ["chart-2", "--ink-700"], ["chart-3", "--blue-500"], ["chart-4", "--green-500"], ["chart-5", "--amber-500"],
];
function buildShadcnTheme() {
  const scales = ["gray", "brand", "ink", "green", "blue", "amber", "red"];
  const scaleVars = resolved.filter((t) => scales.includes(t.path[1]) && t.path[0] === "primitive").map((t) => `  --color-${t.name}: var(--${t.name});`).join("\n");
  const semanticVars = resolved.filter((t) => t.path[0] === "semantic").map((t) => `  --color-${t.name}: var(--${t.name});`).join("\n");
  const spaceVars = resolved.filter((t) => t.path[0] === "space").map((t) => `  --spacing-${t.path[1]}: var(--space-${t.path[1]});`).join("\n");
  return `/* powerGuide 디자인 토큰 — shadcn/ui + Tailwind v4 테마 레이어 (${src.$version})
   자동 생성 파일입니다. 직접 수정하지 마세요. (원본: ${SRC_LABEL})

   shadcn/ui 컴포넌트가 참조하는 표준 변수(--primary, --border, --ring …)를
   역할(semantic) 토큰에 연결합니다. 컴포넌트 코드는 손대지 않고 스킨(skin-*.css)으로 주색만 바뀝니다. */

:root {
${SHADCN_MAP.map(([k, v]) => `  --${k}: var(${v});`).join("\n")}
  --radius: var(--radius-sm);
}

/* KRDS 선명한 화면 모드 — 명도 대비를 최대로 올립니다 */
[data-contrast="high"] {
  --text-primary: #000000;
  --text-secondary: #1A1D21;
  --text-tertiary: #1A1D21;
  --border-primary: var(--gray-500);
  --border-strong: var(--gray-700);
  --fill-accent: var(--brand-700);
  --fill-accent-hover: var(--brand-800);
  --text-accent: var(--brand-700);
  --fill-critical: var(--red-700);
}

@theme inline {
  /* shadcn 표준 색 */
${SHADCN_MAP.map(([k]) => `  --color-${k}: var(--${k});`).join("\n")}

  /* 역할(semantic) 토큰 */
${semanticVars}

  /* 팔레트 */
${scaleVars}

  /* 간격 · 반경 · 서체 */
${spaceVars}
  --radius-xs: var(--radius-xs);
  --radius-sm: var(--radius-sm);
  --radius-md: var(--radius-md);
  --radius-lg: var(--radius-lg);
  --radius-xl: var(--radius-xl);
  --font-sans: var(--font-family-sans);
  --font-mono: var(--font-family-mono);
  --shadow-1: var(--shadow-1);
  --shadow-2: var(--shadow-2);
  --shadow-3: var(--shadow-3);
  --shadow-4: var(--shadow-4);
}
`;
}

/* ------------------------------------------------ Figma Variables · Tokens */
function buildFigma() {
  const set = (pred) => {
    const o = {};
    for (const t of tokens.filter(pred)) {
      const path = t.path[0] === "primitive" || t.path[0] === "semantic" ? t.path.slice(1) : t.path;
      let node = o;
      for (const seg of path.slice(0, -1)) node = node[seg] ??= {};
      const type = t.type === "color" ? "color" : t.type === "dimension" ? "sizing" : t.type === "fontWeight" ? "fontWeights"
        : t.type === "fontFamily" ? "fontFamilies" : t.type === "shadow" ? "boxShadow" : "other";
      const value = typeof t.value === "string" ? t.value.replace(/^\{(primitive|semantic)\.(.+)\}$/, "{$2}") : t.value;
      node[path[path.length - 1]] = { value, type, ...(t.desc ? { description: t.desc } : {}) };
    }
    return o;
  };
  /* 스킨 = Tokens Studio 세트 하나(Primitive 의 brand 만 덮는다) */
  const skinSets = Object.fromEntries(SKINS.map((s) => [`Skin/${s.id}`, { brand: Object.fromEntries(Object.entries(s.brand).map(([k, v]) => [k, { value: v, type: "color" }])) }]));
  return JSON.stringify({
    Primitive: set((t) => t.path[0] === "primitive"),
    Semantic: set((t) => t.path[0] === "semantic"),
    Scale: set((t) => !["primitive", "semantic"].includes(t.path[0])),
    ...skinSets,
    $themes: [],
    $metadata: { tokenSetOrder: ["Primitive", ...Object.keys(skinSets), "Semantic", "Scale"] },
  }, null, 2) + "\n";
}

/* --------------------------------------------------------------- 다크 모드 */
const DARK = [
  ["text-primary", "gray-25"], ["text-secondary", "gray-200"], ["text-tertiary", "gray-300"], ["text-disabled", "gray-500"],
  ["text-inverse", "gray-900"], ["text-accent", "brand-300"], ["text-critical", "red-300"], ["text-positive", "green-300"],
  ["text-caution", "amber-300"], ["text-info", "blue-300"],
  ["bg-primary", "gray-900"], ["bg-secondary", "gray-850"], ["bg-tertiary", "gray-800"], ["bg-inverse", "gray-25"],
  ["fill-primary", "gray-25"], ["fill-secondary", "gray-750"], ["fill-tertiary", "gray-800"],
  ["fill-accent", "brand-400"], ["fill-accent-hover", "brand-300"], ["fill-accent-pressed", "brand-200"], ["fill-accent-subtle", "brand-800"],
  ["fill-disabled", "gray-750"], ["fill-critical", "red-400"], ["fill-critical-subtle", "red-800"], ["fill-positive-subtle", "green-800"],
  ["fill-caution-subtle", "amber-800"], ["fill-info-subtle", "blue-800"],
  ["border-primary", "gray-700"], ["border-secondary", "gray-750"], ["border-strong", "gray-500"], ["border-accent", "brand-400"],
  ["border-critical", "red-400"], ["border-focus", "blue-300"],
  ["icon-primary", "gray-25"], ["icon-secondary", "gray-200"], ["icon-tertiary", "gray-400"], ["icon-accent", "brand-300"], ["icon-inverse", "gray-900"],
  ["accent-primary", "brand-400"], ["accent-secondary", "ink-200"],
];
function buildDark() {
  const nl = "\n";
  return `/* powerGuide 디자인 토큰 — 다크 모드 (${src.$version})
   자동 생성 파일입니다. 직접 수정하지 마세요. (원본: ${GEN_LABEL} 의 DARK)

   Primitive 는 그대로 두고 역할(semantic) 매핑만 뒤집습니다. 스킨(brand 단계)도 그대로 따라옵니다.

   사용
     <html data-theme="dark">   또는  <html class="dark">
   시스템 설정을 따르려면 prefers-color-scheme 블록도 함께 씁니다. */

[data-theme='dark'],
.dark {
${DARK.map(([k, v]) => `  --${k}: var(--${v});`).join(nl)}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
${DARK.map(([k, v]) => `    --${k}: var(--${v});`).join(nl)}
  }
}
`;
}

/* ------------------------------------------------------------- 스킨 CSS */
function buildSkin(s) {
  const lines = [
    `/* powerGuide 예시 스킨 — ${s.label} (${src.$version})`,
    `   자동 생성 파일입니다. 직접 수정하지 마세요. (원본: apps/web/app/modules/guide/data/skins/${s.id}.json · 생성: ${GEN_LABEL})`,
    ``,
    `   정본 역할 토큰(--fill-accent · --text-accent …)은 그대로 두고 주색 단계(--brand-*)만 덮어씁니다.`,
    `   순서: solideo-tokens.css → (solideo-dark.css) → 이 파일. 키트(kit.css)의 KRDS 주색도 --brand-* 를 따라옵니다. */`,
    ``,
    `:root {`,
  ];
  for (const [k, v] of Object.entries(s.brand)) lines.push(`  --brand-${k}: ${v};`);
  if (s.legacy) {
    lines.push(``, `  /* 옛 이름(v1.3 이하 --${s.legacy}-*) — 신규 코드에서는 --brand-* 나 역할 토큰을 쓰세요. */`);
    for (const k of Object.keys(s.brand)) lines.push(`  --${s.legacy}-${k}: var(--brand-${k});`);
  }
  lines.push(`}`, ``);
  return lines.join("\n");
}

/* ------------------------------------------------------------------ 검증 */
const errors = [];
const passes = [];
function lum(hex) {
  const h = hex.replace("#", "");
  const s = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// 1 · 참조 해석과 계층 — 역할 토큰은 primitive 만 가리킨다
for (const t of tokens) {
  const r = typeof t.value === "string" ? t.value.match(/^\{([^}]+)\}$/)?.[1] : null;
  if (!r) continue;
  try { resolve(t.value); } catch (e) { errors.push(`${t.path.join(".")}: ${e.message}`); continue; }
  if (t.path[0] === "semantic" && !r.startsWith("primitive.")) errors.push(`${t.path.join(".")}: 역할 토큰은 primitive 만 참조해야 합니다 (현재 ${r})`);
}
// 2 · 3 · 대비 — 기본값과 스킨마다 다시 잰다(스킨이 brand 단계만 바꿔도 버튼·링크 대비가 달라진다)
function contrastSuite(label, brand) {
  const val = (p) => {
    const m = p.match(/^primitive\.brand\.(\w+)$/);
    if (m && brand) return brand[m[1]];
    const t = byPath.get(p);
    const r = typeof t.value === "string" ? t.value.match(/^\{([^}]+)\}$/)?.[1] : null;
    return r ? val(r) : t.value;
  };
  const WHITE = "#FFFFFF";
  const GRAY_BG = val("primitive.gray.50");
  const DARK_BG = val("primitive.gray.900");
  for (const t of tokens.filter((x) => x.path[0] === "semantic" && x.path[1] === "text")) {
    const name = t.path.slice(1).join(".");
    if (name === "text.inverse" || name === "text.disabled") continue;
    const hex = val(t.path.join("."));
    const cw = contrast(hex, WHITE);
    if (cw < 4.5) errors.push(`[${label}] ${name} ${hex} 흰 배경 ${cw.toFixed(2)}:1 < 4.5`);
    else passes.push(`[${label}] ${name} ${hex} 흰 ${cw.toFixed(2)} · gray.50 ${contrast(hex, GRAY_BG).toFixed(2)}`);
  }
  const UI = [
    ["fill.accent vs 흰 배경", "semantic.fill.accent", WHITE, 3],
    ["fill.accent vs 흰 글자", "semantic.fill.accent", WHITE, 4.5],
    ["fill.accent-hover vs 흰 글자", "semantic.fill.accent-hover", WHITE, 4.5],
    ["fill.critical vs 흰 글자", "semantic.fill.critical", WHITE, 4.5],
    ["border.strong vs 흰 배경", "semantic.border.strong", WHITE, 3],
    ["border.focus vs 흰 배경", "semantic.border.focus", WHITE, 3],
    ["icon.tertiary vs 흰 배경", "semantic.icon.tertiary", WHITE, 3],
  ];
  for (const [l, p, bg, min] of UI) {
    const hex = val(p);
    const c = contrast(hex, bg);
    (c < min ? errors : passes).push(`[${label}] ${l} ${hex} ${c.toFixed(2)}:1 (기준 ${min})`);
  }
  for (const [k, v] of DARK) {
    if (!/^(text-(primary|secondary|tertiary|accent|critical|positive|caution|info)|border-(strong|focus)|icon-tertiary)$/.test(k)) continue;
    const [g, s] = [v.slice(0, v.lastIndexOf("-")), v.slice(v.lastIndexOf("-") + 1)];
    const hex = val(`primitive.${g}.${s}`);
    const min = k.startsWith("text-") ? 4.5 : 3;
    const c = contrast(hex, DARK_BG);
    (c < min ? errors : passes).push(`[${label}] 다크 ${k} ${hex} gray.900 ${c.toFixed(2)}:1 (기준 ${min})`);
  }
}
contrastSuite("기본", null);
for (const s of SKINS) {
  const miss = BRAND_STEPS.filter((k) => !s.brand[k]);
  if (miss.length) errors.push(`스킨 ${s.id}: brand 단계 ${miss.join("·")} 가 없습니다(정본 단계 ${BRAND_STEPS.join("·")} 를 모두 채우세요)`);
  else contrastSuite(`스킨 ${s.id}`, s.brand);
}

/* -------------------------------------------------------------------- 쓰기 */
const out = {
  "solideo-tokens.css": buildCss(),
  "solideo-tokens.scss": buildScss(),
  "solideo-tokens.less": buildLess(),
  "solideo-tokens.js": buildJs(),
  "solideo-tokens.cjs": buildCjs(),
  "solideo-tokens.d.ts": buildDts(),
  "solideo-tokens.properties": buildProperties(),
  "solideo-tokens.flat.json": buildFlatJson(),
  "quasar.variables.sass": buildQuasar(),
  "SolideoTokens.java": buildJava(),
  "solideo-shadcn.css": buildShadcnTheme(),
  "solideo-figma.tokens.json": buildFigma(),
  "solideo-dark.css": buildDark(),
  ...Object.fromEntries(SKINS.map((s) => [`skin-${s.id}.css`, buildSkin(s)])),
};

// 4 · 부품 CSS(solideo-components.css — 이 저장소에서는 guide-files 의 파일이 원본)가 정의 없는 토큰을 부르지 않는가
const defined = new Set([...out["solideo-tokens.css"].matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1]));
const compFile = join(OUT, "solideo-components.css");
if (existsSync(compFile)) {
  const body = readFileSync(compFile, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const undef = [...new Set([...body.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]).filter((n) => !defined.has(n)))];
  if (undef.length) errors.push(`solideo-components.css 가 정의 없는 토큰을 부릅니다: ${undef.join(", ")}`);
  else passes.push(`solideo-components.css var() 참조 전부 정의됨`);
}
// 다크·shadcn·스킨이 부르는 var 도 정의돼 있어야 한다
for (const f of ["solideo-dark.css", "solideo-shadcn.css", ...SKINS.map((s) => `skin-${s.id}.css`)]) {
  const own = new Set([...out[f].matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const undef = [...new Set([...out[f].matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]).filter((n) => !defined.has(n) && !own.has(n)))];
  if (undef.length) errors.push(`${f} 가 정의 없는 토큰을 부릅니다: ${undef.join(", ")}`);
}

if (errors.length) {
  for (const e of errors) console.log(`  FAIL  ${e}`);
  console.log(`\n실패 ${errors.length}건 — 파일을 쓰지 않았습니다. tokens.json·스킨을 고친 뒤 다시 돌리세요.`);
  process.exit(1);
}
console.log(`검증 통과 ${passes.length}건 (대비 기본·스킨 ${SKINS.map((s) => s.id).join("·") || "없음"} · 참조 · 부품 CSS)`);

mkdirSync(OUT, { recursive: true });
for (const [rel, content] of Object.entries(out)) {
  writeFileSync(join(OUT, rel), content, "utf8");
  console.log(`  ✓ guide-files/${rel.padEnd(28)} ${String(content.length).padStart(7)} bytes`);
}
console.log(`토큰 ${resolved.length}개 · alias ${ALIASES.length}개 · 스킨 ${SKINS.length}개 · v${src.$version}`);

// Tailwind v4 @theme · v3 프리셋 — 같은 정본(flat.json)에서
execFileSync(process.execPath, [join(ROOT, "scripts/build-tailwind-theme.mjs")], { stdio: "inherit" });

// powerGuide 토큰 정본(guide-files/solideo-tokens.flat.json) → Tailwind v4 @theme 산출물.
// 2026-10-12 MCP 시험: guide_tokens 에 Tailwind v4 형식이 없어 AI 가 v3 설정(tailwind.config.js)으로 옮겨 적었다.
// 손으로 적지 않는다 — 토큰이 바뀌면 이 스크립트를 다시 돌린다.
//   node scripts/build-tailwind-theme.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "apps/web/public/guide-files");
const src = JSON.parse(fs.readFileSync(path.join(dir, "solideo-tokens.flat.json"), "utf8"));
const tokens = src.tokens ?? {};

// 토큰 이름 접두 → Tailwind v4 테마 변수 이름공간(유틸리티 이름이 여기서 나온다)
const MAP = [
  [/^space-(.+)$/, "spacing"],
  [/^radius-(.+)$/, "radius"],
  [/^font-size-(.+)$/, "text"],
  [/^font-weight-(.+)$/, "font-weight"],
  [/^font-family-(.+)$/, "font"],
  [/^line-height-(.+)$/, "leading"],
  [/^letter-spacing-(.+)$/, "tracking"],
  [/^shadow-(.+)$/, "shadow"],
  [/^easing-(.+)$/, "ease"],
  [/^breakpoint-(.+)$/, "breakpoint"],
];

const groups = new Map();
const extra = []; // 이름공간이 없는 값(길이·지속 시간·부품 치수) — 그대로 사용자 속성으로
for (const [name, t] of Object.entries(tokens)) {
  const v = String(t.value);
  if (t.type === "color") { (groups.get("color") ?? groups.set("color", []).get("color")).push([`--color-${name}`, v]); continue; }
  const hit = MAP.find(([re]) => re.test(name));
  if (hit) {
    const key = name.replace(hit[0], "$1");
    if (hit[1] === "breakpoint" && v === "0px") continue; // 기본(모바일 우선)은 변수 없이
    (groups.get(hit[1]) ?? groups.set(hit[1], []).get(hit[1])).push([`--${hit[1]}-${key}`, v]);
  } else {
    extra.push([`--${name}`, v]);
  }
}

const LABEL = { color: "색", spacing: "간격(p-4 · gap-6 …)", radius: "모서리(rounded-md …)", text: "글자 크기(text-h1 …)", "font-weight": "굵기(font-bold …)", font: "글꼴(font-sans …)", leading: "줄 간격(leading-normal …)", tracking: "자간(tracking-tight)", shadow: "그림자(shadow-2 …)", ease: "움직임 곡선(ease-standard …)", breakpoint: "화면 폭 구간(tablet: · desktop: · wide:)" };
let out = `/* SOLIDEO powerGuide 토큰 → Tailwind CSS v4 @theme (자동 생성 — 손으로 고치지 마세요)\n * 원본: solideo-tokens.flat.json (버전 ${src.version ?? "-"}) · 생성기: scripts/build-tailwind-theme.mjs\n * 쓰는 법: @import "tailwindcss"; 다음 줄에 이 파일을 @import 하면 bg-blue-500 · text-h1 · rounded-md · shadow-2 같은 유틸리티가 생긴다.\n * 간격은 Tailwind 기본(--spacing 배수)을 덮지 않고 이름 붙은 값(p-4 = 16px 등 정본 값)만 더한다. */\n@theme {\n`;
for (const [g, rows] of groups) {
  out += `  /* ${LABEL[g] ?? g} */\n`;
  for (const [k, v] of rows) out += `  ${k}: ${v};\n`;
  out += "\n";
}
out = out.replace(/\n$/, "") + "}\n";
if (extra.length) {
  out += `\n/* 테마 이름공간이 없는 정본 값(레이아웃·지속 시간·부품 치수) — var(--layout-max) 처럼 쓴다 */\n:root {\n`;
  for (const [k, v] of extra) out += `  ${k}: ${v};\n`;
  out += "}\n";
}
const file = path.join(dir, "solideo-tailwind.theme.css");
fs.writeFileSync(file, out);
console.log(`쓴 파일 ${path.relative(root, file)} — 테마 ${[...groups.values()].reduce((a, r) => a + r.length, 0)}개, 그 밖 ${extra.length}개`);

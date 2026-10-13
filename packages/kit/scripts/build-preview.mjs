// 미리보기 빌드 — 서버 없이 더블클릭(file://)으로 열려야 한다.
// ES 모듈(type="module")은 file:// 에서 막히므로 일반 스크립트(iife) 하나로 묶는다.
//
// 만드는 파일 (packages/kit/dist/preview)
//   index.html · react.js   React 판
//   vue.html   · vue.js     Vue 판
//   preview.css             미리보기 틀
// CSS 는 한 단계 위(../kit.css)를 쓴다 — 다운로드 묶음 구조와 같다.
import fs from "node:fs";
import path from "node:path";
import * as esbuild from "esbuild";
import { vuePlugin } from "./vue-plugin.mjs";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "dist", "preview");
fs.mkdirSync(out, { recursive: true });

const common = {
  bundle: true,
  format: "iife",
  minify: true,
  target: "es2019",
  define: {
    "process.env.NODE_ENV": '"production"',
    __VUE_OPTIONS_API__: "false",
    __VUE_PROD_DEVTOOLS__: "false",
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
  },
  logLevel: "warning",
};

await esbuild.build({ ...common, entryPoints: [path.join(root, "preview", "react-app.tsx")], outfile: path.join(out, "react.js"), jsx: "automatic" });
await esbuild.build({ ...common, entryPoints: [path.join(root, "preview", "vue-demo.ts")], outfile: path.join(out, "vue.js"), plugins: [vuePlugin], alias: { vue: "vue/dist/vue.runtime.esm-bundler.js" } });

fs.copyFileSync(path.join(root, "preview", "preview.css"), path.join(out, "preview.css"));
// 예시 사진(powerAssets 샘플) — 데모가 img/ 상대 경로로 읽는다
fs.mkdirSync(path.join(out, "img"), { recursive: true });
for (const f of fs.readdirSync(path.join(root, "preview", "img"))) fs.copyFileSync(path.join(root, "preview", "img", f), path.join(out, "img", f));

// 미리보기 페이지는 ../kit.css · ../theme.css 를 읽는다(다운로드 묶음 구조).
// dist/preview 를 바로 열 때도 같은 구조가 되게 dist/ 에 kit.css·icons·fonts·theme.css 를 둔다.
// (이게 없으면 부품 CSS 없이 렌더되어 버튼 높이 등이 전부 틀어진다)
const dist = path.join(root, "dist");
const cssDir = path.join(dist, "css");
if (fs.existsSync(path.join(cssDir, "kit.css"))) {
  fs.copyFileSync(path.join(cssDir, "kit.css"), path.join(dist, "kit.css"));
  for (const sub of ["icons", "fonts"]) {
    fs.mkdirSync(path.join(dist, sub), { recursive: true });
    for (const f of fs.readdirSync(path.join(cssDir, sub))) fs.copyFileSync(path.join(cssDir, sub, f), path.join(dist, sub, f));
  }
  if (!fs.existsSync(path.join(dist, "theme.css"))) fs.writeFileSync(path.join(dist, "theme.css"), "/* KRDS 기본 */\n");
} else {
  console.log("⚠ dist/css/kit.css 없음 — build-css.mjs 를 먼저 실행하세요");
}

// 파일 이름이 늘 같아 브라우저가 옛 판을 붙잡는다 → 빌드 시각을 주소 뒤에 붙인다(2026-10-08)
const V = Date.now().toString(36);
const page = (title, script) => `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="../kit.css?v=${V}">
<link rel="stylesheet" href="../theme.css?v=${V}">
<link rel="stylesheet" href="preview.css?v=${V}">
</head>
<body>
<div class="hb-kit" id="app"></div>
<script src="${script}?v=${V}"></script>
</body>
</html>
`;
fs.writeFileSync(path.join(out, "index.html"), page("powerGuide 키트 미리보기 — React", "react.js"));
fs.writeFileSync(path.join(out, "vue.html"), page("powerGuide 키트 미리보기 — Vue", "vue.js"));

const size = (f) => `${Math.round(fs.statSync(path.join(out, f)).size / 1024)}KB`;
console.log(`미리보기 react.js ${size("react.js")} · vue.js ${size("vue.js")}`);

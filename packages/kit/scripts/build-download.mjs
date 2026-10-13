// 다운로드 묶음 만들기
//   node scripts/build-download.mjs [이름] [스킨.json]
//
// 결과: packages/kit/dist/download/powerguide-kit-<이름>/  (+ 같은 이름 .zip)
//   README.md · kit.css · theme.css · icons/ · fonts/ · react/ · vue/ · preview/
// preview/index.html 을 더블클릭하면 서버 없이 열린다.
//
// 스킨.json = { "label": "...", "vars": { "--krds-color-light-primary-50": "#A50082", ... } }
// 레퍼런스 사이트 토큰을 이 모양으로 넘기면 theme.css 가 그 사이트 색·글꼴로 바뀐다(6단계).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const name = process.argv[2] || "krds";
const skinFile = process.argv[3];
const skin = skinFile ? JSON.parse(fs.readFileSync(skinFile, "utf8")) : { label: "KRDS 기본", vars: {} };

const dist = path.join(root, "dist");
const dir = path.join(dist, "download", `powerguide-kit-${name}`);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

const copyDir = (from, to, filter = () => true) => {
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, f.name);
    const b = path.join(to, f.name);
    if (f.isDirectory()) copyDir(a, b, filter);
    else if (filter(f.name)) fs.copyFileSync(a, b);
  }
};

// CSS·아이콘·글꼴
fs.copyFileSync(path.join(dist, "css", "kit.css"), path.join(dir, "kit.css"));
copyDir(path.join(dist, "css", "icons"), path.join(dir, "icons"));
copyDir(path.join(dist, "css", "fonts"), path.join(dir, "fonts"));

// 스킨
// :root 와 .hb-kit 둘 다 적는다 — 파생 토큰(모서리·버튼색 등)은 .hb-kit 에서 다시 계산되므로 거기서도 덮어야 한다
const theme = `/* ${skin.label} — 이 파일만 바꾸면 부품 색·글꼴·모서리가 바뀝니다 */\n:root, .hb-kit{\n${Object.entries(skin.vars)
  .map(([k, v]) => `  ${k}: ${v};`)
  .join("\n")}\n}\n`;
fs.writeFileSync(path.join(dir, "theme.css"), theme);

// 부품 소스
copyDir(path.join(root, "react"), path.join(dir, "react"), (f) => /\.(tsx?|md)$/.test(f));
copyDir(path.join(root, "vue"), path.join(dir, "vue"), (f) => /\.(vue|ts|md)$/.test(f));

// 미리보기
copyDir(path.join(dist, "preview"), path.join(dir, "preview"));

fs.writeFileSync(
  path.join(dir, "README.md"),
  `# 홈박스 컴포넌트 키트 — ${skin.label}

## 바로 보기
\`preview/index.html\` 을 더블클릭하세요. 서버가 필요 없습니다.
Vue 판은 \`preview/vue.html\` 입니다. 두 판은 같은 모양입니다.

## 프로젝트에 넣기
1. \`kit.css\`, \`theme.css\`, \`icons/\`, \`fonts/\` 를 같은 폴더에 둡니다.
2. 페이지에서 두 CSS 를 불러옵니다(순서: kit.css → theme.css).
3. 부품을 감싸는 요소에 \`class="hb-kit"\` 을 붙입니다(초기화 스타일이 이 안에서만 적용됩니다).
4. React 는 \`react/\`, Vue 는 \`vue/\` 폴더를 복사해 씁니다.

### React
\`\`\`tsx
import { Button, Tabs, TabsList, TabsTrigger, TabsContent } from "./react";
<Button variant="primary">신청하기</Button>
\`\`\`
필요 패키지: \`react\` 19, \`radix-ui\`(Button 의 asChild 용)

### Vue
\`\`\`vue
<script setup>
import { Button } from "./vue";
</script>
<template><Button variant="primary">신청하기</Button></template>
\`\`\`
필요 패키지: \`vue\` 3.5

## 색·글꼴 바꾸기
\`theme.css\` 의 변수만 고치면 됩니다. 주색은 \`--krds-color-light-primary-5\` ~ \`95\` 단계입니다.

## 출처
본 저작물은 행정안전부에서 2024년 작성하여 공공누리 제1유형으로 개방한 ‘범정부 UI/UX 디자인시스템(KRDS)’을 이용하였으며,
해당 저작물은 ‘KRDS 디자인시스템 홈페이지(https://www.krds.go.kr)’에서 무료로 다운받으실 수 있습니다.
글꼴: Pretendard GOV (SIL Open Font License).
`,
);

// zip (Windows 내장 tar 는 zip 을 만들 수 있다)
const zip = `${dir}.zip`;
fs.rmSync(zip, { force: true });
try {
  // Windows 는 내장 bsdtar(-a 로 zip) — Git Bash 의 GNU tar 는 zip 을 못 만든다
  const tar = process.platform === "win32" ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe") : "tar";
  execFileSync(tar,["-a", "-c", "-f", zip, "-C", path.dirname(dir), path.basename(dir)], { stdio: "ignore" });
  console.log(`묶음 ${path.relative(root, dir)} · zip ${Math.round(fs.statSync(zip).size / 1024)}KB`);
} catch {
  console.log(`묶음 ${path.relative(root, dir)} (zip 생략)`);
}

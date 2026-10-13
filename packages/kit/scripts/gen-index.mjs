// 내보내기 목록·미리보기 목록 자동 생성
//   react/index.ts          react/*.tsx 전부 `export *`
//   vue/index.ts            vue/*.vue 전부 `export { default as 파일명 }`
//   preview/demos/registry.ts         미리보기 메타(React 데모 파일의 `export const meta`)
//   preview/demos/react/index.ts      React 데모 목록
//   preview/demos/vue/index.ts        Vue 데모 목록 (id 는 React 데모와 같은 파일 이름)
//
// 부품·데모를 추가할 때 index 를 손으로 고치지 않는다 — 여러 사람이 동시에 추가해도 겹치지 않게.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const ls = (d, ext) =>
  fs
    .readdirSync(path.join(root, d))
    .filter((f) => f.endsWith(ext))
    .sort();
const write = (f, s) => fs.writeFileSync(path.join(root, f), s);
const head = "// 자동 생성 — scripts/gen-index.mjs. 손으로 고치지 않는다.\n";

// React 부품
const reactFiles = ls("react", ".tsx").map((f) => f.replace(/\.tsx$/, ""));
write("react/index.ts", head + reactFiles.map((f) => `export * from "./${f}";`).join("\n") + `\nexport { cx } from "./utils";\n`);

// Vue 부품
const vueFiles = ls("vue", ".vue").map((f) => f.replace(/\.vue$/, ""));
// 부품이 아닌 공개 함수(.ts)도 내보낸다 — 내부 도우미(날짜 계산·드롭다운 처리 등)는 뺀다
const VUE_TS_PUBLIC = ["toast"];
write(
  "vue/index.ts",
  head +
    vueFiles.map((f) => `export { default as ${f} } from "./${f}.vue";`).join("\n") +
    "\n" +
    VUE_TS_PUBLIC.filter((f) => fs.existsSync(path.join(root, "vue", `${f}.ts`)))
      .map((f) => `export * from "./${f}";`)
      .join("\n") +
    "\n",
);

// 데모 메타 — `export const meta = { ... };` 를 읽는다
const metas = [];
for (const f of ls("preview/demos/react", ".tsx")) {
  const src = fs.readFileSync(path.join(root, "preview/demos/react", f), "utf8");
  const m = src.match(/export const meta\s*=\s*(\{[\s\S]*?\});/);
  if (!m) throw new Error(`meta 없음: preview/demos/react/${f}`);
  const meta = Function(`return (${m[1]})`)();
  const id = f.replace(/\.tsx$/, "");
  if (meta.id !== id) throw new Error(`meta.id(${meta.id}) 와 파일 이름(${id}) 이 다름`);
  metas.push(meta);
}
const vueDemos = ls("preview/demos/vue", ".vue").map((f) => f.replace(/\.vue$/, ""));
const missing = metas.filter((m) => !vueDemos.includes(m.id)).map((m) => m.id);
const extra = vueDemos.filter((v) => !metas.some((m) => m.id === v));

const GROUPS = [
  ["gov", "정부 서비스 공통"],
  ["action", "버튼·표시"],
  ["form", "입력"],
  ["nav", "탐색"],
  ["overlay", "레이어"],
  ["data", "데이터"],
  ["layout", "구조"],
];
write(
  "preview/demos/registry.ts",
  head +
    `export interface DemoMeta { id: string; title: string; group: string; source: "krds" | "shadcn" | "both"; note?: string }\n` +
    `export const GROUPS: Array<[string, string]> = ${JSON.stringify(GROUPS)};\n` +
    `export const METAS: DemoMeta[] = ${JSON.stringify(metas, null, 1)};\n`,
);
const safe = (id) => "d_" + id.replace(/\W/g, "_");
write(
  "preview/demos/react/index.ts",
  head +
    metas.map((m) => `import ${safe(m.id)} from "./${m.id}";`).join("\n") +
    `\nimport type * as React from "react";\nexport const REACT_DEMOS: Record<string, React.ComponentType> = { ${metas.map((m) => `"${m.id}": ${safe(m.id)}`).join(", ")} };\n`,
);
write(
  "preview/demos/vue/index.ts",
  head +
    vueDemos.map((v) => `import ${safe(v)} from "./${v}.vue";`).join("\n") +
    `\nimport type { Component } from "vue";\nexport const VUE_DEMOS: Record<string, Component> = { ${vueDemos.map((v) => `"${v}": ${safe(v)}`).join(", ")} };\n`,
);

console.log(`React 부품 파일 ${reactFiles.length} · Vue 부품 ${vueFiles.length} · 데모 ${metas.length}`);
if (missing.length) console.log(`⚠ Vue 데모 없음: ${missing.join(", ")}`);
if (extra.length) console.log(`⚠ React 데모 없는 Vue 데모: ${extra.join(", ")}`);

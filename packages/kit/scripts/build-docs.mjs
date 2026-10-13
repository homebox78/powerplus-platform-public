// 부품별 문서 재료 — powerGuide /guide/components/:id 화면이 읽는다(shadcn 문서 형식: 미리보기 · 설치 · 사용법 · 예시).
//   node scripts/build-docs.mjs <출력 폴더>   (publish-web.mjs 가 부른다)
//  docs/<id>.json = 설명 · 사용 예 · 예시 코드(React·Vue) · 붙여 넣을 파일 전부 · npm 의존성
//  r/<id>.json    = shadcn 레지스트리 항목 → `npx shadcn@latest add https://…/kit-files/r/<id>.json`
//  예시 코드의 import 는 미리보기용 상대 경로(../../../react)를 사용자 프로젝트 경로(@/components/kit/…)로 바꾼다.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.resolve(process.argv[2] ?? path.join(root, "dist/docs-out"));
const read = (p) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

const reg = read("preview/demos/registry.ts");
const metas = JSON.parse(reg.match(/METAS[^=]*=\s*(\[.*?\]);\s*$/ms)[1]);
const groups = JSON.parse(reg.match(/GROUPS[^=]*=\s*(\[.*?\]);/s)[1]);

// React — 내보낸 이름 → 파일(react/index.ts 의 export * 를 따라 각 파일의 export 를 모은다)
const reactFileOf = {};
for (const line of read("react/index.ts").split("\n")) {
  const m = line.match(/export \* from "\.\/(.+?)"/);
  if (!m) continue;
  const src = read(`react/${m[1]}.tsx`);
  for (const e of src.matchAll(/export (?:function|const|class|type|interface)\s+(\w+)/g)) reactFileOf[e[1]] ??= m[1];
  for (const e of src.matchAll(/export (?:type )?\{([^}]+)\}/g)) for (const n of e[1].split(",")) { const x = n.trim().split(/\s+as\s+/).pop(); if (x && !x.startsWith("type ")) reactFileOf[x] ??= m[1]; }
}
// Vue — 이름 → 파일(vue/index.ts 의 export { default as X } from "./X.vue")
const vueFileOf = {};
for (const line of read("vue/index.ts").split("\n")) {
  const m = line.match(/export \{ default as (\w+) \} from "\.\/(.+?)"/);
  if (m) vueFileOf[m[1]] = m[2];
}

// 상대 import 를 따라 붙여 넣어야 할 파일을 모은다
function closure(dir, start, exts) {
  const seen = new Set();
  const walk = (rel) => {
    if (seen.has(rel)) return;
    seen.add(rel);
    const src = read(`${dir}/${rel}`);
    for (const m of src.matchAll(/from "\.\/([^"]+)"/g)) {
      const base = path.posix.join(path.posix.dirname(rel), m[1]);
      const hit = [base, ...exts.map((e) => base + e)].find((p) => fs.existsSync(path.join(root, dir, p)) && fs.statSync(path.join(root, dir, p)).isFile());
      if (hit) walk(hit);
    }
  };
  start.forEach(walk);
  return [...seen];
}
const npmDeps = (srcs) => {
  const s = new Set();
  for (const src of srcs) for (const m of src.matchAll(/from "([^".][^"]*)"/g)) { const n = m[1].startsWith("@") ? m[1].split("/").slice(0, 2).join("/") : m[1].split("/")[0]; if (!["react", "vue"].includes(n)) s.add(n); }
  return [...s].sort();
};

// 부품 파일 머리 주석 → 설명 줄 + 사용 예(들여쓴 줄)
function header(src) {
  const lines = [];
  for (const l of src.split("\n")) {
    if (l.startsWith('"use client"')) continue;
    if (!l.startsWith("//")) break;
    lines.push(l.replace(/^\/\/ ?/, ""));
  }
  const usage = lines.filter((l) => /^ {2}\S/.test(l) || /^ {4}/.test(l)).map((l) => l.replace(/^ {2}/, "")).join("\n").trim();
  const notes = lines.filter((l) => !/^ {2}/.test(l)).join("\n").split(/\n\s*\n/).map((p) => p.replace(/\n/g, " ").trim()).filter(Boolean);
  return { title: notes.shift() ?? "", notes, usage };
}

// 데모 import 를 사용자 경로로 — React 는 파일별 named import, Vue 는 파일별 default import
// `export const meta = { … };` 를 여러 줄 객체째 지운다(2026-10-12 MCP 시험: 첫 줄만 지워져 나머지 객체가 남아 문법이 깨졌다).
// 문자열 안의 중괄호는 세지 않는다.
function stripMeta(src) {
  const start = src.search(/^export const meta\s*=\s*\{/m);
  if (start < 0) return src;
  let i = src.indexOf("{", start), depth = 0, q = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === "\\") i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === "`") { q = c; continue; }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) break;
  }
  let end = i + 1;
  if (src[end] === ";") end++;
  while (src[end] === "\n") end++;
  return src.slice(0, start) + src.slice(end);
}
function rewriteReact(src) {
  return stripMeta(src)
    .replace(/import \{([^}]+)\} from "\.\.\/\.\.\/\.\.\/react";/s, (_, names) => {
      const by = {};
      for (const n of names.split(",").map((s) => s.trim()).filter(Boolean)) { const bare = n.replace(/^type\s+/, ""); (by[reactFileOf[bare] ?? "index"] ??= []).push(n); }
      return Object.entries(by).map(([f, ns]) => `import { ${ns.join(", ")} } from "@/components/kit/${f}";`).join("\n");
    });
}
function vueNames(src) {
  const m = src.match(/import \{([^}]+)\} from "\.\.\/\.\.\/\.\.\/vue";/s);
  return m ? m[1].split(",").map((s) => s.trim()).filter((n) => n && !n.startsWith("type ")) : [];
}
function rewriteVue(src) {
  return src
    .replace(/import \{([^}]+)\} from "\.\.\/\.\.\/\.\.\/vue";/s, (_, names) => names.split(",").map((s) => s.trim()).filter(Boolean).map((n) => n.startsWith("type ") ? `import type { ${n.slice(5)} } from "@/components/kit";` : `import ${n} from "@/components/kit/${vueFileOf[n] ?? n + ".vue"}";`).join("\n"))
    .replace(/from "\.\.\/\.\.\/\.\.\/vue\/(\w+)"/g, 'from "@/components/kit/$1"');
}

fs.mkdirSync(path.join(out, "docs"), { recursive: true });
fs.mkdirSync(path.join(out, "r"), { recursive: true });
const groupLabel = Object.fromEntries(groups);
let n = 0;
for (const meta of metas) {
  const id = meta.id;
  const rsrc = read(`react/${id}.tsx`);
  const h = header(rsrc);
  const rFiles = closure("react", [`${id}.tsx`], [".tsx", ".ts"]);
  // 예시가 쓰는 다른 키트 부품(dialog 예시 → button 등) — 그 파일도 함께 실어야 예시를 그대로 붙여 돌릴 수 있다.
  const rDemoSrc = read(`preview/demos/react/${id}.tsx`);
  const demoNames = (rDemoSrc.match(/import \{([^}]+)\} from "\.\.\/\.\.\/\.\.\/react";/s)?.[1] ?? "").split(",").map((s) => s.trim().replace(/^type\s+/, "")).filter(Boolean);
  const demoStart = [...new Set(demoNames.map((x) => reactFileOf[x]).filter(Boolean).map((f) => `${f}.tsx`))].filter((f) => fs.existsSync(path.join(root, "react", f)));
  const rDemoFiles = closure("react", demoStart, [".tsx", ".ts"]).filter((f) => !rFiles.includes(f));
  const metaIds = new Set(metas.map((m) => m.id));
  const demoNeeds = [...new Set(rDemoFiles.map((f) => f.replace(/\.tsx?$/, "")).filter((x) => metaIds.has(x) && x !== id))];
  const vDemo = read(`preview/demos/vue/${id}.vue`);
  const vStart = vueNames(vDemo).map((x) => vueFileOf[x]).filter(Boolean);
  if (/\.\.\/\.\.\/\.\.\/vue\/toast/.test(vDemo)) vStart.push("toast.ts");
  const vFiles = closure("vue", vStart, [".ts", ".vue"]);
  const rContents = rFiles.map((f) => ({ path: f, code: read(`react/${f}`) }));
  const vContents = vFiles.map((f) => ({ path: f, code: read(`vue/${f}`) }));
  const doc = {
    id, title: meta.title, group: meta.group, groupLabel: groupLabel[meta.group] ?? meta.group, source: meta.source, note: meta.note ?? "",
    summary: h.title, notes: h.notes, usage: h.usage,
    react: {
      demo: rewriteReact(rDemoSrc), files: rContents, deps: npmDeps([...rContents, ...rDemoFiles.map((f) => ({ code: read(`react/${f}`) }))].map((f) => f.code)),
      demoNeeds, demoFiles: rDemoFiles.map((f) => ({ path: f, code: read(`react/${f}`) })),
    },
    vue: { demo: rewriteVue(vDemo), files: vContents, deps: npmDeps(vContents.map((f) => f.code)) },
  };
  fs.writeFileSync(path.join(out, "docs", `${id}.json`), JSON.stringify(doc));
  // shadcn 레지스트리 항목(React) — 파일을 components/kit/ 아래에 둔다
  fs.writeFileSync(path.join(out, "r", `${id}.json`), JSON.stringify({
    $schema: "https://ui.shadcn.com/schema/registry-item.json",
    name: id, type: "registry:ui", title: meta.title, description: meta.note ?? h.title,
    dependencies: doc.react.deps,
    files: rContents.map((f) => ({ path: `kit/${f.path}`, type: f.path === `${id}.tsx` ? "registry:ui" : "registry:lib", target: `components/kit/${f.path}`, content: f.code })),
  }, null, 1));
  n++;
}
console.log(`부품 문서 ${n}개 → ${out}`);

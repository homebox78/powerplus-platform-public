// SSR 점검 — React 데모 77개를 Node 에서 renderToString (Next.js 서버 렌더와 같은 조건: window 없음)
//   node scripts/check-ssr.mjs
import path from "node:path";
import fs from "node:fs";
import { build } from "esbuild";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "dist", "ssr-check.mjs");
await build({
  stdin: {
    contents: `import * as React from "react"; import { renderToString } from "react-dom/server"; import { REACT_DEMOS } from "./preview/demos/react/index.ts";
export function run() { const bad = []; for (const [id, D] of Object.entries(REACT_DEMOS)) { try { const html = renderToString(React.createElement(D)); if (!html) bad.push([id, "빈 결과"]); } catch (e) { bad.push([id, String(e && e.message || e).slice(0, 160)]); } } return { n: Object.keys(REACT_DEMOS).length, bad }; }`,
    resolveDir: root, loader: "tsx",
  },
  bundle: true, platform: "node", format: "esm", outfile: out, jsx: "automatic", logLevel: "error",
  external: ["react", "react-dom", "radix-ui", "react-dom/server"],
});
const { run } = await import("file://" + out.split(path.sep).join("/"));
const { n, bad } = run();
fs.rmSync(out, { force: true });
console.log(`SSR ${n - bad.length}/${n} 통과`);
for (const [id, m] of bad) console.log(`  ✗ ${id}: ${m}`);
process.exit(bad.length ? 1 : 0);

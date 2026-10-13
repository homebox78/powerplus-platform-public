// SSR 점검 — Vue 데모를 Node 에서 renderToString (Nuxt 서버 렌더와 같은 조건: window 없음)
//   node scripts/check-ssr-vue.mjs
import path from "node:path";
import fs from "node:fs";
import { build } from "esbuild";
import { vuePlugin } from "./vue-plugin.mjs";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "dist", "ssr-check-vue.mjs");
await build({
  stdin: {
    contents: `import { createSSRApp, h } from "vue"; import { renderToString } from "vue/server-renderer"; import { VUE_DEMOS } from "./preview/demos/vue/index.ts";
export async function run() { const bad = []; for (const [id, D] of Object.entries(VUE_DEMOS)) { try { const app = createSSRApp({ render: () => h(D) }); app.config.warnHandler = (m) => { if (!/hydration/i.test(m)) bad.push([id, "경고 " + m.slice(0, 120)]); }; const html = await renderToString(app); if (!html) bad.push([id, "빈 결과"]); } catch (e) { bad.push([id, String(e && e.message || e).slice(0, 160)]); } } return { n: Object.keys(VUE_DEMOS).length, bad }; }`,
    resolveDir: root, loader: "ts",
  },
  bundle: true, platform: "node", format: "esm", outfile: out, logLevel: "error",
  external: ["vue", "vue/server-renderer", "reka-ui"], plugins: [vuePlugin],
});
const { run } = await import("file://" + out.split(path.sep).join("/"));
const { n, bad } = await run();
fs.rmSync(out, { force: true });
console.log(`Vue SSR ${n - new Set(bad.map((b) => b[0])).size}/${n} 통과`);
for (const [id, m] of bad) console.log(`  ✗ ${id}: ${m}`);
process.exit(bad.length ? 1 : 0);

// 미리보기 렌더 검사 — dist/preview 를 file:// 로 열어 데모 구역마다 확인하고 스크린샷을 남긴다.
//   node scripts/check-demos.mjs [id,id,...]      (생략하면 전부)
// 결과: dist/shots/<react|vue>-<id>.png + 콘솔 요약(오류·빈 구역·높이)
// 먼저 `node scripts/gen-index.mjs && node scripts/build-css.mjs && node scripts/build-preview.mjs` 로 빌드해 둘 것.
// Playwright 는 apps/worker 에 설치된 것을 빌려 쓴다(이 PC 는 Firefox).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(path.join(root, "../../apps/worker/package.json"));
const { firefox } = require("playwright");

const only = process.argv[2] ? process.argv[2].split(",") : null;
const shots = path.join(root, "dist", "shots");
fs.mkdirSync(shots, { recursive: true });

const browser = await firefox.launch();
const report = [];
for (const [fw, file] of [["react", "index.html"], ["vue", "vue.html"]]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(pathToFileURL(path.join(root, "dist", "preview", file)).href);
  await page.waitForSelector(".pv-sec");
  const ids = await page.$$eval(".pv-sec", (els) => els.map((e) => e.id));
  for (const id of ids) {
    if (only && !only.includes(id)) continue;
    const sec = page.locator(`#${id}`);
    const box = await sec.boundingBox();
    const demo = await page.$eval(`#${id} .pv-demo`, (d) => ({ h: Math.round(d.getBoundingClientRect().height), text: d.textContent.trim().length }));
    await sec.screenshot({ path: path.join(shots, `${fw}-${id}.png`) });
    report.push({ fw, id, h: demo.h, text: demo.text, empty: demo.h < 8 || !box });
  }
  report.push({ fw, errors });
  await page.close();
}
await browser.close();

for (const r of report) {
  if (r.errors) console.log(`[${r.fw}] 오류 ${r.errors.length}건${r.errors.length ? "\n  " + r.errors.slice(0, 10).join("\n  ") : ""}`);
  else console.log(`[${r.fw}] ${r.id} 높이 ${r.h} 글자 ${r.text}${r.empty ? "  ⚠ 비어 있음" : ""}`);
}
console.log(`스크린샷: ${path.relative(root, shots)}`);

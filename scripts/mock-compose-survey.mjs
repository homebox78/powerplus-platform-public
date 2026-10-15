// 게시 시안 전체에 구성 검사(compose)만 읽기 전용으로 돌려 걸리는 시안·항목을 센다 — 점수·보관본은 건드리지 않는다(MC-76 일괄 수정 대상 고르기).
// 사용: node scripts/mock-compose-survey.mjs <published.tsv> <out.jsonl> [시작 줄] [개수]
//   published.tsv = token	id	page	score (운영 DB 에서 passed=1·published 시안을 뽑아 만든다 — docs/MCP-개선-체크리스트.md MC-92)
import { createRequire } from "node:module";
import { readFileSync, appendFileSync } from "node:fs";
const req = createRequire(new URL("../packages/mcp/package.json", import.meta.url));
const { firefox } = req("playwright-core");
const sharp = req("sharp");
const { composeChecks } = await import(new URL("../packages/mcp/src/qa/compose.mjs", import.meta.url).href);
const [, , tsv, out, from = "0", n = "9999"] = process.argv;
const rows = readFileSync(tsv, "utf8").trim().split("\n").map((l) => l.split("\t")).slice(+from, +from + +n);
const b = await firefox.launch();
let i = 0;
for (const [token, id, page, score] of rows) {
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const t0 = Date.now();
  try {
    await p.goto(`https://powerplus.hom2box.com/api/v1/p/${token}`, { waitUntil: "load", timeout: 60000 });
    await p.waitForTimeout(1000);
    const { fails } = await composeChecks(p, { sharp });
    appendFileSync(out, JSON.stringify({ token, id: +id, page, score: +score, fails, ms: Date.now() - t0 }) + "\n");
  } catch (e) { appendFileSync(out, JSON.stringify({ token, id: +id, page, score: +score, error: String(e).slice(0, 200) }) + "\n"); }
  await p.close();
  if (++i % 10 === 0) console.log(`${i}/${rows.length}`);
}
await b.close();
console.log("끝", rows.length);

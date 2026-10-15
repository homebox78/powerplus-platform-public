// 게시 시안 전체에 구성 검사(compose)만 읽기 전용으로 돌려 걸리는 시안·항목을 센다 — 점수·보관본은 건드리지 않는다(MC-76 일괄 수정 대상 고르기).
// 사용: node scripts/mock-compose-survey.mjs <published.tsv> <out.jsonl> [시작 줄] [개수]
//   published.tsv = token	id	page	score (운영 DB 에서 passed=1·published 시안을 뽑아 만든다 — docs/MCP-개선-체크리스트.md MC-92)
//   운영 판정과 같은 결과가 필요하면 **서버에서** PP_QA_SERVER=1 로 돈다 — 운영 판정은 서버 Chromium·서버 글꼴이라 로컬 firefox 와 줄 나눔이 달라
//   꼬리 한 줄이 서버에서만 걸렸다(R45). 서버: 이 파일을 ~/kfe 에 올리고 PP_QA_SERVER=1 node mock-compose-survey.mjs …(powerMCP 설치본의 compose·playwright 를 쓴다)
import { createRequire } from "node:module";
import { readFileSync, appendFileSync } from "node:fs";
const SRV = process.env.PP_QA_SERVER === "1";
const MCP = SRV ? "/var/www/platform-mcp/current/packages/mcp/" : new URL("../packages/mcp/", import.meta.url).href;
const req = createRequire(SRV ? MCP + "package.json" : new URL("package.json", MCP));
const pw = req("playwright-core");
const sharp = req("sharp");
const { composeChecks } = await import(SRV ? MCP + "src/qa/compose.mjs" : new URL("src/qa/compose.mjs", MCP).href);
const firefox = SRV ? pw.chromium : pw.firefox;
const [, , tsv, out, from = "0", n = "9999"] = process.argv;
const rows = readFileSync(tsv, "utf8").trim().split("\n").map((l) => l.split("\t")).slice(+from, +from + +n);
// 서버는 판정과 같은 실행 인자(packages/mcp/src/index.ts 판정 launch)
const b = await firefox.launch(SRV ? { args: ["--no-sandbox", "--disable-dev-shm-usage"] } : {});
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

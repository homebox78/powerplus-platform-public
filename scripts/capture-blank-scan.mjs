// 레퍼런스 캡처 깨짐 자동 검출 — 지연 로딩 빈 칸·팝업에 가려 빈 화면(2026-10-15: 14081·51911·52105 를 사람이 찾았다)
// 서버에서: node scripts/capture-blank-scan.mjs [--ids 1,2,3] [--apply]
//   대상 = pp_mockref published main 화면. 캡처를 가로 192px 로 줄여 줄마다 '빈 줄'(거의 한 색) 인지 보고
//   ① 머리(위 100px)·바닥(아래 12%) 밖에서 이어진 빈 줄 600px 이상 ② 빈 줄 합이 본문의 35% 이상 → 깨짐 후보
//   --apply 면 후보를 status='review' 로(되돌리기: UPDATE screens SET status='published' WHERE id IN (...)).
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire("/var/www/platform-mcp/current/packages/mcp/package.json");
const sharp = require("sharp");
const args = process.argv.slice(2); const apply = args.includes("--apply");
const ids = (args[args.indexOf("--ids") + 1] || "").split(",").filter((x) => /^\d+$/.test(x));
const q = (sql) => execFileSync("sudo", ["mysql", "pp_mockref", "-N", "-B", "-e", sql]).toString().trim().split("\n").filter(Boolean).map((l) => l.split("\t"));
const rows = q(`SELECT sc.id, a.\`key\` FROM screens sc JOIN assets a ON a.id = sc.public_asset_id WHERE ${ids.length ? `sc.id IN (${ids.join(",")})` : "sc.status='published' AND sc.page_type_id='main' AND sc.device='pc'"}`);
const bad = [];
for (const [id, key] of rows) {
  try {
    const img = sharp(`/var/www/platform_data/mockref/homebox-public/${key}`); const m = await img.metadata(); const W = 192, H = Math.round((m.height * W) / m.width), k = m.height / H;
    const { data } = await img.resize(W, H, { fit: "fill" }).greyscale().raw().toBuffer({ resolveWithObject: true });
    const blank = new Uint8Array(H), rblank = new Uint8Array(H); const xr = Math.round(W * 0.4);
    for (let y = 0; y < H; y++) { let s = 0, s2 = 0; for (let x = 0; x < W; x++) { const v = data[y * W + x]; s += v; s2 += v * v; } const mean = s / W, sd = Math.sqrt(Math.max(0, s2 / W - mean * mean)); blank[y] = sd < 3 ? 1 : 0; let r1 = 0, r2 = 0; for (let x = xr; x < W; x++) { const v = data[y * W + x]; r1 += v; r2 += v * v; } const n = W - xr, rm = r1 / n; rblank[y] = Math.sqrt(Math.max(0, r2 / n - rm * rm)) < 3 ? 1 : 0; }
    const y0 = Math.ceil(100 / k), y1 = Math.floor(H * 0.88); let run = 0, best = 0, sum = 0, rsum = 0;
    for (let y = y0; y < y1; y++) { if (blank[y]) { run++; sum++; if (run > best) best = run; } else run = 0; if (rblank[y]) rsum++; }
    const runPx = Math.round(best * k), share = sum / Math.max(1, y1 - y0), rshare = rsum / Math.max(1, y1 - y0); /* 오른쪽 60% 가 빈 줄 비율 — 팝업에 가려 왼쪽만 찍힌 캡처(14081) */
    const sure = runPx >= 1200 || rshare >= 0.5; if (sure || runPx >= 600 || share >= 0.4) bad.push({ id: +id, sure, runPx, share: Math.round(share * 100), right: Math.round(rshare * 100), key });
  } catch (e) { /* 파일 없음은 건너뜀 */ }
}
console.log(JSON.stringify({ scanned: rows.length, bad }, null, 1));
const sure = bad.filter((b) => b.sure); /* 확실한 것만 자동으로 — 애매한 것(옅은 큰 띠 디자인일 수 있음)은 목록만 */
if (apply && sure.length) { q(`UPDATE screens SET status='review' WHERE status='published' AND id IN (${sure.map((b) => b.id).join(",")})`); console.log(`review 로: ${sure.length}건 (${sure.map((b) => b.id).join(",")})`); }
console.log(`확실 ${sure.length} · 애매 ${bad.length - sure.length}: ${bad.filter((b) => !b.sure).map((b) => b.id).join(",")}`);

// 지각 해시(dHash 16x16 + 평균해시 8x8) 계산 — 파워플러스 썸네일 ↔ 홈박스 샘플 중복 대조용.
// 왜 sha256 이 아닌가: 홈박스 샘플(webp)을 파워플러스에 넣을 때 JPG·PNG 로 변환했으므로 바이트가 다르다.
//   node db/migrate-legacy/phash.mjs <폴더...> --out=파일.json   (경로가 다른 두 묶음을 각각 돌린다)
// 결과: { "<상대경로>": { d: "<64hex>", a: "<16hex>", w, h } }
import sharp from "sharp";
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, extname } from "node:path";

const args = process.argv.slice(2);
const out = args.find((a) => a.startsWith("--out="))?.slice(6) ?? "phash.json";
const dirs = args.filter((a) => !a.startsWith("--"));
const EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
function walk(d, acc = []) { for (const f of readdirSync(d)) { const p = join(d, f); const s = statSync(p); if (s.isDirectory()) walk(p, acc); else if (EXT.has(extname(f).toLowerCase())) acc.push(p); } return acc; }
const bits = (buf, w, h, fn) => { let s = ""; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) s += fn(buf, x, y) ? "1" : "0"; return BigInt("0b" + s).toString(16).padStart(Math.ceil(w * h / 4), "0"); };
async function hash(p) {
  // 투명 배경은 흰색으로 합성(파워플러스 PNG 투명 ↔ 홈박스 webp 가 같은 그림으로 읽히게)
  const img = sharp(p).flatten({ background: "#fff" }).greyscale();
  const meta = await img.metadata();
  const d = await img.clone().resize(17, 16, { fit: "fill" }).raw().toBuffer();
  const a = await img.clone().resize(8, 8, { fit: "fill" }).raw().toBuffer();
  const mean = a.reduce((s, v) => s + v, 0) / 64;
  return { d: bits(d, 16, 16, (b, x, y) => b[y * 17 + x] > b[y * 17 + x + 1]), a: bits(a, 8, 8, (b, x, y) => b[y * 8 + x] > mean), w: meta.width, h: meta.height };
}
const res = {};
let n = 0, fail = 0;
for (const dir of dirs) {
  const files = walk(dir);
  await Promise.all(Array.from({ length: 8 }, async (_, k) => {
    for (let i = k; i < files.length; i += 8) {
      const p = files[i];
      try { res[relative(dir, p).replaceAll("\\", "/")] = await hash(p); n++; } catch { fail++; }
      if (n % 1000 === 0) process.stderr.write(`${n}\n`);
    }
  }));
}
writeFileSync(out, JSON.stringify(res));
console.log(`hashed ${n} fail ${fail} → ${out}`);

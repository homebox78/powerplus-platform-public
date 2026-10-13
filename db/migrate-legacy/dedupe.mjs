// 중복 대조 — ① 파워플러스 안 같은 파일(sha256) ② 파워플러스 ↔ 홈박스 샘플(지각 해시).
//   node db/migrate-legacy/dedupe.mjs [--d=6] [--a=4]   → db/migrate-legacy/data/dedupe.json + 요약
// 판정: dHash(16x16) 해밍 거리 ≤ d 이고 평균해시(8x8) 거리 ≤ a. 기본 6/4 — 같은 그림을 webp→png 로 바꾼 정도는 0~2, 다른 그림은 보통 20+.
// 결과는 "후보" — 적용(powerplus-assets.mjs --dedupe) 전에 컨택트시트로 눈 확인했다(아래 작업 로그 참고).
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = new Map(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? "1"]; }));
const MAXD = Number(args.get("d") ?? 6), MAXA = Number(args.get("a") ?? 4);
const pp = JSON.parse(readFileSync(resolve(here, "data/pp-phash.json"), "utf8"));
const hb = JSON.parse(readFileSync(resolve(here, "data/hb-phash.json"), "utf8"));
const sha = readFileSync(resolve(here, "data/powerplus-sha256.txt"), "utf8").trim().split("\n").map((l) => [l.slice(0, 64), l.slice(66).trim()]);

const ham = (x, y) => { let n = 0n, v = BigInt("0x" + x) ^ BigInt("0x" + y); while (v) { n += v & 1n; v >>= 1n; } return Number(n); };
const ppId = (p) => p.replace(/^.*\//, "").replace(/\.[a-z0-9]+$/i, "");          // uploads/icon/thumbs/icon_001.png → icon_001
const hbId = (p) => p.replace(/^.*\//, "").replace(/\.[a-z0-9]+$/i, "");          // icon-blue/icon-blue-001-x.png → icon-blue-001-x

// ① sha256 그룹(파워플러스 안)
const bySha = new Map();
for (const [h, p] of sha) { if (/\/thumbs\//.test(p)) continue; const id = ppId(p); (bySha.get(h) ?? bySha.set(h, []).get(h)).push(id); }
const ppDup = [...bySha.values()].filter((g) => g.length > 1).map((g) => g.sort(idOrder));
function idOrder(a, b) { const [ca, na] = a.split("_"), [cb, nb] = b.split("_"); return ca === cb ? Number(na) - Number(nb) : a.localeCompare(b); }

// ② 지각 해시 — 평균해시 앞 글자로 버킷을 나눠 전수 비교를 줄인다(16진 첫 자리가 같으면 후보)
const ppList = Object.entries(pp).map(([p, v]) => ({ id: ppId(p), cat: p.split("/")[0], ...v }));
const hbList = Object.entries(hb).map(([p, v]) => ({ id: hbId(p), kind: p.split("/")[0], ...v }));
const pairs = [];
for (const h of hbList) {
  for (const p of ppList) {
    const a = ham(h.a, p.a); if (a > MAXA) continue;
    const d = ham(h.d, p.d); if (d > MAXD) continue;
    pairs.push({ hb: h.id, kind: h.kind, pp: p.id, cat: p.cat, d, a });
  }
}
// 홈박스 한 장에 파워플러스 여러 장이 걸리면 가장 가까운 것만(그 뒤는 파워플러스 안 중복 후보로 따로 본다)
pairs.sort((x, y) => x.d - y.d || x.a - y.a);
const best = new Map();
for (const q of pairs) { const k = q.hb; if (!best.has(k)) best.set(k, q); }
const matched = [...best.values()];
// 파워플러스 안 지각 중복(같은 사진이 두 번 등록) — sha 가 다른 재인코딩본까지
const ppNear = [];
for (let i = 0; i < ppList.length; i++) for (let j = i + 1; j < ppList.length; j++) {
  const x = ppList[i], y = ppList[j]; if (x.cat !== y.cat) continue;
  if (ham(x.a, y.a) > MAXA) continue; const d = ham(x.d, y.d); if (d > MAXD) continue;
  ppNear.push([x.id, y.id, d]);
}
const out = { params: { d: MAXD, a: MAXA }, pp_sha_dup: ppDup, hb_pp: matched, pp_near: ppNear };
writeFileSync(resolve(here, "data/dedupe.json"), JSON.stringify(out, null, 1));
const byKind = {}; for (const m of matched) byKind[m.kind] = (byKind[m.kind] ?? 0) + 1;
console.log(`sha 중복 그룹 ${ppDup.length}(행 ${ppDup.reduce((s, g) => s + g.length - 1, 0)}) · 홈박스↔파워플러스 ${matched.length}/${hbList.length} · 파워플러스 안 근접 ${ppNear.length}`);
console.log("홈박스 종류별:", Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · "));
console.log("거리 분포(d):", Object.entries(matched.reduce((o, m) => (o[m.d] = (o[m.d] ?? 0) + 1, o), {})).map(([k, v]) => `${k}:${v}`).join(" "));

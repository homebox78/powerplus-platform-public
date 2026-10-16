// 에셋 중복 후보 쌍 찾기(2026-10-16 — 사용자 "자산 전체" 중복 정리).
// 입력: api/bin/asset-dup-scan.php 가 낸 TSV(public_id, category, set_id, set_name, created_at, sha256, dhash, name).
// ① 원본 sha256 이 같은 묶음 ② 같은 분류 안 dHash 해밍 거리 — 같은 세트는 ≤ SAME(10), 다른 세트끼리는 ≤ CROSS(4).
// 해시는 후보일 뿐이다(구도만 같은 다른 그림도 걸린다) — 결과를 컨택트시트로 눈 대조한 뒤 asset-delete.php 로 지운다.
//   node scripts/asset-dup-pairs.mjs asset-hash.tsv > dups.json [SAME=10 CROSS=4]
import fs from 'node:fs';

const SAME = +(process.env.SAME || 10), CROSS = +(process.env.CROSS || 4);
const rows = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n').map((l) => {
  const [id, category, set_id, set, created_at, sha, h, name] = l.split('\t');
  return { id, category, set_id, set, created_at, sha, name, hi: parseInt(h.slice(0, 8), 16), lo: parseInt(h.slice(8), 16) };
});
const pop = (v) => { v -= (v >>> 1) & 0x55555555; v = (v & 0x33333333) + ((v >>> 2) & 0x33333333); return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; };

const bySha = {};
for (const r of rows) if (r.sha) (bySha[r.sha] ||= []).push(r.id);
const exact = Object.values(bySha).filter((g) => g.length > 1);

const byCat = {};
for (const r of rows) (byCat[r.category] ||= []).push(r);
const pairs = [];
const pick = ({ id, name, set, created_at }) => ({ id, name, set, created_at });
for (const list of Object.values(byCat)) {
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    const same = a.set_id !== '' && a.set_id === b.set_id;
    const d = pop((a.hi ^ b.hi) >>> 0) + pop((a.lo ^ b.lo) >>> 0);
    if (d <= (same ? SAME : CROSS)) pairs.push({ d, same_set: same, category: a.category, a: pick(a), b: pick(b) });
  }
}
pairs.sort((x, y) => x.d - y.d);
process.stdout.write(JSON.stringify({ scanned: rows.length, exact_sha: exact, pairs }, null, 1));

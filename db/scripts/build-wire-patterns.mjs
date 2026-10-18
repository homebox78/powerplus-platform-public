// 홈페이지 와이어프레임 패턴 만들기 — 수집 레퍼런스(옛 홈박스 DB · 운영에선 pp_mockref)의 게시 PC 화면에서
// 화면 종류 × 기관 묶음별로 "어떤 섹션이 얼마나 자주, 어느 순서·폭으로 놓이는가"를 세어 api/data/wire-patterns.json 으로 굳힌다.
// 와이어 생성기(api/src/Mock/Wire.php)는 이 파일만 읽는다 — 실행 때 레퍼런스 DB 에 기대지 않고 LLM 도 쓰지 않는다(결정적).
//
//   node db/scripts/build-wire-patterns.mjs [--db mysql://root:root@127.0.0.1:3306/homebox]
//
// 세는 법: 섹션을 세로 위치로 줄(row)로 묶고(세로 겹침 50% 이상이면 같은 줄), 줄 안 폭 비율을 12칸으로 나눈다.
// LNB·떠 있는 퀵메뉴·건너뛰기·미분류는 줄 계산에서 뺀다(LNB 는 채택률·폭만 따로 센다).
import mysql from "mysql2/promise";
import { writeFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const argDb = process.argv.indexOf("--db");
const url = argDb > 0 ? process.argv[argDb + 1] : (process.env.MOCKREF_DATABASE_URL ?? "mysql://root:root@127.0.0.1:3306/homebox");

const SCREENS = ["main", "board_list", "board_gallery", "board_view", "form", "content", "greeting", "org_chart", "location", "history", "vision", "procedure", "faq", "search", "sitemap", "info_disclosure"];
// 묶음 — 관공서 4 + 대학 + 학교·교육 + 단체·복지 + 문화·관광·체육 + 민간(일반 홈페이지). 사이트 수집 출처(source_kind)가 private 면 민간.
// 학교·대학은 출처가 private 여도 교육 묶음(2026-10-18 — 민간 출처 학교 메인 152장이 기업 묶음에 섞여 '민간 361장'의 40% 가 학교였다).
// 문화·관광·체육(public_culture)은 공공기관에서 떼어 냄 — 메인 74장(n ≥ 15)이라 묶음 하나로 선다. 단체·복지(civic)는
// 복지 메인이 7장뿐이라 더 쪼개지 않는다(협회 22 + 복지 7).
const GROUP_OF = (t, kind) =>
  t === "edu_univ" || t === "edu_univ_private" || t === "edu_college" ? "university"
  : t.startsWith("edu") ? "education"
  : kind === "private" || t.startsWith("private") ? "private"
  : t.startsWith("local_basic") || t === "local_wide" || t === "council" ? "local"
  : t.startsWith("central") ? "central"
  : t === "etc_assoc" || t === "etc_welfare" ? "civic"
  : t === "public_culture" ? "culture"
  : t.startsWith("public") || t === "local_public" || t === "etc" || t === "judicial" ? "public"
  : "other";
const SKIP_ROW = new Set(["lnb", "floating_quick", "skip_nav", "unknown", "ai_chatbot"]);
const SNAP = [3, 4, 6, 8, 9, 12];

// 화면 한 장의 줄 구성(변형 후보) — 미분류가 많거나 너무 짧고 긴 화면은 버린다. 사이트 이름·주소는 담지 않는다(ref = 수집 화면 번호).
function layoutOf(rows, secs, s) {
  const area = (a) => a.reduce((x, z) => x + z.w * z.h, 0);
  const unk = area(secs.filter((x) => x.t === "unknown")) / (area(secs) || 1);
  if (unk > 0.25) return null;
  const out = [];
  for (const r of rows) {
    // 같은 종류가 한 줄에 여러 칸이면 하나로(카드 묶음을 칸마다 센 경우)
    const cells = [];
    for (const c of r.cells) {
      const prev = cells[cells.length - 1];
      if (prev && prev.k === c.t) { prev.span += c.span; continue; }
      cells.push({ k: c.t, span: c.span, h: Math.round(c.h) });
    }
    if (cells.length > 4) continue;
    for (const c of cells) c.span = SNAP.reduce((a, b) => (Math.abs(b - c.span) < Math.abs(a - c.span) ? b : a), 12);
    let d = 12 - cells.reduce((a, c) => a + c.span, 0);
    if (d !== 0) { const big = cells.reduce((a, c) => (c.span > a.span ? c : a), cells[0]); big.span = Math.max(1, big.span + d); }
    if (cells.reduce((a, c) => a + c.span, 0) !== 12 || cells.some((c) => c.span < 1)) continue;
    const sig = cells.map((c) => c.k + ":" + c.span).join("|");
    if (out.length && out[out.length - 1].sig === sig) continue;   // 같은 줄 연속은 하나로
    out.push({ sig, cells });
  }
  const body = out.filter((r) => !r.cells.every((c) => ["masthead", "header", "footer", "breadcrumb", "page_title", "sub_visual", "satisfaction"].includes(c.k)));
  if (out.length < 3 || out.length > 18 || body.length < (s.pt === "main" ? 3 : 1)) return null;
  if (!out.some((r) => r.cells.some((c) => c.k === "header")) || !out.some((r) => r.cells.some((c) => c.k === "footer"))) return null;
  return { ref: s.id, ot: s.ot, lnb: secs.some((x) => x.t === "lnb"), rows: out.map((r) => r.cells) };
}

// 줄 구성 거리 — 줄마다 칸 종류 묶음 순서를 비교(편집 거리 / 긴 쪽 길이)
function dist(a, b) {
  const A = a.rows.map((r) => r.map((c) => c.k).join("+")), B = b.rows.map((r) => r.map((c) => c.k).join("+"));
  const m = A.length, n = B.length; const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
  return d[m][n] / Math.max(m, n, 1);
}
// 서로 다른 구성을 고른다 — 그 묶음에서 흔한 칸으로 이뤄진(전형적인) 화면부터, 이미 고른 것과 거리 0.35 이상만
function pickLayouts(list, T, max = 12) {
  const typ = (l) => { const ks = new Set(l.rows.flat().map((c) => c.k)); let s = 0; for (const k of ks) s += T.get(k)?.screens ?? 0; return s / ks.size; };
  const sorted = [...list].sort((a, b) => typ(b) - typ(a));
  const picked = [];
  for (const l of sorted) {
    if (picked.length >= max) break;
    if (picked.every((p) => dist(p, l) >= 0.35)) picked.push(l);
  }
  // 묶음 크기 — 대표 구성과 거리 0.35 미만인 화면 수(count)와 그 화면들의 기관 종류 분포(ot_mix, 건수만).
  // 와이어 화면이 "이 묶음 n장 중 x%가 쓰는 구성"을 근거로 보여 준다. 한 화면이 두 대표에 함께 셀 수 있다(겹침 허용).
  return picked.map((p) => {
    const mix = {};
    let count = 0;
    for (const l of list) {
      if (dist(p, l) >= 0.35) continue;
      count++;
      mix[l.ot] = (mix[l.ot] ?? 0) + 1;
    }
    return { ...p, count, ot_mix: mix };
  });
}

const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function toRows(secs, vw) {
  const list = secs.filter((s) => !SKIP_ROW.has(s.t)).sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const s of list) {
    const r = rows[rows.length - 1];
    if (r) {
      const ov = Math.min(r.y + r.h, s.y + s.h) - Math.max(r.y, s.y);
      if (ov >= 0.5 * Math.min(r.h, s.h) && !r.items.some((i) => i.t === s.t && Math.abs(i.x - s.x) < 20)) {
        r.items.push(s);
        r.y = Math.min(r.y, s.y); r.h = Math.max(r.y + r.h, s.y + s.h) - r.y;
        continue;
      }
    }
    rows.push({ y: s.y, h: s.h, items: [s] });
  }
  // 줄 안 폭 → 12칸(합 12)
  return rows.map((r) => {
    const items = r.items.sort((a, b) => a.x - b.x);

    if (items.length === 1) return { cells: [{ t: items[0].t, span: 12, h: items[0].h }], y: r.y };
    const sum = items.reduce((a, i) => a + i.w, 0) || 1;
    let spans = items.map((i) => Math.max(1, Math.round((i.w / sum) * 12)));
    let d = 12 - spans.reduce((a, b) => a + b, 0);
    while (d !== 0) { const k = spans.indexOf(d > 0 ? Math.min(...spans) : Math.max(...spans)); spans[k] += Math.sign(d); d -= Math.sign(d); }
    return { cells: items.map((i, k) => ({ t: i.t, span: spans[k], h: i.h })), y: r.y };
  });
}

const db = await mysql.createConnection(url);
const [scr] = await db.query(
  `SELECT sc.id, sc.page_type_id AS pt, sc.viewport_w AS vw, sc.full_h AS fh, o.org_type_id AS ot, si.source_kind AS kind
     FROM screens sc JOIN sites si ON si.id = sc.site_id JOIN organizations o ON o.id = si.org_id
    WHERE sc.status = 'published' AND sc.device = 'pc' AND sc.page_type_id IN (?)`, [SCREENS]);
const ids = scr.map((s) => s.id);
const secBy = new Map();
for (let i = 0; i < ids.length; i += 2000) {
  const [rows] = await db.query(`SELECT screen_id AS sid, section_type_id AS t, bbox_x AS x, bbox_y AS y, bbox_w AS w, bbox_h AS h FROM sections WHERE screen_id IN (?)`, [ids.slice(i, i + 2000)]);
  for (const r of rows) { if (!secBy.has(r.sid)) secBy.set(r.sid, []); secBy.get(r.sid).push(r); }
}
await db.end();

// 화면 종류 × 묶음(all 포함)
const buckets = new Map();
const bucket = (k) => { if (!buckets.has(k)) buckets.set(k, { n: 0, types: new Map(), pair: new Map(), lnb: { n: 0, spans: [] }, rows: [] }); return buckets.get(k); };
for (const s of scr) {
  const secs = (secBy.get(s.id) ?? []).filter((x) => x.w > 0 && x.h > 0 && x.y >= 0 && x.y < s.fh);
  if (secs.length < 2) continue;
  const rows = toRows(secs, s.vw || 1920);
  if (!rows.length) continue;
  const lnb = secs.find((x) => x.t === "lnb");
  const grp = GROUP_OF(s.ot, s.kind);
  const lay = layoutOf(rows, secs, s);
  for (const key of grp === "private" ? [`${s.pt}|private`] : [`${s.pt}|all`, `${s.pt}|${grp}`]) {
    const b = bucket(key);
    b.n++;
    if (lnb) { b.lnb.n++; b.lnb.spans.push(Math.max(2, Math.min(4, Math.round((lnb.w / (s.vw || 1920)) * 12 * 1.2)))); }
    const seen = new Set();
    rows.forEach((r, ri) => {
      const pos = rows.length > 1 ? ri / (rows.length - 1) : 0.5;
      for (const c of r.cells) {
        if (!b.types.has(c.t)) b.types.set(c.t, { screens: 0, pos: [], span: [], h: [], count: [] });
        const T = b.types.get(c.t);
        if (!seen.has(c.t)) { T.screens++; seen.add(c.t); T.pos.push(pos); }
        T.span.push(c.span); T.h.push(c.h);
      }
      if (r.cells.length > 1) {
        const sig = r.cells.map((c) => c.t).sort().join("+");
        b.pair.set(sig, (b.pair.get(sig) ?? 0) + 1);
      }
    });
    for (const t of seen) { const T = b.types.get(t); T.count.push(rows.reduce((a, r) => a + r.cells.filter((c) => c.t === t).length, 0)); }
    if (lay) b.rows.push(lay);
  }
}

const tax = JSON.parse(readFileSync(resolve(root, "packages/shared/taxonomy.json"), "utf8"));
const names = Object.fromEntries(tax.section_types.map((s) => [s.id, { name: s.name_ko, scope: s.scope }]));
const out = { version: new Date().toISOString().slice(0, 10), source: "게시 PC 화면(관공서·대학·교육·단체·민간) 섹션 위치 집계 + 서로 다른 실제 줄 구성 — db/scripts/build-wire-patterns.mjs", types: names, patterns: {} };
for (const [key, b] of buckets) {
  if (b.n < 5) continue;
  const types = {};
  for (const [t, T] of b.types) {
    const adopt = T.screens / b.n;
    if (adopt < 0.03) continue;
    types[t] = {
      adopt: +adopt.toFixed(3),
      pos: +median(T.pos).toFixed(3),
      span: Math.round(median(T.span)),
      h: Math.round(median(T.h)),
      count: Math.max(1, Math.round(median(T.count))),
    };
  }
  const pairs = [...b.pair.entries()].filter(([, v]) => v / b.n >= 0.06).sort((a, c) => c[1] - a[1]).slice(0, 12)
    .map(([sig, v]) => ({ types: sig.split("+"), rate: +(v / b.n).toFixed(3) }));
  const layouts = pickLayouts(b.rows, b.types).map((l) => ({ ref: l.ref, ot: l.ot, lnb: l.lnb, count: l.count, ot_mix: l.ot_mix, rows: l.rows }));
  // layouts_n = 줄 구성으로 쓸 수 있었던 화면 수(미분류 많은 화면 등은 빠짐) — count 의 분모 후보
  out.patterns[key] = { n: b.n, layouts_n: b.rows.length, lnb: { adopt: +(b.lnb.n / b.n).toFixed(3), span: Math.round(median(b.lnb.spans) ?? 3) }, types, pairs, layouts };
}
const dest = resolve(root, "api/data/wire-patterns.json");
writeFileSync(dest, JSON.stringify(out, null, 1));
console.log("저장", dest, "패턴", Object.keys(out.patterns).length, "화면", scr.length);
for (const k of Object.keys(out.patterns).filter((k) => k.endsWith("|all"))) console.log(k, out.patterns[k].n, "lnb", out.patterns[k].lnb.adopt);

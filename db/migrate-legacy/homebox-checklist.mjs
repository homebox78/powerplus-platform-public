// 홈박스 디자인 개선 체크리스트 이관 — design_checklist → mock_checklist
//   node db/migrate-legacy/homebox-checklist.mjs [--dry]
// 원천: LEGACY_HB_FULL_URL(운영 homebox 덤프, 읽기 전용 — 없으면 LEGACY_HOMEBOX_URL) · 대상: DATABASE_URL
// 멱등: slug UNIQUE 로 upsert. 옛 행 id 는 legacy_id 에 남긴다.
// 이미 플랫폼에서 쌓인 행(같은 slug)이 있으면 hits 는 큰 쪽, 근거는 합쳐 최근 20개, 상태·고친 메모는 플랫폼 쪽이 비어 있을 때만 채운다.
// 근거 src "check_mockup <token>" 은 플랫폼 형식(src=check_mockup, token=<token>)으로 바꾼다 — 관리자 화면이 그 token 으로 시안 미리보기를 연다.
import { source, target, finish, say, head } from "./lib.mjs";

const old = process.env.LEGACY_HB_FULL_URL ? await source("LEGACY_HB_FULL_URL") : await source("LEGACY_HOMEBOX_URL");
const db = await target();

const [[has]] = await old.query("SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'design_checklist'");
if (!has.n) {
  console.log("원천에 design_checklist 표가 없습니다 — 건너뜀");
  await finish(db, old);
  process.exit(0);
}

const parse = (v) => { if (Array.isArray(v)) return v; try { return JSON.parse(v ?? "[]") || []; } catch { return []; } };
const normEv = (e) => {
  if (!e || typeof e !== "object") return null;
  const o = { ...e };
  const m = /^check_mockup\s+([A-Za-z0-9_-]{6,64})$/.exec(String(o.src ?? ""));
  if (m) { o.src = "check_mockup"; o.token = m[1]; }
  return o;
};
const evKey = (e) => `${e.at ?? ""}|${e.src ?? ""}|${e.token ?? ""}|${e.note ?? ""}`;

head("홈박스 design_checklist → mock_checklist");
const [rows] = await old.query("SELECT * FROM design_checklist ORDER BY id");
let ins = 0, merged = 0, same = 0;
for (const r of rows) {
  const ev = parse(r.evidence).map(normEv).filter(Boolean);
  const [[cur]] = await db.query("SELECT * FROM mock_checklist WHERE slug = ?", [r.slug]);
  if (!cur) {
    await db.query(
      `INSERT INTO mock_checklist (slug, area, title, detail, origin, status, hits, regressed, evidence, fix_note, fix_commit, first_seen, last_seen, fixed_at, legacy_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [r.slug, r.area, r.title, r.detail, r.origin, r.status, r.hits, r.regressed, JSON.stringify(ev.slice(0, 20)), r.fix_note, r.fix_commit, r.first_seen, r.last_seen, r.fixed_at, r.id],
    );
    ins++;
    continue;
  }
  if (cur.legacy_id && Number(cur.legacy_id) === Number(r.id)) { same++; continue; } // 이미 옮긴 행 — 다시 돌려도 그대로
  const seen = new Set();
  const all = [...parse(cur.evidence), ...ev].filter((e) => { const k = evKey(e); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => String(b.at ?? "").localeCompare(String(a.at ?? ""))).slice(0, 20);
  await db.query(
    `UPDATE mock_checklist SET hits = GREATEST(hits, ?), evidence = ?, regressed = GREATEST(regressed, ?),
       detail = COALESCE(detail, ?), fix_note = COALESCE(fix_note, ?), fix_commit = COALESCE(fix_commit, ?),
       first_seen = LEAST(first_seen, ?), last_seen = GREATEST(last_seen, ?), legacy_id = ? WHERE id = ?`,
    [r.hits, JSON.stringify(all), r.regressed, r.detail, r.fix_note, r.fix_commit, r.first_seen, r.last_seen, r.id, cur.id],
  );
  merged++;
}
say("원천 행", rows.length);
say("새로 넣음", ins);
say("플랫폼 행과 합침", merged);
say("이미 옮김(변화 없음)", same);
const [[t]] = await db.query("SELECT COUNT(*) n, SUM(legacy_id IS NOT NULL) l FROM mock_checklist");
say("mock_checklist 전체 / 옮겨 온 행", `${t.n} / ${t.l}`);
await finish(db, old);

// 옛 운영 데이터 이관 전체 실행 — 순서대로 돌리고 끝에 원천↔대상 건수 표를 찍는다.
//   node db/migrate-legacy/run-all.mjs [--dry]
// 순서(바꾸지 말 것): users → powerplus-activity → homebox-activity(MCP 키 포함) → homebox-mockups(키 주인으로 소유자) → powerdeck-jobs
// 전제: 자산 이관(powerplus-assets.mjs)이 먼저 끝나 있다(삽입·즐겨찾기가 asset_items.legacy_key 로 자산을 찾는다).
//       대상 DB 에 0010_legacy_activity.sql 이 적용돼 있다(node db/scripts/migrate.mjs).
// --dry: 각 스크립트가 자기 트랜잭션을 롤백한다. 단 앞 스크립트가 롤백되므로 뒤 스크립트의 '신규' 건수는 실제보다 클 수 있다
//        (예: users 가 아직 없어서 사용자 매핑이 비는 수). 정확한 숫자는 dry 없이 한 번 돌린 뒤 다시 돌려 '신규 0'으로 확인.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { root, conn, DRY } from "./lib.mjs";

const steps = ["users", "powerplus-activity", "homebox-activity", "homebox-mockups", "powerdeck-jobs"];
for (const s of steps) {
  const r = spawnSync(process.execPath, [resolve(root, `db/migrate-legacy/${s}.mjs`), ...(DRY ? ["--dry"] : [])], { stdio: "inherit", env: process.env });
  if (r.status !== 0) { console.error(`\n${s} 실패(종료 코드 ${r.status}) — 뒤 단계는 돌리지 않습니다.`); process.exit(r.status ?? 1); }
}

// ── 건수 표 ────────────────────────────────────────────────────────────────
const env = (k) => process.env[k];
const pp = await conn(env("LEGACY_PP_FULL_URL"));
const hb = await conn(env("LEGACY_HB_FULL_URL"));
const dk = await conn(env("LEGACY_DECK_URL"));
const db = await conn(env("DATABASE_URL") ?? "mysql://root:root@127.0.0.1:3306/powerplus");
const one = async (c, sql) => { const [[r]] = await c.query(sql); return Number(Object.values(r)[0]); };

const rows = [
  ["파워플러스 usage_log → asset_uses(pp_usage)", pp, "SELECT COUNT(*) FROM usage_log", "SELECT COUNT(*) FROM asset_uses WHERE ref_type='pp_usage'"],
  ["파워플러스 user_favorites → asset_favorites", pp, "SELECT COUNT(*) FROM user_favorites", "SELECT COUNT(*) FROM asset_favorites"],
  ["파워플러스 search_logs → asset_search_logs(addin)", pp, "SELECT COUNT(*) FROM search_logs", "SELECT COUNT(*) FROM asset_search_logs WHERE channel='addin'"],
  ["파워플러스 content_requests → asset_requests", pp, "SELECT COUNT(*) FROM content_requests", "SELECT COUNT(*) FROM asset_requests"],
  ["파워플러스 mcp_keys → core_api_keys(powerplus)", pp, "SELECT COUNT(*) FROM mcp_keys", "SELECT COUNT(*) FROM core_api_keys WHERE legacy_source='powerplus'"],
  ["홈박스 users → core_users(소셜 로그인 연결)", hb, "SELECT COUNT(*) FROM users", "SELECT COUNT(DISTINCT user_id) FROM core_user_logins WHERE provider IN ('google','kakao','naver')"],
  ["홈박스 api_keys → core_api_keys(homebox)", hb, "SELECT COUNT(*) FROM api_keys", "SELECT COUNT(*) FROM core_api_keys WHERE legacy_source='homebox'"],
  ["홈박스 community_posts → comm_posts", hb, "SELECT COUNT(*) FROM community_posts", "SELECT COUNT(*) FROM comm_posts WHERE legacy_key LIKE 'hb:post:%'"],
  ["홈박스 community_comments → comm_comments", hb, "SELECT COUNT(*) FROM community_comments", "SELECT COUNT(*) FROM comm_comments WHERE legacy_key LIKE 'hb:cmt:%'"],
  ["홈박스 point_ledger → core_point_ledger", hb, "SELECT COUNT(*) FROM point_ledger", "SELECT COUNT(*) FROM core_point_ledger WHERE ref_type='hb_point'"],
  ["홈박스 notifications → core_notifications", hb, "SELECT COUNT(*) FROM notifications", "SELECT COUNT(*) FROM core_notifications WHERE legacy_key LIKE 'hb:notif:%'"],
  ["홈박스 collections → core_collections", hb, "SELECT COUNT(*) FROM collections", "SELECT COUNT(*) FROM core_collections WHERE legacy_key LIKE 'hb:coll:%'"],
  ["홈박스 requests → core_contacts", hb, "SELECT COUNT(*) FROM requests", "SELECT COUNT(*) FROM core_contacts WHERE legacy_key LIKE 'hb:req:%'"],
  ["홈박스 removal_requests → core_removal_requests", hb, "SELECT COUNT(*) FROM removal_requests", "SELECT COUNT(*) FROM core_removal_requests WHERE legacy_key LIKE 'hb:rm:%'"],
  ["홈박스 mockup_pages → mock_mockups(같은 token)", hb, "SELECT COUNT(*) FROM mockup_pages", null, async () => { const [t] = await hb.query("SELECT token FROM mockup_pages"); if (!t.length) return 0; return one(db, db.format("SELECT COUNT(*) FROM mock_mockups WHERE token IN (?)", [t.map((x) => x.token)])); }],
  ["홈박스 gallery_items → mock_gallery(그 시안의)", hb, "SELECT COUNT(*) FROM gallery_items", null, async () => { const [t] = await hb.query("SELECT token FROM gallery_items"); if (!t.length) return 0; return one(db, db.format("SELECT COUNT(*) FROM mock_gallery g JOIN mock_mockups m ON m.id=g.mockup_id WHERE m.token IN (?)", [t.map((x) => x.token)])); }],
  ...["uploads", "jobs", "job_events", "job_files", "job_docs", "job_comments", "job_comment_replies", "ai_usage", "ai_tasks", "ai_user_keys", "ai_settings"]
    .map((t) => [`파워덱 ${t} → deck_${t}`, dk, `SELECT COUNT(*) FROM ${t}`, `SELECT COUNT(*) FROM deck_${t}`]),
];

console.log(`\n${DRY ? "[DRY — 대상은 롤백돼 이관 전 값] " : ""}── 원천 ↔ 대상 건수 (대상 열은 그 표 전체 — 플랫폼 자체 데이터·이전 자산 이관분 포함)`);
console.log("항목".padEnd(48) + "원천".padStart(8) + "대상".padStart(8));
for (const [label, src, sSql, tSql, tFn] of rows) {
  const s = await one(src, sSql);
  const t = tFn ? await tFn() : await one(db, tSql);
  console.log(label.padEnd(48) + String(s).padStart(8) + String(t).padStart(8));
}
for (const c of [pp, hb, dk, db]) await c.end();

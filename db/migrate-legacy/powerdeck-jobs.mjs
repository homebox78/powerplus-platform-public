// 파워덱 운영 데이터 이관 — 옛 powerdeck DB → deck_ 표(0004/0005 가 옛 스키마를 그대로 옮긴 1:1 표)
//   node db/migrate-legacy/powerdeck-jobs.mjs [--dry]
// 원천: LEGACY_DECK_URL(운영 powerdeck 덤프, 읽기 전용) · 대상: DATABASE_URL. users.mjs 다음(작업 주인은 이메일 그대로라 사용자 행이 먼저 있어야 화면 이름이 붙는다).
//
// 규칙
//  - 표 구조가 같다(열 순서만 다름) → 열 이름으로 복사. 문자 id(jobs 16자·uploads 24자·job_docs 16자)는 그대로 — 화면 주소(/deck/jobs?id=)·파일 폴더 이름이 이 id 다.
//  - 숫자 자동증가 id(job_events·job_files·job_comments·job_comment_replies·ai_usage·ai_tasks)도 그대로 넣는다.
//    같은 id 가 플랫폼에 이미 있으면: 같은 행(나머지 열이 모두 같음)이면 건너뜀, 다른 행이면(플랫폼 자체 시험 데이터) 새 id 로 넣되
//    먼저 '나머지 열이 같은 행'이 있는지 찾아 두 번 넣지 않는다 → 멱등. 답글이 가리키는 의견 id 가 바뀌면 답글의 comment_id 도 옮긴다.
//  - ai_settings(키=값)·ai_user_keys(이메일 PK)는 INSERT IGNORE — 플랫폼에서 이미 정한 값을 덮지 않는다.
//  - 옮기지 않는 것: sessions·auth_codes(플랫폼 로그인으로 대체), workers(엔진은 플랫폼 worker_key 로 다시 붙는다).
//
// 파일 본문은 복사하지 않는다(서버 1.9GB). DB 에는 파일 경로가 없고 job_files(job_id,kind,name) 만 있다 → 경로는 규칙으로 정해진다:
//   옛  /var/www/powerdeck_data/jobs/<job_id>/<kind>/<name>   (uploads/<upload_id>, wire_feedback/, powerplus_logos.json, reference.zip)
//   새  {storage.dir}/deck/jobs/<job_id>/<kind>/<name>        (api/src/Deck/Legacy.php dataDir() — 같은 하위 구조)
//   운영 절차: rsync -a /var/www/powerdeck_data/ <storage.dir>/deck/ (보고서 참고).
// 암호화된 AI 키(ai_user_keys.key_enc·ai_settings 의 회사 키)는 옛 key_secret/worker_key 로 만든 열쇠로 잠겨 있다(AiKeys::secret)
//   → 플랫폼 config 의 deck.key_secret(또는 deck.worker_key)를 옛 값과 같게 둬야 풀린다. 다르면 사용자에게 키를 다시 넣게 해야 한다.
import { source, target, finish, say, head } from "./lib.mjs";

const old = await source("LEGACY_DECK_URL");
const db = await target();

async function cols(c, schemaTable) {
  const [r] = await c.query(`SHOW COLUMNS FROM ${schemaTable}`);
  return r.map((x) => x.Field);
}
const sameRowSql = (t, cs) => `SELECT id FROM ${t} WHERE ${cs.map((c) => `\`${c}\` <=> ?`).join(" AND ")} LIMIT 1`;

const counts = [];
const commentRemap = new Map();

/** 문자 PK 표: 없으면 넣고, 있으면 원천 값으로 갱신(같은 id 는 같은 작업이다 — 랜덤 16·24자). */
async function copyCharPk(tbl) {
  const cs = await cols(old, tbl);
  const [rows] = await old.query(`SELECT * FROM ${tbl}`);
  let n = 0, u = 0;
  for (const r of rows) {
    const [[ex]] = await db.query(`SELECT id FROM deck_${tbl} WHERE id = ?`, [r.id]);
    const v = Object.fromEntries(cs.map((c) => [c, r[c]]));
    if (ex) { await db.query(`UPDATE deck_${tbl} SET ? WHERE id = ?`, [v, r.id]); u++; }
    else { await db.query(`INSERT INTO deck_${tbl} SET ?`, [v]); n++; }
  }
  counts.push([tbl, rows.length, `신규 ${n} · 갱신 ${u}`]);
}

/** 숫자 자동증가 PK 표 */
async function copyAutoPk(tbl, fix) {
  const cs = await cols(old, tbl);
  const rest = cs.filter((c) => c !== "id");
  const [rows] = await old.query(`SELECT * FROM ${tbl} ORDER BY id`);
  let n = 0, same = 0, moved = 0;
  const clash = [];
  // 1차: 같은 번호가 비어 있으면 그 번호로. 겹치는 행은 모아 두었다가 2차에 넣는다
  //      (먼저 새 번호로 넣으면 자동증가가 2·3… 을 차지해 뒤 행이 연쇄로 겹친다).
  for (const r0 of rows) {
    const r = fix ? fix({ ...r0 }) : r0;
    const vals = rest.map((c) => r[c]);
    const [[ex]] = await db.query(`SELECT id FROM deck_${tbl} WHERE id = ?`, [r.id]);
    if (ex) {
      const [[eq]] = await db.query(`SELECT id FROM deck_${tbl} WHERE id = ? AND ${rest.map((c) => `\`${c}\` <=> ?`).join(" AND ")}`, [r.id, ...vals]);
      if (eq) { same++; continue; }
      clash.push([r, vals]);
      continue;
    }
    await db.query(`INSERT INTO deck_${tbl} (${cs.map((c) => `\`${c}\``).join(",")}) VALUES (?)`, [cs.map((c) => r[c])]);
    n++;
  }
  // 2차: 같은 번호에 다른 행(플랫폼 시험 데이터)이 있던 것 — 이미 바꿔 넣은 적 있으면 그 행을 찾고, 없으면 새 번호로.
  for (const [r, vals] of clash) {
    const [[dup]] = await db.query(sameRowSql(`deck_${tbl}`, rest), vals);
    let nid = dup?.id;
    if (!nid) { const [ins] = await db.query(`INSERT INTO deck_${tbl} (${rest.map((c) => `\`${c}\``).join(",")}) VALUES (?)`, [vals]); nid = ins.insertId; n++; } else same++;
    if (tbl === "job_comments") commentRemap.set(r.id, nid);
    moved++;
  }
  counts.push([tbl, rows.length, `신규 ${n} · 이미 있음 ${same} · 번호 바꿈 ${moved}`]);
}

async function copyIgnore(tbl) {
  const cs = await cols(old, tbl);
  const [rows] = await old.query(`SELECT * FROM ${tbl}`);
  let n = 0;
  for (const r of rows) {
    const [res] = await db.query(`INSERT IGNORE INTO deck_${tbl} (${cs.map((c) => `\`${c}\``).join(",")}) VALUES (?)`, [cs.map((c) => r[c])]);
    n += res.affectedRows;
  }
  counts.push([tbl, rows.length, `신규 ${n} · 기존 값 유지 ${rows.length - n}`]);
}

await copyCharPk("uploads");
await copyCharPk("jobs");
await copyAutoPk("job_events");
await copyAutoPk("job_files");
await copyCharPk("job_docs");
await copyAutoPk("job_comments");
await copyAutoPk("job_comment_replies", (r) => ({ ...r, comment_id: commentRemap.get(r.comment_id) ?? r.comment_id }));
await copyAutoPk("ai_usage");
await copyAutoPk("ai_tasks");
await copyIgnore("ai_user_keys");
await copyIgnore("ai_settings");

// 작업 주인 이메일 중 플랫폼 계정이 없는 수(화면에 이름이 안 붙는다 — users.mjs 가 먼저 돌았으면 0)
const [[noUser]] = await db.query("SELECT COUNT(DISTINCT j.email) n FROM deck_jobs j LEFT JOIN core_users u ON u.email = j.email WHERE u.id IS NULL");

head("파워덱 작업(powerdeck-jobs.mjs)");
for (const [t, o, msg] of counts) say(`${t} → deck_${t}`, `옛 ${o} → ${msg}`);
say("작업 주인 중 플랫폼 계정 없음", `${noUser.n}명`);
say("파일 본문", "복사 안 함 — /var/www/powerdeck_data/ → {storage.dir}/deck/ (같은 구조)");
await finish(db, old);

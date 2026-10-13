// 옛 운영 데이터 이관 스크립트 공용 도우미(사용자·활동·커뮤니티·시안·장표). powerplus-assets.mjs 의 연결·public_id 규칙을 그대로 떼어 냈다.
// 규칙
//  - 원천(옛 DB)은 SELECT 만: 연결 직후 SET SESSION TRANSACTION READ ONLY.
//  - 대상(새 DB)은 스크립트 하나를 한 트랜잭션으로 돌린다. --dry 면 끝에서 ROLLBACK → 건수는 실제와 같고 아무것도 남지 않는다.
//  - public_id 는 api/src/Core/Ids.php 와 같은 알파벳(혼동 글자 l·o·0·1 제외) 16자.
//  - 이메일은 trim + 소문자. 이메일 형식이 아니면(예: MCP 키 이름이 email 칸에 들어간 행) 사용자로 만들지 않는다.
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomInt } from "node:crypto";
import mysql from "mysql2/promise";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
if (existsSync(resolve(root, ".env"))) process.loadEnvFile(resolve(root, ".env"));
export const args = new Map(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, "").split("="); return [k, v ?? "1"]; }));
export const DRY = args.has("dry");
export const STAFF = (process.env.STAFF_DOMAIN ?? "solideos.com").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);

export function conn(url) {
  const u = new URL(url);
  return mysql.createConnection({ host: u.hostname, port: Number(u.port || 3306), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.slice(1), charset: "utf8mb4", dateStrings: true });
}
/** 원천 연결(읽기 전용). env 변수 이름과 기본값을 받는다. */
export async function source(envName, fallback) {
  const url = process.env[envName] ?? fallback;
  if (!url) throw new Error(`${envName} 이 .env 에 없습니다`);
  const c = await conn(url);
  await c.query("SET SESSION TRANSACTION READ ONLY");
  return c;
}
/** 대상 연결 + 트랜잭션 시작. finish() 로 커밋(또는 --dry 면 롤백). */
export async function target() {
  const c = await conn(process.env.DATABASE_URL ?? "mysql://root:root@127.0.0.1:3306/powerplus");
  await c.beginTransaction();
  return c;
}
export async function finish(db, ...others) {
  if (DRY) await db.rollback(); else await db.commit();
  await db.end();
  for (const o of others) await o.end();
}

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
export const pid = (len = 16) => Array.from({ length: len }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

export const normEmail = (e) => String(e ?? "").trim().toLowerCase();
export const isEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
export const isStaff = (e) => STAFF.includes(e.split("@")[1] ?? "");
/** 홈박스가 이메일 없는 소셜 계정에 붙인 가짜 메일(kakao-<uid>@noemail.homebox.local) → 플랫폼 형식(Users.php: <provider>-<uid>@noemail.local) */
export function fakeMail(e) {
  const m = /^([a-z]+)-(.+)@noemail\.homebox\.local$/.exec(e);
  return m ? { provider: m[1], uid: m[2], email: `${m[1]}-${m[2]}@noemail.local` } : null;
}
/** 개발용 로컬 계정(dev@homebox.local 등) — 실제 사람이 아니라 이관하지 않는다. noemail 은 제외(위 fakeMail 이 처리). */
export const isDevLocal = (e) => /@([a-z0-9-]+\.)*(local|localhost|test)$/.test(e) && !/@noemail\.(homebox\.)?local$/.test(e);

/** 이메일 → core_users.id (없으면 null). 캐시. */
const userCache = new Map();
export async function userIdByEmail(db, email) {
  const e = normEmail(email);
  if (!e) return null;
  if (userCache.has(e)) return userCache.get(e);
  const alt = fakeMail(e)?.email;
  const [[r]] = await db.query("SELECT id FROM core_users WHERE email IN (?)", [[e, alt ?? e]]);
  const id = r?.id ?? null;
  userCache.set(e, id);
  return id;
}

export const report = [];
export function say(k, v) { report.push([k, v]); console.log(`  ${k}: ${v}`); }
export const head = (t) => console.log(`\n${DRY ? "[DRY] " : ""}── ${t}`);
/** "a,b,c" 형태 IN 절용 */
export const nz = (v) => (v === undefined ? null : v);

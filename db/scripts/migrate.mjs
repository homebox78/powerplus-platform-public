// 스키마 적용: schema.sql(IF NOT EXISTS 라 멱등) + db/migrations/*.sql 을 schema_migrations 이력으로 증분 적용.
// 출처: homebox-handoff db/scripts/migrate.mjs 구조. 사용: node db/scripts/migrate.mjs  (DATABASE_URL 은 .env 또는 환경변수)
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
if (existsSync(resolve(root, ".env"))) process.loadEnvFile(resolve(root, ".env"));
const url = new URL(process.env.DATABASE_URL ?? "mysql://root:root@127.0.0.1:3306/powerplus");
const dbName = url.pathname.slice(1);
const base = { host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), multipleStatements: true, charset: "utf8mb4" };

const admin = await mysql.createConnection(base);
await admin.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
await admin.end();
const db = await mysql.createConnection({ ...base, database: dbName });
await db.query(readFileSync(resolve(root, "db/schema.sql"), "utf8"));
const [done] = await db.query("SELECT name FROM schema_migrations");
const applied = new Set(done.map((r) => r.name));
const dir = resolve(root, "db/migrations");
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".sql")).sort() : [];
let n = 0;
for (const f of files) {
  if (applied.has(f)) continue;
  await db.query(readFileSync(resolve(dir, f), "utf8"));
  await db.query("INSERT INTO schema_migrations (name) VALUES (?)", [f]);
  n++;
  console.log("applied", f);
}
const [[{ c }]] = await db.query("SELECT COUNT(*) c FROM information_schema.tables WHERE table_schema = ? AND (table_name LIKE 'core\_%' OR table_name LIKE 'asset\_%')", [dbName]);
console.log(`db=${dbName} tables=${c} migrations_new=${n}`);
await db.end();

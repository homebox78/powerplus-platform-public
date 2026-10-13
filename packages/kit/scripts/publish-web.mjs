// 키트 빌드 결과를 사이트 정적 폴더로 — apps/web/public/kit-files/ (/kit 라우트와 이름이 겹치면 Apache 가 폴더로 받아 403 이 난다)
//  /kit 페이지가 이 미리보기를 iframe 으로 띄우고, zip 을 내려받게 한다.
//   node scripts/publish-web.mjs   (npm run build 뒤)
//
// 버전 관리(2026-09-26): package.json version 마다 kit-files/v<버전>/ 에 따로 쌓는다(옛 버전 폴더는 지우지 않는다).
//  kit-files/ 바로 아래에는 최신판을 한 벌 더 둔다 — 목업(KitPage.php)이 /kit-files/kit.css 를 부른다.
//  kit-files/versions.json = versions.json 중 폴더가 실제로 있는 버전만, 최신 먼저.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const out = path.resolve(root, "../../apps/web/public/kit-files");
const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
const book = JSON.parse(fs.readFileSync(path.join(root, "versions.json"), "utf8"));
if (!book.versions.some((v) => v.version === version)) throw new Error(`versions.json 에 ${version} 항목이 없습니다 — 바뀐 점을 적고 다시 빌드하세요.`);

const ITEMS = ["kit.css", "theme.css", "fonts", "icons", "preview"];
function publish(to) {
  for (const p of [...ITEMS, "powerguide-kit-krds.zip", "registry.json", "docs", "r"]) fs.rmSync(path.join(to, p), { recursive: true, force: true });
  fs.mkdirSync(to, { recursive: true });
  for (const p of ITEMS) fs.cpSync(path.join(dist, p), path.join(to, p), { recursive: true });
  fs.copyFileSync(path.join(dist, "download/powerguide-kit-krds.zip"), path.join(to, "powerguide-kit-krds.zip"));
}

// 부품 목록(사이트 사이드바용) — 자동 생성된 registry.ts 에서 GROUPS·METAS 를 그대로 꺼낸다
const reg = fs.readFileSync(path.join(root, "preview/demos/registry.ts"), "utf8");
const groups = JSON.parse(reg.match(/GROUPS[^=]*=\s*(\[.*?\]);/s)[1]);
const metas = JSON.parse(reg.match(/METAS[^=]*=\s*(\[.*?\]);\s*$/ms)[1]);
const registry = JSON.stringify({ version, groups, metas }, null, 1);

publish(out);
// 부품 문서 재료(docs/·r/) — 최신판에만. powerGuide /guide/components/:id 가 읽는다
execFileSync(process.execPath, [path.join(root, "scripts/build-docs.mjs"), out], { stdio: "inherit" });
fs.writeFileSync(path.join(out, "registry.json"), registry);
const vdir = path.join(out, `v${version}`);
publish(vdir);
fs.writeFileSync(path.join(vdir, "registry.json"), registry);

const have = book.versions.filter((v) => fs.existsSync(path.join(out, `v${v.version}`)));
const cmp = (a, b) => b.version.split(".").map(Number).reduce((r, n, i) => r || n - (a.version.split(".").map(Number)[i] ?? 0), 0);
have.sort(cmp);
fs.writeFileSync(path.join(out, "versions.json"), JSON.stringify({ latest: version, versions: have }, null, 1));

let bytes = 0;
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else bytes += fs.statSync(p).size; } };
walk(vdir);
console.log(`사이트 반영 kit-files/v${version} · ${Math.round(bytes / 1024)}KB · 버전 ${have.map((v) => v.version).join(", ")}`);

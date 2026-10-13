// powerGuide 정본 데이터 → api/data/guide/*.json (REST·MCP 가 읽는 서버용 사본).
// 원천은 powerGuide 화면이 쓰는 파일 그대로다 — 손으로 고치지 말고 원천을 고친 뒤 이 스크립트를 다시 돌린다.
//   apps/web/app/modules/guide/data/krds.ts           → krds-components.json (KRDS 컴포넌트 55종 지침)
//   apps/web/app/modules/guide/data/krds-patterns.ts  → krds-patterns.json   (KRDS 기본 패턴 12종)
//   apps/web/app/modules/guide/data/krds-report.json  → checklist.json       (KRDS 검증 체크리스트 274항목 · 판정 근거)
// 부품 문서(kit-files/docs/*.json)·토큰 산출물(guide-files/*)은 웹 루트에 그대로 배포되므로 API 가 그 자리에서 읽는다(복사 안 함).
// 실행: node --experimental-strip-types scripts/build-guide-data.mjs   (deploy.sh 가 번들 전에 부른다)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "apps/web/app/modules/guide/data");
const out = resolve(root, "api/data/guide");
mkdirSync(out, { recursive: true });

const krds = await import(pathToFileURL(resolve(src, "krds.ts")).href);
const pats = await import(pathToFileURL(resolve(src, "krds-patterns.ts")).href);
const report = JSON.parse(readFileSync(resolve(src, "krds-report.json"), "utf8"));

// 키트 id ↔ KRDS 대응표 id 가 다른 것 — 부품 상세 화면(guide-component.tsx)의 KRDS_ALIAS 를 그대로 읽는다(두 곳에 적지 않는다).
const pageSrc = readFileSync(resolve(root, "apps/web/app/routes/guide-component.tsx"), "utf8");
const aliasLit = pageSrc.match(/const KRDS_ALIAS[^=]*=\s*(\{[^;]*\});/)?.[1];
if (!aliasLit) throw new Error("guide-component.tsx 에서 KRDS_ALIAS 를 찾지 못했습니다.");
const aliases = new Function(`return (${aliasLit});`)();

const write = (name, data) => {
  writeFileSync(resolve(out, name), JSON.stringify(data) + "\n");
  console.log(`${name}`);
};
write("krds-components.json", { source: "apps/web/app/modules/guide/data/krds.ts", categories: [...krds.KRDS_CATEGORIES], aliases, items: krds.KRDS_COMPONENTS });
write("krds-patterns.json", { source: "apps/web/app/modules/guide/data/krds-patterns.ts", items: pats.KRDS_PATTERNS });
write("checklist.json", { source: "apps/web/app/modules/guide/data/krds-report.json", at: report.at, summary: report.summary, rows: report.rows });
console.log(`KRDS 컴포넌트 ${krds.KRDS_COMPONENTS.length} · 패턴 ${pats.KRDS_PATTERNS.length} · 체크리스트 ${report.rows.length} → ${out}`);

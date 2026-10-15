// docs/MCP-개선-체크리스트.md → powerMCP 개선 체크리스트 항목(JSON). 서버에서 api/bin/qa-feed.php import mcp <json> 으로 넣는다.
//   node scripts/qa-import-mcp-doc.mjs > /tmp/mcp-items.json
// - MC-NN(고칠 때 확인할 규칙) → status watch(지켜볼 규칙). 영역은 바로 위 '### 2.x' 제목으로.
// - O-NN(남은 일) → 줄 그은 것 = fixed, '**일부**·**대부분**·**코드 완료**' = fixing, 나머지 = open.
// 문서가 원본이다 — 다시 가져오면 상태·메모를 문서 쪽으로 맞춘다(2026-10-15 통합 검수).
import { readFileSync } from "node:fs";

const md = readFileSync(new URL("../docs/MCP-개선-체크리스트.md", import.meta.url), "utf8");
const AREA = { "2.1": "guide", "2.2": "args", "2.3": "keys", "2.4": "kit", "2.5": "judge", "2.6": "ops" };
const plain = (s) => s.replace(/~~/g, "").replace(/\*\*/g, "").replace(/`/g, "").trim();
const cells = (line) => line.replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());

const out = [];
let area = "misc";
for (const line of md.split(/\r?\n/)) {
  const h = line.match(/^###\s+(\d+\.\d+)/);
  if (h) area = AREA[h[1]] ?? "misc";
  if (/^##\s+5\./.test(line)) area = "misc";
  if (!line.startsWith("|")) continue;
  const c = cells(line);
  const id = plain(c[0] ?? "");
  if (/^MC-\d+$/.test(id)) {
    out.push({ slug: `doc:${id}`, area, title: `${id} ${plain(c[1] ?? "")}`.slice(0, 200), detail: [c[2] && `왜: ${plain(c[2])}`, c[3] && `확인: ${plain(c[3])}`].filter(Boolean).join("\n"), status: "watch", origin: "doc", note: "MCP-개선-체크리스트 §2 규칙" });
  } else if (/^O-\d+$/.test(id)) {
    const struck = /^~~/.test(c[0] ?? "");
    const st = c[2] ?? "";
    const status = struck ? "fixed" : /\*\*(일부|대부분|코드 완료)\*\*/.test(st) ? "fixing" : "open";
    const commit = (st.match(/\b[0-9a-f]{7}\b/) ?? [])[0];
    out.push({ slug: `doc:${id}`, area, title: `${id} ${plain(c[1] ?? "")}`.slice(0, 200), status, origin: "doc", fix_note: plain(st).slice(0, 1000) || undefined, fix_commit: commit, note: "MCP-개선-체크리스트 §5 남은 일" });
  }
}
process.stdout.write(JSON.stringify(out, null, 1));
process.stderr.write(`MC ${out.filter((x) => x.slug.startsWith("doc:MC")).length} · O ${out.filter((x) => x.slug.startsWith("doc:O")).length} (fixed ${out.filter((x) => x.status === "fixed").length}, fixing ${out.filter((x) => x.status === "fixing").length}, open ${out.filter((x) => x.status === "open").length})\n`);

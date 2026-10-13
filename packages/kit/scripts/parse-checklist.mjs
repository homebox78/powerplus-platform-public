// KRDS 자체 검증 체크리스트(2024.11) 텍스트 → 항목 JSON
//   docs/krds/checklist.txt (pdftotext) → packages/kit/checklist/krds-checklist.json
// 페이지마다 "1) 공식 배너 2) 운영기관 식별자 …" 머리가 먼저 몰려 나오고 표가 이어진다.
// 번호가 1. 로 다시 시작할 때마다 그 페이지 머리 대기열에서 다음 이름을 꺼내 붙인다.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../..");
const lines = fs.readFileSync(path.join(root, "docs/krds/checklist.txt"), "utf8").split(/\r?\n/);
const start = lines.findIndex((l, i) => i > 400 && l.trim() === "2. 체크리스트");
const end = lines.findIndex((l, i) => i > start && l.trim() === "3. 준수 기준");

const SECTIONS = { "가. 스타일": "style", "나. 컴포넌트": "component", "다. 기본 패턴": "pattern", "라. 서비스 패턴": "service" };
const MARK = /^(P|F|E|N\/A|□)$/;
let section = "style";
let queue = []; // 이 페이지에서 아직 표를 못 만난 머리들
let group = null; // 스타일의 1) 색상 / 가) 정부 상징 같은 상위 묶음
let current = null; // 지금 항목이 속한 머리
let guide = [];
let item = null;
const items = [];
const flush = () => {
  if (!item) return;
  item.text = item.text.join(" ").replace(/\s+/g, " ").trim();
  items.push(item);
  item = null;
};

for (let i = start; i < end; i++) {
  const l = lines[i].trim();
  if (!l || /^- \d+ -$/.test(l) || /^2\. 체크리스트( [가-라]\. .+)?$/.test(l) || /^체크리스트\s?준수\s?여부$/.test(l)) continue;
  if (SECTIONS[l]) { flush(); section = SECTIONS[l]; queue = []; continue; }
  if (MARK.test(l)) { flush(); continue; }
  const head = l.match(/^(\d+)\)\s+(.+)$/);
  if (head && !item) { queue.push(head[2]); continue; }
  const sub = l.match(/^([가-하])\)\s+(.+)$/);
  if (sub && !item) { queue.push(`${group ?? ""}|${sub[2]}`); continue; }
  if (l === "사용성 가이드라인") { guide = []; continue; }
  const num = l.match(/^(\d+)\.\s+(.+)$/);
  if (num) {
    flush();
    if (+num[1] === 1) {
      // 스타일은 "1) 색상 / 가) 정부 상징 …" 두 층이다 — 가)가 나오기 전의 1)은 묶음 이름
      let next = queue.shift();
      while (next && section === "style" && !next.includes("|") && queue[0]?.startsWith("|")) {
        group = next;
        queue = queue.map((q) => (q.startsWith("|") ? `${group}${q}` : q));
        next = queue.shift();
      }
      current = next ?? current;
    }
    item = { section, component: current, no: +num[1], text: [num[2]], guideline: guide.join(" ").trim() || null };
    guide = [];
    continue;
  }
  if (item) item.text.push(l);
  else guide.push(l);
}
flush();

// 스타일 21개는 PDF 에서 머리가 한 페이지에 몰려 대기열 순서가 어긋난다 — 원문 표 순서로 직접 붙인다
const STYLE = [
  ...Array(3).fill("색상|정부 상징"), ...Array(2).fill("색상|자체 상징"), ...Array(3).fill("색상|공통"),
  ...Array(3).fill("서체|공통"), ...Array(3).fill("서체|정부 상징"), ...Array(4).fill("서체|자체 상징"),
  "형태|자체 상징", ...Array(2).fill("형태|공통"),
];
items.filter((x) => x.section === "style").forEach((x, k) => { x.component = STYLE[k] ?? x.component; });

const outDir = path.join(root, "packages/kit/checklist");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "krds-checklist.json"), JSON.stringify({ source: "디지털 정부 서비스 UI/UX 가이드라인 자체 검증 체크리스트 (2024.11)", count: items.length, items }, null, 1));
const by = {};
for (const it of items) by[it.section] = (by[it.section] ?? 0) + 1;
console.log("항목", items.length, by);
const comps = [...new Set(items.filter((x) => x.section === "component").map((x) => x.component))];
console.log("컴포넌트", comps.length, comps.join(" · "));

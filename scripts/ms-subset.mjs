#!/usr/bin/env node
// Material Symbols 아이콘 글꼴 줄이기(2026-10-17 점검: 장표 화면이 3.9MB 전체 글꼴을 받아 첫 화면이 느렸다 → 쓰는 아이콘만 20KB).
//   node scripts/ms-subset.mjs check  — 코드가 쓰는 아이콘 이름이 모두 글꼴 목록에 있는지(없으면 그 아이콘이 빈 네모로 나온다). preflight 9번이 부른다
//   node scripts/ms-subset.mjs build  — 목록을 다시 모아 Google Fonts 공식 잘라 받기(icon_names)로 woff2 를 새로 받는다. 받은 파일은 저장소에 둔다(실행 중 CDN 없음)
// 이름 모으기: 아이콘을 쓰는 파일(장표 legacy·장표 화면·로고 고르기)의 모든 문자열 ∩ 전체 심벌 이름 — 변수로 넘기는 이름까지 넉넉하게 잡는다.
// 축: opsz 24 · wght 400 · FILL 0..1(.ms-fill) · GRAD 0 — legacy.css 가 쓰는 값만.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const WEB = path.join(ROOT, "apps/web");
const LIST = path.join(WEB, "app/styles/material-symbols-names.txt");
const FONT = path.join(WEB, "app/styles/material-symbols-outlined-subset-v2.woff2");
const DIRS = ["app/modules/deck/legacy"];
const FILES = ["app/modules/deck/screens.tsx", "app/components/chat/logo-pick.tsx"];

function collect() {
  const all = new Set((fs.readFileSync(path.join(WEB, "node_modules/material-symbols/index.d.ts"), "utf8").match(/"([a-z0-9_]+)"/g) || []).map((s) => s.slice(1, -1)));
  if (all.size < 1000) throw new Error("material-symbols 이름 목록을 못 읽었다 — pnpm install 확인");
  const files = FILES.map((f) => path.join(WEB, f));
  const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(f) && files.push(p); } };
  DIRS.forEach((d) => walk(path.join(WEB, d)));
  const used = new Set();
  for (const f of files) {
    const t = fs.readFileSync(f, "utf8");
    for (const m of t.matchAll(/["'`]([a-z][a-z0-9_]{1,40})["'`]/g)) if (all.has(m[1])) used.add(m[1]);
    for (const m of t.matchAll(/>\s*([a-z][a-z0-9_]{1,40})\s*</g)) if (all.has(m[1])) used.add(m[1]);
    // 아이콘 자리(name="…"·name={…}·icon: "…")의 문자열은 패키지 목록에 없어도 넣는다 — material-symbols 패키지 목록이 낡아
    // auto_awesome·expand_more·expand_less 가 빠졌고, 글꼴에서도 빠져 화면에 'AUTO_AWESOME' 글자로 나왔다(2026-10-18, R72).
    // Google 잘라 받기는 없는 이름을 조용히 무시하므로 넉넉히 넣어도 된다
    for (const m of t.matchAll(/\bname=(?:"([a-z][a-z0-9_]{1,40})"|\{([^}\n]*)\})|\bicon:\s*"([a-z][a-z0-9_]{1,40})"/g)) {
      const s = m[1] ?? m[3];
      if (s) used.add(s);
      if (m[2]) for (const q of m[2].matchAll(/["']([a-z][a-z0-9_]{1,40})["']/g)) used.add(q[1]);
    }
  }
  // 와이어 상자 종류 아이콘은 JSON(legacy/data/wire_kinds.json, 2026-10-18 단일 원본)에 있다 — 숫자로 시작하는 이름('123')도 그대로
  const reg = JSON.parse(fs.readFileSync(path.join(WEB, "app/modules/deck/legacy/data/wire_kinds.json"), "utf8"));
  for (const k of reg.kinds) if (all.has(k.icon)) used.add(k.icon);
  return [...used].sort();
}

const mode = process.argv[2] ?? "check";
const want = collect();
if (mode === "check") {
  const have = new Set(fs.readFileSync(LIST, "utf8").split(/\s+/).filter(Boolean));
  const miss = want.filter((n) => !have.has(n));
  if (miss.length) {
    console.log(`❌ 글꼴에 없는 아이콘 ${miss.length}개: ${miss.join(", ")} — node scripts/ms-subset.mjs build`);
    process.exit(1);
  }
  console.log(`아이콘 글꼴 ${have.size}개 · 코드 ${want.length}개 모두 있음`);
} else if (mode === "build") {
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0";
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0..1,0&icon_names=${want.join(",")}&display=block`, { headers: { "User-Agent": UA } })).text();
  const url = css.match(/url\((https:[^)]+)\)/)?.[1];
  if (!url) throw new Error("글꼴 주소를 못 찾았다: " + css.slice(0, 200));
  const buf = Buffer.from(await (await fetch(url, { headers: { "User-Agent": UA } })).arrayBuffer());
  if (buf.length < 2000) throw new Error("받은 글꼴이 너무 작다");
  fs.writeFileSync(FONT, buf);
  fs.writeFileSync(LIST, want.join("\n") + "\n");
  console.log(`아이콘 ${want.length}개 → ${(buf.length / 1024).toFixed(1)}KB 저장`);
} else {
  console.log("사용: node scripts/ms-subset.mjs check|build");
  process.exit(2);
}

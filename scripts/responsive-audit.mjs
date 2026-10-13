// 태블릿·모바일 화면 점검 — 모든 라우트를 768·390 폭으로 열어 결함을 수치로 뽑는다.
// 실행: node scripts/responsive-audit.mjs [출력폴더] [폭,폭] [이메일]  (로컬 개발 서버 5180, debug 로그인)
// playwright 는 이 저장소에 없어 homebox-handoff 의 것을 쓴다(PW_PATH 로 바꿀 수 있음).
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { firefox } = require(process.env.PW_PATH || "d:/homebox-handoff/apps/worker/node_modules/playwright");

const OUT = process.argv[2] || "storage/responsive-audit";
const WIDTHS = (process.argv[3] || "768,390").split(",").map(Number);
const EMAIL = process.argv[4] || process.env.AUDIT_EMAIL;
const BASE = process.env.BASE || "http://localhost:5180";
fs.mkdirSync(OUT, { recursive: true });

const ALL_PAGES = [
  "/", "/search?q=행정", "/login", "/about", "/notice", "/help", "/contact", "/removal", "/powermcp", "/docs", "/pricing", "/legal/terms",
  "/assets", "/assets/browse", "/assets/recent", "/assets/requests",
  "/deck", "/deck/convert", "/deck/jobs", "/deck/jobs?id=" + (process.env.DECK_JOB || ""),
  "/mock", "/mock/plan", "/mock/mockups", "/mock/components",
  "/guide", "/guide/tokens", "/guide/components", "/guide/components/button", "/guide/krds", "/guide/a11y", "/guide/changelog",
  "/community", "/community/" + (process.env.POST_ID || ""), "/r/" + (process.env.REPORT_ID || ""),
  "/account", "/account/keys", "/account/saved", "/account/plan", "/account/settings", "/account/settings/deck", "/account/settings/notify",
  "/admin", "/admin/ai", "/admin/users", "/admin/point-rules", "/admin/mail", "/admin/contacts", "/admin/removals", "/admin/assets",
  "/admin/requests", "/admin/search", "/admin/deck", "/admin/deck-settings", "/admin/mockups", "/admin/mock/checklist",
  "/admin/community", "/admin/help", "/admin/changelog", "/admin/policies",
];
// ONLY="/deck/jobs?id,/r/" 처럼 앞부분이 맞는 화면만
const PAGES = process.env.ONLY ? ALL_PAGES.filter((u) => process.env.ONLY.split(",").some((p) => u.startsWith(p))) : ALL_PAGES;

function probe(vw) {
  const sel = (e) => {
    let s = e.tagName.toLowerCase();
    if (e.id) s += "#" + e.id;
    const c = (typeof e.className === "string" ? e.className : "").trim().split(/\s+/).filter(Boolean).slice(0, 3);
    if (c.length) s += "." + c.join(".");
    const t = (e.innerText || e.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 30);
    return t ? `${s} "${t}"` : s;
  };
  const vis = (e) => { const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none"; };
  const de = document.documentElement;
  const out = { overflowX: de.scrollWidth - de.clientWidth, offenders: [], innerScroll: [], smallTap: [], tinyText: 0, smallInput: [], nativeSelect: 0, wideTables: [], clipped: [] };
  // 화면 밖으로 나간 요소 — 가장 바깥 것만(자식은 생략)
  const all = [...document.body.querySelectorAll("*")];
  const seen = new Set();
  for (const e of all) {
    if (!vis(e)) continue;
    const r = e.getBoundingClientRect();
    if (r.right > vw + 1 && !seen.has(e.parentElement)) {
      let clipped = false;
      for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === "hidden" || o === "auto" || o === "scroll" || o === "clip") { clipped = true; break; }
      }
      if (!clipped) { out.offenders.push(`${sel(e)} → ${Math.round(r.right)}px`); }
      seen.add(e);
    }
    const st = getComputedStyle(e);
    if (/(auto|scroll)/.test(st.overflowY) && e.scrollHeight > e.clientHeight + 4 && e.clientHeight > 80 && e !== de && e !== document.body) {
      out.innerScroll.push(`${sel(e)} (${e.clientHeight}/${e.scrollHeight})`);
    }
    if (/(auto|scroll)/.test(st.overflowX) && e.scrollWidth > e.clientWidth + 4 && e.tagName !== "PRE" && e.tagName !== "CODE") {
      if (e.querySelector("table")) out.wideTables.push(`${sel(e)} (${e.clientWidth}/${e.scrollWidth})`);
    }
  }
  for (const e of document.querySelectorAll("button, a[href], [role=button], [role=tab], input[type=checkbox], input[type=radio], [role=switch], [role=checkbox]")) {
    if (!vis(e) || e.closest(".sr-only")) continue;
    // 고르기 칸·스위치·라디오가 글자(label)와 함께 눌리면 그 label 이 누르는 자리다
    const lab = e.closest("label") || (e.id && document.querySelector(`label[for="${CSS.escape(e.id)}"]`));
    const r = (lab && /checkbox|radio|switch/.test((e.getAttribute("role") || e.type || "") + e.className) ? lab : e).getBoundingClientRect();
    // 스위치·고르기 칸은 ::after 로 보이지 않는 누름 영역을 둔다(shadcn after:-inset, 터치 기기 44px) — 그 영역이 있으면 통과
    if (e.classList.contains("pp-hit")) continue; // 둘레 8px 누름 영역(app.css .pp-hit)
    if (/checkbox|radio|switch/.test(e.getAttribute("role") || e.type || "")) {
      const a = getComputedStyle(e, "::after");
      if (a.content !== "none" && a.position === "absolute") continue;
    }
    if ((r.height < 32 || r.width < 32) && (r.height < 24 || r.width < 24 || e.tagName !== "A")) {
      // 글 사이 링크(문단 안)는 제외
      if (e.tagName === "A" && e.closest("p, li, td") && r.height >= 18) continue;
      out.smallTap.push(`${sel(e)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
  }
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const done = new Set();
  while (walker.nextNode()) {
    const p = walker.currentNode.parentElement;
    if (!p || done.has(p) || !walker.currentNode.textContent.trim()) continue;
    done.add(p);
    if (!vis(p)) continue;
    if (parseFloat(getComputedStyle(p).fontSize) < 12 && !p.closest("svg, .mi, [class*=material]")) out.tinyText++;
  }
  for (const e of document.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=range]), textarea, select")) {
    if (!vis(e)) continue;
    const fs = parseFloat(getComputedStyle(e).fontSize);
    if (fs < 16) out.smallInput.push(`${sel(e)} ${fs}px`);
  }
  out.nativeSelect = [...document.querySelectorAll("select:not([aria-hidden=true])")].filter(vis).length;
  // 상자 안에서 잘린 줄 — 넘침은 0 인데 overflow hidden/clip 상자가 자식 요소를 오른쪽에서 자른다(말줄임은 의도라 제외)
  for (const e of document.body.querySelectorAll("*")) {
    if (!vis(e) || !e.children.length || e.closest("iframe, svg, canvas, [data-clip-ok]")) continue;
    const st = getComputedStyle(e);
    if (!/(hidden|clip)/.test(st.overflowX) || st.textOverflow === "ellipsis") continue;
    if (e.scrollWidth <= e.clientWidth + 4) continue;
    const r = e.getBoundingClientRect();
    // 자손 전체를 본다(직계 자식은 줄어들고 손자가 밀려나는 경우가 많다). 더 안쪽의 자르는 상자에 속한 것·떠 있는 것은 제외
    const cut = [...e.querySelectorAll("*")].filter((c) => {
      const cr = c.getBoundingClientRect();
      if (!(cr.width > 0 && cr.right > r.right + 2 && cr.left < r.right)) return false;
      const cs = getComputedStyle(c);
      if (cs.position === "absolute" || cs.position === "fixed" || cs.visibility === "hidden") return false;
      for (let q = c.parentElement; q && q !== e; q = q.parentElement) { const qs = getComputedStyle(q); if (/(hidden|clip|auto|scroll)/.test(qs.overflowX) || qs.textOverflow === "ellipsis" || qs.position === "absolute") return false; }
      return true;
    });
    if (cut.length) out.clipped.push(`${sel(e)} → ${cut.map((c) => sel(c)).slice(0, 2).join(", ")}`);
  }
  for (const k of ["offenders", "innerScroll", "smallTap", "smallInput", "wideTables", "clipped"]) out[k] = [...new Set(out[k])];
  return out;
}

const b = await firefox.launch();
const results = [];
for (const vw of WIDTHS) {
  const ctx = await b.newContext({ viewport: { width: vw, height: vw < 500 ? 844 : 1024 }, hasTouch: true, isMobile: false });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e.message).slice(0, 120)));
  if (EMAIL) await p.goto(`${BASE}/api/v1/auth/dev?email=${encodeURIComponent(EMAIL)}`);
  for (const url of PAGES) {
    if (url.endsWith("=") || url.endsWith("/community/") || url === "/r/") continue;
    errs.length = 0;
    try {
      await p.goto(BASE + url, { waitUntil: "networkidle", timeout: 30000 });
    } catch { /* 늦는 화면도 그대로 잰다 */ }
    await p.waitForTimeout(700);
    const r = await p.evaluate(probe, vw).catch((e) => ({ error: String(e) }));
    const name = `${vw}-${url.replace(/[/?=&]+/g, "_").replace(/^_|_$/g, "") || "home"}`.slice(0, 80);
    await p.screenshot({ path: path.join(OUT, name + ".png"), fullPage: true }).catch(() => {});
    results.push({ vw, url, finalUrl: p.url().replace(BASE, ""), errors: [...errs], ...r });
    const flag = [r.overflowX > 0 && `넘침${r.overflowX}`, r.offenders?.length && `밖${r.offenders.length}`, r.innerScroll?.length && `안쪽스크롤${r.innerScroll.length}`, r.smallTap?.length && `작은터치${r.smallTap.length}`, r.smallInput?.length && `입력${r.smallInput.length}`, r.nativeSelect && `select${r.nativeSelect}`, r.clipped?.length && `잘림${r.clipped.length}`, errs.length && `오류${errs.length}`].filter(Boolean).join(" ");
    console.log(vw, url, flag || "ok");
  }
  await ctx.close();
}
await b.close();
fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 1));
console.log("저장:", OUT);

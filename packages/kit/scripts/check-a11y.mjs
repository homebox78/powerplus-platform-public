// 접근성 자동 검사 — 미리보기 부품마다 axe-core(WCAG 2.1 A·AA) + 키보드 포커스 표시
//   node scripts/check-a11y.mjs            (dist/preview 가 있어야 한다: pnpm build)
// 두 판(React·Vue) × 두 스타일(홈박스·KRDS 원형)을 모두 돈다 → checklist/a11y-report.json
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const req = createRequire(path.join(root, "../../apps/worker/package.json")); // Firefox 는 워커가 가진 Playwright 를 쓴다
const { firefox } = req("playwright");
const axeSrc = fs.readFileSync(path.join(root, "node_modules/axe-core/axe.min.js"), "utf8");
const fileUrl = (f) => "file:///" + path.join(root, "dist/preview", f).split(path.sep).join("/");

const PAGES = [["react", "index.html"], ["vue", "vue.html"]];
const STYLES = ["powerguide", "krds"];
// 미리보기 틀(목록·검색)은 검사 대상이 아니다 — 부품 영역(.pv-demo)만 본다
const report = { at: new Date().toISOString(), runs: [] };

const browser = await firefox.launch();
for (const [fw, file] of PAGES) {
  for (const style of STYLES) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto(fileUrl(file));
    await page.waitForTimeout(1200);
    await page.evaluate((s) => (s === "krds" ? document.documentElement.setAttribute("data-hb-style", "krds") : document.documentElement.removeAttribute("data-hb-style")), style);
    await page.addScriptTag({ content: axeSrc });
    const ids = await page.$$eval("section.pv-sec[id]", (els) => els.map((e) => e.id));
    const demos = [];
    for (const id of ids) {
      // axe
      const axe = await page.evaluate(async (id) => {
        const r = await window.axe.run(`#${CSS.escape(id)} .pv-demo`, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, resultTypes: ["violations"] });
        return r.violations.map((v) => ({ rule: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, target: v.nodes[0]?.target?.join(" ") ?? "" }));
      }, id);
      // 키보드: 부품 앞에서 Tab 을 눌러 들어가며 포커스 표시(외곽선·링)가 있는지
      const focus = await page.evaluate((id) => {
        const box = document.querySelector(`#${CSS.escape(id)} .pv-demo`);
        const sel = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
        const els = [...box.querySelectorAll(sel)].filter((e) => e.getClientRects().length);
        return { focusable: els.length };
      }, id);
      let visible = 0, checked = 0, invisible = [];
      if (focus.focusable) {
        await page.evaluate((id) => {
          const b = document.createElement("button");
          b.id = "hb-a11y-probe"; b.textContent = "probe";
          document.querySelector(`#${CSS.escape(id)} .pv-demo`).before(b);
          b.focus();
        }, id);
        for (let k = 0; k < Math.min(focus.focusable, 12); k++) {
          await page.keyboard.press("Tab");
          const st = await page.evaluate((id) => {
            const a = document.activeElement;
            const box = document.querySelector(`#${CSS.escape(id)} .pv-demo`);
            if (!a || !box.contains(a)) return null;
            // 포커스 표시가 요소 자체가 아니라 짝 레이블(숨긴 체크박스 → label::before)에 그려지기도 한다
            const cands = [a, a.labels?.[0], a.closest("label"), a.parentElement].filter(Boolean);
            const ring = (x) => x && ((x.outlineStyle !== "none" && parseFloat(x.outlineWidth) > 0) || (x.boxShadow && x.boxShadow !== "none"));
            let shows = cands.some((e) => ring(getComputedStyle(e)) || (e.tagName === "LABEL" && ring(getComputedStyle(e, "::before"))));
            if (!shows) {
              // KRDS 입력칸은 외곽선 대신 테두리를 두껍고 진하게 바꿔 포커스를 보인다 — 포커스 전후 테두리를 비교한다
              const snap = () => { const s = getComputedStyle(a); return `${s.borderTopColor}|${s.borderTopWidth}|${s.backgroundColor}`; };
              const tr = a.style.transition; a.style.transition = "none"; // 전환 애니메이션 도중 값을 읽으면 전후가 같게 나온다
              a.blur(); a.focus();
              const on = snap();
              a.blur();
              const off = snap();
              a.focus();
              a.style.transition = tr;
              shows = on !== off;
            }
            return { shows, tag: a.tagName.toLowerCase(), cls: (a.className?.baseVal ?? a.className ?? "").toString().slice(0, 40), text: (a.textContent || a.getAttribute("aria-label") || "").trim().slice(0, 20) };
          }, id);
          if (!st) break;
          checked++;
          if (st.shows) visible++; else invisible.push(`${st.tag}.${st.cls} ${st.text}`);
        }
        await page.evaluate(() => document.getElementById("hb-a11y-probe")?.remove());
      }
      demos.push({ id, axe, keyboard: { focusable: focus.focusable, checked, visible, invisible: [...new Set(invisible)].slice(0, 4) } });
    }
    report.runs.push({ fw, style, demos });
    const v = demos.reduce((s, d) => s + d.axe.length, 0);
    const kb = demos.reduce((s, d) => s + d.keyboard.invisible.length, 0);
    console.log(`${fw} · ${style}: 부품 ${demos.length} · axe 위반 ${v}건(${demos.filter((d) => d.axe.length).length}종) · 포커스 안 보임 ${kb}건`);
    await page.close();
  }
}
await browser.close();
fs.mkdirSync(path.join(root, "checklist"), { recursive: true });
fs.writeFileSync(path.join(root, "checklist/a11y-report.json"), JSON.stringify(report, null, 1));

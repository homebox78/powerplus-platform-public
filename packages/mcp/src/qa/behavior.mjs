// 출처: homebox-handoff packages/mcp/src/qa/behavior.mjs 에서 가져옴 (powerMCP 이식 2026-10-06)
// 목업 동작 검사 — 눈에 보이는 조작 요소를 실제로 눌러 본다. 규약: api/data/hb-behavior.md
// MCP check_mockup(서버)과 scripts/mockup-qa.mjs(로컬)가 같이 쓴다 (2026-10-02 scripts 에서 옮김).
import fs from "node:fs";

// 이 아이콘(path d → 이름)이 단추·링크 밖에 혼자 있으면 '누를 수 있게 생겼는데 동작이 없는 것'이다 — api/data/material-icons.json 에서 뽑은 조작 아이콘
const CONTROL_D = JSON.parse(fs.readFileSync(new URL("./control-icons.json", import.meta.url), "utf8"));

/** @returns {Promise<{fails:string[], hard:string[], stats:Record<string,number>, enabled:boolean}>} */
export async function behavior(p, { force = false, errors = [] } = {}) {
  const fails = []; const hard = [];
  const chk = (ok, name, v) => { if (!ok) fails.push(`${name}${v === undefined || v === "" ? "" : ": " + (Array.isArray(v) ? [...new Set(v)].join(" | ") : v)}`); };
  await p.evaluate(() => window.scrollTo(0, 0));

  const st = await p.evaluate((CD) => {
    const vis = (el) => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && b.width > 0 && b.height > 0; };
    const lab = (el) => ((el.getAttribute("aria-label") || el.textContent || "").split(/\s+/).join(" ").trim().slice(0, 14)) || el.className || el.tagName;
    const q = (s) => [...document.querySelectorAll(s)];
    const out = {
      ready: document.documentElement.getAttribute("data-hb-ready") === "1",
      hb: q("[data-hb],[data-hb-open]").length,
      carousels: q('[data-hb="carousel"]').length, tabs: q('[data-hb="tabs"]').length, menus: q('[data-hb="menu"]').length,
      opens: q("[data-hb-open]").length, searches: q('form[data-hb="search"]').length,
      noHref: [], fake: [], fewSlides: [],
    };
    for (const a of q("a:not([href])")) if (vis(a)) out.noHref.push(lab(a));
    for (const s of q("svg")) {
      const d = s.querySelector("path")?.getAttribute("d"); const name = d && CD[d]; if (!name || !vis(s)) continue;
      if (s.closest('button,a[href],[role="button"],[role="tab"],label,summary')) continue;
      // .hb-same 장식 표시(재생·화살표)는 같은 카드 안에 실제 링크가 있으면 조작 요소가 아니다 — 안내대로 감쌌는데 계속 걸렸다(2026-10-03 시험)
      const card = s.closest(".hb-same") && s.closest('li, article, figure, [class*="card"], [class*="item"]');
      if (card && card.querySelector("a[href], button")) continue;
      out.fake.push(`${name}${s.parentElement ? " (" + lab(s.parentElement) + ")" : ""}`);
    }
    for (const c of q('[data-hb="carousel"]')) {
      const n = [...c.querySelectorAll("[data-hb-slide]")].filter((x) => x.closest('[data-hb="carousel"]') === c).length;
      const per = Math.max(1, parseInt(c.getAttribute("data-hb-per") || "1", 10));
      if (Math.ceil(n / per) < 2) out.fewSlides.push(`${lab(c)} ${n}장`);
    }
    out.noHrefN = out.noHref.length; out.noHref = [...new Set(out.noHref)].slice(0, 8);
    out.fakeN = out.fake.length; out.fake = [...new Set(out.fake)].slice(0, 8);
    return out;
  }, CONTROL_D);

  const enabled = force || st.hb > 0;
  const stats = { carousels: st.carousels, tabs: st.tabs, menus: st.menus, layers: st.opens, searches: st.searches };
  if (!enabled) return { fails, hard, stats, enabled };

  chk(!errors.length, "스크립트 오류", errors.slice(0, 3));
  chk(st.hb > 0, "동작 없음(data-hb 속성이 하나도 없다)");
  chk(st.ready, "동작 스크립트가 실행되지 않음(hb-behavior.js 누락)");
  chk(!st.noHrefN, `주소 없는 링크 ${st.noHrefN}개`, st.noHref);
  chk(!st.fakeN, `동작 없는 조작 요소 ${st.fakeN}개`, st.fake);
  chk(!st.fewSlides.length, "한 장뿐인 캐러셀", st.fewSlides);
  if (!st.ready) return { fails, hard, stats, enabled };

  // 캐러셀: 다음 → 장이 바뀐다, 이전 → 돌아온다, 정지 → 눌린다
  const car = await p.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const res = [];
    for (const [n, c] of [...document.querySelectorAll('[data-hb="carousel"]')].entries()) {
      const own = (s) => [...c.querySelectorAll(s)].filter((x) => x.closest('[data-hb="carousel"]') === c);
      const sig = () => own("[data-hb-slide]").map((s, i) => (s.hasAttribute("hidden") ? "" : i)).join(",");
      const name = `#${n + 1}${c.className ? "." + String(c.className).split(" ")[0] : ""}`;
      const next = own("[data-hb-next]")[0], prev = own("[data-hb-prev]")[0], pause = own("[data-hb-pause]")[0];
      if (!next && !prev && !own("[data-hb-dot]").length) { res.push(`${name} 넘기는 단추 없음`); continue; }
      const a = sig();
      if (next) { next.click(); await wait(30); if (sig() === a) res.push(`${name} 다음을 눌러도 그대로`); }
      if (prev) { const b = sig(); prev.click(); await wait(30); if (sig() === b) res.push(`${name} 이전을 눌러도 그대로`); else if (next && sig() !== a) res.push(`${name} 이전으로 돌아오지 않음`); }
      if (pause) { const b = pause.getAttribute("aria-pressed"); pause.click(); await wait(30); if (pause.getAttribute("aria-pressed") === b) res.push(`${name} 정지가 눌리지 않음`); else pause.click(); }
      const cur = own("[data-hb-current]")[0], vis = own("[data-hb-slide]").filter((s) => !s.hasAttribute("hidden"));
      if (cur && !vis.length) res.push(`${name} 보이는 장 없음`);
      const box = c.getBoundingClientRect(); if (box.height < 8 && !c.closest("[hidden]")) res.push(`${name} 높이 0`);
    }
    return res;
  });
  chk(!car.length, "캐러셀", car);

  // 탭: 탭마다 보이는 내용이 달라진다
  const tab = await p.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const res = [];
    for (const [n, g] of [...document.querySelectorAll('[data-hb="tabs"]')].entries()) {
      const own = (s) => [...g.querySelectorAll(s)].filter((x) => x.closest('[data-hb="tabs"]') === g);
      const ts = own("[data-hb-tab]"); const name = `#${n + 1}(${(ts[0]?.textContent || "").trim().slice(0, 8)})`;
      if (ts.length < 2) { res.push(`${name} 탭 1개`); continue; }
      const body = () => own("[data-hb-panel],[data-hb-cat]").map((x, i) => (x.hasAttribute("hidden") ? "" : i)).join(",");
      if (!own("[data-hb-panel],[data-hb-cat]").length) { res.push(`${name} 바뀔 내용 없음`); continue; }
      const first = ts.find((t) => t.getAttribute("aria-selected") === "true") || ts[0];
      const seen = new Set(); let emptyTab = "";
      for (const t of ts) {
        t.click(); await wait(20);
        if (t.getAttribute("aria-selected") !== "true") res.push(`${name} '${t.textContent.trim().slice(0, 8)}' 선택 안 됨`);
        const s = body(); seen.add(s);
        if (!s.split(",").some((x) => x !== "")) emptyTab = t.textContent.trim().slice(0, 8);
      }
      if (seen.size < 2) res.push(`${name} 탭을 눌러도 내용이 같음`);
      if (emptyTab) res.push(`${name} '${emptyTab}' 탭 내용 없음`);
      first.click(); await wait(20);
    }
    return res;
  });
  chk(!tab.length, "탭", tab);

  // 레이어: 누르면 열리고 Esc 로 닫힌다 (겹친 레이어 안의 단추는 건너뛴다)
  const lay = [];
  const opens = await p.$$("[data-hb-open]");
  for (const [n, h] of opens.entries()) {
    const info = await h.evaluate((el) => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return { vis: s.display !== "none" && s.visibility !== "hidden" && b.width > 0 && b.height > 0 && !el.closest("[hidden]"), sel: el.getAttribute("data-hb-open"), name: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 10) }; });
    if (!info.vis) continue;
    const name = `#${n + 1}(${info.name || info.sel})`;
    const state = () => p.evaluate((sel) => { const l = document.querySelector(sel); if (!l) return "none"; const b = l.getBoundingClientRect(); return l.hasAttribute("hidden") ? "hidden" : (b.width > 0 && b.height > 0 ? "open" : "zero"); }, info.sel);
    if ((await state()) === "none") { lay.push(`${name} 대상 없음`); continue; }
    await h.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await h.click({ timeout: 3000 }).catch(() => lay.push(`${name} 누를 수 없음(가려짐)`));
    await p.waitForTimeout(60);
    const s1 = await state();
    if (s1 !== "open") { lay.push(`${name} 눌러도 안 열림(${s1})`); continue; }
    // D33: 단추 옆에 붙어 열리는 작은 목록(드롭다운)은 단추와 8px 안, 아래 공간이 있으면 아래로, 고른 항목 표시가 있어야 한다
    const dd = await h.evaluate((el, sel) => {
      const l = document.querySelector(sel); const t = el.getBoundingClientRect(); const b = l.getBoundingClientRect();
      if (b.width >= innerWidth * 0.5 || b.height >= innerHeight * 0.7) return null; // 전체 메뉴·검색 같은 큰 레이어
      const items = [...l.querySelectorAll('a[href], [role="option"], button, li')].filter((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !x.querySelector("a,button"); });
      if (items.length < 3) return null;
      const below = b.top >= t.top; const gap = Math.round(below ? b.top - t.bottom : t.top - b.bottom);
      const upWithRoom = !below && innerHeight - t.bottom >= b.height + 8;
      const cur = (el.textContent || "").replace(/\s+/g, " ").trim();
      const hit = items.find((x) => { const s = (x.textContent || "").replace(/\s+/g, " ").trim(); return s && s.length >= 2 && cur.includes(s); });
      let noSel = false;
      if (hit) {
        const mark = hit.matches('[aria-selected="true"],[aria-current],[aria-checked="true"]') || !!hit.closest('[aria-selected="true"],[aria-current]');
        const st = (x) => { const c = getComputedStyle(x); return [c.fontWeight, c.backgroundColor, c.color].join("|"); };
        const other = items.find((x) => x !== hit);
        noSel = !mark && other && st(hit) === st(other);
      }
      return { gap, upWithRoom, noSel };
    }, info.sel);
    if (dd) {
      if (dd.gap > 8) lay.push(`${name} 목록이 단추와 ${dd.gap}px 떨어져 열림(8px 안으로)`);
      else if (dd.gap < -4) lay.push(`${name} 목록이 단추를 덮으며 열림(${dd.gap}px)`);
      if (dd.upWithRoom) lay.push(`${name} 아래 공간이 있는데 목록이 위로 열림`);
      if (dd.noSel) lay.push(`${name} 목록에 지금 고른 항목 표시가 없음(aria-selected·굵게·면 색)`);
    }
    await p.keyboard.press("Escape"); await p.waitForTimeout(60);
    if ((await state()) !== "hidden") { lay.push(`${name} Esc 로 안 닫힘`); await h.evaluate((el) => el.click()); }
  }
  chk(!lay.length, "레이어", lay);

  // 주 메뉴: 올리면 하위 메뉴가 보인다
  const men = [];
  const menus = await p.$$('[data-hb="menu"]');
  for (const [n, m] of menus.entries()) {
    const items = await m.$$("[data-hb-menu]");
    if (!items.length) { men.push(`#${n + 1} 항목 없음`); continue; }
    let subs = 0;
    const mega = await m.$("[data-hb-mega]"); // 전체 펼침 판 하나를 같이 쓰는 메뉴
    for (const it of items.slice(0, 3)) {
      const has = mega ? true : await it.evaluate((el) => !!el.querySelector("[data-hb-sub]")); if (!has) continue; subs++;
      await it.evaluate((el) => el.scrollIntoView({ block: "center" }));
      await it.hover({ timeout: 3000 }).catch(() => {});
      await p.waitForTimeout(80);
      const ok = mega ? await mega.evaluate((s) => { const b = s.getBoundingClientRect(); return !s.hasAttribute("hidden") && b.height > 0 && s.querySelectorAll("a[href]").length >= 2; }) : await it.evaluate((el) => { const s = el.querySelector("[data-hb-sub]"); const b = s.getBoundingClientRect(); return !s.hasAttribute("hidden") && b.height > 0 && s.querySelectorAll("a[href]").length >= 2; });
      if (!ok) { men.push(`#${n + 1} 올려도 하위 메뉴가 안 보임`); continue; }
      // D29: 펼친 판이 다른 요소(히어로 등) 뒤로 숨지 않는다 — 판 안 링크 자리에서 맨 위 요소가 판 자신이어야 한다
      // D30: 판 안 항목 이름이 주 메뉴 이름을 그대로 되풀이하지 않는다
      const pv = await (mega || it).evaluate((root, isMega) => {
        const s = isMega ? root : root.querySelector("[data-hb-sub]");
        const links = [...s.querySelectorAll("a[href]")].filter((a) => { const r = a.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).slice(0, 6);
        let hid = 0; for (const a of links) { const r = a.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; if (y < 0 || y > innerHeight) continue; const top = document.elementFromPoint(x, y); if (top && !s.contains(top)) hid++; }
        const menu = s.closest('[data-hb="menu"]'); const tops = new Set([...menu.querySelectorAll("[data-hb-menu]")].map((m) => (m.querySelector("a,button,span") || m).textContent.trim().replace(/\s+/g, " ")).filter(Boolean));
        const labs = [...s.querySelectorAll("a[href]")].map((a) => a.textContent.trim().replace(/\s+/g, " ")).filter(Boolean);
        const rep = labs.filter((t) => tops.has(t)).length;
        return { hid, n: links.length, rep, labs: labs.length };
      }, !!mega);
      if (pv.n && pv.hid >= Math.max(1, Math.ceil(pv.n / 2))) { const m = `#${n + 1} 펼친 판이 다른 요소 뒤로 숨음(링크 ${pv.hid}/${pv.n} 가려짐 — z-index)`; if (!hard.includes(m)) hard.push(m); }
      if (pv.labs >= 4 && pv.rep >= 3 && pv.rep / pv.labs >= 0.3) men.push(`#${n + 1} 펼친 판이 주 메뉴 이름을 되풀이(${pv.rep}개)`);
    }
    if (!subs) men.push(`#${n + 1} 하위 메뉴 없음`);
    await p.mouse.move(2, 2); await p.waitForTimeout(200);
    const left = await m.evaluate((el) => [...el.querySelectorAll("[data-hb-sub], [data-hb-mega]")].some((s) => !s.hasAttribute("hidden")));
    if (left) men.push(`#${n + 1} 벗어나도 안 닫힘`);
  }
  chk(!men.length, "주 메뉴", men);

  // 검색: 제출하면 결과가 나온다
  const sea = await p.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const res = [];
    for (const [n, f] of [...document.querySelectorAll('form[data-hb="search"]')].entries()) {
      const input = f.querySelector("[data-hb-q]") || f.querySelector("input[type=search]") || f.querySelector("input:not([type=hidden]):not([type=checkbox]):not([type=radio])"); let out = null;
      try { out = document.querySelector(f.getAttribute("data-hb-results") || "#hb-results"); } catch { /* 결과 영역 없음 */ }
      if (!input || !out) { res.push(`#${n + 1} 입력칸 또는 결과 상자 없음`); continue; }
      if (input.closest("[hidden]")) continue; // 레이어 안 검색은 레이어 검사에서 열림을 확인했다
      const word = ([...document.querySelectorAll("main h2, main h3")].map((h) => h.textContent.trim().split(" ")[0]).find((w) => w && w.length >= 2) || "안내").slice(0, 4);
      input.value = word; f.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true })); await wait(40);
      const b = out.getBoundingClientRect();
      if (out.hasAttribute("hidden") || b.height < 8) res.push(`#${n + 1} 제출해도 결과가 안 나옴`);
      else if (!out.querySelector("a")) res.push(`#${n + 1} '${word}' 결과 0건`);
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); input.value = "";
    }
    return res;
  });
  chk(!sea.length, "검색", sea);

  await p.evaluate(() => window.scrollTo(0, 0));
  return { fails, hard, stats, enabled };
}

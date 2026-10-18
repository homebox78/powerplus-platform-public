// 사람 눈 점검(2026-10-18) — 운영 게시 시안 w02 가 96점으로 통과했는데 사용자가 눈으로 잡은 4종(판정 미탐)을 잰다.
// C 날짜·숫자 줄바꿈: "2026.09"·"10.15" 같은 짧은 고정 꼴 글이 두 줄 이상으로 꺾임(숨은 탭 패널·캐러셀 장도 하나씩 보이게 해서 잰다)
// D 나란한 상자 안 빈 면: 같은 줄·같은 높이 상자끼리 '내용 끝' 차가 40px 넘음, 또는 한 상자 안 빈 바닥이 상자 높이의 15% 넘음
// E 글자 든 그림 잘림: 샘플 열쇠가 글자 든 그림(textKeys)인데 object-fit:cover 로 원본 비율 대비 8% 넘게 잘림(숨은 탭·캐러셀 장 포함)
// G 펼침 목록 글자 안 보임: 드롭다운·펼침판·레이어를 열었을 때 안 글자와 실제 바탕(조상 배경 합성) 대비 3:1 미만, 문서 끝 아래로 열려 잘림
// 페이지 상태는 잰 뒤 되돌린다(뒤이은 behavior 검사가 처음 상태를 보게).

/**
 * @param {import("playwright-core").Page} p
 * @param {{ textKeys?: string[] }} [o]
 * @returns {Promise<{ r: any, fails: string[], items: Array<{ kind: "C"|"D"|"E"|"G", key?: string, msg: string }> }>}
 */
export async function eyeChecks(p, o = {}) {
  const textKeys = (o.textKeys ?? []).map((k) => String(k).replace(/^pa-/, ""));
  // G 는 실제로 눌러 본다(동작 스크립트가 여는 판) — 눌러서 안 열리면 직접 보이게 한다
  const g = await openChecks(p).catch(() => ({ items: [], n: 0 }));
  const r = await p.evaluate(({ textKeys }) => {
    const tk = new Set(textKeys);
    const vis = (el) => { const s = getComputedStyle(el); const q = el.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && +s.opacity > 0.05 && q.width > 0 && q.height > 0; };
    const nm = (el) => el.tagName.toLowerCase() + (typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/)[0] : "");
    const path = (el) => `${el.parentElement ? nm(el.parentElement) + " > " : ""}${nm(el)}`;
    const Y = (q) => Math.round(q.top + scrollY);
    const key = (src) => { const q = String(src || "").split("?")[0].split("/").filter(Boolean); const n = q.pop() || ""; return /^(original|web|thumb|card)$/.test(n) ? q.pop() || "" : n; };

    // ── 숨은 탭 패널·캐러셀 장을 하나씩 보이게 하는 '보기' 목록 ──
    const hiddenNow = (e) => e.hidden || getComputedStyle(e).display === "none";
    const groups = new Map();
    for (const e of document.querySelectorAll("[data-hb-panel], [role=tabpanel], [data-hb-slide]")) { if (!e.parentElement) continue; const k = e.parentElement; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
    const views = [null];
    for (const [, list] of groups) {
      if (list.length < 2) continue; const shown = list.filter((e) => !hiddenNow(e)); const hid = list.filter(hiddenNow); if (!hid.length) continue;
      const per = Math.max(1, shown.length);
      for (let i = 0; i < hid.length; i += per) views.push({ list, show: hid.slice(i, i + per) });
    }
    const apply = (v) => { if (!v) return () => {};
      const saved = v.list.map((e) => [e, e.hidden, e.getAttribute("style")]);
      for (const e of v.list) { if (v.show.includes(e)) { e.hidden = false; if (getComputedStyle(e).display === "none") e.style.display = "block"; } else e.hidden = true; }
      return () => { for (const [e, h, st] of saved) { e.hidden = h; if (st === null) e.removeAttribute("style"); else e.setAttribute("style", st); } }; };

    // C: 짧은 고정 꼴 글(날짜·시각·숫자)
    const SHORT = [/^\d{4}\s?[.\-/]\s?\d{1,2}(\s?[.\-/]\s?\d{1,2})?\.?$/, /^\d{1,2}\s?[.\-/]\s?\d{1,2}\.?$/, /^\d{1,2}:\d{2}(:\d{2})?$/, /^\d{4}년(\s?\d{1,2}월(\s?\d{1,2}일)?)?$/, /^\d{1,2}월\s?\d{1,2}일$/,
      /^D[-−]\d{1,4}$/i, /^\d{2,4}-\d{3,4}-\d{4}$/, /^[+\-]?[\d,]+(\.\d+)?\s?(%|건|명|원|개|회|위|일|시|분|초|년|월|km|㎡|kg|℃)?$/];
    const lines = (el) => { const rg = document.createRange(); rg.selectNodeContents(el); const tops = []; for (const q of rg.getClientRects()) { if (q.width < 1 || q.height < 1) continue; if (!tops.some((t) => Math.abs(t - q.top) < q.height * 0.5)) tops.push(q.top); } return tops.length; };
    const dateHits = new Map();
    const measureC = () => {
      for (const el of document.querySelectorAll("body *")) {
        if (/^(SCRIPT|STYLE|SVG|svg|OPTION|TEXTAREA|INPUT|SELECT)$/.test(el.tagName) || el.closest("svg")) continue;
        // 자기 글만 본다(자식 글이 섞이면 "14"+"2026.10" 이 한 덩어리 "142026.10" 으로 잡힌다)
        if ([...el.children].some((k) => (k.textContent || "").trim())) continue;
        const t = (el.textContent || "").replace(/\s+/g, " ").trim(); if (!t || t.length > 12 || !/\d/.test(t) || !SHORT.some((re) => re.test(t))) continue;
        if (!vis(el) || dateHits.has(el)) continue; const n = lines(el); if (n < 2) continue;
        const q = el.getBoundingClientRect(); const box = getComputedStyle(el).display === "inline" && el.parentElement ? el.parentElement : el; const bs = getComputedStyle(box);
        const cw = box.clientWidth - parseFloat(bs.paddingLeft) - parseFloat(bs.paddingRight);
        const rg = document.createRange(); rg.selectNodeContents(el); let tw = 0; for (const z of rg.getClientRects()) tw += z.width;
        dateHits.set(el, { t, n, sel: path(el), y: Y(q), w: Math.round(cw), tw: Math.round(tw) });
      }
    };
    // E: 글자 든 그림 cover 잘림
    const cropHits = new Map();
    const measureE = () => { if (!tk.size) return;
      for (const im of document.images) { if (!im.naturalWidth || !vis(im) || cropHits.has(im)) continue; const kk = key(im.currentSrc || im.src); if (!tk.has(kk)) continue;
        const q = im.getBoundingClientRect(); if (q.width < 80 || q.height < 40) continue; const s = getComputedStyle(im); if (s.objectFit !== "cover") continue;
        const nr = im.naturalWidth / im.naturalHeight, br = q.width / q.height; const cut = 1 - Math.min(nr / br, br / nr); if (cut <= 0.08) continue;
        cropHits.set(im, { key: kk, alt: (im.alt || "").trim().slice(0, 16), y: Y(q), br: br.toFixed(2), nr: nr.toFixed(2), cut: Math.round(cut * 100), side: br < nr ? "좌우" : "위아래" }); } };
    for (const v of views) { const undo = apply(v); try { measureC(); measureE(); } finally { undo(); } }

    // D: 나란한 상자 안 빈 면
    const painted = (e) => { const s = getComputedStyle(e); const c = (s.backgroundColor.match(/[\d.]+/g) || []).map(Number); return (c.length >= 3 && (c[3] === undefined || c[3] > 0.05)) || s.backgroundImage !== "none" || parseFloat(s.borderTopWidth) > 0 && parseFloat(s.borderBottomWidth) > 0 || s.boxShadow !== "none"; };
    const LEAF = /^(IMG|svg|SVG|INPUT|BUTTON|SELECT|TEXTAREA|IFRAME|VIDEO|CANVAS|PICTURE)$/;
    const contentEnd = (box) => { const bq = box.getBoundingClientRect(); let end = -Infinity;
      for (const e of box.querySelectorAll("*")) { if (e.closest("svg") && e.tagName.toLowerCase() !== "svg") continue; if (!vis(e)) continue; const s = getComputedStyle(e); if (s.position === "absolute" || s.position === "fixed") continue;
        const q = e.getBoundingClientRect(); let b = null;
        if (LEAF.test(e.tagName)) b = q.bottom;
        else if ([...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) { const rg = document.createRange(); rg.selectNodeContents(e); const rs = [...rg.getClientRects()].filter((z) => z.height > 0); b = rs.length ? Math.max(...rs.map((z) => z.bottom)) : q.bottom; }
        else if (painted(e) && q.height < bq.height * 0.9) b = q.bottom; // 칠한 안쪽 면(카드)도 내용 — 상자 높이만큼 늘어난 감싸개는 빼고 그 안을 본다
        if (b !== null && b > end) end = b; }
      return end; };
    const boxHits = []; const seenRow = new Set();
    for (const par of document.querySelectorAll("main *, body > section, body > div")) {
      if (par.closest("header, footer, nav, [data-hb=carousel], [data-hb-track], [hidden]") || !vis(par)) continue;
      const kids = [...par.children].filter((k) => vis(k) && getComputedStyle(k).position !== "absolute").map((k) => ({ k, q: k.getBoundingClientRect() })).filter(({ q }) => q.width >= 240 && q.height >= 160);
      if (kids.length < 2) continue;
      const row = kids.filter(({ q }) => Math.abs(q.top - kids[0].q.top) < 4 && Math.abs(q.height - kids[0].q.height) < 8);
      if (row.length < 2 || row.some((a, i) => row.some((b, j) => i < j && Math.min(a.q.right, b.q.right) - Math.max(a.q.left, b.q.left) > 2))) continue;
      // 상자 = 자기가 칠해졌거나(테두리·바탕·그림자) 바로 안 한 겹이 칠해진 칸
      const cells = row.map(({ k, q }) => { let box = k; if (!painted(k)) { const only = [...k.children].filter(vis); if (only.length === 1 && painted(only[0]) && only[0].getBoundingClientRect().height >= q.height - 4) box = only[0]; }
        const s = getComputedStyle(box); const bq = box.getBoundingClientRect(); const inner = bq.bottom - parseFloat(s.paddingBottom) - parseFloat(s.borderBottomWidth);
        const end = contentEnd(box); return { box, h: bq.height, inner, end, empty: Math.round(inner - end), pad: parseFloat(s.paddingBottom), ok: painted(box) && Number.isFinite(end) }; });
      if (!cells.every((c) => c.ok)) continue;
      const ends = cells.map((c) => c.end); const diff = Math.round(Math.max(...ends) - Math.min(...ends));
      const worst = cells.reduce((a, c) => (c.empty / c.h > a.empty / a.h ? c : a));
      if (diff > 40 || worst.empty > worst.h * 0.15) { const id = cells.map((c) => nm(c.box)).join("|") + Y(row[0].q); if (seenRow.has(id)) continue; seenRow.add(id);
        boxHits.push({ y: Y(row[0].q), h: Math.round(worst.h), diff, cells: cells.map((c) => ({ name: nm(c.box), empty: c.empty, pct: Math.round((c.empty / c.h) * 100) })), worst: nm(worst.box), worstEmpty: worst.empty }); }
    }
    return { date: [...dateHits.values()], crop: [...cropHits.values()], boxes: boxHits.slice(0, 6), views: views.length - 1, tk: tk.size };
  }, { textKeys });

  /** @type {Array<{ kind: "C"|"D"|"E"|"G", key?: string, msg: string }>} */
  const items = [];
  // C: 같은 자리(선택자)끼리 묶어 한 줄로
  { const by = new Map(); for (const d of r.date) { const k = d.sel; if (!by.has(k)) by.set(k, []); by.get(k).push(d); }
    for (const [sel, ds] of [...by].slice(0, 4)) { const d = ds[0];
      items.push({ kind: "C", msg: `날짜·숫자 줄바꿈 · "${d.t}" 가 ${d.n}줄로 꺾임(${sel}, y ${d.y}${ds.length > 1 ? ` 외 ${ds.length - 1}곳` : ""}, 글 ${d.tw}px · 칸 ${d.w}px) — 짧은 고정 꼴 글은 white-space:nowrap 을 주고 칸 폭을 글 폭+여백 이상으로 넓힌다(숨은 탭 패널도 같은 칸)` }); } }
  for (const b of r.boxes) items.push({ kind: "D", msg: `나란한 상자 빈 면 · y ${b.y} 같은 높이 상자 ${b.cells.length}개 중 ${b.worst} 안쪽 바닥이 ${b.worstEmpty}px 빔(${b.cells.map((c) => `${c.name} ${c.empty}px·${c.pct}%`).join(" | ")}, 내용 끝 차 ${b.diff}px) — 짧은 쪽에 목록 한두 줄·더보기를 채우거나 상자 높이를 내용대로(align-items:start) 두고 긴 쪽을 줄인다` });
  for (const c of r.crop) items.push({ kind: "E", key: c.key, msg: `글자 든 그림 잘림 · ${c.alt || c.key}(${c.key}, y ${c.y}) ${c.side} ${c.cut}% 잘림(자리 ${c.br} vs 그림 ${c.nr}, object-fit:cover) — 글자 든 그림은 object-fit:contain 이나 칸 aspect-ratio:${c.nr} 로 그림 비율에 맞춘다` });
  items.push(...g.items);
  return { r: { ...r, opened: g.n }, fails: items.map((x) => x.msg), items };
}

/** G: 펼침판을 열어 안 글자 대비·문서 끝 아래 잘림을 잰다. 연 것은 되돌린다. */
async function openChecks(p) {
  const n = await p.evaluate(() => {
    const vis = (el) => { const s = getComputedStyle(el); const q = el.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && q.width > 0 && q.height > 0; };
    const list = [];
    for (const t of document.querySelectorAll("[data-hb-open], [aria-controls][aria-expanded], [aria-haspopup][aria-controls], details > summary")) {
      if (!vis(t) || t.closest("[hidden]")) continue;
      let target = null;
      if (t.tagName === "SUMMARY") target = t.parentElement;
      else { const sel = t.getAttribute("data-hb-open") || ""; try { target = sel ? document.querySelector(sel.startsWith("#") || sel.startsWith(".") || sel.startsWith("[") ? sel : "#" + sel) : null; } catch { target = null; } if (!target) target = document.getElementById(t.getAttribute("aria-controls") || ""); }
      if (!target || target === document.body || target.contains(t) && t.tagName !== "SUMMARY") continue;
      if (t.tagName !== "SUMMARY" && vis(target)) continue; // 이미 열려 있는 판(탭 등)은 G 대상이 아니다
      t.setAttribute("data-qa-eye-open", String(list.length)); target.setAttribute("data-qa-eye-tgt", String(list.length)); list.push(1);
      if (list.length >= 12) break;
    }
    return list.length;
  });
  const items = [];
  for (let i = 0; i < n; i++) {
    const res = await p.evaluate(async (i) => {
      const t = document.querySelector(`[data-qa-eye-open="${i}"]`), tg = document.querySelector(`[data-qa-eye-tgt="${i}"]`); if (!t || !tg) return null;
      const vis = (el) => { const s = getComputedStyle(el); const q = el.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && +s.opacity > 0.05 && q.width > 0 && q.height > 0; };
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const snap = [t, tg, tg.parentElement, t.parentElement].filter(Boolean).map((e) => [e, e.getAttribute("class"), e.getAttribute("style"), e.hidden, e.getAttribute("aria-expanded"), e.hasAttribute("open")]);
      const H0 = document.documentElement.scrollHeight;
      t.scrollIntoView({ block: "center", behavior: "instant" });
      let how = "눌러서";
      if (t.tagName === "BUTTON" || t.tagName === "SUMMARY") { t.click(); await wait(200); }
      if (!vis(tg)) { how = "직접 열어"; tg.hidden = false; if (tg.tagName === "DETAILS") tg.open = true; if (getComputedStyle(tg).display === "none") tg.style.display = "block"; if (getComputedStyle(tg).visibility === "hidden") tg.style.visibility = "visible"; await wait(60); }
      const out = { label: ((t.getAttribute("aria-label") || t.textContent || "").replace(/\s+/g, " ").trim()).slice(0, 16), how, low: [], below: 0, clip: 0, n: 0 };
      if (vis(tg)) {
        const rgba = (c) => { const v = (String(c).match(/[\d.]+/g) || []).map(Number); return v.length >= 3 ? [v[0], v[1], v[2], v[3] === undefined ? 1 : v[3]] : [0, 0, 0, 0]; };
        const lum = ([r, g, b]) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        const over = (top, base) => { const a = top[3]; return [top[0] * a + base[0] * (1 - a), top[1] * a + base[1] * (1 - a), top[2] * a + base[2] * (1 - a), 1]; };
        // 실제 바탕 = 조상 배경색을 아래(뿌리)부터 합성. 그림·그라데이션 바탕이 끼면 픽셀을 모르므로 재지 않는다
        const bgOf = (el) => { const st = []; for (let a = el; a; a = a.parentElement) { const s = getComputedStyle(a); if (s.backgroundImage !== "none") return null; const c = rgba(s.backgroundColor); if (c[3] > 0) { st.push(c); if (c[3] >= 1) break; } } let base = [255, 255, 255, 1]; for (const c of st.reverse()) base = over(c, base); return base; };
        for (const e of tg.querySelectorAll("*")) {
          if (![...e.childNodes].some((x) => x.nodeType === 3 && x.textContent.trim().length > 0) || !vis(e)) continue;
          const bg = bgOf(e); if (!bg) continue; const fc = over(rgba(getComputedStyle(e).color), bg); out.n++;
          const L1 = lum(fc), L2 = lum(bg); const cr = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
          if (cr < 3) out.low.push({ t: (e.textContent || "").trim().slice(0, 12), cr: Math.round(cr * 100) / 100, fg: getComputedStyle(e).color, bg: `rgb(${bg.slice(0, 3).map(Math.round).join(",")})` });
        }
        const q = tg.getBoundingClientRect(); const bottom = q.bottom + scrollY;
        if (bottom > H0 + 2) out.below = Math.round(bottom - H0);
        for (let a = tg.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) { const s = getComputedStyle(a); if (s.overflowY === "visible" && s.overflowX === "visible") continue; const ab = a.getBoundingClientRect(); if (ab.bottom < q.bottom - 2) { out.clip = Math.round(q.bottom - ab.bottom); break; } }
      }
      // 되돌린다
      if (out.how === "눌러서" && (t.tagName === "BUTTON" || t.tagName === "SUMMARY")) { t.click(); await wait(120); }
      for (const [e, c, st, h, ax, op] of snap) { if (c === null) e.removeAttribute("class"); else e.setAttribute("class", c); if (st === null) e.removeAttribute("style"); else e.setAttribute("style", st); e.hidden = h; if (ax === null) e.removeAttribute("aria-expanded"); else e.setAttribute("aria-expanded", ax); if (e.tagName === "DETAILS") e.open = op; }
      t.removeAttribute("data-qa-eye-open"); tg.removeAttribute("data-qa-eye-tgt");
      return out;
    }, i).catch(() => null);
    if (!res) continue;
    if (res.low.length) { const w = res.low[0]; items.push({ kind: "G", msg: `펼침판 글자 안 보임 · '${res.label}' 을 ${res.how} 연 판의 글 ${res.low.length}/${res.n}곳이 바탕과 대비 ${w.cr}:1("${w.t}" 글자 ${w.fg} · 실제 바탕 ${w.bg}) — 판 안 글자색을 판 바탕에 맞게 따로 준다(부모 띠의 흰 글자색이 상속·덮어쓰기됐는지 본다, 3:1 이상)` }); }
    if (res.below || res.clip) items.push({ kind: "G", msg: `펼침판 잘림 · '${res.label}' 을 연 판이 ${res.below ? `문서 끝 아래로 ${res.below}px 넘쳐 열린다` : `감싼 칸(overflow)에 ${res.clip}px 잘린다`} — 화면 아래쪽 판은 위로 연다(bottom:100%·top:auto)` });
  }
  await p.evaluate(() => { document.activeElement?.blur?.(); scrollTo(0, 0); }).catch(() => {});
  return { items, n };
}

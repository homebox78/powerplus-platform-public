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

// K 같은 묶음 일관성(2026-10-18 사용자 최우선 기준: "한 섹션 내 좌우 균형이 제일 중요함, 이미지 노출 시에 비율도.
//   어떤 건 길고 어떤 건 짧고 어떤 건 찌그러지고 어떤 건 줄바꿈되고 — 이런 일관성 없음이 사이트의 퀄리티를 낮게 한다")
// 같은 부모 아래 반복되는 형제 묶음(같은 태그·같은 첫 class, 3개 이상 — 또는 가로로 나란한 카드 2개 이상)에서
//  height 같은 줄 상자 높이 차 > 8px(칠한 상자만 — 같은 높이로 늘어나 있으면 안쪽 내용 끝 차)
//  ratio  형제끼리 그림 상자 비율 3% 넘게 다름 / object-fit:fill 로 원본 비율과 5% 넘게 달라 찌그러짐
//  title  제목 줄 수가 형제마다 다름 / desc 설명 줄 수 차 2줄 이상 / btn 단추·더보기 바닥 위치 차 > 8px
// 머리·바닥·메뉴·탭 단추·표, 캐러셀에서 화면 밖·잘려 안 보이는 장, 폭이 무리 중앙값과 10% 넘게 다른 형제(큰 대표 카드)는 뺀다.

/**
 * @param {import("playwright-core").Page} p
 * @returns {Promise<{ r: any, fails: string[], items: Array<{ kind: "K", sub: "height"|"ratio"|"title"|"desc"|"btn", msg: string }> }>}
 */
export async function consistencyChecks(p) {
  const r = await p.evaluate(() => {
    const vis = (el) => { const s = getComputedStyle(el); const q = el.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && +s.opacity > 0.05 && q.width > 0 && q.height > 0; };
    const cls1 = (el) => (typeof el.className === "string" ? el.className.trim().split(/\s+/).filter((c) => c && !/^(is-|on$|active$|current$|selected$|show$|open$|swiper-slide-)/.test(c))[0] : "") || "";
    const sig = (el) => el.tagName.toLowerCase() + (cls1(el) ? "." + cls1(el) : "");
    const Y = (q) => Math.round(q.top + scrollY);
    const painted = (e) => { const s = getComputedStyle(e); const c = (s.backgroundColor.match(/[\d.]+/g) || []).map(Number); return (c.length >= 3 && (c[3] === undefined || c[3] > 0.05)) || s.backgroundImage !== "none" || (parseFloat(s.borderTopWidth) > 0 && parseFloat(s.borderBottomWidth) > 0) || s.boxShadow !== "none"; };
    // 화면 밖·감싼 칸(overflow)에 잘려 안 보이는 장(캐러셀 숨은 장)
    const shown = (el) => { const q = el.getBoundingClientRect(); if (q.right <= 1 || q.left >= innerWidth - 1) return false;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const s = getComputedStyle(a); if (s.overflowX === "visible" && s.overflowY === "visible") continue; const b = a.getBoundingClientRect();
        const iw = Math.min(q.right, b.right) - Math.max(q.left, b.left), ih = Math.min(q.bottom, b.bottom) - Math.max(q.top, b.top); if (iw < q.width * 0.5 || ih < q.height * 0.5) return false; }
      return true; };
    // 보이는 줄 수 — 말줄임(line-clamp·overflow:hidden)으로 잘려 안 보이는 줄은 세지 않는다
    const lines = (el) => { const s = getComputedStyle(el); const cut = s.overflowY !== "visible" || s.overflow !== "visible" ? el.getBoundingClientRect().bottom - 1 : Infinity;
      const rg = document.createRange(); rg.selectNodeContents(el); const tops = []; for (const q of rg.getClientRects()) { if (q.width < 1 || q.height < 1 || q.top >= cut) continue; if (!tops.some((t) => Math.abs(t - q.top) < q.height * 0.5)) tops.push(q.top); } return tops.length; };
    const ownText = (e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const LEAF = /^(IMG|svg|SVG|INPUT|BUTTON|SELECT|TEXTAREA|IFRAME|VIDEO|CANVAS|PICTURE)$/;
    const contentEnd = (box) => { const bq = box.getBoundingClientRect(); let end = -Infinity;
      for (const e of box.querySelectorAll("*")) { if (e.closest("svg") && e.tagName.toLowerCase() !== "svg") continue; if (!vis(e)) continue; const s = getComputedStyle(e); if (s.position === "absolute" || s.position === "fixed") continue;
        const q = e.getBoundingClientRect(); let b = null;
        if (LEAF.test(e.tagName)) b = q.bottom;
        else if (ownText(e)) { const rg = document.createRange(); rg.selectNodeContents(e); const rs = [...rg.getClientRects()].filter((z) => z.height > 0); b = rs.length ? Math.max(...rs.map((z) => z.bottom)) : q.bottom;
          // 말줄임(line-clamp·overflow:hidden)으로 잘린 줄은 안 보인다 — 자르는 조상(상자 안) 바닥까지만
          for (let a = e; a && a !== box; a = a.parentElement) { const as = getComputedStyle(a); if (as.overflowY !== "visible") b = Math.min(b, a.getBoundingClientRect().bottom); } }
        else if (painted(e) && q.height < bq.height * 0.9) b = q.bottom;
        if (b !== null && b > end) end = b; }
      return end; };
    const TITLE = "h2,h3,h4,h5,strong,b,dt,[class*=tit],[class*=Tit],[class*=name],[class*=head]";
    const hasText = (e) => !!(e.textContent || "").trim();
    const titleOf = (m) => { for (const e of m.querySelectorAll(TITLE)) { if (!vis(e) || e.closest("button") || !hasText(e)) continue; if ([...e.querySelectorAll(TITLE)].some((k) => vis(k) && hasText(k))) continue; return e; }
      for (const e of m.querySelectorAll("*")) { if (vis(e) && ownText(e) && +getComputedStyle(e).fontWeight >= 600 && !e.closest("button,a[class*=btn],a[class*=more]")) return e; } return null; };
    const descOf = (m, t) => { for (const e of m.querySelectorAll("p,[class*=desc],[class*=txt],[class*=text],dd")) { if (!vis(e) || e === t || (t && (t.contains(e) || e.contains(t))) || !hasText(e)) continue; return e; } return null; };
    const BTN = /더보기|자세히|바로\s?가기|보기|신청|더 알아보기|more|view|→|›|＞|>/i;
    // 상자 아래쪽 절반의 단추·더보기만(머리 옆 + 단추는 위치 비교 대상이 아니다)
    const btnOf = (m) => { const mq = m.getBoundingClientRect(); const c = [...m.querySelectorAll("a,button")].filter((e) => vis(e) && e.getBoundingClientRect().top > mq.top + mq.height * 0.5 && ((typeof e.className === "string" && /btn|more|link|go/i.test(e.className)) || BTN.test((e.textContent || "").trim().slice(0, 14))));
      return c.length ? c[c.length - 1] : null; };
    const imgOf = (m) => { for (const e of m.querySelectorAll("img,picture,[style*=background-image],[class*=thumb],[class*=img],[class*=photo]")) { if (!vis(e)) continue; const q = e.getBoundingClientRect(); if (q.width < 120 || q.height < 80) continue; // 아이콘(모양마다 비율이 다른 게 정상)은 빼고 사진·썸네일만
        const im = e.tagName === "IMG" ? e : e.querySelector("img"); if (e.tagName !== "IMG" && !im && getComputedStyle(e).backgroundImage === "none") continue; return { box: im && vis(im) ? im : e, im }; } return null; }; // box = 눈에 보이는 그림 자체(감싼 칸이 아니라)
    const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    const struct = (el) => { const sq = []; for (const c of el.children) { if (!vis(c)) continue; const s = sig(c); if (sq[sq.length - 1] !== s) sq.push(s); } return sq.join(">"); };
    const sameRow = (a, b) => Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) >= Math.min(a.height, b.height) * 0.7;
    const top1 = (els) => { const c = new Map(); for (const e of els) if (e) c.set(sig(e), (c.get(sig(e)) || 0) + 1); return [...c].sort((a, b) => b[1] - a[1])[0]; };

    const out = { height: [], ratio: [], title: [], desc: [], btn: [], groups: 0, seen: [] };
    for (const par of document.querySelectorAll("body *")) {
      if (par.closest("header, footer, nav, [role=tablist], table, form, select, svg, [hidden], [aria-hidden=true]") || !vis(par)) continue;
      const kids = [...par.children].filter((k) => !/^(SCRIPT|STYLE|TEMPLATE|BR|HR)$/.test(k.tagName) && vis(k) && !/^(absolute|fixed)$/.test(getComputedStyle(k).position) && shown(k));
      if (kids.length < 2) continue;
      const bySig = new Map(); for (const k of kids) { const s = sig(k); if (!bySig.has(s)) bySig.set(s, []); bySig.get(s).push(k); }
      for (const [s, all] of bySig) {
        let ms = all.map((k) => ({ k, q: k.getBoundingClientRect() })).filter(({ q }) => q.width >= 100 && q.height >= 60);
        if (ms.length < 2) continue;
        const mw = med(ms.map((m) => m.q.width)); ms = ms.filter((m) => Math.abs(m.q.width - mw) <= mw * 0.1);
        // 같은 꼴만 — 안 구성(자식 태그·class 차례)이 같은 형제끼리. 겉 class 만 같은 서로 다른 판(공지 탭 판·배너 판·달력 판)은 묶음이 아니다
        { const cnt = new Map(); for (const m of ms) { m.st = (m.k.getAttribute("data-wire-cell") || "") + "|" + struct(m.k); cnt.set(m.st, (cnt.get(m.st) || 0) + 1); }
          const best = [...cnt].sort((a, b) => b[1] - a[1])[0]; ms = ms.filter((m) => m.st === best[0]); }
        if (ms.length < 2) continue;
        // 세로로만 쌓인 목록(소식 줄 목록)은 이 검사 대상이 아니다
        if (!ms.some((a, i) => ms.some((b, j) => i < j && sameRow(a.q, b.q)))) continue;
        // 3개 이상, 또는 2개면 카드꼴(그림이나 제목이 있고 높이 120 이상)
        if (ms.length < 3 && !ms.every((m) => m.q.height >= 120 && (imgOf(m.k) || titleOf(m.k)))) continue;
        out.groups++;
        const tag = { y: Y(ms[0].q), name: `${sig(par)} > ${s}`, n: ms.length };
        if (out.seen.length < 20) out.seen.push(`y ${tag.y} ${tag.name}×${tag.n}`);
        const rows = []; for (const m of ms) { const row = rows.find((rw) => sameRow(rw[0].q, m.q)); if (row) row.push(m); else rows.push([m]); }
        // 1) 높이 — 칠한 상자만(칠하지 않은 칸은 높이가 눈에 안 보인다)
        for (const rw of rows) { if (rw.length < 2) continue;
          const cells = rw.map(({ k }) => { let box = k; if (!painted(k)) { const only = [...k.children].filter(vis); if (only.length === 1 && painted(only[0])) box = only[0]; } return { box, q: box.getBoundingClientRect(), ok: painted(box) }; });
          if (!cells.every((c) => c.ok)) continue;
          const hs = cells.map((c) => Math.round(c.q.height)); const hd = Math.max(...hs) - Math.min(...hs);
          if (hd > 8) { out.height.push({ ...tag, y: Y(cells[0].q), how: "box", hs, d: hd }); break; }
          const ends = cells.map((c) => contentEnd(c.box) - c.q.top); if (!ends.every(Number.isFinite)) continue;
          const ed = Math.round(Math.max(...ends) - Math.min(...ends));
          if (ed > 8) { out.height.push({ ...tag, y: Y(cells[0].q), how: "end", hs: ends.map(Math.round), d: ed, box: hs[0] }); break; } }
        // 2) 그림 비율
        { const ims = ms.map((m) => imgOf(m.k)).filter(Boolean);
          if (ims.length >= 2 && ims.length >= ms.length - 1) {
            const rs = ims.map(({ box }) => { const q = box.getBoundingClientRect(); return q.width / q.height; }); const lo = Math.min(...rs), hi = Math.max(...rs);
            if (hi / lo > 1.03) out.ratio.push({ ...tag, how: "box", rs: rs.map((x) => x.toFixed(2)), d: Math.round((hi / lo - 1) * 100) });
            const sq = ims.filter(({ im }) => im && im.naturalWidth > 0 && im.naturalHeight > 0 && getComputedStyle(im).objectFit === "fill" && !/\.svg(\?|$)/i.test(im.currentSrc || im.src))
              .map(({ im }) => { const q = im.getBoundingClientRect(); const nr = im.naturalWidth / im.naturalHeight, br = q.width / q.height; return { nr, br, k: Math.max(nr / br, br / nr) }; }).filter((x) => x.k > 1.05);
            if (sq.length) { const w = sq.reduce((a, b) => (b.k > a.k ? b : a)); out.ratio.push({ ...tag, how: "fill", cnt: sq.length, nr: w.nr.toFixed(2), br: w.br.toFixed(2), d: Math.round((w.k - 1) * 100) }); } } }
        // 3) 제목 줄 수 · 4) 설명 줄 수
        { const ts = ms.map((m) => titleOf(m.k)); const main = top1(ts);
          if (main && main[1] >= 2) { const tt = ts.filter((t) => t && sig(t) === main[0]); const ln = tt.map(lines); const hi = Math.max(...ln);
            if (hi !== Math.min(...ln)) out.title.push({ ...tag, tsel: main[0], ln, ex: (tt[ln.indexOf(hi)].textContent || "").replace(/\s+/g, " ").trim().slice(0, 18) }); }
          const ds = ms.map((m, i) => descOf(m.k, ts[i])); const dm = top1(ds);
          if (dm && dm[1] >= 2) { const dl = ds.filter((d) => d && sig(d) === dm[0]).map(lines); if (Math.max(...dl) - Math.min(...dl) >= 2) out.desc.push({ ...tag, dsel: dm[0], ln: dl }); } }
        // 4) 단추·더보기 바닥 위치(같은 줄)
        for (const rw of rows) { if (rw.length < 2) continue; const bs = rw.map((m) => btnOf(m.k)); if (bs.some((b) => !b)) continue;
          const bb = bs.map((b) => Math.round(b.getBoundingClientRect().bottom)); const lo = Math.min(...bb), d = Math.max(...bb) - lo;
          if (d > 8) { out.btn.push({ ...tag, y: Y(rw[0].q), bsel: sig(bs[0]), bb: bb.map((v) => v - lo), d }); break; } }
      }
    }
    for (const k of ["height", "ratio", "title", "desc", "btn"]) out[k] = out[k].slice(0, 6);
    return out;
  });

  /** @type {Array<{ kind: "K", sub: "height"|"ratio"|"title"|"desc"|"btn", msg: string }>} */
  const items = [];
  for (const h of r.height) items.push({ kind: "K", sub: "height", msg: h.how === "box"
    ? `높이 들쭉날쭉 · y ${h.y} ${h.name} 같은 줄 ${h.hs.length}개 높이가 ${h.hs.join("/")}px(차 ${h.d}px) — 줄을 grid·flex 로 두고 align-items:stretch 로 상자 높이를 같게, 단추는 margin-top:auto 로 바닥에 붙인다`
    : `높이 들쭉날쭉 · y ${h.y} ${h.name} 같은 줄 ${h.hs.length}개 상자(높이 ${h.box}px)는 같은데 안쪽 내용 끝이 상자 위에서 ${h.hs.join("/")}px(차 ${h.d}px) — 글 길이를 맞추거나(제목 한 줄·설명 같은 줄 수) 마지막 요소를 margin-top:auto 로 바닥에 붙여 끝선을 맞춘다` });
  for (const x of r.ratio) items.push({ kind: "K", sub: "ratio", msg: x.how === "box"
    ? `그림 비율 불일치 · y ${x.y} ${x.name} ${x.n}개의 그림 상자 비율이 ${x.rs.join("/")}(차 ${x.d}%) — 그림 칸에 같은 aspect-ratio(예 16/10)를 주고 img 는 width:100%;height:100%;object-fit:cover 로 채운다`
    : `그림 찌그러짐 · y ${x.y} ${x.name} 그림 ${x.cnt}장이 object-fit:fill(폭·높이 고정)로 원본 ${x.nr} 을 자리 ${x.br} 에 늘려 ${x.d}% 찌그러짐 — object-fit:cover(글자 든 그림은 contain)를 주거나 칸을 그림 비율(aspect-ratio)로 둔다` });
  for (const t of r.title) items.push({ kind: "K", sub: "title", msg: `제목 줄 수 불일치 · y ${t.y} ${t.name} ${t.n}개의 제목(${t.tsel})이 ${t.ln.join("/")}줄("${t.ex}" 가 ${Math.max(...t.ln)}줄) — 제목을 짧게 줄여 한 줄로 맞추거나 white-space:nowrap;overflow:hidden;text-overflow:ellipsis(두 줄이면 -webkit-line-clamp:2 + 높이 고정)로 줄 수를 같게 한다` });
  for (const d of r.desc) items.push({ kind: "K", sub: "desc", msg: `설명 줄 수 차 · y ${d.y} ${d.name} ${d.n}개의 설명(${d.dsel})이 ${d.ln.join("/")}줄(차 ${Math.max(...d.ln) - Math.min(...d.ln)}줄) — 설명 길이를 비슷하게 맞추거나 -webkit-line-clamp 로 줄 수를 같게 한다` });
  for (const b of r.btn) items.push({ kind: "K", sub: "btn", msg: `단추 위치 들쭉날쭉 · y ${b.y} ${b.name} 같은 줄 단추(${b.bsel}) 바닥이 ${b.bb.join("/")}px 어긋남(차 ${b.d}px) — 카드를 flex-direction:column 으로 두고 단추에 margin-top:auto 를 줘 상자 바닥에 맞춘다` });
  return { r, fails: items.map((x) => x.msg), items };
}

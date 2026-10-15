// 구성·균형 검사 — 사용자 눈 점검(2026-10-15, 시안 20장에서 지적 20건)을 코드로 잡는다. 오류 재발 방지 R35.
// 판정 점수와 별개로 '통과했는데 엉성한' 시안을 막는다: 좌우 칸 불균형·빈 칸·성긴 칸·테두리에 걸친 제목·아이콘 단추 중심·
// 이미지 비율·가려진 배경·첫 화면 히어로·바닥글 아래 빈 띠·같은 게시판 목록 두 번·굴러가지 않는 팝업존·글자 그림 잘림.
// 계측 근거: scratchpad hp/ux9 — 지적받은 화면(s01·s04·s07·s08)에서 먼저 걸리는지 음성 대조 후 옮김(R14).

/** @param {import("playwright-core").Page} p @param {{ textKeys?: string[], iconKeys?: string[], viewportH?: number, sub?: boolean, org?: string }} [o] */
export async function layoutChecks(p, o = {}) {
  const r = await p.evaluate(({ textKeys, iconKeys, VH, isSub, org }) => {
    const W = innerWidth; const tk = new Set(textKeys || []);
    const vis = (el) => { const s = getComputedStyle(el); const q = el.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && +s.opacity > 0.05 && q.width > 0 && q.height > 0; };
    const nm = (el) => el.tagName.toLowerCase() + (typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/)[0] : "");
    const Y = (q) => Math.round(q.top + scrollY);
    const transparent = (c) => !c || /rgba\(0, 0, 0, 0\)|transparent/.test(c);
    // 위·아래 어느 테두리든 칠한 것으로 — 행 선이 border-bottom 인 게시판 표가 '넓은 목록 성김'으로 걸리던 것(일괄 수정 배치3)
    const painted = (el) => { const s = getComputedStyle(el); return !transparent(s.backgroundColor) || s.backgroundImage !== "none" || parseFloat(s.borderTopWidth) > 0 || parseFloat(s.borderBottomWidth) > 0 || s.boxShadow !== "none"; };
    const bgOf = (el) => { for (let n = el; n; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; if (!transparent(c)) return c; } return "rgb(255, 255, 255)"; };
    const key = (src) => { const q = String(src || "").split("?")[0].split("/").filter(Boolean); const n = q.pop() || ""; return /^(original|web|thumb|card)$/.test(n) ? q.pop() || "" : n; };
    const out = { balance: [], cardEmpty: [], sparse: [], straddle: [], iconOff: [], crop: [], bgPartial: [], hero: [], footTail: [], dupList: [], popupZone: [] };
    const all = [...document.querySelectorAll("body *")].filter((e) => !/^(SCRIPT|STYLE|svg|path|BR|NOSCRIPT)$/i.test(e.tagName));
    // 내용 조각(문서 좌표) — 겹침 순서와 무관하게 '무엇이 있는가'로 잰다(캐러셀 덮개가 사진을 가려도 사진은 내용)
    const leaves = [];
    { const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = tw.nextNode())) { const pe = n.parentElement; if (!n.nodeValue.trim() || !pe || pe.closest("script,style") || !vis(pe)) continue; const rg = document.createRange(); rg.selectNodeContents(n); for (const q of rg.getClientRects()) if (q.width > 1) leaves.push({ el: pe, l: q.left, t: q.top + scrollY, r: q.right, b: q.bottom + scrollY }); } }
    for (const e of all) { if (!vis(e)) continue; const s = getComputedStyle(e); if (/^(IMG|VIDEO|IFRAME|CANVAS|INPUT|SELECT|TEXTAREA)$/.test(e.tagName) || s.backgroundImage !== "none" || painted(e)) { const q = e.getBoundingClientRect(); leaves.push({ el: e, l: q.left, t: q.top + scrollY, r: q.right, b: q.bottom + scrollY }); } }
    for (const e of document.querySelectorAll("svg")) { if (!vis(e)) continue; const q = e.getBoundingClientRect(); leaves.push({ el: e, l: q.left, t: q.top + scrollY, r: q.right, b: q.bottom + scrollY }); }
    const fill = (box, area) => { const q = area || box.getBoundingClientRect(); const L = q.left, T = q.top + scrollY, R = q.right, B = q.bottom + scrollY;
      const mine = leaves.filter((z) => z.el !== box && box.contains(z.el) && z.r > L && z.l < R && z.b > T && z.t < B);
      let f = 0, n = 0; for (let i = 0; i < 24; i++) for (let j = 0; j < 16; j++) { const x = L + ((i + 0.5) * (R - L)) / 24, y = T + ((j + 0.5) * (B - T)) / 16; n++; if (mine.some((z) => x >= z.l && x <= z.r && y >= z.t && y <= z.b)) f++; } return f / n; };

    // ① 나란한 큰 칸: 바닥 차(좌우 높이·내용량 불균형) / ③ 칸 자리(줄 높이 × 칸 폭) 안 내용이 성김
    const seen = new Set();
    for (const p of all) {
      if (!vis(p) || p.closest("header, footer, [data-hb=menu]")) continue; const pr = p.getBoundingClientRect(); if (pr.height < 200) continue;
      const kids = [...p.children].filter((k) => vis(k) && getComputedStyle(k).position !== "absolute" && k.getBoundingClientRect().width >= W * 0.22 && k.getBoundingClientRect().height >= 120);
      if (kids.length < 2) continue;
      const rs = kids.map((k) => k.getBoundingClientRect()); if (!rs.every((q, i) => i === 0 || q.left >= rs[i - 1].right - 4)) continue;
      if (Math.max(...rs.map((q) => q.top)) - Math.min(...rs.map((q) => q.top)) > 120) continue;
      const lnb = kids.some((k) => k.matches("nav, aside, [class*=lnb], [class*=snb]")); if (lnb) continue;
      const bots = rs.map((q) => q.bottom), hs = rs.map((q) => q.height), d = Math.max(...bots) - Math.min(...bots);
      if (d > 60 && d > Math.max(...hs) * 0.15 && !seen.has(Y(rs[0]))) { seen.add(Y(rs[0])); out.balance.push(`${nm(p)} y${Y(rs[0])} 나란한 칸 바닥 차 ${Math.round(d)}px(${hs.map(Math.round).join("/")})`); }
      // 높이가 같은 나란한 카드인데 안쪽 내용이 끝나는 높이가 크게 다름(지적: '이달의 추천' 왼쪽 카드만 아래가 빔)
      if (d <= 60 && kids.every(painted)) { const ends = kids.map((k) => { let e = 0; for (const z of leaves) if (z.el !== k && k.contains(z.el) && z.b > e) e = z.b; return e; }); const de = Math.max(...ends) - Math.min(...ends);
        if (de > 40 && de > Math.max(...hs) * 0.07) out.balance.push(`${nm(p)} y${Y(rs[0])} 나란한 카드 안 내용 끝 높이 차 ${Math.round(de)}px — 항목 수·사진 크기를 맞춘다`); }
      for (const k of kids) { const k0 = k.getBoundingClientRect(); const q = { left: k0.left, right: k0.right, top: pr.top, bottom: pr.bottom }; if (k0.width < W * 0.3 || pr.height < 300) continue;
        const f = fill(p, q); if (f < 0.3) out.sparse.push(`칸 ${nm(k)} y${Y(pr)} ${Math.round(k0.width)}×${Math.round(pr.height)} 내용 ${Math.round(f * 100)}%`); }
    }
    // ① 칠한 카드(360×260 이상)인데 거의 비어 있음(내용 12% 미만 — 글 몇 줄 카드는 정상이라 더 높이지 않는다: s09 글 카드 15% 오탐)
    for (const box of all) { if (!vis(box) || box.closest("header, footer") || /^(TABLE|TBODY|THEAD|UL|OL|IFRAME|IMG|PICTURE|VIDEO)$/.test(box.tagName) || getComputedStyle(box).backgroundImage !== "none" || !painted(box)) continue; const q = box.getBoundingClientRect(); if (q.width < 360 || q.height < 260 || q.width > W * 0.9) continue;
      if (box.querySelectorAll("a[href]").length >= 4) continue; // 링크 목록 카드(사이트맵 분야)는 짧은 링크 글이라 면적이 작아도 비지 않았다(배치9 오탐)
      const f = fill(box); if (f < 0.12) out.cardEmpty.push(`${nm(box)} y${Y(q)} ${Math.round(q.width)}×${Math.round(q.height)} 내용 ${Math.round(f * 100)}%`); }
    out.cardEmpty = out.cardEmpty.slice(0, 6); out.sparse = [...new Set(out.sparse)].slice(0, 6);
    // ⑥ 넓은 목록: 본문 폭 가득한 게시판 목록인데 글이 왼쪽에 몰려 가운데가 빔(지적: 알림사항 5줄이 1400px 를 다 씀)
    // 옆으로 옮겨진 캐러셀 트랙(transform)은 게시판 목록이 아니다(배치5 오탐 — 걸렸다 안 걸렸다)
    const moved = (el) => { for (let a = el; a && a !== document.body; a = a.parentElement) { const t = getComputedStyle(a).transform; if (t && t !== "none" && !/^matrix\(1, 0, 0, 1, 0, 0\)$/.test(t)) return true; } return false; };
    for (const ul of document.querySelectorAll("ul, ol, tbody")) { if (!vis(ul) || ul.closest("header, footer, nav") || moved(ul)) continue; const q = ul.getBoundingClientRect(); if (q.width < W * 0.6 || ul.children.length < 4) continue;
      { const avg = [...ul.children].reduce((s, li) => s + (li.innerText || "").trim().length, 0) / ul.children.length; if (avg < 10) continue; } // 단계 표시(1→4)·짧은 칩 줄은 게시판 목록이 아니다(배치10 오탐)
      const f = fill(ul); if (f < 0.22) out.sparse.push(`넓은 목록 ${nm(ul)} y${Y(q)} ${Math.round(q.width)}px ${ul.children.length}줄 내용 ${Math.round(f * 100)}% — 2단·사진 카드와 섞기 또는 폭 줄이기`); }
    // ⑤ 제목·더보기가 칠한 상자의 위·아래 테두리에 걸침(반은 안·반은 밖). box-shadow 0 0 0 Npx 로 넓힌 면은 그 바깥선이 테두리
    const boxes = all.filter((e) => vis(e) && painted(e) && bgOf(e) !== bgOf(e.parentElement || document.body) && e.getBoundingClientRect().width >= 200 && e.getBoundingClientRect().height >= 80);
    for (const h of document.querySelectorAll("h2, h3, [class*=title], [class*=more]")) { if (!vis(h)) continue; const hr = h.getBoundingClientRect(); if (hr.height > 120) continue;
      for (const bx of boxes) { if (bx.contains(h) || h.contains(bx)) continue; const b0 = bx.getBoundingClientRect(); const sp = +((getComputedStyle(bx).boxShadow.match(/(?:^|\s)0px 0px 0px (\d+(?:\.\d+)?)px/) || [])[1] || 0);
        const br = { left: b0.left - sp, right: b0.right + sp, top: b0.top - sp, bottom: b0.bottom + sp }; if (hr.right < br.left || hr.left > br.right) continue;
        if ([br.top, br.bottom].some((e) => e > hr.top + 4 && e < hr.bottom - 4)) { out.straddle.push(`${(h.textContent || "").trim().slice(0, 14) || nm(h)} y${Y(hr)} — ${nm(bx)} 테두리에 걸침${sp ? `(box-shadow ${sp}px 로 넓힌 면)` : ""}`); break; } } }
    out.straddle = [...new Set(out.straddle)].slice(0, 6);
    // ⑥ 글 없는 아이콘 단추: 실제로 그려진 아이콘(svg 안 도형) 중심 vs 단추 중심 1.5px
    for (const btn of document.querySelectorAll("button, a, [role=button]")) { if (!vis(btn) || (btn.innerText || "").trim()) continue; const ic = [...btn.querySelectorAll("svg, img")].find(vis); if (!ic) continue;
      const shapes = ic.tagName.toLowerCase() === "svg" ? [...ic.querySelectorAll("path, rect, circle, line, polyline, polygon")] : [ic];
      let l = 1e9, t = 1e9, rr = -1e9, bb = -1e9; for (const s of shapes) { const q = s.getBoundingClientRect(); if (!q.width && !q.height) continue; l = Math.min(l, q.left); t = Math.min(t, q.top); rr = Math.max(rr, q.right); bb = Math.max(bb, q.bottom); }
      if (rr < l) continue; const br = btn.getBoundingClientRect(); if (br.width > 120 || br.height > 120 || br.width < 16) continue;
      const dx = (l + rr) / 2 - (br.left + br.width / 2), dy = (t + bb) / 2 - (br.top + br.height / 2);
      if (Math.abs(dx) > 1.5 || Math.abs(dy) > 1.5) out.iconOff.push(`${btn.getAttribute("aria-label") || nm(btn)} y${Y(br)} 가로 ${dx.toFixed(1)}·세로 ${dy.toFixed(1)}px`); }
    out.iconOff = [...new Set(out.iconOff)].slice(0, 6);
    // ⑦ 이미지 비율: cover 로 37% 넘게 잘림·fill 로 늘어남·글자 든 그림(배너·팝업·포스터)이 4% 넘게 잘림
    for (const im of document.images) { if (!vis(im) || !im.naturalWidth) continue; const q = im.getBoundingClientRect(); if (q.width < 120 || q.height < 80) continue; const s = getComputedStyle(im);
      const nr = im.naturalWidth / im.naturalHeight, br = q.width / q.height, k = Math.max(nr / br, br / nr); const kk = key(im.currentSrc || im.src);
      let clip = false; for (let a = im.parentElement; a && a !== document.body; a = a.parentElement) { if (getComputedStyle(a).overflow !== "visible") { const ab = a.getBoundingClientRect(); if (q.right > ab.left && q.left < ab.right && (ab.bottom < q.bottom - 3 || ab.top > q.top + 3)) { clip = true; break; } } } /* 위아래 잘림만 — 캐러셀 화면 밖 장은 잘림이 아니다(배치3) */
      if (tk.has(kk) && ((s.objectFit === "cover" && k > 1.04) || clip)) out.crop.push(`글자 든 그림 잘림 ${kk} — 자리 ${br.toFixed(2)} vs 그림 ${nr.toFixed(2)}${clip ? "·부모가 자름" : ""}`);
      else if (s.objectFit === "fill" && k > 1.06) out.crop.push(`늘어남 ${kk} ${k.toFixed(2)}배`);
      else if (s.objectFit === "cover" && k > 1.6) out.crop.push(`많이 잘림 ${kk} 자리 ${br.toFixed(2)} vs 그림 ${nr.toFixed(2)}(${Math.round((1 - 1 / k) * 100)}%)`); }
    out.crop = [...new Set(out.crop)].slice(0, 8);
    // ⑧ 배경 사진이 일부만 보임: background-image 상자를 다른 칠한 상자가 대부분 덮음(조각만 삐져나옴)
    for (const el of all) { if (!vis(el)) continue; const s = getComputedStyle(el); if (!/url\(/.test(s.backgroundImage)) continue; const q = el.getBoundingClientRect(); if (q.width * q.height < 120000) continue;
      const L = q.left, T = q.top + scrollY, R = q.right, B = q.bottom + scrollY;
      const covers = all.filter((c) => c !== el && !c.contains(el) && vis(c) && !transparent(getComputedStyle(c).backgroundColor) && getComputedStyle(c).backgroundImage === "none").map((c) => { const z = c.getBoundingClientRect(); return { l: z.left, t: z.top + scrollY, r: z.right, b: z.bottom + scrollY, c }; })
        .filter((z) => z.r > L && z.l < R && z.b > T && z.t < B && (el.contains(z.c) || z.c.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING || +getComputedStyle(z.c).zIndex > 0)); // 안쪽 흰 카드도 사진을 덮는다(s04 사진이 왼쪽 위 조각만 보임)
      let own = 0, n = 0; for (let i = 0; i < 20; i++) for (let j = 0; j < 12; j++) { const x = L + ((i + 0.5) * (R - L)) / 20, y = T + ((j + 0.5) * (B - T)) / 12; n++; if (!covers.some((z) => x >= z.l && x <= z.r && y >= z.t && y <= z.b)) own++; }
      const f = own / n; if (f > 0.03 && f < 0.5) out.bgPartial.push(`${nm(el)} y${Y(q)} ${Math.round(q.width)}×${Math.round(q.height)} 보이는 곳 ${Math.round(f * 100)}%`); }
    out.bgPartial = out.bgPartial.slice(0, 4);
    // ⑨ 첫 화면: 머리 + 히어로(+ 바로 아래 바로가기 줄)가 첫 화면(VH) 안에 다 들어온다
    // 머리가 히어로 위에 겹쳐 뜨면(absolute·fixed) 히어로는 0 에서 시작한다 — 그때는 0 기준으로 찾는다(배치3 미탐: 바닥 990 인데 안 걸림)
    const hdr = [...document.querySelectorAll("header")].find(vis); const hdrOver = hdr && /absolute|fixed/.test(getComputedStyle(hdr).position); const hb = hdr && !hdrOver ? hdr.getBoundingClientRect().bottom + scrollY : 0;
    const hero = all.find((e) => { if (!vis(e) || e.closest("header") || e.matches("main, body > div")) return false; const q = e.getBoundingClientRect(); return q.top + scrollY >= hb - 4 && q.top + scrollY < hb + 60 && q.width >= W * 0.6 && q.height >= 300 && q.height <= 1600; });
    if (hero) { const q = hero.getBoundingClientRect(); let bottom = q.bottom + scrollY; const ctr = [...hero.querySelectorAll("button, [role=tab]")].filter(vis).map((x) => x.getBoundingClientRect().bottom + scrollY); bottom = Math.max(bottom, ...ctr);
      let nx = hero.nextElementSibling; while (nx && !vis(nx)) nx = nx.nextElementSibling;
      if (nx) { const z = nx.getBoundingClientRect(); const links = nx.querySelectorAll("a, button").length; if (z.height < 280 && links >= 4 && z.top + scrollY - bottom < 40) bottom = Math.max(bottom, z.bottom + scrollY); }
      if (bottom > VH + 1) out.hero.push(`머리 ${Math.round(hb)} + 히어로${bottom > q.bottom + scrollY + 2 ? "·바로가기" : ""} → 바닥 ${Math.round(bottom)}px — 첫 화면 ${VH}px 안에 다 보여야 한다(히어로 높이를 줄인다)`); }
    // ④ 바닥글 아래 빈 띠: 바닥글 내용 끝 ~ 문서 끝
    const ft = [...document.querySelectorAll("footer")].filter(vis).pop();
    if (ft) { const H = document.documentElement.scrollHeight; let last = 0; for (const z of leaves) if (z.el !== ft && ft.contains(z.el) && z.b - z.t < 160 && z.b > last) last = z.b; /* 바닥글 면 자체·큰 감싸개는 빼고 글·그림 조각만 */ const fb = ft.getBoundingClientRect().bottom + scrollY;
      if (last && H - last > 96) out.footTail.push(`바닥글 마지막 글(y ${Math.round(last)}) 아래가 문서 끝(${H})까지 ${Math.round(H - last)}px 비어 있음 — 바닥글 padding-bottom·min-height 를 줄인다(48~80px)`); void fb; }
    // ③ 같은 메인에 게시판 목록 두 번: 글 제목만 4줄 이상인 목록이 서로 다른 구역에 둘 이상(탭으로 묶을 것)
    const lists = []; if (!isSub) {
    for (const ul of document.querySelectorAll("ul, ol")) { if (!vis(ul) || ul.closest("header, footer, nav, [data-hb=menu]")) continue; const it = [...ul.children].filter(vis); if (it.length < 4) continue;
      const lines = it.filter((li) => !li.querySelector("img, svg") && !/^\s*[\d.,]+/.test(li.innerText || "") && (li.innerText || "").trim().length >= 12 && li.getBoundingClientRect().height < 110).length; if (lines < 4) continue;
      const sec = ul.closest("section, article, [class*=sec], [class*=row]") || ul.parentElement; if (lists.some((l) => l.sec === sec || l.sec.contains(ul) || sec.contains(l.ul))) continue; lists.push({ ul, sec, y: Y(ul.getBoundingClientRect()) }); }
    } if (lists.length >= 2) out.dupList.push(`글 제목 목록 ${lists.length}곳(y ${lists.map((l) => l.y).join("·")}) — 같은 형식 게시판은 한 구역의 탭으로 묶는다`);
    // 팝업존은 한 장씩 굴러가는 캐러셀(이전·다음·정지)이어야 한다 — 사진 갤러리 3칸을 팝업존이라 부르지 않는다
    for (const h of document.querySelectorAll("h2, h3, strong")) { if (!vis(h) || !/팝업\s?존|popup\s?zone/i.test(h.textContent || "")) continue;
      const sec = h.closest("section, article, [class*=popup], [class*=pop]") || h.parentElement; const car = sec.querySelector("[data-hb=carousel], [data-hb-next], [data-hb-prev], [data-carousel], [aria-roledescription=carousel]") || [...sec.querySelectorAll("button, a")].find((b) => /이전|다음|prev|next/i.test((b.getAttribute("aria-label") || "") + " " + (typeof b.className === "string" ? b.className : ""))); /* 자체 캐러셀(넘김 단추 있음)도 인정 — data-hb 만 보던 오탐(배치7·8) */
      const imgs = [...sec.querySelectorAll("img")].filter(vis).filter((im) => im.getBoundingClientRect().width >= 120);
      if (!car) out.popupZone.push(`'${(h.textContent || "").trim().slice(0, 10)}' y${Y(h.getBoundingClientRect())} — 넘김 단추 없는 사진 ${imgs.length}칸(팝업존은 data-hb="carousel" 로 한 장씩 굴러가는 배너)`); }
    // 글자 강약: 날짜·분류·설명 같은 부가 글이 제목과 같은 색·굵기면 강약이 없다(지적: 다 검정·다 굵게)
    { const lum = (c) => { const v = (c.match(/[\d.]+/g) || []).map(Number); const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(v[0]) + 0.7152 * f(v[1]) + 0.0722 * f(v[2]); };
      let same = 0, n = 0; const ex = [];
      for (const it of document.querySelectorAll("main li, main article, main [class*=card], main [class*=item]")) { if (!vis(it) || it.closest("nav, header, footer, [data-hb=menu]")) continue;
        const ts = [...it.querySelectorAll("*")].filter((e) => vis(e) && [...e.childNodes].some((x) => x.nodeType === 3 && x.textContent.trim().length > 1));
        if (ts.length < 2) continue; const big = ts.reduce((a, e) => (parseFloat(getComputedStyle(e).fontSize) > parseFloat(getComputedStyle(a).fontSize) ? e : a));
        const meta = ts.filter((e) => e !== big && !big.contains(e) && (/^\s*20\d\d[.\-/]\s?\d{1,2}[.\-/]\s?\d{1,2}/.test(e.textContent) || parseFloat(getComputedStyle(e).fontSize) < parseFloat(getComputedStyle(big).fontSize) - 1));
        for (const m of meta.slice(0, 2)) { n++; const a = getComputedStyle(big), b = getComputedStyle(m); const dl = Math.abs(lum(a.color) - lum(b.color));
          if (dl < 0.04 && +b.fontWeight >= +a.fontWeight - 100 && !/^rgb\(255, 255, 255\)$/.test(b.color)) { same++; if (ex.length < 3) ex.push(`'${(big.textContent || "").trim().slice(0, 10)}' / '${(m.textContent || "").trim().slice(0, 10)}'`); } } }
      if (n >= 6 && same / n > 0.5) out.typeFlat = [`부가 글 ${same}/${n}개가 제목과 같은 색·굵기(${ex.join(", ")}) — 제목은 굵게·짙게, 날짜·설명은 보통 굵기·회색(--hb-sub)`]; else out.typeFlat = []; }
    // 꾸밈 아이콘: 둥근 바탕 위 아이콘 색이 바탕과 구분이 안 됨(대비 3 미만)
    { const rgb = (c) => { const v = (c.match(/[\d.]+/g) || []).map(Number); return c.startsWith("color(") ? [v[0] * 255, v[1] * 255, v[2] * 255, v[3] ?? 1] : v; }; /* color-mix 결과 color(srgb 0~1) — 0~255 로 읽어 검정으로 계산하던 것 */ const L = (v) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(v[0]) + 0.7152 * f(v[1]) + 0.0722 * f(v[2]); };
      out.iconLow = [];
      for (const sv of document.querySelectorAll("svg")) { if (!vis(sv) || out.iconLow.length >= 6) continue; const host = sv.parentElement; if (!host) continue; const hb0 = host.getBoundingClientRect(); const hs = getComputedStyle(host);
        if (hb0.width > 120 || hb0.height > 120 || Math.abs(hb0.width - hb0.height) > 6 || transparent(hs.backgroundColor)) continue;
        const ic = rgb(getComputedStyle(sv).color), bg = rgb(hs.backgroundColor); if ((bg[3] ?? 1) < 0.5) continue; const fillA = sv.getAttribute("fill"); if (fillA && fillA !== "currentColor") continue;
        const a = L(ic), b = L(bg); const c = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); if (c < 3) out.iconLow.push(`${host.getAttribute("aria-label") || nm(host)} y${Y(hb0)} 아이콘 대 바탕 ${c.toFixed(1)}:1`); } }
    // 아이콘을 너무 크게 씀(지적: 카드마다 3D 아이콘이 300px — 아이콘은 24~120px, 큰 자리는 사진·일러스트)
    out.bigIcon = []; { const ik = new Set(iconKeys || []); for (const im of document.images) { if (!vis(im)) continue; const q = im.getBoundingClientRect(); const kk = key(im.currentSrc || im.src); if ((ik.has(kk) || /icon/i.test(im.className + " " + (im.parentElement?.className || ""))) && Math.max(q.width, q.height) > 140) out.bigIcon.push(`${kk} ${Math.round(q.width)}×${Math.round(q.height)}`); } out.bigIcon = out.bigIcon.slice(0, 5); }
    // 주제에 안 맞는 어두운 띠: 학교·복지관·도서관·어린이 기관에 거의 검은 폭 가득 구역(지적: 고등학교에 블랙 배경)
    out.darkBand = [];
    if (/학교|초등|중학|고등|유치원|어린이|복지|도서관|아동|청소년/.test(org || document.title)) {
      for (const e of all) { if (!vis(e) || e.closest("header, footer")) continue; const q = e.getBoundingClientRect(); if (q.width < W * 0.85 || q.height < 300) continue; const c = getComputedStyle(e).backgroundColor; if (transparent(c) || getComputedStyle(e).backgroundImage !== "none") continue;
        // 사진(img)이 거의 다 덮은 띠는 바탕색이 안 보인다(배치4 오탐: 히어로 .uv-hero 바탕 #1F2328)
        if ([...e.querySelectorAll("img, video")].some((im) => { const z = im.getBoundingClientRect(); return z.width * z.height >= q.width * q.height * 0.8; })) continue;
        const v = (c.match(/[\d.]+/g) || []).map(Number); const lum = (0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]) / 255; if (lum < 0.22 && (v[3] ?? 1) > 0.8) { out.darkBand.push(`${nm(e)} y${Y(q)} 바탕 ${c}`); if (out.darkBand.length >= 3) break; } } }
    // 폭별 글자 크기 비교용(PC 값)
    const fsOf = (sel) => { const v = [...document.querySelectorAll(sel)].filter((e) => vis(e) && !e.closest("header, footer")).map((e) => parseFloat(getComputedStyle(e).fontSize)); v.sort((a, b) => b - a); return v.length ? v[0] : 0; };
    out.font = { h1: fsOf("main h1, h1"), h2: fsOf("main h2, section h2"), h3: fsOf("main h3"), p: fsOf("main p") };
    return out;
  }, { textKeys: (o.textKeys ?? []).map((k) => String(k).replace(/^pa-/, "")), VH: o.viewportH ?? 900, isSub: !!o.sub, org: o.org ?? "", iconKeys: (o.iconKeys ?? []).map((k) => String(k).replace(/^pa-/, "")) });
  const fails = [];
  const chk = (ok, name, v) => { if (!ok) fails.push(`${name}: ${v.join(" | ")}`); };
  chk(!r.balance.length, "나란한 칸 높이·내용 불균형", r.balance);
  chk(!r.cardEmpty.length, "카드 안이 거의 빔", r.cardEmpty);
  chk(!r.sparse.length, "공간에 비해 성긴 구성", r.sparse);
  chk(!r.straddle.length, "제목·더보기가 상자 테두리에 걸침", r.straddle);
  chk(!r.iconOff.length, "아이콘 단추 안 아이콘이 가운데가 아님", r.iconOff);
  chk(!r.crop.length, "이미지 비율이 자리와 맞지 않음", r.crop);
  chk(!r.bgPartial.length, "배경 사진이 일부만 보임", r.bgPartial);
  chk(!r.hero.length, "첫 화면에 히어로가 다 안 들어옴", r.hero);
  chk(!r.footTail.length, "바닥글 아래 빈 띠", r.footTail);
  chk(!r.dupList.length, "같은 형식 게시판 목록 중복", r.dupList);
  chk(!r.popupZone.length, "팝업존이 굴러가지 않음", r.popupZone);
  chk(!r.typeFlat.length, "글자 강약 없음", r.typeFlat);
  chk(!r.iconLow.length, "꾸밈 아이콘이 바탕과 구분 안 됨", r.iconLow);
  chk(!r.darkBand.length, "기관 주제에 안 맞는 어두운 배경", r.darkBand);
  chk(!r.bigIcon.length, "아이콘을 너무 크게 씀(140px 넘음 — 큰 자리는 사진·일러스트)", r.bigIcon);
  return { r, fails };
}

/**
 * 태블릿(768)·모바일(390) 검사 — 판정이 지금 폭으로 바꾼 뒤 부른다(사용자 지적 2026-10-15: 태블릿·모바일 최적화 안 됨,
 * 입력칸이 작아지고 단추와 짝이 안 맞음, 탭 줄이 잘림).
 * @param {import("playwright-core").Page} p @param {number} w
 */
export async function deviceChecks(p, w, pcFont = null, textKeys = []) {
  const r = await p.evaluate(({ w, pcFont, textKeys }) => {
    const vis = (el) => { const s = getComputedStyle(el); const q = el.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && +s.opacity > 0.05 && q.width > 0 && q.height > 0; };
    const nm = (el) => el.tagName.toLowerCase() + (typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/)[0] : "");
    const out = { pair: [], input: [], tabsCut: [], tap: [], textCrop: [], overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - w };
    // 글자 든 그림(배너·팝업·카드뉴스)이 이 폭에서 잘림 — PC 에선 맞던 칸 비율이 태블릿·모바일에서 바뀌어 cover 로 글자가 잘렸다
    // (2026-10-15 사용자 지적 '새소식' 배너 좌우 잘림). 글자 그림은 aspect-ratio 를 그림 비율로 고정하거나 contain.
    { const tk = new Set(textKeys); const key = (src) => { const q = String(src || "").split("?")[0].split("/").filter(Boolean); const n = q.pop() || ""; return /^(original|web|thumb|card)$/.test(n) ? q.pop() || "" : n; };
      for (const im of document.images) { if (!vis(im) || !im.naturalWidth) continue; const kk = key(im.currentSrc || im.src); if (!tk.has(kk)) continue; const q = im.getBoundingClientRect(); if (q.width < 80) continue;
        const s = getComputedStyle(im); const nr = im.naturalWidth / im.naturalHeight, br = q.width / q.height, k = Math.max(nr / br, br / nr);
        let clip = false; for (let a = im.parentElement; a && a !== document.body; a = a.parentElement) { if (getComputedStyle(a).overflow !== "visible") { const ab = a.getBoundingClientRect(); if (q.right > ab.left && q.left < ab.right && (ab.bottom < q.bottom - 3 || ab.top > q.top + 3)) { clip = true; break; } /* 위아래 잘림만 — 옆으로 넘어간 캐러셀 장은 화면 밖일 뿐 */ } }
        if ((s.objectFit === "cover" && k > 1.04) || s.objectFit === "fill" && k > 1.06 || clip) out.textCrop.push(`${kk} 자리 ${br.toFixed(2)} vs 그림 ${nr.toFixed(2)}${clip ? "·부모가 자름" : ""}`); }
      out.textCrop = [...new Set(out.textCrop)].slice(0, 5); }
    // 같은 줄(위끝 6px 안)·같은 묶음의 한 줄 입력·선택·단추 높이가 다름 / 위아래로 쌓인 선택 상자와 입력칸 폭이 다름
    const ctl = (e) => e.matches("input:not([type=radio]):not([type=checkbox]):not([type=hidden]), select, button, [aria-haspopup], a[class*=btn]") && vis(e) && e.getBoundingClientRect().height < 80;
    for (const g of document.querySelectorAll("form, [role=search], [class*=search], [class*=filter], [class*=form]")) { if (!vis(g) || g.closest("header [data-hb=menu]")) continue;
      // 검색 틀(칠한 상자) 안에 들어간 단추는 틀과 짝이 아니라 틀의 일부다 — 둥근 검색 틀 56 안 원형 단추 44 를 짝 안 맞음으로 잡던 오탐(배치2)
      const frameOf = (c) => { for (let a = c.parentElement; a && a !== g.parentElement; a = a.parentElement) { const s = getComputedStyle(a); if ((!/rgba\(0, 0, 0, 0\)|transparent/.test(s.backgroundColor) || parseFloat(s.borderTopWidth) > 0) && a.getBoundingClientRect().height < 90) return a; } return null; };
      const inside = (c) => { const q = c.getBoundingClientRect(); return [...g.querySelectorAll("input, select")].some((o) => { if (o === c) return false; const f = frameOf(o); if (!f || !f.contains(c)) return false; const r = f.getBoundingClientRect(); return q.left >= r.left && q.right <= r.right + 1 && q.top >= r.top - 1 && q.bottom <= r.bottom + 1; }); };
      const cs = [...g.querySelectorAll("*")].filter(ctl).filter((c) => !inside(c)); if (cs.length < 2) continue;
      const rows = []; for (const c of cs) { const q = c.getBoundingClientRect(); const row = rows.find((r) => Math.abs(r.top - q.top) <= 6); if (row) row.items.push([c, q]); else rows.push({ top: q.top, items: [[c, q]] }); }
      for (const row of rows) { if (row.items.length < 2) continue; const hs = row.items.map(([, q]) => Math.round(q.height)); if (Math.max(...hs) - Math.min(...hs) > 2) out.pair.push(`${nm(g)} 한 줄 높이 ${hs.join("/")}px`); }
      const sel = cs.filter((c) => c.matches("select, [aria-haspopup]")), inp = cs.filter((c) => c.matches("input"));
      for (const s of sel) { const sq = s.getBoundingClientRect(); for (const i of inp) { const iq = i.getBoundingClientRect(); if (iq.top >= sq.bottom - 2 && iq.top - sq.bottom < 40 && sq.width < iq.width * 0.6) out.pair.push(`${nm(g)} 위 선택 상자 ${Math.round(sq.width)}px · 아래 입력칸 ${Math.round(iq.width)}px — 쌓이면 폭을 맞춘다`); } } }
    out.pair = [...new Set(out.pair)].slice(0, 5);
    // 입력칸: 높이 44px 미만·글자 16px 미만(아이폰 확대)
    for (const e of document.querySelectorAll("input:not([type=radio]):not([type=checkbox]):not([type=hidden]), textarea, select")) { if (!vis(e) || e.closest("header")) continue; const q = e.getBoundingClientRect(); const fs = parseFloat(getComputedStyle(e).fontSize);
      // 투명한 입력칸을 칠한 상자(검색창 틀)가 감싸면 그 상자 높이가 누르는 크기다
      const box = (() => { if (!/rgba\(0, 0, 0, 0\)|transparent/.test(getComputedStyle(e).backgroundColor)) return q; for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const s = getComputedStyle(a); if (!/rgba\(0, 0, 0, 0\)|transparent/.test(s.backgroundColor) || parseFloat(s.borderTopWidth) > 0) return a.getBoundingClientRect(); } return q; })();
      if ((e.tagName === "TEXTAREA" ? box.height < 88 : box.height < 44) || fs < 16) out.input.push(`${e.getAttribute("placeholder")?.slice(0, 12) || nm(e)} 높이 ${Math.round(box.height)}·글자 ${fs}px`); }
    out.input = [...new Set(out.input)].slice(0, 5);
    // 탭·칩 줄이 화면 밖으로 잘림(줄바꿈도 선택 단추도 없이 마지막 칸이 반쯤 보임)
    for (const tl of document.querySelectorAll("[role=tablist], [data-hb=tabs] > ul, [class*=chip]")) { if (!vis(tl)) continue; const items = [...tl.children].filter(vis); if (items.length < 3) continue;
      const q = tl.getBoundingClientRect(); const lim = Math.min(q.right, w); const cut = items.filter((it) => { const z = it.getBoundingClientRect(); return z.left < lim - 4 && z.right > lim + 2; });
      if (cut.length) out.tabsCut.push(`${nm(tl)} ${items.length}칸 중 '${(cut[0].textContent || "").trim().slice(0, 8)}' 이 잘림 — 줄바꿈하거나 '현재 값 ▾' 단추 + 모달`); }
    // 짧은 이름(6자 이하)이 두 줄로 꺾임 — '이전/글'·'다음/글'(지적 s03 서브 모바일)
    out.shortWrap = [];
    for (const e of document.querySelectorAll("body *")) { if (out.shortWrap.length >= 5 || !vis(e)) continue; const own = [...e.childNodes].filter((x) => x.nodeType === 3).map((x) => x.textContent).join("").trim(); if (own.length < 2 || own.length > 6) continue;
      if (/^[\d.,%·+\-]+[장건명개%]?$/.test(own) || getComputedStyle(e).clip !== "auto" || e.getBoundingClientRect().width <= 2) continue; // 숫자(통계)·숨김 제목은 빼고
      const tops = new Set(); for (const tn of [...e.childNodes].filter((x) => x.nodeType === 3 && x.textContent.trim())) { const rg = document.createRange(); rg.selectNodeContents(tn); for (const q of rg.getClientRects()) if (q.width > 1) tops.add(Math.round(q.top)); } if (tops.size > 1) out.shortWrap.push(`'${own}'`); }
    // 구분선(| 또는 왼쪽 테두리) 있는 한 줄 정보가 줄바꿈되며 구분선이 줄 앞에 남음(지적: 작성일 | 담당부서 | 조회수)
    out.sepWrap = [];
    for (const row of document.querySelectorAll("body *")) { if (out.sepWrap.length >= 4 || !vis(row)) continue; const kids = [...row.children].filter(vis); if (kids.length < 3) continue;
      const sep = (k) => { const cs = getComputedStyle(k); return (parseFloat(cs.borderLeftWidth) > 0 && parseFloat(cs.borderRightWidth) === 0 && parseFloat(cs.borderTopWidth) === 0) || /[|│]/.test(getComputedStyle(k, "::before").content) || /^\s*[|│]\s*$/.test(k.textContent || ""); }; // 한쪽(왼쪽)만 테두리이거나 | 기호 — 테두리 두른 알약 링크는 구분선이 아니다(일괄 수정 오탐)
      if (kids.filter(sep).length < 2) continue; const rl = row.getBoundingClientRect().left;
      const lead = kids.filter((k, i) => i > 0 && sep(k) && Math.abs(k.getBoundingClientRect().left - rl) < 6); if (lead.length) out.sepWrap.push(`${nm(row)} y${Math.round(row.getBoundingClientRect().top + scrollY)} 줄 앞에 구분선 — 모바일은 구분선 빼고 세로로 쌓거나 칸(dl)으로`); }
    // 누르는 크기: 단추·링크 단추 40px 미만(본문 글 속 링크 제외)
    // 폭별 글자 크기: 제목(h1·h2·h3)은 PC 보다 작아야 한다(태블릿 ≤ 92%, 모바일 ≤ 85%), 본문은 PC 이하(지적: 모바일 글자가 PC 그대로)
    out.font = [];
    if (pcFont) { const vis2 = (e) => { const s = getComputedStyle(e); const q = e.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && s.clip === "auto" && q.width > 2 && q.height > 2; }; /* 숨김 제목(.sr) 제외 — 배치6 */ const fsOf = (sel) => { const v = [...document.querySelectorAll(sel)].filter((e) => vis2(e) && !e.closest("header, footer")).map((e) => parseFloat(getComputedStyle(e).fontSize)); v.sort((a, b) => b - a); return v.length ? v[0] : 0; };
      const k = w <= 480 ? 0.85 : 0.92;
      for (const [t, sel] of [["h1", "main h1, h1"], ["h2", "main h2, section h2"], ["h3", "main h3"]]) { const pc = pcFont[t], now = fsOf(sel); if (pc >= 20 && now > pc * k + 0.5) out.font.push(`${t} PC ${pc}px → ${now}px(${Math.round(k * 100)}% 이하로)`); }
      const pp = pcFont.p, np = fsOf("main p"); if (pp && np > pp + 0.5) out.font.push(`본문 PC ${pp}px → ${np}px(PC 이하로)`); }
    let small = 0; for (const b of document.querySelectorAll("button, [role=button], a[class*=btn]")) { if (!vis(b)) continue; const q = b.getBoundingClientRect(); if (q.height < 40 && q.width < 40) small++; } if (small >= 3) out.tap.push(`누르기 작은 단추 ${small}개(40px 미만)`);
    return out;
  }, { w, pcFont, textKeys: (textKeys ?? []).map((k) => String(k).replace(/^pa-/, "")) });
  // 열리는 판(드롭다운·관련 사이트)이 화면 밖으로 나감 — 실제로 눌러 본다
  r.popOut = [];
  const openers = await p.$$("main button[aria-expanded=false], footer button[aria-expanded=false], main [aria-haspopup]:not([aria-expanded=true]), footer [aria-haspopup]:not([aria-expanded=true])");
  for (const b of openers.slice(0, 6)) {
    const before = await p.evaluate(() => new Set([...document.querySelectorAll("ul, div, nav")].filter((e) => { const s = getComputedStyle(e); return s.display !== "none" && s.visibility !== "hidden" && e.getBoundingClientRect().height > 0; })).size).catch(() => 0);
    await b.evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => {});
    await b.click({ timeout: 1500 }).catch(() => {}); await p.waitForTimeout(250);
    const o = await b.evaluate((el, w) => { const id = el.getAttribute("aria-controls"); const pane = (id && document.getElementById(id)) || el.nextElementSibling || el.parentElement?.querySelector("ul, [role=listbox], [role=menu]"); if (!pane) return null;
      const q = pane.getBoundingClientRect(); if (!q.width || !q.height) return null; return q.right > w + 1 || q.left < -1 ? `${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 12)} 판 x ${Math.round(q.left)}~${Math.round(q.right)}` : null; }, w).catch(() => null);
    if (o) r.popOut.push(o);
    await b.click({ timeout: 1500 }).catch(() => {}); await p.keyboard.press("Escape").catch(() => {}); await p.waitForTimeout(120); void before;
  }
  const fails = []; const tag = w <= 480 ? "모바일" : "태블릿";
  if (r.shortWrap.length) fails.push(`${tag} 짧은 이름이 두 줄로 꺾임: ${r.shortWrap.join(" ")} — white-space:nowrap`);
  if (r.sepWrap.length) fails.push(`${tag} 구분선 줄바꿈: ${r.sepWrap.join(" | ")}`);
  if (r.popOut.length) fails.push(`${tag} 열린 판이 화면 밖: ${r.popOut.join(" | ")} — 오른쪽 맞춤(right:0)·폭 100% 이하`);
  if (r.overflow > 2) fails.push(`${tag} 가로 넘침: ${r.overflow}px`);
  if (r.pair.length) fails.push(`${tag} 입력·선택·단추 짝 안 맞음: ${r.pair.join(" | ")}`);
  if (r.input.length) fails.push(`${tag} 입력칸 작음: ${r.input.join(" | ")}`);
  if (r.tabsCut.length) fails.push(`${tag} 탭 줄 잘림: ${r.tabsCut.join(" | ")}`);
  if (r.tap.length) fails.push(`${tag} ${r.tap[0]}`);
  if (r.textCrop.length) fails.push(`${tag} 글자 든 그림 잘림: ${r.textCrop.join(" | ")} — 칸에 aspect-ratio 를 그림 비율로 주거나 object-fit:contain`);
  if (r.font.length) fails.push(`${tag} 글자 크기가 PC 와 같음: ${r.font.join(" | ")} — @media 로 PC>태블릿>모바일 단계별로 줄인다`);
  return { r, fails };
}

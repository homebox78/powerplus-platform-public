// 시안 화면 판정 보강(2026-10-13 내 시안 58건 점검 — docs/내시안-디자인·프론트-점검-2026-10-13.md D1~D39)
// 사람 눈엔 걸렸는데 점수는 통과였던 것들을 잰다: 바닥글 위 여백(없음·과다), 잉크 없는 빈 띠, 꾸밈 없는 넓은 섹션,
// 섹션 간격 편차, h1 개수, 가짜(#) 링크, 잘린 글·단추, 형제 겹침, 빈 캐러셀, 기울임 글자, 한 형제만 굳은 호버.
// 잰 값은 result.visual 로 남겨 같은 묶음(base_token) 장끼리 비교(D36)에 쓴다.

export async function measureVisual(p) {
  return p.evaluate(() => {
    const vis = (el) => { const s = getComputedStyle(el); if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
    const H = document.documentElement.scrollHeight; const W = document.documentElement.clientWidth;
    const name = (e) => e.tagName.toLowerCase() + (typeof e.className === "string" && e.className.trim() ? "." + e.className.trim().split(/\s+/)[0] : "");
    const bodyBg = getComputedStyle(document.body).backgroundColor;
    const feet = [...document.querySelectorAll("footer")].filter(vis);
    const f = feet.length ? feet[feet.length - 1] : null;
    const fr = f ? f.getBoundingClientRect() : null;
    const ft = fr ? fr.top + scrollY : H;
    const head = document.querySelector("header");
    const hb = head && vis(head) ? head.getBoundingClientRect().bottom + scrollY : 0;
    // 잉크: 글 있는 잎·그림·바탕과 다른 면·테두리
    const ink = [];
    for (const el of document.querySelectorAll("body *")) {
      if (f && f.contains(el)) continue; if (el.closest("[hidden],[aria-hidden=true] [hidden]")) continue; if (!vis(el)) continue;
      const s = getComputedStyle(el); if (s.position === "fixed") continue;
      const r = el.getBoundingClientRect(); const box = { t: r.top + scrollY, b: r.bottom + scrollY, l: r.left, r: r.right, el };
      const leafText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      const media = /^(IMG|SVG|VIDEO|IFRAME|CANVAS|PICTURE)$/i.test(el.tagName);
      // 면은 '바로 뒤 색'과 다를 때 — 페이지 바탕(흰색)과만 비교해 연한 색 띠 위 흰 카드를 면으로 안 치던 오탐(일괄 수정 배치1·3: #E3EBFA 띠 위 흰 카드가 '그림/면 0%')
      const behind = (() => { for (let a = el.parentElement; a; a = a.parentElement) { const c = getComputedStyle(a).backgroundColor; if (c !== "rgba(0, 0, 0, 0)" && c !== "transparent") return c; } return bodyBg; })();
      const bgc = s.backgroundColor; const hasBg = (bgc !== "rgba(0, 0, 0, 0)" && bgc !== "transparent" && bgc !== behind) || s.backgroundImage !== "none";
      const hasBorder = parseFloat(s.borderTopWidth) + parseFloat(s.borderBottomWidth) + parseFloat(s.borderLeftWidth) > 0 && s.borderTopStyle !== "none";
      if (leafText || media || hasBg || hasBorder) ink.push({ ...box, kind: leafText ? "t" : media ? "m" : hasBg ? "bg" : "line" });
    }
    const out = { H, W, foot: null, bands: [], plain: [], sec_gaps: [], h1: 0, hash: { n: 0, all: 0 }, clip: [], overlap: [], carousel: [], italic: [], oddhover: [] };
    // D27·D35 바닥글 위 시각 간격: 바닥글 위 마지막 내용 잉크 아래끝 → 바닥글 윗변
    if (f) {
      let last = 0; for (const k of ink) if (k.b <= ft + 1 && k.b > last && !(k.kind === "bg" && k.r - k.l > W * 0.95)) last = k.b;
      // 바닥글 바로 위 폭 가득 색 띠가 붙어 있으면 그 띠가 내용이다(띠 안쪽 여백은 띠의 몫)
      let band = 0; for (const k of ink) if (k.kind === "bg" && k.r - k.l > W * 0.95 && k.b <= ft + 1 && k.b > ft - 4 && k.b - k.t >= 40) band = k.b;
      out.foot = { y: Math.round(ft), gap: Math.round(ft - Math.max(last, band)) };
    }
    // D38 잉크 없는 빈 세로 띠(머리 아래 ~ 바닥글 위, 폭 가득 배경 면은 잉크로 안 침)
    { const step = 4, n = Math.ceil(ft / step), cov = new Uint8Array(n);
      for (const k of ink) { if (k.kind === "bg" && k.r - k.l > W * 0.95) continue; for (let i = Math.max(0, Math.floor(k.t / step)); i < Math.min(n, Math.ceil(k.b / step)); i++) cov[i] = 1; }
      let s0 = -1; for (let i = 0; i <= n; i++) { if (i < n && !cov[i]) { if (s0 < 0) s0 = i; } else if (s0 >= 0) { const y = s0 * step, len = (i - s0) * step; if (len >= 160 && y >= hb - 2 && y + len < ft - 2) out.bands.push({ y, h: len }); s0 = -1; } } }
    // D37 꾸밈 없는 넓은 섹션 · D39 섹션 사이 간격
    const secs = [...document.querySelectorAll("main > *, body > section, main section, body > div > section, body > div > div > section")]
      .filter((e) => vis(e) && !(f && f.contains(e)) && e !== head && !(head && head.contains(e)));
    const seen = new Set();
    for (const sec of secs) {
      const r = sec.getBoundingClientRect(); if (r.height < 300 || r.width < W * 0.7 || r.height > 2400) continue;
      const t = r.top + scrollY, b = r.bottom + scrollY; let area = 0, media = 0, bg = 0;
      for (const k of ink) { if (k.t < t - 1 || k.b > b + 1 || k.el === sec) continue; const a = (k.b - k.t) * (k.r - k.l); if (k.kind === "t") area += a; else if (k.kind === "m") media += a; else if (k.kind === "bg" && k.r - k.l < r.width * 0.95) bg += a; }
      const sb = getComputedStyle(sec); const secDeco = sb.backgroundImage !== "none";
      const textR = area / (r.width * r.height), deco = (media + bg) / (r.width * r.height);
      const key = Math.round(t) + ":" + Math.round(r.height); if (seen.has(key)) continue; seen.add(key);
      if (!secDeco && deco < 0.08 && textR < 0.18) out.plain.push({ who: name(sec), y: Math.round(t), w: Math.round(r.width), h: Math.round(r.height), text: Math.round(textR * 100), deco: Math.round(deco * 100) });
    }
    { // 본문 최상위 덩어리(머리·바닥 사이) 잉크 기준 간격
      const top = [...secs].filter((e) => { const r = e.getBoundingClientRect(); return r.width >= W * 0.5 && r.height >= 80; })
        .filter((e, i, a) => !a.some((o) => o !== e && o.contains(e)))
        .map((e) => { const r = e.getBoundingClientRect(); const t = r.top + scrollY, b = r.bottom + scrollY; let it = Infinity, ib = -Infinity; for (const k of ink) { if (k.t < t - 1 || k.b > b + 1) continue; if (k.kind === "bg" && k.r - k.l > W * 0.95) continue; it = Math.min(it, k.t); ib = Math.max(ib, k.b); } return { who: name(e), t: it, b: ib }; })
        .filter((s) => isFinite(s.t)).sort((a, b) => a.t - b.t);
      for (let i = 1; i < top.length; i++) { const g = Math.round(top[i].t - top[i - 1].b); if (g >= 0) out.sec_gaps.push({ y: Math.round(top[i].t), gap: g, who: top[i].who }); }
    }
    // D2 h1 · D10 가짜 링크
    // display:contents 인 h1 은 자기 상자가 없다 — 글자가 보이면 센다(일괄 수정 배치1: 'h1 이 없다' 오탐)
    // 안쪽 로고 링크가 position:absolute 라 h1 상자가 0 이어도 글·그림이 보이면 센다(2차 배치2·6: 'h1 없음' 오탐)
    const shown = (e) => { if (vis(e)) return true; const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden") return false; if ([...e.querySelectorAll("*")].some((k) => vis(k) && getComputedStyle(k).position === "absolute")) return true; if (cs.display !== "contents") return false; const rg = document.createRange(); rg.selectNodeContents(e); const q = rg.getBoundingClientRect(); return q.width > 2 && q.height > 2; };
    out.h1 = [...document.querySelectorAll("h1")].filter(shown).length;
    { const as = [...document.querySelectorAll("a")].filter(vis); out.hash.all = as.length; out.hash.n = as.filter((a) => { const h = (a.getAttribute("href") || "").trim(); return h === "" || h === "#" || /^javascript:/i.test(h); }).length; }
    // D12·D19 잘림: 높이가 정해진 상자에서 글·단추가 4px 넘게 잘림(캐러셀 트랙·줄 수 제한·화면 낭독용은 뺀다)
    const SLIDE = /carousel|slide|swiper|track|marquee|ticker|roll|banner-?list|viewport/i;
    for (const el of document.querySelectorAll("body *")) {
      if (f && f.contains(el) && false) continue; if (!vis(el)) continue;
      const s = getComputedStyle(el);
      if (!(s.overflowY === "hidden" || s.overflowY === "clip") || s.webkitLineClamp && s.webkitLineClamp !== "none") continue;
      if (el.matches("[data-hb],[data-hb] [data-hb-track],[data-hb-track],[aria-hidden=true]") || SLIDE.test(typeof el.className === "string" ? el.className : "")) continue;
      const r = el.getBoundingClientRect(); if (r.height < 20 || r.width < 20 || r.width < 40 && r.height < 40) continue;
      if (/^(IMG|SVG|VIDEO|IFRAME|CANVAS|PICTURE|svg)$/i.test(el.tagName) || el.closest("svg")) continue;
      if (s.position === "absolute" && (r.width <= 2 || r.height <= 2)) continue; // sr-only
      let worst = 0, what = "";
      for (const k of el.querySelectorAll("a, button, h1, h2, h3, h4, p, li, span, strong, dt, dd, td, label")) {
        if (!vis(k) || k.closest("[data-hb-track]") ) continue;
        if (![...k.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && !/^(A|BUTTON)$/.test(k.tagName)) continue;
        const ks = getComputedStyle(k); if (ks.position === "absolute" || ks.position === "fixed") continue;
        const kr = k.getBoundingClientRect(); if (kr.left >= r.right || kr.right <= r.left) continue;
        const over = Math.max(kr.bottom - r.bottom, r.top - kr.top);
        if (over > worst && over < kr.height + 1) { worst = over; what = (k.textContent || "").trim().slice(0, 16); }
      }
      if (worst > 4) out.clip.push({ who: name(el), y: Math.round(r.top + scrollY), h: Math.round(r.height), over: Math.round(worst), what });
    }
    out.clip = out.clip.filter((c, i, a) => a.findIndex((o) => o.what === c.what) === i).slice(0, 8);
    // D13 형제 겹침: 흐름 안 형제(정적·상대 위치)가 세로로 6px 넘게 겹침
    for (const par of document.querySelectorAll("body *")) {
      if (!vis(par) || par.closest("svg")) continue; const ps = getComputedStyle(par); if (ps.display === "grid" && ps.gridTemplateAreas !== "none") continue;
      const kids = [...par.children].filter((k) => { if (!vis(k)) return false; const s = getComputedStyle(k); return (s.position === "static" || s.position === "relative") && !/^(SCRIPT|STYLE|BR)$/.test(k.tagName) && parseFloat(s.marginTop) >= 0; });
      for (let i = 1; i < kids.length; i++) {
        const a = kids[i - 1].getBoundingClientRect(), b = kids[i].getBoundingClientRect();
        if (b.left >= a.right - 4 || b.right <= a.left + 4) continue; // 옆으로 나란함
        const ov = a.bottom - b.top;
        // 테두리 위에 얹은 알약·배지처럼 겹친 부분이 b 의 여백뿐이면 의도한 디자인 — b 의 실제 내용이 a 아래 끝보다 위에 올라올 때만 센다
        const firstInk = () => { let t = Infinity; for (const d of [kids[i], ...kids[i].querySelectorAll("*")]) { if (!vis(d)) continue; const own = [...d.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()); if (!own && !/^(IMG|SVG|VIDEO|CANVAS|INPUT|BUTTON|SELECT|TEXTAREA)$/i.test(d.tagName)) continue; t = Math.min(t, d.getBoundingClientRect().top); } return t; };
        if (ov > 6 && b.top > a.top + 4 && firstInk() < a.bottom - 2) { out.overlap.push({ who: name(kids[i]), on: name(kids[i - 1]), y: Math.round(b.top + scrollY), v: Math.round(ov) }); }
      }
      if (out.overlap.length >= 8) break;
    }
    // D15 빈 캐러셀
    for (const c of document.querySelectorAll('[data-hb="carousel"]')) {
      if (!vis(c)) continue; const slides = c.querySelectorAll("[data-hb-slide], [data-hb-track] > *");
      const txt = (c.querySelector("[data-hb-count],[data-hb-index],[data-hb-total]") || {}).textContent || "";
      if (slides.length === 0 || /NaN|undefined/.test(txt)) out.carousel.push({ who: name(c), y: Math.round(c.getBoundingClientRect().top + scrollY) });
    }
    // D23 기울임 글자
    for (const el of document.querySelectorAll("body *")) {
      if (/^(I|EM|CITE|VAR|ADDRESS)$/.test(el.tagName) || !vis(el)) continue;
      if (getComputedStyle(el).fontStyle !== "italic") continue;
      if (el.parentElement && getComputedStyle(el.parentElement).fontStyle === "italic") continue;
      const t = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim();
      if (t.length >= 2) out.italic.push(t.slice(0, 16));
    }
    out.italic = out.italic.slice(0, 6);
    // D31 형제 3개+ 중 하나만 그림자·떠오름이 다름(선택 상태·쪽 번호·탭은 뺀다)
    const ACT = /\b(active|on|is-active|current|selected|is-on|now)\b/;
    for (const par of document.querySelectorAll("ul, ol, div")) {
      const kids = [...par.children].filter((k) => vis(k) && k.tagName === (par.children[0] || {}).tagName);
      if (kids.length < 3 || kids.length !== par.children.length) continue;
      if (par.closest("[role=tablist],[data-hb-tabs],[data-hb-dots],nav[aria-label*=쪽],.pagination,[class*=pagin],[class*=page-num],[class*=paging]")) continue;
      const sig = (k) => { const s = getComputedStyle(k); return (s.boxShadow !== "none" ? "s" : "") + (s.transform !== "none" ? "t" : ""); };
      const sigs = kids.map(sig); const odd = sigs.map((s, i) => [s, i]).filter(([s]) => s !== "" && sigs.filter((x) => x === s).length === 1);
      if (odd.length === 1 && sigs.filter((s) => s === "").length === kids.length - 1) {
        const k = kids[odd[0][1]];
        if (k.matches("[aria-current],[aria-selected=true],[aria-pressed=true]") || ACT.test(typeof k.className === "string" ? k.className : "")) continue;
        out.oddhover.push({ who: name(k), y: Math.round(k.getBoundingClientRect().top + scrollY), text: (k.textContent || "").trim().slice(0, 14) });
        if (out.oddhover.length >= 4) break;
      }
    }
    // 2026-10-13 점검 2차(D4·D7·D9·D14·D16·D17·D22·D24·D26·D32·D34) — 결과는 out.more 에 모은다
    const more = { head_h: null, foot_h: null, rowdiff: [], emptycard: [], cardgap: [], innerscroll: [], crop: [], dupimg: [], fonts: [], facecolor: [], footcols: null, whiteband: [], cutrow: [] };
    if (head && vis(head)) more.head_h = Math.round(head.getBoundingClientRect().height);
    if (fr) more.foot_h = Math.round(fr.height);
    const isCard = (k) => { const s = getComputedStyle(k); const bg = s.backgroundColor; return (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent" && bg !== bodyBg) || (parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== "none" && parseFloat(s.borderLeftWidth) > 0) || s.boxShadow !== "none"; };
    const hasInk = (k) => [k, ...k.querySelectorAll("*")].some((d) => vis(d) && ([...d.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || /^(IMG|SVG|VIDEO|IFRAME|CANVAS|INPUT|SELECT|TEXTAREA)$/i.test(d.tagName)));
    for (const par of document.querySelectorAll("body *")) {
      if (!vis(par) || par.closest("svg,[data-hb-track],[data-hb=carousel]") || (f && f.contains(par))) continue;
      const kids = [...par.children].filter((k) => vis(k) && getComputedStyle(k).position !== "absolute");
      if (kids.length < 2) continue;
      const r0 = kids[0].getBoundingClientRect();
      const row = kids.filter((k) => Math.abs(k.getBoundingClientRect().top - r0.top) < 4);
      if (row.length < 2 || row.length !== kids.length) continue;
      const cards = row.filter(isCard); const cls = (k) => typeof k.className === "string" ? k.className.trim().split(/\s+/)[0] : "";
      // D7 같은 줄 같은 종류 카드 높이 차
      if (cards.length >= 2 && cards.length === row.length && new Set(cards.map(cls)).size === 1) {
        const hs = cards.map((k) => k.getBoundingClientRect().height); const d = Math.max(...hs) - Math.min(...hs);
        if (d >= 40 && Math.min(...hs) >= 60 && more.rowdiff.length < 4) more.rowdiff.push({ who: name(cards[0]), y: Math.round(r0.top + scrollY), d: Math.round(d) });
        for (const k of cards) if (!hasInk(k) && k.getBoundingClientRect().height >= 60 && more.emptycard.length < 4) more.emptycard.push({ who: name(k), y: Math.round(k.getBoundingClientRect().top + scrollY) });
        // D24 같은 클래스 형제 카드의 면 색이 2종 넘게(선택 상태는 뺀다)
        if (cards.length >= 3) { const bgs = new Set(cards.filter((k) => !k.matches("[aria-current],[aria-selected=true]") && !ACT.test(typeof k.className === "string" ? k.className : "")).map((k) => getComputedStyle(k).backgroundColor)); if (bgs.size >= 3 && more.facecolor.length < 3) more.facecolor.push({ who: name(cards[0]), y: Math.round(r0.top + scrollY), n: bgs.size }); }
      }
    }
    // D14 카드 안 내용 사이 틈 100px 넘음(space-between·고정 높이)
    for (const k of document.querySelectorAll("body *")) {
      if (more.cardgap.length >= 4) break;
      if (!vis(k) || !isCard(k) || (f && f.contains(k)) || k.closest("[data-hb-track]")) continue;
      const r = k.getBoundingClientRect(); if (r.height < 200 || r.width < 120 || r.width > W * 0.9) continue;
      const ys = []; for (const d of k.querySelectorAll("*")) { if (!vis(d)) continue; const own = [...d.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()); if (!own && !/^(IMG|SVG|BUTTON|INPUT)$/i.test(d.tagName)) continue; const b = d.getBoundingClientRect(); ys.push([b.top, b.bottom]); }
      if (ys.length < 2) continue; ys.sort((a, b) => a[0] - b[0]);
      let end = ys[0][1], worst = 0; for (let i = 1; i < ys.length; i++) { const g = ys[i][0] - end; if (g > worst) worst = g; end = Math.max(end, ys[i][1]); }
      if (worst > 100) more.cardgap.push({ who: name(k), y: Math.round(r.top + scrollY), g: Math.round(worst) });
    }
    // D16 300px 아래 칸 안쪽 세로 스크롤 · D34 가로 넘김 줄이 단추 없이 카드를 자름
    for (const el of document.querySelectorAll("body *")) {
      if (!vis(el) || el.closest("[data-hb=carousel]")) continue; const s = getComputedStyle(el); const r = el.getBoundingClientRect();
      if ((s.overflowY === "auto" || s.overflowY === "scroll") && r.height < 300 && r.height > 40 && el.scrollHeight > el.clientHeight + 4 && more.innerscroll.length < 4) more.innerscroll.push({ who: name(el), y: Math.round(r.top + scrollY), h: Math.round(r.height) });
      if ((s.overflowX === "auto" || s.overflowX === "scroll" || s.overflowX === "hidden") && r.width > 300 && el.scrollWidth > el.clientWidth + 10 && el.children.length >= 3 && !el.matches("[data-hb-track],[role=tablist]") && more.cutrow.length < 3) {
        const cut = [...el.children].some((c) => { const b = c.getBoundingClientRect(); return b.width > 60 && b.left < r.right - 4 && b.right > r.right + 4; });
        const btn = el.parentElement && el.parentElement.querySelector("button,[data-hb-prev],[data-hb-next]");
        if (cut && !btn) more.cutrow.push({ who: name(el), y: Math.round(r.top + scrollY) });
      }
    }
    // D22·D17 그림 비율 극단 자르기·글자 그림 자르기 · D9 같은 그림 반복 · D32 그림 아래 흰 띠
    const srcs = {};
    for (const im of document.querySelectorAll("img")) {
      if (!vis(im) || !im.naturalWidth) continue; const r = im.getBoundingClientRect(); const s = getComputedStyle(im);
      const src = im.currentSrc || im.src;
      if (r.width >= 120 && r.height >= 80 && !im.closest("[data-hb-track] > *:not(:first-child)")) srcs[src] = (srcs[src] || 0) + 1;
      if (s.objectFit === "cover" && r.width >= 240 && r.height >= 120 && !im.closest("[data-hb=carousel], [data-hb-track], .swiper, .slick-track, [class*=accordion]")) {
        const nr = im.naturalWidth / im.naturalHeight, br = r.width / r.height, k = Math.max(nr, br) / Math.min(nr, br);
        const textual = /banner|popup|poster|card|info|notice|news-card|cardnews/i.test(src + " " + (im.alt || ""));
        if ((k >= 2.5 || textual && k >= 1.25) && more.crop.length < 4) more.crop.push({ y: Math.round(r.top + scrollY), k: Math.round(k * 10) / 10, textual, src: src.split("?")[0].split("/").filter((x) => x && !/^(original|thumb|mcp|og|preview.png)$/.test(x)).pop().slice(0, 32) });
      }
      const par = im.parentElement; if (par && par.children.length === 1 && isCard(par) === false) { const pr = par.getBoundingClientRect(); const d = pr.bottom - r.bottom; if (d >= 3 && d <= 30 && Math.abs(pr.width - r.width) < 4 && more.whiteband.length < 3) more.whiteband.push({ y: Math.round(r.bottom + scrollY), d: Math.round(d) }); }
    }
    more.dupimg = Object.entries(srcs).filter(([, n]) => n >= 2).map(([s, n]) => ({ src: s.split("?")[0].split("/").filter((x) => x && !/^(original|thumb|mcp|og|preview.png)$/.test(x)).pop().slice(0, 32), n })).slice(0, 4);
    { const fam = {}; for (const el of document.querySelectorAll("body *")) { if (!vis(el) || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)) continue; const ff = getComputedStyle(el).fontFamily.split(",")[0].replace(/["']/g, "").trim(); if (/icon|symbol|material|mono|awesome/i.test(ff)) continue; fam[ff] = (fam[ff] || 0) + 1; } more.fonts = Object.entries(fam).filter(([, n]) => n >= 3).map(([k]) => k); }
    // D26 바닥 사이트맵 단 높이 편차
    if (f) { const cols = [...f.querySelectorAll("ul, dl")].filter((u) => vis(u) && u.children.length >= 2); const r0 = cols[0] && cols[0].getBoundingClientRect(); const row = r0 ? cols.filter((c) => Math.abs(c.getBoundingClientRect().top - r0.top) < 30) : []; if (row.length >= 3) { const hs = row.map((c) => c.getBoundingClientRect().height); more.footcols = { n: row.length, ratio: Math.round(Math.max(...hs) / Math.max(1, Math.min(...hs)) * 10) / 10 }; } }
    out.more = more;
    return out;
  }).catch(() => null);
}

// 잰 값 → 감점·치명·고칠 목록. peers 는 같은 묶음 다른 장의 판정 기록(result.visual 이 있으면 바닥글 위 여백 비교)
export function visualFixes(v, { sub = false, peers = [] } = {}) {
  const fixes = []; const hard = []; let minus = 0;
  if (!v) return { minus, hard, fixes };
  if (v.foot) {
    const g = v.foot.gap;
    if (g <= 2) { minus += 8; fixes.push(`바닥글 여백 · 마지막 내용이 바닥글(y ${v.foot.y})에 붙어 있다(간격 ${g}px) — 바닥글 위에 80px(모바일 48px) 여백을 둔다(바닥글 margin-top 또는 마지막 섹션 아래 여백).`); }
    else if (g < 40) { minus += 4; fixes.push(`바닥글 여백 · 마지막 내용과 바닥글 사이가 ${g}px 로 좁다 — 80px 안팎으로 띄운다.`); }
    else if (g > 300) { minus += 8; fixes.push(`바닥글 여백 · 마지막 내용 아래로 바닥글까지 ${g}px 가 비어 있다 — 마지막 섹션의 고정 높이·min-height·큰 아래 여백을 걷어 내고 80px 안팎으로.`); }
    else if (g > 120) { minus += 4; fixes.push(`바닥글 여백 · 마지막 내용과 바닥글 사이가 ${g}px 로 넓다 — 80px 안팎으로 줄인다.`); }
    const pg = peers.map((x) => x?.visual?.foot?.gap).filter((x) => Number.isFinite(x));
    if (pg.length) { const med = pg.sort((a, b) => a - b)[Math.floor(pg.length / 2)]; if (Math.abs(med - g) > 40) { minus += 4; fixes.push(`바닥글 여백 · 같은 시안 다른 장은 바닥글 위 여백이 ${med}px 인데 이 장은 ${g}px 이다 — 한 값으로 맞춘다.`); } }
  }
  if (v.bands?.length) {
    const big = v.bands.filter((b) => b.h >= 400);
    minus += Math.min(12, big.length * 8 + (v.bands.length - big.length) * 3);
    for (const b of v.bands.slice(0, 4)) fixes.push(`빈 띠 · y ${b.y} 부터 ${b.h}px 동안 글·그림·면이 하나도 없다 — 고정 높이·min-height·큰 padding 을 걷어 내거나, 빈 자리라면 그림·카드를 채운다.`);
    if (big.length && !sub) hard.push("내용 없는 400px 넘는 빈 띠");
  }
  if (v.plain?.length) {
    const empty = v.plain.filter((s) => s.text === 0 && s.deco === 0);
    minus += Math.min(10, v.plain.length * 5);
    for (const s of v.plain.slice(0, 3)) fixes.push(`꾸밈 부족 · ${s.who}(y ${s.y}, ${s.w}×${s.h})이 넓은데 글 ${s.text}%·그림/면 ${s.deco}% 뿐이다 — 사진·일러스트·카드 면·배경 무늬 중 하나를 넣어 채우거나 높이를 내용만큼 줄인다.`);
    if (empty.length) hard.push("글도 그림도 없는 넓은 섹션");
  }
  if (v.sec_gaps?.length >= 3) {
    const gs = v.sec_gaps.map((s) => s.gap).sort((a, b) => a - b); const med = gs[Math.floor(gs.length / 2)];
    const odd = v.sec_gaps.filter((s) => med > 0 && s.gap > med * 3 && s.gap - med > 80);
    if (odd.length) { minus += Math.min(6, odd.length * 3); for (const s of odd.slice(0, 3)) fixes.push(`섹션 간격 · y ${s.y}(${s.who}) 위 간격이 ${s.gap}px 인데 다른 섹션 사이는 보통 ${med}px 이다 — 섹션 사이 여백을 한 값(--hb-section-gap)으로.`); }
  }
  if (v.h1 !== 1) { minus += 2; fixes.push(v.h1 === 0 ? "제목 구조 · h1 이 없다 — 메인은 기관 이름(로고 글), 서브는 페이지 이름을 h1 하나로." : `제목 구조 · h1 이 ${v.h1}개다 — 페이지에 하나만 둔다(나머지는 h2).`); }
  if (v.hash?.all >= 10 && v.hash.n / v.hash.all >= 0.5) { minus += 2; fixes.push(`링크 · 링크 ${v.hash.all}개 중 ${v.hash.n}개가 # 이다 — menu 의 file 주소나 같은 페이지 안 앵커(#id)로 바꾼다.`); }
  if (v.clip?.length) { hard.push("글·단추가 잘림"); minus += Math.min(15, v.clip.length * 5); for (const c of v.clip.slice(0, 4)) fixes.push(`잘림 · ${c.who}(y ${c.y}, 높이 ${c.h})이 overflow:hidden 이라 "${c.what}"가 ${c.over}px 잘린다 — 고정 height 를 걷어 내고 내용이 높이를 정하게 한다(줄 수 제한은 -webkit-line-clamp).`); }
  if (v.overlap?.length) { hard.push("요소가 서로 겹침"); minus += Math.min(15, v.overlap.length * 5); for (const o of v.overlap.slice(0, 4)) fixes.push(`겹침 · y ${o.y} 의 ${o.who}가 위의 ${o.on}와 ${o.v}px 겹친다 — 음수 margin·고정 높이를 걷어 낸다.`); }
  if (v.carousel?.length) { hard.push("빈 캐러셀"); minus += 10; fixes.push(`빈 캐러셀 · ${v.carousel.map((c) => `${c.who}(y ${c.y})`).join(", ")} 에 슬라이드가 없거나 쪽수가 NaN 이다 — 슬라이드 3개 이상을 넣거나 캐러셀을 걷어 낸다.`); }
  if (v.italic?.length) { minus += 3; fixes.push(`글꼴 · 기울임 글자가 있다(${v.italic.join(", ")}) — font-style:italic 을 걷어 낸다(관공서 화면은 기울임을 쓰지 않는다).`); }
  if (v.oddhover?.length) { minus += Math.min(6, v.oddhover.length * 3); for (const o of v.oddhover.slice(0, 2)) fixes.push(`굳은 호버 · y ${o.y} 의 형제 카드 중 "${o.text}"(${o.who}) 하나만 그림자·떠오름이 켜져 있다 — 호버 효과는 :hover 에만, 선택 상태는 aria-current·aria-selected 로.`); }
  const m = v.more;
  if (m) {
    // D4 같은 시안 다른 장과 머리·바닥 높이가 다름
    for (const [key, label] of [["head_h", "머리"], ["foot_h", "바닥"]]) {
      const ps = peers.map((x) => x?.visual?.more?.[key]).filter((x) => Number.isFinite(x));
      if (ps.length && Number.isFinite(m[key])) { const med = ps.sort((a, b) => a - b)[Math.floor(ps.length / 2)]; if (Math.abs(med - m[key]) > Math.max(24, med * 0.2)) { minus += 4; fixes.push(`공통 틀 · 같은 시안 다른 장의 ${label} 높이는 ${med}px 인데 이 장은 ${m[key]}px 이다 — 머리·바닥은 메인 것을 그대로 쓴다(hb:use).`); } }
    }
    if (m.rowdiff?.length) { minus += Math.min(6, m.rowdiff.length * 3); for (const r of m.rowdiff.slice(0, 2)) fixes.push(`칸 높이 · y ${r.y} 줄의 같은 종류 카드(${r.who}) 높이가 ${r.d}px 차이 난다 — 줄을 align-items:stretch 로 두고 카드 안 내용을 맞춘다.`); }
    if (m.emptycard?.length) { minus += Math.min(8, m.emptycard.length * 4); fixes.push(`빈 카드 · ${m.emptycard.map((c) => `${c.who}(y ${c.y})`).join(", ")} 에 글·그림이 없다 — 내용을 채우거나 카드를 뺀다.`); }
    if (m.cardgap?.length) { minus += Math.min(6, m.cardgap.length * 2); for (const c of m.cardgap.slice(0, 2)) fixes.push(`카드 속 틈 · ${c.who}(y ${c.y}) 안 내용 사이가 ${c.g}px 비어 있다 — justify-content:space-between·고정 높이를 걷어 내고 간격을 16~24px 로.`); }
    if (m.innerscroll?.length) { minus += Math.min(6, m.innerscroll.length * 3); fixes.push(`안쪽 스크롤 · ${m.innerscroll.map((c) => `${c.who}(y ${c.y}, 높이 ${c.h})`).join(", ")} 칸 안에 세로 스크롤이 생긴다 — 높이 고정을 풀어 내용을 다 보이게 하거나 항목 수를 줄인다.`); }
    if (m.cutrow?.length) { minus += 3; fixes.push(`가로 넘김 · ${m.cutrow.map((c) => `${c.who}(y ${c.y})`).join(", ")} 가 카드를 반쯤 자른 채 넘김 단추가 없다 — 한 화면 장수를 정수로 맞추고 이전·다음 단추를 둔다(data-hb="carousel").`); }
    if (m.crop?.length) { const tx = m.crop.filter((c) => c.textual); minus += Math.min(8, m.crop.length * 2 + tx.length * 2); for (const c of m.crop.slice(0, 2)) fixes.push(`그림 자르기 · y ${c.y} 의 ${c.src} 가 비율 ${c.k}배 차로 잘린다${c.textual ? "(글자 든 그림이라 글이 잘린다)" : ""} — 칸 비율에 맞는 다른 샘플을 고르거나 ${c.textual ? "object-fit:contain" : "object-position:center 30%"}.`); }
    if (m.dupimg?.length) { minus += Math.min(4, m.dupimg.length * 2); fixes.push(`그림 반복 · 같은 그림을 여러 칸에 썼다(${m.dupimg.map((d) => `${d.src} ×${d.n}`).join(", ")}) — 칸마다 다른 샘플을 쓴다.`); }
    if (m.fonts?.length > 2) { minus += 3; fixes.push(`글꼴 · 글꼴이 ${m.fonts.length}종 섞였다(${m.fonts.slice(0, 4).join(", ")}) — theme.font 의 본문·제목 2종까지.`); }
    if (m.facecolor?.length) { minus += 3; fixes.push(`면 색 · ${m.facecolor.map((c) => `y ${c.y} ${c.who}`).join(", ")} 같은 역할 카드의 면 색이 ${m.facecolor[0].n}종이다 — 한 색으로(강조할 하나만 다르게).`); }
    if (m.footcols && m.footcols.ratio >= 3) { minus += 2; fixes.push(`바닥 사이트맵 · 단 ${m.footcols.n}개의 높이가 ${m.footcols.ratio}배 차이 난다 — 단마다 항목 수를 고르게 나눈다.`); }
    if (m.whiteband?.length) { minus += 2; fixes.push(`그림 아래 띠 · 그림 아래 ${m.whiteband.map((w) => `y ${w.y} ${w.d}px`).join(", ")} 흰 띠가 남는다 — img 를 display:block 으로.`); }
  }
  return { minus, hard, fixes };
}

// D11: 같은 종류 고칠 점이 3개 넘게 몰리면 통과시키지 않는다(점수 84 상한)
export function capByKinds(fixes) {
  const kinds = {};
  for (const f of fixes) { const k = f.split(" · ")[0]; if (k.length > 12) continue; kinds[k] = (kinds[k] || 0) + 1; }
  const many = Object.entries(kinds).filter(([, n]) => n >= 3).map(([k]) => k);
  return many;
}

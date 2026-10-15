// 출처: homebox-handoff packages/mcp/src/qa/gates.mjs 에서 가져옴 (powerMCP 이식 2026-10-06)
// 목업 게이트 검사 — 렌더된 페이지에서 잰다. .claude/skills/reference-design/ledger.md 의 실수를 코드로 잡는다.
// MCP check_mockup(서버)과 scripts/mockup-qa.mjs(로컬)가 같이 쓴다 (2026-10-02 scripts 에서 옮김).

/** @returns {Promise<{r: Record<string, any>, fails: string[]}>} */
export async function gates(p) {
  const r = await p.evaluate(() => {
    const vis = (el) => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && b.width > 0 && b.height > 0; };
    const txt = (el) => (el.innerText || "").replace(/\s+/g, " ").trim();
    // 샘플 주소는 …/{key}/web 꼴이라 끝 조각만 쓰면 "original ×3" 처럼 어느 그림인지 몰랐다(2026-10-15 시험 s04) — 열쇠/종류로
    const imgName = (im) => { const p = String(im.currentSrc || im.src || "").split("?")[0].split("/").filter(Boolean); const n = p.pop() || ""; return /^(original|web|thumb|card)$/.test(n) ? `${p.pop()}/${n}` : n; };
    const out = {};
    // 가로 넘침
    out.overflowX = document.documentElement.scrollWidth - innerWidth;
    // 헤더·푸터 개수(landmark 또는 역할 주석 기준)
    out.headers = [...document.querySelectorAll("header, [role=banner], .krds-header, .hb-header")].filter(vis).filter((e) => !e.parentElement.closest("header, [role=banner], main, article")).length; // 게시글 안 <header> 는 페이지 머리가 아니다
    out.footers = [...document.querySelectorAll("footer, [role=contentinfo]")].filter(vis).filter((e) => !e.parentElement.closest("footer")).length;
    // 제목 중복(C1·C2): 섹션 제목(h2·h3) 같은 문구가 2번 이상 — 캐러셀 슬라이드 안 제목은 슬라이드 1번만 센다
    const heads = [...document.querySelectorAll("h2, h3")].filter(vis).map(txt).filter((t) => t.length >= 2);
    const cnt = {}; heads.forEach((h) => (cnt[h] = (cnt[h] || 0) + 1));
    out.dupHeadings = Object.entries(cnt).filter(([, n]) => n > 1).map(([h, n]) => `${h}×${n}`);
    // 같은 문장 중복(C1): 20자 이상 문단·강조 문장
    const sents = [...document.querySelectorAll("p, strong, h1, h2")].filter(vis).map(txt).filter((t) => t.length >= 20);
    const sc = {}; sents.forEach((s) => (sc[s] = (sc[s] || 0) + 1));
    out.dupSentences = Object.entries(sc).filter(([, n]) => n > 1).map(([s, n]) => `${s.slice(0, 30)}…×${n}`);
    // 숫자만 있는 제목·링크(B3)
    out.numericTitles = [...document.querySelectorAll("h2, h3, strong, .hb-card-title, nav a, aside a")].filter(vis).filter((el) => el.tagName !== "STRONG" || txt(el.parentElement) === txt(el))
      // 페이지 번호는 제외(2026-10-05 R5: 게시판 페이저의 1·2·3 을 숫자 제목으로 오탐) — 페이저 클래스·aria 이거나 형제 중 숫자 링크가 3개 이상
      .filter((el) => !el.closest("[class*=pag], [class*=pager], [aria-label*=페이지], [aria-label*=pagination]") && [...(el.parentElement?.parentElement ?? el.parentElement ?? document.body).querySelectorAll("a, button")].filter((x) => /^\d{1,3}$/.test(txt(x))).length < 3)
      .map(txt).filter((t) => /^\d{1,3}$/.test(t));
    // 빈 카드(C·B2): 테두리 있는 상자인데 글자 3자 미만·이미지 없음 제외, 또는 제목 한 줄만 있고 높이 120+
    out.emptyCards = [...document.querySelectorAll("a, li, div, section")].filter(vis).filter((el) => {
      const s = getComputedStyle(el); const b = el.getBoundingClientRect();
      if (b.height < 120 || b.width < 150) return false;
      const bordered = parseFloat(s.borderTopWidth) > 0 && parseFloat(s.borderLeftWidth) > 0;
      if (!bordered) return false;
      const hasImg = el.querySelector("img, svg, video, iframe, table");
      const t = txt(el);
      // 글 줄이 3개 이상이면(조직도 국 상자 = 국 이름 + 과 3개) 짧아도 빈 카드가 아니다(일괄 수정 배치10 오탐)
      const lines = [...el.querySelectorAll("*")].filter((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).length;
      return !hasImg && t.length < 25 && el.children.length <= 3 && lines < 3;
    }).length;
    // 글자 잘림(C3): 말줄임된 요소 수 — 목록 제목 외에도 잘리면 문제
    out.clipped = [...document.querySelectorAll("*")].filter(vis).filter((el) => {
      const s = getComputedStyle(el);
      return (s.textOverflow === "ellipsis" || s.webkitLineClamp !== "none") && el.scrollWidth > el.clientWidth + 1 && el.children.length === 0;
    }).map(txt).slice(0, 15);
    // 글자 든 이미지 잘림(E1): data-has-text 가 있거나 파일명이 banner·popup·card-news·poster·infographic 인 이미지가 object-fit cover 로 잘림
    out.textImgCropped = [...document.images].filter(vis).filter((im) => {
      if (!/banner|popup|card-news|poster|infographic/.test(im.src) && !im.dataset.hasText) return false;
      const s = getComputedStyle(im); if (s.objectFit !== "cover" && s.objectFit !== "fill") {
        // 조상 overflow hidden 에 의한 잘림
      }
      const b = im.getBoundingClientRect(); if (!im.naturalWidth) return false;
      const boxR = b.width / b.height, natR = im.naturalWidth / im.naturalHeight;
      const clipAnc = (() => { let a = im.parentElement; while (a) { const cs = getComputedStyle(a); if (cs.overflow !== "visible") { const ab = a.getBoundingClientRect(); if (ab.top > b.top + 2 || ab.bottom < b.bottom - 2) return true; } a = a.parentElement; } return false; })();
      return (s.objectFit === "cover" && Math.abs(boxR - natR) / natR > 0.04) || clipAnc;
    }).map((im) => imgName(im));
    // 빈 이미지 여백(E2): contain 인데 상자 비율이 크게 다름
    out.letterbox = [...document.images].filter(vis).filter((im) => {
      const s = getComputedStyle(im); if (s.objectFit !== "contain" || !im.naturalWidth) return false;
      const b = im.getBoundingClientRect(); if (b.width < 72 && b.height < 72) return false; // 아이콘·로고 조각은 여백이 정상
      return Math.abs(b.width / b.height - im.naturalWidth / im.naturalHeight) / (im.naturalWidth / im.naturalHeight) > 0.15;
    }).map((im) => imgName(im));
    // 날짜 순서(D1): 같은 목록(ul/ol/tbody) 안 날짜가 최신순이 아님
    out.dateOrder = [];
    for (const list of document.querySelectorAll("ul, ol, tbody")) {
      if (!vis(list)) continue;
      const ds = [...list.children].map((li) => (txt(li).match(/20\d\d[.-]\d\d[.-]\d\d/) || [])[0]).filter(Boolean);
      if (ds.length < 3) continue;
      const bad = ds.some((d, i) => i > 0 && d > ds[i - 1]);
      if (bad) out.dateOrder.push(ds.slice(0, 5).join(" → "));
    }
    // 같은 줄 아이콘 중복(D3): 형제 항목들의 svg path 가 같음
    out.dupIcons = [];
    // 글보다 뒤에 오는 아이콘(더보기 화살표·셰브런)은 항목 아이콘이 아니다 — 2026-10-03 시험에서 줄 끝 화살표·내비 셰브런이 중복으로 걸렸다
    const afterText = (it, s) => { const w = document.createTreeWalker(it, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) { if (!n.textContent.trim()) continue; return !!(n.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING); } return false; };
    for (const list of document.querySelectorAll("ul, ol, div")) {
      if (list.closest("header, nav, footer, [data-hb=gnb], [data-hb=menu], [data-hb=tabs]")) continue;
      const items = [...list.children].filter(vis); if (items.length < 4) continue;
      // 항목 아이콘만 본다 — 링크 뒤 화살표(외부 링크 표시·다음)는 모두 같아야 정상
      const sigs = items.map((it) => [...it.querySelectorAll("svg")].find((s) => !s.closest(".mm-ext, .mm-arrow, .pg-arrow, .mm-play-ico, .hb-same, [data-hb-open], [data-hb-label], [data-hb-next], [data-hb-prev], [data-hb-pause], [data-hb-close]") && s.getBoundingClientRect().width >= 18 && !afterText(it, s))?.querySelector("path")?.getAttribute("d")?.slice(0, 60)).filter(Boolean);
      if (sigs.length < 4) continue;
      const c = {}; sigs.forEach((s) => (c[s] = (c[s] || 0) + 1));
      const d = Object.values(c).filter((n) => n > 1).reduce((a, n) => a + n, 0);
      if (d) { const nm = list.tagName.toLowerCase() + ((typeof list.className === "string" && list.className.trim()) ? "." + list.className.trim().split(/\s+/)[0] : ""); out.dupIcons.push(`${nm} (y ${Math.round(list.getBoundingClientRect().top + scrollY)}) ${items.length}칸 중 ${d}칸 같은 아이콘 — 칸마다 다른 아이콘, 같아야 하는 표시(화살표 등)는 .hb-same 으로 감싼다`); }
    }
    // 큰 빈 공간(C4): 문서 세로 구간 중 보이는 요소가 없는 200px+ 띠
    const H = document.documentElement.scrollHeight; const occ = new Uint8Array(Math.ceil(H / 10));
    for (const el of document.querySelectorAll("body *")) {
      if (el.children.length && !["IMG", "SVG", "VIDEO", "IFRAME"].includes(el.tagName)) { if (!txt(el) || el.querySelector("*")) { /* 부모는 자식으로 센다 */ } }
      if (!vis(el)) continue; const b = el.getBoundingClientRect();
      // 지도·영상 iframe 도 내용이다 — 오시는 길 지도 자리를 "200px+ 빈 공간"으로 잡던 오탐(2026-10-15 시험 s09)
      const own = el.tagName === "IMG" || el.tagName === "svg" || el.tagName === "IFRAME" || el.tagName === "VIDEO" || el.tagName === "CANVAS" || (el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) || (getComputedStyle(el).backgroundImage !== "none") || (getComputedStyle(el).backgroundColor !== "rgba(0, 0, 0, 0)" && b.height < 400);
      // data-qa-gap = 레퍼런스에도 있는 여백(재현 시안에서 일부러 둔 빈 공간) — 빈 공간으로 세지 않는다(2026-10-01)
      if (!own && !el.hasAttribute("data-qa-gap")) continue;
      for (let y = Math.max(0, Math.floor((b.top + scrollY) / 10)); y < Math.min(occ.length, Math.ceil((b.bottom + scrollY) / 10)); y++) occ[y] = 1;
    }
    out.gaps = []; let run = 0;
    for (let i = 0; i <= occ.length; i++) { if (i < occ.length && !occ[i]) run++; else { if (run >= 20) out.gaps.push(`${(i - run) * 10}px~ ${run * 10}px`); run = 0; } }
    // 같은 행 높이(C 좌우 높이): 그리드·플렉스 행 안 카드 하단 차이
    out.rowMismatch = [];
    for (const row of document.querySelectorAll("*")) {
      const s = getComputedStyle(row); if (!(s.display.includes("grid") || s.display.includes("flex")) || s.flexDirection === "column") continue;
      const kids = [...row.children].filter(vis).filter((k) => k.getBoundingClientRect().height > 150);
      if (kids.length < 2) continue;
      if (kids.some((k) => k.matches("nav, aside") || k.querySelector(":scope > nav"))) continue; // [LNB | 본문] 은 높이가 달라야 정상
      if (kids.some((k) => k.matches("figure") && (k.innerText || "").trim().length < 40)) continue; // [인물 사진 | 본문] 도 높이가 다른 게 정상
      const tops = kids.map((k) => Math.round(k.getBoundingClientRect().top)); if (Math.max(...tops) - Math.min(...tops) > 8) continue;
      const bots = kids.map((k) => k.getBoundingClientRect().bottom); const diff = Math.max(...bots) - Math.min(...bots);
      if (diff > 8) out.rowMismatch.push(`${Math.round(diff)}px (${kids.length}칸)`);
    }
    // 안 보이는 글자(C14): 글자색과 실제 뒤 배경색 대비 < 1.6 — 흰 면에 흰 글자면 '빈 카드'로 보인다
    const rgb = (c) => { const v = (c.match(/[\d.]+/g) || []).map(Number); return c.startsWith("color(") ? [v[0] * 255, v[1] * 255, v[2] * 255, v[3] ?? 1] : v; }; // color-mix 결과는 color(srgb 0~1)
    const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const overImg = (el, n) => { const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; return [...n.querySelectorAll(":scope > img, :scope > * > img")].some((im) => { const b = im.getBoundingClientRect(); return cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom; }); };
    // ::before 로 깐 짙은 띠(position:absolute)도 글자 뒤 면이다 — 흰 글자를 "안 보이는 글자"로 잡던 오탐(2026-10-15 시험 s07)
    // 판만 바탕으로 — 탭 위 3px 막대·목록 앞 5px 점 같은 작은 꾸밈을 글자 뒤 면으로 보던 오탐(일괄 수정 배치8). 가상요소 크기가 상자의 절반 이상일 때만
    const pseudoBg = (n) => { const nb = n.getBoundingClientRect(); for (const ps of ["::before", "::after"]) { const p = getComputedStyle(n, ps); if (!p.content || p.content === "none" || p.position !== "absolute") continue; const pw = parseFloat(p.width), ph = parseFloat(p.height); if ((pw && pw < nb.width * 0.5) || (ph && ph < nb.height * 0.5)) continue; if (p.backgroundImage !== "none") return "img"; const c = rgb(p.backgroundColor); if (c.length >= 3 && (c[3] ?? 1) > 0.5) return c; } return null; };
    const bgOf = (el) => { for (let n = el; n; n = n.parentElement) { const s = getComputedStyle(n); if (s.backgroundImage !== "none" || overImg(el, n)) return null; const pb = pseudoBg(n); if (pb === "img") return null; if (pb) return pb; const c = rgb(s.backgroundColor); if (c.length >= 3 && (c[3] ?? 1) > 0.5) return c; } return [255, 255, 255]; };
    out.invisible = [];
    for (const el of document.querySelectorAll("main a, main span, main strong, main p, main li, main h2, main h3, main button")) {
      if (!vis(el) || [...el.childNodes].every((n) => n.nodeType !== 3 || !n.textContent.trim())) continue;
      // 닫힌 전체메뉴·레이어 안 글(투명·hidden·aria-hidden 조상)은 안 보이는 게 정상 — '새솔군청' 오탐(배치6)
      { let off = false; for (let a = el; a && a !== document.body; a = a.parentElement) { const cs = getComputedStyle(a); if (+cs.opacity < 0.1 || cs.visibility === "hidden" || a.hasAttribute("hidden") || a.getAttribute("aria-hidden") === "true") { off = true; break; } } if (off) continue; }
      const bg = bgOf(el); if (!bg) continue; // 사진 위 글자는 제외
      const a = lum(rgb(getComputedStyle(el).color)), b = lum(bg);
      if ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) < 1.6) out.invisible.push(txt(el).slice(0, 20));
    }
    out.invisible = [...new Set(out.invisible)].slice(0, 8);
    // 남은 자리표시(D6): "[게시물 제목 — 두 줄까지]" 처럼 치환 규칙에 안 걸린 변형이 원문 그대로 노출된다
    out.placeholders = [...new Set((document.body.innerText.match(/\[[가-힣A-Za-z0-9][^\]\n]{0,30}\]/g) || []))].slice(0, 8);
    // 글자 기호 금지(2026-09-30 사용자 지시): 화살표·꺾쇠·더하기·말줄임은 로컬 머티리얼 아이콘으로. 글·가상요소 둘 다 본다.
    const SYM = /[›‹»«▶◀▼▲▾▸►◄→←↑↓↗✓✔✕✖×＋➔➜❯❮☰⋯…]|(^|\s)[+>](\s|$)/;
    out.symbols = [];
    { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) { if (n.parentElement.closest("script,style")) continue; if (SYM.test(n.nodeValue)) out.symbols.push(n.nodeValue.trim().slice(0, 20)); } }
    for (const el of document.querySelectorAll("*")) for (const ps of ["::before", "::after"]) { const c = getComputedStyle(el, ps).content; if (c && c !== "none" && c !== "normal" && SYM.test(c.replace(/^"|"$/g, ""))) out.symbols.push(ps + " " + c); }
    out.symbols = [...new Set(out.symbols)].slice(0, 8);
    // 글·아이콘 세로 중심: 같은 부모 안의 글과 머티리얼 아이콘 중심 차이 2px 초과
    out.iconOffset = [];
    for (const s of document.querySelectorAll("svg.mi")) { const par = s.parentElement; const tn = [...par.childNodes].find((x) => x !== s && (x.textContent || "").trim()); if (!tn) continue;
      let tr; if (tn.nodeType === 3) { const rg = document.createRange(); rg.selectNodeContents(tn); tr = rg.getBoundingClientRect(); } else tr = tn.getBoundingClientRect();
      const sr = s.getBoundingClientRect(); if (!tr.height || !sr.height) continue;
      if (sr.bottom <= tr.top + 2 || tr.bottom <= sr.top + 2) continue; // 아이콘 위·글 아래로 쌓은 배치는 세로 중심 대상이 아니다
      const d = Math.abs((sr.top + sr.height / 2) - (tr.top + tr.height / 2)); if (d > 2) out.iconOffset.push(`${(tn.textContent || "").trim().slice(0, 10)} ${d.toFixed(1)}px`); }
    out.iconOffset = out.iconOffset.slice(0, 8);
    // 화면 끝에 붙은 글자: 글자 덩어리가 화면 왼쪽·오른쪽 4px 안까지 닿음(2026-10-15 시험 — 서브 비주얼 제목·경로가 x 0 에 붙어 '홈' 이 잘렸는데 91점,
    // 모바일 알림 띠 글이 왼쪽 끝 0px). 흐르는 띠(넘침을 자르는 조상이 화면 폭 가득)·화면 밖 슬라이드는 뺀다.
    out.edgeText = [];
    { const W = innerWidth; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode()) && out.edgeText.length < 6) {
        const t = n.nodeValue.trim(); if (t.length < 2) continue; const el = n.parentElement; if (!el || el.closest("script,style,[aria-hidden=true]") || !vis(el)) continue;
        { let hid = false; for (let a = el; a && a !== document.body; a = a.parentElement) { const cs = getComputedStyle(a); const ab = a.getBoundingClientRect(); if (cs.clip !== "auto" || (cs.clipPath && cs.clipPath !== "none") || ab.width <= 2 || ab.height <= 2) { hid = true; break; } } if (hid) continue; } // 화면에서 숨긴 제목(.sr·sr-only)은 빼고
        const rg = document.createRange(); rg.selectNodeContents(n); const b = rg.getBoundingClientRect(); if (!b.width || !b.height) continue;
        if (b.left >= 4 && b.right <= W - 4) continue;
        if (b.right <= 0 || b.left >= W) continue; // 화면 밖(넘김 슬라이드)
        let clipped = false; for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const cs = getComputedStyle(a); if (cs.overflowX !== "visible") { const ab = a.getBoundingClientRect(); if (b.left < ab.left - 1 || b.right > ab.right + 1) { clipped = true; break; } } } /* 본문 폭 캐러셀 칸이 자르는 다음 장 글도 화면에 안 보인다(배치5 오탐) */
        if (clipped) continue;
        out.edgeText.push(`${t.slice(0, 16)} (x ${Math.round(b.left)}~${Math.round(b.right)})`);
      } }
    out.height = H;
    return out;
  });
  // 판정
  const fails = [];
  const chk = (ok, name, v) => { if (!ok) fails.push(`${name}: ${Array.isArray(v) ? v.join(" | ") : v}`); };
  chk(r.overflowX <= 0, "가로 넘침", `${r.overflowX}px`);
  chk(r.headers === 1, "헤더 개수", r.headers);
  chk(r.footers === 1, "푸터 개수", r.footers);
  chk(!r.dupHeadings.length, "제목 중복", r.dupHeadings);
  chk(!r.dupSentences.length, "문장 중복", r.dupSentences);
  chk(!r.numericTitles.length, "숫자만 있는 제목", r.numericTitles);
  chk(r.emptyCards === 0, "빈 카드", r.emptyCards);
  chk(!r.clipped.length, "글자 잘림", r.clipped);
  chk(!r.textImgCropped.length, "글자 든 이미지 잘림", r.textImgCropped);
  chk(!r.letterbox.length, "이미지 빈 띠", r.letterbox);
  chk(!r.dateOrder.length, "날짜 순서", r.dateOrder);
  chk(!r.dupIcons.length, "아이콘 중복", r.dupIcons);
  chk(!r.gaps.length, "200px+ 빈 공간", r.gaps);
  chk(!r.rowMismatch.length, "같은 행 높이 차", r.rowMismatch);
  chk(!r.placeholders.length, "남은 자리표시", r.placeholders);
  chk(!r.symbols.length, "글자 기호(아이콘으로 바꿀 것)", r.symbols);
  chk(!r.iconOffset.length, "글·아이콘 세로 중심 어긋남", r.iconOffset);
  chk(!r.invisible.length, "안 보이는 글자", r.invisible);
  chk(!r.edgeText.length, "화면 끝에 붙은 글자(좌우 안쪽 여백 없음)", r.edgeText);
  return { r, fails };
}

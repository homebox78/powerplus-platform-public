// 화면 구성 일관성 검사 — 사용자 지적(2026-10-15 '한국미래에너지공사' 메인 88점·서브 93점 통과인데 "퀄리티가 너무 떨어짐")을 코드로 잡는다.
// 근거: docs/한국미래에너지공사-시안-점검-2026-10-15.md K1·K2/K3·K4·K6·K7·K8. 지적 화면에서 먼저 걸리는지 음성 대조 후 판정에 옮긴다(R14·MC-55).
// ① 구역 간격 한 값(R34) ② 주색과 부딪히는 고채도 면 ③ 한 줄 카드 안 사진 시작 높이 ④ 한 줄 카드 모양 섞임 ⑤ 칠한 칸 아래쪽이 빔 ⑥ 꼬리 한 줄.
// layout.mjs 와 같은 모양: (page, o) → { r, fails }. 판정 연결은 check.mjs 에서.

/** 페이지 안에서 도는 계측 — 문자열로 넘어가므로 바깥 변수를 쓰지 않는다 */
function measure({ primary }) {
  const W = innerWidth;
  const vis = (el) => { const s = getComputedStyle(el); const q = el.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && +s.opacity > 0.05 && q.width > 0 && q.height > 0; };
  const nm = (el) => el.tagName.toLowerCase() + (typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/)[0] : "");
  const Y = (q) => Math.round(q.top + scrollY);
  const transparent = (c) => !c || /rgba\(0, 0, 0, 0\)|transparent/.test(c);
  const painted = (el) => { const s = getComputedStyle(el); return !transparent(s.backgroundColor) || s.backgroundImage !== "none" || parseFloat(s.borderTopWidth) > 0 || s.boxShadow !== "none"; };
  const rgb = (c) => { const s = String(c).trim(); const h = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (h) { const x = h[1].length === 3 ? h[1].split("").map((v) => v + v).join("") : h[1]; return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)); }
    return (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number); };
  const hsl = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l]; const s = d / (1 - Math.abs(2 * l - 1)); let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; return [h, s, l]; };
  const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  const out = { gaps: [], clash: [], imgTop: [], cardMix: [], bottomEmpty: [], tail: [] };

  // 내용 조각(문서 좌표): 글자 줄·그림·칠한 상자
  const leaves = [];
  { const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
    while ((n = tw.nextNode())) { const pe = n.parentElement; if (!n.nodeValue.trim() || !pe || pe.closest("script,style") || !vis(pe)) continue;
      const rg = document.createRange(); rg.selectNodeContents(n); for (const q of rg.getClientRects()) if (q.width > 1) leaves.push({ el: pe, t: q.top + scrollY, b: q.bottom + scrollY, l: q.left, r: q.right }); } }
  for (const e of document.querySelectorAll("img, video, iframe, svg, canvas")) { if (!vis(e)) continue; const q = e.getBoundingClientRect(); leaves.push({ el: e, t: q.top + scrollY, b: q.bottom + scrollY, l: q.left, r: q.right }); }
  // 칠한 상자(카드·패널)도 보이는 내용 — 글자만 세면 카드 안쪽 여백만큼 구역 간격이 부풀었다(첫 음성 대조)
  for (const e of document.querySelectorAll("main *")) { if (!vis(e) || !painted(e)) continue; const q = e.getBoundingClientRect(); if (q.width < 120 || q.height < 40 || q.width > W * 0.95) continue; leaves.push({ el: e, t: q.top + scrollY, b: q.bottom + scrollY, l: q.left, r: q.right }); }

  // ① 구역 간격 — main 바로 아래 구역끼리 '보이는 간격'(앞 구역 내용 끝 → 다음 구역 내용 시작, 칠한 띠면 띠 경계)
  const main = document.querySelector("main") || document.body;
  const secs = [...main.children].filter((s) => vis(s) && s.getBoundingClientRect().height >= 80 && !/^(SCRIPT|STYLE)$/.test(s.tagName));
  const edge = (s, top) => { const q = s.getBoundingClientRect(); if (painted(s) && !transparent(getComputedStyle(s).backgroundColor)) return top ? q.top + scrollY : q.bottom + scrollY;
    const mine = leaves.filter((z) => s.contains(z.el)); if (!mine.length) return top ? q.top + scrollY : q.bottom + scrollY; return top ? Math.min(...mine.map((z) => z.t)) : Math.max(...mine.map((z) => z.b)); };
  const gaps = [];
  const band = (s) => !transparent(getComputedStyle(s).backgroundColor) || getComputedStyle(s).backgroundImage !== "none";
  for (let i = 1; i < secs.length; i++) { if (i === 1 && secs[0].getBoundingClientRect().height >= innerHeight * 0.6) continue; // 히어로 바로 아래는 따로(첫 구역 여백은 디자인 선택)
    if (band(secs[i]) || band(secs[i - 1])) continue; // 칠한 띠와 맞닿는 곳은 띠 안 여백이 간격이다 — 흰 구역끼리만 견준다(첫 음성 대조: 띠끼리 0px 이 편차로 잡힘)
    gaps.push({ y: Math.round(edge(secs[i], true)), g: Math.round(edge(secs[i], true) - edge(secs[i - 1], false)), a: nm(secs[i - 1]), b: nm(secs[i]) }); }
  if (gaps.length >= 3) { const gs = gaps.map((x) => x.g); const spread = Math.max(...gs) - Math.min(...gs);
    if (spread > 48) out.gaps.push(`구역 사이 보이는 간격 ${gs.join("·")}px(편차 ${spread}) — 한 값으로(R34)`); }

  // ② 주색과 부딪히는 고채도 면 — CSS 로 칠한 면(단추·띠·카드)과 큰 그림(배너·포스터)의 평균 색
  // CSS 로 칠한 면은 여기서 색을 읽고, 그림(배너·포스터)은 다른 출처라 페이지에서 픽셀을 못 읽으니 자리만 넘겨 캡처 픽셀로 잰다(MC-60)
  // 주색 — 넘겨받은 값 → 시안이 선언한 변수(--hb-primary·--primary·--p 등) → 칠한 단추·띠의 가장 넓은 고채도 색 순.
  // 예전엔 --hb-primary 만 보고 없으면 기본 파랑과 견줘, 주색을 --p 로만 쓴 시안(72·57)의 자기 주색을 '원색'으로 잡았다(2026-10-15 일괄 수정 표본)
  const root = getComputedStyle(document.documentElement);
  let pc = primary || ["--hb-primary", "--primary", "--color-primary", "--brand", "--main", "--p"].map((v) => root.getPropertyValue(v).trim()).find((v) => /^(#|rgb)/i.test(v)) || "";
  if (!pc) { const area = new Map();
    for (const e of document.querySelectorAll("a, button, [class*=btn], header *, nav *")) { if (!vis(e)) continue; const c = getComputedStyle(e).backgroundColor; if (transparent(c)) continue; const [, s, l] = hsl(rgb(c)); if (s < 0.4 || l < 0.15 || l > 0.85) continue; const q = e.getBoundingClientRect(); area.set(c, (area.get(c) || 0) + q.width * q.height); }
    pc = [...area.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "rgb(36,104,255)"; }
  out.primary = hsl(rgb(pc)); out.primarySrc = pc;
  out.page = W * Math.max(document.documentElement.scrollHeight, 1);
  out.cssFaces = []; out.imgBoxes = [];
  for (const e of document.querySelectorAll("body *")) { if (!vis(e) || e.closest("footer")) continue; const c = getComputedStyle(e).backgroundColor; if (transparent(c)) continue; const q = e.getBoundingClientRect(); if (q.width * q.height < 1500) continue;
    const [h, s, l] = hsl(rgb(c)); if (s >= 0.45 && l >= 0.18 && l <= 0.85) out.cssFaces.push({ h, s, l, area: q.width * q.height, who: nm(e) }); }
  // 원색 단추 묶음 — 형제 4개 이상이 서로 다른 고채도 색 4계열 이상(SNS 단추를 브랜드 원색으로 줄 세움: 빨강·분홍·초록·파랑·노랑)
  out.rainbow = [];
  for (const par of document.querySelectorAll("body *")) { if (!vis(par) || par.closest("footer")) continue; const kids = [...par.children].filter(vis); if (kids.length < 4) continue;
    const hues = kids.map((k) => { const c = getComputedStyle(k).backgroundColor; if (transparent(c)) return null; const [h, s, l] = hsl(rgb(c)); return s >= 0.45 && l >= 0.2 && l <= 0.85 ? Math.round(h / 30) % 12 : null; }).filter((v) => v !== null);
    const fam = new Set(hues); if (hues.length >= 4 && fam.size >= 4) out.rainbow.push(`${nm(par)} y${Y(par.getBoundingClientRect())} 단추 ${hues.length}개가 원색 ${fam.size}계열 — 같은 무채색 면 + 아이콘만 브랜드 색으로`); }
  out.rainbow = out.rainbow.slice(0, 3);
  for (const im of document.querySelectorAll("img")) { if (!vis(im) || im.closest("footer")) continue; const q = im.getBoundingClientRect(); if (q.width < 160 || q.height < 160) continue;
    out.imgBoxes.push({ x: Math.max(0, Math.round(q.left)), y: Math.max(0, Math.round(q.top + scrollY)), w: Math.round(q.width), h: Math.round(q.height), who: "img " + (im.getAttribute("alt") || "").slice(0, 12) }); }

  // ③④ 한 줄 카드(같은 높이에서 시작하는 형제 3개 이상, 폭 비슷)
  for (const par of document.querySelectorAll("body *")) { if (!vis(par) || par.closest("header, footer, nav")) continue;
    const kids = [...par.children].filter((k) => vis(k) && k.getBoundingClientRect().width >= 180 && k.getBoundingClientRect().height >= 140);
    if (kids.length < 3) continue; const rs = kids.map((k) => k.getBoundingClientRect());
    if (Math.max(...rs.map((q) => q.top)) - Math.min(...rs.map((q) => q.top)) > 6) continue;
    if (!rs.every((q, i) => i === 0 || q.left >= rs[i - 1].right - 4)) continue;
    // ③ 카드마다 큰 사진이 있는데 사진이 시작하는 높이가 다름
    const pics = kids.map((k) => [...k.querySelectorAll("img")].filter((i) => vis(i) && i.getBoundingClientRect().width >= k.getBoundingClientRect().width * 0.6)[0]);
    // 사진이 칸을 덮는(전면, 75% 넘게) 카드는 '사진 시작 높이'를 견줄 대상이 아니다 — 전면 카드끼리·글+사진 카드끼리만(609 넘김 배너 오탐)
    const cover = (i, k) => { const a = i.getBoundingClientRect(), q = k.getBoundingClientRect(); return (a.width * a.height) / (q.width * q.height) > 0.75; };
    const sel = pics.map((i, n) => (i && !cover(i, kids[n]) ? i : null)).filter(Boolean);
    if (pics.every(Boolean) && sel.length >= 2) { const tops = sel.map((i) => Math.round(i.getBoundingClientRect().top - rs[0].top)); const d = Math.max(...tops) - Math.min(...tops);
      if (d > 20) out.imgTop.push(`${nm(par)} y${Y(rs[0])} 카드 ${kids.length}장 사진 시작 높이 차 ${d}px(${tops.join("/")}) — 카드마다 날짜·요약 줄 수를 맞춘다`); }
    // ④ 카드 모양 서명: 사진 자리(없음·위·아래·전면) × 바탕(밝음·어두움·사진) × 글 양
    const sig = kids.map((k, i) => { const q = rs[i]; const p = pics[i] || [...k.querySelectorAll("img")].filter(vis).sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];
      let pos = "없음"; if (p) { const pq = p.getBoundingClientRect(); const cover = (pq.width * pq.height) / (q.width * q.height); pos = cover > 0.75 ? "전면" : pq.top - q.top < q.height * 0.3 ? "위" : pq.left - q.left > q.width * 0.4 ? "옆" : "아래"; }
      const bg = getComputedStyle(k).backgroundColor; const [, , l] = hsl(rgb(transparent(bg) ? "rgb(255,255,255)" : bg));
      const txt = (k.innerText || "").trim().length; return `${pos}/${l < 0.4 ? "어둠" : "밝음"}/${txt > 60 ? "글많음" : txt > 0 ? "글적음" : "글없음"}`; });
    // 폭이 같은 칸(±12%)이 나란한 줄만 — 넓은 사진 + 좁은 목록처럼 폭을 달리한 구성은 일부러 섞은 것(첫 음성 대조 오탐)
    const ws = rs.map((q) => q.width); const uniform = Math.max(...ws) <= Math.min(...ws) * 1.12;
    const kinds = new Set(sig); if (uniform && kinds.size >= 3) out.cardMix.push(`${nm(par)} y${Y(rs[0])} 한 줄 카드 ${kids.length}장에 모양 ${kinds.size}종(${[...kinds].join(", ")}) — 한 줄은 한 모양으로`);
  }
  out.imgTop = [...new Set(out.imgTop)].slice(0, 4); out.cardMix = [...new Set(out.cardMix)].slice(0, 4);

  // ⑤ 칠한 칸(300×300 이상)인데 아래쪽 35% 에 내용이 없음
  // box-shadow 를 크게 펼쳐(spread 100px 이상) 섹션 띠를 칠한 칸은 띠의 일부라 '칠한 칸'이 아니다(O-53, 시안 696 .biz-left 0 0 0 100vmax)
  const bandShadow = (s) => s.boxShadow !== "none" && s.boxShadow.replace(/rgba?\([^)]*\)|#[0-9a-f]+/gi, "").split(",").some((part) => { if (/inset/.test(part)) return false; const n = part.match(/-?[\d.]+px/g) || []; return n.length >= 4 && parseFloat(n[3]) >= 100; });
  // 칸 밖 요소가 칸 위에 겹쳐 그려지면(absolute 넘김 단추 줄 등) 그 칸의 내용으로 센다(O-53, 시안 697 .hero-box + .hero-ctrlbar) — 그 자리 맨 위 요소가 칸 쪽이 아니면 겹친 쪽이 위
  const sy0 = scrollY;
  const onTop = (z, box) => { const cx = (z.l + z.r) / 2, cy = (z.t + z.b) / 2; if (cy - scrollY < 0 || cy - scrollY >= innerHeight) scrollTo(0, Math.max(0, cy - innerHeight / 2));
    const hit = document.elementFromPoint(cx, cy - scrollY); return !!hit && !box.contains(hit) && (hit === z.el || z.el.contains(hit) || hit.contains(z.el)); };
  for (const box of document.querySelectorAll("body *")) { if (!vis(box) || box.closest("header, footer") || !painted(box) || /^(IMG|VIDEO|IFRAME|UL|OL|TABLE)$/.test(box.tagName)) continue;
    const q = box.getBoundingClientRect(); if (q.width < 300 || q.height < 300 || q.width > W * 0.9 || getComputedStyle(box).backgroundImage !== "none" || bandShadow(getComputedStyle(box))) continue;
    const T = q.top + scrollY, B = q.bottom + scrollY, L = q.left, R = q.right; const mine = leaves.filter((z) => z.el !== box && box.contains(z.el)); if (!mine.length) continue;
    let end = Math.max(...mine.map((z) => z.b)); let empty = (B - end) / (B - T);
    if (empty > 0.35) { const over = leaves.filter((z) => !box.contains(z.el) && !z.el.contains(box) && z.l >= L - 2 && z.r <= R + 2 && z.t >= T - 2 && z.b <= B + 2 && z.b > end && onTop(z, box));
      if (over.length) { end = Math.max(end, ...over.map((z) => z.b)); empty = (B - end) / (B - T); } }
    if (empty > 0.35) out.bottomEmpty.push(`${nm(box)} y${Y(box.getBoundingClientRect())} ${Math.round(q.width)}×${Math.round(q.height)} 아래 ${Math.round(empty * 100)}% 빔 — 항목을 늘리거나 칸 높이를 내용에 맞춘다`); }
  if (scrollY !== sy0) scrollTo(0, sy0);
  out.bottomEmpty = [...new Set(out.bottomEmpty)].slice(0, 4);

  // ⑥ 꼬리 한 줄 — 두 줄 이상 문장의 마지막 줄이 4글자 이하(PREFERENCES "꼬리 한 줄 금지")
  // 16자 이상 글은 마지막 줄이 한 낱말(8자 이하)이면, 16자 미만 짧은 글(카드 제목 "학교 시설 점검 결과 / 공개")은 두 줄 + 마지막 줄 3자 이하 한 낱말일 때만(O-52)
  // O-54: 카드 제목을 strong·b 로 쓰는 시안이 많아 강조 태그·표 칸도 본다(71 "…문 열 / 어" 를 못 잡던 것)
  const tailIn = (scope, note) => { for (const el of scope.querySelectorAll("p, li, dd, dt, span, a, h2, h3, h4, h5, strong, b, em, td")) { if (!vis(el) || el.closest("header, footer") || el.children.length) continue;
    const node = el.firstChild; if (!node || node.nodeType !== 3) continue; const t = node.nodeValue; const short = t.trim().length < 16; if (short && (t.trim().length < 4 || !/\s/.test(t.trim()))) continue;
    // line-clamp·overflow 로 잘려 안 보이는 줄은 줄로 세지 않는다(693 제목 3번째 줄을 꼬리로 잡던 것) — 보이는 아래 끝 = 자기·잘라 내는 조상 중 가장 위
    let visB = el.getBoundingClientRect().bottom; for (let a = el; a && a !== document.body; a = a.parentElement) { const st = getComputedStyle(a); if (/hidden|clip/.test(st.overflowY + st.overflow)) visB = Math.min(visB, a.getBoundingClientRect().bottom); }
    const tops = []; for (let i = 0; i < t.length; i++) { if (!t[i].trim()) continue; const r2 = document.createRange(); r2.setStart(node, i); r2.setEnd(node, i + 1); const rr = r2.getClientRects()[0]; tops.push(rr && rr.bottom <= visB + 1 ? Math.round(rr.top) : null); }
    const lines = [...new Set(tops.filter((v) => v !== null))]; if (lines.length < 2) continue; const last = Math.max(...lines);
    // 마지막 줄 글자 — 공백 없는 한 낱말(8자 이하)만 떨어졌으면 꼬리("…자격을 / 확인하세요.")
    let lastTxt = ""; for (let i = 0, k = 0; i < t.length; i++) { if (!t[i].trim()) { if (k && tops[k - 1] === last) lastTxt += " "; continue; } if (tops[k] === last) lastTxt += t[i]; k++; }
    lastTxt = lastTxt.trim();
    if (short && (lines.length !== 2 || lastTxt.length > 3)) continue;
    if (lastTxt && !/\s/.test(lastTxt) && lastTxt.length <= 8) out.tail.push(`${note}"…${t.trim().slice(-14)}" 마지막 줄 "${lastTxt}" 한 낱말 — 문장을 줄이거나 둘로 나눈다`); } };
  tailIn(document, "");
  // 숨은 탭 패널·넘김 카드의 다른 장도 잰다(O-52) — 한 번에 한 장만 보이게(같은 묶음의 다른 장은 숨김) 재고, hidden 을 원래대로 되돌린다
  const kinds = ["data-hb-panel", "data-hb-slide"];
  const kindOf = (e) => kinds.find((k) => e.hasAttribute(k));
  for (const pg of document.querySelectorAll("[data-hb-panel][hidden], [data-hb-slide][hidden]")) { if (pg.closest("header, footer")) continue;
    const saved = [];
    try {
      for (let a = pg; a && a !== document.body; a = a.parentElement) { const k = kindOf(a); if (!k || !a.hidden) continue;
        for (const s of a.parentElement ? [...a.parentElement.children] : []) if (s !== a && s.hasAttribute(k) && !s.hidden) { saved.push([s, false]); s.hidden = true; }
        saved.push([a, true]); a.hidden = false; }
      if (vis(pg)) tailIn(pg, kindOf(pg) === "data-hb-panel" ? "(숨은 탭) " : "(넘김 다른 장) ");
    } finally { for (let i = saved.length - 1; i >= 0; i--) saved[i][0].hidden = saved[i][1]; } }
  out.tail = [...new Set(out.tail)].slice(0, 6);
  return out;
}

const hslOf = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l]; const s = d / (1 - Math.abs(2 * l - 1)); let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; return [h, s, l]; };
const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

/** ② 주색과 부딪히는 고채도 면 — CSS 면 + 큰 그림(캡처 픽셀). 주색 ±40° 밖 고채도 색 계열이 3개 이상이면 걸린다 */
async function clashOf(p, r, sharp) {
  const faces = [...r.cssFaces];
  if (sharp && r.imgBoxes.length) {
    const shot = await p.screenshot({ fullPage: true, type: "png" }).catch(() => null);
    if (shot) { const meta = await sharp(shot).metadata();
      for (const b of r.imgBoxes.slice(0, 40)) { const w = Math.min(b.w, meta.width - b.x), h = Math.min(b.h, meta.height - b.y); if (w < 40 || h < 40) continue;
        const { data } = await sharp(shot).extract({ left: b.x, top: b.y, width: w, height: h }).resize(24, 24, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true }).catch(() => ({ data: null }));
        if (!data) continue; let R = 0, G = 0, B = 0, n = 0;
        for (let i = 0; i < data.length; i += 3) { const [, s, l] = hslOf(data[i], data[i + 1], data[i + 2]); if (s > 0.5 && l > 0.2 && l < 0.85) { R += data[i]; G += data[i + 1]; B += data[i + 2]; n++; } }
        if (n / 576 > 0.45) { const [h, s, l] = hslOf(R / n, G / n, B / n); faces.push({ h, s, l, area: b.w * b.h * (n / 576), who: b.who }); } } } }
  const fams = new Map();
  for (const f of faces) { if (hueGap(f.h, r.primary[0]) <= 40) continue; const k = Math.round(f.h / 30) % 12; const v = fams.get(k) || { area: 0, who: [] }; v.area += f.area; if (v.who.length < 3) v.who.push(f.who); fams.set(k, v); }
  const loud = [...fams.entries()].filter(([, v]) => v.area / r.page > 0.004).sort((a, b) => b[1].area - a[1].area);
  r.colorFams = loud.map(([k, v]) => `${k * 30}° ${(v.area / r.page * 100).toFixed(2)}% ${v.who.join("/")}`);
  // 두 계열 이상이 합쳐 화면의 1.5% 넘게 칠하거나, 한 계열이 3% 넘으면(507: 보라 배너 1.76% + 파랑 포스터 0.43% — 사용자 "색이 튐")
  const total = loud.reduce((s, [, v]) => s + v.area, 0) / r.page;
  const hits = (loud.length >= 2 && total > 0.015) || loud.some(([, v]) => v.area / r.page > 0.03)
    ? [`주색과 다른 고채도 색 계열 ${loud.length}개 · 화면의 ${(total * 100).toFixed(1)}%(${loud.map(([k, v]) => `${k * 30}°:${v.who.join("/")}`).join(", ")}) — 배너·포스터를 주색·무채색 계열로`] : [];
  for (const g of r.rainbow ?? []) hits.push(g);
  return hits;
}

/** @param {import("playwright-core").Page} p @param {{ primary?: string, sharp?: any }} [o] */
export async function composeChecks(p, o = {}) {
  const r = await p.evaluate(measure, { primary: o.primary ?? "" });
  r.clash = await clashOf(p, r, o.sharp).catch(() => []);
  const fails = [];
  const chk = (ok, name, v) => { if (!ok) fails.push(`${name}: ${v.join(" | ")}`); };
  chk(!r.gaps.length, "구역 간격이 들쭉날쭉", r.gaps);
  chk(!r.clash.length, "주색과 부딪히는 원색 면", r.clash);
  chk(!r.imgTop.length, "한 줄 카드의 사진 시작 높이가 다름", r.imgTop);
  chk(!r.cardMix.length, "한 줄에 카드 모양이 섞임", r.cardMix);
  chk(!r.bottomEmpty.length, "칸 아래쪽이 빔", r.bottomEmpty);
  chk(!r.tail.length, "꼬리 한 줄", r.tail);
  return { r, fails };
}


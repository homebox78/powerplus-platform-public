// 출처: homebox-handoff packages/mcp/src/qa/design.mjs 에서 가져옴 (powerMCP 이식 2026-10-06)
// 디자인 판정 (2026-10-03 사용자 지적 5건)
//   ① 한 묶음 안 칸 사이 간격이 가로·세로로 크게 다르다  ② 주색이 포인트가 아니라 화면을 덮는다
//   ③ 본문 글자(슬로건)가 지나치게 크다  ④ 서브 페이지마다 본문 폭이 다르다  ⑤ 같은 시안인데 옆 메뉴 디자인이 페이지마다 다르다
// measureDesign(p, isSub) 는 PC 폭으로 렌더된 페이지에서 잰다. designFixes 는 감점·고칠 목록을 만든다.

export async function measureDesign(p, isSub) {
  return p.evaluate((isSub) => {
    const W = document.documentElement.clientWidth, H = document.documentElement.scrollHeight, sy = window.scrollY;
    const vis = (e) => { const s = getComputedStyle(e); const b = e.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && parseFloat(s.opacity || "1") > 0.05 && b.width > 0 && b.height > 0; };
    const rgba = (c) => { const m = String(c || "").match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return [v[0], v[1], v[2], v.length > 3 ? v[3] : 1]; };
    const hsl = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; return { s: d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), l }; };
    const chroma = (c) => { if (!c || c[3] < 0.6) return null; const { s, l } = hsl(c[0], c[1], c[2]); return s >= 0.3 && l >= 0.08 && l <= 0.82; };
    const foot = [...document.querySelectorAll("footer, [role=contentinfo]")].filter(vis).pop();
    const fTop = foot ? foot.getBoundingClientRect().top + sy : H;
    const hdr = [...document.querySelectorAll("header, [role=banner]")].filter(vis)[0];
    const hBot = hdr ? hdr.getBoundingClientRect().bottom + sy : 0;
    const els = [...document.querySelectorAll("body *")].filter((e) => !["SCRIPT", "STYLE", "BR", "path"].includes(e.tagName) && vis(e));

    const color = null;

    // ③ 큰 글자: 첫 화면 제목은 64px, 서브 비주얼 제목은 48px, 그 밖 본문은 44px 까지
    const big = []; const seenT = new Set();
    for (const e of els) {
      const t = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").trim();
      if (t.length < 2 || /^[\d\s,.%+\-:/]+$/.test(t)) continue;
      const s = getComputedStyle(e); const fs = parseFloat(s.fontSize); if (fs <= 45) continue;
      if (/material|icon|symbol/i.test(s.fontFamily) || fs > 100 || e.closest("[aria-hidden=true]")) continue; // 100px 넘는 글자는 배경 장식
      const y = e.getBoundingClientRect().top + sy; if (y >= fTop) continue;
      const lim = !isSub && y < 1000 ? 64 : (isSub && y < hBot + 360 ? 48 : 44);
      if (fs > lim + 1 && !seenT.has(t)) { seenT.add(t); big.push({ y: Math.round(y), px: Math.round(fs), limit: lim, text: t.slice(0, 18) }); }
    }

    // ① 한 묶음 안 간격: 나란한 칸 사이(가로)와 그 묶음의 위아래 칸 사이(세로)가 크게 다르면 한 묶음으로 안 보인다
    const cardLike = (e) => { const s = getComputedStyle(e); const c = rgba(s.backgroundColor); return (c && c[3] > 0.5) || s.boxShadow !== "none" || (parseFloat(s.borderTopWidth) > 0 && parseFloat(s.borderLeftWidth) > 0) || s.backgroundImage !== "none" || !!e.querySelector(":scope > img, :scope > a > img, :scope > figure"); };
    const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
    const stackGap = (e) => {
      for (const host of [e, ...e.children]) {
        const ks = [...host.children].filter(vis).map((k) => ({ k, b: k.getBoundingClientRect() })).filter((o) => o.b.width >= 150 && o.b.height >= 60 && (cardLike(o.k) || (o.k.firstElementChild && cardLike(o.k.firstElementChild))));
        if (ks.length < 2) continue;
        ks.sort((a, c) => a.b.top - c.b.top);
        const g = []; for (let i = 0; i < ks.length; i++) { const nx = ks.slice(i + 1).find((o) => Math.abs(o.b.left - ks[i].b.left) < 6 && o.b.top >= ks[i].b.bottom - 2); if (nx) { const v = nx.b.top - ks[i].b.bottom; if (v >= 4 && v <= 120) g.push(v); } }
        if (g.length) return med(g);
      }
      return null;
    };
    const groups = [];
    for (const e of els) {
      if (groups.length >= 4) break;
      const b = e.getBoundingClientRect(); if (b.width < W * 0.4 || b.top + sy >= fTop || e.closest("header, footer, nav")) continue;
      if (groups.some((g) => g.el.contains(e))) continue;
      const kids = [...e.children].filter(vis).map((k) => ({ k, b: k.getBoundingClientRect() })).filter((o) => o.b.width >= 150 && o.b.height >= 80);
      if (kids.length < 2) continue;
      if (kids.some((o) => o.k.matches("aside, nav, [class*=lnb], [class*=snb], [class*=side]"))) continue; // 옆 메뉴와 본문 사이는 묶음 간격이 아니다
      const lines = [];
      for (const o of kids) { const ln = lines.find((l) => Math.abs(l[0].b.top - o.b.top) < 20); if (ln) ln.push(o); else lines.push([o]); }
      const gx = [];
      for (const ln of lines) { ln.sort((a, c) => a.b.left - c.b.left); for (let i = 1; i < ln.length; i++) { const v = ln[i].b.left - ln[i - 1].b.right; if (v >= 8 && v <= 200) gx.push(v); } }
      if (!gx.length) continue;
      const x = med(gx); let yv = null;
      const multi = lines.filter((l) => l.length >= 2).sort((a, c) => a[0].b.top - c[0].b.top);
      if (multi.length >= 2 && kids.every((o) => cardLike(o.k))) { const g = []; for (let i = 1; i < multi.length; i++) { const v = multi[i][0].b.top - Math.max(...multi[i - 1].map((o) => o.b.bottom)); if (v >= 4 && v <= 200) g.push(v); } if (g.length) yv = med(g); }
      if (yv === null) { const row = lines.find((l) => l.length >= 2); const st = row.filter((o) => !o.k.querySelector("[role=tablist], [data-hb=tabs], [data-hb-tabs]")).map((o) => stackGap(o.k)) /* 탭 묶음 열의 세로 쌓임은 칸 간격이 아니다(2026-10-05 R1 오탐) */.filter((v) => v !== null); if (st.length >= 1) yv = Math.max(...st); }
      if (yv === null) continue;
      if (Math.max(x, yv) / Math.max(1, Math.min(x, yv)) >= 1.8 && Math.abs(x - yv) >= 14) groups.push({ el: e, y: Math.round(b.top + sy), gap_x: Math.round(x), gap_y: Math.round(yv) });
    }
    for (const g of groups) delete g.el;

    // ④⑤ 서브 틀: 서브 비주얼 높이 · 옆 메뉴 위치·폭·모양 · 본문 좌우 끝
    let shell = null;
    if (isSub) {
      const bgOf = (e) => { const s = getComputedStyle(e); const c = rgba(s.backgroundColor); if (s.backgroundImage.includes("url(")) return "사진"; if (!c || c[3] < 0.5) return "없음"; const { s: sa, l } = hsl(c[0], c[1], c[2]); return sa >= 0.3 && l < 0.85 ? "색" : l < 0.3 ? "어두움" : l > 0.985 ? "흰색" : "옅은 면"; };
      let sv = null;
      for (const e of els) {
        if (e === hdr || (hdr && hdr.contains(e)) || e.contains(foot || null)) continue;
        const b = e.getBoundingClientRect(); const top = b.top + sy;
        if (b.width < W * 0.95 || b.height < 80 || b.height > 520 || top > hBot + 20 || top + b.height < 120) continue;
        if (bgOf(e) === "없음" || bgOf(e) === "흰색") continue;
        if (!sv || b.height > sv.h) sv = { h: Math.round(b.height), bottom: Math.round(top + b.height) };
      }
      const from = sv ? sv.bottom : hBot;
      let lnb = null;
      for (const e of document.querySelectorAll("aside, nav, [class*=lnb], [class*=snb], [class*=side]")) {
        if (!vis(e) || e.closest("header, footer")) continue;
        const b = e.getBoundingClientRect(); const top = b.top + sy;
        if (b.width < 150 || b.width > 420 || b.height < 120 || top < from - 40 || top >= fTop || e.querySelectorAll("a").length < 2) continue;
        const s = getComputedStyle(e);
        const o = { side: b.left + b.width / 2 < W / 2 ? "왼쪽" : "오른쪽", x: Math.round(b.left), w: Math.round(b.width), bg: bgOf(e), radius: Math.round(parseFloat(s.borderTopLeftRadius) || 0), border: parseFloat(s.borderTopWidth) > 0 && parseFloat(s.borderLeftWidth) > 0 };
        if (!lnb || b.width * b.height > lnb.area) lnb = { ...o, area: b.width * b.height };
      }
      if (lnb) delete lnb.area;
      let L = null, R = null;
      for (const e of els) {
        const b = e.getBoundingClientRect(); const top = b.top + sy;
        if (b.width < 150 || b.width > W * 0.92 || b.height < 40 || top < from - 4 || top + b.height > fTop + 4 || b.left < 0 || b.right > W) continue;
        const pos = getComputedStyle(e).position; if (pos === "fixed" || pos === "absolute") continue;
        L = L === null ? b.left : Math.min(L, b.left); R = R === null ? b.right : Math.max(R, b.right);
      }
      shell = { subvisual_h: sv ? sv.h : null, lnb, left: L === null ? null : Math.round(L), right: R === null ? null : Math.round(R) };
    }
    return { color, big: big.slice(0, 6), groups, shell };
  }, isSub).catch(() => null);
}

/** 감점·고칠 목록. peers = 같은 시안 묶음의 다른 장(메인은 { frame:{left,right} }, 서브는 { shell }). */
export function designFixes(d, { sub, peers = [], frame = null, width = 1920 } = {}) {
  const fixes = []; let minus = 0; const hard = [];
  if (!d || width < 1200) return { fixes, minus, hard };
  if (d.color && (d.color.pct >= 18 || (!sub && d.color.first_pct >= 35))) {
    minus += d.color.pct >= 28 ? 12 : 8;
    fixes.push(`색 · 한 색 계열이 화면의 ${d.color.pct}%(첫 화면 ${d.color.first_pct}%)를 덮는다 — 주색은 포인트(단추·선택 탭·아이콘·밑줄·작은 이름표)에만 쓰고, 넓은 면(첫 화면 배경·구역 띠·큰 상자)은 흰색·옅은 회색·사진으로 바꾼다. 색 면은 화면의 10% 안쪽으로.`);
  }
  if (d.big.length) {
    minus += Math.min(9, d.big.length * 3);
    fixes.push(`글자 크기 · ${d.big.map((b) => `"${b.text}"(y ${b.y}, ${b.px}px → ${b.limit}px 이하)`).join(", ")} — 본문 안 슬로건·섹션 제목은 theme.type 의 상한을 넘기지 않는다.`);
  }
  if (d.groups.length) {
    minus += Math.min(8, d.groups.length * 4);
    for (const g of d.groups) fixes.push(`묶음 간격 · y ${g.y} 묶음의 칸 사이가 가로 ${g.gap_x}px · 세로 ${g.gap_y}px 로 다르다 — 한 묶음(같은 맥락의 카드·배너) 안에서는 가로·세로 칸 간격을 같은 값(frame.col_gap)으로 맞춘다.`);
  }
  if (!sub && frame && frame.gap > 40) { minus += 4; fixes.push(`칸 간격 · 나란한 칸 사이가 ${frame.gap}px 로 넓다 — frame.col_gap(16~32px)을 쓴다. 넓은 간격은 성격이 다른 구역 사이(row_gap)에만 쓴다.`); }
  const s = d.shell;
  if (sub && s) {
    const base = peers.find((q) => q && q.frame && q.frame.left !== null && q.frame.left !== undefined);
    const sib = peers.find((q) => q && q.shell);
    const want = base ? base.frame : (sib && sib.shell.left !== null ? { left: sib.shell.left, right: sib.shell.right } : null);
    if (s.left !== null && s.right !== null) {
      if (want && (Math.abs(s.left - want.left) > 20 || Math.abs(s.right - want.right) > 20)) { minus += 8; hard.push("서브 본문 폭이 다른 장과 다름"); fixes.push(`본문 폭 · 이 장의 내용이 x ${s.left}~${s.right} 인데 같은 시안의 다른 장은 x ${want.left}~${want.right} 이다 — 모든 서브 페이지가 메인과 같은 본문 폭(옆 메뉴 + 본문)을 쓴다.`); }
      else if (!want && s.right - s.left < 900) { minus += 8; fixes.push(`본문 폭 · 이 장의 내용 폭이 ${s.right - s.left}px 로 좁다 — sub_shell 의 본문 폭(메인 frame.w)을 가득 쓴다(옆 메뉴 + 본문).`); }
    }
    if (!s.lnb) { minus += 6; fixes.push("옆 메뉴 · 본문 왼쪽에 옆 메뉴(LNB)가 없다 — 모든 서브 페이지는 sub_shell.lnb(왼쪽, 같은 폭·같은 모양)를 둔다."); }
    else {
      if (s.lnb.side === "오른쪽") { minus += 6; fixes.push("옆 메뉴 · 옆 메뉴가 본문 오른쪽에 있다 — sub_shell.lnb 대로 왼쪽에 둔다(레퍼런스 화면이 오른쪽이어도 시안은 한 가지로 통일)."); }
      const pl = sib && sib.shell.lnb;
      if (pl) {
        const diff = [];
        if (pl.side !== s.lnb.side) diff.push(`위치 ${pl.side}→${s.lnb.side}`);
        if (Math.abs(pl.w - s.lnb.w) > 24) diff.push(`폭 ${pl.w}→${s.lnb.w}px`);
        if (pl.bg !== s.lnb.bg) diff.push(`바탕 ${pl.bg}→${s.lnb.bg}`);
        if (pl.border !== s.lnb.border) diff.push(`테두리 ${pl.border ? "있음" : "없음"}→${s.lnb.border ? "있음" : "없음"}`);
        if (Math.abs(pl.radius - s.lnb.radius) > 4) diff.push(`둥글기 ${pl.radius}→${s.lnb.radius}px`);
        if (diff.length) { minus += 8; hard.push("옆 메뉴 디자인이 다른 장과 다름"); fixes.push(`옆 메뉴 · 같은 시안의 다른 서브 페이지와 옆 메뉴가 다르다(${diff.join(", ")}) — 옆 메뉴의 CSS 는 메인 시안의 <style> 에 한 번만 두고(hb:use style 로 같이 온다), 먼저 만든 서브의 옆 메뉴 마크업·클래스를 그대로 쓴다(sub_shell.lnb).`); }
      }
    }
    if (sib && sib.shell.subvisual_h && s.subvisual_h && Math.abs(sib.shell.subvisual_h - s.subvisual_h) > 40) { minus += 4; fixes.push(`서브 비주얼 · 띠 높이가 ${s.subvisual_h}px 인데 다른 장은 ${sib.shell.subvisual_h}px 이다 — 모든 서브 페이지가 같은 높이(sub_shell.visual_h)를 쓴다.`); }
  }
  return { fixes, minus, hard };
}

/** 캡처에서 한 색 계열(색상 40도 창)이 차지하는 비율 — 사진은 색상이 흩어져 낮게 나오고, 색 면으로 덮은 화면은 높게 나온다. */
export async function colorShare(sharp, shot, firstH = 1080) {
  const meta = await sharp(shot, { limitInputPixels: false }).metadata();
  const w = 192, k = w / (meta.width || 1920), h = Math.max(1, Math.round((meta.height || 1080) * k));
  const { data } = await sharp(shot, { limitInputPixels: false }).resize(w, h, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const bins = new Uint32Array(36), binsF = new Uint32Array(36), tint = new Uint32Array(36); const fr = Math.min(h, Math.round(firstH * k));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3; const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (d < 0.02) continue; const sa = d / Math.max(0.02, 1 - Math.abs(2 * l - 1)); if (sa < 0.15 || l < 0.04) continue; const strong = sa >= 0.3 && l >= 0.06 && l <= 0.85;
    let hue = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hue = (hue * 60 + 360) % 360;
    const q = Math.floor(hue / 10) % 36; tint[q]++; if (strong) { bins[q]++; if (y < fr) binsF[q]++; }
  }
  const win = (a) => { let best = 0, at = 0; for (let q = 0; q < 36; q++) { const v = a[q] + a[(q + 1) % 36] + a[(q + 2) % 36] + a[(q + 3) % 36]; if (v > best) { best = v; at = q; } } return [best, at * 10 + 20]; };
  const [all, hue] = win(bins), [first] = win(binsF), [tn] = win(tint);
  return { pct: Math.round(all * 100 / (w * h)), first_pct: Math.round(first * 100 / (w * fr)), tint_pct: Math.round(tn * 100 / (w * h)), hue };
}

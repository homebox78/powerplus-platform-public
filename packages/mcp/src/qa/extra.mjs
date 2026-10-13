// 시안 판정 보강 3차(2026-10-13 내 시안 점검 D1·D25·D5·D6)
// - 그림 위 글자 대비: 계산된 배경색이 아니라 캡처 픽셀로 글자 뒤 배경을 잰다(사진·그라데이션 위 흰 글자 1.0 통과 사고)
// - 기관명 대조: 재현 묶음 persona.org 와 title·머리·h1 글자
// - 메뉴와 본문 종류 대조: 서브 화면 종류(page_type)와 h1·경로 낱말

/** 그림(img·video·배경 그림·그라데이션) 위에 놓인 글 요소를 모은다 — 문서 좌표 */
export async function collectOverlayText(p) {
  return p.evaluate(() => {
    const sy = scrollY, sx = scrollX;
    const pics = [];
    for (const el of document.querySelectorAll("img,video,picture,canvas,svg image")) {
      const r = el.getBoundingClientRect(); if (r.width >= 200 && r.height >= 120) pics.push({ x: r.left + sx, y: r.top + sy, w: r.width, h: r.height });
    }
    const bgEl = (el) => { for (let a = el; a && a !== document.body; a = a.parentElement) { const bi = getComputedStyle(a).backgroundImage; if (bi && bi !== "none" && /url\(|gradient/.test(bi)) { const r = a.getBoundingClientRect(); if (r.width >= 200 && r.height >= 120) return true; } } return false; };
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let n = walker.nextNode(); n && out.length < 80; n = walker.nextNode()) {
      const t = n.nodeValue.replace(/\s+/g, " ").trim(); if (t.length < 2) continue;
      const el = n.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
      if (el.closest("[hidden],[aria-hidden=true],script,style,noscript,[data-hb-open]:not([data-hb-open=true])")) continue;
      const cs = getComputedStyle(el); if (cs.visibility === "hidden" || +cs.opacity < 0.5) continue;
      const range = document.createRange(); range.selectNodeContents(n); const r = range.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      const box = { x: r.left + sx, y: r.top + sy, w: r.width, h: r.height };
      const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
      const onPic = pics.some((q) => cx > q.x && cx < q.x + q.w && cy > q.y && cy < q.y + q.h) || bgEl(el);
      if (!onPic) continue;
      const fs = parseFloat(cs.fontSize) || 14, fw = parseInt(cs.fontWeight, 10) || 400;
      out.push({ t: t.slice(0, 24), ...box, color: cs.color, fs, fw, tag: el.tagName.toLowerCase(), h1: !!el.closest("h1") });
    }
    return out;
  }).catch(() => []);
}

const parseRgb = (s) => { const m = String(s).match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : [0, 0, 0]; };
const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [hi, lo] = a > b ? [a, b] : [b, a]; return (hi + 0.05) / (lo + 0.05); };

/** 캡처에서 글 상자 + 둘레 6px 를 잘라 글자색과 먼 화소로 배경을 재고, 글자에 가장 불리한 쪽(85번째 백분위) 대비를 낸다 */
export async function overlayContrast(sharp, shot, items, maxH) {
  const meta = await sharp(shot, { limitInputPixels: false }).metadata();
  const W = meta.width || 1920, H = Math.min(meta.height || 0, maxH || 16000);
  const bad = [];
  for (const it of items) {
    const pad = 6;
    const left = Math.max(0, Math.floor(it.x - pad)), top = Math.max(0, Math.floor(it.y - pad));
    const width = Math.min(W - left, Math.ceil(it.w + pad * 2)), height = Math.min(H - top, Math.ceil(it.h + pad * 2));
    if (width < 6 || height < 6) continue;
    let buf;
    try { buf = await sharp(shot, { limitInputPixels: false }).extract({ left, top, width, height }).removeAlpha().raw().toBuffer(); } catch { continue; }
    const tc = parseRgb(it.color), tl = lum(tc);
    const ls = [];
    for (let i = 0; i + 2 < buf.length; i += 3) {
      const d = Math.abs(buf[i] - tc[0]) + Math.abs(buf[i + 1] - tc[1]) + Math.abs(buf[i + 2] - tc[2]);
      if (d < 140) continue; // 글자 획·번진 가장자리
      ls.push(lum([buf[i], buf[i + 1], buf[i + 2]]));
    }
    let bl;
    const total = Math.floor(buf.length / 3);
    if (ls.length < Math.max(20, total * 0.2)) {
      // 글자색과 먼 화소가 거의 없다 = 배경이 글자색과 같다(흰 바탕 위 흰 글자) → 전체 화소 가운데값을 배경으로
      const all = [];
      for (let i = 0; i + 2 < buf.length; i += 3) all.push(lum([buf[i], buf[i + 1], buf[i + 2]]));
      if (all.length < 20) continue;
      all.sort((a, b) => a - b);
      bl = all[Math.floor(all.length / 2)];
    } else {
      ls.sort((a, b) => a - b);
      // 글자가 밝으면 밝은 배경 쪽이, 어두우면 어두운 배경 쪽이 불리하다
      bl = tl > 0.4 ? ls[Math.floor(ls.length * 0.85)] : ls[Math.floor(ls.length * 0.15)];
    }
    const c = Math.round(ratio(tl, bl) * 10) / 10;
    const large = it.fs >= 24 || (it.fw >= 700 && it.fs >= 18.66);
    const need = large ? 3 : 4.5;
    if (c < need) bad.push({ t: it.t, y: Math.round(it.y), c, need, hero: (it.h1 || it.fs >= 28) && it.y < 1080 });
  }
  return bad;
}

/** 머리·제목 글자(기관명 대조·메뉴 대조용) */
export async function collectNames(p) {
  return p.evaluate(() => {
    const txt = (el) => (el ? (el.innerText || el.textContent || "") : "").replace(/\s+/g, " ").trim();
    const head = document.querySelector("header,[class*=header],[class*=gnb]");
    const logo = document.querySelector("header [class*=logo],[class*=logo],header h1,header a[href]");
    const alts = [...document.querySelectorAll("header img[alt],[class*=logo] img[alt]")].map((i) => i.alt).join(" ");
    const crumb = document.querySelector("[class*=breadcrumb],[class*=location],[aria-label*=경로],nav[aria-label*=breadcrumb]");
    const lnbOn = document.querySelector("[class*=lnb] [aria-current],[class*=lnb] .on,[class*=lnb] .active,[class*=side] [aria-current]");
    return { title: document.title, head: txt(head).slice(0, 400), logo: (txt(logo) + " " + alts).slice(0, 120), h1: txt(document.querySelector("h1")).slice(0, 80), crumb: txt(crumb).slice(0, 120), lnb: txt(lnbOn).slice(0, 40), foot: txt(document.querySelector("footer")).slice(0, 400) };
  }).catch(() => null);
}

const KIND_WORDS = {
  greeting: /인사말|인사|환영|드리는 말|메시지/,
  board_list: /공지|소식|게시판|알림|보도|새소식|자료실|뉴스|고시|공고/,
  board_view: /공지|소식|게시판|알림|보도|새소식|자료실|뉴스|고시|공고|상세/,
  board_gallery: /사진|갤러리|포토|영상|홍보/,
  faq: /자주|FAQ|질문|묻는/i,
  org_chart: /조직|부서|직원|담당|기구/,
  location: /오시는|찾아|위치|교통/,
  history: /연혁|역사|발자취/,
  vision: /비전|목표|미션|전략/,
  symbol: /상징|로고|CI|마스코트|캐릭터|휘장/,
  form: /신청|접수|문의|예약|등록|작성/,
  procedure: /절차|안내|방법|과정/,
  sitemap: /사이트맵|전체메뉴|전체 메뉴/,
  info_disclosure: /정보공개|공개/,
};

const ORG_SUFFIX = /(특별자치시|특별자치도|특별시|광역시|대학교|복지관|위원회|진흥원|연구원|재단|협회|공단|공사|대학|학교|센터|시청|군청|구청|도청|교육청|병원|시|군|구|도|청|부|처|원|회)$/;

/** D5·D6 판정 — { hard, minus, fixes } */
export function nameFixes(names, { want, sub, pageType }) {
  const out = { hard: [], minus: 0, fixes: [] };
  if (!names) return out;
  const top = `${names.title} ${names.logo} ${names.h1} ${names.head}`;
  if (want) {
    const w = String(want).replace(/\s+/g, "").trim();
    const base = w.replace(ORG_SUFFIX, "") || w;
    const flat = top.replace(/\s+/g, "");
    if (base.length >= 2 && !flat.includes(base)) {
      out.hard.push("요청 기관명이 시안에 없음");
      out.minus += 15;
      out.fixes.push(`기관명 · 재현 묶음의 기관명 "${w}" 가 title·로고·머리·h1 어디에도 없다(로고 "${names.logo.slice(0, 30) || "?"}", title "${names.title.slice(0, 30) || "?"}") — persona.org 를 로고·title·h1·바닥글에 그대로 쓴다. 다른 가상 기관명을 지어내지 않는다.`);
    }
  }
  const re = sub && pageType ? KIND_WORDS[pageType] : null;
  if (re) {
    const said = `${names.h1} ${names.crumb} ${names.lnb}`;
    if (said.trim() && !re.test(said)) {
      const other = Object.entries(KIND_WORDS).find(([k, r]) => k !== pageType && !(pageType.startsWith("board") && k.startsWith("board")) && r.test(names.h1));
      out.minus += other ? 8 : 4;
      out.fixes.push(`메뉴와 본문 · 이 화면은 ${pageType} 인데 h1 "${names.h1 || "?"}"·경로 "${names.crumb.slice(-30) || "?"}" 에 그 이름이 없다${other ? `(오히려 ${other[0]} 쪽 이름)` : ""} — 옆 메뉴 활성 항목·경로 끝·h1 을 이 화면 종류 이름으로 맞춘다.`);
    }
  }
  return out;
}

/** D1·D25 감점 — 히어로 제목 3 미만은 치명 */
export function contrastFixes(bad) {
  const out = { hard: [], minus: 0, fixes: [] };
  if (!bad?.length) return out;
  const hero = bad.filter((b) => b.hero && b.c < 3);
  if (hero.length) out.hard.push("첫 화면 제목이 그림 위에서 안 읽힘");
  out.minus += Math.min(12, bad.length * 3);
  for (const b of bad.slice(0, 5)) out.fixes.push(`대비 · y ${b.y} 그림 위 글 "${b.t}" 대비 ${b.c} (필요 ${b.need}) — 글 뒤에 어두운 막(투명도 0.45 이상)이나 불투명 면을 깔거나 글자색을 바꾼다.`);
  return out;
}

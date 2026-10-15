// 출처: homebox-handoff packages/mcp/src/qa/check.mjs 에서 가져옴 (powerMCP 이식 2026-10-06)
// 시안 판정 (2026-10-02, MCP check_mockup) — AI 가 만든 HTML 을 실제 브라우저로 렌더해 게이트·동작 검사 + 레퍼런스 대조를 하고
// 점수와 "고칠 목록"을 돌려준다. 결과가 AI 의 성실함에 기대지 않게 판정을 MCP 가 쥔다(재료만 주고 제작은 AI, 판정은 MCP).
// 렌더러는 호출부가 넘긴다(서버 = chromium, 로컬 = firefox). 한 번에 한 장씩 처리한다(서버 메모리).
import { behavior } from "./behavior.mjs";
import { gates } from "./gates.mjs";
import { layoutChecks, deviceChecks } from "./layout.mjs";
import { measureDesign, designFixes, colorShare } from "./design.mjs";
import { measureVisual, visualFixes, capByKinds } from "./visual.mjs";
import { guardContext } from "./netguard.mjs";
import { collectOverlayText, overlayContrast, collectNames, nameFixes, contrastFixes } from "./extra.mjs";

let browserP = null;
let idleTimer = null;
let queue = Promise.resolve();

/** 브라우저 하나를 띄워 두고 2분 동안 안 쓰면 닫는다(서버 상주 메모리 절약). */
async function getBrowser(launch) {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  if (!browserP) browserP = launch().catch((e) => { browserP = null; throw e; });
  return browserP;
}
function releaseLater() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => { const b = await browserP?.catch(() => null); browserP = null; await b?.close().catch(() => {}); }, 120_000);
}

/** 렌더된 시안을 레퍼런스 줄·칸과 대조하고 누출·깨진 이미지를 찾는다. */
async function measure(p, ref) {
  return p.evaluate((ref) => {
    const vis = (el) => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && parseFloat(s.opacity || "1") > 0.05 && b.width > 0 && b.height > 0 && !el.closest("[hidden]"); };
    const H = document.documentElement.scrollHeight, W = innerWidth;
    const top = (el) => el.getBoundingClientRect().top + scrollY;
    // 머리·바닥: 서브 페이지는 본문 구간끼리 비교한다
    const hdr = [...document.querySelectorAll("header, [role=banner]")].filter(vis).filter((e) => !e.parentElement.closest("header, [role=banner], main, article"))[0];
    const ftr = [...document.querySelectorAll("footer, [role=contentinfo]")].filter(vis).filter((e) => !e.parentElement.closest("footer")).pop();
    const bodyFrom = hdr ? top(hdr) + hdr.getBoundingClientRect().height : 0;
    const bodyTo = ftr ? top(ftr) : H;

    // 줄마다 칸 수: 띠 안에 들어오는 상자들 중 가로로 겹치지 않는 '칸'을 센다. 칸 둘 이상을 품은 줄 껍데기는 뺀다.
    const all = [...document.querySelectorAll("body *")].filter((el) => !["SCRIPT", "STYLE", "BR", "svg", "path", "SPAN", "B", "STRONG", "EM", "I", "LABEL", "OPTION"].includes(el.tagName));
    const boxes = [];
    for (const el of all) {
      if (!vis(el)) continue;
      const b = el.getBoundingClientRect(); if (b.width < W * 0.04 || b.height < 40) continue;
      // 넘침을 자르는 조상(캐러셀 트랙 등) 밖으로 나간 부분은 보이지 않는다 — 보이는 부분만 잰다(2026-10-12 build_homepage: 화면 밖 배너 슬라이드를 x 1980 끝선으로 감점)
      let x1 = b.left, x2 = b.right;
      for (let q = el.parentElement; q && q !== document.body; q = q.parentElement) { if (getComputedStyle(q).overflowX === "visible") continue; const r = q.getBoundingClientRect(); x1 = Math.max(x1, r.left); x2 = Math.min(x2, r.right); }
      if (x2 - x1 < b.width * 0.5) continue;
      boxes.push({ el, x: x1, w: x2 - x1, y: b.top + scrollY, h: b.height });
    }
    const hOv = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const colsIn = (y1, y2) => {
      const bh = y2 - y1;
      let c = boxes.filter((b) => b.w <= W * 0.92 && b.h >= bh * 0.35 && b.h <= bh * 1.7 && Math.max(0, Math.min(b.y + b.h, y2) - Math.max(b.y, y1)) >= b.h * 0.5);
      c = c.filter((b) => { const inner = c.filter((o) => o !== b && b.el.contains(o.el)); return !inner.some((o, i) => inner.some((q, j) => j > i && hOv(o, q) < Math.min(o.w, q.w) * 0.2)); });
      c.sort((a, b) => b.w * b.h - a.w * a.h);
      const picked = [];
      for (const b of c) if (!picked.some((q) => hOv(b, q) > Math.min(b.w, q.w) * 0.4)) picked.push(b);
      return picked;
    };
    const refCols = (cells) => { const cl = []; for (const c of [...cells].sort((a, b) => a.x - b.x)) { const g = cl.find((g) => hOv(g, c) > Math.min(24, Math.min(g.w, c.w) * 0.5)); /* 실제 칸은 겹치지 않는다 — 24px 넘게 겹치면 자동 분해가 잘못 나눈 것(2026-10-05 R1: banner_zone 이 양옆 칸과 100px+ 겹쳐 4칸으로 셈) */ if (g) { const x2 = Math.max(g.x + g.w, c.x + c.w); g.x = Math.min(g.x, c.x); g.w = x2 - g.x; } else cl.push({ x: c.x, w: c.w }); } return cl.length; };
    const sub = ref.sub;
    const rTop = sub ? sub.body_y_from : 0, rH = sub ? Math.max(1, sub.body_h) : Math.max(1, ref.height);
    const mTop = sub ? bodyFrom : 0, mH = sub ? Math.max(1, bodyTo - bodyFrom) : H;
    const k = mH / rH;
    const rows = [];
    ref.rows.forEach((r, i) => {
      if (r.h < 60) return;
      if (sub && (r.y < sub.body_y_from - 4 || r.y + r.h > sub.body_y_to + 4)) return;
      if (r.cells.some((c) => ["header", "masthead", "gnb", "footer"].includes(c.type))) return;
      // 서브는 옆 메뉴(lnb)를 칸으로 세지 않는다 — 옆 메뉴는 sub_shell 틀이 정하고 따로 판정한다(2026-10-03 시험 20건 중 다수에서 "2칸인데 1칸" 오탐)
      const want = refCols(sub ? r.cells.filter((c) => !["lnb", "floating_quick"].includes(c.type)) : r.cells.filter((c) => c.type !== "floating_quick"));
      if (want < 2) return;
      const y1 = mTop + (r.y - rTop) * k, y2 = y1 + r.h * k;
      const got = colsIn(y1, y2).length;
      rows.push({ row: i + 1, ref_y: r.y, ref_h: r.h, mock_y: Math.round(y1), mock_h: Math.round(y2 - y1), ref_cols: want, mock_cols: got, types: r.cells.map((c) => c.type) });
    });

    // 가로 틀(메인만): 줄마다 내용의 왼쪽 선·오른쪽 끝·칸 사이 간격을 재서, 다수와 다른 줄을 찾는다.
    // (2026-10-02 섞기 시안에서 어떤 줄은 1720, 어떤 줄은 1520 폭이고 칸 간격이 60·18·29 로 제각각이었는데 통과했다)
    const frame = { left: null, right: null, gap: null, off: [], gap_off: [], row_gap: null, touch: [], row_off: [] };
    if (!sub) {
      const ms = [];
      ref.rows.forEach((r, i) => {
        if (r.h < 100 || r.cells.some((c) => ["header", "masthead", "gnb", "footer"].includes(c.type))) return;
        const y1 = mTop + (r.y - rTop) * k, y2 = y1 + r.h * k;
        const cs = colsIn(y1, y2).sort((a, b) => a.x - b.x); if (!cs.length) return;
        // 좌우 끝은 칸 상자만이 아니라 그 줄에 든 모든 상자(제목 포함)로 잰다 — 제목은 200 에서, 그 아래 상자는 217 에서 시작하는 줄을 어긋난 줄로 잡았다
        const inBand0 = boxes.filter((b) => b.w <= W * 0.92 && b.x >= 0 && b.x + b.w <= W && b.y >= y1 - 8 && b.y + b.h <= y2 + 8);
        // 배경·테두리·그림자 없는 감싸개(본문 틀 div)는 안쪽 여백까지 재서 끝선이 20~24px 어긋나 보였다 — 보이는 상자만(2026-10-12 MCP 예시 시험)
        const painted = (el) => { const s = getComputedStyle(el); return (s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== "transparent") || s.backgroundImage !== "none" || parseFloat(s.borderLeftWidth) > 0 || parseFloat(s.borderRightWidth) > 0 || s.boxShadow !== "none"; };
        const inBand = inBand0.filter((b) => painted(b.el) || !inBand0.some((o) => o !== b && b.el.contains(o.el)));
        // 칸 상자가 보이지 않는 틀(div.mm-wrap 등)이면 안쪽 여백을 빼고 잰다 — 틀의 padding 24 때문에 210~1710 으로 어긋나 보였다(2026-10-12)
        const inner = (c) => { if (!c.el || painted(c.el)) return c; const s = getComputedStyle(c.el); const pl = parseFloat(s.paddingLeft) || 0, pr = parseFloat(s.paddingRight) || 0; return { ...c, x: c.x + pl, w: Math.max(1, c.w - pl - pr) }; };
        const span = [...inBand, ...cs].map(inner); // 높이가 달라 줄 자리가 조금 밀린 시안에서는 칸 상자가 띠 밖에 걸친다 — 둘 다 본다
        const L = Math.round(Math.min(...span.map((c) => c.x))), R = Math.round(Math.max(...span.map((c) => c.x + c.w)));
        const big = cs.filter((c) => c.w >= W * 0.15); // 좁은 조각(세로 탭 띠·단추)은 칸으로 세지 않는다
        const gaps = []; for (let i = 1; i < big.length; i++) { const g = Math.round(big[i].x - (big[i - 1].x + big[i - 1].w)); if (g >= 8 && g <= 160) gaps.push(g); }
        // 끝선을 만든 요소 이름(2026-10-05 R6: "x 0~1920" 만으로는 어느 요소인지 몰랐다)
        const nm0 = (x) => x ? x.tagName.toLowerCase() + ((typeof x.className === "string" && x.className.trim()) ? "." + x.className.trim().split(" ")[0] : "") : "";
        const edge = span.find((c) => Math.round(c.x) === L) || span[0], edgeR = span.find((c) => Math.round(c.x + c.w) === R) || edge;
        const who = [edge, edgeR].filter((c) => c && c.el).map((c) => nm0(c.el.parentElement) + " > " + nm0(c.el)).filter((v, i2, a2) => a2.indexOf(v) === i2).join(" / ");
        ms.push({ y: Math.round(y1), L, R, who, gaps, T: Math.round(Math.min(...cs.map((c) => c.y))), B: Math.round(Math.max(...cs.map((c) => c.y + c.h))), refIdx: i });
      });
      const mode = (a, step) => { const t = {}; let best = null; for (const v of a) { const q = Math.round(v / step) * step; t[q] = (t[q] || 0) + 1; if (best === null || t[q] > t[best]) best = q; } return best === null ? null : Number(best); };
      const wide = ms.filter((m) => m.R - m.L >= W * 0.6);
      if (wide.length >= 3) {
        frame.left = mode(wide.map((m) => m.L), 10); frame.right = mode(wide.map((m) => m.R), 10);
        frame.off = wide.filter((m) => Math.abs(m.L - frame.left) > 16 || Math.abs(m.R - frame.right) > 16).map((m) => ({ y: m.y, left: m.L, right: m.R, who: m.who }));
        const g = wide.filter((m) => m.gaps.length);
        if (g.length >= 2) {
          const all2 = g.flatMap((m) => m.gaps).sort((a, b) => a - b); frame.gap = all2[Math.floor(all2.length / 2)];
          frame.gap_off = g.filter((m) => m.gaps.some((v) => Math.abs(v - frame.gap) > 12)).map((m) => ({ y: m.y, gaps: m.gaps }));
        }
        // 줄 사이 세로 간격: 위 줄 상자 바닥 ~ 아래 줄 상자 윗변. 붙은 곳(8px 미만)과 다수와 다른 곳(2026-10-02 사용자 지적)
        const sorted = [...wide].sort((a, b) => a.T - b.T); const vs = [];
        // 줄 위에 따로 놓인 섹션 제목(h2·h3 만 있는 띠)은 아래 줄의 시작이다 — 제목을 빼고 재면 제목 높이만큼 간격이 부풀어
        // "빈 띠·간격 벗어남"으로 잡혀, 맞추려다 제목 주변이 20px 로 붙었다(2026-10-15 시험 s06·s08)
        const heads = [...document.querySelectorAll("h2, h3")].filter(vis).map((e) => { const b = e.getBoundingClientRect(); return { y: b.top + scrollY, b: b.bottom + scrollY }; });
        for (let i = 1; i < sorted.length; i++) { const hd = heads.filter((h) => h.y >= sorted[i - 1].B - 4 && h.b <= sorted[i].T + 4); if (hd.length) sorted[i].T = Math.min(sorted[i].T, ...hd.map((h) => h.y)); }
        for (let i = 1; i < sorted.length; i++) { const v = sorted[i].T - sorted[i - 1].B; if (v > -30 && v < 260) vs.push({ y: sorted[i].T, v, refGap: ref.rows[sorted[i].refIdx]?.gap_above ?? 8 }); }
        // 레퍼런스에서도 맞닿은 띠(배경 가득 줄, gap_above 8 미만)는 0이 정상이라 붙음 감점에서 뺀다
        frame.touch = vs.filter((o) => o.v < 8 && (o.refGap ?? 8) >= 8);
        const okv = vs.filter((o) => o.v >= 8).map((o) => o.v).sort((a, b) => a - b);
        if (okv.length >= 3) { frame.row_gap = okv[Math.floor(okv.length / 2)]; frame.row_off = vs.slice(1).filter((o) => o.v >= 8 && Math.abs(o.v - frame.row_gap) > 40 && !(ref.rows[sorted.find((s) => s.T === o.y)?.refIdx]?.gap_above != null && Math.abs(o.v - ref.rows[sorted.find((s) => s.T === o.y).refIdx].gap_above) <= 40)); } // 레퍼런스 그 자리 간격대로 맞춘 줄은 다수와 달라도 정상(2026-10-05 R1: 기준이 시안 자기 중앙값이라 레퍼런스를 따르면 감점)
      }
    }
    // 부모 밖으로 크게 삐져나온 불투명 상자 = 다른 구역을 덮는다(클래스 이름 충돌로 405px 어두운 상자가 윗줄을 덮었는데 100점이었다)
    const spill = [];
    for (const b of boxes) {
      if (b.w < 150 || b.h < 150 || spill.length >= 3) continue;
      // 표 칸은 rowspan 으로 줄(tr) 밖까지 늘어나는 게 정상 — 덮임이 아니다(2026-10-15 시험 s07 조직도 표 159px 오탐)
      if (/^(TD|TH|TR|TBODY|THEAD)$/.test(b.el.tagName)) continue;
      const cs = getComputedStyle(b.el); if (!["static", "relative"].includes(cs.position)) continue;
      const bgc = cs.backgroundColor; if (!bgc || /rgba(.*,s*0)$|transparent/.test(bgc)) continue;
      const pr = b.el.parentElement; if (!pr || pr === document.body) continue;
      const pb = pr.getBoundingClientRect(); const ps = getComputedStyle(pr);
      if (ps.overflowY !== "visible" || pb.height < 20) continue;
      const out = Math.max((b.y + b.h) - (pb.top + scrollY + pb.height), (pb.top + scrollY) - b.y);
      if (out > 80) spill.push({ y: Math.round(b.y), h: Math.round(b.h), over: Math.round(out), cls: String(b.el.className || b.el.tagName).slice(0, 30) });
    }

    // 누출: 레퍼런스 기관명·도메인·전화·주소가 글·속성·주소에 나오면 안 된다
    const hay = (document.body.innerText + " " + [...document.querySelectorAll("[alt],[title],[aria-label],a[href],img[src],[style]")].map((e) => [e.getAttribute("alt"), e.getAttribute("title"), e.getAttribute("aria-label"), e.getAttribute("href"), e.getAttribute("src"), e.getAttribute("style")].join(" ")).join(" ") + " " + document.title).toLowerCase();
    // 한글 이름은 앞에 한글이 붙어 있으면 다른 낱말의 일부로 본다 — 고객 기관 '기후환경부' 안의 '환경부' 를 누출로 잡던 오탐(2026-10-03 시험 16)
    const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const leaks = ref.leak.filter((s) => {
      const t = String(s ?? "").toLowerCase(); if (!t || !hay.includes(t)) return false;
      if (!/^[가-힣]/.test(t)) return true;
      return new RegExp(`(^|[^가-힣])${esc(t)}`).test(hay);
    });
    // 이미지: 깨진 것·홈박스 밖 주소
    const srcs = [...document.images].map((im) => ({ src: im.currentSrc || im.src, ok: im.complete && im.naturalWidth > 0, vis: vis(im) }));
    const bg = [...document.querySelectorAll("*")].map((e) => (getComputedStyle(e).backgroundImage.match(/url\("?([^")]+)"?\)/) || [])[1]).filter(Boolean);
    const hostOf = (u) => { try { return new URL(u, location.href).host; } catch { return ""; } };
    const foreign = [...new Set([...srcs.map((s) => s.src), ...bg].filter((u) => u && !u.startsWith("data:") && !u.startsWith("about:")).map(hostOf).filter((h) => h && !/(^|\.)hom2box\.com$|^localhost|^127\.0\.0\.1|fonts\.(googleapis|gstatic)\.com$|cdn\.jsdelivr\.net$/.test(h)))];
    const broken = [...new Set(srcs.filter((s) => s.vis && !s.ok && s.src).map((s) => { const p = s.src.split("?")[0].split("/").filter(Boolean); const n = p.pop() || ""; return (/^(original|web|thumb|card)$/.test(n) ? `${p.pop()}/${n}` : n).slice(0, 60); }))];
    return { height: H, body: { from: Math.round(bodyFrom), to: Math.round(bodyTo) }, rows, frame, spill, leaks, foreign, broken, images: srcs.length };
  }, ref);
}

/** 두 캡처의 밝기 구성 유사도(0~100)와 크게 다른 세로 구간. 본문 구간끼리 같은 높이로 맞춰 비교한다. */
async function similarity(sharp, refBuf, refBox, mockBuf, mockBox) {
  const G = { w: 24, h: 120 };
  const norm = async (buf, box) => {
    const m = await sharp(buf, { limitInputPixels: false }).metadata();
    const top = Math.max(0, Math.min(m.height - 2, Math.round(box.from * box.k)));
    const h = Math.max(2, Math.min(m.height - top, Math.round((box.to - box.from) * box.k)));
    return sharp(buf, { limitInputPixels: false }).extract({ left: 0, top, width: m.width, height: h }).resize(G.w, G.h, { fit: "fill" }).greyscale().raw().toBuffer();
  };
  const a = await norm(refBuf, refBox), b = await norm(mockBuf, mockBox);
  let diff = 0; const rowD = [];
  for (let y = 0; y < G.h; y++) { let d = 0; for (let x = 0; x < G.w; x++) d += Math.abs(a[y * G.w + x] - b[y * G.w + x]); rowD.push(d / G.w); diff += d; }
  const sim = Math.max(0, Math.round(100 - (diff / (G.w * G.h)) / 1.6));
  const bands = []; let s = -1;
  for (let y = 0; y <= G.h; y++) { const bad = y < G.h && rowD[y] > 70; if (bad && s < 0) s = y; if (!bad && s >= 0) { if (y - s >= 3) bands.push([s / G.h, y / G.h]); s = -1; } }
  return { sim, bands };
}

/** 레퍼런스(왼쪽)·시안(오른쪽)을 같은 폭으로 나란히 — 긴 화면은 여러 장으로 잘라 준다. */
async function sideBySide(sharp, refBuf, mockBuf, w = 560, sliceH = 1600, maxSlices = 4) {
  const a = await sharp(refBuf, { limitInputPixels: false }).resize({ width: w }).toBuffer({ resolveWithObject: true });
  const b = await sharp(mockBuf, { limitInputPixels: false }).resize({ width: w }).toBuffer({ resolveWithObject: true });
  const H = Math.max(a.info.height, b.info.height);
  const full = await sharp({ create: { width: w * 2 + 16, height: H, channels: 3, background: "#ffffff" } })
    .composite([{ input: a.data, left: 0, top: 0 }, { input: b.data, left: w + 16, top: 0 }]).png().toBuffer();
  const out = [];
  for (let t = 0, i = 0; t < H && i < maxSlices; t += sliceH, i++) {
    const h = Math.min(sliceH, H - t); if (h < 60 && i > 0) break;
    out.push({ from: t, to: t + h, jpeg: await sharp(full).extract({ left: 0, top: t, width: w * 2 + 16, height: h }).jpeg({ quality: 70 }).toBuffer() });
  }
  return { slices: out, scaleRef: w / (await sharp(refBuf, { limitInputPixels: false }).metadata()).width, totalH: H };
}

/**
 * @param {{ html: string, ref: any, refImage: Buffer|null, launch: () => Promise<any>, sharp: any, width?: number }} o
 */
export function checkMockup(o) {
  const run = queue.then(() => doCheck(o));
  queue = run.catch(() => {});
  return run;
}

async function doCheck({ html, ref, refImage, launch, sharp, width = 1920, peers = [], want = "", textKeys = [], iconKeys = [] }) {
  const browser = await getBrowser(launch);
  // serviceWorkers block: 서비스 워커 요청은 route 를 거치지 않아 막이를 우회한다
  const ctx = await browser.newContext({ viewport: { width, height: width < 800 ? 844 : 1080 }, reducedMotion: "reduce", serviceWorkers: "block" });
  // 개발 환경(API 가 127.0.0.1)에서만 루프백을 허용한다 — 운영은 공개 주소만
  const blockedNet = await guardContext(ctx, { allowLoopback: /^https?:\/\/(127\.|localhost)/.test(process.env.HOMEBOX_API ?? "http://127.0.0.1") });
  const p = await ctx.newPage();
  const errors = []; p.on("pageerror", (e) => errors.push(String(e.message || e).slice(0, 120)));
  try {
    // 그림이 많아 load 가 40초를 넘으면 실패하던 것(2026-10-15 일괄 수정 2장) — DOM 이 섰으면 그대로 잰다
    await p.setContent(html, { waitUntil: "load", timeout: 60_000 }).catch(async (e) => { if (!(await p.evaluate(() => !!document.body).catch(() => false))) throw e; });
    // 지연 로딩 이미지가 뜨도록 끝까지 한 번 내린다
    await p.evaluate(async () => { const H = document.documentElement.scrollHeight; for (let y = 0; y < H; y += 900) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } scrollTo(0, 0); });
    // 지연 로딩을 즉시 로딩으로 바꾸고 모든 이미지가 끝날 때까지 기다린다(최대 6초)
    // (2026-10-05 R6: 서버가 200 으로 주는 loading=lazy 이미지를 60ms 스크롤 사이에 못 받아 "안 뜨는 이미지"로 오탐)
    await p.evaluate(async () => {
      for (const im of document.images) if (im.loading === "lazy") im.loading = "eager";
      await Promise.race([Promise.all([...document.images].map((im) => im.complete ? 0 : new Promise((r) => { im.addEventListener("load", r, { once: true }); im.addEventListener("error", r, { once: true }); }))), new Promise((r) => setTimeout(r, 6000))]);
    });
    await p.waitForTimeout(600);
    const g = await gates(p);
    // 구성·균형(2026-10-15 사용자 눈 점검 20건, R35) — 첫 화면은 900px 로 잰다(노트북 브라우저 안쪽 높이)
    const lay = width >= 800 ? await layoutChecks(p, { textKeys, iconKeys, sub: !!ref.sub, viewportH: 900, org: want }).catch(() => ({ r: {}, fails: [] })) : { r: {}, fails: [] };
    const m = await measure(p, ref);
    const shot = await p.screenshot({ fullPage: true, type: "png", clip: { x: 0, y: 0, width, height: Math.min(m.height, 16000) } });
    // D1·D25: 그림 위 글자는 캡처 픽셀로 대비를 잰다 / D5·D6: 기관명·화면 종류 이름 (behavior 가 메뉴를 열기 전에)
    const overBad = await overlayContrast(sharp, shot, await collectOverlayText(p), Math.min(m.height, 16000)).catch(() => []);
    const names = await collectNames(p);
    const hasHb = await p.evaluate(() => !!document.querySelector("[data-hb],[data-hb-open]"));
    const beh = await behavior(p, { force: hasHb, errors });
    // data-hb 가 없어도 표준 접근성 속성(role=tab·aria-controls)으로 만든 조작이 실제로 움직이면 감점하지 않는다
    // — 홈박스 자체 조립(메인·서브 키트)은 자기 스크립트를 쓰는데 매번 -10 이었다(2026-10-12 MCP 예시 시험)
    const ownOk = hasHb ? false : !errors.length && await p.evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms)); let tried = 0, ok = 0;
      const tab = [...document.querySelectorAll('[role="tab"]')].find((t) => t.getAttribute("aria-selected") !== "true" && t.getBoundingClientRect().width > 0);
      if (tab) { tried++; (tab.querySelector("button") || tab).click(); await wait(150); if (tab.getAttribute("aria-selected") === "true" || tab.classList.contains("active")) ok++; }
      const btn = [...document.querySelectorAll("button[aria-controls][aria-expanded]")].find((b) => b.getBoundingClientRect().width > 0 && document.getElementById(b.getAttribute("aria-controls")));
      if (btn) { tried++; const before = btn.getAttribute("aria-expanded"); btn.click(); await wait(150); if (btn.getAttribute("aria-expanded") !== before) ok++; btn.click(); }
      return tried > 0 && ok === tried;
    }).catch(() => false);
    // 반응형(2026-10-02 사용자: 반응형은 기본으로 같이): 390 폭으로 다시 그려 가로 넘침·작은 글자를 잰다
    let dev = [];
    let mob = { overflow: 0, wide: [], tiny: 0, media: /@media[^{]*(max|min)-width/.test(html) };
    if (width >= 800) {
      await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(500);
      const r = await p.evaluate(() => {
        const sw = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
        const wide = []; let tiny = 0;
        // 가로 스크롤·잘림 칸 안쪽 요소는 문서를 넓히지 않는다 — 원인 후보에서 뺀다(2026-10-05 R3·R6: overflow-x:auto 안의 옆 메뉴 칩을 원인으로 지목, 실제 원인은 표 최소 폭)
        const clipped = (e) => { for (let q = e.parentElement; q && q !== document.body; q = q.parentElement) { const ox = getComputedStyle(q).overflowX; if (ox !== "visible") return true; } return false; };
        for (const e of document.querySelectorAll("body *")) {
          const b = e.getBoundingClientRect(); if (b.width < 2 || b.height < 2) continue;
          if (b.right > 400 && b.left >= 0 && b.left < 390 && wide.length < 4 && getComputedStyle(e).position !== "fixed" && !clipped(e)) { const nm = (x) => x ? x.tagName.toLowerCase() + ((typeof x.className === "string" && x.className.trim()) ? "." + x.className.trim().split(/\s+/)[0] : "") : ""; const n = `${nm(e.parentElement)} > ${nm(e)} (y ${Math.round(b.top + scrollY)}, 오른쪽 끝 ${Math.round(b.right)}px)`; if (!wide.includes(n)) wide.push(n.slice(0, 80)); }
          if (e.children.length === 0 && (e.textContent || "").trim().length > 3 && parseFloat(getComputedStyle(e).fontSize) < 12.5) tiny++;
        }
        // D8·D18 모바일 잘림(잘리는 칸 안 글이 칸 밖으로)·첫 화면을 머리가 다 먹음
        let cut = 0; const cutw = [];
        for (const e of document.querySelectorAll("body *")) {
          if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)) continue;
          const b = e.getBoundingClientRect(); if (b.width < 2 || b.height < 2) continue; const es = getComputedStyle(e); if (es.visibility !== "visible" || +es.opacity < 0.1 || e.closest("[hidden],[aria-hidden=true]")) continue;
          for (let q = e.parentElement; q && q !== document.body; q = q.parentElement) {
            const st = getComputedStyle(q); if (st.overflowX !== "hidden" && st.overflowX !== "clip") continue;
            const qb = q.getBoundingClientRect();
            if (qb.width > 40 && (b.right > qb.right + 4 || b.left < qb.left - 4) && !/carousel|slide|swiper|track|marquee|ticker/i.test(String(q.className)) && !q.closest("[data-hb=carousel],[data-hb-track]")) { cut++; if (cutw.length < 3) cutw.push((e.textContent || "").trim().slice(0, 14)); }
            break;
          }
        }
        const hd = document.querySelector("header"); const headH = hd ? Math.round(hd.getBoundingClientRect().height) : 0;
        return { overflow: sw - 390, wide, tiny, cut, cutw, headH };
      });
      mob = { ...mob, ...r };
      // 모바일·태블릿 구성(2026-10-15 사용자 지적: 모바일에서 다 깨짐 — 입력칸·단추 짝, 탭 줄 잘림, 짧은 이름 꺾임, 구분선 줄바꿈, 열린 판이 화면 밖)
      dev = [...(await deviceChecks(p, 390, lay.r.font ?? null).catch(() => ({ fails: [] }))).fails];
      await p.setViewportSize({ width: 768, height: 1024 }); await p.waitForTimeout(400);
      dev.push(...(await deviceChecks(p, 768, lay.r.font ?? null).catch(() => ({ fails: [] }))).fails);
      await p.setViewportSize({ width, height: 1080 });
    }

    // 2026-10-02 사용자 지적(예정시 시안): 가로 스크롤·본문 아래 큰 빈칸·푸터 빈칸·개별 드롭다운 메뉴·서브 비주얼 없음·지도 일러스트
    const pc = { over: [], blanks: [], menu_w: null, subvisual: true, map: true };
    if (width >= 800) {
      // 실제 브라우저는 세로 스크롤바(약 17px)가 자리를 차지한다 — 1920 모니터의 실제 폭은 1903.
      // 머리 없는 브라우저는 스크롤바가 없어 body{width:1920px} 같은 고정 폭을 못 잡았다(2026-10-02 사용자 재지적).
      for (const w of [width, 1600, 1440, 1280]) {
        let worst = 0;
        for (const vw of [w, w - 17]) {
          await p.setViewportSize({ width: vw, height: 1080 }); await p.waitForTimeout(250);
          const o = await p.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth);
          if (o > worst) worst = o;
        }
        if (worst > 2) pc.over.push({ w, over: worst });
      }
      if (/\b100vw\b/.test(html)) pc.vw = true;
      await p.setViewportSize({ width, height: 1080 }); await p.waitForTimeout(250);
      // 섹션 제목이 내용과 떨어져 있나 — 제목만 따로 모은 띠(2026-10-02 사용자 지적: 제목 줄이 색 띠에 따로, 내용은 75px 아래)
      pc.titles = await p.evaluate(() => {
        const sy = window.scrollY, bad = [];
        const heads = [...document.querySelectorAll("main h2, main h3, main [class*=tit], section h2, section h3")].filter((e) => {
          const s = getComputedStyle(e), q = e.getBoundingClientRect();
          return s.display !== "none" && s.visibility !== "hidden" && q.width > 40 && q.height > 14 && q.height < 90 && parseFloat(s.fontSize) >= 22 && (e.textContent || "").trim().length >= 2 && !e.closest("header, footer, nav, aside, li, article, figure, figcaption, [data-hb=carousel], [data-hb-slide], [class*=card], [class*=slide], [class*=caption], [class*=lnb], [class*=snb], [class*=side]")
            // 카드·슬라이드 캡션·LNB 제목 상자·사진 위 글은 섹션 제목이 아니다(2026-10-03 시험 20건 중 9건 오탐)
            && ![e, e.parentElement].some((a) => a && /absolute|fixed/.test(getComputedStyle(a).position));
        });
        const solid = (e) => { for (let a = e; a && a !== document.body; a = a.parentElement) { const c = getComputedStyle(a).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return [a, c]; } return [document.body, "base"]; };
        for (const h of heads) {
          h.scrollIntoView({ block: "center", behavior: "instant" });
          const q = h.getBoundingClientRect(); const cx = q.left + Math.min(q.width, 200) / 2; let next = null;
          for (let y = q.bottom + 6; y < Math.min(q.bottom + 220, innerHeight - 2); y += 8) {
            const el = document.elementFromPoint(cx, y); if (!el || el === h || h.contains(el)) continue;
            const t = el.closest("a, button, img, li, p, table, input, figure, [data-hb], article") || (el.children.length === 0 && (el.textContent || "").trim() ? el : null);
            if (t && !heads.includes(t)) { next = { gap: Math.round(t.getBoundingClientRect().top - q.bottom), el: t }; break; }
          }
          if (!next || next.gap < 0) continue; // 음수 = 같은 줄 옆 요소(탭·더보기)나 더 높은 사진이 먼저 잡힌 것 — 제목과 내용이 떨어진 게 아니다
          const [ha, hc] = solid(h), [, nc] = solid(next.el);
          const nm = (e) => e.tagName.toLowerCase() + (e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/)[0] : "");
          if (next.gap > 64 || (hc !== nc && !ha.contains(next.el))) bad.push({ y: Math.round(q.top + window.scrollY), text: (h.textContent || "").trim().slice(0, 14), gap: next.gap, band: hc !== nc && !ha.contains(next.el), title: nm(h), next: nm(next.el) });
        }
        return bad.slice(0, 8);
      }).catch(() => []) || [];
      const r = await p.evaluate((isSub) => {
        const vw = document.documentElement.clientWidth, H = document.documentElement.scrollHeight, sy = window.scrollY;
        const vis = (e) => { const s = getComputedStyle(e); return s.display !== "none" && s.visibility !== "hidden" && parseFloat(s.opacity) > 0.05; };
        const foot = document.querySelector("footer, [role=contentinfo]");
        const fTop = foot ? foot.getBoundingClientRect().top + sy : H;
        const iv = []; const gapOk = [];
        for (const e of document.querySelectorAll("body *")) {
          const b = e.getBoundingClientRect(); if (b.width < 4 || b.height < 4 || !vis(e)) continue;
          const s = getComputedStyle(e); if (s.position === "fixed") continue;
          if (!isSub && e.hasAttribute("data-qa-gap")) { gapOk.push([b.top + sy, b.bottom + sy]); continue; }
          const leaf = /^(IMG|SVG|svg|INPUT|BUTTON|IFRAME|VIDEO|SELECT|TEXTAREA|CANVAS)$/.test(e.tagName) || [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0) || s.backgroundImage.includes("url(");
          if (leaf) iv.push([b.top + sy, b.bottom + sy]);
        }
        iv.sort((a, b) => a[0] - b[0]);
        const blanks = []; let end = iv.length ? iv[0][1] : 0;
        for (const [a, b] of iv) {
          const g = a - end;
          if (g > 0) { const inFoot = end >= fTop - 2; const lim = inFoot ? 90 : 180; if (g > lim && !gapOk.some(([x, y]) => x < a && y > end)) blanks.push({ y: Math.round(end), h: Math.round(g), where: inFoot ? "바닥 안쪽" : (a >= fTop - 2 ? "본문과 바닥 사이" : "본문") }); }
          if (b > end) end = b;
        }
        // 서브 비주얼: 위쪽에 폭 가득한 색 면·사진 띠
        let subvisual = false;
        for (const e of document.querySelectorAll("body *")) {
          const b = e.getBoundingClientRect(); const t = b.top + sy;
          if (b.width < vw * 0.95 || t < -2 || t > 420 || b.height < 90 || b.height > 600 || /^(HEADER|NAV|BODY|MAIN)$/.test(e.tagName) || e.closest("header")) continue;
          const s = getComputedStyle(e); const c = s.backgroundColor.match(/[\d.]+/g) || [];
          const colored = c.length >= 3 && (c[3] === undefined || +c[3] > 0.2) && !(+c[0] > 250 && +c[1] > 250 && +c[2] > 250);
          if (colored || s.backgroundImage !== "none" || e.querySelector(":scope > img")) { subvisual = true; break; }
        }
        return { blanks: blanks.slice(0, 5), subvisual };
      }, !!ref.sub);
      pc.blanks = r.blanks; pc.subvisual = r.subvisual;
      // 배경 위 칸이 묻히나 — 사진·무늬·색 띠 위에 나란히 놓인 칸(3개+)이 불투명한 면 없이 떠 있는 경우(절차 7-5)
      pc.buried = await p.evaluate(() => {
        const vw = document.documentElement.clientWidth, sy = window.scrollY, out = [];
        const rgba = (c) => { const m = (c || "").match(/[\d.]+/g) || []; return m.length >= 3 ? [+m[0], +m[1], +m[2], m[3] === undefined ? 1 : +m[3]] : [0, 0, 0, 0]; };
        const shown = (e) => { const s = getComputedStyle(e); return s.display !== "none" && s.visibility !== "hidden" && parseFloat(s.opacity) > 0.05; };
        const bands = [...document.querySelectorAll("main *, section, body > div, body > div > div")].filter((e) => {
          if (e.closest("header, footer, nav") || !shown(e)) return false;
          const b = e.getBoundingClientRect(); if (b.width < vw * 0.9 || b.height < 160 || b.height > 1400) return false;
          const s = getComputedStyle(e); const c = rgba(s.backgroundColor);
          const photo = s.backgroundImage.includes("url(");
          const tint = c[3] > 0.5 && !(c[0] > 236 && c[1] > 236 && c[2] > 236);
          if (!photo && !tint) return false;
          e.__hbBand = photo ? "사진·무늬" : "색 면"; return true;
        });
        const seen = new Set();
        for (const band of bands) {
          for (const par of band.querySelectorAll("ul, ol, div")) {
            if (seen.has(par)) continue;
            const kids = [...par.children].filter((k) => { if (!shown(k)) return false; const b = k.getBoundingClientRect(); return b.width >= 100 && b.width <= 720 && b.height >= 60 && (k.textContent || "").trim().length >= 2; });
            if (kids.length < 3) continue;
            const w0 = kids[0].getBoundingClientRect().width;
            if (!kids.every((k) => Math.abs(k.getBoundingClientRect().width - w0) < w0 * 0.12)) continue;
            // 칸과 띠 사이에 불투명한 면이 있으면(흰 상자 안의 칸) 묻히지 않는다
            let covered = false;
            for (let a = par; a && a !== band; a = a.parentElement) { const c = rgba(getComputedStyle(a).backgroundColor); if (c[3] >= 0.85) { covered = true; break; } }
            if (covered) continue;
            seen.add(par);
            const bad = kids.filter((k) => {
              const s = getComputedStyle(k); const c = rgba(s.backgroundColor);
              if (c[3] >= 0.85) return false;
              const glass = c[3] > 0.02;
              return band.__hbBand === "사진·무늬" ? true : glass;
            });
            if (bad.length >= 3) out.push({ y: Math.round(par.getBoundingClientRect().top + sy), n: bad.length, on: band.__hbBand });
          }
        }
        return out.slice(0, 4);
      }).catch(() => []) || [];
      // 주 메뉴: 숨은 하위 메뉴 판에 올려 보고 폭을 잰다
      try {
        const h = await p.evaluateHandle(() => {
          const head = document.querySelector("header") || document.body;
          const mg = document.querySelector("[data-hb-mega]"); if (mg) return mg; // 전체 펼침 판 공유 규약
          for (const e of head.querySelectorAll("ul, div")) {
            if (e.querySelectorAll("a").length < 2 || e.querySelectorAll("a").length > 80) continue;
            const s = getComputedStyle(e); const b = e.getBoundingClientRect();
            const hidden = s.display === "none" || s.visibility === "hidden" || parseFloat(s.opacity) < 0.05 || b.height < 2;
            if (hidden && e.parentElement && e.parentElement.querySelector(":scope > a, :scope > button")) return e;
          }
          return null;
        });
        const el = h.asElement();
        if (el) {
          const trig = await el.evaluateHandle((e) => e.hasAttribute("data-hb-mega") ? e.closest('[data-hb="menu"]').querySelector("[data-hb-menu] a, [data-hb-menu] button") : e.parentElement.querySelector(":scope > a, :scope > button"));
          await trig.asElement().hover({ timeout: 1500 }); await p.waitForTimeout(450);
          pc.menu_w = await el.evaluate((e) => { const s = getComputedStyle(e); const b = e.getBoundingClientRect(); if (s.display === "none" || s.visibility === "hidden" || b.height < 10) return null; let w = b.width; let q = e.parentElement; for (let i = 0; i < 4 && q; i++, q = q.parentElement) { const qs = getComputedStyle(q); if (qs.position === "absolute" || qs.position === "fixed") w = Math.max(w, q.getBoundingClientRect().width); } return Math.round(w / document.documentElement.clientWidth * 100); });
          await p.mouse.move(2, 900); await p.waitForTimeout(200);
        }
      } catch { /* 메뉴 측정 실패는 넘어간다 */ }
      if (/<(h1|h2|title)[^>]*>[^<]{0,20}(찾아오시는 길|오시는 길)/.test(html) && !/<iframe[^>]+google\.[a-z.]+\/maps/.test(html)) pc.map = false; // D28: 오픈스트리트맵은 게시 화면에서 막힌다(Access blocked) — 구글만
    }

    // 디자인(2026-10-03 사용자 지적): 한 색이 화면을 덮는지 · 지나치게 큰 글자 · 한 묶음 안 간격 · 서브 틀(본문 폭·옆 메뉴)이 다른 장과 같은지
    let design = null;
    if (width >= 1200) {
      await p.setViewportSize({ width, height: 1080 }); await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(150);
      design = await measureDesign(p, !!ref.sub);
      if (design) design.color = await colorShare(sharp, shot).catch(() => null);
    }
    // 화면 판정 보강(2026-10-13 내 시안 58건 점검 D1~D39): 바닥글 여백·빈 띠·꾸밈 부족·잘림·겹침 등
    const visual = width >= 1200 ? await measureVisual(p) : null;

    // 높이: 메인은 전체, 서브는 본문 구간
    const refH = ref.sub ? ref.sub.body_h : ref.height;
    // 레퍼런스 줄에 바닥(footer)이 없으면 레퍼런스 높이는 바닥을 뺀 값이다 → 시안도 바닥 윗변까지만 잰다
    // (2026-10-05 R3: 정상 바닥 317px 를 두면 +31% 치명, 바닥을 64px 로 줄여야 통과했다 — 판정이 빈약한 바닥을 강요했다)
    const refNoFoot = !ref.sub && Array.isArray(ref.rows) && ref.rows.length > 0 && !ref.rows.some((r) => (r.cells || []).some((c) => c.type === "footer"));
    const mockH = ref.sub ? m.body.to - m.body.from : refNoFoot ? Math.round(m.body.to) : m.height;
    const diffPct = refH > 0 ? Math.round(((mockH - refH) / refH) * 1000) / 10 : 0;

    let sim = null; let compare = null;
    if (refImage) {
      const meta = await sharp(refImage, { limitInputPixels: false }).metadata();
      const kRef = (meta.width ?? ref.width) / ref.width;
      const refBox = ref.sub ? { from: ref.sub.body_y_from, to: ref.sub.body_y_to, k: kRef } : { from: 0, to: Math.min(ref.height, (meta.height ?? 0) / kRef), k: kRef };
      const mockBox = ref.sub ? { from: m.body.from, to: m.body.to, k: 1 } : { from: 0, to: Math.min(refNoFoot ? m.body.to : m.height, 16000), k: 1 };
      sim = await similarity(sharp, refImage, refBox, shot, mockBox);
      compare = await sideBySide(sharp, refImage, shot);
    }

    // ---- 점수·고칠 목록
    const fixes = []; let score = 100; const hard = [];
    if (ref.copy_risk) { hard.push("한 사이트 배치를 통째로 따름"); score -= 30; fixes.push("이 ref_id 는 메인 화면 한 장이다 — 한 사이트를 통째로 따른 시안은 게시할 수 없다. get_replica_kit 을 다시 받아 reference.ref_id(mix1:… 로 시작)와 그 배치(여러 레퍼런스의 줄을 섞은 것)로 만든다."); }
    if (m.leaks.length) { hard.push("레퍼런스 기관 정보 노출"); score -= 30; fixes.push(`레퍼런스 기관 정보가 시안에 남아 있다: ${m.leaks.join(", ")} — persona 의 가상 값으로 바꾼다.`); }
    if (blockedNet.length) { score -= 10; fixes.push(`막힌 요청 ${blockedNet.length}개(내부 주소·허용 안 하는 방식): ${blockedNet.slice(0, 3).join(" | ")} — 공개 https 주소만 쓴다.`); }
    if (errors.length) { hard.push("스크립트 오류"); score -= 10; fixes.push(`스크립트 오류: ${errors.slice(0, 3).join(" | ")}`); }
    if (m.broken.length) { score -= Math.min(20, m.broken.length * 4); fixes.push(`안 뜨는 이미지 ${m.broken.length}개: ${m.broken.slice(0, 5).join(", ")} — samples 의 url 을 그대로 쓴다.`); }
    if (m.foreign.length) { score -= 10; fixes.push(`홈박스 밖 이미지 주소: ${m.foreign.join(", ")} — 사진은 samples 만 쓴다(레퍼런스 사이트 이미지·외부 이미지 금지).`); }
    const miss = m.rows.filter((r) => r.mock_cols < r.ref_cols);
    if (miss.length) { score -= Math.min(30, miss.length * 6); for (const r of miss.slice(0, 6)) fixes.push(`레퍼런스 ${r.row}번째 줄(y ${r.ref_y}~${r.ref_y + r.ref_h}, ${r.types.join("·")})은 ${r.ref_cols}칸인데 시안의 같은 자리(y ${r.mock_y}~${r.mock_y + r.mock_h})는 ${r.mock_cols}칸으로 보인다 — 칸을 빠뜨리거나 합치지 않았는지, 줄 위치가 밀리지 않았는지 확인한다.`); }
    if (m.frame.off.length) { hard.push("줄마다 본문 폭이 다름"); score -= Math.min(18, m.frame.off.length * 6); for (const o of m.frame.off.slice(0, 4)) fixes.push(`가로 틀 · y ${o.y} 줄의 내용(${o.who || "?"})이 x ${o.left}~${o.right} 인데 다른 줄은 x ${m.frame.left}~${m.frame.right} 이다 — 이 줄도 같은 왼쪽 선·같은 폭 안에 넣는다(배경 면만 화면 폭 가득, 내용은 본문 폭).`); }
    if (m.frame.gap_off.length) { score -= Math.min(12, m.frame.gap_off.length * 4); for (const o of m.frame.gap_off.slice(0, 4)) fixes.push(`칸 간격 · y ${o.y} 줄의 좌우 칸 사이가 ${o.gaps.join("·")}px 인데 다른 줄은 ${m.frame.gap}px 이다 — 칸 사이 간격을 한 값으로 맞춘다.`); }
    if (m.frame.touch.length) { score -= Math.min(15, m.frame.touch.length * 5); for (const o of m.frame.touch.slice(0, 4)) fixes.push(`세로 간격 · y ${o.y} 에서 위 줄 상자와 아래 줄 상자가 붙어 있다(간격 ${o.v}px) — sections 좌표대로 띄운다(그 줄 y − 위 줄 y+h). 화면 폭 가득 띠끼리 맞닿는 곳은 0이 정상이라 감점하지 않는다.`); }
    if (m.frame.row_off.length) { score -= Math.min(9, m.frame.row_off.length * 3); for (const o of m.frame.row_off.slice(0, 4)) fixes.push(`세로 간격 · y ${o.y} 위 간격이 ${o.v}px 인데 다른 줄 median 은 ${m.frame.row_gap}px 이다(±40px 넘게 벗어남) — sections 의 줄별 y 차이대로 맞춘다. 줄마다 간격이 다른 게 정상이다.`); }
    if (mob.overflow > 4) { hard.push("모바일 폭에서 가로 넘침"); score -= 12; fixes.push(`반응형 · 390 폭에서 문서 폭이 ${390 + mob.overflow}px 로 넘친다${mob.wide.length ? " (넓은 요소: " + mob.wide.join(", ") + ")" : ""} — @media 로 여러 칸 줄을 세로로 쌓고 고정 px 폭을 max-width 로 바꾼다.`); }
    else if (!mob.media) { score -= 8; fixes.push("반응형 · @media 규칙이 없다 — 768·480 이하에서 칸을 쌓고 글자·여백을 줄이는 규칙을 넣는다."); }
    if (pc.titles?.length) { score -= Math.min(15, pc.titles.length * 5); fixes.push(`섹션 제목 · ${pc.titles.map((t) => `"${t.text}"(${t.title || "제목"}, y ${t.y}, 아래 첫 내용 ${t.next || "?"} 까지 ${t.gap}px${t.band ? ", 제목과 내용의 배경색이 다름" : ""})`).join(", ")} — 제목은 자기 칸 안에서 내용 바로 위(16~32px)에 둔다. 제목들만 모아 따로 띠를 만들지 않는다. 카드·슬라이드 안 제목이면 li·article·[class*=card] 안에 두면 판정에서 빠진다.`); }
    { const hv = (html.match(/:hover[^{]*{[^}]*(transform|box-shadow|flex|width|max-height)/g) || []).length; if (hv < 3) { score -= 5; fixes.push(`움직임 · 호버 때 움직이는 요소가 ${hv}곳뿐이다 — 카드 떠오름+그림자, 사진 확대, 밑줄 선 그어짐, 아이콘 회전 등(절차 7-8)을 넣는다.`); } if (hv && !/prefers-reduced-motion/.test(html)) { score -= 2; fixes.push("움직임 · @media (prefers-reduced-motion: reduce) 에서 transition·animation 을 끄는 규칙이 없다."); } }
    if (pc.vw) { score -= 6; fixes.push("가로 스크롤 · CSS 에 100vw 가 있다 — 100vw 는 세로 스크롤바 폭을 포함해 실제 화면보다 넓다. width:100% 나 부모 기준 % 로 바꾼다."); }
    if (pc.over.length) { hard.push("PC 폭에서 가로 스크롤"); score -= 12; fixes.push(`가로 스크롤 · ${pc.over.map((o) => `${o.w} 폭에서 ${o.over}px`).join(", ")} 넘친다 — 고정 1920px·100vw 를 width:100%·max-width 로 바꾸고, 화면 밖 장식은 overflow:hidden.`); }
    if (pc.blanks.length) { score -= Math.min(16, pc.blanks.length * 8); for (const o of pc.blanks.slice(0, 4)) fixes.push(`빈칸 · ${o.where} y ${o.y} 아래로 ${o.h}px 가 비어 있다 — min-height·고정 높이·큰 여백을 걷어 낸다. 서브 페이지 높이는 내용이 정한다(레퍼런스 높이에 맞추려고 늘리지 않는다 — 서브는 본문이 레퍼런스보다 15% 넘게 길 때만 높이를 감점하고 data-qa-gap 도 인정하지 않는다). 메인에서 레퍼런스에도 있는 여백만 그 칸에 data-qa-gap.`); }
    if (pc.buried?.length) { score -= Math.min(12, pc.buried.length * 4); for (const o of pc.buried) fixes.push(`묻힘 · y ${o.y} 의 나란한 칸 ${o.n}개가 ${o.on} 위에 불투명한 면 없이 놓여 있다 — 칸마다 불투명한 면(흰색이나 어두운 단색, 투명도 0.85 이상)을 깔거나 띠 배경을 단색으로 바꾼다.`); }
    if (pc.menu_w !== null && pc.menu_w < 60) { score -= 8; fixes.push(`주 메뉴 · 하위 메뉴가 화면 폭의 ${pc.menu_w}% 인 작은 상자로 열린다 — 머리 아래 화면 폭 가득한 판에 모든 하위 메뉴를 열로 펼친다(개별 드롭다운 금지).`); }
    if (ref.sub && !pc.subvisual) { score -= 8; fixes.push("서브 비주얼 · 머리 아래에 폭 가득한 띠(색 면이나 사진 + 페이지 이름 + 경로)가 없다 — 모든 서브 페이지가 같은 윗부분을 쓴다."); }
    if (!pc.map) { score -= 10; fixes.push("지도 · 찾아오시는 길에 구글 지도 iframe 이 없다 — 일러스트 대신 <iframe src=\"https://www.google.com/maps?q=36.3504,127.3845&z=15&output=embed\"> 를 본문 폭 가득 넣는다."); }
    if (mob.cut > 0) { score -= Math.min(8, mob.cut * 2); fixes.push(`반응형 · 390 폭에서 글 ${mob.cut}곳이 칸 밖으로 잘린다(${(mob.cutw || []).join(", ")}) — 모바일에선 줄을 1열로 쌓고 옆 메뉴·탭은 가로 스크롤로, 고정 폭을 풀어 준다.`); }
    if (mob.headH > 422) { score -= 4; fixes.push(`반응형 · 390 폭에서 머리가 ${mob.headH}px 로 첫 화면 절반을 넘는다 — 모바일 머리는 로고·전체메뉴 단추만 남긴다.`); }
    if (mob.tiny > 3) { score -= 4; fixes.push(`반응형 · 390 폭에서 13px 미만 글자가 ${mob.tiny}곳 — 모바일 글자를 13px 이상으로.`); }
    if (m.spill.length) { score -= Math.min(20, m.spill.length * 10); for (const o of m.spill) fixes.push(`덮임 · y ${o.y} 의 상자(${o.cls}, 높이 ${o.h})가 부모 밖으로 ${o.over}px 삐져나와 다른 구역을 덮는다 — 클래스 이름이 다른 규칙과 겹치지 않는지 본다.`); }
    { const df = designFixes(design, { sub: !!ref.sub, peers, frame: m.frame, width }); score -= df.minus; hard.push(...df.hard); fixes.push(...df.fixes); }
    { const vf = visualFixes(visual, { sub: !!ref.sub, peers }); score -= vf.minus; hard.push(...vf.hard); fixes.push(...vf.fixes); }
    if (!ref.sub && Math.abs(diffPct) > 6) hard.push("높이 차 6% 초과(배치를 따르지 않음)");
    if (ref.sub ? diffPct > 15 : Math.abs(diffPct) > 2) { score -=Math.min(25, Math.round((Math.abs(diffPct) - 2) * 1.5)); fixes.push(`${ref.sub ? "본문 구간" : "전체"} 높이가 레퍼런스 ${refH}px 대비 ${mockH}px (${diffPct > 0 ? "+" : ""}${diffPct}%) — ${diffPct > 0 ? "여백·글이 너무 길거나 칸이 세로로 늘어났다" : "빠진 줄이 있거나 칸이 납작하다"}. 2% 이내로 맞춘다 — 높이는 각 줄의 칸 높이(sections 의 h)와 줄별 y 간격 그대로로 맞춘다(mix 면 줄별 실측 간격으로 다시 계산한 값이다). 줄 사이를 한 값으로 통일하거나 빈 상자·min-height 로 채우지 않는다(빈칸은 따로 감점).`); }
    if (!ref.sub && diffPct < -2 && pc.blanks.length) fixes.push("높이·빈칸 같이 걸림 · 높이를 맞추려 여백을 늘린 것으로 보인다 — 여백을 원래대로 줄이고, 레퍼런스보다 납작한 칸(사진·카드·목록 줄 수)을 sections 의 h 만큼 키운다.");
    if (g.fails.length) { score -= Math.min(35, g.fails.length * 5); for (const f of g.fails.slice(0, 10)) fixes.push(`게이트 · ${f}`); }
    if (lay.fails.length) { score -= Math.min(30, lay.fails.length * 4); for (const f of lay.fails.slice(0, 12)) fixes.push(`구성 · ${f}`); }
    if (dev.length) { score -= Math.min(16, dev.length * 3); for (const f of dev.slice(0, 8)) fixes.push(`반응형 · ${f}`); }
    if (beh.fails.length) { score -= Math.min(30, beh.fails.length * 5); for (const f of beh.fails.slice(0, 10)) fixes.push(`동작 · ${f}`); }
    if (beh.hard?.length) { score -= Math.min(10, beh.hard.length * 5); for (const h of beh.hard.slice(0, 5)) { hard.push(`주 메뉴 · ${h}`); fixes.push(`동작 · ${h} — 펼친 판에 z-index 를 주고 머리 띠 위로 올린다.`); } }
    { const cf = contrastFixes(overBad); score -= cf.minus; hard.push(...cf.hard); fixes.push(...cf.fixes); }
    { const nf = nameFixes(names, { want, sub: !!ref.sub, pageType: ref.page_type }); score -= nf.minus; hard.push(...nf.hard); fixes.push(...nf.fixes); }
    if (!hasHb && !ownOk) { score -= 10; fixes.push("동작 규약(data-hb)이 없다 — get_behavior_kit 의 script 를 넣고 캐러셀·탭·메뉴·레이어·검색에 data-hb 속성을 붙인다."); }
    if (sim && sim.sim < 70) { score -= Math.min(15, Math.round((70 - sim.sim) / 2)); }
    // 밝기 구간은 감점이 있을 때(유사도 70 미만)만 고칠 목록에 — 그 밖엔 참고(notes). 참고 이미지가 없는 섞기 조각·서브 비주얼 차이로 고칠 방법이 없는 경고가 남던 것(2026-10-03 시험)
    const notes = [];
    // 서브는 sub_shell(서브 비주얼 띠·왼쪽 흰 메뉴)을 쓰라고 지시하므로 레퍼런스와 밝기 구성이 다른 게 정상이다 — 감점이 없으면 메모도 내지 않는다(2026-10-05 R3·R4·R5·R6: 100점에도 계속 떠 혼란)
    if (sim && !(ref.sub && sim.sim >= 70)) for (const [a, b] of sim.bands.slice(0, 4)) (sim.sim < 70 ? fixes : notes).push(`밝기 구성이 크게 다른 구간: ${ref.sub ? "본문" : "화면"} ${Math.round(a * 100)}~${Math.round(b * 100)}% 지점 — 어두운 띠·사진 면·흰 면의 위치가 레퍼런스와 다르다(나란히 이미지 확인).`);
    score = Math.max(0, Math.min(100, score));
    // D11: 같은 종류 고칠 점이 3개 넘게 몰리면 통과시키지 않는다(84점 상한)
    { const many = capByKinds(fixes); if (many.length && score > 84) { score = 84; notes.push(`같은 종류 고칠 점이 3개 이상(${many.join(", ")}) — 고치기 전엔 통과하지 않는다.`); } }
    const pass = score >= 85 && hard.length === 0;
    // 갤러리 썸네일(2026-10-03): 판정에 쓴 전체 캡처의 첫 화면을 잘라 720 폭 JPEG — 렌더를 한 번 더 하지 않는다
    const thumb = await sharp(shot, { limitInputPixels: false }).extract({ left: 0, top: 0, width, height: Math.min(Math.min(m.height, 16000), width < 800 ? Math.round(width * 1.6) : Math.round(width * 0.625)) }).resize({ width: width < 800 ? 360 : 720 }).jpeg({ quality: 78 }).toBuffer().catch(() => null);
    return {
      thumb,
      result: {
        pass, score, hard_fails: hard,
        summary: pass ? "통과 — publish_mockup(token) 으로 게시해 주소를 사용자에게 준다." : `미통과(${score}점) — fixes 를 위에서부터 고치고 check_mockup(ref_id, token, edits) 로 고친 부분만 보내 다시 판정한다. 85점 이상·치명 항목 0 이 통과다.`,
        sources: ref.sources ?? 1,
        height: { reference: refH, mockup: mockH, diff_pct: diffPct, scope: ref.sub ? "본문 구간(머리·바닥 제외)" : refNoFoot ? "전체(바닥 제외 — 레퍼런스에 바닥 줄 없음)" : "전체" },
        rows: m.rows, frame: m.frame, mobile: mob, pc, design, visual, similarity: sim ? sim.sim : null,
        behavior: beh.stats, images: { total: m.images, broken: m.broken, foreign: m.foreign },
        fixes,
        notes,
      },
      compare,
    };
  } finally {
    await ctx.close().catch(() => {});
    releaseLater();
  }
}

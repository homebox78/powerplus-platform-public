// 와이어 일치 판정 (2026-10-18 powerMock 와이어 고도화 2단계) — 시안이 사용자 와이어(줄 순서·칸 수·칸 폭·칸 종류)를 따랐는가.
// 사용자: "제작된 와이어프레임 기획이 실제 이미지(시안) 제작 시 반영될 수 있게 — 가끔 와이어와 전혀 상관없는 시안이 나온다."
// 와이어로 만든 시안은 레퍼런스 줄과 다른 게 정상이라, 줄·칸 대조 기준을 레퍼런스에서 와이어로 바꾼다(check.mjs).
// 시안은 본문 줄에 data-wire-row="줄 번호", 칸에 data-wire-cell="칸 종류" 를 단다(재현 묶음 reference.wire.markup).
// measureWire 는 브라우저 안에서 표시를 읽고, wireMatch 는 순수 함수라 브라우저 없이 시험한다(packages/mcp/test/wire-match.test.mjs).

/** 칸 종류마다 내용이 그 종류다운지 보는 최소 조건 — 표시만 달고 내용은 딴것인 시안을 거른다 */
export const KIND_PROBE = {
  visual: ["main_visual", "hero", "sub_visual", "photo_gallery", "tour_cards", "sns_video", "banner_zone", "popup_zone", "greeting_vision"],
  list: ["news_tabs", "news_ticker", "board_list", "notice_box", "faq_list", "timeline", "info_table", "sitemap"],
  links: ["quick_links", "floating_quick", "content_tabs"],
  input: ["main_search", "form"],
  map: ["location_map"],
};

/** 렌더된 시안에서 와이어 표시를 읽는다(page.evaluate 안). 줄마다 위치·칸마다 위치와 내용 신호 */
export async function measureWire(p) {
  return p.evaluate(() => {
    const vis = (el) => { const s = getComputedStyle(el); const b = el.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && b.width > 0 && b.height > 0; };
    const box = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top + scrollY), w: Math.round(b.width), h: Math.round(b.height) }; };
    const sig = (el) => ({
      img: el.querySelectorAll("img, video, picture, svg image").length + [el, ...el.querySelectorAll("*")].filter((e) => /url\(/.test(getComputedStyle(e).backgroundImage)).length,
      links: el.querySelectorAll("a[href], button").length,
      items: el.querySelectorAll("li, tr, article, dt").length,
      inputs: el.querySelectorAll("input:not([type=hidden]), textarea, select").length,
      iframe: el.querySelectorAll("iframe").length,
      text: (el.innerText || "").trim().length,
    });
    const rows = [];
    for (const el of document.querySelectorAll("[data-wire-row]")) {
      if (!vis(el)) continue;
      const no = parseInt(el.getAttribute("data-wire-row") || "", 10);
      if (!Number.isFinite(no)) continue;
      // 이 줄의 칸 = 가장 가까운 줄 조상이 이 줄인 칸(줄 요소 자신이 칸이어도 된다)
      const cells = [...(el.hasAttribute("data-wire-cell") ? [el] : []), ...el.querySelectorAll("[data-wire-cell]")]
        .filter((c) => vis(c) && (c === el || c.parentElement.closest("[data-wire-row]") === el))
        .map((c) => ({ k: String(c.getAttribute("data-wire-cell") || "").trim(), ...box(c), sig: sig(c) }));
      rows.push({ no, ...box(el), cells });
    }
    return { rows, marks: document.querySelectorAll("[data-wire-row], [data-wire-cell]").length };
  });
}

const famOf = (k) => Object.entries(KIND_PROBE).find(([, ks]) => ks.includes(k))?.[0] ?? null;

/** 칸 내용이 그 종류다운가 — 모르는 종류는 통과 */
export function probeOk(k, s) {
  if (!s) return true;
  switch (famOf(k)) {
    case "visual": return s.img >= 1;
    case "list": return s.items >= 2 || s.links >= 3;
    case "links": return s.links >= 3 || s.items >= 3;
    case "input": return s.inputs >= 1;
    case "map": return s.iframe >= 1 || s.img >= 1;
    default: return s.text > 0 || s.img > 0;
  }
}

/**
 * 와이어와 대조 — 본문(zone=body) 줄만 본다(머리·바닥은 kit·메인 시안이 정한다).
 * @param {{rows: Array<{no:number,x:number,y:number,w:number,h:number,cells:Array<{k:string,x:number,y:number,w:number,h:number,sig?:object}>}>, marks?: number}} meas measureWire 결과
 * @param {{screen?: string, rows: Array<{no?: number, zone?: string, cols: Array<{k: string, span: number}>}>}} wire
 * @param {{mobile?: boolean, tol?: number}} [opt]
 * @returns {{score:number, pass:boolean, expected:number, found:number, order_ok:boolean, rows:Array<object>, fixes:string[], hard:string[]}}
 */
export function wireMatch(meas, wire, opt = {}) {
  const tol = opt.tol ?? 0.08;
  const exp = (wire?.rows ?? []).map((r, i) => ({ no: Number(r.no ?? i + 1), zone: r.zone ?? "body", cols: (r.cols ?? []).filter((c) => c && c.k && c.k !== "lnb") }))
    .filter((r) => r.zone === "body" && r.cols.length);
  const got = new Map();
  for (const r of meas?.rows ?? []) { if (!got.has(r.no)) got.set(r.no, r); } // 같은 번호가 여럿이면 첫 줄
  const out = []; const fixes = []; let sum = 0;
  for (const e of exp) {
    const g = got.get(e.no);
    const want = e.cols.map((c) => `${c.k} ${c.span}`).join(" + ");
    if (!g) {
      out.push({ no: e.no, expected: want, got: null, ok: false, score: 0, issues: ["줄 없음(data-wire-row 표시가 없거나 숨김)"] });
      continue;
    }
    const cells = [...g.cells].sort((a, b) => (opt.mobile ? a.y - b.y : a.x - b.x) || a.y - b.y);
    const issues = []; let s = 0.4; // 줄이 있으면 40%
    // 칸 수
    const nOk = cells.length === e.cols.length;
    if (nOk) s += 0.25; else issues.push(`칸 ${e.cols.length}개여야 하는데 ${cells.length}개`);
    // 칸 종류(순서 무관 다중 집합) — 순서는 폭 대조에서 같이 본다
    const wk = e.cols.map((c) => c.k).sort().join(","), gk = cells.map((c) => c.k).sort().join(",");
    const kOk = wk === gk;
    if (kOk) s += 0.2; else issues.push(`칸 종류가 ${e.cols.map((c) => c.k).join("·")} 여야 하는데 ${cells.map((c) => c.k || "?").join("·") || "없음"}`);
    // 칸 폭 비율(PC) — 와이어 순서대로 짝지어 span 비율과 렌더 폭 비율을 견준다. 모바일은 쌓이므로 보지 않는다
    let wOk = true;
    if (!opt.mobile && nOk) {
      const ordered = e.cols.map((c) => c.k).join(",") === cells.map((c) => c.k).join(",");
      if (!ordered && kOk) { wOk = false; issues.push(`칸 순서가 ${e.cols.map((c) => c.k).join("→")} 여야 하는데 ${cells.map((c) => c.k).join("→")}`); }
      const sw = cells.reduce((a, c) => a + c.w, 0) || 1, ss = e.cols.reduce((a, c) => a + c.span, 0) || 1;
      const dev = Math.max(...e.cols.map((c, j) => Math.abs((cells[j]?.w ?? 0) / sw - c.span / ss)));
      if (dev > tol) { wOk = false; issues.push(`칸 폭 비율이 ${e.cols.map((c) => c.span).join(":")} 여야 하는데 ${cells.map((c) => Math.round((c.w / sw) * 12)).join(":")}(12칸 환산)`); }
      // 한 줄의 칸은 가로로 나란해야 한다(세로로 쌓으면 다른 줄)
      if (cells.length > 1 && cells.some((c, j) => j > 0 && Math.min(c.y + c.h, cells[j - 1].y + cells[j - 1].h) - Math.max(c.y, cells[j - 1].y) < Math.min(c.h, cells[j - 1].h) * 0.3)) {
        wOk = false; issues.push("칸들이 가로로 나란하지 않다(PC 에서 세로로 쌓임)");
      }
    }
    if (wOk) s += 0.15;
    // 내용이 그 종류다운가 — 표시만 단 시안을 거른다(감점 10%p, 줄 실패는 아님)
    const bad = cells.filter((c) => !probeOk(c.k, c.sig)).map((c) => c.k);
    if (bad.length) { s -= 0.1; issues.push(`표시는 ${bad.join("·")} 인데 내용이 그 종류로 보이지 않는다(사진·목록·링크·입력칸)`); }
    s = Math.max(0, Math.min(1, s));
    out.push({ no: e.no, expected: want, got: cells.map((c) => `${c.k || "?"} ${Math.round((c.w / (cells.reduce((a, q) => a + q.w, 0) || 1)) * 12)}`).join(" + "), y: g.y, ok: s >= 0.85 && !issues.some((x) => !x.startsWith("표시는")), score: Math.round(s * 100), issues });
    sum += s;
  }
  // 줄 순서 — 찾은 줄의 y 가 와이어 순서대로 커지는가(뒤바뀐 쌍 수)
  const ys = out.filter((r) => r.y != null).map((r) => r.y);
  let inv = 0; for (let i = 0; i < ys.length; i++) for (let j = i + 1; j < ys.length; j++) if (ys[i] > ys[j]) inv++;
  // 번호는 차례대로 달았는데 내용이 다른 줄 것인 경우 — 칸 종류가 다른 와이어 줄과 똑같으면 순서가 바뀐 것으로 본다
  // (2026-10-18 w10 음성 대조: 4~7줄 내용을 뒤섞고 번호만 1·2·3 차례로 달자 order_ok=true, 안내는 '칸 종류 불일치'뿐이었다)
  const kindsOf = (cols) => cols.map((c) => c.k).sort().join(",");
  const moved = [];
  for (const e of exp) {
    const g = got.get(e.no); if (!g || !g.cells.length) continue;
    const gk = kindsOf(g.cells); if (gk === kindsOf(e.cols)) continue;
    const other = exp.find((o) => o.no !== e.no && kindsOf(o.cols) === gk);
    if (other) moved.push(`${e.no}번 줄 자리에 ${other.no}번 줄(${other.cols.map((c) => c.k).join("·")}) 내용`);
  }
  const orderOk = inv === 0 && !moved.length;
  // 와이어에 있는 줄 번호면 구역(top·bottom 의 경로·쪽 제목·만족도 등)과 상관없이 '없는 줄'이 아니다(w07·w08: 그 줄에 번호를 달자 지우라는 안내)
  const allNo = new Set((wire?.rows ?? []).map((r, i) => Number(r.no ?? i + 1)));
  const extra = [...got.keys()].filter((no) => !allNo.has(no));
  let score = exp.length ? Math.round((sum / exp.length) * 100) : 0;
  if (!orderOk) score = Math.max(0, score - Math.min(40, (inv + moved.length) * 10));
  const missing = out.filter((r) => r.got === null);
  const hard = [];
  if (!exp.length) hard.push("와이어에 본문 줄이 없음");
  else if (!(meas?.marks > 0)) hard.push("와이어 표시(data-wire-row·data-wire-cell) 없음 — 와이어를 따르지 않음");
  else if (missing.length > exp.length / 2) hard.push("와이어 본문 줄 절반 넘게 없음");
  if (!orderOk) hard.push("와이어 줄 순서와 다름");
  // 통과 = 본문 줄 하나하나가 다 맞을 때 — 평균 점수만 보면 칸 폭·좌우 순서가 틀린 줄 하나가 95점으로 묻혔다(음성 대조 시험에서 잡음)
  const pass = exp.length > 0 && score >= 80 && !hard.length && missing.length === 0 && out.every((r) => r.ok);
  if (!(meas?.marks > 0)) fixes.push("와이어 일치 · 본문 줄마다 data-wire-row=\"줄 번호\", 칸마다 data-wire-cell=\"칸 종류\" 를 단다(reference.wire.markup). 표시가 없으면 와이어와 대조할 수 없어 와이어를 따르지 않은 것으로 본다.");
  for (const r of out.filter((x) => !x.ok).slice(0, 8)) fixes.push(`와이어 일치 · ${r.no}번 줄(${r.expected}) — ${r.issues.join(" / ")}`);
  if (!orderOk) fixes.push(`와이어 일치 · 줄 순서가 와이어와 다르다(${[inv ? `뒤바뀐 쌍 ${inv}` : "", ...moved.slice(0, 4)].filter(Boolean).join(" / ")}) — wire.rows 순서대로 위에서 아래로 쌓고, 줄 번호는 그 줄 내용의 wire.rows[].no 를 단다.`);
  if (extra.length) fixes.push(`와이어 일치 · 와이어에 없는 줄 번호 ${extra.slice(0, 6).join("·")} 에 표시가 있다 — 번호는 wire.rows[].no 를 그대로 쓴다.`);
  return { score, pass, expected: exp.length, found: exp.length - missing.length, order_ok: orderOk, rows: out, fixes, hard };
}

/**
 * 와이어 도식 SVG — 판정의 '나란히' 왼쪽(와이어 묶음엔 레퍼런스 캡처가 없어 비교 이미지가 빠졌다, 2026-10-18 시험 4건).
 * 본문 줄은 시안에서 찾은 같은 번호 줄의 y·높이에 맞춰 그려 오른쪽 시안과 나란히 읽힌다. 못 찾은 줄은 빨간 점선으로 아래에 쌓는다.
 * 글자는 칸 종류 id(영문)만 — 서버 글꼴에 한글이 없어도 깨지지 않게.
 */
export function wireSchematicSvg(meas, wire, { width = 1920, height = 2000, match = null } = {}) {
  const got = new Map((meas?.rows ?? []).map((r) => [r.no, r]));
  const okBy = new Map((match?.rows ?? []).map((r) => [r.no, r.ok]));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const parts = []; let tail = Math.max(0, ...[...got.values()].map((r) => r.y + r.h)) + 40;
  (wire?.rows ?? []).forEach((r, i) => {
    const no = Number(r.no ?? i + 1); if ((r.zone ?? "body") !== "body") return;
    const cols = (r.cols ?? []).filter((c) => c && c.k && c.k !== "lnb"); if (!cols.length) return;
    const g = got.get(no);
    const x0 = g ? g.x : Math.round(width * 0.135), w0 = g ? g.w : Math.round(width * 0.73);
    const y = g ? g.y : tail, h = g ? Math.max(60, g.h) : 120; if (!g) tail += h + 24;
    const tot = cols.reduce((a, c) => a + c.span, 0) || 12; const gap = 16; let x = x0;
    const bad = !g || okBy.get(no) === false;
    cols.forEach((c) => {
      const cw = Math.max(20, Math.round(((w0 - gap * (cols.length - 1)) * c.span) / tot));
      parts.push(`<rect x="${x}" y="${y}" width="${cw}" height="${h}" fill="${bad ? "#fdecec" : "#eef1f5"}" stroke="${bad ? "#d33" : "#8a94a6"}" stroke-width="4"${g ? "" : ' stroke-dasharray="16 10"'}/>`,
        `<text x="${x + 20}" y="${y + 52}" font-family="sans-serif" font-size="40" fill="${bad ? "#b00" : "#3b4352"}">${esc(`${no}. ${c.k} ${c.span}`)}</text>`);
      x += cw + gap;
    });
  });
  const H = Math.max(height, tail);
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${H}" viewBox="0 0 ${width} ${H}"><rect width="100%" height="100%" fill="#fff"/>${parts.join("")}</svg>`, height: H };
}

/** 와이어 묶음의 판정 기준 줄 — 시안의 표시 줄을 레퍼런스 줄처럼 넘겨 가로 틀·간격 검사(measure)가 시안 자신의 줄로 돌게 한다 */
export function wireRefRows(meas, wire) {
  const kinds = new Map((wire?.rows ?? []).map((r, i) => [Number(r.no ?? i + 1), r]));
  return (meas?.rows ?? []).filter((r) => (kinds.get(r.no)?.zone ?? "body") === "body").sort((a, b) => a.y - b.y)
    .map((r, i, arr) => ({ y: r.y, h: r.h, gap_above: i ? Math.max(0, r.y - (arr[i - 1].y + arr[i - 1].h)) : 0, content_x: r.x, content_w: r.w, full_bleed: false,
      cells: r.cells.length ? r.cells.map((c, j) => ({ no: j + 1, type: c.k || "unknown", x: c.x, y: c.y, w: c.w, h: c.h })) : [{ no: 1, type: "unknown", x: r.x, y: r.y, w: r.w, h: r.h }] }));
}

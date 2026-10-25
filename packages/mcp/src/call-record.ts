// powerMCP 호출 기록 — 도구 응답 하나를 powerPlus 보고서(/r/{id}, kind=call) 칸으로 바꾼다.
// 사용자 2026-10-25 "모든 mcp 로 호출한 건 url 을 제공해서 파워플러스를 통해서 볼 수 있게" (MC-122).
// 응답 JSON 을 훑어 그림(thumb_url 등)·주소(…_url·…_link)를 모으고, 원본 JSON 은 줄여서 접는 칸에 싣는다.
// 그림은 서버(api/routes/reports.php)가 이 사이트 주소만 남긴다.

export type CallBlock =
  | { type: "images"; heading: string; items: Array<{ url: string; caption: string; link?: string }> }
  | { type: "links"; heading: string; items: Array<{ label: string; url: string }> }
  | { type: "list"; heading: string; items: string[] }
  | { type: "json"; heading: string; body: string };

/** 따로 주소를 이미 주는 도구 — 기록을 두 번 만들지 않는다 */
export const CALL_RECORD_SKIP = new Set(["powerplus_publish_report", "mock_publish_mockup"]);

const IMG_KEYS = ["thumb_url", "thumb", "preview_image", "image_url", "crop_url", "public_url"];
const LINK_KEY = /(^url$|_url$|_link$|^link$|^href$)/;
const isUrl = (v: unknown): v is string => typeof v === "string" && v.length < 600 && /^(https?:\/\/|\/(?!\/))\S+$/.test(v);
const nameOf = (o: Record<string, unknown>) => {
  for (const k of ["alt", "name", "title", "label", "caption", "id"]) { const v = o[k]; if (typeof v === "string" && v.trim()) return v.trim().slice(0, 120); }
  return "";
};

/** 응답 JSON → 보고서 칸. 그림 60개·주소 30개까지 */
export function buildCallBlocks(args: Record<string, unknown>, data: unknown): CallBlock[] {
  const images: Array<{ url: string; caption: string; link?: string }> = [];
  const links: Array<{ label: string; url: string }> = [];
  const seenImg = new Set<string>(); const seenLink = new Set<string>();
  const walk = (v: unknown, path: string, depth: number) => {
    if (depth > 6 || v === null || typeof v !== "object") return;
    if (Array.isArray(v)) { v.slice(0, 80).forEach((x, i) => walk(x, `${path}[${i}]`, depth + 1)); return; }
    const o = v as Record<string, unknown>;
    const imgKey = IMG_KEYS.find((k) => isUrl(o[k]));
    const used = new Set<string>();
    if (imgKey && images.length < 60) {
      const u = o[imgKey] as string;
      if (!seenImg.has(u)) {
        seenImg.add(u);
        const link = ["preview_url", "url", "page_url", "detail_url"].map((k) => o[k]).find((x) => isUrl(x) && x !== u) as string | undefined;
        images.push({ url: u, caption: nameOf(o), ...(link ? { link } : {}) });
        if (link) used.add(link);
      }
      used.add(u);
    }
    for (const [k, x] of Object.entries(o)) {
      if (LINK_KEY.test(k) && isUrl(x) && !used.has(x) && !seenImg.has(x) && !seenLink.has(x) && links.length < 30) {
        seenLink.add(x);
        const who = nameOf(o);
        links.push({ label: who ? `${who} · ${k}` : `${path ? path + "." : ""}${k}`, url: x });
      } else if (x && typeof x === "object") walk(x, path ? `${path}.${k}` : k, depth + 1);
    }
  };
  walk(data, "", 0);
  const blocks: CallBlock[] = [];
  const argLines = Object.entries(args).filter(([, x]) => x !== undefined && x !== null && x !== "").map(([k, x]) => `${k}: ${(typeof x === "string" ? x : Array.isArray(x) && x.every((y) => typeof y !== "object") ? x.join(", ") : JSON.stringify(x)).slice(0, 280)}`);
  if (argLines.length) blocks.push({ type: "list", heading: "보낸 인자", items: argLines.slice(0, 30) });
  if (images.length) blocks.push({ type: "images", heading: "그림", items: images });
  if (links.length) blocks.push({ type: "links", heading: "주소", items: links });
  blocks.push({ type: "json", heading: "원본 응답", body: shrinkJson(data) });
  return blocks;
}

/** 원본 JSON 을 60KB 안으로 — 긴 글(HTML·base64)은 길이만, 긴 배열은 앞 40개 */
export function shrinkJson(data: unknown, max = 60_000): string {
  const cut = (v: unknown, d: number): unknown => {
    if (typeof v === "string") return v.length > 1500 ? `[글 ${v.length.toLocaleString()}자 생략] ${v.slice(0, 200)}…` : v;
    if (Array.isArray(v)) { const a = v.slice(0, 40).map((x) => cut(x, d + 1)); if (v.length > 40) a.push(`… ${v.length - 40}개 더`); return a; }
    if (v && typeof v === "object") { if (d > 8) return "{…}"; return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, cut(x, d + 1)])); }
    return v;
  };
  const s = JSON.stringify(cut(data, 0), null, 2) ?? "";
  return s.length > max ? s.slice(0, max) + "\n… (잘림)" : s;
}

/**
 * 응답 JSON 의 주소를 전부 내 powerPlus 절대 주소로(사용자 2026-10-25 "mcp 로 제공되는 건 모두 파워플러스 솔리데오 url 미리보기").
 * 상대 주소(/mockref/api/files/…, /api/v1/…, /mock/plan?…)는 origin 을 붙이고, powerPlus 에 없는 옛 홈박스 화면(/sites/…·/screens/…)은 뺀다
 * — 눌러도 404 다. 바꾼 개수를 돌려준다. 키 이름이 주소 칸(url·…_url·…_link·link·href·thumb)인 문자열만 건드린다(HTML 본문 등은 그대로).
 */
const LEGACY_PAGE = /^\/(sites|screens|sections|orgs|vendors)\//;
export function absolutizeUrls(data: unknown, origin: string): number {
  let n = 0;
  const walk = (v: unknown, depth: number) => {
    if (depth > 12 || v === null || typeof v !== "object") return;
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    const o = v as Record<string, unknown>;
    for (const [k, x] of Object.entries(o)) {
      if (typeof x === "string" && (LINK_KEY.test(k) || k === "thumb") && x.startsWith("/") && !x.startsWith("//")) {
        if (LEGACY_PAGE.test(x)) { delete o[k]; n++; continue; }
        o[k] = origin + x; n++;
      } else if (x && typeof x === "object") walk(x, depth + 1);
    }
  };
  walk(data, 0);
  return n;
}

/** 도구 이름 → 보고서 module */
export const moduleOf = (tool: string) => {
  const p = tool.split("_")[0] ?? "";
  return ["assets", "mock", "deck", "guide"].includes(p) ? p : "all";
};

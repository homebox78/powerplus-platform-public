// powerMCP — powerPlus 플랫폼 MCP 하나(기획 §10: REST /api/v1 하나 + MCP /mcp 하나 + 키 하나).
// 출처: homebox-handoff packages/mcp/src/index.ts(홈박스 MCP 0.18.0, 도구 22종) + powerPlus server/src/McpServer.php(자산 도구 7종) 를 가져와 합쳤다.
//
// Streamable HTTP(세션리스) :3110 `/mcp`, 헬스 `GET /mcp/health`. 운영: Apache `ProxyPass /mcp → 127.0.0.1:3110/mcp` (scripts/platform-mcp.conf).
//
// 키: `pp_live_…`(core_api_keys). MCP 는 키를 직접 조회하지 않는다 — 받은 키를 그대로 Bearer 로 새 플랫폼 PHP 에 넘기고,
//   PHP 인증 미들웨어(Core\Auth → Keys::actorFor)가 키 소유자 Actor 로 판단한다. 도구 호출마다 `POST /api/v1/keys/verify`
//   (scope·일 한도·core_api_usage 집계)를 먼저 부른다. 서버 간 비밀(관리자 토큰)이 필요 없다.
//
// 백엔드 세 갈래:
//   ① 새 플랫폼 PHP(PP_API)      — 키 검증, assets_*, 시안 보관·판정 기록·게시(mock_check_mockup 의 보관 부분·mock_publish_mockup), deck_jobs
//   ② 옛 홈박스 PHP(LEGACY_HOMEBOX_API) — 레퍼런스·재현 묶음·조립·판정 근거(ReplicaKit·Assembly·Samples 아직 미이식). 서비스 키 LEGACY_HOMEBOX_KEY(Pro)로 전달
//   ③ 로컬 파일 — guide_tokens(apps/web/public/guide-files)
//
// 도구 이름은 모듈 접두(assets_·mock_·deck_·guide_). 옛 이름(get_replica_kit·search_assets…)은 별칭으로 계속 받는다(tools/call 이름을 바꿔 넘김).
//
//   개발: PP_API=http://127.0.0.1:8090/api/v1 LEGACY_HOMEBOX_API=https://powerplus.hom2box.com/mockref/api LEGACY_HOMEBOX_KEY=hb_live_… MCP_PORT=3110 MCP_BROWSER=firefox pnpm --filter @pp/mcp dev
//
// 목차(구역 머리 주석 `// ---- [구역]` 으로 찾는다):
//   [공통]      설정·별칭·백엔드 호출(api·pp)·응답 모양(text·err)·참고 이미지·키 검증·INSTRUCTIONS
//   [공통]      buildServer — 인자 별칭·ignored_args·한국어 INVALID_ARGS·meta.quota·structuredContent 를 모든 도구에 씌우는 registerTool 감싸기, guard
//   [mock]      합성 3종(design_brief·section_pattern·page_pattern·recommend) → 조회(search_sites·site·design_system·sections·screen·section_code·page_code)
//               → 초안(main_mockup·build_homepage) → 재현 묶음(replica_kit) → 게시·판정(publish·check_mockup) → 선호·동작·조립·샘플·통계
//   [guide]     guide_krds(이 파일) · guide_tokens(이 파일) · 나머지 guide_* 는 tools/guide.ts
//   [assets]    assets_*(assets_pick 은 tools/guide.ts)
//   [deck]      deck_jobs(이 파일) · deck_get_*_kit·deck_check_* 는 tools/deck-kit.ts
//   [powerplus] powerplus_check_request·powerplus_publish_report 는 tools/guide.ts
//   [mock 와이어] mock_get_wireframe·mock_check_wireframe 는 tools/mock-wire.ts
//   [HTTP 서버] 옛 이름 별칭(aliasCalls)·키 추출(헤더·?key=)·세션리스 전송·헬스
// 도구 표(/powermcp)는 packages/mcp/scripts/gen-tools.mjs 가 이 파일과 tools/*.ts 의 registerTool 에서 만든다 — 도구를 고치면 다시 돌린다.
import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { AssemblyResult, taxonomy } from "@pp/shared";
import { registerGuideTools } from "./tools/guide.ts";
import { registerDeckKitTools } from "./tools/deck-kit.ts";
import { registerMockWireTools } from "./tools/mock-wire.ts";

// ---------------------------------------------------------------- [공통] 설정·별칭·백엔드 호출
/** 새 플랫폼 REST v1 (끝에 /api/v1) */
const PP_API = (process.env.PP_API ?? "http://127.0.0.1:8090/api/v1").replace(/\/$/, "");
/** 새 플랫폼 공개 주소(시안 게시 주소·자산 파일 주소 앞부분) */
const PP_PUBLIC = (process.env.PP_PUBLIC_ORIGIN ?? "https://powerplus.hom2box.com").replace(/\/$/, "");
/** 옛 홈박스 API — 아직 이식 안 된 레퍼런스·조립 계열 */
const API = (process.env.LEGACY_HOMEBOX_API ?? "https://powerplus.hom2box.com/mockref/api").replace(/\/$/, "");
const LEGACY_KEY = process.env.LEGACY_HOMEBOX_KEY ?? "";
/** 시안 판정 기록 서명 비밀 — 플랫폼 config mock.judge_secret(없으면 worker.key)과 같은 값 */
const JUDGE_SECRET = process.env.PP_JUDGE_SECRET ?? "";
/** 옛 홈박스 화면 주소(기관·화면 page_url) */
const WEB = (process.env.LEGACY_HOMEBOX_WEB ?? "https://powerplus.hom2box.com/mockref").replace(/\/$/, "");
const PORT = Number(process.env.MCP_PORT ?? 3110);
/** 헬스·serverInfo 버전 — packages/mcp/package.json 에서 읽는다(손으로 적은 값이 재배포 뒤에도 남던 것, MC-27) */
const VERSION: string = (() => {
  try { return String((JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../package.json"), "utf8")) as { version?: string }).version ?? "0.0.0"); } catch { return "0.0.0"; }
})();
/** guide_tokens 가 읽는 토큰 산출물 폴더 */
const GUIDE_DIR = process.env.GUIDE_FILES_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../apps/web/public/guide-files");
/** 헬스 응답용 도구 수 — 서버를 한 번 만들어 센다 */
let TOOL_COUNT = 0;
const ATTRIBUTION = "출처는 각 항목의 url(기관 사이트). powerPlus 는 저작권을 주장하지 않으며 참고용입니다. 응답을 AI 학습 데이터셋·경쟁 라이브러리 구축·미러링에 사용할 수 없습니다.";

/** 옛 이름 → 새 이름 (외부 사용자가 이미 쓰는 이름. tools/call 에서 바꿔 넘긴다) */
const ALIASES: Record<string, string> = {
  // 홈박스 MCP 0.18
  get_design_brief: "mock_get_design_brief", get_section_pattern: "mock_get_section_pattern", get_page_pattern: "mock_get_page_pattern",
  recommend_references: "mock_recommend_references", search_sites: "mock_search_sites", get_site: "mock_get_site",
  get_design_system: "mock_get_design_system", search_sections: "mock_search_sections", get_screen: "mock_get_screen",
  get_section_code: "mock_get_section_code", get_page_code: "mock_get_page_code", get_main_mockup: "mock_get_main_mockup",
  build_homepage: "mock_build_homepage", get_replica_kit: "mock_get_replica_kit", publish_mockup: "mock_publish_mockup",
  get_design_preferences: "mock_get_design_preferences", check_mockup: "mock_check_mockup", get_behavior_kit: "mock_get_behavior_kit",
  assemble_screen: "mock_assemble_screen", get_sample_images: "mock_get_sample_images", get_pattern_stats: "mock_get_pattern_stats",
  get_wireframe: "mock_get_wireframe", check_wireframe: "mock_check_wireframe",
  get_krds_guide: "guide_krds",
  // powerPlus PHP MCP 1.0
  search_assets: "assets_search", get_asset: "assets_get", similar_assets: "assets_similar", style_set: "assets_style_set",
  list_categories: "assets_list_categories", list_topics: "assets_list_topics", suggest_keywords: "assets_suggest_keywords",
};
/** 도구 이름 → 키 scope (core_api_keys.scopes) */
const scopeOf = (tool: string) => (tool.split("_")[0] ?? "all");

/** 레퍼런스 엔진에 실어 보낼 공통 헤더 — 서비스 키 + 플랫폼이 판정한 플랜(X-Pp-Plan).
 *  플랜 판정은 플랫폼 /keys/verify 한 곳(staff·pro·team·admin = pro). 레퍼런스 엔진은 서비스 키가 유효할 때만 이 헤더를 믿는다
 *  (2026-10-09 시험: staff 키가 "Pro 이상" 402 — 엔진이 서비스 키 소유자 구독만 보고 있었다). */
function legacyHeaders(plan: "pro" | "free", accept = "application/json"): Record<string, string> {
  const headers: Record<string, string> = { Accept: accept, "X-Pp-Plan": plan };
  if (LEGACY_KEY) { headers.Authorization = `Bearer ${LEGACY_KEY}`; headers["X-Homebox-Key"] = LEGACY_KEY; }
  return headers;
}
/** 옛 홈박스 PHP 호출 — 서비스 키(Pro)를 실어 보낸다. 사용자 키는 보내지 않는다(옛 DB 엔 없다). plan 은 플랫폼 판정값. */
async function api<T>(p: string, plan: "pro" | "free", extra?: Record<string, string>): Promise<T> {
  const res = await fetch(`${API}${p}`, { headers: { ...legacyHeaders(plan), ...(extra ?? {}) } });
  const body = (await res.json().catch(() => null)) as T | { error?: { code: string; message: string } } | null;
  if (!res.ok) {
    const e = new Error((body as { error?: { message: string } } | null)?.error?.message ?? `레퍼런스 API HTTP ${res.status}${LEGACY_KEY ? "" : " (LEGACY_HOMEBOX_KEY 미설정)"}`) as Error & { code?: string };
    e.code = (body as { error?: { code?: string } } | null)?.error?.code ?? (res.status === 404 ? "NOT_FOUND" : res.status === 402 || res.status === 403 ? "PLAN_REQUIRED" : res.status === 400 ? "BAD_REQUEST" : "ERROR");
    throw e;
  }
  if (body === null || typeof body !== "object") throw new Error(`레퍼런스 API 응답을 읽지 못했습니다(HTTP ${res.status}). 잠시 뒤 다시 시도하세요.`);
  return body as T;
}

/** 새 플랫폼 PHP 호출 — 사용자 키를 그대로 Bearer 로. 응답 규약 {data,…} / {error, code, hint}. */
type PpRes<T> = { ok: boolean; status: number; data: T | null; body: (Record<string, unknown> & { error?: string; code?: string; hint?: string }) | null };
async function pp<T>(p: string, key: string | null, init?: { method?: string; body?: unknown; headers?: Record<string, string> }): Promise<PpRes<T>> {
  const headers: Record<string, string> = { Accept: "application/json", "X-Requested-With": "powerMCP", ...(init?.headers ?? {}) };
  if (key) {
    headers.Authorization = `Bearer ${key}`;
    // 키 사용량을 /keys/verify 에서 한 번만 세게 하는 표시 — 흉내 못 내게 서버 비밀로 서명(판정 MCP-006, 2026-10-10)
    if (JUDGE_SECRET) headers["X-Pp-Mcp"] = createHmac("sha256", JUDGE_SECRET).update(`mcp|${key}`).digest("hex");
  }
  if (init?.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${PP_API}${p}`, { method: init?.method ?? "GET", headers, body: init?.body === undefined ? undefined : JSON.stringify(init.body) });
  const body = (await res.json().catch(() => null)) as PpRes<T>["body"];
  return { ok: res.ok, status: res.status, data: body && "data" in body ? (body.data as T) : null, body };
}
const ppMsg = (r: PpRes<unknown>, fallback: string) => {
  const m = r.body?.error ?? `${fallback}(HTTP ${r.status})`;
  return r.body?.hint ? `${m} — ${r.body.hint}` : m;
};
/** 오류 코드 — 서버가 준 code(FORBIDDEN_SCOPE 등)를 먼저, 없으면 HTTP 상태로(MC-21: 도구마다 403 을 FORBIDDEN·ERROR 로 다르게 내던 것) */
const ppCode = (r: PpRes<unknown>) => (typeof r.body?.code === "string" && r.body.code) ? r.body.code
  : r.status === 404 ? "NOT_FOUND" : r.status === 401 ? "UNAUTHORIZED" : r.status === 403 ? "FORBIDDEN" : r.status === 402 ? "PLAN_REQUIRED" : r.status === 429 ? "RATE_LIMITED" : r.status === 400 || r.status === 422 ? "INVALID_ARGS" : "ERROR";
/** AI 가 흔히 쓰는 기관 유형 별칭 → taxonomy id (2026-09-30 요청 시험 R28: 'committee' 로 보내 검증 오류) */
const ALIAS: Record<string, string> = {
  committee: "central_committee", commission: "central_committee", ministry: "central_ministry", agency: "central_affiliate",
  city: "local_basic", county: "local_basic", district: "local_basic", province: "local_wide", metro: "local_wide",
  hospital: "public_medical", medical: "public_medical", research: "public_research", culture: "public_culture",
  corporation: "public_corp", public_enterprise: "public_corp", quasi: "public_quasi", education: "edu_office", edu: "edu_office", assembly: "council",
  // 도구 설명 예시가 'univ' 로 적혀 있었는데 taxonomy 에 없는 값이라 예시대로 부르면 INVALID_ARGS 였다(2026-10-15 MC-06 점검)
  univ: "edu_univ", university: "edu_univ", school: "edu_school", welfare: "etc_welfare",
};
/** 배열 파라미터 — 문자열("a,b")도 받는다. 2026-09-24 테스트에서 org_type:"local_basic" 같은 호출이 전부 검증 오류로 튕겼다 */
function listOf<T extends z.ZodTypeAny>(inner: T) {
  const norm = (x: string) => ALIAS[x.toLowerCase()] ?? x;
  return z.preprocess((v) => (typeof v === "string" ? v.split(",").map((x) => norm(x.trim())).filter(Boolean) : Array.isArray(v) ? v.map((x) => (typeof x === "string" ? norm(x.trim()) : x)) : v), z.array(inner));
}
const text = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const err = (message: string, code = "ERROR", hint?: string, more?: Record<string, unknown>) => ({ content: [{ type: "text" as const, text: JSON.stringify({ error: { code, message, ...(hint ? { hint } : {}), ...(more ?? {}) } }) }], isError: true });
const qs = (o: Record<string, unknown>) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0)).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(Array.isArray(v) ? v.join(",") : String(v))}`).join("&");

// ---------------------------------------------------------------- [공통] 참고 이미지 (Pro 이상, 2026-09-24 사용자 결정)
// 숫자·글자만 받은 AI 는 흔한 와이어프레임을 그렸다(Claude 웹 인사말 테스트). 실제 화면·섹션을 보여 줘야 관공서 디자인 언어
// (사진 위 글자·겹침·둥근 모서리·아이콘 퀵메뉴·강조 글자색)를 따라 그린다. 원본 해상도는 주지 않는다 — 폭 축소 JPEG + 출처 워터마크.
const ORIGIN = new URL(API).origin;
// 글자 든 샘플(배너·팝업·포스터) 열쇠 — 판정이 그 그림의 잘림을 잡는다(2026-10-15 팝업존 배너 아래 잘림). 10분 캐시
let textKeyCache: { at: number; keys: string[]; icons: string[] } = { at: 0, keys: [], icons: [] };
async function textSampleKeys(): Promise<string[]> {
  if (Date.now() - textKeyCache.at < 600_000) return textKeyCache.keys;
  try { const r = await fetch(`${PP_API}/assets/mock-samples`); const j = (await r.json()) as { data?: { items?: Array<{ id: string; file?: string; has_text?: boolean; kind?: string }> } }; const it = j.data?.items ?? [];
    // 열쇠는 그림 주소의 …/samples/{열쇠}/… — id 는 옛 이름(banner-03-festival-promo)이라 주소와 안 맞아 글자 그림 잘림을 하나도 못 잡았다(2026-10-15)
    const keyOf = (x: { id: string; file?: string }) => (String(x.file ?? "").match(/\/samples\/([a-z0-9]{8,32})\//) ?? [])[1] ?? String(x.id).replace(/^pa-/, "");
    textKeyCache = { at: Date.now(), keys: it.filter((x) => x.has_text).map(keyOf), icons: it.filter((x) => String(x.kind ?? "").startsWith("icon")).map(keyOf) }; } catch { textKeyCache.at = Date.now(); }
  return textKeyCache.keys;
}
/** 샘플 이미지를 외부(사용자 목업)에서 열 공개 주소의 앞부분 — 운영은 https://hom2box.com, 개발은 HOMEBOX_PUBLIC_ORIGIN 로 */
const PUBLIC_ORIGIN = (process.env.HOMEBOX_PUBLIC_ORIGIN ?? new URL(WEB).origin).replace(/\/$/, "");
type SampleImage = { id: string; url: string; thumb_url: string; alt: string; temporary?: boolean; text_safe?: { side: string; text_color: string; scrim?: boolean } | null } & Record<string, unknown>;
const absSample = (s: SampleImage): SampleImage => ({ ...s, url: s.url.startsWith("http") ? s.url : `${PUBLIC_ORIGIN}${s.url}`, thumb_url: s.thumb_url.startsWith("http") ? s.thumb_url : `${PUBLIC_ORIGIN}${s.thumb_url}` });
type ImageBlock = { type: "image"; data: string; mimeType: "image/jpeg" };
type TextBlock = { type: "text"; text: string };
async function refImage(url: string | null | undefined, label: string, maxW: number, maxH: number): Promise<ImageBlock | null> {
  if (!url) return null;
  try {
    const res = await fetch(url.startsWith("http") ? url : `${ORIGIN}${url}`);
    if (!res.ok) return null;
    const { default: sharp } = await import("sharp");
    const src = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(src).metadata();
    const w = Math.min(maxW, meta.width ?? maxW);
    let buf = await sharp(src).resize({ width: w }).toBuffer();
    const h0 = (await sharp(buf).metadata()).height ?? maxH;
    const h = Math.min(h0, maxH);
    if (h < h0) buf = await sharp(buf).extract({ left: 0, top: 0, width: w, height: h }).toBuffer();
    const tag = `homebox reference - ${label}`.replace(/[^\x20-\x7E]/g, "").slice(0, 80); // 서버 폰트에 한글이 없을 수 있어 ASCII 만
    const bw = Math.min(w, tag.length * 7 + 20);
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${bw}" height="22"><rect width="100%" height="100%" fill="rgba(0,0,0,0.6)"/><text x="10" y="15" font-size="12" font-family="sans-serif" fill="#fff">${tag.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text></svg>`);
    const out = await sharp(buf).composite([{ input: svg, gravity: "southeast" }]).jpeg({ quality: 72 }).toBuffer();
    return { type: "image", data: out.toString("base64"), mimeType: "image/jpeg" };
  } catch { return null; }
}
/** 긴 화면을 위에서 아래로 잘라 여러 장으로 — 재현 묶음용. 한 장으로 줄이면 글자·간격이 안 보인다. 폭은 축소(원본 해상도 미제공), 장마다 워터마크 */
const capCache = new Map<string, { at: number; buf: Buffer }>();
async function refSlices(url: string | null | undefined, label: string, maxW: number, sliceH: number, maxSlices: number, crop?: { x: number; w: number; vw: number }, band?: { y: number; h: number }): Promise<Array<{ block: ImageBlock; from: number; to: number; scale: number }>> {
  if (!url) return [];
  try {
    const full = url.startsWith("http") ? url : `${ORIGIN}${url}`;
    const ck = full.split("?")[0] ?? full;
    let src: Buffer;
    const hit = capCache.get(ck);
    if (hit && Date.now() - hit.at < 60_000) src = hit.buf;
    else {
      const res = await fetch(full);
      if (!res.ok) return [];
      src = Buffer.from(await res.arrayBuffer());
      if (capCache.size > 6) capCache.clear();
      capCache.set(ck, { at: Date.now(), buf: src });
    }
    const { default: sharp } = await import("sharp");
    let meta = await sharp(src, { limitInputPixels: false }).metadata();
    // 세로 구간만(섞기 조각) — band 는 원본 화면 px
    if (band && meta.width && meta.height) {
      const k0 = meta.width / (crop?.vw ?? 1920);
      const top = Math.max(0, Math.round(band.y * k0)), height = Math.min(meta.height - top, Math.round(band.h * k0));
      if (height < 8) return [];
      src = await sharp(src, { limitInputPixels: false }).extract({ left: 0, top, width: meta.width, height }).toBuffer();
      meta = await sharp(src, { limitInputPixels: false }).metadata();
    }
    let base = 1; // 잘라 낸 뒤 폭 ÷ 원본 화면 폭 보정
    if (crop && meta.width && meta.height && crop.vw > 0) {
      const k = meta.width / crop.vw;
      const left = Math.max(0, Math.round(crop.x * k)), width = Math.min(meta.width - left, Math.round(crop.w * k));
      if (width > 50) { src = await sharp(src, { limitInputPixels: false }).extract({ left, top: 0, width, height: meta.height }).toBuffer(); meta = await sharp(src, { limitInputPixels: false }).metadata(); base = k; }
    }
    const w = Math.min(maxW, meta.width ?? maxW);
    const scale = (w / (meta.width ?? w)) * base;
    const small = await sharp(src, { limitInputPixels: false }).resize({ width: w }).toBuffer();
    const H = (await sharp(small).metadata()).height ?? 0;
    const out: Array<{ block: ImageBlock; from: number; to: number; scale: number }> = [];
    for (let top = 0, i = 0; top < H && i < maxSlices; top += sliceH, i++) {
      const h = Math.min(sliceH, H - top);
      if (h < 60 && i > 0) break; // 끝에 남은 몇 px 짜리 빈 조각은 싣지 않는다
      const tag = `homebox reference - ${label} ${i + 1}`.replace(/[^\x20-\x7E]/g, "").slice(0, 80);
      const bw = Math.min(w, tag.length * 7 + 20);
      const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${bw}" height="22"><rect width="100%" height="100%" fill="rgba(0,0,0,0.6)"/><text x="10" y="15" font-size="12" font-family="sans-serif" fill="#fff">${tag}</text></svg>`);
      const buf = await sharp(small).extract({ left: 0, top, width: w, height: h }).composite(h > 40 ? [{ input: svg, gravity: "southeast" }] : []).jpeg({ quality: 72, mozjpeg: true }).toBuffer();
      out.push({ block: { type: "image", data: buf.toString("base64"), mimeType: "image/jpeg" }, from: Math.round(top / scale), to: Math.round((top + h) / scale), scale });
    }
    return out;
  } catch { return []; }
}
/** 레퍼런스 엔진이 공공누리 2~4유형이라 원본 이미지를 뺀 이유(image_withheld, O-04) — 문자열일 때만 */
const withheldOf = (x: unknown): string | null => {
  const w = (x as { image_withheld?: unknown } | null | undefined)?.image_withheld;
  return typeof w === "string" && w ? w : null;
};
/** 레퍼런스 엔진 kogl 안내(Plan::koglInfo) — 공공누리 2~4유형일 때만 온다 */
type KoglInfo = { type?: number; label?: string; open?: boolean; note?: string } | null | undefined;
/** 화면·재현 묶음 단일 레퍼런스: 원본 주소가 비었고 kogl 이 닫혀 있으면 그 안내문이 미제공 이유 */
const koglWithheld = (k: KoglInfo, url: string | null | undefined): string | null =>
  !url && k && k.open === false && typeof k.note === "string" && k.note ? k.note : null;
/** JSON 텍스트 + (Pro 면) 참고 이미지들. 이미지마다 앞에 무엇인지 한 줄 설명을 붙인다.
 *  withheld 가 있는 항목은 이미지 대신 그 이유를 남긴다 — AI 가 "이미지가 없다"가 아니라 "공공누리 제한으로 미제공"임을 알게(O-04) */
async function withImages(data: unknown, allow: boolean, refs: Array<{ url?: string | null; label: string; caption: string; maxW?: number; maxH?: number; withheld?: string | null }>) {
  const content: Array<TextBlock | ImageBlock> = [{ type: "text", text: JSON.stringify(data, null, 2) }];
  if (!allow) {
    if (refs.length) content.push({ type: "text", text: "참고 이미지는 Pro 이상 키에서만 함께 제공됩니다(Free 는 URL·메타데이터만)." });
    return { content };
  }
  const imgs = await Promise.all(refs.map((r) => (r.withheld ? Promise.resolve(null) : refImage(r.url, r.label, r.maxW ?? 900, r.maxH ?? 2000))));
  refs.forEach((r, i) => {
    const im = imgs[i];
    if (im) content.push({ type: "text", text: `[참고 이미지 ${i + 1}] ${r.caption}` }, im);
    else if (r.withheld) content.push({ type: "text", text: `[참고 이미지 ${i + 1} 미제공 — 공공누리 제한] ${r.caption} · ${r.withheld}` });
  });
  return { content };
}

// ---------------------------------------------------------------- [공통] 키 검증·일 한도
/** 오늘 사용량 — 모든 응답 meta.quota. remaining null = 무제한, reset = 다음 KST 자정 */
type Quota = { limit: number; used: number; remaining: number | null; reset: string };
type Verified = ({ ok: true; plan: string; kind: string; roles: string[]; keyId?: string } | { ok: false; status: number; code: string; message: string }) & { quota?: Quota };
function nextKstMidnight(): string {
  const kst = new Date(Date.now() + 9 * 3600_000);
  const d = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + 1));
  return d.toISOString().slice(0, 10) + "T00:00:00+09:00";
}
/** 키 검증 + 사용량 +1 — 새 플랫폼 `POST /api/v1/keys/verify`(Bearer = 사용자 키). scope·일 한도·core_api_usage 는 PHP 가 본다. */
async function verifyKey(key: string | null, tool: string): Promise<Verified> {
  if (!key) return { ok: false, status: 401, code: "UNAUTHORIZED", message: "MCP 키가 없습니다. Authorization: Bearer <키> 헤더를 보내거나, 헤더를 못 넣는 커넥터(Claude 웹·데스크톱, ChatGPT)는 서버 URL 끝에 ?key=<키> 를 붙이세요. 키는 powerPlus 마이페이지 → API·MCP 키에서 발급합니다(pp_live_…)." };
  const r = await pp<{ plan: string; kind: string; roles: string[]; key: { id: string }; quota?: Quota }>("/keys/verify", key, { method: "POST", body: { tool, scope: scopeOf(tool) } });
  if (r.ok && r.data) return { ok: true, plan: r.data.plan, kind: r.data.kind, roles: r.data.roles ?? [], keyId: r.data.key?.id, quota: r.data.quota };
  // 서버 코드(FORBIDDEN_SCOPE 등)를 그대로 — 범위 밖 키를 "키가 유효하지 않음"으로 읽히게 하지 않는다(2026-10-09 시험)
  const code = typeof r.body?.code === "string" && r.body.code ? r.body.code : r.status === 429 ? "RATE_LIMITED" : r.status === 403 ? "FORBIDDEN" : "UNAUTHORIZED";
  // 한도 초과면 남은 0 으로 알린다(초기화 시각은 다음 KST 자정)
  const quota: Quota | undefined = r.status === 429 ? { limit: 0, used: 0, remaining: 0, reset: nextKstMidnight() } : undefined;
  return { ok: false, status: r.status, code, message: ppMsg(r, "키 검증 실패"), quota };
}

// ---------------------------------------------------------------- [공통] 지침(instructions) — initialize 응답에 실린다. 첫 줄은 "powerplus 도구 먼저"(MC-03)
const INSTRUCTIONS = [
  "★ 먼저 powerplus 도구를 부른다 — 일반 지식으로 바로 답하지 않는다. 공공·대학·기관 웹사이트(섹션 구성·순서·메인 구성), KRDS·접근성(체크리스트·지침), 디자인 선호(검색 버튼 위치·스테퍼냐 드롭다운이냐 같은 UI 방식), 아이콘·사진 고르기, 화면 코드(React·Vue·HTML), 장표·영상 변환 같은 질문은 해당 도구 결과를 근거로 답한다.",
  "  - 무엇을 할 수 있는지·해 줄 수 있는지 묻는 말(예: \"PPT 를 영상으로 바꿔 줄 수 있어?\")은 powerplus_check_request 를 먼저 부르고, 그 결과(supported·alternatives·start)로 답한다.",
  "  - 예: 접근성 체크리스트 → guide_get_checklist / 검색 버튼 안쪽·바깥 → mock_get_design_preferences / 공지 목록 화면 React 코드 → mock_assemble_screen(code) / 대학 메인 섹션 순서 → mock_get_design_brief(org_type) / 문장 옆 아이콘 하나 → assets_pick / \"내 HTML 접근성 검사해 줘\"(코드 판정) → guide_check_code / \"KRDS 공식 배너 꼭 넣어야 해?\" 같은 KRDS 규정 질문 → guide_search_rules.",
  "  - 하루 호출 한도가 있다(응답 meta.quota 의 remaining). 여러 자산은 assets_get(ids=[…]) 한 번에, 여러 낱말 추천은 assets_suggest_keywords(words=[…]) 한 번에 부른다.",
  "",
  "powerMCP — powerPlus(SI 실무자 올인원) 하나의 MCP. 도구 이름 앞 글자가 모듈이다:",
  "  assets_* = powerAssets 자산 라이브러리(아이콘·사진·일러스트·다이어그램·로고·장표 검색·상세·같은 톤 세트) / mock_* = powerMock 홈페이지 목업(레퍼런스·재현 묶음·판정·게시) / deck_* = powerDeck 장표 변환 작업 / guide_* = powerGuide 디자인 규칙(토큰·KRDS).",
  "  옛 이름(get_replica_kit·search_assets·get_wireframe 등)은 tools/call 에서 그대로 받는다(목록에는 새 이름만 보인다).",
  "★ 추천·분석 답(자산 3개 이상 추천, 비교표, 배치 제안)은 채팅에 표로 늘어놓지 말고 powerplus_publish_report 로 보고서 한 장(썸네일 카드·표·목록)을 게시해 url 을 준다. 채팅에는 요약 2~3줄과 그 url. 자산 id 는 assets_search·assets_pick 으로 받은 것만 쓴다. 문맥(슬라이드 제목·설명)에 맞는 아이콘 하나를 고를 때는 assets_pick.",
  "",
  "powerMock 레퍼런스 — 국내 관공서(정부·지자체·공공기관) 웹사이트 실제 화면에서 자동 추출한 디자인 데이터를 가중 합성해 준다.",
  "",
  "★ 시안·목업·홈페이지를 만들어 달라는 요청은 mock_get_replica_kit 이 기본이다(가장 품질이 높다).",
  "  - 메인: mock_get_replica_kit(org_type, org_name, primary?) → 참고 이미지와 같은 배치로 직접 HTML 한 파일을 만든다. 글·사진·로고·색은 persona·samples·theme 로 전부 바꾸고, </body> 앞에 <script data-hb-behavior></script> 한 줄을 넣어(스크립트는 mock_check_mockup 이 채운다) 캐러셀·탭·메뉴·레이어·검색이 실제로 동작하게 한다.",
  "  - 서브: 같은 org_type·org_name·primary·rank 에 page=board_list|board_view|greeting|content… 를 붙여 한 장씩 받는다. 가상 기관·색이 메인과 같게 나온다. 머리·바닥·공통 스타일은 다시 쓰지 않는다 — mock_check_mockup 에 base_token(메인 시안 token)을 주고 <!--hb:use style--> · <!--hb:use header--> · <!--hb:use footer--> 를 적으면 홈박스가 메인 것을 넣는다.",
  "  - 시안을 여러 개 만들 때는 rank 를 1·2·3 으로 바꿔 서로 다른 레퍼런스를 받는다.",
  "  - 글자 크기나 칸 안쪽이 안 읽히면 zoom=true 로 한 번 더 불러 본문 폭 확대 이미지를 받는다.",
  "  - rows·sections·columns 는 자동 분해라 틀릴 수 있다. 참고 이미지와 다르면 이미지가 우선이다.",
  "  - 메인 묶음은 레퍼런스 여러 곳(A·B·C)의 줄을 섞은 배치다(reference.mix) — 한 사이트를 통째로 베끼지 않기 위해서다. 줄마다 출처가 달라도 한 사이트처럼 보이게 제목·둥글기·간격을 통일하고, 섹션 제목은 새로 짓는다. 색은 theme.primary(레퍼런스와 다른 색)를 쓴다.",
  "  - 다 만들면 mock_check_mockup(ref_id=reference.ref_id, html) 을 반드시 부른다. 홈박스가 시안을 보관하고 실제로 렌더해 레퍼런스와 줄·칸·높이·밝기를 대조하고 동작을 눌러 본 뒤 점수·fixes·token 을 준다(85점 이상·치명 0 이 통과). 스스로 다 됐다고 판단하지 않고, 통과할 때까지 고쳐 다시 판정한다(미통과 시안은 결과로 남지 않는다).",
  "  - 미통과면 HTML 을 처음부터 다시 쓰지 않는다. mock_check_mockup(token, edits=[{find, replace}]) 로 고친 부분만 보낸다(ref_id 는 보관된 것을 쓴다. 전체를 다시 쓰면 10분씩 걸린다).",
  "  mock_build_homepage·mock_get_main_mockup 은 빠른 초안용이다(자동 조립이라 레퍼런스 수준에는 못 미친다). 사용자가 초안을 직접 요청하지 않았으면 쓰지 않는다.",
  "  - 사진·배너·아이콘은 samples·icons 에 있는 것을 그대로 쓴다. 그림을 SVG 로 직접 그려 대신하지 않는다(만화처럼 보여 시안 품질이 크게 떨어진다).",
  "  - mock_check_mockup 을 통과하면 mock_publish_mockup(token, title) 으로 게시해 받은 url 을 사용자에게 준다(HTML 을 다시 보내지 않는다 — 홈박스가 보관하고 있다). claude.ai 아티팩트처럼 외부 이미지가 막힌 곳에서는 홈박스 사진이 안 보이기 때문이다. 그림을 직접 그려 사진을 대신하지 않는다. 무료 키라 못 올리면 HTML 파일로 저장해 브라우저로 열도록 안내한다.",
  "",
  "쓰는 순서(설계 근거·참고 자료를 찾을 때. 시안·목업·홈페이지 제작은 위 mock_get_replica_kit 흐름이 기본이다):",
  "1) mock_get_design_brief(org_type, tone?) — 그 유형 기관들이 실제로 어떻게 만드는지(헤더 유형·LNB·컨테이너·본문 크기·섹션 순서·KRDS 적용률)와 추천 레퍼런스. 목업의 뼈대는 여기서 정한다.",
  "1-1) mock_get_page_pattern(page_type) — 서브페이지(인사말·조직도·게시판 목록/상세·콘텐츠…)는 반드시 이것부터. 여러 기관의 같은 유형 화면을 합성한 전형 섹션 순서·위치·폭 + 상위 화면 5장(섹션별 x·y·w·h·제목·열·색). 서브페이지를 '일반적인 틀'로 짜지 말고 exemplars 구성을 따른다.",
  "2) mock_get_section_pattern(section_type) — 섹션 하나(소식 탭·바로가기·메인 비주얼…)의 변형 분포·표준 높이·위치·구조 힌트 + 상위 사이트 크롭. 섹션을 그릴 때 참고.",
  "3) mock_recommend_references — 왜 그 사이트인지(평가·KRDS·개편연도·인증) 근거와 함께 3~5곳. 인용할 때는 이 근거를 같이 쓴다.",
  "4) mock_get_site(slug) — 고른 레퍼런스의 팔레트·타이포 스케일(h1~footer 크기·굵기·행간·색)·간격·네비 트리·수상·사업정보. 마크업의 수치는 여기서 가져온다.",
  "4-1) mock_get_design_system(slug, format?) — 고른 레퍼런스를 KRDS 분류(색상·타이포·형태·레이아웃·아이콘·엘리베이션)로 정리한 디자인 시스템과 CSS·Tailwind 토큰. 마크업에 토큰을 그대로 붙일 때.",
  "4-2) mock_get_section_code(section_id) — 고른 섹션을 바로 쓰는 HTML·CSS(실측 제목·메뉴·색·모서리·사진 배치 반영, Pro). 목업은 exemplars 섹션마다 이것을 받아 조립하고, 문구만 내 기관 내용으로 바꾼다.",
  "4-0) mock_build_homepage(org_type, pages, primary?, font?) — 빠른 초안 전용. 사용자가 \"빠른 초안\"·\"대충\"을 직접 요청했을 때만 쓴다. \"홈페이지 만들어줘\"·\"시안\"은 mock_get_replica_kit 으로 메인과 서브를 한 장씩 받는다(초안 안에서는 메인·서브가 같은 가상 기관·색·글꼴·주 메뉴를 쓴다).",
  "4-3) mock_get_main_mockup(org_type) — 빠른 초안 전용(사용자가 초안을 직접 요청했을 때만). 채택률로 필수 블록·순서를 정하고 캐러셀·탭·메가 메뉴가 동작하는 완성형 한 장(가상 기관·글, 샘플 사진). 섹션을 쌓아 메인을 만들지 않는다.",
  "4-4) mock_get_page_code(screen_id) — exemplars 화면 한 장을 바로 열리는 HTML 문서로 조립(LNB 2단 배치·샘플 사진 포함, Pro). 화면 한 장을 참고할 때 쓴다(시안 제작은 mock_get_replica_kit(page=…)).",
  "4-5) mock_get_sample_images(kind|section_type, tags?) — 목업 사진·배너 자리에 넣을 샘플 이미지. mock_get_section_code 는 이미 사진 자리에 넣어 준다.",
  "4-6) mock_assemble_screen(keyword, screen_type, org_type?) — 디자인 조립 명세(Assembly Spec JSON). 후보 화면 → 섹션 → 패턴(PatternSummary) → 컴포넌트(ComponentPlan) → 슬롯 배치를 거쳐, 슬롯마다 원본 section_id(ref)와 근거(rationale)를 붙이고 품질 게이트 7종(근거·복제 방지·원본 색 금지·KRDS·접근성·출처·삭제요청) 결과를 준다. 목업·코드는 이 명세의 슬롯 순서·영역·칸 수대로 만들고, 스타일은 spec.theme(KRDS 또는 고객 주색)만 쓴다 — 원본 기관 색을 쓰지 않는다. 각 슬롯의 근거 화면은 ref → mock_get_section_code·mock_get_screen 으로 본다. 응답 code 의 Page.tsx·Page.vue·theme.css 가 그 명세의 키트 구현이다(글·연락처는 가상 값).",
  "4-7) mock_get_replica_kit(org_type, org_name?, rank?, page?, primary?) — 시안·목업의 품질이 중요할 때(\"홈페이지 시안\", \"실제 사이트처럼\")는 이것을 쓴다. 레퍼런스 캡처와 줄·칸 좌표, 샘플 이미지, 아이콘, 동작 스크립트, 제작 절차를 한 번에 받고 직접 HTML 을 만든다: 배치는 레퍼런스와 같게(칸을 비우거나 넓게 늘이지 않는다), 글·이미지·색은 전부 바꾸고, 조작 요소는 전부 실제로 동작하게. 시안이 2종이면 rank 1·2 로 두 번 부른다. 빠른 초안은 mock_get_main_mockup·mock_build_homepage.",
  "4-8) mock_get_behavior_kit — 캐러셀·탭·메뉴·레이어·검색을 움직이게 하는 스크립트와 규약. 직접 만든 시안은 반드시 이것으로 동작을 넣는다(모양만 있는 시안은 미완성).",
  "4-9) mock_get_design_preferences — 디자이너 A/B 투표로 더 낫다고 고른 UI 방식(두 번째 근거). mock_get_replica_kit 응답의 preferences 와 mock_check_mockup 의 preference_tips 에도 실린다. 요소를 어떻게 그릴지(스테퍼냐 드롭다운이냐 등)는 이 규칙을 따르고, 배치는 레퍼런스를 따른다.",
  "5) guide_krds — KRDS 컴포넌트 공식 가이드 링크. 관공서는 KRDS 준수가 평가 요소다.",
  "",
  "섹션 structure 필드: title·headings·links{n,labels}·images{n,photos,icons}·items·cols·colors{bg,fg,accent}·font·text{chars,words,kind}. 수집 원문은 주지 않는다 — 기관명·지명·인명은 ○○ 로 일반화돼 있고, 긴 문장은 \"[글 N자]\", text 는 글자 수·낱말 수·형식(제목·메뉴·링크 목록·문장·연락처·주소)만이다. ○○ 자리는 persona 의 가상 기관·인물로 채우고, 같은 길이의 가상 글을 쓴다. 구성은 이 값으로 정하고 없는 값은 지어내지 말고 자리표시자로 둔다. 같은 행의 좌우 순서는 x 로 판단한다.",
  "참고 이미지(Pro): mock_get_page_pattern·mock_get_section_pattern·mock_get_screen 응답에 실제 화면·섹션 이미지가 붙는다. 목업은 반드시 이미지를 보고 그 디자인 언어를 따른다 — 사진을 폭 가득 깔고 글자를 얹는지, 둥근 모서리·겹침(카드가 비주얼 위로 올라옴)·아이콘 퀵메뉴·색이 섞인 강조 문구·배경 면 구분 같은 처리. 회색 빈 박스와 '[자리표시자]' 글자만으로 된 와이어프레임을 내지 않는다. 실명·실제 사진·로고는 복제하지 말고, 사진 자리에는 mock_get_sample_images 의 홈박스 샘플 이미지(가상 인물·풍경, 공개 url)를 넣는다 — 메인 비주얼은 hero-city·hero-nature, 인사말은 leader, 소식 썸네일은 news-thumb·leader-field, 배너존은 banner. 넓은 사진은 text_safe.side 쪽에 글자를 얹고 scrim=true 면 어두운 그라데이션을 깐다.",
  "구성 순서는 exemplars 의 섹션 목록, 치수·색·글꼴은 mock_get_site·mock_get_design_system 값 그대로 쓴다. 응답값과 다르게 바꾸면 이유를 적는다.",
  "규칙: 응답의 n·confidence 를 반드시 읽고, n<10 이면 '표본이 적다'고 명시한다. 수치는 지어내지 말고 응답값만 쓴다. 출처(slug·url)를 함께 제시한다.",
  "'평가(rating)'는 홈박스 사용자(퍼블리셔·디자이너)가 매긴 값이고 '점수(score)'는 평가·KRDS·개편연도·인증·조회를 가중한 합성값이다.",
].join("\n");

// ---------------------------------------------------------------- [공통] buildServer — 요청마다 새로 만든다(세션리스)
function buildServer(key: string | null): McpServer {
  const server = new McpServer({ name: "powermcp", version: VERSION }, { instructions: INSTRUCTIONS });
  let registered = 0;
  // 도구마다 인자 이름 목록(null = 인자를 받지 않는 도구). SDK 검증 전에 별칭을 옮기고 모르는 인자를 걸러 내려고 쓴다.
  const known = new Map<string, Set<string> | null>();
  // 검증 단계 → 처리기로 넘기는 표시(요청마다 서버를 새로 만들므로 도구 이름으로 충분). 인자 없는 도구는 처리기에 args 가 안 오기 때문이다.
  const pending = new Map<string, { ignored: string[]; invalid?: { message: string; hint: string; field: string | null; fields: string[] } }>();
  let quota: Quota | null = null; // guard 가 채움 — 모든 응답 meta.quota
  const ARG_ALIAS: Record<string, string[]> = { query: ["q", "keyword", "search", "text"], q: ["query", "keyword"], keyword: ["q", "query"], limit: ["count", "n", "size"], org_type: ["orgType", "type"], org_name: ["orgName", "name"], slug: ["site", "site_slug"], id: ["component", "component_id", "name", "asset_id"], ids: ["asset_ids"], words: ["keywords", "terms"] };
  const issueKo = (i: { code?: string; path?: PropertyKey[]; message?: string; minimum?: unknown; maximum?: unknown; values?: unknown[]; expected?: unknown }, a: Record<string, unknown>) => {
    const p = (i.path ?? []).map(String).join(".") || "(인자)";
    const top = String(i.path?.[0] ?? "");
    if (i.code === "invalid_type" && top && a[top] === undefined) return `${p}: 꼭 넣어야 하는 인자입니다`;
    if (i.code === "invalid_type") return `${p}: 형식이 맞지 않습니다(${String(i.expected ?? "")} 이어야 합니다)`;
    if (i.code === "too_small") return `${p}: 너무 짧거나 작습니다(최소 ${String(i.minimum)})`;
    if (i.code === "too_big") return `${p}: 너무 길거나 큽니다(최대 ${String(i.maximum)})`;
    if (i.code === "invalid_value" || i.code === "invalid_enum_value") return `${p}: 허용된 값이 아닙니다${Array.isArray(i.values) ? `(${i.values.slice(0, 50).join("·")}${i.values.length > 50 ? " …" : ""})` : ""}`;
    if (i.code === "invalid_format" || i.code === "invalid_string") return `${p}: 형식이 맞지 않습니다`;
    return `${p}: 값이 맞지 않습니다`;
  };
  const sv = server as unknown as { validateToolInput: (tool: { inputSchema?: unknown }, args: unknown, name: string) => Promise<unknown> };
  const origValidate = sv.validateToolInput.bind(server);
  sv.validateToolInput = async (tool, args, name) => {
    const a: Record<string, unknown> = args && typeof args === "object" && !Array.isArray(args) ? { ...(args as Record<string, unknown>) } : {};
    const k = known.has(name) ? known.get(name)! : undefined;
    const ignored: string[] = [];
    if (k === null) { ignored.push(...Object.keys(a)); for (const x of ignored) delete a[x]; }
    else if (k) {
      for (const x of Object.keys(a)) {
        if (k.has(x)) continue;
        const target = Object.entries(ARG_ALIAS).find(([to, from]) => k.has(to) && from.includes(x) && a[to] === undefined)?.[0];
        if (target) { a[target] = a[x]; delete a[x]; continue; }
        ignored.push(x); delete a[x];
      }
    }
    pending.set(name, { ignored });
    try { return await origValidate(tool, a, name); }
    catch (e) {
      // SDK 의 영어 검증 문구 대신 한국어 INVALID — 무엇이 틀렸고 무엇을 넣을 수 있는지
      const sch = tool.inputSchema as { safeParse?: (v: unknown) => { success: boolean; error?: { issues?: Array<Record<string, unknown>> } } } | undefined;
      const r = sch?.safeParse ? sch.safeParse(a) : null;
      const issues = r && !r.success ? (r.error?.issues ?? []) : [];
      const msgs = issues.slice(0, 5).map((i) => issueKo(i as Parameters<typeof issueKo>[0], a));
      const message = msgs.length ? `인자가 맞지 않습니다 — ${msgs.join(" / ")}` : `인자가 맞지 않습니다 — ${(e as Error).message.replace(/^.*?Invalid arguments for tool [^:]+:\s*/, "").slice(0, 200)}`;
      const hint = k ? `쓸 수 있는 인자: ${[...k].join(", ")}` : "이 도구는 인자를 받지 않습니다";
      const fields = [...new Set(issues.map((i) => ((i.path as PropertyKey[] | undefined) ?? []).map(String).join(".")).filter(Boolean))];
      pending.set(name, { ignored, invalid: { message, hint, field: fields[0] ?? null, fields } });
      return a; // 처리기는 부르지만 감싼 처리기가 INVALID 로 바로 돌려준다
    }
  };
  /** 응답 첫 JSON 글에 덧붙이기(성공·오류 모두) */
  const addMeta = (res: unknown, extra: Record<string, unknown>) => {
    const c = (res as { content?: Array<{ type: string; text?: string }> } | null)?.content?.[0];
    if (!c || c.type !== "text" || typeof c.text !== "string") return;
    try { const j = JSON.parse(c.text); if (j && typeof j === "object" && !Array.isArray(j)) { const meta = { ...(j.meta ?? {}), ...(extra.meta as object ?? {}) }; c.text = JSON.stringify({ ...j, ...extra, ...(Object.keys(meta).length ? { meta } : {}) }, null, 2); return; } } catch { /* 글 응답 */ }
    c.text += "\n" + JSON.stringify(extra);
  };
  /** 첫 JSON 글을 structuredContent 로도 싣는다(MC-22 — content 와 둘 다). outputSchema 가 없으니 SDK 는 검증 없이 그대로 넘긴다.
   *  글 응답(CSS·토큰 텍스트)·배열은 싣지 않는다. 큰 응답(재현 묶음 등)은 같은 JSON 을 두 번 보내지 않게 100KB 까지만 */
  const addStructured = (res: unknown) => {
    const r = res as { content?: Array<{ type: string; text?: string }>; structuredContent?: unknown } | null;
    const c = r?.content?.[0];
    if (!r || r.structuredContent !== undefined || !c || c.type !== "text" || typeof c.text !== "string" || c.text.length > 100_000) return;
    try { const j: unknown = JSON.parse(c.text); if (j && typeof j === "object" && !Array.isArray(j)) r.structuredContent = j; } catch { /* 글 응답 */ }
  };
  const origRegister = server.registerTool.bind(server) as (...args: unknown[]) => unknown;
  (server as unknown as { registerTool: (...args: unknown[]) => unknown }).registerTool = (...args: unknown[]) => {
    registered++;
    const name = String(args[0]);
    // 처리기에서 던진 오류도 다른 도구 오류와 같은 JSON 형식({error:{code,message}})으로 돌려준다(그냥 두면 SDK 가 일반 글로 바꾼다)
    const h = args[args.length - 1];
    // 모르는 인자는 SDK 가 조용히 버린다 — mock_search_sites 에 q 를 넘기면 검색어 없이 1,219건이 나왔다(2026-10-12 MCP 시험 r1).
    // 별칭(q→query, site→slug 등)은 SDK 검증 전에 옮기고(필수 인자 별칭도 통과), 모르는 인자는 응답 ignored_args 로 알린다.
    const cfg = args[1] as { inputSchema?: Record<string, z.ZodTypeAny> } | undefined;
    const shape = cfg && cfg.inputSchema && typeof cfg.inputSchema === "object" && !(cfg.inputSchema instanceof z.ZodType) ? cfg.inputSchema : null;
    if (shape) cfg!.inputSchema = z.object(shape).passthrough() as unknown as Record<string, z.ZodTypeAny>;
    known.set(name, shape ? new Set(Object.keys(shape)) : cfg?.inputSchema ? new Set<string>() : null);
    if (typeof h === "function") args[args.length - 1] = async (...ha: unknown[]) => {
      const pend = pending.get(name) ?? { ignored: [] };
      pending.delete(name);
      const k = known.get(name);
      let res: unknown;
      if (pend.invalid) res = err(pend.invalid.message, "INVALID_ARGS", pend.invalid.hint, { field: pend.invalid.field, ...(pend.invalid.fields.length > 1 ? { fields: pend.invalid.fields } : {}) });
      else {
        try { res = await (h as (...x: unknown[]) => unknown)(...ha); } catch (e) { res = err((e as Error).message || "처리하지 못했습니다.", (e as { code?: string }).code ?? "ERROR"); }
      }
      const extra: Record<string, unknown> = {};
      if (pend.ignored.length) {
        extra.ignored_args = pend.ignored;
        extra.hint = k === null ? `이 도구는 인자를 받지 않습니다(${pend.ignored.join(", ")} 는 무시했습니다).` : `이 도구는 ${pend.ignored.join(", ")} 인자를 모릅니다. 쓸 수 있는 인자: ${[...(k ?? [])].join(", ")}`;
      }
      if (quota) extra.meta = { quota };
      if (Object.keys(extra).length) addMeta(res, extra);
      addStructured(res);
      return res;
    };
    return origRegister(...args);
  };
  let pro = false; // 키 검증 후 채움 — 참고 이미지 제공 여부
  let keyId = ""; // 키 검증 후 채움 — 로그용(키 public_id)
  const guard = async (tool: string) => {
    const v = await verifyKey(key, tool);
    if (v.quota) quota = v.quota;
    // staff(임직원 전원 무료)·pro·team·admin 전부 pro — 플랜 판정은 여기 한 곳(verify 응답)에서 끝난다
    if (v.ok) { pro = v.plan !== "free" || v.roles.some((r) => r === "admin" || r === "superadmin"); keyId = v.keyId ?? ""; return null; }
    return err(v.message, v.code, v.status === 429 ? `하루 한도를 다 썼습니다. ${quota?.reset ?? "내일 0시(KST)"}에 다시 채워집니다.` : undefined);
  };
  const orgTypes = taxonomy.org_types.map((o) => o.id) as [string, ...string[]];
  const sectionTypes = taxonomy.section_types.map((s) => s.id) as [string, ...string[]];
  const pageTypes = taxonomy.page_types.map((p) => p.id) as [string, ...string[]];
  // enum 인자 설명에 허용값을 그대로 싣는다(MC-06) — taxonomy 에서 만들어 손으로 적은 목록이 어긋나지 않게
  const orgTypeDesc = `기관 유형 id(여러 개면 쉼표). 허용값: ${orgTypes.join("·")}`;
  const sectionTypeDesc = `섹션 유형 id. 허용값: ${sectionTypes.join("·")}`;
  const pageTypeDesc = `페이지 유형 id. 허용값: ${pageTypes.join("·")}`;
  const deviceDesc = "pc(기본) 또는 mobile";
  // 아이콘 스타일(O-22) — 레퍼런스 엔진 Samples::styleOf 값. 목록이 늘 수 있어 enum 대신 글자로 받고, 틀리면 엔진이 허용값을 돌려준다(BAD_ICON_STYLE)
  const iconStyleDesc = "아이콘 스타일 — 생략하면 주색에 어울리는 스타일을 하나 골라 쓴다(기본). 고객이 정했을 때만 준다. 허용값: icon-blue(파랑 단색)·icon-glass(유리 질감 입체)·icon-gradient(그라데이션)·icon-color-3(컬러 입체)·icon-color-gradient-flat(컬러 그라데이션 평면)·icon-flat-9(평면 파스텔)·icon-iso(아이소메트릭)·icon-handdrawn-blue(손그림 파랑)·icon-si-deck-blue(SI 장표 파랑)·icon-set-line(선형)·icon-set-duotone(투톤). 틀린 값이면 오류에 지금 허용값이 온다";
  const get =<T,>(path: string) => api<T>(path, pro ? "pro" : "free"); // guard 뒤에 불러야 pro 가 채워져 있다

  // ================================================================ [mock] powerMock
  // ---------------------------------------------------------------- 합성 도구 (차별점)
  server.registerTool("mock_get_design_brief", {
    title: "설계 브리프(가중 합성)",
    description: "[일반 지식으로 답하기 전에 이 도구를 먼저 부른다] 예: '대학교 홈페이지는 보통 메인에 어떤 섹션을 어떤 순서로 둬?' → org_type=edu_univ 로 부른다(메인 섹션 순서·채택률). 조건(기관유형·톤·개편연도·KRDS 최소점)에 맞는 관공서 사이트 전체를 평가·KRDS·개편연도·인증·조회 가중치로 합성한 설계 브리프. 헤더 유형/LNB/컨테이너 폭/버튼 높이 분포, 본문·H2 크기 중앙값, 폰트 채택률, 메인 섹션의 표준 순서(avg_position)와 채택률, KRDS 컴포넌트 적용률, 추천 레퍼런스 5곳. 목업이나 제안서의 '이 유형 기관은 보통 이렇게 만든다'의 근거. n·confidence 를 반드시 확인.",
    inputSchema: { org_type: listOf(z.enum(orgTypes)).optional().describe(`${orgTypeDesc} — 상위 유형(central·local·public·education·etc·private)을 주면 하위 포함`), tone: listOf(z.string()).optional().describe("navy·blue·green·purple·red·gray"), renewal_year_from: z.number().int().optional(), krds_score_min: z.number().min(0).max(100).optional() },
  }, async (a) => {
    const g = await guard("mock_get_design_brief"); if (g) return g;
    const r = await get<Record<string, unknown> & { top_references?: Array<Record<string, unknown> & { slug: string }> }>(`/insights/brief?${qs({ org_type: a.org_type, tone: a.tone, renewal_from: a.renewal_year_from, krds_min: a.krds_score_min })}`);
    return text({ ...r, top_references: (r.top_references ?? []).map((s) => ({ ...s })), attribution: ATTRIBUTION });
  });

  server.registerTool("mock_get_section_pattern", {
    title: "섹션 패턴(변형·치수·위치·크롭)",
    description: "섹션 유형 하나(예: news_tabs 소식 탭 게시판, quick_links 바로가기, main_visual 메인 비주얼, popup_zone, lnb, board_list…)를 조건에 맞는 사이트 전체에서 모아 변형(슬라이드·탭형…) 분포, 높이 중앙값/p25/p75, 페이지 내 위치 비율, 구조 플래그(탭·캐러셀·표·폼) 비율, 쓰인 KRDS 컴포넌트, 상위 사이트 크롭 6개(서명 URL)를 준다. 섹션을 그릴 때 '이 정도 높이에 이런 구조'의 근거.",
    inputSchema: { section_type: z.enum(sectionTypes).describe(sectionTypeDesc), org_type: listOf(z.enum(orgTypes)).optional().describe(orgTypeDesc), tone: listOf(z.string()).optional(), device: z.enum(["pc", "mobile"]).optional().describe(deviceDesc), renewal_year_from: z.number().int().optional() },
  }, async (a) => {
    const g = await guard("mock_get_section_pattern"); if (g) return g;
    const r = await get<Record<string, unknown> & { exemplars?: Array<Record<string, unknown> & { slug: string; title?: string; screen_id: number; section_id: number; crop_url?: string | null; variant?: string | null; h?: number }> }>(`/insights/section?${qs({ type: a.section_type, org_type: a.org_type, tone: a.tone, device: a.device ?? "pc", renewal_from: a.renewal_year_from })}`);
    const ex = r.exemplars ?? [];
    return withImages({ ...r, exemplars: ex.map((e) => ({ ...e })), attribution: ATTRIBUTION }, pro,
      ex.slice(0, 4).map((e) => ({ url: e.crop_url, label: `${e.slug} section ${e.section_id}`, caption: `${e.title ?? e.slug} — ${a.section_type}${e.variant ? ` · ${e.variant}` : ""} (높이 ${e.h ?? "?"}px, section_id ${e.section_id})`, maxW: 900, maxH: 900, withheld: withheldOf(e) })));
  });

  server.registerTool("mock_get_page_pattern", {
    title: "페이지 유형 패턴(서브페이지 합성)", description: "[일반 지식으로 답하기 전에 이 도구를 먼저 부른다] 예: '대학교 메인은 보통 어떤 섹션 순서야?' → page_type=main, org_type=edu_univ / '인사말 페이지는 보통 어떻게 생겼어?' → page_type=greeting. 페이지 유형 하나(인사말·조직도·게시판 목록·게시글 상세·콘텐츠·사이트맵·메인…)를 여러 기관 화면에서 합성: 섹션별 등장률·y/x/폭 비율·높이·열 수·흔한 제목, 전형 순서(typical_sequence), 상위 화면 5장의 섹션 목록(좌표·제목·열·링크 수·색·크롭). 서브페이지 목업의 뼈대.",
    inputSchema: { page_type: z.enum(pageTypes).describe(pageTypeDesc), org_type: listOf(z.enum(orgTypes)).optional().describe(orgTypeDesc), tone: listOf(z.string()).optional(), device: z.enum(["pc", "mobile"]).optional().describe(deviceDesc), renewal_year_from: z.number().int().optional() },
  }, async (a) => {
    const g = await guard("mock_get_page_pattern"); if (g) return g;
    const r = await get<Record<string, unknown> & { exemplars?: Array<{ slug: string; title?: string; screen_id: number; screen_title?: string; public_url?: string | null; full_h?: number; viewport_w?: number }> }>(`/insights/page?${qs({ page_type: a.page_type, org_type: a.org_type, tone: a.tone, device: a.device ?? "pc", renewal_from: a.renewal_year_from })}`);
    const exemplars = (r.exemplars ?? []).map((e) => ({ ...e }));
    return withImages({ ...r, exemplars, attribution: ATTRIBUTION }, pro,
      exemplars.slice(0, 4).map((e) => ({ url: e.public_url, label: `${e.slug} screen ${e.screen_id}`, caption: `${e.title ?? e.slug} — ${e.screen_title ?? a.page_type} (screen_id ${e.screen_id}, 원본 ${e.viewport_w ?? 1920}×${e.full_h ?? "?"}px 를 축소)`, maxW: 760, maxH: 1900, withheld: withheldOf(e) })));
  });

  server.registerTool("mock_recommend_references", {
    title: "레퍼런스 추천(가중 순위 + 근거)",
    description: "조건에 맞는 사이트를 평가 0.35·KRDS 0.25·개편연도 0.20·접근성 인증 0.10·조회 0.10 가중으로 순위 매겨 why(선정 근거 문장)와 디자인 요약(톤·주색·헤더·컨테이너·본문 폰트)을 준다. '어느 사이트를 참고할까'에 대한 답. 결과의 slug 로 mock_get_site 를 이어 부른다.",
    inputSchema: { org_type: listOf(z.enum(orgTypes)).optional().describe(orgTypeDesc), tone: listOf(z.string()).optional(), renewal_year_from: z.number().int().optional(), krds_score_min: z.number().min(0).max(100).optional(), limit: z.number().int().min(1).max(20).optional() },
  }, async (a) => {
    const g = await guard("mock_recommend_references"); if (g) return g;
    const r = await get<{ n: number; weights: unknown; items: Array<Record<string, unknown> & { slug: string }> }>(`/insights/references?${qs({ org_type: a.org_type, tone: a.tone, renewal_from: a.renewal_year_from, krds_min: a.krds_score_min, limit: a.limit ?? 5 })}`);
    return text({ ...r, items: r.items.map((s) => ({ ...s })), attribution: ATTRIBUTION });
  });

  // ---------------------------------------------------------------- 조회 도구 · 코드 · 초안 · 재현 묶음
  server.registerTool("mock_search_sites", {
    title: "관공서 사이트 검색", description: "기관유형·톤·레이아웃·개편연도·접근성 인증·KRDS 점수로 관공서 사이트를 검색한다. 기본 정렬은 사용자 평가(rating)가 높은 순. 결과에는 디자인 요약(주색·폰트·컨테이너·헤더 유형)과 썸네일 링크가 포함된다. 순위 근거가 필요하면 mock_recommend_references 를 쓴다.",
    inputSchema: { query: z.string().optional(), org_type: listOf(z.enum(orgTypes)).optional().describe(orgTypeDesc), tone: listOf(z.string()).optional().describe("navy·green·blue·purple…"), layout: listOf(z.string()).optional().describe("layout_mega·layout_lnb_left…"), renewal_year_from: z.number().int().optional(), renewal_year_to: z.number().int().optional(), wa_certified: z.boolean().optional(), krds_score_min: z.number().min(0).max(100).optional(), sort: z.enum(["rating", "renewed", "newest", "views", "krds"]).optional().describe("rating(기본, 평가순)·renewed(개편순)·newest(등록순)·views(조회순)·krds(KRDS 점수순)"), limit: z.number().int().min(1).max(50).optional(), cursor: z.string().optional() },
  }, async (a) => {
    const g = await guard("mock_search_sites"); if (g) return g;
    const r = await get<{ total: number; items: Array<Record<string, unknown> & { slug: string }>; next_cursor: string | null }>(`/sites?${qs({ q: a.query, org_type: a.org_type, tone: a.tone, layout: a.layout, renewal_from: a.renewal_year_from, renewal_to: a.renewal_year_to, wa: a.wa_certified === undefined ? undefined : a.wa_certified ? 1 : 0, krds_min: a.krds_score_min, sort: a.sort ?? "rating", limit: a.limit ?? 20, cursor: a.cursor })}`);
    return text({ total: r.total, next_cursor: r.next_cursor, items: r.items.map((s) => ({ ...s })), attribution: ATTRIBUTION });
  });

  server.registerTool("mock_get_site", {
    title: "기관 사이트 상세", description: "사이트 1곳의 디자인 데이터 전체 — 팔레트(대비비 포함)·타이포 스케일(h1~footer 역할별 크기·굵기·행간·자간·색)·역할별 색·간격(컨테이너·섹션 간격·버튼/입력 높이)·헤더/LNB·KRDS 준수(적용/부분/미적용)·페이지 목록(메인→서브)·네비게이션 상태(닫힘/열림/전체메뉴, depth2 메뉴명)·수상·사업정보(나라장터)·유사 사이트. Pro 키면 전부, Free 면 요약(gate.design_data 로 확인).",
    inputSchema: { slug: z.string().describe("mock_search_sites·mock_recommend_references 결과의 slug (예: seongnam-go-kr-main)") },
  }, async (a) => {
    const g = await guard("mock_get_site"); if (g) return g;
    const r = await get<Record<string, unknown> & { pages: Array<Record<string, unknown> & { screen_id: number }> }>(`/sites/${encodeURIComponent(a.slug)}`);
    return text({ ...r, pages: r.pages.map((p) => ({ ...p })), attribution: ATTRIBUTION });
  });

  server.registerTool("mock_get_design_system", {
    title: "기관 디자인 시스템(KRDS 분류 + 토큰)", description: "사이트 1곳의 디자인 시스템 문서(hb-ds/1) — KRDS 스타일 가이드 분류(색상·타이포그래피·형태·레이아웃·아이콘·엘리베이션)로 정리. 주색과 5~95 단계(파생)·역할별 색·대비비(AA 판정), KRDS 토큰 이름(display·heading-large…detail)에 대응한 실측 타이포 스케일, 모서리 반경·버튼/입력 높이, 컨테이너·4구간 브레이크포인트·헤더/LNB·메인 섹션 순서, 아이콘 스타일, 그림자. format=css|tailwind 면 바로 붙여 쓸 수 있는 CSS 변수·Tailwind v4 @theme 텍스트, tokens 면 평면 토큰 맵, powerguide 면 powerGuide 토큰 형식(DTCG {$value,$type}, guide_tokens 의 tokens.json 과 같은 구조). '이 기관 톤으로 마크업을 짜라'에 쓴다. Pro 전용(Free 키는 채워진 카테고리 목록만).",
    inputSchema: { slug: z.string().describe("사이트 slug (예: seongnam-go-kr-main)"), format: z.enum(["json", "css", "tailwind", "tokens", "powerguide"]).optional().describe("json(기본, 전체 문서)·css(CSS 변수)·tailwind(Tailwind v4 @theme)·tokens(평면 토큰 맵)·powerguide(powerGuide 토큰 형식 — tokens.json 과 같은 DTCG {$value,$type} 구조)") },
  }, async (a) => {
    const g = await guard("mock_get_design_system"); if (g) return g;
    const fmt = a.format ?? "json";
    const path = `/sites/${encodeURIComponent(a.slug)}/design-system${fmt === "json" ? "" : `?format=${fmt}`}`;
    if (fmt === "css" || fmt === "tailwind") {
      const res = await fetch(`${API}${path}`, { headers: legacyHeaders(pro ? "pro" : "free", "text/css") });
      const body = await res.text();
      // 오류 코드는 api() 와 같은 규칙(402·403 = PLAN_REQUIRED) — 이 갈래만 UPGRADE_REQUIRED 로 달랐다(MC-21)
      if (!res.ok) { let m = `HTTP ${res.status}`; let code = res.status === 404 ? "NOT_FOUND" : res.status === 402 || res.status === 403 ? "PLAN_REQUIRED" : res.status === 400 ? "BAD_REQUEST" : "ERROR"; try { const j = JSON.parse(body) as { error?: { message?: string; code?: string } }; m = j.error?.message ?? m; code = j.error?.code ?? code; } catch { /* 텍스트 */ } return err(m, code); }
      return { content: [{ type: "text" as const, text: body }] };
    }
    const r = await get<Record<string, unknown>>(path);
    return text({ ...r, attribution: ATTRIBUTION });
  });

  server.registerTool("mock_search_sections", {
    title: "섹션 검색(사이트 단위)", description: "사이트 1곳의 섹션(헤더·메인비주얼·바로가기·소식 탭 게시판·팝업존·뉴스티커·경로·페이지 타이틀·탭·LNB·게시판·만족도·푸터…) 크롭 목록. 각 항목에 structure.flags(탭·캐러셀·표·폼·페이지네이션)와 글 모양(제목·링크 글은 기관명·인명을 ○○ 로 일반화, 긴 글은 길이·형식만)이 있어 이미지를 열지 않아도 구조를 알 수 있다. 여러 사이트를 가로지르는 패턴은 mock_get_section_pattern.",
    inputSchema: { slug: z.string(), section_type: listOf(z.enum(sectionTypes)).optional().describe(`${sectionTypeDesc} (여러 개면 쉼표)`), page_type: listOf(z.enum(pageTypes)).optional().describe(`그 유형 화면의 섹션만. ${pageTypeDesc}`), screen_id: z.number().int().optional(), device: z.enum(["pc", "mobile"]).optional().describe(deviceDesc), compact: z.boolean().optional().describe("true(기본) = 크롭 URL·패싯 없이 위치·구성만 — 응답이 작다"), limit: z.number().int().min(1).max(200).optional() },
  }, async (a) => {
    const g = await guard("mock_search_sections"); if (g) return g;
    const r = await get<{ total: number; facets: unknown; items: Array<Record<string, unknown> & { id: number; screen_id: number }> }>(`/sites/${encodeURIComponent(a.slug)}/sections?${qs({ device: a.device ?? "pc", section_type: a.section_type, page_type: a.page_type, screen_id: a.screen_id })}`);
    const compact = a.compact ?? true;
    const items = r.items.slice(0, a.limit ?? 60).map((s) => {
      const base = { ...s } as Record<string, unknown>;
      if (compact) { delete base.crop_url; delete base.krds; delete base.confidence; }
      return base;
    });
    return text({ total: r.total, returned: items.length, facets: compact ? undefined : r.facets, items, attribution: ATTRIBUTION });
  });

  server.registerTool("mock_get_screen", {
    title: "화면 1장", description: "캡처 화면 1장의 섹션 목록(bbox·유형·variant·structure 플래그·KRDS 태그·크롭 링크)과 메타(뷰포트·전체 높이·페이지 유형). Pro 키면 화면 이미지(축소·워터마크)를 함께 준다 — 레이아웃·사진 처리·색을 직접 보고 따라 그린다.",
    inputSchema: { screen_id: z.number().int() },
  }, async (a) => {
    const g = await guard("mock_get_screen"); if (g) return g;
    const r = await get<Record<string, unknown> & { screen?: { site_slug?: string; site_title?: string; title?: string; public_url?: string | null; full_h?: number; kogl?: KoglInfo } }>(`/screens/${a.screen_id}`);
    const s = r.screen ?? {};
    return withImages({ ...r, attribution: ATTRIBUTION }, pro,
      [{ url: s.public_url, label: `${s.site_slug ?? ""} screen ${a.screen_id}`, caption: `${s.site_title ?? ""} — ${s.title ?? ""} (1920×${s.full_h ?? "?"}px 를 축소. 섹션 bbox 는 원본 좌표)`, maxW: 960, maxH: 2600, withheld: koglWithheld(s.kogl, s.public_url) }]);
  });

  server.registerTool("mock_get_section_code", {
    title: "섹션 코드(HTML·CSS)", description: "섹션 1개를 바로 쓰는 HTML·CSS 로. 실측값(실제 제목·메뉴 이름·열 수·면/글자/강조 색·모서리·사진 배치·사진 위 글자·겹침·아이콘 메뉴·그림자)과 그 사이트 주색·글꼴을 CSS 변수로 채운 시맨틱 마크업. section_id 는 mock_get_page_pattern exemplars·mock_get_screen·mock_search_sections 에서. Pro 이상. 섹션 이미지도 함께 준다.",
    inputSchema: { section_id: z.number().int() },
  }, async (a) => {
    const g = await guard("mock_get_section_code"); if (g) return g;
    const r = await get<Record<string, unknown> & { crop_url?: string; site_slug?: string; section_type?: string; html?: string; sample_images?: SampleImage[] }>(`/sections/${a.section_id}/code`);
    // 샘플 이미지는 공개 주소로 — 받은 HTML 을 파일로 저장해 열면 사진이 그대로 보이게
    const html = (r.html ?? "").replace(/src="(\/[^"]*\/api\/samples\/file\/|\/api\/samples\/file\/)/g, (_m, p: string) => `src="${PUBLIC_ORIGIN}${p}`);
    return withImages({ ...r, html, sample_images: (r.sample_images ?? []).map(absSample), attribution: ATTRIBUTION }, pro,
      [{ url: r.crop_url, label: `${r.site_slug ?? ""} section ${a.section_id}`, caption: `${r.site_slug ?? ""} ${r.section_type ?? ""} 원본 크롭 — 코드와 나란히 보고 차이를 보정`, maxW: 900, maxH: 1200, withheld: withheldOf(r) }]);
  });

  server.registerTool("mock_get_page_code", {
    title: "페이지 코드(한 장 조립)",
    description: "화면 한 장을 바로 열리는 HTML 문서로 조립한다. 섹션 코드를 위→아래로 쌓되 LNB 가 있으면 [LNB | 본문] 2단으로 배치하고, 사진 자리에는 홈박스 샘플 이미지(가상 인물·풍경)를 넣는다. screen_id 는 mock_get_page_pattern exemplars 에서. 화면 한 장을 참고할 때 쓴다 — 시안·홈페이지 요청은 mock_get_replica_kit(page=…)이 기본이다. 받은 뒤 문구를 내 기관 내용으로 바꾸고 섹션을 더하거나 뺀다. Pro 이상.",
    inputSchema: { screen_id: z.number().int() },
  }, async (a) => {
    const g = await guard("mock_get_page_code"); if (g) return g;
    const r = await get<Record<string, unknown> & { html?: string; sample_images?: SampleImage[]; site_slug?: string }>(`/screens/${a.screen_id}/code`);
    const html = (r.html ?? "").replace(/src="(\/[^"]*\/api\/samples\/file\/|\/api\/samples\/file\/)/g, (_m, p: string) => `src="${PUBLIC_ORIGIN}${p}`);
    // /screens/{id} 응답은 { screen: { public_url, kogl } } — 예전엔 scr.public_url 을 읽어 원본 화면 이미지가 늘 빠졌다(2026-10-15 수정)
    const scr = await get<{ screen?: { public_url?: string | null; kogl?: KoglInfo } }>(`/screens/${a.screen_id}`).catch(() => null);
    return withImages({ ...r, html, sample_images: (r.sample_images ?? []).map(absSample), attribution: ATTRIBUTION }, pro,
      [{ url: scr?.screen?.public_url, label: `${r.site_slug ?? ""} screen ${a.screen_id}`, caption: `원본 화면(축소) — 조립 결과와 나란히 보고 간격·색을 보정`, maxW: 760, maxH: 1900, withheld: koglWithheld(scr?.screen?.kogl, scr?.screen?.public_url) }]);
  });

  server.registerTool("mock_get_main_mockup", {
    title: "메인 목업(조립형)",
    description: "[빠른 초안 전용 — 사용자가 초안을 직접 요청했을 때만. 시안·홈페이지 요청은 mock_get_replica_kit] 관공서 메인을 한 장으로 조립한다. 본문 = 레퍼런스 메인 화면의 행 구성(칸 너비 비율·섹션 모양: 최근 게시물 사진 히어로·알림판 캐러셀·분야 탭 띠·달력·인물 띠·배너 롤링…)을 그대로 따른다 — 같은 유형이라도 rank 를 바꾸면 다른 레퍼런스(다른 구성)가 나온다. 레퍼런스에 없는 필수 블록은 메인 118곳 채택률(바로가기 99%·소식 탭 92%·푸터 87%·배너모음 81%·전자정부 표지 75%·캐러셀 제어 70%…, composition 에 근거), 디자인 토큰 = 레퍼런스 사이트, 메뉴·바로가기·탭 이름 = 레퍼런스 화면 수집값. 메인 비주얼·알림판·배너 캐러셀(자동 재생·이전·정지·다음), 소식 탭(방향키), 메가 메뉴, 통합검색·전체메뉴 레이어, 관련사이트 드롭다운이 실제로 동작한다. 기관·인물·글은 가상 샘플. org_type 만 주면 가중 점수 1위 레퍼런스, ref(slug)로 지정 가능. Pro 이상.",
    inputSchema: { org_type: z.string().optional(), org_name: z.string().max(30).optional().describe("고객 기관명(예: 청주시청) — 기관 종류(시·군·구·도·청…)에 맞는 가상 기관(한빛시·새솔군·푸른구…)으로 만든다. 레퍼런스가 구청이어도 시청 요청은 시로 나온다. 실제 기관명·로고로 바꾸는 것은 받은 HTML 에서"), ref: z.string().optional(), rank: z.number().int().min(1).max(50).optional().describe("1=가중 점수 1위 레퍼런스, 2·3…=다음 순위(다른 구성)") },
  }, async (a) => {
    const g = await guard("mock_get_main_mockup"); if (g) return g;
    const r = await get<Record<string, unknown> & { html?: string; sample_images?: SampleImage[]; site_slug?: string; screen_id?: number }>(`/mockups/main?${qs({ org_type: a.org_type, org_name: a.org_name, ref: a.ref, rank: a.rank })}`);
    const html = (r.html ?? "").replace(/src="(\/[^"]*\/api\/samples\/file\/|\/api\/samples\/file\/)/g, (_m, p: string) => `src="${PUBLIC_ORIGIN}${p}`);
    return { content: [{ type: "text" as const, text: JSON.stringify({ ...r, html, sample_images: (r.sample_images ?? []).map(absSample), attribution: ATTRIBUTION }) }] };
  });

  server.registerTool("mock_build_homepage", {
    title: "홈페이지 한 벌(메인+서브)",
    description: "[빠른 초안 전용 — 사용자가 초안을 직접 요청했을 때만. 시안·홈페이지 요청은 mock_get_replica_kit] 메인과 서브페이지 여러 장을 한 홈페이지로 만든다 — 모든 페이지가 같은 가상 기관·색·글꼴·주 메뉴를 쓴다(mock_get_main_mockup·mock_get_page_code 를 따로 부르면 페이지마다 레퍼런스 기관이 달라 기관명·색·메뉴가 섞인다). 메인 = mock_get_main_mockup 과 같은 조립(레퍼런스 메인의 행 구성·동작하는 캐러셀·탭·메가 메뉴), 서브 = 메인과 같은 사이트의 그 유형 화면을 먼저 쓰고 없으면 같은 기관 유형에서 분해 품질이 좋은 화면으로 키트(KRDS) 블록 조립. pages 에 서브 유형(board_list·board_view·content·greeting·org_chart·faq·location·history·vision·form…)을 쉼표로, 최대 8장. primary(#RRGGBB)·font 를 주면 고객 브랜드로 전체를 칠한다. 기관·인물·글은 가상 샘플. Pro 이상.",
    inputSchema: {
      org_type: z.string().optional().describe("기관 유형 id — 예 local_basic·central_ministry·public_corp·edu_univ_private·edu_school·etc_welfare·etc_assoc·private_corp·private_culture. 비우면 org_name 으로 짐작한다(대학교·학교·복지관·재단·협회·미술관·회사 등). 게시 레퍼런스가 없는 종류는 가까운 종류로 넓혀 고른다"),
      org_name: z.string().max(30).optional().describe("고객 기관명(예: 청주시청) — 기관 종류(시·군·구·도·청…)에 맞는 가상 기관(한빛시·새솔군·푸른구…)으로 만든다. 레퍼런스가 구청이어도 시청 요청은 시로 나온다. 실제 기관명·로고로 바꾸는 것은 받은 HTML 에서"),
      ref: z.string().optional().describe("메인 레퍼런스 사이트 slug(선택)"),
      rank: z.number().int().min(1).max(50).optional().describe("1=가중 점수 1위 레퍼런스, 2·3…=다른 구성"),
      pages: listOf(z.enum(pageTypes)).optional().describe(`서브페이지 유형 목록(쉼표), 기본 board_list,content,greeting. ${pageTypeDesc}`),
      primary: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().describe("고객 주색 — 모든 페이지에 적용"),
      font: z.string().max(40).optional().describe("고객 글꼴 이름 — 예 Noto Sans KR, Nanum Gothic"),
    },
  }, async (a) => {
    const g = await guard("mock_build_homepage"); if (g) return g;
    const r = await get<{ main?: { html?: string; sample_images?: SampleImage[] }; pages?: { html?: string; sample_images?: SampleImage[] }[] } & Record<string, unknown>>(`/mockups/site?${qs({ org_type: a.org_type, org_name: a.org_name, ref: a.ref, rank: a.rank, pages: a.pages, primary: a.primary, font: a.font })}`);
    const abs = (h?: string) => (h ?? "").replace(/src="(\/[^"]*\/api\/samples\/file\/|\/api\/samples\/file\/)/g, (_m, p: string) => `src="${PUBLIC_ORIGIN}${p}`);
    const main = r.main ? { ...r.main, html: abs(r.main.html), sample_images: (r.main.sample_images ?? []).map(absSample) } : r.main;
    const pages = (r.pages ?? []).map((p) => ({ ...p, html: abs(p.html), sample_images: (p.sample_images ?? []).map(absSample) }));
    return { content: [{ type: "text" as const, text: JSON.stringify({ ...r, main, pages, attribution: ATTRIBUTION }) }] };
  });

  server.registerTool("mock_get_replica_kit", {
    title: "재현 묶음(실제 사이트 수준 시안을 직접 만들 재료)",
    description: "[시안·목업·홈페이지 제작 요청의 기본 도구] 실제 관공서 사이트 수준의 시안이 필요할 때 쓴다. 레퍼런스 화면 한 장의 캡처(여러 장으로 잘라 첨부)·줄 묶음(rows)·섹션 좌표와 구성(sections)과 함께, 가상 기관(persona)·색(theme)·샘플 이미지 전체(samples)·머티리얼 아이콘(icons)·동작 스크립트와 규약(behavior)·제작 절차(procedure)·검사 기준(acceptance)을 한 번에 준다. 받은 AI 가 직접 HTML 한 파일을 만든다 — 배치(줄·칸·크기·간격·밀도)는 레퍼런스와 같게, 글·이미지·색은 전부 바꾸고, 캐러셀·탭·메뉴·레이어·검색은 behavior 규약으로 실제 동작하게. mock_get_main_mockup(자동 조립)보다 품질이 높지만 만드는 데 시간이 든다. 서브페이지는 page 에 유형을 준다(같은 사이트의 화면을 먼저 고른다).",
    inputSchema: {
      org_type: z.string().optional().describe("기관 유형 id — 예 local_basic·central_ministry·public_corp·edu_univ_private·edu_school·etc_welfare·etc_assoc·private_corp·private_culture. 비우면 org_name 으로 짐작한다(대학교·학교·복지관·재단·협회·미술관·회사 등). 게시 레퍼런스가 없는 종류는 가까운 종류로 넓혀 고른다"),
      org_name: z.string().max(30).optional().describe("고객 기관명(예: 청운군청·한빛대학교·한빛복지관·한빛문화재단·한빛솔루션) — 관공서·대학·학교·복지관·재단·협회·문화시설·기업 어느 종류든 된다. 기관장 직함(시장·총장·교장·관장·이사장·대표이사)·주 메뉴·문구가 그 종류에 맞게 나온다. 없으면 레퍼런스 종류에 맞는 가상 기관"),
      ref: z.string().optional().describe("레퍼런스 사이트 slug(선택)"),
      rank: z.number().int().min(1).max(50).optional().describe("1=가중 점수 1위 레퍼런스, 2·3…=다른 레퍼런스(시안을 여러 개 만들 때)"),
      page: z.enum(["main", ...pageTypes.filter((p) => p !== "main")] as [string, ...string[]]).optional().describe(`기본 main. 서브는 board_list·board_view·content·greeting 등. ${pageTypeDesc}`),
      primary: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().describe("고객 주색"),
      font: z.string().max(40).optional().describe("고객 글꼴 이름"),
      width: z.number().int().min(960).max(1880).optional().describe("PC 본문 폭 px — 고객이 폭을 정했을 때만. 생략하면 최소 1400px(레퍼런스가 좁으면 칸 비율을 지켜 넓혀 준다)"),
      lang: z.enum(["ko", "en", "ja", "zh", "fr", "es", "de", "vi"]).optional().describe("제작 언어(허용값: ko·en·ja·zh·fr·es·de·vi) — 생략하면 한국어. 영어·일본어 등이면 응답 language.rule 대로 메뉴·본문·기관 이름까지 그 언어로 만든다"),
      zoom: z.boolean().optional().describe("true 면 참고 이미지를 본문 폭만 잘라 더 크게 준다(좌우 여백 제외). 처음엔 생략해 전체를 보고, 글자 크기·칸 안쪽이 안 읽히면 true 로 한 번 더 부른다"),
      icon_style: z.string().max(40).optional().describe(iconStyleDesc),
    },
  }, async (a) => {
    const g = await guard("mock_get_replica_kit"); if (g) return g;
    const r = await get<Record<string, unknown> & { reference?: { capture_url?: string | null; site_slug?: string; screen_id?: number; width?: number; height?: number } }>(`/mockups/replica?${qs({ org_type: a.org_type, org_name: a.org_name, ref: a.ref, rank: a.rank, page: a.page, primary: a.primary, width: a.width, font: a.font, lang: a.lang, icon_style: a.icon_style })}`);
    const ref = r.reference ?? {};
    const cbox = (ref as { content?: { x: number; w: number } }).content;
    const zoom = a.zoom && cbox ? { x: cbox.x, w: cbox.w, vw: ref.width ?? 1920 } : undefined;
    type Piece = { src: string; screen_id: number; src_y: number; src_h: number; y: number; h: number; capture_url?: string | null; image_withheld?: string | null };
    const mix = (ref as { mix?: { pieces?: Piece[] } | null }).mix ?? null;
    let slices: Array<{ block: ImageBlock; from: number; to: number; scale: number; src?: string }> = [];
    if (pro && mix?.pieces?.length) {
      // 섞기: 조각마다 공평하게 — A가 앞쪽이라 14장 상한을 다 먹는 문제(B조각 누락) 방지.
      // 각 조각 최대 6장씩 먼저 다 받아온 뒤 라운드로빈으로 14장까지만 싣는다(조각당 최소 1장 보장).
      const perPiece = await Promise.all(mix.pieces.map((p) =>
        refSlices(p.capture_url, `mix ${p.src}`, 900, 1500, 6, zoom, { y: p.src_y, h: p.src_h }),
      ));
      const pieces = mix.pieces;
      const missing: string[] = [];
      const withheld: string[] = []; // 공공누리 2~4유형이라 레퍼런스 엔진이 원본을 뺀 조각(O-04) — "못 읽음"과 구분해 알린다
      perPiece.forEach((part, i) => {
        const p = pieces[i]; if (!p || part.length) return;
        const where = `${p.src}(screen ${p.screen_id} y${p.src_y}~${p.src_y + p.src_h} → 시안 y${p.y}~${p.y + p.h})`;
        if (withheldOf(p)) withheld.push(`${where} — ${withheldOf(p)}`); else missing.push(where);
      });
      // 라운드로빈 인터리브: 각 조각에서 1장씩 번갈아 가져온다.
      // 응답 크기(D8): 첫 바퀴(조각당 1장)는 무조건, 그다음부터는 이미지 합계 약 380KB(base64) 안에서만 더 싣는다.
      let bytes = 0;
      for (let round = 0; round < 6; round++) {
        perPiece.forEach((part, i) => {
          const s = part[round];
          const p = pieces[i];
          if (s && p && slices.length < 14 && (round === 0 || bytes + s.block.data.length <= 380_000)) {
            slices.push({ ...s, from: p.y + s.from, to: p.y + s.to, src: p.src });
            bytes += s.block.data.length;
          }
        });
        if (slices.length >= 14) break;
      }
      if (missing.length || withheld.length) {
        (ref as Record<string, unknown>).images_missing = {
          ...(missing.length ? { pieces: missing } : {}),
          ...(withheld.length ? { withheld, withheld_reason: "공공누리 제한(2~4유형, 상업 이용·변경 제한)으로 원본 이미지를 제공하지 않는 구간이다 — 오류가 아니다. 다시 불러도 같다." } : {}),
          note: "이 구간의 참고 이미지가 없어 좌표(sections·rows)로만 만들어야 한다. 글자 크기·칸 안쪽이 불확실하면 zoom=true로 한 번 더 부르거나 rank를 바꿔 다시 부른다(공공누리 제한 구간은 rank 를 바꿔야 이미지가 있는 레퍼런스가 나온다).",
        };
      }
      mix.pieces = mix.pieces.map((p) => ({ ...p, capture_url: undefined }));
    } else if (pro) {
      slices = await refSlices(ref.capture_url, `${ref.site_slug ?? ""} screen ${ref.screen_id ?? ""}`, 900, 1500, zoom ? 12 : 8, zoom);
    }
    // 단일 레퍼런스가 공공누리 제한이면(reference.kogl.note) 그 이유를 images_missing 에 싣는다(O-04)
    const singleWithheld = !mix ? koglWithheld((ref as { kogl?: KoglInfo }).kogl, ref.capture_url) : null;
    if (singleWithheld) (ref as Record<string, unknown>).images_missing = { withheld: [`${ref.site_slug ?? "?"} screen ${ref.screen_id ?? "?"} — ${singleWithheld}`], withheld_reason: "공공누리 제한(2~4유형)으로 원본 이미지를 제공하지 않는다 — 오류가 아니다. 이미지가 필요하면 rank 를 바꿔 다른 레퍼런스를 받는다." };
    const scale = slices[0]?.scale ?? null;
    const data = { ...r, reference: { ...ref, capture_url: undefined, images: slices.length ? { count: slices.length, width: 900, scale, x_offset: zoom ? zoom.x : 0, note: `${zoom ? `본문 폭만 자른 확대본이다(원본 x ${zoom.x}~${zoom.x + zoom.w}). 원본 x = 이미지 x ÷ scale + x_offset. ` : ""}참고 이미지는 원본의 ${scale ? Math.round(scale * 100) : "?"}% 크기다. 이미지에서 잰 px ÷ scale = 원본 px. sections 의 x·y·w·h(원본 px)는 자동 분해라 칸이 빠지거나 합쳐졌을 수 있다 — 이미지와 다르면 이미지가 우선이다.` } : null }, attribution: ATTRIBUTION };
    const content: Array<TextBlock | ImageBlock> = [{ type: "text", text: JSON.stringify(data) }];
    slices.forEach((s, i) => content.push({ type: "text", text: `[참고 이미지 ${i + 1}/${slices.length}] ${s.src ? `출처 ${s.src} · 시안 y ${s.from}~${s.to}px 구간` : `레퍼런스 캡처 y ${s.from}~${s.to}px (원본 px 기준)`} — 이 구간의 줄·칸·글자 크기·둥글기·겹침을 그대로 따른다${s.src ? "(가로는 본문 폭 container_w 에 맞춘다)" : ""}` }, s.block));
    if (!slices.length) content.push({ type: "text", text: singleWithheld
      ? `참고 이미지 미제공 — 공공누리 제한: ${singleWithheld} rank 를 바꾸면 이미지가 있는 다른 레퍼런스를 받을 수 있습니다.`
      : pro
      ? `참고 이미지를 싣지 못했습니다 — 레퍼런스 캡처(${ref.site_slug ?? "?"} screen ${ref.screen_id ?? "?"})를 서버에서 읽지 못했습니다. ref 를 비우거나 rank 를 바꿔 다시 부르세요. 좌표만으로 만들면 품질이 크게 떨어집니다.`
      : "참고 이미지를 싣지 못했습니다(Pro 이상 키에서 제공). sections·rows 의 좌표로만 만들면 품질이 떨어집니다." });
    return { content };
  });

  /** 새 플랫폼 시안 보관·게시·판정 기록 — 사용자 키(Bearer)로 /api/v1/mock/mockups… 를 부른다(시안 주인 = 키 주인). 옛 internal() 모양({ok,status,json})을 유지 */
  const internal = async (p: string, body: Record<string, unknown>) => {
    const route = p === "mockup-pages" ? "/mock/mockups" : "/mock/mockups/" + p.slice("mockup-pages/".length);
    // 판정 기록은 서명해서 보낸다 — 플랫폼이 이 서명 없는 점수·통과를 받지 않는다(mock.php)
    let headers: Record<string, string> | undefined;
    const m = p.match(/^mockup-pages\/([^/]+)\/check$/);
    if (m && JUDGE_SECRET) {
      const score = Math.max(0, Math.min(100, Math.trunc(Number(body.score) || 0)));
      headers = { "X-Pp-Judge": createHmac("sha256", JUDGE_SECRET).update(`${decodeURIComponent(m[1] ?? "")}|${score}|${body.pass ? 1 : 0}`).digest("hex") };
    }
    const r = await pp<Record<string, unknown>>(route, key, { method: "POST", body, headers });
    const json = (r.ok ? (r.data ?? {}) : { error: { code: r.body?.code, message: ppMsg(r, "요청 실패") } }) as (Record<string, unknown> & { error?: { code?: string; message?: string } });
    return { ok: r.ok, status: r.status, json };
  };

  server.registerTool("mock_publish_mockup", {
    title: "시안 게시(미리보기 주소)",
    description: "mock_check_mockup 을 통과한 시안을 게시해, 사진이 그대로 뜨는 미리보기 주소(30일)를 받는다. mock_check_mockup 이 돌려준 token 만 보낸다 — HTML 을 다시 보내지 않는다(홈박스가 보관하고 있다). 마지막 판정이 통과가 아니면 게시되지 않는다. claude.ai 아티팩트·채팅 미리보기처럼 외부 이미지를 막는 곳에서는 홈박스 샘플 사진이 안 보이므로, 받은 url 을 사용자에게 준다. 게시한 뒤 고치려면 mock_check_mockup(token, edits) 로 다시 판정하고 같은 token 으로 다시 게시한다(주소 그대로). 검색엔진에 노출되지 않는다. Pro 이상.",
    inputSchema: {
      token: z.string().max(40).describe("mock_check_mockup 이 돌려준 token"),
      title: z.string().max(120).optional().describe("시안 이름(예: 덕성군 메인 시안)"),
    },
  }, async (a) => {
    const g = await guard("mock_publish_mockup"); if (g) return g;
    if (!pro) return err("시안 미리보기 주소는 Pro 이상 키에서 쓸 수 있습니다. 무료 키는 HTML 파일로 저장해 브라우저로 여세요.", "PLAN_REQUIRED");
    const r = await internal("mockup-pages", { mode: "publish", token: a.token, title: a.title });
    if (!r.ok || !r.json?.token) return err(r.json?.error?.message ?? `게시하지 못했습니다(HTTP ${r.status}).`, r.json?.error?.code ?? "ERROR");
    return text({ url: `${PP_PUBLIC}${String(r.json.path ?? `/api/v1/p/${String(r.json.token)}`)}`, token: r.json.token, expires_at: r.json.expires_at, bytes: r.json.bytes, note: "이 주소를 사용자에게 그대로 준다. 고칠 때는 mock_check_mockup(token, edits) 로 다시 판정한 뒤 같은 token 으로 게시하면 주소가 그대로다." });
  });

  /** 섞기 판정용 레퍼런스 한 장 — 조각마다 출처 캡처를 잘라 시안 좌표(y)에 붙인다. 폭 960 으로 축소. */
  const composeRef = async (sharp: typeof import("sharp").default, pieces: Array<{ capture_url?: string | null; src_y: number; src_h: number; y: number; width: number }>, height: number): Promise<Buffer | null> => {
    const W = 960; const cache = new Map<string, Buffer>(); const layers: Array<{ input: Buffer; left: number; top: number }> = [];
    for (const p of pieces) {
      if (!p.capture_url) continue;
      const u = p.capture_url.startsWith("http") ? p.capture_url : `${ORIGIN}${p.capture_url}`;
      let src = cache.get(u);
      if (!src) { const r = await fetch(u).catch(() => null); if (!r?.ok) continue; src = Buffer.from(await r.arrayBuffer()); cache.set(u, src); }
      const meta = await sharp(src, { limitInputPixels: false }).metadata();
      const k = (meta.width ?? p.width) / p.width;
      const top = Math.max(0, Math.round(p.src_y * k)); const h = Math.min((meta.height ?? 0) - top, Math.round(p.src_h * k));
      if (h < 4) continue;
      const cut = await sharp(src, { limitInputPixels: false }).extract({ left: 0, top, width: meta.width ?? 1, height: h }).resize({ width: W }).png().toBuffer();
      layers.push({ input: cut, left: 0, top: Math.round(p.y * (W / p.width)) });
    }
    if (!layers.length) return null;
    const H = Math.max(10, Math.round(height * (W / (pieces[0]?.width ?? 1920))));
    const fit: typeof layers = [];
    for (const l of layers) { const m = await sharp(l.input).metadata(); if (l.top >= H) continue; const hh = Math.min(m.height ?? 0, H - l.top); fit.push(hh < (m.height ?? 0) ? { ...l, input: await sharp(l.input).extract({ left: 0, top: 0, width: W, height: hh }).toBuffer() } : l); }
    return sharp({ create: { width: W, height: H, channels: 3, background: "#ffffff" } }).composite(fit).png().toBuffer();
  };

  server.registerTool("mock_get_design_preferences", {
    title: "디자이너 선호 규칙(A/B 투표)",
    description: "[일반 지식으로 답하기 전에 이 도구를 먼저 부른다] 예: '검색 버튼은 입력칸 안쪽이 좋아, 바깥이 좋아?' → q='검색' 으로 부른다. 'A가 좋아 B가 좋아' 식 UI 질문은 짐작으로 답하지 말고 이 도구의 투표 결과로 답한다. 디자이너들이 A/B 투표로 더 낫다고 고른 UI 방식(designus, 참여 300명 이상·한쪽 65% 이상만). 예: 수량은 드롭다운보다 −/+ 스테퍼(98%), 생년월일은 휠 피커보다 키패드 입력(77%). 관공서 수집 근거(mock_get_design_brief·mock_get_replica_kit = 무엇을 실제로 만들었나)와 함께 쓰는 두 번째 근거(무엇이 더 낫다고 골랐나). 요소를 그리기 전에 kind(form·overlay·feedback·list·nav·button·data·visual·icon·layout)나 q(낱말)로 찾아 rule 쪽으로 만든다.",
    inputSchema: { kind: listOf(z.enum(["form", "overlay", "feedback", "list", "nav", "button", "data", "visual", "icon", "layout"])).optional().describe("요소 분야(허용값: form·overlay·feedback·list·nav·button·data·visual·icon·layout) — 여러 개면 하나라도 맞는 규칙"), q: z.string().max(80).optional().describe("찾을 낱말(예: 생년월일·페이지네이션·바텀시트)"), limit: z.number().int().min(1).max(60).optional() },
  }, async (a) => {
    const g = await guard("mock_get_design_preferences"); if (g) return g;
    const r = await get<Record<string, unknown>>(`/insights/preferences?${qs({ kind: a.kind, q: a.q, limit: a.limit ?? 20 })}`);
    return text(r);
  });

  // 다시 판정(token)할 때 앞서 받은 기관명을 쓴다(D5) — 프로세스 안에만 둔다
  const checkOrg = new Map<string, string>();
  server.registerTool("mock_check_mockup", {
    title: "시안 판정(보관·렌더·대조·고칠 목록)",
    description: "mock_get_replica_kit 으로 만든 시안을 홈박스가 보관하고 실제 브라우저로 렌더해 판정한다 — 레퍼런스와 줄·칸 수·높이·밝기 구성 대조, 레퍼런스 기관 정보 노출, 안 뜨는 이미지·외부 이미지, 빈 칸·글자 기호·세로 중심 게이트, 캐러셀·탭·메뉴·레이어·검색 실제 동작. 점수(100)·고칠 목록(fixes)·token 을 주고, Pro 면 레퍼런스|시안 나란히 이미지도 준다. 85점 이상·치명 항목 0 이 통과. ① 처음: mock_check_mockup(ref_id, html). ② 미통과: HTML 을 처음부터 다시 쓰지 말고 mock_check_mockup(token, edits=[{find, replace}]) 로 고친 부분만 보낸다(find 는 시안 원문에 한 번만 나오는 글자 그대로). ③ 통과: mock_publish_mockup(token). 미통과인 채로 끝내지 않는다(미통과 시안은 목록·갤러리에 남지 않는다). 받아쓰기 줄이기: 동작 스크립트는 <script data-hb-behavior></script> 한 줄만 적으면 채워지고, 서브 페이지는 base_token 과 <!--hb:use style|header|footer--> 로 메인의 공통 부분을 채운다. 한 번에 수십 초 걸린다. 부르기 전에 mock_get_replica_kit 응답 맨 앞의 preflight 10가지(가로 스크롤·반응형·본문 폭·세로 간격·높이·동작·주 메뉴·호버·서브 비주얼·게이트)를 직접 확인하면 한 번에 통과한다.",
    inputSchema: {
      ref_id: z.string().max(400).optional().describe("mock_get_replica_kit 응답의 reference.ref_id 를 그대로"),
      screen_id: z.number().int().optional().describe("(이전 방식) reference.screen_id — ref_id 가 없을 때만"),
      html: z.string().min(50).optional().describe("시안 HTML 전체 — 처음 한 번만 보낸다"),
      token: z.string().max(40).optional().describe("앞선 mock_check_mockup 이 준 token — 주면 보관된 시안을 다시 판정한다"),
      base_token: z.string().max(40).optional().describe("서브 페이지를 처음 보낼 때: 메인 시안의 token. html 안의 <!--hb:use style-->·<!--hb:use header-->·<!--hb:use footer-->(또는 메인에서 <!--hb:part 이름-->…<!--/hb:part--> 로 표시한 구간)를 메인 것으로 채운다"),
      edits: z.array(z.object({ find: z.string().min(1), replace: z.string(), all: z.boolean().optional() })).max(80).optional().describe("보관된 시안에 적용할 찾아 바꾸기. find 는 시안 원문 그대로(공백 포함)이고 한 군데만 맞아야 한다(여러 곳을 다 바꾸려면 all: true). token 과 함께 쓴다"),
      title: z.string().max(120).optional().describe("시안 이름"),
      device: z.enum(["pc", "mobile"]).optional().describe("기본 pc(1920). mobile 은 390 폭"),
      org_name: z.string().max(80).optional().describe("재현 묶음의 persona.org(시안에 쓴 기관명) — 주면 title·로고·h1 에 그 이름이 있는지 확인한다. 다시 판정(token)할 때는 생략해도 앞서 준 값을 쓴다"),
    },
  }, async (a) => {
    const g = await guard("mock_check_mockup"); if (g) return g;
    let refId = a.ref_id ?? (a.screen_id ? String(a.screen_id) : "");
    if (!a.html && !a.token) return err("처음 판정은 html, 다시 판정은 token(+edits)이 필요합니다.", "INVALID_ARGS", "처음: mock_check_mockup(ref_id, html) · 다시: mock_check_mockup(token, edits)", { field: "html" });
    if (!refId && !a.token) return err("처음 판정에는 ref_id 가 필요합니다(mock_get_replica_kit 응답의 reference.ref_id).", "INVALID_ARGS", "다시 판정할 때는 token 만 주면 보관된 시안의 ref_id 를 쓴다", { field: "ref_id" });
    // 보관(새 HTML 또는 고친 부분 적용) → 적용된 HTML 을 받아 렌더한다. 다시 판정(token)은 ref_id 를 안 줘도 보관된 시안의 ref_id 를 쓴다
    const d = await internal("mockup-pages", { mode: "draft", token: a.token, base_token: a.base_token, html: a.html, edits: a.edits, title: a.title, ref_id: refId });
    if (!d.ok || !d.json?.token) return err(d.json?.error?.message ?? `시안을 보관하지 못했습니다(HTTP ${d.status}).`, d.json?.error?.code ?? "ERROR");
    if (!refId) refId = String(d.json.ref_id ?? "");
    if (!refId) return err("이 시안에는 보관된 ref_id 가 없습니다. ref_id 를 함께 보내세요(mock_get_replica_kit 응답의 reference.ref_id).", "INVALID_ARGS", undefined, { field: "ref_id" });
    type Piece = { capture_url?: string | null; judge_url?: string | null; src_y: number; src_h: number; y: number; width: number };
    type Ref = { capture_url?: string | null; judge_url?: string | null; site_slug?: string; height?: number; pieces?: Piece[] } & Record<string, unknown>;
    let ref: Ref;
    // 판정 전용 원본(O-45): 서버 비밀로 서명하면 레퍼런스 엔진이 공공누리 2~4유형 화면도 judge_url(2분 만료)을 준다.
    // judge_url 은 아래 판정 렌더·대조에만 쓰고 사용자 응답(글·이미지 블록)·판정 기록에는 싣지 않는다.
    const jts = String(Math.floor(Date.now() / 1000));
    const judgeHeaders = JUDGE_SECRET ? { "X-Pp-Judge-Ts": jts, "X-Pp-Judge-Ref": createHmac("sha256", JUDGE_SECRET).update(`ref|${refId}|${jts}`).digest("hex") } : undefined;
    try { ref = await api<Ref>(`/mockups/check-ref?ref_id=${encodeURIComponent(refId)}`, pro ? "pro" : "free", judgeHeaders); } catch (e) { return err(String((e as Error).message), (e as { code?: string }).code ?? "NOT_FOUND"); }
    const judgeUrl = ref.capture_url ?? ref.judge_url ?? null;
    const judgePieces = ref.pieces?.map((p) => ({ ...p, capture_url: p.capture_url ?? p.judge_url ?? null }));
    // 판정 전용 원본을 하나라도 썼으면 레퍼런스|시안 나란히 이미지(왼쪽이 원본)도 사용자에게 주지 않는다
    const usedJudge = (!ref.capture_url && !!ref.judge_url) || !!ref.pieces?.some((p) => !p.capture_url && !!p.judge_url);
    ref = { ...ref, judge_url: undefined, pieces: ref.pieces?.map(({ judge_url: _j, ...p }) => p) };
    const token = String(d.json.token); const html = String(d.json.html ?? "");
    if (a.org_name) { checkOrg.set(token, a.org_name); if (checkOrg.size > 2000) checkOrg.delete(checkOrg.keys().next().value as string); }
    const want = a.org_name ?? checkOrg.get(token) ?? "";
    try {
      const { checkMockup } = await import("./qa/check.mjs");
      const pw = await import("playwright-core");
      const engine = (process.env.MCP_BROWSER ?? "chromium") as "chromium" | "firefox";
      const { default: sharp } = await import("sharp");
      let refImage: Buffer | null = null;
      if (judgePieces?.length) refImage = await composeRef(sharp, judgePieces, Number(ref.height ?? 0)).catch(() => null);
      else if (judgeUrl) { const r = await fetch(judgeUrl.startsWith("http") ? judgeUrl : `${ORIGIN}${judgeUrl}`).catch(() => null); if (r?.ok) refImage = Buffer.from(await r.arrayBuffer()); }
      // 판정 브라우저는 사용자 HTML 을 그리므로 샌드박스를 켠다(O-34). Playwright 는 chromiumSandbox:true 를 줘야 --no-sandbox 를 안 붙인다(args 에서 빼는 것만으론 안 켜진다). 서버는 AppArmor 프로필(scripts/apparmor-pw-headless-shell)이 있어야 뜬다 —
      // 프로필이 없는 서버(이관 직후 등)에선 PP_JUDGE_NO_SANDBOX=1 로 예전처럼 끌 수 있다
      const judgeArgs = engine === "chromium" ? [...(process.env.PP_JUDGE_NO_SANDBOX === "1" ? ["--no-sandbox"] : []), "--disable-dev-shm-usage"] : [];
      const { result, compare, thumb } = await checkMockup({ html, ref, refImage, sharp, want, textKeys: await textSampleKeys(), iconKeys: textKeyCache.icons, peers: Array.isArray(d.json.peers) ? d.json.peers : [], width: a.device === "mobile" ? 390 : 1920, launch: () => pw[engine].launch({ args: judgeArgs, chromiumSandbox: engine === "chromium" && process.env.PP_JUDGE_NO_SANDBOX !== "1" }) });
      const rec = await internal(`mockup-pages/${token}/check`, { score: result.score, pass: result.pass, ref_id: refId, result: { ...result, rows: undefined }, thumb: thumb ? thumb.toString("base64") : undefined, device: a.device ?? "pc", page: refId.startsWith("mix1:") ? "main" : String((ref as { page_type?: string }).page_type ?? "") }).catch(() => null);
      // 기록이 안 되면 점수·통과가 DB 에 NULL 로 남아 게시가 막힌다 — 조용히 넘기지 않고 로그에 남긴다(PP_JUDGE_SECRET 누락이 흔한 원인)
      if (!rec?.ok) console.error(`[mcp] 판정 기록 실패 token=${token.slice(0, 8)} status=${rec?.status ?? "-"} ${rec?.json?.error?.message ?? ""}${JUDGE_SECRET ? "" : " (PP_JUDGE_SECRET 없음)"}`);
      console.log(`[mcp] mock_check_mockup key=${keyId} token=${token.slice(0, 8)} ref=${refId.slice(0, 40)} score=${result.score} pass=${result.pass} fixes=${result.fixes.length}[${result.fixes.map((f: string) => String(f).split(/[ ·:(—]/)[0]).join(",")}] n=${a.token ? "re" : 1} bytes=${html.length}${a.edits ? ` edits=${a.edits.length}` : ""}`);
      const next = result.pass
        ? `통과 — mock_publish_mockup(token="${token}") 으로 게시한다. HTML 을 다시 보내지 않는다.`
        : `미통과(${result.score}점) — fixes 를 위에서부터 고친다. HTML 전체를 다시 보내지 말고 mock_check_mockup(token="${token}", edits=[{find, replace}]) 로 고친 부분만 보낸다(ref_id 는 다시 안 줘도 된다). 85점 이상·치명 0 이 통과. 통과할 때까지 반복한다 — 미통과 시안은 사용자 목록·갤러리에 남지 않고 하루 뒤 지워지므로, 미통과인 채로 작업을 끝내거나 결과로 내놓지 않는다.`;
      // 디자이너 선호 조언(2026-10-03) — 시안에 든 요소에 맞는 designus 투표 규칙. 점수에는 넣지 않는다(조언)
      const preference_tips = Array.isArray(d.json.pref_tips) && d.json.pref_tips.length ? { how: "디자이너 A/B 투표에서 뚜렷하게 갈린 결과다. 시안의 같은 요소가 instead_of 쪽이면 rule 쪽으로 바꾸는 것을 권한다(감점 없음).", tips: d.json.pref_tips } : undefined;
      // 개선 체크리스트 되먹임(2026-10-15) — 다른 시안들에서 반복된 결함. fixes 와 별개로, 지금 시안에 같은 것이 없는지 보게 한다(점수에는 넣지 않는다)
      const lessons = Array.isArray(rec?.json?.lessons) ? (rec.json.lessons as Array<{ area?: string; text?: string; hits?: number }>) : [];
      const recurring = lessons.length ? { how: "다른 시안들에서 여러 번 걸린 결함이다. 이 시안에도 같은 것이 없는지 확인하고, 있으면 함께 고친다(감점 없음).", items: lessons.map((l) => `[${l.area ?? ""}] ${l.text ?? ""}`) } : undefined;
      const content: Array<TextBlock | ImageBlock> = [{ type: "text", text: JSON.stringify({ token, ref_id: refId, reference: ref.site_slug, ...result, summary: undefined, preference_tips, recurring, next }) }];
      if (usedJudge && compare?.slices?.length) content.push({ type: "text", text: "레퍼런스에 공공누리 제한(2~4유형) 구간이 있어 판정은 원본으로 대조했지만, 레퍼런스|시안 나란히 이미지는 제공하지 않습니다. fixes 를 따라 고치세요." });
      else if (pro && compare?.slices?.length) compare.slices.slice(0, 6).forEach((s, i) => content.push({ type: "text", text: `[나란히 ${i + 1}] 왼쪽 레퍼런스 · 오른쪽 시안 (y ${s.from}~${s.to})` }, { type: "image", data: s.jpeg.toString("base64"), mimeType: "image/jpeg" }));
      return { content };
    } catch (e) {
      return err(`판정 렌더에 실패했습니다: ${String((e as Error).message).slice(0, 200)} (시안은 token="${token}" 으로 보관돼 있다 — 같은 token 으로 다시 부른다)`, "RENDER_FAILED");
    }
  });

  server.registerTool("mock_get_behavior_kit", {
    title: "동작 스크립트·규약",
    description: "목업의 조작 요소(캐러셀·탭·주 메뉴·전체메뉴·검색·선택 상자·접기)를 실제로 움직이게 하는 스크립트와 data-hb 속성 규약. 시안을 직접 만들거나 고칠 때 받아서 </body> 앞에 넣는다. 모양만 그리고 동작이 없는 시안은 미완성이다.",
    inputSchema: {},
  }, async () => {
    const g = await guard("mock_get_behavior_kit"); if (g) return g;
    return text(await get<Record<string, unknown>>(`/mockups/behavior`));
  });

  const screenTypes = taxonomy.assembly.screen_types.map((x) => x.code) as [string, ...string[]];
  const sectionCodes = taxonomy.assembly.section_codes.map((x) => x.code) as [string, ...string[]];
  server.registerTool("mock_assemble_screen", {
    title: "디자인 조립 명세(Assembly Spec)",
    description: "[화면 코드를 직접 짜기 전에 이 도구를 먼저 부른다] 예: '공지 목록 화면을 React 코드로 줘' → screen_type=LIST(게시판 목록), keyword=공지 로 부른다(code 는 기본 켜짐) — 코드를 직접 짜지 말고 이 도구의 code(React·Vue 페이지·theme.css)를 쓴다. 고객 키워드로 관공서 화면을 재조립한 명세(JSON)를 만든다 — 복제가 아니라 여러 기관의 검증된 섹션을 근거로 한 재배치(docs/11). ① 조건에 맞는 게시 화면(기관당 1장, 최대 60)을 가중 점수+키워드로 고르고 ② 섹션을 조립 코드(GNB·NOTICE_LIST·QUICK_MENU…)로 묶어 ③ 채택률·영역·칸 수·항목 수·밀도 최빈값(PatternSummary)을 내고 ④ 컴포넌트·KRDS 컴포넌트를 정한 뒤 ⑤ 슬롯을 배치한다. 모든 슬롯에 ref(원본 section_id)·rationale(근거), 같은 기관 섹션은 2개 이하, 테마는 KRDS 기본(또는 theme=CUSTOM + primary). quality 에 게이트 7종 결과. sections 로 넣을 코드를 직접 지정할 수 있다. 이미지는 싣지 않는다. code 에 명세로 만든 Vue·React 페이지(홈박스 키트 = KRDS 부품)·theme.css·부품 대응표(섹션 코드 → 키트 컴포넌트·import·props)가 함께 온다 — 그대로 쓰거나 대응표를 보고 고쳐 쓴다.",
    inputSchema: {
      keyword: z.string().max(40).optional().describe("예: 민원, 관광, 복지 — 사이트명·화면 제목·본문에 맞으면 가점"),
      screen_type: z.enum(screenTypes).optional().describe(`화면 종류, 기본 MAIN. 허용값: ${screenTypes.join("·")}`),
      org_type: listOf(z.enum(orgTypes)).optional().describe(orgTypeDesc),
      sections: listOf(z.enum(sectionCodes)).optional().describe(`넣을 섹션 코드(쉼표). 생략하면 채택률 50%+(전역 계열 30%+)로 자동. 허용값: ${sectionCodes.join("·")}`),
      theme: z.enum(["KRDS", "CUSTOM"]).optional().describe("KRDS(기본) 또는 CUSTOM(primary 로 고객 주색)"),
      primary: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().describe("theme=CUSTOM 일 때 고객 주색"),
      font: z.string().max(60).optional(),
      device: z.enum(["pc", "mobile"]).optional().describe(deviceDesc),
      project: z.string().max(80).optional(),
      code: z.boolean().optional().describe("기본 true — 명세로 만든 Vue·React 페이지 코드(홈박스 키트 부품)·theme.css·부품 대응표를 함께 준다. 명세만 필요하면 false"),
    },
  }, async (a) => {
    const g = await guard("mock_assemble_screen"); if (g) return g;
    const r = await get<unknown>(`/assembly?${qs({ keyword: a.keyword, screen_type: a.screen_type, org_type: a.org_type, sections: a.sections, theme: a.theme, primary: a.primary, font: a.font, device: a.device, project: a.project, code: a.code === false ? "0" : undefined })}`);
    const parsed = AssemblyResult.safeParse(r); // CLAUDE.md §8.3 — 응답 직전 스키마 검증
    if (!parsed.success) return err(`조립 결과가 명세 스키마와 맞지 않습니다: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join(" / ")}`, "SCHEMA_MISMATCH");
    return text({ ...parsed.data, attribution: ATTRIBUTION });
  });

  const sampleKinds = ["hero-city", "hero-nature", "sub-visual", "leader", "leader-field", "citizen", "news-thumb", "place", "banner", "popup", "card-news", "poster", "infographic", "emblem", "signature", "icon-set"] as const;
  server.registerTool("mock_get_sample_images", {
    title: "샘플 이미지(목업용 사진·배너)",
    description: "목업의 사진·배너 자리에 넣을 홈박스 자체 제작 이미지(가상 한국인·한국 풍경, 실존 인물·기관 아님). 메인 비주얼(도시·자연)·서브 상단 띠·기관장 인사말 사진·기관장 현장 활동·주민·소식 썸네일·시설·배너·팝업·카드뉴스(정사각 SNS 표지)·행사 포스터(세로)·숫자 인포그래픽·가상 기관 로고. 배너·팝업 등 글자가 든 이미지엔 가상 기관명이 박혀 있으니 목업 기관과 같은 이름(tags)을 먼저 쓴다. 시안을 여러 장 만들 때는 앞 시안에서 쓴 id 를 피해 seed 를 바꿔 부른다(목업 도구는 같은 키로 부르면 자동으로 겹치지 않게 고른다). 결과의 url 을 <img src> 나 background-image 에 그대로 쓴다(공개 주소, 서명 없음). 넓은 사진은 text_safe.side(글자를 얹을 쪽)·text_color·scrim(어둡게 깔지)을 준다. section_type 을 주면 그 섹션에 맞는 종류를 고른다. 회색 빈 박스 대신 반드시 이 이미지를 쓴다.",
    inputSchema: {
      // 허용값을 설명에 그대로 적는다 — "hero" 처럼 비슷한 말로 부르면 -32602 로 첫 호출이 실패했다(2026-10-09 시험)
      kind: listOf(z.enum(sampleKinds)).optional().describe(`이미지 종류(여러 개면 쉼표). 허용값만 받는다: ${sampleKinds.join("·")} — hero-city(도시 메인 비주얼)·hero-nature(자연 메인 비주얼)·sub-visual(서브 상단 띠)·leader(기관장 인사말 사진)·leader-field(기관장 현장)·citizen(주민)·news-thumb(소식 썸네일)·place(시설·장소)·banner(가로 배너)·popup(세로 팝업)·card-news(정사각 SNS)·poster(세로 포스터)·infographic(숫자 인포그래픽)·emblem(가상 기관 로고)·signature(서명)·icon-set(아이콘). "hero" 같은 줄임말은 안 된다`),
      section_type: z.string().optional().describe("섹션 유형 id(예: main_visual·quick_links). kind 대신 주면 그 섹션에 맞는 종류를 고른다"),
      tags: listOf(z.string()).optional().describe("태그(가상 기관명 등, 쉼표 구분)"),
      limit: z.number().int().min(1).max(24).optional().describe("개수 1~24, 기본 6"),
      seed: z.number().int().optional().describe("같은 조건에서 다른 묶음을 받을 때 바꾼다"),
      icon_style: z.string().max(40).optional().describe(iconStyleDesc),
    },
  }, async (a) => {
    const g = await guard("mock_get_sample_images"); if (g) return g;
    const r = await get<{ count: number; library: Record<string, number>; items: SampleImage[]; usage: string }>(`/samples?${qs({ kind: a.kind, section_type: a.section_type, tags: a.tags, limit: a.limit ?? 6, seed: a.seed, icon_style: a.icon_style })}`);
    const items = r.items.map(absSample);
    return withImages({ ...r, items }, pro, items.slice(0, 6).map((s) => ({ url: s.thumb_url, label: s.id, caption: `${s.id} — ${s.alt}${s.text_safe ? ` (글자는 ${s.text_safe.side === "left" ? "왼쪽" : "오른쪽"}, ${s.text_safe.text_color === "light" ? "흰 글자" : "검은 글자"}${s.text_safe.scrim ? ", 어두운 그라데이션 필요" : ""})` : ""}${s.temporary ? " · 임시본" : ""}`, maxW: 480, maxH: 480 })));
  });

  server.registerTool("mock_get_pattern_stats", {
    title: "디자인 패턴 통계(단일 지표)", description: "게시된 사이트를 집계한 채택률: header_type(메가/2뎁스/햄버거)·lnb_position·tone·container_px·font_body·wa_certified. 지표 하나만 빠르게 볼 때. 설계 전체 근거는 mock_get_design_brief 가 한 번에 준다.",
    inputSchema: { metric: z.enum(["header_type", "lnb_position", "tone", "container_px", "font_body", "wa_certified"]).describe("허용값: header_type·lnb_position·tone·container_px·font_body·wa_certified"), org_type: listOf(z.enum(orgTypes)).optional().describe(orgTypeDesc), renewal_year_from: z.number().int().optional() },
  }, async (a) => {
    const g = await guard("mock_get_pattern_stats"); if (g) return g;
    const all: Array<Record<string, unknown>> = [];
    let cursor: string | null = null;
    for (let i = 0; i < 20; i++) {
      const r: { items: Array<Record<string, unknown>>; next_cursor: string | null } = await get(`/sites?${qs({ org_type: a.org_type, renewal_from: a.renewal_year_from, limit: 50, cursor })}`);
      all.push(...r.items); cursor = r.next_cursor; if (!cursor) break;
    }
    const keyOf = (s: Record<string, unknown>): string => { const d = (s.design ?? {}) as Record<string, unknown>; const v = a.metric === "wa_certified" ? (s.wa_certified ? "인증" : "미인증") : a.metric === "container_px" ? String(d.container_px ?? "") : a.metric === "font_body" ? String(d.font_body ?? "") : String(d[a.metric] ?? ""); return v || "미확인"; };
    const counts = new Map<string, number>();
    for (const s of all) counts.set(keyOf(s), (counts.get(keyOf(s)) ?? 0) + 1);
    const n = all.length || 1;
    const confidence = all.length >= 30 ? "high" : all.length >= 10 ? "medium" : "low";
    return text({ metric: a.metric, n: all.length, confidence, buckets: [...counts].sort((x, y) => y[1] - x[1]).map(([key, count]) => ({ key, count, pct: Number(((count / n) * 100).toFixed(1)) })), note: `게시된 사이트 ${all.length}곳 기준${a.renewal_year_from ? ` · ${a.renewal_year_from}년 이후 개편` : ""}${confidence === "low" ? " · 표본이 적어 참고만" : ""}`, attribution: ATTRIBUTION });
  });

  // ================================================================ [guide] guide_krds (나머지 guide_* 는 tools/guide.ts)
  server.registerTool("guide_krds", {
    title: "KRDS 컴포넌트 가이드", description: "KRDS(대한민국 디지털 정부 디자인시스템) 컴포넌트 55종의 이름·분류·공식 가이드 링크(krds.go.kr 실제 문서)·홈박스 섹션 매핑·대응 부품(kit_id). component·category 로 5개 이하로 좁히면 사용·접근성·상호작용·개발 지침 글과 관리자 메모(note)도 준다.",
    inputSchema: { component: z.string().optional().describe("krds_components.id (예: tab, breadcrumb, pagination). 없으면 전체 목록"), category: z.string().optional().describe("identity·navigation·layout·action·selection·feedback·help·input·settings·content·mobile") },
  }, async (a) => {
    const g = await guard("guide_krds"); if (g) return g;
    const base = "https://www.krds.go.kr/html/site/component/";
    // 한글 분류 이름도 받는다("입력" → input) — 영문 id 만 받아 '입력' 이 NOT_FOUND 였다(2026-10-10 MCP 시험)
    const KO_CAT: Record<string, string> = { 아이덴티티: "identity", 정체성: "identity", 탐색: "navigation", 내비게이션: "navigation", 레이아웃: "layout", 배치: "layout", 액션: "action", 동작: "action", 선택: "selection", 피드백: "feedback", 도움: "help", 도움말: "help", 입력: "input", 설정: "settings", 콘텐츠: "content", 모바일: "mobile" };
    const cat = a.category ? (KO_CAT[a.category.trim()] ?? a.category.trim().toLowerCase()) : undefined;
    const comp = a.component?.trim().toLowerCase();
    // 지침 글은 플랫폼 /guide/krds(관리자 덮어쓰기 반영)에서 받아 이름으로 붙인다 — 공용 분류표만 읽어 관리자 KRDS 대응표 수정이 MCP 에 안 보이던 것(2026-10-14).
    // 두 원본의 이름 표기가 조금 다르다('텍스트 영역 (Textarea)'·'범위슬라이드') → 괄호·공백을 빼고 맞춘다.
    type KrdsRule = { ko: string; en?: string; id?: string; usage?: string[]; a11y?: string[]; interaction?: string[]; dev?: string[]; kwcag?: string[]; note?: string };
    const norm = (s: string) => s.replace(/\(.*?\)/g, "").replace(/\s+/g, "").toLowerCase();
    const rr = await pp<KrdsRule[]>("/guide/krds", key).catch(() => null); // 플랫폼이 안 되면 분류표만이라도
    const rules = rr?.ok && Array.isArray(rr.data) && rr.data.length > 0 ? new Map(rr.data.map((x) => [norm(x.ko), x])) : null;
    const ruleOf = (c: { name_ko: string; name_en: string }) => rules?.get(norm(c.name_ko)) ?? (rules ? [...rules.values()].find((x) => x.en && norm(x.en) === norm(c.name_en)) : undefined);
    const list = taxonomy.krds_components.filter((c) => (!comp || c.id === comp || (c as { name_ko?: string }).name_ko === a.component) && (!cat || c.category === cat) && (!rules || ruleOf(c))); // 관리자가 숨긴 항목은 빠진다
    if (list.length === 0) return err(`KRDS 컴포넌트 '${a.component ?? a.category}' 없음. category 는 ${[...new Set(taxonomy.krds_components.map((c) => c.category))].join("·")} 중 하나(한글 이름도 됨)`, "NOT_FOUND");
    const map = taxonomy.section_krds_default_map as Record<string, string[]>;
    const full = list.length <= 5; // 전체 목록에 지침 글까지 실으면 수만 자 — 몇 개로 좁혔을 때만 싣는다
    return text({
      items: list.map((c) => {
        const r = ruleOf(c);
        const guide = r ? (full ? { kit_id: r.id || null, usage: r.usage ?? [], a11y: r.a11y ?? [], interaction: r.interaction ?? [], dev: r.dev ?? [], kwcag: r.kwcag ?? [], note: r.note ?? null } : { kit_id: r.id || null, rule_count: ["usage", "a11y", "interaction", "dev"].reduce((n, k) => n + ((r as Record<string, unknown>)[k] as string[] | undefined ?? []).length, 0), note: r.note ?? null }) : {};
        return { ...c, guide_url: `${base}${(c as { guide_file?: string }).guide_file ?? "component_summary.html"}`, sections: Object.entries(map).filter(([, v]) => v.includes(c.id)).map(([k]) => k), ...guide };
      }),
      hint: full ? undefined : "지침 글(사용·접근성·상호작용·개발)은 component 나 category 로 좁히거나 guide_search_rules 로 찾는다",
      // 목업 레퍼런스 출처 문구(ATTRIBUTION)가 아니라 KRDS 출처 — 2026-10-15 guide 점검
      attribution: "출처: 행정안전부 KRDS(범정부 UI/UX 디자인 시스템) 공식 가이드. guide_url 이 원문이고, 지침 요약은 powerGuide 가 정리한 것입니다.",
    });
  });

  // ================================================================ [assets] powerAssets (파워플러스 옛 PHP MCP 도구 7종 → 새 플랫폼 /api/v1/assets)
  // 출처: powerPlus server/src/McpServer.php(search_assets·get_asset·similar_assets·style_set·list_categories·list_topics·suggest_keywords).
  // 권한(공개 등급)은 새 플랫폼 PHP(Access::whereVisible)가 키 소유자 기준으로 거른다 — MCP 는 거르지 않는다.
  const absUrls = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(absUrls);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, typeof x === "string" && x.startsWith("/api/v1/") ? `${PP_PUBLIC}${x}` : absUrls(x)]));
    return v;
  };
  /** emptyHint — 결과가 0건이면 이유·다음 할 일을 hint 로 붙인다(MC-25, 서버가 hint 를 주면 그것을 둔다) */
  const assets = async (p: string, emptyHint?: string) => {
    const r = await pp<unknown>(p, key);
    if (!r.ok) return err(ppMsg(r, "자산 API 오류"), ppCode(r));
    const { data, ...rest } = (r.body ?? {}) as Record<string, unknown>;
    const empty = emptyHint && rest.hint === undefined && Array.isArray(data) && data.length === 0;
    return text(absUrls({ ...rest, data, ...(empty ? { hint: emptyHint } : {}) }));
  };
  const assetCats = ["icon", "photo", "illust", "diagram", "ppt", "logo", "mockup_sample"] as const;
  const assetCatDesc = `자산 분류. 허용값: ${assetCats.join("·")}`;

  server.registerTool("assets_search", {
    title: "자산 검색",
    description: "powerAssets 자산(아이콘·사진·일러스트·다이어그램·장표·로고) 검색. 검색어는 이름·태그(국문·영문)에 낱말별로 일치. 결과의 thumb_url 은 미리보기, 원본은 assets_get. 키 소유자 플랜·등급에서 볼 수 있는 것만 나온다(meta.hidden = 등급 때문에 가려진 수).",
    inputSchema: { query: z.string().optional().describe("검색어(예: '파랑 행정', 'handshake')"), category: z.enum(assetCats).optional().describe(assetCatDesc), set: z.string().optional().describe("세트 id(assets_style_set 결과)"), topic: z.string().optional().describe("assets_list_topics 의 주제 낱말 — 검색어에 더해진다"), sort: z.enum(["newest", "popular", "name"]).optional().describe("허용값: newest·popular·name"), limit: z.number().int().min(1).max(60).optional(), page: z.number().int().min(1).optional() },
  }, async (a) => {
    const g = await guard("assets_search"); if (g) return g;
    const q = [a.query, a.topic].filter(Boolean).join(" ");
    return assets(`/assets/items?${qs({ q, category: a.category, set: a.set, sort: a.sort, limit: a.limit ?? 24, page: a.page, channel: "mcp" })}`,
      "0건입니다. 낱말을 줄이거나 assets_suggest_keywords(words=[…]) 로 등록된 다른 표현을 찾아 다시 검색한다. meta.hidden 이 있으면 키 등급 때문에 가려진 것이다.");
  });

  server.registerTool("assets_get", {
    title: "자산 상세",
    description: "자산 상세(태그·세트·사용 횟수·파일 주소). id 하나 또는 ids(최대 20개)를 한 번에 — 여러 개를 볼 때는 ids 로 한 번만 부른다(호출 1건으로 셈). 볼 수 없는 자산은 {id, locked:true, reason} 으로 표시된다. preview=true 면 미리보기 그림을 함께 보여 준다(id 하나일 때만, 폭 축소 JPEG).",
    inputSchema: { id: z.string().optional().describe("자산 id(assets_search 결과의 id)"), ids: z.array(z.string()).min(1).max(20).optional().describe("여러 자산 id(최대 20)"), preview: z.boolean().optional() },
  }, async (a) => {
    const one = (a.id ?? "").trim();
    const many = (a.ids ?? []).map((x) => String(x).trim()).filter(Boolean);
    if (!one && many.length === 0) return err("id 또는 ids 가 필요합니다.", "INVALID_ARGS", "assets_search 결과의 id 를 넣는다(예: assets_get(id='...') 또는 assets_get(ids=['...','...']))", { field: "id" });
    const g = await guard("assets_get"); if (g) return g;
    if (many.length > 0 || !one) {
      const list = [...new Set([...(one ? [one] : []), ...many])].slice(0, 20);
      const items = await Promise.all(list.map(async (id) => {
        const r = await pp<Record<string, unknown>>(`/assets/items/${encodeURIComponent(id)}`, key);
        if (r.ok && r.data) return absUrls(r.data);
        return { id, locked: true, reason: r.status === 404 ? "없거나 볼 수 없는 자산" : r.status === 403 ? "이 키의 플랜·등급으로는 볼 수 없음" : ppMsg(r, "자산 API 오류") };
      }));
      return text({ items, total: items.length, locked: items.filter((x) => (x as { locked?: boolean }).locked).length });
    }
    const r = await pp<Record<string, unknown>>(`/assets/items/${encodeURIComponent(one)}`, key);
    if (!r.ok || !r.data) return err(ppMsg(r, "자산 API 오류"), r.ok ? "ERROR" : ppCode(r));
    const body = text(absUrls(r.data));
    if (!a.preview) return body;
    try {
      const f = await fetch(`${PP_API}/assets/items/${encodeURIComponent(one)}/file/thumb`, { headers: { Authorization: `Bearer ${key ?? ""}`, "X-Requested-With": "powerMCP" } });
      if (!f.ok) return body;
      const { default: sharp } = await import("sharp");
      const buf = await sharp(Buffer.from(await f.arrayBuffer())).resize({ width: 480, withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 78 }).toBuffer();
      return { content: [...body.content, { type: "image" as const, data: buf.toString("base64"), mimeType: "image/jpeg" as const }] };
    } catch { return body; }
  });

  server.registerTool("assets_similar", {
    title: "비슷한 자산", description: "키워드 태그가 많이 겹치는 자산(같은 카테고리 우선). overlap = 겹친 태그 수.",
    inputSchema: { id: z.string(), limit: z.number().int().min(1).max(48).optional() },
  }, async (a) => {
    const g = await guard("assets_similar"); if (g) return g;
    return assets(`/assets/items/${encodeURIComponent(a.id)}/similar?${qs({ limit: a.limit })}`);
  });

  server.registerTool("assets_style_set", {
    title: "같은 스타일 세트", description: "같은 스타일로 만든 자산 묶음. id(자산) 를 주면 그 자산의 세트를, set_id 를 주면 그 세트를 보여 준다. 한 화면·한 장표 안 아이콘은 세트 하나로 맞춘다.",
    inputSchema: { id: z.string().optional(), set_id: z.string().optional(), limit: z.number().int().min(1).max(120).optional() },
  }, async (a) => {
    const g = await guard("assets_style_set"); if (g) return g;
    let set = a.set_id;
    if (!set && a.id) {
      const r = await pp<{ set?: { id: string } | null }>(`/assets/items/${encodeURIComponent(a.id)}`, key);
      if (!r.ok) return err(ppMsg(r, "자산 API 오류"), ppCode(r));
      set = r.data?.set?.id;
      if (!set) return err("이 자산은 세트에 속하지 않습니다.", "NOT_FOUND");
    }
    if (!set) return assets(`/assets/sets`);
    return assets(`/assets/items?${qs({ set, limit: a.limit ?? 60 })}`);
  });

  server.registerTool("assets_list_categories", {
    title: "자산 카테고리", description: "카테고리별 자산 수(키 소유자가 볼 수 있는 수와 전체 수).", inputSchema: {},
  }, async () => {
    const g = await guard("assets_list_categories"); if (g) return g;
    return assets(`/assets/categories`);
  });

  server.registerTool("assets_list_topics", {
    title: "자산 주제", description: "카테고리 안에서 많이 쓰인 주제 낱말(태그)과 세트. assets_search 의 topic 으로 쓴다.",
    inputSchema: { category: z.enum(assetCats).optional().describe(assetCatDesc), query: z.string().optional().describe("주제 낱말(예: '기후', '환경') — 주면 그 말이 붙은 에셋의 관련 주제를 돌려준다") },
  }, async (a) => {
    const g = await guard("assets_list_topics"); if (g) return g;
    return assets(`/assets/topics?${qs({ category: a.category, q: a.query })}`);
  });

  server.registerTool("assets_suggest_keywords", {
    title: "검색어 추천", description: "입력한 낱말로 시작·포함하는 등록 태그. 비우면 최근 30일 인기 검색어. 검색 결과가 0일 때 다른 표현을 찾는 데 쓴다. 낱말 여러 개는 words(최대 10)로 한 번에 — 낱말별 결과가 by_word 로 온다(호출 1건으로 셈).",
    inputSchema: { query: z.string().optional(), words: z.array(z.string()).min(1).max(10).optional().describe("여러 낱말(최대 10)"), limit: z.number().int().min(1).max(50).optional() },
  }, async (a) => {
    const g = await guard("assets_suggest_keywords"); if (g) return g;
    const words = [...new Set([...(a.query && a.words ? [a.query] : []), ...(a.words ?? [])].map((w) => String(w).trim()).filter(Boolean))].slice(0, 10);
    if (words.length === 0) return assets(`/assets/suggest?${qs({ q: a.query, limit: a.limit })}`);
    const by_word = await Promise.all(words.map(async (w) => {
      const r = await pp<unknown>(`/assets/suggest?${qs({ q: w, limit: a.limit })}`, key);
      return r.ok ? { word: w, ...((r.body ?? {}) as Record<string, unknown>) } : { word: w, error: ppMsg(r, "자산 API 오류") };
    }));
    return text({ by_word });
  });

  // ================================================================ [guide] guide_tokens · [deck] deck_jobs
  server.registerTool("guide_tokens", {
    title: "디자인 토큰 파일", description: "powerGuide 가 배포하는 디자인 토큰 산출물(CSS·SCSS·JS·TS·Java·Tailwind·Figma 등). file 없이 부르면 목록, file 을 주면 그 파일 내용(텍스트, 최대 200KB). 정본 = 역할 토큰 하나(solideo-tokens.css 의 text·bg·fill·border·icon·accent 앞머리) — 화면 코드는 이 이름만 쓴다. 회사·기관 색은 skin-*.css 예시 스킨(brand 단계만 덮음)을 함께 불러 바꾼다(예: skin-solideo.css = 솔리데오 크림슨).",
    inputSchema: { file: z.string().optional().describe("목록의 name(예: solideo-tokens.css)") },
  }, async (a) => {
    const g = await guard("guide_tokens"); if (g) return g;
    let names: string[];
    try { names = fs.readdirSync(GUIDE_DIR).filter((n) => fs.statSync(path.join(GUIDE_DIR, n)).isFile()); } catch { return err("토큰 폴더를 찾지 못했습니다(GUIDE_FILES_DIR).", "NOT_FOUND"); }
    if (!a.file) return text({ items: names.map((n) => ({ name: n, bytes: fs.statSync(path.join(GUIDE_DIR, n)).size, url: `${PP_PUBLIC}/guide-files/${n}` })) });
    // "tokens.css" 처럼 접두를 빼고 불러도 찾는다(실제 이름 solideo-tokens.css) — 끝이 같은 파일이 하나일 때만
    let name = path.basename(a.file);
    if (!names.includes(name)) {
      const hits = names.filter((n) => n.toLowerCase().endsWith(`-${name.toLowerCase()}`) || n.toLowerCase().endsWith(name.toLowerCase()));
      if (hits.length === 1 && hits[0]) name = hits[0];
    }
    if (!names.includes(name)) return err(`'${name}' 파일이 없습니다. file 없이 불러 목록을 보세요.`, "NOT_FOUND");
    const full = path.join(GUIDE_DIR, name);
    if (fs.statSync(full).size > 200_000) return text({ name, url: `${PP_PUBLIC}/guide-files/${name}`, note: "200KB 를 넘어 내용 대신 주소만 줍니다." });
    return text({ name, url: `${PP_PUBLIC}/guide-files/${name}`, content: fs.readFileSync(full, "utf8") });
  });

  server.registerTool("deck_jobs", {
    title: "내 장표 변환 작업", description: "powerDeck 에서 키 소유자가 맡긴 장표 변환 작업 목록(상태·진행률·결과). 변환 자체는 웹 화면(/deck)에서 한다.", inputSchema: {},
  }, async () => {
    const g = await guard("deck_jobs"); if (g) return g;
    return assets(`/deck/jobs`);
  });

  // ================================================================ 모듈 파일 — [guide]·[powerplus]·assets_pick / [deck] kit·판정 / [mock 와이어]
  registerGuideTools(server, { guard, pp, key, text, err, ppMsg });
  registerDeckKitTools(server, { guard, pp, key, text, err, ppMsg });
  registerMockWireTools(server, { guard, pp, key, text, err, ppMsg });
  TOOL_COUNT = registered;
  return server;
}
buildServer(null); // 도구 수를 헬스 응답에 싣기 위해 한 번 만들어 센다

// ---------------------------------------------------------------- [HTTP 서버]
/** 옛 도구 이름 별칭 — tools/call 의 params.name 을 새 이름으로 바꿔 넘긴다(묶음 요청 포함). tools/list 에는 새 이름만 나온다. */
function aliasCalls(body: unknown): unknown {
  const fix = (m: unknown) => {
    const msg = m as { method?: string; params?: { name?: string } } | null;
    if (msg && msg.method === "tools/call" && msg.params && typeof msg.params.name === "string" && ALIASES[msg.params.name]) {
      msg.params.name = ALIASES[msg.params.name];
    }
    return m;
  };
  return Array.isArray(body) ? body.map(fix) : fix(body);
}

// Streamable HTTP, 세션리스: 요청마다 서버·전송 생성 (SDK 권장 stateless 패턴)
createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/health" || url.pathname === "/mcp/health") { res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true, name: "powerMCP", api: PP_API, legacy_api: API, legacy_key: LEGACY_KEY !== "", tools: TOOL_COUNT, aliases: Object.keys(ALIASES).length, version: VERSION })); return; }
  if (!/^\/(mcp)?\/?$/.test(url.pathname)) { res.writeHead(404).end(); return; }
  const auth = req.headers.authorization ?? "";
  // 키: Authorization 헤더 우선, 없으면 URL `?key=` — Claude 웹·데스크톱 "사용자 지정 커넥터"와 ChatGPT 커넥터는 헤더를 넣을 칸이 없어
  //   헤더 방식이면 도구 목록만 보이고 호출은 전부 UNAUTHORIZED 였다(사용자 테스트 2026-09-24). URL 에 실은 키도 같은 검증(verifyKey)을 탄다.
  const qk = url.searchParams.get("key");
  // 커넥터 "요청 헤더"는 사람이 손으로 넣는다 — `Bearer` 를 빼거나(값만), 이름을 X-API-Key 등으로 넣는 경우가 있어
  //   헤더 어디든 pp_live_·pp_test_ 형식 키가 있으면 받는다(2026-09-24 claude.ai 헤더 방식에서 UNAUTHORIZED 재발).
  const KEY_RE = /\bpp_(?:live|test)_[A-Za-z0-9]{16,64}\b/;
  const fromHeaders = (): string | null => {
    const m = KEY_RE.exec(auth);
    if (m) return m[0];
    for (const [name, v] of Object.entries(req.headers)) {
      if (name === "cookie") continue;
      const hit = KEY_RE.exec(Array.isArray(v) ? v.join(" ") : String(v ?? ""));
      if (hit) return hit[0];
    }
    return null;
  };
  const key = /^Bearer\s+(\S+)/i.exec(auth)?.[1] ?? fromHeaders() ?? (qk && KEY_RE.test(qk) ? qk : null);
  if (!key && req.method === "POST") console.log(`[mcp] 키 없음 · ua=${req.headers["user-agent"] ?? "-"} · 헤더 이름=${Object.keys(req.headers).join(",")}`);
  try {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    const body = aliasCalls(raw ? JSON.parse(raw) : undefined);
    const server = buildServer(key);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => { void transport.close(); void server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (e) {
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: (e as Error).message }, id: null }));
  }
}).listen(PORT, () => console.log(`[mcp] powerMCP :${PORT} → API ${PP_API} · 레퍼런스 ${API}${LEGACY_KEY ? "" : "(서비스 키 없음)"} (taxonomy ${taxonomy.version}, tools ${TOOL_COUNT})`));

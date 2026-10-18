// powerMock 기획 와이어프레임 도구 — 홈페이지 화면 와이어(줄·12칸·칸 종류 = 섹션 유형)를 만들고 판정한다.
// 엔진은 api/src/Mock/Wire.php(결정적, 수집 레퍼런스 집계 api/data/wire-patterns.json 기준, 서버 LLM 0).
// 이 파일은 /api/v1/mock/wire/generate · /mock/wire/check 를 MCP 도구로 감싼다.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { codeOf, type DeckKitCtx } from "./deck-kit.ts";

// ---------------------------------------------------------------- 와이어 → 시안(2026-10-18 고도화 2단계)
// 사용자 와이어를 재현 묶음(mock_get_replica_kit)·판정(mock_check_mockup)·빠른 초안(mock_build_homepage·mock_get_main_mockup)에 넘긴다.
// 와이어 org → 레퍼런스 org_type 표는 레퍼런스 엔진 ReplicaKit::WIRE_ORG_TYPE 한 곳에 있다(엔진이 org_type 이 비면 그 표로 고른다).

/** 칸 하나·와이어 하나 — 플랫폼 /mock/wire… 응답 꼴(칸마다 ev 근거) */
export type WireCell = { k: string; span: number; h?: number; t?: string; ev?: Record<string, unknown> };
export type WireDoc = { screen: string; org: string; lnb?: boolean; title?: string; rows: Array<{ id?: string; zone?: string; cols: WireCell[] }> };
type ContentCell = { k: string; t?: string; s?: string; items?: string[]; label?: string; img?: { kind: string; label: string } };

/** 인자 — 와이어 JSON(mock_get_wireframe 의 wire 꼴) */
export const wireArg = z.object({
  screen: z.string().optional(),
  org: z.string().optional(),
  title: z.string().optional(),
  lnb: z.boolean().optional(),
  rows: z.array(z.object({
    zone: z.enum(["top", "body", "bottom"]).optional().describe("top·body·bottom"),
    cols: z.array(z.object({ span: z.number().int().min(1).max(12), k: z.string(), t: z.string().optional(), h: z.number().optional() }).passthrough()),
  }).passthrough()),
}).passthrough();
export const wireIdArg = z.string().regex(/^[A-Za-z0-9_-]{4,40}$/);

/** 와이어 내용(WireContent)의 그림 종류 → 시안 샘플 종류(mock_get_sample_images kind). 샘플에 없는 종류는 가까운 것, 없으면 null(그림 대신 면·무늬) */
export const SAMPLE_KIND: Record<string, string | null> = {
  "hero-city": "hero-city", "hero-nature": "hero-nature", "sub-visual": "sub-visual", leader: "leader", "news-thumb": "news-thumb", banner: "banner", popup: "popup",
  "icon-set": "icon-set", infographic: "infographic", place: "place", citizen: "citizen",
  "video-thumb": "news-thumb", "building-illust": "place", "archive-photo": "place", tour: "place", "pattern-bg": null,
};

/** 레퍼런스 엔진에 넘길 최소 꼴(칸 종류·폭·높이만) */
export const compactWire = (w: WireDoc) => ({
  screen: w.screen, org: w.org, lnb: !!w.lnb,
  rows: w.rows.map((r) => ({ zone: r.zone ?? "body", cols: r.cols.map((c) => ({ k: c.k, span: c.span, ...(c.h ? { h: Math.round(c.h) } : {}) })) })),
});

type ResolveOk = { ok: true; id: string | null; wire: WireDoc; saved: boolean; note?: string };
type ResolveErr = { ok: false; message: string; code: string };
/**
 * wire_id(저장한 와이어, 주인·관리자만 — 플랫폼 Access::assert) 또는 wire(JSON)를 받아 정리·근거(ev)를 단 와이어로.
 * save=true 면 JSON 와이어를 내 와이어에 저장해 id 를 만든다 — 판정(mock_check_mockup)이 ref_id 의 이 id 로 와이어를 다시 찾는다.
 */
export async function resolveWire(ctx: Pick<DeckKitCtx, "pp" | "key" | "ppMsg">, a: { wire?: unknown; wire_id?: string }, save: boolean): Promise<ResolveOk | ResolveErr> {
  if (a.wire_id) {
    const r = await ctx.pp(`/mock/wireframes/${encodeURIComponent(a.wire_id)}`, ctx.key);
    const d = r.data as { id?: string; wire?: WireDoc } | null;
    if (!r.ok || !d?.wire) return { ok: false, message: r.status === 404 ? `와이어(${a.wire_id})를 찾지 못했습니다 — 저장한 와이어 id 인지, 내 와이어인지 확인하세요.` : ctx.ppMsg(r, "와이어를 읽지 못했습니다"), code: r.ok ? "ERROR" : codeOf(r) };
    return { ok: true, id: String(d.id ?? a.wire_id), wire: d.wire, saved: true };
  }
  const c = await ctx.pp("/mock/wire/check", ctx.key, { method: "POST", body: { wire: a.wire } });
  const cw = (c.data as { wire?: WireDoc } | null)?.wire;
  if (!c.ok || !cw) return { ok: false, message: ctx.ppMsg(c, "와이어를 읽지 못했습니다(wire.rows 가 필요합니다)"), code: c.ok ? "INVALID_ARGS" : codeOf(c) };
  if (!save || !ctx.key) return { ok: true, id: null, wire: cw, saved: false, note: "와이어를 저장하지 못해 id 가 없다 — mock_check_mockup 에도 같은 wire 를 함께 보낸다." };
  const strip = { ...cw, rows: cw.rows.map((r) => ({ ...r, cols: r.cols.map(({ ev: _e, ...x }) => x) })) };
  const s = await ctx.pp("/mock/wireframes", ctx.key, { method: "POST", body: { title: cw.title || "MCP 로 받은 와이어", wire: strip, source: "rule" } });
  const sid = (s.data as { id?: string } | null)?.id;
  if (!s.ok || !sid) return { ok: true, id: null, wire: cw, saved: false, note: `와이어를 내 와이어에 저장하지 못했다(${ctx.ppMsg(s, "저장 실패")}) — mock_check_mockup 에도 같은 wire 를 함께 보낸다.` };
  return { ok: true, id: String(sid), wire: cw, saved: true, note: "보낸 와이어를 내 와이어에 저장했다(wire_id). 웹 기획 화면에서 열어 고칠 수 있다." };
}

/** 칸마다 예시 내용(WireContent — 가상 기관 기준). 실패하면 빈 표 */
export async function wireContent(ctx: Pick<DeckKitCtx, "pp" | "key">, w: WireDoc): Promise<{ rows: Array<{ cols: ContentCell[] }>; org: string | null }> {
  const r = await ctx.pp("/mock/wire/content", ctx.key, { method: "POST", body: { wire: w } }).catch(() => null);
  const d = (r?.data as { wire?: { rows?: Array<{ cols: ContentCell[] }>; persona?: { org?: string } } } | null)?.wire;
  return { rows: d?.rows ?? [], org: d?.persona?.org ?? null };
}

/**
 * 재현 묶음의 reference.wire.rows 칸마다 와이어 근거(ev)·예시 내용(content)·샘플 그림 종류를 붙인다.
 * 예시 내용의 가상 기관 이름은 묶음 persona.org 로 바꾼다(와이어 내용 보기와 시안의 기관 이름이 달랐다).
 */
export function mergeWireKit(kitRows: Array<{ no: number; cells: Array<Record<string, unknown>> }>, w: WireDoc, content: { rows: Array<{ cols: ContentCell[] }>; org: string | null }, org: string | null) {
  const swap = (s?: string) => (s && content.org && org ? s.split(content.org).join(org) : s);
  for (const r of kitRows) {
    const wr = w.rows[r.no - 1]; const cr = content.rows[r.no - 1];
    r.cells.forEach((c, j) => {
      const wc = wr?.cols[j]; const cc = cr?.cols[j];
      if (wc?.ev) c.ev = wc.ev;
      if (wc?.t) c.label = wc.t;
      if (cc) {
        c.content = { t: swap(cc.t), ...(cc.s ? { s: swap(cc.s) } : {}), ...(cc.items?.length ? { items: cc.items.map((x) => swap(x) ?? x) } : {}),
          ...(cc.img ? { img: { kind: cc.img.kind, label: cc.img.label, sample_kind: SAMPLE_KIND[cc.img.kind] ?? null } } : {}) };
      }
    });
  }
}

const SCREENS = ["main", "board_list", "board_gallery", "board_view", "form", "content", "greeting", "org_chart", "location", "history", "vision", "procedure", "faq", "search", "sitemap", "info_disclosure"] as const;
const ORGS = ["all", "local", "central", "public", "education", "university", "civic", "culture", "private"] as const;
const STYLES = ["auto", "standard", "reference", "portal", "llm", "landing", "campus", "magazine", "minimal"] as const;

export function registerMockWireTools(server: McpServer, ctx: DeckKitCtx): void {
  const call = async (tool: string, p: string, init?: { method?: string; body?: unknown }) => {
    if (!ctx.key) { const g = await ctx.guard(tool); if (g) return g; }
    const r = await ctx.pp(p, ctx.key, init);
    if (!r.ok || !r.body) return ctx.err(ctx.ppMsg(r, "powerMock API 오류"), r.ok ? "ERROR" : codeOf(r));
    const { data, ...rest } = r.body;
    return ctx.text({ ...rest, data });
  };

  server.registerTool("mock_get_wireframe", {
    title: "홈페이지 기획 와이어프레임",
    description: "홈페이지 한 화면의 기획 와이어프레임(위에서 아래로 줄, 줄마다 12칸 기준 칸, 칸 종류 = 섹션 유형)을 만든다. 수집한 홈페이지 레퍼런스(관공서·대학·교육·단체·일반 기업)에서 그 화면 종류·기관 묶음에 섹션이 얼마나 자주·어느 순서·폭으로 놓이는지를 따라 결정적으로 짜고. style 로 짜임을 바꾼다 — standard(평균)·reference(실제 레퍼런스 화면 하나의 줄 구성, variant 로 다른 화면)·메인 원형 portal(포털형)·llm(AI 검색 중심)·landing(랜딩)·campus(대학)·magazine(사진 중심)·minimal(단정한 기업형). auto 면 요청 글 낱말로 고르고, 낱말이 없으면 메인은 기관에 맞춰(대학=campus·민간=minimal·문화=magazine) 고른다. 같은 화면을 여러 안으로 받으려면 basis.recommended(추천 3안: 평균·가장 많이 쓰는 실제 구성·기관에 맞는 원형, 각 style·variant·이유)에서 골라 style·variant 로 다시 부른다(basis.alternatives 는 고를 수 있는 스타일 전체와 변형 수). 요청 글에서 넣을 것·뺄 것(예: '챗봇 넣고 팝업은 빼고')을 반영한다. 돌려주는 것: wire(JSON, 칸마다 ev = 같은 화면 레퍼런스에서 그 섹션을 두는 비율 adopt%·위치 pos%·폭·높이·표본 n), check(점수·고칠 곳·fit), basis(표본 수·fit 레퍼런스 닮음 0~100·dist 채택률 분포·recommended), prompt(이 와이어로 시안을 받는 요청문 — 칸별 예시 내용 포함). 와이어를 고친 뒤 mock_check_wireframe 으로 다시 판정하고, 통과하면 이 wire 를 그대로 mock_get_replica_kit(wire=…) 에 넘겨 시안 재료를 받는다(배치 = 와이어, 판정도 와이어와 대조) → 시안 제작 → mock_check_mockup. 와이어 없이 재현 묶음을 부르면 레퍼런스 배치로 만들어져 와이어와 상관없는 시안이 된다.",
    inputSchema: {
      screen: z.enum(SCREENS).describe("화면 종류 — main(메인)·board_list(게시판 목록)·board_gallery(사진 게시판)·board_view(게시글)·form(신청 폼)·content(일반 안내)·greeting(인사말)·org_chart(조직도)·location(찾아오시는 길)·history(연혁)·vision(비전)·procedure(절차 안내)·faq·search(검색 결과)·sitemap·info_disclosure(정보공개)"),
      org: z.enum(ORGS).optional().describe("기관 묶음 — local(지자체)·central(중앙부처)·public(공공기관)·education(교육청·학교)·university(대학)·civic(단체·협회·복지)·culture(문화·관광·체육 기관)·private(일반 기업·민간)·all(기본)"),
      style: z.enum(STYLES).optional().describe("짜임 스타일(기본 auto). 허용값: auto·standard·reference·portal·llm·landing·campus·magazine·minimal. 원형(portal·llm·landing·campus·magazine·minimal)은 메인 화면용, 서브 화면은 reference 로 바뀐다"),
      variant: z.number().int().min(0).max(50).optional().describe("변형 번호(0부터) — reference 는 다른 레퍼런스 화면, 원형은 줄 순서·좌우 바꿈"),
      request: z.string().max(800).optional().describe("요청 글(넣을 것·뺄 것·강조할 것)"),
      title: z.string().max(120).optional().describe("와이어 제목"),
      ai: z.boolean().optional().describe("서버 AI 로 요청 글에 맞춰 한 번 더 다듬기(로그인 키 필요, 판정 미달이면 초안 그대로)"),
    },
  }, async (a) => call("mock_get_wireframe", "/mock/wire/generate", { method: "POST", body: { screen: a.screen, org: a.org ?? "all", style: a.style ?? "auto", variant: a.variant ?? 0, request: a.request ?? "", title: a.title, ai: a.ai ?? false } }));

  server.registerTool("mock_check_wireframe", {
    title: "홈페이지 와이어프레임 판정",
    description: "홈페이지 와이어프레임을 결정적으로 판정한다(필수 섹션 누락·순서·줄의 칸 합계 12·빈 줄·좁은 칸·같은 역할 중복·화면 종류에 맞지 않는 섹션). 공공 기관 묶음이면 KRDS 공식 배너도 본다. 점수(score)·통과(pass: 오류 0이고 80점 이상)·고칠 곳(issues: 심각도·줄·문제·고치는 법)·레퍼런스 닮음(fit, 점수와 무관한 참고)과 정리한 wire(칸마다 ev)를 돌려준다. pass 가 true 가 될 때까지 고쳐 다시 보낸다.",
    inputSchema: {
      wire: z.object({
        screen: z.string().optional(),
        org: z.string().optional(),
        title: z.string().optional(),
        lnb: z.boolean().optional(),
        rows: z.array(z.object({
          zone: z.enum(["top", "body", "bottom"]).optional().describe("top·body·bottom"),
          cols: z.array(z.object({ span: z.number().int().min(1).max(12), k: z.string(), t: z.string().optional(), h: z.number().optional() })),
        })),
      }).passthrough().describe("mock_get_wireframe 의 wire 형식"),
    },
  }, async (a) => call("mock_check_wireframe", "/mock/wire/check", { method: "POST", body: { wire: a.wire } }));
}

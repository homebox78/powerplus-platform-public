// powerMock 기획 와이어프레임 도구 — 홈페이지 화면 와이어(줄·12칸·칸 종류 = 섹션 유형)를 만들고 판정한다.
// 엔진은 api/src/Mock/Wire.php(결정적, 수집 레퍼런스 집계 api/data/wire-patterns.json 기준, 서버 LLM 0).
// 이 파일은 /api/v1/mock/wire/generate · /mock/wire/check 를 MCP 도구로 감싼다.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { codeOf, type DeckKitCtx } from "./deck-kit.ts";

const SCREENS = ["main", "board_list", "board_gallery", "board_view", "form", "content", "greeting", "org_chart", "location", "history", "vision", "procedure", "faq", "search", "sitemap", "info_disclosure"] as const;
const ORGS = ["all", "local", "central", "public", "education", "university", "civic", "private"] as const;
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
    description: "홈페이지 한 화면의 기획 와이어프레임(위에서 아래로 줄, 줄마다 12칸 기준 칸, 칸 종류 = 섹션 유형)을 만든다. 수집한 홈페이지 레퍼런스(관공서·대학·교육·단체·일반 기업)에서 그 화면 종류·기관 묶음에 섹션이 얼마나 자주·어느 순서·폭으로 놓이는지를 따라 결정적으로 짜고. style 로 짜임을 바꾼다 — standard(평균)·reference(실제 레퍼런스 화면 하나의 줄 구성, variant 로 다른 화면)·메인 원형 portal(포털형)·llm(AI 검색 중심)·landing(랜딩)·campus(대학)·magazine(사진 중심)·minimal(단정한 기업형). auto 면 요청 글 낱말로 고른다. 같은 화면을 여러 안으로 받으려면 style·variant 를 바꿔 여러 번 부른다(basis.alternatives 에 고를 수 있는 스타일과 변형 수), 요청 글에서 넣을 것·뺄 것(예: '챗봇 넣고 팝업은 빼고')을 반영한다. 돌려주는 것: wire(JSON), check(점수·고칠 곳), basis(근거 표본 수), prompt(이 와이어로 시안을 받는 요청문). 와이어를 고친 뒤 mock_check_wireframe 으로 다시 판정하고, 통과하면 prompt 대로 mock_get_replica_kit → 시안 제작 → mock_check_mockup 으로 넘어간다.",
    inputSchema: {
      screen: z.enum(SCREENS).describe("화면 종류 — main(메인)·board_list(게시판 목록)·board_gallery(사진 게시판)·board_view(게시글)·form(신청 폼)·content(일반 안내)·greeting(인사말)·org_chart(조직도)·location(찾아오시는 길)·history(연혁)·vision(비전)·procedure(절차 안내)·faq·search(검색 결과)·sitemap·info_disclosure(정보공개)"),
      org: z.enum(ORGS).optional().describe("기관 묶음 — local(지자체)·central(중앙부처)·public(공공기관)·education(교육청·학교)·university(대학)·civic(단체·협회·복지)·private(일반 기업·민간)·all(기본)"),
      style: z.enum(STYLES).optional().describe("짜임 스타일(기본 auto). 허용값: auto·standard·reference·portal·llm·landing·campus·magazine·minimal. 원형(portal·llm·landing·campus·magazine·minimal)은 메인 화면용, 서브 화면은 reference 로 바뀐다"),
      variant: z.number().int().min(0).max(50).optional().describe("변형 번호(0부터) — reference 는 다른 레퍼런스 화면, 원형은 줄 순서·좌우 바꿈"),
      request: z.string().max(800).optional().describe("요청 글(넣을 것·뺄 것·강조할 것)"),
      title: z.string().max(120).optional().describe("와이어 제목"),
      ai: z.boolean().optional().describe("서버 AI 로 요청 글에 맞춰 한 번 더 다듬기(로그인 키 필요, 판정 미달이면 초안 그대로)"),
    },
  }, async (a) => call("mock_get_wireframe", "/mock/wire/generate", { method: "POST", body: { screen: a.screen, org: a.org ?? "all", style: a.style ?? "auto", variant: a.variant ?? 0, request: a.request ?? "", title: a.title, ai: a.ai ?? false } }));

  server.registerTool("mock_check_wireframe", {
    title: "홈페이지 와이어프레임 판정",
    description: "홈페이지 와이어프레임을 결정적으로 판정한다(필수 섹션 누락·순서·줄의 칸 합계 12·빈 줄·좁은 칸·같은 역할 중복·화면 종류에 맞지 않는 섹션). 점수(score)·통과(pass: 오류 0이고 80점 이상)·고칠 곳(issues: 심각도·줄·문제·고치는 법)과 정리한 wire 를 돌려준다. pass 가 true 가 될 때까지 고쳐 다시 보낸다.",
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

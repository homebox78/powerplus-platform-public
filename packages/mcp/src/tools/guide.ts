// powerGuide 정본 도구 — 부품 목록·소스·KRDS 지침·검증 체크리스트·코드 판정(기획 §23 ③).
// 재료는 전부 /api/v1/guide/* (PHP) 가 준다. 이 파일은 그 REST 를 MCP 도구로 감싸기만 한다.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };
type PpRes = { ok: boolean; status: number; data: unknown; body: (Record<string, unknown> & { error?: string; code?: string; hint?: string }) | null };

export type GuideCtx = {
  guard: (tool: string) => Promise<ToolResult | null>;
  pp: (p: string, key: string | null, init?: { method?: string; body?: unknown }) => Promise<PpRes>;
  key: string | null;
  text: (data: unknown) => ToolResult;
  err: (message: string, code?: string) => ToolResult;
  ppMsg: (r: PpRes, fallback: string) => string;
};

const qs = (o: Record<string, string | number | undefined>) =>
  Object.entries(o).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");

/** 오류 코드 — 서버가 준 code 를 먼저(FORBIDDEN_SCOPE 등), 없으면 상태로. 잘못된 인자는 다른 도구와 같은 INVALID_ARGS(MC-21, index.ts ppCode 와 같은 규칙) */
const codeOf = (r: PpRes): string => (typeof r.body?.code === "string" && r.body.code !== "" && r.body.code !== "INVALID") ? r.body.code
  : r.status === 404 ? "NOT_FOUND" : r.status === 401 ? "UNAUTHORIZED" : r.status === 403 ? "FORBIDDEN" : r.status === 402 ? "UPGRADE_REQUIRED" : r.status === 429 ? "RATE_LIMITED" : r.status === 400 || r.status === 422 ? "INVALID_ARGS" : "ERROR";
const VERDICTS = ["P", "F", "수정됨", "의도", "?", "사이트"] as const;
const SECTIONS = ["style", "component", "pattern", "service"] as const;

export function registerGuideTools(server: McpServer, ctx: GuideCtx): void {
  const call = async (tool: string, p: string, init?: { method?: string; body?: unknown }) => {
    const g = await ctx.guard(tool); if (g) return g;
    const r = await ctx.pp(p, ctx.key, init);
    if (!r.ok || !r.body) return ctx.err(ctx.ppMsg(r, "powerGuide API 오류"), codeOf(r));
    const { data, ...rest } = r.body;
    return ctx.text({ ...rest, data });
  };

  server.registerTool("guide_list_components", {
    title: "부품 목록(KRDS 기반 키트)",
    description: "React·Vue 로 바로 붙여 쓰는 UI 부품 77종(버튼·입력·탭·표·모달·헤더·내비게이션 등)의 id·이름·분류·한 줄 설명. 화면을 코드로 만들기 전에 먼저 불러, 직접 짜지 말고 여기 있는 부품을 쓴다. 부품 소스는 guide_get_component 로 받는다.",
    inputSchema: {
      group: z.string().optional().describe("분류 id. 허용값: gov(정부 서비스 공통)·action(버튼·표시)·form(입력)·nav(탐색)·overlay(레이어)·data(데이터)·layout(구조) — 한글 이름도 된다"),
      query: z.string().optional().describe("이름·id·설명·KRDS 이름에서 찾을 낱말(예: 탭, date, modal, 페이지). 0건이면 meta.hint 에 이유"),
    },
  }, async (a) => call("guide_list_components", `/guide/components?${qs({ group: a.group, q: a.query })}`));

  server.registerTool("guide_get_component", {
    title: "부품 소스·설치·지침",
    description: "부품 하나의 실제 소스 파일 전부, 사용 예, 의존성, 설치 명령(React 는 shadcn 레지스트리 한 줄), 키트 공통 파일(kit.css·hb-kit 감싸기) 안내, 해당 KRDS 사용·접근성 지침. 받은 파일을 그대로 components/kit/ 에 두고 쓴다 — 마크업·클래스·aria 를 바꾸지 말 것. 색·간격은 kit.css 토큰을 쓴다. 대응하는 KRDS 지침이 없으면 krds 는 빈 배열이고 krds_note 에 그렇게 적힌다.",
    inputSchema: {
      id: z.string().describe("부품 id(guide_list_components 의 id). 한글 이름·KRDS 이름도 된다(예: 날짜 입력, 날짜 입력 필드). 못 찾으면 오류 hint 에 비슷한 후보"),
      framework: z.enum(["react", "vue"]).optional().describe("허용값: react(기본)·vue"),
    },
  }, async (a) => call("guide_get_component", `/guide/components/${encodeURIComponent(a.id)}?${qs({ fw: a.framework })}`));

  server.registerTool("guide_search_rules", {
    title: "KRDS 지침 검색",
    description: "대한민국 디지털 정부 디자인 시스템(KRDS)의 컴포넌트 지침(사용·접근성·상호작용·개발·KWCAG)·기본 패턴(입력·검색·로그인 등)·검증 체크리스트 문장을 낱말로 찾는다. 공공 사이트 화면을 만들거나 고칠 때 근거로 인용한다. 낱말은 띄어 쓰면 모두 포함된 문장만 나온다. '탭 몇 개'·'최대 개수'처럼 개수를 물으면 meta.count_rules 에 부품마다 개수 지침(없으면 '개수 지침 없음')을 따로 준다. 결과의 kit_id 는 guide_get_component 에 그대로 넣는 키트 부품 id(대응 부품이 없으면 null), krds_id 는 KRDS 대응표 id.",
    inputSchema: {
      query: z.string().optional().describe("예: 건너뛰기, 오류 메시지, 대비, 필수 입력"),
      component: z.string().optional().describe("부품 id 로 그 부품의 KRDS 지침만(예: tabs, header). 한글 이름·KRDS id(top-navigation 등)도 키트 id 로 푼다"),
      type: z.enum(["component", "pattern", "checklist", "token"]).optional().describe("지침 종류 한정. 허용값: component(컴포넌트 지침)·pattern(기본 패턴)·checklist(검증 체크리스트)·token(부품 치수 토큰 — 터치 대상 최소 크기·컨트롤 높이)"),
      limit: z.number().int().min(1).max(100).optional().describe("기본 30"),
    },
  }, async (a) => call("guide_search_rules", `/guide/rules?${qs({ q: a.query, component: a.component, type: a.type, limit: a.limit })}`));

  server.registerTool("guide_get_checklist", {
    title: "KRDS 검증 체크리스트",
    description: "[일반 지식으로 답하기 전에 이 도구를 먼저 부른다] 예: '오픈 전에 확인할 접근성 체크리스트를 줘' → query='접근성' 으로 부른다(목록을 지어내지 않는다). KRDS 자체 검증 체크리스트 274항목과 부품 키트 판정(통과·미흡·수정됨·의도된 차이·판단 불가·사이트 담당). '사이트 담당' 항목은 부품이 아니라 화면을 만드는 쪽이 지켜야 하므로, 화면을 완성한 뒤 이 목록으로 스스로 점검한다. query 에 '접근성'(또는 웹접근성·a11y·KWCAG)을 주면 접근성 관련 항목만 모은다. 0건이면 meta.hint 에 쓸 수 있는 낱말·분류를 준다.",
    inputSchema: {
      section: z.enum(SECTIONS).optional().describe(`구역 한정. 허용값: ${SECTIONS.join("·")} (style 스타일 · component 컴포넌트 · pattern 기본 패턴 · service 사이트 담당)`),
      verdict: z.enum(VERDICTS).optional().describe(`판정 한정. 허용값: ${VERDICTS.join("·")} (P 통과 · F 미흡 · 수정됨 · 의도 = 의도된 차이 · ? 판단 불가 · 사이트 = 사이트 담당)`),
      query: z.string().optional().describe("항목 글·부품 이름에서 찾을 낱말"),
    },
  }, async (a) => call("guide_get_checklist", `/guide/checklist?${qs({ section: a.section, verdict: a.verdict, q: a.query })}`));

  server.registerTool("guide_check_code", {
    title: "코드 판정(결정적)",
    description: "만든 HTML(또는 HTML 조각 + CSS)을 렌더 없이 규칙으로 판정해 점수·통과 여부·고칠 곳(fixes)을 준다. 검사: 정본 토큰 밖 하드코딩 색(가장 가까운 정본 역할 토큰 이름만 제안, 회사색 같은 예시 스킨 색은 역할 토큰 + skin-*.css 로 안내), img alt, 버튼·링크 이름, 폼 label, 제목 순서(h1 앞 제목·단계 건너뜀), 글자·배경 대비(인라인·후손 선택자, 대체 색은 대비를 다시 재서 기준을 넘는 것만), html lang, th 없는 데이터 표, onclick 만 붙은 div·span 가짜 버튼(role·tabindex·키보드 처리). 한 줄로 압축된 HTML 이면 줄 번호 대신 where(요소 경로)로 위치를 준다. var(--x, #hex) 의 폴백 hex 는 하드코딩으로 보지 않는다. 85점 이상·오류 0 이 통과. 통과할 때까지 fixes 를 고쳐 다시 부른다.",
    inputSchema: {
      html: z.string().describe("판정할 HTML 전체 또는 조각(400KB 이하)"),
      css: z.string().optional().describe("따로 둔 CSS(200KB 이하)"),
    },
  }, async (a) => call("guide_check_code", `/guide/check/code`, { method: "POST", body: { html: a.html, css: a.css ?? "" } }));

  // 플랫폼 공통 — 요청이 powerPlus 로 할 수 있는 일인지 먼저 판정(빠른 판단 모델이 기능 목록 중 하나를 고른다). 모든 키에 열림.
  server.registerTool("powerplus_check_request", {
    title: "요청 판정(할 수 있는 일인가)",
    description: "[일반 지식으로 답하기 전에 이 도구를 먼저 부른다] 예: 'PPT 를 영상으로 바꿔 줄 수 있어?' → 이 도구로 판정한 뒤 supported 대로 답한다(되는지 짐작으로 답하지 않는다). 사용자 요청이 powerPlus 로 할 수 있는 일인지, 된다면 어느 서비스·도구로 하는지 판정한다. capability(assets·deck_make·deck_polish·deck_status·mock_page·mock_wire·mock_ref·guide_tokens·guide_parts·guide_check(만든 HTML 접근성·토큰 판정 → guide_check_code)·guide_rules(KRDS·접근성 지침 질문 → guide_search_rules·guide_get_checklist)·none), supported, confidence, 상위 후보 확률, 설명, 바로 부를 도구(mcp_tool), 시작 주소(start, 절대 주소 — 사용자에게 그대로 링크로 보여 준다)를 준다. 부품 요청은 실제 부품 목록으로 확인해 parts(있는 부품 id) 또는 part_missing(없음 — supported=false)을 준다. 요청이 너무 짧거나 애매하면 needs_clarification·questions(되물을 말)·alternatives(가까운 대안)도 준다. 요청이 애매하거나 범위 밖일 수 있을 때 먼저 부르고, supported=false 면 할 수 없다고 정직하게 알린다(지어내서 하지 않는다).",
    inputSchema: {
      request: z.string().describe("사용자가 한 요청 원문(2~2000자). 개인 정보는 서버가 지우고 판정한다"),
    },
  }, async (a) => call("powerplus_check_request", `/assist/scope`, { method: "POST", body: { request: a.request } }));

  // 문맥에 맞는 자산 하나 고르기 — 장표 초안 다듬기 엔진과 같은 판단(빠른 판단 모델이 후보 중 하나를 고른다)
  server.registerTool("assets_pick", {
    title: "문맥에 맞는 자산 고르기",
    description: "예: \"'민원 처리 기간 단축' 문장 옆에 어울리는 아이콘 하나만\" → text='민원 처리 기간 단축', category=icon 으로 부른다(검색 결과를 직접 고르지 않는다). 슬라이드·화면 자리 옆 글(제목·라벨·설명)을 주면 그 문맥에 가장 맞는 powerAssets 자산 하나와 후보(최대 20개)를 준다. pick·by(ai|rule)·confidence·queries·candidates. 같은 자리에 여러 개를 고를 때는 exclude 로 이미 고른 id 를 빼고, 같은 톤은 set 으로 맞춘다.",
    inputSchema: {
      text: z.string().describe("자리 옆 글 전체(문맥)"),
      category: z.enum(["icon", "illust", "diagram", "photo"]).optional().describe("기본 icon"),
      queries: z.array(z.string()).optional().describe("검색어를 직접 정할 때. 비우면 서버가 글에서 실제 태그 낱말을 뽑는다"),
      exclude: z.array(z.string()).optional().describe("뺄 자산 id"),
      set: z.string().optional().describe("같은 세트(스타일) id 로 맞출 때"),
    },
  }, async (a) => call("assets_pick", `/assets/pick`, { method: "POST", body: a }));

  // 분석 보고서 게시 — 추천·분석 결과를 사이트 디자인의 보고서 한 장(썸네일 포함)으로 남기고 url 을 준다. 모든 키에 열림
  server.registerTool("powerplus_publish_report", {
    title: "분석 보고서 게시",
    description: "추천·분석 답(자산 추천, 비교, 배치 제안 등)을 powerPlus 사이트 디자인의 보고서 페이지 한 장으로 게시하고 url 을 준다. 자산 칸은 id 만 주면 서버가 이름·썸네일·키워드를 채운다(지어낸 이름 금지 — 반드시 assets_search·assets_pick 으로 받은 id). 기본은 링크를 아는 누구나 로그인 없이 본다(검색 노출 없음, 180일 보관) — visibility 로 임직원만·나만 볼 수 있게 줄일 수 있다. 자산 3개 이상을 추천했거나 표·목록이 길면 답을 표로 늘어놓는 대신 이것으로 게시하고, 채팅에는 요약 2~3줄과 url 만 준다.",
    inputSchema: {
      title: z.string().describe("보고서 제목(200자 이하)"),
      question: z.string().optional().describe("사용자가 한 질문 원문"),
      summary: z.string().optional().describe("요약 2~4문장. 마침표마다 문장을 끊는다"),
      highlights: z.array(z.string()).max(4).optional().describe("한눈에 볼 숫자·핵심 최대 4개(예: '추천 아이콘 12개')"),
      module: z.enum(["assets", "deck", "mock", "guide", "all"]).optional(),
      visibility: z.enum(["link", "staff", "private"]).optional().describe("공개 범위 — link: 링크 아는 누구나(기본) · staff: 로그인한 임직원만 · private: 만든 사람만. 사내 자료·발주처 이름이 든 보고서는 staff 이상"),
      blocks: z.array(z.object({
        type: z.enum(["assets", "text", "list", "table"]),
        heading: z.string().optional(),
        note: z.string().optional().describe("assets 칸 위 설명"),
        items: z.array(z.union([z.string(), z.object({ id: z.string(), reason: z.string().optional(), label: z.string().optional() })])).optional().describe("assets: 자산 id 또는 {id, reason, label} / list: 문장들"),
        body: z.string().optional().describe("text 본문"),
        columns: z.array(z.string()).optional().describe("table 머리"),
        rows: z.array(z.array(z.string())).optional().describe("table 행"),
      })).min(1).max(20).describe("보고서 칸 — assets(썸네일 카드)·text·list·table"),
    },
  }, async (a) => call("powerplus_publish_report", `/reports`, { method: "POST", body: a }));
}

// powerDeck 재료·판정 도구 — 기획·와이어프레임·대본은 사용자 AI 가 만들고, 서버는 결정적으로 판정만 한다(기획 §23 ①②).
// 재료와 판정은 전부 /api/v1/deck/kit/* · /api/v1/deck/check/* (PHP, 서버 LLM 호출 0). 이 파일은 그 REST 를 MCP 도구로 감싼다.
// 키 사용량은 PHP 쪽에서 한 번만 센다 — 그래서 키가 있으면 guard(/keys/verify, 사용량 +1)를 거치지 않는다.
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };
type PpRes = { ok: boolean; status: number; data: unknown; body: (Record<string, unknown> & { error?: string; code?: string; hint?: string }) | null };

export type DeckKitCtx = {
  guard: (tool: string) => Promise<ToolResult | null>;
  pp: (p: string, key: string | null, init?: { method?: string; body?: unknown }) => Promise<PpRes>;
  key: string | null;
  text: (data: unknown) => ToolResult;
  err: (message: string, code?: string) => ToolResult;
  ppMsg: (r: PpRes, fallback: string) => string;
};

const ORDER = "순서: deck_get_plan_kit → 기획 작성 → deck_check_plan(통과까지) → deck_get_wire_kit → 와이어프레임 작성 → deck_check_wireframe(통과까지) → deck_get_script_kit → 대본 작성 → deck_check_script(통과까지).";

/** 오류 코드 — 서버가 준 code(FORBIDDEN_SCOPE 등)를 먼저, 없으면 HTTP 상태로. 잘못된 인자는 index.ts 검증 오류와 같은 INVALID_ARGS(MC-21) */
export const codeOf = (r: PpRes) =>
  (typeof r.body?.code === "string" && r.body.code) ? r.body.code
    : r.status === 401 ? "UNAUTHORIZED" : r.status === 403 ? "FORBIDDEN" : r.status === 429 ? "RATE_LIMITED" : r.status === 400 || r.status === 422 ? "INVALID_ARGS" : r.status === 404 ? "NOT_FOUND" : "ERROR";

const anyArr = z.array(z.record(z.string(), z.unknown()));
const anyObj = z.record(z.string(), z.unknown());

export function registerDeckKitTools(server: McpServer, ctx: DeckKitCtx): void {
  const call = async (tool: string, p: string, init?: { method?: string; body?: unknown }) => {
    if (!ctx.key) { const g = await ctx.guard(tool); if (g) return g; } // 키 없음 안내만(사용량 집계 없음)
    const r = await ctx.pp(p, ctx.key, init);
    if (!r.ok || !r.body) return ctx.err(ctx.ppMsg(r, "powerDeck API 오류"), r.ok ? "ERROR" : codeOf(r));
    const { data, ...rest } = r.body;
    return ctx.text({ ...rest, data });
  };

  server.registerTool("deck_get_plan_kit", {
    title: "장표 기획 재료",
    description: `제안·보고 장표의 기획(장마다 제목·핵심 메시지·본문·분위기)을 직접 쓰기 위한 재료: 쓰는 순서, 출력 형식(JSON), 장마다 지켜야 할 규칙, 분량 기준, 예시, 판정 항목. 사용자가 준 원자료(공고문·요약·수치)를 바탕으로 이 형식대로 기획을 쓴 뒤 deck_check_plan 으로 판정받는다. 수치·고유명사는 원자료에 있는 것만 쓴다. ${ORDER}`,
    inputSchema: {},
  }, async () => call("deck_get_plan_kit", "/deck/kit/plan"));

  server.registerTool("deck_check_plan", {
    title: "장표 기획 판정",
    description: "작성한 기획을 결정적으로 판정한다(형식·장 수·제목 길이·빈 말·과장·원자료 수치 누락과 변조). 점수와 고칠 곳(fixes: 위치·심각도·문제·고치는 법)을 돌려준다. pass 가 true(85점 이상·치명 0)가 될 때까지 fixes 대로 고쳐 다시 보낸다. 원자료(source)를 함께 보내야 수치 대조와 배점 순위 점검(상위 항목이 뒤로 몰렸는지·한 장뿐인지, stat.priority)이 된다. 통과하면 deck_get_wire_kit 으로 넘어간다.",
    inputSchema: {
      plan: anyObj.describe("기획 — deck_get_plan_kit 의 format 그대로({ title, core, slides: [장마다 n·title·message·content·mood …] })"),
      source: z.string().optional().describe("원자료 글(공고문·요약 등). 수치·고유명사 대조에 쓴다"),
      slide_count: z.number().int().min(1).max(80).optional().describe("요청받은 장 수(있으면 일치 여부를 본다)"),
      minutes: z.number().min(1).max(120).optional().describe("발표 시간(분) — 없으면 원자료에서 찾는다. 시간에 맞는 장 수를 본다"),
    },
  }, async (a) => call("deck_check_plan", "/deck/check/plan", { method: "POST", body: { plan: a.plan, source: a.source, slide_count: a.slide_count, minutes: a.minutes } }));

  server.registerTool("deck_get_wire_kit", {
    title: "와이어프레임 재료",
    description: `통과한 기획을 장마다 16:9 화면 배치(와이어프레임)로 옮기기 위한 재료: 캔버스 크기, 상자 종류(패널·표·강조·카드·결론 띠·사진 등), 한 줄 글자 수, 쓸 수 있는 배치 틀, 작성 규칙. 줄(rows)·칸(12칸 기준) 형식이나 틀(tpl)+상자, 또는 좌표 상자 중 하나로 쓴 뒤 deck_check_wireframe 으로 판정받는다. ${ORDER}`,
    inputSchema: {
      full: z.boolean().optional().describe("true 면 작성 규칙 원문 전체(형식·틀 목록·출력 예시 절 포함). 기본은 format·templates 와 겹치는 절을 뺀 요약판"),
    },
  }, async (a) => call("deck_get_wire_kit", a.full ? "/deck/kit/wire?full=1" : "/deck/kit/wire"));

  server.registerTool("deck_check_wireframe", {
    title: "와이어프레임 판정",
    description: "작성한 와이어프레임을 결정적으로 판정한다(상자 겹침·화면 밖·헤드라인 침범·칸 합계·글 넘침·기획 수치 누락·상자 수). 점수·fixes 와 함께 장마다 16:9 미리보기 SVG(회색 상자+라벨)를 돌려준다 — 사용자에게 보여 줄 때 그대로 쓴다. pass 가 true 가 될 때까지 고쳐 다시 보낸다. 기획(plan)을 함께 보내면 수치 누락을 본다. 통과하면 deck_get_script_kit 으로 넘어간다.",
    inputSchema: {
      slides: anyArr.describe("장마다 와이어프레임 — deck_get_wire_kit 형식(rows 또는 tpl+blocks 또는 wire 좌표 상자)"),
      plan: anyObj.optional().describe("통과한 기획({ title, core, slides } — 수치 누락 대조용)"),
      svg: z.boolean().optional().describe("미리보기 SVG 포함 여부(기본 true). 고치는 중엔 false 로 응답을 줄이고, 사용자에게 보여 줄 때만 true"),
      detail: z.boolean().optional().describe("서버가 계산한 상자 좌표(slides[].wire) 포함 여부(기본 false)"),
    },
  }, async (a) => call("deck_check_wireframe", "/deck/check/wireframe", { method: "POST", body: { slides: a.slides, plan: a.plan, svg: a.svg ?? true, detail: a.detail } }));

  server.registerTool("deck_get_script_kit", {
    title: "발표 대본 재료",
    description: `완성한 장표의 발표 대본(장마다 말할 문장)을 쓰기 위한 재료: 형식, 장당 분량(발표 시간에서 계산), 말투(합니다체), 금지 표현, 첫 장·마지막 장 규칙, 예시. 작성 뒤 deck_check_script 로 판정받는다. ${ORDER}`,
    inputSchema: {},
  }, async () => call("deck_get_script_kit", "/deck/kit/script"));

  server.registerTool("deck_check_script", {
    title: "발표 대본 판정",
    description: "작성한 대본을 결정적으로 판정한다(장 수 일치·장당 분량·한 줄 길이·금지 표현·말투·첫 장 인사·마지막 맺음·기획 핵심어 포함·기획에 없는 수치). 점수와 fixes 를 돌려준다. pass 가 true 가 될 때까지 고쳐 다시 보낸다. 기획(plan)과 발표 시간(minutes 또는 장당 seconds_per_slide)을 함께 보내면 분량·핵심어를 정확히 본다 — 시간을 주면 전체가 목표의 60%에 못 미치는 대본도 통과하지 못한다. 수치는 기획 전체·원자료(source)와 대조한다.",
    inputSchema: {
      script: anyObj.describe("대본 — deck_get_script_kit 형식({ slides: [장마다 n·keep·lines …] })"),
      plan: anyObj.optional().describe("통과한 기획({ title, core, slides } — 핵심어·수치 대조용)"),
      minutes: z.number().min(1).max(120).optional().describe("발표 시간(분)"),
      seconds_per_slide: z.number().min(10).max(300).optional().describe("장당 발표 시간(초) — 예: 30초 대본이면 30. 주면 장마다 그 초가 목표, 전체 목표 = 장 수 × 초(minutes 보다 먼저)"),
      source: z.string().optional().describe("원자료 글 — 블라인드 평가 여부·원문 수치 대조에 쓴다"),
      qa: anyArr.optional().describe("예상 질문과 답(script.qa 에 넣어도 된다)"),
      blind: z.boolean().optional().describe("블라인드 평가면 true(제안사 이름 대신 '저희 제안사')"),
    },
  }, async (a) => call("deck_check_script", "/deck/check/script", { method: "POST", body: { script: a.script, plan: a.plan, minutes: a.minutes, seconds_per_slide: a.seconds_per_slide, source: a.source, qa: a.qa, blind: a.blind } }));
}

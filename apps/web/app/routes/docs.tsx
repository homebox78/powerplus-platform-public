// 문서 센터(/docs, /docs/:page) — powerPlus 통합 문서.
// 출처: homebox-handoff apps/web/app/routes/docs-mcp.tsx·docs-api.tsx·legal.tsx + components/hb/docs-frame.tsx(틀·수치 그대로).
// 바꾼 것: 대상이 powerMock 하나가 아니라 4개 모듈을 묶은 powerMCP. 도구는 손으로 적지 않고 data/mcp-tools.json(packages/mcp/scripts/gen-tools.mjs 생성)을 모듈별로 묶는다.
// 연결 문구·서버 주소는 /powermcp·/account/keys 와 같은 lib/mcp-connect. REST 규약·오류 코드·한도는 api/public/index.php·Core/Response·HttpError·Keys·core_plans 시드를 근거로 적었다.
// 페이지: (없음)|mcp = MCP 연결 가이드 · clients · tools · api · limits · errors · terms · copyright · bot
import { KeyRound, Plug, Search } from "lucide-react";
import { Link, Navigate, useParams } from "react-router";
import { AI_CLIENTS, AiClientIcon } from "@/components/hb/ai-client-icons";
import { BrandName } from "@/components/hb/brand-name";
import { CodeBlock } from "@/components/hb/code-block";
import { Copy, splitSentences } from "@/components/hb/copy";
import { DocBlocks, type DocBlock } from "@/components/hb/doc-page";
import { PolicyVersionBar, usePolicyDoc } from "@/components/hb/policy-version";
import type { PolicyDocId } from "@/lib/policy";
import { DocsFrame } from "@/components/hb/docs-frame";
import { Tag } from "@/components/hb/tag";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import toolsData from "@/data/mcp-tools.json";
import { PLAN_KO, useMe } from "@/lib/auth";
import { mcpServerUrl, mcpSnippets, restBaseUrl } from "@/lib/mcp-connect";
import { MODULES } from "@/lib/modules";
import { cn } from "@/lib/utils";
import type { Route } from "./+types/docs";

const PAGES = ["mcp", "clients", "tools", "api", "limits", "errors", "terms", "copyright", "bot"] as const;
type PageId = (typeof PAGES)[number];
const TITLES: Record<PageId, string> = {
  mcp: "MCP 연결 가이드", clients: "클라이언트별 설정", tools: "도구 목록", api: "API 문서", limits: "호출 한도", errors: "오류 코드",
  terms: "이용약관", copyright: "저작권 정책", bot: "수집 로봇 안내",
};
const pageOf = (p: string | undefined): PageId | null => (!p ? "mcp" : (PAGES as readonly string[]).includes(p) ? (p as PageId) : null);

export const meta: Route.MetaFunction = ({ params }) => {
  const id = pageOf(params.page) ?? "mcp";
  return [{ title: `${TITLES[id]} — powerPlus 문서` }, { name: "description", content: "powerMCP 연결·도구·REST API·정책 문서" }];
};

interface Tool { name: string; module: string; title: string; description: string }
const TOOLS = (toolsData as { tools: Tool[] }).tools;
/** 모듈 순서(MODULES) 대로 묶고, 목록에 없는 모듈 이름은 뒤에 */
const GROUPS = [...MODULES.map((m) => m.name), ...new Set(TOOLS.map((t) => t.module).filter((n) => !MODULES.some((m) => m.name === n)))]
  .map((name) => ({ name, mod: MODULES.find((m) => m.name === name), tools: TOOLS.filter((t) => t.module === name) }))
  .filter((g) => g.tools.length > 0);
const brief = (d: string) => splitSentences(d.replace(/^\[[^\]]*\]\s*/, ""))[0] ?? d;
const KEY = "pp_live_XXXXXXXXXXXXXXXX";

const H1 = "text-4xl font-extrabold leading-[1.2] tracking-[-0.03em] md:text-5xl md:leading-[1.15]";
const H2 = "text-3xl font-extrabold tracking-[-0.02em]";

export default function DocsPage() {
  const { page } = useParams();
  const id = pageOf(page);
  if (!id) return <Navigate to="/docs" replace />;
  switch (id) {
    case "mcp": return <GuidePage />;
    case "clients": return <ClientsPage />;
    case "tools": return <ToolsPage />;
    case "api": return <ApiPage />;
    case "limits": return <LimitsPage />;
    case "errors": return <ErrorsPage />;
    case "terms": return <PolicyPage doc="terms" />;
    case "copyright": return <PolicyPage doc="copyright" removal />;
    case "bot": return <PolicyPage doc="bot" removal />;
  }
}

/* ── MCP 연결 가이드 ─────────────────────────────────────────── */

// 모듈별로 연결하면 할 수 있는 일 — 실제 도구가 하는 일 안에서만 쓴다.
const CAN: Record<string, string> = {
  powerAssets: "아이콘·사진·일러스트·장표를 낱말로 찾고 같은 스타일 세트로 묶어 받습니다.\n비슷한 에셋과 검색어 추천도 씁니다.",
  powerDeck: "장표 기획·화면 배치·발표 대본을 AI 가 직접 쓰고 형식과 분량을 판정받습니다.\n맡긴 장표 변환 작업의 진행 상황도 봅니다.",
  powerMock: "참고 사이트의 배치·색·글꼴을 근거로 시안을 만들고 판정을 받습니다.\n통과한 시안은 미리보기 주소로 게시하고 React·Vue 코드도 받습니다.",
  powerGuide: "디자인 토큰 파일과 UI 부품 소스를 그대로 받습니다.\nKRDS 지침을 찾고 만든 코드의 접근성을 검사합니다.",
};
const EXAMPLES = [
  "보고서 표지에 넣을 파랑 톤 행정 아이콘 8개를 같은 스타일 세트에서 골라 줘",
  "이 회의록으로 10장짜리 장표 기획을 써 보고, 형식 판정까지 통과시켜 줘",
  "기획한 장표를 장마다 와이어프레임으로 옮기고 겹치는 곳이 없는지 판정해 줘",
  "구청 메인 화면 시안을 만들고 판정을 통과하면 미리보기 주소를 줘",
  "공지 목록 서브 화면을 React 코드와 테마 CSS 로 받고 싶어",
  "디자인 토큰을 Tailwind 설정 파일로 주고, 탭 부품 소스도 같이 줘",
  "내가 만든 신청 폼 HTML 을 KRDS 기준으로 검사하고 고칠 곳을 알려 줘",
  "어제 맡긴 장표 변환 작업이 어디까지 됐는지 알려 줘",
];
const FAQ: Array<[string, string]> = [
  ["키 하나로 무엇을 쓰나요?", "키 하나로 powerMCP 와 REST API 를 함께 씁니다. 키를 만들 때 고른 모듈의 도구만 부를 수 있습니다."],
  ["하루에 몇 번 부를 수 있나요?", "플랜마다 하루 한도가 있습니다. 넘으면 다음 날 자정(한국 시간)에 풀립니다. 자세한 숫자는 호출 한도 문서에 있습니다."],
  ["코드도 받을 수 있나요?", "네. 시안 조립 도구는 React·Vue 페이지 코드와 테마 CSS 를 줍니다. 부품 도구는 소스 파일과 설치 명령을 줍니다. 글·연락처는 가상 값이니 실제 내용으로 바꿔 쓰세요."],
  ["AI 학습에 써도 되나요?", "안 됩니다. 응답은 참고용이며 학습 데이터셋 구축·미러링에 쓸 수 없습니다. 출처 표기와 AI 생성 표시는 지우지 마세요."],
  ["어떤 클라이언트를 지원하나요?", "MCP Streamable HTTP 를 지원하는 클라이언트면 됩니다. Claude Code, Claude 웹·데스크톱, Cursor, Codex, ChatGPT, Gemini CLI 설정은 클라이언트별 설정 문서에 있습니다."],
  ["키가 새면 어떻게 하나요?", "마이페이지 › API · MCP 키에서 그 키를 바로 폐기하세요. 폐기한 키로 온 요청은 즉시 거절됩니다."],
];

function GuidePage() {
  const { me } = useMe();
  const server = mcpServerUrl();
  const toc = [{ id: "can", title: "할 수 있는 일" }, { id: "connect", title: "연결 방법" }, { id: "server", title: "서버 주소" }, { id: "examples", title: "예시 질문" }, { id: "faq", title: "자주 묻는 질문" }];
  return (
    <DocsFrame toc={toc}>
      <div className="flex flex-wrap items-center gap-2"><Tag tone="ink">MCP</Tag><Tag tone="soft">Streamable HTTP</Tag><Tag tone="line" className="[overflow-wrap:anywhere]">{server.replace(/^https?:\/\//, "")}</Tag></div>
      <h1 className={cn(H1, "mt-4")}><BrandName name="powerMCP" /> 연결 가이드</h1>
      <Copy className="mt-4 max-w-[720px] text-md leading-[1.7] text-ink-3" text="AI 도구에 powerMCP 를 연결하면 에셋·장표·목업·디자인 규칙을 한 번에 불러 씁니다. 키 하나로 4개 모듈을 모두 씁니다." />

      <section id="can" className="mt-9 scroll-mt-27">
        <h2 className={H2}>연결하면 이런 걸 할 수 있어요</h2>
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {GROUPS.map((g) => (
            <div key={g.name} className="min-w-0 rounded-card border border-line p-5">
              <div className="flex items-center gap-2.5">
                {g.mod && <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ground-3"><g.mod.icon className="size-4" aria-hidden /></span>}
                <h3 className="text-lg"><BrandName name={g.name} /></h3>
                <span className="ml-auto text-sm text-ink-4">도구 {g.tools.length}개</span>
              </div>
              <p className="mt-3 whitespace-pre-line text-sm leading-[1.7] text-ink-3">{CAN[g.name] ?? g.mod?.desc ?? ""}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-md text-ink-3"><Link to="/docs/tools" className="font-semibold underline underline-offset-4">도구 {TOOLS.length}개 전체 보기</Link></p>
      </section>

      <section id="connect" className="mt-9 scroll-mt-27">
        <h2 className={H2}>연결 방법</h2>
        <ol className="mt-6 flex flex-col gap-6">
          <Step icon={<KeyRound className="size-4" aria-hidden />} title="1. 키 발급">
            <Copy className="mt-1 text-md text-ink-3" text="마이페이지 › API · MCP 키에서 새 키를 만듭니다. 쓸 모듈을 고르고, 만든 키는 같은 화면에서 다시 볼 수 있습니다." />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild size="sm"><Link to={me ? "/account/keys" : "/login?next=/account/keys"}>{me ? "키 관리" : "로그인하고 키 발급"}</Link></Button>
              <Button asChild size="sm" variant="outline"><Link to="/docs/limits">호출 한도</Link></Button>
            </div>
          </Step>
          <Step icon={<Plug className="size-4" aria-hidden />} title="2. 클라이언트에 연결">
            <Copy className="mt-1 text-md text-ink-3" text="쓰는 AI 도구의 설정에 서버 주소와 키를 넣습니다. 도구별 설정 문구는 클라이언트별 설정 문서에 있습니다." />
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {AI_CLIENTS.map((c) => (
                <Link key={c.id} to={`/docs/clients#${c.id}`} className="flex h-24 min-w-0 flex-col items-center justify-center gap-2 rounded-card border border-line bg-ground-2 px-1 text-center text-sm font-semibold transition-colors hover:border-ink-4"><AiClientIcon id={c.id} />{c.label}</Link>
              ))}
            </div>
          </Step>
          <Step icon={<Search className="size-4" aria-hidden />} title="3. 연결 확인">
            <p className="mt-1 text-md text-ink-3">AI 도구의 MCP 목록에서 <b>powerplus</b> 가 연결됨인지 봅니다.<br />Claude Code 는 세션 안에서 <code className="rounded-md bg-ground-3 px-1.5 py-0.5 text-sm">/mcp</code> 로 확인합니다.</p>
          </Step>
        </ol>
      </section>

      <section id="server" className="mt-9 scroll-mt-27 rounded-card border border-line p-5">
        <h2 className="text-lg font-bold">서버 주소</h2>
        <CodeBlock code={server} className="mt-3" />
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[88px_minmax(0,1fr)]">
          <dt className="font-semibold text-ink-4">인증</dt><dd className="[overflow-wrap:anywhere]">Authorization: Bearer &lt;발급받은 키&gt;</dd>
          <dt className="font-semibold text-ink-4">전송</dt><dd>Streamable HTTP(세션 없음)</dd>
          <dt className="font-semibold text-ink-4">한도</dt><dd>플랜별 하루 한도, 넘으면 429</dd>
        </dl>
      </section>

      <section id="examples" className="mt-9 scroll-mt-27">
        <h2 className={H2}>이렇게 물어보세요</h2>
        <Copy className="mt-3 text-md text-ink-3" text="평소 말로 부탁하면 됩니다. AI 가 알맞은 도구를 골라 부릅니다." />
        <ol className="mt-6 flex flex-col gap-2">
          {EXAMPLES.map((q, i) => <li key={q} className="flex gap-3 rounded-card border border-line px-5 py-3.5 text-md"><span className="w-5 shrink-0 text-right text-ink-4">{i + 1}</span><span className="min-w-0">{q}</span></li>)}
        </ol>
      </section>

      <section id="faq" className="mt-9 scroll-mt-27">
        <h2 className={H2}>자주 묻는 질문</h2>
        <Accordion type="single" collapsible className="mt-6 rounded-card border border-line px-5">
          {FAQ.map(([q, a]) => <AccordionItem key={q} value={q}><AccordionTrigger className="text-md font-semibold hover:no-underline">Q. {q}</AccordionTrigger><AccordionContent className="text-md leading-[1.7] text-ink-3"><Copy text={a} /></AccordionContent></AccordionItem>)}
        </Accordion>
      </section>
    </DocsFrame>
  );
}

function Step({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-white">{icon}</span>
      <div className="min-w-0 flex-1"><h3 className="text-lg font-bold">{title}</h3>{children}</div>
    </li>
  );
}

/* ── 클라이언트별 설정 ───────────────────────────────────────── */

const CLIENT_NOTE: Record<string, string> = {
  "claude-code": "터미널에서 한 줄로 추가합니다. 추가한 뒤 claude mcp list 로 연결 상태를 봅니다.",
  "claude-desktop": "설정 › 커넥터에서 사용자 지정 커넥터를 추가합니다. 인증은 로그인 없음으로 두고 요청 헤더에 키를 넣습니다.",
  cursor: "Settings › MCP 에서 전역 서버를 추가하거나 ~/.cursor/mcp.json 에 아래 내용을 넣습니다.",
  codex: "터미널에서 한 줄로 추가합니다.",
  chatgpt: "Developer mode 를 켜고 커넥터를 만듭니다. 헤더 칸이 없어 키를 주소에 붙이니, 이 주소는 다른 사람과 나누지 마세요.",
  "gemini-cli": "~/.gemini/settings.json 에 아래 내용을 넣습니다.",
};

function ClientsPage() {
  const { me } = useMe();
  const snip = mcpSnippets(mcpServerUrl(), KEY);
  return (
    <DocsFrame toc={AI_CLIENTS.map((c) => ({ id: c.id, title: c.label }))}>
      <h1 className={H1}>클라이언트별 설정</h1>
      <Copy className="mt-4 max-w-[720px] text-md leading-[1.7] text-ink-3" text="AI 도구마다 powerMCP 를 붙이는 방법입니다. 예시의 키 자리에는 마이페이지에서 발급받은 키를 넣으세요." />
      <p className="mt-4 text-md text-ink-3"><Link to={me ? "/account/keys" : "/login?next=/account/keys"} className="font-semibold underline underline-offset-4">내 키로 채운 설정 문구 받기</Link></p>
      <div className="mt-10">
        {AI_CLIENTS.map((c) => (
          <section key={c.id} id={c.id} className="scroll-mt-27 border-t border-line py-7 first:border-t-0 first:pt-0">
            <h2 className="flex items-center gap-3 text-2xl font-bold tracking-[-0.02em]"><span className="flex size-10 shrink-0 items-center justify-center rounded-field bg-ground-3"><AiClientIcon id={c.id} className="size-5" /></span>{c.label}</h2>
            <Copy className="mt-4 text-md leading-[1.8] text-ink-2" text={CLIENT_NOTE[c.id] ?? ""} />
            <CodeBlock code={snip[c.id]} className="mt-4" />
          </section>
        ))}
      </div>
    </DocsFrame>
  );
}

/* ── 도구 목록 ───────────────────────────────────────────────── */

function ToolsPage() {
  return (
    <DocsFrame toc={GROUPS.map((g) => ({ id: `t-${g.name}`, title: g.name }))}>
      <h1 className={H1}>도구 {TOOLS.length}개</h1>
      <Copy className="mt-4 max-w-[720px] text-md leading-[1.7] text-ink-3" text="도구 이름 앞에 모듈 이름이 붙습니다. 키를 만들 때 고른 모듈의 도구만 부를 수 있습니다." />
      {GROUPS.map((g) => (
        <section key={g.name} id={`t-${g.name}`} className="mt-9 scroll-mt-27">
          <h2 className="flex flex-wrap items-baseline gap-x-3 text-3xl font-extrabold tracking-[-0.02em]"><span><BrandName name={g.name} /></span><span className="text-md font-semibold text-ink-4">{g.tools.length}개</span></h2>
          {g.mod && <Copy className="mt-2 text-md text-ink-3" text={g.mod.sub} />}
          <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
            {g.tools.map((t) => (
              <div key={t.name} className="flex min-w-0 flex-col gap-1 rounded-card border border-line p-4">
                <code className="text-sm font-bold [overflow-wrap:anywhere]">{t.name}</code>
                <span className="text-sm font-semibold">{t.title}</span>
                <span className="text-sm leading-[1.6] text-ink-3">{brief(t.description)}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </DocsFrame>
  );
}

/* ── REST API ───────────────────────────────────────────────── */

const API_BLOCKS: DocBlock[] = [
  { id: "auth", title: "인증", paras: [
    "모든 요청 주소는 /api/v1 로 시작합니다.",
    "키는 마이페이지 › API · MCP 키에서 만들고, Authorization 헤더에 Bearer 로 실어 보냅니다. 키 하나로 powerMCP 와 REST API 를 함께 씁니다.",
    "브라우저에서 로그인한 상태라면 세션 쿠키로도 부를 수 있습니다. 키도 세션도 없으면 로그인하지 않은 방문자와 같은 범위만 응답합니다.",
  ] },
  { id: "write", title: "상태를 바꾸는 요청", paras: [
    "POST·PUT·PATCH·DELETE 요청은 아래 셋 중 하나가 있어야 받습니다. 없으면 403 CSRF_BLOCKED 로 거절합니다.",
  ], items: ["X-Requested-With 헤더", "Content-Type: application/json 본문", "Authorization 헤더(키)"] },
  { id: "format", title: "응답 형식", paras: [
    "성공하면 결과를 data 에 담아 보냅니다. 목록이면 total·page·limit 이 함께 옵니다.",
    "목록의 page 는 1부터, limit 은 기본 50에 최대 200입니다.",
    "실패하면 error(설명), code(오류 코드), hint(고칠 곳) 세 칸으로 옵니다. 날짜는 ISO 8601 형식이고, 항목 id 는 16자 공개 id 입니다.",
  ] },
  { id: "account", title: "계정·키", table: { head: ["요청", "설명"], rows: [
    ["GET /me", "로그인한 사용자·플랜·역할·하루 한도"],
    ["GET /keys", "내 키 목록(가린 값)"],
    ["GET /keys/{id}/usage", "키별 날짜별 사용량"],
  ] } },
  { id: "assets", title: "powerAssets", table: { head: ["요청", "설명"], rows: [
    ["GET /assets/categories", "카테고리와 건수"],
    ["GET /assets/items", "에셋 검색. q, category, set, sort, page, limit"],
    ["GET /assets/items/{id}", "에셋 상세와 같은 세트"],
    ["GET /assets/items/{id}/similar", "태그가 많이 겹치는 비슷한 에셋"],
    ["GET /assets/sets", "스타일 세트 목록"],
    ["GET /assets/suggest", "검색어 추천"],
  ] } },
  { id: "deck", title: "powerDeck", paras: ["장표 기획·화면 배치·대본을 직접 쓸 때 쓰는 재료와 판정입니다. 키로 부르면 하루 한도에 셉니다."], table: { head: ["요청", "설명"], rows: [
    ["GET /deck/kit/plan", "장표 기획 형식·규칙·분량"],
    ["POST /deck/check/plan", "기획 판정과 고칠 곳"],
    ["GET /deck/kit/wire", "와이어프레임 상자 종류·틀·규칙"],
    ["POST /deck/check/wireframe", "와이어프레임 판정과 장별 미리보기"],
    ["GET /deck/kit/script", "발표 대본 형식·장당 분량"],
    ["POST /deck/check/script", "대본 판정과 고칠 곳"],
  ] } },
  { id: "mock", title: "powerMock", table: { head: ["요청", "설명"], rows: [
    ["POST /mock/mockups", "시안 HTML 을 보관하고 token 을 받음"],
    ["POST /mock/mockups/{token}/check", "판정 결과 기록"],
    ["GET /mock/mockups", "내 시안 목록"],
    ["GET /mock/gallery", "공유된 시안 목록"],
  ] } },
  { id: "guide", title: "powerGuide", paras: ["키로 부르면 하루 한도에 셉니다."], table: { head: ["요청", "설명"], rows: [
    ["GET /guide/components", "UI 부품 목록"],
    ["GET /guide/components/{id}", "부품 소스·설치·사용 예·KRDS 지침"],
    ["GET /guide/rules", "KRDS 지침·패턴 검색"],
    ["GET /guide/checklist", "KRDS 검증 체크리스트"],
    ["POST /guide/check/code", "HTML 코드 접근성 판정"],
  ] } },
  { id: "community", title: "커뮤니티", table: { head: ["요청", "설명"], rows: [
    ["GET /community/posts", "글 목록. category, q, sort=new|popular"],
    ["GET /community/posts/{id}", "글 본문과 댓글"],
    ["GET /notifications", "내 알림"],
  ] } },
  { id: "support", title: "문의·삭제요청", table: { head: ["요청", "설명"], rows: [
    ["POST /contact", "문의 보내기. topic, module, name, email, message"],
    ["POST /removal", "삭제요청 접수 → 접수번호와 처리 기한"],
    ["GET /removal/{no}?email=", "삭제요청 처리 상태"],
  ] } },
];

function ApiPage() {
  const rest = restBaseUrl();
  return (
    <DocsFrame toc={[{ id: "quick", title: "빠른 시작" }, ...API_BLOCKS.map((b) => ({ id: b.id, title: b.title }))]}>
      <h1 className={H1}>API 문서</h1>
      <Copy className="mt-4 text-lg leading-[1.7] text-ink-3" text="powerPlus 기능을 코드에서 직접 부를 수 있습니다. AI 도구에서 쓰려면 powerMCP 연결이 더 간단합니다." />
      <p className="mt-3 text-sm text-ink-4">최종 수정일 2026.10.07</p>
      <div id="quick" className="mb-12 mt-12 flex scroll-mt-40 flex-col gap-4">
        <h2 className="text-2xl font-bold tracking-[-0.02em]">빠른 시작</h2>
        <CodeBlock code={`curl "${rest}/assets/items?q=행정&limit=5" \\\n  -H "Authorization: Bearer ${KEY}"`} />
        <CodeBlock code={`// 성공\n{ "data": [ … ], "total": 128, "page": 1, "limit": 5 }\n\n// 실패\n{ "error": "오늘 호출 한도를 넘었습니다.", "code": "RATE_LIMITED", "hint": "일 한도 1000건" }`} />
        <p className="text-md text-ink-3">한도와 오류는 <Link to="/docs/limits" className="font-semibold underline underline-offset-4">호출 한도</Link>·<Link to="/docs/errors" className="font-semibold underline underline-offset-4">오류 코드</Link> 문서를 보세요.</p>
      </div>
      <DocBlocks blocks={API_BLOCKS} />
    </DocsFrame>
  );
}

/* ── 호출 한도 ───────────────────────────────────────────────── */

// 근거: db/schema.sql core_plans 시드 limits(api_daily·api_keys). 요금제가 공개되기 전(billing_visible 꺼짐)에는 유료 플랜 줄을 숨긴다.
const PLAN_LIMITS: Array<{ plan: "free" | "pro" | "team" | "staff"; daily: number; keys: number; paid: boolean }> = [
  { plan: "free", daily: 100, keys: 1, paid: false },
  { plan: "pro", daily: 1000, keys: 3, paid: true },
  { plan: "team", daily: 5000, keys: 5, paid: true },
  { plan: "staff", daily: 5000, keys: 10, paid: false },
];
const LIMIT_BLOCKS: DocBlock[] = [
  { id: "count", title: "무엇을 세나", items: [
    "powerMCP 도구 호출은 한 번에 1회로 셉니다.",
    "키로 REST 를 직접 부르면 요청마다 1회로 셉니다.",
    "브라우저에서 로그인해 쓰는 화면 요청은 세지 않습니다.",
    "한 사람이 여러 키를 써도 한도는 키마다 따로 셉니다.",
    "키 범위 밖 모듈을 부르면 세지 않고 403 FORBIDDEN_SCOPE 로 막습니다.",
  ] },
  { id: "remain", title: "남은 횟수", paras: [
    "powerMCP 도구 응답에는 meta.quota 가 붙습니다. limit(하루 한도), used(오늘 쓴 양), remaining(남은 횟수), reset(다음 초기화 시각) 네 칸입니다.",
    "REST 를 직접 부른 응답에는 meta.quota 가 붙지 않습니다. 오늘 쓴 양은 마이페이지 › API · MCP 키에서 키별로 봅니다.",
  ] },
  { id: "reset", title: "초기화", paras: ["한도는 매일 자정(한국 시간)에 풀립니다."] },
  { id: "over", title: "한도를 넘으면", paras: ["429 상태와 RATE_LIMITED 코드로 응답합니다. hint 에 그 키의 하루 한도(예: 일 한도 100건)가 들어 있습니다.", "powerMCP 는 다음 초기화 시각도 함께 알려 줍니다."] },
  { id: "other", title: "그 밖의 제한", table: { head: ["대상", "제한"], rows: [
    ["목록 한 번에", "최대 200건(기본 50건)"],
    ["로그인 코드 메일", "같은 주소로 1분에 한 번"],
    ["시안 보관", "한 장 2MB 까지"],
    ["새 시안", "하루 60건(임직원 기본 300건)"],
    ["보고서", "하루 50건"],
    ["와이어프레임 저장", "하루 100개"],
  ], center: true } },
];

function LimitsPage() {
  const { me } = useMe();
  const rows = PLAN_LIMITS.filter((r) => !r.paid || me?.billing_visible);
  return (
    <DocsFrame toc={[{ id: "plans", title: "플랜별 한도" }, ...LIMIT_BLOCKS.map((b) => ({ id: b.id, title: b.title }))]}>
      <h1 className={H1}>호출 한도</h1>
      <Copy className="mt-4 text-lg leading-[1.7] text-ink-3" text="키마다 하루에 부를 수 있는 횟수가 정해져 있습니다. 한도는 키 주인의 플랜을 따릅니다." />
      <section id="plans" className="mt-8 scroll-mt-27">
        <h2 className="text-2xl font-bold tracking-[-0.02em]">플랜별 한도</h2>
        {me?.limits && <p className="mt-3 text-md text-ink-3">내 플랜 <b className="text-ink">{PLAN_KO[me.plan]}</b> · 하루 <b className="text-ink">{me.limits.api_daily < 0 ? "무제한" : `${me.limits.api_daily.toLocaleString()}회`}</b></p>}
        <div className="mt-5 overflow-hidden rounded-2xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-ground-3"><tr><th className="px-4 py-3 text-center font-semibold">플랜</th><th className="px-4 py-3 text-center font-semibold">하루 호출</th><th className="px-4 py-3 text-center font-semibold">키 개수</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.plan} className={cn("border-t border-line", me?.plan === r.plan && "bg-ground-2")}>
                  <td className="px-4 py-3 text-center font-semibold">{PLAN_KO[r.plan]}</td>
                  <td className="px-4 py-3 text-center tabular-nums text-ink-3">{r.daily.toLocaleString()}회</td>
                  <td className="px-4 py-3 text-center tabular-nums text-ink-3">{r.keys}개</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!me?.billing_visible && <Copy className="mt-3 text-sm text-ink-4" text="유료 요금제는 공개할 때 한도를 함께 알립니다." />}
      </section>
      <div className="mt-12"><DocBlocks blocks={LIMIT_BLOCKS} /></div>
    </DocsFrame>
  );
}

/* ── 오류 코드 ───────────────────────────────────────────────── */

// 근거: api/src/Core/HttpError.php·Response::error 를 부르는 곳(api/public/index.php·routes/*). 상태 코드는 던지는 곳의 값.
const ERROR_BLOCKS: DocBlock[] = [
  { id: "shape", title: "오류 형식", paras: [
    "오류는 error(설명), code(오류 코드), hint(고칠 곳) 세 칸으로 옵니다. hint 는 없을 수도 있습니다.",
    "프로그램에서는 설명 문구가 아니라 code 로 가려 주세요. 설명 문구는 바뀔 수 있습니다.",
  ] },
  { id: "auth-errors", title: "인증·권한", table: { head: ["코드", "상태", "뜻"], rows: [
    ["UNAUTHORIZED", "401", "로그인 또는 키가 필요합니다. 키가 폐기됐거나 만료돼도 같습니다."],
    ["LOGIN_REQUIRED", "401", "로그인한 회원만 쓸 수 있는 기능입니다(내려받기·회원 글 보기)."],
    ["FORBIDDEN", "403", "권한이 없습니다. 다른 계정이 만든 시안을 고치려 할 때도 같습니다."],
    ["FORBIDDEN_SCOPE", "403", "키에 그 모듈(assets·deck·mock·guide) 범위가 없습니다. REST·powerMCP 같습니다. 마이페이지 › API·MCP 키에서 범위를 확인하세요."],
    ["JUDGE_REQUIRED", "403", "시안 판정은 powerMCP 의 mock_check_mockup 으로만 기록됩니다."],
    ["TEST_READ_ONLY", "403", "테스트 계정은 읽기 전용입니다."],
    ["CONSENT_REQUIRED", "428", "필수 약관 동의 전입니다. 웹에 로그인해 동의 화면에서 동의하세요."],
    ["CSRF_BLOCKED", "403", "상태를 바꾸는 요청에 X-Requested-With·JSON 본문·키가 없습니다."],
    ["BLOCKED", "403", "이용이 정지된 계정입니다."],
    ["UPGRADE_REQUIRED", "402", "지금 플랜에서 볼 수 없는 자료입니다."],
    ["NOT_ENOUGH_POINTS", "402", "포인트가 모자랍니다."],
  ] } },
  { id: "input-errors", title: "요청·입력", table: { head: ["코드", "상태", "뜻"], rows: [
    ["INVALID", "400·422", "입력값이 맞지 않습니다. hint 에 고칠 필드 이름이 들어 있습니다."],
    ["VALIDATION", "422", "레퍼런스 삭제요청 양식의 값이 맞지 않습니다. 필드별 이유가 details 에 옵니다."],
    ["NOT_FOUND", "404", "주소나 대상을 찾을 수 없습니다."],
    ["METHOD_NOT_ALLOWED", "405", "그 주소에서 받지 않는 메서드입니다."],
    ["TOO_LARGE", "413", "본문이 너무 큽니다."],
    ["INSUFFICIENT", "400", "잔액보다 많이 쓰거나 회수하려 했습니다."],
  ] } },
  { id: "state-errors", title: "상태 충돌", table: { head: ["코드", "상태", "뜻"], rows: [
    ["CONFLICT", "409", "지금 상태에서는 할 수 없는 요청입니다."],
    ["DUPLICATE", "409", "이미 같은 요청이 있습니다."],
    ["NOT_PASSED", "409", "판정을 통과하지 않은 시안은 게시할 수 없습니다."],
    ["NOT_SHARED", "409", "공유하지 않은 항목입니다."],
  ] } },
  { id: "limit-errors", title: "한도", table: { head: ["코드", "상태", "뜻"], rows: [
    ["RATE_LIMITED", "429", "키의 오늘 호출 한도를 넘었습니다. hint 에 하루 한도가 있고, 자정(한국 시간)에 풀립니다. 새 시안·글쓰기처럼 너무 잦은 요청도 같은 코드입니다."],
    ["RATE_LIMIT", "429", "기능별 하루 상한(보고서 50건·와이어프레임 100개)을 넘었습니다."],
    ["TOO_SOON", "429", "같은 요청을 너무 빨리 다시 보냈습니다."],
  ] } },
  { id: "server-errors", title: "서버", table: { head: ["코드", "상태", "뜻"], rows: [
    ["INTERNAL", "500", "서버 오류입니다. 잠시 뒤 다시 시도해 주세요."],
    ["STORAGE", "500", "파일을 저장하지 못했습니다."],
    ["UNAVAILABLE", "503", "필요한 자료를 지금 읽을 수 없습니다."],
  ] } },
];

function ErrorsPage() {
  return (
    <DocsFrame toc={ERROR_BLOCKS.map((b) => ({ id: b.id, title: b.title }))}>
      <h1 className={H1}>오류 코드</h1>
      <Copy className="mt-4 text-lg leading-[1.7] text-ink-3" text="REST API 와 powerMCP 가 돌려주는 오류 코드입니다. 오류가 나면 hint 부터 확인하세요." />
      <CodeBlock code={`{ "error": "로그인이 필요합니다.", "code": "UNAUTHORIZED" }`} className="mb-12 mt-8" />
      <DocBlocks blocks={ERROR_BLOCKS} />
    </DocsFrame>
  );
}

/* ── 정책(/legal/:doc 과 같은 내용) ─────────────────────────── */

function PolicyPage({ doc: docId, removal }: { doc: PolicyDocId; removal?: boolean }) {
  const p = usePolicyDoc(docId);
  const doc = p.spec;
  return (
    <DocsFrame toc={doc.blocks.map((b) => ({ id: b.id, title: b.title }))}>
      <h1 className={H1}>{doc.title}</h1>
      {doc.lead && <Copy className="mt-4 text-lg leading-[1.7] text-ink-3" text={doc.lead} />}
      <PolicyVersionBar p={p} />
      {doc.draft && <Copy className="mt-6 rounded-2xl bg-ground-3 px-5 py-4 text-sm leading-[1.7] text-ink-3" text={doc.draft} />}
      {removal && (
        <div className="mt-8 flex flex-wrap items-center gap-3 rounded-panel bg-ground-3 px-6 py-5">
          <span className="min-w-0 flex-1 text-md">내려야 할 콘텐츠나 개인정보가 보이나요?</span>
          <Button asChild size="sm"><Link to="/removal">삭제요청</Link></Button>
        </div>
      )}
      <div className="mt-12"><DocBlocks blocks={doc.blocks} /></div>
      <p className="mt-4 text-sm text-ink-4">다른 정책: <Link to="/legal/privacy" className="pp-hit underline underline-offset-2">개인정보처리방침</Link> · <Link to="/legal/email" className="underline underline-offset-2">이메일 무단수집 거부</Link></p>
    </DocsFrame>
  );
}

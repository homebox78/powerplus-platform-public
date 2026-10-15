// powerMCP 안내 페이지(/powermcp) — 헤더 우측 "powerMCP" 버튼이 여는 곳. /mcp 는 MCP 서버 주소(Apache 프록시)라 페이지 주소로 쓰지 않는다.
// 짜임: 히어로 → 모듈별 "이렇게 요청하면 → 이 도구가 → 이렇게 돌려줍니다" → 연결 방법(도구 6종 선택) → 도구 표 → 키 안내.
// 도구 표는 손으로 쓰지 않는다 — packages/mcp/scripts/gen-tools.mjs 가 registerTool 호출에서 만든 data/mcp-tools.json.
// 연결 문구는 계정 키 화면과 같은 lib/mcp-connect 를 쓴다(출처: routes/account-keys.tsx·docs-mcp.tsx 를 합침).
import { MobileCarousel } from "@/components/hb/mobile-carousel";
import { ArrowDown, ArrowRight, KeyRound } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { AI_CLIENTS, AiClientIcon, type AiClientId } from "@/components/hb/ai-client-icons";
import { BrandName } from "@/components/hb/brand-name";
import { CodeBlock } from "@/components/hb/code-block";
import { Copy, splitSentences } from "@/components/hb/copy";
import { Tag } from "@/components/hb/tag";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MCP_EXAMPLE_GROUPS } from "@/data/mcp-examples";
import toolsData from "@/data/mcp-tools.json";
import { useMe } from "@/lib/auth";
import { mcpServerUrl, mcpSnippets } from "@/lib/mcp-connect";
import { MODULES } from "@/lib/modules";
import { cn } from "@/lib/utils";
import type { Route } from "./+types/powermcp";

export const meta: Route.MetaFunction = () => [
  { title: "powerMCP — powerPlus" },
  { name: "description", content: "AI 에 연결해 에셋·장표·목업·디자인 규칙을 한 번에 불러 씁니다." },
];

interface Tool { name: string; module: string; title: string; description: string }
const TOOLS = (toolsData as { tools: Tool[] }).tools;

// 모듈별 요청 예문 — 실제 도구가 하는 일 안에서만 쓴다(없는 기능을 약속하지 않는다).
const FLOWS: Record<string, { asks: [string, string]; returns: string }> = {
  assets: {
    asks: ["보고서 표지에 넣을 파랑 톤 행정 아이콘을 같은 스타일로 8개 골라 줘", "민원 창구 사진과 비슷한 사진도 몇 장 더 찾아 줘"],
    returns: "썸네일이 붙은 에셋 목록을 돌려줍니다. 같은 스타일 세트도 함께 묶어 줍니다.",
  },
  deck: {
    asks: ["이 제안요청서로 15분 발표 장표 기획과 와이어프레임을 잡아 줘", "내가 맡긴 장표 작업이 어디까지 됐는지 알려 줘"],
    returns: "기획·와이어·대본 재료와 판정 결과를 돌려줍니다. 작업 상태와 결과 주소도 알려 줍니다.",
  },
  mock: {
    asks: ["대학교 메인 화면 시안을 만들고 판정을 통과하면 미리보기 주소를 줘", "공지 목록 화면을 React 코드로 받고 싶어"],
    returns: "시안 재료와 판정 결과, 미리보기 주소를 돌려줍니다. Vue·React 코드와 테마 CSS 도 받습니다.",
  },
  guide: {
    asks: ["디자인 토큰을 Tailwind 설정 파일로 줘", "탭 부품이 KRDS 어느 항목에 해당하는지 알려 줘"],
    returns: "토큰 파일 내용을 그대로 돌려줍니다. KRDS 공식 가이드 링크도 함께 줍니다.",
  },
};

// 표의 한 줄 설명 — 첫 문장만, 앞의 [안내] 꼬리표는 뗀다.
const brief = (d: string) => splitSentences(d.replace(/^\[[^\]]*\]\s*/, ""))[0] ?? "";

// 안내 문구에는 함수 이름(mock_get_wireframe 등) 대신 도구의 한글 이름을 쓴다(MC-13). 괄호 꼬리("(가중 합성)")는 뗀다.
// 함수 이름 자체는 아래 도구 표에서만 보여 준다.
const TITLE = new Map(TOOLS.map((t) => [t.name, t.title.replace(/\s*\([^)]*\)\s*$/, "")]));
const label = (name: string) => TITLE.get(name) ?? name;

export default function PowerMcpPage() {
  const { me } = useMe();
  const [client, setClient] = useState<AiClientId>("claude-code");
  const [group, setGroup] = useState(MCP_EXAMPLE_GROUPS[0]?.id ?? "");
  // 모바일(640 미만)에선 모듈별 카드 4장을 탭 하나씩으로 본다(사용자 2026-10-10 "모바일에서는 탭 형태로")
  const [mod, setMod] = useState(MODULES.find((m) => FLOWS[m.id])?.id ?? "");
  const g = MCP_EXAMPLE_GROUPS.find((x) => x.id === group) ?? MCP_EXAMPLE_GROUPS[0]!;
  const exampleCount = MCP_EXAMPLE_GROUPS.reduce((n, x) => n + x.items.length, 0);
  const server = mcpServerUrl();
  const snippets = mcpSnippets(server, "<발급받은 키>");
  const keysTo = me ? "/account/keys" : "/login?next=/account/keys";
  const ordered = MODULES.flatMap((m) => TOOLS.filter((t) => t.module === m.name)).concat(TOOLS.filter((t) => !MODULES.some((m) => m.name === t.module)));

  return (
    <div className="pb-12">
      {/* 히어로 */}
      <section className="container-page flex flex-col items-center pt-10 text-center">
        <div className="flex flex-wrap justify-center gap-2"><Tag tone="soft">MCP</Tag><Tag tone="line">Streamable HTTP</Tag></div>
        <h1 className="pp-module-title mt-5 text-5xl md:text-[64px]"><BrandName name="powerMCP" /></h1>
        <Copy className="mt-5 max-w-[720px] text-lg leading-[1.7] text-ink-3" text="AI 에 연결해 에셋·장표·목업·디자인 규칙을 한 번에 불러 씁니다. 키 하나로 4개 모듈을 모두 씁니다." />
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <Button asChild size="lg"><Link to={keysTo}><KeyRound aria-hidden />키 발급받기</Link></Button>
          <Button asChild size="lg" variant="outline"><a href="#connect">연결 방법<ArrowDown aria-hidden /></a></Button>
        </div>
      </section>

      {/* 모듈별 흐름 */}
      <section className="container-page mt-16">
        <h2 className="text-3xl font-extrabold tracking-[-0.02em]">이렇게 요청하면</h2>
        <Copy className="mt-3 text-md text-ink-3" text="AI 에게 평소 말로 부탁하면 됩니다. AI 가 알맞은 도구를 골라 부릅니다." />
        <div className="mt-6 grid grid-cols-4 border-b border-line sm:hidden" role="tablist" aria-label="모듈">
          {MODULES.filter((m) => FLOWS[m.id]).map((m) => (
            <button key={m.id} type="button" role="tab" aria-selected={mod === m.id} onClick={() => setMod(m.id)} className={cn("relative h-12 min-w-0 text-sm transition-colors", mod === m.id ? "font-bold text-ink after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-ink" : "font-medium text-ink-4")}>
              {m.name.replace(/^power/, "")}
            </button>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:mt-8 md:grid-cols-2">
          {MODULES.map((m) => {
            const flow = FLOWS[m.id];
            const names = TOOLS.filter((t) => t.module === m.name).map((t) => t.name);
            if (!flow) return null;
            return (
              <article key={m.id} role="tabpanel" className={cn("flex min-w-0 flex-col rounded-card border border-line p-6", mod !== m.id && "max-sm:hidden")}>
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ground-3"><m.icon className="size-5" aria-hidden /></span>
                  <h3 className="pp-module-title text-[22px]"><BrandName name={m.name} /></h3>
                </div>
                <p className="mt-5 text-sm font-semibold text-ink-4">요청</p>
                <ul className="mt-2 flex flex-col gap-2">
                  {flow.asks.map((a) => <li key={a} className="rounded-field bg-ground-2 px-4 py-3 text-md">“{a}”</li>)}
                </ul>
                <p className="mt-5 flex items-center gap-1.5 text-sm font-semibold text-ink-4"><ArrowRight className="size-4" aria-hidden />이 도구가</p>
                <div className="mt-2 flex flex-wrap gap-1.5">{names.map((n) => <Tag key={n} tone="line" className="[overflow-wrap:anywhere]">{label(n)}</Tag>)}</div>
                <p className="mt-5 flex items-center gap-1.5 text-sm font-semibold text-ink-4"><ArrowRight className="size-4" aria-hidden />이렇게 돌려줍니다</p>
                <Copy className="mt-2 text-md leading-[1.7] text-ink-3" text={flow.returns} />
              </article>
            );
          })}
        </div>
      </section>

      {/* 질문 예시 갤러리 — 원천은 data/mcp-examples.ts */}
      <section id="examples" className="container-page mt-16 scroll-mt-19">
        <h2 className="text-3xl font-extrabold tracking-[-0.02em]">이런 것까지 물어볼 수 있어요</h2>
        <Copy className="mt-3 text-md text-ink-3" text={`실제로 쓸 수 있는 질문 ${exampleCount}가지입니다. 할 수 있는지 모를 때는 그냥 물어보세요.`} />
        {/* 모바일은 가로 100% 셀렉트 하나(사용자 2026-10-10), 640 이상은 밑줄 탭 */}
        <Select value={group} onValueChange={setGroup}>
          <SelectTrigger className="mt-6 w-full sm:hidden" aria-label="질문 분류"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MCP_EXAMPLE_GROUPS.map((x) => <SelectItem key={x.id} value={x.id}>{x.label} {x.items.length}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="mt-6 flex flex-wrap gap-x-6 border-b border-line max-sm:hidden" role="tablist" aria-label="질문 분류">
          {MCP_EXAMPLE_GROUPS.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={group === x.id} onClick={() => setGroup(x.id)} className={cn("relative h-12 text-md transition-colors", group === x.id ? "font-bold text-ink after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-ink" : "font-medium text-ink-4 hover:text-ink")}>
              {x.label}<span className="ml-1 text-sm text-ink-4">{x.items.length}</span>
            </button>
          ))}
        </div>
        <Copy className="mt-4 text-sm text-ink-4" text={g.desc} />
        <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2" role="tabpanel">
          {g.items.map((e) => (
            <li key={e.q} className="flex min-w-0 flex-col rounded-card border border-line p-5">
              <p className="text-md font-semibold leading-[1.6]">“{e.q}”</p>
              <div className="mt-3 flex flex-wrap gap-1.5">{e.tools.map((n) => <Tag key={n} tone="line" className="[overflow-wrap:anywhere]">{label(n)}</Tag>)}</div>
              <p className="mt-3 flex items-start gap-1.5 text-sm leading-[1.6] text-ink-3"><ArrowRight className="mt-[3px] size-4 shrink-0" aria-hidden />{e.result}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* 연결 방법 */}
      <section id="connect" className="container-page mt-16 scroll-mt-19">
        <h2 className="text-3xl font-extrabold tracking-[-0.02em]">연결 방법</h2>
        <Copy className="mt-3 text-md text-ink-3" text="쓰는 AI 도구를 고르세요. 키 자리에는 마이페이지에서 발급받은 키를 넣습니다." />
        <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-6" role="tablist" aria-label="연결할 AI 도구">
          {AI_CLIENTS.map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={client === c.id} onClick={() => setClient(c.id)} className={cn("flex h-[104px] min-w-0 flex-col items-center justify-center gap-2.5 rounded-card border bg-ground px-1 text-center text-sm font-semibold transition-colors", client === c.id ? "border-ink ring-1 ring-ink" : "border-line hover:bg-ground-2")}>
              <AiClientIcon id={c.id} />{c.label}
            </button>
          ))}
        </div>
        <CodeBlock code={snippets[client]} className="mt-4" />
        <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-2 rounded-card border border-line p-5 text-md sm:grid-cols-[120px_minmax(0,1fr)]">
          <dt className="font-semibold text-ink-4">서버 주소</dt><dd className="[overflow-wrap:anywhere]">{server}</dd>
          <dt className="font-semibold text-ink-4">인증</dt><dd>Authorization: Bearer &lt;발급받은 키&gt;</dd>
          <dt className="font-semibold text-ink-4">확인</dt><dd>AI 도구의 MCP 목록에서 powerplus 가 연결됨인지 봅니다.</dd>
        </dl>
      </section>

      {/* 도구 표 */}
      <section id="tools" className="container-page mt-16 scroll-mt-19">
        <h2 className="text-3xl font-extrabold tracking-[-0.02em]">도구 {TOOLS.length}개</h2>
        <Copy className="mt-3 text-md text-ink-3" text="도구 이름 앞에 모듈 이름이 붙습니다. 키를 만들 때 고른 모듈의 도구만 씁니다." />
        {/* 넓은 화면 = 표, 좁은 화면 = 카드(가로 스크롤 없이) */}
        <div className="mt-6 hidden overflow-hidden rounded-card border border-line md:block">
          <Table>
            <TableHeader>
              <TableRow className="bg-ground-2 hover:bg-ground-2"><TableHead className="w-[130px]">모듈</TableHead><TableHead className="w-[260px]">도구 이름</TableHead><TableHead>하는 일</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {ordered.map((t) => (
                <TableRow key={t.name}>
                  <TableCell className="text-center text-ink-3">{t.module}</TableCell>
                  <TableCell className="text-center font-semibold [overflow-wrap:anywhere] whitespace-normal">{t.name}</TableCell>
                  <TableCell className="whitespace-normal text-left"><span className="font-semibold">{t.title}</span><span className="mt-0.5 block text-sm leading-[1.6] text-ink-3">{brief(t.description)}</span></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <MobileCarousel as="ul" label="도구" className="mt-6 flex flex-col gap-2 md:hidden">
          {ordered.map((t) => (
            <li key={t.name} className="min-w-0 rounded-card border border-line p-4">
              <div className="flex flex-wrap items-center gap-2"><Tag tone="soft">{t.module}</Tag><span className="text-sm font-semibold [overflow-wrap:anywhere]">{t.name}</span></div>
              <p className="mt-2 text-md font-semibold">{t.title}</p>
              <p className="mt-0.5 text-sm leading-[1.6] text-ink-3">{brief(t.description)}</p>
            </li>
          ))}
        </MobileCarousel>
      </section>

      {/* 키 안내 */}
      <section className="container-page mt-16">
        <div className="flex flex-col items-start gap-5 rounded-banner bg-dark px-8 py-12 text-white md:flex-row md:items-center md:px-14 dark:bg-ground-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-extrabold tracking-[-0.02em]">키는 마이페이지에서</h2>
            <Copy className="mt-3 text-md leading-[1.7] text-white/70" text="키는 마이페이지에서 발급하고 폐기합니다. 키 하나로 powerMCP 와 REST API 를 함께 씁니다." />
            {me?.limits && <p className="mt-2 text-sm text-white/60">내 키 하루 한도 {me.limits.api_daily < 0 ? "무제한" : `${me.limits.api_daily.toLocaleString()}회`}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="lg" variant="white"><Link to={keysTo}>키 관리</Link></Button>
            {me?.billing_visible && <Button asChild size="lg" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"><Link to="/pricing">요금제</Link></Button>}
            <Button asChild size="lg" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"><Link to="/docs">자세한 문서</Link></Button>
          </div>
        </div>
      </section>
    </div>
  );
}

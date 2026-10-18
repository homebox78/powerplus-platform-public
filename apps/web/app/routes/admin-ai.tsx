// 관리자 · AI 설정 — 모든 솔루션의 AI 를 한 곳에서(사용자 지시 2026-10-07: "AI 설정은 따로 설정 메뉴로, 각 솔루션의 AI 를 통합 컨트롤, Jev 도").
// 새로 씀. 서버: api/routes/admin_ai.php. powerDeck 키·모델·한도는 새로 만들지 않고 기존 장표 설정 화면(DeckSettingsScreen engine)을 그대로 끼운다.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { LiveStatus } from "@/components/hb/live-status";
import { AdminTitle, RowSwitch, SortHead, useSort } from "@/components/admin/admin-ui";
import { Minus, Plus } from "lucide-react";
import { confirmToast, toastError } from "@/components/hb/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { fetchAdminAi, saveAdminChat, saveAdminJev, saveAdminProvider, type AiChatSolution, type AiDeckSolution, type AiJevSolution, type AiProvider } from "@/lib/admin-ai";
import { DeckSettingsScreen } from "@/modules/deck/screens";
import { useMobileSections } from "@/components/hb/mobile-sections";
import type { Route } from "./+types/admin-ai";

export const meta: Route.MetaFunction = () => [{ title: "AI 설정 — powerPlus 관리자" }];

const KEY = ["admin", "ai"];
const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;
const SOL_KO: Record<string, string> = { deck: "powerDeck", jev: "빠른 판단", chat: "powerPlus AI" };

export default function AdminAi() {
  const q = useQuery({ queryKey: KEY, queryFn: fetchAdminAi });
  const d = q.data;
  const deck = d?.solutions.find((s): s is AiDeckSolution => s.id === "deck");
  const jev = d?.solutions.find((s): s is AiJevSolution => s.id === "jev");
  const chat = d?.solutions.find((s): s is AiChatSolution => s.id === "chat");
  // 모바일은 설정 칸 넷을 탭 하나로(PC 는 그대로 세로로)
  const ms = useMobileSections("설정", [{ value: "chat", label: "AI 답변" }, { value: "jev", label: "빠른 판단" }, { value: "deck", label: "powerDeck" }, { value: "usage", label: "사용량" }]);
  const us = useSort(d?.usage ?? [], { sol: (u) => SOL_KO[u.solution] ?? u.solution, label: (u) => u.label, calls: (u) => u.calls, cost: (u) => u.cost });
  return (
    <div>
      <AdminTitle title="AI 설정" desc="모든 서비스의 AI 를 여기서 봅니다. 키·모델·한도·사용처를 한 곳에서 바꿉니다." />
      {q.isLoading && <p className="mt-8 text-ink-4">불러오는 중</p>}
      {d && (
        <div className="mt-7 grid gap-5">
          {/* OpenRouter 연결은 한 줄 요약만 — 키 넣기·바꾸기는 아래 powerDeck 칸 한 곳에서(중복 정리 2026-10-08) */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-line px-5 py-3 text-sm">
            <b className="text-ink">OpenRouter</b>
            {d.openrouter.usable ? <LiveStatus state="ok">연결됨</LiveStatus> : d.openrouter.set ? <b className="text-warn">키를 풀 수 없음 — 아래에서 다시 넣어 주세요</b> : <b className="text-warn">키 없음 — 아래에서 넣어 주세요</b>}
            {d.openrouter.last4 && <span className="text-ink-4">키 …{d.openrouter.last4} · {d.openrouter.source === "config" ? "서버 설정 파일" : "관리자 입력"}</span>}
            <span className="text-ink-4">{d.provider.value === "claude" ? "시안 그림과 빠른 판단이 이 키로 돕니다." : "모든 AI 가 이 키 하나로 돕니다."}</span>
          </div>

          <ProviderCard key={d.provider.value + d.provider.claude.keys.map((k) => k.id).join(",") + (d.provider.claude.budget?.per_key ?? "") + (d.provider.claude.budget?.reset_day ?? "")} s={d.provider} />

          {ms.bar}

          <div className={ms.wrap("chat")}>{chat && <ChatCard key={chat.model + chat.daily_usd} s={chat} />}</div>
          <div className={ms.wrap("jev")}>{jev && <JevCard key={jev.daily_usd} s={jev} />}</div>

          <div className={ms.wrap("deck")}>
          {deck && (
            <Card title={deck.name} desc={deck.desc} extra={<Link to="/admin/deck-settings/bill" className="pp-hit text-sm font-semibold text-ink-3 underline-offset-4 hover:underline">이력·과금 보기</Link>}>
              {/* 모델·키·한도 요약 목록은 아래 설정 칸과 같은 값이라 뺐다 */}
              <DeckSettingsScreen forceMenu="engine" />
            </Card>
          )}
          </div>

          <div className={ms.wrap("usage")}>
          <Card title="최근 30일 사용량" desc="엔진(구독) 사용분을 포함한 금액입니다.">
            <div className="overflow-hidden rounded-xl border border-line">
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <SortHead s={us} k="sol" className="w-[120px]">서비스</SortHead>
                    <SortHead s={us} k="label">종류</SortHead>
                    <SortHead s={us} k="calls" className="w-[96px]">호출</SortHead>
                    <SortHead s={us} k="cost" className="w-[110px]">비용</SortHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {us.rows.map((u) => (
                    <TableRow key={u.kind}>
                      <TableCell className="text-center">{SOL_KO[u.solution] ?? u.solution}</TableCell>
                      <TableCell className="truncate text-left">{u.label}</TableCell>
                      <TableCell className="text-right tabular-nums">{u.calls.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{usd(u.cost)}</TableCell>
                    </TableRow>
                  ))}
                  {d.usage.length === 0 && <TableRow><TableCell colSpan={4} className="py-10 text-center text-ink-4">최근 30일 사용 기록이 없습니다.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ title, desc, extra, children }: { title: string; desc: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-line p-5 md:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0"><h2 className="text-xl font-bold">{title}</h2><p className="mt-1 text-sm text-ink-4">{desc}</p></div>
        {extra}
      </div>
      {children}
    </section>
  );
}

/**
 * Claude API 키 — 있으면 시안 그림 외 글 작업(답변·기획·자료 정리·대본·와이어·장표 제작)이 Claude API, 없으면 OpenRouter 기존 설정.
 * 고르는 칸 없음(2026-10-17 사용자 지시) — 모델도 고정: 장표 제작 Opus 5.5, 나머지 Sonnet 5.5. 빠른 판단은 늘 OpenRouter.
 */
function ProviderCard({ s }: { s: AiProvider }) {
  const qc = useQueryClient();
  const [key, setKey] = useState("");
  const save = useMutation({
    mutationFn: saveAdminProvider,
    onSuccess: (_r, b) => {
      toast.success(b.claude_key ? "Claude API 키를 확인하고 더했습니다."
        : b.remove_claude_key_id ? (s.claude.keys.length <= 1 ? "Claude API 키를 모두 뺐습니다. 이제 OpenRouter 로 돕니다." : "Claude API 키를 하나 뺐습니다.")
        : "월 크레딧·갱신일을 저장했습니다.");
      setKey("");
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => toastError(e),
  });
  // 붙여 넣다 섞인 줄바꿈·공백은 뺀다. 꼴은 앞머리만 보고 진짜 확인은 서버가 Claude API 에 물어서 한다(2026-10-17 저장 버튼이 안 켜졌다)
  const clean = key.replace(/\s+/g, "");
  const validKey = clean.startsWith("sk-ant-") && !clean.startsWith("sk-ant-admin") && clean.length >= 30;
  const on = s.value === "claude";
  const st = s.claude.status;
  const keys = s.claude.keys;
  const active = keys.findIndex((k) => k.state === "ok");   // 넣은 순서대로 막히지 않은 첫 키를 쓴다
  const bg = s.claude.budget;
  const [credit, setCredit] = useState(String(bg?.per_key ?? 200));
  const [day, setDay] = useState(String(bg?.reset_day ?? 1));
  const validCredit = /^\d+(\.\d{1,2})?$/.test(credit.trim()) && Number(credit) <= 100000;
  const validDay = /^\d{1,2}$/.test(day.trim()) && Number(day) >= 1 && Number(day) <= 31;
  const pct = bg && bg.credit > 0 ? Math.min(100, (bg.spent / bg.credit) * 100) : 0;
  return (
    <Card title="Claude API" desc="키가 있으면 시안 그림 외 글 작업을 Claude API 로 먼저 보냅니다.">
      <div className="flex flex-wrap items-center gap-3">
        {s.claude.set
          ? (!s.claude.usable ? <b className="text-sm text-warn">키를 풀 수 없음 — 다시 넣어 주세요</b>
            : st.state === "ok" ? <LiveStatus state="ok">사용 중 · 키 {keys.length}개 중 {active + 1}번째</LiveStatus>
            : <b className="text-sm text-warn">키 {keys.length}개 모두 {st.state === "no_credits" ? "크레딧 소진" : "막힘"} — OpenRouter 로 대신 도는 중 ({st.at?.slice(5, 16)}부터 · 30분마다 다시 시도)</b>)
          : <span className="text-sm text-ink-4">키 없음 — 지금은 OpenRouter 기존 설정으로 돕니다</span>}
      </div>

      {/* 키 목록 — 위에서부터 차례로 쓰고, 크레딧 소진·거절된 키는 30분 건너뛰고 다음 키로. 다 막히면 OpenRouter(2026-10-18) */}
      {keys.length > 0 && (
        <ol className="mt-4 grid w-[640px] max-w-full divide-y divide-line rounded-xl border border-line">
          {keys.map((k, i) => (
            <li key={k.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="w-6 shrink-0 text-center tabular-nums text-ink-4">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono text-ink">…{k.last4}</span>
                  {k.state === "ok"
                    ? (i === active ? <LiveStatus state="ok">지금 사용</LiveStatus> : <span className="text-ink-3">대기</span>)
                    : <b className="text-warn">{k.state === "no_credits" ? "크레딧 소진" : "키 거절"} · {k.at?.slice(5, 16)}부터</b>}
                  <span className="tabular-nums text-ink">{usd(k.spent)}<span className="text-ink-4"> / {usd(bg?.per_key ?? 0)} · {k.calls.toLocaleString()}회</span></span>
                </div>
                {/* 마지막 사용·소진 이력 — 소진 이력은 충전 뒤 다시 쓰여도 남는다 */}
                <p className="mt-0.5 text-ink-4">
                  {k.last_used ? `마지막 사용 ${k.last_used.slice(5, 16)}` : "아직 안 씀"}
                  {k.exhausted && ` · 마지막 소진 ${k.exhausted.at.slice(5, 16)} (그 기간 ${usd(k.exhausted.spent)} 쓰고)`}
                </p>
              </div>
              <Button size="icon-sm" variant="ghost" className="shrink-0" aria-label={`키 …${k.last4} 빼기`} disabled={save.isPending}
                onClick={() => confirmToast(`키 …${k.last4} 를 뺄까요?`, () => save.mutate({ remove_claude_key_id: k.id }), { action: "빼기", description: keys.length === 1 ? "마지막 키라 빼면 OpenRouter 로 돕니다." : undefined })}>
                <Minus className="size-4" />
              </Button>
            </li>
          ))}
        </ol>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label htmlFor="claude-key" className="sr-only">Claude API 키 더하기</label>
        <Input id="claude-key" type="password" autoComplete="off" className="h-9 w-96 max-w-full min-w-0" value={key} placeholder="sk-ant-api…" onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && validKey && !save.isPending) save.mutate({ claude_key: clean }); }} />
        <Button size="sm" variant="outline" disabled={!validKey || save.isPending} onClick={() => save.mutate({ claude_key: clean })}><Plus className="size-4" />키 더하기</Button>
      </div>
      <p className="mt-2 text-sm text-ink-4">키는 몇 개든 더할 수 있고, 위에서부터 차례로 씁니다.<br />크레딧이 떨어진 키는 건너뛰고, 모두 떨어지면 OpenRouter 로 돕니다.<br />더할 때 Claude API 에 물어 맞는 키인지 확인합니다.</p>

      {bg && s.claude.set && (
        <>
          <h3 className="mt-6 text-md font-bold">이번 기간 사용 <span className="text-sm font-normal text-ink-4">({bg.since} 부터 · 추정)</span></h3>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm tabular-nums">
            <span>사용 <b className="text-ink">{usd(bg.spent)}</b> / {usd(bg.credit)}{bg.keys > 1 && <span className="text-ink-4"> ({usd(bg.per_key)} × 키 {bg.keys}개)</span>}</span>
            <span>남은 추정 <b className={bg.left < bg.credit * 0.1 ? "text-warn" : "text-ink"}>{usd(bg.left)}</b></span>
            <span className="text-ink-4">호출 {bg.calls.toLocaleString()}회</span>
          </div>
          <Progress className="mt-2 h-2 w-96 max-w-full" value={pct} aria-label="이번 기간 Claude 크레딧 사용 비율" />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label htmlFor="claude-credit" className="text-md text-ink-3">키 하나당 월 크레딧($)</label>
            <Input id="claude-credit" className="h-9 w-28 text-right tabular-nums" inputMode="decimal" value={credit} onChange={(e) => setCredit(e.target.value)} />
            <label htmlFor="claude-day" className="text-md text-ink-3">갱신일(매월)</label>
            <Input id="claude-day" className="h-9 w-20 text-right tabular-nums" inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)} />
            <Button size="sm" variant="outline" disabled={!validCredit || !validDay || (Number(credit) === bg.per_key && Number(day) === bg.reset_day) || save.isPending}
              onClick={() => save.mutate({ claude_credit_usd: Number(credit), claude_reset_day: Number(day) })}>저장</Button>
          </div>
          <p className="mt-2 text-sm text-ink-4">Claude 는 잔액을 알려 주는 기능이 없어 이 서버 사용 기록으로 셉니다.<br />정확한 잔액은 Claude 콘솔 결제 화면에서 확인합니다.</p>
        </>
      )}

      <h3 className="mt-6 text-md font-bold">{on ? "지금 쓰는 모델" : "키를 넣으면 쓰는 모델"}</h3>
      <dl className="mt-3 grid w-fit grid-cols-[auto_auto] gap-x-8 gap-y-2 text-sm">
        {s.claude.fixed.map(([label, model]) => (
          <div key={label} className="contents"><dt className="text-ink-3">{label}</dt><dd className="font-mono text-ink">{model}</dd></div>
        ))}
      </dl>
      <p className="mt-3 text-sm text-ink-4">시안 그림과 빠른 판단은 키와 상관없이 OpenRouter 로 만듭니다.</p>
    </Card>
  );
}

/** powerPlus AI(채팅) — 홈 채팅·우측 챗봇이 답을 쓰는 모델. 꺼지거나 상한을 넘으면 도움말 원문으로 답한다. */
function ChatCard({ s }: { s: AiChatSolution }) {
  const qc = useQueryClient();
  const [daily, setDaily] = useState(String(s.daily_usd));
  const [model, setModel] = useState(s.model);
  const save = useMutation({
    mutationFn: saveAdminChat,
    onSuccess: () => { toast.success("powerPlus AI 설정을 저장했습니다."); void qc.invalidateQueries({ queryKey: KEY }); },
    onError: (e) => toastError(e),
  });
  const validDaily = /^\d+(\.\d{1,2})?$/.test(daily.trim()) && Number(daily) <= 100;
  const validModel = model.trim() === "" || /^[a-z0-9._-]+\/[a-z0-9._:-]+$/i.test(model.trim());
  return (
    <Card title={s.name} desc={s.desc}>
      <RowSwitch id="chat-on" label="LLM 답변 켜기" desc={`지금 모델 ${s.model}`} checked={s.enabled} onChange={(v) => save.mutate({ enabled: v })} />
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label htmlFor="chat-model" className="text-md text-ink-3">모델</label>
        <Input id="chat-model" className="h-9 w-72 min-w-0" value={model} placeholder={s.default_model} onChange={(e) => setModel(e.target.value)} />
        <Button size="sm" variant="outline" disabled={!validModel || model.trim() === s.model || save.isPending} onClick={() => save.mutate({ model: model.trim() })}>저장</Button>
        <span className="text-sm text-ink-4">비우면 기본({s.default_model})</span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label htmlFor="chat-daily" className="text-md text-ink-3">하루 상한($)</label>
        <Input id="chat-daily" className="h-9 w-28 text-right tabular-nums" inputMode="decimal" value={daily} onChange={(e) => setDaily(e.target.value)} />
        <Button size="sm" variant="outline" disabled={!validDaily || Number(daily) === s.daily_usd || save.isPending} onClick={() => save.mutate({ daily_usd: Number(daily) })}>저장</Button>
        <span className="text-sm text-ink-4">오늘 {usd(s.spent_today)} 사용</span>
      </div>
    </Card>
  );
}

function JevCard({ s }: { s: AiJevSolution }) {
  const qc = useQueryClient();
  const [daily, setDaily] = useState(String(s.daily_usd));
  const save = useMutation({
    mutationFn: saveAdminJev,
    onSuccess: () => { toast.success("빠른 판단 설정을 저장했습니다."); void qc.invalidateQueries({ queryKey: KEY }); },
    onError: (e) => toastError(e),
  });
  const validDaily = /^\d+(\.\d{1,2})?$/.test(daily.trim()) && Number(daily) <= 100;
  return (
    <Card title={s.name} desc={s.desc}>
      <RowSwitch id="jev-on" label="빠른 판단 켜기" desc={`모델 ${s.model}`} checked={s.enabled} onChange={(v) => save.mutate({ enabled: v })} />
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label htmlFor="jev-daily" className="text-md text-ink-3">하루 상한($)</label>
        <Input id="jev-daily" className="h-9 w-28 text-right tabular-nums" inputMode="decimal" value={daily} onChange={(e) => setDaily(e.target.value)} />
        <Button size="sm" variant="outline" disabled={!validDaily || Number(daily) === s.daily_usd || save.isPending} onClick={() => save.mutate({ daily_usd: Number(daily) })}>저장</Button>
        <span className="text-sm text-ink-4">오늘 {usd(s.spent_today)} 사용</span>
      </div>
      <h3 className="mt-6 text-md font-bold">사용처</h3>
      <div className={s.enabled ? "mt-3 grid gap-4" : "mt-3 grid gap-4 opacity-50"}>
        {s.uses.map((u) => (
          <RowSwitch key={u.key} id={`jev-${u.key}`} label={u.label} desc={`${u.desc} · 7일 ${u.calls_7d.toLocaleString()}회`}
            checked={u.on} onChange={(v) => save.mutate({ uses: { [u.key]: v } })} />
        ))}
      </div>
    </Card>
  );
}

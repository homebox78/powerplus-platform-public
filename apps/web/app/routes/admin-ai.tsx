// 관리자 · AI 설정 — 모든 솔루션의 AI 를 한 곳에서(사용자 지시 2026-10-07: "AI 설정은 따로 설정 메뉴로, 각 솔루션의 AI 를 통합 컨트롤, Jev 도").
// 새로 씀. 서버: api/routes/admin_ai.php. powerDeck 키·모델·한도는 새로 만들지 않고 기존 장표 설정 화면(DeckSettingsScreen engine)을 그대로 끼운다.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { LiveStatus } from "@/components/hb/live-status";
import { AdminTitle, RowSwitch, SortHead, useSort } from "@/components/admin/admin-ui";
import { toastError } from "@/components/hb/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SegTabs } from "@/components/hb/seg-tabs";
import { fetchAdminAi, saveAdminChat, saveAdminJev, saveAdminProvider, type AiChatSolution, type AiDeckSolution, type AiJevSolution, type AiProvider, type AiTextProvider } from "@/lib/admin-ai";
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

          <ProviderCard key={d.provider.value + d.provider.claude.model + (d.provider.claude.last4 ?? "")} s={d.provider} />

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

/** 글 작업 경로 — OpenRouter 하나로 / 그림은 OpenRouter · 나머지(답변·기획·요약·대본·와이어·장표 제작)는 Claude API. 빠른 판단은 늘 OpenRouter. */
function ProviderCard({ s }: { s: AiProvider }) {
  const qc = useQueryClient();
  const [key, setKey] = useState("");
  const save = useMutation({
    mutationFn: saveAdminProvider,
    onSuccess: (_r, b) => {
      toast.success(b.claude_key ? "Claude API 키를 확인하고 저장했습니다." : b.remove_claude_key ? "Claude API 키를 지웠습니다." : "AI 연결 방식을 저장했습니다.");
      setKey("");
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => toastError(e),
  });
  const validKey = /^sk-ant-api\d*-[A-Za-z0-9_-]{20,}$/.test(key.trim());
  const pick = (v: AiTextProvider) => {
    if (v === s.value) return;
    if (v === "claude" && !s.claude.set) { toast.error("Claude API 키를 먼저 넣어 주세요."); return; }
    save.mutate({ provider: v });
  };
  return (
    <Card title="AI 연결 방식" desc="시안 그림은 늘 OpenRouter 로 만듭니다. 나머지 글 작업을 어디로 보낼지 고릅니다.">
      <SegTabs label="AI 연결 방식" value={s.value} onChange={pick} items={[
        { value: "openrouter", label: "OpenRouter 하나로" },
        { value: "claude", label: "그림은 OpenRouter · 나머지는 Claude API" },
      ]} />
      <p className="mt-2 text-sm text-ink-4">
        {s.value === "claude" ? "AI 답변·기획·자료 정리·대본·와이어·장표 제작이 Claude API 로 갑니다. 빠른 판단은 OpenRouter 그대로입니다." : "모든 AI 가 OpenRouter 키 하나로 돕니다."}
      </p>

      <h3 className="mt-6 text-md font-bold">Claude API 키</h3>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {s.claude.set
          ? (s.claude.usable ? <LiveStatus state="ok">키 …{s.claude.last4}</LiveStatus> : <b className="text-sm text-warn">키를 풀 수 없음 — 다시 넣어 주세요</b>)
          : <span className="text-sm text-ink-4">아직 없음</span>}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label htmlFor="claude-key" className="sr-only">Claude API 키</label>
        <Input id="claude-key" type="password" autoComplete="off" className="h-9 w-96 max-w-full min-w-0" value={key} placeholder="sk-ant-api…" onChange={(e) => setKey(e.target.value)} />
        <Button size="sm" variant="outline" disabled={!validKey || save.isPending} onClick={() => save.mutate({ claude_key: key.trim() })}>{s.claude.set ? "바꾸기" : "저장"}</Button>
        {s.claude.set && s.value !== "claude" && (
          <Button size="sm" variant="ghost" disabled={save.isPending} onClick={() => save.mutate({ remove_claude_key: true })}>지우기</Button>
        )}
      </div>
      <p className="mt-2 text-sm text-ink-4">콘솔에서 워크스페이스 범위로 만든 키를 넣습니다. 저장할 때 Claude API 에 한 번 물어 맞는 키인지 확인합니다.</p>

      <h3 className="mt-6 text-md font-bold">Claude 글 모델</h3>
      <SegTabs className="mt-3" label="Claude 글 모델" value={s.claude.model} onChange={(v) => v !== s.claude.model && save.mutate({ claude_model: v })}
        items={Object.entries(s.claude.models).map(([value, label]) => ({ value, label }))} />
      <p className="mt-2 text-sm text-ink-4">설정에서 Claude 모델을 고른 자리는 그 모델 그대로 씁니다. 다른 회사 모델을 고른 자리만 이 모델로 바뀝니다.</p>
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

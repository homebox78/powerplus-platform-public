// 출처: homebox-handoff apps/web/app/routes/account-keys.tsx — 키 하나로 REST·MCP(기획 §10). 응답 {id(public_id),name,masked,scopes,…}, 발급 201 에 key 1회.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Copy, Eye, EyeOff, KeyRound, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { BulkBar, SelectAllCell, SelectCell, useSelection } from "@/components/admin/admin-ui";
import { AI_CLIENTS, AiClientIcon, type AiClientId } from "@/components/hb/ai-client-icons";
import { CodeBlock } from "@/components/hb/code-block";
import { confirmToast, toastError } from "@/components/hb/confirm";
import { Tag } from "@/components/hb/tag";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, postJson, type ApiError } from "@/lib/api";
import { PLAN_KO, useMe } from "@/lib/auth";
import { mcpServerUrl, mcpSnippets, restBaseUrl } from "@/lib/mcp-connect";
import { cn } from "@/lib/utils";
import type { Route } from "./+types/account-keys";

export const meta: Route.MetaFunction = () => [{ title: "API · MCP 키 — powerPlus" }];

interface KeyItem { id: string; name: string; masked: string; scopes: string[]; created_at: string; expires_at: string | null; last_used_at: string | null; revoked_at: string | null }
const SCOPES: Array<[string, string]> = [["all", "전부"], ["assets", "powerAssets"], ["deck", "powerDeck"], ["mock", "powerMock"], ["guide", "powerGuide"]];
const fmt = (s: string | null) => (s ? s.slice(0, 10).replace(/-/g, ".") : "—");
const MCP = mcpServerUrl();
const REST = restBaseUrl();

export default function AccountKeysPage() {
  const { me } = useMe();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["keys"], queryFn: () => apiFetch<KeyItem[]>("/keys"), enabled: !!me });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["all"]);
  const [plain, setPlain] = useState<string | null>(null);
  const [client, setClient] = useState<AiClientId>("claude-code");
  const [shown, setShown] = useState<Record<string, string>>({});
  const reveal = async (k: KeyItem) => {
    if (shown[k.id]) { setShown((m) => { const n = { ...m }; delete n[k.id]; return n; }); return; }
    try { const r = await apiFetch<{ key: string | null }>(`/keys/${k.id}/reveal`); if (!r.key) { toast("이 키는 원문을 보관하지 않아 다시 볼 수 없습니다. 새 키를 만들어 주세요."); return; } setShown((m) => ({ ...m, [k.id]: r.key as string })); } catch (e) { toastError(e); }
  };
  const create = useMutation({
    mutationFn: () => postJson<KeyItem & { key: string }>("/keys", { name, scopes }),
    onSuccess: (r) => { setPlain(r.key); setName(""); void qc.invalidateQueries({ queryKey: ["keys"] }); },
  });
  const revoke = useMutation({ mutationFn: (id: string) => apiFetch<null>(`/keys/${id}`, { method: "DELETE" }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ["keys"] }); toast.success("키를 폐기했습니다."); }, onError: (e) => toastError(e) });
  const items = q.data ?? [];
  const active = items.filter((k) => !k.revoked_at);
  // 여러 개 폐기 — 활성 키만 고를 수 있다
  const sel = useSelection(active.map((k) => k.id));
  const bulkRevoke = async (ids: string[]) => {
    try {
      const r = await postJson<{ count: number }>("/me/bulk/keys/revoke", { ids });
      sel.clear(); void qc.invalidateQueries({ queryKey: ["keys"] });
      toast.success("키 " + r.count + "개를 폐기했습니다.");
    } catch (e) { toastError(e); }
  };
  if (!me) return null;
  const revealed = active.map((k) => shown[k.id]).find(Boolean);
  const keyFor = plain ?? revealed ?? "pp_live_…(발급 시 표시된 키)";
  const snippets = mcpSnippets(MCP, keyFor);

  return (
    <div>
      <nav className="text-sm text-ink-4" aria-label="경로"><Link to="/account" className="hover:text-ink">계정</Link> <span aria-hidden>›</span> API · MCP 키</nav>
      <div className="mt-3 flex flex-wrap items-end gap-4">
        <h1 className="text-4xl font-extrabold tracking-[-0.03em]">API · MCP 키</h1>
        <div className="flex gap-1.5 pb-1.5"><Tag tone="soft">{PLAN_KO[me.plan]}</Tag><Tag tone="line">활성 {active.length}</Tag>{me.limits && <Tag tone="line">일 {me.limits.api_daily < 0 ? "무제한" : `${me.limits.api_daily.toLocaleString()}회`}</Tag>}</div>
        <span className="flex-1" />
        <Button size="md" onClick={() => { setPlain(null); setOpen(true); }}><Plus aria-hidden />새 키 만들기</Button>
      </div>
      <p className="mt-3 text-md text-ink-3">키 하나로 REST(<code>{REST}</code>)와 MCP(<code>{MCP}</code>)를 둘 다 씁니다.</p>

      <div className="mt-6 overflow-x-auto rounded-card border border-line">
        <Table>
          <TableHeader><TableRow className="bg-ground-2 hover:bg-ground-2"><SelectAllCell sel={sel} /><TableHead>이름</TableHead><TableHead>키</TableHead><TableHead>범위</TableHead><TableHead>생성</TableHead><TableHead>마지막 사용</TableHead><TableHead>상태</TableHead><TableHead aria-label="동작" /></TableRow></TableHeader>
          <TableBody>
            {items.map((k) => (
              <TableRow key={k.id} className={k.revoked_at ? "text-ink-4" : ""}>
                {k.revoked_at ? <TableCell className="w-[44px] min-w-[44px] px-0" /> : <SelectCell sel={sel} id={k.id} label={k.name} />}
                <TableCell className="text-left font-medium"><span className="inline-flex items-center gap-2"><KeyRound className="size-4 text-ink-4" aria-hidden />{k.name}</span></TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1">
                    <span className={shown[k.id] ? "select-all break-all" : ""}>{shown[k.id] ?? k.masked}</span>
                    {!k.revoked_at && <Button variant="ghost" size="icon-sm" aria-label={shown[k.id] ? "키 숨기기" : "키 보기"} onClick={() => void reveal(k)}>{shown[k.id] ? <EyeOff /> : <Eye />}</Button>}
                    {shown[k.id] && <Button variant="ghost" size="icon-sm" aria-label="키 복사" onClick={() => void navigator.clipboard.writeText(shown[k.id]!).then(() => toast.success("키를 복사했습니다."))}><Copy /></Button>}
                  </span>
                </TableCell>
                <TableCell>{k.scopes.join(", ")}</TableCell>
                <TableCell>{fmt(k.created_at)}</TableCell>
                <TableCell>{fmt(k.last_used_at)}</TableCell>
                <TableCell>{k.revoked_at ? <Tag tone="line">폐기됨</Tag> : <Tag tone="ok">활성</Tag>}</TableCell>
                <TableCell>{!k.revoked_at && <Button variant="ghost" size="icon-sm" aria-label={`${k.name} 폐기`} onClick={() => confirmToast(`'${k.name}' 키를 폐기할까요?`, () => revoke.mutate(k.id), { action: "폐기", description: "연결된 도구는 즉시 401 을 받습니다." })}><Trash2 /></Button>}</TableCell>
              </TableRow>
            ))}
            {items.length === 0 && <TableRow><TableCell colSpan={8} className="py-12 text-ink-4">아직 키가 없습니다.<br />새 키를 만들어 AI 도구에 연결하세요.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <BulkBar sel={sel} actions={[{ label: "폐기", icon: <Trash2 aria-hidden />, danger: true, confirm: "고른 키 {n}개를 폐기합니다. 연결된 도구는 즉시 401 을 받습니다.", onRun: (ids) => void bulkRevoke(ids) }]} />

      <section className="mt-8">
        <h2 className="text-2xl font-extrabold tracking-[-0.02em]">도구 연결</h2>
        <p className="mt-2 text-md text-ink-3">발급 직후에는 평문 키가, 그 뒤에는 접두어만 삽입됩니다.</p>
        <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-6" role="tablist" aria-label="연결할 도구">
          {AI_CLIENTS.map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={client === c.id} onClick={() => setClient(c.id)} className={cn("flex h-[104px] flex-col items-center justify-center gap-2.5 rounded-card border bg-ground text-sm font-semibold transition-colors", client === c.id ? "border-ink ring-1 ring-ink" : "border-line hover:bg-ground-2")}>
              <AiClientIcon id={c.id} />{c.label}
            </button>
          ))}
        </div>
        <div className="mt-4"><CodeBlock code={snippets[client]} /></div>
      </section>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setPlain(null); }}>
        <DialogContent className="hb-dark-dialog rounded-panel">
          {plain ? (
            <>
              <DialogHeader><DialogTitle>키가 발급되었습니다</DialogTitle><DialogDescription>이 키는 지금 한 번만 표시됩니다.<br />안전한 곳에 복사해 두세요.</DialogDescription></DialogHeader>
              <CodeBlock code={plain} label="키 복사" />
              <DialogFooter><Button onClick={() => { void navigator.clipboard?.writeText(plain); }}><Copy aria-hidden />복사</Button><Button variant="outline" onClick={() => setOpen(false)}>닫기</Button></DialogFooter>
            </>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="flex flex-col gap-5">
              <DialogHeader><DialogTitle>새 키</DialogTitle><DialogDescription>이름은 어느 도구에서 쓰는지 알아보기 위한 라벨입니다.</DialogDescription></DialogHeader>
              <div className="flex flex-col gap-1.5"><Label htmlFor="key-name">이름</Label><Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoFocus /></div>
              <div className="flex flex-col gap-1.5">
                <Label>범위</Label>
                <div className="flex flex-wrap gap-1.5">{SCOPES.map(([id, label]) => <button key={id} type="button" aria-pressed={scopes.includes(id)} onClick={() => setScopes(id === "all" ? ["all"] : scopes.includes(id) ? scopes.filter((s) => s !== id) : [...scopes.filter((s) => s !== "all"), id])} className={cn("h-9 rounded-chip border px-3 text-sm", scopes.includes(id) ? "border-white bg-white text-ink" : "border-white/25 text-white")}>{label}</button>)}</div>
              </div>
              {create.isError && <Alert variant="destructive"><AlertCircle aria-hidden /><AlertDescription>{(create.error as ApiError).message}</AlertDescription></Alert>}
              <DialogFooter><Button type="submit" disabled={!name.trim() || !scopes.length || create.isPending}>발급</Button><Button type="button" variant="outline" onClick={() => setOpen(false)}>취소</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// powerPlus AI(powerLLM) — 홈 한가운데 채팅과 서브 화면 우측 아래 챗봇이 같은 대화다(서버 api/routes/chat.php · Core/Concierge).
// 일도 시키고(에셋 찾기·제안서 만들기·목업 요청문·부품 찾기) 궁금한 것도 묻는다(2026-10-08 사용자).
// 제안서는 powerDeck 작업이 하고 이 화면은 단계 카드를 보여 준다. 대화로 넘어간 작업은 각 모듈의 내 작업 화면에 남는다.
// 규칙: 홈(full)은 칸 안쪽 스크롤 없음, 챗봇(dock)은 떠 있는 창이라 안쪽 스크롤. 같은 줄 버튼 높이 같게, 주황은 주 버튼·진행 막대만.
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, BookOpen, Check, CircleHelp, Code2, Copy as CopyIcon, FileText, FileUp, Image as ImageIcon, LayoutTemplate, Lock, MessagesSquare, Minus, Paperclip, Plug, Plus, Presentation, Search, Sparkles, Trash2, X } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Copy, MBr } from "@/components/hb/copy";
import { confirmToast, toastError } from "@/components/hb/confirm";
import { ApiError, apiFetch, postJson } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface Btn { act: string; label: string; primary?: boolean; feedback?: string; href?: string }
interface Msg { id: number; role: "user" | "ai" | "system"; kind: string; body: string | null; card: Record<string, unknown> | null; at: string }
interface Quota { paid: boolean; plan: number; mock: number; upload: number; plan_max: number | null; mock_max: number | null; upload_max: number | null; reset: string }
interface Job { id: string; status: string; phase: string; stage: string | null; progress: number; docs: { id: string; name: string; size: number }[] }
interface Project { id: string; title: string; step: string; updated_at: string; messages: Msg[]; job: Job | null; quota: Quota }
interface Answer { kind: string; title: string; body: string; links: [string, string][] }
interface ReplyItem { id: string; title: string; sub?: string; thumb_url?: string; url: string }
interface Reply { kind: "reply"; module: string; body: string; items: ReplyItem[]; item_type: "asset" | "guide" | "mock" | null; links: [string, string][]; prompt?: string | null; login?: boolean }
interface ListRes { items: { id: string; title: string; step: string; updated_at: string }[]; quota: Quota; greet: string }
type AnonTurn = { q: string; a: Reply };

const KEY = "pp:chat";
const DRAFT = "pp:chat-draft";
const ANON = "pp:chat-anon";
const MODE_KEY = "pp:chat-mode";
const GREET = "무엇을 도와드릴까요? 에셋 찾기·제안서 만들기·홈페이지 목업·디자인 규칙까지 이 대화에서 시키거나 물어보세요.";
// 입력창 탭 — 무엇을 할지 먼저 고른다(2026-10-15 사용자 "이미지·비디오·텍스트처럼 에셋 장표 목업 가이드 기타로 구분").
// 서버 Concierge::route 가 탭을 받아 그 모듈로 보낸다. 기타 = 지금처럼 말을 보고 알아서 고른다(질문·안내·MCP 연결 등).
type Mode = "assets" | "deck" | "mock" | "guide" | "auto";
const MODES: { k: Mode; label: string; icon: typeof Search; hint: string }[] = [
  { k: "assets", label: "에셋", icon: ImageIcon, hint: "찾을 아이콘·사진·일러스트를 적어 주세요" },
  { k: "deck", label: "장표", icon: Presentation, hint: "만들 제안서 주제나 사업 이름을 적어 주세요" },
  { k: "mock", label: "목업", icon: LayoutTemplate, hint: "만들 홈페이지 목업을 적어 주세요" },
  { k: "guide", label: "가이드", icon: BookOpen, hint: "찾을 부품·토큰·KRDS 규칙을 적어 주세요" },
  { k: "auto", label: "기타", icon: MessagesSquare, hint: "무엇을 도와드릴까요?" },
];
const modeStore = {
  get: (): Mode => { try { const v = localStorage.getItem(MODE_KEY); return MODES.some((m) => m.k === v) ? (v as Mode) : "auto"; } catch { return "auto"; } },
  set: (v: Mode) => { try { localStorage.setItem(MODE_KEY, v); } catch { /* 저장 못 해도 동작 */ } },
};
// 네 모듈을 고루 — 일 시키기와 묻기 둘 다(2026-10-08 사용자 "4가지 솔루션을 모두 포괄"). 누르면 그 탭도 같이 고른다
const EXAMPLES: { icon: typeof Search; label: string; q: string; mode: Mode }[] = [
  { icon: Search, label: "에셋 찾기", q: "기후위기 아이콘 찾아 줘", mode: "assets" },
  { icon: FileText, label: "제안서", q: "AI 민원 플랫폼 제안서 만들어 줘", mode: "deck" },
  { icon: LayoutTemplate, label: "목업", q: "시청 메인 목업 만들어 줘", mode: "mock" },
  { icon: Code2, label: "부품 코드", q: "KRDS 탭 부품 코드 줘", mode: "guide" },
  { icon: Plug, label: "powerMCP", q: "powerMCP 연결 방법은?", mode: "auto" },
];
const STEPS = ["자료", "검토", "목차", "기획", "시안", "원고", "결과물"];
const ACCEPT = ".pdf,.docx,.hwpx,.hwp,.xlsx,.pptx,.md,.txt,.csv";
const MOD_KO: Record<string, string> = { assets: "powerAssets", deck: "powerDeck", mock: "powerMock", guide: "powerGuide", help: "powerPlus 안내", out: "powerPlus 안내" };

function stepIndex(p: Project | undefined): number {
  if (!p?.job) return -1;
  const st = p.job.status;
  if (p.step === "done") return 6;
  if (p.step === "build") return 5;
  if (p.step === "mockup" || p.step === "mockgen") return 4;
  if (p.step === "wire" || p.step === "plan") return 3;
  if (p.step === "toc") return 2;
  if (st === "queued" || st === "running") return 1;
  if (p.step === "review") return 1;
  return 0;
}
const store = { get: () => { try { return localStorage.getItem(KEY); } catch { return null; } }, set: (v: string | null) => { try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch { /* 저장 못 해도 동작 */ } window.dispatchEvent(new Event("pp:chat")); } };
const anonStore = {
  get: (): AnonTurn[] => { try { return JSON.parse(sessionStorage.getItem(ANON) ?? "[]") as AnonTurn[]; } catch { return []; } },
  set: (v: AnonTurn[]) => { try { if (v.length) sessionStorage.setItem(ANON, JSON.stringify(v.slice(-12))); else sessionStorage.removeItem(ANON); } catch { /* 없음 */ } },
};
const anonHistory = (v: AnonTurn[]) => v.slice(-3).flatMap((t) => [{ role: "user", content: t.q }, { role: "assistant", content: t.a.body }]);
const clean = (s: string) => s.replace(/\*\*/g, "").replace(/\r/g, "");

export function MainChat({ variant = "full", onClose }: { variant?: "full" | "dock"; onClose?: () => void }) {
  const dock = variant === "dock";
  const { me } = useMe();
  const nav = useNavigate();
  const loc = useLocation();
  const qc = useQueryClient();
  const [pid, setPid] = useState<string | null>(() => (typeof window === "undefined" ? null : store.get()));
  const [text, setText] = useState(() => { try { const d = sessionStorage.getItem(DRAFT); if (d) sessionStorage.removeItem(DRAFT); return d ?? ""; } catch { return ""; } });
  const [busy, setBusy] = useState(false);
  const [mode, setModeState] = useState<Mode>("auto");
  // 브라우저에서만 읽는다(서버 렌더와 첫 화면을 맞춘다) — 첫 렌더 뒤 한 번 맞추는 의도된 setState
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setModeState(modeStore.get()); }, []);
  const setMode = (v: Mode) => { setModeState(v); modeStore.set(v); };
  const [anon, setAnon] = useState<AnonTurn[]>(() => (typeof window === "undefined" ? [] : anonStore.get()));   // 로그인 전 대화 — 탭을 닫으면 사라진다
  const [notice, setNotice] = useState<{ text: string; upgrade?: boolean; link?: string | null } | null>(null);
  const [upl, setUpl] = useState<{ name: string; pct: number } | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 다른 곳(홈 ↔ 챗봇)에서 대화를 바꾸면 따라간다
  useEffect(() => {
    const on = () => setPid(store.get());
    window.addEventListener("pp:chat", on);
    return () => window.removeEventListener("pp:chat", on);
  }, []);
  useEffect(() => { if (dock) inputRef.current?.focus(); }, [dock]);

  const list = useQuery({ queryKey: ["chat-list"], queryFn: () => apiFetch<ListRes>("/chat/projects"), enabled: !!me, staleTime: 30_000 });
  const proj = useQuery({
    queryKey: ["chat", pid],
    queryFn: async () => {
      try { return await apiFetch<Project>(`/chat/projects/${pid}`); }
      catch (e) { if (e instanceof ApiError && e.status === 404) { store.set(null); return null; } throw e; }
    },
    enabled: !!me && !!pid,
    refetchInterval: (q) => {
      const p = q.state.data as Project | undefined;
      const st = p?.job?.status;
      return st === "queued" || st === "running" ? 5000 : false;
    },
  });

  const p = proj.data ?? undefined;
  const count = (p?.messages.length ?? 0) + anon.length;
  useEffect(() => { if (dock) listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [dock, count, busy]);
  const quota = p?.job ? p.quota : undefined;
  const put = (d: Project) => { qc.setQueryData(["chat", d.id], d); qc.invalidateQueries({ queryKey: ["chat-list"] }); };
  const fail = (e: unknown) => {
    if (e instanceof ApiError && (e.code === "LIMIT" || e.code === "LOCKED")) setNotice({ text: e.message, upgrade: true });
    else toastError(e);
  };

  async function send(raw?: string) {
    const t = (raw ?? text).trim();
    if (!t || busy) return;
    setBusy(true); setNotice(null); setText("");
    try {
      if (!me) {
        // 로그인 전 — 답하지 않고 회원가입으로 이끈다(2026-10-15 사용자). 적은 말은 남겨 두었다가 로그인 뒤 입력창에 다시 채운다.
        try { sessionStorage.setItem(DRAFT, t); } catch { /* 없음 */ }
        const back = encodeURIComponent(loc.pathname + loc.search);
        const a: Reply = { kind: "reply", module: "help", body: "powerPlus AI 는 로그인 후 사용할 수 있어요.\n가입하고 로그인하면 적어 두신 말 그대로 이어서 시작합니다.", items: [], item_type: null, links: [[`/signup?next=${back}`, "회원가입"], [`/login?next=${back}`, "로그인"]], login: true };
        const next = [...anon, { q: t, a }];
        setAnon(next); anonStore.set(next);
      } else if (!p) {
        const r = await postJson<{ project: Project }>("/chat/projects", { text: t, mode, history: anonHistory(anon.filter((x) => !x.a.login)) });
        put(r.project); setPid(r.project.id); store.set(r.project.id); setAnon([]); anonStore.set([]);
      } else {
        put(await postJson<Project>(`/chat/projects/${pid}/messages`, { text: t, mode }));
      }
    } catch (e) { setText(t); fail(e); } finally { setBusy(false); }
  }

  async function act(b: Btn, feedback?: string, extra?: Record<string, unknown>) {
    if (!pid || busy) return;
    if (b.act === "upgrade") { nav("/pricing"); return; }
    if (b.href) { nav(b.href); return; }   // 단계 화면 열기(목차·기획 고치기, A·B 고르기)
    setBusy(true); setNotice(null);
    try { put(await postJson<Project>(`/chat/projects/${pid}/action`, { act: b.act, feedback: feedback ?? b.feedback, ...extra })); }
    catch (e) { fail(e); } finally { setBusy(false); }
  }

  async function upload(files: FileList | File[]) {
    if (!pid) return;
    setNotice(null);
    for (const f of Array.from(files)) {
      try {
        setUpl({ name: f.name, pct: 0 });
        const u = await postJson<{ id: string; chunk_size: number; chunks: number }>(`/chat/projects/${pid}/upload`, { filename: f.name, size: f.size });
        for (let n = 0; n < u.chunks; n++) {
          await apiFetch(`/deck/uploads/${u.id}/${n}`, { method: "PUT", body: f.slice(n * u.chunk_size, (n + 1) * u.chunk_size) });
          setUpl({ name: f.name, pct: Math.round(((n + 1) / u.chunks) * 100) });
        }
        // 끝내기는 채팅 길로 — 무료 몫은 여기서 성공했을 때만 센다(시작 때 세면 끊긴 업로드도 몫을 깎았다, 2026-10-18)
        await postJson(`/chat/projects/${pid}/upload/${u.id}/complete`, {});
      } catch (e) { fail(e); break; }
    }
    setUpl(null);
    qc.invalidateQueries({ queryKey: ["chat", pid] });
  }

  function reset() { store.set(null); setPid(null); setNotice(null); setText(""); setAnon([]); anonStore.set([]); }
  function remove() {
    if (!pid) return;
    confirmToast("이 대화를 지울까요?", async () => {
      try { await apiFetch(`/chat/projects/${pid}`, { method: "DELETE" }); qc.removeQueries({ queryKey: ["chat", pid] }); qc.invalidateQueries({ queryKey: ["chat-list"] }); reset(); }
      catch (e) { toastError(e); }
    }, { action: "지우기", description: "이미 시작한 작업은 각 서비스의 내 작업에 남습니다." });
  }

  const running = p?.job && (p.job.status === "queued" || p.job.status === "running");
  const lastActions = p ? [...p.messages].reverse().find((m) => m.kind === "actions" || m.kind === "upload" || m.kind === "basics")?.id : undefined;
  // 돌던 작업이 끝나면 대화 안에서도 바로 알린다(헤더 종·메일 알림은 서버가 따로 보낸다)
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running && p?.job) {
      const failed = p.job.status === "failed";
      toast[failed ? "error" : "success"](failed ? "작업이 실패했습니다" : "작업 단계가 끝났습니다", { description: p.title });
    }
    wasRunning.current = !!running;
  }, [running, p?.job, p?.title]);
  const si = stepIndex(p);
  const deckProj = !!p?.job;
  const empty = !p && anon.length === 0;
  const pad = dock ? "px-4" : "px-5 sm:px-7";

  return (
    <section
      aria-label="powerPlus AI"
      className={cn("pp-chat @container", dock ? "flex h-full min-h-0 flex-col" : "rounded-panel", drag && "outline-2 outline-dashed outline-point")}
      onDragOver={(e) => { if (pid && p?.job?.status === "hold") { e.preventDefault(); setDrag(true); } }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) void upload(e.dataTransfer.files); }}
    >
      {/* 홈 첫 화면은 LLM 입력창만 — 대화가 시작되면 머리 줄(제목·새 대화·지우기)이 나온다(2026-10-09 사용자 "좀더 llm스럽게") */}
      {(dock || !empty) && <div className={cn("flex items-center justify-between gap-3 border-b border-line", !dock && "flex-wrap", pad, dock ? "py-3" : "py-4")}>
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={cn("inline-flex shrink-0 items-center justify-center text-white", dock ? "size-9 rounded-full bg-point" : "size-9 rounded-card bg-ink")}><Sparkles className="size-4" aria-hidden /></span>
          <div className="min-w-0">
            <h2 className={cn("truncate font-extrabold tracking-[-0.02em]", deckProj ? (dock ? "text-sm" : "text-lg") : (dock ? "text-base" : "text-xl"))}>{deckProj ? p!.title : "powerPlus AI"}</h2>
            {/* 안내 문구는 첫 인사 말풍선과 겹쳐 머리 줄에선 뺀다(2026-10-09 사용자) — 제안서 작업일 때만 진행 순서 */}
            {deckProj && <p className={cn("text-ink-4", dock ? "hidden truncate text-xs @md:block" : "text-sm")}>자료 → 검토 → 목차 → 기획 → 시안 순서로 진행합니다</p>}
          </div>
        </div>
        <div className={cn("flex shrink-0 items-center", dock ? "gap-1" : "flex-wrap gap-2")}>
          {quota && !dock && <QuotaBadge q={quota} />}
          {(p || anon.length > 0) && <Button variant={dock ? "ghost" : "outline"} size={dock ? "icon-sm" : "sm"} onClick={reset} aria-label="새 대화" title="새 대화"><Plus className="size-4" aria-hidden />{!dock && "새 대화"}</Button>}
          {p && <Button variant={dock ? "ghost" : "outline"} size={dock ? "icon-sm" : "sm"} onClick={remove} aria-label="대화 지우기" title="대화 지우기"><Trash2 className="size-4" aria-hidden /></Button>}
          {dock && onClose && <button type="button" onClick={onClose} aria-label="닫기" className="inline-flex size-9 items-center justify-center rounded-card hover:bg-ground-3"><X className="size-4" aria-hidden /></button>}
        </div>
      </div>}

      {/* 진행 중인 작업 — 대화 맨 위에 고정. 그동안 보낸 다른 말은 바로 답하고, 끝나면 알림(헤더 종·메일)으로 알린다(2026-10-08 사용자) */}
      {running && p?.job && (
        <div className={cn("z-10 border-b border-line bg-ground/95 py-3 backdrop-blur", pad, !dock && "sticky-follow sticky top-[var(--hdr-offset)]")} role="status" aria-label="진행 중인 작업">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm">
            <span className="min-w-0 truncate font-bold">작업 중 · {p.title}</span>
            <Link to={`/deck/jobs?id=${encodeURIComponent(p.job.id)}`} className="shrink-0 font-semibold text-ink-3 underline-offset-4 hover:underline">powerDeck 에서 보기</Link>
          </div>
          <Progress label={p.job.stage || "준비 중"} pct={p.job.progress ?? 0} />
          <p className="mt-1.5 text-xs text-ink-4">다른 일도 그대로 시키거나 물어보세요.<MBr />끝나면 알림으로 알려 드립니다.</p>
        </div>
      )}

      {deckProj && (
        <ol className={cn("flex flex-wrap border-b border-line text-sm", pad, dock ? "gap-1 py-2.5 text-xs" : "gap-x-1 gap-y-2 py-3")} aria-label="진행 단계">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-1">
              <span className={cn("rounded-full font-semibold", dock ? "px-2 py-0.5" : "px-2.5 py-1", i < si ? "text-ink-3" : i === si ? "bg-ink text-white" : "text-ink-4")}>{i + 1}. {s}</span>
              {i < STEPS.length - 1 && !dock && <span className="text-ink-4" aria-hidden>›</span>}
            </li>
          ))}
        </ol>
      )}

      <div ref={listRef} className={cn("flex flex-col gap-4", pad, dock ? "min-h-0 flex-1 overflow-y-auto py-4" : empty ? "pb-4 empty:hidden" : "py-6")}>
        {empty && dock && <p className={cn("leading-[1.7] text-ink-3", dock ? "text-sm" : "text-md")}><Copy as="span" text={list.data?.greet ?? GREET} /></p>}
        {!p && anon.map((x, i) => (
          <div key={i} className="flex flex-col gap-4">
            <div className="ml-auto max-w-[80%] whitespace-pre-wrap rounded-bubble bg-ground-3 px-4 py-2.5 text-md leading-[1.6] text-ink">{x.q}</div>
            <ReplyCard r={x.a} dock={dock} />
          </div>
        ))}
        {p?.messages.map((m) => <Bubble key={m.id} m={m} dock={dock} live={m.id === lastActions && !busy && !running} onAct={act} onFile={() => fileRef.current?.click()} canUpload={p.job?.status === "hold"} busy={busy} docs={p.job?.docs.length ?? 0} jobId={p.job?.id ?? ""} />)}
        {busy && <p className="flex items-center gap-2 text-sm text-ink-4" role="status"><Sparkles className="size-4 animate-pulse" aria-hidden />생각하는 중…</p>}
        {p?.job && p.job.docs.length > 0 && p.job.status === "hold" && (
          <div className="flex flex-wrap gap-2 text-sm">{p.job.docs.map((d) => <span key={d.id} className="inline-flex items-center gap-1.5 rounded-card bg-ground-2 px-3 py-1.5"><Paperclip className="size-3.5" aria-hidden />{d.name}</span>)}</div>
        )}
        {upl && <Progress label={`${upl.name} 올리는 중`} pct={upl.pct} />}
        {notice && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-ground-2 px-4 py-3 text-sm">
            <Copy as="span" text={notice.text} />
            <span className="flex gap-2">
              {notice.upgrade && <Button asChild size="sm"><Link to="/pricing">요금제 보기</Link></Button>}
              {notice.link && <Button asChild size="sm" variant="outline"><Link to={notice.link}>도움말</Link></Button>}
              <Button size="sm" variant="ghost" onClick={() => setNotice(null)} aria-label="닫기"><X className="size-4" aria-hidden /></Button>
            </span>
          </div>
        )}
      </div>

      {/* 입력 카드 = LLM 입력창 문법 — 글칸 위, 아래 줄 왼쪽 첨부·오른쪽 모델 이름과 둥근 보내기 버튼(2026-10-09 사용자 Claude 입력창 참조) */}
      <form className={cn(dock ? "border-t border-line py-3" : empty ? "" : "pt-2", pad)} onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <div className={cn("flex flex-col border border-line bg-ground shadow-[0_2px_14px_rgba(0,0,0,.07)] transition-shadow focus-within:shadow-[0_4px_20px_rgba(0,0,0,.10)]", dock ? "rounded-bubble px-3 pt-2 pb-2" : "rounded-bubble px-4 pt-3 pb-2.5")}>
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}
            rows={dock ? 1 : 2}
            maxLength={4000}
            placeholder={p?.job ? (running ? (dock ? "고칠 점을 남겨 주세요" : "기다리는 동안 고칠 점을 남기면 다음 단계에서 반영합니다") : (dock ? "더 알려 줄 내용을 적어 주세요" : "더 알려 줄 내용이나 고칠 점을 적어 주세요")) : MODES.find((m) => m.k === mode)!.hint}
            aria-label="채팅 입력"
            className={cn("min-w-0 resize-none bg-transparent text-md leading-[1.6] outline-none placeholder:text-ink-4", dock ? "min-h-10 py-1.5" : "min-h-14 py-1.5")}
          />
          <div className="mt-1 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1">
              {p?.job?.status === "hold"
                ? <button type="button" onClick={() => fileRef.current?.click()} aria-label="자료 올리기" title="자료 올리기" className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-ground-3"><Plus className="size-5" aria-hidden /></button>
                : <span className="hidden size-9 shrink-0 items-center justify-center text-ink-4/60 @md:inline-flex" title="제안서 작업을 시작하면 자료를 올릴 수 있습니다" aria-hidden><Plus className="size-5" /></span>}
              {/* 탭 — 고른 것만 옅은 면(LLM 입력창의 이미지·비디오·텍스트 탭 문법). 좁은 칸은 그림 없이 글자만 — 대신 안 고른 탭에 옅은 테두리를 둘러 눌리는 것으로 보이게(모바일 홈, 2026-10-17 점검) */}
              <div role="radiogroup" aria-label="무엇을 할까요" className="flex min-w-0 items-center gap-1 @xl:gap-0">
                {MODES.map((m) => (
                  <button key={m.k} type="button" role="radio" aria-checked={mode === m.k} onClick={() => { setMode(m.k); inputRef.current?.focus(); }}
                    title={m.k === "auto" ? "질문·안내·MCP 연결 — 말을 보고 알아서 고릅니다" : undefined}
                    className={cn("inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-1.5 text-[calc(var(--text-sm)*0.9)] transition-colors @sm:px-2.5 @xl:px-3",   // 모바일 챗봇 창(286px)에서도 다섯 개가 한 줄에. 글자·그림 = 기본의 90%(사용자)
                      mode === m.k ? "bg-ground-3 font-semibold text-ink" : "text-ink-4 hover:text-ink-2 @max-xl:ring-1 @max-xl:ring-inset @max-xl:ring-line")}>
                    <m.icon className="hidden size-[14.4px] @xl:block" aria-hidden />{m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="hidden text-sm text-ink-4 @2xl:inline">powerPlus AI</span>
              <button type="submit" disabled={busy || !text.trim()} aria-label="보내기"
                className="inline-flex size-9 items-center justify-center rounded-full bg-ink text-ground transition-colors hover:bg-ink-2 disabled:cursor-default disabled:bg-ground-3 disabled:text-ink-4">
                <ArrowUp className="size-5" aria-hidden />
              </button>
            </div>
          </div>
        </div>
        {/* 자료를 올릴 수 있을 때만 — 개인정보 안내(품질 판정 SEC-014) */}
        {p?.job?.status === "hold" && <p className="mt-2 px-1 text-xs text-ink-3">개인정보·대외비가 든 문서는 올리지 마세요.</p>}
        {empty && (
          <div className={cn("mt-4 flex flex-wrap gap-2", !dock && "justify-center")}>
            {(dock ? EXAMPLES.slice(0, 3) : EXAMPLES).map((x) => (
              <button key={x.q} type="button" onClick={() => { setText(x.q); setMode(x.mode); requestAnimationFrame(() => { const t = inputRef.current; if (t) { t.focus(); t.setSelectionRange(x.q.length, x.q.length); } }); }} title={x.q}
                className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-panel border border-line bg-ground px-3 text-sm text-ink-3 transition-colors hover:bg-ground-2 hover:text-ink">
                <x.icon className="size-4" aria-hidden />{x.label}
              </button>
            ))}
          </div>
        )}
        <input ref={fileRef} type="file" aria-label="자료 파일 첨부" accept={ACCEPT} multiple className="hidden" onChange={(e) => { if (e.target.files?.length) void upload(e.target.files); e.target.value = ""; }} />
      </form>
    </section>
  );
}

/** powerLLM 답 — 짧은 글 + 일 결과(에셋 썸네일·부품 목록·공유 시안) + 요청문 + 갈 곳 버튼 */
function ReplyCard({ r, dock }: { r: Reply; dock: boolean }) {
  const [copied, setCopied] = useState(false);
  const items = r.items ?? [];
  const thumbs = r.item_type === "asset" || r.item_type === "mock";
  return (
    <div className={cn("flex flex-col gap-3", dock ? "max-w-full" : "max-w-[88%]")}>
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-4"><Sparkles className="size-3.5" aria-hidden />{MOD_KO[r.module] ?? "powerPlus AI"}</span>
      {r.body && <p className="whitespace-pre-line text-md leading-[1.7] text-ink-2">{clean(r.body)}</p>}
      {items.length > 0 && thumbs && (
        <div className={cn("grid gap-2.5", r.item_type === "mock" ? "grid-cols-2" : "grid-cols-3 @2xl:grid-cols-4")}>
          {items.map((it) => (
            <Link key={it.id} to={it.url} className="group overflow-hidden rounded-card bg-ground-3 p-[9%] transition-colors hover:bg-line">
              <span className={cn("flex items-center justify-center overflow-hidden rounded-field bg-white shadow-[0_1px_3px_rgba(0,0,0,.06)]", r.item_type === "mock" ? "aspect-video" : "aspect-square")}>
                {it.thumb_url ? <img src={it.thumb_url} alt="" decoding="async" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} className={cn("size-full", r.item_type === "mock" ? "object-cover object-top" : "object-contain p-1.5")} /> : null}
              </span>
              <span className="mt-1.5 block truncate text-center text-xs text-ink-3">{it.title}</span>
            </Link>
          ))}
        </div>
      )}
      {items.length > 0 && !thumbs && (
        <ul className="flex flex-col divide-y divide-line rounded-card border border-line">
          {items.map((it) => (
            <li key={it.id}><Link to={it.url} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm hover:bg-ground-2"><span className="min-w-0 truncate font-semibold">{it.title}</span>{it.sub && <span className="shrink-0 text-ink-4">{it.sub}</span>}</Link></li>
          ))}
        </ul>
      )}
      {r.prompt && (
        <div className="rounded-card border border-line bg-ground-2">
          <div className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2">
            <span className="text-xs font-semibold text-ink-3">AI 도구에 붙여 넣을 요청문</span>
            <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-ink-3 hover:text-ink"
              onClick={() => { void navigator.clipboard.writeText(r.prompt ?? "").then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>
              {copied ? <Check className="size-3.5" aria-hidden /> : <CopyIcon className="size-3.5" aria-hidden />}{copied ? "복사함" : "복사"}
            </button>
          </div>
          <p className="whitespace-pre-wrap px-3.5 py-2.5 text-sm leading-[1.65] text-ink-2">{r.prompt}</p>
        </div>
      )}
      {(r.links ?? []).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {r.links.map(([href, label], i) => (
            <Button key={href + label} asChild size="sm" variant={i === 0 ? "default" : "outline"}><Link to={href}>{label}</Link></Button>
          ))}
        </div>
      )}
    </div>
  );
}

/** (예전) 질문 답 — 도움말 문서 원문 또는 맞는 서비스 안내. 이전에 저장된 대화를 그대로 보여 주려고 남긴다. */
function AnswerCard({ a }: { a: Answer }) {
  const body = clean(String(a.body ?? "")).replace(/^#+\s*/gm, "").replace(/^[-*]\s+/gm, "· ");
  return (
    <div className="max-w-[88%] rounded-card border border-line bg-ground">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5"><CircleHelp className="size-4 text-ink-4" aria-hidden /><span className="text-sm font-bold">{a.title}</span></div>
      <div className="flex flex-col gap-3 px-4 py-3.5">
        {a.kind === "doc" ? <More text={body} /> : <p className="text-sm leading-[1.75] text-ink-2"><Copy as="span" text={body} /></p>}
        {(a.links ?? []).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {a.links.map(([href, label], i) => (
              <Button key={href + label} asChild size="sm" variant={i === 0 ? "default" : "outline"}><Link to={href}>{label}</Link></Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function QuotaBadge({ q }: { q: Quota }) {
  if (q.paid) return <span className="text-sm text-ink-4">pro · 제한 없음</span>;
  const left = (n: number, m: number | null) => Math.max(0, (m ?? 0) - n);
  return (
    <span className="text-sm text-ink-4" title={`${q.reset} 에 다시 채워집니다`}>
      이번 달 무료 · 기획 {left(q.plan, q.plan_max)} · 시안 {left(q.mock, q.mock_max)} · 자료 {left(q.upload, q.upload_max)}
    </span>
  );
}

function Progress({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="flex flex-col gap-1.5" role="status">
      <div className="flex justify-between text-sm"><span className="text-ink-3">{label}</span><span className="tabular-nums text-ink-4">{pct}%</span></div>
      <div className="relative pt-[33px]">
        {/* 진행률 끝을 따라 걷는 강아지 — powerDeck 진행 화면과 같은 그림(public/dog.svg) */}
        <img src={`${import.meta.env.BASE_URL}dog.svg`} alt="" aria-hidden
          className="pointer-events-none absolute top-0 h-[33px] w-[36px] origin-bottom transition-[left,transform] duration-700"
          style={{ left: `${Math.max(2, Math.min(98, pct))}%`, transform: `translateX(-50%) scale(${1 + 0.1 * Math.max(0, Math.min(100, pct)) / 100})` }} />
        <div className="h-1.5 overflow-hidden rounded-full bg-ground-3"><div className="h-full bg-point transition-[width] duration-500" style={{ width: `${Math.max(3, pct)}%` }} /></div>
      </div>
    </div>
  );
}

function ShowAll({ n, cut, all, set }: { n: number; cut: number; all: boolean; set: (v: boolean) => void }) {
  if (n <= cut) return null;
  return <button type="button" onClick={() => set(!all)} className="mt-3 text-sm font-semibold text-ink-3 underline-offset-4 hover:underline">{all ? "접기" : `나머지 ${n - cut}개 더 보기`}</button>;
}

function AiLabel() {
  return <span className="inline-flex items-center gap-1 rounded-full bg-ground-2 px-2 py-0.5 text-xs font-semibold text-ink-4"><Sparkles className="size-3" aria-hidden />AI 생성</span>;
}

function Card({ title, children, ai = true }: { title: string; children: React.ReactNode; ai?: boolean }) {
  return (
    <div className="rounded-card border border-line bg-ground">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5"><span className="text-sm font-bold">{title}</span>{ai && <AiLabel />}</div>
      <div className="px-4 py-3.5">{children}</div>
    </div>
  );
}

function More({ text, lines = 8 }: { text: string; lines?: number }) {
  const [open, setOpen] = useState(false);
  const long = text.split("\n").length > lines || text.length > 700;
  return (
    <div>
      <div className={cn("whitespace-pre-wrap text-sm leading-[1.75] text-ink-2", !open && long && "line-clamp-[8]")}>{text}</div>
      {long && <button type="button" onClick={() => setOpen(!open)} className="mt-1.5 text-sm font-semibold text-ink-3 underline-offset-4 hover:underline">{open ? "접기" : "더 보기"}</button>}
    </div>
  );
}

function Bubble({ m, dock = false, live, onAct, onFile, canUpload, busy, docs, jobId }: { m: Msg; dock?: boolean; live: boolean; onAct: (b: Btn, fb?: string, extra?: Record<string, unknown>) => void; onFile: () => void; canUpload: boolean; busy: boolean; docs: number; jobId: string }) {
  const c = (m.card ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const [fb, setFb] = useState<string | null>(null);
  const [big, setBig] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  if (m.role === "user") {
    return <div className="ml-auto max-w-[80%] whitespace-pre-wrap rounded-bubble bg-ground-3 px-4 py-2.5 text-md leading-[1.6] text-ink">{m.body}</div>;
  }
  const text = m.body ? <p className="max-w-full text-md leading-[1.7] text-ink-2"><Copy as="span" text={m.body} /></p> : null;
  const buttons: Btn[] = (c.buttons as Btn[] | undefined) ?? [];
  const bar = buttons.length > 0 && live && (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {m.kind === "upload" && canUpload && <Button variant="outline" onClick={onFile}><FileUp className="size-4" aria-hidden />자료 올리기</Button>}
        {buttons.map((b) => (
          <Button key={b.act + b.label} variant={b.primary ? "default" : "outline"} className={b.primary ? "border-point bg-point text-white hover:border-point hover:bg-point/90" : undefined}
            onClick={() => (b.act === "redo" && !b.feedback ? setFb(fb === null ? "" : null) : onAct(b))}>{b.act === "upgrade" && <Lock className="size-4" aria-hidden />}{b.label}</Button>
        ))}
      </div>
      {fb !== null && (
        <div className="flex items-end gap-2">
          <textarea value={fb} onChange={(e) => setFb(e.target.value)} rows={2} placeholder="어떻게 고칠지 적어 주세요. 예) 제목을 더 짧게, 색을 차분하게" aria-label="수정 의견"
            className="min-h-11 flex-1 resize-none rounded-md border border-line bg-ground px-3 py-2 text-md outline-none focus:border-ink-4" />
          <Button disabled={!fb.trim()} onClick={() => onAct({ act: "redo", label: "수정 요청" }, fb)}>보내기</Button>
        </div>
      )}
    </div>
  );
  switch (m.kind) {
    case "reply":
      return <ReplyCard r={{ ...(c as Reply), body: String(c.body ?? m.body ?? "") }} dock={dock} />;
    case "answer":
      return <AnswerCard a={c as Answer} />;
    case "basics":
      return <Basics m={m} live={live && canUpload} busy={busy} docs={docs} jobId={jobId} onFile={onFile} onStart={(basics) => onAct({ act: "start", label: "검토 시작" }, undefined, { basics })} />;
    case "summary":
      return <Card title="자료 요약"><More text={clean(String(c.text ?? ""))} /></Card>;
    case "outline":
      return (
        <Card title={`목차 · ${clean(String(c.title ?? ""))}`}>
          <ol className="flex flex-col divide-y divide-line">
            {(c.items as { n: number; title: string; desc: string | null }[] ?? []).slice(0, all ? 999 : 10).map((it) => (
              <li key={it.n} className="flex gap-3 py-2 text-sm">
                <span className="w-7 shrink-0 tabular-nums text-ink-4">{String(it.n).padStart(2, "0")}</span>
                <span className="min-w-0"><span className="font-semibold">{it.title}</span>{it.desc && <span className="mt-0.5 block text-ink-3">{clean(it.desc)}</span>}</span>
              </li>
            ))}
          </ol>
          <ShowAll n={(c.items as unknown[] ?? []).length} cut={10} all={all} set={setAll} />
          {c.locked && <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-4"><Lock className="size-3.5" aria-hidden />장별 핵심 메시지는 pro 에서 볼 수 있어요</p>}
        </Card>
      );
    case "plan":
      return (
        <Card title="기획">
          <div className="flex flex-col gap-4">
            {(c.slides as { n: number; title: string; message: string; content: string }[] ?? []).slice(0, all ? 999 : 3).map((s) => (
              <div key={s.n} className="flex flex-col gap-1.5">
                <span className="text-sm font-bold"><span className="mr-2 tabular-nums text-ink-4">{String(s.n).padStart(2, "0")}</span>{s.title}</span>
                {s.message && <span className="text-sm text-ink-3">{clean(s.message)}</span>}
                {s.content && <More text={clean(s.content)} lines={6} />}
              </div>
            ))}
          </div>
          <ShowAll n={(c.slides as unknown[] ?? []).length} cut={3} all={all} set={setAll} />
        </Card>
      );
    case "wire": {
      const ws = (c.slides as { n: number; title: string; ab: boolean; pick: string }[] ?? []);
      const wait = ws.filter((s) => s.ab && !s.pick).length;
      return (
        <Card title={`와이어프레임 · ${ws.length}장${wait ? ` · A·B 고를 장 ${wait}` : ""}`}>
          <ol className="flex flex-col divide-y divide-line">
            {ws.slice(0, all ? 999 : 10).map((s) => (
              <li key={s.n} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-7 shrink-0 tabular-nums text-ink-4">{String(s.n).padStart(2, "0")}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{s.title}</span>
                <span className="shrink-0 text-ink-4">{s.ab ? (s.pick ? `${s.pick.toUpperCase()}안 확정` : "A·B 고르기 전") : "배치 하나"}</span>
              </li>
            ))}
          </ol>
          <ShowAll n={ws.length} cut={10} all={all} set={setAll} />
          <p className="mt-2 text-sm text-ink-4">A·B 비교와 배치 수정은 &lsquo;A·B 고르기&rsquo;에서 합니다.</p>
        </Card>
      );
    }
    case "mockup":
      return (
        <Card title="디자인 시안">
          <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @3xl:grid-cols-3">
            {(c.images as { n: number; src: string }[] ?? []).slice(0, all ? 999 : 6).map((im) => (
              <button key={im.src} type="button" onClick={() => setBig(im.src)} className="group overflow-hidden rounded-card border border-line bg-ground-2 text-left">
                <img src={im.src} alt={`${im.n}번 장 시안`} loading="lazy" className="aspect-video w-full object-cover" />
                <span className="block px-3 py-2 text-sm text-ink-3">{im.n}번 장 · 크게 보기</span>
              </button>
            ))}
          </div>
          <ShowAll n={(c.images as unknown[] ?? []).length} cut={6} all={all} set={setAll} />
          <Dialog open={!!big} onOpenChange={(o) => !o && setBig(null)}>
            <DialogContent className="max-w-[min(1200px,94vw)] sm:max-w-[min(1200px,94vw)]">
              <DialogTitle className="flex items-center gap-2">시안 크게 보기 <AiLabel /></DialogTitle>
              {big && <img src={big} alt="시안" className="w-full rounded-card" />}
            </DialogContent>
          </Dialog>
        </Card>
      );
    case "result":
      return (
        <Card title="결과물">
          <p className="text-md">{m.body}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild className="border-point bg-point text-white hover:border-point hover:bg-point/90"><a href={`/api/v1${String(c.download ?? "").replace(/^\/api\/v1/, "")}`}>내려받기</a></Button>
            <Button asChild variant="outline"><Link to={String(c.open ?? "/deck/jobs")}>powerDeck 에서 열기</Link></Button>
          </div>
        </Card>
      );
    case "limit":
      return <div className="max-w-full rounded-card bg-ground-2 px-4 py-3 text-sm text-ink-3"><Copy as="span" text={m.body ?? ""} /></div>;
    default:
      return <div className="flex flex-col gap-2.5">{text}{bar}</div>;
  }
}

/** 강조색 — powerDeck 작업 설정(legacy/JobSettingsEdit.tsx ACCENTS)의 9가지에서 진분홍을 뺀 8가지(2026-10-08 사용자). 홈에서 legacy 화면을 통째로 읽지 않게 값만 옮겨 둔다. */
const ACCENTS: [string, string][] = [
  ["#1866DA", "블루"], ["#2E9BD6", "스카이"], ["#0E9F8E", "틸"], ["#1A9C5B", "그린"],
  ["#F59E0B", "앰버"], ["#E8703A", "오렌지"], ["#D7263D", "레드"], ["#C01348", "버건디"],
];
const LogoPick = lazy(() => import("./logo-pick"));
type LogoState = { mode: "none" | "set"; name?: string; src?: string };

/** 시작 전 기본 정보 — 프로젝트명·용도·장 수·표지 문구·발표일·강조색·로고(2026-10-08 사용자 "처음에 기본적인 것들을 물어봐야지").
 *  로고는 바로 작업에 올리고(PUT /deck/jobs/{id}/brand/{client|vendor}), 나머지는 '검토 시작' 때 basics 로 보낸다. */
function Basics({ m, live, busy, docs, jobId, onFile, onStart }: { m: Msg; live: boolean; busy: boolean; docs: number; jobId: string; onFile: () => void; onStart: (b: Record<string, unknown>) => void }) {
  const c = (m.card ?? {}) as { project?: string; purpose?: string; slides?: number; slides_max?: number };
  const max = Math.max(3, Number(c.slides_max ?? 10));
  const [project, setProject] = useState(String(c.project ?? ""));
  const [purpose, setPurpose] = useState(c.purpose === "submit" ? "submit" : "present");
  const [slides, setSlides] = useState(Math.min(max, Math.max(3, Number(c.slides ?? 5))));
  const [event, setEvent] = useState("");
  const [date, setDate] = useState("");
  const [accent, setAccent] = useState("");
  const [logos, setLogos] = useState<Record<"client" | "vendor", LogoState>>({ client: { mode: "none" }, vendor: { mode: "none" } });
  const [finding, setFinding] = useState<"client" | "vendor" | null>(null);
  const [sending, setSending] = useState<"client" | "vendor" | null>(null);
  const fileIn = useRef<HTMLInputElement>(null);
  const target = useRef<"client" | "vendor">("client");
  const who = { client: "발주기관 로고", vendor: "제안사 로고" } as const;

  const putLogo = async (which: "client" | "vendor", f: File) => {
    if (f.size > 5 * 1024 * 1024) { toastError(new Error("로고는 5MB 까지 올릴 수 있어요.")); return; }
    setSending(which);
    try {
      await apiFetch(`/deck/jobs/${jobId}/brand/${which}`, { method: "PUT", body: f, headers: { "Content-Type": f.type } });
      setLogos((l) => ({ ...l, [which]: { mode: "set", name: f.name.replace(/\.[^.]+$/, ""), src: URL.createObjectURL(f) } }));
    } catch (e) { toastError(e); }
    setSending(null);
  };
  const logoText = (["client", "vendor"] as const).filter((k) => logos[k].mode === "set").map((k) => `${who[k]} ${logos[k].name}`).join(" · ");
  const row = "flex flex-col gap-1.5 @lg:flex-row @lg:items-center @lg:gap-3";
  const label = "pp-label w-24 shrink-0 text-sm font-semibold text-ink-3";
  const seg = (on: boolean) => cn("pp-seg h-10 rounded-card border px-4 text-sm font-semibold", on ? "border-ink bg-ink text-white" : "border-line bg-ground text-ink-3 hover:bg-ground-2");

  return (
    <div className="flex flex-col gap-2.5">
      {m.body && <p className="max-w-full text-md leading-[1.7] text-ink-2"><Copy as="span" text={m.body} /></p>}
      <Card title="기본 정보" ai={false}>
        <fieldset disabled={!live || busy} className="flex flex-col gap-3.5 disabled:opacity-70">
          <div className={row}>
            <span className={label}>프로젝트명</span>
            <Input className="h-10 flex-1" value={project} maxLength={80} onChange={(e) => setProject(e.target.value)} placeholder="예) 2026 AI 행정 서비스 고도화 사업" aria-label="프로젝트명" aria-invalid={!project.trim()} />
          </div>
          {!project.trim() && <p className="-mt-2 text-sm text-ink-3 @lg:pl-[92px] @2xl:pl-[108px]">프로젝트명을 알려 주세요.<MBr />표지와 파일 이름에 씁니다.</p>}
          <div className={row}>
            <span className={label}>용도</span>
            <div className="flex gap-2" role="radiogroup" aria-label="용도">
              {([["present", "발표용"], ["submit", "제출용"]] as const).map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={purpose === k} onClick={() => setPurpose(k)} className={seg(purpose === k)}>{l}</button>
              ))}
            </div>
          </div>
          <div className={row}>
            <span className={label}>장 수</span>
            <div className="flex items-center gap-1">
              <Button type="button" variant="outline" size="icon" aria-label="한 장 줄이기" disabled={slides <= 3} onClick={() => setSlides(slides - 1)}><Minus aria-hidden /></Button>
              <span className="w-10 text-center text-md font-bold tabular-nums">{slides}장</span>
              <Button type="button" variant="outline" size="icon" aria-label="한 장 늘리기" disabled={slides >= max} onClick={() => setSlides(slides + 1)}><Plus aria-hidden /></Button>
              <span className="ml-2 text-sm text-ink-4">최대 {max}장</span>
            </div>
          </div>
          <div className={row}>
            <span className={label}>표지 문구</span>
            <Input className="h-10 flex-1" value={event} maxLength={30} onChange={(e) => setEvent(e.target.value)} placeholder="예) 제안 발표회 · 비우면 자료에서 정함" aria-label="표지 문구" />
          </div>
          <div className={row}>
            <span className={label}>발표일</span>
            <Input className="h-10 flex-1 @lg:max-w-60" value={date} maxLength={20} onChange={(e) => setDate(e.target.value)} placeholder="예) 2026. 11. 3." aria-label="발표일" />
          </div>
          <div className={cn(row, "@lg:items-start")}>
            <span className={cn(label, "@lg:pt-2.5")}>강조색</span>
            <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="강조색">
              <button type="button" role="radio" aria-checked={accent === ""} onClick={() => setAccent("")} className={seg(accent === "")}>자료 보고 정하기</button>
              {ACCENTS.map(([hex, name]) => (
                <button key={hex} type="button" role="radio" aria-checked={accent === hex} aria-label={name} title={name} onClick={() => setAccent(hex)}
                  className={cn("pp-swatch size-10 rounded-full border-2 transition-transform", accent === hex ? "border-ink" : "border-ground hover:border-line-3")} style={{ background: hex }} />
              ))}
            </div>
          </div>
          {(["client", "vendor"] as const).map((k) => (
            <div key={k} className={row}>
              <span className={label}>{who[k]}</span>
              <div className="flex flex-wrap items-center gap-2">
                {logos[k].mode === "set" && (
                  <span className="inline-flex h-10 max-w-60 items-center gap-2 rounded-card border border-line bg-ground-2 px-2.5 text-sm">
                    {logos[k].src && <img src={logos[k].src} alt="" className="h-6 max-w-16 object-contain" />}<span className="truncate">{logos[k].name}</span>
                  </span>
                )}
                <Button type="button" variant="outline" disabled={sending === k} onClick={() => { target.current = k; fileIn.current?.click(); }}><FileUp aria-hidden />{sending === k ? "올리는 중…" : "파일 올리기"}</Button>
                <Button type="button" variant="outline" onClick={() => setFinding(k)}>powerAssets 에서 찾기</Button>
                {logos[k].mode === "set" && <Button type="button" variant="ghost" onClick={() => setLogos((l) => ({ ...l, [k]: { mode: "none" } }))}><X aria-hidden />빼기</Button>}
              </div>
            </div>
          ))}
          <p className="text-sm text-ink-4"><Copy as="span" text="로고가 없으면 비워 두세요. 표지와 머리 띠에 글자로 넣습니다." /></p>
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3.5">
            <Button type="button" variant="outline" onClick={onFile}><Paperclip aria-hidden />자료 올리기</Button>
            <span className="text-sm text-ink-4">{!docs ? "자료를 올려야 시작할 수 있어요" : !project.trim() ? "프로젝트명을 적어야 시작할 수 있어요" : `자료 ${docs}개 올림`}</span>
            <Button type="button" className="ml-auto border-point bg-point text-white hover:border-point hover:bg-point/90" disabled={!docs || !project.trim()}
              onClick={() => onStart({ project: project.trim(), purpose, slides, event: event.trim(), date: date.trim(), accent, logos: logoText })}>검토 시작</Button>
          </div>
        </fieldset>
        <input ref={fileIn} type="file" aria-label="로고 파일 올리기" accept="image/png,image/jpeg" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void putLogo(target.current, f); }} />
      </Card>
      {finding && (
        <Suspense fallback={null}>
          <LogoPick title={who[finding]} onClose={() => setFinding(null)} onPick={(f) => void putLogo(finding, f)} />
        </Suspense>
      )}
    </div>
  );
}

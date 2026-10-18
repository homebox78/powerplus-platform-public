// 시안 검토 화면 — 출처: powerDeck web/src/screens/MockupReview.tsx (옛 화면 그대로 이식, eslint.config.js legacy 구역).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, fileUrl, unwrapList, usd, type Job, type PinComment, type PlanFront, type PlanSlide, type WireBlock } from "../api";
import { autoWire, WireCanvas, WireTools } from "../Wireframe";
import { OverviewCanvas } from "../OverviewCanvas";
import { FrontWire, frontWord, type FrontEditEv } from "../FrontWire";
import { JobSettingsEdit } from "../JobSettingsEdit";
import { ShareLevel } from "../Feedback";
import { cn, GenStamp, GuestHeader, JobHeader, Ms, Seg, useToastOn, ask, useContextMenu, type CtxItem, sent } from "../ui";
import { CommentList, PinLayer, who, type Draft, type PinCtl } from "./MockupReviewPins";

type Edit = { title?: string; keyword?: string; message?: string; scene?: string; layout?: string; content?: string; feedback?: string; pick?: boolean };
const FIELDS = ["title", "keyword", "message", "scene", "layout", "content"] as const;
const clean = (s: string) => s.replace(/\*\*/g, "");

/* 모양 — 디자인 확정값 */
const SLIDE = "rounded-md shadow-[0_1px_3px_rgba(17,17,17,.08),0_0_0_1px_var(--color-line)]";                                    // 장표 한 장
const NAV = "w-[34px] h-[34px] p-0 flex-none border border-line bg-white rounded-md inline-flex items-center justify-center text-ink3 hover:bg-panel disabled:text-faint disabled:hover:bg-white";
const SEG = "[&>button]:!px-2.5";   // 가운데 도구줄은 좁다 — 세그먼트 안쪽 여백을 줄인다

/**
 * design 작업 — 기획·시안 확인.
 *   머리줄: 그만두기 | 기획(.md) · 선택한 N장 시안 만들기 · 장표 만들기 (작업 주인만).
 *   왼쪽: 장 목록. 체크한 장만 시안을 만든다.
 *   가운데: 와이어프레임(상자를 고치면 자동 저장) 또는 시안 이미지 — 누르면 그 자리에 핀 의견.
 *   오른쪽: 「기획」(그 자리에서 고치면 자동 저장) / 「의견」(누르면 그 장의 그 핀으로, 팀원에게 공유).
 * 공유 링크로 들어온 팀원(job.mine === false)은 사이드바 없이 보기·의견만 — 아래 guest 배치.
 */
export function MockupReview({ job, onChange, isAdmin, me, onLogout }: { job: Job; onChange: (j: Job) => void; onNew: () => void; isAdmin: boolean; me: string; onLogout?: () => void }) {
  const owner = job.mine !== false;   // 작업 주인(관리자 포함) — 시안·장표 만들기·공유 설정·비용
  const mine = owner || !!job.can_edit;   // 편집할 수 있다 — 주인, 또는 편집 권한으로 공유받은 팀원(기획·와이어프레임·A·B). false = 보기·의견만
  // 팀원에게는 A·B 를 아직 고르지 않은 장(시안도 없는 장)을 보이지 않는다 — 확정한 장만 공유된다
  const slides = useMemo(() => (job.plan?.slides ?? []).filter((s) => mine || !(s.wire_alt?.b?.length && !s.wire_pick && !job.files?.mockup?.some((f) => f.slide === s.n))), [job.plan, job.files, mine]);
  const mock = (n: number) => job.files?.mockup?.find((f) => f.slide === n);
  const [sel, setSel] = useState(slides[0]?.n ?? 1);
  const [edits, setEdits] = useState<Record<number, Edit>>({});
  const [fb, setFb] = useState("");
  const [front, setFront] = useState({ cover: true, toc: true, divider: true, ending: true, ...(job.opts?.front ?? {}) });
  // 표지·목차·간지 시안 — 기획에 목록이 없으면(예전 작업) 종류별 자리만 보여 주고, 고르면 엔진이 만든다
  const fronts: PlanFront[] = (job.plan?.front?.length ? job.plan.front
    : [{ id: "cover", kind: "cover", label: "표지" }, { id: "toc", kind: "toc", label: "목차" }, { id: "div", kind: "div", label: "간지 (장마다)" }] as PlanFront[])
    .filter((f) => (f.kind === "cover" ? front.cover : f.kind === "toc" ? front.toc : f.kind === "end" || f.kind === "qna" ? front.ending !== false : front.divider));
  const fmock = (id: string) => job.files?.mockup?.find((f) => f.name === `${id}.jpg`);
  const [fsel, setFsel] = useState<string | null>(null);
  const [fpick, setFpick] = useState<Record<string, boolean>>({});
  const [setOpen, setSetOpen] = useState(false);   // 작업 설정 바꾸기(디자인 타입·서체·강조색) 창
  const [ffb, setFfb] = useState<Record<string, string>>({});
  const fpicked = fronts.filter((f) => fpick[f.id]);
  const fcur = fronts.find((f) => f.id === fsel) ?? null;
  // 와이어프레임 — 시안 전에 화면 구성을 상자로 잡는다. 고친 것은 자동 저장(서버 PATCH slides[].wire)
  const accent = (job.theme || "#FF2A6D").slice(0, 7);
  const [wireEd, setWireEd] = useState<Record<number, WireBlock[]>>({});
  // 와이어프레임이 없는 장은 기획 내용으로 자동 배치 — 주인이면 저장(시안 지시에 들어가게), 팀원 화면은 보여 주기만
  const autoBy = useMemo(() => Object.fromEntries(slides.filter((s) => !s.wire?.length && s.content).map((s) => [s.n, autoWire(s.content, s.scene)])), [slides]);
  const wireOf = (s: PlanSlide) => wireEd[s.n] ?? (s.wire?.length ? s.wire : autoBy[s.n] ?? []);
  // 실행 취소 — 장마다 기록. 끌기처럼 잇달아 바뀌는 것은 0.6초 안이면 한 단계로 묶는다
  const hist = useRef<Record<number, { u: WireBlock[][]; r: WireBlock[][]; t: number }>>({});
  const [, bump] = useState(0);
  const setWire = (n: number, b: WireBlock[]) => {
    const h = (hist.current[n] ??= { u: [], r: [], t: 0 });
    const s0 = slides.find((x) => x.n === n);
    const now = Date.now();
    if (s0 && now - h.t > 600) { h.u.push(wireOf(s0)); if (h.u.length > 80) h.u.shift(); h.r = []; }
    h.t = now;
    setWireEd((w) => ({ ...w, [n]: b }));
  };
  const undo = (n: number) => {
    const h = hist.current[n], s0 = slides.find((x) => x.n === n);
    if (!h?.u.length || !s0) return;
    h.r.push(wireOf(s0)); const prev = h.u.pop()!; h.t = 0;
    setWireEd((w) => ({ ...w, [n]: prev })); bump((v) => v + 1);
  };
  const redo = (n: number) => {
    const h = hist.current[n], s0 = slides.find((x) => x.n === n);
    if (!h?.r.length || !s0) return;
    h.u.push(wireOf(s0)); const next = h.r.pop()!; h.t = 0;
    setWireEd((w) => ({ ...w, [n]: next })); bump((v) => v + 1);
  };
  // AI 로 다시 짜기 — 기획의 글·수치를 상자에 그대로 넣은 완성 목업 수준으로(서버가 5장씩). 되돌리기 기록에 남긴다
  const [aiWire, setAiWire] = useState("");
  const rewire = async (ns: number[]) => {
    setErr(null);
    try {
      for (let i = 0; i < ns.length; i += 5) {
        setAiWire(ns.length > 1 ? `${Math.min(i + 5, ns.length)} / ${ns.length}장` : "짜는 중");
        const j = await api<Job>(`/jobs/${job.id}/wire`, { method: "POST", body: JSON.stringify({ ns: ns.slice(i, i + 5) }) });
        for (const s of j.plan?.slides ?? []) if (ns.slice(i, i + 5).includes(s.n) && s.wire?.length) setWire(s.n, s.wire);
        onChange(j);
      }
    } catch (e) { setErr((e as Error).message); }
    setAiWire("");
  };
  // A·B 와이어프레임 — 엔진이 같은 기획으로 두 안을 짠다. 확정한 안이 wire 가 되고 시안은 그것으로 그린다(고르지 않으면 A안)
  const abWait = (s: PlanSlide) => !!s.wire_alt?.b?.length && !s.wire_pick;
  // 확정 연출 — 고르지 않은 안은 회색이 되며 사라지고(1초), 고른 안이 그 자리에 남는다. 저장이 끝나고 연출도 끝나야 보통 화면으로
  const [abAnim, setAbAnim] = useState<{ n: number; p: "a" | "b" } | null>(null);
  const pickAb = async (s: PlanSlide, p: "a" | "b") => {
    if (abAnim) return;
    const w = JSON.stringify(wireOf(s));
    if (s.wire_alt && w !== JSON.stringify(s.wire_alt.a) && w !== JSON.stringify(s.wire_alt.b)
      && !(await ask("손으로 고친 배치는 고른 안으로 바뀝니다.", { title: `${p.toUpperCase()}안으로 확정할까요?`, ok: "확정" }))) return;
    setWireEd((x) => { const y = { ...x }; delete y[s.n]; return y; });
    delete hist.current[s.n];
    setAbAnim({ n: s.n, p });
    const wait = new Promise((r) => setTimeout(r, 1000));
    try {
      const [j] = await Promise.all([api<Job>(`/jobs/${job.id}`, { method: "PATCH", body: JSON.stringify({ slides: [{ n: s.n, wire_pick: p }] }) }), wait]);
      onChange(j);
    } catch (e) { setErr((e as Error).message); }
    setAbAnim(null);
  };
  // 표지·목차·간지 글 고치기 — plan.front_edit 에 남기고(엔진이 앞장을 다시 짤 때 우선) 지금 front 에도 바로 반영
  const [feLocal, setFeLocal] = useState<Record<string, Record<string, string>>>({});   // 고친 앞장 글 — 저장이 끝나기 전에도 바로 보이게
  const saveFront = async (id: string, v: { title?: string; project?: string; tail?: string; date?: string; name?: string; desc?: string }) => {
    const f = job.plan?.front?.find((x) => x.id === id);
    if (f && Object.entries(v).every(([k, x]) => (f as Record<string, unknown>)[k] === x)) return;
    setFeLocal((o) => ({ ...o, [id]: { ...o[id], ...(v as Record<string, string>) } }));
    try { onChange(await api<Job>(`/jobs/${job.id}`, { method: "PATCH", body: JSON.stringify({ front_edit: { [id]: v } }) })); } catch (e) { setErr((e as Error).message); }
  };
  const reAb = async (s: PlanSlide) => {
    try { onChange(await api<Job>(`/jobs/${job.id}`, { method: "PATCH", body: JSON.stringify({ slides: [{ n: s.n, wire_pick: "" }] }) })); } catch (e) { setErr((e as Error).message); }
  };
  const [abX, setAbX] = useState(50);   // A·B 겹쳐 보기 — 손잡이 위치(%). 왼쪽이 A, 오른쪽이 B
  const abBox = useRef<HTMLDivElement>(null);
  const abDrag = (clientX: number) => { const r = abBox.current!.getBoundingClientRect(); setAbX(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100))); };
  const [wsel, setWsel] = useState<string[]>([]);
  const [tab, setTab] = useState<"mock" | "wire">("mock");
  const [wmode, setWmode] = useState<"edit" | "pin">("edit");
  const [overview, setOverview] = useState(false);
  // 한눈에 보기 안에서 카드 격자 / 캔버스(장 흐름) — 고른 쪽을 기억
  const [ovMode, setOvMode] = useState<"card" | "canvas">(() => { try { return localStorage.getItem("pd_mr_ovmode") === "canvas" ? "canvas" : "card"; } catch { return "card"; } });
  useEffect(() => { try { localStorage.setItem("pd_mr_ovmode", ovMode); } catch { /* 무시 */ } }, [ovMode]);
  // 제목만 읽기·보강 요청 목록 — 열 때마다 접힌 채로 시작(2026-10-13 사용자 지시)
  const [ovOpen, setOvOpen] = useState({ t: false, n: false });
  const [rtab, setRtab] = useState<"plan" | "note">("plan");   // 오른쪽 패널 탭
  const [gplan, setGplan] = useState(false);                    // 공유 화면 — 이 장의 기획 글 펼치기
  const narrow = typeof window !== "undefined" && window.innerWidth < 1280;   // 태블릿은 썸네일 칸을 좁게
  // 2026-10-08 사용자: 좌우 날개는 열 때마다 펼친 상태가 기본 — 접은 상태를 기억하지 않는다(모바일만 접힘)
  const [rail, setRail] = useState<{ l: boolean; r: boolean }>(() => (typeof window !== "undefined" && window.innerWidth < 768 ? { l: false, r: false } : { l: true, r: true }));
  const toggleRail = (k: "l" | "r") => setRail((r) => ({ ...r, [k]: !r[k] }));
  useEffect(() => {   // 자동 배치를 저장해 둔다(주인만, 시안 단계에서 쓰이게)
    if (!mine) return;
    const add = Object.fromEntries(Object.entries(autoBy).filter(([n]) => !wireEd[Number(n)]));
    if (Object.keys(add).length) setWireEd((w) => ({ ...add, ...w }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoBy, mine]);
  const [budget, setBudget] = useState(job.budget_usd != null ? String(job.budget_usd) : "");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useToastOn(err);
  useEffect(() => { if (!slides.some((s) => s.n === sel) && slides[0]) setSel(slides[0].n); }, [slides, sel]);

  const cur = slides.find((s) => s.n === sel);
  const ed = (n: number): Edit => edits[n] ?? {};
  const setEd = (n: number, p: Partial<Edit>) => setEdits((e) => ({ ...e, [n]: { ...e[n], ...p } }));
  const val = (s: PlanSlide, k: (typeof FIELDS)[number]) => ed(s.n)[k] ?? (s[k] ?? "");
  const changed = (s: PlanSlide) => FIELDS.some((k) => ed(s.n)[k] !== undefined && ed(s.n)[k] !== (s[k] ?? ""));
  const picked = slides.filter((s) => ed(s.n).pick);
  const nPick = picked.length + fpicked.length;
  const missing = slides.filter((s) => !mock(s.n));
  const have = slides.length - missing.length;
  const est = job.est_image_usd ?? null;
  const spent = Math.max(0, (job.spent_usd ?? 0) - (job.budget_base_usd ?? 0));   // 작업 한도에 드는 사용액(기준선 이후, 0043)
  const over = job.budget_usd != null && spent >= job.budget_usd;
  const allPicked = slides.length > 0 && picked.length === slides.length;
  const pickAll = (on: boolean) => setEdits((e) => { const n = { ...e }; for (const s of slides) n[s.n] = { ...n[s.n], pick: on }; return n; });

  /* ── 핀 의견 ── */
  const [allComments, setComments] = useState<PinComment[]>(job.comments ?? []);
  const comments = allComments.filter((c) => (c.target ?? "mockup") === "mockup");  // 이 화면은 시안 위 의견만
  const [draft, setDraft] = useState<Draft | null>(null);       // 지금 찍고 있는 핀
  const [focus, setFocus] = useState<number | null>(null);      // 스레드 창이 열린 핀
  const [showDone, setShowDone] = useState(false);
  const imgBox = useRef<HTMLDivElement>(null);
  useEffect(() => {  // 팀원 의견이 들어오는지 8초마다
    const f = () => api<{ data: PinComment[] }>(`/jobs/${job.id}/comments`).then((r) => setComments(unwrapList(r))).catch(() => {});
    const t = setInterval(f, 8000);
    return () => clearInterval(t);
  }, [job.id]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === "Escape" && tag !== "TEXTAREA" && tag !== "INPUT") { setFocus(null); setDraft(null); setWsel([]); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  const open = comments.filter((c) => !c.resolved);
  const accepted = open.filter((c) => c.accepted);      // 장표에 반영될 의견 (주인이 확정)
  const pending = open.filter((c) => !c.accepted);      // 검토 대기 — 반영 안 됨
  const listed = showDone ? comments : open;
  // 의견을 남긴 사람들(답변 포함) — 핀·아바타 색은 이메일에서 정해진다(avatarColor)
  const authors = [...new Set(comments.flatMap((c) => [c.email, ...c.replies.map((r) => r.email)]))];
  const cAct = async (f: Promise<{ data: PinComment[] }>) => { try { setComments(unwrapList(await f)); } catch (e) { setErr((e as Error).message); } };
  const addPin = () => {
    if (!draft?.body.trim()) return setDraft(null);
    cAct(api(`/jobs/${job.id}/comments`, { method: "POST", body: JSON.stringify({ slide: sel, x: draft.x, y: draft.y, body: draft.body.trim() }) }));
    setDraft(null);
  };
  const clickImage = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-pin]")) return;
    if (focus !== null || draft) { setFocus(null); setDraft(null); return; }  // 열린 창은 바깥을 누르면 닫힌다
    if (job.anon) { setErr("로그인하면 의견을 남길 수 있습니다 — 지금은 보기만 됩니다."); return; }
    const r = imgBox.current!.getBoundingClientRect();
    setDraft({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, body: "" });
  };
  const pins: PinCtl = {
    me, mine: owner, canResolve: owner || !!job.can_edit, comments, showDone, focus, setFocus, draft, setDraft, add: addPin,   // 의견 반영 여부는 주인만
    patch: (c, b) => cAct(api(`/jobs/${job.id}/comments/${c.id}`, { method: "PATCH", body: JSON.stringify(b) })),
    reply: (c, text) => cAct(api(`/jobs/${job.id}/comments/${c.id}/replies`, { method: "POST", body: JSON.stringify({ body: text }) })),
    edit: (c, rid, text) => cAct(api(rid === 0 ? `/jobs/${job.id}/comments/${c.id}` : `/jobs/${job.id}/comments/${c.id}/replies/${rid}`, { method: "PATCH", body: JSON.stringify({ body: text }) })),
    remove: async (c, rid) => {
      if (rid === 0) { if (await ask("이 의견과 답글을 모두 지웁니다.", { danger: true })) { if (focus === c.id) setFocus(null); cAct(api(`/jobs/${job.id}/comments/${c.id}`, { method: "DELETE" })); } }
      else if (await ask("이 답글을 지웁니다.", { danger: true })) cAct(api(`/jobs/${job.id}/comments/${c.id}/replies/${rid}`, { method: "DELETE" }));
    },
  };
  const goComment = (c: PinComment) => { setSel(c.slide); setFsel(null); setOverview(false); setFocus(c.id); setDraft(null); };

  /* ── 장 옮기기 — 본문 장 다음에 표지·목차·간지 ── */
  const pickSlide = (n: number) => { setSel(n); setFsel(null); setDraft(null); setFocus(null); };
  const pickFront = (id: string) => { setFsel(id); setDraft(null); setFocus(null); };
  // 실제 장표 순서 — 표지·목차 → 장(章)마다 [구분선 · 간지 · 그 장의 본문]. 장은 섹션 앞부분이 바뀌는 곳(결과 화면·엔진과 같은 규칙)
  const chapters = useMemo(() => {
    const out: { name: string; slides: PlanSlide[] }[] = [];
    let prev: string | null = null;
    for (const s of slides) {
      const ch = (s.chapter ?? (s.section ?? "").split(" · ")[0])!.trim() || "본문";
      if (ch !== prev) { out.push({ name: ch, slides: [] }); prev = ch; }
      out[out.length - 1]!.slides.push(s);
    }
    return out;
  }, [slides]);
  type Row = { k: "f"; f: PlanFront } | { k: "s"; s: PlanSlide } | { k: "g"; no: number; name: string; n: number };
  const rows: Row[] = [];
  for (const f of fronts) if (f.kind === "cover" || f.kind === "toc") rows.push({ k: "f", f });
  const divs = fronts.filter((f) => f.kind === "div");
  chapters.forEach((c, i) => {
    if (chapters.length > 1) rows.push({ k: "g", no: i + 1, name: c.name, n: c.slides.length });
    const d = divs.find((f) => f.id === `div${i + 1}`) ?? (i === 0 ? divs.find((f) => f.id === "div") : undefined);
    if (d) rows.push({ k: "f", f: d });
    for (const s of c.slides) rows.push({ k: "s", s });
  });
  for (const f of divs) if (!rows.some((r) => r.k === "f" && r.f.id === f.id)) rows.push({ k: "f", f });   // 짝이 없는 간지는 맨 뒤에
  for (const f of fronts) if (f.kind === "end" || f.kind === "qna") rows.push({ k: "f", f });   // 맨 뒤 — 감사합니다 · 질의응답
  const fe: Record<string, Record<string, string>> = { ...(job.plan?.front_edit ?? {}) };
  for (const [id, v] of Object.entries(feLocal)) fe[id] = { ...fe[id], ...v };
  const subOf = (s: PlanSlide) => { const ch = (s.chapter ?? (s.section ?? "").split(" · ")[0])!.trim(); const sec = s.section ?? ""; return (sec.startsWith(ch) ? sec.slice(ch.length).replace(/^[\s·]+/, "") : "").trim(); };
  const lang = job.opts?.lang || "ko";
  const frontView = (f: PlanFront): PlanFront => {
    const o = fe[f.id] ?? {};
    if (f.kind === "toc") return { ...f, chapters: chapters.map((c, i) => ({ no: i + 1, name: fe[`div${i + 1}`]?.name || c.name, items: c.slides.map((s) => subOf(s) || val(s, "title")) })) };
    if (f.kind === "div") {   // 간지 설명 = 그 장의 핵심 한 줄(고친 것 → 개요의 장 핵심 → 장의 첫 키메시지)
      const c = chapters[(f.no ?? 1) - 1], nm = o.name || f.name || c?.name;
      const goal = job.plan?.chapters?.find((x) => x.name === (c?.name ?? f.name))?.goal;
      return { ...f, name: nm, desc: o.desc || f.desc || goal || (c ? val(c.slides[0]!, "title").replace(/\*\*/g, "") : "") };
    }
    if (f.kind === "end" || f.kind === "qna") return { ...f, title: o.title || f.title || frontWord(lang, f.kind === "end" ? "end" : "qna"), desc: o.desc ?? f.desc };
    // 한국어가 아닌 덱은 표지 큰 글을 작업 이름(대개 한국어 파일 이름) 대신 기획이 그 언어로 지은 제목으로
    const title = o.title || (lang !== "ko" && job.plan?.title) || f.title;
    return { ...f, title, project: o.project || f.project, tail: o.tail || f.tail, date: o.date || f.date };
  };
  // 앞장 글을 그 자리에서 고친다 — 표지 칸·장 이름·간지 핵심 한 줄은 front_edit
  const editFront = (ev: FrontEditEv) => {
    if (ev.k === "cover") return saveFront("cover", { [ev.field]: ev.v });
    if (ev.k === "close") return saveFront(ev.id, { [ev.field]: ev.v });
    if (ev.k === "chapter") return saveFront(`div${ev.no}`, { name: ev.v });
    return saveFront(`div${ev.no}`, { desc: ev.v });
  };
  // 장 순서 바꾸기·지우기 — 끌어 놓기(다른 장(章) 구분선 아래로 놓으면 그 장으로), 휴지통으로 지우기. 서버가 시안·의견·쪽 번호를 함께 옮긴다
  const canMove = owner && (job.status === "review" || job.status === "hold");
  const [dragN, setDragN] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<{ n: number; after: boolean } | { ch: string } | null>(null);
  const chOf = (x: PlanSlide) => (x.chapter ?? (x.section ?? "").split(" · ")[0])!.trim() || "본문";
  const applyOrder = async (order: number[], chapters: Record<number, string> = {}, keep?: number) => {
    if (saved === "saving" || Object.keys(wireEd).length || slides.some(changed)) { setErr("고친 내용을 저장하는 중입니다. 잠시 뒤 다시 해 주세요."); return; }
    try {
      const j = await api<Job>(`/jobs/${job.id}/slides/order`, { method: "POST", body: JSON.stringify({ order, chapters }) });
      setEdits({}); hist.current = {};
      if (keep != null) { const i = order.indexOf(keep); if (i >= 0) setSel(i + 1); }
      onChange(j);
    } catch (e) { setErr((e as Error).message); }
  };
  const dropTo = () => {
    const from = dragN, at = dropAt;
    setDragN(null); setDropAt(null);
    if (from == null || !at) return;
    const moving = slides.find((x) => x.n === from)!;
    const rest = slides.map((x) => x.n).filter((n) => n !== from);
    let idx: number, ch: string;
    if ("ch" in at) {   // 장(章) 구분선 위 — 그 장의 맨 앞으로
      const first = slides.find((x) => chOf(x) === at.ch && x.n !== from);
      idx = first ? rest.indexOf(first.n) : rest.length; ch = at.ch;
    } else {
      if (at.n === from) return;
      idx = rest.indexOf(at.n) + (at.after ? 1 : 0); ch = chOf(slides.find((x) => x.n === at.n)!);
    }
    const order = [...rest.slice(0, idx), from, ...rest.slice(idx)];
    if (order.every((n, i) => n === slides[i]?.n) && ch === chOf(moving)) return;
    applyOrder(order, ch !== chOf(moving) ? { [from]: ch } : {}, from);
  };
  const removeSlide = async (x: PlanSlide) => {
    if (slides.length <= 1) return setErr("마지막 한 장은 지울 수 없습니다.");
    if (!(await ask(`${x.n}쪽 「${clean(val(x, "title"))}」을 지웁니다.
그 장의 시안·의견도 함께 빠지고, 뒤 장의 쪽 번호와 목차·간지가 다시 맞춰집니다.`, { title: "장을 지울까요?", ok: "지우기", danger: true }))) return;
    applyOrder(slides.map((y) => y.n).filter((n) => n !== x.n), {}, x.n === sel ? undefined : sel);
  };
  const cmenu = useContextMenu();
  // 장 하나를 위·아래로 한 칸 — 오른쪽 클릭 메뉴용(끌어 놓기와 같은 규칙: 같은 장(章) 안에서만)
  const nudge = (x: PlanSlide, d: -1 | 1) => {
    const ns = slides.map((y) => y.n), i = ns.indexOf(x.n), j = i + d;
    if (j < 0 || j >= ns.length) return;
    [ns[i], ns[j]] = [ns[j]!, ns[i]!];
    const ch = chOf(slides[j]!);
    applyOrder(ns, ch !== chOf(x) ? { [x.n]: ch } : {}, x.n);
  };
  const slideMenu = (x: PlanSlide): CtxItem[] => {
    const on = !!ed(x.n).pick;
    return [{ head: `${x.n}쪽 · ${clean(val(x, "title")).slice(0, 18)}` },
      { label: "이 장 열기", icon: "open_in_new", onClick: () => pickSlide(x.n) },
      ...(owner ? [{ label: on ? "시안 만들 장에서 빼기" : "시안 만들 장으로 고르기", icon: on ? "check_box" : "check_box_outline_blank", onClick: () => setEd(x.n, { pick: !on }) }] : []),
      ...(canMove ? ["-" as const, { label: "위로 한 칸", icon: "arrow_upward", disabled: x.n === 1, onClick: () => nudge(x, -1) },
        { label: "아래로 한 칸", icon: "arrow_downward", disabled: x.n === slides.length, onClick: () => nudge(x, 1) },
        "-" as const, { label: "이 장 지우기", icon: "delete", danger: true, onClick: () => removeSlide(x) }] : [])];
  };
  const stageMenu = (): CtxItem[] => {
    const c = cur && !fcur ? cur : null;
    return [{ head: fcur ? fcur.label : c ? `${c.n}쪽` : "시안 확인" },
      ...(!overview && c && ab && mine ? [{ label: "A안 확정", icon: "check_circle", onClick: () => pickAb(c, "a") }, { label: "B안 확정", icon: "check_circle", onClick: () => pickAb(c, "b") }, "-" as const] : []),
      { label: overview ? "한 장씩 보기" : "한눈에 보기", icon: overview ? "crop_landscape" : "grid_view", onClick: () => setOverview(!overview) },
      ...(!overview && c && m ? [{ label: tab === "wire" ? "시안 보기" : "와이어프레임 보기", icon: tab === "wire" ? "image" : "dashboard", onClick: () => setTab(tab === "wire" ? "mock" : "wire") }] : []),
      ...(!overview && c && owner ? [{ label: ed(c.n).pick ? "시안 만들 장에서 빼기" : "시안 만들 장으로 고르기", icon: ed(c.n).pick ? "check_box" : "check_box_outline_blank", onClick: () => setEd(c.n, { pick: !ed(c.n).pick }) }] : []),
      "-", { label: "이전 장", icon: "chevron_left", disabled: at <= 0, onClick: () => step(-1) }, { label: "다음 장", icon: "chevron_right", disabled: at >= seq.length - 1, onClick: () => step(1) },
      ...(owner && (nPick || have > 0) ? ["-" as const,
        ...(nPick ? [{ label: `선택한 ${nPick}장 시안 만들기`, icon: "auto_awesome", disabled: !!busy, onClick: make }] : []),
        ...(have > 0 ? [{ label: "확정 — 장표 만들기", icon: "slideshow", disabled: !!busy, onClick: build }] : [])] : [])];
  };
  const seq = rows.flatMap((r) => (r.k === "s" ? [`s${r.s.n}`] : r.k === "f" ? [`f${r.f.id}`] : []));
  const at = seq.indexOf(fcur ? `f${fcur.id}` : `s${sel}`);
  const step = (d: number) => { const k = seq[at + d]; if (!k) return; if (k[0] === "s") pickSlide(Number(k.slice(1))); else pickFront(k.slice(1)); };

  /* ── 공유 ── */
  const [copied, setCopied] = useState(false);
  // A·B 를 고르지 않은 장은 공유하지 않는다(팀원 화면에서 빠진다) — 확정한 장이 하나라도 있으면 그 장만 공유
  const abLeft = slides.filter(abWait);
  const shareN = slides.length - abLeft.filter((s) => !mock(s.n)).length;   // 팀원에게 보일 장 수
  const share = async () => {
    if (!shareN) { setErr("A·B 배치를 확정한 장이 없어 공유할 수 없습니다 — 한 장 이상 A 또는 B 를 확정해 주세요."); return; }
    try {
      if (!job.shared) onChange(await api<Job>(`/jobs/${job.id}`, { method: "PATCH", body: JSON.stringify({ shared: 1 }) }));
      await navigator.clipboard.writeText(location.href);
      setCopied(true); setTimeout(() => setCopied(false), 2500);
    } catch (e) { setErr((e as Error).message); }
  };
  const unshare = async () => { try { onChange(await api<Job>(`/jobs/${job.id}`, { method: "PATCH", body: JSON.stringify({ shared: false }) })); } catch (e) { setErr((e as Error).message); } };

  /* ── 기획 수정 자동 저장 ── */
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
  useEffect(() => {   // 와이어프레임 자동 저장 — 끄는 중에는 0.7초마다 한 번
    if (!mine) return;
    const ns = Object.keys(wireEd).map(Number);
    if (!ns.length) return;
    setSaved("saving");
    const sent = { ...wireEd };
    const t = setTimeout(async () => {
      try {
        onChange(await api<Job>(`/jobs/${job.id}`, { method: "PATCH", body: JSON.stringify({ slides: ns.map((n) => ({ n, wire: sent[n] })) }) }));
        setWireEd((w) => { const x = { ...w }; for (const n of ns) if (x[n] === sent[n]) delete x[n]; return x; });
        setSaved("saved");
      } catch { setSaved("error"); }
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wireEd]);
  const dirtyKey = JSON.stringify(slides.map((s) => FIELDS.map((k) => (ed(s.n)[k] !== undefined && ed(s.n)[k] !== (s[k] ?? "") ? ed(s.n)[k] : null))));
  useEffect(() => {
    if (!mine) return;
    const body = slides.filter(changed).map((s) => {
      const o: Record<string, unknown> = { n: s.n };
      for (const k of FIELDS) if (ed(s.n)[k] !== undefined && ed(s.n)[k] !== (s[k] ?? "")) o[k] = ed(s.n)[k];
      return o;
    });
    if (!body.length || busy) return;
    setSaved("saving");
    const t = setTimeout(async () => {
      try {
        onChange(await api<Job>(`/jobs/${job.id}`, { method: "PATCH", body: JSON.stringify({ slides: body }) }));
        // 보낸 값과 같은 칸만 비운다 — 저장하는 사이에 더 친 글자는 남겨 다음 저장에 실린다
        setEdits((e) => {
          const next = { ...e };
          for (const o of body) {
            const n = o.n as number, v = { ...next[n] };
            for (const k of FIELDS) if (k in o && v[k] === o[k]) delete v[k];
            next[n] = v;
          }
          return next;
        });
        setSaved("saved");
      } catch { setSaved("error"); }
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirtyKey]);

  // 서버에 보낼 장별 수정·의견
  const payload = () => slides.filter((s) => changed(s) || ed(s.n).feedback || ed(s.n).pick).map((s) => {
    const o: Record<string, unknown> = { n: s.n, feedback: ed(s.n).feedback ?? "" };
    for (const k of FIELDS) if (ed(s.n)[k] !== undefined && ed(s.n)[k] !== (s[k] ?? "")) o[k] = ed(s.n)[k];
    return o;
  });
  const run = async (label: string, f: () => Promise<Job>) => {
    setBusy(label); setErr(null);
    try { onChange(await f()); setEdits({}); } catch (e) { setErr((e as Error).message); }
    setBusy(null);
  };
  const build = () => run("build", () => api<Job>(`/jobs/${job.id}/approve`, { method: "POST", body: JSON.stringify({ mode: "build", feedback: fb.trim(), slides: payload(), front }) }));
  const make = async () => {
    const und = picked.filter(abWait);
    if (und.length && !(await ask(`${und.map((s) => s.n).join(", ")}쪽은 A·B 배치 중 아직 고르지 않았습니다.
고르지 않은 장은 A안으로 시안을 만듭니다.`, { title: "A안으로 만들까요?", ok: "A안으로 만들기" }))) return;
    return makeRun();
  };
  const makeRun = () => run("redo", async () => {
    const b = budget.trim() === "" ? null : Number(budget);
    if (isAdmin && b !== job.budget_usd) await api(`/jobs/${job.id}`, { method: "PATCH", body: JSON.stringify({ budget_usd: b }) });
    const r = await api<Job>(`/jobs/${job.id}/approve`, { method: "POST", body: JSON.stringify({ mode: "redo", feedback: fb.trim(), slides: payload(), redo: picked.map((s) => s.n),
      front_redo: fpicked.map((f) => f.id), front_feedback: Object.fromEntries(fpicked.filter((f) => ffb[f.id]?.trim()).map((f) => [f.id, ffb[f.id]!.trim()])) }) });
    setFpick({}); setFfb({});
    return r;
  });

  /** 기획을 마크다운으로 — 화면에서 고친 내용 반영 */
  const downloadMd = () => {
    const md = [`# ${job.plan?.title ?? job.title}`, "", `> powerDeck 기획 · ${slides.length}장 · ${new Date().toLocaleDateString("ko-KR")}`, ""];
    for (const s of slides) {
      md.push(`## ${s.n}. ${val(s, "title")}`, "");
      md.push(`- **장**: ${s.section ?? "—"}  ·  **유형**: ${s.type ?? "—"}  ·  **분위기**: ${s.mood ?? "—"}${s.ref?.length ? `  ·  **참고**: ${s.ref.join(", ")}` : ""}`);
      if (val(s, "message")) md.push(`- **전달할 것**: ${val(s, "message")}`);
      if (val(s, "scene")) md.push(`- **장면**: ${val(s, "scene")}`);
      if (val(s, "layout")) md.push(`- **구성**: ${val(s, "layout")}`);
      if (val(s, "keyword")) md.push(`- **강조**: ${val(s, "keyword")}`);
      if (s.device) md.push(`- **장치**: ${s.device}`);
      const wb = wireOf(s);
      if (wb.length) md.push("", "### 배치", "", ...wb.map((b) => `- ${b.k} ${b.x},${b.y},${b.w},${b.h} | ${b.t.replace(/\|/g, "/")}${b.d ? ` | ${b.d.split("\n").join(" / ")}` : ""}`));
      md.push("", "### 내용", "", val(s, "content"), "");
      const cs = comments.filter((c) => c.slide === s.n && !c.resolved);
      if (cs.length) md.push("### 의견", "", ...cs.map((c) => `- (${who(c.email)}) ${c.body}`), "");
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([md.join("\n")], { type: "text/markdown;charset=utf-8" }));
    a.download = `${job.title.replace(/[\\/:*?"<>|]/g, "_")}_기획.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /* ── 같이 쓰는 조각 — 주인 화면과 공유 화면이 같은 것을 그린다 ── */
  const m = cur && mock(cur.n);
  const showWire = !m || tab === "wire";
  const ab = !!cur && !fcur && showWire && (abWait(cur) || abAnim?.n === cur.n);   // A·B 고르기 화면(확정 연출 중 포함)
  const wEdit = !!cur && !fcur && showWire && !ab && mine && wmode === "edit";
  const imgSrc = (name: string, ts?: number) => fileUrl(job.id, "mockup", name) + `&v=${ts ?? 0}`;
  const roomY = mine ? 260 : 190;   // 장표 위아래로 쓰는 높이(머리줄·도구줄·여백) — 장표가 화면 높이를 넘지 않게

  /** 목록·한눈에 보기의 작은 그림 — 시안이 있으면 시안, 없으면 와이어프레임 */
  const thumb = (s: PlanSlide) => {
    const f = mock(s.n);
    return f ? <img src={imgSrc(f.name, f.ts)} alt="" loading="lazy" className="block w-full aspect-[3/2] object-cover" />
      : wireOf(s).length ? <WireCanvas blocks={wireOf(s)} title={val(s, "title")} keyword={val(s, "keyword")} section={s.section} accent={accent} />
      : <div className="w-full aspect-[3/2] flex items-center justify-center px-2 text-center"><span className="text-[12px] font-semibold text-ink2 leading-[1.35] line-clamp-3">{clean(val(s, "title"))}</span></div>;
  };
  const item = (on: boolean) => cn("relative rounded-md p-1.5 cursor-pointer", on ? "bg-white shadow-[0_0_0_1.5px_var(--color-point)]" : "hover:bg-bar");

  /** 왼쪽 — 장 목록. 주인은 체크로 시안 만들 장을 고르고, 장마다 열린 의견 개수가 붙는다 */
  const list = (
    <div className="pd-keep-scroll flex-1 min-h-0 overflow-y-auto scroll-thin p-2.5 flex flex-col gap-2.5">
      {owner && (
        <div className="grid grid-cols-4 max-xl:grid-cols-2 gap-1 px-0.5" title="장표를 만들 때 함께 넣습니다. 간지는 장(章)이 둘 이상일 때만 들어갑니다. 만든 뒤에도 '글 고치기'에서 넣고 뺄 수 있습니다.">
          {([["cover", "표지"], ["toc", "목차"], ["divider", "간지"], ["ending", "엔딩"]] as const).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={front[k] !== false} title={k === "ending" ? "맨 뒤 감사합니다 · 질의응답 두 장" : undefined} onClick={() => setFront({ ...front, [k]: front[k] === false })}
              className={cn("pp-hit h-7 rounded-md border bg-white text-[12.5px] font-semibold whitespace-nowrap inline-flex items-center justify-center gap-0.5", front[k] !== false ? "border-orange-line text-orange-d" : "border-line text-dim")}>
              <Ms name={front[k] !== false ? "check_box" : "check_box_outline_blank"} size={16} />{l}
            </button>
          ))}
        </div>
      )}
      {rows.map((r) => {
        if (r.k === "g") return (
          // 장(章) 구분선 — 사업 이해 · 추진 전략 … 덩어리마다
          <div key={`g${r.no}`} className={cn("flex items-center gap-1.5 px-1 pt-2 rounded-md", dropAt && "ch" in dropAt && dropAt.ch === r.name && "bg-orange-soft")}
            onDragOver={dragN != null ? (e) => { e.preventDefault(); setDropAt({ ch: r.name }); } : undefined} onDrop={dragN != null ? (e) => { e.preventDefault(); dropTo(); } : undefined}>
            <span className="text-[12px] font-black font-mono" style={{ color: accent }}>{String(r.no).padStart(2, "0")}</span>
            <span className="text-[13px] font-bold text-ink2 truncate min-w-0">{r.name}</span>
            <span className="text-[12px] text-dim whitespace-nowrap flex-none">{r.n}장</span>
            <span className="flex-1 h-px bg-line min-w-[12px]" />
          </div>
        );
        if (r.k === "f") {
          const f = r.f, fm = fmock(f.id), on = !!fpick[f.id];
          return (
            <div key={`f${f.id}`} role="button" onClick={() => pickFront(f.id)} className={item(fsel === f.id)}>
              <div className="relative rounded-md border border-line overflow-hidden bg-white">
                {fm ? <img src={imgSrc(fm.name, fm.ts)} alt="" loading="lazy" className="block w-full aspect-[3/2] object-cover" /> : <FrontWire f={frontView(f)} lang={lang} />}
              </div>
              <div className="flex items-center gap-1.5 text-[12.5px] mt-1.5 px-0.5">
                {owner && <Check size={18} on={on} title={fm ? `${f.label} 시안 다시 만들기` : `${f.label} 시안 만들기`} onClick={() => setFpick({ ...fpick, [f.id]: !on })} />}
                <span className="text-dim whitespace-nowrap flex-none mr-auto">{f.label}{f.status === "failed" && <b className="font-semibold text-[var(--color-warn)]"> 실패</b>}</span>
                {f.name && <span className="min-w-0 truncate font-semibold text-ink3">{f.name}</span>}
              </div>
            </div>
          );
        }
        const s = r.s, f = mock(s.n), on = !!ed(s.n).pick, nc = open.filter((c) => c.slide === s.n).length;
        const mark = dropAt && "n" in dropAt && dropAt.n === s.n ? (dropAt.after ? "after" : "before") : null;
        return (
          <div key={s.n} role="button" onClick={() => pickSlide(s.n)} className={cn(item(sel === s.n && !fcur), "group/sl", dragN === s.n && "opacity-40")}
            draggable={canMove} title={canMove ? "끌어서 순서를 바꿉니다 · 다른 장(章) 구분선에 놓으면 그 장으로" : undefined}
            onDragStart={canMove ? (e) => { setDragN(s.n); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(s.n)); } : undefined}
            onDragEnd={() => { setDragN(null); setDropAt(null); }} onContextMenu={(e) => cmenu.open(e, slideMenu(s))}
            onDragOver={dragN != null ? (e) => { e.preventDefault(); const r0 = e.currentTarget.getBoundingClientRect(); setDropAt({ n: s.n, after: e.clientY > r0.top + r0.height / 2 }); } : undefined}
            onDrop={dragN != null ? (e) => { e.preventDefault(); dropTo(); } : undefined}>
            {mark && <span className={cn("absolute left-1 right-1 h-[3px] rounded-full bg-orange z-10", mark === "before" ? "-top-[6px]" : "-bottom-[6px]")} />}
            <div className="relative rounded-md border border-line overflow-hidden bg-white">
              {thumb(s)}
              {canMove && <button type="button" title="이 장 지우기" aria-label={`${s.n}쪽 지우기`} onClick={(e) => { e.stopPropagation(); removeSlide(s); }}
                className="pp-hit absolute top-1.5 left-1.5 w-7 h-7 [@media(hover:none)]:opacity-100 rounded-md bg-white/95 border border-line text-dim hover:text-[var(--color-warn)] hover:border-[var(--color-warn-line)] grid place-items-center opacity-0 group-hover/sl:opacity-100 focus:opacity-100"><Ms name="delete" size={17} /></button>}
              {abWait(s) && <span className="absolute bottom-1.5 left-1.5 h-[18px] px-1.5 rounded-md bg-ink text-white text-[11.5px] font-bold inline-flex items-center" title="A·B 배치 중 아직 고르지 않음">A·B</span>}
              {nc > 0 && <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-[5px] rounded-md bg-orange text-white text-[12px] font-bold inline-flex items-center justify-center" title={`열린 의견 ${nc}개`}>{nc}</span>}
            </div>
            <div className="flex items-center gap-1.5 text-[12.5px] mt-1.5 px-0.5">
              {owner && <Check size={18} on={on} title={f ? "이 장 시안 다시 만들기" : "시안 만들 장으로 선택"} onClick={() => setEd(s.n, { pick: !on })} />}
              <span className="text-dim whitespace-nowrap flex-none mr-auto">{s.n}쪽{s.status === "failed" && <b className="font-semibold text-[var(--color-warn)]"> 실패</b>}{changed(s) && <b className="font-semibold text-orange-d"> · 수정 중</b>}</span>
              <span className="min-w-0 truncate font-semibold text-ink3">{(s.chapter && s.section?.startsWith(s.chapter) ? s.section.slice(s.chapter.length).replace(/^[\s·]+/, "") : (s.section ?? "").split(" · ").slice(1).join(" · ").trim()) || s.section}</span>
            </div>
          </div>
        );
      })}
    </div>
  );

  /** 가운데 장표 — 와이어프레임(주인이 '배치 고치기'면 상자를 고친다) 또는 시안 이미지. 그 위에 핀 */
  // A·B 고르기 — 두 안을 같은 자리에 겹쳐 놓고 가운데 손잡이를 끌어 비교한다(나란히 두면 작아서 안 읽힌다). 위에 A 확정·B 확정
  const abStage = ab && cur && (
    <div className="w-full flex flex-col gap-2.5" style={{ maxWidth: `max(520px, calc((100vh - ${roomY + 44}px) * 1.5))` }}>
      <div className="flex items-center gap-2">
        {mine && <button className={cn("btn-next !h-9 !px-4", abAnim && abAnim.p !== "a" && "opacity-40")} disabled={!!abAnim} onClick={() => pickAb(cur, "a")}><Ms name="check_circle" size={18} />A 확정</button>}
        <span className="flex-1 min-w-0 text-center text-[13px] text-dim truncate">{abAnim ? `${abAnim.p.toUpperCase()}안으로 확정했습니다` : "가운데 손잡이를 끌어 A·B 를 비교하세요 (좌우 방향키도 됩니다)"}</span>
        {mine && <button className={cn("btn-next !h-9 !px-4", abAnim && abAnim.p !== "b" && "opacity-40")} disabled={!!abAnim} onClick={() => pickAb(cur, "b")}><Ms name="check_circle" size={18} />B 확정</button>}
      </div>
      <div ref={abBox} className={cn("relative w-full aspect-[3/2] overflow-hidden select-none touch-none ", abAnim ? "cursor-default" : "cursor-ew-resize", SLIDE)}
        tabIndex={0} role="slider" aria-label="A·B 와이어프레임 비교" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(abX)}
        onKeyDown={(e) => {
          const st = e.shiftKey ? 10 : 2;
          if (e.key === "ArrowLeft") { e.preventDefault(); setAbX((v) => Math.max(0, v - st)); }
          else if (e.key === "ArrowRight") { e.preventDefault(); setAbX((v) => Math.min(100, v + st)); }
          else if (e.key === "Home") { e.preventDefault(); setAbX(0); }
          else if (e.key === "End") { e.preventDefault(); setAbX(100); }
        }}
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); abDrag(e.clientX); }}
        onPointerMove={(e) => e.buttons && abDrag(e.clientX)}>
        {abAnim ? <>
          {/* 확정 연출 — 고른 안이 바닥에 온전히, 고르지 않은 안이 위에서 회색으로 바래며 사라진다 */}
          <div className="absolute inset-0 pointer-events-none"><WireCanvas blocks={cur.wire_alt![abAnim.p]} title={val(cur, "title")} keyword={val(cur, "keyword")} section={cur.section} accent={accent} /></div>
          <div className="absolute inset-0 pointer-events-none bg-white animate-[pd-abfade_1s_ease-in_forwards]">
            <WireCanvas blocks={cur.wire_alt![abAnim.p === "a" ? "b" : "a"]} title={val(cur, "title")} keyword={val(cur, "keyword")} section={cur.section} accent={accent} />
          </div>
        </> : <>
          <div className="absolute inset-0 pointer-events-none"><WireCanvas blocks={cur.wire_alt!.b} title={val(cur, "title")} keyword={val(cur, "keyword")} section={cur.section} accent={accent} /></div>
          <div className="absolute inset-0 pointer-events-none bg-white" style={{ clipPath: `inset(0 ${100 - abX}% 0 0)` }}>
            <WireCanvas blocks={cur.wire_alt!.a} title={val(cur, "title")} keyword={val(cur, "keyword")} section={cur.section} accent={accent} />
          </div>
          <div className="absolute inset-y-0 pointer-events-none" style={{ left: `${abX}%` }}>
            <div className="absolute inset-y-0 -ml-px w-0.5 bg-orange" />
            <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-7 px-1.5 rounded-full bg-white border-2 border-orange flex items-center gap-0.5 text-[12px] font-black text-ink">
              A<Ms name="unfold_more" size={17} className="text-orange-d" style={{ transform: "rotate(90deg)" }} />B
            </div>
          </div>
        </>}
        <GenStamp at={cur.wire_at} utc />
      </div>
    </div>
  );
  const stage = !cur ? null : ab ? abStage : (m || mine || wireOf(cur).length > 0) ? (
    <div ref={imgBox} onClick={wEdit ? undefined : clickImage} className={cn("relative select-none", showWire ? "block w-full" : "inline-block max-w-full", !wEdit && "cursor-crosshair")}
      style={showWire ? { maxWidth: `max(520px, calc((100vh - ${roomY}px) * 1.5))` } : undefined}>
      {showWire
        ? <WireCanvas blocks={wireOf(cur)} title={val(cur, "title")} keyword={val(cur, "keyword")} section={cur.section} accent={accent}
            onTitle={wEdit ? (t) => setEd(cur.n, { title: t }) : undefined} onKeyword={wEdit ? (k) => setEd(cur.n, { keyword: k }) : undefined} className={SLIDE}
            sel={wEdit ? wsel : []} onSel={setWsel} onChange={wEdit ? (b) => setWire(cur.n, b) : undefined} />
        : <img src={imgSrc(m!.name, m!.ts)} alt={`${cur.n}쪽 시안`} draggable={false} className={cn("block max-w-full object-contain bg-white", SLIDE)} style={{ maxHeight: `max(346px, calc(100vh - ${roomY}px))` }} />}
      {showWire ? <GenStamp at={cur.wire_at} utc /> : <GenStamp at={m!.ts} />}
      {/* 와이어 일치 — 엔진이 와이어 스케치와 시안을 맞대 본 점수(2026-10-18). 70 밑이면 한 번 더 그린 뒤 나은 쪽 */}
      {!showWire && typeof cur.mockup_fit === "number" && (
        <span className="absolute top-1.5 left-1.5 z-[5] pointer-events-none rounded-md bg-ink/70 px-1.5 py-[1px] text-[11.5px] font-semibold text-white whitespace-nowrap">
          와이어 일치 {cur.mockup_fit}{cur.mockup_fit < 70 ? " · 확인" : ""}
        </span>
      )}
      <PinLayer p={pins} slide={sel} />
    </div>
  ) : <div className={cn("w-full max-w-[720px] aspect-[3/2] bg-white grid place-items-center text-[13.5px] text-faint", SLIDE)}>아직 시안·와이어프레임이 없습니다</div>;

  /** 표지·목차·간지 시안 — 의견 핀은 없다 */
  const frontStage = fcur && (() => {
    const fm = fmock(fcur.id);
    return fm ? <div className="relative inline-block max-w-full"><img src={imgSrc(fm.name, fm.ts)} alt={`${fcur.label} 시안`} draggable={false} className={cn("block max-w-full object-contain bg-white", SLIDE)} style={{ maxHeight: `max(346px, calc(100vh - ${roomY}px))` }} /><GenStamp at={fm.ts} /></div>
      : <div className="w-full flex flex-col gap-2" style={{ maxWidth: `max(520px, calc((100vh - ${roomY}px) * 1.5))` }}>
          <FrontWire f={frontView(fcur)} lang={lang} className={SLIDE} onEdit={mine ? editFront : undefined} />
          <span className="text-[13px] text-dim text-center">{mine ? "글을 두 번 눌러 그 자리에서 고칩니다(자동 저장). 왼쪽에서 체크하고 ‘시안 만들기’를 누르면 이 구성으로 시안을 만듭니다 — 없으면 기본 모양으로 넣습니다." : "시안이 없으면 기본 모양으로 들어갑니다."}</span>
        </div>;
  })();

  const nav = (
    <div className="flex items-center gap-1 flex-none">
      <button className={NAV} title="이전 장" aria-label="이전 장" disabled={at <= 0} onClick={() => step(-1)}><Ms name="chevron_left" size={20} /></button>
      <span className="text-[13.5px] text-ink3 min-w-[48px] text-center font-mono whitespace-nowrap">{Math.max(1, at + 1)} / {seq.length}</span>
      <button className={NAV} title="다음 장" aria-label="다음 장" disabled={at >= seq.length - 1} onClick={() => step(1)}><Ms name="chevron_right" size={20} /></button>
    </div>
  );
  const strip = (err || (owner && over)) && (
    <div className="flex-none flex items-center gap-2.5 min-h-[40px] px-6 py-1 border-b border-[var(--color-warn-line)] bg-[var(--color-warn-soft)] text-[13px] text-[var(--color-warn)]">
      <Ms name="error" size={18} />
      {owner && over && <span className="font-semibold whitespace-nowrap flex-none">비용 한도에 도달했습니다{isAdmin && <span className="font-mono font-medium"> · 지금까지 {usd(spent, 3)} / 한도 {usd(job.budget_usd)}</span>}</span>}
      {owner && over && isAdmin && (
        <label className="flex items-center gap-1.5 flex-none whitespace-nowrap text-ink2" title="이 작업의 한도 올리기 (관리자) — ‘시안 만들기’를 누를 때 적용됩니다">
          한도 올리기 (USD $)<input className="field !h-8 !w-[96px] !px-2.5 font-mono !text-[13px]" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
        </label>
      )}
      {err && <span className="truncate min-w-0" title={err}>{err}</span>}
      {err && <button className="pp-hit btn-icon danger ml-auto !w-7 !h-7" title="닫기" aria-label="닫기" onClick={() => setErr(null)}><Ms name="close" size={18} /></button>}
    </div>
  );
  const nDone = comments.length - open.length;
  const doneToggle = (showDone || nDone > 0) ? (
    <button className="ml-auto flex-none h-[30px] px-2 rounded-md text-[13px] font-semibold text-dim whitespace-nowrap hover:bg-side" onClick={() => setShowDone((v) => !v)}>
      {showDone ? "닫은 것 숨기기" : `닫은 것 보기 ${nDone}`}
    </button>
  ) : null;
  const countBadge = <span className="min-w-[20px] h-5 px-1.5 rounded-md bg-orange text-white text-[12px] font-bold inline-flex items-center justify-center flex-none">{open.length}</span>;

  /* ── 공유받은 시안 검토 — 사이드바 없이 보기·의견만 ── */
  if (!mine) return (
    <>
      <GuestHeader job={job} me={me} people={authors} onLogout={onLogout} />
      {strip}
      <div className="pd-cols flex-1 min-h-0 grid" style={{ gridTemplateColumns: "200px minmax(0,1fr) 372px" }}>
        <div className="border-r border-line bg-panel flex flex-col min-h-0">
          <div className="head sm panel !px-3.5 !gap-1.5 !bg-transparent"><span className="font-bold">{slides.length}장</span><span className="text-[13px] text-dim">의견 {open.length}개</span></div>
          {list}
        </div>
        <div className="flex flex-col min-h-0 bg-side">
          <div className="head sm panel !gap-2.5">
            <span className="inline-flex items-center gap-1.5 text-[13.5px] text-ink2 truncate min-w-0 flex-1">
              <Ms name="ads_click" size={18} className="text-orange" />
              <span className="truncate">{fcur ? `${fcur.label} 시안 — 의견은 본문 장에 남길 수 있습니다` : "고칠 곳을 누르면 그 자리에 의견이 남습니다"}</span>
            </span>
            {m && !fcur && <Seg sm value={tab} onChange={setTab} options={[["wire", "와이어프레임"], ["mock", "시안"]] as const} />}
            {nav}
          </div>
          <div className="flex-1 min-h-0 overflow-auto scroll-thin p-6 flex flex-col items-center gap-3.5">
            {fcur ? frontStage : stage}
            {cur && !fcur && (
              // 디자인에는 없지만 지금 화면이 보여 주던 것 — 이 장의 기획 글(읽기만)
              <div className="w-full bg-white border border-line rounded-md" style={{ maxWidth: `max(520px, calc((100vh - ${roomY}px) * 1.5))` }}>
                <button className="w-full h-11 px-4 flex items-center gap-2 text-left" aria-expanded={gplan} onClick={() => setGplan((v) => !v)}>
                  <span className="font-bold whitespace-nowrap flex-none">{cur.n}쪽 기획</span>
                  <span className="text-[13px] text-dim truncate min-w-0">{[cur.section, cur.mood ?? cur.type].filter(Boolean).join(" · ")}</span>
                  <Ms name={gplan ? "expand_less" : "expand_more"} size={20} className="ml-auto text-dim" />
                </button>
                {gplan && (
                  <div className="px-4 pb-4 flex flex-col gap-3 border-t border-line-soft pt-3">
                    {([["키메시지", "title"], ["전달할 것", "message"], ["장면 — 그림으로 보여줄 것", "scene"], ["구성 — 칸 나눔 · 흐름", "layout"], ["내용 — 장표에 들어갈 글", "content"]] as const).map(([l, k]) => val(cur, k) && (
                      <div key={k} className="flex flex-col gap-1">
                        <span className="text-[13px] font-semibold text-dim">{l}</span>
                        <div className={cn("leading-[1.6] whitespace-pre-wrap break-words", k === "title" ? "text-[16px] font-bold" : k === "content" ? "font-mono text-[13.5px] text-ink3" : "text-[14px] text-ink3")}>{val(cur, k)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <aside className="border-l border-line flex flex-col min-h-0 bg-white">
          <div className="head sm panel !px-[18px] !gap-2"><span className="font-bold flex-none">의견</span>{countBadge}{doneToggle}</div>
          <div className="flex-none px-[18px] py-3 border-b border-line-soft text-[13px] text-dim leading-[1.55]">남긴 의견은 작업 주인에게 ‘검토 대기’로 전달되고, 주인이 반영하기를 누르면 장표에 반영됩니다.</div>
          <div className="flex-1 overflow-y-auto scroll-thin">
            <CommentList p={pins} list={listed} onGo={goComment} empty={<>아직 남긴 의견이 없습니다.<br />가운데 장표에서 고칠 곳을 누르세요.</>} />
          </div>
          <div className="flex-none border-t border-line px-[18px] py-3.5 bg-panel text-[12.5px] text-dim leading-[1.45]">공유받은 시안은 의견만 남길 수 있습니다. 파일 받기와 수정은 작업 주인만 할 수 있습니다.</div>
        </aside>
      </div>
    </>
  );

  /* ── 작업 주인 화면 ── */
  const hint = overview ? "장을 누르면 그 장을 열고, 체크로 시안 만들 장을 고릅니다"
    : fcur ? `${fcur.label} — 글(사업명·장 이름·절 목록)은 기획의 장·절에서 가져옵니다`
    : ab ? "같은 기획으로 짠 두 배치입니다 — 시안에 쓸 안을 확정하세요. 확정한 뒤에 상자를 고칠 수 있습니다"
    : wEdit ? "상자를 두 번 눌러 글을 고치고, 끌어서 옮깁니다 · 자동 저장"
    : showWire ? "와이어프레임에서 고칠 곳을 누르면 그 자리에 의견이 남습니다"
    : "시안에서 고칠 곳을 누르면 그 자리에 의견이 남습니다 — 장표를 만들 때 반영합니다";
  const ctx = job.files?.mockup?.find((f) => f.name === "context.md");
  // 본문 시안을 만들 때 아직 없는 표지·목차·간지 시안도 엔진이 함께 만든다(따로 고르지 않아도)
  const fauto = picked.length ? fronts.filter((f) => !fmock(f.id) && !fpick[f.id]).length : 0;
  const costNote = isAdmin && est != null && nPick ? ` · ≈ ${usd(est * (nPick + fauto), 3)}` : "";
  const actions = (
    <>
      <button className="btn-danger" title="그만두기" disabled={!!busy} onClick={() => run("cancel", () => api<Job>(`/jobs/${job.id}/cancel`, { method: "POST" }))}><Ms name="close" size={20} />그만두기</button>
      {job.status === "review" && (job.phase ?? "plan") === "plan" && (
        <button className="btn-back" disabled={!!busy} title="기획을 지우고 내용 입력으로 — 자료를 더하거나 뺀 뒤 기획을 처음부터 다시 짭니다"
          onClick={async () => {
            if (!(await ask("지금 기획·와이어·시안과 고친 내용은 지워집니다.\n자료를 더하거나 뺀 뒤 「검토 시작」을 누르면 기획을 처음부터 다시 짭니다.", { title: "자료를 고쳐 다시 기획할까요?", ok: "내용 입력으로", danger: true }))) return;
            run("back", () => api<Job>(`/jobs/${job.id}/back`, { method: "POST" }));
          }}><Ms name="undo" size={19} />자료 고쳐 다시 기획</button>
      )}
      <span className="vsep" />
      {/* 시안이 생기면 버튼이 둘(다시 만들기 · 장표 만들기)이라 받기 버튼은 아이콘만 남긴다 */}
      <button className={cn("btn-back", have > 0 && "!w-[38px] !px-0")} onClick={downloadMd} title="지금 화면의 기획(고친 내용·의견 포함)을 마크다운 파일로" aria-label="기획 (.md) 받기"><Ms name="download" size={have ? 19 : 17} />{!have && "기획 (.md)"}</button>
      {ctx && <a className="btn-back !w-[38px] !px-0" href={fileUrl(job.id, "mockup", "context.md", true)} title="사업 요약 (.md) 받기 — 배경 자료에서 뽑은 사업 요약" aria-label="사업 요약 (.md) 받기"><Ms name="summarize" size={19} /></a>}
      {nPick === 0 ? <span className="pd-hint text-[13px] text-dim whitespace-nowrap">왼쪽에서 시안 만들 장을 체크하세요</span> :
      <button className={have ? "btn-back" : "btn-next"} disabled={!!busy} onClick={make}
        title={nPick ? `체크한 장의 수정·의견(핀 포함)을 반영해 시안을 만듭니다${costNote}` : "왼쪽 목록에서 시안을 만들 장을 체크하세요"}>
        <Ms name="auto_awesome" size={18} className="xl:hidden" />{busy === "redo" ? "넘기는 중…" : <><span className="max-xl:hidden">{`선택한 ${nPick}장${fauto ? ` + 표지·목차·간지 ${fauto}장` : ""} 시안 만들기${have ? "" : costNote}`}</span><span className="xl:hidden">{`시안 ${nPick + fauto}장`}</span></>}
      </button>}
      {have > 0 && (
        <button className="btn-next" disabled={!!busy} onClick={async () => { if (!pending.length || await ask(`검토 대기 의견 ${pending.length}개는 장표에 반영되지 않습니다.\n반영하려면 의견을 열어 '장표에 반영'을 눌러 주세요.`, { title: "그대로 장표를 만들까요?", ok: "그대로 만들기" })) build(); }}
          title={`반영 확정 ${accepted.length}개${pending.length ? ` · 검토 대기 ${pending.length}개는 반영 안 됨` : ""}`}>
          <Ms name="slideshow" size={18} className="xl:hidden" />{busy === "build" ? "넘기는 중…" : <><span className="max-xl:hidden">{missing.length ? `시안 ${have}장으로 장표 만들기` : "확정 — 장표 만들기"}</span><span className="xl:hidden">장표 만들기</span></>}{accepted.length > 0 && <span className="font-semibold opacity-85 max-xl:hidden">· 의견 {accepted.length}개 반영</span>}
        </button>
      )}
    </>
  );

  /** 한눈에 보기 — 제목만 읽기 줄거리 · 보강 요청 목록 · 장(章)별 묶음 */
  // A·B 와이어 — 어느 안으로 확정했는지, 아직이면 선택 전(카드·캔버스 공통)
  const abBadge = (s: PlanSlide) => !s.wire_alt?.b?.length ? null : s.wire_pick
    ? <span className="absolute top-1.5 left-1.5 px-2 h-6 inline-flex items-center rounded-full bg-[var(--color-ink)] text-white text-[12px] font-bold">{s.wire_pick.toUpperCase()}안 선택</span>
    : <span className="absolute top-1.5 left-1.5 px-2 h-6 inline-flex items-center rounded-full bg-point text-white text-[12px] font-bold">A·B 선택 전</span>;
  const overviewBody = () => {
    // 보강 요청 목록 — 기획의 '※ 보강 필요' + 근거 확인. 발주기관·팀에 자료를 요청할 목록
    const need = [...(job.plan?.deck_checks ?? []).map((t) => ({ n: 0, t })), ...slides.flatMap((s) => [
      ...val(s, "content").split("\n").filter((l) => l.includes("보강 필요")).map((l) => {
        if (l.includes("|")) {   // 표의 한 줄 — '항목 · 항목: 보강 필요' 꼴로
          const cells = l.split("|").map((c) => c.replace(/\*\*/g, "").trim()).filter(Boolean);
          const known = cells.filter((c) => !c.includes("보강 필요")), need = cells.find((c) => c.includes("보강 필요")) ?? "";
          return { n: s.n, t: `${known.join(" · ")} — ${need.replace(/^[\s*\-※]+/, "").replace(/^보강 필요:?\s*/, "") || "보강 필요"}` };
        }
        return { n: s.n, t: l.replace(/\*\*/g, "").replace(/^[\s*\-※]+/, "").trim() };
      }),
      ...(s.checks ?? []).map((t) => ({ n: s.n, t })),
    ])];
    const groups = Object.entries(slides.reduce<Record<string, PlanSlide[]>>((g, s) => { const k = (s.chapter ?? (s.section ?? "").split(" · ")[0])!.trim() || "본문"; (g[k] ??= []).push(s); return g; }, {}));
    return (
      <div className={cn("flex flex-col gap-5", ovMode === "canvas" && "min-h-full")}>
        {/* 제목만 읽기 · 보강 요청 목록 — 내용만큼 늘어나고(세로 스크롤은 바깥 하나, 2026-10-13 카드를 뚫고 나가던 것) 펼친 둘은 같은 높이, 접으면 머리줄만 */}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px] items-stretch">
          <div className={cn("rounded-md bg-white border border-line flex flex-col min-h-0 self-start", ovOpen.t && "self-stretch")}>
            <button type="button" aria-expanded={ovOpen.t} onClick={() => setOvOpen((o) => ({ ...o, t: !o.t }))}
              className="flex-none w-full flex items-baseline gap-2 min-w-0 px-5 py-3 text-left hover:bg-panel rounded-md">
              <span className="font-bold text-orange-d whitespace-nowrap flex-none">제목만 읽기</span>
              <span className="text-[13px] text-dim truncate">장 제목만 차례로 읽어도 이야기가 이어지는지 보세요 · {slides.length}장</span>
              <Ms name={ovOpen.t ? "expand_less" : "expand_more"} size={20} className="ml-auto self-center text-dim flex-none" />
            </button>
            {ovOpen.t && <div className="flex-1 min-h-0 overflow-y-auto scroll-thin px-5 pb-4">
              {job.plan?.core && <div className="text-[14px] font-bold leading-[1.55]">“{job.plan.core}”</div>}
              <ol className="mt-2 flex flex-col gap-1">
                {slides.map((s) => (
                  <li key={s.n} className="flex gap-2 text-[14px] leading-[1.55]">
                    <span className="w-6 flex-none text-right font-mono text-[12.5px] text-dim pt-[2px]">{s.n}</span>
                    <button className="text-left font-semibold text-ink3 hover:text-orange-d" onClick={() => { pickSlide(s.n); setOverview(false); }}>{clean(val(s, "title"))}</button>
                  </li>
                ))}
              </ol>
            </div>}
          </div>
          <div className={cn("rounded-md bg-white border border-line flex flex-col min-h-0 self-start", ovOpen.n && "self-stretch")}>
            <button type="button" aria-expanded={ovOpen.n} onClick={() => setOvOpen((o) => ({ ...o, n: !o.n }))}
              className="flex-none w-full flex items-baseline gap-2 px-5 py-3 text-left hover:bg-panel rounded-md">
              <span className="font-bold text-[var(--color-ink-2)] whitespace-nowrap">보강 요청 목록</span><span className="text-[13px] text-dim">{need.length}건</span>
              <Ms name={ovOpen.n ? "expand_less" : "expand_more"} size={20} className="ml-auto self-center text-dim flex-none" />
            </button>
            {ovOpen.n && (need.length ? (
              <ul className="flex-1 min-h-0 overflow-y-auto scroll-thin px-5 pb-4 flex flex-col gap-1.5">
                {need.map((x, i) => <li key={i} className="text-[13px] text-ink2 leading-[1.5]"><b className="font-semibold text-dim mr-1 whitespace-nowrap">{x.n ? `${x.n}쪽` : "전체"}</b>{x.t}</li>)}
              </ul>
            ) : <div className="px-5 pb-4 text-[13px] text-dim">자료에서 찾지 못한 수치·보강할 곳이 없습니다.</div>)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-bold text-ink2">장표 {slides.length}장</span>
          <Seg className="ml-auto" value={ovMode} onChange={setOvMode} options={[["card", "카드"], ["canvas", "캔버스"]] as const} />
        </div>
        {ovMode === "canvas" ? (
          <OverviewCanvas jobId={job.id} groups={groups} sel={fcur ? null : sel} title={(x) => clean(val(x, "title"))} thumb={thumb} badge={abBadge}
            onOpen={(n) => { pickSlide(n); setOverview(false); }} onReorder={canMove ? applyOrder : undefined} />
        ) : groups.map(([ch, ss]) => (
          <div key={ch}>
            <div className="text-[14px] font-bold text-ink2 mb-2">{ch} <span className="text-dim font-medium">· {ss.length}장</span></div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(240px,100%),1fr))] gap-4">
              {ss.map((s) => {
                const on = !!ed(s.n).pick;
                return (
                  <div key={s.n} role="button" onClick={() => { pickSlide(s.n); setOverview(false); }}
                    className={cn("cursor-pointer flex flex-col gap-2 p-2 rounded-md bg-white hover:shadow-[0_0_0_1.5px_var(--color-point)]", sel === s.n && !fcur ? "shadow-[0_0_0_1.5px_var(--color-point)]" : "shadow-[0_0_0_1px_var(--color-line)]")}>
                    <div className="relative rounded-md border border-line overflow-hidden bg-white">
                      {thumb(s)}
                      {abBadge(s)}
                    </div>
                    <div className="flex flex-col gap-[3px] px-1 pb-1">
                      <span className="flex items-center gap-1.5 text-[12.5px] text-dim min-w-0"><Check size={18} on={on} title={mock(s.n) ? "이 장 시안 다시 만들기" : "시안 만들 장으로 선택"} onClick={() => setEd(s.n, { pick: !on })} /><span className="truncate">{s.n}쪽 · {s.section}</span>{!!s.checks?.length && <span className="ml-auto flex-none whitespace-nowrap font-semibold text-[var(--color-ink-2)]">확인 {s.checks.length}</span>}</span>
                      <span className="font-bold leading-[1.45]">{clean(val(s, "title"))}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      {setOpen && <JobSettingsEdit job={job} onClose={() => setSetOpen(false)} onSaved={onChange} />}
      {cmenu.node}
      <JobHeader job={job} actions={owner ? actions : (
        <span className="text-[13px] text-dim whitespace-nowrap">편집 권한 · 기획 글 · 와이어프레임 · A·B 확정 (시안·장표 만들기는 {job.owner_label ?? job.email?.split("@")[0] ?? "작업 주인"} 님)</span>
      )} onSettings={owner ? () => setSetOpen(true) : undefined}
        meta={<span title={`본문 ${slides.length}장 · 시안 ${have}장 · 와이어프레임만 ${missing.length}장`}>{slides.length}장 · 시안 {have} · 와이어프레임 {missing.length}</span>} />
      {strip}
      <div className="pd-cols pd-mr flex-1 min-h-0 grid" style={{ gridTemplateColumns: `${rail.l ? (narrow ? "168px" : "232px") : "44px"} minmax(0,1fr) ${rail.r ? "372px" : "44px"}` }}>
        {/* 왼쪽 — 장 목록: 체크 = 시안 만들 장 */}
        {rail.l ? <div className="border-r border-line bg-panel flex flex-col h-0 min-h-full">
          <div className="head panel !px-3.5 !gap-1.5 !bg-transparent">
            <span className="font-bold">{slides.length}장</span>
            <span className="text-[13px] text-dim truncate min-w-0 max-xl:hidden">시안 선택 {nPick}장</span>
            {/* 모두 선택 — 체크박스(일부만 골랐으면 가로줄) */}
            <button type="button" role="checkbox" aria-checked={allPicked ? true : nPick ? "mixed" : false} onClick={() => pickAll(!allPicked)}
              className="pp-hit ml-auto flex-none inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink3 hover:text-ink">
              <span className={cn("w-[18px] h-[18px] rounded-md border-[1.5px] grid place-items-center text-white", allPicked || nPick ? "bg-orange border-orange" : "bg-white border-faint")}>
                {allPicked ? <Ms name="check" size={15} /> : nPick ? <Ms name="remove" size={15} /> : null}
              </span><span className="max-xl:hidden">모두 선택</span>
            </button>
            <button type="button" className="pp-hit btn-icon flex-none !w-7 !h-7" title="장 목록 접기" aria-label="장 목록 접기" onClick={() => toggleRail("l")}><Ms name="chevron_left" size={18} /></button>
          </div>
          {list}
          {isAdmin && (
            // 비용(관리자) — 시안 한 장 값과 이 작업이 지금까지 쓴 돈
            <div className="flex-none border-t border-line px-3.5 py-2.5 flex flex-col gap-0.5 text-[12.5px] text-dim">
              <Cost l="시안 한 장" v={est != null ? `≈ ${usd(est, 3)}` : "비용 미정"} />
              {nPick > 0 && est != null && <Cost l={`선택 ${nPick}장${fauto ? ` + 앞장 ${fauto}` : ""}`} v={`≈ ${usd(est * (nPick + fauto), 3)}`} />}
              <Cost l="지금까지" v={usd(spent, 3)} bad={over} />
              {job.budget_usd != null && <Cost l="한도" v={usd(job.budget_usd)} bad={over} />}
            </div>
          )}
        </div> : (
          <div className="pd-fold border-r border-line bg-panel flex flex-col items-center py-3 gap-2 min-h-0">
            <button type="button" className="pp-hit btn-icon flex-none !w-7 !h-7" title="장 목록 펼치기" aria-label="장 목록 펼치기" onClick={() => toggleRail("l")}><Ms name="chevron_right" size={18} /></button>
            <span className="pd-fold-l flex flex-col items-center gap-1 text-[12px] font-bold text-dim" title={`${slides.length}장${nPick > 0 ? ` · ${nPick}장 선택` : ""}`}><Ms name="view_carousel" size={18} /><span>{slides.length}장</span>{nPick > 0 && <span className="text-orange-d">{nPick}✓</span>}</span>
          </div>
        )}

        {/* 가운데 — 도구줄 + 장표(와이어프레임·시안, 핀) + 상자 도구. 오른쪽 클릭 = 이 화면에서 할 일 */}
        <div className="flex flex-col min-h-0 bg-side" onContextMenu={(e) => cmenu.open(e, stageMenu())}>
          <div className="head panel !px-5 !gap-2.5 @container">
            <Seg className={SEG} value={overview ? "overview" : "single"} onChange={(v) => setOverview(v === "overview")} options={[["single", "한 장씩"], ["overview", "한눈에 보기"]] as const} />
            {!overview && !fcur && m && <Seg className={SEG} value={tab} onChange={setTab} options={[["wire", "와이어프레임"], ["mock", "시안"]] as const} />}
            {!overview && !fcur && cur && showWire && !ab && <Seg className={SEG} value={wmode} onChange={(v) => { setWmode(v); if (v === "pin") setRtab("note"); }} options={[["edit", "배치 고치기"], ["pin", "의견 남기기"]] as const} />}
            <span className="flex-1 basis-[160px] min-w-0 text-[13px] text-dim truncate" title={hint}>{hint}</span>
            <button disabled={!!aiWire} title={aiWire && aiWire !== "짜는 중" ? `AI 가 짜는 중… ${aiWire}` : "모든 장의 와이어프레임을 기획 내용으로 AI 가 다시 짭니다"} aria-label="모든 장 AI로 다시 짜기"
              onClick={async () => { if (await ask(`모든 장(${slides.length}장)의 와이어프레임을 기획 내용으로 AI 가 다시 짭니다.\n손으로 고친 배치도 바뀝니다(장마다 되돌리기 가능).`, { title: "모든 장을 다시 짤까요?", ok: "다시 짜기" })) rewire(slides.map((s) => s.n)); }}
              className="h-9 px-3 flex-none border border-line bg-white rounded-md text-[13.5px] font-semibold text-ink3 inline-flex items-center gap-1.5 hover:bg-panel disabled:opacity-60">
              <Ms name="autorenew" size={17} className={aiWire ? "animate-spin" : undefined} />
              <span className={m && !overview && !fcur ? "@max-[820px]:hidden" : "@max-[640px]:hidden"}>{aiWire && aiWire !== "짜는 중" ? `AI 가 짜는 중… ${aiWire}` : aiWire ? "AI 가 짜는 중…" : "모든 장 AI로 다시 짜기"}</span>
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-auto scroll-thin p-5">
            {overview ? overviewBody() : (
              <div className="flex flex-col gap-3.5 w-full">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 min-w-0">
                  {fcur ? <>
                    <span className="text-[14px] font-bold whitespace-nowrap flex-none">{fcur.label}</span>
                    {fcur.name && <span className="text-[13.5px] text-ink2 truncate min-w-0">{fcur.name}</span>}
                    {fcur.status === "failed" && <Failed error={fcur.error} />}
                  </> : cur && <>
                    <span className="text-[14px] font-bold whitespace-nowrap flex-none">{cur.n}쪽</span>
                    <span className="text-[13.5px] text-ink2 truncate min-w-0">{[cur.section, cur.mood ?? cur.type, cur.device && `장치: ${cur.device}`].filter(Boolean).join(" · ")}</span>
                    {cur.ref?.length ? <span className="text-[13px] text-faint whitespace-nowrap flex-none">· 참고 시안 {cur.ref.join(", ")}</span> : null}
                    {cur.status === "failed" && <Failed error={cur.error} />}
                    {cur.wire_pick && !!cur.wire_alt?.b?.length && <>
                      <span className="flex-none h-6 px-2 rounded-md bg-panel border border-line text-[12.5px] font-semibold text-ink3 inline-flex items-center gap-1 whitespace-nowrap"><Ms name="check_circle" size={15} className="text-ok" />{cur.wire_pick.toUpperCase()}안 확정</span>
                      {mine && <button className="pp-hit flex-none h-6 px-2 rounded-md text-[12.5px] font-semibold text-dim hover:text-ink3 hover:bg-panel inline-flex items-center gap-1 whitespace-nowrap" onClick={() => reAb(cur)} title="A·B 두 배치를 다시 나란히 보고 고릅니다"><Ms name="compare" size={15} />A·B 다시 비교</button>}
                    </>}
                  </>}
                  <div className="ml-auto flex items-center gap-1 flex-none">
                    {(() => {   // 시안 내려받기 — 지금 보고 있는 시안 이미지
                      const f = fcur ? fmock(fcur.id) : !showWire ? m : undefined;
                      return f && <a className={NAV} href={fileUrl(job.id, "mockup", f.name, true)} title="시안 내려받기" aria-label="시안 내려받기"><Ms name="download" size={19} /></a>;
                    })()}
                    {nav}
                  </div>
                </div>
                <div className="flex justify-center">{fcur ? frontStage : stage}</div>
                {/* 이 장의 관계 판단 — AI 가 어떤 관계로 보고 종류·배치를 골랐는지(2026-10-18). 다르면 상자 종류를 바꾸거나 AI 로 다시 짠다 */}
                {wEdit && cur?.wire_why && (
                  <p className="mt-3 text-[13px] leading-snug text-dim"><b className="font-semibold text-ink3">관계</b> · {cur.wire_why}</p>
                )}
                {/* 합격 기준 — 겹침·글 넘침·빠진 수치 등(서버가 배치·글이 바뀔 때마다 다시 본다) */}
                {wEdit && cur && !!cur.wire_checks?.length && (
                  <div className="mt-3"><Warn>
                    <b className="font-bold">배치 확인 {cur.wire_checks.length}곳</b>
                    <ul className="mt-0.5">{cur.wire_checks.map((c, i) => <li key={i}>· {c}</li>)}</ul>
                  </Warn></div>
                )}
                {wEdit && cur && <WireTools blocks={wireOf(cur)} sel={wsel} onSel={setWsel} onChange={(b) => setWire(cur.n, b)} content={val(cur, "content")} scene={val(cur, "scene")}
                  onUndo={() => undo(cur.n)} onRedo={() => redo(cur.n)} canUndo={!!hist.current[cur.n]?.u.length} canRedo={!!hist.current[cur.n]?.r.length}
                  onAi={() => rewire([cur.n])} aiBusy={aiWire} />}
              </div>
            )}
          </div>
        </div>

        {/* 오른쪽 — 기획(그 자리에서 고치면 자동 저장) / 의견 */}
        {rail.r ? <aside className="border-l border-line flex flex-col min-h-0 bg-white">
          <div className="head panel !gap-2">
            <button type="button" className="pp-hit btn-icon flex-none !w-7 !h-7" title="기획·의견 접기" aria-label="기획·의견 접기" onClick={() => toggleRail("r")}><Ms name="chevron_right" size={18} /></button>
            <Seg value={rtab} onChange={setRtab} options={[["plan", "기획"], ["note", <>의견 {countBadge}</>]] as const} />
            {rtab === "note" ? doneToggle : (
              <span className={cn("ml-auto text-[13px] font-semibold truncate min-w-0 inline-flex items-center gap-0.5", saved === "error" ? "text-[var(--color-warn)]" : saved === "saved" ? "text-ok" : "text-dim")} title={saved === "error" ? "저장 실패 — 다시 고치면 재시도" : undefined}>
                {saved === "saving" ? "저장 중…" : saved === "saved" ? <><Ms name="check" size={15} />자동 저장됨</> : saved === "error" ? "저장 실패" : ""}
              </span>
            )}
          </div>
          {rtab === "plan" ? (
            <div className="flex-1 min-h-0 overflow-y-auto scroll-thin px-[18px] py-4 flex flex-col gap-4">
              {fcur ? <>
                <div className="font-bold text-[15px]">{fcur.label} 시안</div>
                {fcur.status === "failed" && <Warn bad>시안 실패: {fcur.error}</Warn>}
                <p className="text-[13.5px] text-ink2 leading-[1.65]">
                  {sent(fcur.kind === "toc" ? "목차의 장 이름은 각 간지에서 고칩니다. 장 안의 항목은 그 장 본문의 키메시지입니다." : "고친 글은 자동 저장되고, 시안과 장표에 그대로 들어갑니다.")}
                </p>
                {mine && fcur.kind === "cover" && <>
                  <Field label="표지 큰 글(사업명) — 줄을 바꾸면 그대로 두 줄로">
                    <textarea key={`p${fcur.id}`} rows={2} className="field !text-[14px] font-bold !resize-y" defaultValue={fe.cover?.project || fcur.project || fcur.title || ""} onBlur={(e) => saveFront(fcur.id, { project: e.target.value })} />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="행사 이름"><input key={`t${fcur.id}`} className="field !text-[13px]" defaultValue={fcur.tail || ""} placeholder="제안설명회" onBlur={(e) => saveFront(fcur.id, { tail: e.target.value })} /></Field>
                    <Field label="날짜"><input key={`d${fcur.id}`} className="field !text-[13px]" defaultValue={fcur.date || ""} placeholder="2026. 10." onBlur={(e) => saveFront(fcur.id, { date: e.target.value })} /></Field>
                  </div>
                </>}
                {mine && fcur.kind === "div" && (
                  <Field label={`장 이름 — PART ${String(fcur.no ?? 1).padStart(2, "0")} · 목차에도 같이 바뀝니다`}>
                    <input key={`n${fcur.id}`} className="field !text-[14px] font-bold" defaultValue={fcur.name || ""} onBlur={(e) => saveFront(fcur.id, { name: e.target.value })} />
                  </Field>
                )}
                <Field label="이 장에 대한 의견 (선택 · 체크하고 시안을 다시 만들 때 반영)">
                  <textarea className="field min-h-[84px] !resize-y !text-[13px]" maxLength={3000} value={ffb[fcur.id] ?? ""} onChange={(e) => { setFfb({ ...ffb, [fcur.id]: e.target.value }); if (e.target.value.trim()) setFpick({ ...fpick, [fcur.id]: true }); }}
                    placeholder="예: 오른쪽 그림을 병원·연구소 느낌으로 / 제목을 더 크게" />
                </Field>
              </> : cur && <>
                <div className="flex flex-col gap-0.5">
                  <span className="font-bold text-[15px]">{cur.n}쪽 기획</span>
                  <span className="text-[13px] text-dim leading-[1.5]">글을 고치면 자동 저장되고, 시안은 이 기획대로 그립니다</span>
                </div>
                {cur.status === "failed" && <Warn bad>시안 실패: {cur.error}</Warn>}
                {!!cur.checks?.length && (
                  <details key={cur.n} className="group rounded-md border bg-[var(--color-mark-soft)] border-[var(--color-mark)] text-[var(--color-ink-2)]">
                    <summary className="list-none [&::-webkit-details-marker]:hidden flex items-center gap-2 cursor-pointer px-3 py-2.5 text-[13.5px] leading-[1.5]">
                      <Ms name="error" size={19} className="flex-none" />
                      <span className="min-w-0 flex-1"><b>근거 확인 필요 {cur.checks.length}곳</b></span>
                      <Ms name="expand_more" size={18} className="flex-none transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="px-3 pb-2.5 pl-[39px] text-[13.5px] leading-[1.6] break-words">
                      자료에 없는 수치 · 과장 · 메타 문구는 그대로 두면 장표에 들어갑니다.
                      {cur.checks.map((c, i) => <span key={i} className="block">· {c}</span>)}
                    </div>
                  </details>
                )}
                <Field label="키메시지 · 장표 맨 위에 들어가는 한 줄. 직접 적으면 그대로 쓰입니다. 강조할 말은 와이어프레임에서 키메시지를 눌러 「밑줄 강조」로 정합니다">
                  <textarea className="field !text-[16px] font-bold !leading-[1.4] !resize-y" rows={2} placeholder="비워 두면 기획이 정한 문구를 씁니다" value={val(cur, "title")} onChange={(e) => setEd(cur.n, { title: e.target.value })} />
                </Field>
                <Field label="전달할 것">
                  <textarea className="field min-h-[64px] !resize-y !text-[13px]" rows={3} value={val(cur, "message")} onChange={(e) => setEd(cur.n, { message: e.target.value })} />
                </Field>
                <details className="group rounded-md border border-line-soft">
                  <summary className="list-none [&::-webkit-details-marker]:hidden flex items-center gap-1 cursor-pointer px-3 py-2 text-[13px] font-semibold text-dim hover:text-ink3"><Ms name="chevron_right" size={16} className="flex-none transition-transform group-open:rotate-90" />그림·구성 지시 — 시안 이미지를 그릴 때만 쓰입니다</summary>
                  <div className="px-3 pb-3 flex flex-col gap-3">
                    <Field label="장면 — 그림으로 보여줄 것">
                      <textarea className="field min-h-[96px] !resize-y !text-[13px]" rows={3} value={val(cur, "scene")} onChange={(e) => setEd(cur.n, { scene: e.target.value })} />
                    </Field>
                    <Field label="구성 — 칸 나눔 · 흐름">
                      <textarea className="field min-h-[96px] !resize-y !text-[13px]" rows={3} value={val(cur, "layout")} onChange={(e) => setEd(cur.n, { layout: e.target.value })} />
                    </Field>
                  </div>
                </details>
                <Field label="내용 — 장표에 들어갈 글">
                  <textarea className="field min-h-[240px] !resize-y font-mono !text-[12.5px]" rows={Math.min(24, Math.max(8, val(cur, "content").split("\n").length + 1))}
                    value={val(cur, "content")} onChange={(e) => setEd(cur.n, { content: e.target.value })} />
                </Field>
                <Field label="이 장 전체에 대한 의견 (선택 · 시안을 다시 만들 때 반영)">
                  <textarea className="field min-h-[64px] !resize-y !text-[13px]" rows={2} maxLength={3000} value={ed(cur.n).feedback ?? ""} onChange={(e) => setEd(cur.n, { feedback: e.target.value })}
                    placeholder="예: 왼쪽은 표로, 인물은 빼고 / 3단 카드 대신 단계 흐름으로" />
                </Field>
              </>}
              <div className="border-t border-line-soft pt-4">
                <Field label={<><b className="font-bold text-ink">전체 요청</b> · 모든 장에 적용 (선택)</>}>
                  <textarea className="field min-h-[64px] !resize-y !text-[13px]" rows={2} maxLength={3000} value={fb} onChange={(e) => setFb(e.target.value)} placeholder="예: 글을 더 촘촘하게 / 인물 그림은 빼기" />
                </Field>
              </div>
            </div>
          ) : (
            <>
              {owner && <div className="flex-none px-[18px] py-3.5 flex flex-col gap-2 border-b border-line-soft">
                <div className="flex items-center gap-1.5">
                  <button onClick={share} disabled={!shareN} title={!shareN ? "A·B 를 한 장 이상 확정해야 공유할 수 있습니다" : undefined}
                    className={cn("flex-1 min-w-0 h-10 rounded-md font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap",
                      !shareN ? "bg-panel text-faint border border-line cursor-not-allowed" : job.shared && !copied ? "bg-ok-soft text-ok hover:bg-[var(--color-ok-soft)]" : "bg-ink text-white hover:bg-black")}>
                    <Ms name={!shareN ? "lock" : copied ? "check" : "link"} size={19} />{!shareN ? "A·B 확정 후 공유" : copied ? "링크를 복사했습니다" : job.shared ? "공유 중 · 링크 복사" : abLeft.length ? `확정한 ${shareN}장만 공유 · 링크 복사` : "팀원에게 공유 · 링크 복사"}
                  </button>
                  {job.shared && <button className="btn-icon danger !w-10 !h-10 border border-line" onClick={unshare} title="공유 끄기 — 팀원이 더 볼 수 없습니다" aria-label="공유 끄기"><Ms name="link_off" size={19} /></button>}
                </div>
                {!!shareN && <ShareLevel job={job} onJob={onChange} />}
                {abLeft.length > 0
                  ? <div className="text-[13px] font-semibold text-[var(--color-ink-2)] leading-[1.5]">{shareN ? `확정한 ${shareN}장만 팀원에게 보입니다. A·B 를 고르면 그 장도 바로 보입니다` : "A·B 배치를 한 장 이상 확정해야 공유할 수 있습니다"} — 남은 장 {abLeft.map((s) => s.n).join(", ")}쪽 (A·B 표시가 붙은 장)</div>
                  : <div className="text-[13px] text-dim leading-[1.5]">팀원 의견은 ‘검토 대기’로 들어오고, 내가 ‘장표에 반영’을 누른 의견만 장표에 반영됩니다.</div>}
                {(accepted.length > 0 || pending.length > 0) && (
                  <div className="text-[13px] font-semibold leading-[1.5]">
                    {accepted.length > 0 && <span className="text-ok">반영 예정 {accepted.length}개</span>}
                    {accepted.length > 0 && pending.length > 0 && <span className="text-faint"> · </span>}
                    {pending.length > 0 && <span className="text-[var(--color-ink-2)]">검토 대기 {pending.length}개 — 눌러서 반영 여부를 정해 주세요</span>}
                  </div>
                )}
              </div>}
              <div className="flex-1 overflow-y-auto scroll-thin">
                <CommentList p={pins} list={listed} onGo={goComment}
                  empty={have ? <>아직 의견이 없습니다.<br />시안에서 고칠 곳을 눌러 보세요.</> : <>아직 의견이 없습니다.<br />‘의견 남기기’로 바꾸고<br />와이어프레임에서 고칠 곳을 누르세요.</>} />
              </div>
            </>
          )}
        </aside> : (
          <div className="pd-fold border-l border-line bg-white flex flex-col items-center py-3 gap-2 min-h-0">
            <button type="button" className="pp-hit btn-icon flex-none !w-7 !h-7" title="기획·의견 펼치기" aria-label="기획·의견 펼치기" onClick={() => toggleRail("r")}><Ms name="chevron_left" size={18} /></button>
            <span className="pd-fold-l flex flex-col items-center gap-1 text-[12px] font-bold text-dim" title="기획·의견"><Ms name="edit_note" size={18} /><span>기획</span>{open.length > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-orange text-white text-[11px] inline-flex items-center justify-center">{open.length}</span>}</span>
          </div>
        )}
      </div>
    </>
  );
}

/** 시안 만들 장 체크 — 그림 왼쪽 위 */
const Check = ({ on, title, onClick, size = 22 }: { on: boolean; title: string; onClick: () => void; size?: number }) => (
  <button type="button" title={title} aria-label={title} aria-pressed={on} onClick={(e) => { e.stopPropagation(); onClick(); }}
    className={cn("pp-hit flex-none rounded-md p-0 grid place-items-center text-white border-[1.5px]", on ? "bg-orange border-orange" : "bg-white border-faint hover:border-orange")}
    style={{ width: size, height: size }}>
    {on && <Ms name="check" size={size > 18 ? 16 : 14} />}
  </button>
);

/** 입력칸 한 묶음 — 13px 회색 라벨 + 입력 */
const Field = ({ label, children }: { label: ReactNode; children: ReactNode }) => (
  <label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-dim leading-[1.45]">{label}</span>{children}</label>
);

/** 안내 상자 — 근거 확인(노랑) · 시안 실패(빨강) */
const Warn = ({ bad, children }: { bad?: boolean; children: ReactNode }) => (
  <div className={cn("flex gap-2 items-start px-3 py-2.5 rounded-md border", bad ? "bg-[var(--color-warn-soft)] border-[var(--color-warn-line)]" : "bg-[var(--color-mark-soft)] border-[var(--color-mark)]")}>
    <Ms name="error" size={19} className={cn("mt-px", bad ? "text-[var(--color-warn)]" : "text-[var(--color-ink-2)]")} />
    <div className={cn("min-w-0 text-[13.5px] leading-[1.6] break-words", bad ? "text-[var(--color-warn)]" : "text-[var(--color-ink-2)]")}>{children}</div>
  </div>
);

const Failed = ({ error }: { error?: string }) => <span className="flex-none whitespace-nowrap text-[12.5px] font-bold rounded-md px-[7px] py-0.5 bg-[var(--color-warn-soft)] text-[var(--color-warn)]" title={error}>시안 실패</span>;

const Cost = ({ l, v, bad }: { l: string; v: string; bad?: boolean }) => (
  <div className="flex justify-between gap-2 whitespace-nowrap"><span>{l}</span><span className={cn("font-mono", bad ? "text-[var(--color-warn)]" : "text-ink3")}>{v}</span></div>
);

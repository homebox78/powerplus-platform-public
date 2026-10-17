// powerDeck 작업 단위 화면 — 출처: powerDeck web/src/App.tsx 의 분기(초안 올리기 · 작업(대기/변환 중/확인/결과) · 내 작업 · 설정)를 플랫폼 하위 메뉴에 그대로 매핑.
//   /deck/convert            = Upload → 올린 뒤 /deck/jobs?id=<id>
//   /deck/jobs               = JobList
//   /deck/jobs?id=<id>       = Running / Review / MockupReview / Result (옛 App 과 같은 조건)
//   내 현황은 마이페이지 /account/settings/deck, 서비스 설정(AI·엔진/이력·과금/참조 자료)은 관리자 /admin/deck-settings/<engine|bill|ref> (사용자 지시 2026-10-06)
// 옛 Shell(사이드바)·Login 은 쓰지 않는다 — 플랫폼 틀(헤더·모듈 탭) 안에 본문만. Toaster·Asker·GlobalContextMenu 는 모듈 루트에서 한 번.
// 화면 코드(legacy/*)의 UI/UX 는 그대로, 디자인 토큰만 플랫폼 톤(legacy/theme.css·legacy.css, 계약 §4).
import "material-symbols/outlined.css";
import { BadgeCheck, Link2, MessagesSquare, Users } from "lucide-react";
import { MobileCarousel } from "@/components/hb/mobile-carousel";
import "./legacy/legacy.css";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { StepCards } from "@/components/hb/step-cards";
import { SectionHeading } from "@/components/hb/section-heading";
import { Copy, MBr } from "@/components/hb/copy";
import { useLogout, useMe } from "@/lib/auth";
import { api, ApiError, isEditing, type Engine, type Job } from "./legacy/api";
import { ask, Asker, GlobalContextMenu, Toaster, useToastOn } from "./legacy/ui";
import { getAi } from "./legacy/openrouter";
import { Upload } from "./legacy/screens/Upload";
import { Running } from "./legacy/screens/Running";
import { Review } from "./legacy/screens/Review";
import { MockupReview } from "./legacy/screens/MockupReview";
import { Result } from "./legacy/screens/Result";
import { JobList } from "./legacy/screens/JobList";
import { Settings, type SettingsMenu } from "./legacy/screens/Settings";

type Me = { email: string; isAdmin: boolean };
type Ctx = {
  me: Me;
  engine: Engine | null;
  jobs: Job[] | null;
  all: boolean;
  setAll: (f: (a: boolean) => boolean) => void;
  loadJobs: () => void;
  loadAi: () => void;
  logout: () => Promise<void>;
  go: (to: string) => void;
};

const LIVE = (s: Job["status"]) => s === "queued" || s === "running" || s === "hold";

/**
 * 모듈 루트 — 옛 App.tsx 가 들고 있던 공통 상태(엔진 20초·작업 목록 4초·AI 키)를 들고, 플랫폼 로그인(useMe)을 옛 me 형으로 바꿔 화면에 넘긴다.
 * 옛 화면의 해시 이동(pd:nav)·로그인 만료(pd:unauth)도 여기서 받는다.
 */
function DeckRoot({ children, anon = false, plain = false }: { children: (c: Ctx) => ReactNode; anon?: boolean; plain?: boolean }) {
  const { me: pme, loading, isAdmin } = useMe();
  const nav = useNavigate();
  const { pathname, search } = useLocation();
  const logoutM = useLogout();
  const go = useCallback((to: string) => nav(to), [nav]);
  // anon = 공유 링크 열람 — 로그인 안 했어도 빈 me 로 화면을 연다(엔진·목록은 email 이 없어 부르지 않는다)
  const me: Me | null = pme ? { email: pme.user?.email ?? "", isAdmin } : anon ? { email: "", isAdmin: false } : null;

  // body 에 .pd — 포털(모달·토스트·오른쪽 메뉴)도 옛 클래스 스타일을 받는다
  useEffect(() => { document.body.classList.add("pd"); return () => document.body.classList.remove("pd"); }, []);
  // 옛 화면의 location.hash 이동 → 플랫폼 경로
  useEffect(() => {
    const f = (e: Event) => go((e as CustomEvent<string>).detail);
    window.addEventListener("pd:nav", f);
    return () => window.removeEventListener("pd:nav", f);
  }, [go]);
  // 로그인이 만료되면(어느 요청이든 401) 플랫폼 로그인 화면으로.
  // 공유 링크 열람(anon)에서는 받지 않는다 — 상세 401 은 JobView 가 직접 처리(상2, 2026-10-10)
  useEffect(() => {
    if (anon) return;
    const f = () => go(`/login?next=${encodeURIComponent(pathname + search)}`);
    window.addEventListener("pd:unauth", f);
    return () => window.removeEventListener("pd:unauth", f);
  }, [go, pathname, search, anon]);

  const [engine, setEngine] = useState<Engine | null>(null);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [all, setAll] = useState(false);
  const loadAi = useCallback(() => { getAi().catch(() => {}); }, []);

  // 엔진 상태 — 20초마다
  const email = me?.email;
  useEffect(() => {
    if (!email) return;
    const f = () => api<Engine>("/engine").then(setEngine).catch(() => {});
    f();
    const t = setInterval(() => { if (!document.hidden) f(); }, 20000);   // 탭이 가려져 있으면 쉰다
    return () => clearInterval(t);
  }, [email]);

  // 작업 목록 — 목록 화면 + 진행 중이면 4초마다
  const loadJobs = useCallback(() => { api<{ data: Job[] } | Job[]>(`/jobs${all ? "?all=1" : ""}`).then((r) => setJobs(Array.isArray(r) ? r : r.data)).catch(() => {}); }, [all]);
  // 작업 한 건(?id=)으로 들어오면 목록은 부르지 않는다 — 비로그인 공유 링크가 목록 401 로 로그인에 튕기던 것(상2)
  useEffect(() => { if (email && !anon) loadJobs(); }, [email, anon, loadJobs, pathname]);
  const listLive = (jobs ?? []).some((j) => LIVE(j.status));
  useEffect(() => {
    if (!listLive) return;
    const t = setInterval(() => { if (!document.hidden) loadJobs(); }, 4000);
    return () => clearInterval(t);
  }, [listLive, loadJobs]);

  const logout = useCallback(async () => { try { await logoutM.mutateAsync(); } catch { /* 무시 */ } go("/"); }, [logoutM, go]);

  if (loading) return <div className="pd-root mt-8" />;
  if (!me) {
    return (
      <div className="pd-root mt-8 items-center justify-center">
        <div className="text-[14px] font-semibold text-dim">로그인하면 바로 쓸 수 있습니다. <Link to={`/login?next=${encodeURIComponent(pathname + search)}`} className="text-orange-d underline">로그인</Link></div>
      </div>
    );
  }
  return (
    <div className={plain ? "pd" : "pd pd-root mt-8"}>
      <GlobalContextMenu />
      {children({ me, engine, jobs, all, setAll, loadJobs, loadAi, logout, go })}
      <Toaster />
      <Asker />
    </div>
  );
}

// ---------------------------------------------------------------- 변환(초안 올리기)
function ConvertScreen() {
  return (
    <DeckRoot>
      {({ engine, jobs, go, me }) => (
        <Upload engine={engine} isAdmin={me.isAdmin} onUploaded={(j) => go(`/deck/jobs?id=${encodeURIComponent(j.id)}`)}
          onCancel={(jobs?.length ?? 0) ? () => go("/deck/jobs") : undefined} onSettings={() => go(me.isAdmin ? "/admin/ai" : "/account/settings/deck")} />
      )}
    </DeckRoot>
  );
}

// ---------------------------------------------------------------- 내 작업 · 작업 한 건
function JobView({ id, c }: { id: string; c: Ctx }) {
  const { me, engine, go, logout, loadJobs } = c;
  const [job, setJob] = useState<Job | null>(null);
  const [jobErr, setJobErr] = useState<string | null>(null);
  useToastOn(jobErr);
  // 작업 상세 — 진행 중이면 3초마다 다시 읽는다
  const loadJob = useCallback((jid: string) =>
    api<Job>(`/jobs/${jid}`)
      .then((j) => { setJob(j); setJobErr(null); })
      .catch((e: unknown) => {
        setJobErr((e as Error).message);
        // 상세가 401 이면(공유 안 됨·로그인 필요) 여기서만 로그인으로 보낸다 — 목록 401 과 섞이지 않게
        if (e instanceof ApiError && e.status === 401) { setJob(null); go(`/login?next=${encodeURIComponent(`/deck/jobs?id=${jid}`)}`); }
      }),
  [go]);
  useEffect(() => { loadJob(id); }, [id, loadJob]);   // key={id} 라 id 가 바뀌면 새로 마운트 — 되돌림 불필요
  const live = !!job && job.id === id && LIVE(job.status);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => { if (!document.hidden) loadJob(id); }, 3000);
    return () => clearInterval(t);
  }, [live, id, loadJob]);
  // 상태가 바뀌면 사이드 목록도 새로 — 로그인한 사람만(비로그인 공유 보기는 목록 권한이 없다)
  useEffect(() => { if (me.email) loadJobs(); }, [job?.status, loadJobs, me.email]);
  const setJobAnd = (j: Job) => setJob(j);
  // 실패·멈춘 design 작업도 기획·와이어·시안을 다시 본다(2026-10-13 사용자 지시) — 이 작업 id 면 기획 화면
  const [planView, setPlanView] = useState<string | null>(null);
  // 설정·취소·시작은 작업 주인(또는 관리자)만 — 공유받은 사람 화면에서는 숨긴다(중4). 서버는 어차피 403 이지만 보이지 않아야 한다
  const owner = job?.is_owner ?? job?.mine !== false;
  const onNew = () => go("/deck/convert");

  if (!job) return <div className="flex-1 flex items-center justify-center text-[14px] font-semibold text-dim">{jobErr ?? "불러오는 중…"}</div>;
  if (!isEditing(job) && LIVE(job.status)) {
    return (
      <Running job={job} engine={engine} onNew={onNew}
        onCancel={owner ? async () => setJob(await api<Job>(`/jobs/${job.id}/cancel`, { method: "POST" })) : undefined}
        onStart={owner ? async () => setJob(await api<Job>(`/jobs/${job.id}/start`, { method: "POST" })) : undefined}
        onBack={owner ? async () => {
          if (!(await ask("지금까지 만든 기획은 지우고 내용 입력으로 돌아갑니다.\n자료를 더하거나 뺀 뒤 「검토 시작」을 누르면 기획을 처음부터 다시 짭니다.", { title: "멈추고 자료를 고칠까요?", ok: "멈추고 돌아가기" }))) return;
          try { setJob(await api<Job>(`/jobs/${job.id}/back`, { method: "POST" })); } catch (e) { setJobErr((e as Error).message); }
        } : undefined}
        onReload={() => loadJob(id)} />
    );
  }
  if (job.status === "review") {
    return job.kind === "design"
      ? <MockupReview job={job} onChange={setJobAnd} onNew={onNew} isAdmin={me.isAdmin} me={me.email} onLogout={logout} />
      : <Review job={job} onChange={setJobAnd} onNew={onNew} />;
  }
  const stopped = job.status === "failed" || job.status === "canceled";
  const hasPlan = job.kind === "design" && !!job.plan?.slides?.length;
  if (stopped && hasPlan && planView === job.id) {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-none mx-4 mt-3 px-3.5 py-2.5 rounded-md bg-[var(--color-warn-soft)] border border-[var(--color-warn-line)] flex items-center gap-2.5 text-[13.5px] text-[var(--color-warn)]">
          <b className="flex-none">{job.status === "canceled" ? "변환을 멈춘 작업입니다." : "장표를 만들지 못한 작업입니다."}</b>
          <span className="flex-1 min-w-0 truncate">기획·와이어·시안은 그대로 남아 있습니다.</span>
          <button type="button" className="flex-none h-8 px-3 rounded-md border border-[var(--color-warn-line)] bg-white font-semibold hover:underline" onClick={() => setPlanView(null)}>결과·오류 화면</button>
        </div>
        <MockupReview job={job} onChange={setJobAnd} onNew={onNew} isAdmin={me.isAdmin} me={me.email} onLogout={logout} />
      </div>
    );
  }
  if (isEditing(job) || job.status === "done" || stopped) {
    return <Result job={job} me={me.email} isAdmin={me.isAdmin} onChange={setJobAnd} onNew={onNew} onLogout={logout} onRetry={async () => setJob(await api<Job>(`/jobs/${job.id}/retry`, { method: "POST" }))}
      onPlan={stopped && hasPlan ? () => setPlanView(job.id) : undefined} />;
  }
  return <div className="flex-1 flex items-center justify-center text-[14px] font-semibold text-dim">아직 볼 시안·장표가 없습니다. 만들어지면 이 주소에서 볼 수 있습니다.</div>;
}

function JobsScreen() {
  const [sp] = useSearchParams();
  const id = sp.get("id");
  return (
    <DeckRoot anon={!!id}>
      {(c) => id
        ? <JobView key={id} id={id} c={c} />
        : <JobList jobs={c.jobs} all={c.all} isAdmin={c.me.isAdmin} onToggleAll={() => c.setAll((a) => !a)}
            onOpen={(jid) => c.go(`/deck/jobs?id=${encodeURIComponent(jid)}`)} onNew={() => c.go("/deck/convert")} onChanged={c.loadJobs} />}
    </DeckRoot>
  );
}

// ---------------------------------------------------------------- 설정
export function DeckSettingsScreen({ forceMenu }: { forceMenu?: SettingsMenu } = {}) {
  const { sub } = useParams();
  const [sp] = useSearchParams();
  // 관리자 화면(/admin/deck-settings)은 forceMenu 로, 마이페이지(/account/settings/deck)는 주소의 하위로. ?tab=bill 은 예전 주소
  const menu = (forceMenu ?? (sp.get("tab") === "bill" ? "bill" : sub)) as SettingsMenu | undefined;
  return (
    <DeckRoot plain>
      {(c) => <Settings isAdmin={c.me.isAdmin} menu={menu} onChange={c.loadAi} onOpen={(jid) => c.go(`/deck/jobs?id=${encodeURIComponent(jid)}`)} />}
    </DeckRoot>
  );
}

// ---------------------------------------------------------------- 랜딩 STEP
export function DeckLandingSteps() {
  // 자료 정리부터 대본까지 한 작업 안에서 이어진다 — 단계마다 앞 단계 결과를 그대로 받아 쓰는 게 장점
  const steps = [
    ["자료를 정리한다", "RFP·보고서·초안 pptx 를 올리면 핵심 내용과 수치를 뽑아 한 장으로 정리합니다. 1GB 까지, 끊겨도 이어 올립니다.", "/deck/convert"],
    ["기획을 세운다", "정리한 자료로 장마다 할 말과 근거를 짭니다. 글은 바로 고치고, 고친 내용이 다음 단계로 이어집니다.", "/deck/convert"],
    ["와이어프레임을 잡는다", "장마다 제목·도식·표 자리를 12칸 틀로 배치합니다. 끌어서 바꾸고 AI 에게 다시 짜 달라고 할 수 있습니다.", "/deck/convert"],
    ["디자인 시안을 고른다", "대표 장의 시안을 A·B 로 받아 비교해 확정합니다. 의견을 적으면 그 톤으로 다시 만듭니다.", "/deck/jobs"],
    ["장표를 완성한다", "확정한 톤으로 나머지 장을 powerAssets 아이콘·사진으로 꾸밉니다. 진행 중에도 지금까지 받을 수 있습니다.", "/deck/jobs"],
    ["대본까지 받는다", "장마다 발표 대본을 붙여 줍니다. pptx 와 함께 받고, 링크 권한을 정해 팀과 나눕니다.", "/deck/jobs"],
  ] as const;
  return (
    <section className="mt-8" aria-label="사용 순서">
      <SectionHeading title="자료 정리부터 대본까지, 한 번에" />
      {/* 문장마다 pp-sent(균형 줄바꿈) — 모바일에서 "없습니다." 만 떨어지던 꼬리 줄(2026-10-17 점검) */}
      <p className="mt-2 text-md text-ink-3"><span className="pp-sent">여섯 단계가 한 작업 안에서 이어집니다.</span><MBr /><span className="pp-sent">앞 단계 결과를 그대로 받아 쓰니 도구를 옮겨 다닐 일이 없습니다.</span></p>
      <StepCards items={steps.map(([title, desc, to], i) => ({ title, desc, to, img: `/img/steps/deck-${i + 1}-v3.html` }))} />
      <DeckTogether />
    </section>
  );
}

/**
 * 함께 만드는 장표 — 한 장표를 여럿이 보고·의견 주고·같이 고치는 것을 홍보에서 강조(사용자 2026-10-09).
 * 실제 기능 범위 안에서만 쓴다: 링크 권한 4단계(끔·로그인 의견·로그인 편집·링크로 누구나 보기),
 * 편집자는 기획 글·와이어·A·B 확정·AI 다시 짜기, 크레딧이 드는 만들기와 공유 설정은 주인만, 공유받는 쪽엔 확정한 장만.
 */
function DeckTogether() {
  const items = [
    { icon: Link2, title: "링크 하나로 공유", desc: "권한은 의견·편집·보기 중에 고릅니다. 보기 링크는 로그인 없이 열립니다." },
    { icon: MessagesSquare, title: "장마다 의견 달기", desc: "팀원이 시안과 장표에 의견을 남깁니다. 주인은 그 의견으로 다시 만들어 반영합니다." },
    { icon: Users, title: "같이 고치기", desc: "편집 권한을 받은 사람도 기획 글·와이어를 고치고 A·B 를 확정합니다." },
    { icon: BadgeCheck, title: "확정한 장만 보여 주기", desc: "고르지 않은 장은 공유되지 않습니다. 크레딧이 드는 일은 주인만 합니다." },
  ];
  return (
    <div className="mt-11">
      <SectionHeading title="여럿이 한 장표를 함께" />
      <p className="mt-2 text-md text-ink-3"><span className="pp-sent">기획자·디자이너·발표자가 같은 작업 하나를 봅니다.</span><MBr /><span className="pp-sent">파일을 메일로 주고받을 일이 없습니다.</span></p>
      <MobileCarousel label="함께" className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {items.map((it) => (
          <div key={it.title} className="rounded-panel border border-line bg-ground p-6">
            <div className="flex items-center gap-2.5">
              {/* 공개 랜딩 아이콘 4개는 lucide 로 — Material Symbols 글꼴(3.9MB)을 랜딩에서 받지 않게(2026-10-17 점검). 옛 화면(legacy)은 그대로 */}
              <it.icon className="size-[26px] flex-none text-ink-2" strokeWidth={1.75} aria-hidden />
              <span className="text-lg font-bold">{it.title}</span>
            </div>
            <p className="mt-2 text-md leading-[1.7] text-ink-3"><Copy as="span" text={it.desc} /></p>
          </div>
        ))}
      </MobileCarousel>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to="/deck/jobs" className="pp-hit text-md font-semibold text-ink underline underline-offset-4">내 작업에서 공유 권한 정하기</Link>
      </div>
    </div>
  );
}

export const DECK_SCREENS: Record<string, () => React.JSX.Element> = { convert: ConvertScreen, jobs: JobsScreen };

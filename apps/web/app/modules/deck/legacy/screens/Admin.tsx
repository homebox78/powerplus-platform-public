// AI 사용량·비용(관리자)과 작업 내역(내 작업은 비용 칸 제외) — 출처: powerDeck web/src/screens/Admin.tsx (옛 화면 그대로 이식, eslint.config.js legacy 구역).
import { useEffect, useState, type ReactNode } from "react";
import { api, unwrapList, usd, type Job } from "../api";
import { Arrow, cn, Seg, Select, StatusPill, parseTs, useToastOn, Ms } from "../ui";

type Usage = {
  days: number; month_cost: number;
  total: { n: number; cost: number; tokens_in: number; tokens_out: number };
  by_user: { email: string; n: number; cost: number; images: number | string }[];
  by_model: { model: string; kind: string; n: number; cost: number }[];
  by_day: { day: string; n: number; cost: number }[];
  rows: { id: number; created_at: string; email: string; job_id: string | null; title: string | null; kind: string; model: string; cost_usd: number; tokens_in: number; tokens_out: number }[];
};
const p2 = (n: number) => String(n).padStart(2, "0");
const when = (s: string) => { const d = parseTs(s); return d ? `${p2(d.getMonth() + 1)}.${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}` : s; };   // 작업 목록과 같은 꼴(10.05 14:29)
const KIND: Record<string, string> = { plan: "기획(글)", image: "시안(이미지)", check: "와이어 일치 판정", digest: "자료 요약", engine: "장표 제작 (엔진)", eplan: "기획 (엔진)", edigest: "자료 요약 (엔진)", script: "발표 대본", escript: "발표 대본 (엔진)", ewire: "와이어프레임 (엔진)", hf: "Higgsfield 그림", wire: "와이어프레임" };
const kTok = (n: number) => `${(n / 1000).toFixed(0)}k`;
const DAYS = ["7", "30", "90", "365"].map((d) => [d, `최근 ${d}일`] as const);

const CALL_COLS = "92px minmax(0,1.1fr) minmax(0,1.3fr) minmax(0,0.9fr) minmax(0,1.1fr) 104px 64px";
const JOB_COLS = "92px minmax(0,1.1fr) minmax(0,1.5fr) minmax(0,1fr) 96px minmax(0,0.6fr) 96px";
// 마이페이지(내 작업)는 사용자·엔진·AI 비용(달러) 칸을 뺀다 — 비용은 관리자만 본다
const MINE_COLS = "92px minmax(0,1.5fr) minmax(0,1fr) 96px";
const CALL_PAGE = 15;   // AI 호출 내역 한 쪽

/** 테두리 상자 + 제목 줄 */
function Card({ title, className, children }: { title?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={cn("border border-line rounded-md overflow-hidden", className)}>
      {title && <div className="px-4 py-3 font-bold border-b border-line-soft flex items-center gap-2 min-w-0">{title}</div>}
      {children}
    </div>
  );
}
/** 표 머리 — 모든 표의 머리글은 가운데. 몸통은 열마다: 제목·사용자처럼 길이가 들쭉날쭉한 글 왼쪽, 짧고 고른 값 가운데, 금액·토큰처럼 비교하는 수치 오른쪽 */
const HeadRow = ({ cols, children }: { cols: string; children: ReactNode }) => (
  <div className="grid gap-2 px-4 h-8 items-center bg-panel text-[12.5px] font-semibold text-dim whitespace-nowrap text-center" style={{ gridTemplateColumns: cols }}>{children}</div>
);

/** 설정 › 이력·과금(관리자) — 과금 내역(AI 호출 한 건씩)과 전체 작업 이력. 작업을 누르면 그 작업으로 간다 */
export function BillPane({ onOpen, mine = false }: { onOpen: (id: string) => void; mine?: boolean }) {
  const [tab, setTab] = useState<"usage" | "jobs">(mine ? "jobs" : "usage");
  const [days, setDays] = useState(30);
  const [u, setU] = useState<Usage | null>(null);
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useToastOn(err);
  const [who, setWho] = useState("");

  useEffect(() => { if (mine) return; setU(null); api<Usage>(`/admin/usage?days=${days}`).then(setU).catch((e) => setErr((e as Error).message)); }, [days, mine]);
  useEffect(() => { if (tab === "jobs" && !jobs) api<{ data: Job[] }>(mine ? "/jobs" : "/jobs?all=1").then((r) => setJobs(unwrapList(r))).catch((e) => setErr((e as Error).message)); }, [tab, jobs, mine]);

  const rows = (u?.rows ?? []).filter((r) => !who || r.email === who);
  // AI 호출 내역 — 15건씩 쪽을 나눈다. 사용자 필터·기간이 바뀌면 첫 쪽으로
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [who, days]);
  const pages = Math.max(1, Math.ceil(rows.length / CALL_PAGE));
  const pg = Math.min(page, pages - 1);
  const shown = rows.slice(pg * CALL_PAGE, pg * CALL_PAGE + CALL_PAGE);
  // 쪽 번호 — 현재 쪽 둘레 ±2 와 처음·끝만, 사이가 비면 '…'
  const pageNums = Array.from({ length: pages }, (_, i) => i).filter((i) => i === 0 || i === pages - 1 || Math.abs(i - pg) <= 2);
  const jl = (jobs ?? []).filter((j) => !who || j.email === who);
  const maxDay = Math.max(0.0001, ...(u?.by_day ?? []).map((d) => d.cost));
  const fewDays = (u?.by_day.length ?? 0) <= 10;   // 막대가 적을 때만 금액·날짜를 글로 적는다(많으면 올렸을 때 풍선말)
  const clear = <button className="flex-none whitespace-nowrap text-[13px] font-semibold text-orange-d hover:underline" onClick={() => setWho("")}>필터 해제</button>;

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-[19px] font-bold whitespace-nowrap">{mine ? "내 작업 이력" : "이력 · 과금"}</div>
        {!mine && <Seg className="ml-auto" value={tab} onChange={setTab} options={[["usage", "과금 내역"], ["jobs", "작업 이력"]] as const} />}
        {!mine && <Select className="w-[140px] flex-none" label="조회 기간" value={String(days)} onChange={(v) => setDays(Number(v))} options={DAYS} />}
      </div>
      {err && <div role="alert" className="text-[13px] font-semibold text-orange-d">{err}</div>}
      {!mine && !u && !err && <div className="text-[13px] text-dim">불러오는 중…</div>}

      {u && (
        <div className="grid border border-line rounded-md overflow-hidden" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(150px,100%),1fr))" }}>
          {([["기간 합계", usd(u.total.cost, 3)],
            ["이달 합계", usd(u.month_cost, 3)],
            ["AI 호출", `${u.total.n.toLocaleString()}건`],
            ["토큰 (입력 / 출력)", `${kTok(u.total.tokens_in)} / ${kTok(u.total.tokens_out)}`]] as const).map(([l, v]) => (
            <div key={l} className="px-4 py-3.5 border-r border-line-soft last:border-r-0 min-w-0">
              <div className="text-[13px] text-dim whitespace-nowrap">{l}</div>
              <div className="text-[21px] font-bold mt-1 tracking-[-0.02em] whitespace-nowrap">{v}</div>
            </div>
          ))}
        </div>
      )}

      {tab === "usage" && u && (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(380px,100%),1fr))" }}>
            <Card title="모델별">
              {u.by_model.map((r) => (
                <div key={r.model + r.kind} className="grid gap-3 px-4 py-2 border-b border-[var(--color-ground-3)] last:border-b-0 items-center" style={{ gridTemplateColumns: "minmax(0,1fr) auto 64px" }}>
                  <span className="font-mono text-[12.5px] break-all" title={r.model}>{r.model}</span>
                  <span className="text-[13px] text-dim whitespace-nowrap">{KIND[r.kind] ?? r.kind} {r.n}건</span>
                  <span className="text-right font-bold">{usd(r.cost, 3)}</span>
                </div>
              ))}
              {!u.by_model.length && <div className="px-4 py-6 text-[13px] text-dim text-center">아직 내역이 없습니다.</div>}
            </Card>
            <div className="flex flex-col gap-4 min-w-0">
              <Card title={<><span className="flex-none">사용자별</span>{who && <span className="ml-auto">{clear}</span>}</>}>
                {u.by_user.map((r) => (
                  <button key={r.email} onClick={() => setWho(who === r.email ? "" : r.email)} aria-pressed={who === r.email} title="누르면 이 사용자의 내역만 봅니다"
                    className={cn("w-full flex items-center gap-2.5 px-4 py-2.5 text-left border-b border-[var(--color-ground-3)] last:border-b-0", who === r.email ? "bg-orange-tint" : "bg-white hover:bg-panel")}>
                    <span className={cn("flex-1 min-w-0 truncate font-semibold", who === r.email && "text-orange-d")}>{r.email}</span>
                    <span className="flex-none whitespace-nowrap text-[13px] text-dim">{r.n}건 · 시안 {Number(r.images)}장</span>
                    <b className="flex-none w-[64px] text-right">{usd(r.cost, 3)}</b>
                  </button>
                ))}
                {!u.by_user.length && <div className="px-4 py-6 text-[13px] text-dim text-center">아직 내역이 없습니다.</div>}
              </Card>
              <Card title="일별" className="flex-1 flex flex-col">
                <div className={cn("flex-1 min-h-[140px] h-[160px] flex items-end p-4", fewDays ? "gap-4" : "gap-1")}>
                  {u.by_day.map((d) => (
                    <div key={d.day} className="flex-1 min-w-[4px] h-full flex flex-col justify-end items-center gap-1.5" title={`${d.day} · ${usd(d.cost, 3)} · ${d.n}건`}>
                      {fewDays && <span className="max-sm:hidden text-[13px] font-bold whitespace-nowrap">{usd(d.cost, 3)}</span>}
                      <div className="w-full max-w-[64px] bg-orange rounded-t-md" style={{ height: `${Math.max(3, (d.cost / maxDay) * (fewDays ? 70 : 100))}%` }} />
                      {fewDays && <span className="max-sm:hidden font-mono text-[12px] text-dim whitespace-nowrap">{d.day.slice(5)}</span>}
                    </div>
                  ))}
                  {!u.by_day.length && <div className="w-full text-center text-[13px] text-dim self-center">아직 내역이 없습니다.</div>}
                </div>
              </Card>
            </div>
          </div>

          <Card title={<><span className="flex-none">AI 호출 내역</span><span className="font-normal text-dim text-[13px] truncate min-w-0">{who && <b className="font-semibold text-orange-d">· {who} </b>}· 최근 {rows.length}건 · 엔진(구독) 사용분 포함</span>{who && <span className="ml-auto">{clear}</span>}</>}>
            <div className="pd-rt"><div>
            <HeadRow cols={CALL_COLS}><span>시각</span><span>사용자</span><span>작업</span><span>종류</span><span>모델</span><span>토큰 입/출</span><span>과금</span></HeadRow>
            {shown.map((r) => (
              <div key={r.id} className="grid gap-2 px-4 py-2 border-t border-[var(--color-ground-3)] items-center text-[13.5px] hover:bg-panel" style={{ gridTemplateColumns: CALL_COLS }}>
                <span className="font-mono text-[12px] text-dim whitespace-nowrap text-center">{when(r.created_at)}</span>
                <span className="truncate text-ink2" title={r.email}>{r.email}</span>
                {r.job_id
                  ? <button className="truncate text-left font-semibold py-1.5 -my-1.5 hover:underline hover:text-orange-d" title={r.title ?? undefined} onClick={() => onOpen(r.job_id!)}>{r.title ?? "(지워진 작업)"}</button>
                  : <span className="pd-rt-empty text-dim">—</span>}
                <span className="text-ink2 truncate text-center" title={KIND[r.kind] ?? r.kind}>{KIND[r.kind] ?? r.kind}</span>
                <span className="font-mono text-[12px] truncate" title={r.model}>{r.model}</span>
                <span className="font-mono text-[12px] text-dim text-right whitespace-nowrap">{r.tokens_in.toLocaleString()} / {r.tokens_out.toLocaleString()}</span>
                <span className="text-right font-bold">{usd(r.cost_usd, 3)}</span>
              </div>
            ))}
            {!rows.length && <div className="px-4 py-8 border-t border-[var(--color-ground-3)] text-center text-[13px] text-dim">내역이 없습니다.</div>}
            {pages > 1 && (
              <nav className="flex items-center justify-center gap-1 px-4 py-2.5 border-t border-[var(--color-ground-3)]" aria-label="AI 호출 내역 쪽">
                <button className="btn-icon !w-8 !h-8" disabled={pg === 0} onClick={() => setPage(pg - 1)} aria-label="이전 쪽"><Ms name="chevron_left" size={18} /></button>
                {pageNums.map((i, k) => (
                  <span key={i} className="inline-flex items-center">
                    {k > 0 && pageNums[k - 1] !== i - 1 && <span className="w-6 text-center text-[13px] text-faint">…</span>}
                    <button onClick={() => setPage(i)} aria-current={i === pg ? "page" : undefined}
                      className={cn("min-w-8 h-8 px-2 rounded-md text-[13px] font-semibold", i === pg ? "bg-ink text-white" : "text-ink3 hover:bg-panel")}>{i + 1}</button>
                  </span>
                ))}
                <button className="btn-icon !w-8 !h-8" disabled={pg >= pages - 1} onClick={() => setPage(pg + 1)} aria-label="다음 쪽"><Ms name="chevron_right" size={18} /></button>
                <span className="ml-2 text-[12.5px] text-dim whitespace-nowrap">{pg * CALL_PAGE + 1}–{Math.min(rows.length, (pg + 1) * CALL_PAGE)} / {rows.length}건</span>
              </nav>
            )}
            </div></div>
          </Card>
        </div>
      )}

      {tab === "jobs" && (
        <Card title={<><span className="flex-none">{mine ? "내 작업" : "전체 작업 이력"}</span><span className="font-normal text-dim text-[13px] truncate min-w-0">{who && <b className="font-semibold text-orange-d">· {who} </b>}· {jl.length}건 · 작업 이력은 최근 200건</span>{who && <span className="ml-auto">{clear}</span>}</>}>
          <div className="pd-rt"><div>
          <HeadRow cols={mine ? MINE_COLS : JOB_COLS}><span>만든 때</span>{!mine && <span>사용자</span>}<span>작업</span><span>종류</span><span>상태</span>{!mine && <><span>엔진</span><span>AI 비용</span></>}</HeadRow>
          {jl.map((j) => (
            <div key={j.id} className="grid gap-2 px-4 py-2.5 border-t border-[var(--color-ground-3)] items-center text-[13.5px] hover:bg-panel" style={{ gridTemplateColumns: mine ? MINE_COLS : JOB_COLS }}>
              <span className="font-mono text-[12px] text-dim whitespace-nowrap text-center">{when(j.created_at)}</span>
              {!mine && <button className="truncate text-left text-ink2 py-1.5 -my-1.5 hover:underline" title="누르면 이 사용자의 작업만 봅니다" onClick={() => setWho(j.email ?? "")}>{j.email ?? j.owner_label ?? "—"}</button>}
              <button className="truncate text-left font-semibold py-1.5 -my-1.5 hover:underline hover:text-orange-d" title={j.title} onClick={() => onOpen(j.id)}>{j.title}</button>
              <span className="text-ink2 truncate text-center">{j.kind === "design" ? <>내용<Arrow />장표</> : "초안 다듬기"}{j.slides ? ` · ${j.slides}장` : ""}</span>
              <span className="flex items-center justify-center gap-1.5 min-w-0"><StatusPill status={j.status} small />{j.status === "running" && <span className="font-mono text-[12px] text-orange-d font-bold">{j.progress}%</span>}</span>
              {!mine && <><span className="font-mono text-[12px] text-dim truncate text-center" title={j.worker ?? undefined}>{j.worker ?? "—"}</span>
              <span className="text-right font-bold whitespace-nowrap">{(j.spent_usd ?? 0) > 0 ? usd(j.spent_usd, 3) : "—"}{j.budget_usd != null && <span className="font-normal text-dim"> / {usd(j.budget_usd)}</span>}</span></>}
            </div>
          ))}
          {jobs && !jl.length && <div className="px-4 py-8 border-t border-[var(--color-ground-3)] text-center text-[13px] text-dim">작업이 없습니다.</div>}
          {!jobs && <div className="px-4 py-8 border-t border-[var(--color-ground-3)] text-center text-[13px] text-dim">불러오는 중…</div>}
            </div></div>
        </Card>
      )}

      <div className="text-[13px] text-faint leading-[1.6]">
        과금은 모든 AI 호출(기획 · 요약 · 대본 · 장표 제작 · 이미지)을 OpenRouter 키 하나로 집계합니다.<br />금액은 OpenRouter 응답의 cost 값이고, OpenRouter의 Activity 화면과 맞아야 합니다.
      </div>
    </div>
  );
}

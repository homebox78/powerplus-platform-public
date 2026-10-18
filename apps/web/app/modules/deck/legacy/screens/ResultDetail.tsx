// 결과 상세·비용 정산 — 출처: powerDeck web/src/screens/ResultDetail.tsx (옛 화면 그대로 이식, eslint.config.js legacy 구역).
import { useState } from "react";
import { usd, type Job } from "../api";
import { Arrow, cn, fmtDur, Ms, parseTs } from "../ui";

const STAGE: Record<string, [string, string]> = {
  digest: ["자료 요약", "배경 자료를 읽어 사업 요약으로"],
  plan: ["기획", "장 나누기 · 메시지 · 장면 · 구성"],
  image: ["시안 디자인", "장별 시안 이미지"],
  check: ["와이어 일치 판정", "시안이 와이어를 따랐는지 — 낮으면 한 번 더 그린다"],
  engine: ["장표 제작", "시안을 PowerPoint 로 — 엔진 PC 의 Claude 구독"],
  edigest: ["자료 요약", "배경 자료를 읽어 사업 요약으로 — 엔진 PC 의 Claude 구독"],
  eplan: ["기획", "장 나누기 · 메시지 · 장면 · 구성 — 엔진 PC 의 Claude 구독"],
  script: ["발표 대본", "들고 갈 대본 문서 · 노래방식 연습 화면 · 예상 질문"],
};
const SUB = ["edigest", "eplan", "engine"];   // 구독으로 돌린 것 — 청구 없음, 환산액

/** 비용 계산 — 카드와 정산서가 같이 쓴다. 제작(engine)은 구독으로 돌아 실제 청구는 없고 API 환산액으로 따로 적는다 */
function useCost(job: Job) {
  const [rate, setRate] = useState(() => { try { return Number(localStorage.getItem("pd_krw")) || 1400; } catch { return 1400; } });
  const saveRate = (v: number) => { setRate(v); try { localStorage.setItem("pd_krw", String(v)); } catch { /* 무시 */ } };
  const rows = job.costs ?? [];
  const slides = job.plan?.slides.length || job.slides || (job.files?.after ?? []).length || 0;
  const by = (k: string) => rows.filter((r) => r.kind === k);
  const sum = (k: string) => by(k).reduce((n, r) => n + r.usd, 0);
  const billed = sum("digest") + sum("plan") + sum("image") + sum("check") + sum("script");      // OpenRouter 실제 청구(check = 시안 와이어 일치 판정, 2026-10-18)
  const engine = SUB.reduce((n, k) => n + sum(k), 0);                                    // 구독 사용분 환산
  const engineSec = SUB.flatMap(by).reduce((n, r) => n + r.b, 0);
  const won = (v: number) => `₩${Math.round(v * rate).toLocaleString()}`;
  // 청구서 줄 — 단계 · 내역 · 수량 · 단가 · 금액
  const lines = (["digest", "edigest", "plan", "eplan", "image", "check", "script", "engine"] as const).flatMap((k) => by(k).map((r) => {
    const sub = SUB.includes(k);
    return { k, sub, name: STAGE[k]![0], model: r.model, desc: `${STAGE[k]![1]} · ${r.model}${sub ? ` · ${r.a.toLocaleString()}턴 · ${fmtDur(r.b)}` : ""}`,
      short: `${r.model}${sub ? ` · ${r.a.toLocaleString()}턴 · ${fmtDur(r.b)}` : ` · ${r.n}${k === "image" ? "장" : "회"}`}`,
      qty: r.n, unit: k === "image" ? "장" : "회", price: r.usd / Math.max(1, r.n), amount: r.usd };
  }));
  return { rate, saveRate, slides, billed, engine, total: billed + engine, engineSec, won, lines };
}
type CostData = ReturnType<typeof useCost>;

/** 상세 탭 — 확인 목록(통계 + 판단이 필요한 곳) · 기록 | 비용 카드, 아래에 비용 정산서(인쇄용) */
export function Detail({ job, onSlide, isAdmin = false }: { job: Job; onSlide: (n: number) => void; isAdmin?: boolean }) {
  const cost = useCost(job);
  const report = job.report;
  const checks = report?.checklist ?? [];
  const stats = report?.stats ?? [];
  const events = job.events ?? [];
  const bad = job.status === "failed" || job.status === "canceled";
  return (
    <div className="flex-1 min-h-0 overflow-auto scroll-thin px-8 py-6">
      <div className={`w-full grid gap-5 items-start print:hidden grid-cols-1${isAdmin ? " min-[1100px]:grid-cols-[minmax(0,1fr)_420px]" : ""}`}>
        <div className="flex flex-col gap-3.5 min-w-0">
          {job.error && <div className="px-4 py-3.5 rounded-md bg-[var(--color-warn-soft)] border border-[var(--color-warn-line)] font-mono text-[12.5px] leading-[1.6] text-[var(--color-warn)] whitespace-pre-wrap break-words">{job.error}</div>}
          {(report || !bad) ? (
            <div className="flex flex-col gap-3.5">
              <div className="font-bold text-[15px]">확인 목록 <span className="text-dim font-medium">{checks.length}</span></div>
              {stats.length > 0 && (
                <div className="grid border border-line rounded-md overflow-hidden" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(100px,1fr))" }}>
                  {stats.map((s) => (
                    <div key={s.label} className="px-3.5 py-3 border-r border-line-soft min-w-0">
                      <div className="text-[12.5px] text-dim truncate" title={s.label}>{s.label}</div>
                      <div className="text-[19px] font-bold mt-0.5 truncate" title={String(s.value)}>{s.value}</div>
                    </div>
                  ))}
                </div>
              )}
              {report?.summary && <div className="text-[13.5px] text-ink2 leading-[1.65] whitespace-pre-line break-keep">{report.summary}</div>}
              <div className="text-[13px] font-semibold text-dim mt-1">판단이 갈려 확인이 필요한 곳</div>
              {checks.length ? (
                <div className="border border-line rounded-md overflow-hidden">
                  {checks.map((c, i) => (
                    <div key={i} className="grid gap-2.5 px-3.5 py-3 border-b border-line-soft last:border-b-0" style={{ gridTemplateColumns: "44px minmax(0,1fr)" }}>
                      {c.slide
                        ? <button className={cn("border-0 bg-transparent p-0 text-left text-[13px] font-bold whitespace-nowrap self-start hover:underline", c.level === "warn" ? "text-[var(--color-warn)]" : "text-orange-d")} title="검토 탭에서 이 장 보기" onClick={() => onSlide(c.slide!)}>{c.slide}쪽</button>
                        : <span className={cn("text-[13px] font-bold whitespace-nowrap", c.level === "warn" ? "text-[var(--color-warn)]" : "text-faint")}>{c.level === "warn" ? "주의" : "전체"}</span>}
                      <div className="min-w-0">
                        <div className="font-bold">{c.title}</div>
                        {c.detail && <div className="text-[13.5px] text-ink2 mt-[3px] leading-[1.5] break-keep">{c.detail}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <div className="text-[13.5px] text-faint">확인이 필요한 곳이 없습니다.</div>}
              {report?.changes && report.changes.length > 0 && (
                <>
                  <div className="text-[13px] font-semibold text-dim mt-1">바뀐 것</div>
                  <ul className="m-0 p-0 list-none flex flex-col gap-1.5">{report.changes.map((c, i) => <li key={i} className="text-[13.5px] text-ink2 leading-[1.5] flex gap-2"><Ms name="check" size={17} className="text-ok mt-[2px]" />{c}</li>)}</ul>
                </>
              )}
            </div>
          ) : (
            <div className="text-[13.5px] text-faint">확인 목록이 없습니다 — 위 오류와 아래 기록을 보세요.</div>
          )}
          <div className="font-bold text-[15px] mt-1.5">기록 <span className="text-dim font-medium">{events.length}</span></div>
          {events.length ? (
            <div className="border border-line rounded-md overflow-hidden">
              {events.map((e) => (
                <div key={e.id} className="grid gap-3 px-3.5 py-[9px] border-b border-line-soft last:border-b-0" style={{ gridTemplateColumns: "72px minmax(0,1fr)" }}>
                  <span className="font-mono text-[12px] text-faint pt-[3px] whitespace-nowrap">{parseTs(e.ts)?.toTimeString().slice(0, 8)}</span>
                  <span className={cn("text-[13.5px] leading-[1.5] break-words", e.kind === "error" ? "text-[var(--color-warn)]" : e.kind === "warn" ? "text-orange-d" : "")}>{e.message}</span>
                </div>
              ))}
            </div>
          ) : <div className="text-[13.5px] text-faint">남은 기록이 없습니다.</div>}
        </div>
        {isAdmin && <CostCard cost={cost} />}  {/* 비용(달러)은 관리자만 — 사용자는 크레딧으로 본다 */}
      </div>
      {isAdmin && <Invoice job={job} cost={cost} />}
    </div>
  );
}

/** 비용 카드 — 단계별 금액, 구독으로 돌린 것은 배지, 실제 결제는 초록 */
function CostCard({ cost }: { cost: CostData }) {
  const { rate, saveRate, slides, billed, engine, total, won, lines } = cost;
  const [rateText, setRateText] = useState<string | null>(null);   // 지우는 중 0으로 바뀌지 않게 — 벗어나면 저장
  const commitRate = () => { const v = Number((rateText ?? "").replace(/\D/g, "")); if (rateText !== null) { if (v > 0) saveRate(v); setRateText(null); } };
  return (
    <div className="border border-line rounded-md overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-line-soft">
        <span className="font-bold text-[15px] flex-none">비용</span>
        <label className="flex items-center gap-1 text-[12.5px] text-dim whitespace-nowrap flex-none" title="원화 환산에 쓰는 환율 — 고칠 수 있습니다">1 USD =
          <input className="w-[52px] h-7 px-1 rounded-md border border-line bg-white font-mono text-[12.5px] text-right text-ink outline-none focus:border-orange" inputMode="numeric" aria-label="환율(원)"
            value={rateText ?? String(rate)} onChange={(e) => setRateText(e.target.value.replace(/\D/g, "").slice(0, 6))} onBlur={commitRate}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setRateText(null); }} />원</label>
        <button className="ml-auto border-0 bg-transparent p-0 text-orange-d font-semibold text-[13px] inline-flex items-center gap-1.5 whitespace-nowrap flex-none hover:underline" onClick={() => window.print()} title="비용 정산서를 인쇄하거나 PDF 로 저장합니다"><Ms name="picture_as_pdf" size={18} />정산서 PDF</button>
      </div>
      {lines.map((l, i) => (
        <div key={l.k + i} className="flex gap-2.5 px-4 py-3 border-b border-line-soft">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap"><span className="font-bold">{l.name}</span>{l.sub && <span className="whitespace-nowrap text-[12px] font-semibold text-[var(--color-ink-2)] bg-[var(--color-mark-soft)] rounded-md px-[5px] py-px">구독 · 청구 없음</span>}</div>
            <div className="text-[12.5px] text-dim mt-[3px] truncate" title={l.desc}>{l.short}</div>
          </div>
          <div className="text-right flex-none"><div className="font-bold">{usd(l.amount, 3)}</div><div className="text-[12.5px] text-faint">{won(l.amount)}</div></div>
        </div>
      ))}
      {!lines.length && <div className="px-4 py-6 text-center text-[13.5px] text-faint border-b border-line-soft">기록된 비용이 없습니다.<br />(제작 비용은 다음 제작부터 기록됩니다)</div>}
      <div className="px-4 py-3 flex flex-col gap-2 text-[13.5px] leading-[1.5] text-ink2">
        <div className="flex justify-between flex-wrap gap-x-3 gap-y-1"><span>구독으로 돌린 작업 (환산)</span><span className="whitespace-nowrap">{usd(engine, 3)} · {won(engine)}</span></div>
        <div className="flex justify-between flex-wrap gap-x-3 gap-y-1"><span>합계 (환산 포함)</span><span className="whitespace-nowrap">{usd(total, 2)} · {won(total)}</span></div>
        <div className="flex justify-between flex-wrap gap-x-3 gap-y-1"><span>장당 ({slides || "?"}장 기준)</span><span className="whitespace-nowrap">{slides ? `${usd(total / slides, 2)} · ${won(total / slides)}` : "—"}</span></div>
      </div>
      <div className="mx-4 mb-4 px-3.5 py-3 rounded-md bg-ok-soft flex justify-between items-center gap-3">
        <span className="font-bold text-ok whitespace-nowrap flex-none">실제 결제</span>
        <span className="text-right text-ok"><b className="text-[17px]">{usd(billed, 3)}</b><br /><span className="text-[12.5px]">{won(billed)}{slides ? ` · 장당 ${won(billed / slides)}` : ""}</span></span>
      </div>
    </div>
  );
}

/** 비용 정산서 — 청구서(인보이스) 양식. 「정산서 PDF」는 이것만 인쇄한다(index.css 의 print 규칙이 #pd-invoice 만 남긴다) */
function Invoice({ job, cost }: { job: Job; cost: CostData }) {
  const { rate, slides, billed, engine, total, engineSec, won, lines } = cost;
  const date = (parseTs(job.finished_at) ?? new Date()).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  const no = `PD-${(parseTs(job.created_at) ?? new Date()).toISOString().slice(0, 10).replace(/-/g, "")}-${job.id.slice(0, 6).toUpperCase()}`;
  const th = "text-[12px] font-bold text-dim uppercase tracking-[.04em] px-3 py-2.5 border-b-2 border-ink";
  const td = "px-3 py-3 border-b border-line align-top";
  const money = (v: number, d = 3) => <><span className="block font-bold font-mono text-[13px]">{usd(v, d)}</span><span className="block font-mono text-[12px] text-dim">{won(v)}</span></>;

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2.5 mb-3 print:hidden">
        <span className="font-bold text-[15px] whitespace-nowrap">비용 정산서</span>
        <span className="text-[13px] text-dim truncate min-w-0">인쇄하거나 PDF 로 저장할 수 있는 청구서 양식입니다 · 환율은 위 비용 카드에서 고칩니다</span>
        <button className="btn-back ml-auto" onClick={() => window.print()}><Ms name="print" size={19} />인쇄 · PDF 저장</button>
      </div>
      <div className="rounded-md bg-side border border-line p-6 print:p-0 print:border-0 print:bg-white">
        <div id="pd-invoice" className="max-w-[860px] mx-auto bg-white rounded-md shadow-[0_1px_3px_rgba(17,17,17,.08)] border border-line px-10 py-9">
          {/* 머리 */}
          <div className="flex items-start gap-4 pb-6 border-b-2 border-ink">
            <div>
              <div className="text-[26px] font-extrabold tracking-[-.02em] leading-none">비용 정산서</div>
              <div className="text-[12px] font-bold text-dim tracking-[.18em] mt-1.5">INVOICE · COST STATEMENT</div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-[15px] font-extrabold text-orange-d">powerDeck</div>
              <div className="text-[12px] font-medium text-dim">장표 디자인 변환 · solideos</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 py-5 text-[12.5px]">
            <div>
              <div className="text-[12px] font-bold text-dim mb-1">청구 대상</div>
              <div className="font-extrabold text-[14px]">{job.email ?? job.owner_label ?? "—"}</div>
              <div className="font-medium text-ink2 mt-1">작업 · {job.title}</div>
              <div className="font-medium text-dim">{job.kind === "design" ? <>내용<Arrow />시안<Arrow />장표</> : "초안 다듬기"} · {slides}장</div>
            </div>
            <div className="text-right">
              {[["문서 번호", no], ["발행일", date], ["적용 환율", `1 USD = ${rate.toLocaleString()}원`], ["결제 수단", "OpenRouter 크레딧"]].map(([l, v]) => (
                <div key={l} className="flex justify-end gap-3 py-[2px]"><span className="font-bold text-dim">{l}</span><span className="font-semibold min-w-[190px] font-mono text-[12px]">{v}</span></div>
              ))}
            </div>
          </div>

          {/* 내역 */}
          <table className="w-full border-collapse text-[12.5px]">
            <thead><tr>
              <th className={cn(th, "text-center w-[28px]")}>No</th><th className={cn(th, "text-center")}>항목 · 내역</th>
              <th className={cn(th, "text-center w-[70px]")}>수량</th><th className={cn(th, "text-center w-[110px]")}>단가</th><th className={cn(th, "text-center w-[120px]")}>금액</th>
            </tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.k + i} className={cn(l.sub && "bg-panel")}>
                  <td className={cn(td, "text-dim font-mono text-center")}>{i + 1}</td>
                  <td className={td}>
                    <div className="font-extrabold text-[13px]">{l.name}{l.sub && <span className="ml-2 text-[12px] font-bold text-[var(--color-ink-2)] bg-[var(--color-mark-soft)] rounded-md px-1.5 py-0.5 align-middle whitespace-nowrap">구독 사용 · 청구 없음(환산)</span>}</div>
                    <div className="text-[12px] font-medium text-dim mt-0.5 break-all">{l.desc}</div>
                  </td>
                  <td className={cn(td, "text-right font-semibold")}>{l.qty}{l.unit}</td>
                  <td className={cn(td, "text-right")}>{money(l.price)}</td>
                  <td className={cn(td, "text-right")}>{money(l.amount)}</td>
                </tr>
              ))}
              {!lines.length && <tr><td className={cn(td, "text-center text-dim py-10")} colSpan={5}>기록된 비용이 없습니다. (제작 비용은 다음 제작부터 기록됩니다)</td></tr>}
            </tbody>
          </table>

          {/* 합계 */}
          <div className="mt-5 flex justify-end">
            <div className="w-[380px] text-[12.5px]">
              <div className="flex items-center py-2 border-b border-line"><span className="font-bold text-ink2">소계 — 실제 청구 <span className="font-medium text-dim">(자료 요약·기획·시안)</span></span><span className="ml-auto text-right">{money(billed)}</span></div>
              <div className="flex items-center py-2 border-b border-line"><span className="font-bold text-ink2">구독으로 돌린 작업 <span className="font-medium text-dim">(기획·제작 환산)</span></span><span className="ml-auto text-right">{money(engine)}</span></div>
              <div className="flex items-center py-3 border-b-2 border-ink"><span className="font-extrabold text-[14px]">합계 <span className="text-[12px] font-medium text-dim">(환산 포함)</span></span>
                <span className="ml-auto text-right"><span className="block font-extrabold font-mono text-[18px] text-orange-d">{usd(total, 2)}</span><span className="block font-bold font-mono text-[13px]">{won(total)}</span></span></div>
              <div className="flex items-center py-2"><span className="font-bold text-ink2">장당 <span className="font-medium text-dim">({slides || "?"}장 기준)</span></span>
                <span className="ml-auto text-right">{slides ? money(total / slides, 2) : "—"}</span></div>
              <div className="flex items-center py-2 rounded-md bg-ok-soft px-3 mt-1"><span className="font-extrabold text-ok">실제 결제 금액</span>
                <span className="ml-auto text-right"><span className="block font-extrabold font-mono text-[15px] text-ok">{usd(billed, 3)}</span><span className="block font-bold font-mono text-[12px] text-ok">{won(billed)}{slides ? ` · 장당 ${won(billed / slides)}` : ""}</span></span></div>
            </div>
          </div>

          <div className="mt-7 pt-4 border-t border-line text-[12px] font-medium text-dim leading-[1.75]">
            <b className="text-ink2">비고</b><br />
            1. 자료 요약·기획·시안 금액은 OpenRouter 가 호출마다 알려 준 실제 청구액이며, 다시 만든 횟수를 포함합니다.<br />
            2. '구독 사용' 표시가 붙은 항목(장표 제작, 설정에 따라 기획·자료 요약)은 엔진 PC 의 Claude 구독(Max)으로 수행되어 별도 청구가 없습니다. 표기 금액은 같은 작업을 API 로 수행했을 때의 환산액입니다{engineSec > 0 && ` (제작 시간 합계 ${fmtDur(engineSec)})`}.<br />
            3. 원화 금액은 위 적용 환율로 환산한 참고 금액입니다.
          </div>
        </div>
      </div>
    </div>
  );
}

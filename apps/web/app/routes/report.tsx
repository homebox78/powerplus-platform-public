// 분석 보고서 /r/:token — powerMCP(powerplus_publish_report)·웹이 남긴 답을 사이트 디자인으로 한 장에 보여 준다(사용자 2026-10-08).
// 서버가 저장할 때 자산 이름·썸네일·키워드를 다시 읽고, 비회원이 못 보는 등급은 잠금 칸으로 내려 준다 — 화면은 받은 대로 그린다.
// 카드 문법은 powerAssets 둘러보기(ThumbFrame 20px·ground-3 4.5% 안쪽 여백 + 흰 판)와 같다.
import { useQuery } from "@tanstack/react-query";
import { FileText, Link2, Lock, Printer } from "lucide-react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { BrandName } from "@/components/hb/brand-name";
import { Copy } from "@/components/hb/copy";
import { Tag } from "@/components/hb/tag";
import { ThumbFrame } from "@/components/hb/thumb-frame";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiFetch } from "@/lib/api";
import type { Route } from "./+types/report";

type AssetItem = {
  id: string;
  reason?: string;
  label?: string;
  name?: string | null;
  category?: string;
  category_ko?: string;
  set?: string | null;
  keywords?: string[];
  thumb_url?: string;
  url?: string;
  locked?: boolean;
  missing?: boolean;
};
type Block =
  | { type: "assets"; heading?: string; note?: string; items: AssetItem[] }
  | { type: "text"; heading?: string; body: string }
  | { type: "list"; heading?: string; items: string[] }
  | { type: "table"; heading?: string; columns: string[]; rows: string[][] };
type Report = {
  id: string;
  title: string;
  module: string;
  author: string;
  created_at: string;
  question?: string;
  summary?: string;
  highlights?: string[];
  blocks: Block[];
  via?: string;
  mine: boolean;
};

const MODULE_LABEL: Record<string, string> = { assets: "powerAssets", deck: "powerDeck", mock: "powerMock", guide: "powerGuide", all: "powerPlus" };

export const meta: Route.MetaFunction = () => [{ title: "분석 보고서 — powerPlus" }, { name: "robots", content: "noindex" }];

export default function ReportPage() {
  const { token = "" } = useParams();
  const q = useQuery({ queryKey: ["report", token], queryFn: () => apiFetch<Report>(`/reports/${encodeURIComponent(token)}`), retry: false });

  if (q.isLoading) {
    return (
      <div className="container-page pb-16 pt-10">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-4 h-10 w-[min(560px,100%)]" />
        <Skeleton className="mt-8 h-28 w-full rounded-card" />
        <div className="mt-10 grid grid-cols-2 gap-6 md:grid-cols-4 xl:grid-cols-6">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-panel" />)}</div>
      </div>
    );
  }
  if (q.isError || !q.data) {
    // 공개 범위가 '임직원만'·'만든 사람만'인 보고서(O-41)는 403 — 지워진 보고서와 다르게 로그인 안내를 준다
    const err = q.error instanceof ApiError ? q.error : null;
    const denied = err?.status === 403;
    return (
      <div className="container-page flex flex-col items-center py-28 text-center">
        {denied ? <Lock className="size-8 text-ink-4" aria-hidden /> : <FileText className="size-8 text-ink-4" aria-hidden />}
        <h1 className="mt-4 text-2xl font-bold">{denied ? "볼 수 있는 사람이 정해진 보고서입니다." : "보고서를 열 수 없습니다."}</h1>
        <Copy className="mt-2 text-md text-ink-3" text={denied && err ? `${err.message} ${err.hint ?? ""}`.trim() : "링크가 잘못됐거나, 기간이 지났거나, 만든 사람이 지운 보고서입니다."} />
        {denied && <Link to={`/login?next=${encodeURIComponent(`/r/${token}`)}`} className="mt-6 text-md font-semibold underline underline-offset-4">로그인</Link>}
        <Link to="/" className="mt-6 text-md font-semibold underline underline-offset-4">powerPlus 둘러보기</Link>
      </div>
    );
  }
  const r = q.data;
  const assetsN = r.blocks.reduce((n, b) => n + (b.type === "assets" ? b.items.length : 0), 0);
  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => toast.success("보고서 링크를 복사했습니다."));
  };

  return (
    <article className="container-page pb-16 pt-10 print:pt-0">
      {/* 머리 */}
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-4">
        <Tag tone="ink">분석 보고서</Tag>
        <span><BrandName name={MODULE_LABEL[r.module] ?? "powerPlus"} /> · {r.via === "mcp" ? "powerMCP 로 작성" : "웹에서 작성"} · {r.created_at.slice(0, 16).replace("T", " ").replaceAll("-", ".")}</span>
      </div>
      <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-start">
        <h1 className="min-w-0 flex-1 break-keep text-2xl font-extrabold leading-[1.3] tracking-[-0.03em] md:text-4xl">{r.title}</h1>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={copyLink}><Link2 aria-hidden />링크 복사</Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer aria-hidden />인쇄·PDF</Button>
        </div>
      </div>

      {/* 질문·요약 */}
      {(r.question || r.summary) && (
        <section className="mt-5 grid gap-4 rounded-card bg-ground-2 p-6 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)] md:p-8">
          {r.question && (
            <div>
              <p className="text-xs font-semibold tracking-wide text-ink-4">받은 질문</p>
              <p className="mt-2 whitespace-pre-line break-keep text-md font-semibold leading-[1.6]">{r.question}</p>
            </div>
          )}
          {r.summary && (
            <div className={r.question ? "" : "md:col-span-2"}>
              <p className="text-xs font-semibold tracking-wide text-ink-4">요약</p>
              <Copy className="mt-2 text-md leading-[1.7] text-ink-2" text={r.summary} />
            </div>
          )}
        </section>
      )}

      {/* 한눈에 — 숫자 */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {(r.highlights?.length ? r.highlights : [`항목 ${r.blocks.length}개`, ...(assetsN ? [`추천 자산 ${assetsN}개`] : [])]).map((h, i) => (
          <div key={i} className="rounded-card border border-line px-4 py-3 text-sm font-semibold text-ink-2">{h}</div>
        ))}
      </div>

      {/* 본문 칸 */}
      <div className="mt-12 flex flex-col gap-14">
        {r.blocks.map((b, i) => (
          <section key={i} className="break-inside-avoid-page">
            {b.heading && (
              <div className="flex items-baseline gap-3 border-b border-line pb-3">
                <span className="text-sm font-bold text-point-ink">{String(i + 1).padStart(2, "0")}</span>
                <h2 className="break-keep text-xl font-bold tracking-[-0.02em]">{b.heading}</h2>
                {b.type === "assets" && <span className="text-sm text-ink-4">{b.items.length}개</span>}
              </div>
            )}
            {b.type === "assets" && <AssetBlock b={b} />}
            {b.type === "text" && <Copy className="mt-5 max-w-[860px] text-md leading-[1.8] text-ink-2" text={b.body} />}
            {b.type === "list" && (
              <ul className="mt-5 flex max-w-[860px] flex-col gap-2.5">
                {b.items.map((t, k) => (
                  <li key={k} className="flex gap-3 text-md leading-[1.7] text-ink-2"><span className="mt-[11px] size-1.5 shrink-0 rounded-full bg-ink-3" aria-hidden /><span className="break-keep">{t}</span></li>
                ))}
              </ul>
            )}
            {b.type === "table" && (
              <div className="mt-5 overflow-hidden rounded-card border border-line">
                <table className="w-full table-fixed text-sm">
                  <thead className="bg-ground-2"><tr>{b.columns.map((c, k) => <th key={k} className="px-[15px] py-3 text-center font-semibold text-ink-2">{c}</th>)}</tr></thead>
                  <tbody>
                    {b.rows.map((row, k) => (
                      <tr key={k} className="border-t border-line">
                        {row.map((c, m) => <td key={m} className={`break-keep px-[15px] py-3 align-top text-ink-2 ${c.length <= 6 ? "text-center" : "text-left"}`}>{c}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
      </div>

      <footer className="mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 text-sm text-ink-4">
        <span>{r.author} 님이 만든 보고서 · 링크를 아는 사람만 볼 수 있습니다.</span>
        <Link to="/powermcp" className="inline-block py-1.5 -my-1.5 font-semibold text-ink-2 underline underline-offset-4 print:hidden">powerMCP 로 나도 만들기</Link>
      </footer>
    </article>
  );
}

function AssetBlock({ b }: { b: Extract<Block, { type: "assets" }> }) {
  return (
    <>
      {b.note && <Copy className="mt-4 text-md text-ink-3" text={b.note} />}
      <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
        {b.items.map((it, k) => {
          const card = (
            <>
              <ThumbFrame radius="lg" ratio="auto" className="bg-ground-3 p-[4.5%]">
                <span className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
                  {it.thumb_url && !it.locked ? (
                    <img src={it.thumb_url} alt={it.name ?? ""} loading="lazy" className="size-full object-contain p-[10%]" />
                  ) : (
                    <span className="flex flex-col items-center gap-1.5 text-xs text-ink-4"><Lock className="size-5" aria-hidden />{it.missing ? "지워진 자산" : "회원 전용"}</span>
                  )}
                </span>
              </ThumbFrame>
              <div className="mt-3 px-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-point-ink">{String(k + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 truncate text-sm font-semibold">{it.label || it.name || it.category_ko || "자산"}</span>
                </div>
                {it.reason && <p className="mt-1 break-keep text-xs leading-[1.6] text-ink-3">{it.reason}</p>}
                {!!it.keywords?.length && <p className="mt-1.5 truncate text-xs text-ink-4">{it.keywords.map((w) => `#${w}`).join(" ")}</p>}
              </div>
            </>
          );
          return it.url && !it.locked ? (
            <Link key={k} to={it.url} className="group block min-w-0">{card}</Link>
          ) : (
            <div key={k} className="min-w-0">{card}</div>
          );
        })}
      </div>
    </>
  );
}

// 출처: homebox-handoff apps/web/app/components/hb/doc-page.tsx — 그대로(초안 표시 draft 줄 추가, 표 가로 스크롤 대신 줄바꿈)
import { useEffect, useState } from "react";
import { Copy } from "@/components/hb/copy";
import { cn } from "@/lib/utils";

// 정책·안내 문서 공통 레이아웃 — Mobbin Privacy/Terms 구조 (사용자 참조 2026-09-24):
// 큰 제목 + 최종 수정일 → [본문 720px | 오른쪽 "이 페이지" 목차(스크롤 위치 강조)]. 문장은 Copy 규칙(마침표마다 줄바꿈).
export interface DocBlock { id: string; title: string; paras?: string[]; items?: string[]; table?: { head: string[]; rows: string[][]; center?: boolean } }
export interface DocSpec { title: string; lead?: string; updated: string; blocks: DocBlock[]; /** 법무 검토 전 초안이면 그 안내 한 줄 */ draft?: string }

export function DocPage({ doc, children, meta }: { doc: DocSpec; children?: React.ReactNode; /** "최종 수정일" 자리를 바꿔 끼운다(정책 문서 = 버전 고르기) */ meta?: React.ReactNode }) {
  const [active, setActive] = useState(doc.blocks[0]?.id ?? "");
  useEffect(() => {
    const els = doc.blocks.map((b) => document.getElementById(b.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver((ents) => {
      const vis = ents.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setActive(vis[0].target.id);
    }, { rootMargin: "-96px 0px -60% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [doc]);

  return (
    <div className="container-page pb-14 pt-16">
      <header className="mx-auto max-w-(--container-hb)">
        <h1 className="text-5xl font-extrabold tracking-[-0.03em]">{doc.title}</h1>
        {doc.lead && <Copy className="mt-4 max-w-[720px] text-lg leading-[1.7] text-ink-3" text={doc.lead} />}
        {meta ?? <p className="mt-4 text-sm text-ink-4">최종 수정일 {doc.updated}</p>}
      </header>
      <div className="mx-auto mt-14 grid max-w-(--container-hb) grid-cols-1 gap-14 lg:grid-cols-[minmax(0,1fr)_240px]">
        <article className="min-w-0">
          {/* 초안 안내는 아래 삭제요청 상자와 같은 본문 폭으로(사용자 2026-10-07 "가로 넓이 맞추기") */}
          {doc.draft && <Copy className="mb-6 rounded-panel bg-warn-soft px-6 py-5 text-md leading-[1.7] text-warn" text={doc.draft} />}
          {children}
          <DocBlocks blocks={doc.blocks} />
        </article>
        <nav className="sticky-follow sticky top-[calc(var(--hdr-offset)+40px)] hidden self-start lg:block" aria-label="이 페이지">
          <div className="text-sm font-semibold text-ink-4">이 페이지</div>
          <ul className="mt-3 flex flex-col gap-1 border-l border-line">
            {doc.blocks.map((b) => (
              <li key={b.id}><a href={`#${b.id}`} className={cn("-ml-px block border-l-2 py-1.5 pl-4 text-sm transition-colors", active === b.id ? "border-ink font-semibold text-ink" : "border-transparent text-ink-3 hover:text-ink")}>{b.title}</a></li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}

/** 문서 절 목록(제목·문단·항목·표) — DocPage 와 문서 틀(DocsFrame) 양쪽에서 쓴다 */
export function DocBlocks({ blocks }: { blocks: DocBlock[] }) {
  return (
    <>
          {blocks.map((b) => (
            <section key={b.id} id={b.id} className="scroll-mt-19 border-t border-line py-7 first:border-t-0 first:pt-0">
              <h2 className="text-2xl font-bold tracking-[-0.02em]">{b.title}</h2>
              {b.paras?.map((p, i) => <Copy key={i} className="mt-4 text-md leading-[1.8] text-ink-2" text={p} />)}
              {b.items && (
                <ul className="mt-4 flex flex-col gap-2.5">
                  {b.items.map((it, i) => <li key={i} className="flex gap-3 text-md leading-[1.7] text-ink-2"><span className="mt-[11px] size-1.5 shrink-0 rounded-full bg-ink" aria-hidden /><Copy as="span" text={it} /></li>)}
                </ul>
              )}
              {b.table && (
                <div className="mt-5 overflow-hidden rounded-2xl border border-line">
                  <table className="w-full text-sm [overflow-wrap:anywhere]">
                    <thead className="bg-ground-3"><tr>{b.table.head.map((h) => <th key={h} className="px-4 py-3 text-center font-semibold">{h}</th>)}</tr></thead>
                    {/* 셀 정렬(사용자 지시 2026-09-24): 공백 뺀 6자 이하 짧은 값의 칸은 가운데, 긴 문장 칸은 왼쪽 — 한 칸 안에서 섞이지 않게 칸(열) 단위로 판정 */}
                    <tbody>{b.table.rows.map((r, i) => <tr key={i} className="border-t border-line">{r.map((c, j) => <td key={j} className={cn("px-4 py-3 align-top", b.table!.center || shortCol(b.table!.rows, j) ? "text-center" : "text-left", j === 0 ? "font-semibold" : "text-ink-3")}>{c}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
    </>
  );
}

/** 칸(열) 정렬 판정: 칸의 과반이 공백 뺀 6자 이하이고 10자를 넘는 값이 없으면 가운데("삭제요청·문의" 7자도 같은 칸이면 함께 가운데) */
function shortCol(rows: ReadonlyArray<ReadonlyArray<unknown>>, j: number): boolean {
  const lens = rows.map((r) => String(r[j] ?? "").replace(/\s/g, "").length);
  return lens.filter((n) => n <= 6).length * 2 >= lens.length && lens.every((n) => n <= 10);
}

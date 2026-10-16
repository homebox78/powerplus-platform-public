// 진행 순서 카드 — 그림(왼쪽, 정사각) + 번호·제목·설명. 모듈 랜딩 4곳이 같이 쓴다(디자인 점검 리포트 2026-10-08, 시안 02~05).
// 그림: public/img/steps/<모듈>-<번호>-v3.html — 움직이는 단계 그림(원본 docs/powerplus-cards/steps, 2026-10-11 사용자 제작). 링크가 있으면 카드 전체가 눌린다.
import { Link } from "react-router";
import { MobileCarousel } from "@/components/hb/mobile-carousel";
import { Copy } from "@/components/hb/copy";
import { cn } from "@/lib/utils";

interface StepItem { title: string; desc: string; img: string; to?: string }

export function StepCards({ items, cols = 3, className }: { items: StepItem[]; cols?: 3 | 4; className?: string }) {
  return (
    <MobileCarousel as="ol" label="단계" className={cn("mt-6 grid grid-cols-1 gap-4 md:grid-cols-2", cols === 4 ? "xl:grid-cols-4" : "xl:grid-cols-3", className)}>
      {items.map((s, i) => {
        const body = (
          <>
            <iframe src={s.img} title="" aria-hidden tabIndex={-1} loading="lazy" className="pointer-events-none min-h-[168px] w-[168px] shrink-0 self-stretch border-0 max-sm:min-h-28 bg-ground-2 max-sm:w-28" />
            <span className="flex min-w-0 flex-col justify-center px-5 py-5">
              <span className="text-sm font-bold text-ink-4 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
              <span className="mt-1 block text-lg font-bold leading-snug">{s.title}</span>
              <span className="mt-1.5 block text-sm leading-[1.7] text-ink-3"><Copy as="span" text={s.desc} /></span>
            </span>
          </>
        );
        const box = "flex overflow-hidden rounded-panel border border-line bg-ground";
        return (
          <li key={s.title}>
            {s.to ? <Link to={s.to} className={cn(box, "h-full transition-colors hover:bg-ground-2")}>{body}</Link> : <div className={cn(box, "h-full")}>{body}</div>}
          </li>
        );
      })}
    </MobileCarousel>
  );
}

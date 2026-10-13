// 출처: homebox-handoff apps/web/app/components/hb/section-heading.tsx (2026-10-06 그대로 이식 — 플랫폼 디자인 베이스 = 홈박스)
import { ChevronRight } from "lucide-react";
import { Link } from "react-router";

/** 홈·상세의 섹션 제목 줄: h2 26/800 + 우측 "전체 보기 >" (design/generator lib.h2) */
export function SectionHeading({ title, to, more, size = 26 }: { title: string; to?: string; more?: string; size?: 26 | 24 }) {
  return (
    <div className="flex items-center">
      <h2 className="text-[26px] font-extrabold leading-[1.25] tracking-[-0.025em]" style={{ fontSize: size }}>{title}</h2>
      <span className="flex-1" />
      {to && (
        <Link to={to} className="inline-flex min-h-8 items-center gap-1 py-1.5 -my-1.5 text-base font-semibold text-ink-3 hover:text-ink">
          {more ?? "전체 보기"}<ChevronRight className="size-3.5" aria-hidden />
        </Link>
      )}
    </div>
  );
}

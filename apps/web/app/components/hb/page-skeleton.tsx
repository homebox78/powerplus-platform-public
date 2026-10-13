import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// 페이지 로딩 골격 (shadcn Skeleton, 사용자 지시 2026-09-24 "skeleton 적용"): "불러오는 중…" 텍스트 대신 실제 레이아웃 형태로.
// detail = 상세(제목줄 + 탭 + 큰 프리뷰), form = 계정/폼(제목 + 패널 3개), viewer = 화면 뷰어(좌 이미지 + 우 패널), list = 카드 그리드, rows = 목록 줄
export function PageSkeleton({ kind = "detail", className }: { kind?: "detail" | "form" | "viewer" | "list"; className?: string }) {
  if (kind === "form") return (
    <div className={cn("container-hb pb-12 pt-10", className)} aria-busy="true" aria-label="불러오는 중">
      <Skeleton className="h-10 w-40 rounded-xl" />
      <div className="mt-8 flex flex-col gap-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[132px] w-full rounded-panel" />)}</div>
    </div>
  );
  if (kind === "viewer") return (
    <div className={cn("container-hb grid grid-cols-1 gap-8 pb-12 pt-8 lg:grid-cols-[1fr_360px]", className)} aria-busy="true" aria-label="불러오는 중">
      <Skeleton className="aspect-[16/10] w-full rounded-panel" />
      <div className="flex flex-col gap-3"><Skeleton className="h-8 w-2/3 rounded-lg" /><Skeleton className="h-5 w-1/2 rounded-md" />{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-card" />)}</div>
    </div>
  );
  if (kind === "list") return (
    <div className={cn("grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-3", className)} aria-busy="true" aria-label="불러오는 중">
      {Array.from({ length: 6 }, (_, i) => <div key={i} className="flex flex-col gap-3"><Skeleton className="aspect-[16/10] w-full rounded-card" /><Skeleton className="h-5 w-1/2 rounded-md" /><Skeleton className="h-4 w-1/3 rounded-md" /></div>)}
    </div>
  );
  return (
    <div className={cn("container-hb pb-12 pt-8", className)} aria-busy="true" aria-label="불러오는 중">
      <Skeleton className="h-4 w-24 rounded-md" />
      <div className="mt-4 flex items-center gap-4"><Skeleton className="size-14 rounded-ci" /><div className="flex flex-col gap-2"><Skeleton className="h-9 w-64 rounded-lg" /><Skeleton className="h-4 w-40 rounded-md" /></div></div>
      <div className="mt-8 flex gap-6 border-b border-line pb-3">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-5 w-16 rounded-md" />)}</div>
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]"><Skeleton className="aspect-[16/10] w-full rounded-panel" /><div className="flex flex-col gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-card" />)}</div></div>
    </div>
  );
}

/** 목록 줄 골격 (팔레트·드롭다운 등 작은 리스트용). dark 면 어두운 배경 위 */
export function RowsSkeleton({ n = 6, dark, className }: { n?: number; dark?: boolean; className?: string }) {
  return <ul className={cn("flex flex-col gap-1", className)} aria-busy="true" aria-label="불러오는 중">{Array.from({ length: n }, (_, i) => <li key={i} className="flex items-center gap-3 px-2 py-2.5"><Skeleton className={cn("h-4 rounded-md", dark && "bg-white/10", i % 3 === 0 ? "w-32" : i % 3 === 1 ? "w-24" : "w-40")} /><Skeleton className={cn("ml-auto h-3 w-8 rounded-md", dark && "bg-white/10")} /></li>)}</ul>;
}

// 에셋 카드 격자 — 썸네일·삽입·유사·세트 버튼과 빈 상태 안내. 출처: powerPlus addin/src/taskpane/components/AssetGrid.tsx.
import * as React from "react";
import type { Asset } from "../data/mockAssets";
import AuthImg from "./AuthImg";

interface Props {
  assets: Asset[];
  insertingId: string | null;
  onInsert: (asset: Asset) => void;
  isFavorite: (id: string) => boolean;
  onToggleFavorite: (id: string) => void;
  /** 전달 시 카드에 "유사" 버튼 노출 → 비슷한 자산 추천 */
  onShowSimilar?: (asset: Asset) => void;
  /** 전달 시 카드 우측 하단에 세트 버튼 노출 → 같은 스타일 세트 모달 */
  onShowSet?: (asset: Asset) => void;
  emptyTitle?: string;
  emptySub?: string;
  /** 빈 상태 하단 액션 버튼(예: 무결과 → "이 키워드로 요청하기") */
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  /** 보조 액션(예: 무결과 → "전체 보기"로 검색 해제) */
  emptyBackLabel?: string;
  onEmptyBack?: () => void;
  loading?: boolean;
  /**
   * 카드 최소 폭(px). 작업창을 넓히면 이 폭을 채우는 만큼 열이 늘어난다
   * (아이콘/일러스트는 작게 = 더 많은 열, 사진/장표는 크게).
   */
  minCard?: number;
}

/** 작업창 폭을 실측해 한 줄 열 수를 정한다(2~7열). */
function useGridCols(minCard: number) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [cols, setCols] = React.useState(2);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const GAP = 11; // .grid gap
    const calc = (w: number) => {
      if (!w) return;
      const n = Math.floor((w + GAP) / (minCard + GAP));
      setCols(Math.max(1, Math.min(7, n)));
    };
    // contentRect.width = padding 제외한 실제 카드 영역 폭
    const ro = new ResizeObserver((es) => calc(es[0].contentRect.width));
    ro.observe(el);
    calc(el.clientWidth - 30);
    return () => ro.disconnect();
  }, [minCard]);
  return { ref, cols };
}

// 카드 썸네일 배경: 약간의 미색 — 흰색 로고도 묻히지 않고 보이도록 (사용자 요청)
const CARD_BG = "#F4F4F4";

// 장표(ppt) 유형 배지 라벨
const PPT_PAGE_LABEL: Record<string, string> = {
  cover: "표지", toc: "목차", divider: "간지", content: "콘텐츠",
  greeting: "인사말", qa: "Q&A", etc: "기타",
};
function pptBadge(a: Asset): string | null {
  if (a.slide_kind === "package") return "패키지";
  if (a.slide_kind === "single" && a.slide_page) return PPT_PAGE_LABEL[a.slide_page] || "기타";
  return null;
}

// 즐겨찾기 = 북마크(스크랩) 아이콘
const BookmarkIcon = ({ on }: { on: boolean }) => (
  <svg width="14" height="15" viewBox="0 0 24 24" fill={on ? "#E46B37" : "none"} stroke={on ? "#E46B37" : "#B5B5B5"} strokeWidth={on ? 1.2 : 1.6}>
    <path
      d="M18 21l-6-4.2L6 21V5.2A2.2 2.2 0 0 1 8.2 3h7.6A2.2 2.2 0 0 1 18 5.2z"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  </svg>
);

export default function AssetGrid({
  assets,
  insertingId,
  onInsert,
  isFavorite,
  onToggleFavorite,
  onShowSet,
  emptyTitle = "자료가 없어요",
  emptySub = "다른 카테고리를 선택해 보세요.",
  emptyActionLabel,
  onEmptyAction,
  emptyBackLabel,
  onEmptyBack,
  loading = false,
  minCard = 122,
}: Props) {
  const { ref: gridRef, cols } = useGridCols(minCard);
  const gridStyle = { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } as React.CSSProperties;
  // 첫 로딩 → 스켈레톤
  if (loading && assets.length === 0) {
    return (
      <div ref={gridRef} className="grid" style={gridStyle} aria-busy="true" aria-label="불러오는 중">
        {Array.from({ length: cols * 3 }).map((_, i) => (
          <div key={i} className="card card--skeleton">
            <div className="skel skel--thumb" />
          </div>
        ))}
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="empty">
        <img src="assets/state-empty-v2.webp" alt="" style={{ width: 150, height: 150, objectFit: "cover", borderRadius: 12, marginBottom: 6 }} />
        <div className="empty__title">{emptyTitle}</div>
        <div className="empty__sub" style={{ whiteSpace: "pre-line" }}>{emptySub}</div>
        {emptyActionLabel && onEmptyAction && (
          <button type="button" className="empty__action" onClick={onEmptyAction}>
            {emptyActionLabel}
          </button>
        )}
        {emptyBackLabel && onEmptyBack && (
          <button type="button" className="empty__back" onClick={onEmptyBack}>
            {emptyBackLabel}
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={gridRef} className="grid" style={gridStyle}>
      {assets.map((a) => {
        const fav = isFavorite(a.id);
        const label = a.name || a.tags?.[0] || a.id;
        const inserting = insertingId === a.id;
        return (
          <div key={a.id} className="card">
            <button
              className="card__btn"
              title={a.tags?.length ? a.tags.slice(0, 4).join(" · ") : label}
              disabled={inserting}
              onClick={() => onInsert(a)}
            >
              <div className="card__thumb" style={{ background: CARD_BG }}>
                {a.image_url || a.thumb_url ? (
                  // 목록은 썸네일(빠른 로딩), 삽입은 원본(useInsert가 image_url 사용)
                  <AuthImg src={a.thumb_url || a.image_url} alt={label} decoding="async" />
                ) : a.svg ? (
                  // 구(mock) svg 자산은 <img data:URI>로 렌더 — raw HTML 주입(XSS) 없이 표시만 (img 내 SVG는 스크립트 실행 불가)
                  <img
                    className="card__svg"
                    src={`data:image/svg+xml;utf8,${encodeURIComponent(a.svg)}`}
                    alt={label}
                    loading="lazy"
                  />
                ) : null}
                {inserting && (
                  <span className="card__inserting" aria-hidden>
                    <span className="spinner" />
                  </span>
                )}
              </div>
            </button>
            {/* 우측 하단: 같은 스타일 세트 모아 보기(호버 시 노출) */}
            {onShowSet && (
              <button
                className="card__set"
                title="같은 스타일 세트 보기"
                aria-label="같은 스타일 세트 보기"
                onClick={() => onShowSet(a)}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1.6" />
                  <rect x="14" y="3" width="7" height="7" rx="1.6" />
                  <rect x="3" y="14" width="7" height="7" rx="1.6" />
                  <rect x="14" y="14" width="7" height="7" rx="1.6" />
                </svg>
              </button>
            )}
            <button
              className={"card__fav" + (fav ? " card__fav--on" : "")}
              title={fav ? "즐겨찾기 해제" : "즐겨찾기 추가"}
              aria-pressed={fav}
              aria-label={fav ? "즐겨찾기 해제" : "즐겨찾기 추가"}
              onClick={() => onToggleFavorite(a.id)}
            >
              <BookmarkIcon on={fav} />
            </button>
            {(() => {
              const badge = pptBadge(a);
              if (!badge) return null;
              const isPkg = a.slide_kind === "package";
              return (
                <span
                  className="card__type"
                  style={{
                    position: "absolute",
                    left: 6,
                    top: 6,
                    padding: "2px 8px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    lineHeight: "16px",
                    color: "#fff",
                    background: isPkg ? "#E46B37" : "#333333",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
                    pointerEvents: "none",
                  }}
                >
                  {badge}
                </span>
              );
            })()}
          </div>
        );
      })}
    </div>
  );
}

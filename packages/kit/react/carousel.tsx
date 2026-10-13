"use client";
// 캐러셀 — KRDS 「캐러셀」(비주얼 배너·배너형) · shadcn Carousel 과 비슷한 사용법 (직접 구현, swiper 없음)
//   <Carousel aria-label="주요 소식" autoplay={5000}>
//     <CarouselContent>
//       <CarouselItem>…</CarouselItem>
//       <CarouselItem>…</CarouselItem>
//     </CarouselContent>
//     <CarouselControls moreHref="/news" />
//   </Carousel>
// 조작부(KRDS .swiper-indicator): 현재/전체 표시 · 정지/재생 · 이전 · 다음 · 더 보기.
// 자동 넘김은 마우스를 올리거나 안에 포커스가 있으면 멈추고, 사용자가 「움직임 줄이기」를 켰으면 처음부터 멈춘 상태로 시작한다.
// 보이지 않는 슬라이드는 inert — Tab 으로 들어가지 않는다. 자동 넘김 중이 아닐 때만 바뀐 슬라이드를 읽어 준다(aria-live).
import * as React from "react";
import { cx } from "./utils";

interface Ctx {
  index: number;
  count: number;
  setCount: (n: number) => void;
  go: (i: number) => void;
  loop: boolean;
  autoplay: number;
  playing: boolean;
  setPlaying: (v: boolean) => void;
}
const CarouselCtx = React.createContext<Ctx | null>(null);
const ItemIndex = React.createContext(0);
const useCarousel = () => {
  const c = React.useContext(CarouselCtx);
  if (!c) throw new Error("Carousel 안에서만 쓸 수 있습니다");
  return c;
};

const prefersReduced = () =>
  typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export interface CarouselProps extends React.HTMLAttributes<HTMLElement> {
  /** 자동 넘김 간격(ms). 0 이면 자동 넘김 없음(기본) */
  autoplay?: number;
  /** 끝에서 처음으로 이어진다 (기본 true) */
  loop?: boolean;
  defaultIndex?: number;
  /** 슬라이드가 바뀌면 부른다 */
  onIndexChange?: (index: number) => void;
}

export const Carousel = React.forwardRef<HTMLElement, CarouselProps>(function Carousel(
  { autoplay = 0, loop = true, defaultIndex = 0, onIndexChange, className, children, "aria-label": label = "슬라이드", ...props },
  ref,
) {
  const [index, setIndex] = React.useState(defaultIndex);
  const [count, setCount] = React.useState(0);
  const [playing, setPlaying] = React.useState(autoplay > 0 && !prefersReduced());
  const [hover, setHover] = React.useState(false);
  const [focusIn, setFocusIn] = React.useState(false);

  const go = React.useCallback(
    (i: number) => {
      setIndex((cur) => {
        if (count < 1) return cur;
        const next = loop ? (i + count) % count : Math.min(count - 1, Math.max(0, i));
        if (next !== cur) onIndexChange?.(next);
        return next;
      });
    },
    [count, loop, onIndexChange],
  );

  React.useEffect(() => {
    if (!autoplay || !playing || hover || focusIn || count < 2) return;
    const t = window.setInterval(() => {
      setIndex((cur) => {
        if (!loop && cur >= count - 1) return cur;
        return (cur + 1) % count;
      });
    }, autoplay);
    return () => window.clearInterval(t);
  }, [autoplay, playing, hover, focusIn, count, loop]);

  return (
    <CarouselCtx.Provider value={{ index, count, setCount, go, loop, autoplay, playing, setPlaying }}>
      <section
        ref={ref}
        aria-roledescription="캐러셀"
        aria-label={label}
        className={cx("hb-carousel", className)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setFocusIn(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusIn(false);
        }}
        {...props}
      >
        {children}
      </section>
    </CarouselCtx.Provider>
  );
});

export const CarouselContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function CarouselContent(
  { className, children, ...props },
  ref,
) {
  const c = useCarousel();
  const items = React.Children.toArray(children);
  const n = items.length;
  React.useEffect(() => c.setCount(n), [n]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={ref} className="hb-carousel-viewport" aria-live={c.playing ? "off" : "polite"}>
      <div className={cx("hb-carousel-track", className)} style={{ transform: `translateX(-${c.index * 100}%)` }} {...props}>
        {items.map((child, i) => (
          <ItemIndex.Provider key={i} value={i}>
            {child}
          </ItemIndex.Provider>
        ))}
      </div>
    </div>
  );
});

export const CarouselItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function CarouselItem(
  { className, ...props },
  ref,
) {
  const c = useCarousel();
  const i = React.useContext(ItemIndex);
  const on = i === c.index;
  return (
    <div
      ref={ref}
      role="group"
      aria-roledescription="슬라이드"
      aria-label={`${i + 1} / ${c.count}`}
      aria-hidden={!on}
      inert={!on}
      className={cx("hb-carousel-item", className)}
      {...props}
    />
  );
});

export interface CarouselControlsProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 현재/전체 숫자를 보인다 (기본 true) */
  counter?: boolean;
  /** 「더 보기」 링크 주소 */
  moreHref?: string;
}

export const CarouselControls = React.forwardRef<HTMLDivElement, CarouselControlsProps>(function CarouselControls(
  { counter = true, moreHref, className, ...props },
  ref,
) {
  const c = useCarousel();
  const atStart = !c.loop && c.index <= 0;
  const atEnd = !c.loop && c.index >= c.count - 1;
  return (
    <div ref={ref} className={cx("swiper-indicator", "hb-carousel-controls", className)} {...props}>
      {counter && (
        <div className="swiper-pagination swiper-pagination-fraction">
          <span className="sr-only">전체 {c.count}개 중 </span>
          <span className="swiper-pagination-current">{c.index + 1}</span>
          <span aria-hidden="true"> / </span>
          <span className="swiper-pagination-total" aria-hidden="true">{c.count}</span>
          <span className="sr-only">번째</span>
        </div>
      )}
      {c.autoplay > 0 && (
        <div className="swiper-controller">
          <button type="button" className={c.playing ? "swiper-button-stop" : "swiper-button-play"} onClick={() => c.setPlaying(!c.playing)}>
            <span className="sr-only">{c.playing ? "슬라이드 멈춤" : "슬라이드 재생"}</span>
          </button>
        </div>
      )}
      <div className="swiper-navigation">
        <button type="button" className={cx("swiper-button-prev", atStart && "swiper-button-disabled")} disabled={atStart} onClick={() => c.go(c.index - 1)}>
          <span className="sr-only">이전 슬라이드</span>
        </button>
        <button type="button" className={cx("swiper-button-next", atEnd && "swiper-button-disabled")} disabled={atEnd} onClick={() => c.go(c.index + 1)}>
          <span className="sr-only">다음 슬라이드</span>
        </button>
        {moreHref && (
          <a href={moreHref} className="swiper-button-more">
            <span className="sr-only">더 보기</span>
          </a>
        )}
      </div>
    </div>
  );
});

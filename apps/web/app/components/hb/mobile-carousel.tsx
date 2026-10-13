// 모바일 카드 줄 = 한 장씩 넘기는 캐러셀(사용자 2026-10-10 "모바일에서 해당 요소들은 모두 캐러셀로 한카드씩 루프되게").
// 640px 이상에서는 넘겨받은 className(그리드)이 그대로 쓰이고, 그 아래에서만 가로 한 줄 + 한 장 폭 + 스냅으로 바뀐다.
// 아이들(li·a·div)에 슬라이드 클래스를 붙일 뿐 감싸지 않는다 — ol/ul 의 의미와 카드 자체 스타일을 그대로 둔다.
// 넘기기는 손가락으로 좌우 밀기(화살표 없음, 사용자 2026-10-10). 아래 점은 지금 위치 표시. 저절로 넘기지 않는다(기본 interval 0, 사용자 2026-10-10 "멈춰 있게"). interval 을 주면 그 간격으로 넘기고 손으로 넘기면 8초 쉰다.
// '움직임 줄이기'면 저절로 넘기지 않는다. 세로 스크롤은 바깥 하나 규칙 그대로(이 줄은 가로만 움직인다).
import { Children, cloneElement, isValidElement, useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const MOBILE = "(max-width: 639.98px)";
const SLIDE = "max-sm:w-full max-sm:min-w-0 max-sm:shrink-0 max-sm:snap-center";
const TRACK = "max-sm:flex max-sm:flex-row max-sm:overflow-x-auto max-sm:snap-x max-sm:snap-mandatory max-sm:overscroll-x-contain max-sm:p-px pp-noscrollbar";

export function MobileCarousel({ as = "div", className, children, label, interval = 0, ...rest }: {
  as?: "div" | "ul" | "ol" | "section";
  className?: string;
  children: ReactNode;
  label?: string;
  interval?: number;
  "aria-label"?: string;
}) {
  const Tag = as;
  const track = useRef<HTMLElement | null>(null);
  const [mobile, setMobile] = useState(false);
  const [idx, setIdx] = useState(0);
  const idxRef = useRef(0);
  const pauseUntil = useRef(0);
  const items = Children.toArray(children).filter(isValidElement) as ReactElement<{ className?: string }>[];
  const n = items.length;

  useEffect(() => {
    const mq = window.matchMedia(MOBILE);
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const go = useCallback((i: number, user = false) => {
    const el = track.current;
    if (!el || n === 0) return;
    const next = ((i % n) + n) % n;
    const child = el.children[next] as HTMLElement | undefined;
    if (child) el.scrollTo({ left: child.offsetLeft - el.offsetLeft - (el.clientWidth - child.offsetWidth) / 2, behavior: "smooth" });
    if (user) pauseUntil.current = Date.now() + 8000;
  }, [n]);

  // 지금 보이는 장 = 스크롤 위치에서 가장 가까운 장
  useEffect(() => {
    const el = track.current;
    if (!el || !mobile) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        // 여백·간격이 있는 줄도 맞게: 보이는 가운데에 가장 가까운 장
        const mid = el.scrollLeft + el.clientWidth / 2;
        let v = 0, best = Infinity;
        [...el.children].forEach((c, i) => { const h = c as HTMLElement; const d = Math.abs(h.offsetLeft - el.offsetLeft + h.offsetWidth / 2 - mid); if (d < best) { best = d; v = i; } });
        idxRef.current = v;
        setIdx(v);
      });
    };
    const hold = () => { pauseUntil.current = Date.now() + 8000; };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("pointerdown", hold);
    el.addEventListener("touchstart", hold, { passive: true });
    return () => { cancelAnimationFrame(raf); el.removeEventListener("scroll", onScroll); el.removeEventListener("pointerdown", hold); el.removeEventListener("touchstart", hold); };
  }, [mobile, n]);

  // 저절로 넘김 — 기본은 끔(사용자 2026-10-10 "자동 슬라이딩 말고 멈춰 있게"). interval 을 주는 곳만 켠다.
  useEffect(() => {
    if (!mobile || n < 2 || !interval) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => {
      if (document.hidden || Date.now() < pauseUntil.current) return;
      go(idxRef.current + 1);
    }, interval);
    return () => window.clearInterval(t);
  }, [mobile, n, interval, go]);

  const slides = items.map((c) => cloneElement(c, { className: cn(c.props.className, SLIDE) }));

  return (
    <>
      <Tag ref={track as never} className={cn(className, TRACK)} aria-label={rest["aria-label"]} aria-roledescription={mobile ? "캐러셀" : undefined}>
        {slides}
      </Tag>
      {n > 8 && (
        // 카드가 많으면 점이 화면 밖으로 넘친다(사용자 2026-10-11, powerMCP 도구 47개) → 숫자 + 이전·다음
        <div className="mt-3 flex items-center justify-center gap-3 sm:hidden" aria-label={label ? `${label} 위치` : "카드 위치"}>
          <button type="button" onClick={() => go(idx - 1, true)} aria-label="이전 카드" className="pp-hit grid size-8 place-items-center rounded-full border border-line text-ink-3"><ChevronLeft className="size-4" aria-hidden /></button>
          <span className="min-w-14 text-center text-[13px] tabular-nums text-ink-3" aria-live="polite"><b className="font-semibold text-ink">{idx + 1}</b> / {n}</span>
          <button type="button" onClick={() => go(idx + 1, true)} aria-label="다음 카드" className="pp-hit grid size-8 place-items-center rounded-full border border-line text-ink-3"><ChevronRight className="size-4" aria-hidden /></button>
        </div>
      )}
      {n > 1 && n <= 8 && (
        <div className="mt-3 flex items-center justify-center sm:hidden" aria-label={label ? `${label} 위치` : "카드 위치"}>
          <div className="flex items-center gap-1.5">
            {items.map((_, i) => (
              <button key={i} type="button" onClick={() => go(i, true)} aria-label={`${i + 1}번째 카드`} aria-current={i === idx ? "true" : undefined}
                className={cn("pp-hit h-1.5 rounded-full transition-all", i === idx ? "w-5 bg-ink" : "w-1.5 bg-line")} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

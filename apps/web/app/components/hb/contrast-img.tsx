import { useCallback, useState, type ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * 흰 바탕 칸에 흰 로고·흰 아이콘이 묻히는 문제(사용자 2026-10-18 캡처 — 솔리데오 흰색 로고가 빈 칸으로 보임).
 * 그림이 뜨면 48×48 로 줄여 픽셀을 재고, "투명 바탕 + 보이는 픽셀 대부분이 밝음"이면 칸 바탕을 짙게 바꾼다.
 * DB 표시 없이 그림만 보고 정하므로 앞으로 올라오는 흰 로고에도 그대로 맞는다. 사진처럼 투명 영역이 없으면 건드리지 않는다.
 */
const cache = new Map<string, boolean>();

function isLightOnTransparent(img: HTMLImageElement): boolean {
  const key = img.currentSrc || img.src;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let light = false;
  try {
    const S = 48;
    const c = document.createElement("canvas");
    c.width = S; c.height = S;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(img, 0, 0, S, S);
      const d = ctx.getImageData(0, 0, S, S).data;
      let clear = 0, solid = 0, bright = 0;
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3] ?? 0;
        if (a < 40) { clear++; continue; }
        // 반투명 가장자리(글자 테두리)는 흰 바탕에 섞인 색으로 본다 — 옅은 회색 글자도 흰 칸에선 안 보인다
        const k = a / 255, L = 0.2126 * (d[i] ?? 0) + 0.7152 * (d[i + 1] ?? 0) + 0.0722 * (d[i + 2] ?? 0);
        solid++;
        if (L * k + 255 * (1 - k) > 185) bright++; // 흰색·연한 회색(#c8c8c8 이상)
      }
      const n = S * S;
      // 2026-10-19: semologo 흰 글자 로고(글자가 가늘어 24px 에서 테두리만 남음)가 빠져 기준을 0.6 → 0.5, 밝기 195 → 185 로
      light = clear > n * 0.1 && solid > n * 0.005 && bright > solid * 0.5;
    }
  } catch { light = false; } // 다른 출처 그림(canvas 오염) — 그대로 흰 바탕
  cache.set(key, light);
  return light;
}

/** 칸(span) + 그림. 밝은 투명 그림이면 칸 바탕이 bg-ink-2 로 바뀐다. boxClassName 에 bg-white 를 넣지 말 것(여기서 정한다). */
export function ContrastImg({ boxClassName, plainBg = "bg-white", className, onLoad, ...img }: ImgHTMLAttributes<HTMLImageElement> & { boxClassName?: string; plainBg?: string }) {
  const [dark, setDark] = useState(() => (img.src ? cache.get(String(img.src)) ?? false : false));
  // 이미 받아 둔 그림은 onLoad 가 붙기 전에 끝나 판정이 빠질 수 있다 — 붙을 때 complete 면 바로 잰다
  const ref = useCallback((el: HTMLImageElement | null) => { if (el?.complete && el.naturalWidth > 0) setDark(isLightOnTransparent(el)); }, []);
  return (
    <span className={cn(boxClassName, dark ? "bg-ink-2" : plainBg)} data-contrast={dark ? "dark" : undefined}>
      <img
        ref={ref}
        {...img}
        alt={img.alt ?? ""}
        className={className}
        onLoad={(e) => { setDark(isLightOnTransparent(e.currentTarget)); onLoad?.(e); }}
      />
    </span>
  );
}

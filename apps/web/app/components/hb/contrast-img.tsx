import { useState, type ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * 흰 바탕 칸에 흰 로고·흰 아이콘이 묻히는 문제(사용자 2026-10-18 캡처 — 솔리데오 흰색 로고가 빈 칸으로 보임).
 * 그림이 뜨면 24×24 로 줄여 픽셀을 재고, "투명 바탕 + 보이는 픽셀 대부분이 밝음"이면 칸 바탕을 짙게 바꾼다.
 * DB 표시 없이 그림만 보고 정하므로 앞으로 올라오는 흰 로고에도 그대로 맞는다. 사진처럼 투명 영역이 없으면 건드리지 않는다.
 */
const cache = new Map<string, boolean>();

export function isLightOnTransparent(img: HTMLImageElement): boolean {
  const key = img.currentSrc || img.src;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let light = false;
  try {
    const S = 24;
    const c = document.createElement("canvas");
    c.width = S; c.height = S;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(img, 0, 0, S, S);
      const d = ctx.getImageData(0, 0, S, S).data;
      let clear = 0, solid = 0, bright = 0;
      for (let i = 0; i < d.length; i += 4) {
        if ((d[i + 3] ?? 0) < 40) { clear++; continue; }
        solid++;
        if (0.2126 * (d[i] ?? 0) + 0.7152 * (d[i + 1] ?? 0) + 0.0722 * (d[i + 2] ?? 0) > 195) bright++; // 흰색·아주 연한 회색(#cfcfcf 도 흰 바탕에선 안 보인다)
      }
      const n = S * S;
      light = clear > n * 0.1 && solid > n * 0.01 && bright > solid * 0.6; // 흰 글자 + 빨강 S 처럼 일부만 색이 있어도 대부분 흰색이면 짙은 바탕
    }
  } catch { light = false; } // 다른 출처 그림(canvas 오염) — 그대로 흰 바탕
  cache.set(key, light);
  return light;
}

/** 칸(span) + 그림. 밝은 투명 그림이면 칸 바탕이 bg-ink-2 로 바뀐다. boxClassName 에 bg-white 를 넣지 말 것(여기서 정한다). */
export function ContrastImg({ boxClassName, plainBg = "bg-white", className, onLoad, ...img }: ImgHTMLAttributes<HTMLImageElement> & { boxClassName?: string; plainBg?: string }) {
  const [dark, setDark] = useState(() => (img.src ? cache.get(String(img.src)) ?? false : false));
  return (
    <span className={cn(boxClassName, dark ? "bg-ink-2" : plainBg)} data-contrast={dark ? "dark" : undefined}>
      <img
        {...img}
        alt={img.alt ?? ""}
        className={className}
        onLoad={(e) => { setDark(isLightOnTransparent(e.currentTarget)); onLoad?.(e); }}
      />
    </span>
  );
}

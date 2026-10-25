import { useCallback, useState, type ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * 흰 바탕 칸에 흰 로고·흰 아이콘이 묻히는 문제(사용자 2026-10-18 캡처 — 솔리데오 흰색 로고가 빈 칸으로 보임).
 * 그림이 뜨면 48×48 로 줄여 픽셀을 재고, "투명 바탕이 있고 흰 바탕에서 보일 진한·색 있는 부분이 거의 없음"이면 칸 바탕을 짙게 바꾼다(기준은 isLightOnTransparent, R83·R100).
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
      // 2026-10-25 다시 짬(사용자 캡처 — 흰 면이 넓은 흰 아이콘은 빈 칸, 연한 하늘색·유리·흰 3D 아이콘은 괜히 짙은 칸, R100).
      //  예전 식은 '밝기 185 넘는 픽셀 절반'만 봐서 연한 파랑도 흰색으로 셌고, '투명 10%' 조건에 흰 면이 넓은 아이콘이 빠졌다.
      //  흰 바탕에서 안 보이는 그림 = (a) 보일 만한 진한·짙은 색이 거의 없고 흰·연회색이 대부분이거나 (b) 순백 글자가 많고 진한 부분이 적은 것(흰 글자+작은 색 표시 로고).
      //  전수 시험(로컬 투명 그림 7,845개): 흰 픽토그램 300/300 · 흰 로고 464 · 그 밖은 흰 화이트보드 1개만. 유리·3D·연한 색 아이콘 0.
      let clear = 0, solid = 0, vis = 0, white = 0, pure = 0;
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3] ?? 0;
        if (a < 40) { clear++; continue; }
        const r = d[i] ?? 0, g = d[i + 1] ?? 0, b = d[i + 2] ?? 0;
        // 반투명 가장자리는 흰 바탕에 섞인 색으로 본다
        const k = a / 255, L = 0.2126 * r + 0.7152 * g + 0.0722 * b, sp = Math.max(r, g, b) - Math.min(r, g, b);
        const comp = L * k + 255 * (1 - k), spk = sp * k;
        solid++;
        if (comp < 200 || spk > 60) vis++;          // 흰 바탕에서 보이는 픽셀(짙거나 색이 분명)
        if (comp > 225 && spk < 30) white++;        // 흰색·아주 연한 회색
        if (L > 242 && sp < 14 && k > 0.5) pure++;  // 순백(흰 글자)
      }
      const n = S * S;
      light = clear > n * 0.003 && solid > n * 0.005
        && ((vis < solid * 0.06 && white > solid * 0.5) || (pure > solid * 0.3 && vis < solid * 0.35));
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

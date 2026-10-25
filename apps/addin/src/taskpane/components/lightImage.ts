// 흰 바탕에서 안 보이는 그림(흰 아이콘·흰 로고)인지 — 웹 apps/web/app/components/hb/contrast-img.tsx isLightOnTransparent 와 같은 식(R83·R100, 2026-10-25).
//  그림을 48×48 로 줄여 재고, 투명 바탕이 있으면서 (a) 흰 바탕에서 보일 진한·색 있는 픽셀이 6% 미만이고 흰색이 절반 넘거나
//  (b) 순백이 30% 넘고 보일 픽셀이 35% 미만이면 참. 연한 하늘색·유리·흰 3D 아이콘은 거짓(색·그림자가 보이므로).
const cache = new Map<string, boolean>();

export function isLightOnTransparent(img: HTMLImageElement): boolean {
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
      let clear = 0, solid = 0, vis = 0, white = 0, pure = 0;
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3] ?? 0;
        if (a < 40) { clear++; continue; }
        const r = d[i] ?? 0, g = d[i + 1] ?? 0, b = d[i + 2] ?? 0;
        const k = a / 255, L = 0.2126 * r + 0.7152 * g + 0.0722 * b, sp = Math.max(r, g, b) - Math.min(r, g, b);
        const comp = L * k + 255 * (1 - k), spk = sp * k;
        solid++;
        if (comp < 200 || spk > 60) vis++;
        if (comp > 225 && spk < 30) white++;
        if (L > 242 && sp < 14 && k > 0.5) pure++;
      }
      const n = S * S;
      light = clear > n * 0.003 && solid > n * 0.005
        && ((vis < solid * 0.06 && white > solid * 0.5) || (pure > solid * 0.3 && vis < solid * 0.35));
    }
  } catch { light = false; }
  cache.set(key, light);
  return light;
}

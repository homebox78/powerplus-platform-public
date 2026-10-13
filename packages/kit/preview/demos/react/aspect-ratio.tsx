import { AspectRatio } from "../../../react";

export const meta = { id: "aspect-ratio", title: "비율 상자", group: "action", source: "shadcn", note: "16:9 · 4:3 · 1:1 — 안의 사진이 상자를 채운다" };

// 예시 사진 — powerAssets 샘플(벚꽃 핀 강변 도시). 미리보기 묶음의 img/ 폴더에 들어 있다
const SCENE = "img/sample-city.webp";

const items: Array<[number, string]> = [
  [16 / 9, "16:9"],
  [4 / 3, "4:3"],
  [1, "1:1"],
];

export default function Demo() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1.4fr 1fr", gap: 16, alignItems: "start" }}>
      {items.map(([r, name]) => (
        <figure key={name} style={{ margin: 0, minWidth: 0 }}>
          <AspectRatio ratio={r}><img src={SCENE} alt={`한빛시 전경(${name})`} /></AspectRatio>
          <figcaption style={{ marginTop: 8, fontSize: 14 }}>{name}</figcaption>
        </figure>
      ))}
    </div>
  );
}

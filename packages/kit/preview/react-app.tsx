// 부품 카탈로그(React) — 목록은 demos/registry.ts(자동 생성)를 읽는다. 부품을 추가해도 이 파일은 안 바뀐다.
import * as React from "react";
import { createRoot } from "react-dom/client";
import { Button } from "../react";
import { SKINS, STYLES, applySkin, applyStyle } from "./skins";
import { GROUPS, METAS } from "./demos/registry";
import { REACT_DEMOS } from "./demos/react";

const SRC: Record<string, string> = { krds: "KRDS", shadcn: "shadcn", both: "KRDS·shadcn" };
// 사이트 /kit 에 넣을 때: ?embed=1 = 목록은 사이트 사이드바가 맡으므로 숨김, ?c=부품id = 그 부품만
const PARAMS = new URLSearchParams(location.search);
const EMBED = PARAMS.get("embed") === "1";
const ONLY = PARAMS.get("c") || "";
// ?bare=1 = 부품 하나만(제목·설명·도구·출처 없이) — powerGuide 부품 문서의 미리보기 칸
const BARE = PARAMS.get("bare") === "1";

function App() {
  const [skin, setSkin] = React.useState(SKINS[0].id);
  const [look, setLook] = React.useState<string>(STYLES[0].id);
  React.useEffect(() => applyStyle(look), [look]);
  const [q, setQ] = React.useState("");
  React.useEffect(() => {
    applySkin(document.querySelector<HTMLElement>(".hb-kit")!, SKINS.find((x) => x.id === skin)!);
  }, [skin]);
  const shown = METAS.filter((m) => (!ONLY || m.id === ONLY) && (!q || m.title.includes(q) || m.id.includes(q.toLowerCase())));

  return (
    <div className={(EMBED ? "pv-shell pv-embed" : "pv-shell") + (BARE ? " pv-bare" : "") + (PARAMS.get("wide") === "1" ? " pv-wide" : "")}>
      {!EMBED && <aside className="pv-nav" aria-label="부품 목록">
        <p className="pv-brand">powerGuide 키트 <small>React</small></p>
        <label className="pv-search">
          <span className="sr-only">부품 찾기</span>
          <input type="search" placeholder="부품 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <p className="pv-count">{shown.length} / {METAS.length}종</p>
        {GROUPS.map(([g, label]) => {
          const items = shown.filter((m) => m.group === g);
          if (!items.length) return null;
          return (
            <div key={g} className="pv-group">
              <p className="pv-group-title">{label}</p>
              <ul>
                {items.map((m) => (
                  <li key={m.id}><a href={`#${m.id}`}>{m.title}</a></li>
                ))}
              </ul>
            </div>
          );
        })}
      </aside>}
      <main className="pv-main">
        <header className="pv-head">
          <h1>{ONLY ? METAS.find((m) => m.id === ONLY)?.title ?? "부품 미리보기" : "부품 미리보기"}</h1>
          <div className="pv-tools">
            <span id="pv-look">스타일</span>
            <div role="group" aria-labelledby="pv-look" className="pv-row pv-row-flat">
              {STYLES.map((s) => (
                <Button key={s.id} size="small" variant={look === s.id ? "primary" : "tertiary"} aria-pressed={look === s.id} onClick={() => setLook(s.id)}>
                  {s.label}
                </Button>
              ))}
            </div>
            <span id="pv-skin">스킨</span>
            <div role="group" aria-labelledby="pv-skin" className="pv-row pv-row-flat">
              {SKINS.map((s) => (
                <Button key={s.id} size="small" variant={skin === s.id ? "primary" : "tertiary"} aria-pressed={skin === s.id} onClick={() => setSkin(s.id)}>
                  {s.label}
                </Button>
              ))}
            </div>
          </div>
        </header>
        {shown.map((m) => {
          const Demo = REACT_DEMOS[m.id];
          return (
            <section key={m.id} id={m.id} className="pv-sec" aria-labelledby={`pv-${m.id}`}>
              <h2 id={`pv-${m.id}`}>{m.title} <span className="pv-src">{SRC[m.source]}</span></h2>
              {m.note && <p className="pv-note">{m.note}</p>}
              <div className="pv-demo" data-demo={m.id}><Demo /></div>
            </section>
          );
        })}
        <footer className="pv-foot">
          본 저작물은 행정안전부에서 2024년 작성하여 공공누리 제1유형으로 개방한 ‘범정부 UI/UX 디자인시스템(KRDS)’을 이용하였으며,
          해당 저작물은 ‘KRDS 디자인시스템 홈페이지(https://www.krds.go.kr)’에서 무료로 다운받으실 수 있습니다.
        </footer>
      </main>
    </div>
  );
}

createRoot(document.getElementById("app")!).render(<App />);

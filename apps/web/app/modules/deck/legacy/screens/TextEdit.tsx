import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, fileUrl, isEditing, type Job } from "../api";
import { cn, Ms, useToastOn } from "../ui";

type Item = { id: string; x: number; y: number; w: number; h: number; text: string; key?: boolean };
type Map = { n: number; items: Item[] }[];

/** 결과 · 검토 탭의 격자 — 장 목록 | 가운데 | 오른쪽 패널 (디자인 파일의 값) */
export const REVIEW_COLS = "104px minmax(0,1fr) minmax(260px,300px)";

/** 왼쪽 장 썸네일 목록 — 고른 장은 주황 테두리, badge 는 그 장에 달린 개수(고친 곳 등) */
export function Thumbs({ items, sel, onSel }: { items: { n: number; src: string; badge?: number; label?: string }[]; sel: number; onSel: (n: number) => void }) {
  return (
    <div className="pd-rail border-r border-line overflow-y-auto scroll-thin p-3 flex flex-col gap-3 bg-panel min-h-0">
      {items.map((s) => (
        <button key={s.n} onClick={() => onSel(s.n)} aria-label={`${s.label ?? `${s.n}쪽`} 보기`} aria-current={sel === s.n} className="border-0 bg-transparent p-0 text-left flex flex-col gap-1 items-stretch flex-none">
          <span className="relative block w-full aspect-[16/9] bg-white rounded-md overflow-hidden" style={{ boxShadow: sel === s.n ? "0 0 0 2px var(--color-point)" : "0 0 0 1px var(--color-line)" }}>
            <img src={s.src} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-contain" />
            {!!s.badge && <span className="absolute right-1 top-1 min-w-[18px] h-[18px] px-1 rounded-full bg-orange text-white text-[12px] font-bold inline-flex items-center justify-center">{s.badge}</span>}
          </span>
          <span className={cn("text-[12px]", sel === s.n ? "text-orange-d font-semibold" : "text-dim")}>{s.label ?? `${s.n}쪽`}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * 글 고치기 — 완성된 장표 그림 위에서 글을 눌러 오른쪽에서 고친다.
 * AI 를 다시 돌리지 않는다: 엔진이 그 도형의 글만 바꾸고 다시 렌더한다(1분 안팎, AI 비용 없음). 서식·위치는 그대로.
 * 결과 · 검토 탭의 보기 방식 하나로 들어간다 — toolbar(가운데 도구줄)와 고른 장(sel·onSel)은 결과 화면이 준다.
 */
export function TextEdit({ job, onChange, toolbar, sel: selProp, onSel }: { job: Job; onChange: (j: Job) => void; toolbar?: ReactNode; sel?: number; onSel?: (n: number) => void }) {
  const after = useMemo(() => (job.files?.after ?? []).filter((f) => f.slide).sort((a, b) => (a.slide ?? 0) - (b.slide ?? 0)), [job.files]);
  const mapFile = (job.files?.mockup ?? []).find((f) => f.name === "text_map.json");
  const [map, setMap] = useState<Map | null>(null);
  const [own, setOwn] = useState(after[0]?.slide ?? 1);
  const sel = selProp ?? own;
  const [pick, setPick] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});   // "쪽|id" → 새 글
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useToastOn(err);
  const [ratio, setRatio] = useState(16 / 9);
  const go = (n: number, id: string | null = null) => { setOwn(n); onSel?.(n); setPick(id); };
  // 밖에서(도구줄 ‹ ›, 화살표 키) 장을 바꾸면 고르던 글은 푼다
  const prev = useRef(sel);
  useEffect(() => { if (prev.current !== sel) { prev.current = sel; setPick((p) => (p && map?.find((s) => s.n === sel)?.items.some((i) => i.id === p) ? p : null)); } }, [sel, map]);
  // 반영 중 — 엔진이 그 글만 바꿔 다시 렌더하는 동안. 끝나면 고친 목록을 비우고 새 그림·글 위치를 받는다
  const editing = isEditing(job);
  const was = useRef(false);
  useEffect(() => {
    if (was.current && !editing) { setBusy(false); setEdits({}); setPick(null); }
    was.current = editing;
  }, [editing]);
  const last = (job.events ?? []).slice(-1)[0];
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!mapFile) { setMap(null); return; }
    fetch(fileUrl(job.id, "mockup", "text_map.json") + `&v=${mapFile.ts ?? 0}`).then((r) => r.json()).then(setMap).catch(() => setMap(null));
  }, [job.id, mapFile?.ts, mapFile?.size]);
  useEffect(() => { if (pick) box.current?.focus(); }, [pick, sel]);

  const [front, setFront] = useState({ cover: true, toc: true, divider: true, ...(job.opts?.front ?? {}) });
  const hasFront = (job.files?.after ?? []).some((f) => f.name.startsWith("front_"));
  const send = async (list: { slide: number; id: string; text: string }[], withFront = false) => {
    setBusy(true); setErr("");
    try { onChange(await api<Job>(`/jobs/${job.id}/edits`, { method: "POST", body: JSON.stringify(withFront ? { edits: list, front } : { edits: list }) })); }
    catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  const ready = !!mapFile && !!map;
  const cur = map?.find((s) => s.n === sel);
  const img = after.find((f) => f.slide === sel);
  const k = (id: string) => `${sel}|${id}`;
  const item = cur?.items.find((i) => i.id === pick);
  const count = Object.keys(edits).length;
  const setText = (id: string, orig: string, v: string) => setEdits((e) => { const n = { ...e }; if (v === orig) delete n[k(id)]; else n[k(id)] = v; return n; });
  const list = () => Object.entries(edits).map(([key, text]) => { const [s, id] = key.split("|"); return { slide: Number(s), id: id!, text }; });
  const apply = () => send(list());
  // 작은 상자가 큰 상자에 가려 못 누르는 일이 없게 — 큰 것부터 그려 작은 것이 위에 온다
  const items = [...(cur?.items ?? [])].sort((a, b) => b.w * b.h - a.w * a.h);

  return (
    <div className="pd-cols flex-1 min-h-0 grid" style={{ gridTemplateColumns: REVIEW_COLS }}>
      <Thumbs sel={sel} onSel={(n) => go(n)} items={after.map((f) => ({
        n: f.slide!, src: fileUrl(job.id, "after", f.name) + `&v=${f.ts ?? 0}`, badge: Object.keys(edits).filter((x) => x.startsWith(`${f.slide}|`)).length,
      }))} />

      <div className="flex flex-col min-h-0 min-w-0 bg-side">
        {toolbar}
        {!ready ? (
          <div className="flex-1 min-h-0 overflow-auto grid place-items-center p-8">
            <div className="w-full text-center">
              <div className="sec-title !whitespace-normal">장표의 글을 바로 고칠 수 있습니다</div>
              <div className="text-[14px] text-ink2 mt-2 leading-[1.75] break-keep">장표 그림에서 글을 눌러 그 자리에서 고치면, AI 를 다시 돌리지 않고 그 글만 바꿉니다.<br />이 작업은 글 위치 정보가 아직 없어 먼저 한 번 읽어 와야 합니다(1분 안팎, 비용 없음).</div>
              {err && <div className="mt-3 text-[13px] font-semibold text-[var(--color-warn)]">{err}</div>}
              <button className="btn-next mt-5 mx-auto min-w-[220px] justify-center" disabled={busy || (mapFile != null && !map)} onClick={() => send([])}><Ms name="find_in_page" size={19} />{busy ? "요청 중…" : mapFile ? "읽는 중…" : "글 위치 읽어 오기"}</button>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto scroll-thin p-5">
            {editing && (
              <div className="mb-3 rounded-md bg-orange-soft border border-orange-line px-3.5 py-2.5 flex items-center gap-2.5 text-[13.5px] font-semibold text-orange-d">
                <i className="w-2.5 h-2.5 rounded-full bg-orange pulse flex-none" />장표에 반영하는 중입니다 — 고친 장만 다시 그려 30초 안팎이면 바뀝니다. 이 화면에 그대로 계시면 됩니다.
              </div>
            )}
            {!editing && last?.kind === "warn" && /글 고치기에 실패/.test(last.message) && (
              <div className="mb-3 rounded-md bg-[var(--color-warn-soft)] border border-[var(--color-warn-line)] px-3.5 py-2.5 text-[13.5px] text-[var(--color-warn)]">{last.message}</div>
            )}
            <div className="relative mx-auto w-full bg-white rounded-md overflow-hidden shadow-[0_1px_3px_rgba(17,17,17,.08),0_0_0_1px_var(--color-line)]" style={{ maxWidth: `calc((100vh - 260px) * ${ratio})` }}>
              {img && <img src={fileUrl(job.id, "after", img.name) + `&v=${img.ts ?? 0}`} className="block w-full select-none" alt="" draggable={false}
                onLoad={(e) => { const i = e.currentTarget; if (i.naturalWidth && i.naturalHeight) setRatio(i.naturalWidth / i.naturalHeight); }} />}
              {items.map((it) => {
                const ed = edits[k(it.id)] != null, on = pick === it.id;
                return (
                  <button key={it.id} onClick={() => setPick(it.id)} title={it.text.slice(0, 60) || `글 상자 ${it.id}`} aria-label={`글 고치기: ${(it.text || `글 상자 ${it.id}`).slice(0, 60)}`}
                    className={cn("absolute rounded-md p-0 bg-transparent cursor-text transition-colors", on ? "border-2 border-orange !bg-[var(--color-orange-tint)]/60" : ed ? "border border-orange !bg-orange/10" : "border border-dashed border-transparent hover:border-orange")}
                    style={{ left: it.x + "%", top: it.y + "%", width: it.w + "%", height: it.h + "%" }} />
                );
              })}
            </div>
          </div>
        )}
      </div>

      <aside className="border-l border-line bg-white flex flex-col min-h-0 min-w-0">
        <div className="flex-1 min-h-0 overflow-y-auto scroll-thin px-[18px] py-4 flex flex-col gap-2">
          {item ? (
            <>
              <div className="text-[13px] text-dim">{sel}쪽 · {item.key ? "키메시지" : item.id.includes(":") ? "표 칸" : "글 상자"}</div>
              <textarea ref={box} className="field !border-orange !p-3 !text-[15px] font-semibold !leading-[1.5] resize-y flex-none" aria-label={`${sel}쪽 ${item.key ? "키메시지" : "글"} 고치기`} style={{ height: Math.min(360, Math.max(88, item.text.split("\n").length * 24 + 40)) }}
                value={edits[k(item.id)] ?? item.text} onChange={(e) => setText(item.id, item.text, e.target.value)} />
              <div className="flex items-start gap-2 text-[12.5px] text-faint">
                <span className="flex-1">글만 바뀌고 서식 · 위치는 그대로입니다. 줄을 바꾸면 장표에서도 줄이 바뀝니다.</span>
                {edits[k(item.id)] != null && <button className="flex-none whitespace-nowrap font-semibold text-orange-d hover:underline bg-transparent border-0 p-0" onClick={() => setText(item.id, item.text, item.text)}>원래대로</button>}
              </div>
              {edits[k(item.id)] != null && edits[k(item.id)]!.replace(/\s/g, "").length > item.text.replace(/\s/g, "").length * 1.25 + 4 &&
                <div className="rounded-md bg-[var(--color-mark-soft)] text-[var(--color-ink-2)] text-[12.5px] font-semibold px-3 py-2 leading-[1.6]">원래보다 많이 길어졌습니다. 상자 크기는 그대로라 글이 넘칠 수 있으니 반영 뒤 확인해 주세요.</div>}
            </>
          ) : (
            <div className="text-[13.5px] text-faint leading-[1.6] py-6 text-center">{ready ? <>장표에서 고칠 글을 누르세요.<br />글 위에 마우스를 올리면 주황 점선 테두리가 보입니다.</> : <>글 위치를 읽어 오면<br />여기에서 글을 고칠 수 있습니다.</>}</div>
          )}
          {count > 0 && (
            <div className="mt-3">
              <div className="font-bold mb-1">고친 곳 <span className="text-dim font-medium">{count}</span></div>
              {Object.entries(edits).map(([key, v]) => {
                const [s, id] = key.split("|");
                return (
                  <button key={key} onClick={() => go(Number(s), id)} className="w-full text-left flex gap-2 py-2 border-0 border-b border-line-soft bg-transparent text-[13px] hover:bg-panel">
                    <span className="flex-none font-bold text-orange-d whitespace-nowrap">{s}쪽</span><span className="truncate">{v.replace(/\n/g, " ⏎ ") || "(비움)"}</span>
                  </button>
                );
              })}
            </div>
          )}
          {ready && job.kind === "design" && (
            <div className="mt-3 pt-3.5 border-t border-line-soft flex flex-col gap-2">
              <div className="font-bold">표지 · 목차 · 간지 <span className="font-normal text-[13px] text-dim">{hasFront ? "— 들어가 있음" : "— 아직 없음"}</span></div>
              <div className="flex items-center gap-3.5 text-[13.5px]">
                {([["cover", "표지"], ["toc", "목차"], ["divider", "간지"]] as const).map(([key, l]) => (
                  <label key={key} className="flex items-center gap-1.5 cursor-pointer whitespace-nowrap flex-none"><input type="checkbox" className="accent-[var(--color-point)] m-0" checked={front[key]} onChange={(e) => setFront({ ...front, [key]: e.target.checked })} />{l}</label>
                ))}
                <button className="btn-back !h-8 !px-4 !text-[13px] ml-auto" disabled={busy} onClick={() => send(list(), true)}>{hasFront ? "다시 넣기" : "넣기"}</button>
              </div>
              <div className="text-[12.5px] text-faint leading-[1.5]">기획의 장·절로 자동으로 만듭니다(비용 없음). 간지는 장이 둘 이상일 때만 들어갑니다. 본문 쪽번호는 그대로입니다.</div>
            </div>
          )}
        </div>
        {ready && (
          <div className="flex-none border-t border-line px-[18px] py-3.5 flex flex-col gap-2">
            {err && <div className="text-[13px] font-semibold text-[var(--color-warn)]">{err}</div>}
            <div className="flex flex-wrap gap-2">
              <button className="btn-back !h-10 !text-[13.5px] whitespace-nowrap" disabled={!count || busy} onClick={() => { setEdits({}); setPick(null); }} title="고친 글 되돌리기 — 작업 취소가 아닙니다"><Ms name="restart_alt" size={19} />고친 것 되돌리기</button>
              <button className="btn-next !h-[42px] !px-4 !text-[13.5px] flex-1 min-w-[180px] whitespace-nowrap" disabled={!count || busy || editing} onClick={apply}>
                {editing ? "반영하는 중…" : busy ? "반영 요청 중…" : count ? `고친 장 다시 그리기 · ${count}곳` : "고친 장 다시 그리기"}
              </button>
            </div>
            <div className="text-[12.5px] text-faint">AI를 다시 돌리지 않습니다 · 30초 안팎 · 비용 없음</div>
          </div>
        )}
      </aside>
    </div>
  );
}

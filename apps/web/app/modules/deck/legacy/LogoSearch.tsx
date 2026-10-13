import { useEffect, useRef, useState } from "react";
import { API } from "./api";
import { Arrow, cn, Ms, useToastOn } from "./ui";

/** 파워플러스 로고 검색 — powerAssets 로고(정부·공공기관, 공개 등급)를 서버가 같은 출처로 내준다(api/src/Deck/Logos.php). 고르면 그림을 File 로 돌려준다(올린 파일과 같게) */
type Logo = { id: string; name: string; thumb: string; img: string };
const fileOf = (p: string) => `${API}/logos/file?p=${encodeURIComponent(p)}`;
const TOPICS: [string, string][] = [["", "전체"], ["gov", "중앙부처"], ["local", "지자체"], ["agency", "공단·공사·재단"], ["promo", "진흥원·연구원"], ["edu", "교육"], ["own", "자사"]];

export function LogoSearch({ title, onPick, onClose }: { title: string; onPick: (f: File) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [topic, setTopic] = useState("");
  const [list, setList] = useState<Logo[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useToastOn(err);
  const [picking, setPicking] = useState<string | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    const n = ++seq.current;
    const t = setTimeout(async () => {
      setBusy(true); setErr("");
      try {
        const r = await fetch(`${API}/logos?${new URLSearchParams({ q, topic })}`);
        const raw = await r.json();
        const d = raw && raw.data && !Array.isArray(raw.data) ? raw.data : raw;   // 플랫폼 봉투 {data:{data,total}} 벗김
        if (!r.ok) throw new Error(d.error || "검색하지 못했습니다");
        if (n === seq.current) { setList(d.data ?? []); setTotal(d.total ?? 0); }
      } catch (e) { if (n === seq.current) setErr((e as Error).message); }
      if (n === seq.current) setBusy(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q, topic]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const pick = async (l: Logo) => {
    setPicking(l.id); setErr("");
    try {
      const r = await fetch(fileOf(l.img || l.thumb));
      if (!r.ok) throw new Error("로고 그림을 받지 못했습니다");
      const b = await r.blob();
      const ext = (l.img.split(".").pop() || "png").toLowerCase();
      onPick(new File([b], `${l.name}.${ext === "jpeg" ? "jpg" : ext}`, { type: b.type || "image/png" }));
      onClose();
    } catch (e) { setErr((e as Error).message); }
    setPicking(null);
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-8 bg-[rgba(17,17,17,.45)]" onClick={onClose}>
      <div className="w-full max-w-[980px] h-full max-h-[760px] rounded-field bg-white shadow-[0_24px_64px_rgba(17,17,17,.28)] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex-none px-5 pt-[18px] pb-3.5 border-b border-line-soft flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[16px] font-bold truncate min-w-0">{title} — 파워플러스에서 찾기</span>
            <span className="text-[13px] text-faint whitespace-nowrap flex-none">{busy ? "찾는 중…" : `${total}개`}</span>
            <button className="btn-icon ml-auto !w-9 !h-9 !border !border-line !border-solid !bg-white hover:!bg-panel" title="닫기" aria-label="닫기" onClick={onClose}><Ms name="close" size={22} /></button>
          </div>
          <input autoFocus className="field !h-10 !text-[15px]" value={q} onChange={(e) => setQ(e.target.value)} placeholder="기관 이름 — 예: 식약처, OO시, 한국전력, 교육청" />
          <div className="flex flex-wrap gap-1.5">
            {TOPICS.map(([k, l]) => (
              <button key={k} type="button" aria-pressed={topic === k} onClick={() => setTopic(k)}
                className={cn("h-7 px-3 rounded-full text-[13.5px] font-semibold border whitespace-nowrap inline-flex items-center justify-center", topic === k ? "bg-ink text-white border-ink" : "bg-white border-line text-ink3 hover:bg-panel")}>{l}</button>
            ))}
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scroll-thin px-5 py-4 bg-panel">
          {err && <div role="alert" className="mb-3 flex items-center gap-1.5 text-[13px] font-semibold text-[var(--color-warn)]"><Ms name="error" size={18} />{err}</div>}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2.5">
            {list.map((l) => (
              <button key={l.id} type="button" onClick={() => pick(l)} disabled={!!picking} title={l.name}
                className={cn("p-2 rounded-md bg-white text-left flex flex-col gap-2 items-stretch border hover:border-orange", picking === l.id ? "border-orange shadow-[0_0_0_3px_var(--color-orange-soft)]" : "border-line")}>
                <div className="aspect-[2/1] rounded-md bg-side grid place-items-center p-2">
                  {l.thumb ? <img src={fileOf(l.thumb)} alt="" loading="lazy" className="max-h-full max-w-full object-contain"
                    onError={(e) => { const el = e.currentTarget; el.style.display = "none"; el.nextElementSibling?.classList.remove("hidden"); }} /> : null}
                  <span className={cn("text-[15px] font-black text-faint", l.thumb && "hidden")} title="로고 그림 없음">{l.name.slice(0, 2)}</span>
                </div>
                <span className="text-[13px] font-semibold text-[var(--color-ink)] leading-[1.35] break-keep line-clamp-2">{picking === l.id ? "가져오는 중…" : l.name}</span>
              </button>
            ))}
          </div>
          {!busy && !list.length && !err && (
            <div className="py-[60px] text-center text-faint leading-[1.6]">{q.trim() ? `'${q.trim()}'에 맞는 로고가 없습니다.` : "찾는 로고가 없습니다."}<br />이름을 줄이거나 다른 말로 찾아 보세요(예: '식품의약품안전처' <Arrow size={13} /> '식약'). 없으면 파일로 직접 올려 주세요.</div>
          )}
        </div>
        <div className="flex-none px-5 py-2.5 border-t border-line-soft text-[13px] text-dim">누르면 바로 들어갑니다 · 시안과 실제 장표 모두 같은 로고를 씁니다</div>
      </div>
    </div>
  );
}

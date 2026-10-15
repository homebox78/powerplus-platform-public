// 디자인 타입 고르기(스타일 샘플 썸네일) — 출처: powerDeck web/src/DesignTypes.tsx (옛 화면 그대로 이식, eslint.config.js legacy 구역).
import { useState } from "react";
import data from "./data/styles.json";
import { cn, Modal, Ms } from "./ui";

/** 디자인 타입 — 목록은 reference/styles/styles.json (엔진과 같은 파일), 샘플 썸네일은 public/styles/<id>/1~N.jpg */
export type DesignType = { id: string; name: string; desc: string; fits: string; samples?: number };
export const DESIGN_TYPES: DesignType[] = (data as { styles: DesignType[] }).styles.map((s) => ({ ...s, samples: s.samples ?? 4 }));
export const typeName = (id?: string | null) => DESIGN_TYPES.find((t) => t.id === (id || "a"))?.name ?? "공공 제안 클레이";
export const THUMB_V = 16;   // 샘플 그림을 바꾸면 올린다(브라우저 캐시)
export const thumb = (id: string, n: number) => `${import.meta.env.BASE_URL}styles/${id}/${n}.jpg?v=${THUMB_V}`;
const hide = (e: { target: EventTarget }) => { (e.target as HTMLImageElement).style.visibility = "hidden"; };

/** 새 변환 2단계 — 썸네일로 고르는 디자인 타입(3열). 카드를 누르면 고르고, 「샘플 N장 보기」는 샘플을 크게 */
export function DesignTypePicker({ value, onChange, disabled }: { value: string; onChange: (id: string) => void; disabled?: boolean }) {
  const [view, setView] = useState<DesignType | null>(null);
  const [n, setN] = useState(1);
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        {DESIGN_TYPES.map((t) => {
          const on = value === t.id;
          return (
            <div key={t.id} role="button" tabIndex={0} aria-pressed={on} onClick={() => !disabled && onChange(t.id)}
              onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && !disabled) { e.preventDefault(); onChange(t.id); } }}
              className={cn("group rounded-md border bg-white overflow-hidden text-left cursor-pointer flex flex-col transition-[border-color,box-shadow,background] duration-150", on ? "card-on" : "border-line hover:border-orange-line")}>
              {/* 미리보기 — 실제 샘플 썸네일(3:2)을 16:9 자리에 위쪽 기준으로 */}
              <div className="relative aspect-video w-full flex-none overflow-hidden bg-panel">
                <img src={thumb(t.id, 1)} alt={`${t.name} 샘플`} loading="lazy" className="w-full h-full object-cover object-top" onError={hide} />
                <span className="absolute left-3 bottom-3 whitespace-nowrap text-[12px] font-bold text-white rounded-md px-[7px] py-0.5 bg-[rgba(17,17,17,.72)]">타입 {t.id.toUpperCase()}</span>
                {on && <span className="absolute right-3 top-3 w-[26px] h-[26px] rounded-full bg-orange text-white grid place-items-center shadow-[0_2px_6px_rgba(0,0,0,.35)]"><Ms name="check" size={18} style={{ fontWeight: 700 }} /></span>}
                <button type="button" title="샘플 크게 보기" onClick={(e) => { e.stopPropagation(); setView(t); setN(1); }}
                  className="absolute right-3 bottom-3 h-7 pl-2 pr-2.5 rounded-md bg-white/95 text-[12.5px] font-semibold text-ink3 shadow-[0_1px_4px_rgba(17,17,17,.25)] inline-flex items-center gap-1 whitespace-nowrap opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">
                  <Ms name="zoom_in" size={17} />샘플 {t.samples}장 보기
                </button>
              </div>
              {(t.samples ?? 1) > 1 && (
                <div className="flex gap-1.5 px-3 pt-2.5">
                  {Array.from({ length: Math.min(3, (t.samples ?? 1) - 1) }, (_, i) => (
                    <button key={i} type="button" title={`샘플 ${i + 2} 크게 보기`} onClick={(e) => { e.stopPropagation(); setView(t); setN(i + 2); }}
                      className="w-1/3 p-0 rounded-md overflow-hidden border border-line bg-panel hover:border-orange">
                      <img src={thumb(t.id, i + 2)} alt="" loading="lazy" className="block w-full aspect-[3/2] object-cover" onError={hide} />
                    </button>
                  ))}
                </div>
              )}
              <div className="px-3 pt-2.5 pb-3 flex flex-col gap-[3px]">
                <div className={cn("font-bold", on ? "text-orange-d" : "text-ink")}>{t.name}</div>
                <div className="text-[13px] text-ink2 leading-[1.45] break-keep">{t.desc}</div>
                <div className="text-[12.5px] text-faint leading-[1.45] break-keep">어울리는 곳: {t.fits}</div>
              </div>
            </div>
          );
        })}
      </div>
      {view && (
        <Modal width={960} onClose={() => setView(null)}
          title={<span className="flex items-baseline gap-2.5 min-w-0"><span className="flex-none">타입 {view.id.toUpperCase()} · {view.name}</span><span className="text-[13px] font-normal text-dim truncate">{view.desc}</span></span>}
          foot={<button className="btn-next" onClick={() => { onChange(view.id); setView(null); }}>이 타입으로<Ms name="check" size={18} /></button>}>
          {/* 샘플은 실제 비율(3:2) 그대로, 화면 높이를 넘지 않게 */}
          <div className="bg-panel flex justify-center">
            <img src={thumb(view.id, n)} alt="" className="block w-full aspect-[3/2] object-contain" style={{ maxWidth: "calc((100vh - 330px) * 1.5)" }} />
          </div>
          <div className="flex items-center gap-2 px-5 py-3 border-t border-line-soft">
            {Array.from({ length: view.samples ?? 1 }, (_, i) => (
              <button key={i} type="button" onClick={() => setN(i + 1)} aria-pressed={n === i + 1} title={`샘플 ${i + 1}`}
                className={cn("w-24 p-0 rounded-md overflow-hidden border-2 bg-panel", n === i + 1 ? "border-orange" : "border-line hover:border-orange-line")}>
                <img src={thumb(view.id, i + 1)} alt="" className="block w-full aspect-[3/2] object-cover" />
              </button>
            ))}
            <span className="ml-auto font-mono text-[12.5px] text-dim flex-none">{n} / {view.samples ?? 1}</span>
          </div>
        </Modal>
      )}
    </>
  );
}

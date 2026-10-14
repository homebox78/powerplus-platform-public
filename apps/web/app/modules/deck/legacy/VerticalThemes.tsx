import { useState } from "react";
import { cn, Modal, Ms } from "./ui";

/** 세로 제안서(제출용) 디자인 타입 6가지 — 엔진 engine/vertical.py THEMES 와 같은 id.
 *  썸네일 public/vthemes/<id>.jpg = 실제 엔진이 만든 본문·목차·간지(바꾸면 THUMB_V 를 올린다) */
export type VerticalTheme = { id: string; name: string; desc: string; ref: string };
export const VERTICAL_THEMES: VerticalTheme[] = [
  { id: "navy", name: "네이비 클래식", desc: "네이비 꽉 찬 머리 띠, 흰 글씨", ref: "공공기관 표준 제안서" },
  { id: "blue", name: "블루 그라데이션", desc: "파랑 그라데이션 머리 띠", ref: "IT·플랫폼 구축" },
  { id: "deep", name: "딥 테크", desc: "짙은 남색 띠 + 청록 포인트 선", ref: "AI·데이터·보안" },
  { id: "teal", name: "틸 그린", desc: "청록 탭 머리, 왼쪽 탭 + 밑선", ref: "보건·환경·식품" },
  { id: "gray", name: "차콜 비즈니스", desc: "차콜 띠 + 파랑 장 번호", ref: "금융·컨설팅" },
  { id: "glass", name: "글래스 블루", desc: "여백 둔 둥근 그라데이션 띠", ref: "서비스·UX 중심" },
];
export const verticalThemeName = (id?: string | null) => VERTICAL_THEMES.find((t) => t.id === (id || "navy"))?.name ?? "네이비 클래식";
const THUMB_V = 1;
const thumb = (id: string) => `${import.meta.env.BASE_URL}vthemes/${id}.jpg?v=${THUMB_V}`;

/** 제출용 2단계 — 썸네일(본문·목차·간지)로 고르는 세로 제안서 디자인 타입(3열) */
export function VerticalThemePicker({ value, onChange, disabled }: { value: string; onChange: (id: string) => void; disabled?: boolean }) {
  const [view, setView] = useState<VerticalTheme | null>(null);
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        {VERTICAL_THEMES.map((t) => {
          const on = value === t.id;
          return (
            <div key={t.id} role="button" tabIndex={0} aria-pressed={on} onClick={() => !disabled && onChange(t.id)}
              onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && !disabled) { e.preventDefault(); onChange(t.id); } }}
              className={cn("group rounded-md border bg-white overflow-hidden text-left cursor-pointer flex flex-col transition-[border-color,box-shadow,background] duration-150", on ? "card-on" : "border-line hover:border-orange-line")}>
              <div className="relative w-full flex-none overflow-hidden bg-panel aspect-[2/1]">
                <img src={thumb(t.id)} alt={`${t.name} 샘플`} loading="lazy" className="w-full h-full object-cover object-top" />
                {on && <span className="absolute right-3 top-3 w-[26px] h-[26px] rounded-full bg-orange text-white grid place-items-center shadow-[0_2px_6px_rgba(0,0,0,.35)]"><Ms name="check" size={18} style={{ fontWeight: 700 }} /></span>}
                <button type="button" title="크게 보기" onClick={(e) => { e.stopPropagation(); setView(t); }}
                  className="absolute right-3 bottom-3 h-7 pl-2 pr-2.5 rounded-md bg-white/95 text-[12.5px] font-semibold text-ink3 shadow-[0_1px_4px_rgba(17,17,17,.25)] inline-flex items-center gap-1 whitespace-nowrap opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">
                  <Ms name="zoom_in" size={17} />크게 보기
                </button>
              </div>
              <div className="px-3 pt-2.5 pb-3 flex flex-col gap-[3px]">
                <div className={cn("font-bold", on ? "text-orange-d" : "text-ink")}>{t.name}</div>
                <div className="text-[13px] text-ink2 leading-[1.45] break-keep">{t.desc}</div>
                <div className="text-[12.5px] text-faint leading-[1.45] break-keep">어울리는 곳: {t.ref}</div>
              </div>
            </div>
          );
        })}
      </div>
      {view && (
        <Modal width={960} onClose={() => setView(null)} title={<span>{view.name} · 본문 · 목차 · 간지</span>}
          foot={<button className="btn-next" onClick={() => { onChange(view.id); setView(null); }}>이 타입으로<Ms name="check" size={18} /></button>}>
          <div className="bg-panel flex justify-center">
            <img src={thumb(view.id)} alt="" className="block w-full object-contain" style={{ maxHeight: "calc(100vh - 260px)" }} />
          </div>
        </Modal>
      )}
    </>
  );
}

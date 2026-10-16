// 세로 제안서 디자인 고르기(스타일 × 톤) — 출처: powerDeck web/src/VerticalThemes.tsx (옛 화면 그대로 이식, eslint.config.js legacy 구역).
import { useState } from "react";
import { cn, Modal, Ms } from "./ui";

/** 세로 제안서(제출용) — 디자인 = 스타일(모양) × 톤(색). id 는 엔진 engine/vertical.py STYLES·TONES 와 같다.
 *  스타일 썸네일 public/vstyles/<id>/1~4.jpg = 표지·목차·간지·본문(가상 프로젝트, 네이비 톤으로 렌더 — 모양·배경 차이만 보이게).
 *  배경 세트·깔기는 테마마다 다르다(engine/vertical.py STYLE_BG·STYLE_COMPOSE). 만들기: python scripts/vstyle-previews.py <세로제안서_기획.json>.
 *  썸네일을 바꾸면 THUMB_V 를 올린다. */
export type VerticalStyle = { id: string; name: string; desc: string };
export const VERTICAL_STYLES: VerticalStyle[] = [
  { id: "band", name: "클래식 밴드", desc: "꽉 찬 머리 띠 + 흰 글씨 · 간지는 가운데 태그 · 하얀 3D 배경" },
  { id: "tab", name: "인덱스 탭", desc: "왼쪽 탭 머리 + 밑선 · 간지는 왼쪽 정렬 · 유리 3D 전면 배경" },
  { id: "side", name: "사이드 레일", desc: "왼쪽 세로 레일에 장 번호·이름 · 간지는 굵은 레일 · 실사 배경" },
  { id: "split", name: "다크 키비주얼", desc: "표지는 파워에셋 다크 3D 전면 배경 · 간지·본문은 흰 바탕에 같은 분위기의 띠" },
  { id: "pill", name: "플로팅 필", desc: "여백 둔 둥근 머리 띠 · 간지는 둥근 태그 · 유리 3D 카드 배경" },
  { id: "line", name: "미니멀 라인", desc: "위쪽 굵은 줄 + 진한 글씨 · 간지는 큰 장 번호 · 실사 아래 띠" },
];
/** 추천 톤 — 색만 정한다. accent 는 톤을 고르면 강조색 칸에 들어가는 추천 강조색 */
export type VerticalTone = { id: string; name: string; colors: [string, string, string]; accent: string };
export const VERTICAL_TONES: VerticalTone[] = [
  { id: "navy", name: "네이비", colors: ["#0B2A6F", "#2F5BD3", "#DCE5F7"], accent: "#2F5BD3" },
  { id: "blue", name: "블루", colors: ["#1537C4", "#3D7BFF", "#DCE7FF"], accent: "#3D7BFF" },
  { id: "deep", name: "딥 네이비", colors: ["#0A1840", "#1E4FD8", "#22D3EE"], accent: "#22B8D8" },
  { id: "teal", name: "틸", colors: ["#0B5F69", "#0FA3A3", "#D6F1EF"], accent: "#0FA3A3" },
  { id: "gray", name: "차콜", colors: ["#2B2F36", "#2F6BFF", "#E3E6EB"], accent: "#2F6BFF" },
  { id: "glass", name: "글래스 블루", colors: ["#3B5BDB", "#7B97FF", "#E1E7FF"], accent: "#5B7CFA" },
];
export const verticalStyleName = (id?: string | null) => VERTICAL_STYLES.find((t) => t.id === (id || "band"))?.name ?? "클래식 밴드";
export const verticalToneName = (id?: string | null) => VERTICAL_TONES.find((t) => t.id === (id || "navy"))?.name ?? "네이비";
const THUMB_V = 9;   // 9: 테마마다 배경 세트·깔기가 다르게(2026-10-16, scripts/vstyle-previews.py 로 다시 만듦)
const PAGES = ["표지", "목차", "간지", "본문"];
const thumb = (id: string, n: number) => `${import.meta.env.BASE_URL}vstyles/${id}/${n}.jpg?v=${THUMB_V}`;
export const verticalThumb = thumb;   // 작업 설정 요약(ui.tsx JobSettings)도 같은 그림

/** 제출용 2단계 — 스타일 6가지. 카드마다 표지·목차·간지·본문 4장 */
export function VerticalStylePicker({ value, onChange, disabled }: { value: string; onChange: (id: string) => void; disabled?: boolean }) {
  const [view, setView] = useState<VerticalStyle | null>(null);
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {VERTICAL_STYLES.map((t) => {
          const on = value === t.id;
          return (
            <div key={t.id} role="button" tabIndex={0} aria-pressed={on} onClick={() => !disabled && onChange(t.id)}
              onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && !disabled) { e.preventDefault(); onChange(t.id); } }}
              className={cn("group rounded-md border bg-white overflow-hidden text-left cursor-pointer flex flex-col transition-[border-color,box-shadow,background] duration-150", on ? "card-on" : "border-line hover:border-orange-line")}>
              <div className="relative grid grid-cols-4 gap-1.5 p-2.5 bg-panel">
                {PAGES.map((p, i) => (
                  <img key={p} src={thumb(t.id, i + 1)} alt={`${t.name} ${p}`} loading="lazy" className="block w-full aspect-[19/27.5] object-cover rounded-[3px] border border-line-soft bg-white" />
                ))}
                {on && <span className="absolute right-3.5 top-3.5 w-[26px] h-[26px] rounded-full bg-orange text-white grid place-items-center shadow-[0_2px_6px_rgba(0,0,0,.35)]"><Ms name="check" size={18} style={{ fontWeight: 700 }} /></span>}
                <button type="button" title="크게 보기" onClick={(e) => { e.stopPropagation(); setView(t); }}
                  className="absolute right-3.5 bottom-3.5 h-7 pl-2 pr-2.5 rounded-md bg-white/95 text-[12.5px] font-semibold text-ink3 shadow-[0_1px_4px_rgba(17,17,17,.25)] inline-flex items-center gap-1 whitespace-nowrap opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">
                  <Ms name="zoom_in" size={17} />크게 보기
                </button>
              </div>
              <div className="px-3 pt-2 pb-3 flex flex-col gap-[3px]">
                <div className={cn("font-bold", on ? "text-orange-d" : "text-ink")}>{t.name}</div>
                <div className="text-[13px] text-ink2 leading-[1.45] break-keep">{t.desc}</div>
              </div>
            </div>
          );
        })}
      </div>
      {view && (
        <Modal width={1040} onClose={() => setView(null)} title={<span>{view.name} · 표지 · 목차 · 간지 · 본문</span>}
          foot={<button className="btn-next" onClick={() => { onChange(view.id); setView(null); }}>이 스타일로<Ms name="check" size={18} /></button>}>
          <div className="bg-panel grid grid-cols-4 gap-3 p-4">
            {PAGES.map((p, i) => (
              <figure key={p} className="m-0 flex flex-col gap-1.5">
                <img src={thumb(view.id, i + 1)} alt="" className="block w-full rounded-[3px] border border-line-soft bg-white" style={{ maxHeight: "calc(100vh - 300px)", objectFit: "contain" }} />
                <figcaption className="text-center text-[13px] font-semibold text-ink3">{p}</figcaption>
              </figure>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

/** 제출용 3단계 — 추천 톤 6가지(색만). 고르면 강조색도 그 톤의 추천 색으로 바뀐다 */
export function VerticalTonePicker({ value, onChange, disabled }: { value: string; onChange: (t: VerticalTone) => void; disabled?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {VERTICAL_TONES.map((t) => {
        const on = value === t.id;
        return (
          <button key={t.id} type="button" aria-pressed={on} disabled={disabled} onClick={() => onChange(t)}
            className={cn("flex items-center gap-2.5 px-3 py-2.5 rounded-md border text-left transition-[border-color,background] duration-150", on ? "card-on" : "border-line bg-white hover:border-orange-line")}>
            <span className="flex flex-none rounded-[4px] overflow-hidden border border-line-soft">
              {t.colors.map((c) => <i key={c} className="block w-4 h-7" style={{ background: c }} />)}
            </span>
            <span className={cn("font-bold text-[14px] whitespace-nowrap", on ? "text-orange-d" : "text-ink")}>{t.name}</span>
            {on && <Ms name="check" size={18} className="ml-auto text-orange-d" />}
          </button>
        );
      })}
    </div>
  );
}

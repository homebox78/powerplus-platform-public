// 회사소개서 디자인 고르기(타입 G) — 회사소개용 2단계. 엔진은 engine/company.py(레이아웃 카탈로그 → HTML 렌더 → 편집 가능한 PPT).
import { useState } from "react";
import { cn, Modal, Ms } from "./ui";

/** 회사소개서 테마 — 지금은 타입 G 하나. 썸네일 public/cstyles/<id>/1~N.jpg = 견본 덱 전 쪽(솔리데오 회사소개서, scripts/company-sample.py 로 만듦).
 *  썸네일을 바꾸면 THUMB_V 를 올린다. */
export type CompanyTheme = { id: string; name: string; desc: string; fits: string };
export const COMPANY_THEMES: CompanyTheme[] = [
  { id: "g", name: "블루 임팩트", desc: "짙은 남색 표지·간지 + 흰 본문, 큰 숫자와 굵은 카피 · 파랑 유리 아이콘", fits: "회사소개서 · IR · 서비스 소개" },
];
const THUMB_V = 1;
/** 견본 덱 쪽 구성(같은 순서) — 크게 보기 캡션 */
const PAGES = ["표지", "목차", "간지", "한 문장 선언", "숫자", "간지", "역량 카드", "사업 카드", "간지", "대표 사례", "고객 그리드", "간지", "연혁", "수상", "비전", "연락처"];
export const companyThumb = (id: string, n: number) => `${import.meta.env.BASE_URL}cstyles/${id}/${n}.jpg?v=${THUMB_V}`;

/** 회사소개용 2단계 — 테마 카드(표지 크게 + 본문 3장). 「크게 보기」는 견본 덱 전 쪽 */
export function CompanyThemePicker({ value, onChange, disabled }: { value: string; onChange: (id: string) => void; disabled?: boolean }) {
  const [view, setView] = useState<CompanyTheme | null>(null);
  return (
    <>
      <div className="grid grid-cols-1 gap-3">
        {COMPANY_THEMES.map((t) => {
          const on = value === t.id;
          return (
            <div key={t.id} role="button" tabIndex={0} aria-pressed={on} onClick={() => !disabled && onChange(t.id)}
              onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && !disabled) { e.preventDefault(); onChange(t.id); } }}
              className={cn("group rounded-md border bg-white overflow-hidden text-left cursor-pointer flex flex-col transition-[border-color,box-shadow,background] duration-150", on ? "card-on" : "border-line hover:border-orange-line")}>
              <div className="relative grid grid-cols-[2fr_1fr] gap-1.5 p-2.5 bg-panel">
                <img src={companyThumb(t.id, 1)} alt={`${t.name} 표지`} loading="lazy" className="block w-full aspect-video object-cover rounded-[3px] border border-line-soft bg-white" />
                <div className="grid grid-rows-3 gap-1.5 min-h-0">
                  {[5, 7, 10].map((n) => <img key={n} src={companyThumb(t.id, n)} alt="" loading="lazy" className="block w-full h-full min-h-0 object-cover rounded-[3px] border border-line-soft bg-white" />)}
                </div>
                <span className="absolute left-4 bottom-4 whitespace-nowrap text-[12px] font-bold text-white rounded-md px-[7px] py-0.5 bg-[rgba(17,17,17,.72)]">타입 {t.id.toUpperCase()}</span>
                {on && <span className="absolute right-3.5 top-3.5 w-[26px] h-[26px] rounded-full bg-orange text-white grid place-items-center shadow-[0_2px_6px_rgba(0,0,0,.35)]"><Ms name="check" size={18} style={{ fontWeight: 700 }} /></span>}
                <button type="button" title="견본 덱 전 쪽 보기" onClick={(e) => { e.stopPropagation(); setView(t); }}
                  className="absolute right-3.5 bottom-3.5 h-7 pl-2 pr-2.5 rounded-md bg-white/95 text-[12.5px] font-semibold text-ink3 shadow-[0_1px_4px_rgba(17,17,17,.25)] inline-flex items-center gap-1 whitespace-nowrap opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">
                  <Ms name="zoom_in" size={17} />견본 {PAGES.length}쪽 보기
                </button>
              </div>
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
        <Modal width={1040} onClose={() => setView(null)} title={<span>타입 {view.id.toUpperCase()} · {view.name} · 견본 {PAGES.length}쪽</span>}
          foot={<button className="btn-next" onClick={() => { onChange(view.id); setView(null); }}>이 테마로<Ms name="check" size={18} /></button>}>
          {/* 견본 덱 전 쪽 — 2열로 이어 붙이고 바깥(모달) 스크롤 하나로 */}
          <div className="bg-panel grid grid-cols-2 gap-3 p-4">
            {PAGES.map((k, i) => (
              <figure key={i} className="m-0 flex flex-col gap-1.5">
                <img src={companyThumb(view.id, i + 1)} alt="" loading="lazy" className="block w-full aspect-video rounded-[3px] border border-line-soft bg-white" />
                <figcaption className="text-center text-[13px] font-semibold text-ink3">{i + 1} · {k}</figcaption>
              </figure>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

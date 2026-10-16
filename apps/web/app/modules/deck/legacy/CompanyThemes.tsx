// 회사소개서 디자인 고르기(테마 A·B × 톤) — 회사소개용 2·3단계. 엔진은 engine/company.py(레이아웃 카탈로그 → HTML 렌더 → 편집 가능한 PPT).
import { useState } from "react";
import { cn, Modal, Ms } from "./ui";

/** 회사소개서 테마 — A 다크 임팩트 · B 라이트 에디토리얼(engine/company.py COMPANY_THEMES). 썸네일 public/cstyles/<테마>/<톤>/1~N.jpg = 견본 덱 전 쪽(솔리데오 회사소개서, scripts/company-sample.py 로 만듦).
 *  썸네일을 바꾸면 THUMB_V 를 올린다. */
export type CompanyTheme = { id: string; name: string; desc: string; fits: string };
export const COMPANY_THEMES: CompanyTheme[] = [
  { id: "a", name: "다크 임팩트", desc: "짙은 바탕 표지·간지 + 흰 본문, 큰 숫자와 굵은 카피 · 유리 아이콘 · 입자 구", fits: "회사소개서 · IR · 기술 기업" },
  { id: "b", name: "라이트 에디토리얼", desc: "흰 표지·간지에 흐르는 선 다발, 검정 알약 꼬리표, 테두리 없는 옅은 카드", fits: "회사소개서 · 서비스 소개 · 공공·금융" },
];
const THUMB_V = 3;   // 3: 테마 A·B × 톤 5 견본(cstyles/<테마>/<톤>/N.jpg) + 빈 자리 장식
/** 견본 덱 쪽 구성(같은 순서) — 크게 보기 캡션 */
const PAGES = ["표지", "목차", "간지", "한 문장 선언", "숫자", "간지", "역량 카드", "사업 카드", "간지", "대표 사례", "고객 그리드", "간지", "연혁", "수상", "비전", "연락처"];
export const companyThumb = (id: string, n: number, tone = "blue") => `${import.meta.env.BASE_URL}cstyles/${id}/${tone}/${n}.jpg?v=${THUMB_V}`;

/** 톤 — 색만 정한다. id 는 engine/company.py TONES 와 같다(서버 Jobs::opts 도). colors = 어두운 바탕 · 주색 · 옅은 면 */
export type CompanyTone = { id: string; name: string; colors: [string, string, string] };
export const COMPANY_TONES: CompanyTone[] = [
  { id: "blue", name: "블루", colors: ["#050B24", "#1F4FFF", "#DCE6FF"] },
  { id: "teal", name: "틸", colors: ["#03191A", "#0E9F8E", "#D3F2EE"] },
  { id: "violet", name: "바이올렛", colors: ["#0D0727", "#6A3BFF", "#E6DEFF"] },
  { id: "crimson", name: "크림슨", colors: ["#1A0509", "#D7263D", "#FFE0E4"] },
  { id: "orange", name: "차콜 오렌지", colors: ["#121316", "#F26A1B", "#FFE7D6"] },
];
export const companyThemeName = (id?: string | null) => COMPANY_THEMES.find((t) => t.id === (id || "a"))?.name ?? "다크 임팩트";
export const companyToneName = (id?: string | null) => COMPANY_TONES.find((t) => t.id === (id || "blue"))?.name ?? "블루";

/** 회사소개용 3단계 — 톤 5가지. 고르면 견본 표지가 그 톤으로 바뀐다(실제 렌더한 견본) */
export function CompanyTonePicker({ value, onChange, disabled, theme = "a" }: { value: string; onChange: (id: string) => void; disabled?: boolean; theme?: string }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))" }}>
      {COMPANY_TONES.map((t) => {
        const on = value === t.id;
        return (
          <button key={t.id} type="button" aria-pressed={on} disabled={disabled} onClick={() => onChange(t.id)}
            className={cn("flex flex-col gap-2 p-2 rounded-md border text-left transition-[border-color,background] duration-150", on ? "card-on" : "border-line bg-white hover:border-orange-line")}>
            <img src={companyThumb(theme, 1, t.id)} alt={`${t.name} 견본 표지`} loading="lazy" className="block w-full aspect-video object-cover rounded-[3px] border border-line-soft" />
            <span className="flex items-center gap-2 px-0.5">
              <span className="flex flex-none rounded-[4px] overflow-hidden border border-line-soft">
                {t.colors.map((c) => <i key={c} className="block w-3.5 h-5" style={{ background: c }} />)}
              </span>
              <span className={cn("font-bold text-[14px] whitespace-nowrap", on ? "text-orange-d" : "text-ink")}>{t.name}</span>
              {on && <Ms name="check" size={18} className="ml-auto text-orange-d" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** 회사소개용 2단계 — 테마 카드(표지 크게 + 본문 3장). 「크게 보기」는 견본 덱 전 쪽. tone = 견본을 보여 줄 톤 */
export function CompanyThemePicker({ value, onChange, disabled, tone = "blue" }: { value: string; onChange: (id: string) => void; disabled?: boolean; tone?: string }) {
  const [view, setView] = useState<CompanyTheme | null>(null);
  return (
    <>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {COMPANY_THEMES.map((t) => {
          const on = value === t.id;
          return (
            <div key={t.id} role="button" tabIndex={0} aria-pressed={on} onClick={() => !disabled && onChange(t.id)}
              onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && !disabled) { e.preventDefault(); onChange(t.id); } }}
              className={cn("group rounded-md border bg-white overflow-hidden text-left cursor-pointer flex flex-col transition-[border-color,box-shadow,background] duration-150", on ? "card-on" : "border-line hover:border-orange-line")}>
              <div className="relative grid grid-cols-[2fr_1fr] gap-1.5 p-2.5 bg-panel">
                <img src={companyThumb(t.id, 1, tone)} alt={`${t.name} 표지`} loading="lazy" className="block w-full aspect-video object-cover rounded-[3px] border border-line-soft bg-white" />
                <div className="grid grid-rows-3 gap-1.5 min-h-0">
                  {[5, 7, 10].map((n) => <img key={n} src={companyThumb(t.id, n, tone)} alt="" loading="lazy" className="block w-full h-full min-h-0 object-cover rounded-[3px] border border-line-soft bg-white" />)}
                </div>
                <span className="absolute left-4 bottom-4 whitespace-nowrap text-[12px] font-bold text-white rounded-md px-[7px] py-0.5 bg-[rgba(17,17,17,.72)]">테마 {t.id.toUpperCase()}</span>
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
        <Modal width={1040} onClose={() => setView(null)} title={<span>테마 {view.id.toUpperCase()} · {view.name} · 견본 {PAGES.length}쪽</span>}
          foot={<button className="btn-next" onClick={() => { onChange(view.id); setView(null); }}>이 테마로<Ms name="check" size={18} /></button>}>
          {/* 견본 덱 전 쪽 — 2열로 이어 붙이고 바깥(모달) 스크롤 하나로 */}
          <div className="bg-panel grid grid-cols-2 gap-3 p-4">
            {PAGES.map((k, i) => (
              <figure key={i} className="m-0 flex flex-col gap-1.5">
                <img src={companyThumb(view.id, i + 1, tone)} alt="" loading="lazy" className="block w-full aspect-video rounded-[3px] border border-line-soft bg-white" />
                <figcaption className="text-center text-[13px] font-semibold text-ink3">{i + 1} · {k}</figcaption>
              </figure>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

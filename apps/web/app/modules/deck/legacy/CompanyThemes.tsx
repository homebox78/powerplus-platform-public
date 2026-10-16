// 회사소개서 디자인 고르기(테마 A~D × 톤 11 + 직접 고른 색) — 회사소개용 2·3단계. 엔진은 engine/company.py(레이아웃 카탈로그 → HTML 렌더 → 편집 가능한 PPT).
import { useState } from "react";
import { cn, Modal, Ms } from "./ui";

/** 회사소개서 테마(engine/company.py COMPANY_THEMES). 썸네일 public/cstyles/<테마>/<톤>/1~N.jpg = 견본 덱 전 쪽(솔리데오 회사소개서, scripts/company-sample.py 로 만듦).
 *  썸네일을 바꾸면 THUMB_V 를 올린다. tone = 테마를 고르면 따라오는 기본 톤(engine THEME_DEFAULT_TONE 과 같다) */
export type CompanyTheme = { id: string; name: string; desc: string; fits: string; tone: string };
export const COMPANY_THEMES: CompanyTheme[] = [
  { id: "a", name: "다크 임팩트", desc: "짙은 바탕 표지·간지 + 흰 본문, 큰 숫자와 굵은 카피 · 유리 아이콘 · 와이어 구", fits: "회사소개서 · IR · 기술 기업", tone: "blue" },
  { id: "b", name: "라이트 에디토리얼", desc: "흰 표지·간지에 흐르는 선 다발, 검정 알약 꼬리표, 테두리 없는 옅은 카드", fits: "회사소개서 · 서비스 소개 · 공공·금융", tone: "navy" },
  { id: "c", name: "매거진", desc: "크림 바탕에 가는 선, 여백 많은 편집 — 표지 오른쪽 큰 색 면, 밑줄 꼬리표, 헤어라인 카드", fits: "브랜드 · 리테일 · 라이프스타일", tone: "lavender" },
  { id: "d", name: "프렌들리 라운드", desc: "흰 바탕에 파스텔 둥근 면, 아주 둥근 파스텔 카드, 칩 꼬리표, 친근한 굵은 제목 · 간지는 주색 전면", fits: "플랫폼 · 커머스 · 스타트업", tone: "carrot" },
];
const THUMB_V = 5;   // 5: 테마 C·D + 톤 11(640×360) · 4: 포인트 SVG · 3: 테마 A·B × 톤 5
/** 견본 덱 쪽 구성(같은 순서) — 크게 보기 캡션 */
const PAGES = ["표지", "목차", "간지", "한 문장 선언", "숫자", "간지", "역량 카드", "사업 카드", "간지", "대표 사례", "고객 그리드", "간지", "연혁", "수상", "비전", "연락처"];
export const isCustomTone = (t?: string | null) => /^#[0-9A-Fa-f]{6}$/.test(t ?? "");
/** 견본 그림 — 직접 고른 색은 미리 만든 견본이 없어 그 테마의 기본 톤 견본을 보여 준다 */
export const companyThumb = (id: string, n: number, tone = "blue") => {
  const t = isCustomTone(tone) || !COMPANY_TONES.some((x) => x.id === tone) ? (COMPANY_THEMES.find((x) => x.id === id)?.tone ?? "blue") : tone;
  return `${import.meta.env.BASE_URL}cstyles/${id}/${t}/${n}.jpg?v=${THUMB_V}`;
};

/** 톤 — 색만 정한다. id 는 engine/company.py TONES 와 같다. colors = 어두운 바탕 · 주색 · 옅은 면. group = 계열(파랑 3 · 빨강 2 · 초록 2 · 보라 2 · 주황 2) */
export type CompanyTone = { id: string; name: string; group: string; colors: [string, string, string] };
export const COMPANY_TONES: CompanyTone[] = [
  { id: "blue", name: "코발트 블루", group: "파랑", colors: ["#050B24", "#1F4FFF", "#DCE6FF"] },
  { id: "navy", name: "딥 네이비", group: "파랑", colors: ["#060B1C", "#1B3A8A", "#DCE4F5"] },
  { id: "sky", name: "스카이", group: "파랑", colors: ["#06202E", "#0EA5E9", "#DCF3FF"] },
  { id: "crimson", name: "크림슨", group: "빨강", colors: ["#1A0509", "#D7263D", "#FFE0E4"] },
  { id: "coral", name: "코랄", group: "빨강", colors: ["#1F0C0A", "#FF5A4E", "#FFE4E1"] },
  { id: "emerald", name: "에메랄드", group: "초록", colors: ["#03170C", "#0F9D58", "#D9F5E6"] },
  { id: "teal", name: "틸", group: "초록", colors: ["#03191A", "#0E9F8E", "#D3F2EE"] },
  { id: "violet", name: "바이올렛", group: "보라", colors: ["#0D0727", "#6A3BFF", "#E6DEFF"] },
  { id: "lavender", name: "라벤더", group: "보라", colors: ["#140420", "#5F0080", "#F1E4FA"] },
  { id: "carrot", name: "당근 오렌지", group: "주황", colors: ["#1C0F05", "#FF6F0F", "#FFEEDF"] },
  { id: "orange", name: "차콜 오렌지", group: "주황", colors: ["#121316", "#F26A1B", "#FFE7D6"] },
];
export const companyThemeName = (id?: string | null) => COMPANY_THEMES.find((t) => t.id === (id || "a"))?.name ?? "다크 임팩트";
export const companyToneName = (id?: string | null) => isCustomTone(id) ? `직접 고른 색 ${id!.toUpperCase()}` : COMPANY_TONES.find((t) => t.id === (id || "blue"))?.name ?? "코발트 블루";

/** 회사소개용 3단계 — 톤 11가지 + 맨 끝 '직접 고르기'(사용자 2026-10-16 "내가 원하는 톤을 추가할 수 있어야 함, 마지막에").
 *  이름 있는 톤은 그 톤으로 실제 렌더한 견본 표지를 보여 주고, 직접 고른 색은 색 조각만(엔진이 그 색으로 한 벌을 만든다) */
export function CompanyTonePicker({ value, onChange, disabled, theme = "a" }: { value: string; onChange: (id: string) => void; disabled?: boolean; theme?: string }) {
  const custom = isCustomTone(value);
  const [hex, setHex] = useState(custom ? value.toUpperCase() : "#7C3AED");
  const hexOk = isCustomTone(hex);
  const pick = (h: string) => { const v = (h.startsWith("#") ? h : "#" + h).toUpperCase(); setHex(v); if (isCustomTone(v)) onChange(v); };
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))" }}>
      {COMPANY_TONES.map((t) => {
        const on = value === t.id;
        return (
          <button key={t.id} type="button" aria-pressed={on} disabled={disabled} onClick={() => onChange(t.id)} title={`${t.group} 계열`}
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
      {/* 맨 끝 — 직접 고르기: 색 하나를 고르면 엔진이 밝기·채도만 바꿔 한 벌(어두운 바탕·옅은 면·강조)을 만든다 */}
      <div role="button" tabIndex={0} aria-pressed={custom} onClick={() => !disabled && hexOk && onChange(hex)}
        onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && !disabled && hexOk) { e.preventDefault(); onChange(hex); } }}
        className={cn("flex flex-col gap-2 p-2 rounded-md border text-left cursor-pointer transition-[border-color,background] duration-150", custom ? "card-on" : "border-dashed border-[var(--color-line-3)] bg-white hover:border-orange-line")}>
        <div className="w-full aspect-video rounded-[3px] border border-line-soft grid place-items-center" style={{ background: hexOk ? `linear-gradient(135deg, ${hex}22, ${hex})` : "var(--color-panel)" }}>
          <label className="w-12 h-12 rounded-full border-[3px] border-white shadow-[0_2px_8px_rgba(0,0,0,.25)] cursor-pointer grid place-items-center text-white" style={{ background: hexOk ? hex : "var(--color-ink-4)" }} title="색 고르기" onClick={(e) => e.stopPropagation()}>
            <Ms name="colorize" size={20} /><input type="color" className="sr-only" value={hexOk ? hex : "#7C3AED"} disabled={disabled} onChange={(e) => pick(e.target.value)} />
          </label>
        </div>
        <span className="flex items-center gap-1.5 px-0.5" onClick={(e) => e.stopPropagation()}>
          <input className={cn("field !h-7 !w-[92px] !px-1.5 font-mono !text-[12.5px]", !hexOk && "!border-[var(--color-warn)]")} value={hex} maxLength={7} aria-label="직접 고른 색 코드" disabled={disabled}
            onChange={(e) => pick(e.target.value)} />
          <span className={cn("font-bold text-[14px] whitespace-nowrap", custom ? "text-orange-d" : "text-ink")}>직접 고르기</span>
          {custom && <Ms name="check" size={18} className="ml-auto text-orange-d" />}
        </span>
      </div>
    </div>
  );
}

/** 회사소개용 2단계 — 테마 카드 4장(표지 크게 2×2 + 오른쪽 2×2 + 아래 4). 「크게 보기」는 견본 덱 전 쪽. tone = 견본을 보여 줄 톤 */
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
              {/* 표지 크게(2×2 칸) + 오른쪽 2×2 + 아래 줄 4 — 빈 자리 없이(사용자 2026-10-16 배치 지시) */}
              <div className="relative grid grid-cols-4 gap-1.5 p-2.5 bg-panel">
                <img src={companyThumb(t.id, 1, tone)} alt={`${t.name} 표지`} loading="lazy" className="col-span-2 row-span-2 block w-full h-full object-cover rounded-[3px] border border-line-soft bg-white" />
                {[5, 7, 8, 10, 11, 13, 14, 16].map((n) => <img key={n} src={companyThumb(t.id, n, tone)} alt="" loading="lazy" className="block w-full aspect-video object-cover rounded-[3px] border border-line-soft bg-white" />)}
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

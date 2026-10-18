// 장표 서체 고르기(제목·본문 샘플) — 출처: powerDeck web/src/FontPicker.tsx (옛 화면 그대로 이식, eslint.config.js legacy 구역).
import list from "./data/fonts.json";
import coverData from "./data/font_cover.json";
import { cn, SecTitle } from "./ui";

/** 장표 서체 — 목록은 worker/fonts/fonts.json(엔진과 같은 파일, 첫 줄이 기본), 샘플은 public/fonts/<title|body>-<id>[.<언어>].png */
type F = { id: string; name: string; avoid?: Record<string, string> };
export const TITLE_FONTS: F[] = (list as { title: F[] }).title;
export const BODY_FONTS: F[] = (list as { body: F[] }).body;
/** 세로 제안서(제출용) 본문 서체 — 가로 장표와 같은 목록(2026-10-14 사용자 지정 4종, 전부 OFL). 엔진 vertical.VBODY 도 같은 파일을 읽는다 */
export const VERTICAL_BODY_FONTS: F[] = BODY_FONTS;
export const fontName = (kind: "title" | "body", id?: string) => (kind === "title" ? TITLE_FONTS : BODY_FONTS).find((f) => f.id === id)?.name ?? (kind === "title" ? TITLE_FONTS : BODY_FONTS)[0]?.name;

/* ── 언어별 서체(R82, 2026-10-18) — 지원율 표 data/font_cover.json = engine/fontcover.py 가 서체 파일로 잰 값(엔진 fontset.for_lang 과 같은 표·같은 기준).
 * 고른 언어에서 지원율이 min% 미만이거나 avoid 에 든 서체는 흐리게·못 고르게, 언어를 바꾸면 안 맞는 서체는 그 언어 기본 서체(lang_default)로 */
type Kind = "title" | "body";
const COVER = coverData as unknown as { min: number; title: Record<string, Record<string, number>>; body: Record<string, Record<string, number>> };
const LANG_DEFAULT = (list as unknown as { lang_default?: Record<string, { title: string; body: string }> }).lang_default ?? {};
const LANG_SHORT: Record<string, string> = { ko: "한국어", en: "영어", ja: "일본어", zh: "중국어", fr: "프랑스어", es: "스페인어", de: "독일어", vi: "베트남어" };

/** 그 언어에 쓸 수 없는 이유(쓸 수 있으면 null) — 예: "일본어 글자 없음" */
export function fontBlock(kind: Kind, id: string, lang = "ko"): string | null {
  const f = (kind === "title" ? TITLE_FONTS : BODY_FONTS).find((x) => x.id === id);
  if (!f) return null;
  const ln = LANG_SHORT[lang] ?? lang;
  if (f.avoid?.[lang]) return `${ln}에 맞지 않음`;
  const pct = COVER[kind]?.[id]?.[lang];
  return pct == null || pct >= COVER.min ? null : `${ln} 글자 없음`;
}

/** 언어를 바꿨을 때 — 고른 서체가 그 언어에 안 맞으면 그 언어 기본 서체(없으면 목록에서 처음 맞는 것) */
export function fitFont(kind: Kind, id: string, lang = "ko"): string {
  if (!fontBlock(kind, id, lang)) return id;
  const items = kind === "title" ? TITLE_FONTS : BODY_FONTS;
  const d = LANG_DEFAULT[lang]?.[kind];
  return [d, ...items.map((x) => x.id)].find((x) => !!x && items.some((i) => i.id === x) && !fontBlock(kind, x, lang)) ?? id;
}

/** 견본 그림 — 그 언어 문장(scripts/font-previews.py). 그 언어를 못 쓰는 서체는 그 서체가 되는 첫 언어 견본(Noto Sans JP = 일본어) */
const sampleLang = (kind: Kind, id: string, lang: string) => (!fontBlock(kind, id, lang) ? lang : ["ko", "ja", "zh", "en"].find((l) => !fontBlock(kind, id, l)) ?? "ko");
const img = (kind: Kind, id: string, lang = "ko") => { const l = sampleLang(kind, id, lang); return `${import.meta.env.BASE_URL}fonts/${kind}-${id}${l === "ko" ? "" : `.${l}`}.png`; };

/** 라디오 목록 — 한 줄에 2개씩. 줄마다 이름 + 견본 그림. 그 언어 글자가 없는 서체는 흐리게·못 고르게 */
function FontList({ kind, items, value, onChange, disabled, lang = "ko" }: { kind: Kind; items: F[]; value: string; onChange: (id: string) => void; disabled?: boolean; lang?: string }) {
  const dflt = LANG_DEFAULT[lang]?.[kind] ?? items[0]?.id;
  return (
    <div className="border border-line rounded-md overflow-hidden grid grid-cols-2 bg-white" role="radiogroup">
      {items.map((f) => {
        const on = value === f.id;
        const block = fontBlock(kind, f.id, lang);
        return (
          <button key={f.id} type="button" role="radio" aria-checked={on} aria-disabled={!!block} disabled={disabled || !!block} onClick={() => onChange(f.id)}
            title={block ? `${f.name} — ${block}. 이 언어로는 고를 수 없습니다` : undefined}
            className={cn("w-full flex flex-col text-left border-0 border-b border-r border-line-soft px-3.5 pb-2.5", on ? "bg-[var(--color-orange-tint)]" : block ? "bg-white cursor-not-allowed" : "bg-white hover:bg-panel")}>
            <span className="flex items-center gap-2.5 h-11 min-w-0 w-full">
              <span className={cn("radio", on && "on", block && "opacity-40")} />
              <span className={cn("font-semibold whitespace-nowrap truncate", block ? "text-faint" : "text-ink")}>{f.name}</span>
              {block ? <span className="text-[12.5px] text-warn whitespace-nowrap flex-none">{block}</span>
                : f.id === dflt && <span className="text-[12.5px] text-faint whitespace-nowrap flex-none">기본</span>}
            </span>
            <img src={img(kind, f.id, lang)} alt={`${f.name} 견본`} loading="lazy" className={cn("block w-full object-contain bg-white rounded-md border border-line-soft", block && "opacity-35 grayscale")} />
          </button>
        );
      })}
    </div>
  );
}

/**
 * 제목 서체 · 본문 서체 — 2열 카드에 각각 라디오 목록.
 * compact(초안 PPT 다듬기): 항목 제목 없이 회색 작은 라벨만 — 바깥에서 「서체」 제목을 단다.
 * lang(장표 언어): 그 언어 글자가 없는 서체는 못 고르고, 견본도 그 언어 문장으로.
 */
export function FontPicker({ title, body, onTitle, onBody, disabled, compact, vertical, lang = "ko" }: { title: string; body: string; onTitle: (id: string) => void; onBody: (id: string) => void; disabled?: boolean; compact?: boolean; vertical?: boolean; lang?: string }) {
  const ln = LANG_SHORT[lang] ?? lang;
  const langNote = lang !== "ko" ? <div className="sec-desc">{ln} 장표 — {ln} 글자가 {COVER.min}% 이상 있는 서체만 고를 수 있습니다.</div> : null;
  // vertical(세로 제안서) — 제목 서체는 표지·목차·간지·쪽 제목의 큰 글자에만, 본문은 3종. 고른 서체는 작성 가이드의 서식 규칙표에도 그대로 적힌다
  if (vertical) return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col min-w-0 gap-2">
          <SecTitle icon="title" title="제목 서체" desc="표지 · 목차 · 간지 · 쪽 제목의 큰 글자에만" />
          <FontList kind="title" items={TITLE_FONTS} value={title} onChange={onTitle} disabled={disabled} lang={lang} />
        </div>
        <div className="flex flex-col min-w-0 gap-2">
          <SecTitle icon="text_fields" title="본문 서체" desc="머리 · 소제목 · 본문 · 표 · 쪽 번호 4단계" />
          <FontList kind="body" items={VERTICAL_BODY_FONTS} value={body} onChange={onBody} disabled={disabled} lang={lang} />
        </div>
      </div>
      {langNote}
      <div className="sec-desc">고른 서체는 함께 넣는 작성 가이드(서식 규칙표·설치해야 할 글꼴)에도 그대로 적힙니다.</div>
    </>
  );
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className={cn("flex flex-col min-w-0", compact ? "gap-1.5" : "gap-2")}>
          {compact ? <div className="sec-desc">제목 · 키메시지 · 표지 · 목차 · 간지</div> : <SecTitle icon="title" title="제목 서체" desc="키메시지 · 표지 · 목차 · 간지" />}
          <FontList kind="title" items={TITLE_FONTS} value={title} onChange={onTitle} disabled={disabled} lang={lang} />
        </div>
        <div className={cn("flex flex-col min-w-0", compact ? "gap-1.5" : "gap-2")}>
          {compact ? <div className="sec-desc">본문 · 굵기 4단계</div> : <SecTitle icon="text_fields" title="본문 서체" desc="제목 · 강조 · 본문 · 주석 4단계" />}
          <FontList kind="body" items={BODY_FONTS} value={body} onChange={onBody} disabled={disabled} lang={lang} />
        </div>
      </div>
      {langNote}
      <div className="sec-desc">이 장표에 쓰인 서체 파일은 설치 안내·라이선스와 함께 산출물(zip)의 '서체' 폴더에 들어갑니다. 모두 상업용 무료 서체입니다.</div>
    </>
  );
}

import list from "./data/fonts.json";
import { cn, SecTitle } from "./ui";

/** 장표 서체 — 목록은 worker/fonts/fonts.json(엔진과 같은 파일, 첫 줄이 기본), 샘플은 public/fonts/<title|body>-<id>.png */
type F = { id: string; name: string };
export const TITLE_FONTS: F[] = (list as { title: F[] }).title;
export const BODY_FONTS: F[] = (list as { body: F[] }).body;
/** 세로 제안서(제출용) 본문 서체 — 3종만(사용자 2026-10-14). id 는 엔진 engine/vertical.py VBODY 와 같다 */
export const VERTICAL_BODY_FONTS: F[] = [{ id: "siwol", name: "a시월구일" }, { id: "kopub", name: "KoPub돋움체" }, { id: "rix", name: "Rix고딕" }];
export const fontName = (kind: "title" | "body", id?: string) => (kind === "title" ? TITLE_FONTS : [...BODY_FONTS, ...VERTICAL_BODY_FONTS]).find((f) => f.id === id)?.name ?? (kind === "title" ? TITLE_FONTS : BODY_FONTS)[0]?.name;
const img = (kind: string, id: string) => `${import.meta.env.BASE_URL}fonts/${kind}-${id}.png`;

/** 라디오 목록 — 한 줄에 2개씩. 줄마다 이름 + 견본 그림 */
function FontList({ kind, items, value, onChange, disabled }: { kind: "title" | "body"; items: F[]; value: string; onChange: (id: string) => void; disabled?: boolean }) {
  return (
    <div className="border border-line rounded-md overflow-hidden grid grid-cols-2 bg-white" role="radiogroup">
      {items.map((f, i) => {
        const on = value === f.id;
        return (
          <button key={f.id} type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => onChange(f.id)}
            className={cn("w-full flex flex-col text-left border-0 border-b border-r border-line-soft px-3.5 pb-2.5", on ? "bg-[var(--color-orange-tint)]" : "bg-white hover:bg-panel")}>
            <span className="flex items-center gap-2.5 h-11 min-w-0 w-full">
              <span className={cn("radio", on && "on")} />
              <span className="font-semibold text-ink whitespace-nowrap truncate">{f.name}</span>
              {i === 0 && <span className="text-[12.5px] text-faint whitespace-nowrap flex-none">기본</span>}
            </span>
            <img src={img(kind, f.id)} alt={`${f.name} 견본`} loading="lazy" className="block w-full object-contain bg-white rounded-md border border-line-soft" />
          </button>
        );
      })}
    </div>
  );
}

/**
 * 제목 서체 · 본문 서체 — 2열 카드에 각각 라디오 목록.
 * compact(초안 PPT 다듬기): 항목 제목 없이 회색 작은 라벨만 — 바깥에서 「서체」 제목을 단다.
 */
export function FontPicker({ title, body, onTitle, onBody, disabled, compact, vertical }: { title: string; body: string; onTitle: (id: string) => void; onBody: (id: string) => void; disabled?: boolean; compact?: boolean; vertical?: boolean }) {
  // vertical(세로 제안서) — 제목 서체는 표지·목차·간지·쪽 제목의 큰 글자에만, 본문은 3종. 고른 서체는 작성 가이드의 서식 규칙표에도 그대로 적힌다
  if (vertical) return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col min-w-0 gap-2">
          <SecTitle icon="title" title="제목 서체" desc="표지 · 목차 · 간지 · 쪽 제목의 큰 글자에만" />
          <FontList kind="title" items={TITLE_FONTS} value={title} onChange={onTitle} disabled={disabled} />
        </div>
        <div className="flex flex-col min-w-0 gap-2">
          <SecTitle icon="text_fields" title="본문 서체" desc="머리 · 소제목 · 본문 · 표 · 쪽 번호 4단계" />
          <FontList kind="body" items={VERTICAL_BODY_FONTS} value={body} onChange={onBody} disabled={disabled} />
        </div>
      </div>
      <div className="sec-desc">고른 서체는 함께 넣는 작성 가이드(서식 규칙표·설치해야 할 글꼴)에도 그대로 적힙니다.</div>
    </>
  );
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className={cn("flex flex-col min-w-0", compact ? "gap-1.5" : "gap-2")}>
          {compact ? <div className="sec-desc">제목 · 키메시지 · 표지 · 목차 · 간지</div> : <SecTitle icon="title" title="제목 서체" desc="키메시지 · 표지 · 목차 · 간지" />}
          <FontList kind="title" items={TITLE_FONTS} value={title} onChange={onTitle} disabled={disabled} />
        </div>
        <div className={cn("flex flex-col min-w-0", compact ? "gap-1.5" : "gap-2")}>
          {compact ? <div className="sec-desc">본문 · 굵기 4단계</div> : <SecTitle icon="text_fields" title="본문 서체" desc="제목 · 강조 · 본문 · 주석 4단계" />}
          <FontList kind="body" items={BODY_FONTS} value={body} onChange={onBody} disabled={disabled} />
        </div>
      </div>
      <div className="sec-desc">고른 서체 파일은 산출물(zip)의 '서체' 폴더에 함께 들어갑니다. 모두 상업용 무료 서체입니다.</div>
    </>
  );
}

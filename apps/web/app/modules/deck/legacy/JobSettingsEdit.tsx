// 작업 설정 고치기(강조색 등) — 출처: powerDeck web/src/JobSettingsEdit.tsx (옛 화면 그대로 이식, eslint.config.js legacy 구역).
import { useState } from "react";
import { api, type Job } from "./api";
import { cn, Modal, Ms, SecTitle, toast } from "./ui";
import { DesignTypePicker } from "./DesignTypes";
import { FontPicker, BODY_FONTS, TITLE_FONTS } from "./FontPicker";

/** 강조색 고르기 — 새 변환(Upload.tsx)과 같은 색 */
export const ACCENTS: [string, string][] = [
  ["#1866DA", "블루"], ["#2E9BD6", "스카이"], ["#0E9F8E", "틸"], ["#1A9C5B", "그린"],
  ["#F59E0B", "앰버"], ["#E8703A", "오렌지"], ["#D7263D", "레드"], ["#E8336D", "진분홍"], ["#C01348", "버건디"],
];

/**
 * 작업 설정 바꾸기 — 시안을 만들기 전(확인 대기)에 디자인 타입 · 서체 · 강조색을 고친다.
 * 저장하면 그 뒤에 만드는 시안과 장표부터 적용된다(이미 만든 시안은 다시 만들어야 바뀐다).
 */
export function JobSettingsEdit({ job, onClose, onSaved }: { job: Job; onClose: () => void; onSaved: (j: Job) => void }) {
  const o = job.opts;
  const [style, setStyle] = useState(o?.style || "a");
  const [ft, setFt] = useState(o?.font_title || TITLE_FONTS[0]?.id || "");
  const [fb, setFb] = useState(o?.font_body || BODY_FONTS[0]?.id || "");
  const [accent, setAccent] = useState((job.theme || "#1866DA").slice(0, 7).toUpperCase());
  const [busy, setBusy] = useState(false);
  const ok = /^#[0-9A-F]{6}$/.test(accent);
  const made = (job.files?.mockup ?? []).filter((f) => /^(s\d\d|cover|toc|div\d+)\.jpg$/.test(f.name)).length;
  const changed = style !== (o?.style || "a") || ft !== (o?.font_title || TITLE_FONTS[0]?.id) || fb !== (o?.font_body || BODY_FONTS[0]?.id) || accent !== (job.theme || "#1866DA").slice(0, 7).toUpperCase();
  const save = async () => {
    if (!ok) { toast("강조색 코드를 확인해 주세요(예: #1866DA).", "warn"); return; }
    setBusy(true);
    try {
      const j = await api<Job>(`/jobs/${job.id}`, { method: "PATCH", body: JSON.stringify({ settings: { style, font_title: ft, font_body: fb, accent } }) });
      onSaved(j);
      toast(made ? "설정을 바꿨습니다. 이미 만든 시안은 다시 만들어야 새 설정으로 바뀝니다." : "설정을 바꿨습니다. 이제 만드는 시안부터 적용됩니다.", "ok");
      onClose();
    } catch { /* 오류는 토스트로 뜬다 */ }
    setBusy(false);
  };
  return (
    <Modal title="작업 설정 바꾸기" width={1080} onClose={busy ? undefined : onClose}
      foot={<>
        <span className="mr-auto text-[13px] text-dim">{made ? `이미 만든 시안 ${made}장은 그대로입니다 — 바꾼 설정으로 보려면 그 장을 다시 만들어 주세요.` : "저장하면 이제 만드는 시안부터 적용됩니다."}</span>
        <button className="btn-back" disabled={busy} onClick={onClose}>취소</button>
        <button className="btn-next" disabled={busy || !changed} onClick={save}>{busy ? "저장 중…" : "저장"}</button>
      </>}>
      <div className="p-6 flex flex-col gap-7">
        <section className="flex flex-col gap-3">
          <SecTitle icon="palette" title="디자인 타입" desc="시안 이미지 · 머리 띠 · 표지 · 목차 · 간지가 모두 이 타입으로 만들어집니다" />
          <DesignTypePicker value={style} onChange={setStyle} disabled={busy} />
        </section>
        <FontPicker title={ft} body={fb} onTitle={setFt} onBody={setFb} disabled={busy} />
        <section className="flex flex-col gap-3">
          <SecTitle icon="format_color_fill" title="강조색" desc="제목의 핵심 단어와 강조 표시에 쓰는 색" />
          <div className="flex items-center gap-2.5 flex-wrap">
            {ACCENTS.map(([c, l]) => (
              <button key={c} type="button" title={l} aria-label={l} aria-pressed={accent === c} disabled={busy} onClick={() => setAccent(c)}
                className={cn("w-7 h-7 rounded-full flex-none", accent === c && "ring-2 ring-offset-2 ring-ink")} style={{ background: c }} />
            ))}
{/* 다른 색 — 색 고르기 창(브라우저 컬러 피커). 고른 색의 코드는 옆에 보여 주기만 한다 */}
            <label className={cn("relative h-9 pl-1.5 pr-3 rounded-md border bg-white inline-flex items-center gap-2 cursor-pointer hover:bg-panel", ACCENTS.some(([c]) => c === accent) ? "border-line" : "border-orange shadow-[0_0_0_3px_var(--color-orange-soft)]")} title="다른 색 고르기">
              <span className="w-6 h-6 rounded-full border border-black/10" style={{ background: "conic-gradient(#f43f5e, #f59e0b, #22c55e, #06b6d4, #6366f1, #d946ef, #f43f5e)" }} />
              <span className="text-[13px] font-semibold text-ink3 whitespace-nowrap">다른 색</span>
              <span className="font-mono text-[12.5px] text-dim">{accent}</span>
              <input type="color" value={ok ? accent : "#1866DA"} disabled={busy} onChange={(e) => setAccent(e.target.value.toUpperCase())} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" aria-label="강조색 고르기" />
            </label>
            <span className="text-[15px] font-extrabold ml-2">무엇보다 <span style={{ color: ok ? accent : undefined }}>안정성 확보</span>가 최우선</span>
            <Ms name="info" size={17} className="text-faint ml-1" /><span className="text-[13px] text-dim">미리보기</span>
          </div>
        </section>
      </div>
    </Modal>
  );
}

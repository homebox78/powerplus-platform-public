import { useEffect, useState } from "react";
import { api, jobUrl, type Job } from "../api";
import { cn, Ms, useToastOn, ask } from "../ui";

type View = "doc" | "practice" | "qa";

/** 문서 iframe — 열리기 전에는 자리 표시(빈 화면 방치 금지). 너무 오래 걸리면 새 창으로 여는 길을 준다 */
function FrameDoc({ title, src, dark }: { title: string; src: string; dark?: boolean }) {
  const [ok, setOk] = useState(false);
  const [slow, setSlow] = useState(false);
  useEffect(() => { setOk(false); setSlow(false); const t = setTimeout(() => setSlow(true), 20000); return () => clearTimeout(t); }, [src]);
  return (
    <div className="flex-1 min-h-0 relative">
      {!ok && <div className={cn("absolute inset-0 flex flex-col items-center justify-center gap-2.5 text-[14px] font-semibold text-dim", dark ? "bg-[var(--color-ink)]" : "bg-white")} role="status">
        <span className="inline-flex items-center gap-2"><Ms name="hourglass_top" size={24} className="pulse" />여는 중…</span>
        {slow && <a className="text-orange-d font-bold hover:underline" href={src} target="_blank" rel="noreferrer">열리지 않으면 새 창에서 열기</a>}
      </div>}
      <iframe title={title} src={src} onLoad={() => setOk(true)} className={cn("flex-1 min-h-0 w-full h-full border-0 block", dark ? "bg-[var(--color-ink)]" : "bg-white")} />
    </div>
  );
}

/**
 * 발표 대본 탭 — 56px 도구줄(대본 문서 / 연습 화면 / 예상 질문 · 발표 시간 · 고치기 · 다시 만들기 · 새 창 · 받기) + 본문.
 * 대본 문서와 연습 화면은 서버가 만든 HTML 을 iframe 으로 그대로 보여 주고, 예상 질문은 화면에서 카드로 그린다.
 * 대본은 8장씩 나눠 만들고, 다 쓰면 앞뒤(한 문장 요약·구간·발표 전 점검·어긋났을 때)를 정리한다.
 */
export function Script({ job, onChange }: { job: Job; onChange: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useToastOn(err);
  const [note, setNote] = useState("");
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<Record<number, { keep?: string; text?: string }>>({});
  const [ver, setVer] = useState(0);
  const sc0 = job.script;
  const sc = sc0 && !sc0.none ? sc0 : null;   // 예상 질문만 있고 대본은 아직 없는 경우
  const qa = sc0?.qa ?? [];
  const [view, setView] = useState<View>("doc");
  const [prog, setProg] = useState("");
  const [minutes, setMinutes] = useState(() => (sc0?.goal ? Math.round(sc0.goal / 60) : 15));
  const fmt = (x: number) => `${Math.floor(x / 60)}:${String(Math.round(x) % 60).padStart(2, "0")}`;
  const all = (job.plan?.slides ?? []).map((s) => s.n);
  const BATCH = sc?.batch ?? 8;

  const makeQa = async () => {
    setBusy(true); setErr(""); setProg("예상 질문");
    try { await api(`/jobs/${job.id}/script`, { method: "POST", body: JSON.stringify({ qa: true, note }) }); setView("qa"); setEdit(false); }
    catch (e) { setErr((e as Error).message); }
    await onChange(); setProg(""); setBusy(false); setVer((v) => v + 1);
  };
  /** 대본 문서의 앞뒤(한 문장 요약·구간·발표 전 점검·어긋났을 때) — 장별 대본을 다 쓴 뒤 */
  const brief = async () => {
    setProg("앞뒤 정리");
    await api(`/jobs/${job.id}/script`, { method: "POST", body: JSON.stringify({ brief: true }) });
  };
  // 8장씩 나눠 만든다 — 장이 많아도 시간 제한에 걸리지 않고, 중간에 끊겨도 만든 데까지는 남는다. 다 쓰면 앞뒤를 정리한다
  const make = async () => {
    setBusy(true); setErr("");
    try {
      for (let i = 0; i < all.length; i += BATCH) {
        setProg(`${Math.min(i + BATCH, all.length)} / ${all.length}장`);
        await api(`/jobs/${job.id}/script`, { method: "POST", body: JSON.stringify({ note, minutes, only: all.slice(i, i + BATCH), keep: i > 0 }) });
      }
      await brief();
      setView("doc"); setEdit(false);
    } catch (e) { setErr((e as Error).message); }
    await onChange(); setVer((v) => v + 1); setProg("");
    setBusy(false);
  };
  const remakeBrief = async () => {
    setBusy(true); setErr("");
    try { await brief(); } catch (e) { setErr((e as Error).message); }
    await onChange(); setVer((v) => v + 1); setProg(""); setBusy(false);
  };
  const save = async () => {
    setBusy(true); setErr("");
    try {
      const slides = Object.entries(draft).map(([n, d]) => {
        const s = sc?.slides.find((x) => x.n === Number(n));
        return { n: Number(n), keep: d.keep ?? s?.keep ?? "", lines: (d.text ?? s?.lines.join("\n") ?? "").split("\n") };
      });
      await api(`/jobs/${job.id}/script`, { method: "PUT", body: JSON.stringify({ slides }) });
      await onChange(); setEdit(false); setDraft({}); setVer((v) => v + 1);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };

  /** 발표 시간 — 타이머 아이콘 + − 숫자 + (분). 다시 만들 때 이 시간으로 장마다 나눈다 */
  const stepper = (
    <span className="flex items-center gap-2 flex-none" title="발표 시간 — 다시 만들 때 이 시간으로 장마다 나눕니다">
      <Ms name="timer" size={19} className="text-ink2" />
      <span className="flex items-center h-[38px] border border-line rounded-md bg-white overflow-hidden">
        <button type="button" title="1분 줄이기" aria-label="1분 줄이기" disabled={busy || minutes <= 3} onClick={() => setMinutes((m) => Math.max(3, m - 1))}
          className="w-8 h-full text-dim inline-flex items-center justify-center hover:bg-panel hover:text-ink disabled:text-[var(--color-line-3)]"><Ms name="remove" size={18} /></button>
        <span className="min-w-[28px] text-center font-bold" role="status" aria-label={`발표 시간 ${minutes}분`}>{minutes}</span>
        <button type="button" title="1분 늘리기" aria-label="1분 늘리기" disabled={busy || minutes >= 90} onClick={() => setMinutes((m) => Math.min(90, m + 1))}
          className="w-8 h-full text-dim inline-flex items-center justify-center hover:bg-panel hover:text-ink disabled:text-[var(--color-line-3)]"><Ms name="add" size={18} /></button>
      </span>
      <span className="text-[13.5px] text-ink2">분</span>
    </span>
  );
  const IB = "w-[38px] h-[38px] p-0 border border-line bg-white rounded-md text-ink3 inline-flex items-center justify-center flex-none hover:bg-panel disabled:text-faint";

  // 다듬기 작업 — 대본은 기획이 있는 작업에서만
  if (job.kind !== "design") return (
    <div className="flex-1 flex items-center justify-center px-8 bg-panel">
      <div className="w-full max-w-[540px] text-center">
        <div className="text-[18px] font-extrabold tracking-[-.02em]">발표 대본은 '내용으로 장표 만들기' 작업에서만 됩니다</div>
        <div className="text-[14px] text-ink2 mt-2 leading-[1.75] break-keep">대본은 장마다 <b>무엇을 전달할지</b>(기획)를 바탕으로 씁니다. '초안 PPT 다듬기'는 디자인만 정리하는 작업이라 기획이 없어 대본을 만들 수 없습니다. 대본이 필요하면 새 변환에서 <b>내용으로 장표 만들기</b>로 진행해 주세요.</div>
      </div>
    </div>
  );

  // 아직 아무것도 없다 — 만들기
  if (!sc && !qa.length) return (
    <div className="flex-1 flex items-center justify-center px-8 bg-panel">
      <div className="w-full max-w-[580px] bg-white border border-line rounded-field p-7 flex flex-col gap-4">
        <div>
          <div className="text-[18px] font-extrabold tracking-[-.02em]">발표 대본을 만들까요?</div>
          <div className="text-[14px] text-ink2 mt-1.5 leading-[1.7] break-keep">발표 시간을 장마다 나눠 <b>그대로 읽을 말</b>과 <b>남길 문장</b> · 화면에서 가리킬 곳 · 말하는 법을 씁니다. 발표 전 점검, 어긋났을 때 할 일, 리허설 타이머가 든 <b>대본 문서</b>와 노래방식 <b>연습 화면</b>으로 받습니다.</div>
        </div>
        <div className="flex items-center gap-3"><span className="text-[13.5px] font-semibold text-ink3">발표 시간</span>{stepper}</div>
        <textarea className="field !min-h-[76px] !p-3 !leading-[1.5] resize-y" placeholder="(선택) 발표자 요청 — 예: 3쪽은 길게, 차분한 말투, 데모 2분 포함" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex gap-2">
          <button className="btn-next flex-1 !h-[42px]" disabled={busy} onClick={make}><Ms name="record_voice_over" size={19} />{busy && prog !== "예상 질문" ? `만드는 중… ${prog}` : "대본 만들기"}</button>
          <button className="btn-back flex-1 !h-[42px]" disabled={busy} onClick={makeQa}><Ms name="quiz" size={19} />{busy && prog === "예상 질문" ? "만드는 중…" : "예상 질문 만들기"}</button>
        </div>
        <div className="text-[12.5px] text-faint leading-[1.5]">{all.length > BATCH ? `${all.length}장은 ${BATCH}장씩 ${Math.ceil(all.length / BATCH)}번에 나눠 씁니다 · ` : ""}만든 뒤 장마다 바로 고칠 수 있습니다</div>
      </div>
    </div>
  );

  const sec = sc ? sc.sec ?? Math.round(sc.chars / 5.5) : 0;
  const goal = sc?.goal ?? 0;
  const shown: View = sc ? view : "qa";   // 대본 없이 예상 질문만 있으면 질문만
  const SEG: [View, string, string][] = [["doc", "description", "대본 문서"], ["practice", "mic", "연습 화면"], ["qa", "quiz", `예상 질문${qa.length ? ` ${qa.length}` : ""}`]];

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-panel">
      <div className="h-14 flex-none flex items-center gap-3 px-6 bg-white border-b border-line overflow-x-auto scroll-thin">
        {sc ? (
          <div className="seg !rounded-md">
            {SEG.map(([k, ic, l]) => <button key={k} type="button" aria-pressed={shown === k && !edit} className="!px-3" onClick={() => { setView(k); setEdit(false); }}><Ms name={ic} size={18} />{l}</button>)}
          </div>
        ) : <span className="head-title inline-flex items-center gap-1.5"><Ms name="quiz" size={20} />예상 질문 {qa.length}개</span>}
        {sc && <span className="text-[14px] font-bold whitespace-nowrap flex-none">{sc.slides.length}장 · 대본 {fmt(sec)}{" "}
          {goal > 0 && <span className={cn("font-medium", sec > goal ? "text-[var(--color-warn)]" : "text-faint")}>/ 목표 {Math.round(goal / 60)}분{sec > goal ? ` (+${fmt(sec - goal)} 초과)` : ""}</span>}
        </span>}
        {busy && <span className="text-[13px] font-semibold text-orange-d whitespace-nowrap truncate min-w-0">{prog === "예상 질문" ? "예상 질문 만드는 중…" : prog === "앞뒤 정리" ? "점검·구간 정리 중…" : `대본 쓰는 중… ${prog}`}</span>}
        <span className="flex-1 min-w-0" />
        {!sc ? (
          <div className="flex items-center gap-2 flex-none">
            {stepper}
            <span className="vsep mx-1" />
            <button className="btn-back !pl-2.5 !pr-3.5" disabled={busy} onClick={makeQa}><Ms name="autorenew" size={19} className={busy && prog === "예상 질문" ? "animate-spin" : undefined} />예상 질문 다시 만들기</button>
            <button className="btn-next !pl-3.5" disabled={busy} onClick={make}><Ms name="record_voice_over" size={19} />대본 만들기</button>
          </div>
        ) : edit ? (
          <div className="flex items-center gap-2 flex-none">
            <button className="btn-back" onClick={() => { setEdit(false); setDraft({}); }}>취소</button>
            <button className="btn-next" disabled={busy} onClick={save}><Ms name="save" size={19} />저장</button>
          </div>
        ) : shown === "qa" ? (
          <div className="flex items-center gap-2 flex-none">
            <button className="btn-back !pl-2.5 !pr-3.5" disabled={busy} onClick={makeQa}><Ms name="autorenew" size={19} className={busy && prog === "예상 질문" ? "animate-spin" : undefined} />{qa.length ? "예상 질문 다시" : "예상 질문 만들기"}</button>
            <a className="btn-next !pl-3.5" href={jobUrl(job.id, "script.md?dl=1")}><Ms name="download" size={19} />대본+질문 (.md)</a>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-none">
            {stepper}
            <span className="vsep mx-1" />
            <button className={IB} title="대본 고치기" aria-label="대본 고치기" onClick={() => setEdit(true)}><Ms name="edit_note" size={19} /></button>
            {!sc.brief && <button className={IB} disabled={busy} title="점검·구간 만들기 — 한 문장 요약·구간·발표 전 점검·어긋났을 때를 이 대본에 맞춰 만듭니다" aria-label="점검·구간 만들기" onClick={remakeBrief}><Ms name="checklist" size={19} /></button>}
            <button className={IB} disabled={busy} title={`대본 다시 만들기 — 발표 시간 ${minutes}분에 맞춰 처음부터 다시 씁니다`} aria-label="대본 다시 만들기"
              onClick={async () => { if (await ask(`발표 시간 ${minutes}분에 맞춰 대본을 처음부터 다시 씁니다.\n손으로 고친 내용은 사라집니다.`, { title: "대본을 다시 만들까요?", ok: "다시 만들기" })) make(); }}>
              <Ms name="autorenew" size={19} className={busy && prog !== "예상 질문" ? "animate-spin" : undefined} /></button>
            <a className={IB} href={jobUrl(job.id, shown === "practice" ? "practice.html" : "script.html")} target="_blank" rel="noreferrer" title="새 창으로 열기" aria-label="새 창으로 열기"><Ms name="open_in_new" size={19} /></a>
            <a className={IB} href={jobUrl(job.id, "script.md?dl=1")} title=".md 받기" aria-label=".md 받기"><Ms name="download" size={19} /></a>
            <a className="btn-next !pl-3.5" href={jobUrl(job.id, shown === "practice" ? "practice.html?dl=1" : "script.html?dl=1")}><Ms name="download" size={19} />{shown === "practice" ? "연습 화면 받기" : "대본 받기"} (.html)</a>
          </div>
        )}
      </div>
      {sc?.stale && !edit && (
        <div className="flex-none px-6 py-2 bg-[var(--color-mark-soft)] text-[13px] font-semibold text-[var(--color-ink-2)]">이 대본은 장표를 다시 만들기 전의 내용 기준입니다. 고친 장표에 맞추려면 다시 만들기(<Ms name="autorenew" size={15} className="align-[-3px]" />)를 누르거나 대본 고치기(<Ms name="edit_note" size={15} className="align-[-3px]" />)로 손봐 주세요.</div>
      )}
      {sc && edit ? (
        <div className="flex-1 min-h-0 overflow-y-auto scroll-thin px-8 py-5">
          <div className="text-[13.5px] text-dim mb-3 leading-[1.6]">한 줄이 한 호흡입니다. <b className="text-ink2">빈 줄은 쉬어 가는 자리</b>입니다. 힘줘 말할 곳은 <b className="text-ink2">**이렇게**</b> 감싸면 굵게 보입니다. <b className="text-ink2">남길 문장</b>은 시간이 모자라도 반드시 말하는 한 문장으로, 대본 문서에서 밑줄로 표시됩니다.</div>
          {sc.slides.map((s) => {
            const d = draft[s.n] ?? {};
            const text = d.text ?? s.lines.join("\n");
            return (
              <div key={s.n} className="mb-5">
                <div className="font-bold mb-1.5">{s.n}쪽 · {s.title} {s.sec ? <span className="font-medium text-dim">· 배정 {s.sec}초</span> : null}</div>
                <input className="field mb-1.5" placeholder="남길 문장" aria-label={`${s.n}쪽 남길 문장`} value={d.keep ?? s.keep ?? ""} onChange={(e) => setDraft({ ...draft, [s.n]: { ...d, keep: e.target.value } })} />
                <textarea className="field !leading-[1.8] resize-y" aria-label={`${s.n}쪽 읽을 말`} style={{ height: Math.max(140, text.split("\n").length * 28 + 30) }} value={text} onChange={(e) => setDraft({ ...draft, [s.n]: { ...d, text: e.target.value } })} />
              </div>
            );
          })}
        </div>
      ) : shown === "qa" ? (
        qa.length ? (
          <div className="flex-1 min-h-0 overflow-y-auto scroll-thin px-8 pt-5 pb-10">
            <div className="flex flex-col gap-3">
              <div className="text-[13.5px] text-dim leading-[1.55]">평가위원이 발표 직후 던질 압박 질문과 30초 답변입니다. 근거는 장표·기획·사업 요약에 있는 것만 썼고, 자료에 근거가 없으면 <b className="text-orange-d">준비할 것</b>으로 표시했습니다. 대본 문서 끝에도 들어갑니다.</div>
              {qa.map((x, i) => (
                <div key={i} className="bg-white border border-line rounded-field px-5 py-[18px] flex flex-col gap-2">
                  <div className="flex items-start gap-2.5">
                    <span className="flex-none font-extrabold text-orange-d text-[14px] leading-[1.5] min-w-[20px]">Q{i + 1}</span>
                    <span className="flex-1 min-w-0 font-bold text-[15.5px] leading-[1.5]">{x.q}</span>
                    {(x.kind || x.slide > 0) && <span className="flex-none whitespace-nowrap h-6 px-2 rounded-md bg-side text-ink2 text-[12.5px] font-semibold inline-flex items-center">{[x.kind, x.slide ? `${x.slide}쪽` : ""].filter(Boolean).join(" · ")}</span>}
                  </div>
                  <div className="text-[14px] leading-[1.7] text-ink3 pl-[30px]">{x.a}</div>
                  {x.need && <div className="ml-[30px] self-start inline-flex items-center gap-1.5 min-h-7 px-2.5 py-1 rounded-md bg-orange-soft text-orange-d text-[13px] font-bold leading-[1.45]"><Ms name="assignment_late" size={16} />준비할 것: {x.need}</div>}
                </div>
              ))}
            </div>
          </div>
        ) : <div className="flex-1 flex items-center justify-center text-[14px] text-faint">평가위원이 던질 압박 질문과 답변을 만듭니다 — 위의 「예상 질문 만들기」</div>
      ) : shown === "practice" ? <FrameDoc key={"p" + ver} title="발표 연습" src={jobUrl(job.id, "practice.html")} dark />
        : <FrameDoc key={"d" + ver} title="발표 대본" src={jobUrl(job.id, "script.html")} />}
    </div>
  );
}

// powerDeck 설정 — 출처: powerDeck web/src/screens/Settings.tsx (옛 화면 그대로 이식, eslint.config.js legacy 구역).
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Arrow, Ms, Select, cn, useToastOn, sent } from "../ui";
import { LiveDot } from "@/components/hb/live-status";
import { refZipUrl, usd } from "../api";
import { buildModels, checkAiKey, getAi, listModels, saveAdmin, saveBudget, textModels, type AiSettings, type KeyInfo, type OrModel } from "../openrouter";
import { BillPane } from "./Admin";

type Msg = { t: string; ok?: boolean } | null;
type Run = (f: () => Promise<string>) => void;
export type SettingsMenu = "ai" | "engine" | "bill" | "ref";
type Menu = SettingsMenu;
/** 하위 메뉴 — 마이페이지 왼쪽 "설정" 아래에 그대로 펼친다(사용자 지시: 본문 안에 사이드를 또 두지 않는다) */
export const DECK_SETTINGS_MENU: { id: Menu; label: string; admin: boolean }[] = [
  { id: "ai", label: "내 현황", admin: false },
  { id: "engine", label: "AI · 엔진", admin: true },
  { id: "bill", label: "이력 · 과금", admin: true },
  { id: "ref", label: "참조 자료", admin: true },
];

/**
 * 설정 — 모든 설정은 회사 관리자가 한다(개인 키·개인 모델 없음). 관리자: 설정 한 페이지(상태·엔진·키·시안 그림·비용 한도) / 이력·과금 / 참조 자료.
 * 일반 사용자: 회사 설정은 건드릴 수 없고, 읽기 전용 AI 상태와 본인 작업 이력만 본다. 키는 서버에 암호화 저장하고 화면에는 끝자리만 온다.
 * 내 현황은 마이페이지(/account/settings/deck), 관리자 메뉴 3종은 관리자 모드(/admin/deck-settings/<menu>)가 forceMenu 로 고른다.
 */
export function Settings({ isAdmin, menu, onChange, onOpen }: { isAdmin: boolean; menu?: Menu; onChange: () => void; onOpen: (id: string) => void }) {
  const [ai, setAi] = useState<AiSettings | null>(null);
  const [info, setInfo] = useState<KeyInfo | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  useToastOn(loadErr);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [models, setModels] = useState<OrModel[]>([]);
  const [modelErr, setModelErr] = useState<string | null>(null);
  useToastOn(modelErr);

  const cur: Menu = isAdmin ? (menu ?? "ai") : "ai";   // 관리자도 마이페이지에선 내 현황, 관리자 화면이 engine·bill·ref 를 forceMenu 로 준다
  useEffect(() => { setMsg(null); }, [cur]);

  const load = useCallback(async () => {
    try {
      const s = await getAi();
      setAi(s); setLoadErr(null);
      setInfo(null);
      if (s.ready) checkAiKey().then((r) => setInfo(r.info)).catch((e) => setMsg({ t: (e as Error).message }));
    } catch (e) { setLoadErr((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { listModels().then(setModels).catch((e) => setModelErr((e as Error).message)); }, []);

  const run: Run = async (f) => {
    setBusy(true); setMsg(null);
    try { setMsg({ t: await f(), ok: true }); await load(); onChange(); }
    catch (e) { setMsg({ t: (e as Error).message }); }
    setBusy(false);
  };

  const needAi = cur === "ai" || cur === "engine" || cur === "bill";

  return (
    <div className="flex-1 min-h-0">
      <div className="min-h-0">
        {needAi && !ai && <div className={cn("text-[13px] font-semibold", loadErr ? "text-orange-d" : "text-dim")} role={loadErr ? "alert" : undefined}>{loadErr ?? "불러오는 중…"}</div>}
        {cur === "ai" && ai && (
          <div className="flex flex-col gap-8">
            <StatusPane ai={ai} info={info} isAdmin={isAdmin} />
            <BillPane onOpen={onOpen} mine />
          </div>
        )}
        {cur === "engine" && ai && <EnginePane ai={ai} info={info} models={models} modelErr={modelErr} busy={busy} run={run} msg={msg} />}
        {cur === "bill" && <BillPane onOpen={onOpen} />}
        {cur === "ref" && <RefPane />}
      </div>
    </div>
  );
}

/* ── 본문 공통 ── */

/** 본문 한 화면 — 19px 제목 · 회색 설명 · 결과 알림 · 라벨-입력 줄들 */
function Pane({ title, desc, msg, children }: { title: string; desc?: ReactNode; msg?: Msg; children: ReactNode }) {
  return (
    <div className="w-full">
      <div className="text-[19px] font-bold">{title}</div>
      {desc && <div className="text-dim mt-1 leading-[1.55] break-keep">{sent(desc)}</div>}
      {msg && (
        <div role="alert" className={cn("mt-3 flex items-start gap-1.5 text-[13px] font-semibold leading-[1.6]", msg.ok ? "text-ok" : "text-orange-d")}>
          <Ms name={msg.ok ? "check_circle" : "warning"} size={18} className="mt-px" />{msg.t}
        </div>
      )}
      <div className="mt-3 border-t border-line">{children}</div>
    </div>
  );
}

/** 라벨-입력 줄 — minmax(180px,260px) | 1fr */
function Row({ label, desc, last, children }: { label?: ReactNode; desc?: ReactNode; last?: boolean; children: ReactNode }) {
  return (
    <div className={cn("grid gap-3 py-[18px] md:grid-cols-[minmax(180px,260px)_minmax(0,1fr)] md:gap-8", !last && "border-b border-line-soft")}>
      <div className="min-w-0">
        {label && <div className="font-bold">{label}</div>}
        {desc && <div className="text-[13px] text-dim mt-[3px] leading-[1.5] break-keep">{sent(desc)}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function KeyInput({ busy, hasKey, onSave, onRemove, removeLabel = "키 지우기", placeholder = "sk-or-v1-…" }: {
  busy: boolean; hasKey: boolean; onSave: (k: string) => void; onRemove?: () => void; removeLabel?: string; placeholder?: string;
}) {
  const [v, setV] = useState("");
  const [show, setShow] = useState(false);
  const save = () => { if (v.trim()) { onSave(v.trim()); setV(""); setShow(false); } };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <input className="field font-mono !text-[16px] sm:!text-[13px] !pr-11" type={show ? "text" : "password"} autoComplete="off" spellCheck={false}
            placeholder={placeholder} aria-label="OpenRouter API 키" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
          <button type="button" className="btn-icon absolute right-[5px] top-[5px]" title={show ? "숨기기" : "보기"} aria-label={show ? "숨기기" : "보기"} onClick={() => setShow((s) => !s)}>
            <Ms name={show ? "visibility_off" : "visibility"} size={19} />
          </button>
        </div>
        <button className="btn-dark !h-10 !px-[18px] !font-semibold" disabled={busy || !v.trim()} onClick={save}><Ms name="save" size={19} />{busy ? "확인 중…" : "저장"}</button>
      </div>
      {hasKey && onRemove && (
        <button className="pp-hit self-start inline-flex items-center gap-1.5 text-[13px] text-[var(--color-warn)] bg-transparent border-0 p-0 whitespace-nowrap hover:underline disabled:opacity-50" disabled={busy} onClick={onRemove}>
          <Ms name="delete" size={18} />{removeLabel}
        </button>
      )}
    </div>
  );
}

const KeyHelp = () => (
  <><a className="pp-hit text-orange-d hover:underline" href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer">OpenRouter <Arrow size={14} /> API Keys</a>에서 만들고 월 한도를 걸어 두세요</>
);

/** 연결 상태 한 줄 — 회사 키 끝자리 · OpenRouter 잔액 막대. 관리자 「엔진 · 키」 맨 위와 일반 사용자 「AI 상태」가 같이 쓴다 */
function StatusRow({ ai, info, last, money = true }: { ai: AiSettings; info: KeyInfo | null; last?: boolean; money?: boolean }) {
  const st = !ai.ready ? "none" : info ? "ok" : "wait";
  // 막대 = OpenRouter 계정에 실제로 남은 돈(충전한 금액 대비). 키 한도는 사용자 경고에만 쓴다
  const pct = info && info.credits != null && info.credits > 0 ? Math.min(100, Math.max(0, ((info.balance ?? 0) / info.credits) * 100)) : null;
  return (
    <Row label="현재 상태" last={last}>
      <div className="flex flex-col gap-2.5">
        <div className="flex gap-2 items-center flex-wrap">
          <span className={cn("flex-none whitespace-nowrap inline-flex items-center gap-1.5 text-[13px] font-semibold rounded-md px-2 py-[3px]",
            st === "ok" ? "text-ok bg-ok-soft" : st === "wait" ? "text-orange-d bg-orange-soft" : "text-[var(--color-warn)] bg-[var(--color-warn-soft)]")}>
            <LiveDot state={st === "ok" ? "ok" : st === "wait" ? "wait" : "warn"} />
            {st === "none" ? "OpenRouter 키 미등록" : st === "ok" ? "연결됨" : "확인 중"}
          </span>
          {ai.company.hint && <span className="font-mono text-[13px]">{ai.company.hint}</span>}
          {st === "none" && <span className="text-[13px] text-ink2">· 등록 전에는 시안·대본을 만들 수 없습니다</span>}
        </div>
        {money && info && (
          <div className="flex items-center gap-2.5 flex-wrap">
            {pct != null && <div className="flex-1 min-w-[120px] max-w-[320px] h-1.5 rounded-md bg-track overflow-hidden"><div className="h-full bg-orange" style={{ width: `${pct}%` }} /></div>}
            {info.balance != null
              ? <span className="text-[13px] text-ink2">OpenRouter 잔액 <b className={cn("text-[15px]", info.balance < 1 ? "text-[var(--color-warn)]" : "text-ink")}>{usd(info.balance)}</b>{info.credits != null && <span className="text-faint"> (충전 {usd(info.credits)})</span>}</span>
              : <span className="text-[13px] text-ink2">잔액을 확인하지 못했습니다</span>}
            {info.limit_remaining != null && <span className="text-[12px] text-faint" title="키 한도는 이 키로 한 달에 쓸 수 있는 상한입니다">키 한도 {usd(info.limit_remaining)} 남음</span>}
          </div>
        )}
      </div>
    </Row>
  );
}

/* ── 일반 사용자: 내 현황(읽기 전용) — AI 상태 · 내 이달 사용 · 아래에 내 작업 이력 ── */
function StatusPane({ ai, info, isAdmin }: { ai: AiSettings; info: KeyInfo | null; isAdmin: boolean }) {
  const showCost = isAdmin && (ai.budget.monthly_cap != null || ai.budget.default != null);
  return (
    <Pane title="내 현황" desc="AI 키 · 모델 · 비용 한도는 관리자가 설정합니다. 문제가 있으면 관리자에게 알려 주세요.">
      <StatusRow ai={ai} info={info} money={isAdmin} last={!showCost} />
      {showCost && (
        <Row label="내 비용" desc="관리자가 정한 한도" last>
          <div className="text-ink2">이달 <b className="text-ink">{usd(ai.budget.month_spent, 3)}</b>{ai.budget.monthly_cap != null && <> / 상한 {usd(ai.budget.monthly_cap)}</>}{ai.budget.default != null && <> · 작업당 한도 {usd(ai.budget.default)}</>}</div>
        </Row>
      )}
    </Pane>
  );
}

/* ── 관리자: 설정(한 페이지) ── */

const SPARK = "meta/muse-spark-1.3-contributor";
/** 모델 선택 아래 추천 조합 — 추론 강도는 서버가 작업 종류·모델에 맞춰 정한다(사람이 고르지 않는다) */
function Rec({ children }: { children: ReactNode }) {
  return <div className="mt-1.5 text-[12.5px] text-dim break-keep [&_b]:font-mono [&_b]:font-semibold [&_b]:text-ink3">{children} · 추론은 자동</div>;
}

/**
 * 설정 한 페이지 — 상태 / 장표 제작 모델 / 기획·요약·대본 모델·추론 강도 / 회사 OpenRouter 키 / 시안 그림(고정) / 비용 한도.
 * 모든 AI 는 회사 OpenRouter 키 하나로 — 제작·글 모델은 OpenRouter 목록의 아무 모델이나(엔진이 모델 능력에 맞춰 부른다), 시안 그림 모델은 고정.
 * 글 모델은 text_model(기본)과 회사 기본 plan 을 한 번에 같은 값으로 저장한다 — 두 군데에 따로 있던 것이 혼란이었다.
 */
function EnginePane({ ai, info, models, modelErr, busy, run, msg }: { ai: AiSettings; info: KeyInfo | null; models: OrModel[]; modelErr: string | null; busy: boolean; run: Run; msg: Msg }) {
  // 목록에 없는 지금 값도 보이게
  const withCur = (list: OrModel[], cur: string) => (list.some((m) => m.id === cur) ? list : [{ id: cur, name: cur, output: ["text"] } as OrModel, ...list]).map((m) => [m.id, m.name] as const);
  const em = ai.engine_model, tm = ai.text_model ?? SPARK, dm = ai.digest_model ?? "";
  const cm = ai.admin_models ?? ai.models;
  return (
    <Pane title="키·모델·한도 바꾸기" desc="모든 AI 는 OpenRouter 키 하나로 부릅니다. 바꾸면 다음 작업부터 적용됩니다." msg={msg}>
      <StatusRow ai={ai} info={info} />
      <Row label="장표 제작 모델" desc="시안을 보고 장표를 만드는 에이전트 · 도구 호출·그림 보기가 되는 모델">
        <Select className="font-semibold" label="장표 제작 모델" value={em} disabled={busy}
          onChange={(v) => v !== em && run(async () => { await saveAdmin({ engine_model: v }); return `장표 제작 모델을 ${v} 로 바꿨습니다.`; })}
          options={withCur(buildModels(models), em)} />
        <Rec>추천 — 품질 <b>anthropic/claude-opus-5.5</b> · 비용 <b>meta/muse-spark-1.3-contributor</b></Rec>
      </Row>
      <Row label="기획 · 대본" desc="기획 · 와이어 · 발표 대본 · QA (자료 정리를 따로 고르지 않으면 자료 정리도)">
        <Select className="font-semibold" label="글 모델" value={tm} disabled={busy}
          onChange={(v) => v !== tm && run(async () => { await saveAdmin({ text_model: v, plan: v, image: cm.image }); return `글 모델을 ${v} 로 바꿨습니다.`; })}
          options={withCur(textModels(models), tm)} />
        <Rec>추천 — <b>meta/muse-spark-1.3-contributor</b> · 글맛 <b>anthropic/claude-sonnet-5.5</b></Rec>
        {modelErr && <div className="mt-2 text-[13px] font-semibold text-orange-d">{modelErr}</div>}
      </Row>
      <Row label="자료 정리" desc="올린 자료(제안요청서·과업지시서 등)를 기획 전에 요약 · 모델마다 품질을 견줘 볼 때">
        <Select className="font-semibold" label="자료 정리 모델" value={dm} disabled={busy}
          onChange={(v) => v !== dm && run(async () => { await saveAdmin({ digest_model: v }); return v ? `자료 정리 모델을 ${v} 로 바꿨습니다.` : "자료 정리를 글 모델과 같게 합니다."; })}
          options={[["", `글 모델과 같게 (${tm})`] as const, ...(dm ? withCur(textModels(models), dm) : textModels(models).map((m) => [m.id, m.name] as const))]} />
        <Rec>추천 — <b>글 모델과 같게</b> · 따로 고를 땐 <b>meta/muse-spark-1.3-contributor</b></Rec>
      </Row>
      <Row label={ai.company.set ? "OpenRouter 키" : "OpenRouter 키 등록"} desc={<>{ai.company.set && <>지금 <span className="font-mono text-ink">{ai.company.hint}</span><br /></>}<KeyHelp /></>}>
        <KeyInput busy={busy} hasKey={ai.company.set} removeLabel="키 지우기"
          onSave={(k) => run(async () => { await saveAdmin({ company_key: k, mode: "company" }); return "키를 확인하고 저장했습니다."; })}
          onRemove={() => run(async () => { await saveAdmin({ remove_company_key: true }); return "키를 지웠습니다."; })} />
      </Row>
      <Row label="시안 그림" desc="표지 · 목차 · 간지 · 본문 시안 그림 — OpenRouter 고정 모델">
        <div className="text-[14px] break-keep">
          <div><span className="text-dim">일러스트·3D</span> <span className="font-mono font-semibold">{cm.image}</span></div>
          <div className="mt-1"><span className="text-dim">실사·합성</span> <span className="font-semibold">나노바나나 2</span> <span className="text-dim">(디자인 타입별 설정)</span></div>
        </div>
      </Row>
      <LimitRow ai={ai} busy={busy} run={run} />
    </Pane>
  );
}

/* ── 관리자: 비용 한도 ── */

/** 새 작업의 기본 한도, 이달 상한. 작업 한도는 작업마다 따로 정할 수 있다 */
/** 비용 한도 — 설정 페이지의 마지막 줄. 회사 키 하나를 모두가 쓰므로 작업당 한도와 사용자별 월 상한이 비용을 지킨다 */
function LimitRow({ ai, busy, run }: { ai: AiSettings; busy: boolean; run: Run }) {
  const [def, setDef] = useState(ai.budget.default != null ? String(ai.budget.default) : "");
  const [cap, setCap] = useState(ai.budget.monthly_cap != null ? String(ai.budget.monthly_cap) : "");
  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  const isBad = (s: string) => s.trim() !== "" && (!isFinite(Number(s)) || Number(s) < 0);
  const bad = isBad(def) || isBad(cap);
  const dirty = num(def) !== ai.budget.default || num(cap) !== ai.budget.monthly_cap;
  const inp = (v: string, set: (s: string) => void, label: string) => (
    <input className={cn("field !w-[120px] text-right font-mono", isBad(v) && "!border-[var(--color-warn)]")} inputMode="decimal" value={v} onChange={(e) => set(e.target.value)} placeholder="없음" aria-label={label} />
  );
  return (
    <Row label="비용 한도 (USD)" desc="작업당 한도에 닿으면 그 작업이 멈추고(관리자가 올리면 이어서), 월 상한에 닿으면 그 사람의 새 호출을 막습니다. 비우면 한도 없음" last>
      <div className="flex items-center gap-2 flex-wrap">
        <label className="flex items-center gap-2 text-[13px] text-dim whitespace-nowrap">작업당 {inp(def, setDef, "작업당 한도 (USD)")}</label>
        <label className="flex items-center gap-2 text-[13px] text-dim whitespace-nowrap ml-2">사용자별 월 상한 {inp(cap, setCap, "사용자별 월 상한 (USD)")}</label>
        <button className="btn-dark !h-10 !px-[18px] !font-semibold ml-2" disabled={busy || bad || !dirty}
          onClick={() => run(async () => { await saveBudget({ default_budget_usd: num(def), monthly_cap_usd: num(cap) }); return "비용 한도를 저장했습니다."; })}><Ms name="save" size={19} />저장</button>
        {bad && <span className="text-[13px] font-semibold text-[var(--color-warn)] whitespace-nowrap">0 이상의 숫자로 적어 주세요</span>}
      </div>
    </Row>
  );
}

/* ── 관리자: 참조 자료 ── */

/** 참조 시안 그림 묶음(reference.zip) 받기 — 새 엔진 PC 를 차릴 때 쓴다 */
function RefPane() {
  return (
    <div className="w-full">
      <div className="text-[19px] font-bold">참조 자료</div>
      <div className="mt-4 border border-line rounded-md p-4 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="font-bold">참조 시안 그림 묶음 <span className="font-normal text-dim">· 약 130MB</span></div>
          <div className="text-[13.5px] text-ink2 mt-1 leading-[1.5] break-keep">git에 없는 reference/mockups 그림입니다. 새 엔진 PC에 받아 <span className="font-mono text-[12.5px]">D:\powerDeck\</span>에 풀어 넣으세요.</div>
        </div>
        <a className="btn-back !h-10 !px-[18px]" href={refZipUrl()}><Ms name="download" size={17} />받기 (.zip)</a>
      </div>
    </div>
  );
}

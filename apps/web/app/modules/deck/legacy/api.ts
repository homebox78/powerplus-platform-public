// powerDeck API 클라이언트 — 출처: powerDeck web/src/api.ts. 플랫폼 이식(계약 §4):
//   · 경로 /api/v1/deck, 플랫폼 세션 쿠키 + X-Requested-With: powerplus (Bearer 토큰·devRole 없음)
//   · 응답 {data: …} 봉투를 벗겨 옛 코드에 넘긴다. 오류는 {error, code, message} → message ?? error
//   · export 이름(token·setToken·devRole…)은 화면 코드 호환을 위해 남기되 빈 동작이다.
export const API = "/api/v1/deck";

/** [호환] 옛 Bearer 토큰 — 플랫폼은 세션 쿠키라 항상 null */
export const token = (): string | null => null;
/** [호환] 빈 동작 */
export const setToken = (_t: string | null, _keep = true) => { /* 플랫폼 세션 */ };

export class ApiError extends Error {
  status: number;
  constructor(msg: string, status: number) { super(msg); this.status = status; }
}

/** [호환] 옛 개발용 역할 바꿔 보기 — 플랫폼에서는 쓰지 않는다 */
export function devRole(): string { return ""; }
export function setDevRole(_r: "admin" | "user" | "") { /* 없음 */ }

const HEADERS = { "X-Requested-With": "powerplus", Accept: "application/json" };

type Envelope = { data?: unknown; error?: string; code?: string; message?: string };

export async function api<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...HEADERS, ...(opts.headers as Record<string, string>) };
  if (opts.body && typeof opts.body === "string") headers["Content-Type"] = "application/json";
  const res = await fetch(API + path, { credentials: "same-origin", ...opts, headers, cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as Envelope;
  // 로그인 만료 — 플랫폼 로그인 화면으로 돌아가게 알린다
  if (res.status === 401) window.dispatchEvent(new Event("pd:unauth"));
  if (!res.ok) {
    const msg = body.message || body.error || `오류 ${res.status}`;
    // 조회가 아닌 요청(저장·시작·삭제…)의 실패는 어느 화면에서든 토스트로 알린다 — ui.tsx Toaster
    if ((opts.method ?? "GET") !== "GET" && res.status !== 401) window.dispatchEvent(new CustomEvent("pd:toast", { detail: { msg, kind: "error" } }));
    throw new ApiError(msg, res.status);
  }
  if (res.status === 204) return null as T;
  // 플랫폼 봉투 {data: X} 를 벗긴다(data 키 하나뿐일 때). 옛 목록 응답 {data:[…]} 는 백엔드가 풀어 보내므로 여기서 한 번만
  if (body && typeof body === "object" && "data" in body && Object.keys(body).length === 1) return body.data as T;
  return body as T;
}

/** <img>·다운로드 링크용 — 세션 쿠키로 인증되므로 토큰 쿼리는 없다 */
export const fileUrl = (jobId: string, kind: string, name: string, download = false) =>
  `${API}/jobs/${jobId}/files/${kind}/${encodeURIComponent(name)}?t=${download ? "&download=1" : ""}`;

export type JobStatus = "hold" | "queued" | "running" | "review" | "done" | "failed" | "canceled";
/** 시안 이미지 위 핀 의견 — x·y 는 이미지 안 위치(0~1) */
export type PinComment = { id: number; slide: number; x: number; y: number; email: string; body: string; resolved: boolean; created_at: string;
  /** 주인이 '반영하기'로 확정한 의견만 장표에 반영된다 (주인 본인 의견은 처음부터 true) */
  /** mockup = 시안 위, result = 완성 장표 위 */
  target?: "mockup" | "result";
  accepted: boolean; replies: { id: number; email: string; body: string; created_at: string }[] };
export type JobDoc ={ id: string; name: string; size: number; created_at: string };
export type JobFile = { kind: string; slide: number | null; name: string; size: number; ts?: number };
export type JobEvent = { id: number; ts: string; kind: string; message: string };
export type CheckItem = { title: string; detail?: string; slide?: number; level?: "info" | "warn" };
export type Report = {
  summary?: string;
  score?: number;
  stats?: { label: string; value: string | number }[];
  checklist?: CheckItem[];
  changes?: string[];
  assets_used?: { slide: number; id: string; why?: string }[];
  pilot_slide?: number;
};
/** design 작업의 장별 기획 (엔진이 만들고, 시안 확인에서 사용자가 고친다) */
export type PlanSlide = {
  n: number; section?: string; chapter?: string; title: string; type?: string; ref?: (string | number)[]; layout?: string; content: string; image_prompt?: string;
  message?: string; mood?: string; scene?: string; keyword?: string; device?: string;
  wire?: WireBlock[];               // 와이어프레임 — 시안 전에 잡는 화면 구성(본문 기준 %)
  wire_checks?: string[];           // 배치 합격 기준에서 걸린 것(겹침·글 넘침·빠진 수치) — 서버가 채운다
  wire_alt?: { a: WireBlock[]; b: WireBlock[] };   // A·B 두 안 — 엔진이 같은 기획으로 다르게 짠 배치
  wire_at?: string;                 // 와이어프레임을 만든 시각(서버 UTC) — 엔진·AI 가 새로 짠 때
  wire_pick?: "a" | "b";            // 확정한 안(그 안이 wire 가 된다). 없으면 아직 고르지 않음 — 시안은 A안(wire)으로
  checks?: string[];                // 사실·근거 점검(AI 없이) — 자료에 없는 수치, 과장·메타 문구
  status?: "ok" | "failed"; error?: string;
};
/** 발표 예상 질문 — slide 는 근거 장, need 는 근거가 자료에 없을 때 준비할 것 */
/** 대본 한 장 — sec 배정 초, keep 남길 문장, screen 화면·시선, cues 동작, notes 말하는 법, cut 줄이는 법 */
export type ScriptSlide = { n: number; title: string; lines: string[]; sec?: number; keep?: string; screen?: string; cues?: string[]; notes?: string[]; cut?: string };
export type QA = { q: string; a: string; slide: number; kind?: string; need?: string };
export type WireKind = "panel" | "card" | "person" | "image" | "screen" | "chart" | "table" | "flow" | "map" | "badge" | "band" | "text" | "gantt" | "phase" | "kpi" | "fishbone" | "hub" | "pyramid" | "matrix" | "funnel" | "cycle" | "venn" | "roadmap" | "isostack" | "gauge" | "proportion";
/** 와이어프레임 상자 — x·y·w·h 는 본문(머리 띠·바닥 사이) 기준 %, t 제목, d 들어갈 글(줄마다) */
export type WireBlock = { id: string; k: WireKind; x: number; y: number; w: number; h: number; t: string; d?: string };
/** 표지·목차·간지 시안 — id: cover · toc · div1… (시안 파일은 mockup/<id>.jpg) */
export type PlanFront = { id: string; kind: "cover" | "toc" | "div" | "end" | "qna"; label: string; title?: string; name?: string; status?: "ok" | "failed"; error?: string;
  project?: string; tail?: string; date?: string; no?: number; desc?: string; items?: string[]; chapters?: { no: number; name: string; items: string[] }[] };
/** 사람이 고친 표지·목차·간지 글 — 엔진이 앞장을 다시 짤 때 이것을 우선한다(id → 고친 칸) */
export type FrontEdit = Record<string, { title?: string; project?: string; tail?: string; date?: string; name?: string; desc?: string }>;
export type Front = { cover: boolean; toc: boolean; divider: boolean; ending?: boolean };
export type Plan = { title?: string; core?: string; slides: PlanSlide[]; front?: PlanFront[]; front_edit?: FrontEdit; chapters?: { name: string; goal?: string }[];
  /** 덱 전체 점검(AI 없이) — 발표 시간 대비 장 수, 평가 항목명이 장 제목·절에 있는지, 첫 장의 발주처 수치. 엔진 fact_check 가 채운다 */
  deck_checks?: string[] };
export type JobKind = "polish" | "design";
export type Job = {
  /** email: 주인·관리자에게만 온다(공유받은 사람 응답엔 없음). owner_label: 주인 표시(앞 2자+***) — 공유 화면용. is_owner: 진짜 주인(관리자 대리 열람 제외) */
  id: string; email?: string; owner_label?: string; is_owner?: boolean; title: string; filename: string; size: number; slides: number | null; note?: string | null;
  status: JobStatus; stage: string | null; progress: number; worker: string | null;
  created_at: string; started_at: string | null; finished_at: string | null; result_name: string | null;
  report: Report | null; error?: string | null; phase?: "pilot" | "full" | "plan" | "build" | "edit"; pilot_slide?: number | null; feedback?: string | null; cancel_requested?: boolean; queue_pos: number | null; thumb?: string | null; thumb_kind?: string | null;
  /** 목록용 — 시안이 아직 없을 때 첫 장의 와이어프레임(썸네일로 그린다) */
  wire1?: { title: string; keyword?: string; section?: string; blocks: WireBlock[] } | null;
  kind?: JobKind; source_kind?: "pptx" | "md" | "text"; budget_usd?: number | null; spent_usd?: number; plan?: Plan | null; theme?: string | null;
  review?: { redo?: { n: number; feedback: string }[]; feedback?: string } | null;
  files?: Record<"before" | "after" | "result" | "extra" | "source" | "live" | "frames" | "draft" | "pilot" | "mockup", JobFile[]>;
  docs?: JobDoc[];
  mine?: boolean; shared?: boolean; comments?: PinComment[];
  /** 공유 링크 권한 0 끔 · 1 의견 · 2 편집 · 3 링크로 누구나 보기 / can_edit: 내가 기획·와이어프레임을 고칠 수 있다 / anon: 로그인 없이 링크로 보는 중 */
  share?: 0 | 1 | 2 | 3; can_edit?: boolean; anon?: boolean;
  opts?: { slides: number; mockups: "plan" | "sample" | "all"; sample: number; front?: Front; style?: string; purpose?: "submit" | "present"; lang?: string; font_title?: string; font_body?: string } | null;
  est_image_usd?: number | null;
  /** 단계별 비용 — engine 은 구독 사용분의 API 환산액(실제 청구 아님). engine 행의 a = 턴 수, b = 걸린 초 */
  script?: { made_at: string; chars: number; sec?: number; goal?: number; brief?: boolean; stale?: boolean; batch?: number; none?: boolean; slides: ScriptSlide[]; qa?: QA[] } | null;
  costs?: { kind: "digest" | "plan" | "image" | "build" | "engine" | "script" | "eplan" | "edigest" | "hf"; model: string; n: number; usd: number; a: number; b: number }[];
  /** 보는 사람이 관리자 — 「설정」에 실제로 쓴 모델을 보인다 */
  admin?: boolean;
  events?: JobEvent[];
};
export const isDesign = (j: Job) => j.kind === "design";
/** 글 고치기·표지 넣기를 반영하는 중 — 화면은 결과 화면에 그대로 둔다(진행 화면으로 넘기지 않는다) */
export const isEditing = (j: Job) => j.phase === "edit" && (j.status === "queued" || j.status === "running");
/** 산출물 링크 — 기획 MD, 전체 zip (세션 쿠키 인증) */
export const refZipUrl = () => `${API}/reference.zip`;
export const jobUrl = (jobId: string, what: "plan.md" | "export.zip" | "script.html" | "script.md" | "script.html?dl=1" | "script.md?dl=1" | "practice.html" | "practice.html?dl=1") => `${API}/jobs/${jobId}/${what}`;
export const usd = (n: number | null | undefined, digits = 2) => (n == null ? "—" : `$${n.toFixed(digits)}`);
export type Engine = { online: boolean; workers: { name: string; seen_at: string; info: string }[]; queued: number; running: number;
  /** 내가 동시에 진행 중인 작업 수와 한도(한도에 차면 새 작업을 시작할 수 없다) */
  mine?: { active: number; max: number } | null };

export const fmtSize = (b: number) =>
  b >= 1073741824 ? (b / 1073741824).toFixed(2) + "GB" : b >= 1048576 ? (b / 1048576).toFixed(1) + "MB" : Math.max(1, Math.round(b / 1024)) + "KB";

/* ── 분할 업로드 (끊겨도 이어서) ── */
type UploadInit = { id: string; chunk_size: number; chunks: number; received: number[] };
export type UploadProgress = { sent: number; total: number; speed: number; eta: number };

const RESUME_KEY = (f: File) => `pd_up_${f.name}_${f.size}_${f.lastModified}`;

export type MockupMode = "plan" | "sample" | "all";
export type UploadMeta = { title: string; note: string; pilot?: boolean; kind?: JobKind; budget_usd?: number | null; accent?: string | null; hold?: boolean;
  slides?: number; mockups?: MockupMode; sample?: number; front?: Front; style?: string; purpose?: "submit" | "present"; lang?: string; font_title?: string; font_body?: string; event?: string; date?: string };
/** 맥락 자료(RFP 등)를 작업에 붙인다 — 같은 분할 업로드, purpose=doc */
export const uploadDoc = (file: File, jobId: string, onProgress: (p: UploadProgress) => void, signal: AbortSignal) =>
  uploadFile(file, { title: "", note: "" }, onProgress, signal, { purpose: "doc", job_id: jobId }) as unknown as Promise<{ docs: JobDoc[] }>;

export async function uploadFile(file: File, meta: UploadMeta, onProgress: (p: UploadProgress) => void, signal: AbortSignal,
  purpose?: { purpose: "doc"; job_id: string }): Promise<Job> {
  // 같은 파일을 다시 고르면 이전에 올리던 업로드를 이어 간다
  let init: UploadInit | null = null;
  const rk = RESUME_KEY(file) + (purpose ? `_${purpose.job_id}` : "");
  const saved = localStorage.getItem(rk);
  if (saved) {
    try {
      const s = await api<UploadInit & { status: string }>(`/uploads/${saved}`);
      if (s.status === "open") init = s;
    } catch { /* 새로 시작 */ }
  }
  if (!init) {
    init = await api<UploadInit>("/uploads", { method: "POST", body: JSON.stringify({ filename: file.name, size: file.size, ...(purpose ?? {}) }) });
    localStorage.setItem(rk, init.id);
  }
  const { id, chunk_size, chunks } = init;
  const done = new Set(init.received);
  let sent = done.size * chunk_size;
  const t0 = performance.now();
  const base = sent;
  const report = () => {
    const el = (performance.now() - t0) / 1000;
    const speed = el > 0.3 ? (sent - base) / el : 0;
    onProgress({ sent: Math.min(sent, file.size), total: file.size, speed, eta: speed > 0 ? (file.size - sent) / speed : 0 });
  };
  report();
  const todo = Array.from({ length: chunks }, (_, i) => i).filter((i) => !done.has(i));
  const putChunk = async (n: number) => {
    const blob = file.slice(n * chunk_size, Math.min(file.size, (n + 1) * chunk_size));
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(`${API}/uploads/${id}/${n}`, { method: "PUT", body: blob, headers: HEADERS, credentials: "same-origin", signal });
        if (!res.ok) { const b = (await res.json().catch(() => ({}))) as Envelope; throw new ApiError(b.message || b.error || `조각 ${n} 실패`, res.status); }
        sent += blob.size;
        report();
        return;
      } catch (e) {
        if (signal.aborted || attempt >= 4 || (e instanceof ApiError && e.status < 500 && e.status !== 409)) throw e;
        await new Promise((r) => setTimeout(r, 800 * 2 ** attempt)); // 네트워크 흔들림은 잠깐 쉬고 다시
      }
    }
  };
  // 3개씩 동시에 — 너무 많이 열면 공유기·서버가 버거워한다
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, todo.length) }, async () => {
    while (next < todo.length) { const n = todo[next++]; if (n != null) await putChunk(n); }
  }));
  const job = await api<Job>(`/uploads/${id}/complete`, { method: "POST", body: JSON.stringify(meta) });
  localStorage.removeItem(rk);
  return job;
}

/** [호환] 옛 코드가 `{ data: T[] }` 봉투를 기대하는 자리 — 새 api() 가 봉투를 벗겨 주므로 둘 다 받는다. */
export const unwrapList = <T,>(r: { data: T[] } | T[] | null | undefined): T[] => (Array.isArray(r) ? r : (r?.data ?? []));

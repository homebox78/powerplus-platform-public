// AI(OpenRouter) 키·모델 — 키는 powerDeck 서버에 암호화해 두고, 화면에는 끝자리(hint)만 온다.
// OpenRouter 호출도 서버가 알맞은 키(개인/회사)를 붙여 대신 보낸다. 모델 목록만 공개 API 라 브라우저에서 바로 받는다.
import { api } from "./api";

export type KeyMode = "personal" | "company";
export type OrModels = { plan: string; image: string };
export type KeyInfo = { balance?: number | null; credits?: number | null; credits_used?: number | null; label?: string | null; usage?: number | null; limit?: number | null; limit_remaining?: number | null };
export type AiSettings = {
  mode: KeyMode;
  personal: { set: boolean; hint: string | null; updated_at: string | null };
  company: { set: boolean; hint?: string | null };
  models: OrModels;
  ready: boolean;
  isAdmin: boolean;
  admin_models?: OrModels;
  budget: { default: number | null; monthly_cap: number | null; month_spent: number };
  engine_model: string;
  text_engine?: "cli" | "api";
  text_model?: string;
  text_effort?: string;
  digest_model?: string;
  image_provider?: "openrouter" | "higgsfield";
  hf_status?: { state: "ok" | "no_credits" | "unknown"; message?: string; at?: string };
  hf_key?: { set: boolean; hint?: string | null };
  hf_personal?: { set: boolean; hint?: string | null; provider: "openrouter" | "higgsfield" };
};
export const saveBudget = (b: { default_budget_usd: number | null; monthly_cap_usd: number | null }) =>
  api<{ budget: AiSettings["budget"] }>("/ai/budget", { method: "PUT", body: JSON.stringify(b) });

export const getAi = () => api<AiSettings>("/ai/settings");
export const checkAiKey = () => api<{ info: KeyInfo }>("/ai/key/check");
export const saveAdmin = (b: { mode?: KeyMode; company_key?: string; remove_company_key?: boolean; plan?: string; image?: string; engine_model?: string; text_engine?: "cli" | "api"; text_model?: string; text_effort?: string; digest_model?: string; image_provider?: "openrouter" | "higgsfield"; hf_key?: string; hf_key_id?: string; hf_key_secret?: string; remove_hf_key?: boolean }) =>
  api<{ info: KeyInfo | null }>("/ai/admin", { method: "PUT", body: JSON.stringify(b) });

export type OrModel = { id: string; name: string; output: string[]; tools?: boolean; vision?: boolean; reasoning?: boolean; ctx?: number; created?: number };

/** 모델 목록 (공개, 키 불필요). 기본 목록엔 이미지 전용 모델이 빠져 있어 이미지 출력 목록을 따로 받아 합친다 */
export async function listModels(): Promise<OrModel[]> {
  type Raw = { data?: { id: string; name: string; created?: number; context_length?: number; supported_parameters?: string[]; architecture?: { input_modalities?: string[]; output_modalities?: string[] } }[] };
  const get = async (q: string) => {
    const res = await fetch(`https://openrouter.ai/api/v1/models${q}`);
    if (!res.ok) throw new Error(`모델 목록을 불러오지 못했습니다 (${res.status})`);
    return ((await res.json()) as Raw).data ?? [];
  };
  const [text, image] = await Promise.all([get(""), get("?output_modalities=image")]);
  const all = new Map<string, OrModel>();
  for (const m of [...text, ...image])
    all.set(m.id, { id: m.id, name: m.name, output: m.architecture?.output_modalities ?? ["text"],
      tools: (m.supported_parameters ?? []).includes("tools"), vision: (m.architecture?.input_modalities ?? []).includes("image"),
      reasoning: (m.supported_parameters ?? []).includes("reasoning"), ctx: m.context_length ?? 0, created: m.created ?? 0 });
  return [...all.values()];
}

/* 고르기 쉬운 목록 — OpenRouter 466개 중 장표·글 작업에 쓸 만한 것만(2026-10: 제작 46 · 글 60).
   주요 회사(중국 회사 deepseek·qwen·moonshotai·z-ai·minimax 제외 — 사용자 2026-10-06 "한국 사용자는 중국 AI 를 신뢰하지 않는다") · 최근 1년 · 문맥 128k 이상 · 무료/배치/소형/검색·음성·번역·안전·코딩 전용·실험판 제외 · 계열마다 최신 2개.
   목록에 없어도 엔진은 어떤 모델이든 돈다(지금 값은 목록 맨 위에 따로 보인다). */
const VENDOR = /^(anthropic|openai|google|meta|x-ai|mistralai)\//;
const SKIP = /(safety|guard|embed|rerank|audio|tts|transcri|search|sonar|research|lyria|-mt|ocr|code|devstral|-exp|preview|chat-latest|multi-agent|gemma|glimmer|omni|\b\d+b\b|-a\d+b|nano|lite|mini|small|tiny)/i;
const YEAR = 400 * 86400;
const textOk = (m: OrModel) => !m.output.includes("image") && !/:(free|batch|extended)$/.test(m.id) && VENDOR.test(m.id) && !SKIP.test(m.id)
  && (m.ctx ?? 0) >= 128000 && Date.now() / 1000 - (m.created ?? 0) < YEAR;
/** 같은 계열(숫자·날짜를 뗀 이름)마다 최신 n 개 */
function latest(list: OrModel[], n = 2): OrModel[] {
  const fam = (id: string) => { const [v, rest] = id.split("/"); return v + "/" + rest!.replace(/\d+(\.\d+)*[a-z]?|-\d{4,}/g, "").replace(/-+/g, "-").replace(/^-|-$/g, ""); };
  const by = new Map<string, OrModel[]>();
  for (const m of list) by.set(fam(m.id), [...(by.get(fam(m.id)) ?? []), m]);
  return [...by.values()].flatMap((v) => v.sort((a, b) => (b.created ?? 0) - (a.created ?? 0)).slice(0, n)).sort((a, b) => a.id.localeCompare(b.id));
}
/** 기획·요약·대본 목록 */
export const textModels = (all: OrModel[]) => latest(all.filter(textOk));
/** 장표 제작 목록 — 도구 호출·그림 보기가 되는 모델만(시안을 보고 코드를 돌린다) */
export const buildModels = (all: OrModel[]) => latest(all.filter((m) => textOk(m) && m.tools && m.vision));

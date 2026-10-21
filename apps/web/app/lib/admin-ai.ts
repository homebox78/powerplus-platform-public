// 관리자 · AI 설정 데이터 — /api/v1/admin/ai (api/routes/admin_ai.php 와 1:1). 새로 씀(2026-10-07).
import { apiFetch } from "@/lib/api";

export interface AiJevUse { key: string; label: string; desc: string; on: boolean; calls_7d: number; cost_7d: number }
export interface AiDeckSolution { id: "deck"; name: string; desc: string; items: Array<{ label: string; value: string }> }
export interface AiJevSolution {
  id: "jev"; name: string; desc: string; model: string;
  enabled: boolean; daily_usd: number; spent_today: number; uses: AiJevUse[];
}
export interface AiChatSolution {
  id: "chat"; name: string; desc: string; model: string; default_model: string;
  enabled: boolean; daily_usd: number; spent_today: number;
}
export type AiTextProvider = "openrouter" | "claude";
export type AiClaudeState = "ok" | "no_credits" | "bad_key";
/** 키 하나 — spent·calls 는 이번 기간 이 서버가 그 키로 쓴 것(추정), exhausted 는 마지막 크레딧 소진 이력(충전 뒤에도 남음) */
export interface AiClaudeKey {
  id: string; last4: string; added: string; state: AiClaudeState; at: string | null;
  spent: number; calls: number; last_used: string | null; exhausted: { at: string; spent: number } | null;
}
export interface AiProvider {
  value: AiTextProvider;
  claude: {
    set: boolean; usable: boolean; fixed: Array<[string, string]>;
    /** 넣은 순서대로 쓰는 키들 — 키마다 막힘 상태. 막힌 키는 30분 건너뛰고 다음 키로 */
    keys: AiClaudeKey[];
    /** 전체 — 키가 하나라도 쓸 수 있으면 ok, 전부 막히면 no_credits·bad_key 로 OpenRouter 가 대신 돈다 */
    status: { state: AiClaudeState; message?: string; at?: string };
    /** 이번 기간 사용 추정 — 잔액 API 가 없어 이 서버 기록으로 셈. credit = per_key × keys */
    budget: { credit: number; per_key: number; keys: number; reset_day: number; since: string; spent: number; left: number; calls: number; untracked: number; untracked_calls: number } | null;
  };
}
interface AdminAi {
  openrouter: { set: boolean; usable: boolean; source: "company" | "config" | null; last4: string | null };
  provider: AiProvider;
  solutions: Array<AiDeckSolution | AiJevSolution | AiChatSolution>;
  usage: Array<{ solution: "deck" | "jev" | "chat"; kind: string; label: string; calls: number; cost: number; billed: boolean }>;
}

export const fetchAdminAi = () => apiFetch<AdminAi>("/admin/ai");

/** Claude 키 더하기·하나 빼기 — 하나라도 있으면 그림 외 글 작업이 Claude(모델 고정), 없으면 OpenRouter. 키는 서버가 확인한 뒤 암호화해 둔다 */
export const saveAdminProvider = (b: { claude_key?: string; remove_claude_key_id?: string; claude_credit_usd?: number; claude_reset_day?: number }) =>
  apiFetch<{ provider: AiTextProvider }>("/admin/ai/provider", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b),
  });

export const saveAdminJev = (b: { enabled?: boolean; daily_usd?: number; uses?: Record<string, boolean> }) =>
  apiFetch<{ enabled: boolean; daily_usd: number; uses: Record<string, boolean> }>("/admin/ai/jev", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b),
  });

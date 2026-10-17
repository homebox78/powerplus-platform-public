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
export interface AiProvider {
  value: AiTextProvider;
  claude: { set: boolean; usable: boolean; last4: string | null; fixed: Array<[string, string]> };
}
interface AdminAi {
  openrouter: { set: boolean; usable: boolean; source: "company" | "config" | null; last4: string | null };
  provider: AiProvider;
  solutions: Array<AiDeckSolution | AiJevSolution | AiChatSolution>;
  usage: Array<{ solution: "deck" | "jev" | "chat"; kind: string; label: string; calls: number; cost: number; billed: boolean }>;
}

export const saveAdminChat = (b: { enabled?: boolean; model?: string; daily_usd?: number }) =>
  apiFetch<{ enabled: boolean; model: string; daily_usd: number }>("/admin/ai/chat", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b),
  });

export const fetchAdminAi = () => apiFetch<AdminAi>("/admin/ai");

/** Claude 키 넣기·지우기 — 있으면 그림 외 글 작업이 Claude(모델 고정), 없으면 OpenRouter. 키는 서버가 확인한 뒤 암호화해 둔다 */
export const saveAdminProvider = (b: { claude_key?: string; remove_claude_key?: boolean }) =>
  apiFetch<{ provider: AiTextProvider }>("/admin/ai/provider", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b),
  });

export const saveAdminJev = (b: { enabled?: boolean; daily_usd?: number; uses?: Record<string, boolean> }) =>
  apiFetch<{ enabled: boolean; daily_usd: number; uses: Record<string, boolean> }>("/admin/ai/jev", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b),
  });

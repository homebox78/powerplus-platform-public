// AI 클라이언트 아이콘 — 단색 글리프(브랜드 로고 재현이 아니라 식별용 심볼). Mobbin MCP "Connect tool" 그리드 참조 (2026-09-24).
// 서비스 UI 무채색 규칙: 전부 currentColor. 실제 로고 사용은 각사 브랜드 가이드 확인 후 교체.
const base = "size-7";
export const AI_CLIENTS = [
  { id: "claude-code", label: "Claude Code" },
  { id: "claude-desktop", label: "Claude 웹·데스크톱" },
  { id: "cursor", label: "Cursor" },
  { id: "codex", label: "Codex" },
  { id: "chatgpt", label: "ChatGPT" },
  { id: "gemini-cli", label: "Gemini CLI" },
] as const;
export type AiClientId = (typeof AI_CLIENTS)[number]["id"];

export function AiClientIcon({ id, className = base }: { id: AiClientId; className?: string }) {
  switch (id) {
    case "claude-code":
    case "claude-desktop": // 8방향 스파크 — Claude 계열
      return <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden><path d="M12 2l1.6 6.1L19 5.4l-3.6 5.1L21 12l-5.6 1.5 3.6 5.1-5.4-2.7L12 22l-1.6-6.1L5 18.6l3.6-5.1L3 12l5.6-1.5L5 5.4l5.4 2.7z" /></svg>;
    case "cursor": // 등축 큐브
      return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" /></svg>;
    case "codex": // 터미널 프롬프트
      return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M7.5 9.5l3 2.5-3 2.5M12.5 14.5h4" /></svg>;
    case "chatgpt": // 6엽 매듭 (단순화)
      return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="3.2" /><path d="M12 8.8V4M12 15.2V20M9.2 10.4L5 8M14.8 13.6L19 16M14.8 10.4L19 8M9.2 13.6L5 16" /></svg>;
    case "gemini-cli": // 4방향 별
      return <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden><path d="M12 2c.6 5.6 4.4 9.4 10 10-5.6.6-9.4 4.4-10 10-.6-5.6-4.4-9.4-10-10 5.6-.6 9.4-4.4 10-10z" /></svg>;
  }
}

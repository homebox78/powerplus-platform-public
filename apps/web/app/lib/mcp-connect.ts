import type { AiClientId } from "@/components/hb/ai-client-icons";

// powerMCP 연결 설정 문구 — 계정 키 화면(/account/keys)과 안내 페이지(/powermcp)가 같이 쓴다.
// 서버 주소는 지금 사이트 origin + /mcp(Apache 가 MCP 서버로 넘긴다). 키 자리는 부르는 쪽이 채운다.
// 임시(2026-10-27 사용자 지시): claude.ai 커넥터가 회사 서버 46443 포트로 접속하지 않아, 회사 주소에서는
// 443 중계 주소를 안내한다(중계가 회사 서버 /mcp 로 넘긴다). 회사 443 매핑이 열리면 이 분기를 지운다.
const MCP_RELAY = "https://powerplus.hom2box.com/mcp";
export const mcpServerUrl = () => {
  if (typeof window === "undefined") return "/mcp";
  if (window.location.hostname === "powerplus.solideos.com") return MCP_RELAY;
  return `${window.location.origin}/mcp`;
};
export const restBaseUrl = () => (typeof window !== "undefined" ? `${window.location.origin}/api/v1` : "/api/v1");

export function mcpSnippets(server: string, key: string): Record<AiClientId, string> {
  return {
    "claude-code": `claude mcp add --transport http powerplus ${server} --header "Authorization: Bearer ${key}"`,
    "claude-desktop": `설정 › 커넥터 › 사용자 지정 커넥터 추가\n이름: powerplus\n원격 MCP 서버 URL: ${server}\n요청 헤더 › Authorization: Bearer ${key}`,
    cursor: `{\n  "mcpServers": {\n    "powerplus": { "url": "${server}", "headers": { "Authorization": "Bearer ${key}" } }\n  }\n}`,
    chatgpt: `설정 › 커넥터 › 만들기 (Developer mode)\n이름: powerplus\nMCP 서버 URL: ${server}?key=${key}`,
    codex: `codex mcp add powerplus --url ${server} --header "Authorization: Bearer ${key}"`,
    "gemini-cli": `~/.gemini/settings.json\n{\n  "mcpServers": {\n    "powerplus": { "httpUrl": "${server}", "headers": { "Authorization": "Bearer ${key}" } }\n  }\n}`,
  };
}

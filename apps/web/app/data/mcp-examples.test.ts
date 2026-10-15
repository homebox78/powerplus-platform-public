// /powermcp 예시·도구 수 대조(MC-04·05) — 예시가 부르는 도구가 실제 도구 목록(gen-tools.mjs 산출물)에 있는지, 목록 수가 맞는지.
import { describe, expect, it } from "vitest";
import { MCP_EXAMPLE_GROUPS } from "./mcp-examples";
import toolsData from "./mcp-tools.json";

const data = toolsData as { count?: number; tools: { name: string; title: string }[] };
const names = new Set(data.tools.map((t) => t.name));

describe("powerMCP 안내 데이터", () => {
  it("예시의 도구 이름은 모두 실제 도구다", () => {
    const missing = MCP_EXAMPLE_GROUPS.flatMap((g) => g.items.flatMap((e) => e.tools.filter((n) => !names.has(n)).map((n) => `${e.q} → ${n}`)));
    expect(missing).toEqual([]);
  });

  it("도구 수는 생성물의 count 와 같다", () => {
    if (typeof data.count === "number") expect(data.tools.length).toBe(data.count);
  });

  it("도구마다 화면에 쓸 한글 이름(title)이 있다", () => {
    expect(data.tools.filter((t) => !t.title.trim()).map((t) => t.name)).toEqual([]);
  });
});

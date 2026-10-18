// toastError 가 서버 안내(hint)를 보이는지 — 2026-10-18 전수조사(부분 실패) C.
// 예전: hint 를 버려 "한 번에 5,000개까지…"만 보이고 "분류·공개 범위·검색어로 좁혀 주세요"(무엇을 하면 되는지)는 사라졌다.
// 음성 대조: 칸 이름 hint('reply'·'upload')는 싣지 않는다 / 고치기 전 판(git a80572c)은 hint 가 있어도 설명 없이 한 줄만 냈다.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";

const err = vi.fn();
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: (...a: unknown[]) => err(...a) }) }));

import { toastError } from "./confirm";
import { ApiError } from "@/lib/api";

const descText = (call: unknown[]) => {
  const o = call[1] as { description?: { props?: { text?: string } } } | undefined;
  return o?.description?.props?.text;
};

describe("toastError", () => {
  beforeEach(() => err.mockClear());

  it("사람이 읽는 hint 는 설명 줄로 같이 보인다", () => {
    toastError(new ApiError(400, "INVALID", "한 번에 5,000개까지 처리합니다.", "분류·공개 범위·검색어로 좁혀 주세요."));
    expect(descText(err.mock.calls[0]!)).toBe("분류·공개 범위·검색어로 좁혀 주세요.");
  });

  it("칸 이름 hint 는 싣지 않는다(음성 대조)", () => {
    toastError(new ApiError(402, "LIMIT", "이번 달 몫을 이미 쓰셨습니다.", "upload"));
    expect(descText(err.mock.calls[0]!)).toBeUndefined();
  });

  it("hint 가 없거나 Error 가 아니면 예전처럼 한 줄", () => {
    toastError(new Error("실패"));
    toastError("문자열");
    expect(err.mock.calls[0]!.length === 1 || err.mock.calls[0]![1] === undefined).toBe(true);
    expect((err.mock.calls[1]![0] as { props: { text: string } }).props.text).toMatch(/처리하지 못했습니다/);
  });

  it("음성 대조: 고치기 전 판은 hint 를 쓰지 않았다", () => {
    let old = "";
    try { old = execFileSync("git", ["-C", path.resolve(import.meta.dirname, "../../../../.."), "show", "a80572c:apps/web/app/components/hb/confirm.tsx"], { encoding: "utf8" }); }
    catch { return; }   // 이력 없음(공개본)
    const body = old.split("export function toastError")[1] ?? "";
    expect(body).not.toMatch(/hint/);
  });
});

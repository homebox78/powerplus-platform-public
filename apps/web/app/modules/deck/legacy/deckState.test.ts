// 파워덱 화면 판정(2026-11-01 전체 검수 H2·M2·M9) — 음성 대조 포함
import { describe, expect, it } from "vitest";
import { editFailure, listLoadState, retryOnlySlides } from "./api";

describe("글 고치기 실패 안내(R152)", () => {
  const fail = "글 고치기에 실패했습니다 — 장표는 이전 그대로입니다 (X)";
  it("마지막 기록이 kind warn 인 실패면 그 글을 돌려준다", () => {
    expect(editFailure([{ kind: "info", message: "앞" }, { kind: "warn", message: fail }])).toBe(fail);
  });
  it("음성 대조 — 예전 서버의 kind done 기록·성공·다른 경고·이후 성공은 실패가 아니다", () => {
    expect(editFailure([{ kind: "done", message: fail }])).toBeNull();
    expect(editFailure([{ kind: "done", message: "글 2곳을 고쳤습니다." }])).toBeNull();
    expect(editFailure([{ kind: "warn", message: "저화질 그림" }])).toBeNull();
    expect(editFailure([{ kind: "warn", message: fail }, { kind: "done", message: "글 1곳을 고쳤습니다." }])).toBeNull();
  });
  it("빈 값부터(R09)", () => {
    expect(editFailure(undefined)).toBeNull();
    expect(editFailure(null)).toBeNull();
    expect(editFailure([])).toBeNull();
  });
});

describe("작업 목록 상태(R158)", () => {
  it("처음 불러오기가 실패하면 오류 — '불러오는 중'에 멈추지 않는다", () => {
    expect(listLoadState(null, "오류 500")).toBe("error");
  });
  it("음성 대조 — 불러오는 중·목록 있음·목록 있는데 새로 고침 실패", () => {
    expect(listLoadState(null, null)).toBe("loading");
    expect(listLoadState([], null)).toBe("ready");
    expect(listLoadState([{}], "오류 500")).toBe("ready");
  });
});

describe("다시 돌리기 범위 안내(R155)", () => {
  const rv = { revise: { all: false, slides: [2, 5] } };
  it("실패한 부분 수정을 이을 때만 장 수를 말한다", () => {
    expect(retryOnlySlides({ status: "failed", review: rv })).toBe(2);
  });
  it("음성 대조 — 완성 작업(서버가 범위를 지움)·전체 수정·수정 없음은 전체", () => {
    expect(retryOnlySlides({ status: "done", review: rv })).toBeNull();
    expect(retryOnlySlides({ status: "failed", review: { revise: { all: true, slides: [2] } } })).toBeNull();
    expect(retryOnlySlides({ status: "failed", review: null })).toBeNull();
  });
});

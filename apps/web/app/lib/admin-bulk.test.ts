// 관리자 포인트 일괄 지급 결과 문구 — 2026-10-18 사용자 결정 "같은 사유·같은 날 한 번만".
// 서버(api/routes/admin_bulk.php)가 이미 받은 사람을 건너뛰고 already 를 돌려주면, 토스트가 '이미 지급 N명'을 말해야 한다.
// 음성 대조: already 가 없거나 0 이면 그 문구를 싣지 않는다(다른 일괄 처리 문구는 그대로).
import { describe, expect, it } from "vitest";
import { bulkMessage } from "./admin-bulk";

describe("bulkMessage", () => {
  it("이미 지급한 사람 수를 알린다", () => {
    const m = bulkMessage({ action: "points", count: 120, skipped: 0, already: 179 }, "조정했습니다");
    expect(m).toContain("120개를 조정했습니다.");
    expect(m).toContain("이미 지급 179명은 건너뛰었습니다");
  });
  it("already 가 0·없음이면 싣지 않는다(음성)", () => {
    expect(bulkMessage({ action: "points", count: 3, already: 0 }, "조정했습니다")).not.toContain("이미 지급");
    expect(bulkMessage({ action: "block", count: 3, skipped: 1 }, "차단했습니다")).toBe("3개를 차단했습니다. 1개는 대상이 아니라 건너뛰었습니다.");
  });
});

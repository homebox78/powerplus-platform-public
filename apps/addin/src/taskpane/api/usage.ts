// 삽입 기록(통계·인기 정렬·최근) — 출처: powerPlus addin/src/taskpane/api/usage.ts. 플랫폼 /assets/items/{id}/use, 채널 addin.
import { api, getToken } from "./config";

export async function recordUsage(assetId: string): Promise<void> {
  if (!getToken()) return;
  try {
    await api(`/assets/items/${encodeURIComponent(assetId)}/use`, { method: "POST", body: { channel: "addin" } });
  } catch {
    // 통계 기록 실패는 무시
  }
}

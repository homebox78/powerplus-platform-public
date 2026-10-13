// 자료 요청 — 출처: powerPlus addin/src/taskpane/api/requests.ts. 플랫폼 /assets/requests({title, kind, detail}).
import { api } from "./config";

export interface RequestPayload {
  type: string;
  title: string;
  description: string;
  link: string;
}

const KINDS = ["icon", "photo", "illust", "diagram", "ppt", "logo"];

export async function submitRequest(payload: RequestPayload): Promise<boolean> {
  try {
    const detail = [payload.description.trim(), payload.link.trim()].filter(Boolean).join("\n");
    await api("/assets/requests", {
      method: "POST",
      body: { title: payload.title, kind: KINDS.includes(payload.type) ? payload.type : "", detail },
    });
    return true;
  } catch {
    return false;
  }
}

// 공지(커뮤니티 공지사항) — 출처: powerPlus addin/src/taskpane/api/announcements.ts. 플랫폼 /addin/announcements.
// 플랫폼 공지 id 는 문자열이라, 읽음 표시는 마지막으로 본 공지의 작성 시각으로 비교한다.
import { api } from "./config";

export interface Announcement {
  id: string;
  title: string;
  body: string | null;
  created_at: string;
}

export async function fetchAnnouncements(): Promise<Announcement[]> {
  try {
    return (await api<Announcement[]>("/addin/announcements")).data ?? [];
  } catch {
    return [];
  }
}

const SEEN_KEY = "pa_ann_seen";

export function getAnnSeen(): string {
  try { return localStorage.getItem(SEEN_KEY) || ""; } catch { return ""; }
}

export function setAnnSeen(createdAt: string): void {
  try { localStorage.setItem(SEEN_KEY, createdAt); } catch { /* 무시 */ }
}

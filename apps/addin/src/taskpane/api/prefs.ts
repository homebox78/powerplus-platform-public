// 즐겨찾기·최근(계정 기준) — 출처: powerPlus addin/src/taskpane/api/prefs.ts. 경로는 /addin/favorites·/addin/recent.
import { api } from "./config";

export async function fetchFavorites(): Promise<string[]> {
  return (await api<string[]>("/addin/favorites")).data || [];
}
export async function addFavoriteServer(id: string): Promise<void> {
  await api(`/addin/favorites/${encodeURIComponent(id)}`, { method: "POST", body: {} });
}
export async function removeFavoriteServer(id: string): Promise<void> {
  await api(`/addin/favorites/${encodeURIComponent(id)}`, { method: "DELETE" });
}
export async function fetchRecent(): Promise<string[]> {
  return (await api<string[]>("/addin/recent")).data || [];
}

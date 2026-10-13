// 출처: powerPlus addin/src/taskpane/api/categories.ts — 플랫폼 /assets/categories({id,label,count}).
import { api } from "./config";
import type { Category } from "../data/mockAssets";

export async function fetchCategories(): Promise<Category[]> {
  const r = await api<Array<{ id: string; label: string; count?: number }>>("/assets/categories");
  return (r.data || []).map((c) => ({ key: c.id, label: c.label, count: c.count }));
}

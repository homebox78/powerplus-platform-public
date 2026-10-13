import { useCallback, useEffect, useState } from "react";
import { fetchRecent } from "../api/prefs";

// 최근 사용: 서버(usage_log) 동기화 + localStorage 캐시. 삽입 시 낙관적 갱신.
const KEY = "pp_recent";
const MAX = 20;

function loadLocal(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(raw) ? (raw as string[]) : [];
  } catch {
    return [];
  }
}

function saveLocal(a: string[]): void {
  localStorage.setItem(KEY, JSON.stringify(a));
}

export function useRecent(email: string | null) {
  const [recent, setRecent] = useState<string[]>(loadLocal);

  // 로그인되면 서버에서 최근 목록 동기화
  useEffect(() => {
    if (!email) return;
    fetchRecent()
      .then((ids) => {
        setRecent(ids);
        saveLocal(ids);
      })
      .catch(() => {
        /* 서버 미연결 → 로컬 캐시 사용 */
      });
  }, [email]);

  // 삽입 직후 낙관적 갱신 (서버엔 recordUsage 가 별도로 기록 → 다음 동기화에 반영)
  const pushRecent = useCallback((id: string) => {
    setRecent((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, MAX);
      saveLocal(next);
      return next;
    });
  }, []);

  return { recent, pushRecent };
}

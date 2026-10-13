import { useCallback, useEffect, useState } from "react";
import { fetchFavorites, addFavoriteServer, removeFavoriteServer } from "../api/prefs";

// 즐겨찾기: 서버 동기화(계정 기준) + localStorage 캐시(즉시 표시/오프라인 폴백).
const KEY = "pp_favorites";

function loadLocal(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(raw) ? new Set(raw as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveLocal(s: Set<string>): void {
  localStorage.setItem(KEY, JSON.stringify([...s]));
}

export function useFavorites(email: string | null) {
  const [favorites, setFavorites] = useState<Set<string>>(loadLocal);

  // 로그인되면 서버에서 즐겨찾기를 가져와 동기화 (실패 시 로컬 캐시 유지)
  useEffect(() => {
    if (!email) return;
    fetchFavorites()
      .then((ids) => {
        const s = new Set(ids);
        setFavorites(s);
        saveLocal(s);
      })
      .catch(() => {
        /* 서버 미연결 → 로컬 캐시 사용 */
      });
  }, [email]);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      const adding = !next.has(id);
      if (adding) next.add(id);
      else next.delete(id);
      saveLocal(next);
      // 낙관적 업데이트 후 서버 반영 (실패는 무시 — 로컬은 이미 반영됨)
      (adding ? addFavoriteServer(id) : removeFavoriteServer(id)).catch(() => {});
      return next;
    });
  }, []);

  const isFavorite = useCallback((id: string) => favorites.has(id), [favorites]);

  return { favorites, toggleFavorite, isFavorite };
}

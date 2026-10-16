// 출처: homebox-handoff apps/web/app/lib/save.ts — 대상이 기관·화면·섹션에서 플랫폼 모듈 교차(에셋·시안 갤러리·커뮤니티 글)로 바뀜.
// 저장 = 기본 컬렉션('내 저장') 토글. 이미 어느 컬렉션에든 있으면 빼고, 없으면 기본 컬렉션에 담는다(API /saved/toggle).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { ApiError, apiFetch, postJson } from "@/lib/api";
import { useMe } from "@/lib/auth";

export type SaveType = "asset" | "gallery" | "post";
interface SavedIds { asset: string[]; gallery: string[]; post: string[] }
const EMPTY: SavedIds = { asset: [], gallery: [], post: [] };

const savedQuery = { queryKey: ["saved"] as const, queryFn: () => apiFetch<{ ids: SavedIds }>("/saved").then((r) => r.ids), staleTime: 30_000 };

function useSaved(): SavedIds {
  const { me } = useMe();
  const q = useQuery({ ...savedQuery, enabled: !!me });
  return q.data ?? EMPTY;
}

export function useIsSaved(type: SaveType, id: string | number): boolean {
  return useSaved()[type].includes(String(id));
}

export function useToggleSave() {
  const { me } = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (v: { type: SaveType; id: string }) => postJson<{ saved: boolean; collection_id: string }>("/saved/toggle", v),
    onMutate: async (v) => { // 낙관적 토글 — 버튼·표시가 응답을 기다리지 않는다
      await qc.cancelQueries({ queryKey: savedQuery.queryKey });
      const prev = qc.getQueryData<SavedIds>(savedQuery.queryKey);
      const base = prev ?? EMPTY;
      const list = base[v.type];
      qc.setQueryData<SavedIds>(savedQuery.queryKey, { ...base, [v.type]: list.includes(v.id) ? list.filter((i) => i !== v.id) : [...list, v.id] });
      return { prev };
    },
    onError: (e, _v, ctx) => { qc.setQueryData(savedQuery.queryKey, ctx?.prev ?? EMPTY); toast.error(e instanceof ApiError ? e.message : "저장하지 못했습니다."); },
    onSuccess: (r) => {
      toast.success(r.saved ? "저장했습니다." : "저장에서 뺐습니다.", { action: { label: "저장 보기", onClick: () => navigate(`/account/saved/${r.collection_id}`) } });
      void qc.invalidateQueries({ queryKey: ["collections"] });
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: savedQuery.queryKey }),
  });
  return (type: SaveType, id: string | number) => {
    if (!me) {
      toast("저장하려면 로그인이 필요합니다.", { action: { label: "로그인", onClick: () => navigate(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`) } });
      return;
    }
    m.mutate({ type, id: String(id) });
  };
}

export interface CollectionCard { title: string; subtitle: string | null; image_url: string | null; page_url: string | null; locked: boolean; kind: SaveType; lock_label?: string }
export interface CollectionItem { type: SaveType; ref: string | null; type_ko: string; note: string | null; added_at: string; card: CollectionCard | null }
export interface Collection { id: string; name: string; memo: string | null; is_default: boolean; shared: boolean; share_token?: string | null; items_n: number; thumbs?: string[]; created_at: string; updated_at: string; mine: boolean; owner?: string }

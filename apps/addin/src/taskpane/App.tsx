// powerAssets 애드인 작업창 본 화면 — 로그인·분류 탭·검색·카드 목록·삽입·즐겨찾기/최근·요청·공지·도움말 봇.
// 출처: powerPlus addin/src/taskpane/App.tsx (플랫폼 REST /api/v1 로 이식).
import * as React from "react";
import AssetGrid from "./components/AssetGrid";
import AuthImg from "./components/AuthImg";
import Login from "./components/Login";
import ChoicePill from "./components/ChoicePill";
import HelpBot, { BotIcon } from "./components/HelpBot";
import { CATEGORIES } from "./data/mockAssets";
import type { Asset, Category } from "./data/mockAssets";
import {
  fetchAssets,
  fetchByIds,
  fetchSimilar,
  fetchStyleSet,
  fetchTopics,
  AuthRequiredError,
  type Topic,
} from "./api/assets";
import { getToken, getEmail, clearSession, logout } from "./api/auth";
import { recordUsage } from "./api/usage";
import { trackAddin } from "./api/config";
import { fetchCategories } from "./api/categories";
import { useInsert } from "./hooks/useInsert";
import { useFavorites } from "./hooks/useFavorites";
import { useRecent } from "./hooks/useRecent";
import { fetchAnnouncements, getAnnSeen, setAnnSeen } from "./api/announcements";
import type { Announcement } from "./api/announcements";
import { submitRequest } from "./api/requests";
import { readSelectedSlide, routeQuery, suggestFromSlide } from "./api/jev";

const SORTS = [
  { key: "latest", label: "최신순" },
  { key: "popular", label: "인기순" },
  { key: "name", label: "이름순" },
  { key: "favorites", label: "즐겨찾기순" },
];
/** 받침 유무로 '로/으로'를 고른다("아이콘으로" / "코드로"). */
function roSuffix(w: string): string {
  const last = w.charCodeAt(w.length - 1);
  if (last < 0xac00 || last > 0xd7a3) return "로";
  const jong = (last - 0xac00) % 28;
  return jong === 0 || jong === 8 ? "로" : "으로";   // 받침 없음·ㄹ 받침이면 '로'
}


const VIEWS = [
  { key: "all", label: "전체" },
  { key: "favorites", label: "즐겨찾기" },
  { key: "recent", label: "최근" },
];

// ---- 인라인 아이콘 ----
const Ic = {
  spark: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.8 4.9L19 9.7l-4.9 1.8L12 16.5l-1.8-5L5.3 9.7l4.9-1.8L12 3z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
    </svg>
  ),
  bell: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#555555" strokeWidth="1.7">
      <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.7 21a2 2 0 01-3.4 0" strokeLinecap="round" />
    </svg>
  ),
  search: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.8-3.8" strokeLinecap="round" />
    </svg>
  ),
  xmark: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  ),
  chev: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  check: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M5 12l5 5L20 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  logo: (
    // 사이트 powerAssets 모듈 아이콘(lucide Boxes)과 같은 모양
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z" />
      <path d="m7 16.5-4.74-2.85" /><path d="m7 16.5 5-3" /><path d="M7 16.5v5.17" />
      <path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z" />
      <path d="m17 16.5-5-3" /><path d="m17 16.5 4.74-2.85" /><path d="M17 16.5v5.17" />
      <path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z" />
      <path d="M12 8 7.26 5.15" /><path d="m12 8 4.74-2.85" /><path d="M12 13.5V8" />
    </svg>
  ),
  request: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 4h10l4 4v12H5z" />
      <path d="M12 11v5M9.5 13.5h5" />
    </svg>
  ),
  logout: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M15 4h3a1 1 0 011 1v14a1 1 0 01-1 1h-3" strokeLinecap="round" />
      <path d="M10 8l-4 4 4 4M6 12h10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  close: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555555" strokeWidth="2" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
};

/**
 * 하단 컴포저 검색창. 입력 초안(draft)을 로컬 state로 격리해
 * 타이핑마다 App 전체(무한스크롤 카드 수백 개)가 리렌더되지 않게 한다.
 * activeQuery가 밖에서 바뀌면(검색 해제 등) 초안도 동기화.
 */
function ComposerInput({
  activeQuery,
  onSend,
  onClear,
  catButton,
}: {
  activeQuery: string;
  onSend: (q: string) => void;
  onClear: () => void;
  catButton: React.ReactNode;
}) {
  const [draft, setDraft] = React.useState(activeQuery);
  React.useEffect(() => { setDraft(activeQuery); }, [activeQuery]);
  return (
    <div className="composer__box">
      <input
        className="composer__input"
        type="search"
        value={draft}
        placeholder="필요한 자료를 설명해 보세요…"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSend(draft);
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setDraft("");
            onClear();
          }
        }}
        aria-label="자산 검색"
      />
      <div className="composer__actions">
        {catButton}
        {/* 검색 중이면 같은 자리 버튼이 ✕(해제)로 바뀐다 — 누른 자리에서 되돌린다 */}
        {activeQuery ? (
          <button
            className="composer__send composer__send--clear"
            onClick={() => {
              setDraft("");
              onClear();
            }}
            aria-label="검색 해제"
            title="검색 해제(Esc)"
          >
            {Ic.xmark}
          </button>
        ) : (
          <button className="composer__send" onClick={() => onSend(draft)} aria-label="검색">
            {Ic.search}
          </button>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [email, setUserEmail] = React.useState<string | null>(() =>
    getToken() ? getEmail() : null
  );

  const [view, setView] = React.useState<string>("all"); // 추천/즐겨찾기/최근
  const [cat, setCat] = React.useState("all"); // 컴포저 카테고리 pill
  // 방문자 통계 — 작업창 열림·탭(추천/즐겨찾기/최근)·종류 바꿀 때 한 줄(관리자 › 방문자 통계, 채널 'PPT 애드인')
  React.useEffect(() => { trackAddin(email ? `/addin/${view}/${cat}` : "/addin/login"); }, [email, view, cat]);
  const [pptFilter, setPptFilter] = React.useState("all"); // 장표 서브필터(전체/패키지/표지/간지/콘텐츠…)
  const [topic, setTopic] = React.useState(""); // 주제 세분화(카테고리 안에서 한 번 더 좁히기)
  const [topics, setTopics] = React.useState<Topic[]>([]);
  const [foundFlash, setFoundFlash] = React.useState<number | null>(null); // "N개 찾았어요" 플래시
  const [searchAnim, setSearchAnim] = React.useState(false); // 검색 버튼 눌렀을 때만 애니메이션(탭/카테고리 이동 제외)
  const [activeQuery, setActiveQuery] = React.useState(""); // 전송된 검색어
  const [sort, setSort] = React.useState("latest"); // 디폴트=최신순(새 자료 먼저)
  const [cats, setCats] = React.useState<Category[]>(CATEGORIES);
  const [grandTotal, setGrandTotal] = React.useState<number | null>(null);

  // 메뉴 상태
  const [notifOpen, setNotifOpen] = React.useState(false);
  const [botOpen, setBotOpen] = React.useState(false); // powerPlus AI Help
  const [profileOpen, setProfileOpen] = React.useState(false);
  const closeMenus = () => {
    setNotifOpen(false);
    setProfileOpen(false);
  };

  // 공지(알림)
  const [announcements, setAnnouncements] = React.useState<Announcement[]>([]);
  const [annSeen, setAnnSeenState] = React.useState<string>(() => getAnnSeen());
  const [annExpanded, setAnnExpanded] = React.useState<string | null>(null); // 알림 아코디언
  const unreadAnn = announcements.filter((a) => a.created_at > annSeen).length;

  // 콘텐츠 요청 시트
  const [requestOpen, setRequestOpen] = React.useState(false);
  const [reqType, setReqType] = React.useState("아이콘");
  const [reqTitle, setReqTitle] = React.useState("");
  const [reqDesc, setReqDesc] = React.useState("");
  const [reqLink, setReqLink] = React.useState("");
  const [reqSubmitted, setReqSubmitted] = React.useState(false);

  const [rawAssets, setRawAssets] = React.useState<Asset[]>([]);
  // 유사 자산 추천 모드
  const [similarOf, setSimilarOf] = React.useState<Asset | null>(null);
  const [similarList, setSimilarList] = React.useState<Asset[]>([]);
  const [similarLoading, setSimilarLoading] = React.useState(false);
  // 같은 스타일 세트 모달(카드 우측 하단 버튼)
  const [setOf, setSetOf] = React.useState<Asset | null>(null);
  const [setList, setSetList] = React.useState<Asset[]>([]);
  const [setsTotal, setSetsTotal] = React.useState(0);
  const [setsLoading, setSetsLoading] = React.useState(false);
  const setSeq = React.useRef(0);
  const setPage = React.useRef(0);
  const setBusy = React.useRef(false);
  const setEnd = React.useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [offline, setOffline] = React.useState(false);
  // 오타 교정 안내(입력한 말 => 실제 검색한 말)
  const [corrected, setCorrected] = React.useState<Record<string, string> | null>(null);
  const [total, setTotal] = React.useState(0);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const pageRef = React.useRef(1);

  const { insertingId, message, error, insert, clearMessage } = useInsert();
  const [hint, setHint] = React.useState<string | null>(null); // 검색 안내(한 글자 등)
  const { favorites, toggleFavorite, isFavorite } = useFavorites(email);
  const { recent, pushRecent } = useRecent(email);

  const PAGE_SIZE = 60;
  const isSpecial = view === "favorites" || view === "recent";
  /** 빠른 판단이 종류를 대신 골랐을 때 안내(되돌리기 버튼) — 사용자가 직접 고른 종류는 건드리지 않는다 */
  const [autoNote, setAutoNote] = React.useState<string | null>(null);
  const [slideBusy, setSlideBusy] = React.useState(false);

  const serverCategory = isSpecial ? "all" : cat;
  // 장표(ppt) 서브필터: 유형/페이지 그룹핑
  const PPT_FILTERS: { key: string; label: string; kind?: string; ptype?: string }[] = [
    { key: "all", label: "전체" },
    { key: "package", label: "패키지", kind: "package" },
    { key: "cover", label: "표지", ptype: "cover" },
    { key: "toc", label: "목차", ptype: "toc" },
    { key: "divider", label: "간지", ptype: "divider" },
    { key: "content", label: "콘텐츠", ptype: "content" },
    { key: "qa", label: "Q&A", ptype: "qa" },
    { key: "etc", label: "기타", ptype: "etc" },
  ];
  const isPpt = !isSpecial && cat === "ppt";
  const pf = PPT_FILTERS.find((f) => f.key === pptFilter);
  const pptKind = isPpt ? pf?.kind ?? "" : "";
  const pptType = isPpt ? pf?.ptype ?? "" : "";
  // 카테고리 + 전체 수 + 공지 로드
  React.useEffect(() => {
    if (!email) return;
    fetchCategories()
      .then((list) =>
        setCats([
          // '전체'는 각 카테고리 합
          { key: "all", label: "전체", count: list.reduce((n, c) => n + (c.count ?? 0), 0) },
          ...list,
        ])
      )
      .catch(() => undefined);
    fetchAssets("all", "", 1, 1)
      .then((r) => setGrandTotal(r.total))
      .catch(() => undefined);
    fetchAnnouncements().then(setAnnouncements).catch(() => undefined);
  }, [email]);

  // 즐겨찾기/최근은 id 목록으로만 조회 → 전체(수천) 로드 회피. 정렬상 뒤쪽 자산도 누락 없음.
  const specialKey = isSpecial
    ? view === "favorites"
      ? Array.from(favorites).sort().join(",")
      : recent.join(",")
    : "";

  // 목록 로드 (뷰/카테고리/검색/정렬 변경 시 1페이지부터)
  React.useEffect(() => {
    if (!email) return;
    const ctrl = new AbortController();
    pageRef.current = 1;
    setLoading(true);
    const run = isSpecial
      ? fetchByIds(view === "favorites" ? Array.from(favorites) : recent, ctrl.signal).then((assets) => ({
          assets,
          total: assets.length,
          offline: false,
        }))
      : fetchAssets(serverCategory, activeQuery, 1, PAGE_SIZE, ctrl.signal, sort, pptKind, pptType, topic);
    run
      .then((r) => {
        setRawAssets(r.assets);
        setTotal(r.total);
        setOffline(r.offline);
        setCorrected((r as { corrected?: Record<string, string> | null }).corrected ?? null);
      })
      .catch((e) => {
        if (e instanceof AuthRequiredError) {
          clearSession();
          setUserEmail(null);
        }
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, cat, activeQuery, email, sort, pptFilter, topic, specialKey]);

  // 주제 목록 — 한 번 받은 카테고리는 캐시해 두고, 나머지도 미리 받아 둔다(전환 즉시 표시)
  const topicCache = React.useRef<Record<string, Topic[]>>({});
  React.useEffect(() => {
    if (!email || isSpecial || cat === "all") {
      setTopics([]);
      return;
    }
    const cached = topicCache.current[cat];
    if (cached) setTopics(cached);          // 있으면 깜빡임 없이 바로
    const ctrl = new AbortController();
    fetchTopics(cat, ctrl.signal)
      .then((t) => { topicCache.current[cat] = t; setTopics(t); })
      .catch(() => undefined);
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, email, isSpecial]);

  // 카테고리 목록이 오면 주제도 미리 받아 둔다 — 칩을 눌렀을 때 기다리지 않게
  React.useEffect(() => {
    if (!email) return;
    cats.forEach((c) => {
      if (c.key === "all" || topicCache.current[c.key]) return;
      fetchTopics(c.key).then((t) => { topicCache.current[c.key] = t; }).catch(() => undefined);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cats, email]);

  // 검색 완료 → "N개 찾았어요" 플래시. **검색 버튼을 눌렀을 때(searchAnim)만** — 탭/카테고리 이동 제외.
  const prevLoadingRef = React.useRef(false);
  const flashTimer = React.useRef<number | undefined>(undefined); // 자동 사라짐 타이머(ref로 보관 → effect 재실행에 취소되지 않음)
  const hintTimer = React.useRef<number | undefined>(undefined);
  /** 검색 안내 토스트(삽입 토스트와 같은 자리에 표시). 타이머는 ref 보관 — effect cleanup에 취소되지 않게 */
  function showHint(text: string) {
    setHint(text);
    if (hintTimer.current) window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHint(null), 2200);
  }
  // 빠른 검색에서는 '찾는 중' 오버레이를 띄우지 않는다 — 떴다 사라지는 깜빡임이 오히려 느리게 느껴진다
  const [slowSearch, setSlowSearch] = React.useState(false);
  const slowTimer = React.useRef<number | undefined>(undefined);
  React.useEffect(() => {
    if (slowTimer.current) window.clearTimeout(slowTimer.current);
    if (loading && searchAnim) {
      slowTimer.current = window.setTimeout(() => setSlowSearch(true), 300);
    } else {
      setSlowSearch(false);
    }
    return () => {
      if (slowTimer.current) window.clearTimeout(slowTimer.current);
    };
  }, [loading, searchAnim]);

  React.useEffect(() => {
    if (prevLoadingRef.current && !loading && searchAnim) {
      setSearchAnim(false); // 한 번만 — 이후 탭 이동 시 재발동 방지
      if (total > 0 && slowSearch) {
        setFoundFlash(total);
        if (flashTimer.current) window.clearTimeout(flashTimer.current);
        flashTimer.current = window.setTimeout(() => setFoundFlash(null), 700);
      }
    }
    prevLoadingRef.current = loading;
  }, [loading, searchAnim, total]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      pageRef.current += 1;
      const r = await fetchAssets(serverCategory, activeQuery, pageRef.current, PAGE_SIZE, undefined, sort, pptKind, pptType, topic);
      setRawAssets((prev) => [...prev, ...r.assets]);
      setTotal(r.total);
    } catch (e) {
      if (e instanceof AuthRequiredError) {
        clearSession();
        setUserEmail(null);
      }
    } finally {
      setLoadingMore(false);
    }
  }

  const hasMore = !isSpecial && rawAssets.length < total;

  const bodyRef = React.useRef<HTMLDivElement>(null);
  const sentinelRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = bodyRef.current;
    if (!sentinel || !root || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore) loadMore();
      },
      { root, rootMargin: "300px" }
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [hasMore, loadingMore, serverCategory, activeQuery, sort, pptFilter, topic]);

  const displayed = React.useMemo(() => {
    if (view === "favorites") return rawAssets.filter((a) => favorites.has(a.id));
    if (view === "recent") {
      const order = new Map(recent.map((id, i) => [id, i] as const));
      return rawAssets.filter((a) => order.has(a.id)).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    }
    return rawAssets;
  }, [rawAssets, view, favorites, recent]);

  async function handleInsert(asset: Asset) {
    const ok = await insert(asset);
    if (ok) {
      pushRecent(asset.id);
      recordUsage(asset.id);
    }
  }

  // 비슷한 자산 보기
  async function handleShowSimilar(asset: Asset) {
    setSimilarOf(asset);
    setSimilarLoading(true);
    try {
      setSimilarList(await fetchSimilar(asset.id, 24));
    } finally {
      setSimilarLoading(false);
    }
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }
  function clearSimilar() {
    setSimilarOf(null);
    setSimilarList([]);
  }

  // 같은 스타일 세트 모달 — 같은 배치로 등록된 자산을 한 화면에 모아 본다
  // 세트가 수백 개라 한 번에 60개씩 — 목록 끝이 보이면 다음 쪽을 이어 붙인다(전부 끝까지 볼 수 있게).
  async function handleShowSet(asset: Asset) {
    setSeq.current += 1;
    setPage.current = 0;
    setSetOf(asset);
    setSetList([]);
    setSetsTotal(0);
    await loadMoreSet(asset.id, setSeq.current);
  }
  async function loadMoreSet(id: string, seq: number) {
    if (setBusy.current) return;
    setBusy.current = true;
    setSetsLoading(true);
    try {
      const r = await fetchStyleSet(id, setPage.current + 1, 60);
      if (seq !== setSeq.current) return; // 그사이 다른 세트를 열었다
      setPage.current += 1;
      setSetList((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        return prev.concat(r.data.filter((a) => !seen.has(a.id)));
      });
      setSetsTotal(r.total);
    } finally {
      setBusy.current = false;
      if (seq === setSeq.current) setSetsLoading(false);
    }
  }
  React.useEffect(() => {
    const el = setEnd.current;
    if (!setOf || !el || setsLoading || setList.length >= setsTotal) return;
    const io = new IntersectionObserver(
      (es) => { if (es.some((e) => e.isIntersecting)) loadMoreSet(setOf.id, setSeq.current); },
      { root: el.parentElement, rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [setOf, setsLoading, setList.length, setsTotal]);
  // 카테고리/검색/세그먼트가 바뀌면 유사 모드 해제
  React.useEffect(() => {
    setSimilarOf(null);
    setSimilarList([]);
  }, [cat, activeQuery, view]);

  async function handleLogout() {
    await logout();
    setUserEmail(null);
    setRawAssets([]);
    closeMenus();
  }

  function openNotif() {
    setNotifOpen((v) => !v);
    setProfileOpen(false);
  }
  // "모두 읽음" — 미확인 표시(코랄 점/벨 배지) 해제
  function markAllNotifRead() {
    const latest = announcements.reduce((m, a) => (a.created_at > m ? a.created_at : m), "");
    if (latest > annSeen) {
      setAnnSeen(latest);
      setAnnSeenState(latest);
    }
  }

  /** 컴포저 검색어 확정. 입력 초안은 ComposerInput 로컬 state — 타이핑마다 App(수백 카드) 리렌더 방지 */
  async function sendQuery(raw: string) {
    const q = raw.trim();
    // 종류를 아직 안 골랐으면 검색어로 종류를 먼저 고른다(1.5초 안에 답이 없으면 전체에서)
    if (q && cat === "all" && !isSpecial) {
      const r = await routeQuery(q);
      const c = r?.kind ? cats.find((x) => x.key === r.kind) : undefined;
      if (c) {
        setCat(c.key);
        setPptFilter("all");
        setTopic("");
        setAutoNote(`‘${q}’ → ${c.label}에서 찾았어요`);
      }
    }
    // 한 글자도 검색된다 — 서버가 정확 태그를 먼저 보고, 결과가 적을 때만 부분일치를 연다.
    setActiveQuery(q);
    setSearchAnim(!!q); // 검색 버튼 눌렀을 때만 캐릭터 애니메이션
    setView("all");
    closeMenus();
  }
  function clearQuery() {
    if (autoNote) { setCat("all"); setAutoNote(null); }
    setActiveQuery(""); // ComposerInput 초안은 activeQuery 동기화 effect로 함께 비워짐
  }

  /** 지금 선택한 슬라이드 글로 어울리는 자료 찾기 — 종류 + 검색 낱말을 정해 바로 검색 */
  async function suggestForSlide() {
    if (slideBusy) return;
    setSlideBusy(true);
    try {
      const { title, text } = await readSelectedSlide();
      if (!title && !text) { showHint("이 슬라이드에는 글이 없습니다."); return; }
      const r = await suggestFromSlide(title, text);
      const c = r.kind ? cats.find((x) => x.key === r.kind) : undefined;
      setCat(c ? c.key : "all");
      setPptFilter("all");
      setTopic("");
      setView("all");
      const head = (title || text).split(/\r?\n/)[0].slice(0, 18);
      setAutoNote(`슬라이드 ‘${head}’ → ${c ? c.label : "전체"}${r.keyword ? ` · ‘${r.keyword}’` : ""}`);
      setActiveQuery(r.keyword ?? "");
      setSearchAnim(!!r.keyword);
      closeMenus();
    } catch (e) {
      showHint(e instanceof Error ? e.message : "슬라이드를 읽지 못했습니다.");
    } finally {
      setSlideBusy(false);
    }
  }

  function openRequest() {
    setRequestOpen(true);
    setReqSubmitted(false);
    closeMenus();
  }
  /** 무결과 검색 → 그 키워드로 콘텐츠 요청 시트 열기(제목·유형 프리필) — 검색↔요청 루프 연결 */
  function openRequestFromSearch() {
    setReqTitle(activeQuery.trim());
    if (cat !== "all") {
      const c = cats.find((x) => x.key === cat);
      if (c) setReqType(c.label);
    }
    setRequestOpen(true);
    setReqSubmitted(false);
    closeMenus();
  }
  function closeRequest() {
    setRequestOpen(false);
    setReqSubmitted(false);
    setReqType("아이콘");
    setReqTitle("");
    setReqDesc("");
    setReqLink("");
  }
  async function doSubmitRequest() {
    if (!reqTitle.trim()) return;
    await submitRequest({ type: reqType, title: reqTitle.trim(), description: reqDesc, link: reqLink });
    setReqSubmitted(true); // 서버 실패해도 UX상 접수 안내(요청은 best-effort)
  }

  // 토스트 자동 사라짐
  React.useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(clearMessage, 2600);
    return () => window.clearTimeout(t);
  }, [message, clearMessage]);

  if (!email) {
    return <Login onSuccess={setUserEmail} />;
  }

  const local = email.split("@")[0] || email;
  const avatarChar = local.charAt(0).toUpperCase();
  const gt = grandTotal ?? total;
  const count = isSpecial ? displayed.length : total;

  const emptyTitle = activeQuery
    ? "검색 결과가 없어요"
    : view === "favorites"
      ? "즐겨찾기가 비어 있어요"
      : view === "recent"
        ? "최근 본 자료가 없어요"
        : "자료가 없어요";
  const emptySub = activeQuery
    ? `‘${activeQuery}’와 일치하는\n자료를 찾지 못했어요.\n다른 키워드로 검색해 보세요.`
    : view === "favorites"
      ? "카드의 북마크로 자주 쓰는 자료를 모아보세요."
      : view === "recent"
        ? "자료를 클릭해 슬라이드에 추가하면 여기에 쌓여요."
        : "다른 카테고리를 선택해 보세요.";

  const anyMenu = notifOpen || profileOpen;

  return (
    <div className="app">
      {/* 헤더 */}
      <header className="app__header--row">
        <div className="brand">
          <span className="brand__mark" aria-hidden>
            {Ic.logo}
          </span>
          <span className="brand__text">
            <span className="app__title">power<b>Assets</b></span>
            <span className="brand__sub">에셋 라이브러리</span>
          </span>
        </div>
        <div className="app__actions">
          <button className="bell" onClick={openNotif} aria-label="알림" title="알림">
            {Ic.bell}
            {unreadAnn > 0 && <span className="bell__badge">{unreadAnn}</span>}
          </button>
          <button
            className="bell"
            onClick={() => { closeMenus(); setBotOpen(true); }}
            aria-label="powerPlus AI Help"
            title="powerPlus AI Help"
          >
            {BotIcon}
          </button>
          <button
            className="avatar"
            onClick={() => {
              setProfileOpen((v) => !v);
              setNotifOpen(false);
            }}
            aria-label="내 계정"
            title={email}
          >
            {avatarChar}
          </button>
        </div>
      </header>

      {/* 알림 / 프로필 드롭다운 */}
      {anyMenu && <div className="menu-scrim" onClick={closeMenus} />}
      {notifOpen && (
        <div className="dropdown notif" role="dialog" aria-label="알림">
          <div className="notif__head">
            <span className="notif__title">알림</span>
            {unreadAnn > 0 && (
              <button className="notif__readall" onClick={markAllNotifRead}>모두 읽음</button>
            )}
          </div>
          <div className="notif__list">
            {announcements.length === 0 ? (
              <div className="notif__empty">새 알림이 없습니다.</div>
            ) : (
              announcements.slice(0, 2).map((a) => {
                const open = annExpanded === a.id;
                const unread = a.created_at > annSeen;
                return (
                  <div key={a.id} className={"notif__item" + (open ? " notif__item--open" : "")}>
                    <button
                      className="notif__row"
                      onClick={() => {
                        const willOpen = !open;
                        setAnnExpanded(willOpen ? a.id : null);
                        // 펼쳐서 읽으면 읽음 처리 → 벨 배지/점 상태 갱신
                        if (willOpen && a.created_at > annSeen) {
                          setAnnSeen(a.created_at);
                          setAnnSeenState(a.created_at);
                        }
                      }}
                      aria-expanded={open}
                    >
                      <span className="notif__item-title">{a.title}</span>
                      {unread && <span className="notif__dot" aria-hidden />}
                      <svg
                        className={"notif__chev" + (open ? " notif__chev--open" : "")}
                        width="13" height="13" viewBox="0 0 24 24" fill="none"
                        stroke="#B5B5B5" strokeWidth="2.4" aria-hidden
                      >
                        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    {open && a.body && <div className="notif__item-text">{a.body}</div>}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
      {profileOpen && (
        <div className="dropdown profile" role="dialog" aria-label="내 계정">
          <div className="profile__head">
            <span className="profile__av" aria-hidden>
              {avatarChar}
            </span>
            <span style={{ minWidth: 0 }}>
              <span className="profile__email">{email}</span>
            </span>
          </div>
          <div className="profile__divider" />
          <div className="profile__section">
            <button className="profile__item" onClick={openRequest}>
              <span className="profile__item-ic" aria-hidden>
                {Ic.request}
              </span>
              <span style={{ minWidth: 0 }}>
                <span className="profile__item-title">콘텐츠 요청하기</span>
                <span className="profile__item-sub">원하는 자료를 관리자에게 요청</span>
              </span>
            </button>
          </div>
          <div className="profile__divider" />
          <div className="profile__section">
            <button className="profile__logout" onClick={handleLogout}>
              로그아웃
              <span className="profile__logout-ic" aria-hidden>
                {Ic.logout}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* 홈 (인사말/검색바 + 세그먼트 + 카운트/정렬) */}
      <div className="home">
        <div className="segmented">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              className={"seg" + (view === v.key ? " seg--active" : "")}
              onClick={() => {
                setView(v.key);
                closeMenus();
              }}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* 검색 — 카테고리 위(사용자 요청: 하단 컴포저 → 상단으로 이동) */}
        {(
          <div className="composer composer--top">
            <ComposerInput activeQuery={activeQuery} onSend={(q) => { void sendQuery(q); }} onClear={clearQuery} catButton={null} />
            <button className="slidepick" onClick={() => void suggestForSlide()} disabled={slideBusy}>
              <span className="slidepick__ic" aria-hidden>{Ic.spark}</span>
              {slideBusy ? "슬라이드 읽는 중…" : "이 슬라이드에 맞는 자료 찾기"}
            </button>
          </div>
        )}

        {/* 종류·주제·정렬 — 사이트와 같은 선택 버튼(라벨·현재 값 ▾ → 다크 창). 칩 나열은 폭마다 줄바꿈이 달라져 쓰지 않는다 */}
        <div className="pillrow">
          <ChoicePill
            label="종류"
            value={cat}
            options={cats.map((c) => ({ key: c.key, label: c.label, count: c.count || undefined }))}
            onChange={(k) => {
              setCat(k);
              setAutoNote(null);
              setPptFilter("all"); // 카테고리 전환 시 장표 서브필터 초기화
              setTopic("");        // 주제도 초기화(다른 카테고리의 주제를 물고 가면 0건이 된다)
              setView("all");
              closeMenus();
            }}
          />
          {!isSpecial && topics.length > 0 && !activeQuery && !similarOf && (
            <ChoicePill
              label="주제"
              value={topic}
              options={[{ key: "", label: "전체" }, ...topics.map((t) => ({ key: t.key, label: t.label, count: t.count }))]}
              onChange={setTopic}
            />
          )}
          {!isSpecial && (
            <ChoicePill
              label="정렬"
              value={sort}
              options={SORTS.map((x) => ({ key: x.key, label: x.label }))}
              onChange={(k) => { setSort(k as typeof sort); closeMenus(); }}
            />
          )}
        </div>

        {autoNote && !similarOf && (
          <div className="autonote">
            <span>{autoNote}</span>
            <button onClick={() => { setCat("all"); setAutoNote(null); }}>전체에서 보기</button>
          </div>
        )}

        {/* 검색/유사 결과 바 — 탭 아래로 이동(사용자 요청) */}
        {(similarOf ? (
          <div className="querybar">
            <span className="querybar__text">
              ‘<b>{similarOf.name || similarOf.tags?.[0] || similarOf.id}</b>’와 비슷한 자산 {similarList.length}개
            </span>
            <button className="querybar__clear" onClick={clearSimilar}>
              닫기
            </button>
          </div>
        ) : activeQuery ? (
          <div className="querybar">
            <span className="querybar__text">
              {corrected && Object.keys(corrected).length > 0 ? (
                <>
                  ‘<b>{Object.values(corrected).join(" ")}</b>’{roSuffix(Object.values(corrected).join(" "))} 고쳐서 찾았어요 · {count}개
                </>
              ) : (
                <>‘<b>{activeQuery}</b>’ 검색 결과 {count}개</>
              )}
            </span>
            <button className="querybar__clear" onClick={clearQuery}>
              뒤로가기
            </button>
          </div>
        ) : null)}

        {(
        <div className="countrow">
          <span className="countrow__count">
            {loading ? "불러오는 중…" : count}개 <span>· 전체 {gt}</span>
            {offline && !loading && <span> · 오프라인</span>}
          </span>
        </div>
        )}
      </div>

      {/* 그리드 (브라우저 탭이면 웹 검색 패널) */}
      <div className="app__body" ref={bodyRef}>
        <>
        {/* 장표 서브필터: 유형/페이지 그룹핑 — 그리드 상단 고정(sticky) */}
        {isPpt && !similarOf && (
          <div
            className="ppt-subfilter"
            style={{
              position: "sticky", top: 0, zIndex: 5,
              display: "flex", gap: 6, overflowX: "auto",
              padding: "8px 15px 10px", background: "var(--bg)",
              borderBottom: "1px solid var(--line)", WebkitOverflowScrolling: "touch",
            }}
          >
            {PPT_FILTERS.map((f) => {
              const on = pptFilter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setPptFilter(f.key)}
                  style={{
                    flex: "0 0 auto", padding: "5px 13px", borderRadius: 999, fontSize: 12, fontWeight: 600,
                    border: "1px solid " + (on ? "#E46B37" : "#E9E9E9"),
                    background: on ? "#E46B37" : "#fff", color: on ? "#fff" : "#555555",
                    cursor: "pointer", whiteSpace: "nowrap",
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        )}
        <AssetGrid
          assets={similarOf ? similarList : displayed}
          insertingId={insertingId}
          onInsert={handleInsert}
          isFavorite={isFavorite}
          onToggleFavorite={toggleFavorite}
          onShowSimilar={handleShowSimilar}
          onShowSet={handleShowSet}
          emptyTitle={similarOf ? "비슷한 자산이 없어요" : emptyTitle}
          emptySub={similarOf ? "다른 자산에서 다시 시도해 보세요." : emptySub}
          emptyActionLabel={!similarOf && activeQuery ? `‘${activeQuery}’ 자료 요청하기` : undefined}
          onEmptyAction={!similarOf && activeQuery ? openRequestFromSearch : undefined}
          emptyBackLabel={similarOf ? "← 뒤로가기" : activeQuery ? "← 뒤로가기" : undefined}
          onEmptyBack={similarOf ? clearSimilar : activeQuery ? clearQuery : undefined}
          loading={similarOf ? similarLoading : loading}
          minCard={!isSpecial && (cat === "icon" || cat === "illust") ? 86 : 122}
        />
        <div ref={sentinelRef} className="scroll-sentinel" aria-hidden />
        {loadingMore && (
          <div className="loadmore-spin" aria-label="더 불러오는 중">
            <span className="spinner" />
          </div>
        )}
        </>
      </div>

      {/* 검색 중 — '자료 찾는 중' 캐릭터 레이어 */}
      {loading && searchAnim && slowSearch && (
        <div style={{ position: "absolute", inset: 0, zIndex: 60, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(240,243,246,0.94)", pointerEvents: "none" }}>
          <img src="assets/state-searching.svg" alt="" className="state-anim state-anim--search" style={{ width: 204, height: "auto" }} />
          <div style={{ marginTop: 6, fontWeight: 700, fontSize: 14, color: "#555555" }}>자료 찾는 중…</div>
        </div>
      )}

      {/* 찾음 — 'N개 찾았어요' 플래시(잠깐 떴다 사라짐) */}
      {foundFlash != null && (
        <div style={{ position: "absolute", inset: 0, zIndex: 61, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ background: "#fff", borderRadius: 18, padding: "18px 24px", boxShadow: "0 16px 44px rgba(0, 0, 0,0.2)", textAlign: "center", animation: "ppDrop 0.18s ease" }}>
            <img src="assets/state-found.svg" alt="" className="state-anim state-anim--found" style={{ width: 156, height: "auto" }} />
            <div style={{ marginTop: 4, fontWeight: 800, fontSize: 15, color: "#111111" }}>{foundFlash}개의 자료를 찾았어요!</div>
          </div>
        </div>
      )}

      {/* 같은 스타일 세트 모달 — 세트를 한눈에 훑고 그 자리에서 삽입 */}
      {setOf && (
        <div className="sheet-scrim" onClick={() => setSetOf(null)}>
          <div className="sheet setsheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet__grip" />
            <div className="sheet__head">
              <div>
                <div className="sheet__title">같은 스타일 세트</div>
                <div className="sheet__desc">
                  {setsTotal === 0 && setsLoading
                    ? "불러오는 중…"
                    : `${setsTotal}개 · 색과 그림 스타일이 같은 자산`}
                </div>
              </div>
              <button className="sheet__close" onClick={() => setSetOf(null)} aria-label="닫기">
                {Ic.close}
              </button>
            </div>
            <div className="setsheet__body">
              <div className="setgrid">
                {setList.map((s) => (
                  <button
                    key={s.id}
                    className={"setcard" + (s.id === setOf.id ? " setcard--self" : "")}
                    title={s.name || s.tags?.[0] || s.id}
                    disabled={insertingId === s.id}
                    onClick={() => handleInsert(s)}
                  >
                    <AuthImg src={s.thumb_url || s.image_url} alt="" decoding="async" />
                  </button>
                ))}
              </div>
              <div ref={setEnd} className="setsheet__more">
                {setList.length > 0 && (setList.length < setsTotal ? "더 불러오는 중…" : "")}
              </div>
              {!setsLoading && setList.length === 0 && (
                <div className="setsheet__empty">세트 정보를 찾지 못했어요.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 토스트 — 삽입 결과 / 검색 안내 공용 */}
      {(message || hint) && (
        <div className={"toast" + (error || (!message && hint) ? " toast--error" : "")} role="status">
          <span className="toast__check" aria-hidden>
            {Ic.check}
          </span>
          {message || hint}
        </div>
      )}

      {/* 콘텐츠 요청 시트 */}
      {botOpen && <HelpBot onClose={() => setBotOpen(false)} />}

      {requestOpen && (
        <div className="sheet-scrim" onClick={closeRequest}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            {!reqSubmitted ? (
              <>
                <div className="sheet__grip" />
                <div className="sheet__head">
                  <div>
                    <div className="sheet__title">콘텐츠 요청</div>
                    <div className="sheet__desc">
                      필요한 아이콘·자료를 요청하면
                      <br />
                      관리자가 검토 후 라이브러리에 추가해 드려요.
                    </div>
                  </div>
                  <button className="sheet__close" onClick={closeRequest} aria-label="닫기">
                    {Ic.close}
                  </button>
                </div>
                <div className="sheet__body">
                  <div className="sheet__flabel">유형</div>
                  <div className="sheet__types">
                    {/* 유형 = 관리자 카테고리 연동(전체 제외). 카테고리 추가 시 자동 노출 */}
                    {cats.filter((c) => c.key !== "all").map((c) => (
                      <button
                        key={c.key}
                        className={"chip-btn" + (reqType === c.label ? " chip-btn--active" : "")}
                        onClick={() => setReqType(c.label)}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                  <div className="sheet__flabel">
                    제목 · 키워드 <span className="sheet__req">*</span>
                  </div>
                  <input
                    className="sheet__input"
                    value={reqTitle}
                    placeholder="예) 친환경·ESG 관련 3D 아이콘"
                    onChange={(e) => setReqTitle(e.target.value)}
                  />
                  <div className="sheet__flabel">상세 설명</div>
                  <textarea
                    className="sheet__textarea"
                    rows={3}
                    value={reqDesc}
                    placeholder="원하는 스타일, 색감, 용도 등을 적어주세요."
                    onChange={(e) => setReqDesc(e.target.value)}
                  />
                  <div className="sheet__flabel">참고 링크 (선택)</div>
                  <input
                    className="sheet__input"
                    value={reqLink}
                    placeholder="https://"
                    onChange={(e) => setReqLink(e.target.value)}
                  />
                </div>
                <div className="sheet__foot">
                  <button className="sheet__submit" disabled={!reqTitle.trim()} onClick={doSubmitRequest}>
                    요청 보내기
                  </button>
                </div>
              </>
            ) : (
              <div className="sheet__done">
                <div className="sheet__done-ic" aria-hidden>
                  ✓
                </div>
                <div className="sheet__done-title">요청이 접수되었습니다</div>
                <div className="sheet__done-sub">
                  관리자가 검토 후 라이브러리에 반영해 드려요.
                  <br />
                  결과는 알림으로 안내됩니다.
                </div>
                <button
                  className="sheet__submit"
                  style={{ marginTop: 20 }}
                  onClick={closeRequest}
                >
                  확인
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

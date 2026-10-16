// 관리자 화면 데이터 — /api/v1/admin/… (기획 §9). 응답 형은 api/routes/admin.php 와 1:1.
import { apiFetch, apiList } from "@/lib/api";

export interface AdminStats {
  users: { total: number; staff: number; external: number };
  assets: number;
  deck_jobs: number;
  mockups: number;
  contacts_open: number;
  removals: { pending: number; overdue: number };
  audit: Array<{ id: number; action: string; target: string; actor: string | null; actor_email: string | null; created_at: string }>;
}

export type ContactStatus = "open" | "answered" | "closed";
export interface AdminContact {
  id: string; topic: string; module: string | null; name: string; email: string; org: string | null; seats: number | null;
  message: string; reply: string | null; reply_sent_at: string | null; status: ContactStatus; member: boolean;
  handled_by: string | null; handled_at: string | null; created_at: string; mail_sent?: boolean | null;
  /** 빠른 판단(Jev) — 실제 주제·모듈·급함·스팸 확률 */
  ai?: { topic: { value: string; confidence: number } | null; module: { value: string; confidence: number } | null; urgent: number; spam: number } | null;
}

export type RemovalStatus = "received" | "reviewing" | "done" | "rejected";
export interface AdminRemoval {
  no: string; status: RemovalStatus; content_type: string; content_id: string; claimant_name: string | null; claimant_org: string | null;
  email: string; phone: string | null; target_url: string | null; reason_kind: "copyright" | "privacy" | "other"; reason: string;
  resolution: string | null; due_at: string; handled_by: string | null; handled_at: string | null; created_at: string; overdue: boolean; mail_sent?: boolean | null;
}

export type GrantRole = "admin" | "curator" | "support";
export interface AdminUser {
  id: string; name: string; email: string; kind: "staff" | "external"; plan: "staff" | "free" | "pro" | "team";
  roles: Array<GrantRole | "superadmin">; last_active: string | null; created_at: string; me: boolean; status?: "active" | "blocked" | "dormant";
  /** 휴면 계정이 로그인을 시도해 승인을 기다리는 때 / 임직원 이용 기간 끝 */
  dormant_requested_at?: string | null; access_until?: string | null;
}

const qs = (o: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const fetchStats = () => apiFetch<AdminStats>("/admin/stats");
export const fetchContacts = (o: { status?: string; q?: string; page?: number }) => apiList<AdminContact>(`/admin/contacts${qs(o)}`);
export const fetchRemovals = (o: { status?: string; q?: string; page?: number }) => apiList<AdminRemoval>(`/admin/removals${qs(o)}`);
export const fetchUsers = (o: { kind?: string; role?: string; q?: string; page?: number }) => apiList<AdminUser>(`/admin/users${qs(o)}`);

export const CONTACT_STATUS_KO: Record<ContactStatus, string> = { open: "새 문의", answered: "답변함", closed: "닫음" };
export const REMOVAL_STATUS_KO: Record<RemovalStatus, string> = { received: "접수", reviewing: "검토 중", done: "삭제 처리", rejected: "반려" };
export const REASON_KO: Record<AdminRemoval["reason_kind"], string> = { copyright: "저작권", privacy: "개인정보·초상권", other: "기타" };
export const TOPIC_KO: Record<string, string> = { general: "일반", team: "팀·도입", data: "데이터", bug: "오류", partner: "제휴", removal: "삭제 요청" };

/** 문의에 붙은 AI 판단을 짧은 꼬리표로 — 작성자가 고른 주제와 다르면 AI 가 본 주제, 급함·스팸 */
export function contactAiTags(c: AdminContact): string[] {
  const a = c.ai;
  if (!a) return [];
  const t: string[] = [];
  if (a.topic && a.topic.value !== c.topic && a.topic.confidence >= 0.6) t.push("AI: " + (TOPIC_KO[a.topic.value] ?? a.topic.value));
  if (a.urgent >= 0.7) t.push("급함");
  if (a.spam >= 0.8) t.push("스팸 의심");
  return t;
}
export const ROLE_KO: Record<string, string> = { superadmin: "슈퍼관리자", admin: "관리자", curator: "큐레이터", support: "지원" };

/** "2026-10-06 18:14:05.787" → "2026.10.06 18:14" */
export const fmtAt = (s: string | null | undefined) => (s ? s.slice(0, 16).replace(/-/g, ".").replace("T", " ") : "—");

/** 기한까지 남은 시간 문구와 지남 여부 */
export function dueLeft(due: string, now = Date.now()): { text: string; late: boolean } {
  const ms = new Date(due.replace(" ", "T")).getTime() - now;
  const h = Math.round(Math.abs(ms) / 3_600_000);
  const t = h >= 24 ? `${Math.floor(h / 24)}일 ${h % 24}시간` : `${h}시간`;
  return ms < 0 ? { text: `${t} 지남`, late: true } : { text: `${t} 남음`, late: false };
}

// ── 모듈 운영(에셋·장표 작업·시안) ──
export type AssetVis = "internal" | "partner" | "pro" | "free" | "public" | "private";
export interface AdminAsset { id: string; category: string; category_ko: string; name: string | null; visibility: AssetVis; ai: boolean; created_at: string; updated_at: string; deleted_at?: string | null; thumb_url: string | null }
interface AdminDeckJob {
  id: string; title: string | null; filename: string | null; email: string; owner: string | null; status: string; stage: string | null; progress: number | null;
  slides: number | null; kind: string | null; phase: string | null; worker: string | null; error: string | null; spent_usd: number | null; created_at: string; finished_at: string | null; url: string;
}
export interface AdminMockup {
  id: string; title: string; ref_id: string | null; device: string | null; score: number | null; passed: boolean | null; checks: number; published: boolean; discarded: boolean;
  owner: string | null; owner_email: string | null; created_at: string; expires_at: string | null; gallery: { id: number; status: string; likes: number } | null; preview_url: string; public_url: string | null;
}
export const fetchAdminAssets = (o: { category?: string; visibility?: string; q?: string; page?: number }) => apiList<AdminAsset>(`/admin/assets${qs(o)}`);
export const fetchAdminDeckJobs = (o: { status?: string; q?: string; page?: number }) => apiList<AdminDeckJob>(`/admin/deck/jobs${qs(o)}`);
export const fetchAdminMockups = (o: { state?: string; q?: string; page?: number }) => apiList<AdminMockup>(`/admin/mockups${qs(o)}`);
export const VIS_KO: Record<AssetVis, string> = { internal: "사내 전용", partner: "협력사", pro: "Pro", free: "Free", public: "공개", private: "본인만" };

// ── 대시보드 분석(/admin/analytics) — 옛 파워플러스 analytics 에서 살아남은 지표만. 이메일은 서버가 마스킹해 준다.
export type AnalyticsPeriod = "day" | "month" | "year";
export interface AdminAnalytics {
  period: AnalyticsPeriod;
  hero: { ins_total: number; users_total: number; ins_30: number; users_30: number; ins_prev_30: number; top3: number; top3_pct: number };
  /** 버킷(일 YYYY-MM-DD / 월 YYYY-MM / 년 YYYY)별 — logins 는 사용자별 마지막 로그인 기준이라 과거 구간은 적게 보인다 */
  trend: Array<{ bucket: string; logins: number; uses: number; deck: number; mock: number }>;
  /** [요일 0=일 … 6=토][시 0~23] 삽입 수 */
  heatmap: number[][];
  categories: Array<{ category: string; category_ko: string; uses: number; used_items: number; items: number }>;
  top_assets: Array<{ id: string; name: string | null; category: string; category_ko: string; uses: number; thumb_url: string | null }>;
  top_users: Array<{ name: string; email: string | null; kind: "staff" | "external"; uses: number; share: number }>;
  recent: Array<{ at: string; channel: "addin" | "mcp" | "deck" | "web"; user: string | null; email: string | null; asset: { id: string; name: string | null; category_ko: string; thumb_url: string | null } | null }>;
  /** 모듈 종합 — c30 최근 30일, p30 직전 30일 */
  modules: {
    assets: { c30: number; p30: number; users30: number; total: number };
    deck: { c30: number; p30: number; done30: number; failed30: number; done_pct: number; queue: number; total: number };
    mock: { c30: number; p30: number; avg30: number | null; pass30: number; published: number; gallery: number; shared: number; total: number };
    users: { total: number; staff: number; external: number; active30: number; active_p30: number };
  };
  deck_status: Array<{ status: string; n: number }>;
  score_bins: Array<{ bin: string; n: number }>;
  deck_recent: Array<{ id: string; title: string; status: string; slides: number | null; kind: string; user: string | null; email: string | null; at: string; finished_at: string | null; error: string | null }>;
  deck_fail: Array<{ reason: string; n: number }>;
  mock_recent: Array<{ token: string; title: string; score: number | null; passed: boolean | null; device: "pc" | "mobile"; checks: number; published: boolean; user: string | null; email: string | null; at: string }>;
  cross_users: Array<{ name: string; email: string | null; kind: "staff" | "external"; assets: number; deck: number; mock: number; total: number }>;
}
export const fetchAnalytics = (period: AnalyticsPeriod) => apiFetch<AdminAnalytics>(`/admin/analytics?period=${period}`);
export const CHANNEL_KO: Record<AdminAnalytics["recent"][number]["channel"], string> = { addin: "애드인", mcp: "MCP", deck: "장표", web: "웹" };

// ── 장표 운영 상세(엔진·통계·작업 상세·취소/재실행/삭제/수정) — api/routes/admin.php 끝부분과 1:1 ──
interface AdminDeckFile { kind: string; slide: number | null; name: string; size: number; created_at: string }
interface AdminDeckEvent { id: number; ts: string; kind: string; message: string }
interface AdminDeckJobDetail extends Omit<AdminDeckJob, "error" | "spent_usd"> {
  size: number; owner_id: string | null; source_kind: string | null; pilot_slide: number | null; cancel_requested: boolean;
  error: string | null; note: string | null; feedback: string | null; theme: string | null; shared: number; result_name: string | null;
  budget_usd: number | null; spent_usd: number; opts: Record<string, unknown> | null;
  claimed_at: string | null; heartbeat_at: string | null; started_at: string | null; deleted_at: string | null; duration_sec: number | null;
  files: { count: number; bytes: number; by_kind: Record<string, number>; items: AdminDeckFile[] };
  events: AdminDeckEvent[];
}
interface AdminDeckEngines {
  online: boolean;
  workers: Array<{ name: string; info: string | null; seen_at: string; online: boolean; running: number }>;
  queue: { queued: number; running: number; hold: number; review: number; stale: number; oldest_queued: string | null };
}
interface AdminDeckStats {
  days: number;
  series: Array<{ date: string; total: number; done: number; failed: number; canceled: number; spent_usd: number; avg_sec: number | null }>;
  summary: { total: number; done: number; failed: number; done_rate: number | null; avg_sec: number | null; spent_usd: number };
}
export const fetchAdminDeckJob = (id: string) => apiFetch<AdminDeckJobDetail>(`/admin/deck/jobs/${encodeURIComponent(id)}`);
export const fetchAdminDeckEngines = () => apiFetch<AdminDeckEngines>("/admin/deck/engines");
export const fetchAdminDeckStats = (days = 30) => apiFetch<AdminDeckStats>(`/admin/deck/stats?days=${days}`);
export const cancelAdminDeckJob = (id: string) => apiFetch<AdminDeckJobDetail>(`/admin/deck/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST" });
export const requeueAdminDeckJob = (id: string) => apiFetch<AdminDeckJobDetail>(`/admin/deck/jobs/${encodeURIComponent(id)}/requeue`, { method: "POST" });
export const deleteAdminDeckJob = (id: string) => apiFetch<{ id: string; status: string; files_removed: number }>(`/admin/deck/jobs/${encodeURIComponent(id)}`, { method: "DELETE" });
export const patchAdminDeckJob = (id: string, body: { shared?: number; email?: string }) =>
  apiFetch<AdminDeckJobDetail>(`/admin/deck/jobs/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
/** 공유 수준(기획 §19 powerDeck jobs.shared) */
export const SHARE_KO: Record<number, string> = { 0: "공유 끔", 1: "로그인 · 의견", 2: "로그인 · 편집", 3: "링크만 있으면 보기" };
export const DECK_STATUS_KO: Record<string, string> = { hold: "올리는 중", queued: "대기", running: "변환 중", review: "확인 대기", done: "완료", failed: "실패", canceled: "취소", deleted: "삭제됨" };
export const fmtBytes = (n: number) => (n >= 1 << 30 ? `${(n / (1 << 30)).toFixed(2)} GB` : n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);
export const fmtSec = (s: number | null | undefined) => (s == null ? "—" : s >= 3600 ? `${Math.floor(s / 3600)}시간 ${Math.round((s % 3600) / 60)}분` : s >= 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s}초`);

// ── powerAssets 백오피스(에셋 상세·수정·등록·세트·요청·검색 품질) — api/routes/admin.php 끝부분과 1:1
export interface AdminAssetFile { kind: string; mime: string; bytes: number; w: number | null; h: number | null; bucket: string; url: string | null }
export interface AdminAssetDetail {
  id: string; category: string; category_ko: string; name: string | null; alt: string | null; visibility: AssetVis; ai: boolean;
  w: number | null; h: number | null; source: string | null; slide_kind: string | null; slide_page: string | null; style_group: string | null; legacy_key: string | null;
  set: { id: string; name: string; count: number } | null; tags: { ko: string[]; en: string[]; meta: string[] }; files: AdminAssetFile[];
  thumb_url: string | null; original_url: string | null; uses: number; favorites: number; created_at: string; updated_at: string; deleted_at: string | null;
}
interface AdminAssetCategory { id: string; label: string; count: number; deleted: number }
export interface AdminAssetSet { id: string; name: string; style: string | null; category: string; category_ko: string; count: number; created_at: string; cover_url: string | null }
export type RequestStatus = "new" | "done" | "rejected";
export interface AdminAssetRequest {
  id: string; title: string; kind: string | null; kind_ko: string | null; detail: string | null; status: RequestStatus; source: string | null; reply: string | null;
  requester: string | null; requester_email: string | null; handled_item: string | null; handled_by: string | null; handled_at: string | null; created_at: string;
}
interface SearchQuality {
  days: number; total: number; zero: number; zero_rate: number; distinct: number; users: number; channels: Record<string, number>;
  top: Array<{ q: string; count: number; results: number }>; zero_top: Array<{ q: string; count: number; last_at: string }>;
  daily: Array<{ day: string; total: number; zero: number; zero_rate: number }>;
}
export const fetchAdminAsset = (id: string) => apiFetch<AdminAssetDetail>(`/admin/assets/${id}`);
export const fetchAdminAssetCategories = () => apiFetch<AdminAssetCategory[]>("/admin/assets/categories");
export const fetchAdminAssetTrash = (o: { page?: number }) => apiList<AdminAsset>(`/admin/assets/trash${qs(o)}`);
export const fetchAdminSets = (o: { category?: string; q?: string }) => apiFetch<AdminAssetSet[]>(`/admin/sets${qs(o)}`);
export const fetchAdminRequests = (o: { status?: string; q?: string; page?: number }) => apiList<AdminAssetRequest>(`/admin/requests${qs(o)}`);
export const fetchSearchQuality = (days: number) => apiFetch<SearchQuality>(`/admin/search-quality${qs({ days })}`);

// powerGuide 현황 — api/routes/admin_guide.php 와 1:1. 내용 편집은 없다(코드가 정본)
interface GuideAdmin {
  days: number;
  files: Array<{ label: string; path: string; feeds: string; ok: boolean; size: number; updated_at: string | null }>;
  counts: { components: number; by_source: { krds: number; shadcn: number; both: number }; tokens: number; krds_components: number; krds_patterns: number; checklist: number; kit_version: string; checklist_at: string | null };
  groups: Array<{ id: string; label: string; count: number; krds: number; shadcn: number; both: number }>;
  verdicts: Array<{ verdict: string; count: number }>;
  usage: { total: number; keys: number; share: number; tools: Array<{ tool: string; calls: number; keys: number }>; daily: Array<{ day: string; calls: number }> };
}
export const fetchGuideAdmin = (days: number) => apiFetch<GuideAdmin>(`/admin/guide${qs({ days })}`);
export const REQUEST_STATUS_KO: Record<RequestStatus, string> = { new: "새 요청", done: "처리 완료", rejected: "보류" };

// ── 콘텐츠 운영(시안 상세·갤러리·커뮤니티·도움말) — api/routes/admin2.php 와 1:1
const del = <T,>(path: string) => apiFetch<T>(path, { method: "DELETE" });
const post = <T,>(path: string, body: unknown = {}, method: "POST" | "PATCH" = "POST") =>
  apiFetch<T>(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

interface AdminMockupCheck { score: number | null; passed: boolean | null; fixes: Array<string | Record<string, unknown>>; summary: string | null }
interface AdminMockupDetail extends Omit<AdminMockup, "gallery"> {
  visibility: string; bytes: number; views: number; checked_at: string | null; check: AdminMockupCheck | null;
  published_at: string | null; discarded_at: string | null; owner_id: string | null; updated_at: string; thumb_url: string | null;
  gallery: { id: number; status: "study" | "shared" | "hidden"; likes: number; views: number; unlocks: number; shared_at: string | null; note: string | null } | null;
}
export const fetchAdminMockup = (id: string) => apiFetch<AdminMockupDetail>(`/admin/mockups/${id}`);
export const discardAdminMockup = (id: string) => del<AdminMockupDetail>(`/admin/mockups/${id}`);
export const restoreAdminMockup = (id: string) => post<AdminMockupDetail>(`/admin/mockups/${id}/restore`);
export const setAdminGallery = (id: number, act: "hide" | "show") => post<{ id: number; status: string }>(`/admin/gallery/${id}/${act}`);
export const deleteAdminGallery = (id: number) => del<null>(`/admin/gallery/${id}`);

export type CommCategory = "notice" | "qna" | "showcase" | "tip" | "free" | "staff";
export const COMM_CAT_KO: Record<CommCategory, string> = { notice: "공지사항", qna: "질문·답변", showcase: "작업 공유", tip: "제보·제안", free: "자유", staff: "사내 게시판" };
export const COMM_MODULE_KO: Record<string, string> = { assets: "powerAssets", deck: "powerDeck", mock: "powerMock", guide: "powerGuide" };
export interface AdminPostAuthor { id: string; name: string; email: string | null; staff: boolean }
interface AdminPost {
  id: string; category: CommCategory; title: string; body: string; excerpt: string; module: string | null; pinned: boolean; hidden: boolean;
  comments: number; likes: number; views: number; created_at: string; updated_at: string; author: AdminPostAuthor;
  /** 빠른 판단(Jev) — 광고·비방 확률, 더 맞는 게시판 */
  ai?: { category: { value: string; confidence: number } | null; ad: number; abuse: number } | null;
}

/** 글에 붙은 AI 판단 꼬리표 — 숨김 여부는 관리자가 정한다 */
export function postAiTags(p: AdminPost): string[] {
  const a = p.ai;
  if (!a) return [];
  const t: string[] = [];
  if (a.ad >= 0.7) t.push("광고 의심");
  if (a.abuse >= 0.7) t.push("비방 의심");
  return t;
}
export interface AdminComment { id: number; body: string; created_at: string; hidden: boolean; post: { id: string; title: string; category: CommCategory }; author: AdminPostAuthor }
export const fetchAdminPosts = (o: { cat?: string; state?: string; q?: string; page?: number }) => apiList<AdminPost>(`/admin/community/posts${qs(o)}`);
export const fetchAdminPost = (id: string) => apiFetch<AdminPost>(`/admin/community/posts/${id}`);
export const patchAdminPost = (id: string, body: { hidden?: boolean; pinned?: boolean; category?: CommCategory; title?: string; body?: string }) => post<AdminPost>(`/admin/community/posts/${id}`, body, "PATCH");
export const deleteAdminPost = (id: string) => del<null>(`/admin/community/posts/${id}`);
export const createAdminNotice = (body: { title: string; body: string; pinned?: boolean; module?: string | null; notify?: boolean }) => post<AdminPost>("/admin/community/notices", body);
export const fetchAdminComments = (o: { post?: string; state?: string; q?: string; page?: number }) => apiList<AdminComment>(`/admin/community/comments${qs(o)}`);
export const setAdminComment = (id: number, act: "hide" | "show") => post<AdminComment>(`/admin/community/comments/${id}/${act}`);
export const deleteAdminComment = (id: number) => del<null>(`/admin/community/comments/${id}`);

export interface HelpDoc { id: string; category: string; slug: string; title: string; body: string; order: number; published: boolean; created_at: string; updated_at: string }
export type HelpDocInput = Partial<Pick<HelpDoc, "category" | "slug" | "title" | "body" | "order" | "published">>;
/** 공개 도움말(발행된 문서만) */
export const fetchHelpDocs = () => apiFetch<{ items: HelpDoc[] }>("/help/docs").then((r) => r.items);
export const fetchAdminHelpDocs = (o: { cat?: string; q?: string }) => apiList<HelpDoc>(`/admin/help/docs${qs(o)}`);
export const createAdminHelpDoc = (b: HelpDocInput) => post<HelpDoc>("/admin/help/docs", b);
export const patchAdminHelpDoc = (id: string, b: HelpDocInput) => post<HelpDoc>(`/admin/help/docs/${id}`, b, "PATCH");
export const deleteAdminHelpDoc = (id: string) => del<null>(`/admin/help/docs/${id}`);

// ── 사용자 관리 고도화(api/routes/admin3.php) — 수동 추가·플랜·포인트·크레딧·차단·상세·키 폐기·포인트 규칙
type UserStatus = "active" | "blocked" | "dormant";
interface AdminUserBase {
  id: string; name: string; email: string; kind: "staff" | "external"; status: UserStatus; blocked_at: string | null; blocked_reason: string | null;
  dormant_at: string | null; dormant_requested_at: string | null; access_until: string | null;
  plan: AdminUser["plan"]; roles: AdminUser["roles"]; created_at: string;
}
export interface LedgerRow { id: number; delta: number; reason?: string; kind?: string; memo: string | null; ref?: string | null; balance_after?: number; expires_at?: string | null; created_at: string }
export interface AdminUserDetail extends AdminUserBase {
  plan_source: "pg" | "manual" | "legacy" | null; plan_until: string | null; plan_memo: string | null; last_active: string | null;
  logins: Array<{ provider: string; last_login_at: string | null }>;
  points: { balance: number; ledger: LedgerRow[] };
  credits: { balance: number; ledger: LedgerRow[] };
  keys: Array<{ id: string; name: string; masked: string; scopes: string[]; daily_limit: number | null; last_used_at: string | null; revoked_at: string | null; created_at: string }>;
  activity: { asset_uses: number; deck_jobs: number; mockups: number; posts: number };
  audit: Array<{ id: number; action: string; actor: string | null; actor_email: string | null; before: Record<string, unknown> | null; after: Record<string, unknown> | null; created_at: string }>;
  can: { block: boolean; plan: boolean };
}
export interface PointRule { reason: string; delta: number; daily_cap: number | null; yearly_cap: number | null; enabled: boolean; note: string | null; used_30: number }
export type ManualPlan = "free" | "pro" | "team";

export const fetchAdminUser = (id: string) => apiFetch<AdminUserDetail>(`/admin/users/${encodeURIComponent(id)}`);
export const createAdminUser = (b: { email: string; name?: string; kind?: string; plan?: ManualPlan; send_invite?: boolean }) =>
  post<AdminUserBase & { invite: "off" | "sent" | "failed" | "skipped" }>("/admin/users", b);
export const setUserPlan = (id: string, b: { plan: ManualPlan; until?: string; memo?: string }) => post<AdminUserBase & { plan_until: string | null; paid_subscription: boolean }>(`/admin/users/${encodeURIComponent(id)}/plan`, b, "PATCH");
export const adjustUserPoints = (id: string, b: { amount: number; reason: string }) => post<{ balance: number; delta: number; ref: string }>(`/admin/users/${encodeURIComponent(id)}/points`, b);
export const adjustUserCredits = (id: string, b: { amount: number; reason: string }) => post<{ balance: number; delta: number; ref: string }>(`/admin/users/${encodeURIComponent(id)}/credits`, b);
export const setUserStatus = (id: string, b: { status: UserStatus; reason?: string }) => post<AdminUserBase>(`/admin/users/${encodeURIComponent(id)}/status`, b, "PATCH");
/** 임직원 이용 기간 1년 연장(남은 기간 끝 또는 오늘 중 늦은 날부터) */
export const extendUserAccess = (id: string) => post<AdminUserBase>(`/admin/users/${encodeURIComponent(id)}/extend`);
export const revokeUserKey = (keyId: string) => post<{ id: string; revoked: boolean }>(`/admin/keys/${encodeURIComponent(keyId)}/revoke`);
export const fetchPointRules = () => apiFetch<PointRule[]>("/admin/point-rules");
export const patchPointRule = (reason: string, b: Partial<Pick<PointRule, "delta" | "daily_cap" | "yearly_cap" | "enabled">>) => post<PointRule>(`/admin/point-rules/${encodeURIComponent(reason)}`, b, "PATCH");

export const STATUS_KO: Record<UserStatus, string> = { active: "정상", blocked: "차단", dormant: "휴면" };
export const POINT_REASON_KO: Record<string, string> = {
  admin_adjust: "관리자 조정", signup: "가입", attend: "출석", attend_streak7: "연속 7일 출석", birthday: "생일",
  post: "글 쓰기", comment: "댓글", like_received: "좋아요 받기", share_create: "공유 링크 만들기", share_open: "공유 링크 열림",
  mockup_keep: "시안 보관", mockup_share: "시안 갤러리 공유", mockup_royalty: "내 시안이 열림",
  asset_request_accepted: "콘텐츠 요청 채택", guide_proposal_accepted: "규칙 제안 채택",
  use_asset_preview: "에셋 미리보기", use_deck_credit: "장표 체험", use_mockup_open: "시안 열람", use_screen_unlock: "잠긴 화면 열기",
};
export const CREDIT_KIND_KO: Record<string, string> = { grant_month: "월 지급", purchase: "구매", use: "사용", refund: "환불", expire: "만료", point_convert: "포인트 전환", admin_adjust: "관리자 조정" };
/** 감사 기록 대상 종류(서버 target_type) → 화면 이름. 내부 표 이름을 그대로 보이지 않게(GEN-019). */
const AUDIT_TARGET_KO: Record<string, string> = {
  user: "사용자", core_users: "사용자", core_api_keys: "API 키", asset: "에셋", asset_requests: "자료 요청",
  comm_posts: "커뮤니티 글", comm_comments: "커뮤니티 댓글", contact: "문의", removal: "삭제 요청",
  core_changelog: "변경 이력", core_help_docs: "도움말", core_policy_versions: "약관·정책", deck_checklist: "장표 체크리스트",
  mock_checklist: "목업 체크리스트", mockup: "시안", gallery: "갤러리", page: "화면", point_rule: "포인트 규칙", settings: "설정",
};
/** "종류:번호" → "API 키 · 번호" */
export const auditTargetKo = (t: string) => {
  const i = t.indexOf(":");
  const type = i < 0 ? t : t.slice(0, i);
  const id = i < 0 ? "" : t.slice(i + 1);
  const ko = AUDIT_TARGET_KO[type] ?? "기타";
  return id && id !== "0" ? `${ko} · ${id}` : ko;
};
export const AUDIT_KO: Record<string, string> = {
  "user.create": "수동 추가", "user.plan": "플랜 지정", "user.block": "차단", "user.unblock": "차단 해제", "points.adjust": "포인트 조정",
  "credits.adjust": "크레딧 조정", "key.revoke": "키 폐기", "role.grant": "역할 부여", "role.revoke": "역할 회수",
  "key.issue": "키 발급", "user.rename": "이름 변경", "user.consent": "약관 동의", "user.delete": "탈퇴",
  "asset.delete": "에셋 삭제", "asset.restore": "에셋 복원", "asset.request": "자료 요청", "asset.request.update": "자료 요청 처리",
  "comm.admin.notice": "공지 쓰기", "comm.admin.update": "글 상태 변경", "comm.admin.delete": "글 삭제",
  "comm.admin.comment.hide": "댓글 숨김", "comm.admin.comment.show": "댓글 보이기",
  "help.doc.create": "도움말 추가", "help.doc.update": "도움말 수정", "help.doc.delete": "도움말 삭제",
  "policy.create": "약관 새 버전", "policy.update": "약관 수정", "policy.delete": "약관 삭제", "changelog.update": "변경 이력 수정",
  "contact.update": "문의 처리", "removal.create": "삭제 요청 접수", "removal.update": "삭제 요청 처리",
  "point_rule.update": "포인트 규칙 수정", "ai.jev.update": "AI 설정 변경",
  "mock.checklist.update": "목업 체크리스트 처리", "deck.checklist.record": "장표 체크리스트 기록",
  "mock.mockup.discard": "시안 폐기", "mock.mockup.restore": "시안 복원", "mock.bulk_delete": "시안 일괄 삭제",
  "mock.publish": "시안 게시", "mock.gallery.share": "갤러리 공유", "mock.delete": "시안 삭제",
  "auth.test_account.create": "테스트 계정 만들기", "auth.test_login": "테스트 계정 로그인", "auth.test_login.fail": "테스트 로그인 실패",
  "admin.view": "관리자 열람",
};

// ── 변경 이력(core_changelog) — 공개 /changelog?module=, 관리자 /admin/changelog
export type ChangelogModule = "platform" | "assets" | "deck" | "mock" | "guide" | "mcp";
export interface ChangelogEntry { id: string; module: ChangelogModule; track: string; version: string; date: string; title: string; notes: string[]; published: boolean; updated_at: string }
type ChangelogInput = Partial<Pick<ChangelogEntry, "module" | "track" | "version" | "date" | "title" | "notes" | "published">>;
export const CHANGELOG_MODULES: { id: ChangelogModule; label: string }[] = [
  { id: "platform", label: "powerPlus 전체" }, { id: "assets", label: "powerAssets" }, { id: "deck", label: "powerDeck" },
  { id: "mock", label: "powerMock" }, { id: "guide", label: "powerGuide" }, { id: "mcp", label: "powerMCP" },
];
export const fetchChangelog = (module?: ChangelogModule) => apiFetch<{ items: ChangelogEntry[] }>(`/changelog${qs({ module })}`).then((r) => r.items);
export const fetchAdminChangelog = (o: { module?: string; q?: string }) => apiList<ChangelogEntry>(`/admin/changelog${qs(o)}`);
export const createAdminChangelog = (b: ChangelogInput) => post<ChangelogEntry>("/admin/changelog", b);
export const patchAdminChangelog = (id: string, b: ChangelogInput) => post<ChangelogEntry>(`/admin/changelog/${id}`, b, "PATCH");
export const deleteAdminChangelog = (id: string) => del<null>(`/admin/changelog/${id}`);

/** 서버 연결 상태 — 대시보드 맨 위 띠(api/routes/admin.php GET /admin/system) */
export interface AdminSystem {
  checked_at: string;
  api: { ok: boolean; php: string };
  db: { ok: boolean; ms: number };
  engine: { ok: boolean; online: number; total: number; last_seen: string | null; queued: number; running: number };
  ai: { ok: boolean; jev_today_usd: number };
  mail: { ok: boolean };
  mcp: { ok: boolean; version?: string | null; tools?: number | null };
}
export const fetchSystem = () => apiFetch<AdminSystem>("/admin/system");

/** 서버 자원 — 대시보드 '서버 자원' 카드(api/routes/admin_system.php GET /admin/system/metrics, superadmin 만). 리눅스가 아니면 값이 null */
export type MetricsRange = "24h" | "7d" | "30d";
export interface ServerDisk { path: string; total_gb: number; used_gb: number; free_gb: number }
export interface ServerMetrics {
  checked_at: string;
  range: MetricsRange;
  now: {
    supported: boolean;
    cpu_pct: number | null;
    cores: number | null;
    load: [number, number, number] | null;
    uptime_s: number | null;
    mem: { total_mb: number; used_mb: number; avail_mb: number; swap_total_mb: number; swap_used_mb: number } | null;
    disk: ServerDisk | null;
    data_disk: ServerDisk | null;
    storage_dir: string;
  };
  db: { total_mb: number | null; tables: Array<{ name: string; rows: number; data_mb: number; index_mb: number; total_mb: number }> };
  series: Array<{ at: string; cpu: number | null; load1: number | null; mem: number | null; swap: number | null; disk_gb: number | null; db_mb: number | null }>;
  folders: { sampled_at: string; total_gb: number | null; items: Array<{ name: string; mb: number }> } | null;
  last_sample_at: string | null;
}
export const fetchServerMetrics = (range: MetricsRange) => apiFetch<ServerMetrics>(`/admin/system/metrics?range=${range}`);

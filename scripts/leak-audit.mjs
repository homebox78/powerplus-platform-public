#!/usr/bin/env node
/**
 * leak-audit — 출구 유출 자동 실측 (기획 §13.3·§14.2·§17.1, 설계서 leak-audit)
 *
 * 질문 하나: "비로그인·외부 무료 사용자가 사내 전용(internal)·Pro 전용(pro)·남의 것(private) 자료를
 *            어느 출구로든 볼 수 있는가?" — 답이 0건이어야 사내 출시.
 *
 * 판정 방식
 *  - 로컬(--base 가 127.0.0.1/localhost, .env DATABASE_URL 있음) = DB 대조 모드.
 *    응답에서 public_id·token·id 를 뽑아 DB 의 visibility·owner·status 로 "이 신원이 볼 수 있는가"를 다시 계산하고
 *    (Access::can 과 같은 규칙), 볼 수 없는데 나왔으면 유출로 센다. 응답 모양 추측이 아니다.
 *    신원 = 익명 · 외부 free(개발 로그인 /api/v1/auth/dev, debug·루프백 전용) · staff(대조용).
 *    장표(deck)는 로컬에 작업이 없으면 공유 단계 0·1·3 픽스처 작업 3건을 잠깐 넣고 끝나면 지운다(--no-fixtures 로 끔).
 *  - 운영(--base=https://powerplus.hom2box.com) = 필드 모드(DB 없음). 익명 + LEAK_KEY_FREE(Bearer) [+ LEAK_KEY_STAFF].
 *    응답 안 visibility·status·category 필드와 "staff 로 본 것 − free 로 본 것" 차집합으로 판정한다.
 *    한계: 응답에 등급 필드가 없는 출구(커뮤니티 글 등)는 분류(category)로만 보고, staff 키가 없으면
 *    사내 자료 id 를 몰라 직접 찔러 보기(probe)를 못 한다 — 끝에 한계 목록을 출력한다.
 *  - 비밀 문자열(키·토큰·개인 키·비밀번호 필드)은 모든 응답 본문에서 따로 훑는다.
 *
 * 실행
 *   pnpm leak-audit                                   # 로컬 (PHP 개발 서버 127.0.0.1:8090)
 *   node scripts/leak-audit.mjs --selftest            # 판정 함수 단위 확인(서버·DB 불필요) — 검사기가 진짜 유출을 잡는지
 *   node scripts/leak-audit.mjs --base=http://127.0.0.1:8090 --sample=20 --no-fixtures
 *   LEAK_KEY_FREE=pp_live_… [LEAK_KEY_STAFF=pp_live_…] [LEAK_SHARE_TOKENS=t1,t2] \
 *     node scripts/leak-audit.mjs --base=https://powerplus.hom2box.com
 *   [--mcp-url=https://…/mcp]  powerMCP tools/list → 검색류 도구 결과의 public_id 대조(없으면 건너뜀)
 *
 * 결과: 출구별 표 + storage/leak-audit/<시각>.json (storage/ 는 git 제외). 유출 0 이면 종료 코드 0, 아니면 1.
 * 부작용(로컬): 개발 로그인 사용자 2명 생성(leak-free@example.com·leak-staff@solideos.com), 커뮤니티 글 조회수 +1,
 *               장표 픽스처 넣었다 지움. 유출이 있을 때만 쓰기가 일어나는 POST 탐침(자산 사용 기록 등)이 있다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const BASE = String(args.base || 'http://127.0.0.1:8090').replace(/\/$/, '');
const SAMPLE = Number(args.sample || 15);
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE);
const API = `${BASE}/api/v1`;
const P_BASE = LOCAL ? `${API}/p` : `${BASE}/p`; // 운영은 Apache 가 /p/ 를 PHP 로 넘긴다

// ------------------------------------------------------------------ 판정 규칙 (Access::can 과 같은 규칙)
const VIS_FREE = ['public', 'free'];
/** @param {{userId:number|null, kind:string, plan:string, orgId:number|null, admin?:boolean}} who */
export function canSee(who, res) {
  if (who.admin) return true;
  const owner = res.owner_user_id == null ? null : Number(res.owner_user_id);
  const isOwner = owner !== null && who.userId !== null && who.userId === owner;
  const vis = res.visibility ?? 'internal';
  const pro = who.plan === 'pro' || who.plan === 'team' || who.plan === 'staff';
  switch (vis) {
    case 'public': case 'free': return true;
    case 'pro': return pro || isOwner;
    case 'partner': return who.kind === 'staff' || isOwner || (who.orgId != null && Number(res.org_id) === who.orgId);
    case 'internal': return who.kind === 'staff' || isOwner;
    case 'private': return isOwner;
    default: return false;
  }
}
/** 응답 상태가 "내용을 내줬다"인가. 3xx = 파일로 보내 주는 리다이렉트(옛 서버 파일)도 내준 것. */
export const served = (status) => (status >= 200 && status < 400 && status !== 204) || status === 204;
const SECRET_RES = [
  [/pp_(live|test|worker)_[A-Za-z0-9_-]{12,}/, 'API·워커 키'],
  [/sk-or-v1-[A-Za-z0-9]{16,}/, 'OpenRouter 키'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, '개인 키'],
  [/"(password|passwd|client_secret|api_secret|secret_key|key_enc|key_hash|otp_hash|code_hash)"\s*:\s*"[^"]{4,}"/i, '비밀 필드'],
];
export function scanSecrets(text) {
  const out = [];
  for (const [re, label] of SECRET_RES) {
    const m = String(text).match(re);
    if (m) out.push(`${label}: ${m[0].slice(0, 24)}…`);
  }
  return out;
}

// 유출 기록
const findings = []; // {exit, who, url, ref, why, sev}  sev: content | id | pii | secret | meta(경고, 총계 제외)
const stats = new Map(); // key exit|who → {req, leak, ex}
const notes = [];
const limits = [];
function tally(exit, who, n = 1) {
  const k = `${exit}\u0000${who}`;
  const s = stats.get(k) ?? { exit, who, req: 0, leak: 0, warn: 0, ex: '' };
  s.req += n;
  stats.set(k, s);
  return s;
}
export function leak(exit, who, url, ref, why, sev = 'content') {
  findings.push({ exit, who, url, ref, why, sev });
  const s = tally(exit, who, 0);
  if (sev === 'meta') s.warn++; else { s.leak++; if (!s.ex) s.ex = String(ref ?? ''); }
}

// ------------------------------------------------------------------ HTTP
class Client {
  constructor(name, who, { cookie = null, bearer = null } = {}) {
    this.name = name; this.who = who; this.cookie = cookie; this.bearer = bearer;
  }
  async req(method, url, body) {
    const h = { 'X-Requested-With': 'leak-audit', Accept: 'application/json' };
    if (this.cookie) h.Cookie = this.cookie;
    if (this.bearer) h.Authorization = `Bearer ${this.bearer}`;
    if (body !== undefined) h['Content-Type'] = 'application/json';
    let r;
    try {
      r = await fetch(url.startsWith('http') ? url : API + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    } catch (e) {
      return { status: 0, text: String(e), json: null, headers: new Headers() };
    }
    const sc = r.headers.get('set-cookie');
    if (sc && /pp_sid=/.test(sc) && !this.bearer) this.cookie = sc.match(/pp_sid=[^;]+/)[0];
    const ct = r.headers.get('content-type') || '';
    let text = '';
    if (/json|text|html|xml|markdown/.test(ct)) text = await r.text(); else { await r.arrayBuffer().catch(() => null); }
    let json = null;
    if (/json/.test(ct)) { try { json = JSON.parse(text); } catch { /* */ } }
    for (const s of scanSecrets(text)) leak('비밀 문자열', this.name, `${method} ${url}`, '', s, 'secret');
    return { status: r.status, text, json, headers: r.headers, location: r.headers.get('location') };
  }
  get(u) { return this.req('GET', u); }
  post(u, b = {}) { return this.req('POST', u, b); }
}

// ------------------------------------------------------------------ DB (로컬)
let db = null;
async function openDb() {
  const envFile = path.join(ROOT, '.env');
  if (!fs.existsSync(envFile)) return null;
  const env = Object.fromEntries(fs.readFileSync(envFile, 'utf8').split(/\r?\n/).filter((l) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]));
  const url = process.env.DATABASE_URL || env.DATABASE_URL;
  if (!url) return null;
  const mysql = (await import('mysql2/promise')).default;
  return mysql.createConnection(url);
}
const q = async (sql, p = []) => (await db.query(sql, p))[0];
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (a, n) => shuffle([...a]).slice(0, n);

async function whoOf(client) {
  const r = await client.get('/me');
  const d = r.json?.data ?? {};
  const user = d.user ?? null;
  let userId = null;
  if (db && user) {
    const row = (await q('SELECT id FROM core_users WHERE public_id = ? OR email = ? LIMIT 1', [user.id ?? '', user.email ?? '']))[0];
    userId = row ? Number(row.id) : null;
  }
  return { userId, kind: d.kind ?? 'anon', plan: d.plan ?? 'free', orgId: d.org_id ?? d.orgId ?? null, admin: (d.roles ?? []).some((x) => x === 'admin' || x === 'superadmin'), email: user?.email ?? null };
}

// ------------------------------------------------------------------ 출구 검사들
const allowedVisField = (who) => [...VIS_FREE, ...(['pro', 'team', 'staff'].includes(who.plan) ? ['pro'] : []), ...(who.kind === 'staff' ? ['partner', 'internal'] : [])];

/** 응답 목록 안 자산 id 대조 */
export function judgeAssetIds(exit, c, url, ids, assets, field) {
  for (const it of ids) {
    const pid = typeof it === 'string' ? it : it.id;
    if (assets) {
      const row = assets.get(pid);
      if (!row) continue;
      if (!canSee(c.who, row)) leak(exit, c.name, url, pid, `${row.visibility}${row.owner_user_id ? '·owner ' + row.owner_user_id : ''} 자산이 목록에 나옴`);
    } else if (field && it.visibility && !allowedVisField(c.who).includes(it.visibility)) {
      leak(exit, c.name, url, pid, `visibility=${it.visibility} 가 목록에 나옴(필드 판정)`);
    }
  }
}

async function auditAssets(clients, ctx) {
  const { assets } = ctx;
  for (const c of clients) {
    // 목록 — 카테고리별 끝까지(최대 40쪽)
    const cats = ['', 'icon', 'photo', 'illust', 'diagram', 'logo', 'ppt', 'mockup_sample'];
    for (const cat of cats) {
      for (let page = 1; page <= 40; page++) {
        const url = `/assets/items?limit=120&page=${page}${cat ? '&category=' + cat : ''}`;
        const r = await c.get(url); tally('자산 목록', c.name);
        const rows = r.json?.data ?? [];
        judgeAssetIds('자산 목록', c, url, rows, assets, true);
        if (c.name === 'staff') rows.forEach((x) => ctx.staffSeen.set(x.id, x));
        if (c.name !== 'staff' && page === 1 && !cat && r.json?.meta?.hidden > 0) {
          leak('자산 목록', c.name, url, '', `meta.hidden=${r.json.meta.hidden} — 볼 수 없는 자산 수(사내 전용 포함)가 숫자로 나옴`, 'meta');
        }
        if (rows.length < 120) break;
      }
    }
    // 검색 — 사내 전용·목업 샘플에 흔한 낱말
    for (const term of ['배너', '로고', '제안서', '팝업', '기관장', 'internal', '서명']) {
      const url = `/assets/items?limit=120&q=${encodeURIComponent(term)}`;
      const r = await c.get(url); tally('자산 검색', c.name);
      judgeAssetIds('자산 검색', c, url, r.json?.data ?? [], assets, true);
    }
    // 카테고리 건수
    {
      const r = await c.get('/assets/categories'); tally('자산 카테고리 건수', c.name);
      for (const x of r.json?.data ?? []) {
        if (x.id === 'mockup_sample' && c.who.kind !== 'staff' && !c.who.admin) leak('자산 카테고리 건수', c.name, '/assets/categories', 'mockup_sample', '목업 샘플 분류가 보임', 'id');
        if (assets) {
          const vis = [...assets.values()].filter((a) => a.category === x.id && canSee(c.who, a)).length;
          if (x.count > vis) leak('자산 카테고리 건수', c.name, '/assets/categories', x.id, `count ${x.count} > 볼 수 있는 ${vis}`, 'id');
        }
        if (c.name !== 'staff' && x.total > x.count) {
          leak('자산 카테고리 건수', c.name, '/assets/categories', x.id, `total=${x.total}(사내 전용 포함 전체 수)가 나옴`, 'meta');
        }
      }
    }
    // 세트 — 표지·건수
    {
      const r = await c.get('/assets/sets'); tally('자산 세트', c.name);
      for (const s of r.json?.data ?? []) {
        const cover = (s.cover_url || '').match(/items\/([a-z0-9]{16})\//)?.[1];
        if (cover && assets && assets.get(cover) && !canSee(c.who, assets.get(cover))) {
          leak('자산 세트', c.name, '/assets/sets', cover, `세트 「${s.name}」 표지가 ${assets.get(cover).visibility} 자산 id`, 'id');
        }
        if (!cover && !assets && c.name !== 'staff') { /* 필드 모드: 표지 id 를 probe 목록에 */ }
        if (s.total > s.count && c.name !== 'staff') leak('자산 세트', c.name, '/assets/sets', s.id, `total=${s.total} > count=${s.count} (세트 전체 수 노출)`, 'meta');
      }
      if (c.name !== 'staff') for (const s of r.json?.data ?? []) {
        const cover = (s.cover_url || '').match(/items\/([a-z0-9]{16})\//)?.[1];
        if (cover) ctx.coverProbe.add(cover);
      }
    }
    // 설치 안내·내 요청
    { const r = await c.get('/assets/setup'); tally('자산 설치 안내', c.name); if (!served(r.status)) notes.push(`설치 안내 ${c.name} ${r.status}`); }
    if (c.name !== 'anon' && db) {
      const r = await c.get('/assets/requests'); tally('자산 요청', c.name);
      for (const x of r.json?.data ?? []) {
        const row = (await q('SELECT user_id FROM asset_requests WHERE public_id = ?', [x.id]))[0];
        if (row && Number(row.user_id) !== c.who.userId) leak('자산 요청', c.name, '/assets/requests', x.id, '남의 자료 요청이 나옴', 'content');
      }
    }
  }

  // 직접 찔러 보기 — 등급별 표본
  let probes = [];
  if (assets) {
    const by = (f) => [...assets.values()].filter(f);
    probes = [
      ...pick(by((a) => a.visibility === 'internal' && a.category !== 'mockup_sample'), SAMPLE),
      ...pick(by((a) => a.category === 'mockup_sample'), SAMPLE),
      ...pick(by((a) => a.visibility === 'internal' && a.category === 'ppt'), SAMPLE),
      ...pick(by((a) => a.visibility === 'pro'), SAMPLE),
      ...pick(by((a) => a.visibility === 'pro' && a.category === 'ppt'), Math.ceil(SAMPLE / 2)),
      ...pick(by((a) => a.visibility === 'private' || a.visibility === 'partner'), SAMPLE),
      ...pick(by((a) => a.visibility === 'public'), Math.ceil(SAMPLE / 3)),
      ...[...ctx.coverProbe].map((p) => assets.get(p)).filter(Boolean),
    ];
  } else {
    probes = [...ctx.staffSeen.values()].filter((x) => !VIS_FREE.includes(x.visibility)).slice(0, SAMPLE * 3).map((x) => ({ public_id: x.id, visibility: x.visibility, category: x.category }));
    if (!probes.length) limits.push('자산 직접 찔러 보기: staff 키(LEAK_KEY_STAFF)가 없어 사내·Pro 자산 id 를 몰라 건너뜀');
  }
  const seenProbe = new Set();
  for (const a of probes) {
    if (seenProbe.has(a.public_id)) continue; seenProbe.add(a.public_id);
    for (const c of clients) {
      const ok = canSee(c.who, a);
      const kinds = ['thumb', 'original', ...(a.category === 'ppt' ? ['slide'] : [])];
      for (const [exit, url] of [['자산 상세', `/assets/items/${a.public_id}`], ...kinds.map((k) => [`자산 파일(${k})`, `/assets/items/${a.public_id}/file/${k}`])]) {
        const r = await c.get(url); tally(exit, c.name);
        if (!ok && served(r.status)) leak(exit, c.name, url, a.public_id, `${a.visibility} 자산이 ${r.status}${r.location ? ' → ' + r.location : ''}`);
        if (ok && r.status >= 400 && r.status !== 404 && exit === '자산 상세') notes.push(`과잉 차단? ${c.name} ${url} ${r.status}`);
      }
      // 쓰기 출구: 사용 기록(볼 수 없는 자산이면 막혀야)
      if (!ok && c.name !== 'anon') {
        const url = `/assets/items/${a.public_id}/use`;
        const r = await c.post(url, { channel: 'web' }); tally('자산 사용 기록(POST)', c.name);
        if (r.status >= 200 && r.status < 300) leak('자산 사용 기록(POST)', c.name, url, a.public_id, '볼 수 없는 자산에 사용 기록이 남음(존재 확인 출구)', 'id');
      }
      // 로고 찾기(장표 모듈)
      if (a.category === 'logo') {
        const url = `/deck/logos/file?p=${a.public_id}/thumb.png`;
        const r = await c.get(url); tally('로고 파일(deck)', c.name);
        if (!ok && served(r.status)) leak('로고 파일(deck)', c.name, url, a.public_id, `${a.visibility} 로고가 ${r.status}`);
      }
    }
  }
  // 로고 목록
  for (const c of clients) {
    const r = await c.get('/deck/logos?q='); tally('로고 목록(deck)', c.name);
    const items = r.json?.data?.data ?? r.json?.data ?? [];
    judgeAssetIds('로고 목록(deck)', c, '/deck/logos', Array.isArray(items) ? items : [], assets, false);
  }
}

async function auditCommunity(clients, ctx) {
  let posts = null;
  if (db) posts = new Map((await q('SELECT public_id, visibility, owner_user_id, org_id, category, title FROM comm_posts WHERE deleted_at IS NULL')).map((p) => [p.public_id, p]));
  for (const c of clients) {
    const r0 = await c.get('/community/categories'); tally('커뮤니티 분류', c.name);
    const d0 = r0.json?.data ?? {};
    if ((d0.items ?? []).some((x) => x.id === 'staff') && c.who.kind !== 'staff' && !c.who.admin) leak('커뮤니티 분류', c.name, '/community/categories', 'staff', '사내 게시판 분류가 보임', 'id');
    if (posts) {
      const vis = [...posts.values()].filter((p) => canSee(c.who, p)).length;
      if ((d0.total ?? 0) > vis) leak('커뮤니티 분류', c.name, '/community/categories', '', `total ${d0.total} > 볼 수 있는 ${vis}`, 'id');
    }
    for (const qs of ['', '?category=staff', '?sort=popular', '?q=' + encodeURIComponent('사내')]) {
      for (let page = 1; page <= 20; page++) {
        const url = `/community/posts${qs}${qs ? '&' : '?'}limit=50&page=${page}`;
        const r = await c.get(url); tally('커뮤니티 글 목록', c.name);
        const rows = r.json?.data ?? [];
        for (const p of rows) {
          if (c.name === 'staff') ctx.staffPosts.set(p.id, p);
          const row = posts?.get(p.id);
          if (row ? !canSee(c.who, row) : (p.category === 'staff' && c.who.kind !== 'staff')) leak('커뮤니티 글 목록', c.name, url, p.id, `${row?.visibility ?? 'category=staff'} 글이 목록에 나옴`);
        }
        if (rows.length < 50) break;
      }
    }
  }
  // 직접 찔러 보기 + 쓰기 출구
  const targets = posts ? [...posts.values()].filter((p) => p.visibility !== 'public') : [...ctx.staffPosts.values()].filter((p) => p.category === 'staff').map((p) => ({ public_id: p.id, visibility: 'internal' }));
  if (!targets.length) notes.push('커뮤니티: 사내 전용 글이 없어 직접 찔러 보기 생략' + (posts ? '' : '(필드 모드 — staff 키 필요)'));
  for (const p of targets) {
    for (const c of clients) {
      const ok = canSee(c.who, p);
      const url = `/community/posts/${p.public_id}`;
      const r = await c.get(url); tally('커뮤니티 글 상세', c.name);
      if (!ok && served(r.status)) leak('커뮤니티 글 상세', c.name, url, p.public_id, `${p.visibility} 글 본문이 ${r.status}`);
      if (!ok && c.name !== 'anon') {
        for (const [exit, u, b] of [['커뮤니티 댓글(POST)', `${url}/comments`, { body: 'leak-audit' }], ['커뮤니티 좋아요(POST)', `${url}/like`, {}]]) {
          const w = await c.post(u, b); tally(exit, c.name);
          if (w.status >= 200 && w.status < 300) leak(exit, c.name, u, p.public_id, `${p.visibility} 글에 쓰기가 됨`, 'id');
        }
      }
    }
  }
}

async function auditSaved(clients, ctx) {
  const tokens = new Set((process.env.LEAK_SHARE_TOKENS || '').split(',').map((s) => s.trim()).filter(Boolean));
  let cols = [];
  if (db) {
    cols = await q('SELECT id, public_id, owner_user_id, visibility, share_token FROM core_collections');
    cols.filter((x) => x.share_token).forEach((x) => tokens.add(x.share_token));
  } else if (!tokens.size) limits.push('공유 컬렉션 /c/{token}: 토큰을 몰라(LEAK_SHARE_TOKENS) 건너뜀');
  const assets = ctx.assets;
  for (const tok of tokens) {
    const col = cols.find((x) => x.share_token === tok);
    for (const c of clients) {
      const url = `/c/${tok}`;
      const r = await c.get(url); tally('공유 컬렉션 /c', c.name);
      if (col && col.visibility !== 'public' && served(r.status)) leak('공유 컬렉션 /c', c.name, url, tok, '공유를 끈 컬렉션이 열림');
      for (const it of r.json?.data?.items ?? []) {
        const card = it.card ?? {};
        const ref = it.ref;
        const img = (card.image_url || '').match(/items\/([a-z0-9]{16})\//)?.[1];
        let row = null;
        if (it.type === 'asset' && assets) row = assets.get(ref) ?? assets.get(img);
        if (it.type === 'post' && db && ref) row = (await q('SELECT visibility, owner_user_id, org_id FROM comm_posts WHERE public_id = ?', [ref]))[0];
        if (row && !canSee(c.who, row)) {
          if (!card.locked) leak('공유 컬렉션 /c', c.name, url, ref, `${row.visibility} ${it.type} 카드가 잠기지 않음(제목 「${card.title}」)`);
          if (ref) leak('공유 컬렉션 /c', c.name, url, ref, `잠긴 ${it.type} 의 식별자(ref)가 나옴`, 'id');
          if (card.image_url) leak('공유 컬렉션 /c', c.name, url, ref, `잠긴 ${it.type} 의 이미지 주소가 나옴`, 'id');
        }
        if (!db && it.type === 'asset' && card.locked === false && img && ctx.staffSeen.get(img) && !allowedVisField(c.who).includes(ctx.staffSeen.get(img).visibility)) {
          leak('공유 컬렉션 /c', c.name, url, img, '필드 판정: 볼 수 없는 등급 자산이 잠기지 않음');
        }
      }
    }
  }
  for (const c of clients) {
    { const r = await c.get(`/c/${'x'.repeat(22)}`); tally('공유 컬렉션 /c', c.name); if (served(r.status)) leak('공유 컬렉션 /c', c.name, '/c/xxx', '', `없는 토큰이 ${r.status}`); }
    // 남의 컬렉션 직접
    for (const col of cols.filter((x) => Number(x.owner_user_id) !== c.who.userId)) {
      const url = `/collections/${col.public_id}`;
      const r = await c.get(url); tally('컬렉션 상세', c.name);
      if (served(r.status)) leak('컬렉션 상세', c.name, url, col.public_id, '남의 컬렉션이 열림');
    }
    if (c.name !== 'anon') {
      const r = await c.get('/saved?full=1'); tally('내 저장', c.name);
      if (db) {
        const mine = new Set((await q('SELECT i.item_public_id p FROM core_collection_items i JOIN core_collections k ON k.id = i.collection_id WHERE k.owner_user_id = ?', [c.who.userId ?? 0])).map((x) => x.p));
        for (const [t, ids] of Object.entries(r.json?.data?.ids ?? {})) for (const id of ids) if (!mine.has(id)) leak('내 저장', c.name, '/saved', id, `남의 저장 항목(${t})이 나옴`);
      }
      // 볼 수 없는 자산 저장 시도 → 404 여야
      const target = assets ? [...assets.values()].find((a) => !canSee(c.who, a)) : null;
      if (target) {
        const w = await c.post('/saved/toggle', { type: 'asset', id: target.public_id }); tally('저장 토글(POST)', c.name);
        if (w.status >= 200 && w.status < 300) {
          leak('저장 토글(POST)', c.name, '/saved/toggle', target.public_id, `${target.visibility} 자산을 저장할 수 있음(존재 확인 출구)`, 'id');
          await c.post('/saved/toggle', { type: 'asset', id: target.public_id }); // 되돌림
        }
      }
    }
  }
}

async function auditMock(clients, ctx) {
  let gal = null; let mk = [];
  if (db) {
    gal = new Map((await q('SELECT g.id, g.status, g.owner_user_id, m.token FROM mock_gallery g JOIN mock_mockups m ON m.id = g.mockup_id')).map((g) => [Number(g.id), g]));
    mk = await q('SELECT token, public_id, owner_user_id, visibility, published_at, expires_at > NOW(3) AS live, deleted_at FROM mock_mockups');
  }
  for (const c of clients) {
    for (const sort of ['popular', 'new', 'score']) {
      for (let page = 1; page <= 20; page++) {
        const url = `/mock/gallery?sort=${sort}&limit=60&page=${page}`;
        const r = await c.get(url); tally('시안 갤러리 목록', c.name);
        const rows = r.json?.data ?? [];
        for (const g of rows) {
          const row = gal?.get(g.id);
          const st = row?.status ?? g.status;
          const own = row && Number(row.owner_user_id) === c.who.userId;
          if (st !== 'shared' && !own && !c.who.admin) leak('시안 갤러리 목록', c.name, url, g.id, `status=${st} 시안이 공개 목록에 나옴`);
          if (g.unlocked && !own && !c.who.admin && c.name === 'anon') leak('시안 갤러리 목록', c.name, url, g.id, '익명에게 unlocked=true');
        }
        if (rows.length < 60) break;
      }
    }
    if (c.name !== 'anon') {
      const url = '/mock/gallery?view=mine&all=1&limit=60';
      const r = await c.get(url); tally('시안 갤러리 내 것', c.name);
      for (const g of r.json?.data ?? []) {
        const row = gal?.get(g.id);
        if (row && Number(row.owner_user_id) !== c.who.userId && !c.who.admin) leak('시안 갤러리 내 것', c.name, url, g.id, '남의 시안이 내 목록에 나옴(all=1)');
      }
      const r2 = await c.get('/mock/mockups?limit=100'); tally('내 시안 목록', c.name);
      for (const m of r2.json?.data ?? []) {
        const row = mk.find((x) => x.token === m.token || x.public_id === m.id);
        if (row && Number(row.owner_user_id) !== c.who.userId) leak('내 시안 목록', c.name, '/mock/mockups', m.token ?? m.id, '남의 시안이 나옴');
      }
    }
  }
  if (!db) { limits.push('시안 직접 찔러 보기(study·hidden·비공개 초안 /p): 필드 모드에서는 id·토큰을 몰라 목록 검사만 함'); return; }
  const hiddenG = pick([...gal.values()].filter((g) => g.status !== 'shared'), SAMPLE);
  const sharedG = [...gal.values()].filter((g) => g.status === 'shared');
  for (const c of clients) {
    for (const g of hiddenG) {
      const own = Number(g.owner_user_id) === c.who.userId;
      for (const [exit, url] of [['시안 갤러리 상세', `/mock/gallery/${g.id}`], ['시안 갤러리 썸네일', `/mock/gallery/${g.id}/thumb`], ['시안 갤러리 HTML', `/mock/gallery/${g.id}/html`]]) {
        const r = await c.get(url); tally(exit, c.name);
        if (!own && !c.who.admin && served(r.status)) leak(exit, c.name, url, g.id, `status=${g.status} 시안이 ${r.status}`);
      }
    }
    for (const g of sharedG) {
      const own = Number(g.owner_user_id) === c.who.userId;
      const unlocked = db && c.who.userId ? (await q('SELECT 1 x FROM mock_gallery_unlocks WHERE gallery_id = ? AND user_id = ?', [g.id, c.who.userId])).length > 0 : false;
      const url = `/mock/gallery/${g.id}/html`;
      const r = await c.get(url); tally('시안 갤러리 HTML', c.name);
      if (!own && !unlocked && !c.who.admin && served(r.status)) leak('시안 갤러리 HTML', c.name, url, g.id, '포인트로 열지 않은 시안 HTML 이 나옴');
    }
    for (const m of pick(mk.filter((x) => Number(x.owner_user_id) !== c.who.userId), SAMPLE * 2)) {
      const visible = canSee(c.who, m);
      for (const [exit, url] of [['시안 상세', `/mock/mockups/${m.token}`], ['시안 미리보기 HTML', `/mock/mockups/${m.token}/html`], ['시안 썸네일', `/mock/mockups/${m.token}/thumb`]]) {
        const r = await c.get(url); tally(exit, c.name);
        if (!visible && served(r.status)) {
          const shared = exit === '시안 썸네일' && [...gal.values()].some((g) => g.token === m.token && g.status === 'shared');
          if (!shared) leak(exit, c.name, url, m.token, `${m.visibility} 시안(남의 것)이 ${r.status}`);
        }
      }
      const url = `${P_BASE}/${m.token}`;
      const r = await c.get(url); tally('시안 게시 /p', c.name);
      const allowed = m.published_at && m.live && !m.deleted_at;
      if (!allowed && served(r.status)) leak('시안 게시 /p', c.name, url, m.token, '게시 안 했거나 만료·삭제된 시안이 열림');
    }
    const r = await c.get(`${P_BASE}/${'z'.repeat(32)}`); tally('시안 게시 /p', c.name);
    if (served(r.status)) leak('시안 게시 /p', c.name, '/p/zzz', '', `없는 토큰이 ${r.status}`);
  }
  // 정적 확인: 열람권을 산 뒤 공유가 내려간 시안 — HTML 경로가 공유 여부(gCanSee)를 먼저 보는지 코드로 확인한다
  const mockSrc = fs.readFileSync(path.join(ROOT, 'api/routes/mock.php'), 'utf8');
  const htmlRoute = mockSrc.slice(mockSrc.indexOf("'/mock/gallery/{id}/html'"), mockSrc.indexOf("'/mock/gallery/{id}'"));
  const guarded = htmlRoute.includes('$gCanSee(');
  const stale = await q("SELECT COUNT(*) n FROM mock_gallery_unlocks u JOIN mock_gallery g ON g.id = u.gallery_id WHERE g.status <> 'shared' AND u.user_id <> g.owner_user_id");
  if (!guarded && Number(stale[0].n) > 0) leak('시안 갤러리 HTML', '(데이터)', '/mock/gallery/{id}/html', '', `공유가 내려간 시안 ${stale[0].n}건에 남의 열람권이 남아 HTML 이 열림`);
}

async function auditDeck(clients, ctx) {
  if (!db) { limits.push('장표 작업·공유 링크: 필드 모드에서는 작업 id 를 몰라 목록(/deck/jobs)만 확인'); }
  const fixtures = [];
  const staffClient = clients.find((c) => c.name === 'staff');
  if (db && !args['no-fixtures'] && staffClient?.who.email) {
    const owner = staffClient.who.email;
    for (const sh of [0, 1, 3]) {
      const id = `ffffffffffff0${sh}0${'a'.repeat(1)}`.slice(0, 16).replace(/[^0-9a-f]/g, 'f');
      await q('DELETE FROM deck_jobs WHERE id = ?', [id]);
      await q("INSERT INTO deck_jobs (id, email, title, filename, size, status, shared, created_at, note) VALUES (?, ?, ?, 'leak-audit.pptx', 1, 'done', ?, NOW(), 'leak-audit 비공개 메모')", [id, owner, `leak-audit 픽스처 shared=${sh}`, sh]);
      const dir = path.join(ROOT, 'storage', 'deck', 'jobs', id);
      for (const [k, n] of [['source', 'src.pptx'], ['after', 's01.png'], ['result', 'out.pptx']]) {
        fs.mkdirSync(path.join(dir, k), { recursive: true });
        fs.writeFileSync(path.join(dir, k, n), 'leak-audit');
      }
      fixtures.push({ id, shared: sh, email: owner, dir });
    }
    notes.push(`장표 픽스처 ${fixtures.length}건(공유 0·1·3, 주인 ${owner}) 넣고 검사 뒤 지움`);
  }
  try {
    let jobs = fixtures;
    if (db) jobs = [...jobs, ...(await q('SELECT id, shared, email FROM deck_jobs WHERE id NOT LIKE ?', ['ffffffffffff%'])).slice(0, SAMPLE)];
    for (const c of clients) {
      // 내 작업 목록 / 관리자 전체 목록
      if (c.name !== 'anon') {
        for (const url of ['/deck/jobs', '/deck/jobs?all=1']) {
          const r = await c.get(url); tally('장표 작업 목록', c.name);
          for (const j of r.json?.data ?? []) if (j.email && j.email !== c.who.email && !c.who.admin) leak('장표 작업 목록', c.name, url, j.id, '남의 작업이 목록에 나옴');
        }
      }
      for (const j of jobs) {
        const own = c.who.email && j.email === c.who.email;
        const logged = c.name !== 'anon';
        const canView = own || c.who.admin || (Number(j.shared) > 0 && (logged || Number(j.shared) === 3));
        const url = `/deck/jobs/${j.id}`;
        const r = await c.get(url); tally('장표 작업 상세', c.name);
        if (!canView && served(r.status)) leak('장표 작업 상세', c.name, url, j.id, `shared=${j.shared} 남의 작업이 ${r.status}`);
        if (served(r.status) && !own && !c.who.admin) {
          const d = r.json?.data ?? {};
          if (d.email && d.email !== c.who.email) leak('장표 작업 상세', c.name, url, j.id, `작업 주인 이메일(${d.email.replace(/^(.).*@/, '$1***@')})이 공유받은 사람에게 나옴`, 'pii');
          if (d.note) leak('장표 작업 상세', c.name, url, j.id, '주인 전용 요청 사항(note)이 나옴');
        }
        for (const [kind, name, ownerOnly] of [['source', 'src.pptx', true], ['result', 'out.pptx', true], ['after', 's01.png', false]]) {
          const fu = `/deck/jobs/${j.id}/files/${kind}/${name}`;
          const f = await c.get(fu); tally(`장표 파일(${kind})`, c.name);
          const allowed = own || c.who.admin || (!ownerOnly && canView);
          if (!allowed && served(f.status)) leak(`장표 파일(${kind})`, c.name, fu, j.id, `shared=${j.shared} 작업의 ${kind} 파일이 ${f.status}`);
        }
        for (const sub of ['plan.md', 'export.zip', 'fonts.zip', 'script.html', 'events', 'comments']) {
          const su = `/deck/jobs/${j.id}/${sub}`;
          const s = await c.get(su); tally('장표 산출물·기록', c.name);
          const allowed = own || c.who.admin || ((sub === 'events' || sub === 'comments') && logged && canView);
          if (!allowed && served(s.status)) leak('장표 산출물·기록', c.name, su, j.id, `${sub} 가 ${s.status}`);
        }
      }
      // 관리자·엔진 출구
      for (const u of ['/deck/admin/usage', '/deck/reference.zip', '/deck/worker/ping', '/deck/worker/reference.zip', '/deck/worker/reference.info']) {
        const r = await c.get(u); tally('장표 관리자·엔진', c.name);
        if (!c.who.admin && served(r.status)) leak('장표 관리자·엔진', c.name, u, '', `${r.status}`);
      }
      { // AI 설정: 관리자가 아니면 키 원문·관리 설정이 없어야
        const r = await c.get('/deck/ai/settings'); tally('장표 AI 설정', c.name);
        if (!c.who.admin && served(r.status) && /"admin"\s*:\s*\{/.test(r.text) && /key/i.test(r.text)) leak('장표 AI 설정', c.name, '/deck/ai/settings', '', '관리자 설정 블록이 나옴(확인 필요)', 'meta');
      }
    }
  } finally {
    for (const f of fixtures) {
      await q('DELETE FROM deck_job_files WHERE job_id = ?', [f.id]).catch(() => null);
      await q('DELETE FROM deck_job_events WHERE job_id = ?', [f.id]).catch(() => null);
      await q('DELETE FROM deck_jobs WHERE id = ?', [f.id]);
      fs.rmSync(f.dir, { recursive: true, force: true });
    }
  }
}

async function auditCore(clients, ctx) {
  let keys = [];
  if (db) keys = await q('SELECT public_id, user_id FROM core_api_keys WHERE revoked_at IS NULL');
  for (const c of clients) {
    // 관리자 API
    for (const u of ['/admin/stats', '/admin/contacts', '/admin/removals', '/admin/users']) {
      const r = await c.get(u); tally('관리자 API', c.name);
      if (!c.who.admin && served(r.status)) leak('관리자 API', c.name, u, '', `${r.status}`);
    }
    for (const [u, b] of [['/admin/users/1/roles', { role: 'admin' }]]) {
      const r = await c.post(u, b); tally('관리자 API', c.name);
      if (!c.who.admin && r.status >= 200 && r.status < 300) leak('관리자 API', c.name, u, '', `쓰기가 ${r.status}`);
    }
    // 알림
    if (c.name !== 'anon') {
      const r = await c.get('/notifications?limit=50'); tally('알림', c.name);
      if (db) for (const n of r.json?.data?.items ?? []) {
        const row = (await q('SELECT user_id FROM core_notifications WHERE id = ?', [n.id]))[0];
        if (row && Number(row.user_id) !== c.who.userId) leak('알림', c.name, '/notifications', n.id, '남의 알림이 나옴');
      }
    } else {
      const r = await c.get('/notifications'); tally('알림', c.name);
      if (served(r.status)) leak('알림', c.name, '/notifications', '', `익명에게 ${r.status}`);
      const u = await c.get('/notifications/unread'); tally('알림', c.name);
      if ((u.json?.data?.count ?? 0) > 0) leak('알림', c.name, '/notifications/unread', '', '익명에게 안 읽은 수가 나옴');
    }
    // 키
    if (c.name !== 'anon') {
      const r = await c.get('/keys'); tally('API 키', c.name);
      if (db) for (const k of r.json?.data ?? []) {
        const row = keys.find((x) => x.public_id === k.id);
        if (row && Number(row.user_id) !== c.who.userId) leak('API 키', c.name, '/keys', k.id, '남의 키가 목록에 나옴');
      }
      for (const k of pick(keys.filter((x) => Number(x.user_id) !== c.who.userId), 5)) {
        for (const u of [`/keys/${k.public_id}/reveal`, `/keys/${k.public_id}/usage`]) {
          const rr = await c.get(u); tally('API 키', c.name);
          if (served(rr.status)) leak('API 키', c.name, u, k.public_id, `남의 키가 ${rr.status}`);
        }
      }
    }
    // 삭제요청 조회(이메일 불일치) · 요금제(숨김 플래그)
    {
      if (db) {
        const rm = (await q('SELECT no FROM core_removal_requests LIMIT 3'));
        for (const x of rm) {
          const u = `/removal/${x.no}?email=leak-audit%40example.com`;
          const r = await c.get(u); tally('삭제요청 조회', c.name);
          if (served(r.status)) leak('삭제요청 조회', c.name, u, x.no, '이메일 불일치인데 열림');
        }
      }
      const p = await c.get('/plans'); tally('요금제(숨김 플래그)', c.name);
      if (served(p.status) && !c.who.admin && c.name !== 'staff') leak('요금제(숨김 플래그)', c.name, '/plans', '', 'billing.visible 꺼짐인데 요금제가 나옴(확인 필요)', 'meta');
    }
  }
}

async function auditStatic(anon) {
  if (LOCAL) { notes.push('정적 파일·.htaccess 차단(.env·api/src·db·storage·robots·sitemap)은 Apache 운영에서만 의미가 있어 로컬은 건너뜀'); return; }
  const deny = ['/.env', '/api/config.php', '/api/src/bootstrap.php', '/api/routes/core.php', '/api/public/index.php.bak', '/db/schema.sql', '/scripts/deploy.sh', '/storage/', '/storage/deck/', '/mydev/CLAUDE.md', '/.git/config', '/README.md', '/docs/ARCHITECTURE.md'];
  for (const u of deny) {
    const r = await anon.get(BASE + u); tally('정적·민감 경로', 'anon');
    const html = /<!doctype html/i.test(r.text) && /id="root"|<div id=/i.test(r.text); // SPA 폴백 = 실제 파일 아님
    if (r.status === 200 && !html) leak('정적·민감 경로', 'anon', u, '', '200 으로 내용이 나옴');
  }
  for (const u of ['/robots.txt', '/sitemap.xml', '/rss.xml', '/feed']) {
    const r = await anon.get(BASE + u); tally('사이트맵·robots·RSS', 'anon');
    if (r.status === 200 && !/<!doctype html/i.test(r.text)) {
      for (const m of r.text.matchAll(/\/(assets|community|mock|deck)\/[^\s<"]*/g)) notes.push(`${u} 에 경로: ${m[0]}`);
    }
  }
}

async function auditMcp(clients) {
  const url = args['mcp-url'];
  const exists = fs.existsSync(path.join(ROOT, 'packages', 'mcp'));
  if (!url) { limits.push(exists ? 'powerMCP: packages/mcp 는 있으나 --mcp-url 이 없어 건너뜀' : 'powerMCP: packages/mcp 가 아직 없어 건너뜀(생기면 --mcp-url 로)'); return; }
  const key = process.env.LEAK_KEY_FREE;
  if (!key) { limits.push('powerMCP: LEAK_KEY_FREE 가 없어 건너뜀'); return; }
  const c = new Client('free(key)', clients.find((x) => x.name === 'free')?.who ?? { kind: 'external', plan: 'free', userId: null }, { bearer: key });
  const call = async (method, params) => (await c.req('POST', url, { jsonrpc: '2.0', id: Math.random(), method, params })).json;
  const list = await call('tools/list', {}); tally('powerMCP', 'free(key)');
  for (const t of list?.result?.tools ?? []) {
    if (!/search|list|get|find|pick|kit|set/i.test(t.name)) continue;
    const res = await call('tools/call', { name: t.name, arguments: { q: '배너', query: '배너', limit: 50 } }); tally('powerMCP', 'free(key)');
    const text = JSON.stringify(res ?? {});
    const ids = [...new Set(text.match(/\b[a-z0-9]{16}\b/g) ?? [])];
    judgeAssetIds('powerMCP', c, `tools/call ${t.name}`, ids, db ? await assetMap() : null, false);
  }
}

let _assets = null;
async function assetMap() {
  if (!_assets) _assets = new Map((await q('SELECT public_id, visibility, owner_user_id, org_id, category FROM asset_items WHERE deleted_at IS NULL')).map((a) => [a.public_id, a]));
  return _assets;
}

// ------------------------------------------------------------------ 단위 확인
function selftest() {
  const anon = { userId: null, kind: 'anon', plan: 'free', orgId: null, admin: false, email: null };
  const free = { userId: 9, kind: 'external', plan: 'free', orgId: null, admin: false, email: 'f@x' };
  const staff = { userId: 1, kind: 'staff', plan: 'staff', orgId: 1, admin: false, email: 's@solideos.com' };
  const A = new Map([
    ['iiiiiiiiiiiiiiii', { public_id: 'iiiiiiiiiiiiiiii', visibility: 'internal', owner_user_id: 1 }],
    ['pppppppppppppppp', { public_id: 'pppppppppppppppp', visibility: 'pro', owner_user_id: null }],
    ['uuuuuuuuuuuuuuuu', { public_id: 'uuuuuuuuuuuuuuuu', visibility: 'public', owner_user_id: null }],
    ['vvvvvvvvvvvvvvvv', { public_id: 'vvvvvvvvvvvvvvvv', visibility: 'private', owner_user_id: 9 }],
  ]);
  const cases = [];
  const expect = (name, got, want) => cases.push({ name, ok: got === want, got, want });
  expect('canSee anon internal', canSee(anon, A.get('iiiiiiiiiiiiiiii')), false);
  expect('canSee free pro', canSee(free, A.get('pppppppppppppppp')), false);
  expect('canSee staff internal', canSee(staff, A.get('iiiiiiiiiiiiiiii')), true);
  expect('canSee free own private', canSee(free, A.get('vvvvvvvvvvvvvvvv')), true);
  expect('canSee staff other private', canSee(staff, A.get('vvvvvvvvvvvvvvvv')), false);
  expect('served 302', served(302), true);
  expect('served 403', served(403), false);
  const before = findings.length;
  const C = { name: 'anon', who: anon };
  judgeAssetIds('selftest 목록', C, '/fake', [{ id: 'iiiiiiiiiiiiiiii' }, { id: 'uuuuuuuuuuuuuuuu' }, { id: 'pppppppppppppppp' }], A, true);
  expect('가짜 목록 응답에서 internal·pro 2건을 유출로 잡음', findings.length - before, 2);
  const b2 = findings.length;
  judgeAssetIds('selftest 필드', C, '/fake', [{ id: 'x', visibility: 'internal' }, { id: 'y', visibility: 'public' }], null, true);
  expect('필드 모드: visibility=internal 1건 잡음', findings.length - b2, 1);
  expect('비밀 문자열 탐지', scanSecrets('{"x":"pp_live_ABCDEFGHIJKLMNOP"}').length, 1);
  expect('비밀 문자열 오탐 없음', scanSecrets('{"key_last4":"ab12"}').length, 0);
  findings.splice(before); // 단위 확인 기록은 결과에서 뺀다
  stats.clear();
  let bad = 0;
  for (const cc of cases) { console.log(`${cc.ok ? 'OK  ' : 'FAIL'} ${cc.name}${cc.ok ? '' : ` (got ${cc.got}, want ${cc.want})`}`); if (!cc.ok) bad++; }
  console.log(bad ? `\n단위 확인 실패 ${bad}건` : `\n단위 확인 ${cases.length}건 통과 — 판정 함수가 가짜 유출을 잡는다`);
  return bad === 0;
}

// ------------------------------------------------------------------ 실행
async function main() {
  if (args.selftest) process.exit(selftest() ? 0 : 1);
  if (!selftest()) { console.error('판정 함수 단위 확인 실패 — 실측 중단'); process.exit(2); }
  console.log(`\n대상 ${BASE}  모드 ${LOCAL ? 'DB 대조(로컬)' : '필드(운영)'}  표본 ${SAMPLE}\n`);
  const h = await fetch(`${API}/health`).then((r) => r.json()).catch(() => null);
  if (!h?.data?.ok) { console.error(`서버 응답 없음: ${API}/health — 로컬이면 php -S 127.0.0.1:8090 -t api/public`); process.exit(2); }

  if (LOCAL) { db = await openDb(); if (!db) { console.error('.env DATABASE_URL 이 없어 DB 대조 불가'); process.exit(2); } }
  const clients = [];
  const anon = new Client('anon', null);
  clients.push(anon);
  if (LOCAL) {
    const free = new Client('free', null);
    const r = await free.get('/auth/dev?email=leak-free%40example.com');
    if (r.status !== 200) { console.error('개발 로그인 실패(/auth/dev — app.debug·루프백 필요)', r.status, r.text.slice(0, 200)); process.exit(2); }
    const staff = new Client('staff', null);
    await staff.get('/auth/dev?email=leak-staff%40solideos.com');
    clients.push(free, staff);
  } else {
    if (process.env.LEAK_KEY_FREE) clients.push(new Client('free', null, { bearer: process.env.LEAK_KEY_FREE }));
    else limits.push('LEAK_KEY_FREE 가 없어 외부 free 신원은 빼고 익명만 검사');
    if (process.env.LEAK_KEY_STAFF) clients.push(new Client('staff', null, { bearer: process.env.LEAK_KEY_STAFF }));
    else limits.push('LEAK_KEY_STAFF 가 없어 staff 대조·차집합 판정 없음');
  }
  for (const c of clients) c.who = await whoOf(c);
  for (const c of clients) console.log(`신원 ${c.name.padEnd(6)} kind=${c.who.kind} plan=${c.who.plan}${c.who.admin ? ' admin' : ''}${c.who.userId ? ' user#' + c.who.userId : ''}`);
  if (clients.some((c) => c.name !== 'staff' && (c.who.kind === 'staff' || c.who.admin))) { console.error('검사 신원이 staff·admin 입니다 — 중단'); process.exit(2); }

  // staff 를 먼저 돌려(필드 모드의 probe 재료) 순서 고정
  const ordered = [...clients.filter((c) => c.name === 'staff'), ...clients.filter((c) => c.name !== 'staff')];
  const ctx = { assets: db ? await assetMap() : null, staffSeen: new Map(), staffPosts: new Map(), coverProbe: new Set() };
  const t0 = Date.now();
  for (const [name, fn] of [['자산', auditAssets], ['커뮤니티', auditCommunity], ['저장·컬렉션', auditSaved], ['시안', auditMock], ['장표', auditDeck], ['계정·관리자', auditCore]]) {
    process.stdout.write(`… ${name}\n`);
    await fn(ordered, ctx);
  }
  await auditStatic(anon);
  await auditMcp(ordered);
  if (db) await db.end();

  // 표
  const rows = [...stats.values()].sort((a, b) => a.exit.localeCompare(b.exit, 'ko') || a.who.localeCompare(b.who));
  const wE = Math.max(...rows.map((r) => [...r.exit].length), 4);
  console.log(`\n${'출구'.padEnd(wE)}  신원    요청   유출  경고  예시 id`);
  for (const r of rows) console.log(`${r.exit.padEnd(wE + (r.exit.length - [...r.exit].length))}  ${r.who.padEnd(6)} ${String(r.req).padStart(5)}  ${String(r.leak).padStart(4)}  ${String(r.warn).padStart(4)}  ${r.ex}`);
  const real = findings.filter((f) => f.sev !== 'meta');
  const warn = findings.filter((f) => f.sev === 'meta');
  const totalReq = rows.reduce((s, r) => s + r.req, 0);
  console.log(`\n요청 ${totalReq}건 · ${((Date.now() - t0) / 1000).toFixed(1)}초`);
  const show = (list, title) => {
    if (!list.length) return;
    console.log(`\n${title}`);
    const grouped = new Map();
    for (const f of list) { const k = `${f.sev}|${f.exit}|${f.who}|${f.why.replace(/[0-9a-z]{16}|\d+/g, '#')}`; const g = grouped.get(k) ?? { ...f, n: 0 }; g.n++; grouped.set(k, g); }
    for (const g of grouped.values()) console.log(`  [${g.sev}] ${g.exit} / ${g.who} ×${g.n}: ${g.why}  예) ${g.url}`);
  };
  show(real, `유출 ${real.length}건`);
  show(warn, `경고(총계 제외) ${warn.length}건`);
  if (notes.length) { console.log('\n참고'); for (const n of [...new Set(notes)].slice(0, 30)) console.log('  - ' + n); }
  if (limits.length) { console.log('\n이 실행의 한계'); for (const n of [...new Set(limits)]) console.log('  - ' + n); }

  const outDir = path.join(ROOT, 'storage', 'leak-audit');
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify({ base: BASE, mode: LOCAL ? 'db' : 'field', at: new Date().toISOString(), identities: clients.map((c) => ({ name: c.name, ...c.who, email: undefined })), table: rows, findings, notes, limits }, null, 1));
  console.log(`\n결과 ${path.relative(ROOT, file)}`);
  console.log(real.length === 0 ? '\n총 유출 0 — 통과' : `\n총 유출 ${real.length} — 사내 출시 불가`);
  process.exit(real.length === 0 ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(2); });
}

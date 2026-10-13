// 출처: homebox-handoff packages/mcp/src/qa/netguard.mjs 에서 가져옴 (powerMCP 이식 2026-10-06)
// 판정 브라우저의 네트워크 막이 (보안 점검 2026-10-05)
// check_mockup 은 사용자가 보낸 HTML 을 서버 브라우저로 그리고 그 캡처를 돌려준다.
// 막지 않으면 시안 안의 <iframe src="http://127.0.0.1:…"> · 클라우드 메타데이터 주소가 그려져
// 서버 내부 화면이 캡처로 새어 나간다(SSRF). 그래서 나가는 요청을 주소로 거른다.
import dns from "node:dns/promises";
import net from "node:net";

const V4_BLOCK = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4],
];
const v4num = (ip) => ip.split(".").reduce((a, b) => (a << 8) + Number(b), 0) >>> 0;
const inV4 = (ip, [base, bits]) => bits === 0 || (v4num(ip) >>> (32 - bits)) === (v4num(base) >>> (32 - bits));

/** 내부(사설·루프백·링크로컬·멀티캐스트) 주소인가 */
export function isPrivateIp(ip) {
  if (net.isIPv4(ip)) return V4_BLOCK.some((r) => inV4(ip, r));
  const v6 = ip.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIp(mapped[1]);
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || /^ff/.test(v6);
}
const isLoopback = (ip) => (net.isIPv4(ip) ? inV4(ip, ["127.0.0.0", 8]) : ip === "::1" || ip === "::ffff:127.0.0.1");

const cache = new Map();
async function resolve(host) {
  if (net.isIP(host)) return [host];
  const hit = cache.get(host);
  if (hit && hit.t > Date.now() - 60_000) return hit.ips;
  const ips = (await dns.lookup(host, { all: true, verbatim: true })).map((r) => r.address);
  cache.set(host, { t: Date.now(), ips });
  return ips;
}

/**
 * 요청 하나를 허용할지 — allowLoopback 은 개발 환경(API 가 127.0.0.1)에서만 켠다.
 * @returns {Promise<string|null>} 막을 이유(허용이면 null)
 */
export async function blockReason(rawUrl, { allowLoopback = false } = {}) {
  let u;
  try { u = new URL(rawUrl); } catch { return "주소 해석 실패"; }
  if (u.protocol === "data:" || u.protocol === "blob:" || u.protocol === "about:") return null;
  if (u.protocol !== "http:" && u.protocol !== "https:") return `허용 안 하는 방식 ${u.protocol}`;
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "metadata.google.internal" || host === "metadata") return "메타데이터 주소";
  let ips;
  try { ips = await resolve(host); } catch { return "이름 해석 실패"; }
  for (const ip of ips) {
    if (allowLoopback && isLoopback(ip)) continue;
    if (isPrivateIp(ip)) return `내부 주소 ${ip}`;
  }
  return null;
}

/** 브라우저 문맥 전체에 막이를 건다 (하위 iframe·fetch·이미지 포함) */
export async function guardContext(ctx, opts = {}) {
  const blocked = [];
  await ctx.route("**/*", async (route) => {
    const url = route.request().url();
    const why = await blockReason(url, opts);
    if (why) { blocked.push(`${why}: ${url.slice(0, 120)}`); return route.abort("blockedbyclient"); }
    return route.continue();
  });
  if (typeof ctx.routeWebSocket === "function") await ctx.routeWebSocket(/.*/, (ws) => { blocked.push(`웹소켓: ${ws.url().slice(0, 120)}`); ws.close(); });
  return blocked;
}

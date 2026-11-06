// powerMock 판정·레퍼런스 호출의 작은 규칙들 — 서버(buildServer) 없이 시험할 수 있게 index.ts 에서 뺐다(2026-11-01 전체 검수).
//   judgeRecordHeaders  판정 기록 서명: HTML 해시까지 묶는다(MC-127)
//   planHeaders   레퍼런스 엔진에 보내는 플랜 서명(MC-131)
//   rememberOrg·judgeOrg  다시 판정 때 쓸 기관명(MC-129)
//   wireQuery     와이어 인자 — 주소 길이 한도를 넘지 않게 압축(MC-133)
import { createHash, createHmac } from "node:crypto";
import { deflateRawSync } from "node:zlib";

export const sha256Hex = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

/**
 * 판정 기록 서명. X-Pp-Judge-Html = HMAC("token|score|pass|html_sha256") — 플랫폼이 저장된 HTML 과 해시를 대조해, 판정 중 바뀐 시안에 통과를 기록하지 않는다.
 * X-Pp-Judge(옛 형식)도 같이 보낸다 — 옛 판 플랫폼이 이 헤더만 읽으므로, 플랫폼·powerMCP 를 어느 순서로 배포해도 판정 기록이 끊기지 않는다.
 */
export function judgeRecordHeaders(secret: string, token: string, rawScore: unknown, pass: unknown, htmlSha256: string): Record<string, string> {
  const score = Math.max(0, Math.min(100, Math.trunc(Number(rawScore) || 0)));
  const p = pass ? 1 : 0;
  return {
    "X-Pp-Judge": createHmac("sha256", secret).update(`${token}|${score}|${p}`).digest("hex"),
    "X-Pp-Judge-Html": createHmac("sha256", secret).update(`${token}|${score}|${p}|${htmlSha256}`).digest("hex"),
  };
}

/** 레퍼런스 엔진 플랜 서명 — 엔진이 이 서명이 맞을 때만 X-Pp-Plan 을 믿는다(일반 키가 헤더만 붙여 올라가지 못하게). 비밀이 없으면 서명 없음 */
export function planHeaders(secret: string, plan: string, nowSec = Math.floor(Date.now() / 1000)): Record<string, string> {
  if (!secret) return {};
  const ts = String(nowSec);
  return { "X-Pp-Plan-Ts": ts, "X-Pp-Plan-Sig": createHmac("sha256", secret).update(`plan|${plan}|${ts}`).digest("hex") };
}

// 다시 판정(token)할 때 앞서 받은 기관명을 쓴다(D5). 요청마다 buildServer 를 새로 만들므로 모듈에 둔다 — 그 안에 두면 늘 비어 대조가 조용히 꺼졌다.
// 재시작 뒤에도 쓰도록 판정 기록(check_json.org_name)에도 남긴다: 플랫폼이 보관 응답에 돌려준다.
const orgByToken = new Map<string, string>();
export function rememberOrg(token: string, org: string | undefined | null): void {
  if (!org) return;
  orgByToken.set(token, org);
  if (orgByToken.size > 2000) orgByToken.delete(orgByToken.keys().next().value as string);
}
/** 이번 인자 → 판정 기록에 남은 값 → 이 프로세스가 기억한 값 순서 */
export function judgeOrg(token: string, arg: string | undefined, stored: unknown): string {
  return arg || (typeof stored === "string" && stored) || orgByToken.get(token) || "";
}

/** 이 길이(인코딩 뒤)를 넘는 와이어는 압축해 보낸다 — Apache 기본 요청 줄 한도 8190 바이트에 다른 인자 몫을 남긴다 */
const WIRE_QS_MAX = 6000;
/** 레퍼런스 엔진 와이어 인자: 보통은 wire=JSON, 칸이 아주 많으면 wire_z=(raw deflate + base64url). 40줄·6칸이면 JSON 이 약 20KB 라 414 로 끊긴다 */
export function wireQuery(wire: unknown): { wire?: string; wire_z?: string } {
  const json = JSON.stringify(wire);
  return encodeURIComponent(json).length <= WIRE_QS_MAX ? { wire: json } : { wire_z: deflateRawSync(json).toString("base64url") };
}

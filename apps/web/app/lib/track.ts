// 방문자 통계 알림(2026-10-20, 설계 docs/db-design.md §6.2) — 화면 이동마다 서버에 한 줄. 결과는 기다리지 않는다.
// vid(방문자) = 이 브라우저에 저장한 무작위 16자 · sid(방문) = 30분 넘게 쉬면 새로. 저장소가 막힌 브라우저(사생활 보호 창 등)는 그 페이지 동안만의 값.
import { useEffect } from "react";
import { useLocation } from "react-router";
import { apiBase } from "@/lib/api";

const rand = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("").slice(0, 16);
let memVid = "", memSid = "", memAt = 0;

function ids(): [string, string] {
  const now = Date.now();
  try {
    let v = localStorage.getItem("pp_vid");
    if (!v) { v = rand(); localStorage.setItem("pp_vid", v); }
    let s = sessionStorage.getItem("pp_sid");
    const at = Number(sessionStorage.getItem("pp_sid_at") || 0);
    if (!s || now - at > 30 * 60_000) { s = rand(); sessionStorage.setItem("pp_sid", s); }
    sessionStorage.setItem("pp_sid_at", String(now));
    return [v, s];
  } catch {
    if (!memVid) memVid = rand();
    if (!memSid || now - memAt > 30 * 60_000) memSid = rand();
    memAt = now;
    return [memVid, memSid];
  }
}

function trackHit(path: string, channel: "web" | "addin" = "web") {
  if (typeof window === "undefined") return;
  const [vid, sid] = ids();
  const body = JSON.stringify({ path, vid, sid, channel, w: window.innerWidth, lang: navigator.language, ref: document.referrer || "" });
  try {
    void fetch(`${apiBase}/stats/hit`, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true, credentials: "same-origin" }).catch(() => {});
  } catch { /* 통계는 실패해도 화면에 영향 없음 */ }
}

/** 주소가 바뀔 때마다 한 번 */
export function usePageTrack() {
  const { pathname } = useLocation();
  useEffect(() => { trackHit(pathname); }, [pathname]);
}

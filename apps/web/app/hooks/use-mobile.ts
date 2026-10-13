// 출처: shadcn use-mobile — effect 안 setState 대신 useSyncExternalStore(react-hooks/set-state-in-effect 규칙)
import * as React from "react"

const MOBILE_BREAKPOINT = 1024 // 태블릿(768~1023)도 사이드바를 시트로 — 768 에서 관리자 본문이 76px 넘쳤다(2026-10-08)
const query = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(query)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false)
}

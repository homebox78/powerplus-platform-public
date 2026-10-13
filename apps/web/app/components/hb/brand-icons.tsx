// 소셜 로그인 브랜드 아이콘 (인라인 SVG) — 카카오 말풍선·구글 G(4색)·네이버 N. 각 브랜드 가이드의 버튼 색과 함께 쓴다 (사용자 지시 2026-09-24)
export function KakaoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <path fill="currentColor" d="M12 3C6.48 3 2 6.58 2 11c0 2.86 1.9 5.37 4.76 6.78-.15.54-.97 3.5-1 3.73 0 0-.02.17.09.24.11.07.24.02.24.02.32-.05 3.72-2.43 4.3-2.84.53.08 1.07.12 1.61.12 5.52 0 10-3.58 10-8S17.52 3 12 3z" />
    </svg>
  );
}

export function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.46a5.52 5.52 0 0 1-2.4 3.62v3.01h3.88c2.27-2.09 3.58-5.17 3.58-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3.01c-1.07.72-2.45 1.15-4.06 1.15-3.13 0-5.77-2.11-6.72-4.95H1.28v3.11A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.28 14.28A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.38-2.28V6.61H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.39l4-3.11z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.23 0 12 0A12 12 0 0 0 1.28 6.61l4 3.11C6.23 6.88 8.87 4.77 12 4.77z" />
    </svg>
  );
}

export function NaverIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <path fill="currentColor" d="M16.27 12.85 7.38 0H0v24h7.73V11.15L16.62 24H24V0h-7.73z" />
    </svg>
  );
}

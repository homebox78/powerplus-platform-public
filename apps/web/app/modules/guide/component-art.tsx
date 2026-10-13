// powerGuide 부품 목록 카드의 미리보기 그림 — 부품마다 모양을 단순화한 그림(회색·검정·흰색만).
// 참고: KT UX Design System·LINE Design System·토스 앱인토스·코드잇 디자인 시스템의 부품 개요 카드(위 그림 + 아래 이름).
// 이미지 파일 대신 인라인 SVG — 77종이 한 파일에 있어 요청 0, 다크 모드는 그림 칸이 밝은 판 그대로(그림이 곧 견본이라 반전하지 않는다).
import type { ReactNode } from "react";

const K = "#1B1B1F"; // 검정(주 버튼·선택)
const M = "#C5C7CC"; // 중간 회색(글 막대)
const L = "#E6E7EA"; // 연한 회색(보조 막대·면)
const W = "#FFFFFF";
const B = "#D4D6DA"; // 테두리

const bar = (x: number, y: number, w: number, h = 8, f = M, r = 3) => <rect key={`bar${x},${y},${w}`} x={x} y={y} width={w} height={h} rx={r} fill={f} />;
const box = (x: number, y: number, w: number, h: number, r = 8, f = W, s = B) => <rect key={`box${x},${y},${w}`} x={x} y={y} width={w} height={h} rx={r} fill={f} stroke={s} strokeWidth={1.5} />;
const fill = (x: number, y: number, w: number, h: number, r = 8, f = K) => <rect key={`fill${x},${y},${w}`} x={x} y={y} width={w} height={h} rx={r} fill={f} />;
const chev = (x: number, y: number, dir: "down" | "right" | "left" | "up" = "down", c = K) => {
  const d = { down: `M${x - 5} ${y - 2.5}l5 5 5-5`, up: `M${x - 5} ${y + 2.5}l5-5 5 5`, right: `M${x - 2.5} ${y - 5}l5 5-5 5`, left: `M${x + 2.5} ${y - 5}l-5 5 5 5` }[dir];
  return <path d={d} fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />;
};
const check = (x: number, y: number, c = W) => <path key={`check${x},${y}`} d={`M${x - 4.5} ${y}l3 3 6-6.5`} fill="none" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />;
const dot = (x: number, y: number, r: number, f = M) => <circle key={`dot${x},${y}`} cx={x} cy={y} r={r} fill={f} />;
const ring = (x: number, y: number, r: number, s = B, w = 1.5, f = W) => <circle key={`ring${x},${y}`} cx={x} cy={y} r={r} fill={f} stroke={s} strokeWidth={w} />;
const line = (x1: number, y1: number, x2: number, y2: number, s = B, w = 1.5) => <line key={`${x1},${y1},${x2},${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={s} strokeWidth={w} />;
const xmark = (x: number, y: number, c = K) => <path d={`M${x - 4} ${y - 4}l8 8M${x + 4} ${y - 4}l-8 8`} stroke={c} strokeWidth={1.8} strokeLinecap="round" />;
const home = (x: number, y: number, c = K, f = "none") => <path d={`M${x - 8} ${y}l8-7 8 7v9h-16z`} fill={f} stroke={c} strokeWidth={1.8} strokeLinejoin="round" />;
const search = (x: number, y: number, c = K) => <g fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round"><circle cx={x} cy={y} r={5} /><path d={`M${x + 4} ${y + 4}l4 4`} /></g>;
const menu = (x: number, y: number, c = K) => <path d={`M${x - 8} ${y - 5}h16M${x - 8} ${y}h16M${x - 8} ${y + 5}h16`} stroke={c} strokeWidth={1.8} strokeLinecap="round" />;
const img = (x: number, y: number, w: number, h: number, r = 6) => (
  <g key={`${x},${y}`}><rect x={x} y={y} width={w} height={h} rx={r} fill={L} /><g transform={`translate(${x + w / 2 - 9} ${y + h / 2 - 7})`} fill="none" stroke={M} strokeWidth={1.6} strokeLinejoin="round"><rect width={18} height={14} rx={2} /><path d="M2 12l5-5 4 4 2-2 4 3" /><circle cx={13} cy={4.5} r={1.5} /></g></g>
);
/** 휴대폰 틀 일부(위가 잘린 화면) */
const phone = (children: ReactNode, x = 80, w = 140) => (
  <g><rect x={x} y={14} width={w} height={190} rx={18} fill={W} stroke={B} strokeWidth={2} />{children}</g>
);
const row = (y: number, x = 40, w = 220, withChev = true) => <g key={`${x},${y}`}>{bar(x, y, 40, 6, L)}{bar(x, y + 12, w - 40)}{withChev && chev(x + w - 8, y + 10)}</g>;

const ART: Record<string, ReactNode> = {
  // ── 구조·탐색
  accordion: phone(<g>{line(80, 70, 220, 70)}{row(80, 96, 112)}{line(80, 112, 220, 112)}{row(122, 96, 112)}{line(80, 154, 220, 154)}</g>),
  collapsible: <g>{box(60, 40, 180, 34, 8)}{bar(76, 53, 90)}{chev(222, 57)}{box(60, 84, 180, 56, 8, "#F4F4F5", "#F4F4F5")}{bar(76, 100, 130, 6, M)}{bar(76, 116, 100, 6, L)}</g>,
  breadcrumb: <g>{home(84, 88)}{chev(110, 92, "right", M)}{fill(124, 82, 46, 20, 3, L)}{chev(186, 92, "right", M)}{fill(200, 82, 46, 20, 3, M)}</g>,
  tabs: <g>{line(40, 104, 260, 104)}{bar(52, 80, 46, 9, K)}{fill(40, 101, 70, 3, 1, K)}{bar(132, 80, 46, 9, M)}{bar(206, 80, 46, 9, M)}{bar(52, 124, 180, 7, L)}{bar(52, 140, 130, 7, L)}</g>,
  pagination: <g>{chev(70, 90, "left", M)}{fill(92, 76, 28, 28, 6, K)}{bar(101, 87, 10, 6, W, 2)}{[132, 164, 196].map((x) => <g key={x}>{box(x, 76, 28, 28, 6)}{bar(x + 9, 87, 10, 6, M, 2)}</g>)}{chev(236, 90, "right", K)}</g>,
  carousel: <g>{img(70, 30, 160, 96, 10)}{fill(40, 64, 20, 28, 6, L)}{fill(240, 64, 20, 28, 6, L)}{dot(134, 144, 4, K)}{dot(150, 144, 4, M)}{dot(166, 144, 4, M)}</g>,
  "step-indicator": <g>{line(70, 80, 230, 80, M, 2)}{fill(58, 68, 24, 24, 12, K)}{check(70, 80)}{fill(138, 68, 24, 24, 12, K)}{bar(146, 77, 8, 6, W, 2)}{ring(230, 80, 12)}{bar(46, 106, 48, 7)}{bar(126, 106, 48, 7, K)}{bar(206, 106, 48, 7, L)}</g>,
  "side-navigation": <g>{box(70, 20, 160, 140, 10)}{fill(82, 34, 136, 26, 6, "#F1F1F3")}{bar(94, 43, 70, 8, K)}{[74, 98, 122].map((y) => bar(94, y, 90 - (y - 74) / 2))}{bar(108, 142, 70, 6, L)}</g>,
  sidebar: <g>{box(40, 20, 220, 140, 10)}{fill(41, 21, 70, 138, 9, "#F4F4F5")}{[38, 60, 82, 104].map((y, i) => <g key={y}>{fill(52, y, 10, 10, 3, i === 0 ? K : M)}{bar(68, y + 1, 32, 7, i === 0 ? K : M)}</g>)}{bar(126, 38, 90, 9, K)}{bar(126, 58, 116, 6, L)}{img(126, 76, 116, 66)}</g>,
  "navigation-menu": <g>{box(30, 30, 240, 36, 8)}{bar(46, 44, 30)}{bar(96, 44, 30, 8, K)}{bar(146, 44, 30)}{bar(196, 44, 30)}{box(80, 74, 150, 76, 8)}{[90, 108, 126].map((y) => bar(96, y, 110 - (y - 90)))}</g>,
  "mobile-menu": phone(<g>{fill(81, 40, 138, 1.5, 0, B)}{bar(96, 26, 40, 7, K)}{xmark(204, 30)}{[60, 86, 112, 138].map((y, i) => <g key={y}>{bar(96, y, i === 0 ? 60 : 80, 8, i === 0 ? K : M)}{chev(206, y + 4, "right", M)}</g>)}</g>),
  "in-page-navigation": <g>{bar(50, 40, 120, 9, K)}{[62, 80, 98, 116].map((y) => bar(50, y, 140, 6, L))}{line(206, 38, 206, 142, B, 2)}{fill(205, 56, 3, 20, 1.5, K)}{bar(216, 62, 44, 7, K)}{bar(216, 86, 40, 7)}{bar(216, 110, 36, 7)}</g>,
  "scroll-area": <g>{box(70, 26, 160, 128, 10)}{[44, 64, 84, 104, 124].map((y) => bar(86, y, 110, 7, y === 44 ? M : L))}{fill(214, 36, 5, 50, 2.5, M)}</g>,
  resizable: <g>{box(40, 34, 220, 112, 10)}{line(150, 35, 150, 145, B)}{fill(144, 80, 12, 20, 4, W)}{line(148, 86, 148, 94, M)}{line(152, 86, 152, 94, M)}{bar(56, 54, 70, 8, K)}{bar(56, 72, 60, 6, L)}{bar(166, 54, 70, 8, M)}{bar(166, 72, 76, 6, L)}</g>,
  card: <g>{box(76, 20, 148, 140, 10)}{img(77, 21, 146, 86, 9)}{bar(90, 120, 30, 6, L)}{bar(90, 134, 90)}</g>,
  item: <g>{box(44, 56, 212, 68, 10)}{fill(60, 72, 36, 36, 8, L)}{bar(108, 76, 90, 8, K)}{bar(108, 94, 120, 6, M)}{chev(236, 90, "right", M)}</g>,
  // ── 버튼·표시
  button: <g>{fill(60, 46, 180, 36, 8, K)}{bar(120, 60, 60, 8, "#555860")}{box(60, 94, 34, 34, 8)}<path d="M77 117l-6-6a3.5 3.5 0 015-5l1 1 1-1a3.5 3.5 0 015 5z" fill={K} />{fill(102, 94, 138, 34, 8, L)}{bar(140, 108, 60, 7, W)}</g>,
  "button-group": <g>{box(54, 70, 192, 40, 8)}{line(118, 71, 118, 109)}{line(182, 71, 182, 109)}{fill(55, 71, 63, 38, 7, K)}{bar(72, 86, 30, 8, "#555860")}{bar(136, 86, 30, 8)}{bar(200, 86, 30, 8)}</g>,
  "toggle-group": <g>{fill(70, 70, 160, 40, 10, "#ECECEE")}{fill(74, 74, 52, 32, 7, W)}{bar(88, 86, 24, 8, K)}{bar(138, 86, 24, 8)}{bar(190, 86, 24, 8)}</g>,
  toggle: <g>{fill(90, 64, 52, 52, 10, K)}<path d="M108 98h16M108 82h9a6 6 0 010 12h-9z" stroke={W} strokeWidth={2.2} fill="none" />{box(158, 64, 52, 52, 10)}<path d="M178 82l-4 16M186 82l-4 16" stroke={M} strokeWidth={2.2} />{}</g>,
  badge: <g>{fill(76, 70, 46, 22, 11, K)}{bar(88, 77, 22, 8, "#555860")}{fill(132, 70, 46, 22, 11, L)}{bar(144, 77, 22, 8, W)}{box(188, 70, 46, 22, 11)}{bar(200, 77, 22, 8)}{bar(90, 110, 120, 7, L)}</g>,
  tag: <g>{[50, 120, 190].map((x, i) => <g key={x}>{fill(x, 74, 62, 28, 6, i === 0 ? K : L)}{bar(x + 10, 84, 28, 8, i === 0 ? "#555860" : M)}{xmark(x + 50, 88, i === 0 ? W : M)}</g>)}</g>,
  avatar: <g>{[110, 140, 170].map((x, i) => <g key={x}><circle cx={x} cy={80} r={22} fill={[L, M, K][i]} stroke={W} strokeWidth={3} /></g>)}<circle cx={110} cy={74} r={7} fill={W} /><path d="M98 94a12 9 0 0124 0" fill={W} />{bar(96, 118, 108, 7, L)}</g>,
  link: <g>{bar(60, 68, 160, 7, L)}{bar(60, 84, 60, 7, L)}{bar(124, 84, 70, 7, K)}{fill(124, 93, 70, 1.6, 0.8, K)}{bar(60, 100, 120, 7, L)}</g>,
  kbd: <g>{[86, 140, 194].map((x, i) => <g key={x}>{box(x - 4, 66, 44, 44, 8)}{fill(x - 3, 104, 42, 5, 3, L)}{bar(x + 8, 82, 20, 8, i === 1 ? K : M)}</g>)}</g>,
  separator: <g>{bar(70, 56, 120)}{line(70, 90, 230, 90, M, 1.5)}{bar(70, 112, 90)}{line(196, 108, 196, 124, M)}{bar(204, 112, 26)}</g>,
  progress: <g>{bar(60, 72, 90, 7, K)}{bar(214, 72, 26, 7)}{fill(60, 92, 180, 10, 5, L)}{fill(60, 92, 118, 10, 5, K)}{bar(60, 118, 140, 6, L)}</g>,
  spinner: <g><circle cx={150} cy={90} r={30} fill="none" stroke={L} strokeWidth={8} /><path d="M150 60a30 30 0 0130 30" fill="none" stroke={K} strokeWidth={8} strokeLinecap="round" /></g>,
  skeleton: <g>{fill(60, 50, 44, 44, 22, L)}{fill(116, 56, 120, 10, 5, L)}{fill(116, 76, 80, 10, 5, L)}{fill(60, 112, 180, 10, 5, L)}{fill(60, 130, 140, 10, 5, L)}</g>,
  empty: <g>{ring(150, 70, 26, B, 1.5, "#F4F4F5")}{search(148, 68, M)}{bar(110, 112, 80, 8)}{bar(98, 128, 104, 6, L)}</g>,
  "aspect-ratio": <g>{img(66, 34, 168, 98, 8)}<path d="M66 146h168M66 142v8M234 142v8" stroke={M} strokeWidth={1.5} fill="none" />{bar(134, 156, 32, 6, M)}</g>,
  "text-list": <g>{[56, 82, 108].map((y) => <g key={y}>{dot(74, y + 3, 3.5, K)}{bar(88, y, 150 - (y - 56) / 2)}</g>)}</g>,
  // ── 입력
  input: <g>{bar(60, 54, 40, 7, K)}{box(60, 70, 180, 40, 8)}{bar(76, 86, 90, 7, L)}{bar(60, 120, 110, 6, L)}</g>,
  textarea: <g>{bar(60, 36, 40, 7, K)}{box(60, 52, 180, 92, 8)}{bar(76, 68, 130, 7, M)}{bar(76, 84, 100, 7, M)}<path d="M228 132l6-6M222 134l12-12" stroke={M} strokeWidth={1.5} /></g>,
  field: <g>{bar(60, 40, 44, 7, K)}{dot(110, 43, 2.5, K)}{box(60, 56, 180, 38, 8, W, K)}{bar(76, 71, 100, 7, M)}<circle cx={66} cy={110} r={5} fill={K} />{bar(76, 107, 120, 6, M)}</g>,
  "input-group": <g>{box(50, 70, 200, 40, 8)}{line(96, 71, 96, 109)}{bar(62, 86, 22, 7)}{bar(108, 86, 90, 7, L)}{fill(212, 76, 32, 28, 6, K)}{search(226, 88, W)}</g>,
  "input-otp": <g>{[60, 100, 140, 180, 220].map((x, i) => <g key={x}>{box(x - 4, 66, 32, 44, 8, W, i === 2 ? K : B)}{i < 2 && dot(x + 12, 88, 5, K)}</g>)}</g>,
  "date-input": <g>{bar(60, 54, 40, 7, K)}{box(60, 70, 180, 40, 8)}{bar(76, 86, 34, 7)}{bar(118, 86, 20, 7)}{bar(146, 86, 20, 7)}<rect x={210} y={81} width={16} height={16} rx={3} fill="none" stroke={K} strokeWidth={1.6} />{line(210, 87, 226, 87, K, 1.6)}</g>,
  select: <g>{box(60, 40, 180, 38, 8)}{bar(76, 55, 80, 7, K)}{chev(222, 59)}{box(60, 84, 180, 70, 8)}{fill(66, 90, 168, 24, 5, "#F1F1F3")}{bar(78, 98, 70, 7, K)}{check(220, 102, K)}{bar(78, 126, 90, 7)}</g>,
  checkbox: <g>{fill(76, 54, 22, 22, 5, K)}{check(87, 65)}{bar(110, 61, 120)}{line(76, 90, 230, 90, "#EDEDEF")}{fill(76, 104, 22, 22, 5, K)}{check(87, 115)}{bar(110, 111, 90, 8, L)}</g>,
  "radio-group": <g>{ring(88, 66, 11, K, 1.6)}{dot(88, 66, 5.5, K)}{bar(108, 62, 110)}{ring(88, 106, 11)}{bar(108, 102, 80, 8, L)}</g>,
  switch: <g>{fill(90, 68, 52, 30, 15, K)}<circle cx={127} cy={83} r={11} fill={W} />{fill(158, 68, 52, 30, 15, L)}<circle cx={173} cy={83} r={11} fill={W} />{bar(96, 116, 108, 7, L)}</g>,
  slider: <g>{fill(60, 86, 180, 6, 3, L)}{fill(60, 86, 112, 6, 3, K)}{ring(172, 89, 11, K, 2)}{bar(60, 60, 50, 7, K)}{bar(214, 60, 26, 7)}</g>,
  chip: <g>{fill(64, 76, 64, 28, 14, K)}{bar(76, 86, 26, 8, "#555860")}{chev(115, 90, "down", W)}{fill(136, 76, 64, 28, 14, L)}{bar(148, 86, 26, 8, W)}{chev(187, 90, "down", M)}{fill(208, 76, 40, 28, 14, L)}{bar(218, 86, 20, 8, W)}</g>,
  label: <g>{bar(70, 66, 54, 9, K)}{dot(132, 70, 3, K)}{bar(70, 88, 160, 6, L)}{bar(70, 102, 120, 6, L)}</g>,
  "file-upload": <g><rect x={56} y={30} width={188} height={84} rx={10} fill="#F7F7F8" stroke={M} strokeWidth={1.5} strokeDasharray="5 4" /><path d="M150 82V58m-8 8l8-8 8 8" stroke={K} strokeWidth={2} fill="none" strokeLinecap="round" />{bar(116, 92, 68, 6)}{box(56, 124, 188, 30, 6)}{bar(70, 135, 90, 7)}{xmark(230, 139, M)}</g>,
  // ── 데이터
  table: <g>{box(40, 34, 220, 112, 8)}{fill(41, 35, 218, 26, 7, "#F1F1F3")}{[60, 120, 180].map((x) => bar(x, 44, 36, 7, K))}{[74, 98, 122].map((y) => <g key={y}>{line(41, y - 6, 259, y - 6, "#EDEDEF")}{[60, 120, 180].map((x) => bar(x, y, 40, 6, L))}</g>)}</g>,
  "data-table": <g>{box(34, 28, 232, 124, 8)}{fill(35, 29, 230, 24, 7, "#F1F1F3")}{fill(46, 36, 10, 10, 2, M)}{[70, 136, 202].map((x) => bar(x, 37, 36, 7, K))}{[60, 84, 108].map((y, i) => <g key={y}>{fill(46, y, 10, 10, 2, i === 0 ? K : W)}{i > 0 && <rect x={46} y={y} width={10} height={10} rx={2} fill="none" stroke={M} />}{[70, 136, 202].map((x) => bar(x, y + 2, 40, 6, L))}</g>)}{bar(46, 134, 40, 6, M)}{chev(226, 137, "left", M)}{chev(244, 137, "right", K)}</g>,
  "structured-list": <g>{[44, 82, 120].map((y, i) => <g key={y}>{line(50, y + 30, 250, y + 30, "#EDEDEF")}{bar(56, y + 8, 50, 7, K)}{bar(140, y + 8, 100 - i * 12, 7, L)}</g>)}</g>,
  calendar: <g>{box(70, 20, 160, 140, 10)}{chev(88, 40, "left", M)}{bar(130, 36, 40, 8, K)}{chev(212, 40, "right", M)}{Array.from({ length: 20 }).map((_, i) => { const x = 88 + (i % 5) * 31, y = 64 + Math.floor(i / 5) * 22; return i === 7 ? <g key={i}>{fill(x - 8, y - 8, 20, 18, 5, K)}</g> : <g key={i}>{dot(x + 2, y + 1, 3, i % 7 === 0 ? M : L)}</g>; })}</g>,
  "date-picker": <g>{box(70, 18, 160, 34, 8)}{bar(84, 31, 70, 7)}<rect x={202} y={27} width={14} height={14} rx={3} fill="none" stroke={K} strokeWidth={1.6} />{box(70, 58, 160, 104, 10)}{Array.from({ length: 15 }).map((_, i) => { const x = 90 + (i % 5) * 30, y = 80 + Math.floor(i / 5) * 26; return i === 6 ? <g key={i}>{fill(x - 9, y - 9, 20, 20, 10, K)}</g> : <g key={i}>{dot(x + 1, y + 1, 3, L)}</g>; })}</g>,
  alert: <g>{box(44, 60, 212, 60, 10, "#F4F4F5", "#E4E4E7")}<circle cx={68} cy={84} r={9} fill={K} /><path d="M68 79v6M68 88v.5" stroke={W} strokeWidth={2} strokeLinecap="round" />{bar(86, 78, 80, 8, K)}{bar(86, 96, 140, 6, M)}</g>,
  // ── 레이어
  dialog: <g>{fill(0, 0, 300, 180, 0, "#E9E9EC")}{box(66, 28, 168, 124, 12)}{bar(82, 46, 80, 9, K)}{xmark(216, 50)}{bar(82, 70, 130, 6, L)}{bar(82, 84, 100, 6, L)}{fill(142, 116, 76, 26, 7, K)}{bar(162, 125, 36, 7, "#555860")}{fill(82, 116, 52, 26, 7, L)}</g>,
  "alert-dialog": <g>{fill(0, 0, 300, 180, 0, "#E9E9EC")}{box(76, 40, 148, 100, 12)}{ring(150, 62, 10, K, 2)}<path d="M150 57v5M150 66v.5" stroke={K} strokeWidth={2} strokeLinecap="round" />{bar(110, 82, 80, 8, K)}{fill(90, 106, 56, 22, 6, L)}{fill(154, 106, 56, 22, 6, K)}</g>,
  sheet: <g>{fill(0, 0, 300, 180, 0, "#E9E9EC")}{fill(170, 0, 130, 180, 0, W)}{line(170, 0, 170, 180)}{bar(186, 22, 60, 9, K)}{xmark(282, 26)}{[50, 70, 90].map((y) => bar(186, y, 90 - (y - 50) / 2, 6, L))}{fill(186, 140, 96, 26, 6, K)}</g>,
  drawer: phone(<g>{fill(81, 15, 138, 188, 17, "#E9E9EC")}{box(81, 70, 138, 140, 16)}{fill(134, 78, 32, 4, 2, M)}{bar(96, 96, 70, 8, K)}{xmark(202, 100)}{bar(96, 118, 90, 6, L)}{fill(96, 140, 108, 28, 7, K)}</g>),
  popover: <g>{fill(110, 118, 80, 30, 8, K)}{bar(130, 129, 40, 8, "#555860")}{box(76, 22, 148, 80, 10)}<path d="M144 101l6 7 6-7" fill={W} stroke={B} strokeWidth={1.5} />{line(145, 101, 155, 101, W, 2)}{bar(92, 40, 70, 8, K)}{bar(92, 58, 110, 6, L)}{bar(92, 72, 90, 6, L)}</g>,
  tooltip: <g>{fill(96, 54, 108, 32, 7, K)}<path d="M144 86l6 7 6-7z" fill={K} />{bar(110, 66, 80, 7, "#555860")}{box(126, 104, 48, 30, 8)}{bar(140, 115, 20, 8)}</g>,
  "hover-card": <g>{bar(70, 30, 60, 8, K)}{fill(70, 39, 60, 1.6, 0.8, K)}{box(70, 52, 170, 96, 10)}{dot(98, 82, 14, M)}{bar(122, 72, 70, 8, K)}{bar(122, 88, 90, 6, L)}{bar(86, 112, 136, 6, L)}{bar(86, 126, 100, 6, L)}</g>,
  "dropdown-menu": <g>{box(60, 22, 100, 32, 8)}{bar(74, 34, 46, 8, K)}{chev(144, 38)}{box(60, 60, 160, 98, 10)}{fill(66, 66, 148, 24, 5, "#F1F1F3")}{bar(78, 74, 70, 7, K)}{[100, 124].map((y) => bar(78, y, 90))}{line(66, 118, 214, 118, "#EDEDEF")}</g>,
  "context-menu": <g><path d="M90 40l0 22 6-5 4 9 4-2-4-9 8 0z" fill={K} />{box(110, 50, 140, 104, 10)}{[66, 88, 110, 132].map((y, i) => <g key={y}>{bar(126, y, 70, 7, i === 0 ? K : M)}{bar(220, y, 16, 7, L)}</g>)}</g>,
  menubar: <g>{box(36, 30, 228, 32, 8)}{fill(46, 36, 50, 20, 5, "#F1F1F3")}{bar(56, 42, 30, 8, K)}{bar(110, 42, 30)}{bar(160, 42, 30)}{box(46, 66, 130, 82, 10)}{[80, 102, 124].map((y) => <g key={y}>{bar(60, y, 60)}{bar(140, y, 22, 7, L)}</g>)}</g>,
  command: <g>{box(50, 22, 200, 136, 12)}{search(70, 42, M)}{bar(84, 38, 90, 8, L)}{line(51, 58, 249, 58)}{bar(66, 70, 34, 6, M)}{fill(58, 84, 184, 26, 6, "#F1F1F3")}{bar(70, 93, 90, 8, K)}{bar(70, 122, 110, 8)}{bar(70, 142, 80, 8)}</g>,
  combobox: <g>{box(60, 26, 180, 36, 8, W, K)}{bar(76, 40, 50, 8, K)}<rect x={128} y={36} width={2} height={16} fill={K} />{chev(222, 44)}{box(60, 68, 180, 84, 10)}{fill(66, 74, 168, 24, 5, "#F1F1F3")}{bar(78, 82, 80, 7, K)}{bar(78, 110, 100, 7)}{bar(78, 132, 70, 7)}</g>,
  toast: <g>{bar(70, 40, 160, 7, L)}{bar(70, 56, 120, 7, L)}{fill(56, 100, 188, 46, 10, K)}<circle cx={80} cy={123} r={9} fill={W} />{check(80, 123, K)}{bar(98, 119, 100, 8, "#555860")}</g>,
  "coach-mark": <g>{fill(0, 0, 300, 180, 0, "#3A3B40")}<circle cx={84} cy={60} r={22} fill={W} />{bar(72, 56, 24, 8, K)}<path d="M108 66q30 4 40 30" fill="none" stroke={W} strokeWidth={1.8} strokeDasharray="4 3" />{bar(130, 104, 110, 8, W)}{bar(130, 120, 80, 6, "#8B8C91")}{fill(130, 136, 54, 22, 6, W)}</g>,
  "contextual-help": <g>{bar(60, 58, 60, 8, K)}{ring(132, 62, 8, K, 1.6)}<path d="M129.5 60a2.5 2.5 0 015 0c0 2-2.5 2-2.5 4M132 67v.5" stroke={K} strokeWidth={1.4} fill="none" strokeLinecap="round" />{box(60, 78, 180, 36, 8)}{fill(146, 30, 110, 24, 6, K)}{bar(158, 38, 80, 7, "#555860")}</g>,
  "help-panel": <g>{box(30, 24, 240, 132, 10)}{line(170, 25, 170, 155)}{bar(46, 42, 80, 9, K)}{[64, 82, 100].map((y) => bar(46, y, 110, 6, L))}{bar(184, 42, 60, 9, K)}{ring(254, 46, 6, M)}{[64, 80, 96, 112].map((y) => bar(184, y, 70, 6, y === 64 ? M : L))}</g>,
  "tutorial-panel": <g>{box(60, 22, 180, 136, 12)}{img(72, 34, 156, 60, 8)}{bar(76, 106, 90, 8, K)}{bar(76, 122, 120, 6, L)}{dot(80, 144, 3.5, K)}{dot(92, 144, 3.5, M)}{dot(104, 144, 3.5, M)}{fill(176, 134, 52, 20, 6, K)}</g>,
  // ── 정부 서비스 공통
  masthead: <g>{fill(20, 52, 260, 26, 0, "#F1F1F3")}{fill(34, 59, 12, 12, 2, K)}{bar(54, 61, 120, 7, M)}{bar(196, 61, 60, 7, K)}{chev(264, 65)}{box(20, 84, 260, 46, 0, W, "#EDEDEF")}{bar(36, 101, 60, 10, K)}{menu(258, 106)}</g>,
  header: <g>{box(20, 50, 260, 70, 0, W, "#EDEDEF")}{fill(34, 64, 22, 22, 6, K)}{bar(62, 70, 50, 9, K)}{[136, 172, 208].map((x) => bar(x, 71, 26, 7))}{search(252, 74)}{line(21, 98, 279, 98, "#EDEDEF")}{[36, 78, 120, 162].map((x, i) => bar(x, 106, 30, 6, i === 0 ? K : L))}</g>,
  footer: <g>{fill(20, 40, 260, 110, 0, "#2A2B30")}{fill(36, 56, 70, 10, 3, "#8B8C91")}{[78, 92, 106].map((y) => bar(36, y, 140 - (y - 78), 5, "#4A4B51"))}{[180, 222].map((x) => <g key={x}>{bar(x, 56, 30, 6, "#8B8C91")}{bar(x, 72, 36, 5, "#4A4B51")}{bar(x, 84, 30, 5, "#4A4B51")}</g>)}{line(36, 124, 264, 124, "#3F4046")}{bar(36, 134, 90, 5, "#4A4B51")}</g>,
  identifier: <g>{fill(30, 70, 240, 40, 6, "#F1F1F3")}{fill(46, 80, 20, 20, 4, K)}{bar(76, 86, 90, 8, K)}{bar(180, 86, 70, 7, M)}</g>,
  "language-switcher": <g>{box(80, 26, 140, 34, 8)}<circle cx={100} cy={43} r={8} fill="none" stroke={K} strokeWidth={1.6} /><path d="M92 43h16M100 35c-4 5-4 11 0 16 4-5 4-11 0-16" fill="none" stroke={K} strokeWidth={1.2} />{bar(116, 39, 50, 8, K)}{chev(202, 43)}{box(80, 66, 140, 86, 10)}{fill(86, 72, 128, 22, 5, "#F1F1F3")}{bar(98, 79, 50, 7, K)}{[104, 128].map((y) => bar(98, y, 60))}</g>,
  resize: <g>{box(70, 56, 160, 68, 10)}<text x={98} y={102} fontSize={26} fontWeight={700} fill={M} fontFamily="sans-serif">가</text><text x={138} y={104} fontSize={34} fontWeight={700} fill={K} fontFamily="sans-serif">가</text><text x={184} y={106} fontSize={44} fontWeight={700} fill={M} fontFamily="sans-serif">가</text></g>,
  "skip-link": <g>{fill(30, 30, 120, 30, 6, K)}{bar(44, 41, 90, 8, "#555860")}{box(30, 70, 240, 30, 0, W, "#EDEDEF")}{bar(44, 81, 50, 8, M)}{bar(44, 116, 200, 7, L)}{bar(44, 132, 150, 7, L)}</g>,
  tts: <g>{fill(70, 66, 160, 48, 24, K)}<path d="M96 82v16h7l9 8V74l-9 8z" fill={W} /><path d="M120 82a10 10 0 010 16" stroke={W} strokeWidth={2} fill="none" />{([[146, 6], [158, 12], [170, 8], [182, 16], [194, 10], [206, 6]] as const).map(([x, h]) => <g key={x}>{fill(x, 90 - h / 2, 4, h, 2, "#8B8C91")}</g>)}</g>,
};

/** 그림이 없는 부품(새로 추가될 때)용 기본 그림 */
const FALLBACK = <g>{box(80, 50, 140, 80, 10)}{bar(98, 74, 80, 8, K)}{bar(98, 92, 104, 6, L)}{bar(98, 106, 70, 6, L)}</g>;

export function ComponentArt({ id, className }: { id: string; className?: string }) {
  return (
    <svg viewBox="0 0 300 180" className={className} role="img" aria-hidden preserveAspectRatio="xMidYMid slice">
      <rect width={300} height={180} fill="#F6F6F7" />
      {ART[id] ?? FALLBACK}
    </svg>
  );
}

export const COMPONENT_ART_IDS = Object.keys(ART);

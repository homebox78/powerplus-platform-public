// 변환 단계 이름·순서 — 출처: powerDeck web/src/stages.ts (옛 화면 그대로 이식, eslint.config.js legacy 구역).
import type { Job } from "./api";

// 변환 단계 — 엔진(worker/prompt.md·prompt_design.md)이 같은 이름으로 보고한다. 이름을 바꾸면 양쪽을 함께 바꿀 것.
// 장표 제작 표준 절차(si-deck process.md 1~9단계) + autopilot 탐지 + 재검수.
export const STAGES: { name: string; label?: string; desc: string }[] = [
  { name: "준비", desc: "원본 보관 · 그림 압축 끄기" },
  { name: "실측", desc: "서체·색·크기·그림 실측, 전 장 렌더" },
  { name: "디자인 시스템", desc: "서체·팔레트·역할별 값 확정" },
  { name: "톤 통일", desc: "서체 → 넘침 → 색 → 크기" },
  { name: "이미지 분류", desc: "아이콘 · 다시 그릴 도식 · 유지" },
  { name: "에셋 교체", desc: "powerPlus 3D 아이콘·일러스트" },
  { name: "도식 재구성", desc: "그림으로 된 도식을 도형으로" },
  { name: "마감", desc: "줄바꿈 · 고아 줄 · 여백 · 가이드 정렬" },
  { name: "자동 탐지", desc: "56개 항목 탐지 → 고침 → 렌더 확인" },
  { name: "재검수", desc: "3회 · 9×10 점수표" },
  { name: "결과 정리", desc: "렌더 · 확인 목록 · 결과 파일" },
];
export const STAGE_PCT = [5, 10, 15, 25, 35, 45, 60, 70, 80, 88, 95, 100];

// design 작업의 기획·시안 단계 (worker/design.py 와 같은 값)
export const STAGES_PLAN: { name: string; label?: string; desc: string }[] = [
  { name: "준비", desc: "내용 읽기 (글 · md · 초안 pptx)" },
  { name: "기획", desc: "장 나누기 · 구성 · 참고 시안 고르기" },
  { name: "시안 생성", desc: "와이어프레임 A·B, 고른 장은 시안 이미지까지" },
  { name: "시안 정리", desc: "기획·시안 저장 · 확인 단계로" },
];
export const STAGE_PCT_PLAN = [2, 5, 20, 96, 100];

// 세로 제안서(제출용) — 시안 없이 기획에서 바로 PPT 를 조립한다(engine/vertical.py). 엔진이 보고하는 name 은 STAGES_PLAN 과 같고 화면 말만 다르다
export const STAGES_VERTICAL: { name: string; label?: string; desc: string }[] = [
  { name: "준비", desc: "자료 읽기 (RFP · 요약 · 메모)" },
  { name: "기획", label: "기획 · 본문 쓰기", desc: "RFP 목차대로 장·절, 콘텐츠 규칙 검사" },
  { name: "시안 생성", label: "PPT 조립", desc: "양식 + 도식 + 파워에셋 그림 — 시안 없이 바로" },
  { name: "시안 정리", label: "쪽 캡처", desc: "만든 PPT 를 쪽마다 그림으로" },
];
// 회사소개서(타입 G) — 레이아웃 카탈로그 → HTML 렌더 → 편집 가능한 PPT(engine/company.py). 엔진 보고 이름은 위와 같다
export const STAGES_COMPANY: { name: string; label?: string; desc: string }[] = [
  { name: "준비", desc: "회사 자료 읽기" },
  { name: "기획", label: "구성 · 카피", desc: "레이아웃 13종에 글 채우기 · 파워에셋 아이콘" },
  { name: "시안 생성", label: "HTML 렌더 → PPT", desc: "글·카드는 편집 가능한 도형으로, 빛·그라데이션은 배경 그림" },
  { name: "시안 정리", label: "쪽 캡처", desc: "만든 PPT 를 쪽마다 그림으로" },
];
const isSubmit = (j: Job) => j.opts?.purpose === "submit";

// design 작업의 장표 제작 단계 (prompt_design.md 가 쓰는 부분집합)
// name 은 엔진이 보고하는 이름(바꾸지 말 것), label·desc 는 화면에 보이는 말
export const STAGES_BUILD: { name: string; label?: string; desc: string }[] = [
  { name: "준비", desc: "확정 시안·기획 읽기" },
  { name: "디자인 시스템", label: "시안 실측", desc: "시안 요소의 위치·크기·색을 잰다" },
  { name: "도식 재구성", label: "시안대로 조립", desc: "잰 좌표 그대로 글·표·도형을 놓는다" },
  { name: "에셋 교체", label: "그림 넣기·시안 대조", desc: "시안 속 그림을 잘라 같은 자리에 — 없을 때만 powerPlus 에셋" },
  { name: "마감", desc: "글 넘침 · 정렬 · 줄간격" },
  { name: "자동 탐지", desc: "겹침·잘림·서체 확인" },
  { name: "재검수", desc: "시안과 나란히 다시 비교" },
  { name: "결과 정리", desc: "렌더 · 산출물 · 결과 파일" },
];

export const isPlanPhase = (j: Job) => j.kind === "design" && (j.phase ?? "plan") === "plan";
/** 시안 단계인가 — 시안 이미지가 나왔거나, 모든 장 와이어를 확정하고 시안을 그리는 중 */
export const hasMockup = (j: Job) => {
  if ((j.files?.mockup ?? []).some((f) => /.jpe?g$/i.test(f.name))) return true;
  const sl = j.plan?.slides ?? [];
  return (j.status === "running" || j.status === "queued") && sl.length > 0 && sl.every((s) => !!(s as { wire_pick?: string }).wire_pick);
};
export const stagesOf = (j: Job) => (isPlanPhase(j) ? (isSubmit(j) ? STAGES_VERTICAL : j.opts?.purpose === "company" ? STAGES_COMPANY : STAGES_PLAN) : j.kind === "design" ? STAGES_BUILD : STAGES);

/** 화면에 보일 단계 이름 — 엔진이 보고하는 이름(name)이 아니라 사용자 말(label) */
export const stageLabel = (j: Job) => { const s = stagesOf(j).find((x) => x.name === j.stage); return s ? (s.label ?? s.name) : (j.stage ?? "준비"); };

export const stageIndex = (s: string | null, list = STAGES) => (s ? list.findIndex((x) => x.name === s) : -1);

// 단계별 진행률 범위. 엔진이 엉뚱한 숫자를 보내도 화면·남은 시간은 이 범위 안에서 본다.
export const clampProgress = (stage: string | null, p: number, plan = false, build = false) => {
  if (build) return Math.max(1, Math.min(99, p));   // 엔진이 보고한 값 그대로
  const list = plan ? STAGES_PLAN : STAGES, pct = plan ? STAGE_PCT_PLAN : STAGE_PCT;
  const i = stageIndex(stage, list);
  if (i < 0) return p;
  return Math.max(pct[i]!, Math.min(pct[i + 1]! - 1, p));
};

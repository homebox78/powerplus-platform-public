// 기획을 기다리는 동안 읽는 장표 팁 — 한 줄씩 위로 넘어가는 뉴스 티커.
// 문구는 제안요청서 54건 분석(docs/rfp-분석결과)에서 뽑은 발표 장표 규칙.
// 마우스를 올리면 멈추고, 움직임 줄이기 설정이면 넘김 효과 없이 바뀐다.
import { useEffect, useState } from "react";
import { Ms } from "./ui";

const DECK_TIPS = [
  "목차는 평가 배점표 순서를 따릅니다 — 위원이 채점표와 장표를 1:1로 맞춰 봅니다.",
  "배점 10점 이상 항목은 평가요소 문구를 장표 제목에 그대로 씁니다.",
  "배점 상위 3개 항목에는 장표를 2장 이상 둡니다.",
  "첫 장표는 발주처가 제안요청서에 적은 수치 3~4개를 되돌려주며 시작합니다.",
  "발표 20분이면 15~18장이 알맞습니다 — 한 장에 60~80초.",
  "발표자료 분량 상한이 있으면 그 장 수를 넘기지 않습니다.",
  "발표자료는 제출한 제안서의 요약입니다 — 제안서에 없는 새 내용은 넣지 않습니다.",
  "블라인드 평가라면 회사명·로고를 지우고 '저희 제안사'라고 부릅니다.",
  "동영상 재생을 금지하는 사업이 많습니다 — 발표 규정부터 확인하세요.",
  "회사 홍보·임원 인사 장표는 평가 대상이 아닙니다.",
  "'할 수 있다·고려·검토' 같은 표현은 이행 불가로 보는 제안요청서가 많습니다.",
  "약속은 '하겠습니다' + 수치·기한으로 말합니다.",
  "발표는 PM이 직접 하는 것이 원칙인 사업이 대부분입니다.",
  "제안요청서에 반복해 나오는 말이 발주처가 가장 걱정하는 것입니다.",
  "요구사항 ID 분포를 보면 사업 유형이 보입니다 — 구축·운영·연구는 장표 중심이 다릅니다.",
  "발표 시간이 제안요청서에 없으면 공고문을 확인하세요.",
  "예상 질문은 배점이 큰 항목마다 하나 이상 준비하고, 근거 쪽수를 붙여 둡니다.",
  "약점은 숨기지 말고 극복 방안과 함께 보입니다.",
];

export function TipTicker({ tips = DECK_TIPS, interval = 6000 }: { tips?: string[]; interval?: number }) {
  const [i, setI] = useState(() => Math.floor(Math.random() * tips.length));
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setI((v) => (v + 1) % tips.length), interval);
    return () => clearInterval(t);
  }, [paused, tips.length, interval]);
  return (
    <div className="pd-ticker mt-3 flex items-center gap-3 rounded-md border border-line bg-ground-3 px-3 h-[38px]"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} aria-live="polite">
      <span className="flex-none inline-flex items-center gap-1 text-[12.5px] font-bold text-orange-d whitespace-nowrap">
        <Ms name="lightbulb" size={16} />장표 팁
      </span>
      <span className="vsep flex-none" />
      <div className="relative min-w-0 flex-1 h-full overflow-hidden">
        <div key={i} className="pd-ticker-line absolute inset-0 flex items-center text-[13.5px] text-ink2 truncate">
          <span className="truncate" title={tips[i]}>{tips[i]}</span>
        </div>
      </div>
      <span className="flex-none text-[12px] text-dim tabular-nums whitespace-nowrap">{i + 1} / {tips.length}</span>
      <button type="button" className="flex-none text-dim hover:text-ink" aria-label="다음 팁" onClick={() => setI((v) => (v + 1) % tips.length)}>
        <Ms name="chevron_right" size={18} />
      </button>
    </div>
  );
}

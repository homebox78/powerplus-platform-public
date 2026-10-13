# -*- coding: utf-8 -*-
"""에이전트가 진행 상황을 엔진에 알리는 도구. 웹 화면에 그대로 뜬다.

  pd.py stage "톤 통일" 35 "서체 3종 → 2종으로 정리"
  pd.py note "4쪽 표는 원본 유지(요청 사항)"
  pd.py warn "12쪽 이미지 도식은 재구성 불가 — 확인 목록에 올림"
"""
import json, os, sys, time

# 단계 이름 — web/src/stages.ts 와 같은 값. polish(다듬기)·design 제작 단계 + design 기획 단계
STAGES = ["준비", "실측", "디자인 시스템", "톤 통일", "이미지 분류", "자산 교체", "도식 재구성", "마감", "자동 탐지", "재검수", "결과 정리",
          "기획", "시안 생성", "시안 정리"]
path = os.environ.get("PD_PROGRESS") or os.path.join(os.getcwd(), "progress.jsonl")
a = sys.argv[1:]
d = {"ts": time.time()}
if not a:
    sys.exit("사용: pd.py stage <단계> <진행률> [메시지] | note <메시지> | warn <메시지>")
if a[0] == "stage":
    if len(a) < 3 or a[1] not in STAGES:
        sys.exit("단계 이름은 다음 중 하나: " + ", ".join(STAGES))
    d.update(stage=a[1], progress=int(a[2]), message=(a[3] if len(a) > 3 else f"{a[1]} 단계 시작"))
elif a[0] in ("note", "warn"):
    d.update(message=" ".join(a[1:]), kind="info" if a[0] == "note" else "warn")
else:
    sys.exit("알 수 없는 명령")
with open(path, "a", encoding="utf-8") as f:
    f.write(json.dumps(d, ensure_ascii=False) + "\n")
print("ok")

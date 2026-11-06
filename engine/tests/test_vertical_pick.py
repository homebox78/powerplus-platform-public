# -*- coding: utf-8 -*-
"""세로 제안서 표지·목차·간지 배경 고르기(pick_portrait) — 맞는 그림만 고르고, 없으면 None(→ 생성)인가.
  사용자 10-29 "파워에셋에서 골라서 맞는 게 없을 때 만들어야 함 · 테스트해 보니 안 맞는 게 많이 나와".
  ① 일반어(운영·관리·시스템)만 겹치는 그림은 고르지 않는다 — 예전엔 점수 0 이어도 최고점을 골랐다(음성 대조)
  ② 장 낱말(유전체)이 그림 키워드에 있으면 그 그림을 고른다
  ③ 목차도 사업 낱말(바이오)로 맞는 그림만
AI·서버 없음 — 자산 내려받기(_api)는 가짜."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import vertical as V

V._api = lambda *a, **k: b"IMG"
S3 = V.VP_SETS["3d"]
pool = [
    {"id": "a1", "name": "간지 배경 시스템 운영 관리", "keywords": ["운영", "관리", "시스템"], "set": S3},
    {"id": "a2", "name": "간지 배경 도시 야경", "keywords": ["도시", "야경"], "set": S3},
    {"id": "a3", "name": "간지 배경 유전체 분석", "keywords": ["유전체", "DNA", "분석"], "set": S3},
    {"id": "a4", "name": "목차 배경 바이오 연구실", "keywords": ["바이오", "연구실"], "set": S3},
    {"id": "a5", "name": "목차 배경 항구 물류", "keywords": ["항구", "물류"], "set": S3},
]
V._sg = lambda r: r.get("set")
FAILS = []


def check(ok, msg):
    print(("통과 " if ok else "실패 ") + msg)
    if not ok:
        FAILS.append(msg)


topic = "바이오 빅데이터 플랫폼 운영 bio big data"
# ① 장 낱말이 일반어뿐 — 어느 그림과도 의미 있게 안 겹친다
b, src = V.pick_portrait([p for p in pool if p["id"] in ("a1", "a2")], "div0", ["시스템 운영 관리 간지 배경", "운영", "관리"], set(), "3d", None, "플랫폼 운영 관리")
check(b is None, f"① 일반어만 겹치면 고르지 않음(생성으로) — 결과 {src}")
# ② 장 낱말 '유전체'
b, src = V.pick_portrait(pool, "div1", ["유전체 데이터 수집 간지 배경", "유전체", "수집"], set(), "3d", None, topic)
check(b is not None and "유전체" in str(src), f"② 장 낱말이 맞는 그림을 고름 — {src}")
# ③ 목차 — 사업 낱말(바이오)
b, src = V.pick_portrait(pool, "toc", ["목차 배경", "목차"], set(), "3d", None, topic)
check(b is not None and "바이오" in str(src), f"③ 목차는 사업 낱말로 맞는 그림 — {src}")
b, src = V.pick_portrait([p for p in pool if p["id"] == "a5"], "toc", ["목차 배경", "목차"], set(), "3d", None, topic)
check(b is None, f"③-2 사업과 안 맞는 목차 그림만 있으면 고르지 않음 — {src}")

print("전부 통과" if not FAILS else f"실패 {len(FAILS)}건")
sys.exit(1 if FAILS else 0)

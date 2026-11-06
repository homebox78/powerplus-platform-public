# -*- coding: utf-8 -*-
"""세로 제안서 본문 좌우 여백 = 머리 영역 좌우 끝 시험(R125).
  10-28 사용자 피드백 "세로 제안서 컨텐츠 좌우 여백이 너무 크다" — 본문은 2.04~17.04cm, 머리 영역은 로마자 배지 왼쪽(0.95~1.0)~사업명 끝(18.15).
  검사(테마 5가지 band·pill·tab·split·line + 레일 side)
  ① 본문 장 내용(머리·바닥 빼고)의 왼쪽 끝 = 배지 왼쪽(side 는 레일 안쪽 선), 오른쪽 끝 = 사업명 글 끝(±0.05cm)
  ② 그림·작은 아이콘은 가로세로 비율 그대로(맞추기 전과 1% 안)
  ③ 표 열 폭 합 = 표 폭(1% 안)
  ④ 정렬 검사(audit_align) 건수가 맞추기 전보다 늘지 않는다
  ⑤ 두 번 돌려도 한 번만(두 번째는 0)
  음성 대조: 맞추기 전 장표(widen_body 를 끈 조립)는 ① 이 실패해야 한다 — 검사기가 동작하는지부터 본다.

  python -X utf8 engine/tests/test_vertical_span.py     (전부 통과면 0)
가짜 기획(AI 없음)으로 실제 조립(Build)을 돌린다. 서버·PowerPoint·LibreOffice 없음."""
import io, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from PIL import Image  # noqa: E402
from pptx import Presentation  # noqa: E402
import tempfile  # noqa: E402
import vertical as V  # noqa: E402

FAILS = []
TMP = tempfile.mkdtemp(prefix="vspan-")


def check(ok, msg):
    print(("통과 " if ok else "실패 ") + msg)
    if not ok:
        FAILS.append(msg)


def logo():
    b = io.BytesIO()
    Image.new("RGB", (400, 100), (30, 60, 160)).save(b, "PNG")
    return b.getvalue()


o = {"project": {"name": "시험 정보시스템 위탁운영 및 유지관리 사업", "client": "시험 기관", "year": "2026", "doc": "기술제안서"},
     "chapters": [{"no": "Ⅰ", "title": "수행 조직", "sections": [{"title": "조직", "items": [{"title": "조직 구성"}]}]},
                  {"no": "※", "title": "별첨", "sections": []}]}
pg = {"title": "1.1 조직 구성", "lead": ["조직을 세웁니다.", "역할을 나눕니다."], "band": "띠", "blocks": [
    {"kind": "process", "head": "처리 절차", "fig": {"steps": [{"title": f"단계{k}", "items": ["접수", "보고"]} for k in range(1, 5)]}},
    {"kind": "table", "head": "점검 항목", "table": {"cols": ["항목", "내용", "주기"], "rows": [["계정", "미사용 계정 정리", "월 1회"], ["접속", "관제", "상시"]]}},
    {"kind": "cards", "head": "역할", "fig": {"cards": [{"title": "총괄", "items": ["보고 체계"]}, {"title": "보안", "items": ["취약점 점검"]}]}},
    {"kind": "kpi", "head": "목표", "fig": {"items": [{"value": "99.9%", "label": "가용성"}, {"value": "4시간", "label": "복구"}]}}]}


def build(st, widen=True):
    V._STATE.set({})
    V.use_fonts(None, None, "ko")
    keep = V.widen_body
    if not widen:
        V.widen_body = lambda prs: 0
    try:
        out = os.path.join(TMP, f"{st}_{int(widen)}.pptx")
        V.Build(json.loads(json.dumps(o)), {}, logo(), st, "navy").build({0: [json.loads(json.dumps(pg))]}, out)
    finally:
        V.widen_body = keep
    return Presentation(out)


def body(prs, m):
    return [s for s in prs.slides if s.slide_layout.slide_master is m and any(
        sh.has_text_frame and "1.1 조직 구성" in sh.text_frame.text for sh in s.shapes)]


def extent(prs):
    m, L, R = V.head_span(prs)
    xs = []
    for s in body(prs, m):
        for sh in s.shapes:
            if sh.top is None or not (V.Cm(1.6) < sh.top < V.Cm(26.3)):
                continue
            xs.append((sh.left / 360000, (sh.left + sh.width) / 360000))
    return L, R, min(a for a, _ in xs), max(b for _, b in xs)


def aspects(prs):
    m = V.head_span(prs)[0]
    out = []
    for s in body(prs, m):
        for sh in V.walk(s.shapes):
            if sh.shape_type == 13 or sh.name in ("육각형 42", "육각형 54", "아이콘"):
                x, y, w, h = V.abs_box(sh)
                out.append((sh.name, w / max(h, 1e-6)))
    return out


for st in ("band", "pill", "tab", "split", "line", "side"):
    old, new = build(st, False), build(st, True)
    L, R, lo, hi = extent(old)
    check(not (abs(lo - L) < 0.05 and abs(hi - R) < 0.05), f"{st} 음성 대조: 맞추기 전 본문 {lo:.2f}~{hi:.2f} ≠ 머리 {L:.2f}~{R:.2f}")
    L, R, lo, hi = extent(new)
    check(abs(lo - L) < 0.05 and abs(hi - R) < 0.05, f"{st} ① 본문 {lo:.2f}~{hi:.2f} = 머리 {L:.2f}~{R:.2f}")
    a0, a1 = aspects(old), aspects(new)
    bad = [(n, round(x, 3), round(y, 3)) for (n, x), (_, y) in zip(a0, a1) if abs(x - y) / x > 0.01]
    check(len(a0) == len(a1) and a0 and not bad, f"{st} ② 그림·아이콘 {len(a1)}개 비율 그대로 {bad[:3]}")
    tb = [sh for s in new.slides for sh in s.shapes if sh.has_table]
    tbad = [(sh.width, sum(c.width for c in sh.table.columns)) for sh in tb if abs(sum(c.width for c in sh.table.columns) - sh.width) > sh.width * 0.01]
    check(tb and not tbad, f"{st} ③ 표 {len(tb)}개 열 폭 합 = 표 폭 {tbad[:2]}")
    n0, n1 = len(V.audit_align(old)), len(V.audit_align(new))
    check(n1 <= n0, f"{st} ④ 정렬 검사 {n0} → {n1}건(늘지 않음)")
    check(V.widen_body(new) == 0, f"{st} ⑤ 두 번째 맞추기는 0")

print(f"\n실패 {len(FAILS)}건" if FAILS else "\n전부 통과")
sys.exit(1 if FAILS else 0)

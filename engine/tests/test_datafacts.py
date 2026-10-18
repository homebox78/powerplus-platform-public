# -*- coding: utf-8 -*-
"""자료 데이터 추출·와이어 다양성·시안 와이어 일치 판정 시험(2026-10-18 와이어 고도화 B, R64~R66).

  python -I -X utf8 engine/tests/test_datafacts.py      (전부 통과면 0 — deploy-engine.sh 가 배포 전에 돌린다)

AI 호출 없음 — AI 자리는 가짜 함수로 바꿔 끼운다. 가상 자료(한빛시 AI 민원상담 플랫폼, 지어낸 수치)는 fixtures/make_materials.py 가
임시 폴더에 새로 만든다(저장소의 fixtures/materials 사본과 같은 내용). pdf 시험은 reportlab·pdfplumber·한글 글꼴이 있을 때만."""
import io, json, os, sys, tempfile, base64

HERE = os.path.dirname(os.path.abspath(__file__))
ENGINE = os.path.dirname(HERE)
sys.path.insert(0, ENGINE)
sys.path.insert(0, os.path.join(HERE, "fixtures"))
import datafacts as F  # noqa: E402
import wirediv as V  # noqa: E402
import fidelity as Q  # noqa: E402
import design as D  # noqa: E402
import make_materials as M  # noqa: E402

TMP = tempfile.mkdtemp(prefix="facts-")
MAT = M.build(TMP)


def _rows(md):
    """마크다운 표 줄 → 칸 목록(앞뒤 | 떼고). 머리 구분 줄은 뺀다"""
    out = []
    for l in md.splitlines():
        if l.startswith("|") and not l.startswith("|---"):
            out.append([c.strip() for c in l.strip()[1:-1].split("|")])
    return out


def _fx():
    return F.facts_from_docs([(os.path.basename(p), p, D.doc_text(p)) for p in MAT.values()])


# ── B1 글 뽑기: 표 칸이 제자리에 ──
def test_xlsx_keeps_empty_cells():
    t = D.doc_text(MAT["xlsx"])
    rows = _rows(t)
    r = next(r for r in rows if r[0] == "2023-03")
    assert r == ["2023-03", "1910", "", "649"], f"빈 칸이 빠져 열이 밀렸다: {r}"   # 전화 칸 비움 → 온라인 649 는 넷째 칸
    assert "## 시트 월별 민원 건수" in t and "## 시트 유형·처리시간" in t
    assert any(r[:3] == ["전화 상담 대기", "12.4", "2.1"] for r in rows)


def test_docx_table_in_place():
    t = D.doc_text(MAT["docx"])
    rows = _rows(t)
    assert ["기관", "상담 인력(명)", "일평균 문의(건)", "평균 대기(분)"] in rows
    assert ["동부구청", "9", "610", "13.8"] in rows
    assert t.index("기관별 현황") < t.index("| 본청 민원과") < t.index("표 아래 문단"), "표가 본문 제자리에 있지 않다"


def test_hwpx_table_cells():
    t = D.doc_text(MAT["hwpx"])
    rows = _rows(t)
    assert ["문항", "2024년", "2025년"] in rows and ["안내 정확도", "3.4", "3.8"] in rows, t
    assert "추진 배경" in t and t.index("시민 만족도 조사 결과") < t.index("| 문항")


def test_pptx_chart_values():
    t = D.doc_text(MAT["pptx"])
    assert "차트:" in t and "21,400" in t and "22,000" in t, t[:400]
    assert ["상담 응답률(%)", "71.4", "95"] in _rows(t)


def test_pdf_table():
    if "pdf" not in MAT:
        print("    (pdf 건너뜀 — reportlab·한글 글꼴 없음)")
        return
    try:
        import pdfplumber  # noqa: F401
    except ImportError:
        print("    (pdf 표 건너뜀 — pdfplumber 없음, 글만 읽힌다)")
        return
    t = D.doc_text(MAT["pdf"])
    assert "### 표 (1쪽)" in t and ["응답 속도", "2.9", "3.6"] in _rows(t), t[-400:]


# ── B1 데이터셋·수치 ──
def test_datasets_found():
    fx = _fx()
    by = {d["title"]: d for d in fx["datasets"]}
    m = by["월별 민원 건수"]
    assert m["kind_hint"] == "trend" and len(m["rows"]) == 36 and m["unit"] == "건"
    assert m["rows"][-1] == ["2025-12", 3410.0, round(3410 - round(3410 * 0.58)), round(3410 * 0.58)]
    assert m["rows"][2][2] is None, "빈 칸은 None 으로(0 이 아니다)"
    tot = by["월별 민원 건수 — 연도별 합계"]
    assert tot["derived"] and [r[0] for r in tot["rows"]] == ["2023년", "2024년", "2025년"]
    assert tot["rows"][1][1] == sum(M.MONTHLY[2024]) and tot["rows"][0][2] is None, "빈 칸이 든 해의 합은 만들지 않는다"
    sh = by["유형별 민원 구성비"]
    assert sh["kind_hint"] == "share" and abs(sum(r[1] for r in sh["rows"]) - 100) < 0.01
    ba = next(d for d in fx["datasets"] if d["kind_hint"] == "before_after")
    assert ba["rows"] == [[a, b, c] for a, b, c in M.TIME] and ba["unit"] == "분"
    tg = next(d for d in fx["datasets"] if d["kind_hint"] == "target")
    assert tg["series"] == ["현재", "목표"], "현재·목표 표는 전후가 아니라 목표 대비"
    ch = next(d for d in fx["datasets"] if d.get("from_chart"))
    assert ch["kind_hint"] == "trend" and ch["title"] == "채널별 상담 건수 추이" and ch["rows"][0] == ["2021", 21400.0, 3100.0]
    ag = next(d for d in fx["datasets"] if d["title"] == "기관별 현황")
    assert ag["unit"] == "" and ag["series"][0] == "상담 인력(명)", "열마다 단위가 다르면 하나로 묶지 않는다"


def test_prose_facts():
    fx = _fx()
    pv = {(f["value"], f["unit"]) for f in fx["facts"] if not f.get("dataset")}
    for want in ((71.4, "%"), (3.2, "점"), (18.0, "억원"), (10.0, "개월"), (40.0, "명"), (2740.0, "건")):
        assert want in pv, f"글 속 수치 {want} 없음 — {sorted(pv)[:20]}"
    f = next(f for f in fx["facts"] if f["value"] == 71.4 and not f.get("dataset"))
    assert f["period"] == "2025년" and "71.4%" in f["quote"] and len(f["quote"]) <= 80
    assert all(f["id"].startswith("F") for f in fx["facts"]) and all(d["id"].startswith("D") for d in fx["datasets"])


def test_negative_controls():
    """숫자 없는 표·글에서는 아무것도 나오지 않는다(측정기가 '다 통과'만 내지 않는지)"""
    t = {"file": "x.docx", "where": "", "title": "", "rows": [["항목", "내용"], ["보안", "암호화 적용"], ["운영", "24시간 관제"]]}
    assert F.datasets_from_table(t) == []
    assert F.prose_facts("이 사업은 시민 중심의 상담 체계를 만든다. 1분기 착수, 3분야 개선.") == [], "'1분기'·'3분야'를 수치로 읽었다"
    assert F.num("1분기") == (None, "") and F.num("12.5%") == (12.5, "%") and F.num("1,820") == (1820.0, "")


def test_labels_cannot_change_values():
    fx = _fx()
    pf = [f for f in fx["facts"] if not f.get("dataset")]
    a, b = pf[0], pf[1]
    ans = json.dumps({"labels": [{"id": a["id"], "metric": "콜센터 응답률", "period": "2025년", "value": 99},
                                 {"id": b["id"], "keep": False}, {"id": "F999", "metric": "없는 후보"}]}, ensure_ascii=False)
    v0 = a["value"]
    n = F.apply_labels(fx["facts"], "설명 글 ```json\n" + ans + "\n```")
    assert n == 2 and a["metric"] == "콜센터 응답률" and a["value"] == v0, "AI 가 값을 바꿨다"
    assert all(f["id"] != b["id"] for f in fx["facts"])
    assert F.apply_labels(fx["facts"], "{깨진 json") == 0 and F.apply_labels(fx["facts"], '{"labels": "x"}') == 0
    assert F.label_prompt([]) == ""


def test_slide_data_and_catalog():
    fx = _fx()
    cat = F.catalog_text(fx)
    assert "[trend] 월별 민원 건수" in cat and "D" in cat and "F" in cat
    d1 = next(d for d in fx["datasets"] if d["kind_hint"] == "before_after")["id"]
    s = {"n": 3, "title": "상담 대기", "content": "x", "data": [d1]}
    t = F.slide_data_text(s, fx)
    assert "전화 상담 대기 | 12.4 | 2.1" in t and "유형 before_after" in t
    auto = {"n": 4, "title": "", "content": "기관별 일평균 문의는 본청 1,240건, 동부구청 610건이다."}   # data 없음 → 글 속 수치로 짝
    ds, _ = F.slide_refs(auto, fx)
    assert ds and ds[0]["title"] == "기관별 현황"
    assert F.slide_data_text({"n": 5, "content": "숫자 없음"}, fx) == ""
    src = F.sources_text(fx)
    assert "29,940건" in src, "계산한 연도별 합계가 근거 글에 없다"


def test_fact_check_uses_raw_and_data():
    fx = _fx()
    plan = {"slides": [{"n": 1, "title": "민원이 늘었다", "message": "", "content": "2024년 29,940건, 콜 대기 12.4분, 예측 5,555건"}]}
    D.fact_check(plan, "요약에는 수치가 없다", "원문 12.4분\n" + F.sources_text(fx))
    ck = " ".join(plan["slides"][0]["checks"])
    assert "29,940" not in ck and "12.4" not in ck, ck
    assert "5,555" in ck, "자료에 없는 수치를 놓쳤다(음성 대조)"


# ── B2 다양성 ──
def _w(*boxes):
    return [dict(id=f"w{i}", k=k, x=x, y=y, w=w, h=h, t=t, d=d) for i, (k, x, y, w, h, t, d) in enumerate(boxes, 1)]


CARDS = lambda: _w(("card", 2, 15, 30, 60, "가", "- a\n- b"), ("card", 35, 15, 30, 60, "나", "- a\n- b"), ("card", 68, 15, 30, 60, "다", "- a\n- b"), ("band", 2, 88, 96, 9, "결론", ""))   # noqa: E731


def test_diversity_flags_repetition():
    slides = [{"n": i, "wire": CARDS()} for i in range(1, 6)]
    slides[2]["data"] = ["D1"]
    slides[3]["wire_checks"] = ["수치가 4개인데 글 상자로만 짰습니다 — chart·kpi·table·gauge·progress 가운데 하나로 수치를 보이세요", "결론 띠가 둘 이상입니다"]
    fl = V.flag(slides)
    assert set(fl) == {2, 3, 4, 5}, fl
    assert any("같은 배치" in t for t in fl[2])
    assert any("수치 그림이 없습니다" in t for t in fl[3]) and any("글 상자로만" in t for t in fl[4])
    assert not any("결론 띠" in t for t in fl[4]), "데이터 규칙이 아닌 배치 검사까지 다시 짜기 사유로 넣었다"
    assert any("덱에서 5번" in t for t in fl[3])
    p = V.pick(fl, 5)
    assert p == [3] or p == [4], p   # 30% 상한(5장 → 1장), 데이터 문제 장 먼저


def test_diversity_passes_diverse_deck():
    """음성 대조 — 장마다 관계·배치가 다르면 아무 장도 걸리지 않는다"""
    slides = [
        {"n": 1, "wire": _w(("chart", 2, 14, 64, 70, "추이", "유형: line\n2023 | 1\n2024 | 2"), ("kpi", 68, 14, 30, 30, "", "10 | a\n20 | b"))},
        {"n": 2, "wire": _w(("dodont", 2, 14, 96, 60, "전후", "기존 | a\n개선 | b"), ("band", 2, 88, 96, 9, "결론", ""))},
        {"n": 3, "wire": _w(("table", 2, 14, 60, 70, "비교", "a | b\n1 | 2"), ("quote", 64, 14, 34, 40, "말", "— 설문"))},
        {"n": 4, "wire": _w(("swimlane", 2, 14, 96, 70, "절차", "주체 | 1\nA | x"))},
        {"n": 5, "wire": _w(("chart", 2, 14, 40, 70, "구성", "유형: donut\na | 60\nb | 40"), ("card", 44, 14, 54, 70, "까닭", "- a\n- b"))},
    ]
    slides[0]["data"] = ["D1"]
    assert V.flag(slides) == {}, V.flag(slides)
    assert V.main_key(slides[0]["wire"]) == "chart:line" and V.main_key(slides[4]["wire"]) == "chart:donut"


def test_diversify_keeps_better():
    """다시 짜기 — 새 안이 나으면 바꾸고, 낫지 않으면 그대로(가짜 one)"""
    class J:
        text_engine, facts, budget, spent = "api", {}, None, 0.0
        ev = []

        def event(self, m, kind="info"):
            self.ev.append(m)
    D.W.setdefault("CFG", {})
    slides = [{"n": i, "wire": CARDS(), "wire_checks": []} for i in range(1, 7)]
    plan = {"slides": slides}
    new = _w(("chart", 2, 14, 64, 70, "추이", "유형: line\n2023 | 1\n2024 | 2"), ("text", 68, 14, 30, 60, "요점", "a\nb"))
    calls = []

    def one_new(g, shape_a=None, notes=None):
        calls.append(sorted(notes))
        return {s["n"]: (new, [], "", "추이: 시험") for s in g}
    j = J()
    D.diversify_wires(j, plan, one_new)
    changed = [s["n"] for s in slides if s["wire"] is new]
    assert calls and changed == calls[0] and len(changed) == 1, (calls, changed)   # 6장의 30% → 1장
    assert slides[changed[0] - 1]["wire_why"] == "추이: 시험" and slides[changed[0] - 1]["wire_ai"] is new
    assert any("1/1장 바꿈" in e for e in j.ev), j.ev
    # 음성 대조 — 새 안이 같은 카드 나열이면(나아지지 않음) 바꾸지 않는다
    slides2 = [{"n": i, "wire": CARDS(), "wire_checks": []} for i in range(1, 7)]
    before = [s["wire"] for s in slides2]
    j2 = J()
    j2.ev = []
    D.diversify_wires(j2, {"slides": slides2}, lambda g, shape_a=None, notes=None: {s["n"]: (CARDS(), [], "", "") for s in g})
    assert all(a is s["wire"] for a, s in zip(before, slides2)) and any("앞 와이어 유지" in e for e in j2.ev), j2.ev


def test_make_wires_data_and_rewire():
    """make_wires 통합 — 장마다 실제 데이터 덩어리가 AI 글에 들어가고, 덱이 카드만 반복하면 걸린 장을 '[다시 짜기]'로 한 번 더(가짜 AI·서버)"""
    class J:
        text_engine, budget, spent, id, cancel = "api", None, 0.0, "j", False
        ev = []

        def event(self, m, kind="info"):
            self.ev.append(m)
    j = J()
    j.facts = _fx()
    D.W.update(HERE=ENGINE, CFG={})
    seen = []

    def fake_ai(job, kind, body, timeout=320):
        u = body["messages"][1]["content"]
        seen.append(u)
        ns = [int(x) for x in __import__("re").findall(r"^## (\d+)쪽", u, __import__("re").M)]
        return {"choices": [{"message": {"content": json.dumps({"slides": [{"n": n, "why": "t", "rewire": "[다시 짜기]" in u} for n in ns]})}}]}

    def fake_req(method, path, body=None, timeout=60):
        assert path == "/worker/wire/layout"
        out = []
        for x in body["slides"]:
            w = _w(("chart", 2, 14, 64, 70, "추이", "유형: line\n2023 | 1\n2024 | 2"), ("kpi", 68, 14, 30, 30, "", "10 | a\n20 | b")) if x.get("rewire") else CARDS()
            out.append(dict(x, wire=w, wire_checks=[]))
        return {"slides": out}
    oa, orq = D.ai, D.W.get("req")
    D.ai, D.W["req"] = fake_ai, fake_req
    try:
        d1 = next(d for d in j.facts["datasets"] if d["kind_hint"] == "trend")["id"]
        plan = {"title": "t", "slides": [{"n": i, "title": f"장 {i}", "content": "내용", "message": "m", **({"data": [d1]} if i == 2 else {})} for i in range(1, 7)]}
        D.make_wires(j, plan)
        first = [u for u in seen if "[다시 짜기]" not in u]
        assert any("데이터(올린 자료의 실제 값" in u and "2025-12 | 3,410" in u for u in first), "2쪽의 데이터 표가 와이어 AI 글에 없다"
        again = [u for u in seen if "[다시 짜기]" in u]
        assert again and "2쪽" in again[0] and "수치 그림이 없습니다" in again[0], "데이터 장이 먼저 다시 짜이지 않았다"
        assert V.main_key(plan["slides"][1]["wire"]) == "chart:line", "다시 짠 안(그래프)이 더 나은데 바꾸지 않았다"
    finally:
        D.ai = oa
        if orq is not None:
            D.W["req"] = orq


def test_make_wires_batch_failure_retry_and_auto():
    """E2E 382 — 묶음 응답이 비면(생각이 출력 한도를 다 씀) 장마다 다시 요청하고, 그래도 못 받은 장은 기획 내용으로 자동 배치(빈 wire 로 남기지 않는다)"""
    class J:
        text_engine, budget, spent, id, cancel = "api", None, 0.0, "j", False

        def __init__(self):
            self.ev = []

        def event(self, m, kind="info"):
            self.ev.append(m)
    j = J()
    j.facts = None
    D.W.update(HERE=ENGINE, CFG={})
    import re as _re
    calls = []

    def fake_ai(job, kind, body, timeout=320):
        u = body["messages"][1]["content"]
        ns = [int(x) for x in _re.findall(r"^## (\d+)쪽", u, _re.M)]
        calls.append(ns)
        if len(ns) > 1 or 5 in ns:   # 묶음은 늘 빈 응답, 5쪽은 혼자 보내도 잘린 응답
            return {"choices": [{"message": {"content": "" if len(ns) > 1 else '{"slides":[{"n":5'}, "finish_reason": "stop" if len(ns) > 1 else "length"}]}
        return {"choices": [{"message": {"content": json.dumps({"slides": [{"n": n, "why": "t"} for n in ns]})}}]}

    def fake_req(method, path, body=None, timeout=60):
        return {"slides": [dict(x, wire=_w(("card", 2, 15, 46, 60, "요점", "- 가\n- 나"), ("chart", 50, 15, 48, 60, "추이", "2024 | 1\n2025 | 2")), wire_checks=[]) for x in body["slides"]]}
    oa, orq = D.ai, D.W.get("req")
    D.ai, D.W["req"] = fake_ai, fake_req
    try:
        plan = {"title": "t", "slides": [{"n": i, "title": f"장 {i}", "content": "## 현황\n- 상담 37,000건\n## 방안\n- 통합 창구", "message": "m"} for i in range(4, 7)]}
        D.make_wires(j, plan, only_empty=True)
        assert all(s.get("wire") for s in plan["slides"]), "빈 wire 가 남았다"
        assert [4, 5, 6] in calls and [4] in calls and [5] in calls and [6] in calls, f"장마다 다시 요청하지 않았다: {calls}"
        s5 = plan["slides"][1]
        assert any("자동 배치" in c for c in s5["wire_checks"]) and {b["t"] for b in s5["wire"]} >= {"현황", "방안"}, s5
        assert plan["slides"][0]["wire"][1]["k"] == "chart", "다시 받은 4쪽 와이어가 아니다"
    finally:
        D.ai = oa
        if orq is not None:
            D.W["req"] = orq
    # 음성 대조 — 멀쩡한 응답은 통과, 빈 응답·잘린 응답은 실패
    D.wire_reply_ok({"choices": [{"message": {"content": "{}"}, "finish_reason": "stop"}]})
    for bad in ({"choices": [{"message": {"content": ""}}]}, {"choices": [{"message": {"content": "{\"slides\":["}, "finish_reason": "length"}]}):
        try:
            D.wire_reply_ok(bad)
            assert False, "빈·잘린 응답을 통과시켰다"
        except ValueError:
            pass


def test_fact_check_false_positives():
    """E2E 382 오탐 — 조사('에서')를 지표로 · 현재값/목표값 짝을 '장마다 다름'으로 · 자료 표의 95(행 이름에 %)를 '없다'로. 지어낸 37,950건은 계속 잡는다"""
    fx = {"datasets": [{"id": "D9", "title": "목표 지표", "unit": "", "series": ["현재", "목표"], "rows": [["상담 응답률(%)", 71.4, 95.0], ["시민 만족도(점)", 3.2, 4.3]]},
                       {"id": "D1", "title": "연도별 상담", "unit": "건", "rows": [["전화", 15950], ["채팅", 22000], ["전체", 37000]]}], "facts": []}
    plan = {"slides": [
        {"n": 1, "title": "현황", "content": "상담은 2023년 30,000건에서 2025년 37,000건으로 늘었다. 응답률은 71.4%, 만족도 3.2점이다."},
        {"n": 2, "title": "채널", "content": "채팅은 15,000건에서 2025년 22,000건으로 늘었다. 합치면 37,950건이다."},
        {"n": 3, "title": "목표", "content": "응답률 95% 달성, 만족도 4.3점으로 높인다."},
        {"n": 4, "title": "요약", "content": "현재 응답률 71.4%, 목표 응답률 95%"}]}
    D.fact_check(plan, "연도별 상담 2023 30,000건 채팅 15,000건 2023년", F.sources_text(fx))
    allc = [c for s in plan["slides"] for c in s.get("checks") or []]
    assert not any("'에서'" in c for c in allc), allc
    assert not any("응답률' 수치가" in c or "만족도' 수치가" in c for c in allc), allc
    assert not any("'95%'" in c for c in allc), allc
    assert any("37,950" in c for c in allc), "지어낸 합계 37,950건을 놓쳤다"
    # 음성 대조 — 목표 표현도 자료 짝도 없이 같은 지표가 장마다 다르면 여전히 잡는다
    bad = {"slides": [{"n": 1, "title": "a", "content": "처리율 71%를 보였다."}, {"n": 2, "title": "b", "content": "처리율 64%를 보였다."}]}
    D.fact_check(bad, "2024 처리율 71%\n2025 결과 64%")   # 두 값이 자료의 다른 줄 — 현재·목표 짝이 아니다
    assert any("'처리율' 수치가 장마다 다릅니다" in c for s in bad["slides"] for c in s.get("checks") or []), bad


def test_e2e742_cards_series_dates():
    """2차 E2E 742 — 같은 꼴 수치 카드 4개 · 같은 해 두 계열 그래프 2개를 잡고(엔진·서버 같은 글), 날짜 2025.12 는 자료의 2025-12 로 맞춘다. 음성 대조 포함"""
    cards = _w(("card", 2, 15, 14, 40, "본청", "- 인력 18명\n- 일평균 1,240건"), ("card", 18, 15, 14, 40, "동부", "- 인력 9명\n- 일평균 610건"),
               ("card", 34, 15, 14, 40, "서부", "- 인력 8명\n- 일평균 570건"), ("card", 50, 15, 14, 40, "공단", "- 인력 5명\n- 일평균 320건"))
    assert len(V.same_cards(cards)) == 4
    mixed = _w(("card", 2, 15, 30, 40, "현황", "- 인력 18명\n- 일평균 1,240건"), ("card", 34, 15, 30, 40, "문제", "- 기관별 따로 응대\n- 대기 편차"), ("card", 66, 15, 30, 40, "방향", "- 한 창구"))
    assert not V.same_cards(mixed), "모양이 다른 카드를 같은 꼴로 봤다(음성 대조)"
    two = _w(("chart", 2, 15, 46, 50, "전화", "유형: bar\n2021 | 21,400\n2022 | 22,100\n2023 | 16,100\n2024 | 16,500\n2025 | 15,950"),
             ("chart", 50, 15, 48, 50, "온라인", "유형: bar\n2021 | 3,100\n2022 | 4,800\n2023 | 8,300\n2024 | 13,500\n2025 | 22,000"))
    assert V.split_series(two) and V.split_series(two)[1][0] == "2021"
    one = _w(("chart", 2, 15, 96, 50, "채널", "유형: line\n구분 | 전화 | 온라인\n2021 | 21,400 | 3,100\n2022 | 22,100 | 4,800\n2023 | 16,100 | 8,300"))
    other = _w(("chart", 2, 15, 46, 50, "연도", "2021 | 1\n2022 | 2\n2023 | 3"), ("chart", 50, 15, 48, 50, "기관", "본청 | 1\n동부 | 2\n서부 | 3"))
    assert not V.split_series(one) and not V.split_series(other), "계열 2개 한 그래프·범주가 다른 두 그래프는 걸리면 안 된다(음성 대조)"
    fl = V.flag([{"n": 3, "wire": two}, {"n": 4, "wire": cards}])
    assert any("두 계열을 그래프 2개로" in t for t in fl[3]) and any("같은 꼴 수치 카드 4개" in t for t in fl[4]), fl
    assert set(V.pick(fl, 10)) == {3, 4}
    # 다시 짜기 판정 — chart:bar → chart:bar 로 바꿔도 여전히 둘로 쪼갰으면 낫지 않다, 한 그래프로 합치면 낫다
    slides = [{"n": 3, "wire": two}]
    assert V.score(slides, 3, one, []) < V.score(slides, 3, two, [])
    # 날짜 — 자료의 2025-12 와 같은 시점이면 넘어가고, 자료에 없는 시점만 알린다
    plan = {"slides": [{"n": 2, "title": "월별", "content": "[2023.01] 1,820건에서 [2025.12] 3,410건으로 늘었다. 2027.03 목표."}]}
    D.fact_check(plan, "월 | 건수\n2023-01 | 1,820건\n2025-12 | 3,410건")
    cs = plan["slides"][0]["checks"]
    assert not any("2025.12" in c or "2023.01" in c for c in cs), cs
    assert any("2027.03" in c for c in cs), f"자료에 없는 날짜를 놓쳤다(음성 대조): {cs}"


def test_check_mockup_empty_wire_warns():
    """와이어가 빈 장 — 판정을 말없이 건너뛰지 않고 '와이어 없음' 경고를 남긴다"""
    class J:
        budget, spent = None, 0.0

        def __init__(self):
            self.ev = []

        def event(self, m, kind="info"):
            self.ev.append((m, kind))
    j = J()
    D.W.update(CFG={})
    png, r = D.check_mockup(j, {"n": 4, "wire": []}, b"png", lambda fix: b"x")
    assert png == b"png" and r is None and any("와이어 없음" in m and k == "warn" for m, k in j.ev), j.ev


def test_mockup_fit_sends_two_images():
    """판정 호출 — 그림 두 장(와이어 스케치·시안)을 kind check 로, 답을 읽는다"""
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (1600, 900), "white").save(buf, "PNG")
    got = {}

    def fake_ai(job, kind, body, timeout=320):
        got.update(kind=kind, parts=body["messages"][1]["content"])
        return {"choices": [{"message": {"content": '{"score": 77, "layout_ok": true}'}}]}
    oa = D.ai
    D.ai = fake_ai
    try:
        class J:
            ev = []

            def event(self, m, kind="info"):
                self.ev.append(m)
        r = D.mockup_fit(J(), {"n": 1, "wire": _w(("chart", 2, 14, 64, 70, "추이", "2023 | 10\n2024 | 20"))}, buf.getvalue())
        assert r["score"] == 77 and got["kind"] == "check"
        imgs = [p for p in got["parts"] if p.get("type") == "image_url"]
        assert len(imgs) == 2 and all(p["image_url"]["url"].startswith("data:image/jpeg;base64,") for p in imgs)
    finally:
        D.ai = oa


# ── B3 시안 와이어 일치 ──
def test_fidelity_parse_robust():
    assert Q.parse('```json\n{"score": 86, "layout_ok": true, "numbers_ok": true, "missing": []}\n```')["score"] == 86
    assert Q.parse('판정: {"score": "62", "layout_ok": "false", "missing": "연도별 건수, 결론"}') == {
        "score": 62, "layout_ok": False, "numbers_ok": True, "missing": ["연도별 건수", "결론"], "extra": [], "moved": [], "note": ""}
    assert Q.parse('{"score": 0.9}')["score"] == 90
    assert Q.parse('{"score": 140}')["score"] == 100
    assert Q.parse('{"score": null, "error": "no_vision"}') is None
    assert Q.parse("I cannot see images.") is None and Q.parse("") is None
    assert Q.parse("Score: 55 — layout differs")["score"] == 55
    assert Q.need_retry(Q.parse('{"score": 80, "layout_ok": false}')) and not Q.need_retry(Q.parse('{"score": 80}'))
    assert Q.better(Q.parse('{"score": 60}'), Q.parse('{"score": 75}')) and not Q.better(Q.parse('{"score": 80}'), Q.parse('{"score": 75}'))


def test_fidelity_prompts():
    w = _w(("chart", 2, 14, 64, 70, "연도별 민원 건수", "2023 | 23,900\n2024 | 29,940\n증가 25.3%"), ("band", 2, 88, 96, 9, "결론", ""),
           ("kpi", 68, 14, 30, 30, "", "71.4% | 응답률"))
    lock = Q.layout_lock(w)
    assert "exactly 3 blocks" in lock and lock.index("CHART") < lock.index("KPI") < lock.index("BAND"), "읽는 순서(위→아래, 왼→오)"
    p = Q.prompt(w, Q.wire_numbers(w))
    assert "29,940" in p and "71.4%" in p and "25.3%" in p
    fx = Q.fix_text(Q.parse('{"score": 40, "layout_ok": false, "numbers_ok": false, "missing": ["연도별 민원 건수"]}'))
    assert "연도별 민원 건수" in fx and "exactly as written" in fx
    assert Q.layout_lock([]) == "" and Q.fix_text(None) == ""


def test_check_mockup_retry_and_budget():
    class J:
        budget, spent, id = None, 0.0, "t"
        ev = []

        def event(self, m, kind="info"):
            self.ev.append(m)
    D.W.setdefault("CFG", {})
    s = {"n": 2, "wire": _w(("chart", 2, 14, 64, 70, "a", "1 | 10\n2 | 20"))}
    seq = iter([Q.parse('{"score": 40, "layout_ok": false}'), Q.parse('{"score": 88}')])
    orig = D.mockup_fit
    D.mockup_fit = lambda job, s, png: next(seq)
    try:
        png, r = D.check_mockup(J(), s, b"old", lambda fix: b"new" if "PREVIOUS ATTEMPT" in fix else b"bad")
        assert png == b"new" and r["score"] == 88
        seq = iter([Q.parse('{"score": 50}'), Q.parse('{"score": 45}')])
        png, r = D.check_mockup(J(), s, b"old", lambda fix: b"new")
        assert png == b"old" and r["score"] == 50, "다시 그린 쪽이 더 나쁘면 앞 시안"
        seq = iter([Q.parse('{"score": 91}')])
        made = []
        png, r = D.check_mockup(J(), s, b"old", lambda fix: made.append(1) or b"new")
        assert png == b"old" and not made, "통과한 시안을 다시 그렸다"
        j = J()
        j.budget, j.spent = 1.0, 0.95
        png, r = D.check_mockup(j, s, b"old", lambda fix: b"new")
        assert r is None and png == b"old", "한도 90% 를 넘겼는데 판정했다"
        png, r = D.check_mockup(J(), {"n": 3}, b"old", lambda fix: b"new")
        assert r is None, "와이어 없는 장"
    finally:
        D.mockup_fit = orig


def test_extract_facts_cache():
    """facts.json — 처음엔 만들어 올리고, 같은 자료면 다시 만들지 않는다(가짜 서버·AI)"""
    jd = tempfile.mkdtemp(prefix="job-")
    os.makedirs(os.path.join(jd, "_docs"))
    puts, ai_calls = [], []

    class J:
        id, dir, doc_sig, spent, budget, cancel = "j1", jd, "1,2,3", 0.0, None, False
        doc_files = [(os.path.basename(p), p, D.doc_text(p)) for p in MAT.values()]
        ev = []

        def event(self, m, kind="info"):
            self.ev.append(m)

    def no_dl(path, dest):
        raise OSError("404")
    D.W.update(download=no_dl, put_file=lambda jid, kind, p, name=None, slide=None: puts.append(name))
    orig = D.ai
    D.ai = lambda job, kind, body, timeout=320: ai_calls.append(kind) or {"choices": [{"message": {"content": '{"labels": []}'}}]}
    try:
        fx = D.extract_facts(J())
        assert fx["datasets"] and puts == ["facts.json"] and ai_calls == ["digest"]
        fx2 = D.extract_facts(J())
        assert fx2["datasets"] == fx["datasets"] and ai_calls == ["digest"], "같은 자료인데 다시 만들었다"
        J.doc_sig = "9"
        D.extract_facts(J())
        assert ai_calls == ["digest", "digest"], "자료가 바뀌었는데 옛 사본을 썼다"
    finally:
        D.ai = orig


def main():
    tests = [(k, v) for k, v in globals().items() if k.startswith("test_") and callable(v)]
    bad = 0
    for k, fn in tests:
        try:
            fn()
            print(f"통과  {k}")
        except Exception as e:      # noqa: BLE001
            bad += 1
            import traceback
            traceback.print_exc()
            print(f"실패  {k}: {type(e).__name__}: {e}")
    print(f"{len(tests) - bad}/{len(tests)} 통과 · 자료 {TMP}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())

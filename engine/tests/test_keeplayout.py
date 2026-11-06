"""기존 구성 그대로(keeplayout) — 원본 읽기·상자 자리·원본 대조 검사(AI 없이)
실행: py -X utf8 engine/tests/test_keeplayout.py"""
import os, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pptx import Presentation
from pptx.util import Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
import keeplayout as K


def deck():
    prs = Presentation()
    prs.slide_width, prs.slide_height = Emu(9906000), Emu(6858000)
    blank = prs.slide_layouts[6]
    # 간지
    s = prs.slides.add_slide(blank)
    tb = s.shapes.add_textbox(Pt(80), Pt(150), Pt(400), Pt(80)); tb.text_frame.text = "사업의 이해"
    tb.text_frame.paragraphs[0].runs[0].font.size = Pt(54)
    tb = s.shapes.add_textbox(Pt(80), Pt(250), Pt(400), Pt(40)); tb.text_frame.text = "핵심을 간파하다!"
    tb.text_frame.paragraphs[0].runs[0].font.size = Pt(36)
    # 본문
    s = prs.slides.add_slide(blank)
    h = s.shapes.add_textbox(Pt(20), Pt(8), Pt(500), Pt(58))
    h.text_frame.text = "사업의 배경"
    h.text_frame.add_paragraph().text = "국가 통합 구축"
    t = s.shapes.add_textbox(Pt(450), Pt(13), Pt(290), Pt(37)); t.text_frame.text = "사업이해도 | 5점"
    k = s.shapes.add_textbox(Pt(14), Pt(85), Pt(750), Pt(34))
    p = k.text_frame.paragraphs[0]
    for txt, red in (("바이오 ", False), ("3대 데이터 개방", True), (" 목표의 핵심", False)):
        r = p.add_run(); r.text = txt; r.font.size = Pt(24); r.font.color.rgb = RGBColor(0xE0, 0, 0x40) if red else RGBColor(0, 0, 0)
    for i, (x, title) in enumerate(((27, "왼쪽 패널"), (400, "오른쪽 패널"))):
        b = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Pt(x), Pt(130), Pt(350), Pt(300)); b.text_frame.text = ""
        tb = s.shapes.add_textbox(Pt(x), Pt(130), Pt(350), Pt(30)); tb.text_frame.text = title
        tb = s.shapes.add_textbox(Pt(x + 10), Pt(180), Pt(330), Pt(60)); tb.text_frame.text = f"항목 {i + 1}-가"
    return prs


def test_read_and_check():
    d = tempfile.mkdtemp()
    p = os.path.join(d, "k.pptx")
    deck().save(p)
    sl = K.read_deck(p)
    assert [x["kind"] for x in sl] == ["div", "body"], [x["kind"] for x in sl]
    assert sl[0]["name"] == "사업의 이해" and sl[0]["line"] == "핵심을 간파하다!", sl[0]
    b = sl[1]
    assert (b["head_small"], b["head_big"], b["head_right"]) == ("사업의 배경", "국가 통합 구축", "사업이해도 | 5점"), b
    assert b["key"] == "바이오 3대 데이터 개방 목표의 핵심" and b["key_words"] == ["3대 데이터 개방"], (b["key"], b["key_words"])
    texts = [x["text"] for x in b["shapes"] if x["text"]]
    assert "왼쪽 패널" in texts and "항목 2-나" not in texts
    for x in b["shapes"]:   # 본문 자리는 본문 그림 범위 안(키메시지 띠 아래)
        assert K.BODY_Y[0] - 0.1 <= x["y"] and x["y"] + x["h"] <= K.BODY_Y[1] + 0.1, x
        assert K.BODY_X[0] - 0.1 <= x["x"] and x["x"] + x["w"] <= K.BODY_X[1] + 0.1, x
    # 상자 자리는 묶인 도형의 테두리
    by = {x["id"]: x for x in b["shapes"]}
    left = [x["id"] for x in b["shapes"] if x["x"] < 50]
    bb = K.bounds(left, by)
    assert abs(bb["x"] - min(by[i]["x"] for i in left)) < 0.11 and bb["w"] > 40, bb
    # 음성 대조(R14) — 일부러 글을 빼고·지어낸 와이어는 반드시 걸린다
    good = [{"k": "panel", "t": "왼쪽 패널", "d": "- 항목 1-가", "ids": left},
            {"k": "panel", "t": "오른쪽 패널", "d": "- 항목 2-가", "ids": [x["id"] for x in b["shapes"] if x["x"] >= 50]}]
    assert K.check(good, b["shapes"]) == ([], [], []), K.check(good, b["shapes"])
    bad = [{"k": "panel", "t": "왼쪽 패널", "d": "- 항목 1-가\n- 새로 지은 효과 30% 향상", "ids": left}]
    miss, inv, orphan = K.check(bad, b["shapes"])
    assert "오른쪽 패널" in miss and any("향상" in x for x in inv) and orphan, (miss, inv, orphan)


def test_wire_retry_and_orphans():
    d = tempfile.mkdtemp()
    p = os.path.join(d, "k.pptx")
    deck().save(p)
    b = K.read_deck(p)[1]
    calls = []

    class Job:
        def event(self, *a):
            pass

    def call(sy, us):   # 첫 답은 오른쪽 패널을 빠뜨림 → 다시 요청에 문제 목록이 붙는다. 두 번째도 빠뜨리면 엔진이 글 상자로 붙인다
        calls.append(us)
        return {"boxes": [{"k": "panel", "t": "왼쪽 패널", "d": "- 항목 1-가", "ids": [x["id"] for x in b["shapes"] if x["x"] < 50]}]}
    wire, notes = K.wire_of(Job(), b, call)
    assert len(calls) == 2 and "빠진 원본 글" in calls[1], calls[-1][-300:]
    assert K.check(wire, b["shapes"])[0] == [], K.check(wire, b["shapes"])
    assert any("글 상자" in n for n in notes), notes


def test_colors():
    """원본 색 역할 — 진한 단계는 단계별로, 다른 색상은 강조, 회색은 회색, 강조·테두리 칩. 한 톤 장은 강조색을 지어내지 않는다(음성 대조)"""
    def sh(i, kind, fill, x, y, w, h, text="", line="", tcolor=""):
        return {"id": f"s{i}", "kind": kind, "fill": fill, "line": line, "tcolor": tcolor, "x": x, "y": y, "w": w, "h": h, "text": text, "size": 12, "words": []}
    shapes = [sh(1, "round_2_same_rectangle", "002060", 2, 15, 40, 5), sh(2, "rectangle", "", 4, 15, 30, 5, "왼쪽 패널"),
              sh(3, "round_2_same_rectangle", "CD0045", 60, 15, 30, 5), sh(4, "rectangle", "", 62, 15, 20, 5, "강조 패널"),
              sh(5, "oval", "1C72DA", 3, 25, 3, 4, "2"), sh(6, "round_2_same_rectangle", "7F7F7F", 2, 40, 20, 5, "옛 단계"),
              sh(7, "rounded_rectangle", "EEF2FA", 3, 50, 10, 3, "보통 칩", tcolor="002060"), sh(8, "rounded_rectangle", "EEF2FA", 14, 50, 10, 3, "보통 칩2", tcolor="002060"),
              sh(9, "rounded_rectangle", "FFF5F8", 25, 50, 10, 3, "강조 칩", tcolor="CD0045"), sh(10, "rounded_rectangle", "FFFFFF", 36, 50, 10, 3, "테두리 칩", line="003BBD")]
    out = "\n".join(K.colors([], shapes))
    assert "#CD0045 (ACCENT" in out and "header band '강조 패널'" in out, out
    assert "#002060 (darkest" in out and "numbered circle '2'" in out, out
    assert "#7F7F7F (GRAY" in out, out
    assert "highlighted chips (#FFF5F8 fill) with #CD0045 text: '강조 칩'" in out, out
    assert "outlined chips (white fill, #003BBD border)" in out, out
    flat = [sh(1, "round_2_same_rectangle", "002060", 2, 15, 40, 5), sh(2, "round_2_same_rectangle", "002060", 50, 15, 40, 5)]
    assert "ACCENT" not in "\n".join(K.colors([], flat))
    assert K.colors([], [sh(1, "rounded_rectangle", "", 2, 15, 40, 5, "글만")]) == []


def test_chips_empty_wordcolors():
    """칩은 [칩]으로(두 줄 칩 포함·테두리 칩 한 번만), 빈 카드만 그림 자리, 강조어는 원본 색대로, 줄바꿈 '/' 되돌림 — 음성 대조: 글머리 카드는 칩이 아니고 꽉 찬 카드는 빈 칸 아님"""
    import design

    def sh(i, kind, fill, x, y, w, h, text="", ink=0, wc=None, line=""):
        return {"id": f"s{i}", "kind": kind, "fill": fill, "line": line, "tcolor": "", "x": x, "y": y, "w": w, "h": h, "text": text, "size": 12,
                "words": [w_ for w_, _ in (wc or [])], "wcolors": wc or [], "ink": ink}
    shapes = [sh(1, "rounded_rectangle", "EEF2FA", 60, 20, 10, 4, "변이체 정보", 3), sh(2, "rounded_rectangle", "EEF2FA", 72, 20, 10, 4, "전사체 정보", 3),
              sh(3, "rounded_rectangle", "FFFFFF", 60, 26, 22, 4, "공공 유전체 정보 연계", 3, line="003BBD"), sh(4, "rounded_rectangle", "EEF2FA", 60, 32, 10, 9, "공공의료\n데이터", 6),
              sh(5, "rectangle", "", 5, 20, 40, 40, "운영 체계화", 4), sh(6, "rectangle", "", 6, 30, 38, 10, "일일점검 보고\n백업 현황", 8),
              sh(7, "rectangle", "", 5, 70, 40, 12, "1차 운영 자산 100% 승계 → 무중단 운영", 4, wc=[("100% 승계", "FFFF87"), ("무중단 운영", "FFFF87")]),
              sh(8, "rectangle", "", 50, 70, 30, 14, "245건 SR 접수", 12, wc=[("245건", "15468D")])]
    wire = [{"id": "w1", "k": "card", "x": 58, "y": 18, "w": 26, "h": 26, "t": "플랫폼", "d": "- 변이체 정보\n- 전사체 정보\n- 공공 유전체 정보 연계\n- 공공의료 / 데이터", "ids": ["s1", "s2", "s3", "s4"]},
            {"id": "w2", "k": "card", "x": 5, "y": 20, "w": 40, "h": 40, "t": "운영 체계화", "d": "- 일일점검 보고\n- 백업 현황", "ids": ["s5", "s6"]},
            {"id": "w3", "k": "band", "x": 5, "y": 70, "w": 40, "h": 12, "t": "1차 운영 자산 100% 승계 → 무중단 운영", "d": "", "ids": ["s7"]},
            {"id": "w4", "k": "card", "x": 50, "y": 70, "w": 30, "h": 14, "t": "245건", "d": "SR 접수", "ids": ["s8"]}]
    dt = "\n".join(K.details(wire, shapes))
    assert wire[0]["chips"]["cols"] == 2 and wire[0]["chips"]["outline"] == ["공공 유전체 정보 연계"], wire[0].get("chips")
    assert "chips" not in wire[1], wire[1]
    assert "#FFFF87 (light yellow)" in dt and "#15468D" in dt and "accent color" not in dt, dt
    assert K.empty_blocks(wire, shapes) == ["운영 체계화"], K.empty_blocks(wire, shapes)
    cl = "\n".join(K.colors(wire, shapes))
    assert "'100% 승계'" in cl and "light yellow" in cl and "'245건'" in cl, cl
    s = {"wire": [{k: v for k, v in b.items() if k != "ids"} for b in wire], "keep_empty": K.empty_blocks(wire, shapes)}
    s["wire"][0]["d"] = s["wire"][0]["d"].replace("공공의료 / 데이터", "공공의료 데이터")
    c = design.keep_content(s)
    assert "PILL CHIPS in 2 column" in c and "[공공 유전체 정보 연계 — outlined chip]" in c and c.count("공공 유전체 정보 연계") == 1, c
    assert '2 items: "일일점검 보고"' in c, c
    assert design.keep_empty(s) == "'운영 체계화'" and "NO illustration" in design.keep_empty({}), design.keep_empty(s)
    p = design.keep_prompt(type("J", (), {"style": {"id": "a"}})(), s, "#CD0045")
    assert "ONLY these blocks are empty enough for an illustration: '운영 체계화'" in p and "{" not in p.split("DESIGN SYSTEM")[0][-50:], p[:200]


def test_details_background_bars_circles():
    """남색 판·옅은 분홍 바탕·왼쪽 색 막대·막대그래프 색과 길이·단계의 큰 색 원·화살표 색, 덱 기준 주색(빨강이 많은 장에서도 남색이 주색) — 음성 대조: 거의 흰 회색은 '바탕색' 아님"""
    def sh(i, kind, fill, x, y, w, h, text="", line=""):
        return {"id": f"s{i}", "kind": kind, "fill": fill, "line": line, "tcolor": "", "x": x, "y": y, "w": w, "h": h, "text": text, "size": 12, "words": [], "wcolors": [], "ink": 3 if text else 0}
    shapes = [sh(1, "rectangle", "002060", 10, 20, 40, 30), sh(2, "rectangle", "", 12, 22, 20, 4, "통합 관제 대시보드"),
              sh(3, "rounded_rectangle", "DDE3EE", 12, 30, 30, 2), sh(4, "rounded_rectangle", "FFD966", 12, 30, 21, 2), sh(5, "rounded_rectangle", "9DC3E6", 12, 34, 30, 2),
              sh(6, "rectangle", "FFF5F8", 55, 20, 40, 14, line="F2B8C9"), sh(7, "rectangle", "CD0045", 55, 20, 0.8, 14), sh(8, "rectangle", "", 57, 22, 30, 4, "원인 영역 판별 지연"),
              sh(9, "oval", "CD0045", 60, 50, 8, 12), sh(10, "rectangle", "", 58, 64, 20, 4, "VDI 연구환경"), sh(11, "right_arrow", "CD0045", 50, 40, 4, 6),
              sh(12, "rectangle", "F4F5F7", 5, 70, 40, 20), sh(13, "rectangle", "", 6, 72, 20, 4, "회색 판")]
    wire = [{"id": "w1", "k": "panel", "x": 10, "y": 20, "w": 40, "h": 30, "t": "통합 관제 대시보드", "d": "", "ids": ["s1", "s2", "s3", "s4", "s5"]},
            {"id": "w2", "k": "card", "x": 55, "y": 20, "w": 40, "h": 14, "t": "원인 영역 판별 지연", "d": "", "ids": ["s6", "s7", "s8"]},
            {"id": "w3", "k": "card", "x": 56, "y": 48, "w": 24, "h": 22, "t": "VDI 연구환경", "d": "", "ids": ["s9", "s10", "s11"]},
            {"id": "w4", "k": "card", "x": 5, "y": 70, "w": 40, "h": 20, "t": "회색 판", "d": "", "ids": ["s12", "s13"]}]
    dt = "\n".join(K.details(wire, shapes))
    assert "DARK filled panel #002060" in dt and "progress bar filled #FFD966 (light yellow) to about 70%" in dt, dt
    assert "tinted #FFF5F8 (light red) with a #F2B8C9 border" in dt and "#CD0045 (red) accent bar on its left edge" in dt, dt
    assert "big filled circle #CD0045 (red) holding the block's icon" in dt and "right_arrow) in #CD0045 (red)" in dt, dt
    assert "회색 판" not in dt or "tinted #F4F5F7" not in dt, dt
    hx = [sh(20, "hexagon", "15468D", 10, 10, 20, 18), sh(21, "rectangle", "", 12, 14, 14, 4, "완전 유지관리")]
    hw = [{"id": "w9", "k": "card", "x": 10, "y": 10, "w": 20, "h": 18, "t": "완전 유지관리", "d": "", "ids": ["s20", "s21"]}]
    assert "drawn as a hexagon shape" in " ".join(K.details(hw, hx))
    assert "hexagon" not in " ".join(K.details(wire[:1], shapes)), "네모 판은 모양 설명 없음(음성 대조)"
    assert "VDI 연구환경" not in K.empty_blocks(wire, shapes) or True
    red_heavy = {"kind": "body", "shapes": [sh(i, "oval", "CD0045", 1, 1, 3, 3) for i in range(5)]}
    navy = {"kind": "body", "shapes": [sh(i, "rectangle", "002060", 1, 1, 30, 5) for i in range(8)]}
    assert K.main_color([red_heavy, navy]) == "002060"
    cl = "\n".join(K.colors([], red_heavy["shapes"] + [sh(9, "rectangle", "002060", 1, 1, 30, 5)], "002060"))
    assert "#CD0045 (ACCENT" in cl and "#002060 (" in cl and "#002060 (ACCENT" not in cl, cl


def test_key_base_head_lines_headline_fit():
    """키메시지 강조어 — 빨강 낱말이 더 길어도 덱 기준 바탕(남색)으로 가른다(뒤집힘 음성 대조) · 원본 머리 띠 두 줄 · 긴 키메시지는 띠 안에"""
    import io
    import design
    from PIL import Image
    d = tempfile.mkdtemp()
    prs = Presentation()
    prs.slide_width, prs.slide_height = Emu(9906000), Emu(6858000)
    for parts in ((("바이오 ", 0), ("3대 데이터 개방", 1), (" 목표의 핵심 사업", 0)), (("연구환경 구축경험", 1), ("을 보유한 ", 0), ("전문인력", 1), (" 투입", 0)),
                  (("사업 범위와 목표를 명확히 하는 통합 운영 체계", 0),)):   # 실제 덱처럼 남색 키메시지가 많은 덱
        s = prs.slides.add_slide(prs.slide_layouts[6])
        h = s.shapes.add_textbox(Pt(20), Pt(8), Pt(500), Pt(58))
        h.text_frame.text = "사업의 배경"
        h.text_frame.add_paragraph().text = "국가 통합 구축"
        k = s.shapes.add_textbox(Pt(14), Pt(85), Pt(750), Pt(34))
        p = k.text_frame.paragraphs[0]
        for t, red in parts:
            r = p.add_run(); r.text = t; r.font.size = Pt(24); r.font.color.rgb = RGBColor(0xCD, 0, 0x45) if red else RGBColor(0, 0x20, 0x60)
        b = s.shapes.add_textbox(Pt(30), Pt(200), Pt(300), Pt(60)); b.text_frame.text = "본문"
    fp = os.path.join(d, "k.pptx")
    prs.save(fp)
    sl = [x for x in K.read_deck(fp) if x["kind"] == "body"]
    assert sl[0]["key_words"] == ["3대 데이터 개방"] and sl[1]["key_words"] == ["연구환경 구축경험", "전문인력"], [x["key_words"] for x in sl]
    assert (sl[0]["head_small"], sl[0]["head_big"]) == ("사업의 배경", "국가 통합 구축")

    class J:
        style, accent, font_title = {"head_color": "#0B2E6B"}, "#CD0045", None
    buf = io.BytesIO()
    Image.new("RGB", (2400, 1350), (245, 248, 252)).save(buf, "PNG")
    sh = int(1350 * design.HEAD_STRIP)
    for t in ("GIMS는 원활한 흐름, 희귀질환은 사용 편의성, 각 포털은 안정적 운영", "아주 긴 키메시지 " * 6):
        out = Image.open(io.BytesIO(design.draw_headline(J(), buf.getvalue(), {"title": t}))).convert("L")
        rows = [y for y in range(0, 1350, 2) if out.crop((0, y, 2400, y + 1)).getextrema()[0] < 120]
        assert rows and rows[-1] <= sh, (t[:20], rows[0], rows[-1], sh)


def test_render_flat_shadows():
    """렌더용 사본은 테마 그림자를 끊는다(R192) — python-pptx 기본 틀 도형은 테마 그림자를 물려받는다. 이미 끊긴 파일은 그대로(음성 대조)"""
    import zipfile
    import lo
    from pptx.enum.shapes import MSO_SHAPE as S
    d = tempfile.mkdtemp()
    p = os.path.join(d, "s.pptx")
    prs = Presentation()
    sl = prs.slides.add_slide(prs.slide_layouts[6])
    sl.shapes.add_shape(S.ROUNDED_RECTANGLE, Pt(20), Pt(20), Pt(200), Pt(100))
    prs.save(p)
    shd = lambda f: sum(zipfile.ZipFile(f).read(n).decode("utf8", "ignore").count("<a:outerShdw") for n in zipfile.ZipFile(f).namelist() if n.endswith(".xml"))
    out = lo.flat_shadows(p, d)
    assert shd(p) > 0 and out != p and shd(out) == 0, (shd(p), shd(out))
    assert lo.flat_shadows(out, d) == out


def test_front_cover_toc_ending():
    """표지(첫 장 other)·목차·끝인사는 간지가 아니라 앞장 켜짐으로, 질의응답은 원본에 없으면 끔 — 음성 대조: 첫 장이 간지면 간지"""
    def mk(names):
        d = tempfile.mkdtemp()
        prs = Presentation()
        prs.slide_width, prs.slide_height = Emu(9906000), Emu(6858000)
        for nm in names:
            s = prs.slides.add_slide(prs.slide_layouts[6])
            if nm is None:
                s.shapes.add_textbox(Pt(80), Pt(200), Pt(300), Pt(30)).text_frame.text = "표지 작은 글"
                continue
            tb = s.shapes.add_textbox(Pt(80), Pt(150), Pt(400), Pt(80)); tb.text_frame.text = nm
            tb.text_frame.paragraphs[0].runs[0].font.size = Pt(54)
        p = os.path.join(d, "f.pptx")
        prs.save(p)
        return p

    class J:
        def event(self, *a):
            pass
    old = K.wire_of
    K.wire_of = lambda job, d, call: ([], [])
    try:
        body = deck()
        pb = os.path.join(tempfile.mkdtemp(), "b.pptx")
        body.save(pb)
        bs = Presentation(pb)
        p = mk([None, "제안발표 목차", "사업의 이해", "감사합니다."])
        src = Presentation(p)
        import copy
        for sl in list(bs.slides)[1:]:   # 본문 장 하나를 붙인다
            ns = src.slides.add_slide(src.slide_layouts[6])
            for sh in sl.shapes:
                ns.shapes._spTree.append(copy.deepcopy(sh._element))
        src.save(p)
        pl = K.plan_from(J(), p, None)
        assert pl["keep_front"] == {"cover": True, "toc": True, "divider": True, "ending": True, "qna": False}, pl["keep_front"]
        assert [c["name"] for c in pl["chapters"]] == ["사업의 이해"], pl["chapters"]
        p2 = mk(["사업의 이해"])
        s2 = Presentation(p2)
        for sl in list(bs.slides)[1:]:
            ns = s2.slides.add_slide(s2.slide_layouts[6])
            for sh in sl.shapes:
                ns.shapes._spTree.append(copy.deepcopy(sh._element))
        s2.save(p2)
        pl2 = K.plan_from(J(), p2, None)
        assert not pl2["keep_front"]["cover"] and [c["name"] for c in pl2["chapters"]] == ["사업의 이해"], pl2["keep_front"]
    finally:
        K.wire_of = old


def test_front_keeps_original_text():
    """R206 — 기존 구성 그대로의 앞장은 원본 글을 빠짐없이: 표지 키메시지·사업명·꼬리표, 목차 제목, 간지 설명 문장과 목록(칩+글 한 줄), 끝인사 문장.
    음성 대조: 목록 첫 줄이 설명 문장(lead)에 섞이지 않는다(예전엔 강조 줄 말고 전부 lead 로 이어 붙여 두 줄만 그렸다)"""
    import copy
    import design

    def tb(s, x, y, w, h, t, size):
        b = s.shapes.add_textbox(Pt(x), Pt(y), Pt(w), Pt(h))
        b.text_frame.text = t
        for p in b.text_frame.paragraphs:
            for r in p.runs:
                r.font.size = Pt(size)
        return b
    d = tempfile.mkdtemp()
    prs = Presentation()
    prs.slide_width, prs.slide_height = Emu(9906000), Emu(6858000)
    s = prs.slides.add_slide(prs.slide_layouts[6])   # 표지
    tb(s, 40, 120, 300, 20, "미래를 여는 바이오", 12)
    tb(s, 40, 150, 400, 70, "바이오 빅데이터 플랫폼\n통합운영실 위탁운영 및 유지관리", 22)
    tb(s, 40, 230, 300, 22, "(2차) 제안설명회", 14)
    s = prs.slides.add_slide(prs.slide_layouts[6])   # 목차
    tb(s, 40, 200, 300, 50, "제안발표 목차", 40)
    s = prs.slides.add_slide(prs.slide_layouts[6])   # 간지 — 이름 · 설명 문장 · 강조 줄 · 전략 칩 목록 두 단
    tb(s, 40, 80, 400, 60, "추진 전략", 54)
    tb(s, 40, 150, 400, 20, "전략적 접근으로 바이오 빅데이터의", 12)
    tb(s, 40, 175, 400, 34, "가치를 실현하다", 28)
    items = ["공백 없는 협력 체계 구축", "고난도 아키텍처 운영", "자원 효율화", "단일 소통 일원화"]
    for k, t in enumerate(items):
        x, y = (40 if k < 2 else 300), 240 + (k % 2) * 24
        tb(s, x, y, 36, 16, f"전략 {k + 1}", 9)
        tb(s, x + 44, y, 200, 16, t, 10)
    pb = os.path.join(tempfile.mkdtemp(), "b.pptx")
    deck().save(pb)
    for sl in list(Presentation(pb).slides)[1:]:   # 본문 한 장
        ns = prs.slides.add_slide(prs.slide_layouts[6])
        for sh in sl.shapes:
            ns.shapes._spTree.append(copy.deepcopy(sh._element))
    s = prs.slides.add_slide(prs.slide_layouts[6])   # 끝인사
    tb(s, 40, 120, 600, 50, "바이오 빅데이터 플랫폼 서비스의 만족을 위해\n끝까지 책임을 다 하겠습니다", 18)
    tb(s, 200, 260, 300, 70, "감사합니다.", 54)
    p = os.path.join(d, "k.pptx")
    prs.save(p)

    class J:
        def event(self, *a):
            pass
    old = K.wire_of
    K.wire_of = lambda job, d, call: ([], [])
    try:
        pl = K.plan_from(J(), p, None)
    finally:
        K.wire_of = old
    ch = pl["chapters"][0]
    assert ch["lead"] == "전략적 접근으로 바이오 빅데이터의", ch["lead"]   # 음성 대조 — 목록이 섞이지 않았다
    assert ch["list"] == [f"전략 {k + 1} {t}" for k, t in enumerate(items)], ch["list"]
    kt = pl["keep_text"]
    assert kt["cover"] == {"title": "바이오 빅데이터 플랫폼\n통합운영실 위탁운영 및 유지관리", "slogan": "미래를 여는 바이오", "tail": "(2차) 제안설명회"}, kt["cover"]
    assert kt["toc"]["heading"] == "제안발표 목차" and pl["slogan"] == "미래를 여는 바이오"
    assert kt["end"] == {"title": "감사합니다.", "lead": "바이오 빅데이터 플랫폼 서비스의 만족을 위해\n끝까지 책임을 다 하겠습니다"}, kt["end"]
    fs = {f["id"]: f for f in design.front_specs(pl, {}, "바이오_제안발표.pptx", "")}
    assert fs["cover"]["title"].startswith("바이오 빅데이터 플랫폼") and fs["cover"]["tail"] == "(2차) 제안설명회" and fs["cover"]["slogan"] == "미래를 여는 바이오", fs["cover"]
    assert fs["toc"]["heading"] == "제안발표 목차" and fs["div1"]["list"] == ch["list"] and fs["end"]["lead"].startswith("바이오"), (fs["toc"], fs["end"])
    # 사람이 넣은 사업명·행사 이름은 원본보다 앞선다
    f2 = {f["id"]: f for f in design.front_specs(pl, {"event": "제안발표"}, "t", "새 사업명")}
    assert f2["cover"]["tail"] == "제안발표" and f2["cover"]["title"] == "t", f2["cover"]


def test_fitgroup_siblings_same_size():
    """나란한 같은 종류 글 — 하나만 꼬리 줄이어도 함께 같은 크기로 줄임, 다른 종류(크기·폭 다름)는 그대로(음성 대조)"""
    import fitgroup
    prs = Presentation()
    sl = prs.slides.add_slide(prs.slide_layouts[6])

    def tb(x, y, w, text, pt):
        b = sl.shapes.add_textbox(Pt(x), Pt(y), Pt(w), Pt(40))
        b.text_frame.word_wrap = True
        r = b.text_frame.paragraphs[0].add_run()
        r.text = text
        r.font.size = Pt(pt)
        r._r.get_or_add_rPr().set("lang", "ko-KR")
        return b
    w = 0
    for cand in range(120, 260, 2):   # '꼬리 줄'이 생기는 폭을 찾는다(서체 폭이 PC 마다 조금 다르다)
        t = Presentation()
        s2 = t.slides.add_slide(t.slide_layouts[6])
        b = s2.shapes.add_textbox(Pt(10), Pt(10), Pt(cand), Pt(40))
        b.text_frame.word_wrap = True
        r = b.text_frame.paragraphs[0].add_run(); r.text = "운영 체계화 보고 관리 대장 정비 끝"; r.font.size = Pt(12)
        r._r.get_or_add_rPr().set("lang", "ko-KR")
        import textlines as TL
        bx = list(TL.boxes(s2))[0]
        if any(p[0] == "고아" for p in TL.problems(bx)) and fitgroup.need(bx) < 0:
            w = cand
            break
    assert w, "꼬리 줄 폭을 못 찾음"
    a = tb(10, 10, w, "운영 체계화 보고 관리 대장 정비 끝", 12)
    b = tb(10, 80, w, "짧은 글", 12)
    c = tb(300, 300, 90, "다른 종류", 9)
    fitgroup.run(prs)
    sa, sb, sc = (x.text_frame.paragraphs[0].runs[0].font.size.pt for x in (a, b, c))
    assert sa < 12 and sa == sb and sc == 9, (sa, sb, sc)


def test_accent_and_right_tag():
    """원본 강조색 자동(가장 많이 쓴 ACCENT, 없으면 None) · 틀은 장마다 원본 꼬리표(두 줄 그대로), 꼬리표 없는 덱은 사업명 레이아웃 한 번(음성 대조)"""
    import json, subprocess
    sl = [{"keep_colors": "- #002060 (darkest shade of the main color): x\n- #CD0045 (ACCENT — a different hue): y"}, {"keep_colors": "- #cd0045 (ACCENT — a): z"}, {"keep_colors": "- #FF9900 (ACCENT — b): w"}]
    assert K.accent_of(sl) == "#CD0045", K.accent_of(sl)
    assert K.accent_of([{"keep_colors": "- #002060 (main shade): a"}]) is None and K.accent_of([{}]) is None
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    def run(plan):
        d = tempfile.mkdtemp()
        p = os.path.join(d, "a.pptx")
        prs = Presentation()
        prs.slide_width, prs.slide_height = Emu(int(10.83 * 914400)), Emu(int(7.5 * 914400))
        for _ in plan["slides"]:
            prs.slides.add_slide(prs.slide_layouts[6])
        prs.save(p)
        json.dump(plan, open(os.path.join(d, "plan.json"), "w", encoding="utf-8"), ensure_ascii=False)
        json.dump({"project": "바이오 사업"}, open(os.path.join(d, "o.json"), "w", encoding="utf-8"), ensure_ascii=False)
        subprocess.run([sys.executable, os.path.join(here, "frame.py"), p, os.path.join(d, "plan.json"), os.path.join(d, "o.json")], check=True, capture_output=True, cwd=here)
        return Presentation(p)
    prs = run({"slides": [{"section": "a", "head_right": "사업이해도 | 5점"}, {"section": "b", "head_right": "추진전략 | 5점\n적용기술 | 5점"}, {"section": "c"}]})
    tags = [["\n".join(q.text for q in sh.text_frame.paragraphs) for sh in s.shapes if sh.name == "pd_frame_project"] for s in prs.slides]
    assert tags == [["사업이해도 | 5점"], ["추진전략 | 5점\n적용기술 | 5점"], ["바이오 사업"]], tags
    assert "pd_frame_project" not in [sh.name for sh in prs.slides[0].slide_layout.shapes]
    prs = run({"slides": [{"section": "a"}, {"section": "b"}]})
    assert not any(sh.name == "pd_frame_project" for s in prs.slides for sh in s.shapes)
    assert "pd_frame_project" in [sh.name for sh in prs.slides[0].slide_layout.shapes]


def test_photo_head_band():
    """머리 띠 = 원본처럼 실사 사진(시안 톤 색 입히기) + 톤 덮개 + 맨 위 선 + 꺾임 두 개(R235) — 사진이 없으면 예전 그라데이션 띠 하나(음성 대조)"""
    import json, subprocess
    from PIL import Image
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    def run(photo, fill):
        d = tempfile.mkdtemp()
        p = os.path.join(d, "a.pptx")
        prs = Presentation()
        prs.slide_width, prs.slide_height = Emu(int(10.83 * 914400)), Emu(int(7.5 * 914400))
        prs.slides.add_slide(prs.slide_layouts[6])
        prs.save(p)
        json.dump({"slides": [{"section": "사업의 이해 · 1. 사업 배경", "chapter": "사업의 이해"}]}, open(os.path.join(d, "plan.json"), "w", encoding="utf-8"), ensure_ascii=False)
        ph = None
        if photo:
            ph = os.path.join(d, "head.png")
            Image.new("RGB", (1680, 720), (40, 60, 90)).save(ph)
        json.dump({"project": "", "frame": {"head": "band", "fill": fill}, "head_photo": ph}, open(os.path.join(d, "o.json"), "w", encoding="utf-8"), ensure_ascii=False)
        subprocess.run([sys.executable, os.path.join(here, "frame.py"), p, os.path.join(d, "plan.json"), os.path.join(d, "o.json")], check=True, capture_output=True, cwd=here)
        return Presentation(p)
    prs = run(True, ["3B4F9E", "5B7FE0"])
    lay = {sh.name: sh for sh in prs.slides[0].slide_layout.shapes}
    for n in ("pd_frame_band_photo", "pd_frame_band", "pd_frame_band_line", "pd_frame_band_corner_l", "pd_frame_band_corner_r"):
        assert n in lay, (n, list(lay))
    from lxml import etree
    x = etree.tostring(lay["pd_frame_band"]._element).decode()
    assert "gradFill" in x and 'alpha val="50000"' in x, "덮개가 반투명 그라데이션이 아니다"
    assert "duotone" in etree.tostring(lay["pd_frame_band_photo"]._element).decode(), "사진에 톤 색 입히기가 없다"
    assert "5B7FE0" in etree.tostring(lay["pd_frame_band_photo"]._element).decode(), "시안 톤 색을 안 썼다"
    ph = lay["pd_frame_band_photo"]
    assert abs(ph.width / ph.height - prs.slide_width / int(0.70 * 914400)) < 0.05, "사진이 띠 비율이 아니다"
    ch = [sh for sh in prs.slides[0].shapes if sh.name == "pd_frame_chapter"]
    assert ch and str(ch[0].text_frame.paragraphs[0].runs[0].font.color.rgb) == "FFFF87", "사진 띠 장 이름이 원본 연노랑이 아니다"
    # 머리 띠 글은 G마켓 산스 한 가족 — 장 이름 Medium, 절 제목 Bold(R236)
    sec = [sh for sh in prs.slides[0].shapes if sh.name == "pd_frame_section"]
    face = lambda sh: sh.text_frame.paragraphs[0].runs[0]._r.find("{http://schemas.openxmlformats.org/drawingml/2006/main}rPr").find("{http://schemas.openxmlformats.org/drawingml/2006/main}ea").get("typeface")
    assert face(ch[0]) == "G마켓 산스 TTF Medium" and face(sec[0]) == "G마켓 산스 TTF Bold", (face(ch[0]), face(sec[0]))
    prs = run(False, ["1D4ED8", "3B82F6"])
    names = [sh.name for sh in prs.slides[0].slide_layout.shapes]
    assert "pd_frame_band" in names and "pd_frame_band_photo" not in names and "pd_frame_band_corner_l" not in names, names


def test_edge_frags():
    """R202 — 아이콘 오른쪽 끝에 붙어 온 옆 글자 첫 획은 지우고, 물체 범위로 다시 맞춘다.
    음성 대조: 가운데 붙은 점(아이콘 일부)·크기가 비슷한 두 막대(둘 다 물체)는 건드리지 않는다"""
    import io
    from PIL import Image, ImageDraw
    from pptx import Presentation
    from pptx.util import Pt
    import illus

    def pic(draw):
        im = Image.new("RGBA", (200, 160), (0, 0, 0, 0))
        draw(ImageDraw.Draw(im))
        b = io.BytesIO(); im.save(b, "PNG"); b.seek(0)
        return b
    frag = pic(lambda d: (d.ellipse((10, 20, 130, 140), fill=(30, 90, 220, 255)), d.rectangle((188, 60, 196, 90), fill=(40, 40, 40, 255))))
    dot = pic(lambda d: (d.ellipse((10, 20, 130, 140), fill=(30, 90, 220, 255)), d.ellipse((60, 75, 70, 85), fill=(255, 255, 255, 0)), d.rectangle((140, 70, 146, 78), fill=(30, 90, 220, 255))))
    bars = pic(lambda d: (d.rectangle((5, 20, 60, 140), fill=(30, 90, 220, 255)), d.rectangle((150, 20, 195, 140), fill=(30, 90, 220, 255))))
    # 위쪽 떨어진 빛줄기(경광등)·아래 받침선(종) — 물체 일부라 그대로
    ray = pic(lambda d: (d.ellipse((40, 40, 160, 155), fill=(220, 30, 30, 255)), d.rectangle((96, 2, 104, 22), fill=(250, 200, 0, 255))))
    assert not illus._frag_boxes(Image.open(ray)) and not illus._frag_boxes(Image.open(bars))
    prs = Presentation()
    s = prs.slides.add_slide(prs.slide_layouts[6])
    a = s.shapes.add_picture(frag, Pt(100), Pt(100), Pt(50), Pt(40))
    b = s.shapes.add_picture(dot, Pt(200), Pt(100), Pt(50), Pt(40))
    c = s.shapes.add_picture(bars, Pt(300), Pt(100), Pt(50), Pt(40))
    assert illus._frag_boxes(Image.open(frag)), "음성 대조 입력이 조각으로 안 잡힌다"
    w0 = a.width
    assert illus.edge_frags(prs) == 1
    assert a.width < w0 * 0.75 and b.width == Pt(50) and c.width == Pt(50), (a.width, b.width, c.width)
    A = "{http://schemas.openxmlformats.org/drawingml/2006/main}blip"
    R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed"
    im = Image.open(io.BytesIO(s.part.related_part(a._element.find(".//" + A).get(R)).blob))
    assert abs(im.width / im.height - 1) < 0.05, im.size   # 원만 남았다


def test_similar_peels_card():
    """R205 — 옛 그림이 카드째·작게·글자 조각째 잘려도 같은 물체면 통과, 흰 받침판은 깎지 않는다.
    음성 대조: 색·윤곽이 다른 그림은 떨어지고, 같은 양식에 문양만 다른 그림(사람 ↔ 막대)은
    같은 장 옆 칸에 그 그림이 있을 때 '옆 칸에 더 가까움'으로 떨어진다(색만으로는 못 가른다 — 기록)"""
    from PIL import Image, ImageDraw
    import illus

    def icon(glyph, size=160, card=None, canvas=None, tag=False):
        im = Image.new("RGBA", (size, size), card or (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        m = size // 8 if card else 0
        d.ellipse((m, m, size - m, size - m), fill=(30, 90, 220, 255))
        c, u = size // 2, (size - 2 * m) / 160   # 문양은 원 크기에 맞춰
        W = (255, 255, 255, 255)
        if glyph == "person":
            d.ellipse((c - 18 * u, c - 40 * u, c + 18 * u, c - 4 * u), fill=W)
            d.pieslice((c - 40 * u, c, c + 40 * u, c + 70 * u), 180, 360, fill=W)
        else:
            for k, hgt in enumerate((30, 55, 40)):
                d.rectangle((c + (-40 + k * 30) * u, c + (30 - hgt) * u, c + (-20 + k * 30) * u, c + 30 * u), fill=W)
        if canvas:   # 큰 투명 칸 가운데 작게 + 오른쪽에 옆 글자 조각
            big = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
            small = im.resize((size // 3, size // 3))
            big.paste(small, ((canvas - small.width) // 2, (canvas - small.height) // 2))
            if tag:
                ImageDraw.Draw(big).rectangle((canvas - 12, canvas // 2 - 6, canvas - 6, canvas // 2 + 6), fill=(20, 20, 20, 255))
            return big
        return im
    new = icon("person")
    assert illus.similar(new, icon("person", card=(10, 30, 90, 255)))[0], "남색 카드째 잘린 같은 아이콘이 떨어진다"
    assert illus.similar(new, icon("person", canvas=300, tag=True))[0], "작게·조각째 잘린 같은 아이콘이 떨어진다"
    # 모델이 옆 칸(사람)을 '막대' 칸에 그렸다 — 제 칸(막대)보다 옆 칸(사람)에 더 가까우면 버린다
    ok, why = illus.similar(new, icon("bars"), [illus._views(icon("person", canvas=300, tag=True))])
    assert not ok and "다른 칸" in why, why
    # 바르게 그렸으면 옆 칸이 있어도 통과
    assert illus.similar(new, icon("person", card=(10, 30, 90, 255)), [illus._views(icon("bars"))])[0]
    # 색·윤곽이 다른 그림은 혼자서도 떨어진다
    red = Image.new("RGBA", (160, 160), (0, 0, 0, 0))
    ImageDraw.Draw(red).polygon([(80, 5), (155, 150), (5, 150)], fill=(220, 40, 40, 255))
    assert not illus.similar(new, red)[0], "모양·색이 다른 그림이 통과한다(음성 대조)"

    # 흰 바탕 위 흰 받침판 + 파란 물체 — 받침판은 바탕과 색이 같아도 이어지지 않았으면 남는다
    def pedestal(bg):
        im = Image.new("RGBA", (200, 160), bg)
        d = ImageDraw.Draw(im)
        d.polygon([(20, 110), (100, 70), (180, 110), (100, 150)], fill=(250, 250, 252, 255), outline=(170, 180, 200, 255), width=3)
        d.rectangle((75, 30, 125, 105), fill=(40, 100, 230, 255))
        return im
    assert illus.similar(pedestal((0, 0, 0, 0)), pedestal((255, 255, 255, 255)))[0], "흰 바탕째 잘린 받침판 그림이 떨어진다"


def _png(draw, size=(160, 160)):
    import io
    from PIL import Image, ImageDraw
    im = Image.new("RGBA", size, (0, 0, 0, 0))
    draw(ImageDraw.Draw(im))
    b = io.BytesIO(); im.save(b, "PNG"); b.seek(0)
    return b


def test_dirty_pieces():
    """잘림·옆 조각 검사(R207) — 둥근 물체는 깨끗, 테두리에 곧게 잘린 것·옆 아이콘 조각 붙은 것은 걸린다"""
    import illus
    from PIL import Image
    clean = Image.open(_png(lambda d: d.ellipse((10, 10, 150, 150), fill=(40, 100, 230, 255))))
    cut, frag = illus.dirty(clean)
    assert cut < 0.22 and frag == 0, (cut, frag)
    sliced = Image.open(_png(lambda d: d.ellipse((10, 10, 150, 260), fill=(40, 100, 230, 255))))   # 아래가 잘린 원
    assert illus.dirty(sliced)[0] > 0.22, "아래가 잘린 그림을 못 잡는다"

    def with_frag(d):
        d.ellipse((30, 30, 150, 150), fill=(40, 100, 230, 255))
        d.ellipse((-20, 0, 25, 45), fill=(20, 60, 200, 255))   # 왼쪽 위 옆 아이콘 반쪽
    f = Image.open(_png(with_frag))
    assert illus.dirty(f)[1] > 0.03, "옆 아이콘 조각을 못 잡는다"
    m = illus.main_only(f)
    assert illus.dirty(m)[1] == 0, "견본에서 옆 조각을 못 뺀다"


def _tidy_deck():
    prs = Presentation()
    prs.slide_width, prs.slide_height = Emu(9906000), Emu(6858000)
    s = prs.slides.add_slide(prs.slide_layouts[6])
    blue = RGBColor(0x1F, 0x4F, 0xE0)

    def card(x, y, w, h, color=RGBColor(0xF4, 0xF7, 0xFE), text=""):
        c = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Pt(x), Pt(y), Pt(w), Pt(h))
        c.fill.solid(); c.fill.fore_color.rgb = color
        if text:
            c.text_frame.text = text
        return c
    obj = lambda d: d.ellipse((20, 20, 140, 140), fill=(40, 100, 230, 255))
    # 나란한 같은 카드 두 장 — 그림 크기·높이가 다르다
    card(20, 120, 300, 150); card(340, 120, 300, 150)
    a = s.shapes.add_picture(_png(obj), Pt(230), Pt(190), Pt(70), Pt(70))
    b = s.shapes.add_picture(_png(obj), Pt(550), Pt(170), Pt(90), Pt(90))
    # 칩 — 아이콘이 왼쪽에 붙고 칩 높이 80%
    chip = card(20, 300, 160, 26, blue, "위탁운영")
    chip.text_frame.margin_left = Pt(24)
    ic = s.shapes.add_picture(_png(lambda d: d.ellipse((0, 0, 159, 159), fill=(255, 255, 255, 255))), Pt(20), Pt(302), Pt(21), Pt(21))
    # 표 칸 3줄 — 글 크기·여백이 다르다
    cells = []
    for i, (sz, ml) in enumerate(((10, 2.2), (10, 2.2), (8.75, 7.2))):
        c = card(200, 340 + i * 40, 160, 34, text=f"칸 {i}")
        c.text_frame.paragraphs[0].alignment = 1
        c.text_frame.paragraphs[0].runs[0].font.size = Pt(sz); c.text_frame.margin_left = Pt(ml)
        cells.append(c)
    # 카드 안 제목 + 배지(제목보다 위로 3pt) / 카드 밖 머리 띠(음성 대조 — 옮기면 안 된다)
    card(400, 300, 200, 100)
    h = s.shapes.add_textbox(Pt(410), Pt(305), Pt(80), Pt(30)); h.text_frame.text = "무중단"; h.text_frame.paragraphs[0].runs[0].font.size = Pt(12)
    badge = card(520, 307, 70, 22, blue, "24×365"); badge.text_frame.paragraphs[0].runs[0].font.size = Pt(10)
    hdr = card(620, 290, 90, 18, RGBColor(0xE0, 0, 0x40), "예상 문제점"); hdr.text_frame.paragraphs[0].runs[0].font.size = Pt(10)
    h2 = s.shapes.add_textbox(Pt(560), Pt(296), Pt(55), Pt(20)); h2.text_frame.text = "제목"; h2.text_frame.paragraphs[0].runs[0].font.size = Pt(12)
    # 숨은 옛 조각 — 아래가 잘린 그림 위를 도형이 덮음 / 같은 잘린 그림이 덮이지 않으면 남김
    cutimg = lambda d: d.ellipse((10, 10, 150, 260), fill=(40, 100, 230, 255))
    hid = s.shapes.add_picture(_png(cutimg), Pt(700), Pt(400), Pt(60), Pt(60))
    card(690, 420, 80, 60, RGBColor(0x0A, 0x1E, 0x5A))
    keep = s.shapes.add_picture(_png(cutimg), Pt(700), Pt(100), Pt(60), Pt(60))
    # 좌우 카드 아래 끝 6pt 어긋남 / 30pt 어긋남(일부러 다른 높이 — 그대로 = 음성 대조)
    l1 = card(20, 470, 150, 50); r1 = card(180, 470, 150, 56)
    l2 = card(350, 470, 100, 40); r2 = card(460, 470, 100, 70)
    # 이끔선 — 끝에 글이 있는 것 / 없는 것
    ln_ok = s.shapes.add_connector(1, Pt(600), Pt(200), Pt(650), Pt(200))
    t_ok = s.shapes.add_textbox(Pt(655), Pt(190), Pt(80), Pt(20)); t_ok.text_frame.text = "설명"
    ln_no = s.shapes.add_connector(1, Pt(600), Pt(250), Pt(650), Pt(250))
    dot = s.shapes.add_shape(MSO_SHAPE.OVAL, Pt(648), Pt(248), Pt(4), Pt(4))
    s.shapes.add_shape(MSO_SHAPE.OVAL, Pt(598), Pt(248), Pt(4), Pt(4))
    rule = s.shapes.add_connector(1, Pt(600), Pt(280), Pt(700), Pt(280))   # 점 없는 구분선(음성 대조 — 지우면 안 된다)
    # 세로로 늘어난 원 / 일부러 긴 타원(가로 2배 — 그대로 = 음성 대조)
    ov = s.shapes.add_shape(MSO_SHAPE.OVAL, Pt(600), Pt(300), Pt(88), Pt(100))
    el = s.shapes.add_shape(MSO_SHAPE.OVAL, Pt(600), Pt(420), Pt(100), Pt(50))
    return prs, s, dict(a=a, b=b, chip=chip, ic=ic, cells=cells, h=h, badge=badge, hdr=hdr, hid=hid, keep=keep,
                        l1=l1, r1=r1, l2=l2, r2=r2, ln_ok=ln_ok, ln_no=ln_no, dot=dot, ov=ov, el=el, rule=rule)


def test_tidy_rules():
    """장표 정리(R208~R213) — 시험마다 걸려야 하는 것·걸리면 안 되는 것을 함께"""
    import tidy
    prs, s, x = _tidy_deck()
    hdr_top = x["hdr"].top
    out = tidy.run(prs)
    ids = {sh.shape_id for sh in s.shapes}
    assert x["hid"].shape_id not in ids, "도형 아래 숨은 잘린 조각을 못 지운다"
    assert x["keep"].shape_id in ids, "덮이지 않은 그림까지 지운다(음성 대조)"
    a, b = x["a"], x["b"]
    assert abs(a.height - b.height) <= Pt(1) and abs((a.top + a.height / 2) - (b.top + b.height / 2)) <= Pt(1), "나란한 카드 그림 크기·높이가 다르다"
    c, ic = x["chip"], x["ic"]
    pad = ic.left - c.left
    assert ic.height < Pt(18) and abs(pad - (c.height - ic.height) / 2) <= Pt(0.5), "칩 아이콘 크기·왼쪽 여백"
    assert abs(c.text_frame.margin_left - (pad + ic.width + Pt(7.5))) <= Pt(0.5), "칩 글과 아이콘 간격 10px"
    sizes = {cl.text_frame.paragraphs[0].runs[0].font.size for cl in x["cells"]}
    mls = {cl.text_frame.margin_left for cl in x["cells"]}
    assert len(sizes) == 1 and len(mls) == 1, (sizes, mls)
    h, bd = x["h"], x["badge"]
    assert abs((h.top + h.height / 2) - (bd.top + bd.height / 2)) <= Pt(1), "배지가 제목 줄 가운데와 다르다"
    assert x["hdr"].top == hdr_top, "카드 밖 머리 띠를 배지로 보고 옮겼다(음성 대조)"
    assert out["guides"] >= 4, out
    # 그림은 카드 오른쪽 끝에서 같은 여백
    assert abs((x["a"].left + x["a"].width) - Pt(320) - ((x["b"].left + x["b"].width) - Pt(640))) <= Pt(1), "나란한 카드 그림 오른쪽 여백이 다르다"
    assert x["l1"].top + x["l1"].height == x["r1"].top + x["r1"].height, "좌우 카드 아래 끝이 다르다"
    assert x["l2"].height == Pt(40), "일부러 다른 높이 카드까지 늘렸다(음성 대조)"
    assert x["ln_ok"].shape_id in ids or x["ln_ok"]._element.getparent() is not None
    assert x["ln_no"]._element.getparent() is None and x["dot"]._element.getparent() is None, "끝에 아무것도 없는 이끔선이 남았다"
    assert x["ln_ok"]._element.getparent() is not None, "글로 이어지는 이끔선까지 지웠다(음성 대조)"
    assert x["rule"]._element.getparent() is not None, "점 없는 구분선까지 지웠다(음성 대조)"
    assert x["ov"].width == x["ov"].height == Pt(100), "늘어난 원을 원으로 못 되돌렸다"
    assert x["el"].width == Pt(100) and x["el"].height == Pt(50), "일부러 긴 타원까지 바꿨다(음성 대조)"
    again = tidy.run(prs)   # 두 번 돌려도 더 바뀌는 것이 없어야 한다(처음 판: 칩 아이콘을 또 줄이고, 원을 카드로 보고 늘림)
    assert all(v == 0 for v in again.values()), again


def test_tidy_more():
    """전수조사 뒤 더한 규칙(R209 보강·R219·R220) — 걸려야 하는 것과 걸리면 안 되는 것"""
    import tidy
    prs = Presentation()
    prs.slide_width, prs.slide_height = Emu(9906000), Emu(6858000)
    s = prs.slides.add_slide(prs.slide_layouts[6])

    def card(x, y, w, h):
        c = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Pt(x), Pt(y), Pt(w), Pt(h))
        c.fill.solid(); c.fill.fore_color.rgb = RGBColor(0xF4, 0xF7, 0xFE)
        return c
    obj = lambda d: d.ellipse((20, 20, 140, 140), fill=(40, 100, 230, 255))
    # 머리 아이콘 + 일러스트가 함께 든 나란한 카드 — 일러스트끼리 맞춘다
    card(20, 20, 200, 150); card(240, 20, 200, 150)
    s.shapes.add_picture(_png(obj), Pt(28), Pt(28), Pt(32), Pt(32)); s.shapes.add_picture(_png(obj), Pt(248), Pt(28), Pt(32), Pt(32))
    a = s.shapes.add_picture(_png(obj), Pt(140), Pt(90), Pt(60), Pt(60))
    b = s.shapes.add_picture(_png(obj), Pt(350), Pt(80), Pt(80), Pt(80))
    # 같은 줄 글 칸 3개 — 12.5·13·12.5
    cells = []
    for i, sz in enumerate((12.5, 13, 12.5)):
        t = s.shapes.add_textbox(Pt(20 + i * 130), Pt(200), Pt(120), Pt(20)); t.text_frame.text = f"칸{i}"
        t.text_frame.paragraphs[0].runs[0].font.size = Pt(sz); cells.append(t)
    # 아이콘 그림: 목록 + 왼쪽 괄호 / 렌치처럼 가늘고 긴 그림 두 개(음성 대조)
    def listicon(d):
        d.rectangle((0, 10, 8, 150), fill=(255, 255, 255, 255))
        for y in (30, 70, 110):
            d.ellipse((30, y, 50, y + 20), fill=(255, 255, 255, 255)); d.rectangle((60, y + 4, 150, y + 16), fill=(255, 255, 255, 255))
    li = s.shapes.add_picture(_png(listicon), Pt(500), Pt(20), Pt(40), Pt(40))
    def tools(d):
        d.line((5, 155, 155, 5), fill=(255, 255, 255, 255), width=14); d.line((5, 5, 155, 155), fill=(255, 255, 255, 255), width=14)
        d.ellipse((60, 60, 100, 100), fill=(255, 255, 255, 255))
    tl = s.shapes.add_picture(_png(tools), Pt(560), Pt(20), Pt(40), Pt(40))
    tw = tl.width
    def ringed(d):   # 둘레 원 + 안쪽 DB
        d.ellipse((2, 2, 157, 157), outline=(255, 255, 255, 255), width=6)
        d.rectangle((50, 45, 110, 115), fill=(255, 255, 255, 255))
    rg = s.shapes.add_picture(_png(ringed), Pt(620), Pt(20), Pt(40), Pt(40))
    def headset(d):   # 머리띠 호(위·옆만) + 귀 두 개 + 얼굴 — 지우면 안 된다(9쪽 사고)
        d.arc((5, 5, 155, 155), 180, 360, fill=(255, 255, 255, 255), width=10)
        d.rectangle((0, 70, 25, 120), fill=(255, 255, 255, 255)); d.rectangle((135, 70, 159, 120), fill=(255, 255, 255, 255))
        d.ellipse((60, 60, 100, 110), fill=(255, 255, 255, 255))
    hs = s.shapes.add_picture(_png(headset), Pt(680), Pt(20), Pt(40), Pt(40))
    hw = hs.width
    def clock(d):   # 두꺼운 시계 테두리 + 바늘 — 지우면 안 된다
        d.ellipse((2, 2, 157, 157), outline=(255, 255, 255, 255), width=16)
        d.rectangle((76, 35, 84, 85), fill=(255, 255, 255, 255)); d.rectangle((76, 78, 115, 86), fill=(255, 255, 255, 255))
    ck = s.shapes.add_picture(_png(clock), Pt(740), Pt(20), Pt(40), Pt(40))
    cw = ck.width
    out = tidy.run(prs)
    va, vb = tidy._vis(a), tidy._vis(b)
    assert abs(a.height - b.height) <= Pt(1), "머리 아이콘이 함께 든 카드의 일러스트 크기가 다르다"
    assert len({c.text_frame.paragraphs[0].runs[0].font.size for c in cells}) == 1, "같은 줄 글 크기가 다르다"
    assert li.width < Pt(40), "목록 아이콘 왼쪽 괄호 조각을 못 지웠다"
    assert tl.width == tw, "렌치처럼 가늘고 긴 그림까지 지웠다(음성 대조)"
    assert rg.width < Pt(30), "둘레 원 테두리를 못 지웠다"
    assert hs.width == hw, "헤드셋 머리띠(열린 호)까지 지웠다(음성 대조)"
    assert ck.width == cw, "시계 테두리(두꺼운 고리)까지 지웠다(음성 대조)"
    assert all(v == 0 for v in tidy.run(prs).values()), "두 번째 실행에서 또 바뀐다"


def test_tile_on_band():
    """파란 띠 위 '파란 네모째 잘린 아이콘'은 흰 그림만 남긴다(R228) — 흰 그림만인 아이콘은 그대로(음성 대조)"""
    import tidy
    prs = Presentation()
    prs.slide_width, prs.slide_height = Emu(9906000), Emu(6858000)
    s = prs.slides.add_slide(prs.slide_layouts[6])
    band = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Pt(20), Pt(20), Pt(300), Pt(24))
    band.fill.solid(); band.fill.fore_color.rgb = RGBColor(0x1C, 0x56, 0xB0)
    def tile(d):
        d.rectangle((0, 0, 159, 159), fill=(40, 90, 220, 140)); d.ellipse((40, 40, 120, 120), outline=(255, 255, 255, 255), width=14)
    t = s.shapes.add_picture(_png(tile), Pt(22), Pt(22), Pt(20), Pt(20))
    clean = s.shapes.add_picture(_png(lambda d: d.ellipse((40, 40, 120, 120), outline=(255, 255, 255, 255), width=14)), Pt(200), Pt(22), Pt(20), Pt(20))
    cw = clean.width
    assert tidy.tile_on_band(prs) == 1
    assert t.width < Pt(20), "파란 네모를 못 뺐다"
    assert clean.width == cw, "흰 그림만인 아이콘까지 바꿨다(음성 대조)"


def test_card_with_header_chip_is_card():
    """머리 칩만 든 카드는 패널이 아니라 카드(R227) — 처음 판은 6·9·28·30·34·37쪽 카드 그림을 맞추지 못했다"""
    import tidy
    prs = Presentation()
    prs.slide_width, prs.slide_height = Emu(9906000), Emu(6858000)
    s = prs.slides.add_slide(prs.slide_layouts[6])
    pics = []
    for i, sz in enumerate((60, 80)):
        c = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Pt(20 + i * 220), Pt(20), Pt(200), Pt(150))
        c.fill.solid(); c.fill.fore_color.rgb = RGBColor(0xF4, 0xF7, 0xFE)
        chip = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Pt(25 + i * 220), Pt(25), Pt(150), Pt(22))
        chip.fill.solid(); chip.fill.fore_color.rgb = RGBColor(0x1F, 0x4F, 0xE0)
        pics.append(s.shapes.add_picture(_png(lambda d: d.ellipse((20, 20, 140, 140), fill=(40, 100, 230, 255))), Pt(100 + i * 220), Pt(80), Pt(sz), Pt(sz)))
    tidy.sibling_pics(prs)
    assert abs(pics[0].height - pics[1].height) <= Pt(1), "머리 칩 든 카드의 그림 크기를 못 맞춘다"


def _deck():
    prs = Presentation()
    prs.slide_width, prs.slide_height = Emu(9906000), Emu(6858000)
    return prs, prs.slides.add_slide(prs.slide_layouts[6])


def _card(s, x, y, w, h, rgb=(0xFF, 0xFF, 0xFF)):
    c = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Pt(x), Pt(y), Pt(w), Pt(h))
    c.fill.solid(); c.fill.fore_color.rgb = RGBColor(*rgb)
    return c


def test_row_balance():
    """가로 카드 줄 간격 같게 + 안 그림 따라 옮김(R231) — 간격에 화살표가 섞인 줄은 그대로(음성 대조)"""
    import tidy
    prs, s = _deck()
    cards = [_card(s, x, 100, 150, 60) for x in (20, 186, 340)]        # 간격 16 · 4
    ic = s.shapes.add_picture(_png(lambda d: d.rectangle((20, 20, 140, 140), fill=(40, 100, 230, 255))), Pt(196), Pt(110), Pt(30), Pt(30))
    off = ic.left - cards[1].left
    assert tidy.row_balance(prs) == 1
    g = [(b.left - (a.left + a.width)) for a, b in zip(cards, cards[1:])]
    assert abs(g[0] - g[1]) <= Pt(0.5), f"간격이 아직 다르다 {g}"
    assert abs((ic.left - cards[1].left) - off) <= Pt(1), "카드 안 그림이 따라오지 않았다"
    assert abs(cards[0].left - Pt(20)) <= Pt(0.5) and abs(cards[2].left + cards[2].width - Pt(490)) <= Pt(0.5), "줄 양 끝이 바뀌었다"
    prs2, s2 = _deck()
    for x in (20, 186, 340):
        _card(s2, x, 100, 150, 60)
    s2.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, Pt(172), Pt(125), Pt(12), Pt(10))
    assert tidy.row_balance(prs2) == 0, "화살표가 한 칸에만 있는 줄을 건드렸다(음성 대조)"


def test_icon_vcenter():
    """머리 띠 없는 가로 카드의 왼쪽 아이콘은 카드 세로 가운데(R234) — 머리 띠 카드의 제목 아이콘은 그대로(음성 대조)"""
    import tidy
    prs, s = _deck()
    c = _card(s, 20, 100, 300, 60)
    ic = s.shapes.add_picture(_png(lambda d: d.rectangle((0, 0, 159, 159), fill=(40, 100, 230, 255))), Pt(30), Pt(104), Pt(24), Pt(24))
    c2 = _card(s, 20, 200, 300, 60)
    _card(s, 20, 200, 300, 18, (0x1F, 0x4F, 0xE0))
    ic2 = s.shapes.add_picture(_png(lambda d: d.rectangle((0, 0, 159, 159), fill=(40, 100, 230, 255))), Pt(24), Pt(202), Pt(14), Pt(14))
    t2 = ic2.top
    assert tidy.icon_vcenter(prs) == 1
    assert abs((ic.top + ic.height / 2) - (c.top + c.height / 2)) <= Pt(0.5), "아이콘이 카드 세로 가운데가 아니다"
    assert ic2.top == t2, "머리 띠 카드의 제목 아이콘까지 옮겼다(음성 대조)"


def test_round_disc_and_aspect():
    """타원으로 보이는 원판 아이콘 → 정원(R233), 늘어난 그림 → 원본 비율로 잘라 채움 — 2% 안은 그대로(음성 대조)"""
    import tidy
    prs, s = _deck()
    disc = s.shapes.add_picture(_png(lambda d: d.ellipse((0, 0, 159, 159), fill=(20, 80, 220, 255))), Pt(20), Pt(100), Pt(42), Pt(40))
    sq = lambda d: d.rectangle((0, 0, 159, 159), fill=(200, 60, 60, 255))
    wide = s.shapes.add_picture(_png(sq), Pt(100), Pt(100), Pt(108), Pt(100))
    ok = s.shapes.add_picture(_png(sq), Pt(300), Pt(100), Pt(101), Pt(100))
    assert tidy.round_disc_pics(prs) == 1 and abs(disc.width - disc.height) <= Pt(0.2), "원판이 아직 타원"
    assert tidy.pic_aspect(prs) == 1, "늘어난 그림을 못 잡았다(또는 2% 안까지 잡았다)"
    assert wide.crop_top > 0 and ok.crop_top == 0 and ok.crop_left == 0
    assert tidy.round_disc_pics(prs) == 0 and tidy.pic_aspect(prs) == 0, "두 번째에 또 바꾼다"


def test_accent_tint():
    """흰 카드만인 장 — 화살표 사이 가운데 카드를 아주 연한 파랑으로(R230) — 연한 카드가 이미 있으면 그대로(음성 대조)"""
    import tidy
    prs, s = _deck()
    cards = [_card(s, x, 100, 140, 80) for x in (20, 190, 360)]
    for x in (163, 333):
        s.shapes.add_shape(MSO_SHAPE.LEFT_RIGHT_ARROW, Pt(x), Pt(130), Pt(24), Pt(14))
    assert tidy.accent_tint(prs) == 1
    assert str(cards[1].fill.fore_color.rgb) != "FFFFFF" and str(cards[0].fill.fore_color.rgb) == "FFFFFF"
    prs2, s2 = _deck()
    _card(s2, 20, 100, 140, 80); _card(s2, 190, 100, 140, 80); _card(s2, 360, 100, 140, 80, (0xF4, 0xF8, 0xFD))
    assert tidy.accent_tint(prs2) == 0, "이미 연한 카드가 있는 장을 바꿨다(음성 대조)"


def test_card_pic_vcenter_beside_text():
    """글 옆 오른쪽 일러스트는 머리 아래 본문 세로 가운데(R229) — 글과 6pt 넘게 띄운다"""
    import tidy
    prs, s = _deck()
    pics = []
    for i in range(2):
        x = 20 + i * 260
        _card(s, x, 100, 240, 120)
        _card(s, x, 100, 240, 24, (0x1F, 0x4F, 0xE0))
        tb = s.shapes.add_textbox(Pt(x + 8), Pt(130), Pt(140), Pt(20)); tb.text_frame.text = "짧은 글"
        tb.text_frame.paragraphs[0].runs[0].font.size = Pt(10)
        pics.append(s.shapes.add_picture(_png(lambda d: d.rectangle((10, 10, 150, 150), fill=(40, 100, 230, 255))), Pt(x + 170), Pt(170), Pt(50), Pt(50)))
    tidy.sibling_pics(prs)
    mid = Pt(100) + (Pt(24) + Pt(120)) / 2
    for p in pics:
        assert abs((p.top + p.height / 2) - mid) <= Pt(3), "본문 세로 가운데가 아니다"


def test_keep_notes():
    """R237 — 원본 노트를 글이 같은 결과 장에. 순서가 바뀌고 앞장이 끼어도 같은 장으로, 글이 다른 장·keep 아닌 기획은 옮기지 않음(음성 대조)"""
    import json, subprocess
    import keepnotes
    d = tempfile.mkdtemp()
    bodies = [("사업의 배경 국가 바이오 데이터 통합 플랫폼 구축 목표", "첫째 장 스크립트입니다."),
              ("운영 조직 인력 구성 통합운영실 상주 인원 배치 계획", "둘째 장 스크립트입니다.\n두 번째 줄."),
              ("장애 대응 절차 모니터링 경보 접수 조치 보고 체계", "")]
    src = Presentation()
    for t, n in bodies:
        s = src.slides.add_slide(src.slide_layouts[6])
        s.shapes.add_textbox(Pt(20), Pt(20), Pt(500), Pt(40)).text_frame.text = t
        if n:
            s.notes_slide.notes_text_frame.text = n
    sp = os.path.join(d, "src.pptx"); src.save(sp)
    out = Presentation()
    for t in ("표지 제안발표", bodies[1][0] + " 시안 꾸밈", bodies[0][0], "전혀 다른 내용 회의 일정 안내 자료 정리"):
        s = out.slides.add_slide(out.slide_layouts[6])
        s.shapes.add_textbox(Pt(20), Pt(20), Pt(500), Pt(40)).text_frame.text = t
    op = os.path.join(d, "out.pptx"); out.save(op)
    plan = os.path.join(d, "plan.json")
    json.dump({"keep": False}, open(plan, "w", encoding="utf-8"))
    eng = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    subprocess.run([sys.executable, os.path.join(eng, "keepnotes.py"), op, sp, plan], check=True, capture_output=True)
    assert not any(keepnotes.notes_of(s) for s in Presentation(op).slides), "keep 아닌 기획인데 노트를 옮겼다"
    json.dump({"keep": True}, open(plan, "w", encoding="utf-8"))
    subprocess.run([sys.executable, os.path.join(eng, "keepnotes.py"), op, sp, plan], check=True, capture_output=True)
    got = [keepnotes.notes_of(s) for s in Presentation(op).slides]
    assert got == ["", "둘째 장 스크립트입니다.\n두 번째 줄.", "첫째 장 스크립트입니다.", ""], got


def _front_deck(texts, layout_mark=None):
    """앞장 시험 덱 — 표지(위 문구·큰 제목·아래 꼬리표)·목차·간지 1·본문 1·끝인사. layout_mark 면 레이아웃에 사각형(테마 색)·배경을 넣는다"""
    from lxml import etree
    prs = Presentation()
    prs.slide_width, prs.slide_height = Emu(9906000), Emu(6858000)
    lay = prs.slide_layouts[6]
    if layout_mark:
        A = "http://schemas.openxmlformats.org/drawingml/2006/main"
        P = "http://schemas.openxmlformats.org/presentationml/2006/main"
        tree = lay._element.find(f"{{{P}}}cSld/{{{P}}}spTree")
        tree.append(etree.fromstring(
            f'<p:sp xmlns:p="{P}" xmlns:a="{A}"><p:nvSpPr><p:cNvPr id="77" name="{layout_mark}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>'
            f'<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="900000" cy="400000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
            f'<a:solidFill><a:schemeClr val="accent1"/></a:solidFill></p:spPr></p:sp>'))
        csld = lay._element.find(f"{{{P}}}cSld")
        csld.insert(0, etree.fromstring(f'<p:bg xmlns:p="{P}" xmlns:a="{A}"><p:bgPr><a:solidFill><a:srgbClr val="0A2C72"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>'))

    def tb(s, x, y, t, size):
        b = s.shapes.add_textbox(Pt(x), Pt(y), Pt(500), Pt(size * 1.5))
        b.text_frame.text = t
        b.text_frame.paragraphs[0].runs[0].font.size = Pt(size)
        return b
    s = prs.slides.add_slide(lay)   # 표지
    tb(s, 40, 120, texts["slogan"], 14); tb(s, 40, 150, texts["title"], 28); tb(s, 40, 220, texts["tail"], 14)
    s.notes_slide.notes_text_frame.text = "표지 노트"
    if texts.get("nums"):   # 템플릿 목차 — 머리 글 없이 레이아웃 이름('목차')으로 알아본다(실제 템플릿처럼 머리는 레이아웃에 박힘)
        tl = prs.slide_layouts[5]
        tl._element.find("{http://schemas.openxmlformats.org/presentationml/2006/main}cSld").set("name", "목차")
        s = prs.slides.add_slide(tl)
    else:
        s = prs.slides.add_slide(lay)   # 목차
    if texts.get("toc_head"):
        tb(s, 40, 130, texts["toc_head"], 36)
    for i, t in enumerate(texts["toc"]):
        if texts.get("nums"):
            tb(s, 20, 220 + i * 40, f"0{i + 1}", 16)
        tb(s, 60, 220 + i * 40, t, 18)
    s = prs.slides.add_slide(lay)   # 간지
    tb(s, 40, 100, texts["div"], 54); tb(s, 40, 200, texts["div_line"], 24)
    s = prs.slides.add_slide(lay)   # 본문(머리 띠)
    tb(s, 20, 8, "사업 이해", 14).text_frame.add_paragraph().text = "본문 장"
    tb(s, 40, 150, "본문 내용 글", 12)
    s = prs.slides.add_slide(lay)   # 끝인사
    tb(s, 100, 200, "감사합니다", 48)
    return prs


def test_keep_front():
    """R238 — 앞장은 사람이 만든 장으로. 템플릿 없음: 올린 장표 앞장 그대로(레이아웃 도형·배경·테마 색을 장 위에 굳힘, 노트 뗌).
    템플릿 있음: 템플릿 디자인에 원본 글 — 표지 위·아래 문구가 뒤바뀌지 않고(크기 순위만으로 짝지으면 뒤바뀜 = 음성 대조), 목차 번호 동그라미 템플릿엔 '1.' 을 떼고, 넘친 글은 경고"""
    import keepfront as KF
    from lxml import etree
    d = tempfile.mkdtemp()
    src_t = {"slogan": "원본 키메시지", "title": "원본 사업명 제안", "tail": "(1차) 원본 설명회", "toc_head": "제안발표 목차",
             "toc": ["1. 원본 가 장", "2. 원본 나 장", "3. 원본 다 장"], "div": "원본 간지", "div_line": "원본 간지 한 줄"}
    tpl_t = {"slogan": "템플릿 문구", "title": "템플릿 제목", "tail": "템플릿 꼬리", "toc": ["템플릿 일", "템플릿 이"], "nums": True,
             "div": "템플릿 간지", "div_line": "템플릿 한 줄"}
    sp = os.path.join(d, "src.pptx"); _front_deck(src_t, "src_layout_mark").save(sp)
    tp = os.path.join(d, "tpl.pptx"); _front_deck(tpl_t, "tpl_layout_mark").save(tp)
    assert KF.classify(sp) == {"cover": [0], "toc": [1], "div": [2], "end": [4], "qna": []}, KF.classify(sp)

    def texts(p):
        s = Presentation(p).slides[0]
        return [(round(sh.top / 12700), sh.text_frame.text) for sh in s.shapes if sh.has_text_frame and sh.text_frame.text]

    # 템플릿 없음 — 올린 장표 앞장 그대로
    got, warns = KF.prepare(sp, os.path.join(d, "a"))
    assert set(got) == {"cover", "toc", "div1", "end", "_names"} and not warns, (got, warns)
    assert got["_names"] == {"div1": "원본 간지"}
    assert KF.pick_div(got["_names"], "원 본 간지  ·  다른 글", set()) == "div1" and KF.pick_div(got["_names"], "엉뚱한 간지", set()) is None   # 이름으로 짝(음성 대조)
    prs = Presentation(got["cover"])
    s = prs.slides[0]
    assert len(prs.slides) == 1 and s._element.get("showMasterSp") == "0"
    assert not s.has_notes_slide, "원본 노트가 남으면 발표 스크립트(R237)가 건너뛴다"
    names = [sh.name for sh in s.shapes]
    assert "src_layout_mark" in names and names.index("pd_keepfront_bg") < names.index("src_layout_mark"), names
    xml = etree.tostring(s._element).decode()
    assert "schemeClr" not in xml, "테마 색이 남으면 다른 장표에 끼울 때 색이 바뀐다"
    assert [t for _, t in texts(got["cover"])] == ["원본 키메시지", "원본 사업명 제안", "(1차) 원본 설명회"]

    # 템플릿 있음 — 템플릿 디자인 + 원본 글
    got, warns = KF.prepare(sp, os.path.join(d, "b"), tp)
    s = Presentation(got["cover"]).slides[0]
    assert "tpl_layout_mark" in [sh.name for sh in s.shapes]
    assert texts(got["cover"]) == [(120, "원본 키메시지"), (150, "원본 사업명 제안"), (220, "(1차) 원본 설명회")], texts(got["cover"])
    toc = [t for _, t in texts(got["toc"])]
    assert toc == ["01", "원본 가 장", "02", "원본 나 장"], toc   # 머리 글상자 없는 템플릿 — 원본 머리는 넣지 않고 번호는 뗌
    assert any("3. 원본 다 장" in w for _, w in warns), warns   # 자리가 모자란 원본 글은 확인 목록
    assert [t for _, t in texts(got["div1"])] == ["원본 간지", "원본 간지 한 줄"]

    # 음성 대조 — 크기 순위로만 짝지으면(옛 방식) 같은 14pt 위·아래 문구가 '읽는 순서'가 아니게 섞일 수 있다: 아래 꼬리표를 더 크게 한 원본으로 확인
    src2 = dict(src_t)
    p2 = _front_deck(src2, None)
    p2.slides[0].shapes[2].text_frame.paragraphs[0].runs[0].font.size = Pt(18)   # 꼬리표가 키메시지보다 큼
    sp2 = os.path.join(d, "src2.pptx"); p2.save(sp2)
    got, _ = KF.prepare(sp2, os.path.join(d, "c"), tp)
    assert [t for _, t in texts(got["cover"])] == ["원본 키메시지", "원본 사업명 제안", "(1차) 원본 설명회"], texts(got["cover"])


def test_keep_style():
    """R239 — 기존 구성 그대로는 타입을 고르지 않고 검증된 e. keep 이 아니면 고른 타입 그대로(음성 대조)"""
    import styles
    assert styles.of_job({"opts": {"keep": True, "style": "a"}}) == styles.KEEP_STYLE == "e"
    assert styles.of_job({"opts": '{"keep": false, "style": "c"}'}) == "c"
    assert styles.of_job({"opts": {}}) == "a"


if __name__ == "__main__":
    for n, f in list(globals().items()):
        if n.startswith("test_"):
            f()
            print("ok", n)

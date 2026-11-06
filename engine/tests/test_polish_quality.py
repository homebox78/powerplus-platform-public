# -*- coding: utf-8 -*-
"""초안 다듬기 품질 시험 — 사용자 2026-10-28 지적(8·9·12·13·16·17·19쪽 비교) "다듬기 전이 글자가 더 잘 보인다".
  ① 굵기·크기 하한 = 원본: 고른 서체(G마켓 산스·프리젠테이션)로 바꿔도 같은 글의 굵기(획 농도)·글 폭이 원본과 비슷하다
     음성 대조 — 옛 길(마무리 finalize --polish 만)은 같은 판정에서 떨어져야 한다(굵은 a시월구일·KoPub Bold 가 4 Regular 로)
  ② 강조 지도 유지: 원본에서 더 굵던 글(조직도 이름 Bold·숫자)이 결과에서도 더 굵다(강조 흐려짐 0쌍) — 옛 길은 흐려진다
  ③ 가장 옅은 단계(fonts.json 0단계)를 원본이 옅지 않은 글에 쓰지 않는다
  ④ 이상한 줄바꿈: 뱃지 '02. 사업소개' 꺾임 · 제목 꼬리 '(2/2)' 다음 줄 · 숫자 단위 공백 '173 개' → 고친 뒤 검사 0건
  ⑤ 키메시지 가운데: 장 가운데를 노린 두 줄 키메시지(왼쪽 정렬·상자 치우침) → 상자 장 가운데 + 문단 가운데 정렬. 보조 괄호 줄도
  ⑥ 그림: 실사 사진·화면 캡처·로고·캐릭터는 그대로, 일반 아이콘만 새 세트(고해상)로. 이미지가 안 되면 powerPlus 자산으로.
     AI 가 사진을 '아이콘'이라 해도 픽셀이 사진이면 남긴다 · 분석이 실패하면 아무것도 바꾸지 않는다
  ⑦ (원본 사본이 있으면) 실제 초안 8·9·12·16·17·19쪽 — 새 길 판정 통과율 95% 이상 · 옛 길 50% 미만

  python -X utf8 engine/tests/test_polish_quality.py       (전부 통과면 0)
  PD_ENGINE_DIR=<고치기 전 engine 사본> python …          음성 대조 — 고치기 전 코드에는 polish_prep·polish_icons 가 없어 실패해야 한다
AI·서버 없음(그림 분석·시트 생성·자산 찾기는 가짜 함수). 서체 굵기 수치는 templates/polish/font_ink.json."""
import glob, io, json, os, random, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.abspath(os.environ.get("PD_ENGINE_DIR") or os.path.dirname(HERE))
TMP = tempfile.mkdtemp(prefix="polq-")
REAL = os.environ.get("PD_POLISH_SRC") or r"D:\tmp_deck_audit\polish\source.pptx"
sys.path.insert(0, SRC)
try:   # 국문 통일 서체(사용자 10-28: 키메시지 G마켓 산스 · 본문 a시월구일 2·3·4) — 엔진이 작업마다 넘기는 것과 같은 값(fontset.for_lang)
    import fontset as _fs
    ENV = dict(_fs.env(None, None, lang="ko"), PYTHONIOENCODING="utf-8")
except Exception:
    ENV = dict(os.environ, PYTHONIOENCODING="utf-8")
os.environ.update({k: v for k, v in ENV.items() if k.startswith("PD_")})

from pptx import Presentation  # noqa: E402
from pptx.util import Inches, Pt, Emu  # noqa: E402
from pptx.enum.text import PP_ALIGN  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"


def run(*args, ok=True):
    r = subprocess.run([sys.executable, "-X", "utf8"] + list(args), capture_output=True, text=True, encoding="utf-8", errors="replace", env=ENV, timeout=900)
    if ok and r.returncode not in (0, 1):
        raise RuntimeError((r.stderr or r.stdout)[-600:])
    return r


def box(s, x, y, w, h, text, face, pt, bold=False, align=None):
    tb = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    for i, line in enumerate(text.split("\n")):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        if align:
            p.alignment = align
        r = p.add_run()
        r.text = line
        r.font.size = Pt(pt)
        r.font.name = face
        r.font.bold = bold or None
        rp = r._r.find(A + "rPr")
        ea = rp.makeelement(A + "ea", {"typeface": face})
        rp.append(ea)
    return tb


def weight_deck(path):
    """9·19쪽 꼴 — 굵은 제목(a시월구일3 24pt)·장 제목(a시월구일2 18pt)·조직도 이름(KoPub Bold 11pt 굵게)·보통 이름·카드 목록(8pt)·원 안 숫자"""
    prs = Presentation()
    prs.slide_width, prs.slide_height = Emu(9906000), Emu(6858000)
    s = prs.slides.add_slide(prs.slide_layouts[6])
    box(s, 0.4, 0.4, 4, 0.5, "1) 본인 행정정보 연계 현황", "a시월구일2", 18)
    box(s, 1.5, 1.2, 7.5, 0.6, "60개 보유기관, 249종 구비서류 제공", "a시월구일3", 24)
    box(s, 0.5, 2.2, 2.2, 0.4, "박태호 차장", "KoPub돋움체 Bold", 11, bold=True)
    box(s, 3.0, 2.2, 2.2, 0.4, "장재열 이사", "KoPub돋움체 Bold", 11)
    box(s, 0.5, 3.0, 2.5, 1.2, "주민등록표 등·초본\n국외이주신고증명서\n지방세납세증명서 등", "KoPub돋움체 Bold", 8)
    box(s, 3.5, 3.0, 0.8, 0.4, "8종", "a시월구일2", 11)
    box(s, 5.0, 3.0, 3.0, 0.5, "공공 마이데이터 유통 시스템", "a타이틀고딕3", 14)
    prs.save(path)
    return path


def old_path(src, dst):
    """옛 결과 재현(음성 대조) — 10-28 운영 결과 그대로: 모르는 서체를 '보통'으로 읽어 본문은 프리젠테이션 4 Regular(굵게만 6 SemiBold),
    20pt 이상만 G마켓 산스, 크기는 pt 그대로. 사용자가 '얇고 작다'고 한 바로 그 장표다"""
    import polish_prep as P
    prs = Presentation(src)
    for s in prs.slides:
        for r in s._element.iter(A + "r"):
            rp = P._rpr(r)
            big = int(rp.get("sz") or 0) >= 2000
            face = "G마켓 산스 TTF Bold" if big else ("Freesentation 6 SemiBold" if rp.get("b") == "1" else "Freesentation 4 Regular")
            P.set_face(rp, face)
    prs.save(dst)
    return dst


def new_path(src, dst):
    run(os.path.join(SRC, "polish_prep.py"), "fonts", src, dst)
    run(os.path.join(SRC, "finalize.py"), dst, os.path.join(TMP, "f_new"), "--polish")
    out = dst[:-5] + "_post.pptx"
    run(os.path.join(SRC, "polish_prep.py"), "post", src, dst, out)
    return out


def verdict(orig, res, slides=None):
    import polish_prep as P
    rows = P.check(orig, res, slides)
    bad, (ok, tot) = P.check_summary(rows)
    return ok, tot, bad, P.check_emphasis(orig, res, slides)


# ───────── ① ② ③
def test_weight_and_size_kept():
    src = weight_deck(os.path.join(TMP, "w.pptx"))
    ok_o, tot_o, bad_o, emp_o = verdict(src, old_path(src, os.path.join(TMP, "w_old.pptx")))
    assert bad_o, "음성 대조 실패 — 옛 길(finalize --polish 만)이 판정을 통과했다(판정기가 못 잡음)"
    ok_n, tot_n, bad_n, emp_n = verdict(src, new_path(src, os.path.join(TMP, "w_new.pptx")))
    assert not bad_n, f"새 길에서 원본보다 얇거나 작은 글: {bad_n}"
    print(f"    옛 길 통과 {ok_o}/{tot_o} · 강조 흐려짐 {len(emp_o)} → 새 길 {ok_n}/{tot_n} · {len(emp_n)}")


def test_emphasis_map_kept():
    src = os.path.join(TMP, "w.pptx")
    if not os.path.isfile(src):
        weight_deck(src)
    _, _, _, emp_o = verdict(src, os.path.join(TMP, "w_old.pptx") if os.path.isfile(os.path.join(TMP, "w_old.pptx")) else old_path(src, os.path.join(TMP, "w_old.pptx")))
    res = os.path.join(TMP, "w_new_post.pptx")
    if not os.path.isfile(res):
        res = new_path(src, os.path.join(TMP, "w_new.pptx"))
    _, _, _, emp_n = verdict(src, res)
    assert emp_o, "음성 대조 실패 — 옛 길에서 강조 흐려짐을 못 잡았다"
    assert not emp_n, f"새 길에서 강조가 흐려졌다: {emp_n[:5]}"
    import polish_prep as P
    prs = Presentation(res)
    faces = {}
    for p in prs.slides[0]._element.iter(A + "p"):
        t = "".join(r.findtext(A + "t") or "" for r in p.findall(A + "r"))
        r = p.find(A + "r")
        if r is not None:
            ea = r.find(A + "rPr").find(A + "ea")
            faces[t] = (ea.get("typeface") if ea is not None else None, r.find(A + "rPr").get("b"))
    bold_name, plain_name = faces.get("박태호 차장"), faces.get("장재열 이사")
    d = lambda f: P.vis(f[0], 11, f[1] == "1")[1]
    assert d(bold_name) > d(plain_name) * 1.05, f"원본 굵게(박태호)가 보통(장재열)보다 굵지 않다: {bold_name} vs {plain_name}"


def test_lightest_level_not_used():
    import fontset
    import polish_prep as P
    light = fontset.face(0)
    res = os.path.join(TMP, "w_new_post.pptx")
    if not os.path.isfile(res):
        res = new_path(weight_deck(os.path.join(TMP, "w.pptx")), os.path.join(TMP, "w_new.pptx"))
    used = {e.get("typeface") for e in Presentation(res).slides[0]._element.iter(A + "ea")}
    assert light not in used, f"원본이 옅지 않은데 가장 옅은 단계({light})를 썼다"
    assert all(f != light for _, f in P.body_cands(0.012)), "보통 굵기 원본에 가장 옅은 단계가 후보에 들어갔다"


# ───────── ④ ⑤
def breaks_deck(path):
    prs = Presentation()
    prs.slide_width, prs.slide_height = Emu(9906000), Emu(6858000)
    s = prs.slides.add_slide(prs.slide_layouts[6])
    box(s, 8.6, 0.25, 0.95, 0.35, "02. 사업소개", "Freesentation 6 SemiBold", 12)                 # 뱃지 — 좁아서 꺾인다
    box(s, 0.4, 0.3, 3.55, 0.5, "4) 공공 마이데이터 서비스 제공 현황(2/2)", "Freesentation 6 SemiBold", 18)   # 꼬리 (2/2) 가 다음 줄로
    box(s, 0.6, 1.0, 7.2, 1.0, "정보주체가 공공 마이데이터(XML)를 전자지갑에 발급받아\n이용기관에 직접 제공하도록 설계", "Freesentation 8 ExtraBold", 20)   # 키메시지 — 왼쪽 정렬·상자 치우침
    box(s, 2.0, 2.1, 6.0, 0.4, "(중앙행정기관(14), 지방자치단체(1) 등 ~26년 9월 기준)", "Freesentation 4 Regular", 12)   # 보조 괄호 줄
    box(s, 0.5, 3.0, 6.0, 0.5, "173 개 이용기관 193 종 서비스", "Freesentation 6 SemiBold", 16)
    prs.save(path)
    return path


def test_breaks_fixed():
    import polish_prep as P
    src = breaks_deck(os.path.join(TMP, "b.pptx"))
    before = P.scan_breaks(src)
    assert any("02." in t for _, t, _ in before), f"음성 대조 실패 — 뱃지 꺾임을 못 잡았다: {before}"
    assert any("(2/2)" in t for _, t, _ in before), f"음성 대조 실패 — '(2/2)' 다음 줄을 못 잡았다: {before}"
    out = os.path.join(TMP, "b_fix.pptx")
    run(os.path.join(SRC, "polish_prep.py"), "breaks", src, out)
    after = P.scan_breaks(out)
    assert not [x for x in after if "02." in x[1] or "(2/2)" in x[1]], f"고친 뒤에도 꺾임: {after}"
    txt = "".join(t.text or "" for t in Presentation(out).slides[0]._element.iter(A + "t"))
    assert "173개" in txt and "193종" in txt and "173 개" not in txt, "숫자·단위 사이 공백을 안 붙였다"


def test_keymsg_centered():
    import polish_prep as P
    src = os.path.join(TMP, "b.pptx")
    if not os.path.isfile(src):
        breaks_deck(src)
    km = P.scan_keymsg(src)
    assert any("전자지갑" in t for _, t, *_ in km), f"음성 대조 실패 — 치우친 키메시지를 못 잡았다: {km}"
    out = os.path.join(TMP, "b_fix.pptx")
    if not os.path.isfile(out):
        run(os.path.join(SRC, "polish_prep.py"), "breaks", src, out)
    assert not P.scan_keymsg(out), f"고친 뒤에도 키메시지가 가운데가 아님: {P.scan_keymsg(out)}"
    prs = Presentation(out)
    sw = prs.slide_width
    for sh in prs.slides[0].shapes:
        t = sh.text_frame.text if sh.has_text_frame else ""
        if "전자지갑" in t or t.startswith("(중앙"):
            assert abs(sh.left + sh.width / 2 - sw / 2) < sw * 0.01, f"상자가 장 가운데가 아님: {t[:12]}"
            assert all(p.alignment == PP_ALIGN.CENTER for p in sh.text_frame.paragraphs if p.text.strip()), f"문단 가운데 정렬 아님: {t[:12]}"


# ───────── ⑤-2 제목 서체는 키메시지만 · 머리 띠 제목은 키메시지 아님(11-02 바이오 2차, R183)
def test_title_face_keymsg_only():
    """원본 본문이 모두 G마켓인 초안 — 서체 맞춤·마무리·post 뒤 G마켓은 키메시지에만, 머리 띠 제목은 왼쪽 정렬·제자리 그대로"""
    import fontset as F
    src = os.path.join(TMP, "km.pptx")
    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(10.83), Inches(7.5)
    s = prs.slides.add_slide(prs.slide_layouts[6])
    g = "G마켓 산스 TTF Medium"
    head = box(s, 0.27, 0.11, 7.8, 0.7, "사업의 특성\n1. 운영과 유지보수의 연차사업", g, 20)
    head.text_frame.paragraphs[0].runs[0].font.size = Pt(14)
    box(s, 0.2, 1.18, 10.43, 0.5, "운영과 유지관리의 경계에서 책임 공백이 없어야 하는 사업", g, 22, align=PP_ALIGN.CENTER)
    box(s, 0.5, 2.2, 3.0, 0.4, "오류 이관 표준화", g, 14, bold=True)
    box(s, 0.5, 2.7, 4.0, 1.0, "운영 중 식별한 오류를 재현·원인분석 후 표준 양식으로 이관", g, 11)
    box(s, 5.0, 2.2, 2.0, 0.6, "월 1회", g, 26, bold=True)
    prs.save(src)
    import polish_prep as P
    pr0 = Presentation(src)
    sw, shh = pr0.slide_width / 12700, pr0.slide_height / 12700
    assert not any("연차사업" in b.text() for b in P.keymsg_boxes(pr0.slides[0], sw, shh)), "머리 띠 제목을 키메시지로 잡았다"
    out = new_path(src, os.path.join(TMP, "km_new.pptx"))
    pr = Presentation(out)
    faces = {}
    for sh in pr.slides[0].shapes:
        if sh.has_text_frame:
            for p in sh.text_frame.paragraphs:
                for r in p.runs:
                    ea = r._r.find(A + "rPr").find(A + "ea")
                    faces.setdefault(sh.text_frame.text.split("\n")[-1][:8], set()).add(ea.get("typeface") if ea is not None else None)
    title = lambda fs: any(P._title_face(f) for f in fs)   # noqa: E731
    km = [k for k in faces if k.startswith("운영과 유지")]
    assert km and title(faces[km[0]]), f"키메시지가 제목 서체가 아님: {faces}"
    rest = {k: v for k, v in faces.items() if not k.startswith("운영과 유지") and title(v)}
    assert not rest, f"키메시지 밖에 제목 서체가 남음: {rest}"
    assert all(f and f.startswith(F.NAME.split("(")[0][:4]) or not F.NAME.startswith("a시월") for k, v in faces.items() if k not in km for f in v), f"본문 서체가 아님: {faces}"
    hd = next(sh for sh in pr.slides[0].shapes if sh.has_text_frame and "연차사업" in sh.text_frame.text)
    assert abs(hd.left - Inches(0.27)) < Emu(12700), f"머리 띠 제목 상자가 옮겨짐: {hd.left}"
    assert all(p.alignment in (None, PP_ALIGN.LEFT) for p in hd.text_frame.paragraphs), "머리 띠 제목이 가운데 정렬로 바뀜"


# ───────── ⑥ 그림
def png_icon():
    im = Image.new("RGBA", (120, 120), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((30, 10, 90, 70), fill=(40, 90, 200, 255))
    d.rectangle((20, 75, 100, 115), fill=(40, 90, 200, 255))
    b = io.BytesIO(); im.save(b, "PNG"); return b.getvalue()


def png_photo(seed):
    rnd = random.Random(seed)
    im = Image.new("RGB", (160, 120))
    im.putdata([(rnd.randrange(256), rnd.randrange(256), rnd.randrange(256)) for _ in range(160 * 120)])
    b = io.BytesIO(); im.save(b, "PNG"); return b.getvalue()


def png_logo():
    im = Image.new("RGBA", (300, 60), (0, 0, 0, 0))
    ImageDraw.Draw(im).rectangle((5, 10, 295, 50), fill=(200, 30, 30, 255))
    b = io.BytesIO(); im.save(b, "PNG"); return b.getvalue()


def png_char():
    im = Image.new("RGBA", (140, 140), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((10, 30, 130, 130), fill=(120, 190, 250, 255))
    d.ellipse((45, 60, 60, 75), fill=(20, 20, 20, 255)); d.ellipse((80, 60, 95, 75), fill=(20, 20, 20, 255))
    b = io.BytesIO(); im.save(b, "PNG"); return b.getvalue()


def pic_deck(path):
    prs = Presentation()
    prs.slide_width, prs.slide_height = Emu(9906000), Emu(6858000)
    logo = png_logo()
    for k in range(3):
        s = prs.slides.add_slide(prs.slide_layouts[6])
        s.shapes.add_picture(io.BytesIO(logo), Inches(8.3), Inches(7.0), Inches(1.4), Inches(0.28)).name = "그림 1"
        if k == 0:
            s.shapes.add_picture(io.BytesIO(png_icon()), Inches(1), Inches(2), Inches(1), Inches(1)).name = "그래픽 5"       # 정보주체 아이콘 → 바꿀 것
            s.shapes.add_picture(io.BytesIO(png_photo(1)), Inches(3), Inches(2), Inches(2.4), Inches(1.8)).name = "그림 7"   # 실사 사진(AI 도 사진)
            s.shapes.add_picture(io.BytesIO(png_photo(2)), Inches(6), Inches(2), Inches(2.4), Inches(1.8)).name = "그림 8"   # AI 가 '아이콘' 이라 잘못 말한 사진
            s.shapes.add_picture(io.BytesIO(png_char()), Inches(1), Inches(4.5), Inches(1.4), Inches(1.4)).name = "그림 9"   # 마스코트(AI: character)
    prs.save(path)
    return path


def blobs(path):
    out = {}
    prs = Presentation(path)
    for no, s in enumerate(prs.slides, 1):
        for sh in s.shapes:
            if sh.shape_type == 13:
                out[(no, sh.shape_id)] = (sh.name, sh.image.blob, sh.image.size)
    return out


def fake_ai(path):
    import polish_icons as PI
    items, _ = PI.collect(path)
    cls = {"그래픽 5": ("icon", "person", "정보주체"), "그림 7": ("photo", "counter photo", "사진"), "그림 8": ("icon", "x", "x"),
           "그림 9": ("character", "mascot", "캐릭터"), "그림 1": ("logo", "logo", "로고")}

    def ai(body):
        return json.dumps({"concept": "공공 마이데이터", "style": "flat blue", "items": [
            {"n": i + 1, "class": cls[x["name"]][0], "subject_en": cls[x["name"]][1], "subject_ko": cls[x["name"]][2]} for i, x in enumerate(items)]})
    return ai


def fake_image(prompt, refs):
    im = Image.new("RGB", (1536, 864), "white")
    d = ImageDraw.Draw(im)
    for r in range(3):
        for c in range(4):
            x, y = c * 384, r * 288
            d.ellipse((x + 100, y + 60, x + 280, y + 230), fill=(30 + c * 40, 120, 220))
    b = io.BytesIO(); im.save(b, "PNG"); return b.getvalue()


def _check_protected(before, after):
    for k, (name, blob, _) in before.items():
        if name in ("그림 7", "그림 8", "그림 9", "그림 1"):
            assert k in after and after[k][1] == blob, f"손대면 안 되는 그림({name})이 바뀌었다"


def test_icons_only_generic_replaced():
    import polish_icons as PI
    src = pic_deck(os.path.join(TMP, "p.pptx"))
    out = os.path.join(TMP, "p_out.pptx")
    b0 = blobs(src)
    rep = PI.run(src, out, os.path.join(TMP, "_icons"), ai=fake_ai(src), image=fake_image, asset=None, sig="t1", log=lambda m: None)
    b1 = blobs(out)
    _check_protected(b0, b1)
    icon = [v for k, v in b1.items() if v[0].startswith(PI.PREFIX)]
    assert len(icon) == 1 and icon[0][0].endswith("그래픽 5"), f"바꾼 그림이 아이콘 하나가 아니다: {[v[0] for v in b1.values()]}"
    assert max(icon[0][2]) >= 1000, f"새 아이콘 해상도가 낮다: {icon[0][2]}"
    why = {k["why"] for k in rep["kept"]}
    assert {"실사 사진", "캐릭터·마스코트"} <= why and any("로고" in w for w in why), f"분류 이유: {why}"
    assert any("픽셀" in w for w in why), "AI 가 아이콘이라 한 사진을 픽셀로 거르지 못했다"
    md = open(os.path.join(TMP, "_icons", "분류.md"), encoding="utf-8").read()
    assert "손대지 말 것" in md and "pp_set_" in md


def test_icons_fallback_asset_and_no_analysis():
    import polish_icons as PI
    src = pic_deck(os.path.join(TMP, "p2.pptx"))
    out = os.path.join(TMP, "p2_out.pptx")
    used = []

    def bad_image(prompt, refs):
        raise RuntimeError("이미지 한도(가짜)")

    def asset(kind, text, path):
        used.append(text)
        im = Image.new("RGBA", (1200, 1200), (0, 0, 0, 0))
        ImageDraw.Draw(im).ellipse((100, 100, 1100, 1100), fill=(10, 60, 180, 255))
        im.save(path)
        return "icon_9999"
    b0 = blobs(src)
    rep = PI.run(src, out, os.path.join(TMP, "_icons2"), ai=fake_ai(src), image=bad_image, asset=asset, sig="t2", log=lambda m: None)
    _check_protected(b0, blobs(out))
    assert used == ["정보주체"] and rep["replaced"] and rep["replaced"][0]["by"] == "asset", f"자산 대체가 안 됨: {rep['replaced']} {used}"

    def no_ai(body):
        raise RuntimeError("분석 모델 실패(가짜)")
    out3 = os.path.join(TMP, "p3_out.pptx")
    rep3 = PI.run(src, out3, os.path.join(TMP, "_icons3"), ai=no_ai, image=fake_image, asset=asset, sig="t3", log=lambda m: None)
    assert not rep3["replaced"] and all(v[1] == b0[k][1] for k, v in blobs(out3).items()), "분석이 실패했는데 그림을 바꿨다"


# ───────── ⑦ 실제 초안
def test_real_deck_slides():
    if not os.path.isfile(REAL):
        print("    (원본 사본이 없어 건너뜀:", REAL, ")")
        return
    src = os.path.join(TMP, "real.pptx")
    shutil.copy2(REAL, src)
    sl = [8, 9, 12, 16, 17, 19]
    ok_o, tot_o, _, emp_o = verdict(src, old_path(src, os.path.join(TMP, "real_old.pptx")), set(sl))
    res = new_path(src, os.path.join(TMP, "real_new.pptx"))
    ok_n, tot_n, bad_n, emp_n = verdict(src, res, set(sl))
    print(f"    실제 초안 {sl}쪽: 옛 길 통과 {ok_o}/{tot_o} · 강조 흐려짐 {len(emp_o)}쌍 → 새 길 {ok_n}/{tot_n} · {len(emp_n)}쌍")
    assert ok_o / max(1, tot_o) < 0.5, "음성 대조 실패 — 옛 길이 실제 초안에서 판정을 통과했다"
    assert ok_n / max(1, tot_n) >= 0.95, f"새 길 통과율이 낮다: {ok_n}/{tot_n} {bad_n[:5]}"
    assert len(emp_n) <= len(emp_o) * 0.1, f"새 길 강조 흐려짐이 많다: {emp_n[:5]}"
    import polish_prep as P
    left = [x for x in P.scan_keymsg(res) if x[0] in sl]
    assert not left, f"키메시지가 장 가운데가 아님: {left}"
    br = [x for x in P.scan_breaks(res) if x[0] in sl]
    assert len(br) <= 2, f"줄바꿈 문제가 남음: {br}"


def main():
    tests = [(k, v) for k, v in globals().items() if k.startswith("test_") and callable(v)]
    bad = 0
    for k, fn in tests:
        try:
            fn()
            print(f"통과  {k}")
        except Exception as e:      # noqa: BLE001
            bad += 1
            print(f"실패  {k}: {type(e).__name__}: {e}")
    print(f"{len(tests) - bad}/{len(tests)} 통과  (엔진 코드: {SRC})")
    return 1 if bad else 0


if __name__ == "__main__":
    rc = main()
    os.chdir(HERE)
    shutil.rmtree(TMP, ignore_errors=True)
    sys.exit(rc)

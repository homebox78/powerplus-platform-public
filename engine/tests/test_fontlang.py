# -*- coding: utf-8 -*-
"""언어별 서체 시험(R82, 2026-10-18) — 판단 함수(fontset.for_lang)·글자 검사·pptx lang/ea·서체 동봉(fontbundle).
음성 대조를 먼저 본다: 한국어 + G마켓 산스는 그대로여야 하고, 일본어 + G마켓 산스는 바뀌어야 한다.

  python -X utf8 engine/tests/test_fontlang.py      (전부 통과면 0)
엔진 서체 파일(engine/fonts — Noto Sans JP·SC 포함)이 있어야 한다. PowerPoint·LibreOffice·AI 호출 없음(finalize.py 를 장표마다 한 번씩 돌린다)."""
import json, os, shutil, struct, subprocess, sys, tempfile, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ENGINE = os.path.dirname(HERE)
sys.path.insert(0, ENGINE)
import fontcover, fontset  # noqa: E402

FAIL = []
TMP = tempfile.mkdtemp(prefix="fontlang-")
FL = json.load(open(os.path.join(ENGINE, "fonts", "fonts.json"), encoding="utf-8"))
LANGS = ["ko", "en", "ja", "zh", "fr", "es", "de", "vi"]


def check(ok, what):
    print(("통과 " if ok else "실패 ") + what)
    if not ok:
        FAIL.append(what)


def weight(path):
    """OS/2 usWeightClass — fontTools 없이"""
    d = open(path, "rb").read()
    n = struct.unpack(">H", d[4:6])[0]
    for i in range(n):
        tag, _, off, _ = struct.unpack(">4sIII", d[12 + 16 * i: 28 + 16 * i])
        if tag == b"OS/2":
            return struct.unpack(">H", d[off + 4: off + 6])[0]
    return 0


def sample(lang):
    s = FL["samples"][lang]
    return "".join(s["title"]) + " " + s["sub"] + " " + " ".join(s["body"])


# ── 1. 음성 대조 먼저 — 측정기가 동작하나(빠진 글자를 실제로 찾아내는가)
check(fontcover.missing([os.path.join(ENGINE, "fonts", "GmarketSansTTFBold.ttf")], "審査は早く", "ja") != "", "음성 대조: G마켓 산스에서 일본어 글자 빠짐을 찾는다")
check(fontcover.missing([os.path.join(ENGINE, "fonts", "GmarketSansTTFBold.ttf")], "심사는 빠르게", "ko") == "", "양성 대조: G마켓 산스는 한국어 글자가 다 있다")
t, b, notes = fontset.for_lang("gmarket", "freesentation", "ko", sample("ko"))
check((t, b, notes) == ("gmarket", "freesentation", []), f"한국어 + G마켓 산스·프리젠테이션 = 그대로 ({t}, {b}, {notes})")
t, b, notes = fontset.for_lang("gmarket", "freesentation", "ja", sample("ja"))
check((t, b) == ("notojp", "notojp") and len(notes) == 2 and "일본어 글자가 없는 서체" in notes[0] and "Noto Sans JP" in notes[0], f"일본어 + G마켓 산스·프리젠테이션 → Noto Sans JP ({notes})")
t, b, _ = fontset.for_lang("notosc", "notosc", "ja", sample("ja"))
check((t, b) == ("notojp", "notojp"), "일본어 + Noto Sans SC(중국어 자형) → Noto Sans JP")
t, b, _ = fontset.for_lang("paperlogy", "hada", "fr", sample("fr"))
check((t, b) == ("paperlogy", "hada"), "프랑스어 + 페이퍼로지·하다 라운드(악센트 100%) = 그대로")
t, b, notes = fontset.for_lang("gmarket", "freesentation", "ko", "한국어 장표 속 「株式會社」 café")
check((t, b, notes) == ("gmarket", "freesentation", []), "한국어 장표 속 한자·악센트 낱말은 서체 전체를 바꾸지 않는다(그 런만 fallback)")
t, b, notes = fontset.for_lang("paperlogy", "pretendard", "en", "Proposal for the 𝓐 Ω system — naïve café")
check(t == "paperlogy" and b == "pretendard", "영어 글자 검사: 그리스 문자 Ω 같은 다른 문자는 서체 전체를 바꾸지 않는다")

# ── 2. 8개 언어 — 기본 서체 지원율 95%↑ · 제목은 굵은 굵기(700↑) · 견본 문장 빠진 글자 0 · 지원 못하는 G마켓 산스는 바뀐다
for lg in LANGS:
    d = FL["lang_default"][lg]
    tf = os.path.join(ENGINE, "fonts", fontset.TITLES[d["title"]][2])
    bf = [os.path.join(ENGINE, "fonts", f) for f in fontset.BODIES[d["body"]][2]]
    check(fontset.cover("title", d["title"], lg) >= 95 and fontset.cover("body", d["body"], lg) >= 95, f"{lg}: 기본 서체 지원율 95% 이상 ({d['title']} {fontset.cover('title', d['title'], lg):g} / {d['body']} {fontset.cover('body', d['body'], lg):g})")
    check(weight(tf) >= 700, f"{lg}: 제목 기본 서체 굵기 {weight(tf)} ≥ 700")
    lack = fontcover.missing([tf] + bf, sample(lg), lg)
    check(lack == "", f"{lg}: 견본 문장(특수 글자 포함) 빠진 글자 0 — '{lack}'")
    t, b, _ = fontset.for_lang("gmarket", "asta", lg, sample(lg))
    want_same = lg in ("ko", "en")   # 영어는 G마켓 산스·아스타산스가 100%(악센트 없는 견본)
    check((t == "gmarket") == want_same, f"{lg}: G마켓 산스 제목 → {t}" + (" (그대로가 맞음)" if want_same else " (바뀌어야 함)"))

# ── 3. 표가 서체 파일 실측과 같은가(손으로 고친 표 금지)
r = subprocess.run([sys.executable, "-X", "utf8", os.path.join(ENGINE, "fontcover.py"), "--check"], capture_output=True, text=True, encoding="utf-8")
check(r.returncode == 0, "font_cover.json = 서체 파일 실측(엔진·웹 두 사본)")


# ── 4. pptx — 마무리(finalize --unify-only)가 a:latin·a:ea 를 언어 서체로, lang 속성, 서체 동봉(라이선스·설치 안내)
def make(path, runs):
    from pptx import Presentation
    from pptx.util import Inches, Pt
    prs = Presentation()
    s = prs.slides.add_slide(prs.slide_layouts[6])
    tb = s.shapes.add_textbox(Inches(0.5), Inches(0.5), Inches(9), Inches(5))
    tf = tb.text_frame
    for i, (text, face, pt) in enumerate(runs):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        r = p.add_run()
        r.text = text
        r.font.size = Pt(pt)
        r.font.name = face
    prs.save(path)


def finalize(pptx, lang, title, body):
    out = os.path.join(TMP, os.path.basename(pptx) + "_fonts")
    env = dict(os.environ, PD_LANG=lang, PD_FONT_TITLE=title, PD_FONT_BODY=body)
    r = subprocess.run([sys.executable, "-X", "utf8", os.path.join(ENGINE, "finalize.py"), pptx, out], capture_output=True, text=True, encoding="utf-8", errors="replace", env=env)
    if r.returncode != 0:
        print(r.stdout[-800:], r.stderr[-1500:])
    return out


def rprs(pptx):
    import re
    with zipfile.ZipFile(pptx) as z:
        x = z.read("ppt/slides/slide1.xml").decode("utf-8")
    return re.findall(r"<a:rPr[^>]*>.*?</a:rPr>", x, re.S)


ja = os.path.join(TMP, "ja.pptx")
make(ja, [("審査は早く、医薬品AI審査体系", "G마켓 산스 TTF Bold", 28), ("散らばった管制情報を一画面で見て、すぐに対応します。", "Freesentation 4 Regular", 12)])
tt, bb, _ = fontset.for_lang("gmarket", "freesentation", "ja", sample("ja"))
fd = finalize(ja, "ja", tt, bb)
rs = rprs(ja)
check(rs and all('lang="ja-JP"' in r for r in rs), "일본어 장표: 모든 글 런 lang=ja-JP")
check(rs and all('<a:ea typeface="Noto Sans JP' in r and '<a:latin typeface="Noto Sans JP' in r for r in rs), "일본어 장표: a:latin·a:ea = Noto Sans JP (G마켓 산스 → 제목, 프리젠테이션 → 본문)")
got = sorted(os.listdir(fd)) if os.path.isdir(fd) else []
check(any(g.startswith("NotoSansJP-") and g.endswith(".ttf") for g in got), f"일본어 장표 서체 묶음에 Noto Sans JP: {got}")
check({"서체_라이선스.txt", "서체_설치안내.txt", "NotoSansJP-OFL.txt"} <= set(got), "일본어 장표 서체 묶음에 라이선스·설치 안내·OFL")
check(not any(g.startswith(("GmarketSans", "Freesentation")) for g in got), "일본어 장표 묶음에 안 쓴 한글 서체 없음")

ko = os.path.join(TMP, "ko.pptx")
make(ko, [("심사는 빠르게, 의약품 AI 심사 체계", "G마켓 산스 TTF Bold", 28), ("흩어진 관제 정보를 한 화면에서 보고 바로 대응합니다.", "Freesentation 4 Regular", 12)])
fd = finalize(ko, "ko", "gmarket", "freesentation")
rs = rprs(ko)
got = sorted(os.listdir(fd)) if os.path.isdir(fd) else []
check(not any("lang=\"ja" in r for r in rs) and all("Noto" not in r for r in rs), "음성 대조: 한국어 장표 글 런에 일본어 서체·lang 없음")
check(not any(g.startswith(("NotoSansJP", "NotoSansSC")) for g in got) and any(g.startswith("GmarketSans") for g in got), f"음성 대조: 한국어 장표 묶음에 일본어·중국어 서체 없음 {got}")

mix = os.path.join(TMP, "mix.pptx")   # 한국어 장표 속 일본어 문장 — 그 런만 Noto Sans JP, 묶음에 둘 다
make(mix, [("심사는 빠르게, 의약품 AI 심사 체계", "G마켓 산스 TTF Bold", 28), ("흩어진 관제 정보를 한 화면에서 봅니다.", "Freesentation 4 Regular", 12), ("すぐに対応します", "Freesentation 4 Regular", 12)])
fd = finalize(mix, "ko", "gmarket", "freesentation")
rs = rprs(mix)
got = sorted(os.listdir(fd)) if os.path.isdir(fd) else []
check(any("Noto Sans JP" in r for r in rs) and any("Freesentation" in r for r in rs), "섞인 언어: 일본어만 든 런은 Noto Sans JP, 한글 런은 그대로")
check(any(g.startswith("NotoSansJP") for g in got) and any(g.startswith("GmarketSans") for g in got), f"섞인 언어: 묶음에 한글 서체 + Noto Sans JP 둘 다 {got}")

shutil.rmtree(TMP, ignore_errors=True)
print(f"\n{'실패 ' + str(len(FAIL)) + '건' if FAIL else '전부 통과'}")
sys.exit(1 if FAIL else 0)

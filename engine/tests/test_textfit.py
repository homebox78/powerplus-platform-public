# -*- coding: utf-8 -*-
"""글 맞춤 마감·키메시지 띠 시험(R126·R127) — 일부러 어긋난 장표를 만들어 flatfx 가 고치는지 본다.
  ① 강조 상자 — 'API [하나]로 잇겠습니다' 의 상자를 0.3in 오른쪽에 두면 '하나' 폭에 맞춰 돌아온다
  ② 줄바꿈 내어쓰기 — '· 측정: 효과성 …' 문단은 둘째 줄이 '효과성' 선에서 시작(marL = 머리 폭, indent = -머리 폭)
  ③ 아이콘 세로 가운데 — 한 줄 제목 왼쪽 아이콘을 0.12in 아래로 두면 제목 줄 가운데로 돌아온다
  ④ 앞장 그림 — 3:2 그림을 쪽 폭에 맞춰 아래 0.28in 가 빈 간지는 아래 끝까지 붙는다(비율 유지)
  ⑤ 키메시지 띠 — 띠 경계를 가로지르는 물체(머리)는 잘리지 않게 그림을 줄여 띠 아래로 내린다 · 띠 안 떨어진 글은 그대로 덮는다
  음성 대조: 고치기 전 장표가 각 검사에서 실패하는지 먼저 본다.
  python -X utf8 engine/tests/test_textfit.py"""
import io, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from PIL import Image, ImageDraw  # noqa: E402
from pptx import Presentation  # noqa: E402
from pptx.util import Inches, Pt  # noqa: E402
from pptx.dml.color import RGBColor  # noqa: E402
import flatfx  # noqa: E402

FAILS = []
A = flatfx.A


def check(ok, msg):
    print(("통과 " if ok else "실패 ") + msg)
    if not ok:
        FAILS.append(msg)


def tb(s, x, y, w, h, runs, size, face="G마켓 산스 TTF Bold", wrap=True):
    t = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    t.text_frame.word_wrap = wrap
    p = t.text_frame.paragraphs[0]
    for txt, col in runs:
        r = p.add_run()
        r.text = txt
        r.font.size = Pt(size)
        r.font.name = face
        r.font.color.rgb = RGBColor.from_string(col)
        r._r.get_or_add_rPr().append(r._r.get_or_add_rPr().makeelement(f"{A}ea", {"typeface": face}))
    return t


def deck():
    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(10.83), Inches(7.5)
    s = prs.slides.add_slide(prs.slide_layouts[6])
    # ① 강조 상자(글보다 뒤) — 0.3in 어긋나게
    w_api = flatfx._font("G마켓 산스 TTF Bold", 19.5).getlength("API ") / 4 / 72
    box = s.shapes.add_shape(1, Inches(0.76 + w_api + 0.3), Inches(3.3), Inches(0.6), Inches(0.44))
    box.name = "pd_front_div_8"
    box.fill.solid()
    box.fill.fore_color.rgb = RGBColor(0x1E, 0x4F, 0xD8)
    t = tb(s, 0.76, 3.3, 3.1, 0.44, [("API ", "0B2868"), ("하나", "FFFFFF"), ("로 잇겠습니다", "0B2868")], 19.5, wrap=False)
    t.text_frame._txBody.bodyPr.set("lIns", "0")
    # ①-2 강조어가 앞에 오는 두 런('정품'|'의 매력을 각인합니다!') — 런 수가 같아도 글자 수로 본문 색을 가린다
    w2 = flatfx._font("G마켓 산스 TTF Bold", 24).getlength("정품") / 4 / 72
    b2_ = s.shapes.add_shape(1, Inches(0.76 + 0.6), Inches(4.3), Inches(3.2), Inches(0.5))
    b2_.name = "pd_front_div_7"
    b2_.fill.solid()
    b2_.fill.fore_color.rgb = RGBColor(0x1E, 0x4F, 0xD8)
    t2_ = tb(s, 0.76, 4.3, 7.0, 0.5, [("정품", "FFFFFF"), ("의 매력을 각인합니다!", "0B2E6B")], 24, wrap=False)
    t2_.text_frame._txBody.bodyPr.set("lIns", "0")
    # ② 글머리 문단
    tb(s, 5.5, 1.0, 3.0, 0.8, [("· 측정: 효과성(혼자 완료율)·효율성(소요 시간)·만족도·선호 방식", "333333")], 11, face="a시월구일2")
    # ③ 아이콘 + 한 줄 제목
    ic = s.shapes.add_shape(1, Inches(5.5), Inches(3.0 + 0.12), Inches(0.36), Inches(0.36))
    ic.name = "아이콘"
    ic.text_frame._txBody.bodyPr.set("anchor", "ctr")
    t3 = tb(s, 5.95, 3.0, 2.5, 0.36, [("과업별 결과", "1F2937")], 16)
    t3.text_frame._txBody.bodyPr.set("anchor", "ctr")
    # ④ 앞장 간지 그림 — 쪽 폭 10.83 × 3:2 = 7.22 높이
    s2 = prs.slides.add_slide(prs.slide_layouts[6])
    b = io.BytesIO()
    Image.new("RGB", (600, 400), (200, 210, 240)).save(b, "PNG")
    pic = s2.shapes.add_picture(io.BytesIO(b.getvalue()), 0, 0, Inches(10.83), Inches(10.83 / 1.5))
    pic.name = "pd_front_div_1"
    return prs


def measure(prs):
    s, s2 = prs.slides[0], prs.slides[1]
    box = next(x for x in s.shapes if x.name == "pd_front_div_8")
    f = flatfx._font("G마켓 산스 TTF Bold", 19.5)
    x_word = 0.76 + f.getlength("API ") / 4 / 72
    w_word = f.getlength("하나") / 4 / 72
    bl, br = box.left / 914400, (box.left + box.width) / 914400
    hl_ok = bl <= x_word + 0.005 and br >= x_word + w_word - 0.005 and bl > x_word - 0.15 and br < x_word + w_word + 0.15
    p = next(x for x in s.shapes if x.has_text_frame and "측정" in x.text_frame.text).text_frame.paragraphs[0]._p
    pp = p.find(f"{A}pPr")
    marl, ind = (int(pp.get("marL") or 0), int(pp.get("indent") or 0)) if pp is not None else (0, 0)
    head = flatfx._font("a시월구일2", 11).getlength("· 측정: ") / 4 / 72
    hang_ok = abs(marl / 914400 - head) < 0.02 and ind == -marl
    ic = next(x for x in s.shapes if x.name == "아이콘")
    t3 = next(x for x in s.shapes if x.has_text_frame and "과업별" in x.text_frame.text)
    icon_ok = abs((ic.top + ic.height / 2) - (t3.top + t3.height / 2)) / 914400 < 0.02
    pic = s2.shapes[0]
    asp = pic.width / pic.height
    bleed_ok = pic.top <= 0 and pic.top + pic.height >= prs.slide_height and abs(asp - 1.5) < 0.01
    return hl_ok, hang_ok, icon_ok, bleed_ok, (bl, br, x_word, x_word + w_word), (marl / 914400, head), pic.height / 914400


old = deck()
o = measure(old)
for k, nm in enumerate(("강조 상자", "내어쓰기", "아이콘 가운데", "앞장 그림 가장자리")):
    check(not o[k], f"음성 대조: 고치기 전 {nm} 어긋남이 잡힌다")
new = deck()
n = (flatfx.fix_highlights(new), flatfx.hang_bullets(new), flatfx.center_icons(new), flatfx.bleed_fronts(new))
m = measure(new)
check(m[0], f"① 강조 상자 {m[4][0]:.3f}~{m[4][1]:.3f} 가 '하나' {m[4][2]:.3f}~{m[4][3]:.3f} 를 감싼다")
_b7 = next(x for x in new.slides[0].shapes if x.name == "pd_front_div_7")
_w2 = flatfx._font("G마켓 산스 TTF Bold", 24).getlength("정품") / 4 / 72
check(_b7.left / 914400 < 0.76 + 0.01 and abs(_b7.width / 914400 - _w2) < 0.3, f"①-2 앞 강조어 '정품' 상자 {_b7.left / 914400:.2f}in·폭 {_b7.width / 914400:.2f}in(글 폭 {_w2:.2f})")
check(m[1], f"② 내어쓰기 marL {m[5][0]:.3f}in = 머리 폭 {m[5][1]:.3f}in")
check(m[2], "③ 아이콘 세로 가운데 = 제목 줄 가운데")
check(m[3], f"④ 앞장 그림 아래 끝까지(높이 {m[6]:.2f}in, 비율 유지)")
check(flatfx.hang_bullets(new) == 0 and flatfx.bleed_fronts(new) == 0, "두 번 돌려도 그대로")

# ⑥ 라벨 — 중간 파랑 바탕 먹색 글 → 흰색 · 7pt 로 줄어든 화살표 글 → 키움 · 'AS-IS' 줄바꿈 끔
def labels():
    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(10.83), Inches(7.5)
    s = prs.slides.add_slide(prs.slide_layouts[6])
    out = []
    for k, (txt, fill, col, pt, geom, w) in enumerate((("로그인·주소 확인", "6A9BE8", "1F2937", 7, 52, 1.53),
                                                       ("범위 확인", "C4DCFC", "FFFFFF", 10, 1, 1.5),
                                                       ("AS-IS", "E8F1FD", "1E3A8A", 9, 5, 0.59))):
        sh = s.shapes.add_shape(geom, Inches(1 + k * 2), Inches(2), Inches(w), Inches(0.5 if k < 2 else 0.23))
        sh.fill.solid()
        sh.fill.fore_color.rgb = RGBColor.from_string(fill)
        r = sh.text_frame.paragraphs[0].add_run()
        r.text, r.font.size, r.font.name = txt, Pt(pt), "G마켓 산스 TTF Bold"
        r.font.color.rgb = RGBColor.from_string(col)
        r._r.get_or_add_rPr().append(r._r.get_or_add_rPr().makeelement(f"{A}ea", {"typeface": "G마켓 산스 TTF Bold"}))
        out.append(sh)
    return prs, out


def lab_state(sh):
    r = sh.text_frame.paragraphs[0].runs[0]
    return str(r.font.color.rgb), r.font.size.pt, sh.text_frame._txBody.bodyPr.get("wrap")


_, o6 = labels()
st0 = [lab_state(x) for x in o6]
check(st0[0][0] == "1F2937" and st0[0][1] == 7 and st0[2][2] != "none", "음성 대조: 고치기 전 먹색 글·7pt·줄바꿈 켜짐")
p6, n6 = labels()
flatfx.fix_label_text(p6)
st = [lab_state(x) for x in n6]
check(st[0][0] == "FFFFFF", f"⑥ 중간 파랑(#6A9BE8) 바탕 글 → 흰색 ({st[0][0]})")
check(st[1][0] == "1F2937", f"⑥ 밝은 바탕(#C4DCFC) 흰 글 → 먹색 ({st[1][0]})")
check(st[0][1] >= 9, f"⑥ 7pt 화살표 글 → {st[0][1]}pt")
check(st[2][2] == "none", "⑥ 'AS-IS' 라벨 줄바꿈 끔")

# ⑤ 키메시지 띠 — design.clear_head_strip
import design  # noqa: E402
W_, H_ = 1200, 800
sh = int(H_ * design.HEAD_STRIP)
im = Image.new("RGB", (W_, H_), (248, 250, 255))
d = ImageDraw.Draw(im)
d.ellipse((560, sh - 40, 640, sh + 40), fill=(240, 200, 170))   # 띠 경계를 가로지르는 머리
d.rectangle((540, sh + 40, 660, 500), fill=(40, 80, 180))      # 몸
d.rectangle((100, 20, 400, 50), fill=(20, 20, 20))              # 띠 안 떨어진 글(덮을 것)
out = design.clear_head_strip(im, sh, (248, 250, 255))
g = out.load()
head_below = any(abs(g[x, y][0] - 240) < 12 and abs(g[x, y][2] - 170) < 12 for x in range(0, W_, 3) for y in range(sh + 1, sh + 120))
head_in = any(abs(g[x, y][0] - 240) < 12 and abs(g[x, y][2] - 170) < 12 for x in range(0, W_, 3) for y in range(0, sh))
check(head_below and not head_in, "⑤ 띠를 가로지르던 머리가 띠 아래로 내려옴(잘리지 않음)")
plain = Image.new("RGB", (W_, H_), (248, 250, 255))
ImageDraw.Draw(plain).rectangle((100, 20, 400, 50), fill=(20, 20, 20))
check(design.clear_head_strip(plain, sh, (248, 250, 255)) is plain, "⑤ 띠 안 떨어진 글만 있으면 그림을 줄이지 않음")

# ⑦ 앞장 그림 받침 판 윗변(R131) — 판 윗변이 곧은 그림은 잡고, 부드럽게 옅어지는 그림은 안 잡는다
def _png(im):
    b = io.BytesIO()
    im.save(b, "PNG")
    return b.getvalue()


plate = Image.new("RGB", (2400, 1600), (252, 253, 255))
ImageDraw.Draw(plate).rectangle((1100, 640, 2400, 1600), fill=(222, 232, 250))
ImageDraw.Draw(plate).ellipse((2000, 560, 2300, 860), fill=(150, 175, 230))   # 판 윗변에서 잘린 톱니 자리
soft = Image.new("RGB", (2400, 1600), (252, 253, 255))
ds = ImageDraw.Draw(soft)
for y in range(1600):   # 위에서 아래로 천천히 옅은 파랑
    c = int(252 - 30 * y / 1600)
    ds.line((1100, y, 2400, y), fill=(c, c + 4, 255))
check(design.plate_edge(_png(plate)) is not None, f"⑦ 판 윗변 그림을 잡는다 {design.plate_edge(_png(plate))}")
check(design.plate_edge(_png(soft)) is None, "⑦ 부드럽게 옅어지는 그림은 잡지 않는다(음성 대조)")

# ⑦-2 판 녹이기(melt_plate)는 판 면만 — 판 윗변에 걸친 밝은 물체(밝기 170 넘는 옅은 회청색 톱니)는 그대로 둔다(10-29 사용자 "평평한 판 면만").
#   음성 대조: 고치기 전 melt_plate 는 어두운 픽셀만 남겨, 이 밝은 물체를 바탕색으로 덮었다
light = Image.new("RGB", (2400, 1600), (252, 253, 255))
ImageDraw.Draw(light).rectangle((1100, 640, 2400, 1600), fill=(222, 232, 250))
ImageDraw.Draw(light).ellipse((1900, 600, 2100, 800), fill=(196, 206, 228))   # 밝은 톱니 — 판 색과 다르고 밝기 205
pe = design.plate_edge(_png(light))
melted = Image.open(io.BytesIO(design.melt_plate(_png(light), pe))).convert("RGB") if pe else light
obj = melted.getpixel((2000, 700))
plate_px = melted.getpixel((1500, 660))
check(pe is not None and max(abs(a - b) for a, b in zip(obj, (196, 206, 228))) <= 4, f"⑦-2 판 윗변의 밝은 물체는 그대로({obj})")
check(pe is not None and sum(plate_px) > sum((222, 232, 250)) + 6, f"⑦-2 판 면은 녹아 바탕색 쪽으로({plate_px})")

print(f"\n실패 {len(FAILS)}건" if FAILS else "\n전부 통과")
sys.exit(1 if FAILS else 0)

# -*- coding: utf-8 -*-
"""가로 장표 마감(10-27~30 전수조사 B 항목, R148·R149) — AI·서버 없이 만든 장표로.
 ① 본문이 바닥까지 내려온다(keymsg 는 그대로, 작은 도형 크기 유지) — 음성: 고치기 전엔 아래 끝 5.80in
 ② 같은 칸 글 크기를 많은 쪽으로(머리글·큰 수치는 그대로)
 ③ 결론 띠 글 크기를 덱 전체에서 맞춘다
 ④ 쪽 밖 글 상자를 쪽 안으로
 ⑤ 7pt 아래 글 — 들어가면 키우고 안 들어가면 둔다
 ⑥ 빈칸·메모 문구와 덮인 글을 찾는다(정상 글은 안 잡는다)
 ⑦ 내용보다 좁게 잡힌 칸을 넓힌다 ⑧ 글에 붙은 알약을 푼다 ⑨ 글을 뚫은 구분선을 옮긴다(R150)"""
import os, sys
sys.path.insert(0, os.path.abspath(os.environ.get("PD_ENGINE_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")))
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.util import Inches, Pt
import flatfx

FAILS = []
IN = 914400
FACE = "G마켓 산스 TTF Bold"


def check(ok, msg):
    print(("통과 " if ok else "실패 ") + msg)
    if not ok:
        FAILS.append(msg)


def box(s, x, y, w, h, t, pt=10, name=None, fill=None):
    sh = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h)) if fill else s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    if fill:
        sh.fill.solid()
        sh.fill.fore_color.rgb = RGBColor.from_string(fill)
    sh.text_frame.word_wrap = True
    r = sh.text_frame.paragraphs[0].add_run()
    r.text = t
    r.font.size = Pt(pt)
    r.font.name = FACE
    r._r.get_or_add_rPr().append(r._r.get_or_add_rPr().makeelement("{http://schemas.openxmlformats.org/drawingml/2006/main}ea", {"typeface": FACE}))
    if name:
        sh.name = name
    return sh


def size(sh):
    return sh.text_frame.paragraphs[0].runs[0].font.size.pt


prs = Presentation()
prs.slide_width, prs.slide_height = Inches(10.83), Inches(7.5)
s1 = prs.slides.add_slide(prs.slide_layouts[6])
key = box(s1, 0.2, 1.03, 10.4, 0.45, "키 메시지", 25, name="keymsg")
card = box(s1, 0.4, 1.7, 3, 3.5, "카드 글이 들어 있습니다", 10)
ic = s1.shapes.add_shape(MSO_SHAPE.OVAL, Inches(4), Inches(2), Inches(0.5), Inches(0.5))
band = box(s1, 0.4, 5.6, 10, 0.5, "결론 띠입니다", 15, fill="1F3A8A")
top0, h_ic = key.top, ic.height
n = flatfx.fill_height(prs)
check(n == 1 and abs((band.top + band.height) / IN - flatfx.BODY_BOTTOM) < 0.02, f"① 결론 띠 끝이 바닥으로({(band.top + band.height) / IN:.2f}in, 고치기 전 6.10in)")
check(key.top == top0, "① keymsg 는 그대로")
check(ic.height == h_ic, "① 작은 도형은 크기 유지")
check(flatfx.fill_height(prs) == 0, "① 두 번 돌려도 그대로")

s2 = prs.slides.add_slide(prs.slide_layouts[6])
head = box(s2, 1, 1.5, 3, 0.3, "전략 머리글", 12)
rows = [box(s2, 1, 2 + i * 0.5, 3, 0.4, f"행 내용 글 {i}번째", 8) for i in range(6)]
rows[3].text_frame.paragraphs[0].runs[0].font.size = Pt(10)
kpi = [box(s2, 6, 2 + i * 0.5, 3, 0.4, f"큰 수치 칸 {i}번째", 8) for i in range(4)]
kpi[1].text_frame.paragraphs[0].runs[0].font.size = Pt(30)
flatfx.unify_siblings(prs)
check(size(rows[3]) == 8, "② 혼자 큰 칸(10pt)을 많은 쪽(8pt)으로")
check(size(head) == 12, "② 맨 위 머리글은 그대로")
check(size(kpi[1]) == 30, "② 일부러 큰 수치(3pt 넘게 큼)는 그대로")

s3 = prs.slides.add_slide(prs.slide_layouts[6])
band3 = box(s3, 0.4, 6.3, 10, 0.5, "다른 쪽 결론 띠입니다", 13, fill="1F3A8A")
flatfx.unify_bands(prs)
check(size(band) == 13, "③ 결론 띠 글을 덱에서 가장 작은 크기로(15 → 13pt)")

wide = box(s3, 7.33, 3, 4.14, 0.3, "국외 매체비는 별도", 12)
check((wide.left + wide.width) / IN > 10.83, "④ 음성 입력: 쪽 밖 11.47in")
flatfx.clamp_right(prs)
check((wide.left + wide.width) / IN <= 10.83, f"④ 쪽 안으로({(wide.left + wide.width) / IN:.2f}in)")

small = box(s3, 1, 3, 2, 0.3, "캡션 글", 5)
tight = box(s3, 1, 4, 0.5, 0.15, "이 글은 상자보다 훨씬 깁니다 정말로 많이", 5)
up, left = flatfx.lift_tiny(prs)
check(size(small) == 7, "⑤ 들어가는 5pt 글은 7pt 로")
check(size(tight) == 5 and left >= 1, "⑤ 안 들어가는 글은 두고 개수로 알림")

s4 = prs.slides.add_slide(prs.slide_layouts[6])
box(s4, 1, 1, 3, 0.4, "2026.00.00", 10)
box(s4, 1, 2, 3, 0.4, "세부 항목 확정 후 기재", 10)
box(s4, 1, 3, 3, 0.4, "2026.12.30 완료", 10)
check(len(flatfx.leftovers(s4)) == 2, "⑥ 빈칸 문구 둘을 찾고 정상 날짜는 안 잡음")
s5 = prs.slides.add_slide(prs.slide_layouts[6])
box(s5, 1, 1, 3, 0.4, "복잡한 접근 절차", 10)
box(s5, 1, 1.15, 3, 0.3, "덮는 알약", 8, fill="DDEEFF")
box(s5, 5, 1, 3, 0.4, "떨어진 글", 10)
check(len(flatfx.covered_text(s5)) == 1, "⑥ 글을 덮는 상자를 찾음(떨어진 글은 안 잡음)")

# ⑦ 좁게 잡힌 칸 — 77850f 4쪽 재현. 음성: 고치기 전엔 글이 칸 양쪽으로 삐져나온다
prs2 = Presentation()
prs2.slide_width, prs2.slide_height = Inches(10.83), Inches(7.5)
s6 = prs2.slides.add_slide(prs2.slide_layouts[6])


def card_at(s, x, y, w, h, fill="F3F8FE"):
    c = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    c.fill.solid()
    c.fill.fore_color.rgb = RGBColor.from_string(fill)
    return c


narrow = card_at(s6, 0.91, 1.65, 1.10, 1.34)
b1 = box(s6, 0.45, 1.8, 1.95, 0.7, "11조원", 30)
b1.text_frame.paragraphs[0].runs[0].font.size = Pt(30)
wide_label = box(s6, 0.46, 2.53, 2.02, 0.24, "해외 위조상품 유통 규모", 9)
below = card_at(s6, 0.30, 3.13, 3.20, 1.79, "FFFFFF")
inside = box(s6, 0.5, 3.5, 2.0, 0.3, "안에 든 글", 10)
ink0 = flatfx._ink(b1)
check(ink0[0] < narrow.left / IN, f"⑦ 음성 입력: 글이 칸 왼쪽 밖({ink0[0]:.2f}in, 칸 {narrow.left / IN:.2f}in)")
check(flatfx.covered_text(s6) == [], "⑦ 음성 입력: 덮임 경고로는 안 잡히는 결함")
h0 = below.width
r = flatfx.wrap_cards(prs2)
check(len(r) == 1 and narrow.left / IN <= ink0[0] and abs(narrow.left - below.left) < 2, f"⑦ 칸이 글을 감싸고 아래 칸 왼쪽 끝에 맞음({narrow.left / IN:.2f}in)")
check(below.width == h0, "⑦ 글이 안에 든 칸은 그대로")
check(flatfx.wrap_cards(prs2) == [], "⑦ 두 번 돌려도 그대로")

s7 = prs2.slides.add_slide(prs2.slide_layouts[6])   # 넓히면 옆 칸에 부딪힘 — 그대로 둔다
stuck = card_at(s7, 1, 2, 1, 1)
box(s7, 0.2, 2.2, 2.6, 0.4, "칸보다 훨씬 긴 글이 칸을 넘어갑니다 정말로요", 12)
nb = card_at(s7, 2.1, 2, 2, 1, "FFFFFF")
l0 = stuck.left, stuck.width
flatfx.wrap_cards(prs2)
check((stuck.left, stuck.width) == l0, "⑦ 넓히면 옆 칸과 부딪히는 칸은 그대로")

# ⑧ 글에 붙은 알약 — 490aac 6쪽 ⑥행 재현
s8 = prs2.slides.add_slide(prs2.slide_layouts[6])
cell = box(s8, 0.3, 4.1, 2.7, 0.8, "복잡한 접근 절차", 10, fill="ECF4FE")
cell._element.find(f"{flatfx.P}txBody/{flatfx.A}bodyPr").set("anchor", "ctr")
pill = box(s8, 0.5, 4.5, 2.3, 0.22, "특성마다 문제를 먼저 짚고 약속", 7, fill="FFFFFF")
i0 = flatfx._ink(cell)
check(i0[3] + 0.04 > pill.top / IN, f"⑧ 음성 입력: 글 아래 끝 {i0[3]:.2f}in 이 알약 위 {pill.top / IN:.2f}in 에 닿음")
num_t = box(s8, 5, 2, 2, 0.3, "번호 달린 글", 10)
oval = s8.shapes.add_shape(MSO_SHAPE.OVAL, Inches(4.95), Inches(2.0), Inches(0.25), Inches(0.25))
oval.fill.solid()
oval.fill.fore_color.rgb = RGBColor.from_string("0A3A9E")
oval.text_frame.text = "1"
n0 = flatfx._ink(num_t)
r = flatfx.clear_pills(prs2)
i1 = flatfx._ink(cell)
check(len(r) == 1 and i1[3] + 0.02 <= pill.top / IN, f"⑧ 글이 알약 위로({i1[3]:.2f}in, 알약 {pill.top / IN:.2f}in)")
check(flatfx._ink(num_t) == n0, "⑧ 번호 동그라미가 붙은 글은 그대로")
check(flatfx.clear_pills(prs2) == [], "⑧ 두 번 돌려도 그대로")

# ⑨ 글을 뚫은 구분선 — 77850f 4쪽 재현. 칸 아래로 지나는 흐름 선(69fd 7쪽)은 그대로
s9 = prs2.slides.add_slide(prs2.slide_layouts[6])
flow = s9.shapes.add_connector(1, Inches(4.0), Inches(3.0), Inches(4.0), Inches(4.2))
box(s9, 3.2, 3.5, 1.6, 0.3, "허브 글입니다", 10)
box(s9, 7.56, 4.38, 1.28, 0.22, "국가인증상표", 8)
lbl = box(s9, 8.91, 4.38, 1.28, 0.22, "수출액 대비 비중", 8)
cut = s9.shapes.add_connector(1, Inches(9.19), Inches(3.99), Inches(9.19), Inches(4.63))
f0 = flow.left
il = flatfx._ink(lbl)
check(il[0] < 9.19 < il[2], "⑨ 음성 입력: 선이 글을 뚫음")
r = flatfx.move_dividers(prs2)
check(len(r) == 1 and cut.left / IN < il[0], f"⑨ 구분선이 두 글 사이로({cut.left / IN:.2f}in)")
check(flow.left == f0, "⑨ 글 아래로 지나는 선은 그대로")

# ── 2026-11-01 전체 검수 ──
def deck3():
    p = Presentation()
    p.slide_width, p.slide_height = Inches(10.83), Inches(7.5)
    return p, p.slides.add_slide(p.slide_layouts[6])


# ⑩ 글 위쪽에 걸린 머리 라벨은 글 아래로 내리지 않는다(R164, 재현 1.00→1.27in)
p3, s3 = deck3()
body3 = box(s3, 1, 1, 4, 2, "윗줄 글입니다", 12)
head3 = box(s3, 1, 1, 3, 0.3, "머리 라벨", 9, fill="204090")
t0 = head3.top
check(flatfx._meets(flatfx._ink(body3), flatfx._box(head3)), "⑩ 음성 입력: 라벨이 글에 걸림")
check(flatfx.clear_pills(p3) == [] and head3.top == t0, f"⑩ 위쪽 라벨은 그대로({head3.top / IN:.2f}in)")

# ⑪ 알약을 내린 자리에 그림·칸이 있으면 그대로 둔다. 없으면 내린다(음성 대조)
def pill_case(extra):
    p, s = deck3()
    a = box(s, 1, 1.0, 4, 0.5, "글입니다", 12)
    a._element.find(f"{flatfx.P}txBody/{flatfx.A}bodyPr").set("anchor", "t")
    pill = box(s, 1, 1.2, 3, 0.25, "알약", 9, fill="204090")
    if extra:
        extra(s)
    t = pill.top
    return flatfx.clear_pills(p), pill.top != t


pic_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_pill_block.png")
from PIL import Image as _Im
_Im.new("RGB", (8, 8), (9, 9, 9)).save(pic_path)
try:
    r_free = pill_case(None)
    r_pic = pill_case(lambda s: s.shapes.add_picture(pic_path, Inches(1), Inches(1.4), Inches(3), Inches(1)))
    r_card = pill_case(lambda s: box(s, 1, 1.25, 3, 1, "다른 칸의 글", 9, fill="FFEEDD"))
finally:
    os.remove(pic_path)
check(r_free[1] and len(r_free[0]) == 1, "⑪ 음성 대조 — 걸릴 것 없으면 알약을 글 아래로")
check(not r_pic[1], "⑪ 내린 자리에 그림이 있으면 그대로")
check(not r_card[1], "⑪ 내린 자리에 칸이 있으면 그대로")

# ⑫ 알약 풀기가 자동 축소(fontScale)를 지우지 않는다(R168). 축소 없는 맞춤은 지운다(음성 대조)
def fit_case(attrs):
    p, s = deck3()
    a = box(s, 1, 1.0, 4, 1.6, "글입니다", 12)
    a._element.find(f"{flatfx.P}txBody/{flatfx.A}bodyPr").set("anchor", "b")
    bp = a._element.find(f"{flatfx.P}txBody/{flatfx.A}bodyPr")
    for x in list(bp):
        bp.remove(x)
    af = bp.makeelement(f"{flatfx.A}normAutofit", attrs)
    bp.append(af)
    box(s, 1, 2.4, 3, 0.3, "알약", 9, fill="204090")
    return flatfx.clear_pills(p), bp.find(f"{flatfx.A}normAutofit") is not None


r_scale = fit_case({"fontScale": "70000"})
r_plain = fit_case({})
check(len(r_scale[0]) == 1 and r_scale[1], "⑫ fontScale 있는 자동 맞춤은 남긴다")
check(len(r_plain[0]) == 1 and not r_plain[1], "⑫ 음성 대조 — 줄이지 않은 맞춤은 지운다")

# ⑬ 돌린 글·세로 글은 가로 상자로 재지 않는다(R168). a:fld 줄은 예외 없이
p3, s3 = deck3()
rt = box(s3, 2, 3, 3, 0.4, "회전한 축 이름입니다", 12)
check(flatfx._ink(rt) is not None, "⑬ 음성 대조 — 돌리기 전엔 잰다")
rt.rotation = 270
check(flatfx._ink(rt) is None, "⑬ 돌린 글은 재지 않는다")
vt = box(s3, 5, 3, 0.4, 3, "세로로 쓴 글", 12)
vt._element.find(f"{flatfx.P}txBody/{flatfx.A}bodyPr").set("vert", "eaVert")
check(flatfx._ink(vt) is None, "⑬ 세로 글은 재지 않는다")
fb = box(s3, 1, 1, 3, 0.4, "쪽 ", 12)
pp = fb._element.find(f"{flatfx.P}txBody/{flatfx.A}p")
fld = pp.makeelement(f"{flatfx.A}fld", {"id": "{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}", "type": "slidenum"})
fld.append(fld.makeelement(f"{flatfx.A}t", {}))
fld[0].text = "7"
pp.append(fld)
check(flatfx._ink(fb) is not None, "⑬ a:fld 가 있어도 글 자리를 잰다")

# ⑭ 도형 하나의 예외로 마감 전체가 빠지지 않는다 — 문제 도형만 건너뛰고, 건너뛴 단계는 WARN 줄로(R164)
import tempfile
def bad_deck(path):
    p, s = deck3()
    r = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(1), Inches(1), Inches(2), Inches(1))
    pr = r._element.find(f"{flatfx.P}spPr")
    pr.remove(pr.find(f"{flatfx.A}prstGeom"))   # 기하 없는 도형 — shape_type 이 NotImplementedError
    card = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(5), Inches(1), Inches(1), Inches(1))
    card.fill.solid()
    card.fill.fore_color.rgb = RGBColor.from_string("F3F8FE")
    box(s, 4.5, 1.2, 3, 0.4, "칸을 넘는 글 아주 길게 씁니다 길게 길게", 12)
    p.save(path)


TD3 = tempfile.mkdtemp(prefix="fx-")
bad = os.path.join(TD3, "bad.pptx")
bad_deck(bad)
p_bad = Presentation(bad)
try:
    p_bad.slides[0].shapes[0].shape_type
    check(False, "⑭ 음성 입력: 이 도형은 shape_type 에서 예외가 나야 한다")
except NotImplementedError:
    check(True, "⑭ 음성 입력: 이 도형은 shape_type 에서 예외")
lines = []
flatfx.run(bad, log=lines.append)
check(len(Presentation(bad).slides) == 1, "⑭ 저장된 장표를 다시 읽을 수 있다")
check(not any(ln.startswith("WARN: ") for ln in lines), "⑭ 문제 도형은 건너뛰고 단계는 성공: " + " / ".join(ln[:60] for ln in lines if ln.startswith("WARN")))
check(any("좁은 칸 넓힘 1곳" in ln for ln in lines), "⑭ 같은 쪽의 다른 칸은 그대로 고친다: " + (lines[-1][-60:] if lines else ""))

# ⑮ 레이아웃에 짝이 없는 자리표시자(좌표 None) — 결론 띠·바닥 채우기가 죽지 않는다
p3 = Presentation()
p3.slide_width, p3.slide_height = Inches(10.83), Inches(7.5)
s5 = p3.slides.add_slide(p3.slide_layouts[1])
ph = s5.placeholders[1]
ph.text = "결론 글"
ph._element.nvSpPr.nvPr.find(f"{flatfx.P}ph").set("idx", "99")
nones =[sh for sh in s5.shapes if sh.width is None]
check(len(nones) == 1, "⑮ 음성 입력: 좌표 None 도형이 있다")
check(flatfx.unify_bands(p3) == 0 and flatfx.fill_height(p3) == 0, "⑮ 예외 없음")

# ⑯ 한 단계가 터져도 나머지 단계와 저장은 그대로 — WARN 줄로 알린다(run 의 단계 보호)
good = os.path.join(TD3, "good.pptx")
p3, s3 = deck3()
box(s3, 1, 1, 3, 0.4, "글입니다", 12)
p3.save(good)
_orig = flatfx.fix_tables
def boom(prs):
    raise ValueError("터짐")
flatfx.fix_tables = boom
lines = []
flatfx.run(good, log=lines.append)
flatfx.fix_tables = _orig
warns = [ln for ln in lines if ln.startswith("WARN: ")]
check(len(warns) == 1 and "표 칸 정리" in warns[0] and "터짐" in warns[0], "⑯ 터진 단계가 WARN 줄로: " + str(warns))
check(any("좁은 칸 넓힘" in ln for ln in lines) and Presentation(good) is not None, "⑯ 뒤 단계·저장은 그대로")
lines = []
flatfx.run(good, log=lines.append)
check(not [ln for ln in lines if ln.startswith("WARN: ")], "⑯ 음성 대조 — 정상이면 WARN 없음")
print(f"\n실패 {len(FAILS)}건" if FAILS else "\n전부 통과")
sys.exit(1 if FAILS else 0)

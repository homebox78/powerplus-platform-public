# -*- coding: utf-8 -*-
"""초안 다듬기 마감(polish_fix, R130) 시험 — 일부러 틀린 '다듬은 결과'를 만들어 고쳐지는지 본다.
  ① 그림 원본대로 — 원본 그림을 다른 그림으로 바꾸고 새 그림·받침 동그라미를 더한 결과 → 원본 그림만 남는다
  ② 쉼표 목록 — 항목 안 띄어쓰기가 줄 안 바뀜 공백으로(글자는 그대로)
  ③ 카드 안 글 — 카드(104pt) 테두리에 붙은 글 → 1pt 씩 줄어 좌우 여백 6% 확보
  ④ 아이콘·글 — 다듬으며 새로 생긴 겹침만 푼다(원본에서도 겹친 글은 그대로)
  ⑤ 일러스트·글 — 인물 그림 위쪽에 걸친 글을 위로
  ⑥ 도넛 라벨 — 고리보다 넓은 라벨 글을 줄인다
  ⑦ a시월구일 5% 작게(polish_prep.plan_run)
  음성 대조: 고치기 전 결과가 각 검사에 걸리는지 먼저 본다.
  python -X utf8 engine/tests/test_polish_fix.py"""
import io, os, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from PIL import Image, ImageDraw  # noqa: E402
from pptx import Presentation  # noqa: E402
from pptx.util import Inches, Pt  # noqa: E402
from pptx.dml.color import RGBColor  # noqa: E402
from pptx.chart.data import CategoryChartData  # noqa: E402
from pptx.enum.chart import XL_CHART_TYPE  # noqa: E402
import polish_fix as F  # noqa: E402

FAILS = []
TMP = tempfile.mkdtemp(prefix="pfix-")
A = F.A


def check(ok, msg):
    print(("통과 " if ok else "실패 ") + msg)
    if not ok:
        FAILS.append(msg)


def png(color, size=(200, 200), person=False):
    im = Image.new("RGBA", size, (255, 255, 255, 0))
    d = ImageDraw.Draw(im)
    if person:   # 머리·몸 — 빈 곳이 섞인 일러스트
        d.ellipse((70, 10, 130, 70), fill=color + (255,))
        d.rectangle((50, 80, 150, 200), fill=color + (255,))
    else:
        d.rectangle((0, 0, size[0], size[1]), fill=color + (255,))
    b = io.BytesIO()
    im.save(b, "PNG")
    b.seek(0)
    return b


def text(s, x, y, w, h, t, pt=10, face="a시월구일2"):
    tb = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tb.text_frame.word_wrap = True
    r = tb.text_frame.paragraphs[0].add_run()
    r.text, r.font.size, r.font.name = t, Pt(pt), face
    r._r.get_or_add_rPr().append(r._r.get_or_add_rPr().makeelement(A + "ea", {"typeface": face}))
    return tb


def deck(result):
    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(10.83), Inches(7.5)
    s = prs.slides.add_slide(prs.slide_layouts[6])
    # ① 그림 — 원본은 파랑 그림, 결과는 빨강으로 바뀜 + 새 초록 그림 + 그 밑 흰 동그라미
    s.shapes.add_picture(png((40, 80, 200) if not result else (220, 40, 40)), Inches(0.3), Inches(0.3), Inches(1), Inches(1)).name = "그림 1"
    if result:
        c = s.shapes.add_shape(9, Inches(2.9), Inches(0.25), Inches(0.6), Inches(0.6))
        c.name = "pp_circle"
        s.shapes.add_picture(png((40, 200, 80)), Inches(3.0), Inches(0.35), Inches(0.4), Inches(0.4)).name = "pp_set_icon"
    # ② 쉼표 목록
    text(s, 4, 0.3, 3, 0.6, "성명, 주민번호, 주소, 전입일, 세대주여부, 세대원 사항, …")
    # ③ 카드 104pt + 글(결과에서 글이 커져 테두리에 붙음)
    card = s.shapes.add_shape(1, Inches(0.3), Inches(2), Pt(104), Inches(0.6))
    card.fill.background()
    card.line.color.rgb = RGBColor(0xC0, 0xC8, 0xD8)
    text(s, 0.3 + 1 / 72, 2.1, 102 / 72, 0.4, "국가유공자(유족)확인서", 10 if result else 8)
    # ④ 전구 아이콘 — 결과에서 글이 커져(왼쪽으로 넓어져) 아이콘을 덮음 / 원본에서도 겹친 'QR' 라벨
    s.shapes.add_picture(png((250, 200, 40), (40, 40)), Inches(3.0), Inches(2.05), Inches(0.25), Inches(0.25)).name = "전구"
    tb = text(s, 3.0 if result else 3.3, 2.0, 3.2, 0.35, "전자정부법 제43조의2 정보주체 본인", 10)
    tb.text_frame._txBody.bodyPr.set("lIns", "0")
    s.shapes.add_picture(png((0, 0, 0), (40, 40)), Inches(7.0), Inches(2.05), Inches(0.3), Inches(0.3)).name = "QR"
    q = text(s, 7.0, 2.0, 1.2, 0.35, "이용처QR", 10)
    q.text_frame._txBody.bodyPr.set("lIns", "0")
    # ⑤ 인물 일러스트 + 위쪽에 걸친 글(그림보다 뒤에 그려짐)
    s.shapes.add_picture(png((60, 90, 200), person=True), Inches(5.0), Inches(4.0), Inches(1.4), Inches(1.4)).name = "인물"
    text(s, 5.2, 3.9, 1.0, 0.4, "정보주체", 12)
    # ⑥ 도넛
    cd = CategoryChartData()
    cd.categories = ["[자체 PDS] 21기관", "[임대 PDS] 150기관"]
    cd.add_series("s", (21, 150))
    ch = s.shapes.add_chart(XL_CHART_TYPE.DOUGHNUT, Inches(8), Inches(4), Inches(2.3), Inches(2.3), cd).chart
    ch.plots[0].has_data_labels = True
    ch.plots[0].data_labels.font.size = Pt(11)
    ch.plots[0].data_labels.show_category_name = True
    # ⑧ 아이콘 목록 — 체크 동그라미 + 짧은 글, 결과는 글이 가운데 정렬·간격 제각각
    for k, (lab, dx) in enumerate((("사 업 명", 0.30), ("사업기간", 0.02), ("사업금액", 0.15))):
        o_ = s.shapes.add_shape(9, Inches(0.4), Inches(6.0 + k * 0.42), Inches(0.22), Inches(0.22))
        o_.name = f"체크 {k}"
        lt = text(s, 0.62 + (dx if result else 0.05), 5.95 + k * 0.42, 1.1, 0.32, lab, 12)
        lt.text_frame._txBody.bodyPr.set("anchor", "ctr")
        lt.text_frame.paragraphs[0]._p.get_or_add_pPr().set("algn", "ctr" if result else "l")
    # ⑨ 쪽 밖으로 넓어진 키메시지 상자 · 상속 크기(lstStyle 20pt)를 2pt 로 읽어 줄인 런
    km = text(s, 2.2, 1.0, 6.4 if not result else 14.3, 0.7, "API 및 포털 서비스를 제공하여", 24)
    t2 = s.shapes.add_textbox(Inches(2.7), Inches(1.8), Inches(5.3), Inches(0.6))
    r2 = t2.text_frame.paragraphs[0].add_run()
    r2.text = "본인정보 누적 제공건수"
    if result:
        r2.font.size = Pt(2)
    else:
        lst = t2.text_frame._txBody.find(A + "lstStyle")
        lv = lst.makeelement(A + "lvl1pPr", {})
        lv.append(lv.makeelement(A + "defRPr", {"sz": "2000"}))
        lst.append(lv)
        end = t2.text_frame.paragraphs[0]._p.makeelement(A + "endParaRPr", {"sz": "200"})
        t2.text_frame.paragraphs[0]._p.append(end)
    p = os.path.join(TMP, "result.pptx" if result else "orig.pptx")
    prs.save(p)
    return p


orig, res = deck(False), deck(True)
out = os.path.join(TMP, "fixed.pptx")
logs = []
F.run(orig, res, out, log=logs.append)


def pics(p):
    return {sh.name for sh in Presentation(p).slides[0].shapes if sh.shape_type == 13}


def names(p):
    return {sh.name for sh in Presentation(p).slides[0].shapes}


def blue(p):
    s = Presentation(p).slides[0]
    sh = next(x for x in s.shapes if x.shape_type == 13 and x.left < Inches(0.5))
    return Image.open(io.BytesIO(sh.image.blob)).convert("RGB").getpixel((100, 100))


check(blue(res)[0] > 200 and "pp_set_icon" in pics(res), "음성 대조: 결과는 원본 그림이 바뀌고 새 그림이 들어가 있다")
check(blue(out)[2] > 150 and blue(out)[0] < 100, f"① 바뀐 그림 → 원본 그림 되살림 {blue(out)}")
check("pp_set_icon" not in pics(out) and "pp_circle" not in names(out), "① 새 그림과 그 밑 흰 동그라미를 뺌")

s = Presentation(out).slides[0]
lst = next(x for x in s.shapes if x.has_text_frame and "세대원" in x.text_frame.text).text_frame.text
check("세대원 사항" in lst and lst.replace(" ", " ") == "성명, 주민번호, 주소, 전입일, 세대주여부, 세대원 사항, …", "② 쉼표 목록 항목 안 공백만 줄 안 바뀜으로(글자 그대로)")

sz = lambda p, k: next(x for x in Presentation(p).slides[0].shapes if x.has_text_frame and k in x.text_frame.text).text_frame.paragraphs[0].runs[0].font.size.pt
check(sz(res, "국가유공자") == 10, "음성 대조: 결과 카드 글 10pt(테두리에 붙음)")
check(sz(out, "국가유공자") < 10, f"③ 카드 글 1pt 씩 줄임 → {sz(out, '국가유공자')}pt")

lins = lambda p, k: int(next(x for x in Presentation(p).slides[0].shapes if x.has_text_frame and k in x.text_frame.text).text_frame._txBody.bodyPr.get("lIns") or 91440)
check(lins(out, "전자정부법") > lins(res, "전자정부법"), "④ 새로 생긴 전구·글 겹침 — 글 시작을 아이콘 뒤로")
check(lins(out, "이용처QR") == lins(res, "이용처QR"), "④ 원본에서도 겹친 'QR' 라벨은 그대로")

top = lambda p: next(x for x in Presentation(p).slides[0].shapes if x.has_text_frame and x.text_frame.text == "정보주체").top
check(top(out) < top(res), f"⑤ 인물 그림 위쪽에 걸친 글을 위로 {(top(res) - top(out)) / 12700:.1f}pt")

dl = lambda p: next(x for x in Presentation(p).slides[0].shapes if x.has_chart).chart.plots[0].data_labels.font.size.pt
check(dl(out) < dl(res), f"⑥ 도넛 라벨 {dl(res)} → {dl(out)}pt")

import vcenter as V  # noqa: E402
import textlines as T  # noqa: E402


def starts(p_):
    sl = Presentation(p_).slides[0]
    return [round(F._extent(b)[0], 1) for b in T.boxes(sl) if b.text().strip() in ("사 업 명", "사업기간", "사업금액")]


check(len(set(starts(res))) > 1, f"음성 대조: 결과 아이콘 목록 글 시작이 제각각 {starts(res)}")
st_ = starts(out)
check(len(st_) == 3 and max(st_) - min(st_) < 0.6, f"⑧ 아이콘 목록 글 시작 한 선 {st_}")
ic_r = max(x.Left + x.Width for x in V.flat(Presentation(out).slides[0].shapes._spTree) if x.Name.startswith("체크"))
check(st_ and abs(min(st_) - ic_r - 6) < 1.0, f"⑧ 아이콘 끝과 글 간격 6pt ({min(st_) - ic_r:.1f})")

kmw = lambda p_: next(x for x in Presentation(p_).slides[0].shapes if x.has_text_frame and x.text_frame.text.startswith("API 및")).width / 914400
check(kmw(res) > 10.83 - 2.2, f"음성 대조: 결과 키메시지 상자가 쪽 밖으로({kmw(res):.1f}in)")
check(abs(kmw(out) - 6.4) < 0.01, f"⑨ 쪽 밖 키메시지 상자 → 원본 폭 {kmw(out):.2f}in")
check(sz(out, "본인정보 누적") == 20, f"⑨ 2pt 로 줄었던 글 → 원본 상속 크기 {sz(out, '본인정보 누적')}pt")
import polish_prep as PP  # noqa: E402
_d = PP.Deck(Presentation(orig))
_pt = [x[4] for x in PP.runs_of(_d, Presentation(orig).slides[0]) if (x[1].findtext(A + "t") or "") == "본인정보 누적 제공건수"]
check(_pt == [20.0], f"⑨ 상속 크기는 상자 서식(20pt) — 문단 끝 표시(2pt)가 아님 {_pt}")
f_, sc = PP.plan_run("Pretendard", 12.0, False)
check(not f_.startswith("a시월구일") or sc <= 1.2 * PP.SIWOL_K + 1e-6, f"⑦ a시월구일 크기 배수에 0.95 반영({f_} ×{sc:.3f})")
check(PP.SIWOL_K == 0.95, "⑦ SIWOL_K = 0.95")

print("\n".join("  " + x for x in logs[-3:]))
print(f"\n실패 {len(FAILS)}건" if FAILS else "\n전부 통과")
sys.exit(1 if FAILS else 0)

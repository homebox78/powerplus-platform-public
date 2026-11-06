# -*- coding: utf-8 -*-
"""카드 바탕색·그림자 시험 — 시안과 다르게 카드가 회청색이 되고 그림자가 생기던 것(2026-10-28 팀장 지적).
  실측(6개 장표): 카드 바탕이 테두리색(#C9D6EA·#D6E2F3·#C2DAF5·#DCE6F5·#D6E2F5·#C9DAF5)으로 칠해짐 — 시안은 #F4F8FF 안팎의 거의 흰색.
  원인 ① finalize '파랑 4단계'가 밝기 0.85 이상 파랑을 덱에서 가장 많이 쓴 값(=카드마다 쓰는 테두리색) 하나로 모았다.
       ② python-pptx 기본 도형의 effectRef(테마 그림자) — 빈 effectLst 를 LibreOffice 가 무시한다. 연결선은 빈 effectLst 도 없다.
  ① 거의 흰 카드 바탕이 테두리색으로 바뀌지 않는다
  ② 테마 효과 스타일에 그림자가 없고, 장의 effectRef 가 모두 idx 0 이다(연결선 포함)
  ③ 시안에서 흰 카드인데 장표에서 회청색으로 칠한 카드 → 시안 색(흰색)으로 되돌린다
  ④ 단계 진행(밝은→진한) 쉐브론의 서로 다른 파랑이 하나로 뭉개지지 않는다
  ⑤ 대조군 — 시안과 같은 색 카드·진한 결론 띠는 그대로, 시안에 없는 진한 직접 그림자는 지우고 연한 그림자는 둔다

  python -X utf8 engine/tests/test_card_fx.py           (전부 통과면 0)
  PD_ENGINE_DIR=<고치기 전 engine 사본> python …        음성 대조 — 고치기 전 코드는 ①②③④ 가 실패해야 한다
가짜 시안 그림 + 가짜 장표로 finalize.py 를 실제로 돌린다. AI·서버·PowerPoint 없음."""
import glob, os, shutil, subprocess, sys, tempfile, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.abspath(os.environ.get("PD_ENGINE_DIR") or os.path.dirname(HERE))
TMP = tempfile.mkdtemp(prefix="cardfx-")
ENG = os.path.join(TMP, "engine")
os.makedirs(ENG)
for pat in ("*.py", "*.json"):
    for f in glob.glob(os.path.join(SRC, pat)):
        shutil.copy2(f, ENG)
for d in ("templates", "fonts"):
    if os.path.isdir(os.path.join(SRC, d)):
        shutil.copytree(os.path.join(SRC, d), os.path.join(ENG, d))
    elif os.path.isdir(os.path.join(os.path.dirname(HERE), d)):
        shutil.copytree(os.path.join(os.path.dirname(HERE), d), os.path.join(ENG, d))

from lxml import etree  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402
from pptx import Presentation  # noqa: E402
from pptx.dml.color import RGBColor  # noqa: E402
from pptx.enum.shapes import MSO_CONNECTOR, MSO_SHAPE  # noqa: E402
from pptx.util import Inches, Pt  # noqa: E402

A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
P = "{http://schemas.openxmlformats.org/presentationml/2006/main}"
FAILS = []
BORDER, TINT, WHITE, NAVY = "C9D6EA", "F4F8FF", "FFFFFF", "1E3A8A"
CHEV = ("93B4E8", "6C9AE0")   # 같은 '중간' 단계(밝기 0.55~0.85)의 서로 다른 두 파랑 — 시안의 밝은→진한 단계


def check(ok, msg):
    print(("통과 " if ok else "실패 ") + msg)
    if not ok:
        FAILS.append(msg)


def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


# ── 가짜 시안: 본문만(sNN_body.png, 1600×903 — 실제 시안 본문 비율 1.77). 장표 본문(10.83×6.35in, 1.705)과 비율이 다르다
W, H = 1600, 903
MOCK = os.path.join(TMP, "_mockup")
os.makedirs(MOCK)


def px(x_in, y_in):   # 장표 인치 → 시안 본문 픽셀(가로·세로 따로 늘린 대응 — 에이전트 지시문 §본문 자리)
    return x_in / 10.83 * W, (y_in - 0.70) / 6.35 * H


def rect(d, x, y, w, h, fill, line=None):
    (x0, y0), (x1, y1) = px(x, y), px(x + w, y + h)
    d.rounded_rectangle((x0, y0, x1, y1), radius=18, fill=rgb(fill), outline=rgb(line) if line else None, width=2)


CARDS = [  # (이름, x, y, w, h, 시안 바탕, 장표에 넣는 바탕)
    ("card_a", 0.30, 1.65, 3.2, 2.0, TINT, TINT),     # ① 시안·장표 모두 거의 흰 하늘색
    ("card_b", 3.70, 1.65, 3.2, 2.0, TINT, TINT),
    ("card_c", 7.10, 1.65, 3.4, 2.0, TINT, TINT),
    ("card_white", 0.30, 3.90, 4.8, 1.6, WHITE, BORDER),   # ③ 시안은 흰 카드인데 장표는 회청색(사고 그대로)
    ("card_sky", 5.40, 3.90, 5.1, 1.6, "DCE8FC", "DCE8FC"),  # ⑤ 시안과 같은 옅은 하늘 — 그대로
]
im = Image.new("RGB", (W, H), (255, 255, 255))
d = ImageDraw.Draw(im)
for _, x, y, w, h, mock, _ in CARDS:
    rect(d, x, y, w, h, mock, BORDER)
    tx, ty = px(x + 0.3, y + 0.3)
    d.rectangle((tx, ty, tx + 120, ty + 14), fill=(31, 41, 55))   # 카드 안 글(진한 픽셀) — 바탕 재기에 섞여도 견뎌야 한다
rect(d, 0.30, 5.75, 3.0, 0.5, CHEV[0])
rect(d, 3.40, 5.75, 3.0, 0.5, CHEV[1])
rect(d, 0.30, 6.40, 10.2, 0.5, NAVY)
im.save(os.path.join(MOCK, "s01_body.png"))

# ── 가짜 장표: python-pptx 기본 도형(테마 그림자 effectRef idx=2)에 shadow.inherit=False(빈 effectLst) — 에이전트가 하던 그대로
prs = Presentation()
prs.slide_width, prs.slide_height = Inches(10.83), Inches(7.5)
s = prs.slides.add_slide(prs.slide_layouts[6])
kt = s.shapes.add_textbox(Inches(0.2), Inches(1.03), Inches(10.43), Inches(0.45))
kt.name = "keymsg"
kt.text_frame.text = "카드 바탕색과 그림자를 시안대로 옮깁니다"


def shape(kind, name, x, y, w, h, fill, line=None):
    sp = s.shapes.add_shape(kind, Inches(x), Inches(y), Inches(w), Inches(h))
    sp.name = name
    sp.fill.solid()
    sp.fill.fore_color.rgb = RGBColor.from_string(fill)
    if line:
        sp.line.color.rgb = RGBColor.from_string(line)
        sp.line.width = Pt(0.75)
    else:
        sp.line.fill.background()
    sp.shadow.inherit = False
    return sp


for nm, x, y, w, h, _, fill in CARDS:
    c = shape(MSO_SHAPE.ROUNDED_RECTANGLE, nm, x, y, w, h, fill, BORDER)
    c.text_frame.text = "카드 제목"
for i in range(6):   # 테두리색이 덱에서 가장 많이 쓰이게(실제 장표처럼 구분선·작은 칸 테두리)
    shape(MSO_SHAPE.RECTANGLE, f"rule_{i}", 0.5 + i * 1.5, 3.75, 1.2, 0.02, BORDER)
shape(MSO_SHAPE.CHEVRON, "chev_1", 0.30, 5.75, 3.0, 0.5, CHEV[0])
shape(MSO_SHAPE.CHEVRON, "chev_2", 3.40, 5.75, 3.0, 0.5, CHEV[1])
band = shape(MSO_SHAPE.ROUNDED_RECTANGLE, "band", 0.30, 6.40, 10.2, 0.5, NAVY)
band.text_frame.text = "결론 띠"
cx = s.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(6.6), Inches(6.0), Inches(10.4), Inches(6.0))
cx.name = "conn"   # 연결선 — effectRef idx=1, 빈 effectLst 도 없다(PowerPoint 에서도 그림자)


def direct_shadow(sp, alpha):
    spPr = sp._element.spPr
    eff = spPr.find(A + "effectLst")
    sh = etree.SubElement(eff, A + "outerShdw", blurRad="76200", dist="25400", dir="5400000", rotWithShape="0")
    c = etree.SubElement(sh, A + "srgbClr", val="000000")
    etree.SubElement(c, A + "alpha", val=str(alpha))


direct_shadow(next(x for x in s.shapes if x.name == "chev_1"), 40000)   # chev_1 — 진한 직접 그림자(시안에 없음) → 지운다
direct_shadow(band, 8000)    # band — 연한 그림자(타입 규격 rgba 0.06~0.08) → 둔다

# ⑥ 표 — 제작 에이전트 표 코드처럼 tcPr 에 채움을 먼저, 테두리를 뒤에 + Table Grid 스타일(PowerPoint 가 테두리를 버리고 검은 격자)
tbl = s.shapes.add_table(2, 2, Inches(6.6), Inches(4.0), Inches(3.8), Inches(0.8)).table
tbl._tbl.tblPr.find(A + "tableStyleId").text = "{5940675A-B579-460E-94D1-54222C63F5DA}"
for row in tbl.rows:
    for cell in row.cells:
        tcPr = cell._tc.get_or_add_tcPr()
        f = etree.SubElement(tcPr, A + "solidFill")
        etree.SubElement(f, A + "srgbClr", val=WHITE)
        for side in ("lnL", "lnR", "lnT", "lnB"):
            ln = etree.SubElement(tcPr, A + side, w="6350")
            lf = etree.SubElement(ln, A + "solidFill")
            etree.SubElement(lf, A + "srgbClr", val=BORDER)
# ⑦ 기획 메모 줄 — 다른 글과 같이 있으면 지우고, 도형 전체가 메모면 둔다(알리기만)
memo_box = s.shapes.add_textbox(Inches(0.3), Inches(0.75), Inches(4.0), Inches(0.5))
memo_box.name = "memo_mixed"
memo_box.text_frame.text = "현행 앱 이용 규모"
memo_box.text_frame.add_paragraph().text = "※ 보강 필요: 현행 앱 이용 규모 수치"
memo_only = s.shapes.add_textbox(Inches(4.5), Inches(0.75), Inches(4.0), Inches(0.5))
memo_only.name = "memo_only"
memo_only.text_frame.text = "※ 확인 필요: 연계 기관 수"
DECK = os.path.join(TMP, "deck.pptx")
prs.save(DECK)

# ── 마무리(finalize.py) 실제 실행
fonts = os.path.join(TMP, "_fonts")
os.makedirs(fonts)
r = subprocess.run([sys.executable, "-X", "utf8", os.path.join(ENG, "finalize.py"), DECK, fonts, "--accent", "#1866DA", "--mockup", MOCK],
                   capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=600, cwd=ENG)
check(r.returncode == 0, "finalize.py 가 끝까지 돈다" + ("" if r.returncode == 0 else " — " + (r.stderr or "")[-300:]))
if r.returncode != 0:
    print("\n실패 " + str(len(FAILS)) + "건")
    sys.exit(1)

out = Presentation(DECK)
sl = out.slides[0]
by = {sh.name: sh for sh in sl.shapes}


def fill_of(nm):
    c = by[nm]._element.spPr.find(f"{A}solidFill/{A}srgbClr")
    return (c.get("val") or "").upper() if c is not None else None


# ① 거의 흰 카드 바탕이 테두리색으로 바뀌지 않는다
for nm in ("card_a", "card_b", "card_c"):
    check(fill_of(nm) not in (BORDER,) and min(rgb(fill_of(nm))) >= 0xEE, f"① {nm} 바탕이 거의 흰색 그대로 (#{fill_of(nm)}, 테두리 #{BORDER} 아님)")

# ② 테마 그림자 — 테마 효과 스타일에 그림자 없음 + 장의 effectRef 모두 idx 0
z = zipfile.ZipFile(DECK)
themes = [n for n in z.namelist() if n.startswith("ppt/theme/theme")]
nshadow = sum(z.read(n).decode("utf-8").split("<a:effectStyleLst>")[-1].split("</a:effectStyleLst>")[0].count("outerShdw") for n in themes)
check(bool(themes) and nshadow == 0, f"② 테마 효과 스타일에 그림자 없음 (그림자 {nshadow}개)")
refs = [(el.getparent().getparent().find(f".//{P}cNvPr").get("name"), el.get("idx")) for el in sl._element.iter(A + "effectRef")]
bad = [nm for nm, idx in refs if idx != "0"]
check(bool(refs) and not bad, f"② 장의 effectRef 가 모두 idx 0 (테마 그림자 물려받는 도형 {len(bad)}개: {', '.join(bad[:5])})")
check("conn" not in bad, "② 연결선도 테마 그림자를 물려받지 않는다")

# ③ 시안은 흰 카드 — 장표의 회청색을 시안 색으로
check(fill_of("card_white") == WHITE, f"③ 시안이 흰 카드인 자리의 회청색 바탕을 흰색으로 (#{fill_of('card_white')})")

# ④ 단계 진행 쉐브론 — 서로 다른 두 파랑이 하나로 뭉개지지 않는다
c1, c2 = fill_of("chev_1"), fill_of("chev_2")
check(c1 != c2, f"④ 밝은→진한 쉐브론 두 색이 따로 남는다 (#{c1} · #{c2})")

# ⑤ 대조군
check(fill_of("card_sky") == "DCE8FC", f"⑤ 시안과 같은 옅은 하늘 카드는 그대로 (#{fill_of('card_sky')})")
check(fill_of("band") == NAVY, f"⑤ 진한 결론 띠는 그대로 (#{fill_of('band')})")
ln = by["card_white"]._element.spPr.find(f"{A}ln/{A}solidFill/{A}srgbClr")
check(ln is not None and ln.get("val").upper() == BORDER, "⑤ 카드 테두리색은 그대로")
heavy = [e for e in by["chev_1"]._element.iter(A + "outerShdw")]
soft = [e for e in by["band"]._element.iter(A + "outerShdw")]
check(not heavy, "⑤ 진한 직접 그림자(불투명도 40%)는 지운다")
check(len(soft) == 1, "⑤ 연한 직접 그림자(불투명도 8%)는 둔다")

ORDER = ["lnL", "lnR", "lnT", "lnB", "lnTlToBr", "lnBlToTr", "cell3D", "noFill", "solidFill", "gradFill", "blipFill", "pattFill", "grpFill", "headers", "extLst"]
bad_tc = 0
for tc in sl._element.iter(A + "tcPr"):
    names = [etree.QName(e).localname for e in tc]
    if names != sorted(names, key=lambda n: ORDER.index(n) if n in ORDER else 99):
        bad_tc += 1
check(bad_tc == 0, f"⑥ 표 칸 tcPr 이 스키마 순서(테두리 → 채움) — 순서 틀린 칸 {bad_tc}개")
sids = [e.text for e in sl._element.iter(A + "tableStyleId")]
check(sids and all(x != "{5940675A-B579-460E-94D1-54222C63F5DA}" for x in sids), f"⑥ Table Grid(검은 격자) 스타일이 남지 않는다 ({sids})")
mixed = by["memo_mixed"].text_frame.text
check("보강 필요" not in mixed and "현행 앱 이용 규모" in mixed, f"⑦ 다른 글과 섞인 '※ 보강 필요' 줄만 지운다 ({mixed!r})")
check("확인 필요" in by["memo_only"].text_frame.text, "⑦ 도형 전체가 메모면 지우지 않는다(빈 카드 방지)")

shutil.rmtree(TMP, ignore_errors=True)
print("\n전부 통과" if not FAILS else "\n실패 " + str(len(FAILS)) + "건")
sys.exit(1 if FAILS else 0)

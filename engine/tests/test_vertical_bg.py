# -*- coding: utf-8 -*-
"""세로 제안서 목차·간지 배경 시험(R107) — 배경 그림이 글(목차 줄·간지 절 목록)을 덮지 않는가.
  10-28 사용자: 간지 절 목록 4~6번이 유리 카드 그림 위에 겹치고, 목차 쪽도 배경 그림과 겹쳤다.
  ① 목차: 쪽마다 쪽 배경이 있고, 그 쪽 글 높이(첫 줄 ~ 마지막 줄)의 배경이 흰색이다(마스터의 쪽 전체 그림은 뗀다)
  ② 간지: 테마 5가지(밴드·탭·사이드·필·라인) 모두 절 목록 높이의 배경이 흰색이다 — 절 6개(목록이 16cm 넘게 내려옴)
  ③ 간지 그림은 목록 아래에 남아 있다(배경을 통째로 지우는 것으로 통과하지 않게)

  python -X utf8 engine/tests/test_vertical_bg.py           (전부 통과면 0)
  PD_ENGINE_DIR=<고치기 전 engine 사본> python …            음성 대조 — 고치기 전 코드는 ①② 가 실패해야 한다
실제 조립(Build)을 가짜 목차·본문·배경 그림으로 돌린다. AI·서버·PowerPoint 없음."""
import glob, io, os, shutil, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.abspath(os.environ.get("PD_ENGINE_DIR") or os.path.dirname(HERE))
TMP = tempfile.mkdtemp(prefix="vbg-")
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
sys.path.insert(0, ENG)

from PIL import Image, ImageDraw  # noqa: E402
from pptx import Presentation  # noqa: E402
from pptx.util import Emu  # noqa: E402
import vertical as V  # noqa: E402

NSR = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
NSP = "{http://schemas.openxmlformats.org/presentationml/2006/main}"
NSA = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
FAILS = []


def check(ok, msg):
    print(("통과 " if ok else "실패 ") + msg)
    if not ok:
        FAILS.append(msg)


def scene():
    """밝은 하늘색 바탕 + 위에서 아래까지 진한 파랑 기둥 — 위쪽이 비지 않은 그림(가장 나쁜 경우)"""
    im = Image.new("RGB", (900, 1300), (225, 236, 252))
    d = ImageDraw.Draw(im)
    for k in range(8):
        d.rectangle((60 + k * 100, 120 + k * 30, 160 + k * 100, 1280), fill=(40, 90, 200))
    b = io.BytesIO()
    im.save(b, "JPEG")
    return b.getvalue()


def outline():
    secs = lambda n, m: [{"title": f"절 {k + 1} 이름", "items": [{"title": f"항목 {k + 1}.{j + 1}", "pages": 1} for j in range(m)]} for k in range(n)]
    return {"project": {"name": "시험 사업", "client": "시험 기관", "year": "2026", "doc": "기술제안서"},
            "chapters": [{"no": "Ⅰ", "title": "짧은 장", "sections": secs(2, 1)},
                         {"no": "Ⅱ", "title": "긴 장", "sections": secs(6, 3)},   # 간지 목록 6줄 · 목차 한 쪽 가득(20줄 넘음)
                         {"no": "※", "title": "별첨", "sections": []}]}


def pages_of(o):
    cp = {}
    for i, c in enumerate(o["chapters"][:2]):
        cp[i] = [{"title": f"{si}.{ii} {it['title']}", "lead": ["도입 글."], "band": "띠 글",
                  "blocks": [{"kind": "text", "head": "소제목", "bullets": ["글 한 줄"]}]}
                 for si, s in enumerate(c["sections"], 1) for ii, it in enumerate(s["items"], 1)]
    return cp


def slide_bg(slide):
    bg = slide._element.find(f"{NSP}cSld/{NSP}bg")
    blip = bg.find(f".//{NSA}blip") if bg is not None else None
    return slide.part.related_part(blip.get(f"{NSR}embed")).blob if blip is not None else None


def master_pic(master):
    for sh in master.shapes:
        if sh.shape_type == 13 and sh.width > Emu(int(15 / 2.54 * 914400)):
            rid = sh._element.find(f".//{NSA}blip").get(f"{NSR}embed")
            return sh.part.related_part(rid).blob
    return None


def darkest(blob, x0_cm, x1_cm, y0_cm, y1_cm):
    im = Image.open(io.BytesIO(blob)).convert("L")
    w, h = im.size
    box = (int(w * x0_cm / V.PAGE_W), int(h * y0_cm / V.PAGE_H), int(w * x1_cm / V.PAGE_W), int(h * y1_cm / V.PAGE_H))
    return min(im.crop(box).getextrema()[0], 255)


def text_span(slide, top_min=4.0, top_max=25.0):
    """글 상자들의 세로 범위(cm) — 쪽 번호(아래)·머리(위)는 뺀다"""
    tops, bots, lefts, rights = [], [], [], []
    for sh in slide.shapes:
        if sh.has_text_frame and sh.text_frame.text.strip() and top_min < Emu(sh.top).cm < top_max:
            tops.append(Emu(sh.top).cm)
            bots.append(Emu(sh.top + sh.height).cm)
            lefts.append(Emu(sh.left).cm)
            rights.append(Emu(sh.left + sh.width).cm)
    return (min(tops), max(bots), min(lefts), max(rights)) if tops else None


def run_style(style):
    o = outline()
    out = os.path.join(TMP, f"v_{style}.pptx")
    bgs = {"cover": scene(), "toc": scene(), "div0": scene(), "div1": scene()}
    V.Build(o, bgs, None, style, "navy").build(pages_of(o), out)
    prs = Presentation(out)
    m_toc, m_div = V.master_of(prs, "vertical-toc"), V.master_of(prs, "vertical-divider")
    tocs = [s for s in prs.slides if s.slide_layout.slide_master == m_toc]
    divs = [s for s in prs.slides if s.slide_layout.slide_master == m_div]
    # ① 목차 — 쪽 배경(없으면 마스터 그림이 실제 배경)의 글 높이가 흰색
    for k, s in enumerate(tocs):
        bg = slide_bg(s) or master_pic(m_toc)
        sp = text_span(s)
        if bg is None or sp is None:
            check(False, f"{style} 목차 {k + 1}: 배경 또는 글을 찾지 못함")
            continue
        y0, y1, x0, x1 = sp
        d = darkest(bg, max(0.5, x0), min(V.PAGE_W - 0.5, x1), y0, y1)
        check(d >= 240, f"{style} 목차 {k + 1}: 글 높이 {y0:.1f}~{y1:.1f}cm 배경이 흰색(가장 어두운 점 {d}, 240 이상이어야)")
    # ② 간지 — 절 목록 높이가 흰색, ③ 목록 아래 그림은 남는다
    if style == "split":
        return
    for k, s in enumerate(divs[:2]):   # 배경을 준 장(div0·div1)만 — 별첨 간지는 절 목록·배경이 없다
        bg = slide_bg(s)
        box = next((sh for sh in s.shapes if sh.has_text_frame and len(sh.text_frame.paragraphs) >= 2), None)
        if bg is None or box is None:
            check(False, f"{style} 간지 {k + 1}: 배경 또는 절 목록을 찾지 못함")
            continue
        n = len([p for p in box.text_frame.paragraphs if p.text.strip()])
        y0 = Emu(box.top).cm
        y1 = y0 + 0.13 + n * V.__dict__.get("DIV_LIST_PITCH", 1.2)
        d = darkest(bg, 2.0, V.PAGE_W - 2.0, y0, y1)
        check(d >= 240, f"{style} 간지 {k + 1}: 절 {n}개 목록 {y0:.1f}~{y1:.1f}cm 배경이 흰색(가장 어두운 점 {d})")
        below = darkest(bg, 2.0, V.PAGE_W - 2.0, min(V.PAGE_H - 3, y1 + 3.5), V.PAGE_H - 1.8)
        check(below < 230, f"{style} 간지 {k + 1}: 목록 아래에 배경 그림이 남아 있다(가장 어두운 점 {below}, 230 미만 — 배경 투명도 65% 라 옅다, 10-29)")


for st in ("band", "tab", "side", "pill", "line", "split"):
    try:
        run_style(st)
    except Exception as e:   # noqa: BLE001
        check(False, f"{st} 조립 실패: {e}")

shutil.rmtree(TMP, ignore_errors=True)
print("\n전부 통과" if not FAILS else f"\n실패 {len(FAILS)}건")
sys.exit(1 if FAILS else 0)

# 출처: powerPlus/tools/ppt-pipeline/linebreak_mark.py — 리눅스 엔진으로 이식(2026-10-12). PowerPoint 없이 python-pptx 만 쓴다.
"""런 안의 '_x000B_' 표시를 실제 줄바꿈(<a:br/>)으로 바꾼다. 인자: <pptx> [단어 앞 줄바꿈 넣을 '쪽|앞말|뒷말' ...]"""
import copy, sys
from pptx import Presentation
sys.stdout.reconfigure(encoding="utf-8")
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
MARK = "_x000B_"
f = sys.argv[1]
p = Presentation(f)


def walk(shs):
    for s in shs:
        if s.shape_type == 6:
            yield from walk(s.shapes)
        else:
            yield s


def split_run(r_el, before, after):
    """r_el 을 before 텍스트 런 + br + after 텍스트 런으로."""
    t = r_el.find(A + "t")
    t.text = before
    br = r_el.makeelement(A + "br", {})
    rpr = r_el.find(A + "rPr")
    if rpr is not None:
        br.append(copy.deepcopy(rpr))
    r2 = copy.deepcopy(r_el)
    r2.find(A + "t").text = after
    r_el.addnext(br)
    br.addnext(r2)
    return r2


n = 0
for sl in p.slides:
    for s in walk(sl.shapes):
        if not s.has_text_frame:
            continue
        for r_el in list(s._element.iter(A + "r")):
            t = r_el.find(A + "t")
            while t is not None and t.text and MARK in t.text:
                a, b = t.text.split(MARK, 1)
                r_el = split_run(r_el, a, b)
                t = r_el.find(A + "t")
                n += 1
p.save(f)
print("줄바꿈 변환", n)

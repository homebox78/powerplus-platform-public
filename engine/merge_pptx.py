# -*- coding: utf-8 -*-
"""merge.py 의 PowerPoint 없는 판(리눅스 엔진) — python-pptx 로 한 장짜리 pptx 들을 합친다. 인자는 merge.py 와 같다.
  merge_pptx.py <out.pptx> <s01.pptx> <s02.pptx> …            순서대로 한 파일로
  merge_pptx.py replace <base.pptx> <쪽번호>=<sNN.pptx> …      base 의 그 장만 갈아 끼운다
장 안의 도형·배경은 그대로 복사하고, 그림은 새 파일에 다시 넣어 rId 를 바꿔 단다. 레이아웃은 base 의 같은 이름(없으면 첫 레이아웃).
그림 말고 다른 연결(차트·동영상·OLE)이 든 장은 멈추고 알린다 — 지금 장표 제작은 그림만 쓴다.
같은 11장을 PowerPoint 합치기와 비교해 PowerPoint 렌더 픽셀이 같았다(2026-10-05)."""
import copy, io, os, shutil, sys
from pptx import Presentation
from pptx.opc.constants import RELATIONSHIP_TYPE as RT
from pptx.oxml.ns import qn

sys.stdout.reconfigure(encoding="utf-8")
R_ATTRS = (qn("r:embed"), qn("r:link"), qn("r:id"))


def layout_for(dst, name):
    for m in dst.slide_masters:
        for l in m.slide_layouts:
            if l.name == name:
                return l
    return dst.slide_layouts[0]


def append(dst, src_path):
    """src 의 첫 장을 dst 끝에 붙이고 그 장을 돌려준다"""
    s = Presentation(src_path).slides[0]
    new = dst.slides.add_slide(layout_for(dst, s.slide_layout.name))
    for ph in list(new.placeholders):   # 레이아웃이 만든 빈 자리는 지운다
        ph._element.getparent().remove(ph._element)
    rid = {}
    for r_id, rel in s.part.rels.items():
        if rel.reltype == RT.SLIDE_LAYOUT:
            continue
        if rel.is_external:
            rid[r_id] = new.part.relate_to(rel.target_ref, rel.reltype, is_external=True)
        elif rel.reltype == RT.IMAGE:
            _, rid[r_id] = new.part.get_or_add_image_part(io.BytesIO(rel.target_part.blob))
        else:
            sys.exit(f"지원하지 않는 연결: {rel.reltype} ({src_path})")
    sld, nsld = s._element, new._element
    cs_new = nsld.find(qn("p:cSld"))
    cs_src = sld.find(qn("p:cSld"))
    bg = cs_src.find(qn("p:bg"))
    if bg is not None:
        cs_new.insert(0, copy.deepcopy(bg))
    tree = cs_new.find(qn("p:spTree"))
    for el in list(cs_src.find(qn("p:spTree"))):
        if el.tag in (qn("p:nvGrpSpPr"), qn("p:grpSpPr")):
            continue
        tree.append(copy.deepcopy(el))
    for tag in ("p:clrMapOvr", "p:transition", "p:timing"):   # 색 매핑·전환·애니메이션
        x = sld.find(qn(tag))
        if x is not None:
            old = nsld.find(qn(tag))
            if old is not None:
                nsld.remove(old)
            nsld.append(copy.deepcopy(x))
    for node in nsld.iter():
        for a in R_ATTRS:
            v = node.get(a)
            if v in rid:
                node.set(a, rid[v])
    return new


def move(pres, old_idx, new_idx):
    lst = pres.slides._sldIdLst
    el = list(lst)[old_idx]
    lst.remove(el)
    lst.insert(new_idx, el)


def delete(pres, idx):
    lst = pres.slides._sldIdLst
    el = list(lst)[idx]
    pres.part.drop_rel(el.rId)
    lst.remove(el)


if sys.argv[1] == "replace":
    base = os.path.abspath(sys.argv[2])
    pairs = sorted((int(a.split("=", 1)[0]), os.path.abspath(a.split("=", 1)[1])) for a in sys.argv[3:])
    pres = Presentation(base)
    for n, f in pairs:
        if n < 1 or n > len(pres.slides):
            sys.exit(f"{n}쪽이 없습니다")
        append(pres, f)
        move(pres, len(pres.slides) - 1, n)   # 예전 n 뒤로
        delete(pres, n - 1)
    pres.save(base)
    print(f"갈아 끼운 장 {len(pairs)}")
else:
    out, parts = os.path.abspath(sys.argv[1]), [os.path.abspath(p) for p in sys.argv[2:]]
    if not parts:
        sys.exit("합칠 파일이 없습니다")
    shutil.copy2(parts[0], out)
    pres = Presentation(out)
    while len(pres.slides) > 1:
        delete(pres, len(pres.slides) - 1)
    for p in parts[1:]:
        append(pres, p)
    pres.save(out)
    print(f"장 {len(pres.slides)}개를 한 파일로 합쳤습니다")

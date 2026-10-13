# -*- coding: utf-8 -*-
# 출처: powerPlus/tools/ppt-pipeline/font_inherit.py — 리눅스 엔진으로 이식(2026-10-12). PowerPoint 없이 python-pptx 만 쓴다.
"""3단계 보강 — 런에 서체가 없어 lstStyle/테마 기본값(Pretendard·맑은 고딕 등)을 물려받는 글자를 찾아
   본문 서체로 명시한다. lstStyle 안의 허용 외 서체도 같이 바꾼다. 기획 메모(노란 채움)는 제외."""
import sys, collections
from pptx import Presentation
from lxml import etree
sys.stdout.reconfigure(encoding="utf-8")
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
OK = {"a시월구일2", "a시월구일3", "G마켓 산스 TTF Bold"}
BOLDISH = ("Bold", "SemiBold", "ExtraBold", "Black", "Heavy", "B")
src, dst = sys.argv[1], sys.argv[2]
SKIP = {(int(a), b) for a, b in (x.split("|", 1) for x in sys.argv[3:])}  # 기획 메모 등 "슬라이드|도형이름"
p = Presentation(src); ch = collections.Counter()

def pick(face, bold):
    if face and any(face.endswith(k) or (" " + k) in face for k in BOLDISH):
        return "a시월구일3"
    return "a시월구일3" if bold else "a시월구일2"

def walk(sh):
    for s in sh:
        if s.shape_type == 6: yield from walk(s.shapes)
        else: yield s

for i, sl in enumerate(p.slides, 1):
    for s in walk(sl.shapes):
        el = s._element
        if b"FFFF00" in etree.tostring(el) or b"FFFFCC" in etree.tostring(el) or (i, s.name) in SKIP:
            continue
        tx = el.find(".//" + A.replace("drawingml/2006/main", "presentationml/2006/main") + "txBody")
        # 1) lstStyle 의 허용 외 서체 교체
        lvl_face = {}
        for ls in el.iter(A + "lstStyle"):
            for d in ls.iter(A + "defRPr"):
                lvl = d.getparent().tag.split("}")[1]
                for t in ("latin", "ea", "cs"):
                    f = d.find(A + t)
                    if f is not None and f.get("typeface") not in OK and not f.get("typeface", "").startswith("+"):
                        new = pick(f.get("typeface"), d.get("b") == "1")
                        ch[(f.get("typeface"), new)] += 1; f.set("typeface", new)
                    if f is not None and t == "ea":
                        lvl_face[lvl] = f.get("typeface")
        # 2) 서체가 전혀 없는 런에 명시(lstStyle 도 없어 테마 기본값으로 떨어지는 경우)
        for r in el.iter(A + "r"):
            if not (r.findtext(A + "t") or "").strip():
                continue
            rp = r.find(A + "rPr")
            if rp is None:
                rp = etree.SubElement(r, A + "rPr"); r.remove(rp); r.insert(0, rp)
            if rp.find(A + "latin") is not None or rp.find(A + "ea") is not None:
                continue
            if lvl_face:          # lstStyle 로 이미 허용 서체를 받는다
                continue
            face = pick(None, rp.get("b") == "1")
            for t in ("latin", "ea"):
                f = etree.SubElement(rp, A + t); f.set("typeface", face)
            # 스키마 순서: latin/ea 는 채움 뒤, 뒤에 올 요소 앞으로
            for tag in ("sym", "hlinkClick", "hlinkMouseOver", "rtl", "extLst"):
                x = rp.find(A + tag)
                if x is not None:
                    rp.remove(x); rp.append(x)
            ch[("(기본값)", face)] += 1
p.save(dst)
for k, v in ch.most_common(): print(v, k)

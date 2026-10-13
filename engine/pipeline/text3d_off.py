# -*- coding: utf-8 -*-
# 출처: powerPlus/tools/ppt-pipeline/text3d_off.py — 리눅스 엔진으로 이식(2026-10-12). PowerPoint 없이 python-pptx 만 쓴다.
"""글상자 3D(bodyPr 의 scene3d·sp3d) 제거.
   흰 글자에 미세 입체(bevel)가 걸리면 좁은 자간에서 글자가 번져 흰 얼룩처럼 렌더된다(OO시 s31).
   도형 자체 3D(spPr)·그림은 건드리지 않는다. 인자: <src> <dst>"""
import sys, collections
from pptx import Presentation
sys.stdout.reconfigure(encoding="utf-8")
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
p = Presentation(sys.argv[1])
per = collections.Counter()
for n, sl in enumerate(p.slides, 1):
    for bp in sl._element.iter(A + "bodyPr"):
        for tag in ("scene3d", "sp3d"):
            e = bp.find(A + tag)
            if e is not None:
                bp.remove(e); per[n] += 1
p.save(sys.argv[2])
print("제거", sum(per.values()), dict(sorted(per.items())))

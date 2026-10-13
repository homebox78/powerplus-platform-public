# -*- coding: utf-8 -*-
# 출처: powerPlus/tools/ppt-pipeline/spc_relax.py — 리눅스 엔진으로 이식(2026-10-12). PowerPoint 없이 python-pptx 만 쓴다.
"""과한 음수 자간 풀기 — 자간이 글자 크기의 10%보다 좁으면(글자끼리 겹쳐 보임) 5%로.
   예: 8pt 에 자간 -1.5pt(-19%) → -0.4pt. 넓어진 글이 넘치는지는 이어서 줄바꿈 점검(8-1)으로 확인한다.
   인자: <src> <dst> [dry]"""
import sys, collections
from pptx import Presentation
sys.stdout.reconfigure(encoding="utf-8")
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
src, dst = sys.argv[1], sys.argv[2]
dry = len(sys.argv) > 3 and sys.argv[3] == "dry"
p = Presentation(src)
per = collections.Counter()
for n, sl in enumerate(p.slides, 1):
    for tag in ("rPr", "endParaRPr", "defRPr"):
        for r in sl._element.iter(A + tag):
            spc, sz = r.get("spc"), r.get("sz")
            if spc is None or sz is None:
                continue
            spc, sz = int(spc), int(sz)
            if spc < -0.10 * sz:
                per[n] += 1
                if not dry:
                    r.set("spc", str(round(-0.05 * sz)))
if not dry:
    p.save(dst)
print("자간 완화", sum(per.values()), dict(sorted(per.items())))

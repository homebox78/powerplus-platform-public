# -*- coding: utf-8 -*-
# 출처: powerPlus/tools/ppt-pipeline/keymsg_color.py — 리눅스 엔진으로 이식(2026-10-12). PowerPoint 없이 python-pptx 만 쓴다.
"""키메시지(장표 위쪽 0.8~2.0in, 16pt 이상) 안의 하이라이트 파랑 2070E8 → 지정색. 인자: <src> <dst> [색=FF3370]"""
import os, sys
from pptx import Presentation
from pptx.dml.color import RGBColor
sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from group_title_lib import walk
src, dst = sys.argv[1:3]
NEW = sys.argv[3] if len(sys.argv) > 3 else "FF3370"
I = 914400
prs = Presentation(src)
n = 0
for no, sl in enumerate(prs.slides, 1):
    for s, x, y, w, h, *_ in walk(sl.shapes):
        if not getattr(s, "has_text_frame", False) or not (0.8 < y / I < 2.6):
            continue
        for pg in s.text_frame.paragraphs:
            for r in pg.runs:
                try:
                    col = str(r.font.color.rgb)
                except Exception:
                    continue
                if col == "2070E8" and r.font.size and (r.font.size.pt >= 16 if y / I < 2.0 else r.font.size.pt >= 24) and r.text.strip() not in ("", "!"):
                    r.font.color.rgb = RGBColor.from_string(NEW)
                    n += 1
                    print(no, r.text)
print("바꿈", n)
prs.save(dst)

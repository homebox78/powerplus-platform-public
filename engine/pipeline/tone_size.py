# -*- coding: utf-8 -*-
# 출처: powerPlus/tools/ppt-pipeline/tone_size.py — 리눅스 엔진으로 이식(2026-10-12). PowerPoint 없이 python-pptx 만 쓴다.
"""글자 크기를 표준 스케일로 '내림' 스냅(확대 없음 → 넘침 안 생김). 인자: <src> <dst>"""
import sys, io, collections
from pptx import Presentation
NS="{http://schemas.openxmlformats.org/drawingml/2006/main}"
# 정수 pt 는 그대로 두고, 소수 크기만 내림한다(확대 없음 → 넘침 안 생김)
KEEPHEX={"FFFF00","FFFFCC","FFFF99","FFFF87"}
src,dst=sys.argv[1],sys.argv[2]
p=Presentation(src); ch=collections.Counter(); skipped=0
import math
def down(v):
    if v < 7: return v          # 7pt 미만은 더 줄이지 않는다
    return v if abs(v-round(v))<0.01 else math.floor(v)
def is_memo(sh):
    try:
        if sh.fill.type==1 and str(sh.fill.fore_color.rgb) in KEEPHEX: return True
    except Exception: pass
    return "말풍선" in sh.name and sh.has_text_frame and "디자인" in sh.text_frame.text
def fix(el):
    for pr in el.iter(NS+"rPr"):
        sz=pr.get("sz")
        if not sz: continue
        v=int(sz)/100.0
        n=down(v)
        if abs(n-v)>0.01:
            pr.set("sz", str(int(round(n*100)))); ch[(v,n)]+=1
def walk(shapes):
    global skipped
    for sh in shapes:
        if is_memo(sh): skipped+=1; continue
        if str(sh.shape_type).startswith("GROUP"): walk(sh.shapes); continue
        fix(sh._element)
for s in p.slides: walk(s.shapes)
p.save(dst)
o=io.open("size_log.txt","w",encoding="utf-8")
o.write("제외 %d · 변경 %d런\n"%(skipped,sum(ch.values())))
for (a,b),v in sorted(ch.items()): o.write("%5d  %spt → %spt\n"%(v,a,b))
o.close(); print("moved",sum(ch.values()))

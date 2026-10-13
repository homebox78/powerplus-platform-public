# -*- coding: utf-8 -*-
# 출처: powerPlus/tools/ppt-pipeline/diagram/absbox.py — 리눅스 엔진으로 이식(2026-10-12). PowerPoint 없이 python-pptx 만 쓴다.
"""그룹 변환(off/ext/chOff/chExt)을 풀어 도형의 슬라이드 절대 좌표(in)를 구한다."""
NS="{http://schemas.openxmlformats.org/drawingml/2006/main}"
PNS="{http://schemas.openxmlformats.org/presentationml/2006/main}"
def _xf(el):
    for tag in (NS+"xfrm",):
        x=el.find(".//"+tag)
    return x
def abs_box(sh):
    el=sh._element
    x,y,w,h=sh.left,sh.top,sh.width,sh.height
    n=el.getparent()
    while n is not None:
        if n.tag==PNS+"grpSp":
            gx=n.find(PNS+"grpSpPr/"+NS+"xfrm")
            if gx is not None:
                off=gx.find(NS+"off"); ext=gx.find(NS+"ext"); co=gx.find(NS+"chOff"); ce=gx.find(NS+"chExt")
                if None not in (off,ext,co,ce):
                    ox,oy=int(off.get("x")),int(off.get("y")); ex,ey=int(ext.get("cx")),int(ext.get("cy"))
                    cx,cy=int(co.get("x")),int(co.get("y")); cw,ch=int(ce.get("cx")),int(ce.get("cy"))
                    sx=ex/cw if cw else 1; sy=ey/ch if ch else 1
                    x=ox+(x-cx)*sx; y=oy+(y-cy)*sy; w=w*sx; h=h*sy
        n=n.getparent()
    return (x/914400, y/914400, w/914400, h/914400)

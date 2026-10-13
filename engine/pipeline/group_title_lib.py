# -*- coding: utf-8 -*-
# 출처: powerPlus/tools/ppt-pipeline/group_title_lib.py — 리눅스 엔진으로 이식(2026-10-12). PowerPoint 없이 python-pptx 만 쓴다.
"""group_title·bar_center 공용: 그룹 좌표 풀기·채움색."""
import sys
from pptx import Presentation
from pptx.util import Pt, Emu
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.oxml.ns import qn

def walk(shs, ox=0, oy=0, sx=1.0, sy=1.0, parent=None):
    """(shape, abs_left, abs_top, abs_w, abs_h, parent_coll)"""
    for s in shs:
        if s.shape_type == 6:
            g = s._element
            off = g.grpSpPr.find(qn("a:xfrm"))
            ch_off = off.find(qn("a:chOff")); ch_ext = off.find(qn("a:chExt"))
            o = off.find(qn("a:off")); e = off.find(qn("a:ext"))
            cx, cy = int(ch_off.get("x")), int(ch_off.get("y"))
            cw, chh = int(ch_ext.get("cx")) or 1, int(ch_ext.get("cy")) or 1
            gx = ox + int(o.get("x")) * sx if parent is None else ox + (int(o.get("x"))) * sx
            gl = ox + int(o.get("x")) * sx
            gt = oy + int(o.get("y")) * sy
            nsx = sx * int(e.get("cx")) / cw
            nsy = sy * int(e.get("cy")) / chh
            yield from walk(s.shapes, gl - cx * nsx, gt - cy * nsy, nsx, nsy, s)
        else:
            if s.left is None:
                continue
            yield s, ox + s.left * sx, oy + s.top * sy, s.width * sx, s.height * sy, parent, sx


def fill_rgb(s):
    try:
        if s.fill.type == 1:
            c = s.fill.fore_color
            if c.type == 1:
                return c.rgb
    except Exception:
        pass
    sp = s._element.find(qn("p:spPr"))
    if sp is not None:
        sf = sp.find(qn("a:solidFill"))
        if sf is not None and len(sf) and sf[0].tag == qn("a:srgbClr"):
            from pptx.dml.color import RGBColor
            return RGBColor.from_string(sf[0].get("val"))
    return None


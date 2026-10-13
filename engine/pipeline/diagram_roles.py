# -*- coding: utf-8 -*-
# 출처: powerPlus/tools/ppt-pipeline/diagram_roles.py — 리눅스 엔진으로 이식(2026-10-12). PowerPoint 없이 python-pptx 만 쓴다.
"""도식 역할 색 통일 — 도식을 한 건씩 따로 만들면 같은 역할(핵심 단계·판단·종료·보조)이
   도식마다 다른 색이 된다. 도형을 역할로 판정해 역할→색 표 하나로 칠한다.

   역할 판정(도형 모양 + 현재 채움/선/글자):
     lane    : 폭 4in 이상 머리 띠(진한 채움 또는 옅은 띠+진한 글자) → 3A46A0 · 흰 글자
     key     : 진한 채움(002060·255A7B·658EBB·C0D2E6) 글 있는 상자, 또는 흰 바탕+658EBB 테두리+002060 글자 상자
               → 0456B6 · 선 없음 · 흰 글자
     group   : GROUP_HEAD 문구 상자 → DEEBF7 · 선 없음 · 002060
     end     : '종료'·'완료'로 끝나는 상자, ellipse 종료 → DEEBF7 · 0456B6 테두리 · 002060
     diamond : 마름모 → FFFFFF · 0456B6 테두리, 위에 얹은 글상자 글자 → 002060
     item    : 흰/옅은 상자의 회색·청회 테두리 → C0D2E6
     yes/no  : Y·YES·예 → 0456B6 / N·NO·아니오·기각 → C00000
   제외: 그라데이션·셰브런/홈플레이트(단계 진행색은 의도)·사진·노랑 메모·경고 폭발(C00000 irregularSeal).
   인자: <src> <dst> "슬라이드:그룹이름" ...   (그룹 이름은 python-pptx 가 읽는 이름)"""
import sys, re
from lxml import etree
from pptx import Presentation
sys.stdout.reconfigure(encoding="utf-8")
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
P = "{http://schemas.openxmlformats.org/presentationml/2006/main}"

KEY, KEY_T = "0456B6", "FFFFFF"
LANE, LANE_T = "3A46A0", "FFFFFF"
END_F, END_L, END_T = "DEEBF7", "0456B6", "002060"
GRP_F, GRP_T = "DEEBF7", "002060"
DIA_F, DIA_L, DIA_T = "FFFFFF", "0456B6", "002060"
ITEM_L = "C0D2E6"
YES, NO = "0456B6", "C00000"
DARK = {"002060", "255A7B", "658EBB", "C0D2E6", "3A46A0"}
GRAYLN = {"D3D3D3", "658EBB", "BFBFBF", "A6A6A6"}
GROUP_HEAD = {"연계모듈 구현", "변경요청관리"}
YES_W = {"Y", "YES", "예"}
NO_W = {"N", "NO", "아니오", "기각"}

src, dst = sys.argv[1:3]
targets = [a.split(":", 1) for a in sys.argv[3:]]
p = Presentation(src)
log = {}


def spPr(s):
    return s._element.find(P + "spPr")


def geom(s):
    g = s._element.find(".//" + A + "prstGeom")
    return g.get("prst") if g is not None else ""


def fill(s):
    sp = spPr(s)
    if sp is None:
        return None
    e = sp.find(A + "solidFill")
    if e is None:
        return "grad" if sp.find(A + "gradFill") is not None else None
    c = e.find(A + "srgbClr")
    if c is not None:
        return c.get("val").upper()
    c = e.find(A + "schemeClr")
    return "bg1" if c is not None and c.get("val") in ("bg1", "lt1") else "scheme"


def line(s):
    sp = spPr(s)
    ln = sp.find(A + "ln") if sp is not None else None
    if ln is None or ln.find(A + "noFill") is not None:
        return None
    c = ln.find(A + "solidFill/" + A + "srgbClr")
    return c.get("val").upper() if c is not None else "?"


def solid(parent, val, before=None):
    for t in ("noFill", "solidFill", "gradFill", "pattFill", "blipFill"):
        for e in parent.findall(A + t):
            parent.remove(e)
    sf = etree.SubElement(parent, A + "solidFill")
    etree.SubElement(sf, A + "srgbClr", val=val)
    return sf


def set_fill(s, val):
    sp = spPr(s)
    old = [e for e in sp if e.tag in (A + "noFill", A + "solidFill", A + "gradFill")]
    idx = list(sp).index(old[0]) if old else None
    for e in old:
        sp.remove(e)
    sf = etree.Element(A + "solidFill")
    etree.SubElement(sf, A + "srgbClr", val=val)
    if idx is None:  # xfrm, prstGeom 다음
        g = sp.find(A + "prstGeom") if sp.find(A + "prstGeom") is not None else sp.find(A + "custGeom")
        idx = list(sp).index(g) + 1 if g is not None else len(sp)
    sp.insert(idx, sf)


def set_line(s, val, w=None):
    sp = spPr(s)
    ln = sp.find(A + "ln")
    if ln is None:
        ln = etree.SubElement(sp, A + "ln")
    if w:
        ln.set("w", str(int(w * 12700)))
    for t in ("noFill", "solidFill", "gradFill"):
        for e in ln.findall(A + t):
            ln.remove(e)
    if val is None:
        ln.insert(0, etree.Element(A + "noFill"))
    else:
        sf = etree.Element(A + "solidFill")
        etree.SubElement(sf, A + "srgbClr", val=val)
        ln.insert(0, sf)


def set_text(s, val):
    for r in s._element.iter(A + "r"):
        rp = r.find(A + "rPr")
        if rp is None:
            rp = etree.SubElement(r, A + "rPr")
            r.remove(rp); r.insert(0, rp)
        for e in rp.findall(A + "solidFill"):
            rp.remove(e)
        sf = etree.Element(A + "solidFill")
        etree.SubElement(sf, A + "srgbClr", val=val)
        # rPr 자식 순서: ln, fill, effect..., latin/ea — fill 은 latin 앞
        pos = 0
        for i, e in enumerate(rp):
            if e.tag == A + "ln":
                pos = i + 1
        rp.insert(pos, sf)


def text(s):
    return s.text_frame.text.strip() if s.has_text_frame else ""


def tcolors(s):
    return {c.get("val").upper() for c in s._element.iter(A + "srgbClr")
            if c.getparent().getparent().tag == A + "rPr"}


def note(sno, role):
    log.setdefault(sno, {}).setdefault(role, 0)
    log[sno][role] += 1


def box(s):
    return (s.left, s.top, s.left + s.width, s.top + s.height)


for sno, gname in targets:
    sno = int(sno)
    sl = p.slides[sno - 1]
    grp = [g for g in sl.shapes if g.shape_type == 6 and g.name == gname]
    if not grp:
        print("그룹 없음", sno, gname); continue
    shs = [s for s in grp[0].shapes if s.shape_type != 6]
    diamonds = [s for s in shs if geom(s) == "diamond"]
    lane_boxes = []
    for s in shs:
        g, f, l, t = geom(s), fill(s), line(s), text(s)
        if g in ("chevron", "homePlate", "irregularSeal1") or s.shape_type == 13 or f == "grad":
            continue
        emu = 914400
        # 머리 띠
        if s.width > 4 * emu and s.height < 0.4 * emu and f in DARK | {"F2F7FC"}:
            set_fill(s, LANE); lane_boxes.append(box(s)); note(sno, "lane"); continue
        if g == "diamond":
            set_fill(s, DIA_F); set_line(s, DIA_L); note(sno, "diamond"); continue
        if g == "ellipse" and t == "종료":
            set_fill(s, END_F); set_line(s, END_L); set_text(s, END_T); note(sno, "end"); continue
        if not t:
            if f in ("FFFFFF", "F2F7FC", "bg1") and l in GRAYLN:
                set_line(s, ITEM_L); note(sno, "item_line")
            elif g == "ellipse" and l == "658EBB":
                set_line(s, DIA_L); note(sno, "circle")
            continue
        flat = t.replace("\n", "").replace(" ", "")
        if flat in ("종료", "연계완료"):
            set_fill(s, END_F); set_line(s, END_L); set_text(s, END_T); note(sno, "end"); continue
        if t in GROUP_HEAD:
            set_fill(s, GRP_F); set_line(s, None); set_text(s, GRP_T); note(sno, "group"); continue
        if f in DARK:
            set_fill(s, KEY); set_line(s, None); set_text(s, KEY_T); note(sno, "key"); continue
        if f == "FFFFFF" and l == "658EBB" and "002060" in tcolors(s):
            set_fill(s, KEY); set_line(s, None); set_text(s, KEY_T); note(sno, "key"); continue
        if f in ("FFFFFF", "F2F7FC", "bg1") and l in GRAYLN:
            set_line(s, ITEM_L); note(sno, "item_line")
        if f is None:
            if t in YES_W:
                set_text(s, YES); note(sno, "yes"); continue
            if t in NO_W:
                set_text(s, NO); note(sno, "no"); continue
            b = box(s)
            # 마름모 위에 얹은 글상자
            if any(abs(b[1] - d.top) < 0.02 * emu and b[0] >= d.left - emu * 0.02 and b[2] <= d.left + d.width + emu * 0.02
                   for d in diamonds):
                set_text(s, DIA_T); note(sno, "diamond_text"); continue
            # 머리 띠 위 글자
            if any(b[1] >= lb[1] - emu * 0.02 and b[3] <= lb[3] + emu * 0.02 for lb in lane_boxes):
                set_text(s, LANE_T); note(sno, "lane_text"); continue

p.save(dst)
for k in sorted(log):
    print(f"s{k}", " · ".join(f"{r} {n}" for r, n in log[k].items()))

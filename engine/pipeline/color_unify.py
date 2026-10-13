# -*- coding: utf-8 -*-
# 출처: powerPlus/tools/ppt-pipeline/color_unify.py — 리눅스 엔진으로 이식(2026-10-12). PowerPoint 없이 python-pptx 만 쓴다.
"""도식 색 톤 통일 — 회색·칙칙한 회청색 채우기를 밝기별로 파란 팔레트로 옮긴다.
   대상: 도형 채우기(solidFill)·그라데이션 스톱·표 칸. 선·글자색·그림·기획 메모(노랑)·상단 제목띠는 제외.
   흰 글자가 얹힌 칸은 대비를 위해 중간 파랑 이상으로만 옮긴다.
   인자: <src> <dst> [dry]"""
import sys, colorsys, collections, zipfile, re
from pptx import Presentation
from lxml import etree
sys.stdout.reconfigure(encoding="utf-8")
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
src, dst = sys.argv[1], sys.argv[2]
dry = len(sys.argv) > 3 and sys.argv[3] == "dry"
TOP = 900000                     # 이 위(제목 띠)는 건드리지 않음
PALETTE = {"F2F7FC", "DEEBF7", "C0D2E6", "658EBB", "3A46A0", "FFFFFF", "000000"}
MEMO = {"FFFF00", "FFFFCC", "FFFF99", "FFFF87"}
p = Presentation(src)
th = zipfile.ZipFile(src).read("ppt/theme/theme1.xml").decode()
theme = {}
for k in ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6"]:
    m = re.search(r"<a:%s>.*?(?:val|lastClr)=\"([0-9A-Fa-f]{6})\"" % k, th, re.S)
    theme[k] = m.group(1).upper() if m else "000000"
ALIAS = {"tx1": "dk1", "bg1": "lt1", "tx2": "dk2", "bg2": "lt2"}


def eff(c):
    if c.tag == A + "srgbClr":
        v = c.get("val")
    elif c.tag == A + "schemeClr":
        v = theme.get(ALIAS.get(c.get("val"), c.get("val")))
        if not v:
            return None
    else:
        return None
    r, g, b = [int(v[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    for m in c:
        t = m.tag.split("}")[1]
        val = int(m.get("val", 0)) / 100000
        if t == "lumMod":
            l *= val
        elif t == "lumOff":
            l += val
        elif t in ("shade",):
            l *= val
        elif t in ("tint",):
            l = l + (1 - l) * (1 - val)
    return colorsys.hls_to_rgb(h, max(0, min(1, l)), s)


def grayish(rgb):
    r, g, b = rgb
    ch = max(rgb) - min(rgb)
    if ch < 0.06:
        return True
    # 채도 낮은 회청색(A2AAC2·8497B0·4E5B6F 류)
    return ch < 0.17 and b >= r and b >= g and colorsys.rgb_to_hls(*rgb)[2] < 0.25


def target(rgb, white_text):
    l = colorsys.rgb_to_hls(*rgb)[1]
    if l < 0.2 or l > 0.985:
        return None                  # 검정·흰색은 그대로
    if white_text and l < 0.8:
        return "3A46A0" if l < 0.45 else "658EBB"
    if l >= 0.93:
        return "F2F7FC"
    if l >= 0.8:
        return "DEEBF7"
    if l >= 0.62:
        return "C0D2E6"
    if l >= 0.42:
        return "658EBB"
    return "3A46A0"


def set_color(c, hexv):
    par = c.getparent()
    n = etree.SubElement(par, A + "srgbClr")
    n.set("val", hexv)
    for m in c:                       # 투명도만 유지
        if m.tag == A + "alpha":
            n.append(m)
    par.replace(c, n)
    par.remove(n) if n.getparent() is None else None


def is_white(c):
    if c.tag == A + "prstClr":
        return c.get("val") == "white"
    e = eff(c)
    return bool(e) and min(e) > 0.9


def white_text(el):
    runs = list(el.iter(A + "rPr")) + list(el.iter(A + "endParaRPr")) + list(el.iter(A + "defRPr"))
    for r in runs:
        sf = r.find(A + "solidFill")
        if sf is not None and len(sf) and is_white(sf[0]):
            return True
    # 글자색을 도형 스타일(fontRef lt1)에서 물려받는 경우
    fr = el.find(".//" + A + "fontRef")
    if fr is not None and len(fr) and is_white(fr[0]):
        if not any(r.find(A + "solidFill") is not None for r in el.iter(A + "rPr")):
            return True
    return False


def is_memo(el):
    for sf in el.iter(A + "solidFill"):
        c = sf[0] if len(sf) else None
        if c is not None and c.tag == A + "srgbClr" and c.get("val", "").upper() in MEMO:
            return True
    return False


def walk(ss):
    for s in ss:
        if s.shape_type == 6:
            yield from walk(s.shapes)
        else:
            yield s


log = collections.Counter()
per = collections.defaultdict(int)
for n, sl in enumerate(p.slides, 1):
    for s in walk(sl.shapes):
        if s.shape_type == 13 or s.top is None or s.top < TOP:
            continue
        el = s._element
        if is_memo(el):
            continue
        fills = []
        # 도형 자체 채우기 · 그라데이션
        for spPr in [e for e in el if e.tag.endswith("}spPr")]:
            sf = spPr.find(A + "solidFill")
            if sf is not None and len(sf):
                fills.append((sf[0], white_text(el)))
            gf = spPr.find(A + "gradFill")
            if gf is not None:
                for gs in gf.iter(A + "gs"):
                    if len(gs):
                        fills.append((gs[0], white_text(el)))
        # 표 칸
        for tc in el.iter(A + "tc"):
            tcPr = tc.find(A + "tcPr")
            if tcPr is None:
                continue
            sf = tcPr.find(A + "solidFill")
            if sf is not None and len(sf):
                fills.append((sf[0], white_text(tc)))
        for c, wt in fills:
            rgb = eff(c)
            if rgb is None or not grayish(rgb):
                continue
            t = target(rgb, wt)
            if not t:
                continue
            old = "%02X%02X%02X" % tuple(round(x * 255) for x in rgb)
            if old == t or old in PALETTE:
                continue
            log[(old, t)] += 1
            per[n] += 1
            if not dry:
                set_color(c, t)
if not dry:
    p.save(dst)
print("바꾼 칸", sum(log.values()), dict(sorted(per.items())))
for (o, t), k in log.most_common():
    print("  ", o, "→", t, k)

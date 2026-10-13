# -*- coding: utf-8 -*-
# 출처: powerPlus/tools/ppt-pipeline/group_title.py — 리눅스 엔진으로 이식(2026-10-12). PowerPoint 없이 python-pptx 만 쓴다.
"""그룹핑 타이틀 띠(카드·묶음 머리의 색 띠) 글자를 원본처럼 크게·가운데로.

대상: 채운 도형, 높이 0.22~0.50in, 폭 1.3in 이상, 진한 색(밝기 < 200).
글: 띠 자신의 글 또는 띠 위에 얹힌 글상자(띠와 세로로 70% 이상 겹침).
처리:
  - 글자 크기를 max(현재, SIZE)로 (띠 높이에 맞게 상한), a시월구일4, 가로 가운데
  - 띠 위 글상자는 띠와 같은 위치·크기로 맞추고 위·아래 여백 0, 세로 가운데
  - 띠 왼쪽 안의 작은 아이콘(그림·도형, 띠 높이 이하)은 지운다(원본엔 아이콘 없음)
인자: <src> <dst> [--dry] [--slides 7,14]
"""
import sys
from pptx import Presentation
from pptx.util import Pt, Emu
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.oxml.ns import qn

sys.stdout.reconfigure(encoding="utf-8")
args = [a for a in sys.argv[1:] if not a.startswith("--")]
src, dst = args[0], args[1]
DRY = "--dry" in sys.argv
ONLY = None
if "--slides" in sys.argv:
    ONLY = [int(x) for x in sys.argv[sys.argv.index("--slides") + 1].split(",")]
IN = 914400
FONT = "a시월구일4"


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


def dark(rgb):
    r, g, b = rgb[0], rgb[1], rgb[2]
    return 0.299 * r + 0.587 * g + 0.114 * b < 175 and b >= r


prs = Presentation(src)
total = 0
for si, sl in enumerate(prs.slides, 1):
    if ONLY and si not in ONLY:
        continue
    items = list(walk(sl.shapes))
    bars = []
    for (s, l, t, w, h, par, sx) in items:
        if s.shape_type not in (1, None) and not getattr(s, "is_placeholder", False):
            pass
        if not (0.22 * IN <= h <= 0.50 * IN and w >= 1.3 * IN):
            continue
        if s.shape_type == 13:
            continue
        rgb = fill_rgb(s)
        if rgb is None or not dark(rgb):
            continue
        bars.append((s, l, t, w, h, par, sx))
    for (b, l, t, w, h, par, sx) in bars:
        # 글 찾기
        txt_shape = None
        if b.has_text_frame and b.text_frame.text.strip():
            txt_shape = (b, l, t, w, h, sx)
        else:
            for (s, l2, t2, w2, h2, par2, sx2) in items:
                if s is b or not getattr(s, "has_text_frame", False) or not s.text_frame.text.strip():
                    continue
                ov = min(t + h, t2 + h2) - max(t, t2)
                if ov < 0.7 * min(h, h2) or h2 > h * 1.6:
                    continue
                if l2 < l - 0.05 * IN or l2 + w2 > l + w + 0.05 * IN:
                    continue
                txt_shape = (s, l2, t2, w2, h2, sx2)
                break
        if txt_shape is None:
            continue
        ts = txt_shape[0]
        text = ts.text_frame.text.replace("\n", "/")
        if len(text) > 40 or len(text.strip()) <= 2:
            continue  # 표 머리 칸 같은 짧은 글(내용 등)은 형제 칸과 크기가 갈라지므로 제외
        # 아이콘
        icons = []
        for (s, l2, t2, w2, h2, par2, sx2) in items:
            if s is b or s is ts:
                continue
            if s.shape_type == 13 or (getattr(s, "has_text_frame", False) and not s.text_frame.text.strip() and s.shape_type != 6):
                if w2 <= h * 1.1 and h2 <= h * 1.1 and l <= l2 and l2 + w2 <= l + w * 0.45 and t - 0.03 * IN <= t2 and t2 + h2 <= t + h + 0.03 * IN:
                    icons.append(s)
        lines = [x for x in ts.text_frame.text.replace("\v", "\n").split("\n") if x.strip()]
        nl = max(1, len(lines))
        hpt, wpt = h / 12700, w / 12700
        size = min(16, max(12.5, round(hpt * 0.52 * 2) / 2))
        if nl > 1:
            size = min(size, hpt * 0.42)
        longest = max(len(x.strip()) for x in lines)
        size = min(size, (wpt - 10) / (longest * 0.95))
        cur = max([r.font.size.pt for p in ts.text_frame.paragraphs for r in p.runs if r.font.size] or [0])
        size = max(size, min(cur, size + 0)) if cur else size
        size = round(size * 2) / 2
        if size < cur:
            size = cur
        total += 1
        print(si, repr(text), "bar h=%.2f w=%.2f" % (h / IN, w / IN), "→ %.1fpt" % size, "아이콘 %d" % len(icons),
              "자기" if ts is b else "상자")
        if DRY:
            continue
        for ic in icons:
            ic._element.getparent().remove(ic._element)
        tf = ts.text_frame
        tf.word_wrap = nl > 1
        tf.vertical_anchor = MSO_ANCHOR.MIDDLE
        tf.margin_top = tf.margin_bottom = 0
        tf.margin_left = tf.margin_right = Emu(int(0.05 * IN))
        bp = tf._txBody.find(qn("a:bodyPr"))
        for a in list(bp):
            if a.tag in (qn("a:spAutoFit"), qn("a:normAutofit")):
                bp.remove(a)
        for p in tf.paragraphs:
            p.alignment = PP_ALIGN.CENTER
            pPr = p._p.get_or_add_pPr()
            pPr.set("indent", "0"); pPr.set("marL", "0")
            for tag in ("a:spcBef", "a:spcAft"):
                e = pPr.find(qn(tag))
                if e is not None:
                    pPr.remove(e)
            for r in p.runs:
                r.font.size = Pt(size)
                rPr = r._r.get_or_add_rPr()
                for tg in ("a:latin", "a:ea"):
                    e = rPr.find(qn(tg))
                    if e is None:
                        e = rPr.makeelement(qn(tg), {})
                        rPr.append(e)
                    e.set("typeface", FONT)
                rPr.set("b", "0")
                rPr.set("spc", "0")
        if ts is not b:
            # 글상자를 띠에 맞춤(글상자 좌표계로 환산)
            k = txt_shape[5]
            dx_abs = l - txt_shape[1]
            dy_abs = t - txt_shape[2]
            ts.left = int(ts.left + dx_abs / k)
            ts.top = int(ts.top + dy_abs / k)
            ts.width = int(w / k)
            ts.height = int(h / k)
print("띠", total)
if not DRY:
    prs.save(dst)

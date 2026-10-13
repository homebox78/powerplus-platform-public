# -*- coding: utf-8 -*-
# 출처: powerPlus/tools/ppt-pipeline/bar_center.py — 리눅스 엔진으로 이식(2026-10-12). PowerPoint 없이 python-pptx 만 쓴다.
"""큰 패널 머리 띠(아이콘 + 왼쪽 정렬 제목)를 24쪽처럼: 아이콘 삭제, 글 가운데, 18pt.

대상: 진한 채움 도형, 높이 0.45~0.80in, 폭 2.5in 이상(패널 머리).
글: 띠 자신의 글 또는 띠와 세로로 70% 이상 겹치고 띠 안에 든 글상자.
아이콘: 띠 왼쪽 40% 안의 그림·빈 도형(띠 높이 이하) → 삭제.
글: 크기 max(현재, 18)(폭 넘으면 줄임), a시월구일4, 가운데, 세로 가운데, 글상자는 띠 크기로.
인자: <src> <dst> [--dry] [--size 18]
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
SIZE = float(sys.argv[sys.argv.index("--size") + 1]) if "--size" in sys.argv else 18.0
IN = 914400
FONT = "a시월구일3"   # 24쪽 기준(사용자 2026-10-01): a시월구일3·18pt·흰색·굵게 없음

sys.path.insert(0, __file__.rsplit("\\", 1)[0] if "\\" in __file__ else ".")
from group_title_lib import walk, fill_rgb  # noqa: E402


def dark(rgb):
    r, g, b = rgb[0], rgb[1], rgb[2]
    return 0.299 * r + 0.587 * g + 0.114 * b < 185 and b >= r


prs = Presentation(src)
total = 0
todo = []
for si, sl in enumerate(prs.slides, 1):
    items = list(walk(sl.shapes))
    for (b, l, t, w, h, par, sx) in items:
        if not ((0.45 * IN <= h <= 0.80 * IN and w >= 2.5 * IN) or (0.38 * IN <= h < 0.45 * IN and w >= 3.5 * IN)) or b.shape_type == 13:
            continue
        rgb = fill_rgb(b)
        if rgb is None or not dark(rgb):
            continue
        ts = None
        if b.has_text_frame and b.text_frame.text.strip():
            ts = (b, l, t, w, h, sx)
        else:
            for (s, l2, t2, w2, h2, p2, sx2) in items:
                if s is b or not getattr(s, "has_text_frame", False) or not s.text_frame.text.strip():
                    continue
                ov = min(t + h, t2 + h2) - max(t, t2)
                if ov < 0.7 * min(h, h2) or h2 > h * 1.4:
                    continue
                if l2 < l - 0.05 * IN or l2 + w2 > l + w + 0.05 * IN:
                    continue
                ts = (s, l2, t2, w2, h2, sx2)
                break
        if ts is None:
            continue
        s0 = ts[0]
        text = s0.text_frame.text.replace("\n", "/")
        if len(text) > 40:
            continue
        icons = []
        for (s, l2, t2, w2, h2, p2, sx2) in items:
            if s is b or s is s0:
                continue
            pic = s.shape_type == 13
            blank = getattr(s, "has_text_frame", False) and not s.text_frame.text.strip() and s.shape_type != 6
            if (pic or blank) and h2 <= h * 1.05 and w2 <= w * 0.3 and l <= l2 and l2 + w2 <= l + w * 0.4 \
                    and t - 0.03 * IN <= t2 and t2 + h2 <= t + h + 0.03 * IN:
                icons.append(s)
        al = [p.alignment for p in s0.text_frame.paragraphs]
        centered = all(a == PP_ALIGN.CENTER for a in al) and s0 is b or (
            all(a == PP_ALIGN.CENTER for a in al) and abs((ts[1] + ts[3] / 2) - (l + w / 2)) < 0.05 * IN)
        cur = max([r.font.size.pt for p in s0.text_frame.paragraphs for r in p.runs if r.font.size] or [0])
        lines = [x for x in s0.text_frame.text.replace("\v", "\n").split("\n") if x.strip()]
        longest = max(len(x.strip()) for x in lines)
        size = SIZE if len(lines) == 1 else 16.0
        def em(x):   # 글자 폭(em): 한글 1, 영숫자 0.58, 공백 0.3
            return sum(1.0 if ord(c) > 0x2E80 else (0.3 if c == " " else 0.58) for c in x.strip())
        size = min(size, (w / 12700 - 20) / max(em(x) for x in lines))
        size = round(size * 2) / 2   # 24쪽 기준 크기로 통일(작으면 키우고 크면 줄임)
        todo.append((si, b, ts, s0, icons, size, cur, text, l, t, w, h))
for si0 in sorted(set(x[0] for x in todo)):
    grp = [x for x in todo if x[0] == si0]
    m = min(x[5] for x in grp if '' not in x[7] and '/' not in x[7]) if any('' not in x[7] and '/' not in x[7] for x in grp) else None   # 같은 장 한 줄 머리 띠는 한 크기
    for i, x in enumerate(grp):
        if m is not None and '' not in x[7] and '/' not in x[7]:
            grp[i] = x[:5] + (m,) + x[6:]
    todo = [x for x in todo if x[0] != si0] + grp
for (si, b, ts, s0, icons, size, cur, text, l, t, w, h) in todo:
        total += 1
        print(si, repr(text), "h=%.2f" % (h / IN), "%.1f→%.1fpt" % (cur, size), "아이콘 %d" % len(icons))
        if DRY:
            continue
        for ic in icons:
            ic._element.getparent().remove(ic._element)
        tf = s0.text_frame
        tf.word_wrap = False
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
        if s0 is not b:
            k = ts[5]
            s0.left = int(s0.left + (l - ts[1]) / k)
            s0.top = int(s0.top + (t - ts[2]) / k)
            s0.width = int(w / k)
            s0.height = int(h / k)
print("띠", total)
if not DRY:
    prs.save(dst)

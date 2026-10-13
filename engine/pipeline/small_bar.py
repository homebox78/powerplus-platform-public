# -*- coding: utf-8 -*-
# 출처: powerPlus/tools/ppt-pipeline/small_bar.py — 리눅스 엔진으로 이식(2026-10-12). PowerPoint 없이 python-pptx 만 쓴다.
"""작은 묶음 머리 띠(높이 0.22~0.45in, 진한 채움) 글자: 15% 줄이고 최대 13pt, a시월구일3, 굵게 해제.
사용자 지시(2026-10-01): "도형내 글자가 여백도 없고 너무 굵게 나온 것 — 15% 줄이고 a시월구일3, 13 이하".
인자: <src> <dst> [--dry]"""
import sys
from pptx import Presentation
from pptx.util import Pt
from pptx.oxml.ns import qn
sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, __file__.rsplit("\\", 1)[0] if "\\" in __file__ else ".")
from group_title_lib import walk, fill_rgb  # noqa: E402
args = [a for a in sys.argv[1:] if not a.startswith("--")]
src, dst = args[0], args[1]
DRY = "--dry" in sys.argv
IN = 914400
prs = Presentation(src)
n = 0
for si, sl in enumerate(prs.slides, 1):
    if si in (31,):   # 31쪽은 원본 강조 크기로 맞춰 둠(restore/s31b)
        continue
    items = list(walk(sl.shapes))
    for (b, l, t, w, h, par, sx) in items:
        if not (0.16 * IN <= h < 0.45 * IN and w >= 0.8 * IN) or (h >= 0.38 * IN and w >= 3.5 * IN) or b.shape_type == 13:
            continue
        rgb = fill_rgb(b)
        if rgb is None or not (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2] < 185 and rgb[2] >= rgb[0]):
            continue
        cands = [(b, l, t, w, h)] if (b.has_text_frame and b.text_frame.text.strip()) else []
        if not cands:
            for (s, l2, t2, w2, h2, p2, sx2) in items:
                if s is b or not getattr(s, "has_text_frame", False) or not s.text_frame.text.strip():
                    continue
                ov = min(t + h, t2 + h2) - max(t, t2)
                if ov >= 0.7 * min(h, h2) and h2 <= h * 1.6 and l2 >= l - 0.05 * IN and l2 + w2 <= l + w + 0.05 * IN:
                    cands = [(s, l2, t2, w2, h2)]
                    break
        if not cands:
            continue
        s = cands[0][0]
        runs = [r for p in s.text_frame.paragraphs for r in p.runs]
        if not runs:
            continue
        cur = max([r.font.size.pt for r in runs if r.font.size] or [0])
        if cur <= 0:
            continue
        hpt = h / 12700
        heavy = any((r._r.find(qn("a:rPr")) is not None and (r._r.find(qn("a:rPr")).find(qn("a:ea")) is not None)
                     and r._r.find(qn("a:rPr")).find(qn("a:ea")).get("typeface") == "a시월구일4") for r in runs)
        if cur <= 13 and not heavy and cur <= hpt * 0.55:
            continue   # 이미 여유 있게 작은 글
        new = min(13.0, round(cur * 0.85 * 2) / 2) if cur > 13 or cur > hpt * 0.55 else cur
        new = min(new, 13.0)
        n += 1
        print(si, repr(s.text_frame.text[:22]), "h=%.2f" % (h / IN), "%.1f→%.1f" % (cur, new), "4" if heavy else "")
        if DRY:
            continue
        for r in runs:
            if r.font.size:
                r.font.size = Pt(min(new, r.font.size.pt))
            rPr = r._r.get_or_add_rPr()
            rPr.set("b", "0")
            for tg in ("a:latin", "a:ea"):
                e = rPr.find(qn(tg))
                if e is not None and e.get("typeface") == "a시월구일4":
                    e.set("typeface", "a시월구일3")
print("작은 머리 띠", n)
if not DRY:
    prs.save(dst)

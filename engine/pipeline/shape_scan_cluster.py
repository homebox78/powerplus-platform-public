# -*- coding: utf-8 -*-
# 출처: powerPlus/tools/ppt-pipeline/shape_scan_cluster.py — 리눅스 엔진으로 이식(2026-10-12). PowerPoint 없이 python-pptx 만 쓴다.
"""배경 도형 없는 픽토그램까지 찾는다 — 가까운 도형끼리 묶어(군집) 아이콘 후보로."""
import json, math, sys
from pptx import Presentation
from pptx.util import Emu
sys.stdout.reconfigure(encoding="utf-8")
pres = Presentation(sys.argv[1])
first = int(sys.argv[2])
GAP = 0.17          # 이 거리 안이면 한 아이콘의 부품으로 본다
out = []

for sno in range(first, len(pres.slides._sldIdLst) + 1):
    sl = pres.slides[sno - 1]
    shapes, texts = [], []

    def walk(lst):
        for sh in lst:
            if sh.shape_type == 6:
                walk(sh.shapes); continue
            try:
                x, y = Emu(sh.left).inches, Emu(sh.top).inches
                w, h = Emu(sh.width).inches, Emu(sh.height).inches
            except Exception:
                continue
            t = sh.text_frame.text.strip() if sh.has_text_frame else ""
            rec = {"sh": sh, "x": x, "y": y, "w": w, "h": h, "t": t,
                   "pic": sh.shape_type == 13}
            (texts if t else shapes).append(rec)
    walk(sl.shapes)

    # 그림(이미 교체분)·큰 도형(카드 배경)·아주 얇은 것(선) 제외
    cand = [s for s in shapes if not s["pic"] and max(s["w"], s["h"]) <= 0.75
            and max(s["w"], s["h"]) > 0.03]

    # 가까운 것끼리 군집
    def near(a, b):
        dx = max(0, max(a["x"], b["x"]) - min(a["x"] + a["w"], b["x"] + b["w"]))
        dy = max(0, max(a["y"], b["y"]) - min(a["y"] + a["h"], b["y"] + b["h"]))
        return math.hypot(dx, dy) <= GAP

    groups, seen = [], set()
    for i, s in enumerate(cand):
        if i in seen:
            continue
        stack, grp = [i], [i]; seen.add(i)
        while stack:
            k = stack.pop()
            for j, o in enumerate(cand):
                if j not in seen and near(cand[k], o):
                    seen.add(j); grp.append(j); stack.append(j)
        groups.append([cand[j] for j in grp])

    for g in groups:
        x0 = min(s["x"] for s in g); y0 = min(s["y"] for s in g)
        x1 = max(s["x"] + s["w"] for s in g); y1 = max(s["y"] + s["h"] for s in g)
        w, h = x1 - x0, y1 - y0
        if not (0.12 <= max(w, h) <= 1.05):        # 아이콘 크기대
            continue
        if not (0.25 <= (w / h if h else 0) <= 4.0):
            continue
        cx, cy = x0 + w / 2, y0 + h / 2
        near_t = sorted(texts, key=lambda t: math.hypot(t["x"] + t["w"] / 2 - cx, t["y"] + t["h"] / 2 - cy))[:2]
        ctx = [(t["t"].splitlines()[0][:26],
                round(math.hypot(t["x"] + t["w"] / 2 - cx, t["y"] + t["h"] / 2 - cy), 2)) for t in near_t]
        out.append({"slide": sno, "parts": len(g), "x": round(x0, 3), "y": round(y0, 3),
                    "w": round(w, 3), "h": round(h, 3), "ctx": ctx})

for i, g in enumerate(out):
    g["no"] = sum(1 for x in out[:i] if x["slide"] == g["slide"]) + 1
json.dump(out, open("groups4.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print("남은 도형 아이콘 후보", len(out), "개 ·", len({g['slide'] for g in out}), "슬라이드")

# -*- coding: utf-8 -*-
# 출처: powerPlus/tools/ppt-pipeline/shape_scan_circle.py — 리눅스 엔진으로 이식(2026-10-12). PowerPoint 없이 python-pptx 만 쓴다.
"""12~끝 슬라이드의 도형 아이콘 그룹을 JSON 으로. 번호 뱃지·기호는 걸러낸다."""
import json, math, re, sys
from pptx import Presentation
from pptx.util import Emu

sys.stdout.reconfigure(encoding="utf-8")
pres = Presentation(sys.argv[1])
first = int(sys.argv[2])
out = []

for sno in range(first, len(pres.slides._sldIdLst) + 1):
    sl = pres.slides[sno - 1]
    shapes = []

    def walk(lst):
        for sh in lst:
            if sh.shape_type == 6:
                walk(sh.shapes); continue
            try:
                x, y = Emu(sh.left).inches, Emu(sh.top).inches
                w, h = Emu(sh.width).inches, Emu(sh.height).inches
            except Exception:
                continue
            txt = sh.text_frame.text.strip() if sh.has_text_frame else ""
            shapes.append({"x": x, "y": y, "w": w, "h": h, "text": txt, "sh": sh})

    walk(sl.shapes)
    anchors = [s for s in shapes if not s["text"] and 0.25 <= max(s["w"], s["h"]) <= 1.1
               and 0.8 <= (s["w"] / s["h"] if s["h"] else 0) <= 1.25]
    anchors.sort(key=lambda s: -(s["w"] * s["h"]))
    used, groups = set(), []
    for a in anchors:
        if id(a["sh"]) in used:
            continue
        ax0, ay0, ax1, ay1 = a["x"], a["y"], a["x"] + a["w"], a["y"] + a["h"]
        parts = []
        for s in shapes:
            if id(s["sh"]) in used or s["text"]:
                continue
            cx, cy = s["x"] + s["w"] / 2, s["y"] + s["h"] / 2
            if ax0 - .02 <= cx <= ax1 + .02 and ay0 - .02 <= cy <= ay1 + .02 \
               and s["w"] <= a["w"] * 1.05 and s["h"] <= a["h"] * 1.05:
                parts.append(s)
        for s in parts:
            used.add(id(s["sh"]))
        if parts:
            groups.append({"a": a, "parts": parts})

    texts = [s for s in shapes if s["text"]]
    for i, g in enumerate(groups, start=1):
        a = g["a"]
        cx, cy = a["x"] + a["w"] / 2, a["y"] + a["h"] / 2
        near = sorted(texts, key=lambda t: math.hypot(t["x"] + t["w"] / 2 - cx, t["y"] + t["h"] / 2 - cy))[:3]
        ctx = [(t["text"].splitlines()[0][:30],
                round(math.hypot(t["x"] + t["w"] / 2 - cx, t["y"] + t["h"] / 2 - cy), 2)) for t in near]
        size = max(a["w"], a["h"])
        # 번호 뱃지·기호 판정: 작고 부품 1개인데 바로 위에 짧은 숫자/기호 텍스트가 겹쳐 있다
        badge = (size < 0.36 and len(g["parts"]) <= 2 and ctx and ctx[0][1] < 0.12
                 and re.fullmatch(r"[0-9+\-·※①-⑳]{1,2}", ctx[0][0].strip() or "x") is not None)
        out.append({"slide": sno, "no": i, "size": round(size, 2), "parts": len(g["parts"]),
                    "ctx": ctx, "badge": badge, "x": round(a["x"],3), "y": round(a["y"],3), "w": round(a["w"],3), "h": round(a["h"],3)})

json.dump(out, open("groups.json", "w", encoding="utf-8"), ensure_ascii=False, indent=0)
real = [g for g in out if not g["badge"]]
print(f"전체 {len(out)} · 뱃지·기호 {len(out)-len(real)} · 교체대상 {len(real)}")

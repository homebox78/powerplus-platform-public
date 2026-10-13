# -*- coding: utf-8 -*-
# 출처: powerPlus/tools/ppt-pipeline/crop_groups.py — 리눅스 엔진으로 이식(2026-10-12). PowerPoint 없이 python-pptx 만 쓴다.
"""아이콘 그룹 자리를 렌더에서 크롭해 라벨 격자 시트로. 숫자 뱃지인지 픽토그램인지 눈으로 가른다."""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont
import os as _os, sys as _sys; _sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))); from kfont import kfont as _kfont
sys.stdout.reconfigure(encoding="utf-8")
G = [g for g in json.load(open("groups.json", encoding="utf-8")) if not g["badge"]]
SC = 1600 / 10.8333333
CELL, COLS, ROWS = 150, 10, 7
os.makedirs("crops", exist_ok=True)
try:
    f = ImageFont.truetype(_kfont(True), 15)
except Exception:
    f = ImageFont.load_default()
cells = []
for g in G:
    im = Image.open(f"base/s{g['slide']:02d}.png").convert("RGB")
    pad = 0.10
    x0 = int((g["x"] - pad) * SC); y0 = int((g["y"] - pad) * SC)
    x1 = int((g["x"] + g["w"] + pad) * SC); y1 = int((g["y"] + g["h"] + pad) * SC)
    c = im.crop((max(0, x0), max(0, y0), x1, y1))
    c.thumbnail((CELL - 26, CELL - 26), Image.LANCZOS)
    cells.append((f"{g['slide']}-{g['no']}", c))
per = COLS * ROWS
for i in range(0, len(cells), per):
    grp = cells[i:i + per]
    rows = (len(grp) + COLS - 1) // COLS
    sh = Image.new("RGB", (CELL * COLS, (CELL + 22) * rows), (245, 246, 250))
    d = ImageDraw.Draw(sh)
    for j, (lab, c) in enumerate(grp):
        x = (j % COLS) * CELL; y = (j // COLS) * (CELL + 22)
        d.rectangle([x + 2, y + 20, x + CELL - 2, y + CELL + 18], fill=(255, 255, 255))
        sh.paste(c, (x + (CELL - c.width) // 2, y + 20 + (CELL - 2 - c.height) // 2))
        d.text((x + 6, y + 2), lab, fill=(200, 20, 20), font=f)
    n = f"crops/c{i//per+1:02d}.png"; sh.save(n)
    print(n, len(grp), grp[0][0], "~", grp[-1][0])

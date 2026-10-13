# -*- coding: utf-8 -*-
# 출처: powerPlus/tools/ppt-pipeline/mark_groups.py — 리눅스 엔진으로 이식(2026-10-12). PowerPoint 없이 python-pptx 만 쓴다.
"""렌더 위에 아이콘 그룹 번호를 찍고 4장씩 시트로 묶는다."""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont
import os as _os, sys as _sys; _sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))); from kfont import kfont as _kfont

sys.stdout.reconfigure(encoding="utf-8")
G = json.load(open("groups.json", encoding="utf-8"))
SC = 1600 / 10.8333333
os.makedirs("marked2", exist_ok=True)
try:
    f = ImageFont.truetype(_kfont(True), 30)
    fs = ImageFont.truetype(_kfont(True), 34)
except Exception:
    f = fs = ImageFont.load_default()

slides = sorted({g["slide"] for g in G} | set(range(12, 56)))
for s in slides:
    p = f"after/s{s:02d}.png"
    if not os.path.exists(p):
        continue
    im = Image.open(p).convert("RGB")
    d = ImageDraw.Draw(im)
    for g in [x for x in G if x["slide"] == s]:
        cx = int((g["x"] + g["w"] / 2) * SC)
        cy = int((g["y"] + g["h"] / 2) * SC)
        col = (150, 150, 150) if g["badge"] else (230, 20, 20)
        d.ellipse([cx - 20, cy - 20, cx + 20, cy + 20], fill=col, outline=(255, 255, 255), width=3)
        t = str(g["no"])
        b = d.textbbox((0, 0), t, font=f)
        d.text((cx - (b[2] - b[0]) / 2, cy - (b[3] - b[1]) / 2 - 4), t, fill=(255, 255, 255), font=f)
    im.save(f"marked2/s{s:02d}.png")

# 4장씩 시트
CW, CH = 800, 554
batch = int(sys.argv[1]) if len(sys.argv) > 1 else 4
files = [f"marked2/s{s:02d}.png" for s in slides if os.path.exists(f"marked/s{s:02d}.png")]
os.makedirs("sheets2", exist_ok=True)
for i in range(0, len(files), batch):
    grp = files[i:i + batch]
    sh = Image.new("RGB", (CW * 2, CH * ((len(grp) + 1) // 2) + 34 * ((len(grp) + 1) // 2)), (250, 250, 252))
    dr = ImageDraw.Draw(sh)
    for j, fp in enumerate(grp):
        im = Image.open(fp).resize((CW, CH), Image.LANCZOS)
        x = (j % 2) * CW
        y = (j // 2) * (CH + 34) + 34
        sh.paste(im, (x, y))
        dr.text((x + 8, y - 30), os.path.basename(fp)[:-4], fill=(200, 20, 20), font=fs)
    n = f"sheets2/sheet{i//batch+1:02d}.png"
    sh.save(n)
    print(n, [os.path.basename(x)[:-4] for x in grp])

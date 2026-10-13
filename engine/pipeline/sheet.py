# -*- coding: utf-8 -*-
# 출처: powerPlus/tools/ppt-pipeline/sheet.py — 리눅스 엔진으로 이식(2026-10-12). PowerPoint 없이 python-pptx 만 쓴다.
import glob, os, sys
from PIL import Image, ImageDraw, ImageFont
import os as _os, sys as _sys; _sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))); from kfont import kfont as _kfont
HERE = os.path.dirname(os.path.abspath(__file__))
files = sorted(glob.glob(os.path.join(HERE, "thumbs", "s*.png")))
lo, hi = int(sys.argv[1]), int(sys.argv[2])
files = [f for f in files if lo <= int(os.path.basename(f)[1:3]) <= hi]
C, CW = 4, 480
CH = int(CW * 1108 / 1600)
R = (len(files) + C - 1) // C
sh = Image.new("RGB", (C * CW, R * (CH + 22)), (225, 229, 236))
dr = ImageDraw.Draw(sh)
try: fb = ImageFont.truetype(_kfont(True), 22)
except Exception: fb = ImageFont.load_default()
for i, f in enumerate(files):
    im = Image.open(f).convert("RGB").resize((CW - 4, CH - 4), Image.LANCZOS)
    x, y = (i % C) * CW, (i // C) * (CH + 22)
    sh.paste(im, (x + 2, y + 2))
    no = os.path.basename(f)[1:3]
    dr.rectangle([x + 4, y + 4, x + 46, y + 32], fill=(214, 40, 40))
    dr.text((x + 12, y + 5), no, fill=(255, 255, 255), font=fb)
p = os.path.join(HERE, f"sheet_{lo}_{hi}.png"); sh.save(p); print(p)

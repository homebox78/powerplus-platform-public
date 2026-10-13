# -*- coding: utf-8 -*-
# 출처: powerPlus/tools/ppt-pipeline/iconsheet.py — 리눅스 엔진으로 이식(2026-10-12). PowerPoint 없이 python-pptx 만 쓴다.
"""추출한 아이콘을 번호·문맥과 함께 시트로."""
import glob, json, os, sys
from PIL import Image, ImageDraw, ImageFont
import os as _os, sys as _sys; _sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))); from kfont import kfont as _kfont
d = os.path.abspath(sys.argv[1])
meta = json.load(open(glob.glob(os.path.join(d, "icons_*.json"))[0], encoding="utf-8"))
items = meta["items"]
CELL = 300
C = min(len(items), 6); R = (len(items) + C - 1) // C
sh = Image.new("RGB", (C * CELL, R * (CELL + 52)), (232, 236, 243))
dr = ImageDraw.Draw(sh)
try:
    fb = ImageFont.truetype(_kfont(True), 20)
    fn = ImageFont.truetype(_kfont(False), 14)
except Exception: fb = fn = ImageFont.load_default()
for i, it in enumerate(items):
    im = Image.open(os.path.join(d, it["file"])).convert("RGBA")
    im.thumbnail((CELL - 40, CELL - 40), Image.LANCZOS)
    bg = Image.new("RGBA", (CELL, CELL), (255, 255, 255, 255))
    d2 = ImageDraw.Draw(bg)
    for yy in range(0, CELL, 20):
        for xx in range(0, CELL, 20):
            if (xx // 20 + yy // 20) % 2: d2.rectangle([xx, yy, xx+19, yy+19], fill=(228, 232, 240, 255))
    bg.paste(im, ((CELL - im.width)//2, (CELL - im.height)//2), im)
    x, y = (i % C) * CELL, (i // C) * (CELL + 52)
    sh.paste(bg, (x, y), bg)
    col = (214, 40, 40) if it["kind"] == "icon" else (110, 116, 130)
    dr.rectangle([x+5, y+5, x+50, y+34], fill=col)
    dr.text((x+16, y+7), str(it["no"]), fill=(255,255,255), font=fb)
    dr.text((x+6, y+CELL+4), f"[{it['kind']}] {it['disp'][0]}x{it['disp'][1]}in", fill=(60,60,60), font=fn)
    dr.text((x+6, y+CELL+24), it["context"][0]["text"].split("\n")[0][:22], fill=(20,20,20), font=fn)
p = os.path.join(d, "sheet.png"); sh.save(p); print(p)

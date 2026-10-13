# -*- coding: utf-8 -*-
# 출처: powerPlus/tools/ppt-pipeline/extract.py — 리눅스 엔진으로 이식(2026-10-12). PowerPoint 없이 python-pptx 만 쓴다.
"""슬라이드에서 아이콘 후보를 뽑고, 좌표로 가까운 글자를 붙여 '문맥'을 만든다.
   출력: icons/<슬라이드>_<번호>.png + icons.json(파트경로·표시크기·근처 텍스트)
사용: python extract.py <pptx> <outdir> [슬라이드번호]
"""
import io, json, math, os, sys
from PIL import Image
from pptx import Presentation
from pptx.util import Emu

src = os.path.abspath(sys.argv[1])
out = os.path.abspath(sys.argv[2])
sno = int(sys.argv[3]) if len(sys.argv) > 3 else 1
os.makedirs(out, exist_ok=True)

pres = Presentation(src)
slide = pres.slides[sno - 1]
SW, SH = Emu(pres.slide_width).inches, Emu(pres.slide_height).inches

pics, texts = [], []


def walk(shapes, ox=0.0, oy=0.0):
    for sh in shapes:
        if sh.shape_type == 6:  # GROUP — 자식 좌표는 그룹 기준이라 python-pptx 가 이미 절대값을 준다
            walk(sh.shapes); continue
        try:
            x, y = Emu(sh.left).inches, Emu(sh.top).inches
            w, h = Emu(sh.width).inches, Emu(sh.height).inches
        except Exception:
            continue
        if sh.shape_type == 13:  # PICTURE
            part = sh.part.related_part(sh._element.blip_rId)
            pics.append({
                "part": str(part.partname).lstrip("/"),
                "blob": part.blob,
                "x": x, "y": y, "w": w, "h": h,
                "cx": x + w / 2, "cy": y + h / 2,
            })
        elif sh.has_text_frame:
            t = sh.text_frame.text.strip()
            if t:
                texts.append({"t": t, "cx": x + w / 2, "cy": y + h / 2, "w": w, "h": h})


walk(slide.shapes)

# 아이콘 후보 = 표시 크기가 작고 정사각형에 가까운 그림
items = []
for i, p in enumerate(pics, start=1):
    ratio = p["w"] / p["h"] if p["h"] else 0
    big = max(p["w"], p["h"])
    kind = "icon" if big <= 0.9 and 0.65 <= ratio <= 1.5 else ("small" if big <= 1.6 else "large")
    # 가까운 글자 3개(거리순)
    near = sorted(texts, key=lambda t: math.hypot(t["cx"] - p["cx"], t["cy"] - p["cy"]))[:3]
    ctx = [{"text": n["t"][:40], "dist": round(math.hypot(n["cx"] - p["cx"], n["cy"] - p["cy"]), 2)} for n in near]
    fn = f"s{sno:02d}_{i:02d}.png"
    try:
        im = Image.open(io.BytesIO(p["blob"]))
        im.save(os.path.join(out, fn))
        nat = im.size
    except Exception:
        nat = None
    items.append({"no": i, "file": fn, "part": p["part"], "kind": kind,
                  "disp": [round(p["w"], 2), round(p["h"], 2)],
                  "pos": [round(p["x"], 2), round(p["y"], 2)], "natural": nat, "context": ctx})

json.dump({"slide": sno, "size": [round(SW, 2), round(SH, 2)], "items": items},
          open(os.path.join(out, f"icons_s{sno:02d}.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
sys.stdout.reconfigure(encoding="utf-8")
print(f"그림 {len(items)}개 (아이콘 후보 {sum(1 for i in items if i['kind']=='icon')}개)")
for it in items:
    c = " / ".join(f"{x['text']}({x['dist']})" for x in it["context"])
    print(f"  {it['no']:2}. [{it['kind']:5}] {it['disp'][0]}x{it['disp'][1]}in  ← {c}")

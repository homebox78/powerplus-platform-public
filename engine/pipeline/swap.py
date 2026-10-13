# -*- coding: utf-8 -*-
# 출처: powerPlus/tools/ppt-pipeline/swap.py — 리눅스 엔진으로 이식(2026-10-12). PowerPoint 없이 python-pptx 만 쓴다.
"""pptx 그림 교체 — 슬라이드에 실제로 배치된 순서로 지목한다(python-pptx 로 shape→파트 매핑).
사용: python swap2.py <src> <dst> "<n>=<이미지>" ["<n>=<이미지>" ...]
      n = list 모드에서 찍힌 번호
      python swap2.py <src> list        ← 배치된 그림 목록만 출력
"""
import io, os, sys, zipfile
from PIL import Image
from pptx import Presentation
from pptx.util import Emu

src = sys.argv[1]


def collect(path):
    """슬라이드에 배치된 그림을 순서대로 [(파트경로, 표시크기in, 원본크기)] 로."""
    pres = Presentation(path)
    out = []

    def walk(shapes):
        for sh in shapes:
            if sh.shape_type == 6:
                walk(sh.shapes); continue
            if sh.shape_type == 13:
                part = sh.image                      # ImagePart
                name = part.filename or ""
                # 패키지 안 실제 파트명
                partname = str(sh._element.blip_rId and
                               sh.part.related_part(sh._element.blip_rId).partname)
                im = Image.open(io.BytesIO(part.blob))
                out.append((partname.lstrip("/"), (Emu(sh.width).inches, Emu(sh.height).inches), im.size, len(part.blob)))
    walk(pres.slides[0].shapes)
    return out


items = collect(src)
if len(sys.argv) == 3 and sys.argv[2] == "list":
    for i, (p, disp, nat, sz) in enumerate(items, start=1):
        ratio = disp[0] / disp[1] if disp[1] else 0
        kind = "아이콘후보" if max(disp) <= 0.9 and 0.7 <= ratio <= 1.4 else ("작은그림" if max(disp) <= 1.6 else "큰그림")
        print(f"{i:2}. {p:24} 표시 {disp[0]:5.2f}x{disp[1]:5.2f}in  원본 {nat[0]}x{nat[1]}  {sz/1024:6.0f}KB  [{kind}]")
    sys.exit()

dst = sys.argv[2]
jobs = {}
for arg in sys.argv[3:]:
    n, img = arg.split("=", 1)
    jobs[items[int(n) - 1][0]] = img

zin = zipfile.ZipFile(src)
repl = {}
for part, img in jobs.items():
    orig = Image.open(io.BytesIO(zin.read(part))).convert("RGBA")
    ow, oh = orig.size
    # 원본이 캔버스에서 실제로 차지하던 영역(투명 여백 제외) — 새 아이콘을 여기에 맞춘다
    obox = orig.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox() or (0, 0, ow, oh)
    tw, th = obox[2] - obox[0], obox[3] - obox[1]
    ocx, ocy = (obox[0] + obox[2]) / 2, (obox[1] + obox[3]) / 2

    new = Image.open(img).convert("RGBA")
    nbox = new.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if nbox:
        new = new.crop(nbox)                      # 새 아이콘의 투명 여백도 걷어낸다
    s = min(tw / new.width, th / new.height)
    new = new.resize((max(1, round(new.width * s)), max(1, round(new.height * s))), Image.LANCZOS)
    canvas = Image.new("RGBA", (ow, oh), (0, 0, 0, 0))
    canvas.paste(new, (round(ocx - new.width / 2), round(ocy - new.height / 2)), new)
    buf = io.BytesIO(); canvas.save(buf, "PNG", optimize=True)
    repl[part] = buf.getvalue()
    print(f"교체: {part} 캔버스 {ow}x{oh} · 원본 잉크 {tw}x{th} → 새 아이콘 {new.size} ({os.path.basename(img)})")

with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for n in zin.namelist():
        z.writestr(n, repl.get(n, zin.read(n)))
zin.close()
print(f"저장: {dst}")

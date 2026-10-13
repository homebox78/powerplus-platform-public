# -*- coding: utf-8 -*-
# 출처: powerPlus/tools/ppt-pipeline/optimize.py — 리눅스 엔진으로 이식(2026-10-12). PowerPoint 없이 python-pptx 만 쓴다.
"""pptx 내부 이미지 다운스케일 + 불투명 PNG→JPEG (렌더 픽셀 손실 최소, 용량 대폭 절감)."""
import io, os, re, shutil, sys, zipfile
import numpy as np
from PIL import Image

quantized = [0]

SRC = sys.argv[1]
DST = sys.argv[2]
MAXDIM = int(sys.argv[3]) if len(sys.argv) > 3 else 1600

zin = zipfile.ZipFile(SRC)
names = zin.namelist()
media = [n for n in names if n.startswith("ppt/media/")]
conv = {}          # 원래이름 -> 새이름(확장자 바뀐 경우)
newdata = {}
saved = 0

for n in media:
    raw = zin.read(n)
    ext = os.path.splitext(n)[1].lower()
    if ext not in (".png", ".jpg", ".jpeg"):
        continue
    try:
        im = Image.open(io.BytesIO(raw))
        im.load()
    except Exception:
        continue
    w, h = im.size
    # 알파 실측(가짜 알파면 JPEG 가능)
    has_alpha = False
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        a = im.convert("RGBA").getchannel("A")
        lo, hi = a.getextrema()
        has_alpha = lo < 250
    if max(w, h) > MAXDIM:
        im.thumbnail((MAXDIM, MAXDIM), Image.LANCZOS)
    buf = io.BytesIO()
    if has_alpha:
        rgba = im.convert("RGBA")
        rgba.save(buf, "PNG", optimize=True)
        # 팔레트 양자화가 색을 거의 안 바꾸면(색차<=6) 그 결과를 쓴다 — 알파 유지
        try:
            q = rgba.quantize(colors=256, method=Image.FASTOCTREE, dither=Image.Dither.NONE)
            qbuf = io.BytesIO()
            q.save(qbuf, "PNG", optimize=True)
            a = np.asarray(rgba, dtype=np.int16)
            b = np.asarray(q.convert("RGBA"), dtype=np.int16)
            diff = float(np.abs(a[..., :3] - b[..., :3]).mean())
            if diff <= 6.0 and qbuf.tell() < buf.tell():
                buf = qbuf
                quantized[0] += 1
        except Exception:
            pass
        newname = n
    else:
        im.convert("RGB").save(buf, "JPEG", quality=82, optimize=True, progressive=True)
        newname = os.path.splitext(n)[0] + ".jpg"
    out = buf.getvalue()
    if len(out) >= len(raw) and newname == n:
        continue                      # 더 커지면 원본 유지
    saved += len(raw) - len(out)
    newdata[n] = out
    if newname != n:
        conv[os.path.basename(n)] = os.path.basename(newname)

def fix_xml(data: bytes) -> bytes:
    s = data.decode("utf-8", "ignore")
    for old, new in conv.items():
        s = s.replace(old, new)
    return s.encode("utf-8")

zout = zipfile.ZipFile(DST, "w", zipfile.ZIP_DEFLATED, compresslevel=9)
for n in names:
    data = newdata.get(n, zin.read(n))
    if n in newdata and os.path.basename(n) in conv:
        n = os.path.join(os.path.dirname(n), conv[os.path.basename(n)]).replace("\\", "/")
    if n.endswith((".xml", ".rels")):
        data = fix_xml(data)
    zout.writestr(n, data)
zout.close()
zin.close()
print(f"양자화 채택 {quantized[0]}개")
print(f"{os.path.getsize(SRC)/1e6:.1f}MB -> {os.path.getsize(DST)/1e6:.1f}MB (이미지 {len(newdata)}개 최적화, 확장자 변경 {len(conv)})")

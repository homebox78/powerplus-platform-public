# -*- coding: utf-8 -*-
# 출처: powerPlus/tools/ppt-pipeline/stage.py — 리눅스 엔진으로 이식(2026-10-12). PowerPoint 없이 python-pptx 만 쓴다.
"""_stage/ppt (files/ thumbs/ manifest.json) 구성. 전체본 1 + 낱장 48."""
import json, os, shutil, unicodedata
from PIL import Image
import meta

HERE = os.path.dirname(os.path.abspath(__file__))
STAGE = os.path.join(HERE, "_stage", "ppt")
shutil.rmtree(os.path.join(HERE, "_stage"), ignore_errors=True)
os.makedirs(os.path.join(STAGE, "files"))
os.makedirs(os.path.join(STAGE, "thumbs"))

PREFIX = "kadt26"
nfc = lambda w: unicodedata.normalize("NFC", w.strip())


def merge(base, common):
    out, seen = [], set()
    for w in list(base) + list(common):
        w = nfc(w)
        k = w.lower()
        if w and k not in seen:
            seen.add(k); out.append(w)
    return out


def put_thumb(src, dst, maxw=900):
    im = Image.open(src).convert("RGB")
    if im.width > maxw:
        im = im.resize((maxw, round(im.height * maxw / im.width)), Image.LANCZOS)
    im.save(dst, "PNG", optimize=True)


items = []
# ── 전체 패키지
shutil.copy2(os.path.join(HERE, "full.pptx"), os.path.join(STAGE, "files", f"{PREFIX}_full.pptx"))
put_thumb(os.path.join(HERE, "thumbs", "s01.png"), os.path.join(STAGE, "thumbs", f"{PREFIX}_full.png"))
items.append({
    "slide": f"files/{PREFIX}_full.pptx",
    "thumb": f"thumbs/{PREFIX}_full.png",
    "slide_kind": "package",
    "name": meta.PKG["name"],
    "tags_ko": merge(meta.PKG["ko"], meta.COMMON_KO),
    "tags_en": merge(meta.PKG["en"], meta.COMMON_EN),
})

# ── 낱장
short = []
for no, page, name, ko, en in meta.SLIDES:
    slug = f"{PREFIX}_s{no:02d}"
    shutil.copy2(os.path.join(HERE, "parts", f"s{no:02d}.pptx"), os.path.join(STAGE, "files", f"{slug}.pptx"))
    put_thumb(os.path.join(HERE, "thumbs", f"s{no:02d}.png"), os.path.join(STAGE, "thumbs", f"{slug}.png"))
    k = merge(ko, meta.COMMON_KO)
    e = merge(en, meta.COMMON_EN)
    if len(k) < 15 or len(e) < 10:
        short.append((no, len(k), len(e)))
    items.append({
        "slide": f"files/{slug}.pptx",
        "thumb": f"thumbs/{slug}.png",
        "slide_kind": "single",
        "slide_page": page,
        "name": f"{name} (기후위기 적응정보 통합플랫폼 2026)",
        "tags_ko": k,
        "tags_en": e,
    })

json.dump({"category": "ppt", "items": items},
          open(os.path.join(STAGE, "manifest.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)

pages = {}
for it in items:
    pages[it.get("slide_page", "package")] = pages.get(it.get("slide_page", "package"), 0) + 1
size = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(STAGE) for f in fs)
print(f"항목 {len(items)} · 스테이지 {size/1e6:.1f}MB")
print("분류:", pages)
print("키워드 부족:", short or "없음")
print("전체본 태그", len(items[0]["tags_ko"]), "/", len(items[0]["tags_en"]))

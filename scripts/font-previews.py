# -*- coding: utf-8 -*-
"""웹 서체 고르기 견본 그림(apps/web/public/fonts/<title|body>-<id>[.<언어>].png)을 engine/fonts/fonts.json 대로 만든다.
기존 그림(title-gmarket.png 1200×220, body-pretendard.png 1200×330)과 같은 배치·색 — 2026-10-14 서체 목록 교체 때 만듦.
2026-10-18 언어별 서체(R82): 장표 언어마다 그 언어 문장(fonts.json samples)으로 — 그 언어를 지원하는(font_cover.json min% 이상) 서체만 만든다.
  한국어 = 옛 이름 그대로(<kind>-<id>.png, 이미 있으면 다시 쓰지 않는다 — 같은 이름 내용 바꾸기 금지 R17), 다른 언어 = <kind>-<id>.<언어>.png
실행: python scripts/font-previews.py  (서체 파일은 engine/fonts)"""
import json, os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FD = os.path.join(ROOT, "engine", "fonts")
OUT = os.path.join(ROOT, "apps", "web", "public", "fonts")
L = json.load(open(os.path.join(FD, "fonts.json"), encoding="utf-8"))
COVER = json.load(open(os.path.join(FD, "font_cover.json"), encoding="utf-8"))
TRACK = -0.015   # engine/fontset.py TITLE_TRACK
NAVY, PINK, GRAY, BLUE, INK = (11, 46, 107), (255, 42, 109), (107, 114, 128), (30, 64, 175), (31, 41, 55)
SUB = {"ko": "Pretendard-SemiBold.ttf", "ja": "NotoSansJP-SemiBold.ttf", "zh": "NotoSansSC-SemiBold.ttf"}   # 제목 견본 아래 줄(본문 서체 자리) — 그 언어 글자가 있는 서체


def ok(kind, x, lang):
    return COVER[kind][x["id"]][lang] >= COVER["min"] and lang not in (x.get("avoid") or {})


def name(kind, fid, lang):
    return os.path.join(OUT, f"{kind}-{fid}{'' if lang == 'ko' else '.' + lang}.png")


def title(t, lang):
    sm = L["samples"][lang]
    im = Image.new("RGB", (1200, 220), "white")
    d = ImageDraw.Draw(im)
    parts = list(zip(sm["title"], (NAVY, PINK, NAVY)))
    size = round(60 * float(t.get("scale") or 1.0))   # 서체마다 덩어리감 보정(fonts.json title.scale) — 같은 크기로 보이게
    while True:
        f = ImageFont.truetype(os.path.join(FD, t["file"]), size)
        tr = TRACK * size   # 제목 자간(엔진 fontset.TITLE_TRACK 과 같게) — 글자마다 간격을 줄여 찍는다
        w = sum(f.getlength(p) for p, _ in parts) + tr * (sum(len(p) for p, _ in parts) - 1)
        if w <= 1120 or size <= 30:   # 긴 언어(프랑스어 등)는 한 줄에 들어가게 줄인다
            break
        size -= 2
    x = (1200 - w) / 2
    for p, c in parts:
        for ch in p:
            d.text((x, 124), ch, font=f, fill=c, anchor="ls")
            x += f.getlength(ch) + tr
    d.text((42, 196), sm["sub"], font=ImageFont.truetype(os.path.join(FD, SUB.get(lang, SUB["ko"])), 30), fill=GRAY, anchor="ls")
    im.save(name("title", t["id"], lang))


def body(b, lang):
    sm = L["samples"][lang]
    im = Image.new("RGB", (1200, 330), "white")
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((31, 25, 1169, 305), radius=24, fill=(240, 245, 254), outline=(203, 213, 225), width=2)
    fs = [os.path.join(FD, x) for x in b["files"]]
    rows = list(zip(sm["body"], (fs[3], fs[2], fs[1], fs[0]), (38, 30, 30, 24), (NAVY, BLUE, INK, GRAY), (101, 161, 219, 272)))
    k = float(b.get("scale") or 1.0)   # 본문 서체 크기 보정(fonts.json body.scale)
    for t, f, s, c, y in rows:
        sz = round(s * k)
        ft = ImageFont.truetype(f, sz)
        while ft.getlength(t) > 1060 and sz > 14:   # 긴 문장은 칸 안에 들어가게
            sz -= 1
            ft = ImageFont.truetype(f, sz)
        d.text((71, y), t, font=ft, fill=c, anchor="ls")
    im.save(name("body", b["id"], lang))


n = 0
for lang in L["samples"]:
    for kind, items, fn in (("title", L["title"], title), ("body", L["body"], body)):
        for x in items:
            if not ok(kind, x, lang) or (lang == "ko" and os.path.isfile(name(kind, x["id"], lang))):
                continue
            fn(x, lang)
            n += 1
print("견본", n, "장 →", OUT)
